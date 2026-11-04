// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Project → HTFL.
//
// `buildHtflTree` turns the LandMs layout into one Foling element tree (the
// single source every output is derived from). From that tree:
//   • `htflFiles`       writes a Foling project folder (htfl.yaml, HTML/…, classes/…)
//   • `buildFolingHtml` produces byte-for-byte what Foling's RUN / HTML export
//                       would produce from that folder (port of htfl/build.rs)
//   • web.ts            renders clean HTML / CSS / JavaScript files

import { builtinByName } from "./builtins";
import { configYaml, moduleFileYaml, resolveTag, VOID_TAGS, yaml } from "./foling";
import { frameDeclarations, mergeCss, moduleDeclarations } from "./layout";
import { screenKeys, screenSwitchCss } from "./screens";
import { deepClone, displayName } from "./tree";
import type { FlexDirection, FolingModuleDef, FolingNodeConfig, FolingSnapshot, FrameNode, LayoutNode, ModuleNode, OutputFile, Project } from "./types";

export const HTFL_RESET_CSS = `/* HTFL default reset (toggle via VIEW > CSS リセット) */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
ul, ol { list-style: none; }
a { text-decoration: none; color: inherit; }
h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }
button, input, textarea, select {
  font: inherit; color: inherit; background: transparent;
  border: none; padding: 0;
}
img, picture, svg, video { display: block; max-width: 100%; }
table { border-collapse: collapse; border-spacing: 0; }
`;

export const DEFAULT_DOCTYPE = "<!DOCTYPE html>";

export type FolingHeadConfig = {
  charset?: string;
  viewport?: string;
  title?: string;
  description?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  favicon?: string;
  theme_color?: string;
};

export type FolingProjectConfig = {
  doctype?: string;
  variables: Record<string, string>;
  css_reset?: boolean;
  output_mode?: string;
  head?: FolingHeadConfig;
};

export type ClassFile = { name: string; content: string };

export type HtflTree = {
  /** The `HTML/` folder (<html>) with `01_head` and `02_body`. */
  html: FolingSnapshot;
  classFiles: ClassFile[];
  config: FolingProjectConfig;
  /** Module definitions used by the tree, in first-use order. */
  modules: FolingModuleDef[];
  /** Readable names for elements generated from frames/modules (web.ts uses them for class names). */
  labels: WeakMap<FolingSnapshot, string>;
  /** `data-screen` key for each screen id. */
  screenKeys: Record<string, string>;
  /** HTFL folder (e.g. `HTML/02_body/01_div/02_main`) of every frame and module, by node id. */
  paths: Record<string, string>;
};

export type BuildOptions = {
  /** Only these screens (default: all). */
  screenIds?: string[];
  /** Editor canvas: tag frames and modules with data-lm-* attributes. */
  annotate?: boolean;
  /** Rewrite `images/…` references (e.g. to data URLs for previews). */
  resolveAsset?: (src: string) => string;
};

export function moduleDefinition(project: Project, name: string): FolingModuleDef | null {
  return project.modules[name]?.def ?? builtinByName[name]?.def ?? null;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withAttributes(config: FolingNodeConfig, extra: Record<string, string>): FolingNodeConfig {
  return { ...config, attributes: { ...(config.attributes ?? {}), ...extra } };
}

export function baseCss(project: Project, keys: Record<string, string>, screens = project.screens): string {
  const lines = [
    "/* LandMs base: theme variables come from htfl.yaml (variables). */",
    ":root { --lm-ink: $colorInk; --lm-paper: $colorPaper; --lm-accent: $colorAccent; }",
    'body { font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif; line-height: 1.6; color: var(--lm-ink); background: var(--lm-paper); -webkit-font-smoothing: antialiased; }',
    ".lm-screen { min-width: 0; }",
  ];
  const switching = screenSwitchCss(screens, keys);
  if (switching) lines.push(switching);
  return `${lines.join("\n")}\n`;
}

export function buildHtflTree(project: Project, options: BuildOptions = {}): HtflTree {
  const labels = new WeakMap<FolingSnapshot, string>();
  const ids = new WeakMap<FolingSnapshot, string>();
  const used: FolingModuleDef[] = [];
  const usedNames = new Set<string>();
  const keys = screenKeys(project.screens);
  const screens = options.screenIds ? project.screens.filter((screen) => options.screenIds!.includes(screen.id)) : project.screens;

  const rewriteAssets = (node: FolingSnapshot) => {
    if (options.resolveAsset && node.config.attributes?.src) {
      node.config.attributes = { ...node.config.attributes, src: options.resolveAsset(node.config.attributes.src) };
    }
    node.children.forEach(rewriteAssets);
  };

  const moduleSnapshot = (module: ModuleNode, parentDirection: FlexDirection): FolingSnapshot | null => {
    const def = moduleDefinition(project, module.module);
    if (def && !usedNames.has(def.name)) {
      usedNames.add(def.name);
      used.push(def);
    }
    const snapshot = deepClone(module.snapshot);
    snapshot.config = { ...snapshot.config, css: mergeCss(snapshot.config.css, moduleDeclarations(module, parentDirection)) || undefined };
    if (options.annotate) {
      const tag = (node: FolingSnapshot, path: number[]) => {
        node.config = withAttributes(node.config, { "data-lm-el": `${module.id}:${path.join(".")}` });
        node.children.forEach((child, index) => tag(child, [...path, index]));
      };
      tag(snapshot, []);
      snapshot.config = withAttributes(snapshot.config, { "data-lm-node": module.id, "data-lm-kind": "module" });
    }
    rewriteAssets(snapshot);
    labels.set(snapshot, slug(module.module) || "module");
    ids.set(snapshot, module.id);
    return snapshot;
  };

  const frameSnapshot = (frame: FrameNode, parentDirection: FlexDirection | null, extra: FolingNodeConfig = {}): FolingSnapshot => {
    const children = frame.children
      .filter((child) => !child.hidden)
      .map((child) => nodeSnapshot(child, frame.layout.direction))
      .filter((child): child is FolingSnapshot => child !== null);
    let config: FolingNodeConfig = {
      ...extra,
      ...(frame.anchor.trim() ? { id: frame.anchor.trim() } : {}),
      css: frameDeclarations(frame, parentDirection).join("\n"),
    };
    if (options.annotate) {
      config = withAttributes(config, {
        "data-lm-node": frame.id,
        "data-lm-kind": "frame",
        ...(children.length ? {} : { "data-lm-empty": "" }),
      });
    }
    const snapshot: FolingSnapshot = { name: frame.tag, config, children };
    labels.set(snapshot, slug(frame.name) || frame.tag);
    ids.set(snapshot, frame.id);
    return snapshot;
  };

  const nodeSnapshot = (node: LayoutNode, parentDirection: FlexDirection): FolingSnapshot | null =>
    node.kind === "frame" ? frameSnapshot(node, parentDirection) : moduleSnapshot(node, parentDirection);

  const roots = screens.map((screen) => {
    const snapshot = frameSnapshot({ ...screen.root, tag: "div", anchor: "" }, null, {
      classes: ["lm-screen"],
      attributes: { "data-screen": keys[screen.id] },
    });
    labels.set(snapshot, keys[screen.id]);
    return snapshot;
  });

  /** Give siblings Foling's `NN_tag` folder names (recursively), keeping labels and ids. */
  const numbered = (children: FolingSnapshot[]): FolingSnapshot[] =>
    children.map((child, index) => {
      const raw = child.config.tag ?? displayName(child.name);
      const folderTag = /^[a-z][a-z0-9-]*$/i.test(raw) ? raw.toLowerCase() : "div";
      const config = { ...child.config };
      if (config.tag && config.tag.toLowerCase() === folderTag) delete config.tag;
      const renamed = { ...child, name: `${String(index + 1).padStart(2, "0")}_${folderTag}`, config, children: numbered(child.children) };
      const label = labels.get(child);
      if (label) labels.set(renamed, label);
      const id = ids.get(child);
      if (id) ids.set(renamed, id);
      return renamed;
    });

  const body: FolingSnapshot = { name: "02_body", config: {}, children: numbered(roots) };
  const head: FolingSnapshot = { name: "01_head", config: {}, children: [] };
  const html: FolingSnapshot = { name: "HTML", config: { attributes: { lang: project.head.lang || "ja" } }, children: [head, body] };

  const classFiles: ClassFile[] = [{ name: "00_landms-base.css", content: baseCss(project, keys, screens) }];
  used.forEach((def, index) => {
    if (!def.css.trim()) return;
    classFiles.push({
      name: `${String(index + 10).padStart(2, "0")}_${slug(def.name) || "module"}.css`,
      content: `/* Foling module: ${def.name} */\n${def.css.trimEnd()}\n`,
    });
  });

  const head_: FolingHeadConfig = {
    charset: "UTF-8",
    viewport: "width=device-width, initial-scale=1",
    title: project.head.title || project.name,
    ...(project.head.description ? { description: project.head.description } : {}),
    ...(project.head.themeColor ? { theme_color: project.head.themeColor } : {}),
  };

  const paths: Record<string, string> = {};
  const collect = (node: FolingSnapshot, folder: string) => {
    const id = ids.get(node);
    if (id) paths[id] = folder;
    node.children.forEach((child) => collect(child, `${folder}/${child.name}`));
  };
  collect(html, "HTML");

  return {
    html,
    paths,
    classFiles,
    config: {
      doctype: DEFAULT_DOCTYPE,
      variables: { ...project.variables },
      css_reset: project.cssReset,
      output_mode: "ssr+js",
      head: head_,
    },
    modules: used,
    labels,
    screenKeys: keys,
  };
}

// ---------- HTFL folder ----------

export function htflFiles(project: Project, tree = buildHtflTree(project)): OutputFile[] {
  const files: OutputFile[] = [];
  files.push({ path: "htfl.yaml", content: yaml(projectConfigForYaml(tree.config)) });
  const walk = (node: FolingSnapshot, folder: string) => {
    files.push({ path: `${folder}/config.yaml`, content: configYaml(node.config) });
    node.children.forEach((child) => walk(child, `${folder}/${child.name}`));
  };
  walk(tree.html, "HTML");
  for (const file of tree.classFiles) files.push({ path: `classes/${file.name}`, content: file.content });
  if (tree.modules.length) {
    files.push({
      path: "modules/landms.yaml",
      content: moduleFileYaml(tree.modules, "# Modules used by this LandMs project (Foling module format)."),
    });
  }
  const assets = Object.values(project.assets);
  for (const asset of assets) files.push({ path: `images/${asset.name}`, content: asset.data, encoding: "base64" });
  if (!assets.length) files.push({ path: "images/.keep", content: "" });
  files.push({ path: "plugins/.keep", content: "" });
  return files;
}

function projectConfigForYaml(config: FolingProjectConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (config.doctype) out.doctype = config.doctype;
  out.variables = config.variables;
  if (config.css_reset !== undefined) out.css_reset = config.css_reset;
  if (config.output_mode) out.output_mode = config.output_mode;
  if (config.head) out.head = config.head;
  return out;
}

// ---------- Foling build (port of src-tauri/src/htfl/build.rs) ----------

/** Rust's `str::lines()`: split on \n, drop one trailing empty line and \r. */
function rustLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function substituteVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\$([A-Za-z0-9_-]+)/g, (match, name: string) => (Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match));
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderHeadTags(head: FolingHeadConfig, indent: string): string {
  let out = "";
  const metaName = (name: string, value?: string) => {
    if (value) out += `${indent}<meta name="${name}" content="${escapeAttr(value)}" />\n`;
  };
  const metaProperty = (property: string, value?: string) => {
    if (value) out += `${indent}<meta property="${property}" content="${escapeAttr(value)}" />\n`;
  };
  if (head.charset) out += `${indent}<meta charset="${escapeAttr(head.charset)}" />\n`;
  metaName("viewport", head.viewport);
  if (head.title) out += `${indent}<title>${escapeHtml(head.title)}</title>\n`;
  metaName("description", head.description);
  metaName("theme-color", head.theme_color);
  metaProperty("og:title", head.og_title);
  metaProperty("og:description", head.og_description);
  metaProperty("og:image", head.og_image);
  if (head.favicon) out += `${indent}<link rel="icon" href="${escapeAttr(head.favicon)}" />\n`;
  return out;
}

type RenderState = {
  vars: Record<string, string>;
  scripts: Array<[string, string]>;
  jsCounter: number;
  idCounter: number;
  emitScripts: boolean;
};

function sortedEntries(record: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(record ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function renderFolingNode(
  node: FolingSnapshot,
  depth: number,
  state: RenderState,
  extraHeadStyles: string | null,
  extraHeadTags: string | null,
  numberIds: boolean,
  inPre: boolean,
): string {
  const cfg = node.config;
  const tag = resolveTag(cfg.tag ?? displayName(node.name));
  const preHere = inPre || tag === "pre" || tag === "textarea";
  const pad = inPre ? "" : "  ".repeat(depth);
  const numbering = numberIds || tag === "body";
  const attributes = cfg.attributes ?? {};
  let out = `${pad}<${tag}`;

  if (numbering) {
    state.idCounter += 1;
    out += ` id="${state.idCounter}"`;
  } else {
    const id = cfg.id ?? attributes.id;
    if (id) out += ` id="${escapeAttr(id)}"`;
  }

  const classes = [...(cfg.classes ?? [])];
  for (const extra of (attributes.class ?? "").split(/\s+/).filter(Boolean)) {
    if (!classes.includes(extra)) classes.push(extra);
  }
  if (classes.length) out += ` class="${escapeAttr(classes.join(" "))}"`;

  for (const [key, value] of sortedEntries(attributes)) {
    if (key === "id" || key === "class" || key === "style") continue;
    out += ` ${key}="${escapeAttr(substituteVariables(value, state.vars))}"`;
  }

  const decls: string[] = [];
  if (cfg.css) {
    for (const line of rustLines(substituteVariables(cfg.css, state.vars))) {
      const trimmed = line.trim();
      if (trimmed) decls.push(trimmed);
    }
  }
  for (const prop of cfg.disabled_inherits ?? []) {
    const trimmed = prop.trim();
    if (trimmed) decls.push(`${trimmed}: initial;`);
  }
  if (attributes.style) {
    const trimmed = substituteVariables(attributes.style, state.vars).trim();
    if (trimmed) decls.push(trimmed);
  }
  if (decls.length) out += ` style="${escapeAttr(decls.join(" "))}"`;

  const js = cfg.js ?? "";
  if (state.emitScripts && js.trim()) {
    state.jsCounter += 1;
    const id = `h${state.jsCounter}`;
    out += ` data-htfl-id="${id}"`;
    state.scripts.push([id, js]);
  }

  if (VOID_TAGS.has(tag)) {
    out += " />";
    if (!inPre) out += "\n";
    return out;
  }
  out += ">";

  const content = cfg.content ?? "";
  const hasChildren = node.children.length > 0;
  const injectStyles = tag === "head" && !!extraHeadStyles?.trim();
  const injectHeadTags = tag === "head" && !!extraHeadTags?.trim();
  const links = cfg.links ?? [];
  const injectScriptsHere = tag === "body";

  if (content || hasChildren || injectStyles || injectHeadTags || links.length || injectScriptsHere) {
    if (!preHere) out += "\n";
    if (extraHeadTags?.trim()) {
      for (const line of rustLines(extraHeadTags)) {
        if (line.trim()) out += `${line}\n`;
      }
    }
    for (const link of links) {
      out += `${"  ".repeat(depth + 1)}<link rel="${escapeAttr(link.rel)}" href="${escapeAttr(link.href)}"`;
      if (link.type) out += ` type="${escapeAttr(link.type)}"`;
      out += " />\n";
    }
    if (extraHeadStyles?.trim()) {
      out += `${"  ".repeat(depth + 1)}<style>\n`;
      for (const line of rustLines(extraHeadStyles)) out += `${"  ".repeat(depth + 2)}${line}\n`;
      out += `${"  ".repeat(depth + 1)}</style>\n`;
    }
    if (content) {
      if (preHere) {
        out += rustLines(content).map(escapeHtml).join("\n");
      } else {
        for (const line of rustLines(content)) out += `${"  ".repeat(depth + 1)}${escapeHtml(line)}\n`;
      }
    }
    for (const child of node.children) {
      out += renderFolingNode(child, depth + 1, state, null, null, numbering, preHere);
    }
    if (injectScriptsHere && state.scripts.length) {
      const ipad = "  ".repeat(depth + 1);
      const inner = "  ".repeat(depth + 2);
      const deeper = "  ".repeat(depth + 3);
      out += `${ipad}<script>\n`;
      for (const [id, script] of state.scripts) {
        out += `${inner}(function() {\n`;
        out += `${deeper}var el = document.querySelector('[data-htfl-id="${id}"]');\n`;
        out += `${deeper}if (!el) return;\n`;
        for (const line of rustLines(script)) out += `${deeper}${line}\n`;
        out += `${inner}})();\n`;
      }
      out += `${ipad}</script>\n`;
    }
    if (!preHere) out += pad;
    out += `</${tag}>`;
  } else {
    out += `</${tag}>`;
  }
  if (!inPre) out += "\n";
  return out;
}

export function classesCss(files: ClassFile[], variables: Record<string, string>): string {
  return [...files]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((file) => `/* === ${file.name} === */\n${substituteVariables(file.content, variables)}${file.content.endsWith("\n") ? "" : "\n"}`)
    .join("");
}

/** Exactly what Foling's `generate_html(root, dev = false)` returns for the exported folder. */
export function buildFolingHtml(tree: HtflTree): string {
  const config = tree.config;
  const userClassCss = classesCss(tree.classFiles, config.variables);
  const classCss = config.css_reset ?? true ? `${HTFL_RESET_CSS}\n${userClassCss}` : userClassCss;
  const headTags = config.head ? renderHeadTags(config.head, "    ") : "";
  const state: RenderState = {
    vars: config.variables,
    scripts: [],
    jsCounter: 0,
    idCounter: 0,
    emitScripts: config.output_mode !== "ssr",
  };
  const lang = tree.html.config.attributes?.lang ?? "ja";
  let out = `${config.doctype ?? DEFAULT_DOCTYPE}\n<html lang="${escapeAttr(lang)}">\n`;
  for (const child of tree.html.children) {
    const isHead = displayName(child.name) === "head";
    out += renderFolingNode(child, 1, state, isHead ? classCss : null, isHead ? headTags : null, false, false);
  }
  out += "</html>\n";
  return out;
}
