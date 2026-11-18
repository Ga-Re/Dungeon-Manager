//! The read-only `dmlib` URI scheme: lets the DM and player windows load map images and videos
//! from the library (`<img>`/`<video>`, PixiJS textures) without any file permission. It serves only files under
//! `library/` – never `campaigns/`, where scenes, notes and hidden information live – and uses the
//! same path confinement as every other library access (DM decision, T-105a).

use crate::PLAYER_WINDOW;
use crate::commands::{DM_WINDOW, LibraryState};
use crate::library;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "dmlib";

/// Decodes `%XX` escapes (the webview encodes the path with `encodeURIComponent`).
fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = text.get(index + 1..index + 3)?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// The library-relative path a request asks for, if it is one this scheme may serve.
pub fn requested_path(uri_path: &str) -> Option<String> {
    let path = percent_decode(uri_path.strip_prefix('/')?)?;
    path.starts_with("library/").then_some(path)
}

fn content_type(path: &str) -> Option<&'static str> {
    let extension = path.rsplit_once('.')?.1.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "mp4" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        _ => None,
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

/// The most a single video response carries; players ask again for the rest.
const MAX_CHUNK: u64 = 4 * 1024 * 1024;

/// The byte range `[start, end]` (inclusive) to send for a `Range` header, capped at
/// `MAX_CHUNK`, or `None` if the range cannot be satisfied (HTTP 416). Only single ranges of
/// the form `bytes=a-b`, `bytes=a-` and `bytes=-n` are supported (all media players use them);
/// multiple ranges and malformed headers are answered with 416 rather than ignored.
pub fn byte_range(range: &str, size: u64) -> Option<(u64, u64)> {
    let spec = range.trim().strip_prefix("bytes=")?;
    let (first, last) = spec.split_once('-')?;
    let (start, end) = match (first.trim(), last.trim()) {
        ("", suffix) => {
            let length: u64 = suffix.parse().ok()?;
            (size.checked_sub(length.min(size))?, size.checked_sub(1)?)
        }
        (start, "") => (start.parse().ok()?, size.checked_sub(1)?),
        (start, end) => (
            start.parse().ok()?,
            end.parse::<u64>().ok()?.min(size.checked_sub(1)?),
        ),
    };
    (start <= end && start < size).then(|| (start, end.min(start + MAX_CHUNK - 1)))
}

fn read_range(opened: &mut File, start: u64, end: u64) -> std::io::Result<Vec<u8>> {
    opened.seek(SeekFrom::Start(start))?;
    let mut bytes = Vec::with_capacity(usize::try_from(end - start + 1).unwrap_or(0));
    opened
        .by_ref()
        .take(end - start + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Answers one request; runs on a worker thread because maps can be large. Images are sent
/// whole (WebGL needs them complete); videos only in ranges of at most `MAX_CHUNK`, so a large
/// map video never sits in memory as a whole.
fn respond<R: Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    uri_path: &str,
    range: Option<&str>,
) -> Response<Vec<u8>> {
    if label != DM_WINDOW && label != PLAYER_WINDOW {
        return status(StatusCode::NOT_FOUND);
    }
    let (Some(path), Ok(root)) = (requested_path(uri_path), app.state::<LibraryState>().root())
    else {
        return status(StatusCode::NOT_FOUND);
    };
    let Some(mime) = content_type(&path) else {
        return status(StatusCode::NOT_FOUND);
    };
    // Every refusal looks the same from outside: not found.
    let Ok(file) = library::resolve(&root, &path) else {
        return status(StatusCode::NOT_FOUND);
    };
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        // WebGL only accepts CORS-clean images. The scheme is reachable only from this
        // app's own webviews, so allowing any origin exposes nothing.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    if !mime.starts_with("video/") {
        return match std::fs::read(file) {
            Ok(bytes) => builder
                .body(bytes)
                .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR)),
            Err(_) => status(StatusCode::NOT_FOUND),
        };
    }
    // Size and bytes from the same open file, so they agree even if the file changes meanwhile.
    let Ok(mut opened) = File::open(&file) else {
        return status(StatusCode::NOT_FOUND);
    };
    let Ok(size) = opened.metadata().map(|meta| meta.len()) else {
        return status(StatusCode::NOT_FOUND);
    };
    // Media players always ask for ranges. Without one, HTTP would want the whole file (200),
    // which a capped response cannot be – so the first chunk is sent as a range, which the
    // webviews (WebKit, WebView2) accept.
    let Some((start, end)) = byte_range(range.unwrap_or("bytes=0-"), size) else {
        let mut refused = status(StatusCode::RANGE_NOT_SATISFIABLE);
        if let Ok(value) = format!("bytes */{size}").parse() {
            refused.headers_mut().insert(header::CONTENT_RANGE, value);
        }
        return refused;
    };
    match read_range(&mut opened, start, end) {
        Ok(bytes) => builder
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
            .body(bytes)
            .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR)),
        Err(_) => status(StatusCode::NOT_FOUND),
    }
}

/// The handler registered for `dmlib://` (and `http://dmlib.localhost` on Windows).
pub fn handle<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = context.app_handle().clone();
    let label = context.webview_label().to_owned();
    let uri_path = request.uri().path().to_owned();
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    std::thread::spawn(move || {
        responder.respond(respond(&app, &label, &uri_path, range.as_deref()));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_only_library_paths() {
        assert_eq!(
            requested_path("/library%2Fmaps%2Fh%C3%B6hle.png").as_deref(),
            Some("library/maps/höhle.png")
        );
        assert_eq!(
            requested_path("/library/maps/cave.png").as_deref(),
            Some("library/maps/cave.png")
        );
        for refused in [
            "/campaigns%2Fmine%2Fcampaign.json",
            "/library",
            "/%2E%2E%2Flibrary%2Fx.png",
            "/libraryx/a.png",
            "/library%2",
            "/library%ZZ",
            "/library%2F%FF.png",
            "",
        ] {
            assert_eq!(requested_path(refused), None, "{refused}");
        }
    }

    #[test]
    fn ranges_are_parsed_and_capped() {
        assert_eq!(byte_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(byte_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(byte_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(byte_range("bytes=990-5000", 1000), Some((990, 999)));
        assert_eq!(
            byte_range("bytes=0-", 100 * MAX_CHUNK),
            Some((0, MAX_CHUNK - 1))
        );
        for refused in [
            "bytes=1000-",
            "bytes=5-2",
            "items=0-1",
            "bytes=a-b",
            "bytes=0-1,5-6",
        ] {
            assert_eq!(byte_range(refused, 1000), None, "{refused}");
        }
        assert_eq!(byte_range("bytes=0-", 0), None);
    }

    #[test]
    fn a_range_is_read_from_the_file() {
        let file = std::env::temp_dir().join(format!("dm-range-{}", std::process::id()));
        std::fs::write(&file, b"0123456789").unwrap();
        let mut opened = File::open(&file).unwrap();
        assert_eq!(read_range(&mut opened, 3, 6).unwrap(), b"3456");
        drop(opened);
        std::fs::remove_file(&file).unwrap();
    }

    #[test]
    fn only_map_types_are_served() {
        assert_eq!(content_type("library/maps/a.PNG"), Some("image/png"));
        assert_eq!(content_type("library/maps/a.jpeg"), Some("image/jpeg"));
        assert_eq!(content_type("library/maps/a.webp"), Some("image/webp"));
        assert_eq!(content_type("library/maps/a.MP4"), Some("video/mp4"));
        assert_eq!(content_type("library/maps/a.webm"), Some("video/webm"));
        assert_eq!(content_type("library/maps/notes.json"), None);
        assert_eq!(content_type("library/maps/noextension"), None);
    }
}
