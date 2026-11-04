// SPDX-License-Identifier: AGPL-3.0-or-later
//
// LandMs editor shell: top bar, panels, canvas / preview and dialogs.

import {
  Bell,
  Braces,
  ChevronDown,
  Code2,
  Eye,
  FilePlus2,
  FolderOpen,
  Layers3,
  Maximize,
  Pencil,
  Plus,
  Redo2,
  Save,
  Settings2,
  Shapes,
  TriangleAlert,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { builtinByName } from "./core/builtins";
import { moduleFileYaml, parseModuleFile } from "./core/foling";
import { buildFolingHtml, buildHtflTree, htflFiles, moduleDefinition } from "./core/htfl";
import { createBlankProject, createFrame, createModuleInstance, createRoot, createStarterProject, withModule, type FramePreset } from "./core/project";
import { parseProject, serializeProject } from "./core/projectFile";
import { describeCondition, validateScreens } from "./core/screens";
import { cloneWithNewIds, findNode, insertNode, mapNode, moveNode, newId, removeNode, updateRoot } from "./core/tree";
import type { FolingModuleDef, LayoutNode, ModuleNode, Project, Screen } from "./core/types";
import { buildWeb, singleFileHtml, webFiles } from "./core/web";
import { Canvas, type DragPayload, type DropTarget } from "./editor/Canvas";
import { CodeDialog, FolingDialog, ScreenDialog, ScreenIcon, SettingsDialog, UpdateDialog, type CodeTab, type UpdateState } from "./editor/Dialogs";
import { Inspector } from "./editor/Inspector";
import { Layers, Library } from "./editor/LeftPanel";
import { Preview } from "./editor/Preview";
import { useEditorStore } from "./editor/store";
import {
  appVersion,
  checkForUpdate,
  exportFiles,
  exportTextFile,
  isDesktop,
  notify,
  openProjectFile,
  pickFolingProject,
  pickImage,
  pickModuleFiles,
  revealFolder,
  saveProjectFile,
  type AvailableUpdate,
} from "./platform";

const AUTOSAVE_KEY = "landms:autosave";
const AUTO_UPDATE_KEY = "landms:auto-update";
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function loadInitialProject(): Project {
  try {
    const saved = window.localStorage.getItem(AUTOSAVE_KEY);
    if (saved) return parseProject(saved);
  } catch {
    // A broken autosave must never keep the editor from starting.
  }
  return createStarterProject();
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function safeFileName(name: string): string {
  return name.normalize("NFKC").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "LandMs";
}

type Toast = { id: number; message: string; tone: "info" | "error"; action?: { label: string; run: () => void } };

export default function App() {
  const store = useEditorStore(loadInitialProject);
  const { project, screen, selection, commit, select } = store;
  const drag = useRef<DragPayload | null>(null);
  const clipboard = useRef<{ node: LayoutNode; defs: FolingModuleDef[] } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const [panel, setPanel] = useState<"library" | "layers">("library");
  const [mode, setMode] = useState<"design" | "preview">("design");
  const [zoom, setZoom] = useState(0.7);
  const [toast, setToast] = useState<Toast | null>(null);
  const [code, setCode] = useState<{ tab: CodeTab; file?: string } | null>(null);
  const [screenDialog, setScreenDialog] = useState<{ screen: Screen | null } | null>(null);
  const [folingOpen, setFolingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileMenu, setFileMenu] = useState(false);
  const [version, setVersion] = useState("");
  const [updateOpen, setUpdateOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle", message: "" });
  const availableUpdate = useRef<AvailableUpdate | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(() => {
    try {
      return window.localStorage.getItem(AUTO_UPDATE_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const showToast = useCallback((message: string, tone: Toast["tone"] = "info", action?: Toast["action"]) => setToast({ id: Date.now(), message, tone, action }), []);
  const showError = useCallback((message: string) => showToast(message, "error"), [showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), toast.action ? 9000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  // ---------- autosave & title ----------

  const autosaveWarned = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
      } catch {
        if (!autosaveWarned.current) {
          autosaveWarned.current = true;
          showError("自動保存の容量を超えました（画像が多い場合など）。「保存」でファイルに保存してください。");
        }
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project, showError]);

  useEffect(() => {
    document.title = `${store.dirty ? "• " : ""}${project.name} — LandMs`;
  }, [project.name, store.dirty]);

  // ---------- derived ----------

  const tree = useMemo(() => buildHtflTree(project), [project]);
  const issues = useMemo(() => validateScreens(project.screens), [project.screens]);

  // ---------- zoom ----------

  const fitZoom = useCallback(() => {
    const width = workspaceRef.current?.clientWidth ?? 1000;
    setZoom(Math.max(0.2, Math.min(1, Math.floor(((width - 96) / screen.canvasWidth) * 100) / 100)));
  }, [screen.canvasWidth]);
  useEffect(() => {
    fitZoom();
  }, [screen.id, fitZoom]);
  const changeZoom = useCallback((delta: number) => setZoom((value) => Math.max(0.2, Math.min(2, Math.round((value + delta) * 100) / 100))), []);

  // ---------- tree edits ----------

  const updateNode = useCallback(
    (id: string, change: (node: LayoutNode) => LayoutNode, key?: string) => commit((current) => updateRoot(current, screen.id, (root) => mapNode(root, id, change)), { key }),
    [commit, screen.id],
  );

  /** Where a click-to-add goes: into the selected frame, after the selected module, else into <main>. */
  const defaultTarget = useCallback((): DropTarget => {
    const root = screen.root;
    const location = selection.id ? findNode(root, selection.id) : null;
    if (location?.node.kind === "frame" && location.node.id !== root.id) return { parentId: location.node.id, index: location.node.children.length };
    if (location?.node.kind === "module" && location.parent) return { parentId: location.parent.id, index: location.index + 1 };
    const main = root.children.find((child) => child.kind === "frame" && child.tag === "main");
    return main ? { parentId: main.id, index: (main as typeof root).children.length } : { parentId: root.id, index: root.children.length };
  }, [screen.root, selection.id]);

  const insertAt = useCallback(
    (target: DropTarget, node: LayoutNode, def?: FolingModuleDef) => {
      commit((current) => updateRoot(def ? withModule(current, def) : current, screen.id, (root) => insertNode(root, target.parentId, target.index, node)), { select: { id: node.id, path: null } });
    },
    [commit, screen.id],
  );

  const addModule = useCallback(
    (name: string, target = defaultTarget()) => {
      const def = moduleDefinition(project, name);
      if (!def) return showError(`モジュール「${name}」が見つかりません。`);
      insertAt(target, createModuleInstance(def), def);
    },
    [defaultTarget, insertAt, project, showError],
  );

  const addFrame = useCallback((preset: FramePreset, target = defaultTarget()) => insertAt(target, createFrame(preset)), [defaultTarget, insertAt]);

  const handleDrop = useCallback(
    (target: DropTarget, payload: DragPayload) => {
      if (payload.kind === "module") addModule(payload.name, target);
      else if (payload.kind === "frame") addFrame(payload.preset as FramePreset, target);
      else commit((current) => updateRoot(current, screen.id, (root) => moveNode(root, payload.id, target.parentId, target.index)), { select: { id: payload.id, path: null } });
    },
    [addFrame, addModule, commit, screen.id],
  );

  const deleteSelected = useCallback(() => {
    const id = selection.id;
    if (!id || id === screen.root.id) return;
    const location = findNode(screen.root, id);
    if (!location?.parent) return;
    const parent = location.parent;
    const next = parent.children[location.index + 1] ?? parent.children[location.index - 1];
    commit((current) => updateRoot(current, screen.id, (root) => removeNode(root, id)), { select: { id: next?.id ?? parent.id, path: null } });
  }, [commit, screen.id, screen.root, selection.id]);

  const duplicateSelected = useCallback(() => {
    const id = selection.id;
    if (!id || id === screen.root.id) return;
    const location = findNode(screen.root, id);
    if (!location?.parent) return;
    const copy = cloneWithNewIds(location.node);
    copy.name = `${location.node.name} のコピー`;
    insertAt({ parentId: location.parent.id, index: location.index + 1 }, copy);
  }, [insertAt, screen.root, selection.id]);

  const usedDefs = useCallback(
    (node: LayoutNode): FolingModuleDef[] => {
      const defs: FolingModuleDef[] = [];
      const walk = (current: LayoutNode) => {
        if (current.kind === "module") {
          const def = moduleDefinition(project, current.module);
          if (def) defs.push(def);
        } else current.children.forEach(walk);
      };
      walk(node);
      return defs;
    },
    [project],
  );

  const copySelected = useCallback(() => {
    const location = selection.id ? findNode(screen.root, selection.id) : null;
    if (!location || location.node.id === screen.root.id) return false;
    clipboard.current = { node: location.node, defs: usedDefs(location.node) };
    showToast(`「${location.node.name}」をコピーしました。他の画面にも貼り付けられます。`);
    return true;
  }, [screen.root, selection.id, showToast, usedDefs]);

  const paste = useCallback(() => {
    const entry = clipboard.current;
    if (!entry) return;
    const node = cloneWithNewIds(entry.node);
    const target = defaultTarget();
    commit(
      (current) => {
        let next = current;
        for (const def of entry.defs) next = withModule(next, def);
        return updateRoot(next, screen.id, (root) => insertNode(root, target.parentId, target.index, node));
      },
      { select: { id: node.id, path: null } },
    );
  }, [commit, defaultTarget, screen.id]);

  const selectParent = useCallback(() => {
    if (selection.path?.length) return select(selection.id, null);
    const location = selection.id ? findNode(screen.root, selection.id) : null;
    if (location?.parent) select(location.parent.id);
  }, [screen.root, select, selection.id, selection.path]);

  // ---------- assets ----------

  const addImage = useCallback(async (): Promise<string | null> => {
    try {
      const picked = await pickImage();
      if (!picked) return null;
      const used = new Set(Object.values(project.assets).map((asset) => asset.name));
      const dot = picked.name.lastIndexOf(".");
      const base = (dot > 0 ? picked.name.slice(0, dot) : picked.name).normalize("NFKC").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
      const extension = dot > 0 ? picked.name.slice(dot + 1).toLowerCase() : "png";
      let name = `${base}.${extension}`;
      for (let n = 2; used.has(name); n += 1) name = `${base}-${n}.${extension}`;
      const id = newId("a");
      commit((current) => ({ ...current, assets: { ...current.assets, [id]: { id, name, mime: picked.mime, data: picked.data } } }));
      return `images/${name}`;
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [commit, project.assets, showError]);

  // ---------- Foling modules ----------

  const registerModules = useCallback(
    (sources: Array<{ name: string; text: string }>, origin: string) => {
      const imported: FolingModuleDef[] = [];
      const failures: string[] = [];
      for (const source of sources) {
        try {
          imported.push(...parseModuleFile(source.text));
        } catch (error) {
          failures.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (imported.length) {
        commit((current) => {
          const modules = { ...current.modules };
          for (const def of imported) {
            // A Foling module may not take the name of a LandMs built-in.
            const name = builtinByName[def.name] ? `${def.name}-foling` : def.name;
            modules[name] = { def: { ...def, name }, source: "imported", origin };
          }
          return { ...current, modules };
        });
        setPanel("library");
      }
      if (failures.length) showError(`読み込めないファイルがありました: ${failures.join(" / ")}`);
      else if (imported.length) showToast(`${imported.length} 件の Foling モジュールを読み込みました。`);
      else showError("モジュールが見つかりませんでした。");
    },
    [commit, showError, showToast],
  );

  const importModuleFiles = useCallback(async () => {
    try {
      const files = await pickModuleFiles();
      if (files.length) registerModules(files, files.map((file) => file.name).join(", "));
    } catch (error) {
      showError(String(error));
    }
  }, [registerModules, showError]);

  const importFolingProject = useCallback(async () => {
    try {
      const picked = await pickFolingProject();
      if (!picked) return;
      if (!picked.files.length) return showError("このフォルダーの modules/ にモジュール（.yaml）がありません。");
      registerModules(picked.files, picked.folder);
    } catch (error) {
      showError(String(error));
    }
  }, [registerModules, showError]);

  const removeImported = useCallback(
    (name: string) => {
      const inUse = project.screens.some((item) => JSON.stringify(item.root).includes(`"module":${JSON.stringify(name)}`));
      if (inUse) return showError(`「${name}」は配置中のため外せません。先にキャンバスから削除してください。`);
      commit((current) => {
        const modules = { ...current.modules };
        delete modules[name];
        return { ...current, modules };
      });
    },
    [commit, project.screens, showError],
  );

  // ---------- export ----------

  const runExport = useCallback(
    async (kind: "web" | "single" | "htfl" | "modules", node?: ModuleNode) => {
      const base = safeFileName(project.name);
      try {
        let result: string | null = null;
        if (kind === "web") result = await exportFiles(`${base}-web`, webFiles(project));
        if (kind === "htfl") result = await exportFiles(`${base}-htfl`, htflFiles(project, tree));
        if (kind === "single") result = await exportTextFile(`${base}.html`, singleFileHtml(project), "html", "HTML");
        if (kind === "modules") {
          const defs = node
            ? [{ ...(moduleDefinition(project, node.module) ?? { name: node.module, css: "" }), snapshot: node.snapshot }]
            : [...tree.modules, ...Object.values(project.modules).filter((entry) => entry.source === "imported" && !tree.modules.some((def) => def.name === entry.def.name)).map((entry) => entry.def)];
          if (!defs.length) return showError("書き出すモジュールがありません。");
          result = await exportTextFile(node ? `${defs[0].name}.yaml` : `${base}-modules.yaml`, moduleFileYaml(defs, "# Foling modules exported from LandMs"), "yaml", "Foling module");
        }
        if (!result) return;
        const folder = result;
        const isFolder = isDesktop && (kind === "web" || kind === "htfl");
        showToast(
          kind === "htfl" ? `HTFL プロジェクトを書き出しました: ${result}（Foling の「プロジェクトフォルダを選択」で開けます）` : `書き出しました: ${result}`,
          "info",
          isFolder ? { label: "フォルダーを開く", run: () => void revealFolder(folder).catch((error) => showError(String(error))) } : undefined,
        );
      } catch (error) {
        showError(`書き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [project, showError, showToast, tree],
  );

  // ---------- project files ----------

  const save = useCallback(
    async (saveAs = false) => {
      try {
        const path = await saveProjectFile(serializeProject(project), safeFileName(project.name), saveAs ? null : store.filePath);
        if (path === undefined) return;
        store.markSaved(path);
        showToast(path ? `保存しました: ${path}` : "プロジェクトファイル（.landms）をダウンロードしました。");
      } catch (error) {
        showError(`保存できませんでした: ${String(error)}`);
      }
    },
    [project, showError, showToast, store],
  );

  const open = useCallback(async () => {
    try {
      const file = await openProjectFile();
      if (!file) return;
      store.load(parseProject(file.text), file.path);
      showToast(`「${file.path ?? "プロジェクト"}」を開きました。`);
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  }, [showError, showToast, store]);

  const newProject = useCallback(
    (template: "starter" | "blank") => {
      if (store.dirty && !window.confirm("保存していない変更があります。新しいプロジェクトを作りますか？（今の内容は「元に戻す」では戻せません）")) return;
      store.load(template === "starter" ? createStarterProject() : createBlankProject(), null, true);
    },
    [store],
  );

  // ---------- updates ----------

  const checkUpdates = useCallback(
    async (manual: boolean) => {
      if (!isDesktop) {
        if (manual) {
          setUpdate({ status: "idle", message: "アップデートはデスクトップ版（Tauri）で利用できます。Web版は常に最新のページが読み込まれます。" });
          setUpdateOpen(true);
        }
        return;
      }
      if (manual) setUpdateOpen(true);
      setUpdate({ status: "checking" });
      try {
        const found = await checkForUpdate();
        availableUpdate.current = found;
        if (!found) {
          setUpdate({ status: "idle", message: "LandMs は最新です。" });
          return;
        }
        setUpdate({ status: "available", version: found.version, notes: found.notes });
        if (!manual) {
          await notify("LandMs アップデート", `バージョン ${found.version} を利用できます`);
          showToast(`LandMs ${found.version} を利用できます。`, "info", { label: "詳細", run: () => setUpdateOpen(true) });
        }
      } catch (error) {
        setUpdate({ status: manual ? "error" : "idle", message: `更新情報を取得できませんでした: ${String(error)}` });
      }
    },
    [showToast],
  );

  const installUpdate = useCallback(async () => {
    const found = availableUpdate.current;
    if (!found) return;
    try {
      window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
    } catch {
      // ignore
    }
    setUpdate({ status: "installing", progress: null });
    try {
      await found.install((progress) => setUpdate({ status: "installing", progress }));
    } catch (error) {
      setUpdate({ status: "error", message: `アップデートに失敗しました: ${String(error)}` });
    }
  }, [project]);

  useEffect(() => {
    if (!isDesktop || !autoUpdate) return;
    const first = window.setTimeout(() => void checkUpdates(false), 3000);
    const interval = window.setInterval(() => void checkUpdates(false), UPDATE_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [autoUpdate, checkUpdates]);

  const setAutoUpdatePreference = (value: boolean) => {
    setAutoUpdate(value);
    try {
      window.localStorage.setItem(AUTO_UPDATE_KEY, value ? "on" : "off");
    } catch {
      // ignore
    }
  };

  // ---------- screens ----------

  const saveScreen = (draft: Screen, copyFrom: string | null) => {
    const exists = project.screens.some((item) => item.id === draft.id);
    if (exists) {
      commit((current) => ({ ...current, screens: current.screens.map((item) => (item.id === draft.id ? { ...draft, root: item.root } : item)) }));
    } else {
      const source = copyFrom ? project.screens.find((item) => item.id === copyFrom) : null;
      const root = source ? cloneWithNewIds(source.root) : createRoot([createFrame("header"), createFrame("main"), createFrame("footer")]);
      commit((current) => ({ ...current, screens: [...current.screens, { ...draft, root }] }), { screenId: draft.id });
    }
    setScreenDialog(null);
  };

  const deleteScreen = (id: string) => {
    commit((current) => ({ ...current, screens: current.screens.filter((item) => item.id !== id) }));
    setScreenDialog(null);
  };

  // ---------- keyboard ----------

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // Dialogs handle their own keys (Escape); nothing behind them may change.
      if (document.querySelector(".modal-backdrop")) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        store.redo();
      } else if (mod && key === "s") {
        event.preventDefault();
        void save(event.shiftKey);
      } else if (mod && key === "o") {
        event.preventDefault();
        void open();
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (mod && key === "c") {
        if (copySelected()) event.preventDefault();
      } else if (mod && key === "v") {
        if (clipboard.current) {
          event.preventDefault();
          paste();
        }
      } else if (mod && (key === "=" || key === "+")) {
        event.preventDefault();
        changeZoom(0.1);
      } else if (mod && key === "-") {
        event.preventDefault();
        changeZoom(-0.1);
      } else if (mod && key === "0") {
        event.preventDefault();
        fitZoom();
      } else if (key === "delete" || key === "backspace") {
        if (mode === "design") {
          event.preventDefault();
          deleteSelected();
        }
      } else if (key === "escape") {
        selectParent();
      } else if (key === "p" && !mod && !event.altKey && !event.shiftKey) {
        setMode((value) => (value === "design" ? "preview" : "design"));
      }
    },
    [changeZoom, copySelected, deleteSelected, duplicateSelected, fitZoom, mode, open, paste, save, selectParent, store],
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleKey]);

  // ---------- render ----------

  const screenIssues = issues.filter((issue) => issue.screenIds.includes(screen.id) || issue.screenIds.length === 0);
  const importedCount = Object.values(project.modules).filter((entry) => entry.source === "imported").length;
  const web = useMemo(() => (code ? buildWeb(project) : null), [code, project]);

  return (
    <main className={`app-shell mode-${mode}`}>
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
          </span>
          <strong>LandMs</strong>
          <span className="badge">{isDesktop ? "DESKTOP" : "WEB"}</span>
        </div>
        <div className="file-menu">
          <button className="tool-button" onClick={() => setFileMenu((value) => !value)} aria-expanded={fileMenu}>
            ファイル <ChevronDown size={13} />
          </button>
          {fileMenu && (
            <div className="menu" onMouseLeave={() => setFileMenu(false)} onClick={() => setFileMenu(false)}>
              <button onClick={() => newProject("starter")}><FilePlus2 size={14} />新規（サンプル）</button>
              <button onClick={() => newProject("blank")}><FilePlus2 size={14} />新規（空）</button>
              <button onClick={() => void open()}><FolderOpen size={14} />開く…<kbd>Ctrl+O</kbd></button>
              <button onClick={() => void save(false)}><Save size={14} />保存<kbd>Ctrl+S</kbd></button>
              {isDesktop && <button onClick={() => void save(true)}><Save size={14} />名前を付けて保存…<kbd>Ctrl+Shift+S</kbd></button>}
              <hr />
              <button onClick={() => void runExport("web")}><Upload size={14} />HTML / CSS / JS を書き出す</button>
              <button onClick={() => void runExport("single")}><Upload size={14} />1ファイルHTMLを書き出す</button>
              <button onClick={() => void runExport("htfl")}><Upload size={14} />HTFL プロジェクトを書き出す</button>
              <button onClick={() => void runExport("modules")}><Upload size={14} />Foling モジュールを書き出す</button>
            </div>
          )}
        </div>
        <div className="project-name" data-tauri-drag-region>
          <input value={project.name} onChange={(event) => commit((current) => ({ ...current, name: event.target.value }), { key: "project-name" })} aria-label="プロジェクト名" />
          <span className={`save-state ${store.dirty ? "unsaved" : ""}`}>{store.dirty ? "未保存" : store.filePath ? "保存済み" : "自動保存済み"}</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={store.undo} disabled={!store.canUndo} title="元に戻す（Ctrl+Z）">
            <Undo2 size={16} />
          </button>
          <button className="icon-button" onClick={store.redo} disabled={!store.canRedo} title="やり直す（Ctrl+Shift+Z）">
            <Redo2 size={16} />
          </button>
          <span className="divider" />
          <button className="tool-button" onClick={() => setFolingOpen(true)}>
            <span className="foling-mark">F</span>Foling
          </button>
          <button className="tool-button" onClick={() => setCode({ tab: "HTML" })}>
            <Code2 size={15} />コード
          </button>
          <button className={`tool-button ${mode === "preview" ? "active" : ""}`} onClick={() => setMode((value) => (value === "design" ? "preview" : "design"))} title="プレビュー（P）">
            {mode === "preview" ? <Pencil size={15} /> : <Eye size={15} />}
            {mode === "preview" ? "編集に戻る" : "プレビュー"}
          </button>
          <button className={`icon-button ${update.status === "available" ? "has-update" : ""}`} onClick={() => (update.status === "available" ? setUpdateOpen(true) : void checkUpdates(true))} title="アップデート">
            <Bell size={16} />
            {update.status === "available" && <i className="dot" />}
          </button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="設定">
            <Settings2 size={16} />
          </button>
          <button className="primary-button" onClick={() => void save(false)}>
            <Save size={14} />保存
          </button>
        </div>
      </header>

      {mode === "design" && (
        <aside className="left-panel">
          <div className="panel-tabs">
            <button className={panel === "library" ? "active" : ""} onClick={() => setPanel("library")}>
              <Shapes size={14} />追加
            </button>
            <button className={panel === "layers" ? "active" : ""} onClick={() => setPanel("layers")}>
              <Layers3 size={14} />レイヤー
            </button>
          </div>
          <div className="panel-scroll">
            {panel === "library" ? (
              <Library project={project} drag={drag} onAddModule={(name) => addModule(name)} onAddFrame={(preset) => addFrame(preset)} onImport={() => setFolingOpen(true)} onRemoveImported={removeImported} />
            ) : (
              <Layers
                screen={screen}
                selection={selection}
                drag={drag}
                onSelect={(id) => select(id)}
                onToggleHidden={(id) => updateNode(id, (node) => ({ ...node, hidden: !node.hidden }))}
                onRename={(id, name) => updateNode(id, (node) => ({ ...node, name }))}
                onDrop={handleDrop}
              />
            )}
          </div>
        </aside>
      )}

      <section className="workspace" ref={workspaceRef}>
        {mode === "design" ? (
          <>
            <div className="canvas-toolbar">
              <div className="screen-tabs">
                {project.screens.map((item) => {
                  const warned = issues.some((issue) => issue.screenIds.includes(item.id));
                  return (
                    <button key={item.id} className={item.id === screen.id ? "active" : ""} onClick={() => store.setScreen(item.id)} onDoubleClick={() => setScreenDialog({ screen: item })} title={`${describeCondition(item)}（ダブルクリックで設定）`}>
                      <ScreenIcon icon={item.icon} />
                      {item.name}
                      <small>{describeCondition(item)}</small>
                      {warned && <TriangleAlert size={12} className="warn-icon" />}
                    </button>
                  );
                })}
                <button className="screen-settings" onClick={() => setScreenDialog({ screen })} title="この画面の設定">
                  <Settings2 size={14} />
                </button>
                <button className="screen-add" onClick={() => setScreenDialog({ screen: null })} title="画面を追加">
                  <Plus size={14} />
                </button>
              </div>
              {screenIssues.length > 0 && (
                <div className="issue-banner">
                  <TriangleAlert size={14} />
                  <span>{screenIssues[0].message}</span>
                  {screenIssues.length > 1 && <small>ほか {screenIssues.length - 1} 件</small>}
                  <button className="link-button" onClick={() => setScreenDialog({ screen })}>設定を開く</button>
                </div>
              )}
            </div>
            <div className={`canvas-area ${screenIssues.length ? "has-issues" : ""}`} onClick={(event) => event.target === event.currentTarget && select(null)}>
              <div className="canvas-label">
                <span>
                  <ScreenIcon icon={screen.icon} size={12} /> {screen.name}
                </span>
                <small>
                  {screen.canvasWidth}px · {describeCondition(screen)}
                </small>
              </div>
              <Canvas project={project} screen={screen} zoom={zoom} selection={selection} drag={drag} onSelect={(id, path) => select(id, path ?? null)} onDrop={handleDrop} onKeyDown={handleKey} onZoom={changeZoom} />
            </div>
            <div className="zoom-control">
              <button onClick={() => changeZoom(-0.1)} title="縮小（Ctrl+-）">
                <ZoomOut size={14} />
              </button>
              <button className="zoom-value" onClick={() => setZoom(1)} title="100%">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => changeZoom(0.1)} title="拡大（Ctrl++）">
                <ZoomIn size={14} />
              </button>
              <button onClick={fitZoom} title="画面に合わせる（Ctrl+0）">
                <Maximize size={14} />
              </button>
            </div>
          </>
        ) : (
          <Preview project={project} initialWidth={screen.canvasWidth} onError={showError} />
        )}
      </section>

      {mode === "design" && (
        <aside className="right-panel">
          <Inspector
            project={project}
            screen={screen}
            selection={selection}
            tree={tree}
            update={updateNode}
            onSelect={(id, path) => select(id, path ?? null)}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onPickImage={addImage}
            onExportModule={(node) => void runExport("modules", node)}
            onShowCode={(path) => setCode({ tab: "HTFL", file: `${path}/config.yaml` })}
            onError={showError}
          />
        </aside>
      )}

      {code && web && (
        <CodeDialog
          web={web}
          htfl={htflFiles(project, tree)}
          folingHtml={buildFolingHtml(tree)}
          initialTab={code.tab}
          initialFile={code.file}
          onClose={() => setCode(null)}
          onExport={(kind) => void runExport(kind)}
        />
      )}
      {screenDialog && (
        <ScreenDialog
          project={project}
          screen={screenDialog.screen}
          onClose={() => setScreenDialog(null)}
          onSave={saveScreen}
          onDelete={deleteScreen}
          createDraft={() => ({ id: newId("s"), name: `Screen ${project.screens.length + 1}`, icon: "desktop", canvasWidth: 1024, canvasHeight: 768, minWidth: null, maxWidth: null, root: createRoot() })}
        />
      )}
      {folingOpen && (
        <FolingDialog
          importedCount={importedCount}
          onClose={() => setFolingOpen(false)}
          onImportFiles={() => void importModuleFiles()}
          onImportProject={() => void importFolingProject()}
          onExportHtfl={() => void runExport("htfl")}
          onExportModules={() => void runExport("modules")}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          project={project}
          version={version}
          autoUpdate={autoUpdate}
          onAutoUpdate={setAutoUpdatePreference}
          onChange={(change, key) => commit(change, { key })}
          onCheckUpdate={() => void checkUpdates(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {updateOpen && <UpdateDialog state={update} version={version} onCheck={() => void checkUpdates(true)} onInstall={() => void installUpdate()} onClose={() => setUpdateOpen(false)} />}

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.tone === "error" ? <TriangleAlert size={15} /> : <Braces size={15} />}
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="toast-close" onClick={() => setToast(null)} aria-label="閉じる">
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
