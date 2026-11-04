// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Release preflight: proves the update-signing secret works before three
// 15-minute builds run. It signs a throwaway file with the key from
// TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD) and checks that the signature
// belongs to the public key in src-tauri/tauri.conf.json — a key that signs
// fine but does not match would publish updates every installed app rejects.
//
//   node scripts/check-signing-key.mjs [--pubkey <base64>]
//
// The key itself is never printed.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SECRETS_PAGE = "Settings > Secrets and variables > Actions";

function fail(message, hint) {
  console.log(`::error::${message}`);
  if (hint) console.log(hint);
  process.exit(1);
}

function decode(base64) {
  return Buffer.from(base64.trim(), "base64").toString("utf8");
}

/** Key id from a minisign public key or signature (both base64 of "comment\nbase64(blob)"), shown like minisign does. */
function keyId(base64File) {
  const blob = decode(base64File).split("\n")[1] ?? "";
  return Buffer.from(Buffer.from(blob.trim(), "base64").subarray(2, 10)).reverse().toString("hex").toUpperCase();
}

const args = process.argv.slice(2);
const pubkeyArg = args.indexOf("--pubkey");
const pubkey = pubkeyArg >= 0 ? args[pubkeyArg + 1] : JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).plugins.updater.pubkey;

const raw = process.env.TAURI_SIGNING_PRIVATE_KEY ?? "";
const key = raw.trim();
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "";

if (!key) {
  fail(`Secret TAURI_SIGNING_PRIVATE_KEY is not set (${SECRETS_PAGE}).`, "秘密鍵が登録されていません。README の「アップデートの公開」を参照してください。");
}
if (/^[A-Z][A-Z0-9_]*\s*[=:]/.test(key) || key.startsWith("TAURI_")) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY contains the variable name, not just the key.",
    `値の欄に「TAURI_SIGNING_PRIVATE_KEY=」などの名前まで入っています。${SECRETS_PAGE} で編集し、.key ファイルの中身（dW50cnVzdGVk… で始まる文字列）だけを貼り付けてください。`,
  );
}
if (!/^[A-Za-z0-9+/=\s]+$/.test(key)) {
  fail("TAURI_SIGNING_PRIVATE_KEY is not base64.", "値が鍵の形式ではありません。.key ファイルの中身（dW50cnVzdGVk… で始まる1行）だけを貼り付けてください。");
}
const text = decode(key);
if (text.startsWith("untrusted comment: minisign public key")) {
  fail("TAURI_SIGNING_PRIVATE_KEY holds the PUBLIC key.", "公開鍵（.key.pub）が登録されています。拡張子が .key の方（秘密鍵）の中身を貼り付けてください。");
}
if (!text.startsWith("untrusted comment:")) {
  fail("TAURI_SIGNING_PRIVATE_KEY is not a Tauri signing key.", "鍵ファイルの中身ではないようです。`npx tauri signer generate` で作った .key ファイルの中身を貼り付けてください。");
}

const dir = mkdtempSync(join(tmpdir(), "landms-key-"));
try {
  const file = join(dir, "probe.txt");
  writeFileSync(file, "LandMs release preflight\n");
  const tauri = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");
  const signed = spawnSync(tauri, ["signer", "sign", file], {
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (signed.status !== 0) {
    const output = `${signed.stdout}\n${signed.stderr}`;
    if (/password/i.test(output)) {
      fail(
        "The signing key password is wrong (TAURI_SIGNING_PRIVATE_KEY_PASSWORD).",
        "秘密鍵のパスワードが違います。TAURI_SIGNING_PRIVATE_KEY_PASSWORD を鍵を作ったときのパスワードにしてください（パスワードなしの鍵ならこの Secret を削除）。",
      );
    }
    fail(`Signing failed: ${output.split("\n").filter((line) => /error/i.test(line)).join(" ").trim() || "unknown error"}`);
  }
  const signatureKey = keyId(readFileSync(`${file}.sig`, "utf8"));
  const expected = keyId(pubkey);
  if (signatureKey !== expected) {
    fail(
      `The signing key (${signatureKey}) does not match the updater public key in tauri.conf.json (${expected}).`,
      "登録した秘密鍵が、アプリに組み込まれた公開鍵と対になっていません。このまま公開すると、インストール済みのアプリは更新を拒否します。対になる秘密鍵を登録するか、その鍵の公開鍵で tauri.conf.json の pubkey を置き換えてください。",
    );
  }
  console.log(`update-signing key OK (key id ${signatureKey} matches tauri.conf.json)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
