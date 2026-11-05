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

/**
 * How a frame arranges its children.
 * - "flex": in a row/column (CSS flexbox, Figma's auto layout)
 * - "free": anywhere, positioned with the mouse like Illustrator / InDesign
 *   (CSS `position: absolute` inside a `position: relative` frame)
 */
export type LayoutMode = "flex" | "free";

export type FrameLayout = {
  /** Missing means "flex" (files written before free layout existed). */
  mode?: LayoutMode;
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
  /** Hide anything that sticks out of the frame (`overflow: hidden`). */
  clip?: boolean;
};

// ---------- Free placement ----------

/** What a child keeps fixed when its free frame gets wider (Figma's constraints). */
export type HConstraint = "left" | "right" | "center" | "stretch" | "scale";
/** What a child keeps fixed when its free frame gets taller. */
export type VConstraint = "top" | "bottom" | "center" | "stretch" | "scale";

/**
 * Position of a child inside a free frame. x/y/w/h describe the layout box
 * before rotation, in px from the frame's top-left, as it was at the last
 * edit, when the frame measured pw × ph. The CSS is derived from these
 * numbers and the constraints, so it stays correct at other frame sizes.
 */
export type Placement = {
  x: number;
  y: number;
  /** 0 = not measured yet (e.g. text that sizes itself); the editor fills it in. */
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  horizontal: HConstraint;
  vertical: VConstraint;
  pw: number;
  ph: number;
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
  /** Set when the parent frame is a free frame. */
  place?: Placement;
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
  /** Set when the parent frame is a free frame. */
  place?: Placement;
};

// ---------- Shapes ----------

/** Basic drawing objects, like the shape and type tools of Illustrator. */
export type ShapeKind = "rect" | "ellipse" | "line" | "text" | "image";

export type FontFamily = "inherit" | "sans" | "serif" | "mono" | "rounded";

export type TextSettings = {
  /** Plain text; line breaks are kept. */
  content: string;
  tag: "p" | "h1" | "h2" | "h3" | "span";
  fontFamily: FontFamily;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  /** Colour, or "inherit" to use the frame's text colour. */
  color: string;
  align: "left" | "center" | "right" | "justify";
  /** Multiple of the font size, e.g. 1.5. */
  lineHeight: number;
  /** Tracking in 1/1000 em, as in InDesign / Illustrator. */
  letterSpacing: number;
};

export type ImageSettings = {
  src: string;
  alt: string;
  fit: "cover" | "contain" | "fill";
};

export type ShapeNode = {
  kind: "shape";
  id: string;
  name: string;
  shape: ShapeKind;
  width: AxisSize;
  height: AxisSize;
  /** Set when the parent frame is a free frame. */
  place?: Placement;
  /** Fill colour or "transparent". Text boxes are transparent by default. */
  fill: string;
  /** Outline colour (the line colour for lines). */
  stroke: string;
  strokeWidth: number;
  radius: number;
  /** 0–100 */
  opacity: number;
  shadow: "none" | "soft" | "hard";
  text: TextSettings;
  image: ImageSettings;
  /** Makes the whole shape a link when set. */
  href: string;
  hidden: boolean;
};

export type LayoutNode = FrameNode | ModuleNode | ShapeNode;

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
