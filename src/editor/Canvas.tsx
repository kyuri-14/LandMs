// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The design canvas. The active screen is rendered as real HTML inside an
// iframe (so module CSS, `position: fixed`, `vw` units etc. behave exactly as
// on the exported site), scaled by the zoom level. No page scripts run here;
// the editor drives the iframe document directly from this window:
//
//   • click        → select the frame / module (or an element inside a module)
//   • drag & drop  → insert from the library or move an existing node
//   • overlays     → hover, selection and drop indicators drawn on top

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { buildHtflTree } from "../core/htfl";
import { isRowDirection } from "../core/layout";
import { findNode, isDescendant } from "../core/tree";
import type { FrameNode, Project, Screen } from "../core/types";
import { assetResolver, renderWeb } from "../core/web";
import type { Selection } from "./store";

export type DragPayload =
  | { kind: "module"; name: string }
  | { kind: "frame"; preset: string }
  | { kind: "move"; id: string };

export type DropTarget = { parentId: string; index: number };

type Props = {
  project: Project;
  screen: Screen;
  zoom: number;
  selection: Selection;
  drag: MutableRefObject<DragPayload | null>;
  onSelect: (id: string | null, path?: number[] | null) => void;
  onDrop: (target: DropTarget, payload: DragPayload) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onZoom: (delta: number) => void;
  onHeight?: (height: number) => void;
};

const EDITOR_CSS = `
html, body { overflow: hidden !important; }
.lm-screen { min-height: var(--lm-canvas-height) !important; }
[data-lm-empty] { min-height: 72px; min-width: 72px; outline: 1px dashed rgba(82, 104, 255, .55); outline-offset: -1px;
  background-image: repeating-linear-gradient(45deg, rgba(82, 104, 255, .07) 0 6px, transparent 6px 12px); }
[data-lm-node] a, [data-lm-node] button, [data-lm-node] summary, [data-lm-node] label { cursor: default; }
[data-lm-node] input, [data-lm-node] textarea { pointer-events: none; }
#__lm_overlay { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647; }
#__lm_overlay div { position: absolute; box-sizing: border-box; }
#__lm_overlay .hover { outline: calc(1px / var(--lm-zoom, 1)) solid #5268ff; }
#__lm_overlay .hover-frame { outline: calc(1px / var(--lm-zoom, 1)) dashed #5268ff; }
#__lm_overlay .selected { outline: calc(2px / var(--lm-zoom, 1)) solid #5268ff; }
#__lm_overlay .element { outline: calc(1.5px / var(--lm-zoom, 1)) dashed #ff7a59; outline-offset: 1px; }
#__lm_overlay .into { outline: calc(2px / var(--lm-zoom, 1)) dashed #5268ff; background: rgba(82, 104, 255, .08); }
#__lm_overlay .line { background: #5268ff; box-shadow: 0 0 0 1px #fff; border-radius: 2px; }
#__lm_overlay .label { transform: translateY(-100%); padding: 0.15em 0.55em; border-radius: 3px 3px 0 0; background: #5268ff; color: #fff;
  font: 600 calc(11px / var(--lm-zoom, 1))/1.4 system-ui, sans-serif; white-space: nowrap; }
#__lm_overlay .label.below { transform: none; border-radius: 0 0 3px 3px; }
#__lm_drag_image { position: fixed; top: -100px; left: -100px; padding: 4px 9px; border-radius: 4px; background: #5268ff; color: #fff;
  font: 600 12px system-ui, sans-serif; }
`;

type Rect = { left: number; top: number; width: number; height: number };

function rectOf(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  return { left: rect.left + (view?.scrollX ?? 0), top: rect.top + (view?.scrollY ?? 0), width: rect.width, height: rect.height };
}

function place(div: HTMLDivElement, rect: Rect | null) {
  if (!rect) {
    div.style.display = "none";
    return;
  }
  div.style.display = "block";
  div.style.left = `${rect.left}px`;
  div.style.top = `${rect.top}px`;
  div.style.width = `${rect.width}px`;
  div.style.height = `${rect.height}px`;
}

function nodeElement(doc: Document, id: string): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[data-lm-node="${CSS.escape(id)}"]`);
}

/** Where a drop at (x, y) would land, and the indicator to draw for it. */
function computeDrop(
  doc: Document,
  root: FrameNode,
  x: number,
  y: number,
  payload: DragPayload,
  zoom: number,
): { target: DropTarget; line: Rect | null; into: Rect | null } {
  const appendToRoot = (): { target: DropTarget; line: Rect | null; into: Rect | null } => {
    const rootEl = nodeElement(doc, root.id);
    return { target: { parentId: root.id, index: root.children.length }, line: null, into: rootEl ? rectOf(rootEl) : null };
  };
  let element = (doc.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-lm-node]") ?? null;
  const movingId = payload.kind === "move" ? payload.id : null;
  // Never drop a node into itself: climb out of the dragged subtree.
  while (element && movingId) {
    const id = element.dataset.lmNode!;
    if (id !== movingId && !isDescendant(root, movingId, id)) break;
    element = element.parentElement?.closest<HTMLElement>("[data-lm-node]") ?? null;
  }
  if (!element) return appendToRoot();
  const location = findNode(root, element.dataset.lmNode!);
  if (!location) return appendToRoot();

  const edge = 8 / zoom;
  const rect = element.getBoundingClientRect();
  const besideInParent = (): { target: DropTarget; line: Rect | null; into: Rect | null } | null => {
    const parent = location.parent;
    if (!parent) return null;
    const row = isRowDirection(parent.layout.direction);
    const reverse = parent.layout.direction.endsWith("reverse");
    const before = row ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
    const index = location.index + ((before !== reverse) ? 0 : 1);
    const r = rectOf(element!);
    // `before` is visual (left / top of the element), which is where the line goes.
    const atStart = before;
    const line = row
      ? { left: (atStart ? r.left : r.left + r.width) - 2, top: r.top, width: 4, height: r.height }
      : { left: r.left, top: (atStart ? r.top : r.top + r.height) - 2, width: r.width, height: 4 };
    const parentEl = nodeElement(doc, parent.id);
    return { target: { parentId: parent.id, index }, line, into: parentEl ? rectOf(parentEl) : null };
  };

  if (location.node.kind === "module") return besideInParent() ?? appendToRoot();

  const frame = location.node;
  const nearEdge = location.parent && (isRowDirection(location.parent.layout.direction)
    ? x < rect.left + edge || x > rect.right - edge
    : y < rect.top + edge || y > rect.bottom - edge);
  if (nearEdge) {
    const beside = besideInParent();
    if (beside) return beside;
  }

  // Inside the frame: find the gap between children closest to the pointer.
  const row = isRowDirection(frame.layout.direction);
  const reverse = frame.layout.direction.endsWith("reverse");
  let index = frame.children.length;
  let lineRect: Rect | null = null;
  let lastVisible: HTMLElement | null = null;
  for (let i = 0; i < frame.children.length; i += 1) {
    const child = nodeElement(doc, frame.children[i].id);
    if (!child || frame.children[i].id === movingId) continue;
    const childRect = child.getBoundingClientRect();
    lastVisible = child;
    let before: boolean;
    if (row) {
      if (y < childRect.top) before = true;
      else if (y > childRect.bottom) before = false;
      else before = reverse ? x > childRect.left + childRect.width / 2 : x < childRect.left + childRect.width / 2;
    } else {
      before = reverse ? y > childRect.top + childRect.height / 2 : y < childRect.top + childRect.height / 2;
    }
    if (before) {
      index = i;
      const r = rectOf(child);
      lineRect = row
        ? { left: (reverse ? r.left + r.width : r.left) - 2, top: r.top, width: 4, height: r.height }
        : { left: r.left, top: (reverse ? r.top + r.height : r.top) - 2, width: r.width, height: 4 };
      break;
    }
  }
  if (!lineRect && lastVisible) {
    const r = rectOf(lastVisible);
    lineRect = row
      ? { left: (reverse ? r.left : r.left + r.width) - 2, top: r.top, width: 4, height: r.height }
      : { left: r.left, top: (reverse ? r.top : r.top + r.height) - 2, width: r.width, height: 4 };
  }
  return { target: { parentId: frame.id, index }, line: lineRect, into: rectOf(element) };
}

export function Canvas({ project, screen, zoom, selection, drag, onSelect, onDrop, onKeyDown, onZoom, onHeight }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(screen.canvasHeight);
  const [ready, setReady] = useState(0);
  const hoverRef = useRef<string | null>(null);
  const latest = useRef({ project, screen, zoom, selection, onSelect, onDrop, onKeyDown, onZoom });
  latest.current = { project, screen, zoom, selection, onSelect, onDrop, onKeyDown, onZoom };

  const rendered = useMemo(() => {
    const tree = buildHtflTree(project, { screenIds: [screen.id], annotate: true, resolveAsset: assetResolver(project) });
    const code = renderWeb(project, tree, { scripts: false, inline: true });
    return { body: code.body, css: code.css };
  }, [project, screen.id]);

  const overlays = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const overlay = doc?.getElementById("__lm_overlay");
    if (!doc || !overlay) return;
    const get = (name: string) => overlay.querySelector<HTMLDivElement>(`.${name}`)!;
    const { selection: current, screen: activeScreen } = latest.current;
    const selected = current.id ? nodeElement(doc, current.id) : null;
    place(get("selected"), selected ? rectOf(selected) : null);
    const label = get("label");
    if (selected && current.id) {
      const location = findNode(activeScreen.root, current.id);
      const r = rectOf(selected);
      label.textContent = location ? location.node.name : "";
      label.classList.toggle("below", r.top < 22 / latest.current.zoom);
      label.style.display = "block";
      label.style.left = `${r.left}px`;
      label.style.top = `${r.top}px`;
    } else place(label, null);
    const inner = current.id && current.path?.length ? doc.querySelector(`[data-lm-el="${CSS.escape(`${current.id}:${current.path.join(".")}`)}"]`) : null;
    place(get("element"), inner ? rectOf(inner) : null);
    const hoverId = hoverRef.current;
    const hovered = hoverId && hoverId !== current.id ? nodeElement(doc, hoverId) : null;
    const hoverBox = get("hover");
    hoverBox.className = hovered?.dataset.lmKind === "frame" ? "hover hover-frame" : "hover";
    place(hoverBox, hovered ? rectOf(hovered) : null);
  }, []);

  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const root = doc?.querySelector(".lm-screen");
    if (!root) return;
    const next = Math.max(latest.current.screen.canvasHeight, Math.ceil(root.getBoundingClientRect().height));
    setHeight((current) => (current === next ? current : next));
    overlays();
  }, [overlays]);

  // Create the iframe document once and wire up the editor's event handlers.
  const setup = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc || doc.getElementById("__lm_page")) return;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style id="__lm_page"></style><style id="__lm_editor"></style></head><body></body></html>');
    doc.close();
    doc.getElementById("__lm_editor")!.textContent = EDITOR_CSS;
    const overlay = doc.createElement("div");
    overlay.id = "__lm_overlay";
    overlay.innerHTML = '<div class="hover"></div><div class="selected"></div><div class="element"></div><div class="into"></div><div class="line"></div><div class="label"></div>';
    doc.documentElement.appendChild(overlay);
    overlay.querySelectorAll<HTMLDivElement>("div").forEach((div) => (div.style.display = "none"));

    const indicator = (into: Rect | null, line: Rect | null) => {
      place(overlay.querySelector<HTMLDivElement>(".into")!, into);
      place(overlay.querySelector<HTMLDivElement>(".line")!, line);
    };

    const blockDefault = (event: Event) => event.preventDefault();
    doc.addEventListener("submit", blockDefault, true);
    doc.addEventListener("click", (event) => {
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      const inner = target?.closest<HTMLElement>("[data-lm-el]");
      if (inner) {
        const [id, path] = inner.dataset.lmEl!.split(":");
        latest.current.onSelect(id, path ? path.split(".").map(Number) : []);
        return;
      }
      const node = target?.closest<HTMLElement>("[data-lm-node]");
      latest.current.onSelect(node?.dataset.lmNode ?? latest.current.screen.root.id, null);
    }, true);
    doc.addEventListener("dblclick", blockDefault, true);
    doc.addEventListener("mousemove", (event) => {
      const node = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-lm-node]");
      const id = node?.dataset.lmNode ?? null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        overlays();
      }
    });
    doc.addEventListener("mouseleave", () => {
      hoverRef.current = null;
      overlays();
    });
    doc.addEventListener("keydown", (event) => latest.current.onKeyDown(event));
    doc.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      latest.current.onZoom(event.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    doc.addEventListener("dragstart", (event) => {
      const target = event.target instanceof doc.defaultView!.Element ? (event.target as HTMLElement) : null;
      const { selection: current } = latest.current;
      const insideSelected = current.id && current.id !== latest.current.screen.root.id && target?.closest(`[data-lm-node="${CSS.escape(current.id)}"]`);
      const node = insideSelected ? current.id : target?.closest<HTMLElement>("[data-lm-node]")?.dataset.lmNode;
      if (!node || node === latest.current.screen.root.id) {
        event.preventDefault();
        return;
      }
      drag.current = { kind: "move", id: node };
      event.dataTransfer?.setData("text/plain", "landms");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      const location = findNode(latest.current.screen.root, node);
      const ghost = doc.createElement("div");
      ghost.id = "__lm_drag_image";
      ghost.textContent = location?.node.name ?? "";
      doc.documentElement.appendChild(ghost);
      event.dataTransfer?.setDragImage(ghost, 12, 12);
      window.setTimeout(() => ghost.remove(), 0);
    });
    doc.addEventListener("dragover", (event) => {
      const payload = drag.current;
      if (!payload) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = payload.kind === "move" ? "move" : "copy";
      const { line, into } = computeDrop(doc, latest.current.screen.root, event.clientX, event.clientY, payload, latest.current.zoom);
      indicator(into, line);
    });
    doc.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget) indicator(null, null);
    });
    doc.addEventListener("drop", (event) => {
      const payload = drag.current;
      indicator(null, null);
      if (!payload) return;
      event.preventDefault();
      const { target } = computeDrop(doc, latest.current.screen.root, event.clientX, event.clientY, payload, latest.current.zoom);
      drag.current = null;
      latest.current.onDrop(target, payload);
    });
    doc.addEventListener("dragend", () => {
      drag.current = null;
      indicator(null, null);
    });
    // Images and fonts change the layout after they load.
    doc.addEventListener("load", () => measure(), true);
    setReady((value) => value + 1);
  }, [drag, measure, overlays]);

  useEffect(() => {
    setup();
  }, [setup]);

  // Push the rendered page into the iframe without reloading it.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.getElementById("__lm_page")) return;
    doc.getElementById("__lm_page")!.textContent = rendered.css;
    doc.documentElement.lang = project.head.lang || "ja";
    doc.documentElement.style.setProperty("--lm-canvas-height", `${screen.canvasHeight}px`);
    doc.documentElement.style.setProperty("--lm-zoom", String(zoom));
    doc.body.innerHTML = rendered.body;
    doc.querySelectorAll<HTMLElement>("[data-lm-node]").forEach((element) => {
      if (element.dataset.lmNode !== screen.root.id) element.draggable = true;
    });
    measure();
    const root = doc.querySelector(".lm-screen");
    const view = doc.defaultView;
    if (!root || !view || !("ResizeObserver" in view)) return;
    const observer = new (view as typeof window).ResizeObserver(() => measure());
    observer.observe(root);
    return () => observer.disconnect();
    // zoom is applied separately below; it must not re-render the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered, ready, screen.canvasHeight, screen.root.id, project.head.lang, measure]);

  useEffect(() => {
    iframeRef.current?.contentDocument?.documentElement.style.setProperty("--lm-zoom", String(zoom));
  }, [zoom, ready]);

  useEffect(() => {
    overlays();
  }, [selection, overlays]);

  useEffect(() => {
    onHeight?.(height);
  }, [height, onHeight]);

  return (
    <div className="canvas-frame" style={{ width: screen.canvasWidth * zoom, height: height * zoom }}>
      <iframe
        ref={iframeRef}
        title={`${screen.name} canvas`}
        className="canvas-iframe"
        onLoad={setup}
        style={{ width: screen.canvasWidth, height, transform: `scale(${zoom})` }}
      />
    </div>
  );
}
