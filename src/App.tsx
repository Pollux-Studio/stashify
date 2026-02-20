import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getStashDiff,
  GitApiError,
  listAvailableDrives,
  pickRepoFolder,
  searchDriveFolders,
  StashDiffFile,
  StashEntry,
  listStashes,
} from "./api/git";
import { cn } from "./lib/utils";
import { PatchViewer } from "./components/PatchViewer";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import {
  Copy,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderGit2,
  FolderOpen,
  GripVertical,
  HardDrive,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Square,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "./index.css";

type FileTreeNode = {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: Record<string, FileTreeNode>;
};

type StashChangeSummary = {
  total: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  other: number;
};

function buildFileTree(files: StashDiffFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    kind: "dir",
    children: {},
  };

  for (const file of files) {
    const segments = file.path.split(/[\\/]/).filter((part) => part.length > 0);
    if (segments.length === 0) {
      continue;
    }

    let current = root;
    let currentPath = "";

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!current.children[segment]) {
        current.children[segment] = {
          name: segment,
          path: isFile ? file.path : currentPath,
          kind: isFile ? "file" : "dir",
          children: {},
        };
      }

      current = current.children[segment];
    }
  }

  return root;
}

function sortedChildren(node: FileTreeNode): FileTreeNode[] {
  return Object.values(node.children).sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

const SAVED_REPOS_KEY = "stashify.savedRepos";
const THEME_KEY = "stashify.theme";
type ThemeMode = "light" | "dark";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }
  } catch {
    // Ignore local storage read failures and use system preference fallback.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
type StashErrorCardCopy = {
  title: string;
  description: string;
  hint: string;
  showRepoPath: boolean;
};

function summarizeDiffFiles(files: StashDiffFile[]): StashChangeSummary {
  const summary: StashChangeSummary = {
    total: files.length,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    other: 0,
  };

  for (const file of files) {
    const normalizedStatus = file.status.trim().toLowerCase();
    if (normalizedStatus === "added" || normalizedStatus === "new") {
      summary.added += 1;
    } else if (normalizedStatus === "modified") {
      summary.modified += 1;
    } else if (normalizedStatus === "deleted" || normalizedStatus === "removed") {
      summary.deleted += 1;
    } else if (normalizedStatus === "renamed") {
      summary.renamed += 1;
    } else {
      summary.other += 1;
    }
  }

  return summary;
}

function statusBadgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "modified") {
    return "bg-blue-600 text-white border-transparent hover:bg-blue-600";
  }
  if (normalized === "added" || normalized === "new") {
    return "bg-emerald-600 text-white border-transparent hover:bg-emerald-600";
  }
  if (normalized === "deleted" || normalized === "removed") {
    return "bg-red-600 text-white border-transparent hover:bg-red-600";
  }
  if (normalized === "renamed") {
    return "bg-amber-600 text-white border-transparent hover:bg-amber-600";
  }
  return "bg-slate-600 text-white border-transparent hover:bg-slate-600";
}

function formatRepoLabel(repoPath: string): string {
  const normalized = repoPath.replace(/\\/g, "/").trim();
  if (!normalized) {
    return repoPath;
  }

  const windowsMatch = normalized.match(/^([A-Za-z]:)(?:\/(.*))?$/);
  if (windowsMatch) {
    const drive = windowsMatch[1];
    const parts = (windowsMatch[2] ?? "").split("/").filter(Boolean);
    if (parts.length === 0) {
      return `${drive}/`;
    }
    if (parts.length === 1) {
      return `${drive}/${parts[0]}`;
    }
    return `${drive}/${parts[0]}/...`;
  }

  if (normalized.startsWith("/")) {
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0) {
      return "/";
    }
    if (parts.length === 1) {
      return `/${parts[0]}`;
    }
    return `/${parts[0]}/...`;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return normalized;
  }
  return `${parts[0]}/...`;
}

function buildStashErrorCardCopy(errorMessage: string, repoPath: string | null): StashErrorCardCopy {
  const normalizedError = errorMessage.toLowerCase();
  const isInvalidRepo =
    normalizedError.includes("could not open repository") ||
    normalizedError.includes("could not find repository") ||
    normalizedError.includes("not a git repository") ||
    normalizedError.includes("code=notfound");

  if (isInvalidRepo) {
    return {
      title: "This folder is not a Git repository",
      description:
        "Stashify could not find a valid .git repository here, so stash entries cannot be loaded.",
      hint: "Select your project root folder (not node_modules or nested subfolders), then reload.",
      showRepoPath: Boolean(repoPath),
    };
  }

  return {
    title: "Could not load stash list",
    description: "Stashify hit an error while reading stashes for the selected folder.",
    hint: "Check folder access and repository health, then try reloading.",
    showRepoPath: Boolean(repoPath),
  };
}

function App() {
  const runningInTauri = isTauri();
  const [repoInput, setRepoInput] = useState("");
  const [savedRepos, setSavedRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [reposHydrated, setReposHydrated] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [stashError, setStashError] = useState("");
  const [stashLoading, setStashLoading] = useState(false);
  const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(
    null,
  );
  const [diffFiles, setDiffFiles] = useState<StashDiffFile[]>([]);
  const [selectedDiffPath, setSelectedDiffPath] = useState("");
  const [diffError, setDiffError] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedStashIndex, setExpandedStashIndex] = useState<number | null>(null);
  const [stashManagerVisible, setStashManagerVisible] = useState(true);
  const [stashSummaries, setStashSummaries] = useState<Record<number, StashChangeSummary>>({});
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme());
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [driveOptions, setDriveOptions] = useState<string[]>([]);
  const [driveOptionsLoading, setDriveOptionsLoading] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [driveMenuOpen, setDriveMenuOpen] = useState(false);
  const [driveSuggestions, setDriveSuggestions] = useState<string[]>([]);
  const [driveSearchLoading, setDriveSearchLoading] = useState(false);
  const [driveSearchError, setDriveSearchError] = useState("");
  const [draggingRepo, setDraggingRepo] = useState<string | null>(null);
  const [dragOverRepo, setDragOverRepo] = useState<string | null>(null);
  const repoInputRef = useRef<HTMLInputElement | null>(null);
  const driveMenuRef = useRef<HTMLDivElement | null>(null);
  const stashRequestIdRef = useRef(0);
  const diffRequestIdRef = useRef(0);
  const driveSearchRequestIdRef = useRef(0);
  const repoSearchTerm = useMemo(() => {
    return repoInput.trim().split(/[\\/]/).filter(Boolean).pop() ?? "";
  }, [repoInput]);
  const stashErrorCopy = useMemo(
    () => (stashError ? buildStashErrorCardCopy(stashError, selectedRepo) : null),
    [stashError, selectedRepo],
  );

  function readErrorMessage(err: unknown): string {
    if (err instanceof GitApiError) {
      return err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return "Request failed.";
  }

  function resetDiffState() {
    setSelectedStashIndex(null);
    setDiffFiles([]);
    setSelectedDiffPath("");
    setDiffError("");
    setDiffLoading(false);
    setExpandedFolders(new Set());
    setExpandedStashIndex(null);
    setStashManagerVisible(true);
  }

  async function loadStashesForRepo(repoPath: string) {
    const requestId = stashRequestIdRef.current + 1;
    stashRequestIdRef.current = requestId;

    setStashLoading(true);
    setStashError("");
    setStashSummaries({});
    resetDiffState();

    try {
      const data = await listStashes(repoPath);
      if (requestId !== stashRequestIdRef.current) {
        return;
      }
      setStashes(data);
    } catch (err) {
      if (requestId !== stashRequestIdRef.current) {
        return;
      }
      setStashes([]);
      setStashError(readErrorMessage(err));
    } finally {
      if (requestId === stashRequestIdRef.current) {
        setStashLoading(false);
      }
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_REPOS_KEY);
    if (!raw) {
      setReposHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setReposHydrated(true);
        return;
      }

      const validRepos = parsed.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      setSavedRepos(validRepos);

      if (validRepos.length > 0) {
        const firstRepo = validRepos[0];
        setSelectedRepo(firstRepo);
        void loadStashesForRepo(firstRepo);
      }
    } catch {
      // Ignore invalid local storage payloads.
    } finally {
      setReposHydrated(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore local storage write failures to avoid breaking theme toggling.
    }
  }, [theme]);

  useEffect(() => {
    if (!runningInTauri) {
      return;
    }

    let disposed = false;
    const loadDriveOptions = async () => {
      setDriveOptionsLoading(true);
      try {
        const drives = await listAvailableDrives();
        if (disposed) {
          return;
        }
        setDriveOptions(drives);
        if (drives.length > 0) {
          setSelectedDrive((current) => current || drives[0]);
        }
      } catch (err) {
        if (disposed) {
          return;
        }
        setDriveOptions([]);
        setSelectedDrive("");
        setDriveSearchError(readErrorMessage(err));
      } finally {
        if (!disposed) {
          setDriveOptionsLoading(false);
        }
      }
    };

    void loadDriveOptions();
    return () => {
      disposed = true;
    };
  }, [runningInTauri]);

  useEffect(() => {
    if (!runningInTauri) {
      return;
    }

    const query = repoSearchTerm;
    if (query.length < 2 || !selectedDrive) {
      setDriveSuggestions([]);
      setDriveSearchLoading(false);
      setDriveSearchError("");
      return;
    }

    const requestId = driveSearchRequestIdRef.current + 1;
    driveSearchRequestIdRef.current = requestId;
    setDriveSearchLoading(true);
    setDriveSearchError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const matches = await searchDriveFolders(selectedDrive, query, 24);
        if (requestId !== driveSearchRequestIdRef.current) {
          return;
        }
        setDriveSuggestions(matches);
      } catch (err) {
        if (requestId !== driveSearchRequestIdRef.current) {
          return;
        }
        setDriveSuggestions([]);
        setDriveSearchError(readErrorMessage(err));
      } finally {
        if (requestId === driveSearchRequestIdRef.current) {
          setDriveSearchLoading(false);
        }
      }
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [runningInTauri, selectedDrive, repoSearchTerm]);

  useEffect(() => {
    if (!driveMenuOpen) {
      return;
    }

    function onWindowMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || !driveMenuRef.current) {
        return;
      }
      if (!driveMenuRef.current.contains(target)) {
        setDriveMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onWindowMouseDown);
    return () => window.removeEventListener("mousedown", onWindowMouseDown);
  }, [driveMenuOpen]);

  useEffect(() => {
    function blockContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    window.addEventListener("contextmenu", blockContextMenu);
    return () => window.removeEventListener("contextmenu", blockContextMenu);
  }, []);

  useEffect(() => {
    if (!runningInTauri) {
      return;
    }

    const appWindow = getCurrentWindow();
    const syncMaximizeState = async () => {
      try {
        setWindowMaximized(await appWindow.isMaximized());
      } catch {
        // Ignore desktop window API failures.
      }
    };

    void syncMaximizeState();
    return;
  }, [runningInTauri]);

  async function minimizeWindow() {
    if (!runningInTauri) {
      return;
    }
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Ignore desktop window API failures.
    }
  }

  async function toggleWindowMaximize() {
    if (!runningInTauri) {
      return;
    }
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      setWindowMaximized(await appWindow.isMaximized());
    } catch {
      // Ignore desktop window API failures.
    }
  }

  async function closeWindow() {
    if (!runningInTauri) {
      return;
    }
    try {
      await getCurrentWindow().close();
    } catch {
      // Ignore desktop window API failures.
    }
  }

  function onTitlebarMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (!runningInTauri || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, a, [data-no-drag]")) {
      return;
    }

    void getCurrentWindow().startDragging().catch(() => {
      // Ignore desktop window API failures.
    });
  }

  function toggleThemeMode() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    if (!reposHydrated) {
      return;
    }
    localStorage.setItem(SAVED_REPOS_KEY, JSON.stringify(savedRepos));
  }, [savedRepos, reposHydrated]);

  function onAddRepo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = repoInput.trim();
    if (!trimmed) {
      return;
    }

    addOrSelectRepo(trimmed);
    setRepoInput("");
  }

  function addOrSelectRepo(repoPath: string) {
    const trimmed = repoPath.trim();
    if (!trimmed) {
      return;
    }

    setSavedRepos((current) =>
      current.includes(trimmed) ? current : [trimmed, ...current],
    );
    setSelectedRepo(trimmed);
    setDriveSuggestions([]);
    setDriveSearchError("");
    void loadStashesForRepo(trimmed);
  }

  async function onBrowseRepoFolder() {
    if (!runningInTauri) {
      return;
    }

    try {
      const pickedPath = await pickRepoFolder();
      if (!pickedPath) {
        return;
      }
      addOrSelectRepo(pickedPath);
      setRepoInput("");
    } catch {
      // Ignore picker failures and keep manual input available.
    }
  }

  function onSelectRepo(repoPath: string) {
    setSelectedRepo(repoPath);
    void loadStashesForRepo(repoPath);
  }

  function reloadSelectedRepo() {
    if (!selectedRepo) {
      return;
    }
    void loadStashesForRepo(selectedRepo);
  }

  function onRemoveRepo(repoPath: string) {
    setSavedRepos((current) => current.filter((repo) => repo !== repoPath));

    if (selectedRepo === repoPath) {
      setSelectedRepo(null);
      setStashes([]);
      setStashError("");
      resetDiffState();
    }
  }

  function onReloadRepo(repoPath: string) {
    setSelectedRepo(repoPath);
    void loadStashesForRepo(repoPath);
  }

  function reorderSavedRepos(sourceRepoPath: string, targetRepoPath: string) {
    if (sourceRepoPath === targetRepoPath) {
      return;
    }

    setSavedRepos((current) => {
      const sourceIndex = current.indexOf(sourceRepoPath);
      const targetIndex = current.indexOf(targetRepoPath);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const next = [...current];
      const [movedRepo] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedRepo);
      return next;
    });
  }

  function onSavedRepoHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    repoPath: string,
  ) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setDraggingRepo(repoPath);
    setDragOverRepo(repoPath);
  }

  function onSavedRepoRowPointerEnter(repoPath: string) {
    if (!draggingRepo) {
      return;
    }
    setDragOverRepo(repoPath);
  }

  function onSavedRepoRowPointerLeave(repoPath: string) {
    setDragOverRepo((current) => (current === repoPath ? null : current));
  }

  useEffect(() => {
    if (!draggingRepo) {
      return;
    }

    const stopDragging = () => {
      if (dragOverRepo && dragOverRepo !== draggingRepo) {
        reorderSavedRepos(draggingRepo, dragOverRepo);
      }
      setDraggingRepo(null);
      setDragOverRepo(null);
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      window.removeEventListener("blur", stopDragging);
    };
  }, [draggingRepo, dragOverRepo]);

  async function loadDiff(index: number) {
    if (!selectedRepo) {
      setDiffError("Select a repository first.");
      return;
    }

    const requestId = diffRequestIdRef.current + 1;
    diffRequestIdRef.current = requestId;

    setSelectedStashIndex(index);
    setDiffLoading(true);
    setDiffError("");
    setDiffFiles([]);
    setSelectedDiffPath("");

    try {
      const response = await getStashDiff(selectedRepo, index);
      if (requestId !== diffRequestIdRef.current) {
        return;
      }
      setDiffFiles(response.files);
      setStashSummaries((current) => ({
        ...current,
        [index]: summarizeDiffFiles(response.files),
      }));
      if (response.files.length > 0) {
        setSelectedDiffPath(response.files[0].path);
      }
    } catch (err) {
      if (requestId !== diffRequestIdRef.current) {
        return;
      }
      setDiffError(readErrorMessage(err));
    } finally {
      if (requestId === diffRequestIdRef.current) {
        setDiffLoading(false);
      }
    }
  }

  const filesByPath = useMemo(() => {
    return new Map(diffFiles.map((file) => [file.path, file]));
  }, [diffFiles]);
  const allFolderPaths = useMemo(() => {
    const directories = new Set<string>();
    for (const file of diffFiles) {
      const parts = file.path.split(/[\\/]/).filter(Boolean);
      let current = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        current = current ? `${current}/${parts[index]}` : parts[index];
        directories.add(current);
      }
    }
    return Array.from(directories);
  }, [diffFiles]);
  const fileTree = useMemo(() => buildFileTree(diffFiles), [diffFiles]);
  const selectedDiffFile =
    filesByPath.get(selectedDiffPath) ?? null;
  const selectedFileName = selectedDiffFile
    ? selectedDiffFile.path.split(/[\\/]/).filter(Boolean).pop() ?? selectedDiffFile.path
    : "Editor";
  const showImageDiff =
    selectedDiffFile !== null &&
    (selectedDiffFile.originalImageDataUrl !== null ||
      selectedDiffFile.modifiedImageDataUrl !== null);
  const imagePreviewSrc = selectedDiffFile
    ? selectedDiffFile.modifiedImageDataUrl ?? selectedDiffFile.originalImageDataUrl
    : null;

  useEffect(() => {
    setImageZoom(1);
  }, [selectedDiffPath]);

  useEffect(() => {
    setExpandedFolders(new Set(allFolderPaths));
  }, [allFolderPaths]);

  function toggleFolder(folderPath: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }

  function expandAllFolders() {
    setExpandedFolders(new Set(allFolderPaths));
  }

  function collapseAllFolders() {
    setExpandedFolders(new Set());
  }

  function onToggleStash(stashIndex: number) {
    setStashManagerVisible(true);
    setExpandedStashIndex((current) => (current === stashIndex ? null : stashIndex));
    if (selectedStashIndex !== stashIndex) {
      void loadDiff(stashIndex);
    }
  }

  useEffect(() => {
    function onGlobalShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (event.key === "F12" || event.key === "F5") {
        event.preventDefault();
        return;
      }

      if (
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        return;
      }

      if (!hasCtrlOrMeta || !event.shiftKey) {
        if (!hasCtrlOrMeta) {
          return;
        }

        if (key === "r" || key === "p" || key === "s" || key === "u") {
          event.preventDefault();
          return;
        }

        if (key === "o" || key === "n" || key === "w" || key === "t") {
          event.preventDefault();
          return;
        }

        if (key === "f" && !isEditableTarget) {
          event.preventDefault();
          return;
        }

        if (key === "=" || key === "+" || key === "-" || key === "0") {
          event.preventDefault();
        }
        return;
      }

      if (key === "i" || key === "j" || key === "c") {
        event.preventDefault();
        return;
      }

      if (key === "a") {
        event.preventDefault();
        repoInputRef.current?.focus();
        return;
      }

      if (key === "r") {
        event.preventDefault();
        reloadSelectedRepo();
        return;
      }

      if (key === "m") {
        event.preventDefault();
        toggleThemeMode();
      }
    }

    window.addEventListener("keydown", onGlobalShortcut, { capture: true });
    return () => window.removeEventListener("keydown", onGlobalShortcut, true);
  }, [selectedRepo]);

  function renderTreeNode(node: FileTreeNode, depth: number): ReactElement {
    if (node.kind === "dir") {
      const children = sortedChildren(node);
      const isExpanded = expandedFolders.has(node.path);
      return (
        <li className="space-y-0" key={`dir-${node.path}`}>
          <div className={cn("relative", depth > 0 && "pl-1.5")}>
            {depth > 0 && (
              <span className="bg-border/80 absolute top-1/2 left-0 h-px w-1 -translate-y-1/2" />
            )}
            <Button
              className="h-6 w-full justify-start gap-1 px-1.5 text-xs"
              onClick={() => toggleFolder(node.path)}
              title={node.path}
              type="button"
              variant="ghost"
            >
              {isExpanded ? (
                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <Folder className="text-muted-foreground size-3.5 shrink-0" />
              )}
              <span className="min-w-0 truncate text-left font-medium">
                {node.name}
              </span>
            </Button>
          </div>
          {isExpanded && children.length > 0 && (
            <ul className="border-border ml-2 space-y-0 border-l pl-1">
              {children.map((child) => renderTreeNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    const file = filesByPath.get(node.path);
    const statusLabel = file?.status ?? "unknown";
    return (
      <li key={`file-${node.path}`}>
        <div className={cn("relative", depth > 0 && "pl-1.5")}>
          {depth > 0 && (
            <span className="bg-border/80 absolute top-1/2 left-0 h-px w-1 -translate-y-1/2" />
          )}
          <Button
            className="h-6 w-full justify-between gap-1.5 px-1.5 text-xs"
            variant={selectedDiffPath === node.path ? "default" : "ghost"}
            type="button"
            onClick={() => setSelectedDiffPath(node.path)}
            title={node.path}
          >
            <span className="flex min-w-0 items-center gap-1">
              <FileCode2
                className={cn(
                  "size-3.5 shrink-0",
                  selectedDiffPath === node.path ? "text-black" : "text-muted-foreground",
                )}
              />
              <span className="truncate text-left">{node.name}</span>
            </span>
            <Badge
              className={cn(
                "h-4 shrink-0 px-1 text-[9px] capitalize",
                statusBadgeClass(statusLabel),
              )}
            >
              {statusLabel}
            </Badge>
          </Button>
        </div>
      </li>
    );
  }

  return (
    <main className="h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full flex-col">
        {runningInTauri && (
          <header
            className="border-border/80 bg-card/95 flex h-10 shrink-0 items-center border-b px-2 select-none"
            onMouseDown={onTitlebarMouseDown}
          >
            <div className="flex min-w-0 items-center gap-2 px-1">
              <img
                alt="Stashify logo"
                className="size-6 rounded-md object-contain"
                src="/app_icon.svg"
              />
              <span className="truncate text-xs font-medium tracking-wide">
                Stashify
              </span>
            </div>
            <div
              className="border-border/70 bg-muted/30 mx-2 h-7 flex-1 rounded-md border"
              data-tauri-drag-region
            />
            <div className="flex items-center gap-1 pr-1" data-no-drag="true">
              <Button
                aria-label="Minimize window"
                className="h-7 w-7"
                onClick={() => void minimizeWindow()}
                size="icon-sm"
                title="Minimize"
                type="button"
                variant="ghost"
              >
                <Minus className="size-4" />
              </Button>
              <Button
                aria-label={windowMaximized ? "Restore window" : "Maximize window"}
                className="h-7 w-7"
                onClick={() => void toggleWindowMaximize()}
                size="icon-sm"
                title={windowMaximized ? "Restore" : "Maximize"}
                type="button"
                variant="ghost"
              >
                {windowMaximized ? (
                  <Copy className="size-3.5" />
                ) : (
                  <Square className="size-3.5" />
                )}
              </Button>
              <Button
                aria-label="Close window"
                className="text-foreground h-7 w-7 hover:bg-red-600/15 hover:text-red-600 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                onClick={() => void closeWindow()}
                size="icon-sm"
                title="Close"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>
          </header>
        )}
        <div className="flex min-h-0 flex-1">
        <aside className="flex h-full w-[24%] min-w-[260px] max-w-[360px] flex-col border-r bg-card/80">
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  alt="Stashify logo"
                  className="size-11 rounded-xl object-contain"
                  src="/stashify_logo.svg"
                />
                <div>
                  <h1 className="text-lg font-semibold leading-none">Stashify</h1>
                  <p className="text-muted-foreground mt-1 text-xs">Workspace Diff Console</p>
                </div>
              </div>

              <Button
                aria-label="Toggle dark mode"
                onClick={toggleThemeMode}
                size="icon"
                type="button"
                variant="outline"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </div>

          <Separator />

          <section className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Saved Folders</h2>
              <Badge variant="outline">{savedRepos.length}</Badge>
            </div>

            <form className="flex gap-2" onSubmit={onAddRepo}>
              <Input
                ref={repoInputRef}
                value={repoInput}
                onChange={(event) => setRepoInput(event.currentTarget.value)}
                placeholder="Search folder or paste the path..."
              />
              <Button
                aria-label="Browse for repository folder"
                disabled={!runningInTauri}
                onClick={() => void onBrowseRepoFolder()}
                size="icon"
                type="button"
              >
                <FolderOpen className="size-4" />
              </Button>
              <Button type="submit" size="icon" aria-label="Save repository">
                <Plus className="size-4" />
              </Button>
            </form>
            {runningInTauri && (
              <div className="space-y-1">
                {driveSearchLoading && repoSearchTerm.length >= 2 && (
                  <p className="text-muted-foreground text-xs" aria-live="polite">
                    Searching folders in {selectedDrive || "selected drive"}...
                  </p>
                )}
                {driveSearchError && (
                  <p className="text-destructive text-xs" role="alert">
                    {driveSearchError}
                  </p>
                )}
                {!driveSearchLoading &&
                  !driveSearchError &&
                  repoSearchTerm.length >= 2 &&
                  driveSuggestions.length === 0 && (
                    <p className="text-muted-foreground text-xs">No folder suggestions.</p>
                  )}
                {driveSuggestions.length > 0 && (
                  <ScrollArea className="h-28 rounded-md border">
                    <ul className="divide-border divide-y">
                      {driveSuggestions.map((suggestionPath) => {
                        const folderName =
                          suggestionPath.split(/[\\/]/).filter(Boolean).pop() ??
                          suggestionPath;
                        return (
                          <li key={suggestionPath}>
                            <button
                              className="hover:bg-muted/60 w-full px-2 py-1.5 text-left transition-colors"
                              onClick={() => {
                                addOrSelectRepo(suggestionPath);
                                setRepoInput("");
                              }}
                              type="button"
                            >
                              <p className="truncate text-xs font-medium">{folderName}</p>
                              <p className="text-muted-foreground truncate text-[11px]">
                                {suggestionPath}
                              </p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            )}

            <ScrollArea className="h-48 pr-2">
              <ul className="space-y-2">
                {savedRepos.map((repo) => (
                  <li
                    className={cn(
                      "flex w-full min-w-0 items-center gap-1 rounded-md transition-colors",
                      draggingRepo === repo && "opacity-70",
                      dragOverRepo === repo &&
                        draggingRepo &&
                        draggingRepo !== repo &&
                        "bg-emerald-500/12 ring-1 ring-emerald-500/35",
                    )}
                    key={repo}
                    onPointerEnter={() => onSavedRepoRowPointerEnter(repo)}
                    onPointerLeave={() => onSavedRepoRowPointerLeave(repo)}
                  >
                    <button
                      aria-label={`Drag to reorder ${repo}`}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/60 h-8 w-8 shrink-0 cursor-grab rounded-md transition-colors active:cursor-grabbing"
                      onPointerDown={(event) => onSavedRepoHandlePointerDown(event, repo)}
                      title="Hold and drag to reorder"
                      type="button"
                    >
                      <GripVertical className="mx-auto size-4" />
                    </button>
                    <Button
                      className="h-auto min-w-0 flex-1 justify-start overflow-hidden py-2 text-left"
                      type="button"
                      variant={selectedRepo === repo ? "default" : "outline"}
                      onClick={() => onSelectRepo(repo)}
                      title={repo}
                    >
                      <FolderGit2 className="size-4 shrink-0" />
                      <span className="block min-w-0 flex-1 truncate text-left">{formatRepoLabel(repo)}</span>
                    </Button>
                    <Button
                      aria-label={`Reload stashes for ${repo}`}
                      className="h-8 w-8 shrink-0 hover:bg-emerald-600/15 hover:text-emerald-700 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-400"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => onReloadRepo(repo)}
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                    <Button
                      aria-label={`Remove ${repo}`}
                      className="h-8 w-8 shrink-0 hover:bg-red-600/15 hover:text-red-700 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                      onClick={() => onRemoveRepo(repo)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {savedRepos.length === 0 && (
                <div className="text-muted-foreground border-border/70 bg-muted/20 mt-2 rounded-lg border border-dashed px-3 py-4 text-center">
                  <FolderGit2 className="mx-auto mb-2 size-5 opacity-70" />
                  <p className="text-sm font-medium">No saved folders</p>
                  <p className="mt-1 text-xs">
                    Paste a local repository path and press <span className="font-semibold">+</span>.
                  </p>
                </div>
              )}
            </ScrollArea>
          </section>

          <Separator />

          <section className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Stash List</h2>
              <Badge variant="secondary">{stashes.length}</Badge>
            </div>
            {selectedRepo && (
              <p className="text-muted-foreground mb-3 truncate text-xs">{selectedRepo}</p>
            )}
            {!selectedRepo && !reposHydrated && (
              <p className="text-muted-foreground mb-3 text-xs">Loading folders...</p>
            )}

            {stashLoading && (
              <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
                Fetching stash list...
              </p>
            )}

            <div className="min-h-0 flex flex-1 flex-col overflow-y-auto pr-2">
              {!selectedRepo && reposHydrated ? (
                <div className="flex min-h-full flex-1 items-center justify-center">
                  <div className="text-muted-foreground border-border/70 bg-muted/20 w-full max-w-xs rounded-lg border border-dashed px-3 py-4 text-center">
                    <FolderGit2 className="mx-auto mb-2 size-5 opacity-70" />
                    <p className="text-sm font-medium">Choose a saved folder</p>
                    <p className="mt-1 text-xs">
                      Select a folder from above to load its stash list.
                    </p>
                  </div>
                </div>
              ) : !stashLoading && stashErrorCopy ? (
                <div className="flex min-h-full flex-1 items-center justify-center">
                  <div
                    className="relative w-full max-w-sm space-y-3 rounded-xl border border-red-500/25 bg-gradient-to-br from-card via-card to-red-500/10 p-3.5"
                    role="alert"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          {stashErrorCopy.title}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {stashErrorCopy.description}
                        </p>
                      </div>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/14 text-red-700 dark:text-red-300">
                        <FolderGit2 className="size-4" />
                      </div>
                    </div>
                    {stashErrorCopy.showRepoPath && selectedRepo && (
                      <div className="rounded-md border border-red-500/30 bg-red-500/12 px-2.5 py-2">
                        <p className="text-[11px] font-medium text-red-700 dark:text-red-300">
                          Selected folder
                        </p>
                        <p className="mt-1 truncate text-xs text-foreground" title={selectedRepo}>
                          {selectedRepo}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-red-700/90 dark:text-red-300/90">{stashErrorCopy.hint}</p>
                    <div className="bg-red-500/20 absolute right-2 bottom-2 h-8 w-24 rounded-full blur-xl" />
                  </div>
                </div>
              ) : !stashLoading && selectedRepo && stashes.length === 0 ? (
                <div className="flex min-h-full flex-1 items-center justify-center">
                  <div className="text-muted-foreground border-border/70 bg-muted/20 w-full max-w-xs rounded-lg border border-dashed px-3 py-4 text-center">
                    <FolderGit2 className="mx-auto mb-2 size-5 opacity-70" />
                    <p className="text-sm font-medium">No stashes found</p>
                    <p className="mt-1 text-xs">This repository currently has no stash entries.</p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {stashes.map((stash) => (
                    <li key={`${stash.index}-${stash.commit}`}>
                      <Card
                        className={cn(
                          "overflow-hidden border transition-colors py-1",
                          selectedStashIndex === stash.index && "border-primary/50",
                        )}
                      >
                        <button
                          className="hover:bg-muted/50 flex h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors"
                          type="button"
                          onClick={() => onToggleStash(stash.index)}
                        >
                          <span className="min-w-0 truncate text-sm font-medium">
                            {stash.index} - {stash.message}
                          </span>
                          {expandedStashIndex === stash.index ? (
                            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                          ) : (
                            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                          )}
                        </button>

                        {expandedStashIndex === stash.index && (
                          <div className="space-y-2 border-t px-3 py-2 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Stash #</span>
                                <span className="font-medium">{stash.index}</span>
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-muted-foreground">Message</span>
                                <span className="max-w-[70%] text-right">{stash.message}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Commit</span>
                                <span className="font-mono">{stash.commit.slice(0, 12)}</span>
                              </div>
                            </div>
                            <Separator />
                            <div className="space-y-1.5">
                              <p className="text-muted-foreground">Changes summary</p>
                              {stashSummaries[stash.index] ? (
                                <div className="grid grid-cols-2 gap-1">
                                  <span>Total: {stashSummaries[stash.index].total}</span>
                                  <span>Modified: {stashSummaries[stash.index].modified}</span>
                                  <span>Added: {stashSummaries[stash.index].added}</span>
                                  <span>Deleted: {stashSummaries[stash.index].deleted}</span>
                                  <span>Renamed: {stashSummaries[stash.index].renamed}</span>
                                  <span>Other: {stashSummaries[stash.index].other}</span>
                                </div>
                              ) : (
                                <p className="text-muted-foreground">
                                  Expand a stash to load and view summary.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>

        {selectedStashIndex !== null && (
          <section
            className={cn(
              "relative shrink-0 overflow-visible border-r bg-background transition-[width,padding] duration-200",
              stashManagerVisible ? "w-[380px] py-4 pr-4 pl-0" : "w-0 p-0",
            )}
          >
            <Button
              aria-label={stashManagerVisible ? "Hide stash manager" : "Show stash manager"}
              className="absolute top-1/2 right-0 z-30 h-7 w-7 -translate-y-1/2 translate-x-1/2 rounded-full"
              onClick={() => setStashManagerVisible((current) => !current)}
              title={stashManagerVisible ? "Hide stash manager" : "Show stash manager"}
              type="button"
              variant="outline"
            >
              {stashManagerVisible ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
            {stashManagerVisible && (
              <Card className="h-full rounded-l-none border-l-0">
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">File Manager</CardTitle>
                    {diffFiles.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          aria-label="Expand all folders"
                          onClick={expandAllFolders}
                          size="icon-sm"
                          title="Expand all"
                          type="button"
                          variant="outline"
                        >
                          <FolderOpen className="size-4" />
                        </Button>
                        <Button
                          aria-label="Collapse all folders"
                          onClick={collapseAllFolders}
                          size="icon-sm"
                          title="Collapse all"
                          type="button"
                          variant="outline"
                        >
                          <Folder className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span>
                      <span className="font-semibold text-blue-600">M</span> - Modified
                    </span>
                    <span>
                      <span className="font-semibold text-emerald-600">A</span> - Added
                    </span>
                    <span>
                      <span className="font-semibold text-red-600">D</span> - Deleted
                    </span>
                    <span>
                      <span className="font-semibold text-amber-600">R</span> - Renamed
                    </span>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-2">
                  {diffLoading && (
                    <p className="text-muted-foreground text-sm" aria-live="polite">
                      Loading changed files...
                    </p>
                  )}
                  {diffError && (
                    <p className="text-destructive text-sm" role="alert">
                      {diffError}
                    </p>
                  )}
                  {!diffLoading && !diffError && diffFiles.length === 0 && (
                    <p className="text-muted-foreground text-sm">No files loaded.</p>
                  )}
                  {!diffLoading && !diffError && diffFiles.length > 0 && (
                    <div className="h-[calc(100vh-220px)] overflow-y-auto overflow-x-hidden pr-1">
                      <ul className="space-y-0">
                        {sortedChildren(fileTree).map((node) => renderTreeNode(node, 0))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        )}

        <section className="relative min-w-0 flex-1 p-2">
          <div className="h-full min-w-0">
            <Card className="h-full min-w-0 gap-0">
              <CardHeader className="pb-3">
                <CardTitle className="truncate text-base">
                  {diffLoading ? "Loading stash diff..." : selectedFileName}
                </CardTitle>
                <CardDescription className="truncate">
                  {diffLoading
                    ? "Preparing changed files and patch view."
                    : selectedDiffFile?.path ?? "No file selected"}
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="flex min-h-0 flex-1 flex-col pt-2">
                {diffLoading ? (
                  <div
                    aria-live="polite"
                    className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border bg-card/40 p-4"
                  >
                    <div className="bg-muted h-6 w-44 animate-pulse rounded-md" />
                    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="bg-muted h-4 w-28 animate-pulse rounded" />
                        <div className="space-y-2">
                          <div className="bg-muted/80 h-3 w-full animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[90%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[84%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[92%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[78%] animate-pulse rounded" />
                        </div>
                      </div>
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="bg-muted h-4 w-28 animate-pulse rounded" />
                        <div className="space-y-2">
                          <div className="bg-muted/80 h-3 w-full animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[86%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[94%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[88%] animate-pulse rounded" />
                          <div className="bg-muted/80 h-3 w-[81%] animate-pulse rounded" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : selectedDiffFile && showImageDiff ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
                      <p className="text-sm font-semibold">Image Preview</p>
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={imageZoom <= 0.25}
                          onClick={() =>
                            setImageZoom((current) =>
                              Math.max(0.25, Number((current - 0.25).toFixed(2))),
                            )
                          }
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <ZoomOut className="size-4" />
                        </Button>
                        <Badge className="w-16 justify-center" variant="secondary">
                          {Math.round(imageZoom * 100)}%
                        </Badge>
                        <Button
                          disabled={imageZoom >= 4}
                          onClick={() =>
                            setImageZoom((current) =>
                              Math.min(4, Number((current + 0.25).toFixed(2))),
                            )
                          }
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <ZoomIn className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[calc(100vh-220px)] rounded-lg border bg-muted/40">
                      <div className="flex min-h-[640px] items-center justify-center p-6">
                        {imagePreviewSrc ? (
                          <img
                            className="max-w-none rounded-md border bg-card object-contain shadow-sm transition-transform duration-150"
                            src={imagePreviewSrc}
                            alt={`Preview ${selectedDiffFile.path}`}
                            style={{ transform: `scale(${imageZoom})`, transformOrigin: "center center" }}
                          />
                        ) : (
                          <p className="text-muted-foreground text-sm">Image preview unavailable.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                ) : selectedDiffFile ? (
                  <PatchViewer
                    patch={selectedDiffFile.patch}
                    filePath={selectedDiffFile.path}
                    originalText={selectedDiffFile.originalText}
                    modifiedText={selectedDiffFile.modifiedText}
                    status={selectedDiffFile.status}
                  />
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed p-5">
                    <div className="w-full max-w-xl space-y-4 text-sm">
                      {runningInTauri && (
                        <img
                          alt="Stashify app icon"
                          className="mx-auto h-14 w-14 object-contain"
                          src="/app_icon.svg"
                        />
                      )}
                      {runningInTauri && (
                        <div className="relative space-y-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/8 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">Project Drive</p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                Choose the drive used for folder suggestions in the sidebar.
                              </p>
                            </div>
                            <div className="border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                              <HardDrive className="size-4" />
                            </div>
                          </div>
                          <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                            <span>Active drive</span>
                            <span className="font-medium text-foreground">
                              {driveOptionsLoading ? "Loading..." : selectedDrive || "Not selected"}
                            </span>
                          </div>
                          <div className="max-w-36">
                            <label className="sr-only" htmlFor="drive-select">
                              Project drive
                            </label>
                            {driveOptionsLoading ? (
                              <div className="space-y-2">
                                <div className="bg-muted h-9 w-full animate-pulse rounded-md border" />
                                <div className="bg-muted/80 h-2 w-20 animate-pulse rounded" />
                              </div>
                            ) : (
                              <div className="relative" ref={driveMenuRef}>
                                <button
                                  aria-expanded={driveMenuOpen}
                                  aria-haspopup="listbox"
                                  className="border-input bg-background/90 ring-offset-background focus-visible:ring-ring flex h-9 w-full items-center justify-between rounded-md border px-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                  id="drive-select"
                                  onClick={() => setDriveMenuOpen((current) => !current)}
                                  type="button"
                                >
                                  <span className="truncate">{selectedDrive || "No drives found"}</span>
                                  <ChevronDown
                                    className={cn(
                                      "text-muted-foreground size-4 shrink-0 transition-transform",
                                      driveMenuOpen && "rotate-180",
                                    )}
                                  />
                                </button>
                                {driveMenuOpen && driveOptions.length > 0 && (
                                  <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
                                    <ScrollArea className="max-h-36">
                                      <ul className="divide-border divide-y" role="listbox">
                                        {driveOptions.map((drive) => (
                                          <li key={drive}>
                                            <button
                                              className={cn(
                                                "hover:bg-muted/60 w-full px-2 py-1.5 text-left text-sm transition-colors",
                                                selectedDrive === drive && "bg-muted/70 font-medium",
                                              )}
                                              onClick={() => {
                                                setSelectedDrive(drive);
                                                setDriveMenuOpen(false);
                                              }}
                                              role="option"
                                              type="button"
                                            >
                                              {drive}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    </ScrollArea>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="bg-emerald-500/20 absolute right-2 bottom-2 h-8 w-24 rounded-full blur-xl" />
                          {driveSearchError && (
                            <p className="text-destructive text-xs" role="alert">
                              {driveSearchError}
                            </p>
                          )}
                        </div>
                      )}
                      <p className="font-medium">Shortcuts</p>
                      <ul className="space-y-2">
                        <li className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Add folder</span>
                          <kbd className="bg-muted text-muted-foreground rounded border px-2 py-1 text-xs font-medium">
                            Ctrl/Cmd + Shift + A
                          </kbd>
                        </li>
                        <li className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            Reload selected folder stash list
                          </span>
                          <kbd className="bg-muted text-muted-foreground rounded border px-2 py-1 text-xs font-medium">
                            Ctrl/Cmd + Shift + R
                          </kbd>
                        </li>
                        <li className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Mode switch</span>
                          <kbd className="bg-muted text-muted-foreground rounded border px-2 py-1 text-xs font-medium">
                            Ctrl/Cmd + Shift + M
                          </kbd>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
      </div>
    </main>
  );
}

export default App;
