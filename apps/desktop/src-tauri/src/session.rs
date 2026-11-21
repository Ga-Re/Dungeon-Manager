//! Whether the last session of the app ended cleanly (T-238, DM decision 2026-11-21): a marker
//! file in the OS app-data directory is created when the app starts and removed when it exits
//! (closing the DM window or quitting, also with Cmd+Q). Still there at the next start, the app
//! was killed or crashed – the DM window then keeps the TV dark until the DM sends a scene.
//! Done here because the webview does not reliably report its end (`pagehide`, T-114a).

use std::path::Path;

const MARKER: &str = "session-running";

/// Marks the session as running. Returns whether the previous one never ended. A marker that
/// cannot be written only means the next start cannot tell (it then counts as clean).
pub fn start(directory: &Path) -> bool {
    let marker = directory.join(MARKER);
    let crashed = marker.exists();
    if let Err(error) =
        std::fs::create_dir_all(directory).and_then(|()| std::fs::write(&marker, b""))
    {
        eprintln!("The session marker could not be written: {error}");
    }
    crashed
}

/// Marks the session as ended cleanly.
pub fn end(directory: &Path) {
    let _ = std::fs::remove_file(directory.join(MARKER));
}

/// What `start` found when this session began, for the DM window to ask.
#[derive(Default)]
pub struct SessionState {
    pub previous_crashed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn directory(name: &str) -> std::path::PathBuf {
        let directory =
            std::env::temp_dir().join(format!("dm-session-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        directory
    }

    #[test]
    fn a_first_start_and_a_start_after_a_clean_end_are_no_crash() {
        let directory = directory("clean");
        assert!(!start(&directory));
        end(&directory);
        assert!(!start(&directory));
        end(&directory);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn a_start_after_a_session_that_never_ended_follows_a_crash() {
        let directory = directory("crash");
        assert!(!start(&directory));
        assert!(start(&directory));
        end(&directory);
        let _ = std::fs::remove_dir_all(&directory);
    }
}
