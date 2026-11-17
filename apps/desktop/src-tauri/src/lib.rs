//! Desktop backend. Windows are created from the UI via the Tauri window API; this crate
//! boots the app and ties the player window's lifetime to the DM window (LAN server, file
//! access etc. follow in later tasks).

use tauri::{Manager, WindowEvent};

/// Label of the main window defined in `tauri.conf.json`.
const DM_WINDOW: &str = "dm";

/// Starts the desktop app with the DM window defined in `tauri.conf.json`.
pub fn run() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            // The player window has no controls; closing the DM window must not leave it
            // alone on the TV, so the whole app quits.
            if window.label() == DM_WINDOW && matches!(event, WindowEvent::Destroyed) {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri application");
}
