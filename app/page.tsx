"use client";

import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns3,
  Component,
  Copy,
  Download,
  Eye,
  FileInput,
  FileCode2,
  FolderOutput,
  Frame,
  Grid2X2,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Link2,
  Menu,
  MessageSquareText,
  Minus,
  Monitor,
  MousePointer2,
  PanelBottom,
  PanelTop,
  PackagePlus,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  Smartphone,
  Sparkles,
  SquareMousePointer,
  Tablet,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatHtflPreview,
  generateHtflProject,
  generateResponsiveWebFiles,
  generateWebCode,
  parseFolingModuleFile,
  type ExportFile,
  type FolingModuleDefinition,
} from "./lib/encoders";

type DeviceId = "desktop" | "tablet" | "mobile";
type ModuleType =
  | "header"
  | "hero"
  | "text"
  | "button"
  | "logo"
  | "menu"
  | "carousel"
  | "cards"
  | "image"
  | "form"
  | "footer"
  | "imported";

type BuiltInModuleType = Exclude<ModuleType, "imported">;

type ModuleItem = {
  id: string;
  type: ModuleType;
  name: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  label?: string;
  href?: string;
  height: number;
  direction: "row" | "column";
  align: "left" | "center" | "right";
  gap: number;
  background: string;
  color: string;
  radius: number;
  visible: boolean;
  definition?: FolingModuleDefinition;
};

const moduleCatalog: Array<{
  type: BuiltInModuleType;
  label: string;
  description: string;
  icon: typeof Box;
}> = [
  { type: "header", label: "ヘッダー", description: "ロゴ＋ナビ", icon: PanelTop },
  { type: "logo", label: "ロゴ", description: "ブランド表示", icon: Sparkles },
  { type: "menu", label: "メニュー", description: "ハンバーガー", icon: Menu },
  { type: "hero", label: "ヒーロー", description: "見出し＋CTA", icon: Frame },
  { type: "text", label: "テキスト", description: "文章ブロック", icon: Type },
  { type: "button", label: "ボタン", description: "リンク／動作", icon: SquareMousePointer },
  { type: "carousel", label: "カルーセル", description: "スライダー", icon: Columns3 },
  { type: "cards", label: "カード", description: "繰り返し要素", icon: Grid2X2 },
  { type: "image", label: "イメージ", description: "画像／背景", icon: ImageIcon },
  { type: "form", label: "フォーム", description: "入力＋送信", icon: TextCursorInput },
  { type: "footer", label: "フッター", description: "リンク＋著作権", icon: PanelBottom },
];

const devices: Record<DeviceId, { label: string; width: number; icon: typeof Monitor }> = {
  desktop: { label: "Desktop", width: 1440, icon: Monitor },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  mobile: { label: "Mobile", width: 390, icon: Smartphone },
};

function createModule(type: BuiltInModuleType, suffix = Date.now().toString(36)): ModuleItem {
  const presets: Record<BuiltInModuleType, Omit<ModuleItem, "id" | "type">> = {
    header: { name: "Header / Main", title: "NORTH/STUDIO", body: "Works　About　Journal", height: 78, direction: "row", align: "left", gap: 24, background: "#F2F0E9", color: "#17201D", radius: 0, visible: true },
    hero: { name: "Hero / Editorial", eyebrow: "INDEPENDENT CREATIVE STUDIO", title: "Ideas with\nroom to breathe.", body: "Brand, digital and spaces for people who care about the details.", label: "View selected work", href: "#work", height: 510, direction: "column", align: "left", gap: 20, background: "#DDE4D5", color: "#17201D", radius: 0, visible: true },
    text: { name: "Text / Statement", eyebrow: "ABOUT", title: "Good work begins with a clear point of view.", body: "We pair strategy with design to make useful, memorable things.", height: 250, direction: "column", align: "left", gap: 16, background: "#F2F0E9", color: "#17201D", radius: 0, visible: true },
    button: { name: "Button / Primary", label: "Start a project", href: "#contact", height: 96, direction: "row", align: "left", gap: 12, background: "#F2F0E9", color: "#17201D", radius: 0, visible: true },
    logo: { name: "Logo / Wordmark", title: "NORTH/STUDIO", height: 88, direction: "row", align: "left", gap: 12, background: "#F2F0E9", color: "#17201D", radius: 0, visible: true },
    menu: { name: "Menu / Hamburger", label: "Menu", href: "#menu", height: 78, direction: "row", align: "right", gap: 12, background: "#F2F0E9", color: "#17201D", radius: 0, visible: true },
    carousel: { name: "Carousel / Projects", eyebrow: "SELECTED WORK", title: "Field Notes", body: "Identity & digital · 2026", height: 410, direction: "row", align: "left", gap: 20, background: "#273D36", color: "#F2F0E9", radius: 0, visible: true },
    cards: { name: "Cards / Features", eyebrow: "CAPABILITIES", title: "Three ways we help", body: "Strategy, identity and digital products.", height: 330, direction: "row", align: "left", gap: 16, background: "#E6DDD0", color: "#17201D", radius: 0, visible: true },
    image: { name: "Image / Placeholder", title: "Image", body: "Drop an asset here", height: 320, direction: "column", align: "center", gap: 12, background: "#C5D0C1", color: "#17201D", radius: 0, visible: true },
    form: { name: "Form / Contact", eyebrow: "CONTACT", title: "Let’s make something useful.", body: "hello@north.studio", label: "Send inquiry", height: 340, direction: "column", align: "left", gap: 16, background: "#C7FF5E", color: "#17201D", radius: 0, visible: true },
    footer: { name: "Footer / Main", title: "NORTH/STUDIO", body: "Tokyo · Available worldwide", height: 190, direction: "row", align: "left", gap: 24, background: "#17201D", color: "#F2F0E9", radius: 0, visible: true },
  };
  return { id: `${type}-${suffix}`, type, ...presets[type] };
}

function createImportedModule(definition: FolingModuleDefinition): ModuleItem {
  return {
    id: `imported-${definition.name}-${Date.now().toString(36)}`,
    type: "imported",
    name: `FOLING / ${definition.name}`,
    eyebrow: "IMPORTED MODULE",
    title: definition.name,
    body: `${countSnapshotNodes(definition.snapshot)} elements · Foling YAML`,
    height: 220,
    direction: "column",
    align: "left",
    gap: 12,
    background: "#E8EBDD",
    color: "#17201D",
    radius: 0,
    visible: true,
    definition,
  };
}

function countSnapshotNodes(node: FolingModuleDefinition["snapshot"]): number {
  return 1 + (node.children ?? []).reduce((total, child) => total + countSnapshotNodes(child), 0);
}

const initialModules: Record<DeviceId, ModuleItem[]> = {
  desktop: [createModule("header", "header"), createModule("hero", "hero"), createModule("carousel", "work"), createModule("footer", "footer")],
  tablet: [createModule("header", "header-t"), createModule("hero", "hero-t"), createModule("cards", "cards-t"), createModule("footer", "footer-t")],
  mobile: [createModule("menu", "menu-m"), createModule("hero", "hero-m"), createModule("cards", "cards-m"), createModule("footer", "footer-m")],
};

function ModulePreview({ item, compact }: { item: ModuleItem; compact: boolean }) {
  const style = {
    minHeight: compact ? Math.max(64, item.height * 0.38) : item.height,
    background: item.background,
    color: item.color,
    borderRadius: item.radius,
    textAlign: item.align as "left" | "center" | "right",
  };

  if (item.type === "header") {
    return <div className="site-header" style={style}><strong>{item.title}</strong><span>{item.body}</span><button aria-label="Open navigation"><Menu size={17} /></button></div>;
  }
  if (item.type === "menu") {
    return <div className="site-header site-menu" style={style}><strong>NORTH/STUDIO</strong><span>{item.label}</span><Menu size={18} /></div>;
  }
  if (item.type === "logo") {
    return <div className="site-logo" style={style}><Sparkles size={18} fill="currentColor" /><strong>{item.title}</strong></div>;
  }
  if (item.type === "hero") {
    return <section className="site-hero" style={style}><div><span className="site-eyebrow">{item.eyebrow}</span><h1>{item.title?.split("\n").map((line, index) => <span key={line}>{line}{index === 0 && <br />}</span>)}</h1><p>{item.body}</p><a href={item.href}>{item.label}<ArrowRight size={14} /></a></div><div className="hero-mark"><span>N</span><small>°35.6762</small></div></section>;
  }
  if (item.type === "text") {
    return <section className="site-text" style={style}><span className="site-eyebrow">{item.eyebrow}</span><h2>{item.title}</h2><p>{item.body}</p></section>;
  }
  if (item.type === "button") {
    return <section className="site-button" style={style}><a href={item.href}>{item.label}<ArrowUp size={13} /></a></section>;
  }
  if (item.type === "carousel") {
    return <section className="site-carousel" style={style}><div className="carousel-top"><span className="site-eyebrow">{item.eyebrow}</span><span>01 / 03</span></div><div className="carousel-art"><span>FORM / FUNCTION</span><i></i><b>↗</b></div><div className="carousel-bottom"><div><h2>{item.title}</h2><p>{item.body}</p></div><div className="carousel-controls"><button><ChevronLeft size={15} /></button><button><ChevronRight size={15} /></button></div></div></section>;
  }
  if (item.type === "cards") {
    return <section className="site-cards" style={style}><span className="site-eyebrow">{item.eyebrow}</span><h2>{item.title}</h2><div className="card-row">{["01 Strategy", "02 Identity", "03 Digital"].map((card) => <article key={card}><span>{card}</span><ArrowUp size={14} /><p>Clear thinking, carefully made.</p></article>)}</div></section>;
  }
  if (item.type === "image") {
    return <section className="site-image" style={style}><ImageIcon size={30} strokeWidth={1.25} /><strong>{item.title}</strong><span>{item.body}</span></section>;
  }
  if (item.type === "imported") {
    return <section className="site-imported" style={style}><div className="imported-badge"><span className="foling-dot">F</span>Foling module</div><PackagePlus size={27} strokeWidth={1.4} /><h2>{item.title}</h2><p>{item.body}</p><small>{item.definition?.snapshot.name}</small></section>;
  }
  if (item.type === "form") {
    return <section className="site-form" style={style}><span className="site-eyebrow">{item.eyebrow}</span><h2>{item.title}</h2><div className="fake-input">Your email <ArrowRight size={14} /></div><button>{item.label}</button></section>;
  }
  return <footer className="site-footer" style={style}><div><strong>{item.title}</strong><p>{item.body}</p></div><div><span>Instagram</span><span>LinkedIn</span><span>© 2026</span></div></footer>;
}

export default function Home() {
  const nativeApp = isTauri();
  const [activeDevice, setActiveDevice] = useState<DeviceId>("desktop");
  const [modules, setModules] = useState(initialModules);
  const [customModules, setCustomModules] = useState<FolingModuleDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("hero-hero");
  const [zoom, setZoom] = useState(62);
  const [search, setSearch] = useState("");
  const [activeRail, setActiveRail] = useState<"modules" | "layers">("modules");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<"HTML" | "CSS" | "JS" | "HTFL">("HTML");
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const [folingOpen, setFolingOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const [notice, setNotice] = useState("");
  const [updateOpen, setUpdateOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<{ version: string; body?: string } | null>(null);
  const [updateMessage, setUpdateMessage] = useState("現在のバージョン: 0.2.0");
  const browserModuleInput = useRef<HTMLInputElement>(null);
  const updateRef = useRef<{ downloadAndInstall: () => Promise<void> } | null>(null);

  const activeModules = modules[activeDevice];
  const selected = activeModules.find((item) => item.id === selectedId) ?? activeModules[0];
  const filteredCatalog = moduleCatalog.filter((item) => `${item.label}${item.description}`.toLowerCase().includes(search.toLowerCase()));
  const filteredCustomModules = customModules.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!activeModules.some((item) => item.id === selectedId) && activeModules[0]) setSelectedId(activeModules[0].id);
  }, [activeDevice, activeModules, selectedId]);

  useEffect(() => {
    const stored = window.localStorage.getItem("landms-project");
    if (!stored) return;
    try {
      setModules(JSON.parse(stored) as Record<DeviceId, ModuleItem[]>);
    } catch {
      window.localStorage.removeItem("landms-project");
    }
    const storedModules = window.localStorage.getItem("landms-custom-modules");
    if (storedModules) {
      try {
        setCustomModules(JSON.parse(storedModules) as FolingModuleDefinition[]);
      } catch {
        window.localStorage.removeItem("landms-custom-modules");
      }
    }
  }, []);

  const webCode = useMemo(() => generateWebCode(activeModules), [activeModules]);
  const htflFiles = useMemo(() => generateHtflProject(activeModules), [activeModules]);
  const responsiveWebFiles = useMemo(() => generateResponsiveWebFiles(modules), [modules]);
  const generatedCode = useMemo(() => ({ ...webCode, HTFL: formatHtflPreview(htflFiles) }), [webCode, htflFiles]);

  const updateSelected = (patch: Partial<ModuleItem>) => {
    if (!selected) return;
    setModules((current) => ({ ...current, [activeDevice]: current[activeDevice].map((item) => item.id === selected.id ? { ...item, ...patch } : item) }));
    setSaved(false);
  };

  const addModule = (type: BuiltInModuleType, at?: number) => {
    const item = createModule(type);
    setModules((current) => {
      const next = [...current[activeDevice]];
      next.splice(at ?? next.length, 0, item);
      return { ...current, [activeDevice]: next };
    });
    setSelectedId(item.id);
    setSaved(false);
  };

  const addImportedModule = (definition: FolingModuleDefinition, at?: number) => {
    const item = createImportedModule(definition);
    setModules((current) => {
      const next = [...current[activeDevice]];
      next.splice(at ?? next.length, 0, item);
      return { ...current, [activeDevice]: next };
    });
    setSelectedId(item.id);
    setSaved(false);
  };

  const deleteSelected = () => {
    if (!selected) return;
    const index = activeModules.findIndex((item) => item.id === selected.id);
    const next = activeModules.filter((item) => item.id !== selected.id);
    setModules((current) => ({ ...current, [activeDevice]: next }));
    setSelectedId(next[Math.max(0, index - 1)]?.id ?? "");
    setSaved(false);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return;
    const index = activeModules.findIndex((item) => item.id === selected.id);
    const target = index + direction;
    if (target < 0 || target >= activeModules.length) return;
    const next = [...activeModules];
    [next[index], next[target]] = [next[target], next[index]];
    setModules((current) => ({ ...current, [activeDevice]: next }));
    setSaved(false);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...selected, id: `${selected.type}-${Date.now().toString(36)}`, name: `${selected.name} copy` };
    const index = activeModules.findIndex((item) => item.id === selected.id);
    setModules((current) => {
      const next = [...current[activeDevice]];
      next.splice(index + 1, 0, copy);
      return { ...current, [activeDevice]: next };
    });
    setSelectedId(copy.id);
    setSaved(false);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(generatedCode[codeTab]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportFiles = async (projectName: string, files: ExportFile[]) => {
    if (nativeApp) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const parent = await open({ directory: true, multiple: false, title: "書き出し先フォルダーを選択" });
      if (typeof parent !== "string") return;
      const destination = await invoke<string>("export_files", { parent, projectName, files });
      setNotice(`書き出しました: ${destination}`);
      return;
    }
    const archive = new JSZip();
    files.forEach((file) => archive.file(file.path, file.content));
    const blob = await archive.generateAsync({ type: "blob" });
    downloadBlob(blob, `${projectName}.zip`);
    setNotice(`${projectName}.zip を書き出しました`);
  };

  const exportWebProject = () => exportFiles("LandMs-Web", responsiveWebFiles)
    .catch((error) => setNotice(`書き出しに失敗しました: ${String(error)}`));

  const exportHtflProject = () => exportFiles("LandMs-HTFL", htflFiles)
    .catch((error) => setNotice(`HTFL書き出しに失敗しました: ${String(error)}`));

  const registerModuleSource = (source: string) => {
    const imported = parseFolingModuleFile(source);
    setCustomModules((current) => {
      const next = [...current];
      imported.forEach((module) => {
        const index = next.findIndex((existing) => existing.name === module.name);
        if (index >= 0) next[index] = module;
        else next.push(module);
      });
      window.localStorage.setItem("landms-custom-modules", JSON.stringify(next));
      return next;
    });
    setNotice(`${imported.length}件のFolingモジュールを読み込みました`);
  };

  const importModuleFlow = async () => {
    try {
      if (!nativeApp) {
        browserModuleInput.current?.click();
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        title: "Folingモジュールを読み込む",
        filters: [{ name: "Foling module", extensions: ["yaml", "yml"] }],
      });
      if (typeof path !== "string") return;
      registerModuleSource(await invoke<string>("read_module_file", { path }));
    } catch (error) {
      setNotice(`モジュールを読み込めません: ${String(error)}`);
    }
  };

  const handleBrowserModuleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      registerModuleSource(await file.text());
    } catch (error) {
      setNotice(`モジュールを読み込めません: ${String(error)}`);
    }
  };

  const checkForUpdates = async (automatic = false) => {
    if (!nativeApp) {
      if (!automatic) {
        setUpdateMessage("アップデートはTauriデスクトップ版で利用できます。");
        setUpdateOpen(true);
      }
      return;
    }
    setCheckingUpdate(true);
    if (!automatic) setUpdateOpen(true);
    setUpdateMessage("アップデートを確認しています…");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setAvailableUpdate(null);
        setUpdateMessage("LandMsは最新です（v0.2.0）。");
        return;
      }
      updateRef.current = update;
      setAvailableUpdate({ version: update.version, body: update.body ?? undefined });
      setUpdateMessage(`新しいバージョン v${update.version} を利用できます。`);
      const notifications = await import("@tauri-apps/plugin-notification");
      let permission = await notifications.isPermissionGranted();
      if (!permission) permission = (await notifications.requestPermission()) === "granted";
      if (permission) notifications.sendNotification({ title: "LandMs アップデート", body: `バージョン ${update.version} を利用できます` });
    } catch (error) {
      setUpdateMessage(`更新情報を取得できませんでした: ${String(error)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (!updateRef.current) return;
    setCheckingUpdate(true);
    setUpdateMessage("アップデートをダウンロードしてインストールしています…");
    try {
      await updateRef.current.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      setUpdateMessage(`アップデートに失敗しました: ${String(error)}`);
      setCheckingUpdate(false);
    }
  };

  const saveProject = () => {
    window.localStorage.setItem("landms-project", JSON.stringify(modules));
    setSaved(true);
  };

  useEffect(() => {
    if (!nativeApp) return;
    const timer = window.setTimeout(() => { void checkForUpdates(true); }, 1800);
    return () => window.clearTimeout(timer);
    // The update check intentionally runs once when the desktop app starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeApp]);

  return (
    <main className={`app-shell ${preview ? "preview-mode" : ""}`}>
      <header className="topbar" data-tauri-drag-region>
        <div className="brand-lockup"><div className="brand-mark"><span></span><span></span></div><strong>LandMs</strong><span className="beta">{nativeApp ? "DESKTOP" : "WEB"}</span></div>
        <div className="project-crumb"><span>Web projects</span><ChevronRight size={13} /><button>North Studio <ChevronDown size={13} /></button><span className={`save-state ${saved ? "" : "unsaved"}`}>{saved ? "保存済み" : "未保存"}</span></div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Undo"><Undo2 size={16} /></button>
          <button className="icon-button muted" aria-label="Redo"><Redo2 size={16} /></button>
          <button className={`icon-button update-button ${availableUpdate ? "has-update" : ""}`} aria-label="アップデートを確認" title="アップデートを確認" onClick={() => { void checkForUpdates(false); }}><Bell size={16} />{availableUpdate && <i></i>}</button>
          <span className="top-divider"></span>
          <button className={`tool-button ${linked ? "is-linked" : ""}`} onClick={() => setFolingOpen(true)}><span className="foling-dot">F</span>{linked ? "Foling 接続済み" : "Foling と連携"}</button>
          <button className="tool-button" onClick={() => setCodeOpen(true)}><Code2 size={16} />コード</button>
          <button className="tool-button" onClick={() => setPreview((value) => !value)}><Eye size={16} />{preview ? "編集に戻る" : "プレビュー"}</button>
          <button className="publish-button" onClick={saveProject}><Share2 size={15} />保存</button>
        </div>
      </header>
      <input ref={browserModuleInput} className="native-file-input" type="file" accept=".yaml,.yml,text/yaml" onChange={handleBrowserModuleFile} />

      {!preview && <aside className="rail">
        <button className={activeRail === "modules" ? "active" : ""} onClick={() => setActiveRail("modules")}><Component size={20} /><span>モジュール</span></button>
        <button className={activeRail === "layers" ? "active" : ""} onClick={() => setActiveRail("layers")}><Layers3 size={20} /><span>レイヤー</span></button>
        <button><Frame size={20} /><span>画面</span></button>
        <button><MessageSquareText size={20} /><span>コメント</span></button>
        <div className="rail-bottom"><button><Settings2 size={20} /><span>設定</span></button></div>
      </aside>}

      {!preview && <aside className="left-panel">
        {activeRail === "modules" ? <>
          <div className="panel-heading"><div><span className="panel-kicker">FOLING LIBRARY</span><h2>モジュール</h2></div><button className="tiny-button" title="Folingモジュールをインポート" aria-label="Folingモジュールをインポート" onClick={() => { void importModuleFlow(); }}><FileInput size={15} /></button></div>
          <label className="search-box"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="モジュールを検索" /></label>
          <div className="library-info"><span><span className="live-dot"></span>Foling Core</span><span>v0.8.4</span></div>
          <div className="module-grid">
            {filteredCatalog.map((module) => {
              const Icon = module.icon;
              return <button key={module.type} draggable onDragStart={(event) => event.dataTransfer.setData("landms/type", module.type)} onClick={() => addModule(module.type)}><span className="module-icon"><Icon size={19} strokeWidth={1.6} /></span><strong>{module.label}</strong><small>{module.description}</small><GripVertical className="drag-hint" size={13} /></button>;
            })}
          </div>
          {filteredCustomModules.length > 0 && <>
            <div className="library-info imported-library"><span><span className="live-dot"></span>Imported</span><span>{filteredCustomModules.length} modules</span></div>
            <div className="module-grid custom-module-grid">
              {filteredCustomModules.map((module) => <button key={module.name} draggable onDragStart={(event) => event.dataTransfer.setData("landms/imported", module.name)} onClick={() => addImportedModule(module)}><span className="module-icon imported-icon"><PackagePlus size={19} strokeWidth={1.6} /></span><strong>{module.name}</strong><small>{countSnapshotNodes(module.snapshot)} elements</small><GripVertical className="drag-hint" size={13} /></button>)}
            </div>
          </>}
          <div className="panel-tip"><Sparkles size={15} /><p><strong>ドラッグして配置</strong><br />クリックでも末尾に追加できます</p></div>
        </> : <>
          <div className="panel-heading"><div><span className="panel-kicker">STRUCTURE</span><h2>レイヤー</h2></div><button className="tiny-button"><Plus size={15} /></button></div>
          <div className="layer-list">
            <div className="layer-root"><ChevronDown size={14} /><Frame size={15} /><strong>{devices[activeDevice].label} / {devices[activeDevice].width}</strong></div>
            {activeModules.map((item) => <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><GripVertical size={13} /><Box size={14} /><span>{item.name}</span></button>)}
          </div>
        </>}
      </aside>}

      <section className="workspace">
        {!preview && <div className="canvas-toolbar">
          <div className="device-switcher">
            {(Object.keys(devices) as DeviceId[]).map((device) => {
              const Icon = devices[device].icon;
              return <button key={device} className={activeDevice === device ? "active" : ""} onClick={() => setActiveDevice(device)}><Icon size={15} />{devices[device].label}<span>{devices[device].width}</span></button>;
            })}
            <button className="add-screen" aria-label="Add screen"><Plus size={15} /></button>
          </div>
          <div className="canvas-tools"><button><MousePointer2 size={15} /></button><button><Frame size={15} /></button><button><AlignHorizontalDistributeCenter size={15} /></button></div>
        </div>}

        <div className="canvas-area">
          {!preview && <div className="canvas-label"><span>{devices[activeDevice].label}</span><small>{devices[activeDevice].width} × auto</small></div>}
          <div className={`page-frame device-${activeDevice}`} style={!preview ? { width: `${Math.min(devices[activeDevice].width * (zoom / 100), activeDevice === "desktop" ? 890 : 720)}px` } : undefined} onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("drag-over"); }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); const type = event.dataTransfer.getData("landms/type") as BuiltInModuleType; const importedName = event.dataTransfer.getData("landms/imported"); if (type) addModule(type); else if (importedName) { const definition = customModules.find((entry) => entry.name === importedName); if (definition) addImportedModule(definition); } }}>
            {activeModules.map((item, index) => item.visible && <div key={item.id} className={`canvas-module ${selected?.id === item.id && !preview ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }} draggable={!preview} onDragStart={(event) => event.dataTransfer.setData("landms/reorder", item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const moving = event.dataTransfer.getData("landms/reorder"); const type = event.dataTransfer.getData("landms/type") as BuiltInModuleType; const importedName = event.dataTransfer.getData("landms/imported"); if (type) return addModule(type, index); if (importedName) { const definition = customModules.find((entry) => entry.name === importedName); if (definition) addImportedModule(definition, index); return; } if (!moving || moving === item.id) return; const from = activeModules.findIndex((entry) => entry.id === moving); const next = [...activeModules]; const [moved] = next.splice(from, 1); next.splice(index, 0, moved); setModules((current) => ({ ...current, [activeDevice]: next })); setSaved(false); }}>
              {!preview && selected?.id === item.id && <div className="selection-label"><span>{item.name}</span><div><button onClick={(event) => { event.stopPropagation(); moveSelected(-1); }}><ArrowUp size={12} /></button><button onClick={(event) => { event.stopPropagation(); moveSelected(1); }}><ArrowDown size={12} /></button></div></div>}
              <ModulePreview item={item} compact={!preview} />
              {!preview && selected?.id === item.id && <><i className="handle nw"></i><i className="handle ne"></i><i className="handle sw"></i><i className="handle se"></i></>}
            </div>)}
            {!preview && <div className="drop-zone"><Plus size={16} />モジュールをここにドロップ</div>}
          </div>
        </div>
        {!preview && <div className="zoom-control"><button onClick={() => setZoom((value) => Math.max(30, value - 10))}><ZoomOut size={14} /></button><button className="zoom-value" onClick={() => setZoom(62)}>{zoom}%</button><button onClick={() => setZoom((value) => Math.min(100, value + 10))}><ZoomIn size={14} /></button><span></span><button><Frame size={14} /></button></div>}
      </section>

      {!preview && selected && <aside className="right-panel">
        <div className="inspector-heading"><div><span className="selected-type"><Box size={14} />{selected.type.toUpperCase()}</span><h2>{selected.name}</h2></div><button className="tiny-button"><MoreIcon /></button></div>
        <div className="quick-actions"><button onClick={duplicateSelected}><Copy size={14} />複製</button><button onClick={() => updateSelected({ visible: !selected.visible })}><Eye size={14} />{selected.visible ? "非表示" : "表示"}</button><button className="danger" onClick={deleteSelected}><Trash2 size={14} /></button></div>
        <InspectorSection title="レイアウト" open>
          <div className="field"><label>並び方向</label><div className="segmented"><button className={selected.direction === "row" ? "active" : ""} onClick={() => updateSelected({ direction: "row" })}><ArrowRight size={14} />横</button><button className={selected.direction === "column" ? "active" : ""} onClick={() => updateSelected({ direction: "column" })}><ArrowDown size={14} />縦</button></div></div>
          <div className="field"><label>揃え</label><div className="icon-segmented"><button className={selected.align === "left" ? "active" : ""} onClick={() => updateSelected({ align: "left" })}><AlignLeft size={15} /></button><button className={selected.align === "center" ? "active" : ""} onClick={() => updateSelected({ align: "center" })}><AlignCenter size={15} /></button><button className={selected.align === "right" ? "active" : ""} onClick={() => updateSelected({ align: "right" })}><AlignRight size={15} /></button></div></div>
          <NumberField label="高さ" value={selected.height} suffix="px" onChange={(height) => updateSelected({ height })} />
          <NumberField label="間隔" value={selected.gap} suffix="px" onChange={(gap) => updateSelected({ gap })} />
        </InspectorSection>
        <InspectorSection title="内容" open>
          {selected.eyebrow !== undefined && <TextField label="ラベル" value={selected.eyebrow} onChange={(eyebrow) => updateSelected({ eyebrow })} />}
          {selected.title !== undefined && <TextField label="見出し" value={selected.title} multiline onChange={(title) => updateSelected({ title })} />}
          {selected.body !== undefined && <TextField label="本文" value={selected.body} multiline onChange={(body) => updateSelected({ body })} />}
          {selected.label !== undefined && <TextField label="ボタン" value={selected.label} onChange={(label) => updateSelected({ label })} />}
          {selected.href !== undefined && <div className="field"><label>リンク先</label><div className="input-with-icon"><Link2 size={14} /><input value={selected.href} onChange={(event) => updateSelected({ href: event.target.value })} /></div></div>}
        </InspectorSection>
        <InspectorSection title="スタイル" open>
          <div className="color-row"><label>背景</label><div><input type="color" value={selected.background} onChange={(event) => updateSelected({ background: event.target.value })} /><input value={selected.background.toUpperCase()} onChange={(event) => updateSelected({ background: event.target.value })} /></div></div>
          <div className="color-row"><label>文字</label><div><input type="color" value={selected.color} onChange={(event) => updateSelected({ color: event.target.value })} /><input value={selected.color.toUpperCase()} onChange={(event) => updateSelected({ color: event.target.value })} /></div></div>
          <NumberField label="角丸" value={selected.radius} suffix="px" onChange={(radius) => updateSelected({ radius })} />
        </InspectorSection>
        <InspectorSection title="レスポンシブ" open>
          <div className="responsive-card"><div><Monitor size={14} /><span>この画面で表示</span></div><button className="toggle on"><span></span></button></div>
          <p className="field-help">現在の設定は {devices[activeDevice].width}px の画面だけに適用されます。</p>
        </InspectorSection>
      </aside>}

      {codeOpen && <div className="modal-backdrop" onMouseDown={() => setCodeOpen(false)}>
        <section className="code-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="modal-icon"><FileCode2 size={19} /></span><div><h2>生成コード</h2><p>{devices[activeDevice].label} · Foling モジュールから生成</p></div></div><button className="close-button" onClick={() => setCodeOpen(false)}><X size={18} /></button></header>
          <div className="code-tabs">{(["HTML", "CSS", "JS", "HTFL"] as const).map((tab) => <button key={tab} className={codeTab === tab ? "active" : ""} onClick={() => setCodeTab(tab)}>{tab}</button>)}<span></span><button className="code-action" onClick={copyCode}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "コピー済み" : "コピー"}</button><button className="code-action" onClick={() => { void exportWebProject(); }}><FolderOutput size={14} />Web一式</button><button className="code-action htfl-action" onClick={() => { void exportHtflProject(); }}><Download size={14} />HTFL</button></div>
          <pre><code>{generatedCode[codeTab]}</code></pre>
          <footer><span><span className="live-dot"></span>Foling HTFL仕様と互換</span><button onClick={() => setFolingOpen(true)}><Braces size={14} />Foling で開く</button></footer>
        </section>
      </div>}

      {folingOpen && <div className="modal-backdrop" onMouseDown={() => setFolingOpen(false)}>
        <section className="connect-modal" onMouseDown={(event) => event.stopPropagation()}>
          <button className="close-button" onClick={() => setFolingOpen(false)}><X size={18} /></button>
          <div className="connect-visual"><span className="landms-symbol"><i></i><i></i></span><span className="connect-line"><i></i></span><span className="foling-symbol">F</span></div>
          <span className="panel-kicker">CODE BRIDGE</span><h2>Foling と接続</h2><p>ビジュアルの変更とコードを同じプロジェクトで同期します。モジュール定義は双方向に確認できます。</p>
          <div className="project-select"><div><FileCode2 size={16} /><span><small>接続先プロジェクト</small><strong>north-studio / website</strong></span></div><ChevronDown size={15} /></div>
          <button className="connect-button" onClick={() => { setLinked(true); setFolingOpen(false); }}><RefreshCw size={15} />{linked ? "再同期する" : "プロジェクトを接続"}</button>
          <small className="connect-note">この初期版ではローカルのモック接続です。実際の Foling API 接続先はあとから設定できます。</small>
        </section>
      </div>}

      {updateOpen && <div className="modal-backdrop" onMouseDown={() => setUpdateOpen(false)}>
        <section className="update-modal" onMouseDown={(event) => event.stopPropagation()}>
          <button className="close-button" onClick={() => setUpdateOpen(false)}><X size={18} /></button>
          <span className={`update-visual ${availableUpdate ? "available" : ""}`}><Bell size={25} /></span>
          <span className="panel-kicker">DESKTOP UPDATE</span>
          <h2>{availableUpdate ? `LandMs ${availableUpdate.version}` : "アップデート"}</h2>
          <p>{updateMessage}</p>
          {availableUpdate?.body && <div className="release-notes">{availableUpdate.body}</div>}
          {availableUpdate ? <button className="connect-button" disabled={checkingUpdate} onClick={() => { void installUpdate(); }}><Download size={15} />{checkingUpdate ? "インストール中…" : "ダウンロードして再起動"}</button> : <button className="connect-button" disabled={checkingUpdate} onClick={() => { void checkForUpdates(false); }}><RefreshCw size={15} />{checkingUpdate ? "確認中…" : "もう一度確認"}</button>}
          <small className="connect-note">更新は署名を検証してから適用されます。Web版のデータには影響しません。</small>
        </section>
      </div>}

      {notice && <div className="app-toast"><Check size={15} /><span>{notice}</span><button aria-label="通知を閉じる" onClick={() => setNotice("")}><X size={14} /></button></div>}
    </main>
  );
}

function InspectorSection({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return <section className="inspector-section"><button className="section-title"><span>{title}</span><ChevronDown size={15} className={open ? "" : "collapsed"} /></button>{open && <div className="section-body">{children}</div>}</section>;
}

function TextField({ label, value, multiline, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) {
  return <div className="field"><label>{label}</label>{multiline ? <textarea value={value} rows={2} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function NumberField({ label, value, suffix, onChange }: { label: string; value: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="field number-field"><label>{label}</label><div><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{suffix}</span></div></div>;
}

function MoreIcon() {
  return <span className="more-icon"><i></i><i></i><i></i></span>;
}
