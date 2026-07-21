//! Direct encrypted file/folder transfer between two SyncTheStudio desktop
//! installs on the same local network — for large session files where
//! round-tripping through Firebase Storage is unnecessarily slow.
//!
//! Protocol (plain TCP, desktop-only): the sender listens on a chosen port
//! and shows a one-time PIN; the receiver connects directly by IP:port and
//! proves it knows the PIN via an HMAC challenge/response (the PIN itself
//! is never sent over the wire). Every frame after that — including the
//! file manifest — is AES-256-GCM encrypted with a key derived from the
//! PIN via PBKDF2, so a curious device sniffing the LAN sees only noise.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::{AppHandle, Emitter};

type HmacSha256 = Hmac<Sha256>;

const CHUNK_SIZE: usize = 512 * 1024;
const HANDSHAKE_SALT: &[u8] = b"SyncTheStudioLAN-v1";
const PBKDF2_ROUNDS: u32 = 100_000;
const MAX_FRAME_LEN: usize = 64 * 1024 * 1024;
/// Applied to every stream read/write once connected — without it a peer
/// that stalls mid-transfer (dropped Wi-Fi, frozen app) blocks the receiving
/// thread in a syscall forever; Cancel can't interrupt a blocked read, so
/// the bound here is what actually makes Cancel effective.
const IO_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const ACCEPT_POLL_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Default)]
pub struct LanTransferState {
    pub cancel: Arc<AtomicBool>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ManifestEntry {
    path: String,
    size: u64,
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    entries: Vec<ManifestEntry>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    bytes_done: u64,
    bytes_total: u64,
    current_file: String,
}

/// Rejects a manifest-supplied relative path unless every component is a
/// plain file/dir name — no absolute paths, `..`, drive letters, or root
/// prefixes. The manifest comes from the network peer, so without this a
/// malicious/compromised sender could point `dest_root.join(path)` anywhere
/// on the receiver's filesystem (PathBuf::join discards the base entirely
/// for an absolute `path`, and preserves `..` components otherwise).
fn safe_relative_path(dest_root: &Path, candidate: &str) -> Result<PathBuf, String> {
    const ERR: &str = "Ungültiger Dateipfad im Manifest";
    if candidate.is_empty()
        || candidate.starts_with('/')
        || candidate.contains(':')
        || candidate.contains('\\')
    {
        return Err(ERR.to_string());
    }
    let mut resolved = dest_root.to_path_buf();
    let mut pushed_any = false;
    for part in candidate.split('/') {
        match part {
            "" | "." => continue,
            ".." => return Err(ERR.to_string()),
            _ => {
                resolved.push(part);
                pushed_any = true;
            }
        }
    }
    if !pushed_any {
        return Err(ERR.to_string());
    }
    Ok(resolved)
}

/// Polls `accept()` non-blockingly so a Cancel click while waiting for a
/// peer is honored within ACCEPT_POLL_INTERVAL instead of blocking forever.
fn accept_with_cancel(
    listener: &TcpListener,
    cancel: &Arc<AtomicBool>,
) -> Result<TcpStream, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Abgebrochen".to_string());
        }
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_nonblocking(false).map_err(|e| e.to_string())?;
                return Ok(stream);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(ACCEPT_POLL_INTERVAL);
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn derive_key(pin: &str) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pin.trim().as_bytes(), HANDSHAKE_SALT, PBKDF2_ROUNDS, &mut key);
    key
}

fn read_frame(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > MAX_FRAME_LEN {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "frame too large"));
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf)?;
    Ok(buf)
}

fn write_frame(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    stream.write_all(&(data.len() as u32).to_be_bytes())?;
    stream.write_all(data)?;
    Ok(())
}

fn send_encrypted(
    stream: &mut TcpStream,
    cipher: &Aes256Gcm,
    chunk_index: u64,
    plaintext: &[u8],
) -> std::io::Result<()> {
    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let aad = chunk_index.to_be_bytes();
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), Payload { msg: plaintext, aad: &aad })
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "encrypt failed"))?;
    let mut frame = Vec::with_capacity(12 + ciphertext.len());
    frame.extend_from_slice(&nonce_bytes);
    frame.extend_from_slice(&ciphertext);
    write_frame(stream, &frame)
}

fn recv_encrypted(
    stream: &mut TcpStream,
    cipher: &Aes256Gcm,
    chunk_index: u64,
) -> std::io::Result<Vec<u8>> {
    let frame = read_frame(stream)?;
    if frame.len() < 12 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "frame too short"));
    }
    let (nonce_bytes, ciphertext) = frame.split_at(12);
    let aad = chunk_index.to_be_bytes();
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), Payload { msg: ciphertext, aad: &aad })
        .map_err(|_| {
            // By the time this runs the PIN has already been proven correct
            // via the HMAC handshake — a failure here means a corrupted or
            // desynced frame, not a wrong PIN.
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Übertragung beschädigt oder unterbrochen",
            )
        })
}

/// Best-effort local IPv4 address. `connect` on a UDP socket never sends a
/// packet — it just asks the OS which local interface/address it would use
/// to reach that destination, so this stays purely local.
pub fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

fn collect_entries(root: &Path) -> std::io::Result<Vec<ManifestEntry>> {
    if root.is_file() {
        let size = std::fs::metadata(root)?.len();
        let name = root.file_name().unwrap_or_default().to_string_lossy().to_string();
        return Ok(vec![ManifestEntry { path: name, size }]);
    }

    fn walk(base: &Path, dir: &Path, out: &mut Vec<ManifestEntry>) -> std::io::Result<()> {
        for item in std::fs::read_dir(dir)? {
            let item = item?;
            let path = item.path();
            if path.is_dir() {
                walk(base, &path, out)?;
            } else {
                let size = item.metadata()?.len();
                let rel = path
                    .strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(ManifestEntry { path: rel, size });
            }
        }
        Ok(())
    }

    let mut entries = Vec::new();
    walk(root, root, &mut entries)?;
    Ok(entries)
}

pub fn run_send(
    app: &AppHandle,
    source_path: &str,
    pin: &str,
    port: u16,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let root = PathBuf::from(source_path);
    let single_file = root.is_file();
    let entries = collect_entries(&root).map_err(|e| e.to_string())?;
    let total: u64 = entries.iter().map(|e| e.size).sum();

    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| e.to_string())?;
    let _ = app.emit("lan-transfer://waiting", ());
    let mut stream = accept_with_cancel(&listener, &cancel)?;
    stream.set_nodelay(true).ok();
    stream.set_read_timeout(Some(IO_TIMEOUT)).ok();
    stream.set_write_timeout(Some(IO_TIMEOUT)).ok();

    let key_bytes = derive_key(pin);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut challenge = [0u8; 16];
    rand::rng().fill_bytes(&mut challenge);
    write_frame(&mut stream, &challenge).map_err(|e| e.to_string())?;

    let mut mac = <HmacSha256 as Mac>::new_from_slice(&key_bytes).expect("32-byte hmac key");
    mac.update(&challenge);
    let response = read_frame(&mut stream).map_err(|e| e.to_string())?;
    // verify_slice compares in constant time (via the `subtle` crate under
    // the hood) — a plain `!=` here would leak how many leading bytes of
    // the peer's response match via response timing.
    if mac.verify_slice(&response).is_err() {
        let _ = write_frame(&mut stream, &[0]);
        return Err("Falsche PIN".to_string());
    }
    write_frame(&mut stream, &[1]).map_err(|e| e.to_string())?;
    let _ = app.emit("lan-transfer://connected", ());

    let manifest = Manifest { entries };
    let manifest_json = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
    send_encrypted(&mut stream, &cipher, 0, &manifest_json).map_err(|e| e.to_string())?;

    let mut chunk_index: u64 = 1;
    let mut done: u64 = 0;
    let mut buf = vec![0u8; CHUNK_SIZE];
    for entry in &manifest.entries {
        if cancel.load(Ordering::Relaxed) {
            return Err("Abgebrochen".to_string());
        }
        let file_path = if single_file { root.clone() } else { root.join(&entry.path) };
        let mut file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
        let mut remaining = entry.size;
        while remaining > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Err("Abgebrochen".to_string());
            }
            let to_read = remaining.min(CHUNK_SIZE as u64) as usize;
            file.read_exact(&mut buf[..to_read]).map_err(|e| e.to_string())?;
            send_encrypted(&mut stream, &cipher, chunk_index, &buf[..to_read])
                .map_err(|e| e.to_string())?;
            chunk_index += 1;
            remaining -= to_read as u64;
            done += to_read as u64;
            let _ = app.emit(
                "lan-transfer://progress",
                ProgressPayload { bytes_done: done, bytes_total: total, current_file: entry.path.clone() },
            );
        }
    }
    send_encrypted(&mut stream, &cipher, chunk_index, b"").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_receive(
    app: &AppHandle,
    host: &str,
    port: u16,
    pin: &str,
    save_dir: &str,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| "Ungültige Adresse".to_string())?;
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).map_err(|e| e.to_string())?;
    stream.set_nodelay(true).ok();
    stream.set_read_timeout(Some(IO_TIMEOUT)).ok();
    stream.set_write_timeout(Some(IO_TIMEOUT)).ok();

    let key_bytes = derive_key(pin);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let challenge = read_frame(&mut stream).map_err(|e| e.to_string())?;
    let mut mac = <HmacSha256 as Mac>::new_from_slice(&key_bytes).expect("32-byte hmac key");
    mac.update(&challenge);
    let response = mac.finalize().into_bytes();
    write_frame(&mut stream, &response).map_err(|e| e.to_string())?;

    let ack = read_frame(&mut stream).map_err(|e| e.to_string())?;
    if ack.first() != Some(&1) {
        return Err("Falsche PIN oder Verbindung abgelehnt".to_string());
    }
    let _ = app.emit("lan-transfer://connected", ());

    let manifest_bytes = recv_encrypted(&mut stream, &cipher, 0).map_err(|e| e.to_string())?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes).map_err(|e| e.to_string())?;
    let total: u64 = manifest.entries.iter().map(|e| e.size).sum();

    let dest_root = PathBuf::from(save_dir);
    std::fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;

    let mut chunk_index: u64 = 1;
    let mut done: u64 = 0;
    for entry in &manifest.entries {
        if cancel.load(Ordering::Relaxed) {
            return Err("Abgebrochen".to_string());
        }
        let dest_path = safe_relative_path(&dest_root, &entry.path)?;
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        let mut remaining = entry.size;
        while remaining > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Err("Abgebrochen".to_string());
            }
            let chunk = recv_encrypted(&mut stream, &cipher, chunk_index).map_err(|e| e.to_string())?;
            let chunk_len = chunk.len() as u64;
            if chunk_len > remaining {
                return Err("Ungültige Chunk-Größe (Protokollfehler)".to_string());
            }
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            chunk_index += 1;
            remaining -= chunk_len;
            done += chunk_len;
            let _ = app.emit(
                "lan-transfer://progress",
                ProgressPayload { bytes_done: done, bytes_total: total, current_file: entry.path.clone() },
            );
        }
    }
    let _ = recv_encrypted(&mut stream, &cipher, chunk_index);

    Ok(dest_root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn lan_transfer_local_ip() -> Option<String> {
    local_ip()
}

#[tauri::command]
pub async fn lan_transfer_send(
    app: AppHandle,
    state: tauri::State<'_, LanTransferState>,
    source_path: String,
    pin: String,
    port: u16,
) -> Result<(), String> {
    let cancel = state.cancel.clone();
    cancel.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || run_send(&app, &source_path, &pin, port, cancel))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn lan_transfer_receive(
    app: AppHandle,
    state: tauri::State<'_, LanTransferState>,
    host: String,
    port: u16,
    pin: String,
    save_dir: String,
) -> Result<String, String> {
    let cancel = state.cancel.clone();
    cancel.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || run_receive(&app, &host, port, &pin, &save_dir, cancel))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn lan_transfer_cancel(state: tauri::State<'_, LanTransferState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A malicious/compromised sender controls `entry.path` in the
    /// manifest — safe_relative_path must keep every candidate inside
    /// dest_root no matter what the peer sends.
    #[test]
    fn safe_relative_path_rejects_traversal() {
        let dest_root = PathBuf::from("/tmp/sts-lan-dest");

        assert!(safe_relative_path(&dest_root, "song.wav").is_ok());
        assert!(safe_relative_path(&dest_root, "sub/song.wav").is_ok());

        assert!(safe_relative_path(&dest_root, "../evil.txt").is_err());
        assert!(safe_relative_path(&dest_root, "../../etc/passwd").is_err());
        assert!(safe_relative_path(&dest_root, "sub/../../evil.txt").is_err());
        assert!(safe_relative_path(&dest_root, "/etc/passwd").is_err());
        assert!(safe_relative_path(&dest_root, "C:/Windows/evil.dll").is_err());
        assert!(safe_relative_path(&dest_root, "C:\\Windows\\evil.dll").is_err());
        assert!(safe_relative_path(&dest_root, "").is_err());
        assert!(safe_relative_path(&dest_root, ".").is_err());

        // Every accepted path must actually resolve inside dest_root.
        let resolved = safe_relative_path(&dest_root, "sub/song.wav").unwrap();
        assert!(resolved.starts_with(&dest_root));
    }

    /// Round-trips a small directory over a real TCP loopback connection —
    /// sender and receiver run on separate threads exactly like the two
    /// desktop installs would, just both on 127.0.0.1. Verifies the
    /// handshake, manifest, chunking and decryption all agree end to end.
    #[test]
    fn send_and_receive_round_trip() {
        let tmp = std::env::temp_dir().join(format!("sts-lan-test-{}", std::process::id()));
        let src_dir = tmp.join("src");
        let dst_dir = tmp.join("dst");
        std::fs::create_dir_all(src_dir.join("sub")).unwrap();
        std::fs::File::create(src_dir.join("a.txt"))
            .unwrap()
            .write_all(b"hello world")
            .unwrap();
        std::fs::File::create(src_dir.join("sub/b.bin"))
            .unwrap()
            .write_all(&vec![7u8; CHUNK_SIZE + 1234])
            .unwrap();

        let pin = "TEST42";
        let port = 51922;
        let cancel_send = Arc::new(AtomicBool::new(false));
        let cancel_recv = cancel_send.clone();

        // Exercise the wire protocol directly (no AppHandle needed) by
        // reimplementing the thin bits run_send/run_receive do around it.
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        let src_dir_clone = src_dir.clone();
        let pin_clone = pin.to_string();
        let sender = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let key_bytes = derive_key(&pin_clone);
            let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
            let cipher = Aes256Gcm::new(key);

            let mut challenge = [0u8; 16];
            rand::rng().fill_bytes(&mut challenge);
            write_frame(&mut stream, &challenge).unwrap();
            let mut mac = <HmacSha256 as Mac>::new_from_slice(&key_bytes).unwrap();
            mac.update(&challenge);
            let expected = mac.finalize().into_bytes();
            let response = read_frame(&mut stream).unwrap();
            assert_eq!(response.as_slice(), expected.as_slice());
            write_frame(&mut stream, &[1]).unwrap();

            let entries = collect_entries(&src_dir_clone).unwrap();
            let manifest = Manifest { entries };
            let manifest_json = serde_json::to_vec(&manifest).unwrap();
            send_encrypted(&mut stream, &cipher, 0, &manifest_json).unwrap();

            let mut chunk_index = 1u64;
            let mut buf = vec![0u8; CHUNK_SIZE];
            for entry in &manifest.entries {
                let mut file = std::fs::File::open(src_dir_clone.join(&entry.path)).unwrap();
                let mut remaining = entry.size;
                while remaining > 0 {
                    let to_read = remaining.min(CHUNK_SIZE as u64) as usize;
                    file.read_exact(&mut buf[..to_read]).unwrap();
                    send_encrypted(&mut stream, &cipher, chunk_index, &buf[..to_read]).unwrap();
                    chunk_index += 1;
                    remaining -= to_read as u64;
                }
            }
            send_encrypted(&mut stream, &cipher, chunk_index, b"").unwrap();
        });

        std::thread::sleep(std::time::Duration::from_millis(100));
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let key_bytes = derive_key(pin);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        let challenge = read_frame(&mut stream).unwrap();
        let mut mac = <HmacSha256 as Mac>::new_from_slice(&key_bytes).unwrap();
        mac.update(&challenge);
        let response = mac.finalize().into_bytes();
        write_frame(&mut stream, &response).unwrap();
        let ack = read_frame(&mut stream).unwrap();
        assert_eq!(ack.first(), Some(&1));

        let manifest_bytes = recv_encrypted(&mut stream, &cipher, 0).unwrap();
        let manifest: Manifest = serde_json::from_slice(&manifest_bytes).unwrap();

        std::fs::create_dir_all(&dst_dir).unwrap();
        let mut chunk_index = 1u64;
        for entry in &manifest.entries {
            let dest_path = dst_dir.join(&entry.path);
            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            let mut file = std::fs::File::create(&dest_path).unwrap();
            let mut remaining = entry.size;
            while remaining > 0 {
                let chunk = recv_encrypted(&mut stream, &cipher, chunk_index).unwrap();
                file.write_all(&chunk).unwrap();
                chunk_index += 1;
                remaining -= chunk.len() as u64;
            }
        }

        sender.join().unwrap();
        let _ = cancel_send;
        let _ = cancel_recv;

        assert_eq!(std::fs::read(dst_dir.join("a.txt")).unwrap(), b"hello world");
        assert_eq!(
            std::fs::read(dst_dir.join("sub/b.bin")).unwrap(),
            vec![7u8; CHUNK_SIZE + 1234]
        );

        // Wrong PIN must fail to decrypt rather than silently succeed.
        let key2 = derive_key("WRONGPIN");
        let cipher2 = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key2));
        let mut nonce_bytes = [0u8; 12];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher2
            .encrypt(Nonce::from_slice(&nonce_bytes), Payload { msg: b"secret", aad: &0u64.to_be_bytes() })
            .unwrap();
        let real_key = derive_key(pin);
        let real_cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&real_key));
        let decrypted = real_cipher.decrypt(
            Nonce::from_slice(&nonce_bytes),
            Payload { msg: &ciphertext, aad: &0u64.to_be_bytes() },
        );
        assert!(decrypted.is_err());

        std::fs::remove_dir_all(&tmp).ok();
    }
}
