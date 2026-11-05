// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shapes: the rectangle / ellipse / line / type / image objects drawn with
// the canvas tools. Each shape becomes one ordinary HTML element (two when it
// is a link), so the HTFL export stays plain Foling: a folder per element and
// the drawing attributes as its `css:` block.

import { placeholderImage } from "./builtins";
import { px, sizingDeclarations, type ParentContext } from "./layout";
import { newId } from "./tree";
import type { AxisSize, FolingNodeConfig, FolingSnapshot, FontFamily, ShapeKind, ShapeNode } from "./types";

export const shapeLabels: Record<ShapeKind, string> = {
  rect: "長方形",
  ellipse: "楕円",
  line: "線",
  text: "テキスト",
  image: "画像",
};

export const fontStacks: Record<Exclude<FontFamily, "inherit">, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif',
  serif: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", Georgia, serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, "Noto Sans Mono", monospace',
  rounded: '"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Arial Rounded MT Bold", sans-serif',
};

const fixed = (value: number): AxisSize => ({ mode: "fixed", value });
const hug: AxisSize = { mode: "hug", value: 0 };

/** Default size of a shape added by a click instead of a drag. */
export const defaultShapeSize: Record<ShapeKind, { w: number; h: number }> = {
  rect: { w: 200, h: 120 },
  ellipse: { w: 160, h: 160 },
  line: { w: 240, h: 2 },
  text: { w: 0, h: 0 },
  image: { w: 320, h: 200 },
};

export function createShape(kind: ShapeKind, overrides: Partial<ShapeNode> = {}): ShapeNode {
  const size = defaultShapeSize[kind];
  const base: ShapeNode = {
    kind: "shape",
    id: newId("sh"),
    name: shapeLabels[kind],
    shape: kind,
    width: kind === "text" ? hug : fixed(size.w),
    height: kind === "text" ? hug : fixed(size.h),
    fill: kind === "rect" ? "#c7ff5e" : kind === "ellipse" ? "#5268ff" : "transparent",
    stroke: "#17201d",
    strokeWidth: kind === "line" ? 2 : 0,
    radius: 0,
    opacity: 100,
    shadow: "none",
    text: {
      content: "テキスト",
      tag: "p",
      fontFamily: "inherit",
      fontSize: 32,
      fontWeight: 700,
      italic: false,
      underline: false,
      color: "inherit",
      align: "left",
      lineHeight: 1.3,
      letterSpacing: 0,
    },
    image: { src: placeholderImage("IMAGE", "#c5d0c1", "#5f7a6a"), alt: "", fit: "cover" },
    href: "",
    hidden: false,
  };
  return { ...base, ...overrides, id: overrides.id ?? base.id };
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Lines are always as thick as their stroke, whatever size they were given. */
export function effectiveHeight(shape: ShapeNode): AxisSize {
  return shape.shape === "line" ? fixed(Math.max(1, shape.strokeWidth)) : shape.height;
}

export function shapeDeclarations(shape: ShapeNode, parent: ParentContext): string[] {
  const decls: string[] = [];
  const kind = shape.shape;
  if (kind === "line") decls.push(`background-color: ${shape.stroke};`);
  else if (kind !== "image" && shape.fill && shape.fill !== "transparent") decls.push(`background-color: ${shape.fill};`);
  if (kind !== "line" && shape.strokeWidth > 0) decls.push(`border: ${px(shape.strokeWidth)} solid ${shape.stroke};`);
  if (kind === "ellipse") decls.push("border-radius: 50%;");
  else if (shape.radius > 0) decls.push(`border-radius: ${px(shape.radius)};`);
  if (shape.opacity < 100) decls.push(`opacity: ${round(Math.max(0, shape.opacity) / 100, 2)};`);
  if (shape.shadow === "soft") decls.push("box-shadow: 0 12px 32px rgba(0, 0, 0, .18);");
  if (shape.shadow === "hard") decls.push(`box-shadow: 6px 6px 0 ${shape.stroke};`);
  if (kind === "image") decls.push("display: block;", `object-fit: ${shape.image.fit};`);
  else if (shape.href) decls.push("display: block;");
  if (kind === "text") {
    const text = shape.text;
    decls.push("margin: 0;");
    if (text.fontFamily !== "inherit") decls.push(`font-family: ${fontStacks[text.fontFamily]};`);
    decls.push(`font-size: ${px(text.fontSize)};`);
    if (text.fontWeight !== 400) decls.push(`font-weight: ${text.fontWeight};`);
    if (text.italic) decls.push("font-style: italic;");
    if (text.underline) decls.push("text-decoration: underline;");
    if (text.color && text.color !== "inherit") decls.push(`color: ${text.color};`);
    if (text.align !== "left") decls.push(`text-align: ${text.align};`);
    decls.push(`line-height: ${round(text.lineHeight, 2)};`);
    if (text.letterSpacing) decls.push(`letter-spacing: ${round(text.letterSpacing / 1000)}em;`);
    // Point text (width "hug") in a free frame stays on one line, like Illustrator's point type.
    decls.push(parent.mode === "free" && shape.width.mode === "hug" ? "white-space: nowrap;" : "overflow-wrap: anywhere;");
  }
  return decls;
}

function linesOf(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

/**
 * The element tree of a shape. `annotate` adds the editor's data-lm-*
 * markers (data-lm-text marks the element whose text is edited in place).
 */
export function shapeSnapshot(shape: ShapeNode, parent: ParentContext, annotate = false): FolingSnapshot {
  const css = [...shapeDeclarations(shape, parent), ...sizingDeclarations(shape.width, effectiveHeight(shape), parent, shape.place)].join("\n");
  const marker: Record<string, string> = annotate ? { "data-lm-node": shape.id, "data-lm-kind": "shape", "data-lm-shape": shape.shape } : {};
  const href = shape.href.trim();
  const attributes = (extra: Record<string, string>): Record<string, string> | undefined => {
    const merged = { ...marker, ...extra };
    return Object.keys(merged).length ? merged : undefined;
  };

  if (shape.shape === "image") {
    const image = { src: shape.image.src, alt: shape.image.alt };
    if (!href) return { name: "img", config: { classes: ["lm-shape"], attributes: attributes(image), css }, children: [] };
    return {
      name: "a",
      config: { classes: ["lm-shape", "lm-shape-link"], attributes: attributes({ href }), css },
      children: [
        {
          name: "img",
          config: { attributes: image, css: `display: block;\nwidth: 100%;\nheight: 100%;\nobject-fit: ${shape.image.fit};\nborder-radius: inherit;` },
          children: [],
        },
      ],
    };
  }

  if (shape.shape === "text") {
    const lines = linesOf(shape.text.content);
    const multiline = lines.length > 1;
    const textMarker: Record<string, string> = annotate ? { "data-lm-text": "" } : {};
    const body: Pick<FolingNodeConfig, "content"> = multiline || !lines[0] ? {} : { content: lines[0] };
    const spans: FolingSnapshot[] = multiline ? lines.map((line) => ({ name: "span", config: line ? { content: line } : {}, children: [] })) : [];
    const tag = shape.text.tag;
    if (!href) {
      return {
        name: tag,
        config: { classes: multiline ? ["lm-shape", "lm-text-lines"] : ["lm-shape"], attributes: attributes(textMarker), ...body, css },
        children: spans,
      };
    }
    const linkAttributes: Record<string, string> = { href, ...textMarker };
    return {
      name: tag,
      config: { classes: ["lm-shape"], attributes: attributes({}), css },
      children: [{ name: "a", config: { classes: multiline ? ["lm-shape-link", "lm-text-lines"] : ["lm-shape-link"], attributes: linkAttributes, ...body }, children: spans }],
    };
  }

  return {
    name: href ? "a" : "div",
    config: { classes: href ? ["lm-shape", "lm-shape-link"] : ["lm-shape"], attributes: attributes(href ? { href } : {}), css },
    children: [],
  };
}
