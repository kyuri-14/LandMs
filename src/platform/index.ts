// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Everything that differs between the desktop app (Tauri) and the browser
// version lives here, so the editor itself never checks which one it runs in.

import { invoke, isTauri } from "@tauri-apps/api/core";
import JSZip from "jszip";
import type { OutputFile } from "../core/types";

export const isDesktop = isTauri();

export const SOURCE_URL = "https://github.com/kyuri-14/LandMs";

export type PickedFile = { name: string; text: string };
export type PickedBinary = { name: string; mime: string; data: string };

// ---------- browser helpers ----------

function pickWithInput(accept: string, options: { multiple?: boolean; directory?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !!options.multiple;
    if (options.directory) input.setAttribute("webkitdirectory", "");
    input.style.display = "none";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fileToBase64(file: Blob): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---------- project files ----------

/** Save a project. Returns the path written (desktop) or null (browser download / cancelled). */
export async function saveProjectFile(contents: string, suggestedName: string, path: string | null): Promise<string | null | undefined> {
  if (isDesktop) {
    let target = path;
    if (!target) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      target = await save({ title: "プロジェクトを保存", defaultPath: `${suggestedName}.landms`, filters: [{ name: "LandMs project", extensions: ["landms"] }] });
      if (!target) return undefined;
    }
    await invoke("write_project_file", { path: target, contents });
    return target;
  }
  downloadBlob(new Blob([contents], { type: "application/json" }), `${suggestedName}.landms`);
  return null;
}

export async function openProjectFile(): Promise<{ text: string; path: string | null } | null> {
  if (isDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ title: "プロジェクトを開く", multiple: false, filters: [{ name: "LandMs project", extensions: ["landms", "json"] }] });
    if (typeof path !== "string") return null;
    return { text: await invoke<string>("read_project_file", { path }), path };
  }
  const [file] = await pickWithInput(".landms,.json,application/json");
  return file ? { text: await file.text(), path: null } : null;
}

// ---------- exports ----------

/** Desktop: write into a new folder chosen by the user. Browser: download a zip. */
export async function exportFiles(folderName: string, files: OutputFile[]): Promise<string | null> {
  if (isDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const parent = await open({ directory: true, multiple: false, title: "書き出し先のフォルダーを選択" });
    if (typeof parent !== "string") return null;
    return invoke<string>("export_files", { parent, folderName, files: files.map((file) => ({ ...file, encoding: file.encoding ?? "utf8" })) });
  }
  const zip = new JSZip();
  for (const file of files) {
    if (file.encoding === "base64") zip.file(`${folderName}/${file.path}`, base64ToBytes(file.content));
    else zip.file(`${folderName}/${file.path}`, file.content);
  }
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${folderName}.zip`);
  return `${folderName}.zip`;
}

export async function exportTextFile(filename: string, contents: string, extension: string, label: string): Promise<string | null> {
  if (isDesktop) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ title: "書き出し", defaultPath: filename, filters: [{ name: label, extensions: [extension] }] });
    if (!path) return null;
    await invoke("write_text_file", { path, contents });
    return path;
  }
  downloadBlob(new Blob([contents], { type: "text/plain;charset=utf-8" }), filename);
  return filename;
}

export async function revealFolder(path: string): Promise<void> {
  if (isDesktop) await invoke("reveal_path", { path });
}

// ---------- imports ----------

export async function pickModuleFiles(): Promise<PickedFile[]> {
  const files = await pickWithInput(".yaml,.yml,text/yaml", { multiple: true });
  return Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
}

/** A Foling project folder: returns its modules/*.yaml files. */
export async function pickFolingProject(): Promise<{ folder: string; files: PickedFile[] } | null> {
  if (isDesktop) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true, multiple: false, title: "Folingのプロジェクトフォルダーを選択" });
    if (typeof folder !== "string") return null;
    const files = await invoke<Array<{ name: string; contents: string }>>("read_foling_modules", { folder });
    return { folder, files: files.map((file) => ({ name: file.name, text: file.contents })) };
  }
  const picked = await pickWithInput("", { directory: true });
  if (!picked.length) return null;
  const modules = picked.filter((file) => /(^|\/)modules\/[^/]+\.ya?ml$/i.test(file.webkitRelativePath || file.name));
  const folder = (picked[0].webkitRelativePath || picked[0].name).split("/")[0];
  return { folder, files: await Promise.all(modules.map(async (file) => ({ name: file.name, text: await file.text() }))) };
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function pickImage(): Promise<PickedBinary | null> {
  const [file] = await pickWithInput("image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif");
  if (!file) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new Error("画像は8MB以下にしてください。");
  return { name: file.name, mime: file.type || "application/octet-stream", data: await fileToBase64(file) };
}

// ---------- preview ----------

/** Desktop: serve the page from the local preview server (so its scripts run). */
export async function publishPreview(html: string): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string>("set_preview", { html });
}

export async function openInBrowser(html: string): Promise<void> {
  if (isDesktop) {
    const url = await publishPreview(html);
    if (url) await invoke("open_url", { url });
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openExternal(url: string): Promise<void> {
  if (isDesktop) await invoke("open_url", { url });
  else window.open(url, "_blank", "noopener");
}

// ---------- app info & updates ----------

export async function appVersion(): Promise<string> {
  if (isDesktop) {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  }
  return __APP_VERSION__;
}

export type AvailableUpdate = { version: string; notes: string; install: (onProgress: (percent: number | null) => void) => Promise<void> };

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isDesktop) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? "",
    install: async (onProgress) => {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          onProgress(total ? Math.min(100, Math.round((received / total) * 100)) : null);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}

export async function notify(title: string, body: string): Promise<void> {
  if (isDesktop) {
    const notifications = await import("@tauri-apps/plugin-notification");
    let granted = await notifications.isPermissionGranted();
    if (!granted) granted = (await notifications.requestPermission()) === "granted";
    if (granted) notifications.sendNotification({ title, body });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}
