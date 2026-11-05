// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Moving nodes between flex and free frames: what a node needs to live in
// its (new) parent, switching a frame between flex and free layout without
// anything jumping, and z-order moves. Pure functions.

import { isFree } from "../core/layout";
import type { AxisSize, FrameNode, LayoutNode, Placement } from "../core/types";
import { placementFromBox, type Box, type Point } from "./transform";

function fixed(value: number): AxisSize {
  return { mode: "fixed", value: Math.round(value * 100) / 100 };
}

/** The size a node will have when it is drawn, if it is known without measuring. */
export function knownSize(node: LayoutNode): { w: number; h: number } {
  const w = node.width.mode === "fixed" ? node.width.value : 0;
  const h = node.kind === "shape" && node.shape === "line" ? Math.max(1, node.strokeWidth) : node.height.mode === "fixed" ? node.height.value : 0;
  return { w, h };
}

export type FitOptions = {
  /** The free frame's inner size. */
  frame?: { w: number; h: number };
  /** Drop / click position in the frame. */
  point?: Point;
  /** "center": the node is centred on the point (drops); "corner": its top-left is the point. */
  anchor?: "center" | "corner";
  /** Measured size (when moving an existing element). */
  size?: { w: number; h: number };
  /** An exact box (drawn with a tool). */
  box?: Box;
};

/**
 * Prepare a node to live in `parent`. Flex frames lay their children out
 * themselves, so a placement is removed; free frames need one, and "fill"
 * sizes (meaningless without a flex parent) become fixed.
 */
export function fitNode<T extends LayoutNode>(node: T, parent: FrameNode, options: FitOptions = {}): T {
  if (!isFree(parent)) {
    if (!node.place) return node;
    const copy = { ...node };
    delete copy.place;
    return copy;
  }
  const frame = options.frame ?? { w: node.place?.pw ?? 0, h: node.place?.ph ?? 0 };
  let { width, height } = node;
  const measured = options.size;
  if (width.mode === "fill") width = fixed(measured?.w || (node.kind === "frame" ? 320 : Math.max(200, Math.round(frame.w * 0.6))));
  if (height.mode === "fill") height = node.kind === "frame" ? fixed(measured?.h || 240) : { mode: "hug", value: 0 };
  // A frame that becomes a free child needs a real height to be visible.
  if (node.kind === "frame" && isFree(node) && height.mode === "hug") height = fixed(measured?.h || 320);

  if (options.box) {
    return { ...node, width, height, place: placementFromBox(options.box, frame, node.place) };
  }
  const size = measured ?? knownSize({ ...node, width, height } as LayoutNode);
  const point = options.point ?? { x: frame.w / 2, y: frame.h / 2 };
  const centred = (options.anchor ?? "center") === "center";
  const x = centred && size.w > 0 ? point.x - size.w / 2 : point.x;
  const y = centred && size.h > 0 ? point.y - size.h / 2 : point.y;
  const previous = node.place;
  const place: Placement = {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    w: size.w,
    h: size.h,
    rotation: previous?.rotation ?? 0,
    flipX: previous?.flipX ?? false,
    flipY: previous?.flipY ?? false,
    // Until the size is measured the node is placed by its corner; the canvas
    // switches it to the default "center" constraint once it knows the size.
    horizontal: size.w > 0 ? previous?.horizontal ?? "center" : "left",
    vertical: previous?.vertical ?? "top",
    pw: Math.round(frame.w * 100) / 100,
    ph: Math.round(frame.h * 100) / 100,
  };
  return { ...node, width, height, place };
}

/**
 * Switch a frame to free layout, keeping every child exactly where it was
 * drawn (positions come from the canvas measurement).
 */
export function frameToFree(
  frame: FrameNode,
  measurement: { frame: { w: number; h: number }; outer: { w: number; h: number }; children: Record<string, Box> },
): FrameNode {
  return {
    ...frame,
    layout: { ...frame.layout, mode: "free" },
    height: fixed(measurement.outer.h),
    children: frame.children.map((child) => {
      const box = measurement.children[child.id];
      if (!box) return child;
      const width = child.width.mode === "fill" ? fixed(box.w) : child.width;
      const height = child.height.mode === "fill" ? fixed(box.h) : child.height;
      return { ...child, width, height, place: placementFromBox(box, measurement.frame) };
    }),
  };
}

/** Back to flex layout: children flow again, the frame hugs its content. */
export function frameToFlex(frame: FrameNode): FrameNode {
  const layout = { ...frame.layout };
  delete layout.mode;
  return {
    ...frame,
    layout,
    height: frame.height.mode === "fixed" ? { mode: "hug", value: 0 } : frame.height,
    children: frame.children.map((child) => {
      if (!child.place) return child;
      const copy = { ...child };
      delete copy.place;
      return copy;
    }),
  };
}

export type OrderMove = "forward" | "backward" | "front" | "back";

/** Index for `moveNode` (counted before the move) that changes the stacking order. */
export function orderIndex(index: number, count: number, move: OrderMove): number | null {
  switch (move) {
    case "forward":
      return index < count - 1 ? index + 2 : null;
    case "backward":
      return index > 0 ? index - 1 : null;
    case "front":
      return index < count - 1 ? count : null;
    case "back":
      return index > 0 ? 0 : null;
  }
}
