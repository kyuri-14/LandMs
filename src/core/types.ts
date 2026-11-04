// SPDX-License-Identifier: AGPL-3.0-or-later
//
// LandMs data model.
//
//   Project
//   └─ Screen (responsive variant, shown when its width condition matches)
//      └─ Frame (layout container: flex direction, size, spacing, style)
//         ├─ Frame …
//         └─ Module instance (a Foling module snapshot placed in the layout)
//
// Frames are the "L" (layout) and module instances are the "Ms" (modules).
// Module snapshots use exactly the Foling `NodeSnapshot` / `ModuleDef` shape,
// so anything placed in LandMs can round-trip to and from Foling.

// ---------- Foling (HTFL) shapes ----------

export type FolingLink = { rel: string; href: string; type?: string };

/** Mirrors Foling's `NodeConfig` (config.yaml). Every field is optional. */
export type FolingNodeConfig = {
  tag?: string;
  id?: string;
  classes?: string[];
  available_classes?: string[];
  disabled_inherits?: string[];
  attributes?: Record<string, string>;
  content?: string;
  css?: string;
  js?: string;
  links?: FolingLink[];
};

/** Mirrors Foling's `NodeSnapshot`: one element folder and its children. */
export type FolingSnapshot = {
  name: string;
  config: FolingNodeConfig;
  children: FolingSnapshot[];
};

/** Mirrors Foling's `ModuleDef` (one entry of a modules/*.yaml file). */
export type FolingModuleDef = {
  name: string;
  snapshot: FolingSnapshot;
  css: string;
};

// ---------- Layout ----------

/** Figma auto-layout sizing: fill the parent, hug the content, or fixed px. */
export type SizeMode = "fill" | "hug" | "fixed";
export type AxisSize = { mode: SizeMode; value: number };

export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type Justify =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type AlignItems = "flex-start" | "center" | "flex-end" | "baseline";

export type FrameTag = "div" | "header" | "nav" | "main" | "section" | "article" | "aside" | "footer";

export type FrameLayout = {
  direction: FlexDirection;
  justify: Justify;
  align: AlignItems;
  wrap: boolean;
  gap: number;
  /** top, right, bottom, left (px) */
  padding: [number, number, number, number];
};

export type FrameStyle = {
  background: string;
  color: string;
  radius: number;
  borderWidth: number;
  borderColor: string;
  /** Stick to the top of the viewport while scrolling (typical for headers). */
  sticky: boolean;
};

export type FrameNode = {
  kind: "frame";
  id: string;
  name: string;
  tag: FrameTag;
  /** Optional HTML id so links like `#contact` can target the frame. */
  anchor: string;
  layout: FrameLayout;
  width: AxisSize;
  height: AxisSize;
  style: FrameStyle;
  hidden: boolean;
  children: LayoutNode[];
};

export type ModuleNode = {
  kind: "module";
  id: string;
  name: string;
  /** Name of the module definition in `Project.modules`. */
  module: string;
  /** This instance's own copy of the module tree (content, links, behaviour). */
  snapshot: FolingSnapshot;
  width: AxisSize;
  height: AxisSize;
  hidden: boolean;
};

export type LayoutNode = FrameNode | ModuleNode;

// ---------- Screens ----------

export type ScreenIcon = "desktop" | "tablet" | "mobile" | "custom";

export type Screen = {
  id: string;
  name: string;
  icon: ScreenIcon;
  /** Width of the editing canvas. */
  canvasWidth: number;
  /** Height of one viewport on the canvas (used for 100vh-like sizing). */
  canvasHeight: number;
  /** Show this screen when the viewport is at least this wide (px). */
  minWidth: number | null;
  /** …and at most this wide (px). */
  maxWidth: number | null;
  root: FrameNode;
};

// ---------- Project ----------

export type ModuleSource = "builtin" | "imported";

export type ModuleEntry = {
  def: FolingModuleDef;
  source: ModuleSource;
  /** File or project the module was imported from (for display only). */
  origin?: string;
};

export type Asset = {
  id: string;
  /** File name used when exporting to images/. */
  name: string;
  mime: string;
  /** Base64-encoded file content. */
  data: string;
};

export type HeadSettings = {
  title: string;
  description: string;
  lang: string;
  themeColor: string;
};

export type Project = {
  format: "landms";
  version: 1;
  name: string;
  head: HeadSettings;
  /** HTFL project variables (`$name`), written to htfl.yaml. */
  variables: Record<string, string>;
  cssReset: boolean;
  screens: Screen[];
  /** Module definitions this project uses or has imported, keyed by name. */
  modules: Record<string, ModuleEntry>;
  assets: Record<string, Asset>;
};

// ---------- Output ----------

/** A file produced by an encoder. Binary files carry base64 content. */
export type OutputFile = {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
};
