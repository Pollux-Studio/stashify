mod models;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{Delta, Oid, Patch, Repository};
use models::{ApiError, StashDiffFile, StashDiffResponse, StashEntry};
use std::collections::VecDeque;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn list_stashes(repo_path: String) -> Result<Vec<StashEntry>, ApiError> {
    let mut repo = Repository::open(&repo_path)
        .map_err(|err| ApiError::invalid_repository(&repo_path, &err.to_string()))?;

    let mut stashes = Vec::new();
    repo.stash_foreach(|index, message, commit| {
        stashes.push(StashEntry {
            index: index as usize,
            message: message.to_string(),
            commit: commit.to_string(),
        });
        true
    })
    .map_err(|err| ApiError::stash_list_failed(&err.to_string()))?;

    Ok(stashes)
}

fn find_stash_oid(repo: &mut Repository, index: usize) -> Result<Oid, ApiError> {
    let mut stash_oid = None;
    repo.stash_foreach(|stash_index, _message, oid| {
        if stash_index as usize == index {
            stash_oid = Some(*oid);
            false
        } else {
            true
        }
    })
    .map_err(|err| ApiError::stash_list_failed(&err.to_string()))?;

    stash_oid.ok_or_else(|| ApiError::stash_not_found(index))
}

fn status_to_string(status: Delta) -> String {
    match status {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Typechange => "typechange",
        Delta::Untracked => "untracked",
        Delta::Ignored => "ignored",
        Delta::Unreadable => "unreadable",
        Delta::Conflicted => "conflicted",
        _ => "unknown",
    }
    .to_string()
}

fn diff_path(delta: &git2::DiffDelta<'_>) -> String {
    delta
        .new_file()
        .path()
        .or_else(|| delta.old_file().path())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "<unknown>".to_string())
}

fn diff_patch_text(diff: &git2::Diff<'_>, index: usize) -> String {
    match Patch::from_diff(diff, index) {
        Ok(Some(mut patch)) => match patch.to_buf() {
            Ok(buffer) => String::from_utf8_lossy(buffer.as_ref()).into_owned(),
            Err(err) => format!("Patch unavailable: {}", err),
        },
        Ok(None) => "Binary or non-text diff not available.".to_string(),
        Err(err) => format!("Patch unavailable: {}", err),
    }
}

fn image_mime_for_path(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
    {
        Some(ext) if ext == "png" => Some("image/png"),
        Some(ext) if ext == "jpg" || ext == "jpeg" => Some("image/jpeg"),
        Some(ext) if ext == "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn blob_data_url(repo: &Repository, oid: Oid, mime: &str) -> Option<String> {
    if oid.is_zero() {
        return None;
    }

    let blob = repo.find_blob(oid).ok()?;
    let encoded = STANDARD.encode(blob.content());
    Some(format!("data:{};base64,{}", mime, encoded))
}

fn blob_text(repo: &Repository, oid: Oid) -> Option<String> {
    if oid.is_zero() {
        return None;
    }

    let blob = repo.find_blob(oid).ok()?;
    if blob.is_binary() {
        return None;
    }

    Some(String::from_utf8_lossy(blob.content()).into_owned())
}

fn image_data_url_for_diff_file(repo: &Repository, diff_file: &git2::DiffFile<'_>) -> Option<String> {
    let path = diff_file.path()?;
    let mime = image_mime_for_path(path)?;
    blob_data_url(repo, diff_file.id(), mime)
}

fn text_for_diff_file(repo: &Repository, diff_file: &git2::DiffFile<'_>) -> Option<String> {
    blob_text(repo, diff_file.id())
}

#[tauri::command]
fn get_stash_diff(repo_path: String, index: usize) -> Result<StashDiffResponse, ApiError> {
    let mut repo = Repository::open(&repo_path)
        .map_err(|err| ApiError::invalid_repository(&repo_path, &err.to_string()))?;

    let stash_oid = find_stash_oid(&mut repo, index)?;
    let stash_commit = repo
        .find_commit(stash_oid)
        .map_err(|err| ApiError::stash_commit_failed(index, &err.to_string()))?;
    let parent_commit = stash_commit
        .parent(0)
        .map_err(|err| ApiError::stash_parent_failed(index, &err.to_string()))?;

    let stash_tree = stash_commit
        .tree()
        .map_err(|err| ApiError::stash_tree_failed(index, &err.to_string()))?;
    let parent_tree = parent_commit
        .tree()
        .map_err(|err| ApiError::stash_tree_failed(index, &err.to_string()))?;

    let diff = repo
        .diff_tree_to_tree(Some(&parent_tree), Some(&stash_tree), None)
        .map_err(|err| ApiError::stash_diff_failed(index, &err.to_string()))?;

    let files = diff
        .deltas()
        .enumerate()
        .map(|(delta_index, delta)| {
            let old_file = delta.old_file();
            let new_file = delta.new_file();

            StashDiffFile {
                path: diff_path(&delta),
                status: status_to_string(delta.status()),
                patch: diff_patch_text(&diff, delta_index),
                original_text: text_for_diff_file(&repo, &old_file),
                modified_text: text_for_diff_file(&repo, &new_file),
                original_image_data_url: image_data_url_for_diff_file(&repo, &old_file),
                modified_image_data_url: image_data_url_for_diff_file(&repo, &new_file),
            }
        })
        .collect();

    Ok(StashDiffResponse { files })
}

#[tauri::command]
fn pick_repo_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_available_drives() -> Vec<String> {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\", letter as char);
        if Path::new(&drive).exists() {
            drives.push(drive);
        }
    }
    drives
}

fn should_skip_folder(folder_name_lower: &str) -> bool {
    matches!(
        folder_name_lower,
        "$recycle.bin"
            | "system volume information"
            | "windows"
            | "program files"
            | "program files (x86)"
            | "programdata"
            | "recovery"
    )
}

#[tauri::command]
fn search_drive_folders(drive: String, query: String, limit: Option<usize>) -> Vec<String> {
    let normalized_query = query.trim().to_ascii_lowercase();
    if normalized_query.is_empty() {
        return Vec::new();
    }

    let max_results = limit.unwrap_or(20).clamp(1, 50);
    let root = Path::new(&drive);
    if !root.exists() || !root.is_dir() {
        return Vec::new();
    }

    const MAX_DEPTH: usize = 7;
    const MAX_SCANNED_FOLDERS: usize = 15_000;

    let mut results = Vec::new();
    let mut queue = VecDeque::new();
    let mut scanned_folders = 0usize;

    queue.push_back((root.to_path_buf(), 0usize));

    while let Some((current_dir, depth)) = queue.pop_front() {
        if scanned_folders >= MAX_SCANNED_FOLDERS || results.len() >= max_results {
            break;
        }

        let entries = match std::fs::read_dir(&current_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            if scanned_folders >= MAX_SCANNED_FOLDERS || results.len() >= max_results {
                break;
            }

            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if !file_type.is_dir() {
                continue;
            }

            scanned_folders += 1;

            let folder_name = entry.file_name().to_string_lossy().to_string();
            let folder_name_lower = folder_name.to_ascii_lowercase();
            let path = entry.path();

            if folder_name_lower.contains(&normalized_query) {
                results.push(path.to_string_lossy().to_string());
            }

            if depth + 1 <= MAX_DEPTH && !should_skip_folder(&folder_name_lower) {
                queue.push_back((path, depth + 1));
            }
        }
    }

    results
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_fullscreen(false);
                let _ = window.unmaximize();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_stashes,
            get_stash_diff,
            pick_repo_folder,
            list_available_drives,
            search_drive_folders
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
