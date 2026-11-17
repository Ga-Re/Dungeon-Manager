//! Importing assets into the library (SPEC §3.1, ARCHITECTURE §6.3): the file is copied into a
//! library folder under a portable name and referenced by that relative path plus its SHA-256.

use crate::library::{self, LibraryError};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read};
use std::path::Path;

/// File extensions offered in the picker for maps.
pub const MAP_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];

/// A file now in the library; mirrors `AssetRef` in `packages/schema`.
#[derive(Debug, PartialEq, Serialize)]
pub struct ImportedAsset {
    /// Relative to the library root, `/`-separated (e.g. `library/maps/cave.webp`).
    pub path: String,
    /// `sha256:<64 hex digits>`.
    pub hash: String,
}

/// The image format by its leading bytes, so a renamed file of another type is refused.
fn image_extension(header: &[u8]) -> Option<&'static str> {
    if header.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if header.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if header.len() >= 12 && &header[..4] == b"RIFF" && &header[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

/// A portable file stem: lowercase ASCII letters, digits and dashes; umlauts spelled out.
fn portable_stem(stem: &str) -> String {
    let mut result = String::new();
    for character in stem.chars().flat_map(char::to_lowercase) {
        match character {
            'a'..='z' | '0'..='9' => result.push(character),
            'ä' => result.push_str("ae"),
            'ö' => result.push_str("oe"),
            'ü' => result.push_str("ue"),
            'ß' => result.push_str("ss"),
            _ if !result.ends_with('-') => result.push('-'),
            _ => {}
        }
    }
    let trimmed: String = result.trim_matches('-').chars().take(60).collect();
    let trimmed = trimmed.trim_end_matches('-');
    if trimmed.is_empty() {
        "map".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn sha256_of(path: &Path) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 1 << 20];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

/// Copies the image at `source` into `<root>/<folder>/`. An identical file already there is
/// reused; a different file of the same name gets a numbered name, so nothing is overwritten.
pub fn import_image(
    root: &Path,
    folder: &str,
    source: &Path,
) -> Result<ImportedAsset, LibraryError> {
    let mut header = [0; 12];
    let read = fs::File::open(source)?.read(&mut header)?;
    let extension = image_extension(&header[..read])
        .ok_or_else(|| LibraryError::UnsupportedFile(source.display().to_string()))?;
    let hash = sha256_of(source)?;
    let stem = portable_stem(&source.file_stem().unwrap_or_default().to_string_lossy());
    for number in 1.. {
        let name = if number == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{number}.{extension}")
        };
        let relative = format!("{folder}/{name}");
        let target = library::resolve(root, &relative)?;
        if target.exists() {
            if sha256_of(&target)? == hash {
                return Ok(ImportedAsset {
                    path: relative,
                    hash,
                });
            }
            continue;
        }
        copy_atomic(source, &target)?;
        return Ok(ImportedAsset {
            path: relative,
            hash,
        });
    }
    unreachable!("the name loop only ends by returning")
}

/// Streams `source` into `target` via the same temp-file-and-rename as `write_atomic`.
fn copy_atomic(source: &Path, target: &Path) -> Result<(), LibraryError> {
    library::write_atomic_with(target, |file| {
        io::copy(&mut fs::File::open(source)?, file)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nrest-of-a-png";
    const WEBP: &[u8] = b"RIFF\0\0\0\0WEBPVP8 data";

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dm-import-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_formats_by_content() {
        assert_eq!(image_extension(PNG), Some("png"));
        assert_eq!(image_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(image_extension(WEBP), Some("webp"));
        assert_eq!(image_extension(b"GIF89a"), None);
        assert_eq!(image_extension(b""), None);
    }

    #[test]
    fn names_are_portable() {
        assert_eq!(portable_stem("Goblin Höhle (Nacht)"), "goblin-hoehle-nacht");
        assert_eq!(portable_stem("..."), "map");
        assert_eq!(portable_stem(&"x".repeat(100)).len(), 60);
    }

    #[test]
    fn copies_hashes_reuses_and_never_overwrites() {
        let outside = temp_dir("source");
        let root = temp_dir("root");
        let source = outside.join("Höhle.PNG");
        fs::write(&source, PNG).unwrap();

        let first = import_image(&root, "library/maps", &source).unwrap();
        assert_eq!(first.path, "library/maps/hoehle.png");
        assert_eq!(first.hash, format!("sha256:{:x}", Sha256::digest(PNG)));
        assert_eq!(fs::read(root.join("library/maps/hoehle.png")).unwrap(), PNG);

        // Same content again: reused, no copy.
        assert_eq!(import_image(&root, "library/maps", &source).unwrap(), first);

        // Different content, same name: a new name, the old file untouched.
        let other = outside.join("hoehle.webp");
        fs::write(&other, WEBP).unwrap();
        fs::write(root.join("library/maps/hoehle.webp"), b"RIFF0000WEBPold").unwrap();
        let second = import_image(&root, "library/maps", &other).unwrap();
        assert_eq!(second.path, "library/maps/hoehle-2.webp");
        assert_eq!(
            fs::read(root.join("library/maps/hoehle.webp")).unwrap(),
            b"RIFF0000WEBPold"
        );
    }

    #[test]
    fn refuses_files_that_are_not_images() {
        let outside = temp_dir("not-image");
        let source = outside.join("map.png");
        fs::write(&source, b"<html>").unwrap();
        assert!(matches!(
            import_image(&temp_dir("not-image-root"), "library/maps", &source),
            Err(LibraryError::UnsupportedFile(_))
        ));
    }
}
