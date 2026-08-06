import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHtflPreview,
  generateHtflProject,
  generateResponsiveWebFiles,
  generateWebCode,
  parseFolingModuleFile,
  type EncodableModule,
} from "../app/lib/encoders";

const sample = `
- name: announcement
  snapshot:
    name: 01_aside
    config:
      classes: [announcement]
      js: |
        el.addEventListener('click', function () { el.classList.toggle('open'); });
    children:
      - name: 01_h2
        config:
          content: Hello from Foling
        children: []
  css: |
    .announcement { padding: 2rem; }
`;

function importedModule(): EncodableModule {
  const definition = parseFolingModuleFile(sample)[0];
  return {
    id: "imported-announcement",
    type: "imported",
    name: definition.name,
    title: definition.name,
    height: 240,
    direction: "column",
    align: "left",
    gap: 12,
    background: "#ffffff",
    color: "#17201d",
    radius: 0,
    visible: true,
    definition,
  };
}

function sampleModule(overrides: Partial<EncodableModule> = {}): EncodableModule {
  return {
    id: "hero",
    type: "hero",
    name: "Hero",
    title: "Independent module",
    height: 480,
    direction: "column",
    align: "left",
    gap: 24,
    background: "#ffffff",
    color: "#17201d",
    radius: 0,
    visible: true,
    ...overrides,
  };
}

test("Foling module YAML is preserved in web output", () => {
  const code = generateWebCode([importedModule()]);
  assert.match(code.HTML, /<aside/);
  assert.match(code.HTML, /Hello from Foling/);
  assert.match(code.HTML, /data-htfl-id/);
  assert.match(code.CSS, /\.announcement/);
  assert.match(code.JS, /classList\.toggle/);
});

test("HTFL encoder produces a Foling folder project", () => {
  const files = generateHtflProject([importedModule()]);
  const paths = files.map((file) => file.path);
  assert.ok(paths.includes("htfl.yaml"));
  assert.ok(paths.includes("HTML/config.yaml"));
  assert.ok(paths.includes("HTML/02_body/01_aside/config.yaml"));
  assert.ok(paths.includes("HTML/02_body/01_aside/01_h2/config.yaml"));
  assert.ok(paths.includes("classes/99_imported-modules.css"));
  assert.match(formatHtflPreview(files), /# htfl\.yaml/);
});

test("invalid Foling module files are rejected", () => {
  assert.throws(() => parseFolingModuleFile("name: not-a-list"), /配列/);
  assert.throws(() => parseFolingModuleFile("- name: broken"), /snapshot/);
});

test("responsive web export switches complete screens at breakpoints", () => {
  const module = importedModule();
  const files = generateResponsiveWebFiles({ desktop: [module], tablet: [module], mobile: [module] });
  const script = files.find((file) => file.path === "main.js")?.content ?? "";
  assert.match(script, /width <= 600/);
  assert.match(script, /width <= 1024/);
  assert.match(script, /renderScreen/);
  assert.deepEqual(files.map((file) => file.path), ["index.html", "style.css", "main.js"]);
});

test("repeated module types retain independent web styles", () => {
  const first = sampleModule({ id: "hero-first", height: 320 });
  const second = sampleModule({ id: "hero-second", height: 640 });
  const code = generateWebCode([first, second]);

  assert.match(code.HTML, /data-landms-id="hero-first"/);
  assert.match(code.HTML, /data-landms-id="hero-second"/);
  assert.match(code.CSS, /\[data-landms-id="hero-first"\][\s\S]*min-height: 320px/);
  assert.match(code.CSS, /\[data-landms-id="hero-second"\][\s\S]*min-height: 640px/);
});
