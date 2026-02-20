import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import "monaco-editor/min/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/basic-languages/_.contribution.js";
import "monaco-editor/esm/vs/language/css/monaco.contribution.js";
import "monaco-editor/esm/vs/language/html/monaco.contribution.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution.js";

type MonacoEnvironment = {
  getWorker: (workerId: string, label: string) => Worker;
};

const globalScope = self as unknown as { MonacoEnvironment?: MonacoEnvironment };
if (!globalScope.MonacoEnvironment) {
  globalScope.MonacoEnvironment = {
    getWorker(workerId: string, label: string) {
      void workerId;
      if (label === "json") {
        return new jsonWorker();
      }
      if (label === "css" || label === "scss" || label === "less") {
        return new cssWorker();
      }
      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker();
      }
      if (label === "typescript" || label === "javascript") {
        return new tsWorker();
      }
      return new editorWorker();
    },
  };
}

type PatchViewerProps = {
  patch: string;
  filePath: string;
  originalText: string | null;
  modifiedText: string | null;
  status: string;
};

function detectLanguage(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedPath.split("/").pop() ?? normalizedPath;

  for (const language of monaco.languages.getLanguages()) {
    if (language.filenames?.some((name) => name.toLowerCase() === fileName)) {
      return language.id;
    }
  }

  let bestMatch: { id: string; length: number } | null = null;
  for (const language of monaco.languages.getLanguages()) {
    for (const extension of language.extensions ?? []) {
      const lowerExtension = extension.toLowerCase();
      if (!fileName.endsWith(lowerExtension)) {
        continue;
      }
      if (!bestMatch || lowerExtension.length > bestMatch.length) {
        bestMatch = { id: language.id, length: lowerExtension.length };
      }
    }
  }

  return bestMatch?.id ?? "plaintext";
}

function extractDiffSides(patch: string): { original: string; modified: string } {
  const lines = patch.split(/\r?\n/);
  const original: string[] = [];
  const modified: string[] = [];
  let inHunk = false;
  let foundHunk = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      foundHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line.startsWith("+")) {
      modified.push(line.slice(1));
      continue;
    }
    if (line.startsWith("-")) {
      original.push(line.slice(1));
      continue;
    }
    if (line.startsWith(" ")) {
      const value = line.slice(1);
      original.push(value);
      modified.push(value);
      continue;
    }
    if (line.startsWith("\\ No newline at end of file")) {
      continue;
    }
  }

  if (!foundHunk) {
    return { original: patch, modified: patch };
  }

  return {
    original: original.join("\n"),
    modified: modified.join("\n"),
  };
}

function buildUri(side: "original" | "modified", filePath: string): monaco.Uri {
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = encodeURIComponent(normalized);
  return monaco.Uri.parse(`inmemory://stashify/${side}/${encoded}`);
}

function isAddedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "added" || normalized === "new";
}

export function PatchViewer({
  patch,
  filePath,
  originalText,
  modifiedText,
  status,
}: PatchViewerProps) {
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const singleContainerRef = useRef<HTMLDivElement | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const singleEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const singleModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const showSinglePane = isAddedStatus(status);

  function disposeModels() {
    originalModelRef.current?.dispose();
    modifiedModelRef.current?.dispose();
    singleModelRef.current?.dispose();
    originalModelRef.current = null;
    modifiedModelRef.current = null;
    singleModelRef.current = null;
  }

  useEffect(() => {
    if (!showSinglePane) {
      singleEditorRef.current?.dispose();
      singleEditorRef.current = null;
      if (!diffContainerRef.current || diffEditorRef.current) {
        return;
      }

      diffEditorRef.current = monaco.editor.createDiffEditor(diffContainerRef.current, {
        renderSideBySide: true,
        readOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        renderOverviewRuler: true,
        originalEditable: false,
        scrollBeyondLastLine: false,
        lineNumbers: "on",
        wordWrap: "off",
        enableSplitViewResizing: true,
        maxComputationTime: 0,
        diffAlgorithm: "advanced",
      });
      return;
    }

    diffEditorRef.current?.dispose();
    diffEditorRef.current = null;
    if (!singleContainerRef.current || singleEditorRef.current) {
      return;
    }

    singleEditorRef.current = monaco.editor.create(singleContainerRef.current, {
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      wordWrap: "off",
      renderLineHighlight: "all",
    });
  }, [showSinglePane]);

  useEffect(() => {
    return () => {
      disposeModels();
      diffEditorRef.current?.dispose();
      diffEditorRef.current = null;
      singleEditorRef.current?.dispose();
      singleEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      monaco.editor.setTheme(isDark ? "vs-dark" : "vs");
    };

    applyTheme();

    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    disposeModels();

    const sides =
      originalText !== null || modifiedText !== null
        ? { original: originalText ?? "", modified: modifiedText ?? "" }
        : extractDiffSides(patch);

    const language = detectLanguage(filePath);
    if (showSinglePane) {
      if (!singleEditorRef.current) {
        return;
      }

      const singleModel = monaco.editor.createModel(
        sides.modified,
        language,
        buildUri("modified", filePath),
      );
      monaco.editor.setModelLanguage(singleModel, language);
      singleModelRef.current = singleModel;
      singleEditorRef.current.setModel(singleModel);
      return;
    }

    if (!diffEditorRef.current) {
      return;
    }

    const originalModel = monaco.editor.createModel(
      sides.original,
      language,
      buildUri("original", filePath),
    );
    const modifiedModel = monaco.editor.createModel(
      sides.modified,
      language,
      buildUri("modified", filePath),
    );
    monaco.editor.setModelLanguage(originalModel, language);
    monaco.editor.setModelLanguage(modifiedModel, language);

    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    diffEditorRef.current.setModel({
      original: originalModel,
      modified: modifiedModel,
    });
  }, [patch, filePath, originalText, modifiedText, showSinglePane]);

  return (
    <div className="min-h-0 min-w-0 flex-1">
      {showSinglePane ? (
        <div
          className="h-full w-full overflow-hidden rounded-lg border"
          ref={singleContainerRef}
        />
      ) : (
        <div
          className="h-full w-full overflow-hidden rounded-lg border"
          ref={diffContainerRef}
        />
      )}
    </div>
  );
}
