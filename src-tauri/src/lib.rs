// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::Deserialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Deserialize)]
struct ExportFile {
    path: String,
    content: String,
}

fn validated_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute() || value.trim().is_empty() {
        return Err("書き出し先の相対パスが不正です".into());
    }
    if path.components().any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("書き出し先にプロジェクト外のパスは指定できません".into());
    }
    Ok(path.to_path_buf())
}

fn safe_project_name(value: &str) -> String {
    let filtered: String = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .collect();
    if filtered.is_empty() { "LandMs-Export".into() } else { filtered }
}

fn unique_destination(parent: &Path, project_name: &str) -> PathBuf {
    let base = safe_project_name(project_name);
    let first = parent.join(&base);
    if !first.exists() { return first; }
    for index in 2..10_000 {
        let candidate = parent.join(format!("{base}-{index}"));
        if !candidate.exists() { return candidate; }
    }
    parent.join(format!("{base}-{}", std::process::id()))
}

#[tauri::command]
fn read_module_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if !matches!(extension.to_ascii_lowercase().as_str(), "yaml" | "yml") {
        return Err("Folingモジュールは.yamlまたは.ymlを選択してください".into());
    }
    let source = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed: serde_yml::Value = serde_yml::from_str(&source)
        .map_err(|error| format!("モジュールYAMLを解析できません: {error}"))?;
    let sequence = parsed.as_sequence().ok_or_else(|| "モジュールファイルのルートは配列である必要があります".to_string())?;
    if sequence.is_empty() {
        return Err("モジュールが含まれていません".into());
    }
    Ok(source)
}

#[tauri::command]
fn export_files(parent: String, project_name: String, files: Vec<ExportFile>) -> Result<String, String> {
    let parent = PathBuf::from(parent);
    if !parent.is_dir() {
        return Err("書き出し先フォルダーが見つかりません".into());
    }
    if files.is_empty() {
        return Err("書き出すファイルがありません".into());
    }
    let destination = unique_destination(&parent, &project_name);
    fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    for file in files {
        let relative = validated_relative_path(&file.path)?;
        let target = destination.join(relative);
        if let Some(directory) = target.parent() {
            fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        }
        fs::write(target, file.content).map_err(|error| error.to_string())?;
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![read_module_file, export_files])
        .run(tauri::generate_context!())
        .expect("LandMs failed to start");
}
