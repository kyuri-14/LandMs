// SPDX-License-Identifier: AGPL-3.0-or-later
//
// HTFL tree → a plain website: index.html + style.css + main.js (+ images/).
//
// Same element tree as the HTFL export, rendered the way a hand-written site
// would be: per-element `css:` blocks become rules in style.css (on a
// generated `lms-*` class), per-element `js:` blocks become main.js, and ids
// set on frames are kept so in-page links like `#contact` keep working.

import { resolveTag, VOID_TAGS } from "./foling";
import { buildHtflTree, classesCss, escapeAttr, escapeHtml, HTFL_RESET_CSS, substituteVariables, type BuildOptions, type HtflTree } from "./htfl";
import { displayName } from "./tree";
import type { FolingSnapshot, OutputFile, Project } from "./types";

export type WebCode = { html: string; css: string; js: string; body: string };

export type WebOptions = BuildOptions & {
  /** Put CSS and JS inside the HTML (single file / previews). */
  inline?: boolean;
  /** Leave out module scripts (the editor canvas renders a still page). */
  scripts?: boolean;
  /** Extra CSS appended after everything else (editor chrome). */
  extraCss?: string;
};

function rustLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Split CSS into top-level blocks so identical blocks from different modules are written once. */
export function dedupeCssBlocks(css: string): string {
  const blocks: string[] = [];
  let depth = 0;
  let current = "";
  let inComment = false;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    current += char;
    if (inComment) {
      if (char === "/" && css[i - 1] === "*") inComment = false;
      continue;
    }
    if (char === "*" && css[i - 1] === "/") inComment = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push(current);
        current = "";
      }
    }
  }
  if (current.trim()) blocks.push(current);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const key = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    if (key && seen.has(key)) {
      // Keep any comment that precedes a duplicate rule (file headers).
      const comments = block.match(/\/\*[\s\S]*?\*\//g);
      if (comments) out.push(`\n${comments.join("\n")}`);
      continue;
    }
    if (key) seen.add(key);
    out.push(block);
  }
  return out.join("");
}

const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled",
  "hidden", "loop", "multiple", "muted", "novalidate", "open", "playsinline", "readonly", "required", "selected",
]);

function indentBlock(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

export function renderWeb(project: Project, tree: HtflTree, options: WebOptions = {}): WebCode {
  const vars = tree.config.variables;
  const emitScripts = options.scripts ?? true;
  const rules: string[] = [];
  const scripts: Array<[string, string]> = [];
  const classCounts = new Map<string, number>();
  let jsCounter = 0;

  const generatedClass = (node: FolingSnapshot, parentLabel: string): string => {
    const own = tree.labels.get(node);
    const base = own ? `lms-${own}` : `${parentLabel}__${resolveTag(node.config.tag ?? displayName(node.name))}`;
    const count = (classCounts.get(base) ?? 0) + 1;
    classCounts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };

  const renderNode = (node: FolingSnapshot, depth: number, parentLabel: string, inPre: boolean): string => {
    const cfg = node.config;
    const tag = resolveTag(cfg.tag ?? displayName(node.name));
    const pad = inPre ? "" : "  ".repeat(depth);
    const preHere = inPre || tag === "pre" || tag === "textarea";
    const attributes = cfg.attributes ?? {};
    const label = tree.labels.get(node) ? `lms-${tree.labels.get(node)}` : parentLabel;

    const decls: string[] = [];
    if (cfg.css) {
      for (const line of rustLines(substituteVariables(cfg.css, vars))) {
        const trimmed = line.trim();
        if (trimmed) decls.push(trimmed.endsWith(";") || trimmed.endsWith("}") ? trimmed : `${trimmed};`);
      }
    }
    for (const prop of cfg.disabled_inherits ?? []) if (prop.trim()) decls.push(`${prop.trim()}: initial;`);
    if (attributes.style?.trim()) decls.push(substituteVariables(attributes.style, vars).trim());

    const classes = [...(cfg.classes ?? [])];
    for (const extra of (attributes.class ?? "").split(/\s+/).filter(Boolean)) if (!classes.includes(extra)) classes.push(extra);
    if (decls.length) {
      const name = generatedClass(node, label);
      classes.push(name);
      rules.push(`.${name} {\n${decls.map((decl) => `  ${decl}`).join("\n")}\n}`);
    }

    let open = `<${tag}`;
    const id = cfg.id ?? attributes.id;
    if (id) open += ` id="${escapeAttr(id)}"`;
    if (classes.length) open += ` class="${escapeAttr(classes.join(" "))}"`;
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "id" || key === "class" || key === "style") continue;
      open += value === "" && BOOLEAN_ATTRIBUTES.has(key) ? ` ${key}` : ` ${key}="${escapeAttr(substituteVariables(value, vars))}"`;
    }
    if (emitScripts && cfg.js?.trim()) {
      jsCounter += 1;
      const hook = `h${jsCounter}`;
      open += ` data-htfl-id="${hook}"`;
      scripts.push([hook, cfg.js]);
    }
    open += ">";
    // Foling emits configured <link> entries as the first children of the element.
    const linkTags = (cfg.links ?? []).map(
      (link) => `${"  ".repeat(depth + 1)}<link rel="${escapeAttr(link.rel)}" href="${escapeAttr(link.href)}"${link.type ? ` type="${escapeAttr(link.type)}"` : ""}>\n`,
    );
    if (VOID_TAGS.has(tag)) return `${pad}${open}${inPre ? "" : "\n"}`;

    const content = cfg.content ?? "";
    const lines = rustLines(content);
    if (!node.children.length && !linkTags.length) {
      if (preHere) return `${pad}${open}${lines.map(escapeHtml).join("\n")}</${tag}>${inPre ? "" : "\n"}`;
      if (lines.length <= 1) return `${pad}${open}${escapeHtml(lines[0] ?? "")}</${tag}>\n`;
    }
    let out = `${pad}${open}`;
    if (preHere) {
      out += lines.map(escapeHtml).join("\n");
      for (const child of node.children) out += renderNode(child, depth + 1, label, true);
      return `${out}</${tag}>${inPre ? "" : "\n"}`;
    }
    out += "\n";
    out += linkTags.join("");
    for (const line of lines) out += `${"  ".repeat(depth + 1)}${escapeHtml(line)}\n`;
    for (const child of node.children) out += renderNode(child, depth + 1, label, false);
    return `${out}${pad}</${tag}>\n`;
  };

  const body = tree.html.children.find((child) => displayName(child.name) === "body");
  const bodyHtml = (body?.children ?? []).map((child) => renderNode(child, 1, "lms", false)).join("");

  const head = tree.config.head ?? {};
  const classCss = dedupeCssBlocks(classesCss(tree.classFiles, vars));
  const cssParts = [
    "/* Generated by LandMs (https://github.com/kyuri-14/LandMs). */",
    tree.config.css_reset ?? true ? HTFL_RESET_CSS : "",
    classCss,
    "/* === Layout (frames and module sizes) === */",
    rules.join("\n\n"),
  ];
  if (options.extraCss) cssParts.push(options.extraCss);
  const css = `${cssParts.filter(Boolean).join("\n").trimEnd()}\n`;

  const js = scripts.length
    ? `// Generated by LandMs. Each block runs once with \`el\` bound to its element.\n${scripts
        .map(([hook, script]) => `(function () {\n  var el = document.querySelector('[data-htfl-id="${hook}"]');\n  if (!el) return;\n${indentBlock(rustLines(script).join("\n"), "  ")}\n})();`)
        .join("\n\n")}\n`
    : "";

  const headLines = [
    `<meta charset="${escapeAttr(head.charset ?? "UTF-8")}">`,
    `<meta name="viewport" content="${escapeAttr(head.viewport ?? "width=device-width, initial-scale=1")}">`,
    `<title>${escapeHtml(head.title ?? project.name)}</title>`,
  ];
  if (head.description) headLines.push(`<meta name="description" content="${escapeAttr(head.description)}">`);
  if (head.theme_color) headLines.push(`<meta name="theme-color" content="${escapeAttr(head.theme_color)}">`);
  headLines.push(options.inline ? `<style>\n${indentBlock(css.trimEnd(), "  ")}\n</style>` : `<link rel="stylesheet" href="style.css">`);

  const scriptTag = js ? (options.inline ? `  <script>\n${indentBlock(js.trimEnd(), "  ")}\n  </script>\n` : `  <script src="main.js"></script>\n`) : "";
  const lang = tree.html.config.attributes?.lang ?? "ja";
  const html = `<!DOCTYPE html>\n<html lang="${escapeAttr(lang)}">\n<head>\n${headLines.map((line) => indentBlock(line, "  ")).join("\n")}\n</head>\n<body>\n${bodyHtml}${scriptTag}</body>\n</html>\n`;
  return { html, css, js, body: bodyHtml };
}

export function buildWeb(project: Project, options: WebOptions = {}): WebCode {
  return renderWeb(project, buildHtflTree(project, options), options);
}

/** Files for "HTML / CSS / JavaScript" export. */
export function webFiles(project: Project): OutputFile[] {
  const code = buildWeb(project);
  const files: OutputFile[] = [
    { path: "index.html", content: code.html },
    { path: "style.css", content: code.css },
  ];
  if (code.js) files.push({ path: "main.js", content: code.js });
  for (const asset of Object.values(project.assets)) files.push({ path: `images/${asset.name}`, content: asset.data, encoding: "base64" });
  return files;
}

/** Map `images/<name>` to data URLs so a page works without its folder (previews, single file). */
export function assetResolver(project: Project): (src: string) => string {
  const byPath = new Map(Object.values(project.assets).map((asset) => [`images/${asset.name}`, `data:${asset.mime};base64,${asset.data}`]));
  return (src) => byPath.get(src.replace(/^\.\//, "")) ?? src;
}

export function singleFileHtml(project: Project): string {
  return buildWeb(project, { inline: true, resolveAsset: assetResolver(project) }).html;
}
