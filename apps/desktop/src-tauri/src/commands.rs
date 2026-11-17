//! IPC commands for the library. Only the DM window may call them: the build-time app manifest
//! turns each into a permission that only `capabilities/dm.json` grants, and every command
//! checks the caller's label again. The player window never touches files.

use crate::library::{self, DirEntry, LibraryError, ReadResult};
use crate::settings::{self, DeviceSettings};
use notify::{RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

pub const DM_WINDOW: &str = "dm";
/// Event with the library-relative paths that changed on disk.
pub const CHANGED_EVENT: &str = "library-changed";

/// The open library: its root and the watcher that lives as long as it is open.
#[derive(Default)]
pub struct LibraryState(Mutex<Option<OpenLibrary>>);

struct OpenLibrary {
    root: PathBuf,
    _watcher: notify::RecommendedWatcher,
}

impl LibraryState {
    fn root(&self) -> Result<PathBuf, LibraryError> {
        let guard = self
            .0
            .lock()
            .map_err(|_| LibraryError::Io("library state poisoned".into()))?;
        guard
            .as_ref()
            .map(|open| open.root.clone())
            .ok_or(LibraryError::NoLibrary)
    }

    /// Opens `root` (canonicalised, so watcher paths match) and starts watching it.
    pub fn open(&self, app: &AppHandle, root: &Path) -> Result<PathBuf, LibraryError> {
        let root = root.canonicalize()?;
        if !root.is_dir() {
            return Err(LibraryError::InvalidPath(root.display().to_string()));
        }
        let watched = root.clone();
        let app = app.clone();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                let Ok(event) = event else { return };
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .filter_map(|path| library::relative_path(&watched, path))
                    .collect();
                if !paths.is_empty() {
                    // Only the DM window learns about file changes.
                    let _ = app.emit_to(DM_WINDOW, CHANGED_EVENT, paths);
                }
            })
            .map_err(|error| LibraryError::Io(error.to_string()))?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|error| LibraryError::Io(error.to_string()))?;
        let mut guard = self
            .0
            .lock()
            .map_err(|_| LibraryError::Io("library state poisoned".into()))?;
        *guard = Some(OpenLibrary {
            root: root.clone(),
            _watcher: watcher,
        });
        Ok(root)
    }
}

fn require_dm(window: &WebviewWindow) -> Result<(), LibraryError> {
    if window.label() == DM_WINDOW {
        Ok(())
    } else {
        Err(LibraryError::InvalidPath(String::new()))
    }
}

fn resolve(state: &LibraryState, path: &str) -> Result<PathBuf, LibraryError> {
    library::resolve(&state.root()?, path)
}

fn settings_directory(app: &AppHandle) -> Result<PathBuf, LibraryError> {
    app.path()
        .app_data_dir()
        .map_err(|error| LibraryError::Io(error.to_string()))
}

/// Opens the library stored in the device settings, if it still exists. In debug builds,
/// `DUNGEON_MANAGER_LIBRARY` overrides it without touching the settings (desktop smoke test).
pub fn open_saved_library(app: &AppHandle) {
    let override_root = cfg!(debug_assertions)
        .then(|| std::env::var_os("DUNGEON_MANAGER_LIBRARY"))
        .flatten();
    let saved = || {
        settings_directory(app)
            .ok()
            .and_then(|directory| settings::load(&directory).library_root)
    };
    let Some(root) = override_root.map(PathBuf::from).or_else(saved) else {
        return;
    };
    if let Err(error) = app.state::<LibraryState>().open(app, &root) {
        eprintln!("Library {} could not be opened: {error:?}", root.display());
    }
}

/// The open library's folder, for display.
#[tauri::command]
pub fn library_root(
    window: WebviewWindow,
    state: State<LibraryState>,
) -> Result<Option<String>, LibraryError> {
    require_dm(&window)?;
    match state.root() {
        Ok(root) => Ok(Some(root.display().to_string())),
        Err(LibraryError::NoLibrary) => Ok(None),
        Err(error) => Err(error),
    }
}

/// Lets the DM pick the library folder in a native dialog and remembers it on this device.
/// The webview never names a folder itself, so it cannot widen its own file access.
#[tauri::command]
pub async fn library_choose(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<String>, LibraryError> {
    require_dm(&window)?;
    let Some(picked) = app
        .dialog()
        .file()
        .set_parent(&window)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let picked = picked
        .into_path()
        .map_err(|error| LibraryError::Io(error.to_string()))?;
    let root = app.state::<LibraryState>().open(&app, &picked)?;
    let directory = settings_directory(&app)?;
    let mut device_settings: DeviceSettings = settings::load(&directory);
    device_settings.library_root = Some(root.clone());
    settings::save(&directory, &device_settings)?;
    Ok(Some(root.display().to_string()))
}

#[tauri::command]
pub fn library_read(
    window: WebviewWindow,
    state: State<LibraryState>,
    path: String,
) -> Result<ReadResult, LibraryError> {
    require_dm(&window)?;
    library::read(&resolve(&state, &path)?)
}

#[tauri::command]
pub fn library_write(
    window: WebviewWindow,
    state: State<LibraryState>,
    path: String,
    text: String,
) -> Result<(), LibraryError> {
    require_dm(&window)?;
    library::write_atomic(&resolve(&state, &path)?, &text)
}

#[tauri::command]
pub fn library_list(
    window: WebviewWindow,
    state: State<LibraryState>,
    path: String,
) -> Result<Option<Vec<DirEntry>>, LibraryError> {
    require_dm(&window)?;
    library::list(&resolve(&state, &path)?)
}

#[tauri::command]
pub fn library_make_directory(
    window: WebviewWindow,
    state: State<LibraryState>,
    path: String,
) -> Result<(), LibraryError> {
    require_dm(&window)?;
    library::make_directory(&resolve(&state, &path)?)
}
