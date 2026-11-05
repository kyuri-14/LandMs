// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Turns LandMs layout settings into CSS declarations. The declarations are
// written as Foling `css:` blocks (one declaration per line, no selector), so
// the same text works in config.yaml, inline styles and generated rules.
//
// Two kinds of frames:
//   • flex frames place children in a row / column (Figma's auto layout);
//     a child's size is "fill", "hug" or "fixed".
//   • free frames place children anywhere (Illustrator / InDesign); a child
//     is `position: absolute` with its Placement and constraints.

import type { AxisSize, FlexDirection, FrameNode, ModuleNode, Placement } from "./types";

export type ParentContext = { mode: "flex"; direction: FlexDirection } | { mode: "free" };
/** A plain direction is accepted as shorthand for a flex parent. */
export type ParentArg = ParentContext | FlexDirection | null;

export function isRowDirection(direction: FlexDirection): boolean {
  return direction === "row" || direction === "row-reverse";
}

export function isFree(frame: FrameNode): boolean {
  return frame.layout.mode === "free";
}

export function parentContext(frame: FrameNode): ParentContext {
  return isFree(frame) ? { mode: "free" } : { mode: "flex", direction: frame.layout.direction };
}

export function toParentContext(parent: ParentArg): ParentContext | null {
  if (parent === null) return null;
  return typeof parent === "string" ? { mode: "flex", direction: parent } : parent;
}

export const DEFAULT_PLACEMENT: Placement = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  horizontal: "left",
  vertical: "top",
  pw: 0,
  ph: 0,
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function px(value: number): string {
  const rounded = round(value);
  return rounded === 0 ? "0" : `${rounded}px`;
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${round((part / whole) * 100, 4)}%` : px(part);
}

/** `50%` shifted by a px offset, e.g. calc(50% - 120px). */
function fromCenter(offset: number): string {
  const rounded = round(offset);
  if (rounded === 0) return "50%";
  return rounded > 0 ? `calc(50% + ${rounded}px)` : `calc(50% - ${-rounded}px)`;
}

/**
 * CSS for a child of a free frame. Horizontal constraints:
 *   left    → keeps its distance from the left edge
 *   right   → keeps its distance from the right edge
 *   center  → keeps its offset from the centre (default: compositions stay centred on wider screens)
 *   stretch → keeps both distances and grows with the frame
 *   scale   → position and width are percentages of the frame
 * Vertical constraints work the same way with top / bottom.
 */
export function placementDeclarations(place: Placement | undefined, width: AxisSize, height: AxisSize): string[] {
  const p = place ?? DEFAULT_PLACEMENT;
  const decls = ["position: absolute;"];
  let shiftX = false;
  let shiftY = false;

  switch (p.horizontal) {
    case "right":
      decls.push(`right: ${px(p.pw - p.x - p.w)};`);
      break;
    case "center":
      decls.push(`left: ${fromCenter(p.x + p.w / 2 - p.pw / 2)};`);
      shiftX = true;
      break;
    case "stretch":
      decls.push(`left: ${px(p.x)};`, `right: ${px(p.pw - p.x - p.w)};`);
      break;
    case "scale":
      decls.push(`left: ${percent(p.x, p.pw)};`);
      break;
    default:
      decls.push(`left: ${px(p.x)};`);
  }
  switch (p.vertical) {
    case "bottom":
      decls.push(`bottom: ${px(p.ph - p.y - p.h)};`);
      break;
    case "center":
      decls.push(`top: ${fromCenter(p.y + p.h / 2 - p.ph / 2)};`);
      shiftY = true;
      break;
    case "stretch":
      decls.push(`top: ${px(p.y)};`, `bottom: ${px(p.ph - p.y - p.h)};`);
      break;
    case "scale":
      decls.push(`top: ${percent(p.y, p.ph)};`);
      break;
    default:
      decls.push(`top: ${px(p.y)};`);
  }

  // "hug" lets the content decide (point text, modules); anything else is the placed size.
  // An absolutely positioned box would otherwise shrink to the space left before the
  // frame's right edge and wrap its text; max-content keeps the width it has in a flex row.
  if (p.horizontal === "scale") decls.push(`width: ${percent(p.w, p.pw)};`);
  else if (p.horizontal !== "stretch") {
    if (width.mode === "hug") decls.push("width: max-content;");
    else {
      const value = width.mode === "fixed" ? width.value : p.w;
      if (value > 0) decls.push(`width: ${px(value)};`);
    }
  }
  if (p.vertical === "scale") decls.push(`height: ${percent(p.h, p.ph)};`);
  else if (p.vertical !== "stretch" && height.mode !== "hug") {
    const value = height.mode === "fixed" ? height.value : p.h;
    if (value > 0) decls.push(`height: ${px(value)};`);
  }

  const transforms: string[] = [];
  if (shiftX && shiftY) transforms.push("translate(-50%, -50%)");
  else if (shiftX) transforms.push("translateX(-50%)");
  else if (shiftY) transforms.push("translateY(-50%)");
  if (round(p.rotation) !== 0) transforms.push(`rotate(${round(p.rotation)}deg)`);
  if (p.flipX || p.flipY) transforms.push(`scale(${p.flipX ? -1 : 1}, ${p.flipY ? -1 : 1})`);
  if (transforms.length) decls.push(`transform: ${transforms.join(" ")};`);
  return decls;
}

/**
 * Size (and, in a free frame, position) of a child.
 *
 * In a flex parent, Figma-style:
 * - main axis (width in a row, height in a column):
 *   fill → grows to take the free space, hug → content size, fixed → px.
 * - cross axis: fill → stretches to the parent, hug → content size, fixed → px.
 */
export function sizingDeclarations(width: AxisSize, height: AxisSize, parent: ParentArg, place?: Placement): string[] {
  const context = toParentContext(parent);
  if (context === null) {
    // Screen root: always as wide as the viewport, at least one screen tall.
    return ["width: 100%;", "min-height: 100vh;"];
  }
  if (context.mode === "free") return placementDeclarations(place, width, height);

  const decls: string[] = [];
  const row = isRowDirection(context.direction);
  const main = row ? width : height;
  const cross = row ? height : width;
  const mainProp = row ? "width" : "height";
  const crossProp = row ? "height" : "width";

  if (main.mode === "fill") {
    decls.push("flex: 1 1 0%;", `min-${mainProp}: 0;`);
  } else if (main.mode === "fixed") {
    decls.push("flex: 0 0 auto;", `${mainProp}: ${px(main.value)};`);
  } else {
    decls.push("flex: 0 0 auto;");
  }

  if (cross.mode === "fill") {
    decls.push("align-self: stretch;");
  } else if (cross.mode === "fixed") {
    decls.push(`${crossProp}: ${px(cross.value)};`);
  }

  // A fixed width must never push the page sideways on a narrower device.
  if (width.mode === "fixed") decls.push("max-width: 100%;");
  return decls;
}

export function frameDeclarations(frame: FrameNode, parent: ParentArg): string[] {
  const context = toParentContext(parent);
  const { layout, style } = frame;
  const free = isFree(frame);
  const decls: string[] = [];
  if (free) {
    // Children are `position: absolute`, so the frame must be positioned. A
    // frame that is itself placed freely already is (position: absolute).
    if (context?.mode !== "free") decls.push("position: relative;");
  } else {
    decls.push("display: flex;", `flex-direction: ${layout.direction};`);
    if (layout.justify !== "flex-start") decls.push(`justify-content: ${layout.justify};`);
    if (layout.align !== "flex-start") decls.push(`align-items: ${layout.align};`);
    if (layout.wrap) decls.push("flex-wrap: wrap;");
    if (layout.gap) decls.push(`gap: ${px(layout.gap)};`);
    const [top, right, bottom, left] = layout.padding;
    if (top || right || bottom || left) {
      decls.push(
        top === bottom && left === right
          ? top === left
            ? `padding: ${px(top)};`
            : `padding: ${px(top)} ${px(right)};`
          : `padding: ${px(top)} ${px(right)} ${px(bottom)} ${px(left)};`,
      );
    }
  }
  decls.push(...sizingDeclarations(frame.width, frame.height, context, frame.place));
  if (free && context === null && frame.height.mode === "fixed") decls.push(`height: ${px(frame.height.value)};`);
  // Absolute children do not give a frame any height: never let a free frame collapse.
  if (free && context?.mode !== "free" && frame.height.mode === "hug") decls.push("min-height: 320px;");
  if (style.background && style.background !== "transparent") decls.push(`background-color: ${style.background};`);
  if (style.color && style.color !== "inherit") decls.push(`color: ${style.color};`);
  if (style.radius) decls.push(`border-radius: ${px(style.radius)};`);
  if (style.borderWidth) decls.push(`border: ${px(style.borderWidth)} solid ${style.borderColor || "currentColor"};`);
  if (style.clip) decls.push("overflow: hidden;");
  if (style.sticky && context?.mode !== "free") decls.push("position: sticky;", "top: 0;", "z-index: 50;");
  return decls;
}

export function moduleDeclarations(module: ModuleNode, parent: ParentArg): string[] {
  const context = toParentContext(parent);
  const decls = sizingDeclarations(module.width, module.height, context, module.place);
  // Foling modules are written for normal block flow, where `margin: 0 auto`
  // centres a max-width box. In a flex column those auto margins cancel
  // `align-self: stretch` and the module collapses to its content width, so
  // "fill" also sets the width explicitly to keep the block-flow result.
  if (context?.mode === "flex" && !isRowDirection(context.direction) && module.width.mode === "fill") decls.push("width: 100%;");
  return decls;
}

/** Join a module's own css block with extra declarations, one per line. */
export function mergeCss(base: string | undefined, extra: string[]): string {
  const lines = (base ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...lines, ...extra].join("\n");
}
