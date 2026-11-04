// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Turns LandMs layout settings into CSS declarations. The declarations are
// written as Foling `css:` blocks (one declaration per line, no selector), so
// the same text works in config.yaml, inline styles and generated rules.

import type { AxisSize, FlexDirection, FrameNode, ModuleNode } from "./types";

export function isRowDirection(direction: FlexDirection): boolean {
  return direction === "row" || direction === "row-reverse";
}

function px(value: number): string {
  return value === 0 ? "0" : `${Math.round(value * 100) / 100}px`;
}

/**
 * Figma-style sizing of a child inside a flex parent.
 *
 * - main axis (width in a row, height in a column):
 *   fill → grows to take the free space, hug → content size, fixed → px.
 * - cross axis: fill → stretches to the parent, hug → content size, fixed → px.
 */
export function sizingDeclarations(
  width: AxisSize,
  height: AxisSize,
  parentDirection: FlexDirection | null,
): string[] {
  const decls: string[] = [];
  if (parentDirection === null) {
    // Screen root: always as wide as the viewport, at least one screen tall.
    decls.push("width: 100%;", "min-height: 100vh;");
    return decls;
  }
  const row = isRowDirection(parentDirection);
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

export function frameDeclarations(frame: FrameNode, parentDirection: FlexDirection | null): string[] {
  const { layout, style } = frame;
  const decls = ["display: flex;", `flex-direction: ${layout.direction};`];
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
  decls.push(...sizingDeclarations(frame.width, frame.height, parentDirection));
  if (style.background && style.background !== "transparent") decls.push(`background-color: ${style.background};`);
  if (style.color && style.color !== "inherit") decls.push(`color: ${style.color};`);
  if (style.radius) decls.push(`border-radius: ${px(style.radius)};`);
  if (style.borderWidth) decls.push(`border: ${px(style.borderWidth)} solid ${style.borderColor || "currentColor"};`);
  if (style.sticky) decls.push("position: sticky;", "top: 0;", "z-index: 50;");
  return decls;
}

export function moduleDeclarations(module: ModuleNode, parentDirection: FlexDirection | null): string[] {
  const decls = sizingDeclarations(module.width, module.height, parentDirection);
  // Foling modules are written for normal block flow, where `margin: 0 auto`
  // centres a max-width box. In a flex column those auto margins cancel
  // `align-self: stretch` and the module collapses to its content width, so
  // "fill" also sets the width explicitly to keep the block-flow result.
  if (parentDirection && !isRowDirection(parentDirection) && module.width.mode === "fill") decls.push("width: 100%;");
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
