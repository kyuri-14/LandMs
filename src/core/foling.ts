// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Reading and writing Foling files: module YAML (modules/*.yaml) and
// element config.yaml. Field order and omission rules follow Foling's serde
// definitions (`skip_serializing_if` empty), so files LandMs writes look like
// files Foling itself writes.

import { dump, load } from "js-yaml";
import type { FolingLink, FolingModuleDef, FolingNodeConfig, FolingSnapshot } from "./types";

export const KNOWN_HTML_TAGS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
  "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code",
  "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn",
  "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins",
  "kbd", "label", "legend", "li", "link", "main", "map", "mark", "menu",
  "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option",
  "output", "p", "picture", "pre", "progress", "q", "ruby", "s", "samp",
  "script", "section", "select", "slot", "small", "source", "span", "strong",
  "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template",
  "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u",
  "ul", "var", "video", "wbr",
]);

export const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Same rule as Foling's `resolve_tag`: unknown names fall back to div. */
export function resolveTag(name: string): string {
  const tag = name.toLowerCase();
  if (!tag) return "div";
  return tag.includes("-") || KNOWN_HTML_TAGS.has(tag) ? tag : "div";
}

export function yaml(value: unknown): string {
  return dump(value, { noRefs: true, lineWidth: -1, sortKeys: false });
}

// ---------- normalisation ----------

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map(asString).filter((item): item is string => item !== undefined);
  return list.length ? list : undefined;
}

export function normalizeConfig(value: unknown): FolingNodeConfig {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const config: FolingNodeConfig = {};
  const tag = asString(raw.tag);
  if (tag) config.tag = tag;
  const id = asString(raw.id);
  if (id) config.id = id;
  const classes = asStringList(raw.classes);
  if (classes) config.classes = classes;
  const available = asStringList(raw.available_classes);
  if (available) config.available_classes = available;
  const disabled = asStringList(raw.disabled_inherits);
  if (disabled) config.disabled_inherits = disabled;
  if (raw.attributes && typeof raw.attributes === "object" && !Array.isArray(raw.attributes)) {
    const attributes: Record<string, string> = {};
    for (const [key, item] of Object.entries(raw.attributes as Record<string, unknown>)) {
      const text = asString(item);
      if (text !== undefined && /^[^\s"'<>/=]+$/.test(key)) attributes[key] = text;
    }
    if (Object.keys(attributes).length) config.attributes = attributes;
  }
  for (const key of ["content", "css", "js"] as const) {
    const text = asString(raw[key]);
    if (text) config[key] = text;
  }
  if (Array.isArray(raw.links)) {
    const links: FolingLink[] = [];
    for (const entry of raw.links) {
      if (!entry || typeof entry !== "object") continue;
      const link = entry as Record<string, unknown>;
      const rel = asString(link.rel);
      const href = asString(link.href);
      if (!rel || !href) continue;
      const type = asString(link.type);
      links.push(type ? { rel, href, type } : { rel, href });
    }
    if (links.length) config.links = links;
  }
  return config;
}

export function normalizeSnapshot(value: unknown, where: string): FolingSnapshot {
  if (!value || typeof value !== "object") throw new Error(`${where}: 要素の形式が不正です。`);
  const raw = value as Record<string, unknown>;
  const name = asString(raw.name);
  if (!name) throw new Error(`${where}: name がありません。`);
  const children = Array.isArray(raw.children)
    ? raw.children.map((child, index) => normalizeSnapshot(child, `${where} > ${index + 1}`))
    : [];
  return { name, config: normalizeConfig(raw.config), children };
}

/** Parse a Foling module file (a YAML list of ModuleDef). */
export function parseModuleFile(source: string): FolingModuleDef[] {
  let parsed: unknown;
  try {
    parsed = load(source);
  } catch (error) {
    throw new Error(`YAMLを解析できません: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Foling writes a bare list; accept `{ modules: [...] }` too for robustness.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { modules?: unknown }).modules)) {
    parsed = (parsed as { modules: unknown[] }).modules;
  }
  if (!Array.isArray(parsed)) throw new Error("モジュールファイルのルートは配列である必要があります。");
  if (!parsed.length) throw new Error("モジュールが含まれていません。");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`${index + 1}番目のモジュールが不正です。`);
    const raw = entry as Record<string, unknown>;
    const name = asString(raw.name)?.trim();
    if (!name) throw new Error(`${index + 1}番目のモジュールに name がありません。`);
    return {
      name,
      snapshot: normalizeSnapshot(raw.snapshot, name),
      css: asString(raw.css) ?? "",
    };
  });
}

/** Parse one snapshot written as YAML (used by the inspector's code editor). */
export function parseSnapshotYaml(source: string): FolingSnapshot {
  let parsed: unknown;
  try {
    parsed = load(source);
  } catch (error) {
    throw new Error(`YAMLを解析できません: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeSnapshot(parsed, "snapshot");
}

// ---------- serialisation ----------

/** Config in Foling's field order with empty fields omitted. */
export function orderedConfig(config: FolingNodeConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (config.tag) out.tag = config.tag;
  if (config.id) out.id = config.id;
  if (config.classes?.length) out.classes = config.classes;
  if (config.available_classes?.length) out.available_classes = config.available_classes;
  if (config.disabled_inherits?.length) out.disabled_inherits = config.disabled_inherits;
  if (config.attributes && Object.keys(config.attributes).length) {
    // Foling stores attributes in a BTreeMap, i.e. sorted by key.
    out.attributes = Object.fromEntries(Object.entries(config.attributes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  if (config.content) out.content = config.content;
  if (config.css) out.css = config.css;
  if (config.js) out.js = config.js;
  if (config.links?.length) out.links = config.links;
  return out;
}

export function configYaml(config: FolingNodeConfig): string {
  const ordered = orderedConfig(config);
  return Object.keys(ordered).length ? yaml(ordered) : "{}\n";
}

function orderedSnapshot(snapshot: FolingSnapshot): Record<string, unknown> {
  return { name: snapshot.name, config: orderedConfig(snapshot.config), children: snapshot.children.map(orderedSnapshot) };
}

export function snapshotYaml(snapshot: FolingSnapshot): string {
  return yaml(orderedSnapshot(snapshot));
}

export function moduleFileYaml(defs: FolingModuleDef[], header = ""): string {
  const body = yaml(defs.map((def) => ({ name: def.name, snapshot: orderedSnapshot(def.snapshot), css: def.css })));
  return header ? `${header.trimEnd()}\n${body}` : body;
}

export function countElements(snapshot: FolingSnapshot): number {
  return 1 + snapshot.children.reduce((total, child) => total + countElements(child), 0);
}
