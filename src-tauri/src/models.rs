use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub commit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashDiffResponse {
    pub files: Vec<StashDiffFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashDiffFile {
    pub path: String,
    pub status: String,
    pub patch: String,
    pub original_text: Option<String>,
    pub modified_text: Option<String>,
    pub original_image_data_url: Option<String>,
    pub modified_image_data_url: Option<String>,
}

impl ApiError {
    pub fn invalid_repository(repo_path: &str, details: &str) -> Self {
        Self {
            code: "INVALID_REPOSITORY".to_string(),
            message: format!(
                "Could not open repository at '{}': {}",
                repo_path, details
            ),
        }
    }

    pub fn stash_list_failed(details: &str) -> Self {
        Self {
            code: "STASH_LIST_FAILED".to_string(),
            message: format!("Could not list stashes: {}", details),
        }
    }

    pub fn stash_not_found(index: usize) -> Self {
        Self {
            code: "STASH_NOT_FOUND".to_string(),
            message: format!("No stash found at index {}.", index),
        }
    }

    pub fn stash_commit_failed(index: usize, details: &str) -> Self {
        Self {
            code: "STASH_COMMIT_FAILED".to_string(),
            message: format!(
                "Could not resolve stash commit for index {}: {}",
                index, details
            ),
        }
    }

    pub fn stash_parent_failed(index: usize, details: &str) -> Self {
        Self {
            code: "STASH_PARENT_FAILED".to_string(),
            message: format!(
                "Could not resolve parent commit for stash index {}: {}",
                index, details
            ),
        }
    }

    pub fn stash_tree_failed(index: usize, details: &str) -> Self {
        Self {
            code: "STASH_TREE_FAILED".to_string(),
            message: format!("Could not load trees for stash index {}: {}", index, details),
        }
    }

    pub fn stash_diff_failed(index: usize, details: &str) -> Self {
        Self {
            code: "STASH_DIFF_FAILED".to_string(),
            message: format!("Could not build diff for stash index {}: {}", index, details),
        }
    }
}
