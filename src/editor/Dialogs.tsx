// SPDX-License-Identifier: AGPL-3.0-or-later
// Modal dialogs: generated code, screen settings, Foling bridge, settings & updates.

import { Bell, Check, Copy, Download, ExternalLink, FileCode2, FileInput, FolderInput, FolderOutput, Monitor, PackagePlus, RefreshCw, Smartphone, Tablet, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { describeCondition, validateScreens, type ScreenIssue } from "../core/screens";
import type { OutputFile, Project, Screen, ScreenIcon } from "../core/types";
import { SOURCE_URL, isDesktop, openExternal } from "../platform";
import { Field, NullableNumberInput, NumberInput, Segmented, TextInput, Toggle, ColorInput } from "./fields";

export function Modal({ title, subtitle, icon, onClose, children, wide, dark, footer }: { title: string; subtitle?: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; dark?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className={`modal ${wide ? "wide" : ""} ${dark ? "dark" : ""}`} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label={title}>
        <header>
          <div>
            {icon && <span className="modal-icon">{icon}</span>}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button className="close-button" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

// ---------- code ----------

export type CodeTab = "HTML" | "CSS" | "JS" | "HTFL" | "Foling";

type CodeProps = {
  web: { html: string; css: string; js: string };
  htfl: OutputFile[];
  folingHtml: string;
  initialTab: CodeTab;
  initialFile?: string;
  onClose: () => void;
  onExport: (kind: "web" | "single" | "htfl" | "modules") => void;
};

export function CodeDialog({ web, htfl, folingHtml, initialTab, initialFile, onClose, onExport }: CodeProps) {
  const [tab, setTab] = useState<CodeTab>(initialTab);
  const textFiles = htfl.filter((file) => file.encoding !== "base64" && file.content.trim());
  const [file, setFile] = useState(() => (initialFile && textFiles.find((entry) => entry.path === initialFile) ? initialFile : textFiles[0]?.path ?? ""));
  const [copied, setCopied] = useState(false);
  const current = tab === "HTML" ? web.html : tab === "CSS" ? web.css : tab === "JS" ? web.js || "// このページにスクリプトを持つモジュールはありません。" : tab === "Foling" ? folingHtml : textFiles.find((entry) => entry.path === file)?.content ?? "";
  const descriptions: Record<CodeTab, string> = {
    HTML: "index.html — 全画面ぶんのHTML。表示はCSSのメディアクエリで切り替わります",
    CSS: "style.css — リセット、テーマ、モジュールCSS、レイアウト",
    JS: "main.js — モジュールの動作（メニューの開閉、スライドなど）",
    HTFL: "Foling の HTFL プロジェクト（フォルダー構造と config.yaml）",
    Foling: "Foling が上の HTFL から生成する HTML（Foling の RUN と同じ結果）",
  };

  const copy = async () => {
    await navigator.clipboard.writeText(current);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Modal title="生成コード" subtitle={descriptions[tab]} icon={<FileCode2 size={18} />} onClose={onClose} wide dark
      footer={
        <>
          <span className="footer-note">HTFL は Foling の「プロジェクトフォルダを選択」でそのまま開けます。</span>
          <div className="button-row">
            <button className="dark-button" onClick={() => onExport("web")}><FolderOutput size={14} />HTML / CSS / JS</button>
            <button className="dark-button" onClick={() => onExport("single")}><Download size={14} />1ファイルHTML</button>
            <button className="accent-button" onClick={() => onExport("htfl")}><FolderOutput size={14} />HTFL プロジェクト</button>
          </div>
        </>
      }>
      <div className="code-tabs">
        {(["HTML", "CSS", "JS", "HTFL", "Foling"] as CodeTab[]).map((name) => (
          <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>
            {name === "Foling" ? "Foling 出力" : name}
          </button>
        ))}
        <span />
        <button className="code-action" onClick={() => void copy()}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <div className={`code-body ${tab === "HTFL" ? "with-files" : ""}`}>
        {tab === "HTFL" && (
          <nav className="file-list">
            {textFiles.map((entry) => {
              const depth = entry.path.split("/").length - 1;
              return (
                <button key={entry.path} className={entry.path === file ? "active" : ""} style={{ paddingLeft: 10 + depth * 9 }} onClick={() => setFile(entry.path)} title={entry.path}>
                  {entry.path.split("/").slice(-2).join("/")}
                </button>
              );
            })}
          </nav>
        )}
        <pre>
          <code>{current}</code>
        </pre>
      </div>
    </Modal>
  );
}

// ---------- screens ----------

const screenIcons: Record<ScreenIcon, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone, custom: Monitor };

export function ScreenIcon({ icon, size = 14 }: { icon: ScreenIcon; size?: number }) {
  const Icon = screenIcons[icon];
  return <Icon size={size} />;
}

type ScreenDialogProps = {
  project: Project;
  screen: Screen | null;
  onClose: () => void;
  onSave: (screen: Screen, copyFrom: string | null) => void;
  onDelete: (id: string) => void;
  createDraft: () => Screen;
};

export function ScreenDialog({ project, screen, onClose, onSave, onDelete, createDraft }: ScreenDialogProps) {
  const [draft, setDraft] = useState<Screen>(() => screen ?? createDraft());
  const [copyFrom, setCopyFrom] = useState<string>(screen ? "" : project.screens[project.screens.length - 1]?.id ?? "");
  const others = project.screens.filter((item) => item.id !== draft.id);
  const issues: ScreenIssue[] = useMemo(() => validateScreens([...others, draft]).filter((issue) => issue.screenIds.includes(draft.id) || issue.screenIds.length === 0), [others, draft]);
  const set = (patch: Partial<Screen>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Modal title={screen ? "画面の設定" : "画面を追加"} subtitle="この画面を表示する条件（ビューポートの幅）と編集幅" onClose={onClose}
      footer={
        <>
          {screen && project.screens.length > 1 ? (
            <button className="danger-button" onClick={() => onDelete(screen.id)}>
              <Trash2 size={14} />
              この画面を削除
            </button>
          ) : <span />}
          <div className="button-row">
            <button className="ghost-button" onClick={onClose}>キャンセル</button>
            <button className="primary-button" onClick={() => onSave(draft, screen ? null : copyFrom || null)}>{screen ? "保存" : "追加"}</button>
          </div>
        </>
      }>
      <div className="form-grid">
        <Field label="名前">
          <TextInput value={draft.name} onChange={(name) => set({ name })} />
        </Field>
        <Field label="アイコン">
          <Segmented<ScreenIcon>
            value={draft.icon}
            onChange={(icon) => set({ icon })}
            options={[
              { value: "desktop", label: <Monitor size={14} />, title: "デスクトップ" },
              { value: "tablet", label: <Tablet size={14} />, title: "タブレット" },
              { value: "mobile", label: <Smartphone size={14} />, title: "スマートフォン" },
            ]}
          />
        </Field>
        <Field label="表示条件">
          <div className="inline-pair">
            <NullableNumberInput value={draft.minWidth} onChange={(minWidth) => set({ minWidth })} placeholder="下限なし" />
            <span className="range-sep">〜</span>
            <NullableNumberInput value={draft.maxWidth} onChange={(maxWidth) => set({ maxWidth })} placeholder="上限なし" />
          </div>
        </Field>
        <p className="field-help">{describeCondition(draft)}のときに表示します（CSS: <code>@media</code>）。</p>
        <Field label="編集幅">
          <NumberInput value={draft.canvasWidth} min={240} max={3840} onChange={(canvasWidth) => set({ canvasWidth })} />
        </Field>
        <Field label="画面の高さ">
          <NumberInput value={draft.canvasHeight} min={320} max={3000} onChange={(canvasHeight) => set({ canvasHeight })} />
        </Field>
        {!screen && (
          <Field label="中身">
            <select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>
              <option value="">空の画面（ヘッダー・メイン・フッター）</option>
              {project.screens.map((item) => (
                <option key={item.id} value={item.id}>
                  「{item.name}」を複製
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issue-list">
          {issues.map((issue, index) => (
            <li key={index} className={issue.level}>
              <TriangleAlert size={14} />
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ---------- Foling bridge ----------

type FolingProps = {
  onClose: () => void;
  onImportFiles: () => void;
  onImportProject: () => void;
  onExportHtfl: () => void;
  onExportModules: () => void;
  importedCount: number;
};

export function FolingDialog({ onClose, onImportFiles, onImportProject, onExportHtfl, onExportModules, importedCount }: FolingProps) {
  return (
    <Modal title="Foling と連携" subtitle="ファイルを介した双方向のやり取り（Foling 0.12 の HTFL 仕様に準拠）" icon={<span className="foling-mark">F</span>} onClose={onClose}>
      <div className="bridge-grid">
        <div className="bridge-column">
          <h3>Foling → LandMs</h3>
          <button className="bridge-action" onClick={onImportProject}>
            <FolderInput size={18} />
            <span>
              <strong>Foling プロジェクトから読み込む</strong>
              <small>フォルダーを選ぶと modules/ のモジュールをすべて取り込みます</small>
            </span>
          </button>
          <button className="bridge-action" onClick={onImportFiles}>
            <FileInput size={18} />
            <span>
              <strong>モジュールファイルを読み込む</strong>
              <small>Foling の「モジュールとして保存」で作った .yaml</small>
            </span>
          </button>
          <p className="field-help">読み込み済み: {importedCount} 件。左パネルの「インポート済み」から配置できます。</p>
        </div>
        <div className="bridge-column">
          <h3>LandMs → Foling</h3>
          <button className="bridge-action accent" onClick={onExportHtfl}>
            <FolderOutput size={18} />
            <span>
              <strong>HTFL プロジェクトとして書き出す</strong>
              <small>Foling の「プロジェクトフォルダを選択」でそのまま開けます</small>
            </span>
          </button>
          <button className="bridge-action" onClick={onExportModules}>
            <PackagePlus size={18} />
            <span>
              <strong>使用モジュールを書き出す</strong>
              <small>Foling の FILE → Import module file… で読み込めます</small>
            </span>
          </button>
        </div>
      </div>
      <p className="field-help">コードは上部の「コード」で HTML / CSS / JS / HTFL / Foling 出力をいつでも確認できます。HTFL の Foling 出力は Foling 本体のビルド結果と一致することをテストで確認しています。</p>
    </Modal>
  );
}

// ---------- settings & updates ----------

type SettingsProps = {
  project: Project;
  version: string;
  autoUpdate: boolean;
  onAutoUpdate: (value: boolean) => void;
  onChange: (update: (project: Project) => Project, key?: string) => void;
  onCheckUpdate: () => void;
  onClose: () => void;
};

export function SettingsDialog({ project, version, autoUpdate, onAutoUpdate, onChange, onCheckUpdate, onClose }: SettingsProps) {
  const head = (patch: Partial<Project["head"]>, key: string) => onChange((current) => ({ ...current, head: { ...current.head, ...patch } }), key);
  const variable = (name: string, value: string) => onChange((current) => ({ ...current, variables: { ...current.variables, [name]: value } }), `var-${name}`);
  return (
    <Modal title="設定" subtitle="プロジェクトの情報とアプリの設定" onClose={onClose} wide>
      <div className="settings-grid">
        <section>
          <h3>サイト</h3>
          <Field label="プロジェクト名">
            <TextInput value={project.name} onChange={(name) => onChange((current) => ({ ...current, name }), "project-name")} />
          </Field>
          <Field label="タイトル">
            <TextInput value={project.head.title} onChange={(title) => head({ title }, "head-title")} />
          </Field>
          <Field label="説明文">
            <TextInput value={project.head.description} multiline onChange={(description) => head({ description }, "head-description")} />
          </Field>
          <Field label="言語">
            <TextInput value={project.head.lang} onChange={(lang) => head({ lang }, "head-lang")} placeholder="ja" />
          </Field>
          <Field label="テーマ色">
            <ColorInput value={project.head.themeColor} onChange={(themeColor) => head({ themeColor }, "head-theme")} />
          </Field>
          <h3>テーマ（HTFL 変数）</h3>
          <Field label="文字 $colorInk">
            <ColorInput value={project.variables.colorInk ?? ""} onChange={(value) => variable("colorInk", value)} />
          </Field>
          <Field label="背景 $colorPaper">
            <ColorInput value={project.variables.colorPaper ?? ""} onChange={(value) => variable("colorPaper", value)} />
          </Field>
          <Field label="強調 $colorAccent">
            <ColorInput value={project.variables.colorAccent ?? ""} onChange={(value) => variable("colorAccent", value)} />
          </Field>
          <Field label="CSSリセット">
            <Toggle value={project.cssReset} onChange={(cssReset) => onChange((current) => ({ ...current, cssReset }))} label="Foling と同じリセットを使う" />
          </Field>
        </section>
        <section>
          <h3>アプリ</h3>
          <dl className="about-list">
            <dt>バージョン</dt>
            <dd>LandMs {version}（{isDesktop ? "デスクトップ版" : "Web版"}）</dd>
            <dt>ライセンス</dt>
            <dd>GNU AGPL v3.0 or later</dd>
            <dt>ソースコード</dt>
            <dd>
              <button className="link-button" onClick={() => void openExternal(SOURCE_URL)}>
                {SOURCE_URL.replace("https://", "")}
                <ExternalLink size={12} />
              </button>
            </dd>
          </dl>
          {isDesktop && (
            <>
              <Field label="自動確認">
                <Toggle value={autoUpdate} onChange={onAutoUpdate} label="起動時と6時間ごとに更新を確認" />
              </Field>
              <button className="ghost-button" onClick={onCheckUpdate}>
                <RefreshCw size={14} />
                今すぐ更新を確認
              </button>
            </>
          )}
          <p className="field-help">LandMs は AGPL のフリーソフトウェアです。改変版をネットワーク越しに提供する場合は、利用者にソースコードを提供してください。</p>
        </section>
      </div>
    </Modal>
  );
}

export type UpdateState =
  | { status: "idle"; message: string }
  | { status: "checking" }
  | { status: "available"; version: string; notes: string }
  | { status: "installing"; progress: number | null }
  | { status: "error"; message: string };

export function UpdateDialog({ state, version, onCheck, onInstall, onClose }: { state: UpdateState; version: string; onCheck: () => void; onInstall: () => void; onClose: () => void }) {
  return (
    <Modal title="アップデート" subtitle={`現在のバージョン: ${version}`} icon={<Bell size={18} />} onClose={onClose}>
      <div className="update-body">
        {state.status === "checking" && <p>更新を確認しています…</p>}
        {state.status === "idle" && <p>{state.message}</p>}
        {state.status === "error" && <p className="error">{state.message}</p>}
        {state.status === "available" && (
          <>
            <p>
              新しいバージョン <strong>v{state.version}</strong> を利用できます。
            </p>
            {state.notes && <div className="release-notes">{state.notes}</div>}
          </>
        )}
        {state.status === "installing" && <p>ダウンロードしてインストールしています… {state.progress !== null ? `${state.progress}%` : ""}</p>}
        <div className="button-row">
          {state.status === "available" ? (
            <button className="primary-button" onClick={onInstall}>
              <Download size={14} />
              ダウンロードして再起動
            </button>
          ) : (
            <button className="ghost-button" disabled={state.status === "checking" || state.status === "installing"} onClick={onCheck}>
              <RefreshCw size={14} />
              もう一度確認
            </button>
          )}
        </div>
        <p className="field-help">更新は署名を検証してから適用されます。保存していない変更は再起動前に保存してください。</p>
      </div>
    </Modal>
  );
}
