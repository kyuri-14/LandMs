// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Reading and writing a module instance's settings. Works on any Foling
// snapshot, so imported modules get the same content / link editing as the
// built-in ones; built-ins additionally declare typed "behaviour" params.

import type { ModuleParam } from "../core/builtins";
import { displayName } from "../core/tree";
import type { FolingSnapshot } from "../core/types";
import { VOID_TAGS } from "../core/foling";

export function tagOf(node: FolingSnapshot): string {
  return (node.config.tag ?? displayName(node.name)).toLowerCase();
}

function cssLines(css: string | undefined): string[] {
  return (css ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function getStyleValue(node: FolingSnapshot, prop: string): string {
  for (const line of cssLines(node.config.css)) {
    const match = line.match(/^([a-z-]+)\s*:\s*(.*?);?$/i);
    if (match && match[1].toLowerCase() === prop) return match[2].trim();
  }
  return "";
}

export function setStyleValue(node: FolingSnapshot, prop: string, value: string): FolingSnapshot {
  const lines = cssLines(node.config.css).filter((line) => !line.toLowerCase().startsWith(`${prop}:`) && !line.toLowerCase().startsWith(`${prop} :`));
  if (value) lines.push(`${prop}: ${value};`);
  return { ...node, config: { ...node.config, css: lines.length ? lines.join("\n") : undefined } };
}

export function getParam(root: FolingSnapshot, param: ModuleParam): string {
  switch (param.kind) {
    case "attr":
      return root.config.attributes?.[param.key] ?? "";
    case "tag":
      return tagOf(root);
    case "class":
      return param.options.find((option) => option.value && root.config.classes?.includes(option.value))?.value ?? "";
    case "style":
      return getStyleValue(root, param.prop);
  }
}

export function setParam(root: FolingSnapshot, param: ModuleParam, value: string): FolingSnapshot {
  switch (param.kind) {
    case "attr": {
      const attributes = { ...(root.config.attributes ?? {}) };
      if (value === "" && param.input !== "text") delete attributes[param.key];
      else attributes[param.key] = value;
      return { ...root, config: { ...root.config, attributes } };
    }
    case "tag":
      return { ...root, config: { ...root.config, tag: value } };
    case "class": {
      const others = param.options.map((option) => option.value).filter(Boolean);
      const classes = (root.config.classes ?? []).filter((name) => !others.includes(name));
      if (value) classes.push(value);
      return { ...root, config: { ...root.config, classes } };
    }
    case "style":
      return setStyleValue(root, param.prop, value);
  }
}

/** Attributes worth editing directly in the inspector, in display order. */
export const EDITABLE_ATTRIBUTES: Array<{ key: string; label: string; kind: "link" | "image" | "text" }> = [
  { key: "href", label: "リンク先", kind: "link" },
  { key: "src", label: "画像", kind: "image" },
  { key: "alt", label: "代替テキスト", kind: "text" },
  { key: "placeholder", label: "入力例", kind: "text" },
  { key: "value", label: "値", kind: "text" },
  { key: "name", label: "送信名", kind: "text" },
  { key: "aria-label", label: "読み上げ名", kind: "text" },
  { key: "title", label: "ツールチップ", kind: "text" },
];

const TAG_LABELS: Record<string, string> = {
  a: "リンク",
  button: "ボタン",
  h1: "見出し1",
  h2: "見出し2",
  h3: "見出し3",
  h4: "見出し4",
  p: "段落",
  span: "テキスト",
  strong: "強調",
  small: "注記",
  img: "画像",
  li: "項目",
  ul: "リスト",
  nav: "ナビ",
  figure: "図",
  figcaption: "キャプション",
  input: "入力欄",
  textarea: "複数行入力",
  label: "ラベル",
  summary: "質問",
  details: "開閉ブロック",
  form: "フォーム",
  section: "セクション",
  article: "カード",
  aside: "サイド",
  div: "ボックス",
};

export function elementLabel(node: FolingSnapshot): string {
  const tag = tagOf(node);
  const name = TAG_LABELS[tag] ?? tag;
  const firstClass = node.config.classes?.[0];
  const hint = firstClass ? firstClass.replace(/^lm-[a-z-]+__/, "").replace(/^lm-/, "") : "";
  return hint && hint !== tag ? `${name} · ${hint}` : name;
}

/** Content can be edited on leaves that render text (not void elements like <img>). */
export function canHaveContent(node: FolingSnapshot): boolean {
  const tag = tagOf(node);
  if (VOID_TAGS.has(tag)) return false;
  return node.config.content !== undefined || node.children.length === 0;
}

export function hasEditableFields(node: FolingSnapshot): boolean {
  if (node.config.content !== undefined && node.config.content !== "") return true;
  return EDITABLE_ATTRIBUTES.some((attribute) => node.config.attributes?.[attribute.key] !== undefined);
}

/** Text shown for one element in the content tree (to recognise it quickly). */
export function previewText(node: FolingSnapshot): string {
  const text = node.config.content ?? node.config.attributes?.alt ?? node.config.attributes?.["aria-label"] ?? "";
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

export function setContent(node: FolingSnapshot, content: string): FolingSnapshot {
  return { ...node, config: { ...node.config, content: content === "" ? undefined : content } };
}

export function setAttribute(node: FolingSnapshot, key: string, value: string | null): FolingSnapshot {
  const attributes = { ...(node.config.attributes ?? {}) };
  if (value === null) delete attributes[key];
  else attributes[key] = value;
  return { ...node, config: { ...node.config, attributes: Object.keys(attributes).length ? attributes : undefined } };
}
