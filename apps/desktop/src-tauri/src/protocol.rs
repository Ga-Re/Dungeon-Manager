//! The read-only `dmlib` URI scheme: lets the DM and player windows load images from the
//! library (`<img src>`, PixiJS textures) without any file permission. It serves only files under
//! `library/` – never `campaigns/`, where scenes, notes and hidden information live – and uses the
//! same path confinement as every other library access (DM decision, T-105a).

use crate::PLAYER_WINDOW;
use crate::commands::{DM_WINDOW, LibraryState};
use crate::library;
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
        _ => None,
    }
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

/// Answers one request; runs on a worker thread because maps can be large.
fn respond<R: Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    uri_path: &str,
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
    match std::fs::read(file) {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, mime)
            // WebGL only accepts CORS-clean images. The scheme is reachable only from this
            // app's own webviews, so allowing any origin exposes nothing.
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
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
    std::thread::spawn(move || responder.respond(respond(&app, &label, &uri_path)));
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
    fn only_image_types_are_served() {
        assert_eq!(content_type("library/maps/a.PNG"), Some("image/png"));
        assert_eq!(content_type("library/maps/a.jpeg"), Some("image/jpeg"));
        assert_eq!(content_type("library/maps/a.webp"), Some("image/webp"));
        assert_eq!(content_type("library/maps/notes.json"), None);
        assert_eq!(content_type("library/maps/noextension"), None);
    }
}
