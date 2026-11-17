//! IPC commands for the library. Only the DM window may call them: the build-time app manifest
//! turns each into a permission that only `capabilities/dm.json` grants, and every command
//! checks the caller's label again. The player window never touches files.

use crate::import::{self, ImportedAsset};
use crate::library::{self, DirEntry, LibraryError, ReadResult};
use crate::settings::{self, DeviceSettings};
use notify::event::ModifyKind;
use notify::{EventKind, RecursiveMode, Watcher};
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
    /// `None` if watching failed (e.g. inotify limits): files stay usable, without live updates.
    _watcher: Option<notify::RecommendedWatcher>,
}

/// Whether a watcher event means content or names changed. Reads and metadata updates (e.g.
/// access times) are dropped: on Linux every read of a file would otherwise trigger a reload,
/// which reads the file again – an endless loop.
fn is_content_change(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Any
            | EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Name(_) | ModifyKind::Any)
    )
}

fn start_watcher(app: &AppHandle, root: &Path) -> notify::Result<notify::RecommendedWatcher> {
    let watched = root.to_path_buf();
    let app = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let event = match event {
            Ok(event) if is_content_change(&event.kind) => event,
            Ok(_) => return,
            Err(error) => {
                eprintln!("Library watcher error: {error}");
                return;
            }
        };
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter_map(|path| library::relative_path(&watched, path))
            .collect();
        if !paths.is_empty() {
            // Only the DM window learns about file changes.
            let _ = app.emit_to(DM_WINDOW, CHANGED_EVENT, paths);
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(watcher)
}

/// The root as shown to the DM. On Windows `canonicalize` yields `\\?\C:\…`; that verbatim
/// form stays in use for file access because it disables device-name and trailing-dot
/// interpretation, and is only stripped for display.
fn display_root(root: &Path) -> String {
    let shown = root.display().to_string();
    match shown.strip_prefix(r"\\?\UNC\") {
        Some(unc) => format!(r"\\{unc}"),
        None => shown
            .strip_prefix(r"\\?\")
            .map_or(shown.clone(), str::to_owned),
    }
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
        let watcher = start_watcher(app, &root)
            .inspect_err(|error| eprintln!("Library opened without live updates: {error}"))
            .ok();
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
        Err(LibraryError::Forbidden)
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
            .and_then(|directory| settings::load(&directory).ok()?.library_root)
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
        Ok(root) => Ok(Some(display_root(&root))),
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
    let dialog = app.dialog().file().set_parent(&window);
    // The dialog blocks until the DM answers; keep that off the async worker threads.
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|error| LibraryError::Io(error.to_string()))?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let picked = picked
        .into_path()
        .map_err(|error| LibraryError::Io(error.to_string()))?;
    let root = app.state::<LibraryState>().open(&app, &picked)?;
    let directory = settings_directory(&app)?;
    let mut device_settings: DeviceSettings = settings::load_or_back_up(&directory);
    device_settings.library_root = Some(root.clone());
    settings::save(&directory, &device_settings)?;
    Ok(Some(display_root(&root)))
}

/// Lets the DM pick a map image in a native dialog and copies it into `library/maps/`. Files
/// outside the library are only ever read when the DM picked them; nothing is written outside.
#[tauri::command]
pub async fn library_import_map(
    app: AppHandle,
    window: WebviewWindow,
    filter_label: String,
) -> Result<Option<ImportedAsset>, LibraryError> {
    require_dm(&window)?;
    let root = app.state::<LibraryState>().root()?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        // Display text only (translated in the webview); capped so it cannot flood the dialog.
        .add_filter(
            filter_label.chars().take(100).collect::<String>(),
            &import::MAP_EXTENSIONS,
        );
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let source = picked
            .into_path()
            .map_err(|error| LibraryError::Io(error.to_string()))?;
        import::import_image(&root, "library/maps", &source).map(Some)
    })
    .await
    .map_err(|error| LibraryError::Io(error.to_string()))?
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

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, DataChange, MetadataKind, RenameMode};

    #[test]
    fn only_content_and_name_changes_count() {
        assert!(is_content_change(&EventKind::Create(CreateKind::File)));
        assert!(is_content_change(&EventKind::Modify(ModifyKind::Data(
            DataChange::Any
        ))));
        assert!(is_content_change(&EventKind::Modify(ModifyKind::Name(
            RenameMode::To
        ))));
        assert!(is_content_change(&EventKind::Remove(
            notify::event::RemoveKind::File
        )));
        assert!(!is_content_change(&EventKind::Access(AccessKind::Read)));
        assert!(!is_content_change(&EventKind::Modify(
            ModifyKind::Metadata(MetadataKind::AccessTime)
        )));
        assert!(!is_content_change(&EventKind::Other));
    }

    #[test]
    fn windows_verbatim_prefixes_are_hidden_from_the_dm() {
        assert_eq!(
            display_root(Path::new(r"\\?\C:\Users\dm\Library")),
            r"C:\Users\dm\Library"
        );
        assert_eq!(display_root(Path::new(r"\\?\UNC\nas\dm")), r"\\nas\dm");
        assert_eq!(
            display_root(Path::new("/Users/dm/Library")),
            "/Users/dm/Library"
        );
    }
}
