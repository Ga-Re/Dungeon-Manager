//! Device settings (ARCHITECTURE §6.2): stored in the OS app-data directory, never in the
//! synced library, because they describe this computer (e.g. where the library is mounted).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "settings.json";

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub library_root: Option<PathBuf>,
    /// Settings written by newer app versions survive a round trip.
    #[serde(flatten)]
    pub other: serde_json::Map<String, serde_json::Value>,
}

/// Loads the settings: the defaults if there is no file yet, an error if it cannot be read
/// or parsed (so a damaged file is never silently overwritten).
pub fn load(directory: &Path) -> Result<DeviceSettings, String> {
    let path = directory.join(FILE_NAME);
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeviceSettings::default()),
        Err(error) => Err(format!("{}: {error}", path.display())),
    }
}

/// Like `load`, but before starting over with the defaults it keeps a damaged file as
/// `settings.invalid.json`, so nothing the DM configured is lost without a trace.
pub fn load_or_back_up(directory: &Path) -> DeviceSettings {
    load(directory).unwrap_or_else(|error| {
        eprintln!("Starting with default device settings: {error}");
        let _ = std::fs::rename(
            directory.join(FILE_NAME),
            directory.join("settings.invalid.json"),
        );
        DeviceSettings::default()
    })
}

pub fn save(
    directory: &Path,
    settings: &DeviceSettings,
) -> Result<(), crate::library::LibraryError> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|error| crate::library::LibraryError::Io(error.to_string()))?;
    crate::library::write_atomic(&directory.join(FILE_NAME), &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_keeps_unknown_settings() {
        let directory = std::env::temp_dir().join(format!("dm-settings-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        assert_eq!(load(&directory), Ok(DeviceSettings::default()));
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join(FILE_NAME),
            r#"{"libraryRoot":"/lib","future":1}"#,
        )
        .unwrap();
        let settings = load(&directory).unwrap();
        assert_eq!(settings.library_root.as_deref(), Some(Path::new("/lib")));
        save(&directory, &settings).unwrap();
        assert_eq!(load(&directory), Ok(settings));
        std::fs::write(directory.join(FILE_NAME), "not json").unwrap();
        assert!(load(&directory).is_err());
        assert_eq!(load_or_back_up(&directory), DeviceSettings::default());
        assert_eq!(
            std::fs::read_to_string(directory.join("settings.invalid.json")).unwrap(),
            "not json"
        );
    }
}
