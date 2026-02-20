"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const features = [
  {
    title: "Monaco Diff Review",
    description:
      "Click any stash and open it in Monaco to compare original and modified code with a clean side-by-side diff.",
    tag: "Clarity",
  },
  {
    title: "Repo and Folder Add",
    description:
      "Add repositories or folders once, keep them saved, and switch projects quickly without typing paths again.",
    tag: "Speed",
  },
  {
    title: "Drive Search + Image Viewer",
    description:
      "Find project folders with drive search and preview image changes directly when the stash includes assets.",
    tag: "Insight",
  },
];

const workflow = [
  {
    step: "01",
    title: "Add Repo or Folder",
    description:
      "Select a repository/folder and save it in the sidebar so you can reopen it instantly.",
  },
  {
    step: "02",
    title: "Open Saved Stashes",
    description:
      "Choose the project and browse its saved stash entries with clear status context.",
  },
  {
    step: "03",
    title: "Inspect in Monaco",
    description:
      "Click a stash to load original vs modified changes in Monaco, including image previews when available.",
  },
];

const numbers = [
  { label: "Project Inputs", value: "Repo + Folder" },
  { label: "Diff Engine", value: "Monaco Editor" },
  { label: "Search Support", value: "Drive Aware" },
];

type ScenarioMode = "diff" | "image" | "drive";

type ScenarioFile = {
  status: "A" | "M" | "R" | "D";
  path: string;
};

type StashScenario = {
  label: string;
  ref: number;
  status: string;
  repoPath: string;
  stashes: string[];
  files: ScenarioFile[];
  selectedFile: string;
  mode: ScenarioMode;
  originalSnippet?: string[];
  modifiedSnippet?: string[];
  driveQuery?: string;
  driveResults?: string[];
};

const stashScenarios: StashScenario[] = [
  {
    label: "Monaco Diff",
    ref: 3,
    status: "Loaded in editor",
    repoPath: "D:/Workspace/stashify-app",
    stashes: [
      "stash@{4}: WIP on feat/drive-search",
      "stash@{3}: WIP on feat/patch-viewer",
      "stash@{2}: WIP on feat/theme",
    ],
    files: [
      { status: "A", path: "src/components/PatchViewer.tsx" },
      { status: "M", path: "src/components/SidebarStashList.tsx" },
      { status: "M", path: "src/App.tsx" },
      { status: "R", path: "src/components/OldViewer.tsx -> src/components/ImageViewer.tsx" },
    ],
    selectedFile: "src/components/PatchViewer.tsx",
    mode: "diff",
    originalSnippet: [
      "function isAddedStatus(status: string): boolean {",
      "  const normalized = status.trim().toLowerCase();",
      "  return normalized === 'added';",
      "}",
      "",
      "diffEditorRef.current = monaco.editor.createDiffEditor(...)",
    ],
    modifiedSnippet: [
      "function isAddedStatus(status: string): boolean {",
      "  const normalized = status.trim().toLowerCase();",
      "  return normalized === 'added' || normalized === 'new';",
      "}",
      "",
      "singleEditorRef.current = monaco.editor.create(...)",
    ],
  },
  {
    label: "Image Stash",
    ref: 7,
    status: "Image preview ready",
    repoPath: "D:/Workspace/stashify-designs",
    stashes: [
      "stash@{8}: WIP on feat/image-compare",
      "stash@{7}: WIP on feat/asset-preview",
      "stash@{6}: WIP on feat/sidebar-refresh",
    ],
    files: [
      { status: "M", path: "assets/mockups/dashboard-before.png" },
      { status: "M", path: "assets/mockups/dashboard-after.png" },
      { status: "M", path: "src/components/ImageViewer.tsx" },
    ],
    selectedFile: "assets/mockups/dashboard-after.png",
    mode: "image",
  },
  {
    label: "Drive Search",
    ref: 11,
    status: "Folder resolved",
    repoPath: "D:/",
    stashes: [
      "stash@{12}: WIP on feat/drive-selector",
      "stash@{11}: WIP on feat/repo-search",
      "stash@{10}: WIP on feat/folder-picker",
    ],
    files: [
      { status: "A", path: "src/components/DriveSelector.tsx" },
      { status: "M", path: "src/components/ProjectSearchInput.tsx" },
      { status: "M", path: "src/App.tsx" },
    ],
    selectedFile: "src/components/ProjectSearchInput.tsx",
    mode: "drive",
    driveQuery: "stash",
    driveResults: [
      "D:/Workspace/stashify-app",
      "D:/Workspace/stashify-server",
      "D:/Workspace/stashify-dashboard",
    ],
  },
];

const faqItems = [
  {
    question: "Can I compare original and modified code before restore?",
    answer:
      "Yes. Clicking a stash opens Monaco diff view so you can review original vs modified content clearly.",
  },
  {
    question: "Can I add both repositories and plain folders?",
    answer:
      "Yes. Stashify supports adding repo/folder paths, saving them, and switching quickly from the sidebar.",
  },
  {
    question: "Does Stashify include image preview and drive search?",
    answer:
      "Yes. You can preview image-based stash changes and use drive search to locate project folders faster.",
  },
];

type Cell = {
  x: number;
  y: number;
};

type Direction = "up" | "down" | "left" | "right";

const BOARD_SIZE = 12;
const CONFLICT_COUNT = 10;
const GAME_TICK_MS = 460;
const DOWNLOAD_URL =
  "https://github.com/Pollux-Studio/stashify/releases/download/v0.1.0/Stashify_0.1.0_x64-setup.exe";
const INITIAL_SNAKE: Cell[] = [
  { x: 4, y: 6 },
  { x: 3, y: 6 },
  { x: 2, y: 6 },
];

const DIRECTION_STEPS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const toCellKey = (cell: Cell) => `${cell.x}:${cell.y}`;
const isSameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

const isReverseDirection = (current: Direction, next: Direction) =>
  (current === "up" && next === "down") ||
  (current === "down" && next === "up") ||
  (current === "left" && next === "right") ||
  (current === "right" && next === "left");

function pickRandomEmptyCell(snakeCells: Cell[], conflicts: Cell[]): Cell | null {
  const occupied = new Set([
    ...snakeCells.map((cell) => toCellKey(cell)),
    ...conflicts.map((cell) => toCellKey(cell)),
  ]);
  const available: Cell[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const candidate = { x, y };
      if (!occupied.has(toCellKey(candidate))) {
        available.push(candidate);
      }
    }
  }

  if (available.length === 0) {
    return null;
  }

  return available[Math.floor(Math.random() * available.length)];
}

function createConflicts(snakeCells: Cell[]): Cell[] {
  const nextConflicts: Cell[] = [];
  const snakeCellKeys = new Set(snakeCells.map((cell) => toCellKey(cell)));

  while (nextConflicts.length < CONFLICT_COUNT) {
    const candidate = {
      x: Math.floor(Math.random() * BOARD_SIZE),
      y: Math.floor(Math.random() * BOARD_SIZE),
    };
    const candidateKey = toCellKey(candidate);
    const hasConflict = nextConflicts.some((cell) => isSameCell(cell, candidate));

    if (!snakeCellKeys.has(candidateKey) && !hasConflict) {
      nextConflicts.push(candidate);
    }
  }

  return nextConflicts;
}

function createInitialGitSnakeState() {
  const snake = INITIAL_SNAKE.map((cell) => ({ ...cell }));
  const conflicts = createConflicts(snake);
  const commit = pickRandomEmptyCell(snake, conflicts) ?? { x: 9, y: 6 };

  return { snake, conflicts, commit };
}

function WindowsGlyph() {
  return (
    <span aria-hidden className="grid h-3.5 w-3.5 grid-cols-2 gap-[1px]">
      <span className="rounded-[1px] bg-current" />
      <span className="rounded-[1px] bg-current" />
      <span className="rounded-[1px] bg-current" />
      <span className="rounded-[1px] bg-current" />
    </span>
  );
}

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeScenarioIndex, setActiveScenarioIndex] = useState(0);
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(true);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [initialGitSnakeState] = useState(() => createInitialGitSnakeState());
  const [gitSnake, setGitSnake] = useState<Cell[]>(() => initialGitSnakeState.snake);
  const [gitDirection, setGitDirection] = useState<Direction>("right");
  const [commitCell, setCommitCell] = useState<Cell>(() => initialGitSnakeState.commit);
  const [conflictCells, setConflictCells] = useState<Cell[]>(() => initialGitSnakeState.conflicts);
  const [stashScore, setStashScore] = useState(0);
  const [bestStashScore, setBestStashScore] = useState(0);
  const [snakeState, setSnakeState] = useState<"idle" | "running" | "over">("idle");

  const activeScenario = stashScenarios[activeScenarioIndex];
  const boardCells = useMemo(
    () =>
      Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
        x: index % BOARD_SIZE,
        y: Math.floor(index / BOARD_SIZE),
      })),
    [],
  );
  const snakeHeadKey = gitSnake[0] ? toCellKey(gitSnake[0]) : "";
  const snakeKeys = useMemo(() => new Set(gitSnake.map((cell) => toCellKey(cell))), [gitSnake]);
  const conflictKeys = useMemo(
    () => new Set(conflictCells.map((cell) => toCellKey(cell))),
    [conflictCells],
  );
  const commitKey = toCellKey(commitCell);

  const setupGitSnake = useCallback(() => {
    const nextSnake = INITIAL_SNAKE.map((cell) => ({ ...cell }));
    const nextConflicts = createConflicts(nextSnake);
    const nextCommit = pickRandomEmptyCell(nextSnake, nextConflicts) ?? { x: 9, y: 6 };

    setGitSnake(nextSnake);
    setGitDirection("right");
    setConflictCells(nextConflicts);
    setCommitCell(nextCommit);
    setStashScore(0);
    setSnakeState("idle");
  }, []);

  const handleDirectionChange = useCallback(
    (nextDirection: Direction) => {
      setGitDirection((currentDirection) =>
        isReverseDirection(currentDirection, nextDirection) ? currentDirection : nextDirection,
      );

      if (snakeState === "idle") {
        setSnakeState("running");
      }
    },
    [snakeState],
  );

  const toggleSnakeState = useCallback(() => {
    if (snakeState === "over") {
      setupGitSnake();
      setSnakeState("running");
      return;
    }

    setSnakeState((current) => (current === "running" ? "idle" : "running"));
  }, [snakeState, setupGitSnake]);

  useEffect(() => {
    const updateProgress = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollableHeight =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const progress = scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 0;
      setScrollProgress(progress);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });

    return () => window.removeEventListener("scroll", updateProgress);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("motion-enabled");
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(".reveal-up"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        threshold: 0.16,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    revealTargets.forEach((target) => observer.observe(target));

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-enabled");
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleDirectionChange("up");
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleDirectionChange("down");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleDirectionChange("left");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleDirectionChange("right");
      } else if (event.key === " ") {
        event.preventDefault();
        toggleSnakeState();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDirectionChange, toggleSnakeState]);

  useEffect(() => {
    if (snakeState !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setGitSnake((currentSnake) => {
        const nextHead = {
          x: currentSnake[0].x + DIRECTION_STEPS[gitDirection].x,
          y: currentSnake[0].y + DIRECTION_STEPS[gitDirection].y,
        };
        const outsideBoard =
          nextHead.x < 0 || nextHead.x >= BOARD_SIZE || nextHead.y < 0 || nextHead.y >= BOARD_SIZE;
        const hitsConflict = conflictCells.some((cell) => isSameCell(cell, nextHead));
        const collectsCommit = isSameCell(nextHead, commitCell);
        const snakeToCheck = collectsCommit ? currentSnake : currentSnake.slice(0, -1);
        const hitsSnake = snakeToCheck.some((cell) => isSameCell(cell, nextHead));

        if (outsideBoard || hitsConflict || hitsSnake) {
          setSnakeState("over");
          return currentSnake;
        }

        const nextSnake = collectsCommit
          ? [nextHead, ...currentSnake]
          : [nextHead, ...currentSnake.slice(0, -1)];

        if (collectsCommit) {
          setStashScore((score) => {
            const nextScore = score + 1;
            setBestStashScore((currentBest) => Math.max(currentBest, nextScore));
            return nextScore;
          });
          const nextCommit = pickRandomEmptyCell(nextSnake, conflictCells);

          if (nextCommit) {
            setCommitCell(nextCommit);
          } else {
            setSnakeState("over");
          }
        }

        return nextSnake;
      });
    }, GAME_TICK_MS);

    return () => window.clearInterval(timer);
  }, [snakeState, gitDirection, commitCell, conflictCells]);

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-slate-900/5">
        <div
          className="bg-primary h-full transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_18%_12%,oklch(0.93_0.08_164),transparent_40%),radial-gradient(circle_at_82%_22%,oklch(0.91_0.06_75),transparent_38%),linear-gradient(165deg,oklch(0.992_0.004_88),oklch(0.968_0.01_92))]" />
      <div className="soft-grid pointer-events-none absolute inset-0 -z-10 opacity-45 [mask-image:radial-gradient(circle_at_center,black_50%,transparent_95%)]" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8 md:px-10">
        <div className="reveal-up flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl">
            <Image
              alt="Stashify logo"
              className="h-8 w-8"
              height={32}
              src="/app_icon.svg"
              width={32}
            />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.2em]">STASHIFY</p>
          </div>
        </div>
        <nav className="reveal-up delay-100 hidden items-center gap-8 text-sm font-medium md:flex">
          <a className="hover:text-primary transition-colors" href="#features">
            Features
          </a>
          <a className="hover:text-primary transition-colors" href="#workflow">
            Workflow
          </a>
          <a className="hover:text-primary transition-colors" href="#proof">
            Why Teams
          </a>
          <a className="hover:text-primary transition-colors" href="#faq">
            FAQ
          </a>
        </nav>
        <div className="reveal-up delay-200 flex items-center gap-2">
          <a
            className="bg-primary text-primary-foreground hover:bg-primary/90 hidden items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors sm:inline-flex"
            href={DOWNLOAD_URL}
            rel="noreferrer"
          >
            <WindowsGlyph />
            Download
          </a>
          <button
            aria-expanded={isMenuOpen}
            aria-label="Toggle mobile menu"
            className="border-border bg-card/80 text-foreground rounded-full border px-4 py-2 text-sm font-semibold md:hidden"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
            <span aria-hidden className="flex h-4 w-5 flex-col justify-between">
              <span
                className={`block h-0.5 w-full bg-current transition-transform duration-200 ${
                  isMenuOpen ? "translate-y-[7px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-full bg-current transition-opacity duration-200 ${
                  isMenuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`block h-0.5 w-full bg-current transition-transform duration-200 ${
                  isMenuOpen ? "-translate-y-[7px] -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </header>
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="mx-6 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-[0_20px_40px_-26px_rgba(15,23,42,0.65)] backdrop-blur">
            <nav className="grid gap-1 text-sm font-semibold">
              <a className="hover:bg-primary/10 rounded-xl px-3 py-2 transition-colors" href="#features" onClick={() => setIsMenuOpen(false)}>
              Features
              </a>
              <a className="hover:bg-primary/10 rounded-xl px-3 py-2 transition-colors" href="#workflow" onClick={() => setIsMenuOpen(false)}>
              Workflow
              </a>
              <a className="hover:bg-primary/10 rounded-xl px-3 py-2 transition-colors" href="#proof" onClick={() => setIsMenuOpen(false)}>
              Why Teams
              </a>
              <a className="hover:bg-primary/10 rounded-xl px-3 py-2 transition-colors" href="#faq" onClick={() => setIsMenuOpen(false)}>
              FAQ
              </a>
              <a
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-center transition-colors"
                href={DOWNLOAD_URL}
                onClick={() => setIsMenuOpen(false)}
                rel="noreferrer"
              >
                <WindowsGlyph />
                Download
              </a>
            </nav>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-12 pt-10 md:gap-14 md:px-10 md:pt-14">
        <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <span className="reveal-up inline-flex rounded-full border border-emerald-700/15 bg-emerald-500/12 px-4 py-1 text-xs font-semibold tracking-[0.16em] text-emerald-900">
              GUI FOR GIT STASH WORKFLOWS
            </span>
            <div className="space-y-6">
              <h1 className="display-font reveal-up delay-100 text-4xl leading-[0.95] font-semibold tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
                Stashify turns git stash into a visual workflow.
              </h1>
              <p className="text-muted-foreground reveal-up delay-200 max-w-xl text-base leading-8 sm:text-lg">
                Add repo or folder paths, browse saved stashes, click any stash, and inspect original
                vs modified changes in Monaco with image viewer and drive search support.
              </p>
            </div>
            <div className="reveal-up delay-300 flex flex-wrap items-center gap-3">
              <a
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 py-3 text-sm font-semibold transition-colors"
                href="#cta"
              >
                Explore Stashify
              </a>
              <a
                className="border-border hover:bg-card rounded-full border bg-white/75 px-6 py-3 text-sm font-semibold transition-colors"
                href="#workflow"
              >
                See Workflow
              </a>
            </div>
            <div className="reveal-up delay-300 grid max-w-xl gap-3 sm:grid-cols-3">
              {numbers.map((item) => (
                <article
                  className="border-border/70 rounded-2xl border bg-white/70 p-4 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.9)] backdrop-blur"
                  key={item.label}
                >
                  <p className="text-foreground text-lg font-bold">{item.value}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{item.label}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="reveal-up delay-200 relative">
            <div className="border-border/80 relative z-10 overflow-hidden rounded-3xl border bg-white/95 backdrop-blur-xl">
              <div className="border-b border-slate-200/85 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <p className="ml-2 text-xs font-semibold tracking-[0.12em] text-slate-700">
                      STASHIFY APP PREVIEW
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      activeScenario.mode === "drive"
                        ? "bg-sky-500/15 text-sky-800"
                        : activeScenario.mode === "image"
                          ? "bg-violet-500/15 text-violet-800"
                          : "bg-emerald-500/15 text-emerald-800"
                    }`}
                  >
                    {activeScenario.status}
                  </span>
                </div>
              </div>

              <div className="border-b border-slate-200/85 px-4 py-3">
                <div className="app-preview-scroll flex gap-2 overflow-x-auto pb-1">
                  {stashScenarios.map((scenario, index) => (
                    <button
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                        index === activeScenarioIndex
                          ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      key={scenario.label}
                      onClick={() => setActiveScenarioIndex(index)}
                      type="button"
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-b border-slate-200/85 bg-slate-50/85 px-4 py-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                    {activeScenario.repoPath}
                  </div>
                  <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                    stash@{`{${activeScenario.ref}}`}
                  </div>
                  <button
                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-50"
                    type="button"
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="grid h-[520px] min-h-0 grid-rows-[175px_1fr] lg:h-[430px] lg:grid-cols-[215px_1fr] lg:grid-rows-1">
                <aside className="app-preview-scroll h-full overflow-y-auto border-b border-slate-200/85 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-600">STASH LIST</p>
                  <div className="mt-2 space-y-1.5">
                    {activeScenario.stashes.map((stash) => (
                      <button
                        className={`block w-full rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors ${
                          stash.includes(`stash@{${activeScenario.ref}}`)
                            ? "border-emerald-500/45 bg-emerald-500/12 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        key={stash}
                        type="button"
                      >
                        {stash}
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="flex h-full min-h-0 flex-col gap-3 p-3">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-600">
                      REVIEW PANEL
                    </p>
                    <button
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      onClick={() => setIsFileTreeCollapsed((current) => !current)}
                      type="button"
                    >
                      {isFileTreeCollapsed ? "Show file tree" : "Collapse file tree"}
                    </button>
                  </div>

                  <div
                    className={`grid min-h-0 flex-1 gap-3 ${
                      isFileTreeCollapsed ? "md:grid-cols-1" : "md:grid-cols-[220px_1fr]"
                    }`}
                  >
                    {!isFileTreeCollapsed && (
                      <article className="app-preview-scroll h-full overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-600">
                          FILE TREE
                        </p>
                        <div className="mt-2 space-y-1.5 text-xs">
                          {activeScenario.files.map((file) => (
                            <div
                              className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-slate-700"
                              key={file.path}
                            >
                              <span
                                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                                  file.status === "A"
                                    ? "bg-emerald-500/15 text-emerald-800"
                                    : file.status === "M"
                                      ? "bg-blue-500/15 text-blue-800"
                                      : file.status === "R"
                                        ? "bg-amber-500/15 text-amber-800"
                                        : "bg-rose-500/15 text-rose-800"
                                }`}
                              >
                                {file.status}
                              </span>
                              <span className="truncate">{file.path}</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}

                    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                        <p className="truncate text-xs text-slate-200">{activeScenario.selectedFile}</p>
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                          Monaco
                        </span>
                      </div>

                      {activeScenario.mode === "diff" && (
                        <div className="grid flex-1 gap-px overflow-hidden bg-slate-800 md:grid-cols-2">
                          <div className="bg-slate-950 px-3 py-2">
                            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400">
                              ORIGINAL
                            </p>
                            {activeScenario.originalSnippet?.map((line, index) => (
                              <p
                                className="font-mono text-[11px] leading-5 break-all whitespace-pre-wrap text-slate-300"
                                key={`o-${line}`}
                              >
                                <span className="mr-2 text-slate-500">{index + 1}</span>
                                {line}
                              </p>
                            ))}
                          </div>
                          <div className="bg-slate-950 px-3 py-2">
                            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400">
                              MODIFIED
                            </p>
                            {activeScenario.modifiedSnippet?.map((line, index) => (
                              <p
                                className="font-mono text-[11px] leading-5 break-all whitespace-pre-wrap text-emerald-300"
                                key={`m-${line}`}
                              >
                                <span className="mr-2 text-slate-500">{index + 1}</span>
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeScenario.mode === "image" && (
                        <div className="app-preview-scroll grid flex-1 gap-px overflow-auto bg-slate-800 sm:grid-cols-2">
                          <div className="bg-slate-950 p-3">
                            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400">BEFORE</p>
                            <div className="flex h-28 items-center justify-center rounded border border-slate-700 bg-[linear-gradient(45deg,#0f172a,#1e293b)] text-xs text-slate-300">
                              image preview
                            </div>
                          </div>
                          <div className="bg-slate-950 p-3">
                            <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400">AFTER</p>
                            <div className="flex h-28 items-center justify-center rounded border border-emerald-600/40 bg-[linear-gradient(45deg,#022c22,#14532d)] text-xs text-emerald-200">
                              image preview
                            </div>
                          </div>
                        </div>
                      )}

                      {activeScenario.mode === "drive" && (
                        <div className="app-preview-scroll flex-1 overflow-auto p-3">
                          <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                            Search in drive: {activeScenario.driveQuery}
                          </div>
                          <div className="mt-2 space-y-1">
                            {activeScenario.driveResults?.map((result) => (
                              <div
                                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-300"
                                key={result}
                              >
                                {result}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6" id="features">
          <div className="reveal-up flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-primary text-xs font-semibold tracking-[0.18em]">FEATURE SET</p>
              <h2 className="display-font mt-2 text-4xl leading-tight font-semibold sm:text-5xl">
                Built around the way you inspect stashes.
              </h2>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm leading-7">
              From project selection to diff inspection, every step is designed to make stash review
              clear and fast without terminal-heavy context switching.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                className="reveal-up border-border/70 group rounded-3xl border bg-white/80 p-6 transition-transform duration-300 hover:-translate-y-1"
                key={feature.title}
                style={{ transitionDelay: `${(index + 1) * 0.08}s` }}
              >
                <span className="bg-accent text-accent-foreground inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.14em]">
                  {feature.tag}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{feature.title}</h3>
                <p className="text-muted-foreground mt-3 text-sm leading-7">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 rounded-[2rem] border border-slate-200/80 bg-white/65 p-6 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.7)] md:grid-cols-[0.9fr_1.1fr] md:p-8" id="workflow">
          <div className="reveal-up">
            <p className="text-primary text-xs font-semibold tracking-[0.18em]">WORKFLOW</p>
            <h2 className="display-font mt-3 text-4xl leading-tight font-semibold text-slate-900">
              A simple path from stash list to Monaco diff.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-7">
              Open a saved project, pick a stash entry, and review exact original/modified changes
              before deciding your next action.
            </p>
          </div>
          <div className="space-y-4">
            {workflow.map((item, index) => (
              <article
                className="reveal-up grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-slate-200/80 bg-white/85 p-4"
                key={item.step}
                style={{ transitionDelay: `${(index + 1) * 0.1}s` }}
              >
                <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]" id="proof">
          <article className="reveal-up rounded-[1.8rem] border border-emerald-900/10 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-white p-7">
            <p className="text-emerald-800 text-xs font-semibold tracking-[0.18em]">TEAM SIGNAL</p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-900">Trusted during release windows</h3>
            <p className="text-muted-foreground mt-3 text-sm leading-7">
              Teams use Stashify to keep momentum while still validating stash changes with visual
              accuracy.
            </p>
            <blockquote className="mt-6 border-l-2 border-emerald-600 pl-4 text-sm leading-7 text-slate-800">
              &quot;Clicking a stash and seeing the Monaco diff immediately removed our confusion
              during hotfix reviews.&quot;
            </blockquote>
          </article>
          <article className="reveal-up delay-100 rounded-[1.8rem] border border-slate-200/90 bg-white/85 p-7">
            <p className="text-primary text-xs font-semibold tracking-[0.18em]">IN-APP FLOW</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="rounded-xl bg-slate-100/80 px-3 py-2">1. Add repository or folder path from sidebar</li>
              <li className="rounded-xl bg-slate-100/80 px-3 py-2">2. Use drive search to locate project folders quickly</li>
              <li className="rounded-xl bg-slate-100/80 px-3 py-2">3. Open saved stash entry and load Monaco diff view</li>
              <li className="rounded-xl bg-slate-100/80 px-3 py-2">4. Preview image changes before final action</li>
            </ul>
          </article>
        </section>

        <section className="space-y-4" id="faq">
          <div className="reveal-up flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-primary text-xs font-semibold tracking-[0.18em]">COMMON QUESTIONS</p>
              <h2 className="display-font mt-2 text-4xl leading-tight font-semibold text-slate-900 sm:text-5xl">
                Answers before you ship.
              </h2>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm leading-7">
              Quick answers on repo/folder adding, stash loading, Monaco diff view, image preview,
              and drive search.
            </p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, index) => (
              <article
                className="reveal-up border-border/80 rounded-2xl border bg-white/80 p-4 shadow-[0_8px_28px_-24px_rgba(15,23,42,0.8)]"
                key={item.question}
                style={{ transitionDelay: `${(index + 1) * 0.08}s` }}
              >
                <button
                  aria-expanded={openFaqIndex === index}
                  className="flex w-full items-center justify-between gap-4 text-left"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                  type="button"
                >
                  <span className="text-sm font-semibold text-slate-900 sm:text-base">{item.question}</span>
                  <span
                    className={`text-primary inline-flex h-7 w-7 items-center justify-center rounded-full border border-current text-lg leading-none transition-transform ${
                      openFaqIndex === index ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                <div
                  className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ${
                    openFaqIndex === index ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
                  }`}
                >
                  <p className="text-muted-foreground overflow-hidden text-sm leading-7">{item.answer}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="reveal-up rounded-[2rem] border border-slate-900/10 bg-slate-900 p-7 text-slate-100 md:p-9" id="cta">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-300">READY TO REVIEW STASHES</p>
          <h2 className="display-font mt-3 max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">
            Open any stash visually, compare changes in Monaco, and move forward with confidence.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300"
              href={DOWNLOAD_URL}
              rel="noreferrer"
            >
              Download for Windows
            </a>
          </div>
        </section>

        <section
          className="reveal-up grid gap-5 rounded-[2rem] border border-emerald-900/15 bg-gradient-to-br from-emerald-500/12 via-white/85 to-white p-5 md:grid-cols-[1.05fr_0.95fr] md:p-8"
          id="download"
        >
          <article className="space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-emerald-900">GIT SNAKE</p>
              <h3 className="display-font mt-2 text-4xl leading-tight font-semibold text-slate-900">
                Merge lane arcade
              </h3>
              <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-7">
                Collect commit tokens, avoid conflict blocks, and keep your stash chain alive.
                Arrow keys work on desktop, tap controls work on mobile.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200/90 bg-white/90 p-4">
              <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <p className="font-semibold text-slate-600">Score</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{stashScore}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <p className="font-semibold text-slate-600">Best</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{bestStashScore}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <p className="font-semibold text-slate-600">State</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {snakeState === "running"
                      ? "Running"
                      : snakeState === "over"
                        ? "Game Over"
                        : "Paused"}
                  </p>
                </div>
              </div>

              <div className="border-border relative mx-auto w-full max-w-[360px] overflow-hidden rounded-2xl border bg-slate-950/95 p-2">
                <div
                  className="grid gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
                >
                  {boardCells.map((cell) => {
                    const key = toCellKey(cell);
                    const isHead = key === snakeHeadKey;
                    const isSnake = snakeKeys.has(key);
                    const isConflict = conflictKeys.has(key);
                    const isCommit = key === commitKey;

                    let cellTone = "bg-slate-800/80";
                    if (isConflict) {
                      cellTone = "bg-rose-500";
                    } else if (isCommit) {
                      cellTone = "bg-emerald-400";
                    } else if (isHead) {
                      cellTone = "bg-emerald-200";
                    } else if (isSnake) {
                      cellTone = "bg-emerald-500";
                    }

                    return (
                      <div
                        className={`aspect-square rounded-[3px] ${cellTone}`}
                        key={key}
                        title={
                          isConflict ? "Conflict" : isCommit ? "Commit Token" : isHead ? "Head" : ""
                        }
                      />
                    );
                  })}
                </div>
                {snakeState === "over" && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/75 backdrop-blur-[1px]">
                    <div className="mx-4 w-full max-w-[230px] rounded-xl border border-rose-300/40 bg-slate-900/95 p-4 text-center">
                      <p className="text-xs font-semibold tracking-[0.14em] text-rose-300">GAME OVER</p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">Conflict crashed your stash lane.</p>
                      <button
                        className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-emerald-50 transition-colors hover:bg-emerald-500"
                        onClick={toggleSnakeState}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-emerald-50 transition-colors hover:bg-emerald-500"
                  onClick={toggleSnakeState}
                  type="button"
                >
                  {snakeState === "running" ? "Pause" : snakeState === "over" ? "Retry" : "Start"}
                </button>
                <button
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={setupGitSnake}
                  type="button"
                >
                  Reset
                </button>
                <span className="text-xs text-slate-600">Arrows: move | Space: start/pause</span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-[220px]">
                <span />
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={() => handleDirectionChange("up")}
                  type="button"
                >
                  Up
                </button>
                <span />
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={() => handleDirectionChange("left")}
                  type="button"
                >
                  Left
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={() => handleDirectionChange("down")}
                  type="button"
                >
                  Down
                </button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  onClick={() => handleDirectionChange("right")}
                  type="button"
                >
                  Right
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200/90 bg-white/90 p-6">
            <p className="text-xs font-semibold tracking-[0.16em] text-emerald-900">WINDOWS BUILD</p>
            <h4 className="mt-3 text-2xl font-semibold text-slate-900">Download Stashify</h4>
            <p className="text-muted-foreground mt-3 text-sm leading-7">
              Install the desktop app to add project folders, open saved stashes, inspect Monaco
              diffs, preview images, and search drives faster.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              <li className="rounded-xl bg-slate-100/85 px-3 py-2">Single-instance desktop experience</li>
              <li className="rounded-xl bg-slate-100/85 px-3 py-2">Add repository or folder paths</li>
              <li className="rounded-xl bg-slate-100/85 px-3 py-2">Monaco original vs modified diff view</li>
              <li className="rounded-xl bg-slate-100/85 px-3 py-2">Image viewer and drive search support</li>
            </ul>
            <a
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-emerald-50 transition-colors hover:bg-emerald-500"
              href={DOWNLOAD_URL}
              rel="noreferrer"
            >
              <WindowsGlyph />
              Download
            </a>
          </article>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-6 text-xs text-slate-600 md:px-10">
        <div className="border-t border-slate-300/70 pt-5">
          <p>© {new Date().getFullYear()} Stashify. GUI for git stash with Monaco diff, image viewer, and drive search.</p>
        </div>
      </footer>
    </div>
  );
}
