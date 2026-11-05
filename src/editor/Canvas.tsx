// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The design canvas. The active screen is rendered as real HTML inside an
// iframe (so module CSS, `position: fixed`, `vw` units etc. behave exactly as
// on the exported site), scaled by the zoom level. No page scripts run here;
// the editor drives the iframe document directly from this window.
//
// Two ways of arranging things, as in Figma:
//   • flex frames:  click to select, drag & drop to insert / reorder,
//                   drag the right / bottom handle to set a fixed size
//   • free frames:  Illustrator / InDesign style — draw shapes and text with
//                   the tools, drag to move (with smart guides), eight handles
//                   to resize (Shift keeps proportions, Alt from the centre),
//                   the round handle to rotate (Shift snaps to 15°)
// Double-click text (a text shape, or text inside a module) to edit it in place.
//
// While the pointer is down, the element is moved directly in the iframe for a
// smooth preview; the change is committed once, on release (one undo step).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type MutableRefObject } from "react";
import { buildHtflTree } from "../core/htfl";
import { isFree, isRowDirection } from "../core/layout";
import { findNode, isDescendant, snapshotAt } from "../core/tree";
import type { AxisSize, FrameNode, LayoutNode, Placement, Project, Screen, ShapeKind } from "../core/types";
import { assetResolver, renderWeb } from "../core/web";
import type { Selection } from "./store";
import {
  boundsOf,
  dragRect,
  HANDLE_DIRECTIONS,
  lineBox,
  placementFromBox,
  resizeBox,
  rotateBox,
  settlePlacement,
  snapBounds,
  snapTargets,
  type Box,
  type Handle,
  type Point,
  type SnapTargets,
} from "./transform";

export type Tool = "select" | "frame" | "rect" | "ellipse" | "line" | "text" | "image";

export type DragPayload =
  | { kind: "module"; name: string }
  | { kind: "frame"; preset: string }
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "move"; id: string };

export type DropTarget = {
  parentId: string;
  index: number;
  /** Free frames: the pointer position in the frame's coordinates. */
  point?: Point;
  /** Free frames: the frame's inner size at the time of the drop. */
  frame?: { w: number; h: number };
  /** Moves: the dragged element's current size. */
  size?: { w: number; h: number };
};

export type CreateRequest = {
  tool: Exclude<Tool, "select">;
  target: DropTarget;
  /** The dragged-out box in the target frame's coordinates, or null for a click. */
  box: Box | null;
};

export type TransformCommit = {
  id: string;
  place?: Placement;
  width?: AxisSize;
  height?: AxisSize;
  /** Dropped onto a different frame. */
  reparent?: DropTarget;
};

export type TextEdit = { id: string; path: number[] | null; text: string };

export type CanvasHandle = {
  /** Sizes of a frame and its children, for switching it to free layout without moving anything. */
  measureFrame: (frameId: string) => { frame: { w: number; h: number }; outer: { w: number; h: number }; children: Record<string, Box> } | null;
};

type Props = {
  project: Project;
  screen: Screen;
  zoom: number;
  selection: Selection;
  drag: MutableRefObject<DragPayload | null>;
  tool: Tool;
  /** Start editing this text once it is on the canvas (e.g. right after the text tool created it). */
  editRequest: { id: string; path: number[] | null } | null;
  onEditRequestHandled: () => void;
  onSelect: (id: string | null, path?: number[] | null) => void;
  onDrop: (target: DropTarget, payload: DragPayload) => void;
  onCreate: (request: CreateRequest) => void;
  onTransform: (commit: TransformCommit) => void;
  onEditText: (edit: TextEdit) => void;
  /** Fill in placements whose size was not known yet (not an undo step). */
  onSettle: (updates: Array<{ id: string; place: Placement }>) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onZoom: (delta: number) => void;
};

const EDITOR_CSS = `
html, body { overflow: hidden !important; }
body { -webkit-user-select: none; user-select: none; }
.lm-screen { min-height: var(--lm-canvas-height) !important; }
[data-lm-empty] { min-height: 72px; min-width: 72px; outline: 1px dashed rgba(82, 104, 255, .55); outline-offset: -1px;
  background-image: repeating-linear-gradient(45deg, rgba(82, 104, 255, .07) 0 6px, transparent 6px 12px); }
[data-lm-layout="free"] { outline: calc(1px / var(--lm-zoom, 1)) dashed rgba(82, 104, 255, .45); outline-offset: -1px; }
[data-lm-node] a, [data-lm-node] button, [data-lm-node] summary, [data-lm-node] label { cursor: default; }
[data-lm-node] input, [data-lm-node] textarea { pointer-events: none; }
[data-lm-free] { cursor: move; }
[data-lm-free] img, [data-lm-free] a { -webkit-user-drag: none; }
[data-lm-editing] { -webkit-user-select: text !important; user-select: text !important; cursor: text !important; outline: calc(1.5px / var(--lm-zoom, 1)) solid #ff7a59 !important; outline-offset: 2px; }
html[data-lm-tool="frame"] *, html[data-lm-tool="rect"] *, html[data-lm-tool="ellipse"] *, html[data-lm-tool="line"] *, html[data-lm-tool="image"] * { cursor: crosshair !important; }
html[data-lm-tool="text"] * { cursor: text !important; }
#__lm_overlay { position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483647; }
#__lm_overlay div { position: absolute; box-sizing: border-box; }
#__lm_overlay .hover { outline: calc(1px / var(--lm-zoom, 1)) solid #5268ff; }
#__lm_overlay .hover-frame { outline: calc(1px / var(--lm-zoom, 1)) dashed #5268ff; }
#__lm_overlay .element { outline: calc(1.5px / var(--lm-zoom, 1)) dashed #ff7a59; outline-offset: 1px; }
#__lm_overlay .into { outline: calc(2px / var(--lm-zoom, 1)) dashed #5268ff; background: rgba(82, 104, 255, .08); }
#__lm_overlay .line { background: #5268ff; box-shadow: 0 0 0 1px #fff; border-radius: 2px; }
#__lm_overlay .box { outline: calc(1.5px / var(--lm-zoom, 1)) solid #5268ff; transform-origin: 50% 50%; }
#__lm_overlay .box .h { width: calc(10px / var(--lm-zoom, 1)); height: calc(10px / var(--lm-zoom, 1)); margin: calc(-5px / var(--lm-zoom, 1)) 0 0 calc(-5px / var(--lm-zoom, 1));
  border: calc(1.5px / var(--lm-zoom, 1)) solid #5268ff; background: #fff; border-radius: 2px; pointer-events: auto; }
#__lm_overlay .box .h[data-handle="nw"], #__lm_overlay .box .h[data-handle="se"] { cursor: nwse-resize; }
#__lm_overlay .box .h[data-handle="ne"], #__lm_overlay .box .h[data-handle="sw"] { cursor: nesw-resize; }
#__lm_overlay .box .h[data-handle="n"], #__lm_overlay .box .h[data-handle="s"] { cursor: ns-resize; }
#__lm_overlay .box .h[data-handle="e"], #__lm_overlay .box .h[data-handle="w"] { cursor: ew-resize; }
#__lm_overlay .box .h.rot { border-radius: 50%; cursor: grab; top: calc(-26px / var(--lm-zoom, 1)); left: 50%; }
#__lm_overlay .box .stem { left: 50%; top: calc(-21px / var(--lm-zoom, 1)); width: 0; height: calc(21px / var(--lm-zoom, 1));
  border-left: calc(1.5px / var(--lm-zoom, 1)) solid #5268ff; }
#__lm_overlay .draw { outline: calc(1.5px / var(--lm-zoom, 1)) solid #5268ff; background: rgba(82, 104, 255, .12); transform-origin: 50% 50%; }
#__lm_overlay .guide-x { width: 0; border-left: calc(1px / var(--lm-zoom, 1)) solid #ff2fb3; }
#__lm_overlay .guide-y { height: 0; border-top: calc(1px / var(--lm-zoom, 1)) solid #ff2fb3; }
#__lm_overlay .label, #__lm_overlay .measure { padding: 0.15em 0.55em; background: #5268ff; color: #fff;
  font: 600 calc(11px / var(--lm-zoom, 1))/1.4 system-ui, sans-serif; white-space: nowrap; }
#__lm_overlay .label { transform: translateY(-100%); border-radius: 3px 3px 0 0; }
#__lm_overlay .label.below { transform: none; border-radius: 0 0 3px 3px; }
#__lm_overlay .measure { border-radius: 3px; background: #17201d; transform: translate(-50%, 0); }
#__lm_drag_image { position: fixed; top: -100px; left: -100px; padding: 4px 9px; border-radius: 4px; background: #5268ff; color: #fff;
  font: 600 12px system-ui, sans-serif; }
`;

const OVERLAY_HTML =
  '<div class="hover"></div><div class="element"></div><div class="into"></div><div class="line"></div><div class="draw"></div>' +
  '<div class="guide-x"></div><div class="guide-y"></div>' +
  '<div class="box"><div class="stem"></div>' +
  (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map((handle) => `<div class="h" data-handle="${handle}"></div>`).join("") +
  '<div class="h rot" data-handle="rot"></div></div><div class="label"></div><div class="measure"></div>';

const HANDLE_POSITION: Record<Handle, [string, string]> = {
  nw: ["0", "0"],
  n: ["50%", "0"],
  ne: ["100%", "0"],
  e: ["100%", "50%"],
  se: ["100%", "100%"],
  s: ["50%", "100%"],
  sw: ["0", "100%"],
  w: ["0", "50%"],
};

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

/** A frame's padding box (where absolutely placed children are measured from), in document coordinates. */
function frameGeometry(element: HTMLElement): { x: number; y: number; w: number; h: number } {
  const rect = rectOf(element);
  return { x: rect.left + element.clientLeft, y: rect.top + element.clientTop, w: element.clientWidth, h: element.clientHeight };
}

/** The unrotated layout box of an element in its frame's coordinates. */
function layoutBox(element: HTMLElement, frame: { x: number; y: number }, rotation: number): Box {
  const rect = rectOf(element);
  const cx = rect.left + rect.width / 2 - frame.x;
  const cy = rect.top + rect.height / 2 - frame.y;
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotation };
}

function rotationOf(node: LayoutNode | undefined): number {
  return node && node.kind !== "frame" ? node.place?.rotation ?? 0 : 0;
}

function parentFrameElement(element: HTMLElement): HTMLElement | null {
  return element.parentElement?.closest<HTMLElement>("[data-lm-node]") ?? null;
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
  const movingId = payload.kind === "move" ? payload.id : null;
  const movingElement = movingId ? nodeElement(doc, movingId) : null;
  const size = movingElement ? { w: movingElement.offsetWidth, h: movingElement.offsetHeight } : undefined;

  const freeTarget = (frame: FrameNode, frameElement: HTMLElement) => {
    const geometry = frameGeometry(frameElement);
    return {
      target: { parentId: frame.id, index: frame.children.length, point: { x: x - geometry.x, y: y - geometry.y }, frame: { w: geometry.w, h: geometry.h }, size },
      line: null,
      into: rectOf(frameElement),
    };
  };
  const appendToRoot = (): { target: DropTarget; line: Rect | null; into: Rect | null } => {
    const rootEl = nodeElement(doc, root.id);
    if (rootEl && isFree(root)) return freeTarget(root, rootEl);
    return { target: { parentId: root.id, index: root.children.length, size }, line: null, into: rootEl ? rectOf(rootEl) : null };
  };
  let element = (doc.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-lm-node]") ?? null;
  // Never drop a node into itself: climb out of the dragged subtree.
  while (element && movingId) {
    const id = element.dataset.lmNode!;
    if (id !== movingId && !isDescendant(root, movingId, id)) break;
    element = parentFrameElement(element);
  }
  if (!element) return appendToRoot();
  const location = findNode(root, element.dataset.lmNode!);
  if (!location) return appendToRoot();

  const edge = 8 / zoom;
  const rect = element.getBoundingClientRect();
  const besideInParent = (): { target: DropTarget; line: Rect | null; into: Rect | null } | null => {
    const parent = location.parent;
    if (!parent) return null;
    const parentEl = nodeElement(doc, parent.id);
    if (isFree(parent) && parentEl) return freeTarget(parent, parentEl);
    const row = isRowDirection(parent.layout.direction);
    const reverse = parent.layout.direction.endsWith("reverse");
    const before = row ? x < rect.left + rect.width / 2 : y < rect.top + rect.height / 2;
    const index = location.index + (before !== reverse ? 0 : 1);
    const r = rectOf(element!);
    // `before` is visual (left / top of the element), which is where the line goes.
    const line = row
      ? { left: (before ? r.left : r.left + r.width) - 2, top: r.top, width: 4, height: r.height }
      : { left: r.left, top: (before ? r.top : r.top + r.height) - 2, width: r.width, height: 4 };
    return { target: { parentId: parent.id, index, size }, line, into: parentEl ? rectOf(parentEl) : null };
  };

  if (location.node.kind !== "frame") return besideInParent() ?? appendToRoot();

  const frame = location.node;
  const nearEdge =
    location.parent &&
    !isFree(location.parent) &&
    (isRowDirection(location.parent.layout.direction) ? x < rect.left + edge || x > rect.right - edge : y < rect.top + edge || y > rect.bottom - edge);
  if (nearEdge) {
    const beside = besideInParent();
    if (beside) return beside;
  }
  if (isFree(frame)) return freeTarget(frame, element);

  // Inside a flex frame: find the gap between children closest to the pointer.
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
  return { target: { parentId: frame.id, index, size }, line: lineRect, into: rectOf(element) };
}

type Interaction =
  | {
      kind: "move";
      id: string;
      element: HTMLElement;
      frame: { x: number; y: number; w: number; h: number };
      start: Box;
      pointer: Point;
      targets: SnapTargets;
      moved: boolean;
      last: Box;
    }
  | {
      kind: "resize";
      id: string;
      element: HTMLElement;
      frame: { x: number; y: number; w: number; h: number };
      start: Box;
      pointer: Point;
      handle: Handle;
      targets: SnapTargets;
      last: Box;
      changedHeight: boolean;
    }
  | { kind: "rotate"; id: string; element: HTMLElement; frame: { x: number; y: number; w: number; h: number }; start: Box; pointer: Point; last: Box }
  | { kind: "flex-resize"; id: string; element: HTMLElement; handle: Handle; pointer: Point; startW: number; startH: number; w: number; h: number }
  | { kind: "draw"; tool: Exclude<Tool, "select">; target: DropTarget; frame: { x: number; y: number; w: number; h: number }; start: Point; current: Point; shift: boolean; alt: boolean };

type Editing = { id: string; path: number[] | null; element: HTMLElement; original: string };

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
  const { project, screen, zoom, selection, drag, tool, editRequest } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(screen.canvasHeight);
  const [ready, setReady] = useState(0);
  const hoverRef = useRef<string | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const suppressClickRef = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  const rendered = useMemo(() => {
    const tree = buildHtflTree(project, { screenIds: [screen.id], annotate: true, resolveAsset: assetResolver(project) });
    const code = renderWeb(project, tree, { scripts: false, inline: true });
    return { body: code.body, css: code.css };
  }, [project, screen.id]);

  const locate = (id: string) => findNode(latest.current.screen.root, id);
  const isFreeChild = (id: string): boolean => {
    const parent = locate(id)?.parent;
    return !!parent && isFree(parent);
  };

  // ---------- overlays ----------

  const overlays = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const overlay = doc?.getElementById("__lm_overlay");
    if (!doc || !overlay) return;
    const get = (name: string) => overlay.querySelector<HTMLDivElement>(`.${name}`)!;
    const { selection: current, screen: activeScreen, zoom: z } = latest.current;
    const interaction = interactionRef.current;
    const box = get("box");
    const label = get("label");
    const selectedId = current.id && current.id !== activeScreen.root.id ? current.id : null;
    const selected = selectedId ? nodeElement(doc, selectedId) : null;
    const location = selectedId ? findNode(activeScreen.root, selectedId) : null;
    const editing = editingRef.current;

    if (selected && location && !(editing && editing.id === selectedId && !editing.path) && interaction?.kind !== "draw") {
      const free = !!location.parent && isFree(location.parent);
      let geometry: { left: number; top: number; w: number; h: number; rotation: number };
      if (free) {
        const frameEl = parentFrameElement(selected);
        const frame = frameEl ? frameGeometry(frameEl) : { x: 0, y: 0, w: 0, h: 0 };
        const live = interaction && "last" in interaction && interaction.id === selectedId ? interaction.last : null;
        const b = live ?? layoutBox(selected, frame, rotationOf(location.node));
        geometry = { left: frame.x + b.x, top: frame.y + b.y, w: b.w, h: b.h, rotation: b.rotation };
      } else {
        const r = rectOf(selected);
        geometry = { left: r.left, top: r.top, w: r.width, h: r.height, rotation: 0 };
      }
      box.style.display = "block";
      box.style.left = `${geometry.left}px`;
      box.style.top = `${geometry.top}px`;
      box.style.width = `${geometry.w}px`;
      box.style.height = `${geometry.h}px`;
      box.style.transform = geometry.rotation ? `rotate(${geometry.rotation}deg)` : "none";
      const node = location.node;
      const handles: Array<Handle | "rot"> = free
        ? node.kind === "shape" && node.shape === "line"
          ? ["e", "w", "rot"]
          : node.kind === "frame"
            ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
            : ["nw", "n", "ne", "e", "se", "s", "sw", "w", "rot"]
        : node.kind === "shape" && node.shape === "line"
          ? ["e"]
          : ["e", "s", "se"];
      box.querySelectorAll<HTMLDivElement>(".h").forEach((handle) => {
        const name = handle.dataset.handle as Handle | "rot";
        handle.style.display = handles.includes(name) && !interaction ? "block" : "none";
        if (name !== "rot") {
          const [left, top] = HANDLE_POSITION[name];
          handle.style.left = left;
          handle.style.top = top;
        }
      });
      get("stem").style.display = handles.includes("rot") && !interaction ? "block" : "none";
      const aabb = rectOf(selected);
      label.textContent = node.name;
      label.classList.toggle("below", aabb.top < 22 / z);
      label.style.display = interaction ? "none" : "block";
      label.style.left = `${aabb.left}px`;
      label.style.top = `${aabb.top}px`;
    } else {
      box.style.display = "none";
      label.style.display = "none";
    }

    const inner = current.id && current.path?.length ? doc.querySelector(`[data-lm-el="${CSS.escape(`${current.id}:${current.path.join(".")}`)}"]`) : null;
    place(get("element"), inner && !interaction ? rectOf(inner) : null);
    const hoverId = hoverRef.current;
    const hovered = hoverId && hoverId !== current.id && !interaction ? nodeElement(doc, hoverId) : null;
    const hoverBox = get("hover");
    hoverBox.className = hovered?.dataset.lmKind === "frame" ? "hover hover-frame" : "hover";
    place(hoverBox, hovered ? rectOf(hovered) : null);
  }, []);

  const showGuides = (frame: { x: number; y: number; w: number; h: number } | null, guideX: number | null, guideY: number | null) => {
    const overlay = iframeRef.current?.contentDocument?.getElementById("__lm_overlay");
    if (!overlay) return;
    const gx = overlay.querySelector<HTMLDivElement>(".guide-x")!;
    const gy = overlay.querySelector<HTMLDivElement>(".guide-y")!;
    if (frame && guideX !== null) place(gx, { left: frame.x + guideX, top: frame.y, width: 0, height: frame.h });
    else gx.style.display = "none";
    if (frame && guideY !== null) place(gy, { left: frame.x, top: frame.y + guideY, width: frame.w, height: 0 });
    else gy.style.display = "none";
  };

  const showMeasure = (text: string | null, at?: Point) => {
    const measure = iframeRef.current?.contentDocument?.getElementById("__lm_overlay")?.querySelector<HTMLDivElement>(".measure");
    if (!measure) return;
    if (!text || !at) {
      measure.style.display = "none";
      return;
    }
    measure.textContent = text;
    measure.style.display = "block";
    measure.style.left = `${at.x}px`;
    measure.style.top = `${at.y}px`;
  };

  const measureHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const root = doc?.querySelector(".lm-screen");
    if (!root) return;
    const next = Math.max(latest.current.screen.canvasHeight, Math.ceil(root.getBoundingClientRect().height));
    setHeight((current) => (current === next ? current : next));
    overlays();
  }, [overlays]);

  // ---------- live transform ----------

  const applyBox = (element: HTMLElement, box: Box, node: LayoutNode | undefined) => {
    const flipX = node && node.kind !== "frame" ? node.place?.flipX : false;
    const flipY = node && node.kind !== "frame" ? node.place?.flipY : false;
    element.style.position = "absolute";
    element.style.left = `${box.x}px`;
    element.style.top = `${box.y}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    element.style.width = `${box.w}px`;
    element.style.height = `${box.h}px`;
    const transforms = [];
    if (box.rotation) transforms.push(`rotate(${box.rotation}deg)`);
    if (flipX || flipY) transforms.push(`scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`);
    element.style.transform = transforms.join(" ") || "none";
  };

  const siblingBounds = (element: HTMLElement, frame: { x: number; y: number }) => {
    const parent = element.parentElement;
    if (!parent) return [];
    return Array.from(parent.children)
      .filter((child): child is HTMLElement => child !== element && child instanceof (element.ownerDocument.defaultView as typeof window).HTMLElement && child.hasAttribute("data-lm-node"))
      .map((child) => {
        const r = rectOf(child);
        return { left: r.left - frame.x, top: r.top - frame.y, right: r.left + r.width - frame.x, bottom: r.top + r.height - frame.y };
      });
  };

  // ---------- text editing ----------

  const finishEditing = useCallback((commit: boolean) => {
    const editing = editingRef.current;
    if (!editing) return;
    editingRef.current = null;
    const text = editing.element.innerText.replace(/\r/g, "").replace(/\n$/, "");
    editing.element.removeAttribute("contenteditable");
    editing.element.removeAttribute("data-lm-editing");
    editing.element.ownerDocument.getSelection()?.removeAllRanges();
    if (commit && text !== editing.original) latest.current.onEditText({ id: editing.id, path: editing.path, text });
    overlays();
  }, [overlays]);

  const startEditing = useCallback(
    (id: string, path: number[] | null) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      finishEditing(true);
      const nodeEl = nodeElement(doc, id);
      const element = path
        ? doc.querySelector<HTMLElement>(`[data-lm-el="${CSS.escape(`${id}:${path.join(".")}`)}"]`)
        : nodeEl?.matches("[data-lm-text]")
          ? nodeEl
          : nodeEl?.querySelector<HTMLElement>("[data-lm-text]") ?? null;
      if (!element) return;
      try {
        element.contentEditable = "plaintext-only";
      } catch {
        element.contentEditable = "true";
      }
      if (element.contentEditable !== "plaintext-only") element.contentEditable = "true";
      element.setAttribute("data-lm-editing", "");
      const original = element.innerText.replace(/\r/g, "").replace(/\n$/, "");
      editingRef.current = { id, path, element, original };
      element.focus();
      const range = doc.createRange();
      range.selectNodeContents(element);
      const selectionApi = doc.getSelection();
      selectionApi?.removeAllRanges();
      selectionApi?.addRange(range);
      element.addEventListener("blur", () => finishEditing(true), { once: true });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
          event.preventDefault();
          element.blur();
        }
      });
      overlays();
    },
    [finishEditing, overlays],
  );

  /** Text inside a module can be edited in place when it is a plain text leaf. */
  const editableModuleText = (id: string, path: number[]): boolean => {
    const node = locate(id)?.node;
    if (!node || node.kind !== "module") return false;
    const target = snapshotAt(node.snapshot, path);
    return !!target && target.children.length === 0 && typeof target.config.content === "string";
  };

  // ---------- document setup ----------

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
    overlay.innerHTML = OVERLAY_HTML;
    doc.documentElement.appendChild(overlay);
    overlay.querySelectorAll<HTMLDivElement>(":scope > div").forEach((div) => (div.style.display = "none"));

    const indicator = (into: Rect | null, line: Rect | null) => {
      place(overlay.querySelector<HTMLDivElement>(".into")!, into);
      place(overlay.querySelector<HTMLDivElement>(".line")!, line);
    };
    const pointerIn = (event: PointerEvent | MouseEvent, frame: { x: number; y: number }): Point => ({ x: event.clientX - frame.x, y: event.clientY - frame.y });

    doc.addEventListener("submit", (event) => event.preventDefault(), true);

    doc.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        const editing = editingRef.current;
        if (editing && editing.element.contains(target)) return;
        // Keyboard shortcuts must reach the canvas, not a field left focused in a panel.
        (window.document.activeElement as HTMLElement | null)?.blur?.();
        iframe.contentWindow?.focus();
        if (editing) finishEditing(true);
        const { tool: activeTool, screen: activeScreen, zoom: z } = latest.current;
        const root = activeScreen.root;

        if (activeTool !== "select") {
          event.preventDefault();
          const { target: dropTarget } = computeDrop(doc, root, event.clientX, event.clientY, { kind: "shape", shape: "rect" }, z);
          const frameEl = nodeElement(doc, dropTarget.parentId);
          if (!frameEl) return;
          const frame = frameGeometry(frameEl);
          const start = pointerIn(event, frame);
          interactionRef.current = { kind: "draw", tool: activeTool, target: dropTarget, frame, start, current: start, shift: event.shiftKey, alt: event.altKey };
          (target as Element).setPointerCapture?.(event.pointerId);
          overlays();
          return;
        }

        const handleEl = target.closest<HTMLElement>("[data-handle]");
        const selectedId = latest.current.selection.id;
        if (handleEl && selectedId) {
          event.preventDefault();
          event.stopPropagation();
          const element = nodeElement(doc, selectedId);
          const location = locate(selectedId);
          if (!element || !location) return;
          const handle = handleEl.dataset.handle as Handle | "rot";
          handleEl.setPointerCapture?.(event.pointerId);
          if (location.parent && isFree(location.parent)) {
            const frameEl = parentFrameElement(element);
            if (!frameEl) return;
            const frame = frameGeometry(frameEl);
            const start = layoutBox(element, frame, rotationOf(location.node));
            const pointer = pointerIn(event, frame);
            element.style.pointerEvents = "none";
            if (handle === "rot") interactionRef.current = { kind: "rotate", id: selectedId, element, frame, start, pointer, last: start };
            else
              interactionRef.current = {
                kind: "resize",
                id: selectedId,
                element,
                frame,
                start,
                pointer,
                handle,
                targets: snapTargets(frame, siblingBounds(element, frame)),
                last: start,
                changedHeight: HANDLE_DIRECTIONS[handle][1] !== 0,
              };
          } else if (handle !== "rot") {
            interactionRef.current = {
              kind: "flex-resize",
              id: selectedId,
              element,
              handle,
              pointer: { x: event.clientX, y: event.clientY },
              startW: element.offsetWidth,
              startH: element.offsetHeight,
              w: element.offsetWidth,
              h: element.offsetHeight,
            };
          }
          overlays();
          return;
        }

        // Select tool on an element: free children are moved with the pointer.
        const nodeEl = target.closest<HTMLElement>("[data-lm-node]");
        if (!nodeEl) return;
        let moveId: string | null = null;
        if (selectedId && selectedId !== root.id && isFreeChild(selectedId) && nodeElement(doc, selectedId)?.contains(target)) moveId = selectedId;
        if (!moveId && isFreeChild(nodeEl.dataset.lmNode!)) moveId = nodeEl.dataset.lmNode!;
        if (!moveId) return;
        event.preventDefault();
        const element = nodeElement(doc, moveId)!;
        const frameEl = parentFrameElement(element);
        const location = locate(moveId);
        if (!frameEl || !location) return;
        const frame = frameGeometry(frameEl);
        const start = layoutBox(element, frame, rotationOf(location.node));
        if (moveId !== selectedId) latest.current.onSelect(moveId, null);
        interactionRef.current = {
          kind: "move",
          id: moveId,
          element,
          frame,
          start,
          pointer: pointerIn(event, frame),
          targets: snapTargets(frame, siblingBounds(element, frame)),
          moved: false,
          last: start,
        };
        element.setPointerCapture?.(event.pointerId);
      },
      true,
    );

    doc.addEventListener("pointermove", (event) => {
      const interaction = interactionRef.current;
      const { zoom: z, tool: activeTool } = latest.current;
      if (!interaction) {
        // Hover: the element under the pointer, or (with a drawing tool) the frame that will receive the shape.
        if (activeTool !== "select") {
          const { into } = computeDrop(doc, latest.current.screen.root, event.clientX, event.clientY, { kind: "shape", shape: "rect" }, z);
          indicator(into, null);
          return;
        }
        const node = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-lm-node]");
        const id = node?.dataset.lmNode ?? null;
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          overlays();
        }
        return;
      }
      const snapOff = event.ctrlKey || event.metaKey;
      const threshold = 6 / z;
      if (interaction.kind === "draw") {
        interaction.current = pointerIn(event, interaction.frame);
        interaction.shift = event.shiftKey;
        interaction.alt = event.altKey;
        const { start, current, frame } = interaction;
        const drawn = interaction.tool === "line" ? lineBox(start, current, 2, event.shiftKey) : dragRect(start, current, event.shiftKey, event.altKey);
        const draw = overlay.querySelector<HTMLDivElement>(".draw")!;
        place(draw, { left: frame.x + drawn.x, top: frame.y + drawn.y, width: drawn.w, height: Math.max(drawn.h, 1 / z) });
        draw.style.transform = drawn.rotation ? `rotate(${drawn.rotation}deg)` : "none";
        showMeasure(interaction.tool === "line" ? `${Math.round(drawn.w)}px  ${Math.round(drawn.rotation)}°` : `${Math.round(drawn.w)} × ${Math.round(drawn.h)}`, {
          x: frame.x + drawn.x + drawn.w / 2,
          y: frame.y + drawn.y + drawn.h + 8 / z,
        });
        return;
      }
      if (interaction.kind === "flex-resize") {
        const [hx, hy] = HANDLE_DIRECTIONS[interaction.handle];
        interaction.w = Math.max(1, Math.round(interaction.startW + hx * (event.clientX - interaction.pointer.x)));
        interaction.h = Math.max(1, Math.round(interaction.startH + hy * (event.clientY - interaction.pointer.y)));
        if (hx) {
          interaction.element.style.width = `${interaction.w}px`;
          interaction.element.style.flex = "0 0 auto";
          interaction.element.style.maxWidth = "none";
        }
        if (hy) {
          interaction.element.style.height = `${interaction.h}px`;
          interaction.element.style.alignSelf = "auto";
        }
        const r = rectOf(interaction.element);
        showMeasure(`${hx ? interaction.w : "–"} × ${hy ? interaction.h : "–"}`, { x: r.left + r.width / 2, y: r.top + r.height + 8 / z });
        overlays();
        return;
      }
      const node = locate(interaction.id)?.node;
      const pointer = pointerIn(event, interaction.frame);
      const dx = pointer.x - interaction.pointer.x;
      const dy = pointer.y - interaction.pointer.y;
      let next: Box;
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (interaction.kind === "move") {
        if (!interaction.moved && Math.hypot(dx, dy) < 3 / z) return;
        if (!interaction.moved) {
          interaction.moved = true;
          interaction.element.style.pointerEvents = "none";
        }
        let mx = dx;
        let my = dy;
        if (event.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) my = 0;
          else mx = 0;
        }
        next = { ...interaction.start, x: interaction.start.x + mx, y: interaction.start.y + my };
        if (!snapOff) {
          const snap = snapBounds(boundsOf(next), interaction.targets, threshold);
          next = { ...next, x: next.x + snap.dx, y: next.y + snap.dy };
          guideX = snap.guideX;
          guideY = snap.guideY;
        }
        showMeasure(`X ${Math.round(next.x)}  Y ${Math.round(next.y)}`, { x: interaction.frame.x + next.x + next.w / 2, y: interaction.frame.y + next.y + next.h + 8 / z });
      } else if (interaction.kind === "resize") {
        // Images keep their proportions on corner handles unless Shift is held; everything else only with Shift.
        const isImage = node?.kind === "shape" && node.shape === "image";
        const corner = interaction.handle.length === 2;
        const keepRatio = isImage && corner ? !event.shiftKey : event.shiftKey;
        next = resizeBox(interaction.start, interaction.handle, dx, dy, { keepRatio, fromCenter: event.altKey });
        if (!snapOff && interaction.start.rotation === 0 && !event.altKey && !keepRatio) {
          const [hx, hy] = HANDLE_DIRECTIONS[interaction.handle];
          const b = boundsOf(next);
          const edgeX = hx > 0 ? b.right : hx < 0 ? b.left : null;
          const edgeY = hy > 0 ? b.bottom : hy < 0 ? b.top : null;
          const snapX = edgeX === null ? null : snapBounds({ left: edgeX, right: edgeX, top: 0, bottom: 0 }, { x: interaction.targets.x, y: [] }, threshold);
          const snapY = edgeY === null ? null : snapBounds({ top: edgeY, bottom: edgeY, left: 0, right: 0 }, { x: [], y: interaction.targets.y }, threshold);
          if (snapX?.guideX != null) {
            if (hx > 0) next = { ...next, w: next.w + snapX.dx };
            else next = { ...next, x: next.x + snapX.dx, w: next.w - snapX.dx };
            guideX = snapX.guideX;
          }
          if (snapY?.guideY != null) {
            if (hy > 0) next = { ...next, h: next.h + snapY.dy };
            else next = { ...next, y: next.y + snapY.dy, h: next.h - snapY.dy };
            guideY = snapY.guideY;
          }
        }
        showMeasure(`${Math.round(next.w)} × ${Math.round(next.h)}`, { x: interaction.frame.x + next.x + next.w / 2, y: interaction.frame.y + next.y + next.h + 8 / z });
      } else {
        const rotation = rotateBox(interaction.start, interaction.pointer, pointer, event.shiftKey);
        next = { ...interaction.start, rotation };
        showMeasure(`${Math.round(rotation)}°`, { x: interaction.frame.x + next.x + next.w / 2, y: interaction.frame.y + next.y + next.h + 8 / z });
      }
      interaction.last = next;
      applyBox(interaction.element, next, node);
      showGuides(interaction.frame, guideX, guideY);
      overlays();
    });

    const endInteraction = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;
      showGuides(null, null, null);
      showMeasure(null);
      indicator(null, null);
      overlay.querySelector<HTMLDivElement>(".draw")!.style.display = "none";
      const commit = latest.current.onTransform;
      if (interaction.kind === "draw") {
        suppressClickRef.current = true;
        if (event.type === "pointercancel") return overlays();
        const { start, current, tool: drawTool, target } = interaction;
        const moved = Math.hypot(current.x - start.x, current.y - start.y) > 3 / latest.current.zoom;
        const box = moved ? (drawTool === "line" ? lineBox(start, current, 2, interaction.shift) : dragRect(start, current, interaction.shift, interaction.alt)) : null;
        latest.current.onCreate({ tool: drawTool, target: { ...target, point: target.point ? start : undefined }, box });
        return;
      }
      if (interaction.kind === "flex-resize") {
        suppressClickRef.current = true;
        const [hx, hy] = HANDLE_DIRECTIONS[interaction.handle];
        commit({
          id: interaction.id,
          ...(hx ? { width: { mode: "fixed", value: interaction.w } as AxisSize } : {}),
          ...(hy ? { height: { mode: "fixed", value: interaction.h } as AxisSize } : {}),
        });
        return;
      }
      interaction.element.style.pointerEvents = "";
      const location = locate(interaction.id);
      const node = location?.node;
      if (interaction.kind === "move") {
        if (!interaction.moved) return overlays();
        suppressClickRef.current = true;
        const { target } = computeDrop(doc, latest.current.screen.root, event.clientX, event.clientY, { kind: "move", id: interaction.id }, latest.current.zoom);
        // Leaving the frame moves the element to the frame under the pointer; a small
        // overhang keeps it where it is (objects may stick out of an artboard).
        const parentEl = location?.parent ? nodeElement(doc, location.parent.id) : null;
        const parentRect = parentEl ? rectOf(parentEl) : null;
        const insideParent =
          !!parentRect &&
          event.clientX >= parentRect.left &&
          event.clientX <= parentRect.left + parentRect.width &&
          event.clientY >= parentRect.top &&
          event.clientY <= parentRect.top + parentRect.height;
        const targetFrame = locate(target.parentId)?.node;
        const intoNestedFree = !!targetFrame && targetFrame.kind === "frame" && isFree(targetFrame) && !!location?.parent && isDescendant(latest.current.screen.root, location.parent.id, targetFrame.id);
        if (location?.parent && target.parentId !== location.parent.id && (!insideParent || intoNestedFree)) {
          // Dropped onto another frame: keep the same visual position if that frame is free too.
          const destination = nodeElement(doc, target.parentId);
          const point = destination && target.point ? (() => {
            const geometry = frameGeometry(destination);
            return { x: interaction.frame.x + interaction.last.x - geometry.x, y: interaction.frame.y + interaction.last.y - geometry.y };
          })() : undefined;
          commit({ id: interaction.id, reparent: { ...target, point, size: { w: interaction.last.w, h: interaction.last.h } } });
          return;
        }
        commit({ id: interaction.id, place: placementFromBox(interaction.last, interaction.frame, node?.place) });
        return;
      }
      suppressClickRef.current = true;
      const previous = node?.place;
      const placement = placementFromBox(interaction.last, interaction.frame, previous);
      if (interaction.kind === "rotate") {
        commit({ id: interaction.id, place: placement });
        return;
      }
      const isLine = node?.kind === "shape" && node.shape === "line";
      commit({
        id: interaction.id,
        place: placement,
        width: { mode: "fixed", value: Math.round(interaction.last.w * 100) / 100 },
        ...(interaction.changedHeight && !isLine ? { height: { mode: "fixed", value: Math.round(interaction.last.h * 100) / 100 } as AxisSize } : {}),
      });
    };
    doc.addEventListener("pointerup", endInteraction);
    doc.addEventListener("pointercancel", endInteraction);

    doc.addEventListener(
      "click",
      (event) => {
        const editing = editingRef.current;
        if (editing && editing.element.contains(event.target as Node)) return;
        event.preventDefault();
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (latest.current.tool !== "select") return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-handle]")) return;
        const inner = target?.closest<HTMLElement>("[data-lm-el]");
        if (inner) {
          const [id, path] = inner.dataset.lmEl!.split(":");
          latest.current.onSelect(id, path ? path.split(".").map(Number) : []);
          return;
        }
        const node = target?.closest<HTMLElement>("[data-lm-node]");
        latest.current.onSelect(node?.dataset.lmNode ?? latest.current.screen.root.id, null);
      },
      true,
    );
    doc.addEventListener(
      "dblclick",
      (event) => {
        const editing = editingRef.current;
        if (editing && editing.element.contains(event.target as Node)) return;
        event.preventDefault();
        if (latest.current.tool !== "select") return;
        const target = event.target as HTMLElement | null;
        const inner = target?.closest<HTMLElement>("[data-lm-el]");
        if (inner) {
          const [id, rawPath] = inner.dataset.lmEl!.split(":");
          const path = rawPath ? rawPath.split(".").map(Number) : [];
          if (editableModuleText(id, path)) {
            latest.current.onSelect(id, path);
            startEditing(id, path);
          }
          return;
        }
        const shape = target?.closest<HTMLElement>('[data-lm-shape="text"]');
        if (shape?.dataset.lmNode) {
          latest.current.onSelect(shape.dataset.lmNode, null);
          startEditing(shape.dataset.lmNode, null);
        }
      },
      true,
    );
    doc.addEventListener("mouseleave", () => {
      hoverRef.current = null;
      if (latest.current.tool !== "select") indicator(null, null);
      overlays();
    });
    doc.addEventListener("keydown", (event) => {
      // Enter on a selected text shape starts editing it (like Figma).
      const { selection: current, tool: activeTool } = latest.current;
      if (event.key === "Enter" && !editingRef.current && activeTool === "select" && current.id && !current.path) {
        const node = locate(current.id)?.node;
        if (node?.kind === "shape" && node.shape === "text") {
          event.preventDefault();
          startEditing(current.id, null);
          return;
        }
      }
      latest.current.onKeyDown(event);
    });
    doc.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        latest.current.onZoom(event.deltaY < 0 ? 0.1 : -0.1);
      },
      { passive: false },
    );

    doc.addEventListener("dragstart", (event) => {
      const target = event.target instanceof doc.defaultView!.Element ? (event.target as HTMLElement) : null;
      const { selection: current, screen: activeScreen } = latest.current;
      if (latest.current.tool !== "select" || editingRef.current || target?.closest("[data-lm-free], [data-handle]")) {
        event.preventDefault();
        return;
      }
      const insideSelected = current.id && current.id !== activeScreen.root.id && target?.closest(`[data-lm-node="${CSS.escape(current.id)}"]`);
      const node = insideSelected ? current.id : target?.closest<HTMLElement>("[data-lm-node]")?.dataset.lmNode;
      if (!node || node === activeScreen.root.id || isFreeChild(node)) {
        event.preventDefault();
        return;
      }
      drag.current = { kind: "move", id: node };
      event.dataTransfer?.setData("text/plain", "landms");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      const location = locate(node);
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
    doc.addEventListener("load", () => measureHeight(), true);
    setReady((value) => value + 1);
    // The handlers read everything through `latest`, so they are bound once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, measureHeight, overlays, finishEditing, startEditing]);

  useEffect(() => {
    setup();
  }, [setup]);

  // Push the rendered page into the iframe without reloading it.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.getElementById("__lm_page")) return;
    // The edited element is about to be replaced: keep what was typed.
    if (editingRef.current) finishEditing(true);
    doc.getElementById("__lm_page")!.textContent = rendered.css;
    doc.documentElement.lang = project.head.lang || "ja";
    doc.documentElement.style.setProperty("--lm-canvas-height", `${screen.canvasHeight}px`);
    doc.body.innerHTML = rendered.body;
    doc.querySelectorAll<HTMLElement>("[data-lm-node]").forEach((element) => {
      if (element.dataset.lmNode !== screen.root.id && !element.hasAttribute("data-lm-free")) element.draggable = true;
    });
    measureHeight();

    // Placements created before their element could be measured (text, dropped modules) get their real size now.
    // Text that is about to be edited settles once the typing is done.
    const updates: Array<{ id: string; place: Placement }> = [];
    const pendingEdit = latest.current.editRequest?.id;
    doc.querySelectorAll<HTMLElement>("[data-lm-free]").forEach((element) => {
      const id = element.dataset.lmNode;
      const location = id ? findNode(screen.root, id) : null;
      const frameEl = parentFrameElement(element);
      if (!id || id === pendingEdit || !location || !frameEl) return;
      const current = location.node.place;
      if (current && current.w > 0 && current.h > 0 && current.pw > 0 && current.ph > 0) return;
      const frame = frameGeometry(frameEl);
      let settled = current
        ? settlePlacement({ ...current, pw: current.pw || frame.w, ph: current.ph || frame.h }, element.offsetWidth, element.offsetHeight)
        : placementFromBox(layoutBox(element, frame, 0), frame);
      // New elements are placed by their top-left corner ("left") until their size is known;
      // then they get the default "center" constraint without moving.
      if (current && current.w === 0 && current.horizontal === "left") settled = { ...settled, horizontal: "center" };
      if (settled.w > 0 && settled.h > 0) updates.push({ id, place: settled });
    });
    if (updates.length) latest.current.onSettle(updates);

    const root = doc.querySelector(".lm-screen");
    const view = doc.defaultView;
    if (!root || !view || !("ResizeObserver" in view)) return;
    const observer = new (view as typeof window).ResizeObserver(() => measureHeight());
    observer.observe(root);
    return () => observer.disconnect();
  }, [rendered, ready, screen.canvasHeight, screen.root, project.head.lang, measureHeight, finishEditing]);

  useEffect(() => {
    iframeRef.current?.contentDocument?.documentElement.style.setProperty("--lm-zoom", String(zoom));
    overlays();
  }, [zoom, ready, overlays]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (tool === "select") delete doc.documentElement.dataset.lmTool;
    else doc.documentElement.dataset.lmTool = tool;
    const into = doc.getElementById("__lm_overlay")?.querySelector<HTMLDivElement>(".into");
    if (into) into.style.display = "none";
    overlays();
  }, [tool, ready, overlays]);

  useEffect(() => {
    overlays();
  }, [selection, overlays]);

  useEffect(() => {
    if (!editRequest) return;
    startEditing(editRequest.id, editRequest.path);
    props.onEditRequestHandled();
    // Runs after the page with the new text has been pushed into the iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest, rendered, startEditing]);

  useImperativeHandle(
    ref,
    () => ({
      measureFrame: (frameId: string) => {
        const doc = iframeRef.current?.contentDocument;
        const frameEl = doc ? nodeElement(doc, frameId) : null;
        const location = findNode(latest.current.screen.root, frameId);
        if (!doc || !frameEl || !location || location.node.kind !== "frame") return null;
        const frame = frameGeometry(frameEl);
        const children: Record<string, Box> = {};
        for (const child of location.node.children) {
          const element = nodeElement(doc, child.id);
          if (element) children[child.id] = layoutBox(element, frame, rotationOf(child));
        }
        return { frame: { w: frame.w, h: frame.h }, outer: { w: frameEl.offsetWidth, h: frameEl.offsetHeight }, children };
      },
    }),
    [],
  );

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
});
