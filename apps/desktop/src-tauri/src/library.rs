//! File access to the user's library folder (ARCHITECTURE §6, ADR-0005). Backs the
//! `FileSystem` adapter of `packages/storage`: the webview only ever passes paths *relative* to
//! the library root, and every path is confined to that root before it is touched.

use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Why a library operation failed; serialised to the webview as `{ code, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "message", rename_all = "camelCase")]
pub enum LibraryError {
    /// No library folder has been chosen yet.
    NoLibrary,
    /// The path is not a plain relative path inside the library (e.g. `..`, a symlink).
    InvalidPath(String),
    Io(String),
}

impl From<io::Error> for LibraryError {
    fn from(error: io::Error) -> Self {
        LibraryError::Io(error.to_string())
    }
}

/// Result of reading a file; mirrors `ReadResult` in `packages/storage`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadResult {
    Ok {
        text: String,
    },
    Missing,
    /// On-demand cloud placeholder whose content is not on this device yet.
    NotAvailable,
}

/// A directory entry; mirrors `DirEntry` in `packages/storage`.
#[derive(Debug, PartialEq, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub kind: EntryKind,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    File,
    Directory,
}

/// Maps a `/`-separated relative path to a path under `root`. Rejects anything that could
/// leave the root: empty, `.` or `..` segments, backslashes, drive or stream colons, NUL, and
/// symlinks below the root (the root itself may be a symlink – the DM chose it).
pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, LibraryError> {
    let invalid = || LibraryError::InvalidPath(relative.to_owned());
    let mut path = root.to_path_buf();
    for segment in relative.split('/') {
        if matches!(segment, "" | "." | "..") || segment.contains(['\\', ':', '\0']) {
            return Err(invalid());
        }
        path.push(segment);
        if fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return Err(invalid());
        }
    }
    Ok(path)
}

/// iCloud keeps not-yet-downloaded files as hidden stubs: `name.json` → `.name.json.icloud`.
fn icloud_stub(path: &Path) -> Option<PathBuf> {
    let name = path.file_name()?.to_str()?;
    Some(path.with_file_name(format!(".{name}.icloud")))
}

/// The real name behind an iCloud stub name, if it is one.
pub fn icloud_original(name: &str) -> Option<&str> {
    name.strip_prefix('.')?
        .strip_suffix(".icloud")
        .filter(|original| !original.is_empty())
}

pub fn read(path: &Path) -> Result<ReadResult, LibraryError> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(ReadResult::Ok { text }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let placeholder = icloud_stub(path).is_some_and(|stub| stub.is_file());
            Ok(if placeholder {
                ReadResult::NotAvailable
            } else {
                ReadResult::Missing
            })
        }
        Err(error) => Err(error.into()),
    }
}

/// Writes `<name>.tmp` next to the target, flushes it to disk and renames it over the target,
/// so readers and sync clients never see a half-written file (ARCHITECTURE §6.3).
pub fn write_atomic(path: &Path, text: &str) -> Result<(), LibraryError> {
    let parent = path
        .parent()
        .ok_or_else(|| LibraryError::InvalidPath(String::new()))?;
    fs::create_dir_all(parent)?;
    let mut temp_name = path.file_name().unwrap_or_default().to_owned();
    temp_name.push(".tmp");
    let temp = path.with_file_name(temp_name);
    let result = (|| {
        let mut file = fs::File::create(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        // Best effort: a leftover .tmp file is ignored by the app anyway.
        let _ = fs::remove_file(&temp);
    }
    Ok(result?)
}

/// Lists a directory, or `None` if it does not exist. iCloud stubs are listed under their real
/// name; symlinks and names that are not valid UTF-8 are left out.
pub fn list(path: &Path) -> Result<Option<Vec<DirEntry>>, LibraryError> {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if file_type.is_dir() {
            result.push(DirEntry {
                name,
                kind: EntryKind::Directory,
            });
        } else if file_type.is_file() {
            let name = icloud_original(&name).map_or(name.clone(), str::to_owned);
            result.push(DirEntry {
                name,
                kind: EntryKind::File,
            });
        }
    }
    Ok(Some(result))
}

pub fn make_directory(path: &Path) -> Result<(), LibraryError> {
    Ok(fs::create_dir_all(path)?)
}

/// The library-relative, `/`-separated form of a path reported by the watcher, with iCloud
/// stubs mapped to their real name; `None` for paths outside the root.
pub fn relative_path(root: &Path, path: &Path) -> Option<String> {
    let segments: Option<Vec<&str>> = path
        .strip_prefix(root)
        .ok()?
        .iter()
        .map(|segment| segment.to_str())
        .collect();
    let mut segments = segments?;
    let last = segments.last_mut()?;
    *last = icloud_original(last).unwrap_or(last);
    Some(segments.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty directory per test (no extra crate needed).
    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("dm-library-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn resolve_rejects_paths_that_leave_the_root() {
        let root = temp_root("resolve");
        for path in [
            "",
            "..",
            "../x",
            "a/../../x",
            "a//b",
            "./a",
            "a\\..\\x",
            "C:/x",
            "a/b:c",
        ] {
            assert!(resolve(&root, path).is_err(), "{path} must be rejected");
        }
        assert_eq!(
            resolve(&root, "campaigns/mine/campaign.json").unwrap(),
            root.join("campaigns/mine/campaign.json")
        );
    }

    #[cfg(unix)]
    #[test]
    fn resolve_rejects_symlinks_below_the_root() {
        let root = temp_root("symlink");
        std::os::unix::fs::symlink(std::env::temp_dir(), root.join("escape")).unwrap();
        assert!(resolve(&root, "escape/x.json").is_err());
    }

    #[test]
    fn write_atomic_replaces_the_file_and_leaves_no_temp_file() {
        let root = temp_root("write");
        let path = root.join("campaigns/mine/campaign.json");
        write_atomic(&path, "one").unwrap();
        write_atomic(&path, "two").unwrap();
        assert_eq!(read(&path).unwrap(), ReadResult::Ok { text: "two".into() });
        let names: Vec<_> = list(path.parent().unwrap())
            .unwrap()
            .unwrap()
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert_eq!(names, ["campaign.json"]);
    }

    #[test]
    fn missing_files_and_icloud_placeholders_are_told_apart() {
        let root = temp_root("placeholder");
        fs::write(root.join(".scene-1.json.icloud"), "").unwrap();
        assert_eq!(
            read(&root.join("scene-1.json")).unwrap(),
            ReadResult::NotAvailable
        );
        assert_eq!(
            read(&root.join("scene-2.json")).unwrap(),
            ReadResult::Missing
        );
        assert_eq!(
            list(&root).unwrap().unwrap(),
            [DirEntry {
                name: "scene-1.json".into(),
                kind: EntryKind::File
            }]
        );
        assert_eq!(list(&root.join("nope")).unwrap(), None);
    }

    #[test]
    fn watcher_paths_become_library_relative() {
        let root = Path::new("/lib");
        assert_eq!(
            relative_path(root, Path::new("/lib/campaigns/a/campaign.json")).as_deref(),
            Some("campaigns/a/campaign.json")
        );
        assert_eq!(
            relative_path(root, Path::new("/lib/x/.s.json.icloud")).as_deref(),
            Some("x/s.json")
        );
        assert_eq!(relative_path(root, Path::new("/elsewhere/a.json")), None);
        assert_eq!(relative_path(root, Path::new("/lib")), None);
    }
}
