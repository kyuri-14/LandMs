// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Keeps the app version identical in every file the release reads.
//
//   node scripts/version.mjs check [0.3.1]   # all files agree (and match 0.3.1)
//   node scripts/version.mjs set 0.3.1       # write 0.3.1 everywhere
//
// The updater compares the version in latest.json (taken from tauri.conf.json)
// with the installed app, so a mismatch here means users never see an update.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(root + path, "utf8");
const write = (path, text) => writeFileSync(root + path, text);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CARGO_PACKAGE = /(\[package\][^[]*?\nversion\s*=\s*")([^"]+)(")/;
const CARGO_LOCK = /(\[\[package\]\]\nname = "landms"\nversion = ")([^"]+)(")/;

function current() {
  return {
    "package.json": JSON.parse(read("package.json")).version,
    "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
    "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(CARGO_PACKAGE)?.[2],
  };
}

const [command, value] = process.argv.slice(2);

if (command === "check") {
  const versions = current();
  const distinct = new Set(Object.values(versions));
  const expected = value?.replace(/^v/, "");
  if (distinct.size !== 1 || (expected && !distinct.has(expected))) {
    console.error(`Version mismatch${expected ? ` (expected ${expected})` : ""}:`);
    for (const [file, version] of Object.entries(versions)) console.error(`  ${file}: ${version}`);
    console.error("Fix with: npm run version:set -- <version>");
    process.exit(1);
  }
  console.log(`version ${[...distinct][0]} ✓`);
} else if (command === "set") {
  const version = value?.replace(/^v/, "");
  if (!version || !SEMVER.test(version)) {
    console.error("Usage: npm run version:set -- 0.3.1");
    process.exit(1);
  }
  const pkg = JSON.parse(read("package.json"));
  pkg.version = version;
  write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  const lock = JSON.parse(read("package-lock.json"));
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  write("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  conf.version = version;
  write("src-tauri/tauri.conf.json", `${JSON.stringify(conf, null, 2)}\n`);
  write("src-tauri/Cargo.toml", read("src-tauri/Cargo.toml").replace(CARGO_PACKAGE, `$1${version}$3`));
  write("src-tauri/Cargo.lock", read("src-tauri/Cargo.lock").replace(CARGO_LOCK, `$1${version}$3`));
  console.log(`version set to ${version}. Commit, then: git tag v${version} && git push origin v${version}`);
} else {
  console.error("Usage: node scripts/version.mjs check [version] | set <version>");
  process.exit(1);
}
