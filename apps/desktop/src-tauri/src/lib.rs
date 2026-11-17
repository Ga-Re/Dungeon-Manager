//! Desktop backend. Windows are created from the UI via the Tauri window API; this crate
//! boots the app, ties the player window's lifetime to the DM window and gives the DM window
//! access to the library folder (LAN server etc. follow in later tasks).

mod commands;
mod import;
mod library;
mod protocol;
mod settings;

use commands::{ChangeSubscriber, DM_WINDOW, LibraryState};
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WindowEvent};

/// Label of the player window (created from the DM window, `tauri-displays.ts`).
pub(crate) const PLAYER_WINDOW: &str = "player";

/// Starts the desktop app with the DM window defined in `tauri.conf.json`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .manage(LibraryState::default())
        .manage(ChangeSubscriber::default())
        .setup(|app| {
            commands::open_saved_library(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library_root,
            commands::library_subscribe,
            commands::library_choose,
            commands::library_read,
            commands::library_write,
            commands::library_list,
            commands::library_make_directory,
            commands::library_import_map,
            commands::library_move_to_trash,
        ])
        .on_page_load(|webview, payload| {
            // The DM window resends what the TV should show once the player window has (re)loaded;
            // the player window itself has no permission to ask for it. Like every global event,
            // this carries no data: the player window can hear all of them (ARCHITECTURE §8).
            if webview.label() == PLAYER_WINDOW && payload.event() == PageLoadEvent::Finished {
                let _ = webview.app_handle().emit_to(DM_WINDOW, "player-ready", ());
            }
        })
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
