import { dump, load } from "js-yaml";

export type LayoutDirection = "row" | "column";
export type TextAlignment = "left" | "center" | "right";

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
  links?: Array<Record<string, string>>;
};

export type FolingNodeSnapshot = {
  name: string;
  config?: FolingNodeConfig;
  children?: FolingNodeSnapshot[];
};

export type FolingModuleDefinition = {
  name: string;
  snapshot: FolingNodeSnapshot;
  css?: string;
};

export type EncodableModule = {
  id: string;
  type: string;
  name: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  label?: string;
  href?: string;
  height: number;
  direction: LayoutDirection;
  align: TextAlignment;
  gap: number;
  background: string;
  color: string;
  radius: number;
  visible: boolean;
  definition?: FolingModuleDefinition;
};

export type ExportFile = { path: string; content: string };

export type WebCode = {
  HTML: string;
  CSS: string;
  JS: string;
};

const knownTags = new Set([
  "a", "article", "aside", "body", "button", "div", "footer", "form", "h1",
  "h2", "h3", "head", "header", "html", "img", "input", "label", "li", "link",
  "main", "meta", "nav", "p", "section", "small", "span", "strong", "title", "ul",
]);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function folderTag(name: string, explicit?: string): string {
  if (explicit) return explicit.toLowerCase();
  const guessed = name.replace(/^\d+_/, "").toLowerCase();
  if (knownTags.has(guessed) || guessed.includes("-")) return guessed;
  return "div";
}

function safeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "module";
}

function moduleTag(type: string): string {
  if (type === "header") return "header";
  if (type === "footer") return "footer";
  if (type === "button") return "div";
  if (type === "logo" || type === "menu") return "nav";
  return "section";
}

function renderImportedSnapshot(
  snapshot: FolingNodeSnapshot,
  path: string,
  scripts: string[],
): string {
  const config = snapshot.config ?? {};
  const tag = folderTag(snapshot.name, config.tag);
  const attributes = { ...(config.attributes ?? {}) };
  if (config.id) attributes.id = config.id;
  if (config.classes?.length) attributes.class = config.classes.join(" ");
  attributes["data-htfl-id"] = path;
  if (config.css?.trim()) attributes.style = config.css.replace(/\s+/g, " ").trim();
  const attributeText = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(String(value))}"`)
    .join("");
  const content = config.content ? escapeHtml(config.content) : "";
  const children = (snapshot.children ?? [])
    .map((child, index) => renderImportedSnapshot(child, `${path}.${index + 1}`, scripts))
    .join("\n");
  if (config.js?.trim()) {
    scripts.push(`(() => { const el = document.querySelector('[data-htfl-id="${path}"]'); if (el) { ${config.js} } })();`);
  }
  return `<${tag}${attributeText}>${content}${children ? `\n${children}\n` : ""}</${tag}>`;
}

function htmlForModule(item: EncodableModule, scripts: string[]): string {
  if (item.definition) {
    return renderImportedSnapshot(item.definition.snapshot, safeName(item.id), scripts);
  }
  const moduleAttribute = ` data-landms-id="${escapeAttribute(safeName(item.id))}"`;
  const title = escapeHtml(item.title ?? item.label ?? item.name);
  const body = item.body ? escapeHtml(item.body) : "";
  if (item.type === "header") {
    return `<header class="lm-header"${moduleAttribute}><a class="lm-logo" href="/">${title}</a><nav>${body}</nav></header>`;
  }
  if (item.type === "hero") {
    return `<section class="lm-hero"${moduleAttribute}>\n  <p class="eyebrow">${escapeHtml(item.eyebrow ?? "")}</p>\n  <h1>${escapeHtml(item.title ?? "").replace(/\n/g, "<br>")}</h1>\n  <p>${body}</p>\n  <a href="${escapeAttribute(item.href ?? "#")}">${escapeHtml(item.label ?? "")}</a>\n</section>`;
  }
  if (item.type === "footer") {
    return `<footer class="lm-footer"${moduleAttribute}><strong>${title}</strong><p>${body}</p></footer>`;
  }
  if (item.type === "button") {
    return `<div class="lm-button"${moduleAttribute}><a href="${escapeAttribute(item.href ?? "#")}">${escapeHtml(item.label ?? "")}</a></div>`;
  }
  return `<section class="lm-${safeName(item.type)}"${moduleAttribute}>\n  <h2>${title}</h2>\n  ${body ? `<p>${body}</p>` : ""}\n</section>`;
}

export function generateWebCode(modules: EncodableModule[]): WebCode {
  const visible = modules.filter((item) => item.visible);
  const importedScripts: string[] = [];
  const body = visible.map((item) => htmlForModule(item, importedScripts)).join("\n\n");
  const layoutCss = visible
    .filter((item) => !item.definition)
    .map((item) => `.lm-${safeName(item.type)}[data-landms-id="${safeName(item.id)}"] {
  min-height: ${item.height}px;
  display: flex;
  flex-direction: ${item.direction};
  gap: ${item.gap}px;
  background: ${item.background};
  color: ${item.color};
  border-radius: ${item.radius}px;
  padding: 48px;
  text-align: ${item.align};
}`).join("\n\n");
  const importedCss = visible
    .map((item) => item.definition?.css?.trim())
    .filter(Boolean)
    .join("\n\n");
  const CSS = `:root { --ink: #17201d; --paper: #f2f0e9; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--paper); font-family: Arial, sans-serif; }
${layoutCss}
${importedCss}
@media (max-width: 768px) { section { padding: 28px; } }`;
  const JS = `document.querySelectorAll('[data-carousel]').forEach((carousel) => {
  const slides = carousel.querySelectorAll('.slide');
  let current = 0;
  carousel.querySelector('[data-next]')?.addEventListener('click', () => {
    current = (current + 1) % slides.length;
    slides.forEach((slide, index) => slide.hidden = index !== current);
  });
});
${importedScripts.join("\n")}`.trim();
  const HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LandMs Export</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
${body}
<script src="main.js"></script>
</body>
</html>`;
  return { HTML, CSS, JS };
}

function bodyFragment(html: string): string {
  const match = html.match(/<body>\s*([\s\S]*?)\s*<script src="main\.js"><\/script>\s*<\/body>/i);
  return match?.[1] ?? "";
}

export function generateResponsiveWebFiles(screens: Record<"desktop" | "tablet" | "mobile", EncodableModule[]>): ExportFile[] {
  const encoded = {
    desktop: generateWebCode(screens.desktop),
    tablet: generateWebCode(screens.tablet),
    mobile: generateWebCode(screens.mobile),
  };
  const fragments = {
    desktop: bodyFragment(encoded.desktop.HTML),
    tablet: bodyFragment(encoded.tablet.HTML),
    mobile: bodyFragment(encoded.mobile.HTML),
  };
  const styles = {
    desktop: encoded.desktop.CSS,
    tablet: encoded.tablet.CSS,
    mobile: encoded.mobile.CSS,
  };
  const mainJs = `const screens = ${JSON.stringify(fragments)};
const screenStyles = ${JSON.stringify(styles)};
const app = document.querySelector('#landms-app');
const dynamicStyle = document.querySelector('#landms-screen-style');
let currentScreen = '';

function screenForWidth(width) {
  if (width <= 600) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

const behaviors = {
  desktop() { ${encoded.desktop.JS} },
  tablet() { ${encoded.tablet.JS} },
  mobile() { ${encoded.mobile.JS} }
};

function renderScreen() {
  const next = screenForWidth(window.innerWidth);
  if (next === currentScreen) return;
  currentScreen = next;
  dynamicStyle.textContent = screenStyles[next];
  app.innerHTML = screens[next];
  document.documentElement.dataset.landmsScreen = next;
  behaviors[next]();
}

renderScreen();
window.addEventListener('resize', renderScreen, { passive: true });`;
  return [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LandMs Responsive Export</title>
  <link rel="stylesheet" href="style.css">
  <style id="landms-screen-style"></style>
</head>
<body>
  <div id="landms-app"></div>
  <script src="main.js"></script>
</body>
</html>`,
    },
    { path: "style.css", content: "html, body, #landms-app { min-height: 100%; }\nbody { margin: 0; }\n" },
    { path: "main.js", content: mainJs },
  ];
}

function yaml(value: unknown): string {
  return dump(value, { noRefs: true, lineWidth: -1, sortKeys: false });
}

function configForModule(item: EncodableModule): FolingNodeConfig {
  return {
    tag: moduleTag(item.type),
    id: safeName(item.id),
    classes: [`lm-${safeName(item.type)}`],
    css: [
      `min-height: ${item.height}px;`,
      "display: flex;",
      `flex-direction: ${item.direction};`,
      `gap: ${item.gap}px;`,
      `background-color: ${item.background};`,
      `color: ${item.color};`,
      `border-radius: ${item.radius}px;`,
      "padding: 48px;",
      `text-align: ${item.align};`,
    ].join("\n"),
    ...(item.type === "carousel" ? {
      js: "var next = el.querySelector('[data-next]');\nif (next) next.addEventListener('click', function () { el.classList.toggle('is-next'); });",
    } : {}),
  };
}

function addSnapshotFiles(files: ExportFile[], folder: string, snapshot: FolingNodeSnapshot): void {
  files.push({ path: `${folder}/config.yaml`, content: yaml(snapshot.config ?? {}) });
  (snapshot.children ?? []).forEach((child, index) => {
    const tag = folderTag(child.name, child.config?.tag);
    const ordinal = String(index + 1).padStart(2, "0");
    addSnapshotFiles(files, `${folder}/${ordinal}_${tag}`, child);
  });
}

function childrenForModule(item: EncodableModule): FolingNodeSnapshot[] {
  const children: FolingNodeSnapshot[] = [];
  let ordinal = 1;
  const add = (tag: string, content?: string, attributes?: Record<string, string>) => {
    if (!content) return;
    children.push({
      name: `${String(ordinal++).padStart(2, "0")}_${tag}`,
      config: { tag, content, ...(attributes ? { attributes } : {}) },
      children: [],
    });
  };
  add("p", item.eyebrow);
  add(item.type === "hero" ? "h1" : "h2", item.title);
  add("p", item.body);
  add("a", item.label, { href: item.href ?? "#" });
  return children;
}

export function generateHtflProject(modules: EncodableModule[]): ExportFile[] {
  const visible = modules.filter((item) => item.visible);
  const files: ExportFile[] = [
    {
      path: "htfl.yaml",
      content: yaml({
        doctype: "<!DOCTYPE html>",
        variables: {
          colorInk: "#17201d",
          colorPaper: "#f2f0e9",
          colorAccent: "#bfff4f",
        },
        css_reset: true,
        output_mode: "ssr+js",
        head: {
          charset: "UTF-8",
          viewport: "width=device-width, initial-scale=1",
          title: "LandMs Export",
        },
      }),
    },
    { path: "HTML/config.yaml", content: yaml({ attributes: { lang: "ja" } }) },
    { path: "HTML/01_head/config.yaml", content: yaml({ tag: "head" }) },
    { path: "HTML/01_head/01_meta/config.yaml", content: yaml({ tag: "meta", attributes: { charset: "UTF-8" } }) },
    { path: "HTML/01_head/02_title/config.yaml", content: yaml({ tag: "title", content: "LandMs Export" }) },
    { path: "HTML/02_body/config.yaml", content: yaml({ tag: "body" }) },
  ];

  const importedCss: string[] = [];
  visible.forEach((item, index) => {
    const ordinal = String(index + 1).padStart(2, "0");
    if (item.definition) {
      const tag = folderTag(item.definition.snapshot.name, item.definition.snapshot.config?.tag);
      addSnapshotFiles(files, `HTML/02_body/${ordinal}_${tag}`, item.definition.snapshot);
      if (item.definition.css?.trim()) importedCss.push(`/* ${item.definition.name} */\n${item.definition.css.trim()}`);
      return;
    }
    const tag = moduleTag(item.type);
    const snapshot: FolingNodeSnapshot = {
      name: `${ordinal}_${tag}`,
      config: configForModule(item),
      children: childrenForModule(item),
    };
    addSnapshotFiles(files, `HTML/02_body/${ordinal}_${tag}`, snapshot);
  });

  if (importedCss.length) {
    files.push({ path: "classes/99_imported-modules.css", content: `${importedCss.join("\n\n")}\n` });
  }
  files.push({ path: "images/.keep", content: "" });
  files.push({ path: "plugins/.keep", content: "" });
  return files;
}

export function formatHtflPreview(files: ExportFile[]): string {
  return files
    .filter((file) => file.content.trim())
    .map((file) => `# ${file.path}\n${file.content.trimEnd()}`)
    .join("\n\n---\n\n");
}

export function parseFolingModuleFile(source: string): FolingModuleDefinition[] {
  const parsed = load(source);
  if (!Array.isArray(parsed)) throw new Error("モジュールファイルのルートは配列である必要があります。");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`${index + 1}番目のモジュールが不正です。`);
    const module = entry as Partial<FolingModuleDefinition>;
    if (typeof module.name !== "string" || !module.name.trim()) throw new Error(`${index + 1}番目のモジュールにnameがありません。`);
    if (!module.snapshot || typeof module.snapshot !== "object" || typeof module.snapshot.name !== "string") {
      throw new Error(`${module.name}のsnapshotが不正です。`);
    }
    return {
      name: module.name,
      snapshot: module.snapshot,
      css: typeof module.css === "string" ? module.css : "",
    };
  });
}
