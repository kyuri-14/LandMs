// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Builds the exported HTFL folder with Foling's own builder (the `foling-mcp`
// binary from https://github.com/kyuri-14/Foling) and checks that LandMs'
// TypeScript port of the builder produces exactly the same HTML.
//
// Skipped unless FOLING_MCP points at a foling-mcp executable:
//   FOLING_MCP=/path/to/foling-mcp npm test

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { builtinModules } from "../src/core/builtins";
import { buildFolingHtml, buildHtflTree, htflFiles } from "../src/core/htfl";
import { createModuleInstance, createRoot, createStarterProject, registerUsedBuiltins } from "../src/core/project";
import type { Project } from "../src/core/types";

const binary = process.env.FOLING_MCP;

function folingBuild(project: Project): { html: string; report: string } {
  const dir = mkdtempSync(join(tmpdir(), "landms-parity-"));
  try {
    for (const file of htflFiles(project)) {
      const target = join(dir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content);
    }
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "htfl_build", arguments: { include_html: true } } },
    ];
    const run = spawnSync(binary!, ["--project", dir, "--read-only"], {
      input: `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
      encoding: "utf8",
    });
    const reply = run.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((message) => message.id === 2);
    const text: string = reply.result.content[0].text;
    const marker = "\n---\n";
    return { report: text.slice(0, text.indexOf(marker)), html: text.slice(text.indexOf(marker) + marker.length) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!binary)("Foling builder parity", () => {
  test("starter project (3 screens, every default module)", () => {
    const project = createStarterProject();
    const foling = folingBuild(project);
    expect(buildFolingHtml(buildHtflTree(project))).toBe(foling.html);
    expect(foling.report).toContain("no diagnostics");
  });

  test("every built-in module", () => {
    const base = createStarterProject();
    const root = createRoot(builtinModules.map((module) => createModuleInstance(module.def)));
    const project = registerUsedBuiltins({ ...base, screens: [{ ...base.screens[0], minWidth: null, root }] });
    const foling = folingBuild(project);
    expect(buildFolingHtml(buildHtflTree(project))).toBe(foling.html);
    expect(foling.report).toContain("no diagnostics");
  });

  test("css reset off and variables in content", () => {
    const base = createStarterProject();
    const project: Project = { ...base, cssReset: false, variables: { ...base.variables, brand: "LandMs & Foling" } };
    const screen = project.screens[2];
    const logo = screen.root.children[0];
    if (logo.kind === "frame" && logo.children[0].kind === "module") {
      logo.children[0].snapshot.children[1].config.content = "$brand <b>";
    }
    expect(buildFolingHtml(buildHtflTree(project))).toBe(folingBuild(project).html);
  });
});
