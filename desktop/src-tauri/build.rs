fn main() {
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-arg=/MANIFESTUAC:level='requireAdministrator' uiAccess='false'");
    tauri_build::build()
}
