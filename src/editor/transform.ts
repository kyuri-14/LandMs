// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Geometry for the free-transform tools: resizing a (possibly rotated) box by
// one of its eight handles, rotating it, drawing lines, smart-guide snapping,
// and converting between boxes and Placements. Pure functions, unit tested.
//
// A Box is the layout box before rotation: top-left (x, y) and size (w, h) in
// the free frame's coordinates, rotated by `rotation` degrees (clockwise)
// around its centre — exactly how CSS `transform: rotate()` draws it.

import type { HConstraint, Placement, VConstraint } from "../core/types";

export type Box = { x: number; y: number; w: number; h: number; rotation: number };
export type Point = { x: number; y: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLE_DIRECTIONS: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

const RAD = Math.PI / 180;

function rotate(point: Point, degrees: number): Point {
  const cos = Math.cos(degrees * RAD);
  const sin = Math.sin(degrees * RAD);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export type ResizeOptions = {
  /** Shift: keep the proportions. */
  keepRatio?: boolean;
  /** Alt: grow from the centre instead of the opposite handle. */
  fromCenter?: boolean;
  minSize?: number;
};

/**
 * Resize by dragging a handle by (dx, dy) screen px. The opposite handle (or
 * the centre with fromCenter) stays exactly where it was, also when rotated.
 */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, options: ResizeOptions = {}): Box {
  const [hx, hy] = HANDLE_DIRECTIONS[handle];
  const local = rotate({ x: dx, y: dy }, -start.rotation);
  const factor = options.fromCenter ? 2 : 1;
  let w = start.w + hx * local.x * factor;
  let h = start.h + hy * local.y * factor;
  if (options.keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (hx !== 0 && hy !== 0) {
      if (Math.abs(w / start.w) >= Math.abs(h / start.h)) h = w / ratio;
      else w = h * ratio;
    } else if (hx !== 0) h = w / ratio;
    else w = h * ratio;
  }
  const min = options.minSize ?? 1;
  w = Math.max(min, w);
  h = Math.max(min, h);
  const center = centerOf(start);
  if (options.fromCenter) return { ...start, x: center.x - w / 2, y: center.y - h / 2, w, h };
  // The anchor (opposite handle) in local coordinates, relative to the centre.
  const keepX = hx === 0 && options.keepRatio ? 0 : -hx;
  const keepY = hy === 0 && options.keepRatio ? 0 : -hy;
  const anchorWorld = rotate({ x: (keepX * start.w) / 2, y: (keepY * start.h) / 2 }, start.rotation);
  const anchor = { x: center.x + anchorWorld.x, y: center.y + anchorWorld.y };
  const offset = rotate({ x: (keepX * w) / 2, y: (keepY * h) / 2 }, start.rotation);
  const next = { x: anchor.x - offset.x, y: anchor.y - offset.y };
  return { ...start, x: next.x - w / 2, y: next.y - h / 2, w, h };
}

export function normalizeAngle(degrees: number): number {
  let angle = degrees % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return Math.round(angle * 100) / 100;
}

/** New rotation after dragging the rotate handle from `from` to `to` (Shift snaps to 15°). */
export function rotateBox(start: Box, from: Point, to: Point, snap = false): number {
  const center = centerOf(start);
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let degrees = start.rotation + (a1 - a0) / RAD;
  if (snap) degrees = Math.round(degrees / 15) * 15;
  return normalizeAngle(degrees);
}

/** A line from a to b as a rotated box of the given thickness (Shift snaps to 45°). */
export function lineBox(a: Point, b: Point, thickness: number, snap = false): Box {
  let angle = Math.atan2(b.y - a.y, b.x - a.x) / RAD;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (snap) angle = Math.round(angle / 45) * 45;
  const end = snap ? { x: a.x + length * Math.cos(angle * RAD), y: a.y + length * Math.sin(angle * RAD) } : b;
  const center = { x: (a.x + end.x) / 2, y: (a.y + end.y) / 2 };
  return { x: center.x - length / 2, y: center.y - thickness / 2, w: length, h: thickness, rotation: normalizeAngle(angle) };
}

/** Rectangle spanned by a drag (Shift: square, Alt: from the start point as centre). */
export function dragRect(a: Point, b: Point, square = false, fromCenter = false): Box {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  if (fromCenter) return { x: a.x - Math.abs(dx), y: a.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2, rotation: 0 };
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy), rotation: 0 };
}

/** Axis-aligned bounding box of a rotated box. */
export function boundsOf(box: Box): { left: number; top: number; right: number; bottom: number } {
  const center = centerOf(box);
  const corners = [
    { x: -box.w / 2, y: -box.h / 2 },
    { x: box.w / 2, y: -box.h / 2 },
    { x: box.w / 2, y: box.h / 2 },
    { x: -box.w / 2, y: box.h / 2 },
  ].map((corner) => rotate(corner, box.rotation));
  const xs = corners.map((corner) => center.x + corner.x);
  const ys = corners.map((corner) => center.y + corner.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

// ---------- smart guides ----------

export type SnapTargets = { x: number[]; y: number[] };
export type SnapResult = { dx: number; dy: number; guideX: number | null; guideY: number | null };

function nearest(values: number[], targets: number[], threshold: number): { offset: number; line: number } | null {
  let best: { offset: number; line: number } | null = null;
  for (const value of values) {
    for (const target of targets) {
      const offset = target - value;
      if (Math.abs(offset) <= threshold && (!best || Math.abs(offset) < Math.abs(best.offset))) best = { offset, line: target };
    }
  }
  return best;
}

/**
 * Snap a moving box's edges and centre to the frame's edges / centre and to
 * the other children, like Illustrator's smart guides.
 */
export function snapBounds(bounds: { left: number; top: number; right: number; bottom: number }, targets: SnapTargets, threshold: number): SnapResult {
  const x = nearest([bounds.left, (bounds.left + bounds.right) / 2, bounds.right], targets.x, threshold);
  const y = nearest([bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom], targets.y, threshold);
  return { dx: x?.offset ?? 0, dy: y?.offset ?? 0, guideX: x?.line ?? null, guideY: y?.line ?? null };
}

export function snapTargets(frame: { w: number; h: number }, others: Array<{ left: number; top: number; right: number; bottom: number }>): SnapTargets {
  const xs = [0, frame.w / 2, frame.w];
  const ys = [0, frame.h / 2, frame.h];
  for (const other of others) {
    xs.push(other.left, (other.left + other.right) / 2, other.right);
    ys.push(other.top, (other.top + other.bottom) / 2, other.bottom);
  }
  return { x: xs, y: ys };
}

// ---------- placements ----------

export function placementFromBox(box: Box, frame: { w: number; h: number }, previous?: Placement): Placement {
  return {
    x: round(box.x),
    y: round(box.y),
    w: round(box.w),
    h: round(box.h),
    rotation: normalizeAngle(box.rotation),
    flipX: previous?.flipX ?? false,
    flipY: previous?.flipY ?? false,
    horizontal: previous?.horizontal ?? "center",
    vertical: previous?.vertical ?? "top",
    pw: round(frame.w),
    ph: round(frame.h),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fill in the size of a placement that was created before its element was
 * measured (w or h = 0), keeping the element exactly where it is drawn now.
 */
export function settlePlacement(place: Placement, w: number, h: number): Placement {
  const shiftX: Record<HConstraint, number> = { left: 0, scale: 0, stretch: 0, center: w / 2, right: w };
  const shiftY: Record<VConstraint, number> = { top: 0, scale: 0, stretch: 0, center: h / 2, bottom: h };
  return {
    ...place,
    x: place.w > 0 ? place.x : round(place.x - shiftX[place.horizontal]),
    y: place.h > 0 ? place.y : round(place.y - shiftY[place.vertical]),
    w: place.w > 0 ? place.w : round(w),
    h: place.h > 0 ? place.h : round(h),
  };
}

/** Align a child inside its free frame (uses the unrotated layout box). */
export function alignPlacement(place: Placement, edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"): Placement {
  switch (edge) {
    case "left":
      return { ...place, x: 0 };
    case "hcenter":
      return { ...place, x: round(place.pw / 2 - place.w / 2) };
    case "right":
      return { ...place, x: round(place.pw - place.w) };
    case "top":
      return { ...place, y: 0 };
    case "vcenter":
      return { ...place, y: round(place.ph / 2 - place.h / 2) };
    case "bottom":
      return { ...place, y: round(place.ph - place.h) };
  }
}
