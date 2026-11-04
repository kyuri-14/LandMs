// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Factories for frames, module instances, screens and the starter project.

import { builtinByName } from "./builtins";
import { deepClone, newId } from "./tree";
import type {
  AxisSize,
  FolingModuleDef,
  FrameNode,
  FrameTag,
  LayoutNode,
  ModuleNode,
  Project,
  Screen,
  ScreenIcon,
} from "./types";

const fill: AxisSize = { mode: "fill", value: 0 };
const hug: AxisSize = { mode: "hug", value: 0 };
const fixed = (value: number): AxisSize => ({ mode: "fixed", value });

export type FramePreset = "row" | "column" | "header" | "main" | "section" | "footer" | "grid";

export const framePresets: Array<{ preset: FramePreset; label: string; description: string }> = [
  { preset: "row", label: "横並び", description: "子要素を左右に並べる" },
  { preset: "column", label: "縦並び", description: "子要素を上下に並べる" },
  { preset: "header", label: "ヘッダー", description: "上部に固定できる帯" },
  { preset: "section", label: "セクション", description: "余白つきの区画" },
  { preset: "grid", label: "折り返し", description: "横に並べて自動で改行" },
  { preset: "footer", label: "フッター", description: "ページ下部の帯" },
];

export function createFrame(preset: FramePreset, overrides: Partial<FrameNode> = {}): FrameNode {
  const base: FrameNode = {
    kind: "frame",
    id: newId("f"),
    name: "フレーム",
    tag: "div",
    anchor: "",
    layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 16, padding: [0, 0, 0, 0] },
    width: fill,
    height: hug,
    style: { background: "transparent", color: "inherit", radius: 0, borderWidth: 0, borderColor: "#17201d", sticky: false },
    hidden: false,
    children: [],
  };
  const presets: Record<FramePreset, Partial<FrameNode>> = {
    row: { name: "横並び", layout: { ...base.layout, direction: "row", align: "center", gap: 16 } },
    column: { name: "縦並び", layout: { ...base.layout, direction: "column", gap: 16 } },
    header: {
      name: "ヘッダー",
      tag: "header",
      layout: { direction: "row", justify: "space-between", align: "center", wrap: false, gap: 24, padding: [0, 40, 0, 40] },
      height: fixed(80),
      style: { ...base.style, background: "#f2f0e9", sticky: true },
    },
    main: { name: "メイン", tag: "main", layout: { ...base.layout, gap: 0 }, height: fill },
    section: {
      name: "セクション",
      tag: "section",
      layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 24, padding: [72, 40, 72, 40] },
    },
    grid: { name: "折り返し", layout: { direction: "row", justify: "flex-start", align: "flex-start", wrap: true, gap: 16, padding: [0, 0, 0, 0] } },
    footer: {
      name: "フッター",
      tag: "footer",
      layout: { direction: "row", justify: "space-between", align: "center", wrap: true, gap: 24, padding: [48, 40, 48, 40] },
      style: { ...base.style, background: "#17201d", color: "#f2f0e9" },
    },
  };
  return { ...base, ...presets[preset], ...overrides, id: overrides.id ?? base.id };
}

export function createModuleInstance(def: FolingModuleDef, overrides: Partial<ModuleNode> = {}): ModuleNode {
  const builtin = builtinByName[def.name];
  return {
    kind: "module",
    id: newId("m"),
    name: builtin?.label ?? def.name,
    module: def.name,
    snapshot: deepClone(def.snapshot),
    width: builtin ? { ...builtin.width } : fill,
    height: builtin ? { ...builtin.height } : hug,
    hidden: false,
    ...overrides,
  };
}

/** Make sure the module definition an instance refers to is stored in the project. */
export function withModule(project: Project, def: FolingModuleDef): Project {
  if (project.modules[def.name]) return project;
  const source = builtinByName[def.name] ? "builtin" : "imported";
  return { ...project, modules: { ...project.modules, [def.name]: { def: deepClone(def), source } } };
}

function builtin(name: string, overrides: Partial<ModuleNode> = {}): ModuleNode {
  const module = builtinByName[name];
  if (!module) throw new Error(`Unknown built-in module: ${name}`);
  return createModuleInstance(module.def, overrides);
}

function withContent(node: ModuleNode, path: number[], content: string): ModuleNode {
  const copy = deepClone(node);
  let target = copy.snapshot;
  for (const index of path) target = target.children[index];
  target.config.content = content;
  return copy;
}

export function createRoot(children: LayoutNode[] = []): FrameNode {
  return createFrame("column", {
    name: "ページ",
    layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 0, padding: [0, 0, 0, 0] },
    width: fill,
    height: hug,
    style: { background: "#f2f0e9", color: "#17201d", radius: 0, borderWidth: 0, borderColor: "#17201d", sticky: false },
    children,
  });
}

export const screenPresets: Record<Exclude<ScreenIcon, "custom">, Pick<Screen, "name" | "icon" | "canvasWidth" | "canvasHeight" | "minWidth" | "maxWidth">> = {
  desktop: { name: "Desktop", icon: "desktop", canvasWidth: 1280, canvasHeight: 800, minWidth: 1025, maxWidth: null },
  tablet: { name: "Tablet", icon: "tablet", canvasWidth: 820, canvasHeight: 1180, minWidth: 641, maxWidth: 1024 },
  mobile: { name: "Mobile", icon: "mobile", canvasWidth: 390, canvasHeight: 844, minWidth: null, maxWidth: 640 },
};

function sectionWith(name: string, anchor: string, children: LayoutNode[], overrides: Partial<FrameNode> = {}): FrameNode {
  return createFrame("section", { name, anchor, children, ...overrides });
}

function desktopRoot(): FrameNode {
  return createRoot([
    createFrame("header", { children: [builtin("logo"), builtin("nav"), builtin("button", { width: hug })] }),
    createFrame("main", {
      children: [
        builtin("hero"),
        sectionWith("作品", "work", [builtin("heading"), builtin("carousel")], { style: { ...createFrame("section").style, background: "#dde4d5" } }),
        sectionWith("できること", "about", [withContent(builtin("heading"), [], "Three ways we help"), builtin("cards")]),
        sectionWith("お問い合わせ", "contact", [withContent(builtin("heading"), [], "Let’s make something useful."), builtin("form")], {
          style: { ...createFrame("section").style, background: "#c7ff5e" },
        }),
      ],
    }),
    createFrame("footer", { children: [builtin("logo"), builtin("social"), builtin("copyright")] }),
  ]);
}

function tabletRoot(): FrameNode {
  return createRoot([
    createFrame("header", {
      layout: { direction: "row", justify: "space-between", align: "center", wrap: false, gap: 20, padding: [0, 28, 0, 28] },
      height: fixed(72),
      children: [builtin("logo"), builtin("nav")],
    }),
    createFrame("main", {
      children: [
        builtin("hero"),
        sectionWith("できること", "about", [withContent(builtin("heading"), [], "Three ways we help"), builtin("cards")], {
          layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 24, padding: [56, 28, 56, 28] },
        }),
        sectionWith("お問い合わせ", "contact", [withContent(builtin("heading"), [], "Let’s make something useful."), builtin("form")], {
          layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 24, padding: [56, 28, 56, 28] },
          style: { ...createFrame("section").style, background: "#c7ff5e" },
        }),
      ],
    }),
    createFrame("footer", {
      layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 16, padding: [40, 28, 40, 28] },
      children: [builtin("logo"), builtin("social"), builtin("copyright")],
    }),
  ]);
}

function mobileRoot(): FrameNode {
  return createRoot([
    createFrame("header", {
      layout: { direction: "row", justify: "space-between", align: "center", wrap: false, gap: 12, padding: [0, 20, 0, 20] },
      height: fixed(64),
      children: [builtin("logo"), builtin("hamburger")],
    }),
    createFrame("main", {
      children: [
        builtin("hero"),
        sectionWith("作品", "work", [builtin("carousel")], {
          layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 20, padding: [32, 20, 32, 20] },
        }),
        sectionWith("できること", "about", [withContent(builtin("heading"), [], "Three ways we help"), builtin("cards")], {
          layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 20, padding: [40, 20, 40, 20] },
        }),
        sectionWith("お問い合わせ", "contact", [withContent(builtin("heading"), [], "Let’s talk."), builtin("form")], {
          layout: { direction: "column", justify: "flex-start", align: "flex-start", wrap: false, gap: 20, padding: [40, 20, 40, 20] },
          style: { ...createFrame("section").style, background: "#c7ff5e" },
        }),
      ],
    }),
    createFrame("footer", {
      layout: { direction: "column", justify: "flex-start", align: "center", wrap: false, gap: 14, padding: [36, 20, 36, 20] },
      children: [builtin("logo"), builtin("social"), builtin("copyright")],
    }),
  ]);
}

export function createScreen(icon: Exclude<ScreenIcon, "custom">, root?: FrameNode): Screen {
  const preset = screenPresets[icon];
  const roots = { desktop: desktopRoot, tablet: tabletRoot, mobile: mobileRoot };
  return { id: newId("s"), ...preset, root: root ?? roots[icon]() };
}

/** Collect every module definition referenced by the tree into project.modules. */
export function registerUsedBuiltins(project: Project): Project {
  let next = project;
  const visit = (node: LayoutNode) => {
    if (node.kind === "module") {
      const builtinModule = builtinByName[node.module];
      if (builtinModule) next = withModule(next, builtinModule.def);
    } else node.children.forEach(visit);
  };
  project.screens.forEach((screen) => visit(screen.root));
  return next;
}

export function createStarterProject(): Project {
  const project: Project = {
    format: "landms",
    version: 1,
    name: "North Studio",
    head: {
      title: "NORTH/STUDIO",
      description: "ブランド、デジタル、空間のデザインスタジオ",
      lang: "ja",
      themeColor: "#17201d",
    },
    variables: {
      colorInk: "#17201d",
      colorPaper: "#f2f0e9",
      colorAccent: "#c7ff5e",
    },
    cssReset: true,
    screens: [createScreen("desktop"), createScreen("tablet"), createScreen("mobile")],
    modules: {},
    assets: {},
  };
  return registerUsedBuiltins(project);
}

export function createBlankProject(): Project {
  const root = createRoot([createFrame("header"), createFrame("main"), createFrame("footer")]);
  return {
    ...createStarterProject(),
    name: "Untitled",
    head: { title: "Untitled", description: "", lang: "ja", themeColor: "#17201d" },
    screens: [{ ...createScreen("desktop", root), minWidth: null }],
    modules: {},
    assets: {},
  };
}

export const frameTags: Array<{ value: FrameTag; label: string }> = [
  { value: "div", label: "div — 汎用" },
  { value: "header", label: "header — ヘッダー" },
  { value: "nav", label: "nav — ナビゲーション" },
  { value: "main", label: "main — 本文" },
  { value: "section", label: "section — セクション" },
  { value: "article", label: "article — 記事" },
  { value: "aside", label: "aside — 補足" },
  { value: "footer", label: "footer — フッター" },
];
