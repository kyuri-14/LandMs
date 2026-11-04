// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { builtinByName } from "../src/core/builtins";
import { moduleFileYaml, parseModuleFile, parseSnapshotYaml, snapshotYaml } from "../src/core/foling";
import { buildFolingHtml, buildHtflTree, htflFiles, substituteVariables } from "../src/core/htfl";
import { moduleDeclarations, sizingDeclarations } from "../src/core/layout";
import { createFrame, createModuleInstance, createRoot, createStarterProject, withModule } from "../src/core/project";
import { screenForWidth, uncoveredRanges, validateScreens } from "../src/core/screens";
import { findNode, insertNode, moveNode, removeNode } from "../src/core/tree";
import type { Project } from "../src/core/types";
import { buildWeb, dedupeCssBlocks, singleFileHtml, webFiles } from "../src/core/web";

const folingSample = `
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

function singleScreen(project: Project, children = project.screens[0].root.children): Project {
  return { ...project, screens: [{ ...project.screens[0], minWidth: null, maxWidth: null, root: { ...project.screens[0].root, children } }] };
}

describe("layout sizing", () => {
  test("fill on the main axis grows, fill on the cross axis stretches", () => {
    expect(sizingDeclarations({ mode: "fill", value: 0 }, { mode: "fill", value: 0 }, "row")).toEqual(["flex: 1 1 0%;", "min-width: 0;", "align-self: stretch;"]);
    expect(sizingDeclarations({ mode: "fill", value: 0 }, { mode: "fixed", value: 80 }, "column")).toEqual(["flex: 0 0 auto;", "height: 80px;", "align-self: stretch;"]);
  });
  test("modules that fill a column keep their block-flow width (margin: 0 auto)", () => {
    const module = createModuleInstance(builtinByName.text.def);
    expect(moduleDeclarations(module, "column")).toContain("width: 100%;");
    expect(moduleDeclarations(module, "row")).not.toContain("width: 100%;");
  });
  test("fixed widths never overflow the viewport", () => {
    expect(sizingDeclarations({ mode: "fixed", value: 320 }, { mode: "hug", value: 0 }, "row")).toContain("max-width: 100%;");
  });
});

describe("screens", () => {
  const screens = createStarterProject().screens;
  test("the starter screens cover every width exactly once", () => {
    expect(validateScreens(screens)).toEqual([]);
    expect(screenForWidth(screens, 1440)?.name).toBe("Desktop");
    expect(screenForWidth(screens, 1024)?.name).toBe("Tablet");
    expect(screenForWidth(screens, 641)?.name).toBe("Tablet");
    expect(screenForWidth(screens, 640)?.name).toBe("Mobile");
  });
  test("overlaps, gaps and impossible ranges are reported", () => {
    const broken = [
      { ...screens[0], minWidth: 900 },
      { ...screens[1], minWidth: 700, maxWidth: 1000 },
      { ...screens[2], minWidth: 500, maxWidth: 400 },
    ];
    const messages = validateScreens(broken).map((issue) => issue.message).join("\n");
    expect(messages).toContain("重なって");
    expect(messages).toContain("表示されることがありません");
    expect(uncoveredRanges(broken)).toEqual([[0, 699]]);
  });
});

describe("Foling modules", () => {
  test("parses and normalises a Foling module file", () => {
    const [module] = parseModuleFile(folingSample);
    expect(module.name).toBe("announcement");
    expect(module.snapshot.children[0].config.content).toBe("Hello from Foling");
    expect(module.css).toContain(".announcement");
  });
  test("rejects files that are not module lists", () => {
    expect(() => parseModuleFile("name: x")).toThrow(/配列/);
    expect(() => parseModuleFile("- snapshot: {}")).toThrow(/name/);
  });
  test("built-in modules survive a Foling YAML round trip", () => {
    const defs = Object.values(builtinByName).map((module) => module.def);
    expect(parseModuleFile(moduleFileYaml(defs))).toEqual(defs);
    const snapshot = builtinByName.carousel.def.snapshot;
    expect(parseSnapshotYaml(snapshotYaml(snapshot))).toEqual(snapshot);
  });
  test("variables follow Foling's $name rule", () => {
    expect(substituteVariables("a $x $y $ $x-y", { x: "1", "x-y": "2" })).toBe("a 1 $y $ 2");
  });
});

describe("HTFL export", () => {
  test("writes a Foling project folder", () => {
    const project = createStarterProject();
    const files = htflFiles(project);
    const paths = files.map((file) => file.path);
    expect(paths).toContain("htfl.yaml");
    expect(paths).toContain("HTML/config.yaml");
    expect(paths).toContain("HTML/01_head/config.yaml");
    expect(paths).toContain("HTML/02_body/01_div/config.yaml");
    expect(paths).toContain("HTML/02_body/01_div/01_header/config.yaml");
    expect(paths).toContain("classes/00_landms-base.css");
    expect(paths).toContain("modules/landms.yaml");
    const screenConfig = files.find((file) => file.path === "HTML/02_body/01_div/config.yaml")!.content;
    expect(screenConfig).toContain("lm-screen");
    expect(screenConfig).toContain("data-screen: desktop");
    // The head comes from htfl.yaml only, so Foling does not emit two <title>s.
    expect(buildFolingHtml(buildHtflTree(project)).match(/<title>/g)).toHaveLength(1);
  });
  test("hidden nodes are left out of every output", () => {
    const project = createStarterProject();
    const root = project.screens[0].root;
    const header = root.children[0];
    const hidden = { ...project, screens: [{ ...project.screens[0], root: { ...root, children: [{ ...header, hidden: true }, ...root.children.slice(1)] } }] };
    expect(buildWeb(hidden).html).not.toContain("<header");
  });
});

describe("web export", () => {
  test("separates HTML, CSS and JavaScript", () => {
    const code = buildWeb(createStarterProject());
    expect(code.html).toContain('<link rel="stylesheet" href="style.css">');
    expect(code.html).toContain('<script src="main.js"></script>');
    expect(code.html).not.toContain("style=");
    expect(code.css).toContain(".lm-drawer__panel");
    expect(code.css).toContain('@media (max-width: 640px) { .lm-screen[data-screen="mobile"]');
    expect(code.js).toContain("var el = document.querySelector('[data-htfl-id=\"h1\"]');");
  });
  test("keeps frame anchors so in-page links work", () => {
    expect(buildWeb(createStarterProject()).html).toContain('<section id="contact"');
  });
  test("identical CSS blocks from several modules are written once", () => {
    const css = buildWeb(createStarterProject()).css;
    expect(css.match(/\.lm-btn \{/g)).toHaveLength(1);
    expect(dedupeCssBlocks(".a { x: 1; }\n.a { x: 1; }\n@media (x) { .b { y: 2 } }")).toBe(".a { x: 1; }\n@media (x) { .b { y: 2 } }");
  });
  test("imported Foling modules are placed like built-ins", () => {
    const [def] = parseModuleFile(folingSample);
    let project = withModule(singleScreen(createStarterProject()), def);
    const root = createRoot([createFrame("section", { children: [createModuleInstance(def)] })]);
    project = { ...project, screens: [{ ...project.screens[0], root }] };
    const code = buildWeb(project);
    expect(code.html).toContain('<aside class="announcement');
    expect(code.html).toContain("Hello from Foling");
    expect(code.css).toContain(".announcement { padding: 2rem; }");
    expect(code.js).toContain("el.classList.toggle('open')");
  });
  test("images are exported as files and inlined for single-file HTML", () => {
    const project = createStarterProject();
    const withAsset: Project = { ...project, assets: { a1: { id: "a1", name: "photo.png", mime: "image/png", data: "iVBORw0KGgo=" } } };
    const image = createModuleInstance(builtinByName.image.def);
    image.snapshot.children[0].config.attributes!.src = "images/photo.png";
    const single = { ...singleScreen(withAsset, [image]) };
    expect(webFiles(single).find((file) => file.path === "images/photo.png")?.encoding).toBe("base64");
    expect(singleFileHtml(single)).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });
});

describe("tree edits", () => {
  test("move, insert and remove keep the tree consistent", () => {
    const root = createStarterProject().screens[0].root;
    const [header, main, footer] = root.children;
    const moved = moveNode(root, footer.id, root.id, 0);
    expect(moved.children.map((node) => node.id)).toEqual([footer.id, header.id, main.id]);
    const intoSelf = moveNode(root, main.id, main.id, 0);
    expect(intoSelf).toBe(root);
    const logo = (header as typeof root).children[0];
    const relocated = moveNode(root, logo.id, footer.id, 0);
    expect(findNode(relocated, logo.id)?.parent?.id).toBe(footer.id);
    const extra = createFrame("row");
    expect(findNode(insertNode(root, main.id, 99, extra), extra.id)?.parent?.id).toBe(main.id);
    expect(findNode(removeNode(root, header.id), header.id)).toBeNull();
  });
});
