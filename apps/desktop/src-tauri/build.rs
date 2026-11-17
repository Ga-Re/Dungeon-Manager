fn main() {
    // App commands become permissions (`allow-library-read`, …) that only the DM window's
    // capability grants; without this list every window could call them.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "library_root",
        "library_choose",
        "library_read",
        "library_write",
        "library_list",
        "library_make_directory",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run the Tauri build script");
}
