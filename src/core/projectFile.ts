// SPDX-License-Identifier: AGPL-3.0-or-later
//
// `.landms` project files: plain JSON of the `Project` type. Loading checks
// the shape and fills in fields added in later versions, so a file from an
// older LandMs (or a hand-edited one) opens instead of crashing the editor.

import { builtinByName } from "./builtins";
import { normalizeSnapshot } from "./foling";
import { createRoot } from "./project";
import type { AxisSize, FrameNode, LayoutNode, Project, Screen } from "./types";

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

function node(value: unknown, where: string): LayoutNode {
  if (!value || typeof value !== "object") throw new Error(`${where}: 要素が不正です。`);
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" && raw.id ? raw.id : `${where}`;
  const name = typeof raw.name === "string" ? raw.name : "";
  const hidden = raw.hidden === true;
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
    };
  }
  return frame(raw, where);
}

function frame(raw: Record<string, unknown>, where: string): FrameNode {
  const base = createRoot();
  const layout = { ...base.layout, ...((raw.layout as object) ?? {}) } as FrameNode["layout"];
  if (!Array.isArray(layout.padding) || layout.padding.length !== 4) layout.padding = [0, 0, 0, 0];
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
