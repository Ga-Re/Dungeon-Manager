//! Importing assets into the library (SPEC §3.1, ARCHITECTURE §6.3): the file is copied into a
//! library folder under a portable name and referenced by that relative path plus its SHA-256.

use crate::library::{self, LibraryError};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

/// File extensions offered in the picker for maps.
pub const MAP_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "mp4", "webm"];

/// A file now in the library; mirrors `AssetRef` in `packages/schema`.
#[derive(Debug, PartialEq, Serialize)]
pub struct ImportedAsset {
    /// Relative to the library root, `/`-separated (e.g. `library/maps/cave.webp`).
    pub path: String,
    /// `sha256:<64 hex digits>`.
    pub hash: String,
}

/// MP4 major brands of playable videos. Other ISO-BMFF files (AVIF, HEIC images, QuickTime
/// `qt  `, 3GP) also start with `ftyp` but are no MP4 videos.
const MP4_BRANDS: [&[u8]; 8] = [
    b"isom", b"iso2", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"dash",
];

/// Whether the `ftyp` box names a video brand as its major brand or among its compatible
/// brands (those follow the 4-byte minor version, up to the end of the box).
fn has_mp4_brand(header: &[u8]) -> bool {
    let box_end = header
        .get(..4)
        .and_then(|size| <[u8; 4]>::try_from(size).ok())
        .map_or(0, |size| u32::from_be_bytes(size) as usize)
        .min(header.len());
    let (compatible, _) = header.get(16..box_end).unwrap_or_default().as_chunks::<4>();
    std::iter::once(&header[8..12])
        .chain(compatible.iter().map(<[u8; 4]>::as_slice))
        .any(|brand| MP4_BRANDS.contains(&brand))
}

/// How many leading bytes the format check looks at (enough for the WebM document type).
const HEADER_BYTES: usize = 64;

/// The map format by its leading bytes, so a renamed file of another type is refused: images
/// (PNG, JPEG, WebP) and videos (MP4 with its `ftyp` box, WebM with its EBML header).
fn map_extension(header: &[u8]) -> Option<&'static str> {
    if header.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if header.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if header.len() >= 12 && &header[..4] == b"RIFF" && &header[8..12] == b"WEBP" {
        Some("webp")
    } else if header.len() >= 12 && &header[4..8] == b"ftyp" && has_mp4_brand(header) {
        Some("mp4")
    } else if header.starts_with(&[0x1A, 0x45, 0xDF, 0xA3])
        && header.windows(4).any(|window| window == b"webm")
    {
        // EBML is also Matroska (.mkv); only the WebM document type plays everywhere.
        Some("webm")
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
    // Windows device names are not usable as file names, whatever the extension.
    const DEVICES: [&str; 22] = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    match trimmed {
        "" => "map".to_owned(),
        device if DEVICES.contains(&device) => format!("{device}-map"),
        stem => stem.to_owned(),
    }
}

fn sha256_of(path: &Path) -> io::Result<String> {
    let mut hasher = Sha256::new();
    io::copy(&mut fs::File::open(path)?, &mut hasher)?;
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

/// Removes the staging file however the import ends.
struct Staged(PathBuf);

impl Drop for Staged {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

/// Copies `source` once into a staging file inside the library, hashing the bytes and keeping
/// the first ones for format detection on the way, so the hash always matches the copy.
fn stage(source: &Path, staged: &Path) -> io::Result<(String, Vec<u8>)> {
    let mut input = fs::File::open(source)?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(staged)?;
    let mut hasher = Sha256::new();
    let mut header = Vec::with_capacity(HEADER_BYTES);
    let mut buffer = vec![0; 1 << 20];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        let missing = HEADER_BYTES.saturating_sub(header.len()).min(read);
        header.extend_from_slice(&chunk[..missing]);
        hasher.update(chunk);
        output.write_all(chunk)?;
    }
    output.sync_all()?;
    Ok((format!("sha256:{:x}", hasher.finalize()), header))
}

/// Copies the map (image or video) at `source` into `<root>/<folder>/` under a portable name. An identical file
/// already there is reused; any other existing file keeps its name and the import gets a
/// numbered one, so nothing is overwritten.
pub fn import_map(root: &Path, folder: &str, source: &Path) -> Result<ImportedAsset, LibraryError> {
    let staged_path = library::resolve(
        root,
        &format!("{folder}/.import-{}.tmp", std::process::id()),
    )?;
    fs::create_dir_all(staged_path.parent().unwrap_or(root))?;
    // A leftover from a crashed import (or a planted symlink) is removed, never followed.
    let _ = fs::remove_file(&staged_path);
    let staged = Staged(staged_path);
    let (hash, header) = stage(source, &staged.0)?;
    let extension = map_extension(&header)
        .ok_or_else(|| LibraryError::UnsupportedFile(source.display().to_string()))?;
    let stem = portable_stem(&source.file_stem().unwrap_or_default().to_string_lossy());
    for number in 1.. {
        let name = if number == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{number}.{extension}")
        };
        let relative = format!("{folder}/{name}");
        let target = library::resolve(root, &relative)?;
        if target.is_file() && sha256_of(&target)? == hash {
            return Ok(ImportedAsset {
                path: relative,
                hash,
            });
        }
        if !target.exists() && library::place_new(&staged.0, &target)? {
            return Ok(ImportedAsset {
                path: relative,
                hash,
            });
        }
    }
    unreachable!("the name loop only ends by returning")
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
        assert_eq!(map_extension(PNG), Some("png"));
        assert_eq!(map_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(map_extension(WEBP), Some("webp"));
        assert_eq!(map_extension(b"\0\0\0\x20ftypisom"), Some("mp4"));
        assert_eq!(map_extension(b"\0\0\0\x20ftypmp42"), Some("mp4"));
        // AVIF images and QuickTime files share the box but are no MP4 videos.
        assert_eq!(map_extension(b"\0\0\0\x20ftypavif"), None);
        assert_eq!(map_extension(b"\0\0\0\x14ftypqt  "), None);
        // M4V as major brand, but compatible with isom: plays like any MP4.
        assert_eq!(
            map_extension(b"\0\0\0\x18ftypM4V \0\0\0\0isommp42"),
            Some("mp4")
        );
        // An AVIF that lists only image brands stays refused.
        assert_eq!(map_extension(b"\0\0\0\x18ftypavif\0\0\0\0avifmif1"), None);
        let webm = [
            &[0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x82, 0x84][..],
            b"webm",
        ]
        .concat();
        assert_eq!(map_extension(&webm), Some("webm"));
        let mkv = [
            &[0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x82, 0x88][..],
            b"matroska",
        ]
        .concat();
        assert_eq!(map_extension(&mkv), None);
        assert_eq!(map_extension(b"GIF89a"), None);
        assert_eq!(map_extension(b""), None);
    }

    #[test]
    fn names_are_portable() {
        assert_eq!(portable_stem("Goblin Höhle (Nacht)"), "goblin-hoehle-nacht");
        assert_eq!(portable_stem("..."), "map");
        assert_eq!(portable_stem("CON"), "con-map");
        assert_eq!(portable_stem(&"x".repeat(100)).len(), 60);
    }

    #[test]
    fn copies_hashes_reuses_and_never_overwrites() {
        let outside = temp_dir("source");
        let root = temp_dir("root");
        let source = outside.join("Höhle.PNG");
        fs::write(&source, PNG).unwrap();

        let first = import_map(&root, "library/maps", &source).unwrap();
        assert_eq!(first.path, "library/maps/hoehle.png");
        assert_eq!(first.hash, format!("sha256:{:x}", Sha256::digest(PNG)));
        assert_eq!(fs::read(root.join("library/maps/hoehle.png")).unwrap(), PNG);

        // Same content again: reused, no copy.
        assert_eq!(import_map(&root, "library/maps", &source).unwrap(), first);

        // Different content, same name: a new name, the old file untouched.
        let other = outside.join("hoehle.webp");
        fs::write(&other, WEBP).unwrap();
        fs::write(root.join("library/maps/hoehle.webp"), b"RIFF0000WEBPold").unwrap();
        let second = import_map(&root, "library/maps", &other).unwrap();
        assert_eq!(second.path, "library/maps/hoehle-2.webp");

        // A folder in the way is skipped, not an error.
        fs::create_dir_all(root.join("library/maps/hoehle-3.webp")).unwrap();
        fs::write(&other, b"RIFF1111WEBPnewer").unwrap();
        let third = import_map(&root, "library/maps", &other).unwrap();
        assert_eq!(third.path, "library/maps/hoehle-4.webp");

        // No staging files are left behind.
        let leftovers: Vec<_> = fs::read_dir(root.join("library/maps"))
            .unwrap()
            .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
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
        let root = temp_dir("not-image-root");
        assert!(matches!(
            import_map(&root, "library/maps", &source),
            Err(LibraryError::UnsupportedFile(_))
        ));
        assert_eq!(fs::read_dir(root.join("library/maps")).unwrap().count(), 0);
    }
}
