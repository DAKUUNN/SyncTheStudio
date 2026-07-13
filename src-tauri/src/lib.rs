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
        .plugin(tauri_plugin_process::init());

    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(tauri_plugin_apple_signin::init())
        .plugin(tauri_plugin_push_token::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
