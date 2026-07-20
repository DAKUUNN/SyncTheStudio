/// Name of the application currently in the foreground, used by the
/// desktop DAW-linked auto time-tracker to detect when Pro Tools/Logic/
/// Ableton/etc. has focus. Returns `None` if it can't be determined
/// (e.g. no Accessibility/Automation permission granted yet on macOS).
/// Desktop-only — there is no such concept on iOS.
#[cfg(desktop)]
#[tauri::command]
fn frontmost_app_name() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get name of first process whose frontmost is true",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
    #[cfg(target_os = "windows")]
    {
        let script = r#"
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class FocusProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
'@
$hwnd = [FocusProbe]::GetForegroundWindow()
$procId = 0
[void][FocusProbe]::GetWindowThreadProcessId($hwnd, [ref]$procId)
(Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
"#;
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // reqwest 0.13 (pulled in by Tauri's own core on iOS, and separately by
    // the updater plugin) needs a rustls crypto provider installed before
    // the first HTTPS client is built, or it panics on an unwind-unsafe
    // thread and hard-crashes the whole app. Desktop targets pick one up
    // transitively; iOS doesn't, so it must be done explicitly here, before
    // anything else runs.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    // The updater plugin (self-download-and-install via GitHub Releases) is
    // desktop-only: Apple's guidelines prohibit apps from installing
    // executable code outside App Store review, and pulling it in on iOS
    // also crashes at startup (its reqwest client needs a rustls crypto
    // provider that isn't installed on this target). iOS gets updates
    // through the App Store/TestFlight instead.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![frontmost_app_name]);

    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(tauri_plugin_apple_signin::init())
        .plugin(tauri_plugin_push_token::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
