//! Desktop backend. Windows are created from the UI via the Tauri window API; this crate
//! only boots the app for now (LAN server, file access etc. follow in later tasks).

/// Starts the desktop app with the DM window defined in `tauri.conf.json`.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri application");
}
