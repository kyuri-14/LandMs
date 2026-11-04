// SPDX-License-Identifier: AGPL-3.0-or-later
//
// LandMs desktop backend: file access for projects / exports / Foling
// modules, and a local preview server so module scripts (menus, carousels)
// run in the preview without loosening the editor's own CSP.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

// ---------- helpers ----------

fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn require_extension(path: &Path, allowed: &[&str], message: &str) -> Result<(), String> {
    if allowed.contains(&extension_of(path).as_str()) {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

/// A path inside the export folder: relative, no `..`, no drive or root.
fn validated_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if value.trim().is_empty() || path.is_absolute() {
        return Err(format!("書き出し先の相対パスが不正です: {value}"));
    }
    if path
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(format!("書き出し先にフォルダー外のパスは指定できません: {value}"));
    }
    Ok(path.to_path_buf())
}

fn safe_folder_name(value: &str) -> String {
    let filtered: String = value
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' })
        .collect();
    let trimmed = filtered.trim_matches(|c| c == '-' || c == '.').to_string();
    if trimmed.is_empty() {
        "LandMs-Export".into()
    } else {
        trimmed
    }
}

/// `parent/name`, or `parent/name-2`, `-3`… so an export never overwrites anything.
fn unique_destination(parent: &Path, name: &str) -> PathBuf {
    let base = safe_folder_name(name);
    let first = parent.join(&base);
    if !first.exists() {
        return first;
    }
    for index in 2..10_000 {
        let candidate = parent.join(format!("{base}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{base}-{}", std::process::id()))
}

// ---------- project & text files ----------

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    require_extension(&path, &["landms", "json"], "LandMsのプロジェクト（.landms）を選択してください")?;
    fs::read_to_string(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_project_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    require_extension(&path, &["landms", "json"], "保存先は .landms ファイルにしてください")?;
    // Write next to the target first so a crash mid-write never truncates the project.
    let temp = path.with_extension("landms.tmp");
    fs::write(&temp, contents).map_err(|error| error.to_string())?;
    fs::rename(&temp, &path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    require_extension(
        &path,
        &["html", "htm", "yaml", "yml", "css", "js", "txt", "json"],
        "この種類のファイルには書き出せません",
    )?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[derive(Deserialize)]
struct ExportFile {
    path: String,
    content: String,
    #[serde(default)]
    encoding: Option<String>,
}

#[tauri::command]
fn export_files(parent: String, folder_name: String, files: Vec<ExportFile>) -> Result<String, String> {
    let parent = PathBuf::from(parent);
    if !parent.is_dir() {
        return Err("書き出し先フォルダーが見つかりません".into());
    }
    if files.is_empty() {
        return Err("書き出すファイルがありません".into());
    }
    // Validate everything before touching the disk.
    let mut prepared: Vec<(PathBuf, Vec<u8>)> = Vec::with_capacity(files.len());
    for file in files {
        let relative = validated_relative_path(&file.path)?;
        let bytes = match file.encoding.as_deref() {
            Some("base64") => base64::engine::general_purpose::STANDARD
                .decode(file.content.as_bytes())
                .map_err(|error| format!("{}: {error}", file.path))?,
            _ => file.content.into_bytes(),
        };
        prepared.push((relative, bytes));
    }
    let destination = unique_destination(&parent, &folder_name);
    fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    for (relative, bytes) in prepared {
        let target = destination.join(relative);
        if let Some(directory) = target.parent() {
            fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        }
        fs::write(target, bytes).map_err(|error| error.to_string())?;
    }
    Ok(destination.to_string_lossy().into_owned())
}

// ---------- Foling ----------

#[derive(Serialize)]
struct NamedText {
    name: String,
    contents: String,
}

/// Module files of a Foling project: `<folder>/modules/*.yaml` (or the folder itself if it is `modules/`).
#[tauri::command]
fn read_foling_modules(folder: String) -> Result<Vec<NamedText>, String> {
    let folder = PathBuf::from(folder);
    let modules = if folder.join("modules").is_dir() {
        folder.join("modules")
    } else {
        folder.clone()
    };
    if !modules.is_dir() {
        return Err("フォルダーが見つかりません".into());
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(&modules)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.is_file() && matches!(extension_of(path).as_str(), "yaml" | "yml"))
        .collect();
    entries.sort();
    if entries.is_empty() {
        return Err("modules/ フォルダーにモジュール（.yaml）が見つかりません。Foling の「モジュールとして保存」で作成できます。".into());
    }
    entries
        .into_iter()
        .map(|path| {
            Ok(NamedText {
                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                contents: fs::read_to_string(&path).map_err(|error| error.to_string())?,
            })
        })
        .collect()
}

// ---------- preview server ----------

struct PreviewState {
    html: Mutex<String>,
    version: AtomicU64,
    /// 0 when the server could not be started.
    port: u16,
}

/// Bind 127.0.0.1 on a free port and serve the current preview page from a background thread.
fn start_preview_server() -> Arc<PreviewState> {
    use tiny_http::{Header, Response, Server};
    let server = match Server::http("127.0.0.1:0") {
        Ok(server) => server,
        Err(_) => {
            return Arc::new(PreviewState { html: Mutex::new(String::new()), version: AtomicU64::new(0), port: 0 });
        }
    };
    let port = server.server_addr().to_ip().map(|address| address.port()).unwrap_or(0);
    let state = Arc::new(PreviewState { html: Mutex::new(String::new()), version: AtomicU64::new(0), port });
    let shared = state.clone();
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let path = request.url().split('?').next().unwrap_or("/").to_string();
            if path != "/" && path != "/index.html" {
                let _ = request.respond(Response::from_string("Not found").with_status_code(404));
                continue;
            }
            let html = shared.html.lock().map(|html| html.clone()).unwrap_or_default();
            let mut response = Response::from_string(html);
            for (name, value) in [
                ("Content-Type", "text/html; charset=utf-8"),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
            ] {
                if let Ok(header) = Header::from_bytes(name.as_bytes(), value.as_bytes()) {
                    response.add_header(header);
                }
            }
            let _ = request.respond(response);
        }
    });
    state
}

/// Store the page to preview and return the URL that serves it.
#[tauri::command]
fn set_preview(state: tauri::State<Arc<PreviewState>>, html: String) -> Result<String, String> {
    if state.port == 0 {
        return Err("プレビューサーバーを起動できませんでした".into());
    }
    if let Ok(mut current) = state.html.lock() {
        *current = html;
    }
    let version = state.version.fetch_add(1, Ordering::Relaxed) + 1;
    Ok(format!("http://127.0.0.1:{}/?v={version}", state.port))
}

// ---------- opening things ----------

fn spawn_opener(target: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = std::process::Command::new("explorer");
        command.arg(target);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(target);
        command
    };
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = {
        let mut command = std::process::Command::new("xdg-open");
        command.arg(target);
        command
    };
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

/// Open a web page in the default browser (http(s) only).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1:")) {
        return Err("開けるのは https:// とローカルプレビューのURLだけです".into());
    }
    spawn_opener(&url)
}

/// Show an export folder in Explorer / Finder / the file manager.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err("フォルダーが見つかりません".into());
    }
    spawn_opener(&path.to_string_lossy())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(start_preview_server())
        .invoke_handler(tauri::generate_handler![
            read_project_file,
            write_project_file,
            write_text_file,
            export_files,
            read_foling_modules,
            set_preview,
            open_url,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("LandMs failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_paths_cannot_escape_the_folder() {
        assert!(validated_relative_path("HTML/02_body/config.yaml").is_ok());
        assert!(validated_relative_path("../evil").is_err());
        assert!(validated_relative_path("a/../../evil").is_err());
        assert!(validated_relative_path("/etc/passwd").is_err());
        assert!(validated_relative_path("./a").is_err());
        assert!(validated_relative_path("").is_err());
    }

    #[test]
    fn folder_names_are_sanitised() {
        assert_eq!(safe_folder_name("North Studio/../x"), "North-Studio-..-x");
        assert_eq!(safe_folder_name("..."), "LandMs-Export");
        assert_eq!(safe_folder_name("ランダムズ"), "ランダムズ");
    }

    #[test]
    fn exports_write_text_and_binary_into_a_new_folder() {
        let parent = std::env::temp_dir().join(format!("landms-test-{}", std::process::id()));
        fs::create_dir_all(&parent).unwrap();
        let files = vec![
            ExportFile { path: "index.html".into(), content: "<p>hi</p>".into(), encoding: None },
            ExportFile { path: "images/a.png".into(), content: "iVBORw0KGgo=".into(), encoding: Some("base64".into()) },
        ];
        let first = PathBuf::from(export_files(parent.to_string_lossy().into(), "Site".into(), files).unwrap());
        assert_eq!(fs::read_to_string(first.join("index.html")).unwrap(), "<p>hi</p>");
        assert_eq!(fs::read(first.join("images/a.png")).unwrap()[..4], [0x89, b'P', b'N', b'G']);
        let again = vec![ExportFile { path: "index.html".into(), content: "2".into(), encoding: None }];
        let second = PathBuf::from(export_files(parent.to_string_lossy().into(), "Site".into(), again).unwrap());
        assert_ne!(first, second, "an existing export folder is never overwritten");
        let rejected = vec![ExportFile { path: "../x".into(), content: "".into(), encoding: None }];
        assert!(export_files(parent.to_string_lossy().into(), "Bad".into(), rejected).is_err());
        assert!(!parent.join("Bad").exists(), "nothing is written when validation fails");
        fs::remove_dir_all(parent).unwrap();
    }
}
