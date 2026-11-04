// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Left panel: the module library (drag onto the canvas or click to add) and
// the layer tree (select, show/hide, drag to reorder or re-parent).

import {
  ArrowDownToLine,
  ArrowRightToLine,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Columns3,
  Copyright,
  Eye,
  EyeOff,
  FileInput,
  Frame,
  GalleryHorizontal,
  GripVertical,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Menu,
  Minus,
  MousePointerClick,
  MoveVertical,
  Navigation,
  PackagePlus,
  PanelBottom,
  PanelTop,
  Rows3,
  Search,
  Share2,
  Sparkles,
  TextCursorInput,
  Trash2,
  Type,
  WrapText,
} from "lucide-react";
import { useMemo, useState, type MutableRefObject } from "react";
import { builtinModules, categoryLabels, type ModuleCategory } from "../core/builtins";
import { countElements } from "../core/foling";
import { framePresets, type FramePreset } from "../core/project";
import { findNode, isDescendant } from "../core/tree";
import type { FrameNode, LayoutNode, Project, Screen } from "../core/types";
import type { DragPayload, DropTarget } from "./Canvas";
import type { Selection } from "./store";

export const moduleIcons: Record<string, typeof Box> = {
  sparkles: Sparkles,
  navigation: Navigation,
  menu: Menu,
  "share-2": Share2,
  "layout-template": LayoutTemplate,
  heading: Heading,
  type: Type,
  "mouse-pointer-click": MousePointerClick,
  "layout-grid": LayoutGrid,
  "circle-help": CircleHelp,
  "gallery-horizontal": GalleryHorizontal,
  image: ImageIcon,
  "text-cursor-input": TextCursorInput,
  copyright: Copyright,
  "move-vertical": MoveVertical,
  minus: Minus,
};

const frameIcons: Record<FramePreset, typeof Box> = {
  row: Columns3,
  column: Rows3,
  header: PanelTop,
  main: Frame,
  section: Frame,
  footer: PanelBottom,
  grid: WrapText,
};

type LibraryProps = {
  project: Project;
  drag: MutableRefObject<DragPayload | null>;
  onAddModule: (name: string) => void;
  onAddFrame: (preset: FramePreset) => void;
  onImport: () => void;
  onRemoveImported: (name: string) => void;
};

function startDrag(event: React.DragEvent, drag: MutableRefObject<DragPayload | null>, payload: DragPayload) {
  drag.current = payload;
  event.dataTransfer.setData("text/plain", "landms");
  event.dataTransfer.effectAllowed = "copyMove";
}

export function Library({ project, drag, onAddModule, onAddFrame, onImport, onRemoveImported }: LibraryProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const imported = Object.values(project.modules).filter((entry) => entry.source === "imported" && matches(entry.def.name));
  const categories = Object.keys(categoryLabels) as ModuleCategory[];

  return (
    <div className="library">
      <label className="search-box">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="モジュールを検索" />
      </label>

      <h3 className="library-heading">
        <span>レイアウト</span>
        <small>flex で並べる枠</small>
      </h3>
      <div className="module-grid">
        {framePresets
          .filter((preset) => matches(`${preset.label}${preset.description}`))
          .map((preset) => {
            const Icon = frameIcons[preset.preset];
            return (
              <button
                key={preset.preset}
                className="module-card frame-card"
                draggable
                onDragStart={(event) => startDrag(event, drag, { kind: "frame", preset: preset.preset })}
                onDragEnd={() => (drag.current = null)}
                onClick={() => onAddFrame(preset.preset)}
                title={preset.description}
              >
                <span className="module-icon">
                  <Icon size={17} strokeWidth={1.6} />
                </span>
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </button>
            );
          })}
      </div>

      {categories.map((category) => {
        const modules = builtinModules.filter((module) => module.category === category && matches(`${module.label}${module.description}${module.def.name}`));
        if (!modules.length) return null;
        return (
          <div key={category}>
            <h3 className="library-heading">
              <span>{categoryLabels[category]}</span>
            </h3>
            <div className="module-grid">
              {modules.map((module) => {
                const Icon = moduleIcons[module.icon] ?? Box;
                return (
                  <button
                    key={module.def.name}
                    className="module-card"
                    draggable
                    onDragStart={(event) => startDrag(event, drag, { kind: "module", name: module.def.name })}
                    onDragEnd={() => (drag.current = null)}
                    onClick={() => onAddModule(module.def.name)}
                    title={`Folingモジュール「${module.def.name}」`}
                  >
                    <span className="module-icon">
                      <Icon size={17} strokeWidth={1.6} />
                    </span>
                    <strong>{module.label}</strong>
                    <small>{module.description}</small>
                    <GripVertical className="drag-hint" size={12} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <h3 className="library-heading">
        <span>インポート済み</span>
        <button className="link-button" onClick={onImport}>
          <FileInput size={13} />
          読み込む
        </button>
      </h3>
      {imported.length ? (
        <div className="module-grid">
          {imported.map((entry) => (
            <div key={entry.def.name} className="module-card imported" draggable onDragStart={(event) => startDrag(event, drag, { kind: "module", name: entry.def.name })} onDragEnd={() => (drag.current = null)}>
              <button className="module-card-body" onClick={() => onAddModule(entry.def.name)} title={entry.origin ? `読み込み元: ${entry.origin}` : undefined}>
                <span className="module-icon imported-icon">
                  <PackagePlus size={17} strokeWidth={1.6} />
                </span>
                <strong>{entry.def.name}</strong>
                <small>{countElements(entry.def.snapshot)} 要素</small>
              </button>
              <button className="remove-module" title="ライブラリから外す" onClick={() => onRemoveImported(entry.def.name)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-tip">
          FolingのモジュールYAML（<code>modules/*.yaml</code>）を読み込むと、ここから配置できます。
        </p>
      )}
    </div>
  );
}

// ---------- layers ----------

type LayersProps = {
  screen: Screen;
  selection: Selection;
  drag: MutableRefObject<DragPayload | null>;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDrop: (target: DropTarget, payload: DragPayload) => void;
};

type DropHint = { id: string; position: "before" | "after" | "inside" } | null;

export function Layers({ screen, selection, drag, onSelect, onToggleHidden, onRename, onDrop }: LayersProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const ancestors = useMemo(() => {
    const set = new Set<string>();
    if (!selection.id) return set;
    let location = findNode(screen.root, selection.id);
    while (location?.parent) {
      set.add(location.parent.id);
      location = findNode(screen.root, location.parent.id);
    }
    return set;
  }, [screen.root, selection.id]);

  const resolveDrop = (node: LayoutNode, position: "before" | "after" | "inside"): DropTarget | null => {
    if (position === "inside" && node.kind === "frame") return { parentId: node.id, index: node.children.length };
    const location = findNode(screen.root, node.id);
    if (!location?.parent) return node.kind === "frame" ? { parentId: node.id, index: node.children.length } : null;
    return { parentId: location.parent.id, index: location.index + (position === "after" ? 1 : 0) };
  };

  const row = (node: LayoutNode, depth: number): React.ReactNode => {
    const isRoot = node.id === screen.root.id;
    const isFrame = node.kind === "frame";
    const open = isFrame && (!collapsed.has(node.id) || ancestors.has(node.id));
    const Icon = isFrame ? ((node as FrameNode).layout.direction.startsWith("row") ? ArrowRightToLine : ArrowDownToLine) : Box;
    const hintClass = hint?.id === node.id ? `drop-${hint.position}` : "";
    return (
      <div key={node.id} className="layer-group">
        <div
          className={`layer-row ${selection.id === node.id ? "selected" : ""} ${node.hidden ? "is-hidden" : ""} ${hintClass}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={!isRoot}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => setEditing(node.id)}
          onDragStart={(event) => {
            drag.current = { kind: "move", id: node.id };
            event.dataTransfer.setData("text/plain", "landms");
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            drag.current = null;
            setHint(null);
          }}
          onDragOver={(event) => {
            const payload = drag.current;
            if (!payload) return;
            if (payload.kind === "move" && (payload.id === node.id || isDescendant(screen.root, payload.id, node.id))) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - rect.top) / rect.height;
            const position = isRoot ? "inside" : isFrame ? (ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside") : ratio < 0.5 ? "before" : "after";
            setHint({ id: node.id, position });
          }}
          onDragLeave={() => setHint((current) => (current?.id === node.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            const payload = drag.current;
            const position = hint?.id === node.id ? hint.position : "inside";
            setHint(null);
            drag.current = null;
            const target = resolveDrop(node, position);
            if (payload && target) onDrop(target, payload);
          }}
        >
          {isFrame && !isRoot ? (
            <button
              className="layer-caret"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              }}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="layer-caret" />
          )}
          <Icon size={13} className={isFrame ? "layer-icon frame" : "layer-icon"} />
          {editing === node.id ? (
            <input
              autoFocus
              defaultValue={node.name}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => {
                onRename(node.id, event.target.value.trim() || node.name);
                setEditing(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                if (event.key === "Escape") setEditing(null);
                event.stopPropagation();
              }}
            />
          ) : (
            <span className="layer-name">{node.name}</span>
          )}
          {node.kind === "frame" && <small className="layer-tag">{isRoot ? `${screen.canvasWidth}px` : node.tag}</small>}
          {!isRoot && (
            <button
              className="layer-eye"
              title={node.hidden ? "表示する" : "非表示にする"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleHidden(node.id);
              }}
            >
              {node.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
        </div>
        {isFrame && open && (node as FrameNode).children.map((child) => row(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="layers">
      {row(screen.root, 0)}
      <p className="panel-tip">ドラッグで並べ替え・入れ替え。ダブルクリックで名前を変更できます。</p>
    </div>
  );
}
