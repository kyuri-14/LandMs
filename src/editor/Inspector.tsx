// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Right panel. For a frame: tag, anchor, flex layout, size and style.
// For a module: size, behaviour (params), content / links of every element
// inside it, and its Foling code (editable YAML).

import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Baseline,
  Braces,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { builtinByName, type ModuleParam } from "../core/builtins";
import { configYaml, parseSnapshotYaml, snapshotYaml } from "../core/foling";
import { moduleDefinition, type HtflTree } from "../core/htfl";
import { isRowDirection } from "../core/layout";
import { frameTags } from "../core/project";
import { deepClone, duplicateSnapshotChild, findNode, mapSnapshot, moveSnapshotChild, removeSnapshotChild, snapshotAt } from "../core/tree";
import type { AlignItems, AxisSize, FlexDirection, FolingSnapshot, FrameNode, Justify, LayoutNode, ModuleNode, Project, Screen, SizeMode } from "../core/types";
import { assetResolver } from "../core/web";
import { ColorInput, Field, NumberInput, Section, Segmented, Select, TextInput, Toggle } from "./fields";
import { canHaveContent, EDITABLE_ATTRIBUTES, elementLabel, getParam, previewText, setAttribute, setContent, setParam } from "./moduleFields";
import type { Selection } from "./store";

type Props = {
  project: Project;
  screen: Screen;
  selection: Selection;
  tree: HtflTree;
  update: (id: string, change: (node: LayoutNode) => LayoutNode, key?: string) => void;
  onSelect: (id: string, path?: number[] | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPickImage: () => Promise<string | null>;
  onExportModule: (node: ModuleNode) => void;
  onShowCode: (path: string) => void;
  onError: (message: string) => void;
};

const directionOptions: Array<{ value: FlexDirection; label: React.ReactNode; title: string }> = [
  { value: "row", label: <ArrowRight size={14} />, title: "横に並べる（row）" },
  { value: "column", label: <ArrowDown size={14} />, title: "縦に並べる（column）" },
  { value: "row-reverse", label: <ArrowLeft size={14} />, title: "右から並べる（row-reverse）" },
  { value: "column-reverse", label: <ArrowUp size={14} />, title: "下から並べる（column-reverse）" },
];

const justifyOptions: Array<{ value: Justify; label: string }> = [
  { value: "flex-start", label: "先頭" },
  { value: "center", label: "中央" },
  { value: "flex-end", label: "末尾" },
  { value: "space-between", label: "両端" },
  { value: "space-around", label: "均等(周囲)" },
  { value: "space-evenly", label: "均等" },
];

const alignOptions: Array<{ value: AlignItems; label: React.ReactNode; title: string }> = [
  { value: "flex-start", label: <AlignStartHorizontal size={14} />, title: "先頭に揃える" },
  { value: "center", label: <AlignCenterHorizontal size={14} />, title: "中央に揃える" },
  { value: "flex-end", label: <AlignEndHorizontal size={14} />, title: "末尾に揃える" },
  { value: "baseline", label: <Baseline size={14} />, title: "文字のベースラインで揃える" },
];

function SizeControl({ label, size, onChange, mainAxis }: { label: string; size: AxisSize; onChange: (size: AxisSize) => void; mainAxis: boolean }) {
  return (
    <Field label={label} hint={mainAxis ? "並び方向の大きさ" : "並びと直交する方向の大きさ"}>
      <div className="size-control">
        <Segmented<SizeMode>
          compact
          value={size.mode}
          onChange={(mode) => onChange({ mode, value: mode === "fixed" && !size.value ? 200 : size.value })}
          options={[
            { value: "fill", label: "塗り", title: mainAxis ? "残りの幅をすべて使う（flex: 1）" : "親いっぱいに伸ばす（stretch）" },
            { value: "hug", label: "内容", title: "中身の大きさに合わせる" },
            { value: "fixed", label: "固定", title: "px で指定" },
          ]}
        />
        <NumberInput value={size.value} disabled={size.mode !== "fixed"} onChange={(value) => onChange({ mode: "fixed", value })} />
      </div>
    </Field>
  );
}

function Heading({ kind, name, onRename, subtitle }: { kind: string; name: string; onRename: (name: string) => void; subtitle?: string }) {
  return (
    <div className="inspector-heading">
      <span className="selected-type">{kind}</span>
      <input className="name-input" value={name} onChange={(event) => onRename(event.target.value)} aria-label="名前" />
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}

function QuickActions({ node, isRoot, onDuplicate, onDelete, onToggle, onParent }: { node: LayoutNode; isRoot: boolean; onDuplicate: () => void; onDelete: () => void; onToggle: () => void; onParent: () => void }) {
  if (isRoot) return null;
  return (
    <div className="quick-actions">
      <button onClick={onParent} title="親フレームを選択（Esc）">
        <ArrowUpToLine size={13} />親
      </button>
      <button onClick={onDuplicate} title="複製（Ctrl+D）">
        <Copy size={13} />複製
      </button>
      <button onClick={onToggle}>{node.hidden ? <><Eye size={13} />表示</> : <><EyeOff size={13} />隠す</>}</button>
      <button className="danger" onClick={onDelete} title="削除（Delete）">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function CodeSection({ path, config, onShowCode }: { path: string | undefined; config: string; onShowCode: (path: string) => void }) {
  return (
    <Section title="HTFL コード" defaultOpen={false} extra={path ? <button className="link-button" onClick={() => onShowCode(path)}><Braces size={12} />開く</button> : undefined}>
      {path && <code className="htfl-path">{path}/config.yaml</code>}
      <pre className="code-preview">{config}</pre>
    </Section>
  );
}

function FrameInspector({ frame, parent, isRoot, props }: { frame: FrameNode; parent: FrameNode | null; isRoot: boolean; props: Props }) {
  const set = (patch: Partial<FrameNode>, key?: string) => props.update(frame.id, (node) => ({ ...(node as FrameNode), ...patch }), key);
  const layout = (patch: Partial<FrameNode["layout"]>, key?: string) => set({ layout: { ...frame.layout, ...patch } }, key);
  const style = (patch: Partial<FrameNode["style"]>, key?: string) => set({ style: { ...frame.style, ...patch } }, key);
  const [linkedPadding, setLinkedPadding] = useState(frame.layout.padding.every((value) => value === frame.layout.padding[0]));
  const parentRow = parent ? isRowDirection(parent.layout.direction) : false;
  const path = props.tree.paths[frame.id];
  const snapshot = path ? findSnapshot(props.tree, path) : null;
  const sides = ["上", "右", "下", "左"];

  return (
    <>
      <Heading kind={isRoot ? `SCREEN · ${props.screen.name}` : "FRAME"} name={frame.name} onRename={(name) => set({ name }, `name-${frame.id}`)} />
      <QuickActions node={frame} isRoot={isRoot} onDuplicate={props.onDuplicate} onDelete={props.onDelete} onToggle={() => set({ hidden: !frame.hidden })} onParent={() => parent && props.onSelect(parent.id)} />
      {!isRoot && (
        <Section title="要素">
          <Field label="タグ">
            <Select value={frame.tag} options={frameTags} onChange={(tag) => set({ tag })} />
          </Field>
          <Field label="アンカー" hint="ナビのリンク先 #名前 で、この場所へ移動できます">
            <span className="prefixed-input">
              <span>#</span>
              <input value={frame.anchor} placeholder="例: contact" onChange={(event) => set({ anchor: event.target.value.replace(/[^A-Za-z0-9_-]/g, "") }, `anchor-${frame.id}`)} />
            </span>
          </Field>
          {frame.anchor && <p className="field-help warn">Folingで開いた場合、本文内の id は行番号に置き換わるため、このアンカーは効きません（Foling側の仕様）。HTML / CSS / JS 書き出しでは有効です。</p>}
        </Section>
      )}
      <Section title="レイアウト（flex）">
        <Field label="並び方向">
          <Segmented value={frame.layout.direction} options={directionOptions} onChange={(direction) => layout({ direction })} />
        </Field>
        <Field label="主軸の揃え" hint="並び方向にどう配置するか（justify-content）">
          <Select value={frame.layout.justify} options={justifyOptions} onChange={(justify) => layout({ justify })} />
        </Field>
        <Field label="交差の揃え" hint="並びと直交する方向の揃え（align-items）">
          <Segmented value={frame.layout.align} options={alignOptions} onChange={(align) => layout({ align })} />
        </Field>
        <Field label="折り返し">
          <Toggle value={frame.layout.wrap} onChange={(wrap) => layout({ wrap })} label={frame.layout.wrap ? "はみ出したら改行" : "1列に並べる"} />
        </Field>
        <Field label="間隔">
          <NumberInput value={frame.layout.gap} onChange={(gap) => layout({ gap }, `gap-${frame.id}`)} />
        </Field>
        <Field label="内側の余白">
          <div className="padding-control">
            {linkedPadding ? (
              <NumberInput value={frame.layout.padding[0]} onChange={(value) => layout({ padding: [value, value, value, value] }, `padding-${frame.id}`)} />
            ) : (
              <div className="padding-grid">
                {frame.layout.padding.map((value, index) => (
                  <label key={sides[index]}>
                    <small>{sides[index]}</small>
                    <NumberInput
                      value={value}
                      suffix=""
                      onChange={(next) => {
                        const padding = [...frame.layout.padding] as FrameNode["layout"]["padding"];
                        padding[index] = next;
                        layout({ padding }, `padding-${frame.id}-${index}`);
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
            <button className={`chip ${linkedPadding ? "active" : ""}`} onClick={() => setLinkedPadding((value) => !value)} title="上下左右をまとめて指定">
              {linkedPadding ? "一括" : "個別"}
            </button>
          </div>
        </Field>
      </Section>
      <Section title="サイズ">
        {isRoot ? (
          <p className="field-help">画面のルートは常に画面幅いっぱい・1画面分以上の高さです。編集幅は画面の設定で変更できます。</p>
        ) : (
          <>
            <SizeControl label="幅" size={frame.width} mainAxis={parentRow} onChange={(width) => set({ width }, `width-${frame.id}`)} />
            <SizeControl label="高さ" size={frame.height} mainAxis={!parentRow} onChange={(height) => set({ height }, `height-${frame.id}`)} />
          </>
        )}
      </Section>
      <Section title="スタイル">
        <Field label="背景">
          <ColorInput value={frame.style.background} allowNone="transparent" noneLabel="透明" onChange={(background) => style({ background }, `bg-${frame.id}`)} />
        </Field>
        <Field label="文字色">
          <ColorInput value={frame.style.color} allowNone="inherit" noneLabel="継承" onChange={(color) => style({ color }, `color-${frame.id}`)} />
        </Field>
        <Field label="角丸">
          <NumberInput value={frame.style.radius} onChange={(radius) => style({ radius }, `radius-${frame.id}`)} />
        </Field>
        <Field label="枠線">
          <div className="inline-pair">
            <NumberInput value={frame.style.borderWidth} max={40} onChange={(borderWidth) => style({ borderWidth }, `border-${frame.id}`)} />
            <ColorInput value={frame.style.borderColor} onChange={(borderColor) => style({ borderColor }, `border-color-${frame.id}`)} />
          </div>
        </Field>
        {!isRoot && (
          <Field label="上部に固定">
            <Toggle value={frame.style.sticky} onChange={(sticky) => style({ sticky })} label={frame.style.sticky ? "スクロールしても表示" : "固定しない"} />
          </Field>
        )}
      </Section>
      <CodeSection path={path} config={snapshot ? configYaml(snapshot.config) : ""} onShowCode={props.onShowCode} />
    </>
  );
}

function findSnapshot(tree: HtflTree, path: string): FolingSnapshot | null {
  const parts = path.split("/").slice(1);
  let current: FolingSnapshot | undefined = tree.html;
  for (const part of parts) {
    current = current?.children.find((child) => child.name === part);
    if (!current) return null;
  }
  return current ?? null;
}

function ParamField({ param, root, onChange }: { param: ModuleParam; root: FolingSnapshot; onChange: (value: string) => void }) {
  const value = getParam(root, param);
  if (param.kind === "attr" && param.input === "boolean") {
    return (
      <Field label={param.label} hint={param.help}>
        <Toggle value={value !== "false" && value !== ""} onChange={(next) => onChange(next ? "true" : "false")} label={value !== "false" && value !== "" ? "オン" : "オフ"} />
      </Field>
    );
  }
  if ((param.kind === "attr" && param.input === "select") || param.kind === "tag" || param.kind === "class" || param.kind === "style") {
    const options = param.options ?? [];
    return (
      <Field label={param.label}>
        <Select value={value} options={options.some((option) => option.value === value) ? options : [...options, { value, label: value }]} onChange={onChange} />
      </Field>
    );
  }
  return (
    <Field label={param.label} hint={param.kind === "attr" ? param.help : undefined}>
      {param.kind === "attr" && param.input === "number" ? (
        <NumberInput value={Number(value) || 0} max={600000} suffix="ms" onChange={(next) => onChange(String(next))} />
      ) : (
        <TextInput value={value} onChange={onChange} />
      )}
      {param.kind === "attr" && param.help && <p className="field-help">{param.help}</p>}
    </Field>
  );
}

function ImageField({ value, project, onChange, onPick }: { value: string; project: Project; onChange: (value: string) => void; onPick: () => Promise<string | null> }) {
  const resolve = useMemo(() => assetResolver(project), [project]);
  const isData = value.startsWith("data:");
  return (
    <div className="image-field">
      <img src={resolve(value)} alt="" />
      <div>
        <button
          className="ghost-button small"
          onClick={async () => {
            const src = await onPick();
            if (src) onChange(src);
          }}
        >
          <ImagePlus size={13} />
          画像を選択
        </button>
        <input className="mono" value={isData ? "" : value} placeholder={isData ? "（サンプル画像）URL を入力" : "https://… または images/…"} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  );
}

function ElementRow({
  node,
  path,
  depth,
  module,
  props,
  focus,
}: {
  node: FolingSnapshot;
  path: number[];
  depth: number;
  module: ModuleNode;
  props: Props;
  focus: string | null;
}) {
  const key = path.join(".");
  const focused = focus === key;
  const [open, setOpen] = useState(depth < 1 || focused);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) {
      setOpen(true);
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focused]);
  const change = (update: (node: FolingSnapshot) => FolingSnapshot | null, editKey?: string) =>
    props.update(module.id, (current) => ({ ...(current as ModuleNode), snapshot: mapSnapshot((current as ModuleNode).snapshot, path, update) }), editKey);
  const structural = (update: (root: FolingSnapshot) => FolingSnapshot) => props.update(module.id, (current) => ({ ...(current as ModuleNode), snapshot: update((current as ModuleNode).snapshot) }));
  const attributes = EDITABLE_ATTRIBUTES.filter((attribute) => node.config.attributes?.[attribute.key] !== undefined);
  const contentEditable = canHaveContent(node);
  const hasFields = contentEditable || attributes.length > 0;
  const isRoot = path.length === 0;

  return (
    <div className={`element-row depth-${Math.min(depth, 4)}`} ref={rowRef}>
      <div className={`element-head ${focused ? "focused" : ""}`} style={{ paddingLeft: depth * 12 }}>
        <button className="element-toggle" onClick={() => setOpen((value) => !value)} disabled={!hasFields && !node.children.length}>
          {hasFields || node.children.length ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span />}
        </button>
        <button className="element-name" onClick={() => props.onSelect(module.id, path)}>
          <strong>{elementLabel(node)}</strong>
          <span>{previewText(node)}</span>
        </button>
        {!isRoot && (
          <span className="element-actions">
            <button title="上へ" onClick={() => structural((root) => moveSnapshotChild(root, path, -1))}>
              <ArrowUp size={11} />
            </button>
            <button title="下へ" onClick={() => structural((root) => moveSnapshotChild(root, path, 1))}>
              <ArrowDown size={11} />
            </button>
            <button title="この要素を複製（項目を増やす）" onClick={() => structural((root) => duplicateSnapshotChild(root, path))}>
              <Copy size={11} />
            </button>
            <button title="この要素を削除" className="danger" onClick={() => structural((root) => removeSnapshotChild(root, path))}>
              <Trash2 size={11} />
            </button>
          </span>
        )}
      </div>
      {open && hasFields && (
        <div className="element-fields" style={{ marginLeft: depth * 12 + 18 }}>
          {contentEditable && (node.config.content !== undefined || node.children.length === 0) && (
            <TextInput value={node.config.content ?? ""} multiline={(node.config.content ?? "").length > 40 || (node.config.content ?? "").includes("\n")} placeholder="テキスト" onChange={(value) => change((current) => setContent(current, value), `content-${module.id}-${key}`)} />
          )}
          {attributes.map((attribute) => (
            <div key={attribute.key} className="attribute-field">
              <small>{attribute.label}</small>
              {attribute.kind === "image" ? (
                <ImageField value={node.config.attributes![attribute.key]} project={props.project} onPick={props.onPickImage} onChange={(value) => change((current) => setAttribute(current, attribute.key, value), `attr-${module.id}-${key}-${attribute.key}`)} />
              ) : attribute.kind === "link" ? (
                <span className="prefixed-input">
                  <Link2 size={12} />
                  <input value={node.config.attributes![attribute.key]} placeholder="https://… / #section / page.html" onChange={(event) => change((current) => setAttribute(current, attribute.key, event.target.value), `attr-${module.id}-${key}-${attribute.key}`)} />
                </span>
              ) : (
                <input value={node.config.attributes![attribute.key]} onChange={(event) => change((current) => setAttribute(current, attribute.key, event.target.value), `attr-${module.id}-${key}-${attribute.key}`)} />
              )}
            </div>
          ))}
        </div>
      )}
      {open && node.children.map((child, index) => <ElementRow key={`${key}.${index}`} node={child} path={[...path, index]} depth={depth + 1} module={module} props={props} focus={focus} />)}
    </div>
  );
}

function ModuleCode({ module, props }: { module: ModuleNode; props: Props }) {
  const source = useMemo(() => snapshotYaml(module.snapshot), [module.snapshot]);
  const [draft, setDraft] = useState(source);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(source);
    setError("");
  }, [source]);
  const def = moduleDefinition(props.project, module.module);
  return (
    <Section title="Foling コード" defaultOpen={false} extra={props.tree.paths[module.id] ? <button className="link-button" onClick={() => props.onShowCode(props.tree.paths[module.id])}><Braces size={12} />HTFLで見る</button> : undefined}>
      <p className="field-help">このモジュールの中身（Foling の snapshot 形式）。直接編集して適用できます。</p>
      <textarea className="mono code-editor" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} rows={12} />
      {error && <p className="field-help error">{error}</p>}
      <div className="button-row">
        <button
          className="ghost-button small"
          disabled={draft === source}
          onClick={() => {
            try {
              const snapshot = parseSnapshotYaml(draft);
              props.update(module.id, (current) => ({ ...(current as ModuleNode), snapshot }));
              setError("");
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
            }
          }}
        >
          適用
        </button>
        <button className="ghost-button small" disabled={draft === source} onClick={() => setDraft(source)}>
          取り消し
        </button>
        <button className="ghost-button small" onClick={() => props.onExportModule(module)}>
          <Download size={13} />
          モジュールとして書き出す
        </button>
      </div>
      {def?.css && (
        <>
          <small className="code-label">モジュールの CSS（classes/ に書き出されます）</small>
          <pre className="code-preview">{def.css}</pre>
        </>
      )}
    </Section>
  );
}

function ModuleInspector({ module, parent, props }: { module: ModuleNode; parent: FrameNode | null; props: Props }) {
  const builtin = builtinByName[module.module];
  const def = moduleDefinition(props.project, module.module);
  const set = (patch: Partial<ModuleNode>, key?: string) => props.update(module.id, (node) => ({ ...(node as ModuleNode), ...patch }), key);
  const parentRow = parent ? isRowDirection(parent.layout.direction) : false;
  const params: ModuleParam[] = builtin
    ? builtin.params
    : Object.keys(module.snapshot.config.attributes ?? {})
        .filter((key) => key.startsWith("data-"))
        .map((key) => ({ kind: "attr" as const, key, label: key.replace(/^data-/, ""), input: "text" as const }));
  const focus = props.selection.id === module.id && props.selection.path ? props.selection.path.join(".") : null;
  const isModified = def ? JSON.stringify(def.snapshot) !== JSON.stringify(module.snapshot) : false;

  return (
    <>
      <Heading kind={`MODULE · ${module.module}`} name={module.name} onRename={(name) => set({ name }, `name-${module.id}`)} subtitle={builtin ? "LandMs 標準モジュール（Foling形式）" : "Foling からインポート"} />
      <QuickActions node={module} isRoot={false} onDuplicate={props.onDuplicate} onDelete={props.onDelete} onToggle={() => set({ hidden: !module.hidden })} onParent={() => parent && props.onSelect(parent.id)} />
      <Section title="サイズ">
        <SizeControl label="幅" size={module.width} mainAxis={parentRow} onChange={(width) => set({ width }, `width-${module.id}`)} />
        <SizeControl label="高さ" size={module.height} mainAxis={!parentRow} onChange={(height) => set({ height }, `height-${module.id}`)} />
      </Section>
      {params.length > 0 && (
        <Section title="動作・表示">
          {params.map((param, index) => (
            <ParamField key={index} param={param} root={module.snapshot} onChange={(value) => set({ snapshot: setParam(module.snapshot, param, value) }, `param-${module.id}-${index}`)} />
          ))}
        </Section>
      )}
      <Section
        title="内容・リンク"
        extra={
          isModified && def ? (
            <button className="link-button" title="モジュールの初期状態に戻す" onClick={() => set({ snapshot: deepClone(def.snapshot) })}>
              <RotateCcw size={12} />
              初期化
            </button>
          ) : undefined
        }
      >
        <div className="element-tree">
          <ElementRow node={module.snapshot} path={[]} depth={0} module={module} props={props} focus={focus} />
        </div>
        <p className="field-help">キャンバス上で要素をクリックすると、ここで該当する項目が開きます。項目の複製・削除でメニューやスライドの数を変えられます。</p>
      </Section>
      <ModuleCode module={module} props={props} />
      {props.selection.path && props.selection.path.length > 0 && snapshotAt(module.snapshot, props.selection.path) === null && <p className="field-help">選択した要素は見つかりません。</p>}
    </>
  );
}

export function Inspector(props: Props) {
  const { screen, selection } = props;
  const location = selection.id ? findNode(screen.root, selection.id) : null;
  if (!location) {
    return (
      <div className="inspector-empty">
        <p>キャンバスかレイヤーで要素を選ぶと、ここでレイアウトや内容を編集できます。</p>
        <button className="ghost-button" onClick={() => props.onSelect(screen.root.id)}>
          画面全体を選択
        </button>
      </div>
    );
  }
  return location.node.kind === "frame" ? (
    <FrameInspector key={location.node.id} frame={location.node} parent={location.parent} isRoot={location.node.id === screen.root.id} props={props} />
  ) : (
    <ModuleInspector key={location.node.id} module={location.node} parent={location.parent} props={props} />
  );
}
