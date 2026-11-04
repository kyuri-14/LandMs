// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Live preview of the finished site with module scripts running. The page is
// isolated in a sandboxed iframe (no access to the editor or to Tauri):
//   • browser: srcdoc
//   • desktop: served by the local preview server, because the editor's CSP
//     (script-src 'self') is inherited by srcdoc frames and would block scripts.

import { ExternalLink, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeCondition, screenForWidth } from "../core/screens";
import type { Project, ScreenIcon } from "../core/types";
import { assetResolver, buildWeb } from "../core/web";
import { isDesktop, openInBrowser, publishPreview } from "../platform";

const icons: Record<ScreenIcon, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone, custom: Monitor };

export function Preview({ project, initialWidth, onError }: { project: Project; initialWidth: number; onError: (message: string) => void }) {
  const [width, setWidth] = useState(initialWidth);
  const [url, setUrl] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => buildWeb(project, { inline: true, resolveAsset: assetResolver(project) }).html, [project]);
  const active = screenForWidth(project.screens, width);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    publishPreview(html)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch((error) => onError(`プレビューを表示できません: ${String(error)}`));
    return () => {
      cancelled = true;
    };
  }, [html, onError]);

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => setWidth(Math.max(280, Math.min(2560, Math.round(startWidth + (moveEvent.clientX - startX) * 2))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section className="preview-pane">
      <div className="preview-toolbar">
        <div className="segmented-row">
          {project.screens.map((screen) => {
            const Icon = icons[screen.icon];
            return (
              <button key={screen.id} className={width === screen.canvasWidth ? "active" : ""} onClick={() => setWidth(screen.canvasWidth)} title={describeCondition(screen)}>
                <Icon size={14} />
                {screen.name}
              </button>
            );
          })}
        </div>
        <label className="width-input">
          幅
          <input type="number" min={280} max={2560} value={width} onChange={(event) => setWidth(Math.max(280, Math.min(2560, Number(event.target.value) || 280)))} />
          px
        </label>
        <span className={`preview-match ${active ? "" : "none"}`}>{active ? `表示中: ${active.name}（${describeCondition(active)}）` : "この幅で表示される画面がありません"}</span>
        <button className="ghost-button" onClick={() => void openInBrowser(html).catch((error) => onError(String(error)))}>
          <ExternalLink size={14} />
          ブラウザで開く
        </button>
      </div>
      <div className="preview-area" ref={areaRef}>
        <div className="preview-device" style={{ width }}>
          {isDesktop ? (
            url && <iframe title="プレビュー" src={url} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" />
          ) : (
            <iframe title="プレビュー" srcDoc={html} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" />
          )}
          <div className="resize-handle" onPointerDown={startResize} title="ドラッグで幅を変更" />
        </div>
      </div>
    </section>
  );
}
