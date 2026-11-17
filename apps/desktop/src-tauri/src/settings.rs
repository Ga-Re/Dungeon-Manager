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

/// Loads the settings; a missing or unreadable file yields the defaults (logged, not fatal).
pub fn load(directory: &Path) -> DeviceSettings {
    let path = directory.join(FILE_NAME);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|error| {
            eprintln!(
                "Ignoring invalid device settings {}: {error}",
                path.display()
            );
            DeviceSettings::default()
        }),
        Err(_) => DeviceSettings::default(),
    }
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
        assert_eq!(load(&directory), DeviceSettings::default());
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join(FILE_NAME),
            r#"{"libraryRoot":"/lib","future":1}"#,
        )
        .unwrap();
        let settings = load(&directory);
        assert_eq!(settings.library_root.as_deref(), Some(Path::new("/lib")));
        save(&directory, &settings).unwrap();
        assert_eq!(load(&directory), settings);
        std::fs::write(directory.join(FILE_NAME), "not json").unwrap();
        assert_eq!(load(&directory), DeviceSettings::default());
    }
}
