import { invoke } from "@tauri-apps/api/core";

export type StashEntry = {
  index: number;
  message: string;
  commit: string;
};

export type StashDiffFile = {
  path: string;
  status: string;
  patch: string;
  originalText: string | null;
  modifiedText: string | null;
  originalImageDataUrl: string | null;
  modifiedImageDataUrl: string | null;
};

export type StashDiffResponse = {
  files: StashDiffFile[];
};

type BackendError = {
  code: string;
  message: string;
};

export class GitApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitApiError";
    this.code = code;
  }
}

function isBackendError(value: unknown): value is BackendError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeError = value as Record<string, unknown>;
  return (
    typeof maybeError.code === "string" && typeof maybeError.message === "string"
  );
}

function extractBackendError(value: unknown): BackendError | null {
  if (isBackendError(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeError = value as Record<string, unknown>;
  if (isBackendError(maybeError.error)) {
    return maybeError.error;
  }

  return null;
}

function normalizeInvokeError(error: unknown): GitApiError {
  const backendError = extractBackendError(error);
  if (backendError) {
    return new GitApiError(backendError.code, backendError.message);
  }

  if (error instanceof Error) {
    return new GitApiError("UNKNOWN", error.message);
  }

  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as unknown;
      const parsedError = extractBackendError(parsed);
      if (parsedError) {
        return new GitApiError(parsedError.code, parsedError.message);
      }
    } catch {
      // Fall back to the raw string message.
    }
    return new GitApiError("UNKNOWN", error);
  }

  return new GitApiError("UNKNOWN", "Unexpected error while listing stashes.");
}

export async function listStashes(repoPath: string): Promise<StashEntry[]> {
  try {
    return await invoke<StashEntry[]>("list_stashes", { repoPath });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function getStashDiff(
  repoPath: string,
  index: number,
): Promise<StashDiffResponse> {
  try {
    return await invoke<StashDiffResponse>("get_stash_diff", { repoPath, index });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function pickRepoFolder(): Promise<string | null> {
  try {
    return await invoke<string | null>("pick_repo_folder");
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function listAvailableDrives(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_available_drives");
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}

export async function searchDriveFolders(
  drive: string,
  query: string,
  limit = 20,
): Promise<string[]> {
  try {
    return await invoke<string[]>("search_drive_folders", { drive, query, limit });
  } catch (error) {
    throw normalizeInvokeError(error);
  }
}
