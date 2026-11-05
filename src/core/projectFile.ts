// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `.landms` project files: plain JSON of the `Project` type. Loading checks
// the shape and fills in fields added in later versions, so a file from an
// older LandMs (or a hand-edited one) opens instead of crashing the editor.

import { builtinByName } from "./builtins";
import { normalizeSnapshot } from "./foling";
import { DEFAULT_PLACEMENT } from "./layout";
import { createRoot } from "./project";
import { createShape } from "./shapes";
import type { AxisSize, FrameNode, LayoutNode, Placement, Project, Screen, ShapeKind, ShapeNode } from "./types";

export const PROJECT_EXTENSION = "landms";

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

function size(value: unknown, fallback: AxisSize): AxisSize {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<AxisSize>;
  const mode = raw.mode === "fill" || raw.mode === "hug" || raw.mode === "fixed" ? raw.mode : fallback.mode;
  return { mode, value: typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : fallback.value };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function placement(value: unknown): Placement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const d = DEFAULT_PLACEMENT;
  return {
    x: finite(raw.x, d.x),
    y: finite(raw.y, d.y),
    w: Math.max(0, finite(raw.w, d.w)),
    h: Math.max(0, finite(raw.h, d.h)),
    rotation: finite(raw.rotation, 0),
    flipX: raw.flipX === true,
    flipY: raw.flipY === true,
    horizontal: oneOf(raw.horizontal, ["left", "right", "center", "stretch", "scale"] as const, "left"),
    vertical: oneOf(raw.vertical, ["top", "bottom", "center", "stretch", "scale"] as const, "top"),
    pw: Math.max(0, finite(raw.pw, 0)),
    ph: Math.max(0, finite(raw.ph, 0)),
  };
}

/** `{ place }` only when the file has one, so absent stays absent. */
function withPlacement(value: unknown): { place?: Placement } {
  const place = placement(value);
  return place ? { place } : {};
}

function shape(raw: Record<string, unknown>, id: string, name: string, hidden: boolean): ShapeNode {
  const kind = oneOf(raw.shape, ["rect", "ellipse", "line", "text", "image"] as const, "rect") as ShapeKind;
  const base = createShape(kind, { id });
  const text = { ...base.text, ...((raw.text as object) ?? {}) } as ShapeNode["text"];
  const image = { ...base.image, ...((raw.image as object) ?? {}) } as ShapeNode["image"];
  return {
    ...base,
    name: name || base.name,
    width: size(raw.width, base.width),
    height: size(raw.height, base.height),
    ...withPlacement(raw.place),
    fill: typeof raw.fill === "string" ? raw.fill : base.fill,
    stroke: typeof raw.stroke === "string" ? raw.stroke : base.stroke,
    strokeWidth: Math.max(0, finite(raw.strokeWidth, base.strokeWidth)),
    radius: Math.max(0, finite(raw.radius, base.radius)),
    opacity: Math.min(100, Math.max(0, finite(raw.opacity, base.opacity))),
    shadow: oneOf(raw.shadow, ["none", "soft", "hard"] as const, "none"),
    text: {
      ...text,
      content: typeof text.content === "string" ? text.content : base.text.content,
      tag: oneOf(text.tag, ["p", "h1", "h2", "h3", "span"] as const, "p"),
      fontFamily: oneOf(text.fontFamily, ["inherit", "sans", "serif", "mono", "rounded"] as const, "inherit"),
      fontSize: Math.max(1, finite(text.fontSize, base.text.fontSize)),
      fontWeight: finite(text.fontWeight, base.text.fontWeight),
      align: oneOf(text.align, ["left", "center", "right", "justify"] as const, "left"),
      lineHeight: finite(text.lineHeight, base.text.lineHeight),
      letterSpacing: finite(text.letterSpacing, 0),
    },
    image: { ...image, src: typeof image.src === "string" ? image.src : base.image.src, fit: oneOf(image.fit, ["cover", "contain", "fill"] as const, "cover") },
    href: typeof raw.href === "string" ? raw.href : "",
    hidden,
  };
}

function node(value: unknown, where: string): LayoutNode {
  if (!value || typeof value !== "object") throw new Error(`${where}: 要素が不正です。`);
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `${where}`;
  const name = typeof raw.name === "string" ? raw.name : "";
  const hidden = raw.hidden === true;
  if (raw.kind === "shape") return shape(raw, id, name, hidden);
  if (raw.kind === "module") {
    if (typeof raw.module !== "string") throw new Error(`${where}: モジュール名がありません。`);
    return {
      kind: "module",
      id,
      name: name || raw.module,
      module: raw.module,
      snapshot: normalizeSnapshot(raw.snapshot, where),
      width: size(raw.width, { mode: "fill", value: 0 }),
      height: size(raw.height, { mode: "hug", value: 0 }),
      hidden,
      ...withPlacement(raw.place),
    };
  }
  return frame(raw, where);
}

function frame(raw: Record<string, unknown>, where: string): FrameNode {
  const base = createRoot();
  const layout = { ...base.layout, ...((raw.layout as object) ?? {}) } as FrameNode["layout"];
  if (!Array.isArray(layout.padding) || layout.padding.length !== 4) layout.padding = [0, 0, 0, 0];
  // Absent means flex; keep files minimal and round trips exact.
  if (layout.mode === "free") layout.mode = "free";
  else delete layout.mode;
  const children = Array.isArray(raw.children) ? raw.children.map((child, index) => node(child, `${where}.${index + 1}`)) : [];
  return {
    ...base,
    id: typeof raw.id === "string" && raw.id ? raw.id : where,
    name: typeof raw.name === "string" ? raw.name : "フレーム",
    tag: (typeof raw.tag === "string" ? raw.tag : "div") as FrameNode["tag"],
    anchor: typeof raw.anchor === "string" ? raw.anchor : "",
    layout,
    width: size(raw.width, { mode: "fill", value: 0 }),
    height: size(raw.height, { mode: "hug", value: 0 }),
    style: { ...base.style, ...((raw.style as object) ?? {}) },
    hidden: raw.hidden === true,
    ...withPlacement(raw.place),
    children,
  };
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseProject(text: string): Project {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("LandMsのプロジェクトファイル（JSON）として読み込めません。");
  }
  if (!raw || raw.format !== "landms") throw new Error("LandMsのプロジェクトファイルではありません。");
  if (raw.version !== 1) throw new Error(`未対応のバージョンです（${String(raw.version)}）。LandMsを更新してください。`);
  if (!Array.isArray(raw.screens) || !raw.screens.length) throw new Error("画面が1つもありません。");

  const screens: Screen[] = raw.screens.map((value, index) => {
    const screen = value as Record<string, unknown>;
    const root = frame((screen.root as Record<string, unknown>) ?? {}, `screen${index + 1}`);
    return {
      id: typeof screen.id === "string" ? screen.id : `screen${index + 1}`,
      name: typeof screen.name === "string" ? screen.name : `Screen ${index + 1}`,
      icon: (["desktop", "tablet", "mobile", "custom"].includes(screen.icon as string) ? screen.icon : "custom") as Screen["icon"],
      canvasWidth: nullableNumber(screen.canvasWidth) ?? 1280,
      canvasHeight: nullableNumber(screen.canvasHeight) ?? 800,
      minWidth: nullableNumber(screen.minWidth),
      maxWidth: nullableNumber(screen.maxWidth),
      root,
    };
  });

  const modules: Project["modules"] = {};
  for (const [name, entry] of Object.entries((raw.modules as Record<string, unknown>) ?? {})) {
    const value = entry as { def?: { name?: unknown; snapshot?: unknown; css?: unknown }; source?: unknown; origin?: unknown };
    if (!value?.def) continue;
    modules[name] = {
      def: { name, snapshot: normalizeSnapshot(value.def.snapshot, name), css: typeof value.def.css === "string" ? value.def.css : "" },
      source: value.source === "builtin" || builtinByName[name] ? "builtin" : "imported",
      ...(typeof value.origin === "string" ? { origin: value.origin } : {}),
    };
  }

  const head = (raw.head as Record<string, unknown>) ?? {};
  const assets: Project["assets"] = {};
  for (const [id, value] of Object.entries((raw.assets as Record<string, unknown>) ?? {})) {
    const asset = value as Record<string, unknown>;
    if (typeof asset.name === "string" && typeof asset.data === "string" && typeof asset.mime === "string") {
      assets[id] = { id, name: asset.name, mime: asset.mime, data: asset.data };
    }
  }
  return {
    format: "landms",
    version: 1,
    name: typeof raw.name === "string" ? raw.name : "Untitled",
    head: {
      title: typeof head.title === "string" ? head.title : "",
      description: typeof head.description === "string" ? head.description : "",
      lang: typeof head.lang === "string" ? head.lang : "ja",
      themeColor: typeof head.themeColor === "string" ? head.themeColor : "",
    },
    variables: { colorInk: "#17201d", colorPaper: "#f2f0e9", colorAccent: "#c7ff5e", ...((raw.variables as Record<string, string>) ?? {}) },
    cssReset: raw.cssReset !== false,
    screens,
    modules,
    assets,
  };
}
