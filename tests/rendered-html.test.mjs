import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the LandMs editor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LandMs — Layout &amp; Modules<\/title>/i);
  assert.match(html, /FOLING LIBRARY/);
  assert.match(html, /モジュール/);
  assert.match(html, /Desktop/);
  assert.match(html, /コード/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships both web and Tauri product surfaces", async () => {
  const [page, encoder, packageJson, tauriConfig, workflow] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/encoders.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
  ]);

  assert.match(page, /parseFolingModuleFile/);
  assert.match(page, /checkForUpdates/);
  assert.match(page, /exportHtflProject/);
  assert.match(encoder, /HTML\/02_body/);
  assert.match(packageJson, /"tauri:build"/);
  assert.match(tauriConfig, /"createUpdaterArtifacts": true/);
  assert.match(workflow, /tauri-apps\/tauri-action/);
  await access(new URL("../src-tauri/src/lib.rs", import.meta.url));
  await access(new URL("../desktop/index.html", import.meta.url));
});
