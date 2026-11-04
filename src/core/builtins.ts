// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The built-in module library. Every module is a plain Foling `ModuleDef`
// (snapshot + bundled class CSS), so `exportModulesYaml()` produces a file
// Foling can import via FILE → Import module file… without any conversion.
//
// LandMs adds a little metadata on top (Japanese label, icon, and "params" —
// the behaviour settings shown in the inspector). That metadata never leaves
// LandMs; the module itself stays pure Foling.

import type { AxisSize, FolingModuleDef, FolingNodeConfig, FolingSnapshot } from "./types";
import { renumberSnapshotNames } from "./tree";

export type ParamOption = { value: string; label: string };

export type ModuleParam =
  | { kind: "attr"; key: string; label: string; input: "text" | "number" | "select" | "boolean"; options?: ParamOption[]; help?: string }
  | { kind: "tag"; label: string; options: ParamOption[] }
  | { kind: "class"; label: string; options: ParamOption[] }
  | { kind: "style"; prop: string; label: string; options: ParamOption[] };

export type ModuleCategory = "navigation" | "content" | "media" | "form" | "utility";

export type BuiltinModule = {
  def: FolingModuleDef;
  label: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  params: ModuleParam[];
  width: AxisSize;
  height: AxisSize;
};

export const categoryLabels: Record<ModuleCategory, string> = {
  navigation: "ナビゲーション",
  content: "コンテンツ",
  media: "メディア",
  form: "フォーム",
  utility: "ユーティリティ",
};

// ---------- snapshot builder ----------

type Child = FolingSnapshot;

function el(tag: string, config: Omit<FolingNodeConfig, "tag"> = {}, children: Child[] = []): FolingSnapshot {
  return { name: tag, config: { ...config }, children: renumberSnapshotNames(children) };
}

function root(node: FolingSnapshot): FolingSnapshot {
  return { ...node, name: `01_${node.name}` };
}

const fill: AxisSize = { mode: "fill", value: 0 };
const hug: AxisSize = { mode: "hug", value: 0 };
const fixed = (value: number): AxisSize => ({ mode: "fixed", value });

/** Inline SVG placeholder so modules work offline and without an asset. */
export function placeholderImage(label: string, from: string, to: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='750' viewBox='0 0 1200 750'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='1200' height='750' fill='url(#g)'/><text x='64' y='686' font-family='Arial,sans-serif' font-size='40' letter-spacing='6' fill='white' fill-opacity='.8'>${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------- shared CSS ----------

const BUTTON_CSS = `.lm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 0 22px; border: 1px solid transparent; border-radius: 999px; background: var(--lm-accent, #c7ff5e); color: #17201d; font-weight: 650; line-height: 1; text-decoration: none; cursor: pointer; transition: transform .15s ease, opacity .15s ease; }
.lm-btn:hover { transform: translateY(-1px); }
.lm-btn--ghost { background: transparent; border-color: currentColor; color: inherit; }
.lm-btn--dark { background: var(--lm-ink, #17201d); color: var(--lm-paper, #f2f0e9); }
.lm-btn--lg { min-height: 56px; padding: 0 30px; font-size: 17px; }`;

const alignOptions: ParamOption[] = [
  { value: "", label: "既定" },
  { value: "left", label: "左揃え" },
  { value: "center", label: "中央揃え" },
  { value: "right", label: "右揃え" },
];

// ---------- modules ----------

const logo: BuiltinModule = {
  label: "ロゴ",
  description: "マーク＋サイト名",
  category: "navigation",
  icon: "sparkles",
  width: hug,
  height: hug,
  params: [],
  def: {
    name: "logo",
    snapshot: root(
      el("a", { classes: ["lm-logo"], attributes: { href: "./", "aria-label": "トップページ" } }, [
        el("span", { classes: ["lm-logo__mark"], content: "N" }),
        el("span", { classes: ["lm-logo__text"], content: "NORTH/STUDIO" }),
      ]),
    ),
    css: `.lm-logo { display: inline-flex; align-items: center; gap: 10px; color: inherit; font-size: 19px; font-weight: 800; letter-spacing: -.02em; text-decoration: none; white-space: nowrap; }
.lm-logo__text { line-height: 1.1; }
.lm-logo__mark { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--lm-ink, #17201d); color: var(--lm-accent, #c7ff5e); font-size: 17px; }`,
  },
};

const nav: BuiltinModule = {
  label: "ナビ",
  description: "横並びのリンク",
  category: "navigation",
  icon: "navigation",
  width: hug,
  height: hug,
  params: [
    {
      kind: "style",
      prop: "gap",
      label: "リンク間隔",
      options: [
        { value: "", label: "既定 (28px)" },
        { value: "16px", label: "狭い" },
        { value: "40px", label: "広い" },
      ],
    },
  ],
  def: {
    name: "nav",
    snapshot: root(
      el("nav", { classes: ["lm-nav"], attributes: { "aria-label": "メインナビゲーション" } }, [
        el("a", { classes: ["lm-nav__link"], attributes: { href: "#work" }, content: "Works" }),
        el("a", { classes: ["lm-nav__link"], attributes: { href: "#about" }, content: "About" }),
        el("a", { classes: ["lm-nav__link"], attributes: { href: "#journal" }, content: "Journal" }),
        el("a", { classes: ["lm-nav__link"], attributes: { href: "#contact" }, content: "Contact" }),
      ]),
    ),
    css: `.lm-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; }
.lm-nav__link { color: inherit; font-size: 15px; text-decoration: none; opacity: .82; transition: opacity .15s ease; }
.lm-nav__link:hover { opacity: 1; text-decoration: underline; text-underline-offset: 4px; }`,
  },
};

const hamburger: BuiltinModule = {
  label: "ハンバーガー",
  description: "開閉するメニュー",
  category: "navigation",
  icon: "menu",
  width: hug,
  height: hug,
  params: [
    {
      kind: "attr",
      key: "data-side",
      label: "開く方向",
      input: "select",
      options: [
        { value: "right", label: "右から" },
        { value: "left", label: "左から" },
      ],
    },
  ],
  def: {
    name: "hamburger",
    snapshot: root(
      el(
        "div",
        {
          classes: ["lm-drawer"],
          attributes: { "data-side": "right" },
          js: `var toggle = el.querySelector('.lm-drawer__toggle');
var closeButton = el.querySelector('.lm-drawer__close');
var overlay = el.querySelector('.lm-drawer__overlay');
function setOpen(open) {
  el.classList.toggle('is-open', open);
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.documentElement.style.overflow = open ? 'hidden' : '';
}
if (toggle) toggle.addEventListener('click', function () { setOpen(!el.classList.contains('is-open')); });
if (closeButton) closeButton.addEventListener('click', function () { setOpen(false); });
if (overlay) overlay.addEventListener('click', function () { setOpen(false); });
var links = el.querySelectorAll('.lm-drawer__link');
for (var i = 0; i < links.length; i++) links[i].addEventListener('click', function () { setOpen(false); });
document.addEventListener('keydown', function (event) { if (event.key === 'Escape') setOpen(false); });`,
        },
        [
          el("button", { classes: ["lm-drawer__toggle"], attributes: { type: "button", "aria-label": "メニューを開く", "aria-expanded": "false" } }, [
            el("span", { classes: ["lm-drawer__bar"] }),
            el("span", { classes: ["lm-drawer__bar"] }),
            el("span", { classes: ["lm-drawer__bar"] }),
          ]),
          el("div", { classes: ["lm-drawer__overlay"] }),
          el("aside", { classes: ["lm-drawer__panel"], attributes: { "aria-label": "メニュー" } }, [
            el("button", { classes: ["lm-drawer__close"], attributes: { type: "button", "aria-label": "メニューを閉じる" }, content: "×" }),
            el("nav", { classes: ["lm-drawer__nav"] }, [
              el("a", { classes: ["lm-drawer__link"], attributes: { href: "#work" }, content: "Works" }),
              el("a", { classes: ["lm-drawer__link"], attributes: { href: "#about" }, content: "About" }),
              el("a", { classes: ["lm-drawer__link"], attributes: { href: "#journal" }, content: "Journal" }),
              el("a", { classes: ["lm-drawer__link"], attributes: { href: "#contact" }, content: "Contact" }),
            ]),
          ]),
        ],
      ),
    ),
    css: `.lm-drawer { position: relative; display: inline-flex; }
.lm-drawer__toggle { display: inline-flex; flex-direction: column; justify-content: center; gap: 5px; width: 44px; height: 44px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--lm-ink, #17201d); cursor: pointer; }
.lm-drawer__bar { display: block; height: 2px; border-radius: 2px; background: var(--lm-paper, #f2f0e9); }
.lm-drawer__overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(10, 14, 12, .5); opacity: 0; visibility: hidden; transition: opacity .25s ease, visibility .25s ease; }
.lm-drawer__panel { position: fixed; top: 0; right: 0; z-index: 1001; display: flex; flex-direction: column; gap: 8px; width: min(320px, 85vw); height: 100%; padding: 20px; background: var(--lm-ink, #17201d); color: var(--lm-paper, #f2f0e9); box-shadow: -12px 0 40px rgba(0, 0, 0, .25); transform: translateX(100%); visibility: hidden; transition: transform .3s ease, visibility .3s ease; }
.lm-drawer[data-side="left"] .lm-drawer__panel { right: auto; left: 0; transform: translateX(-100%); }
.lm-drawer.is-open .lm-drawer__overlay { opacity: 1; visibility: visible; }
.lm-drawer.is-open .lm-drawer__panel { transform: translateX(0); visibility: visible; }
.lm-drawer__close { align-self: flex-end; width: 40px; height: 40px; border: 0; background: transparent; color: inherit; font-size: 28px; line-height: 1; cursor: pointer; }
.lm-drawer__nav { display: flex; flex-direction: column; margin-top: 8px; }
.lm-drawer__link { padding: 14px 8px; border-bottom: 1px solid rgba(255, 255, 255, .12); color: inherit; font-size: 17px; text-decoration: none; }
.lm-drawer__link:hover { opacity: .75; }`,
  },
};

const hero: BuiltinModule = {
  label: "ヒーロー",
  description: "大見出し＋ボタン",
  category: "content",
  icon: "layout-template",
  width: fill,
  height: hug,
  params: [
    {
      kind: "class",
      label: "揃え",
      options: [
        { value: "", label: "左揃え" },
        { value: "lm-hero--center", label: "中央揃え" },
      ],
    },
  ],
  def: {
    name: "hero",
    snapshot: root(
      el("section", { classes: ["lm-hero"] }, [
        el("p", { classes: ["lm-hero__eyebrow"], content: "INDEPENDENT CREATIVE STUDIO" }),
        el("h1", { classes: ["lm-hero__title"], content: "Ideas with room to breathe." }),
        el("p", { classes: ["lm-hero__lead"], content: "ブランド、デジタル、空間。細部を大切にする人のためのデザインスタジオです。" }),
        el("div", { classes: ["lm-hero__actions"] }, [
          el("a", { classes: ["lm-btn"], attributes: { href: "#work" }, content: "作品を見る" }),
          el("a", { classes: ["lm-btn", "lm-btn--ghost"], attributes: { href: "#contact" }, content: "相談する" }),
        ]),
      ]),
    ),
    css: `.lm-hero { display: flex; flex-direction: column; gap: 22px; padding: clamp(48px, 9vw, 120px) clamp(20px, 5vw, 64px); }
.lm-hero__eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .16em; opacity: .7; }
.lm-hero__title { max-width: 14ch; font-size: clamp(38px, 6.4vw, 84px); font-weight: 800; line-height: 1.02; letter-spacing: -.035em; }
.lm-hero__lead { max-width: 38em; font-size: clamp(16px, 1.6vw, 19px); line-height: 1.7; opacity: .82; }
.lm-hero__actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
.lm-hero--center { align-items: center; text-align: center; }
.lm-hero--center .lm-hero__actions { justify-content: center; }
${BUTTON_CSS}`,
  },
};

const heading: BuiltinModule = {
  label: "見出し",
  description: "h1〜h4",
  category: "content",
  icon: "heading",
  width: fill,
  height: hug,
  params: [
    {
      kind: "tag",
      label: "レベル",
      options: [
        { value: "h1", label: "h1 — ページ見出し" },
        { value: "h2", label: "h2 — セクション" },
        { value: "h3", label: "h3 — 小見出し" },
        { value: "h4", label: "h4" },
      ],
    },
    { kind: "style", prop: "text-align", label: "揃え", options: alignOptions },
  ],
  def: {
    name: "heading",
    snapshot: root(el("h2", { classes: ["lm-heading"], content: "Good work begins with a clear point of view." })),
    css: `.lm-heading { font-size: clamp(26px, 3.4vw, 44px); font-weight: 750; line-height: 1.15; letter-spacing: -.025em; }
h1.lm-heading { font-size: clamp(34px, 5vw, 64px); }
h3.lm-heading { font-size: clamp(20px, 2.2vw, 28px); }
h4.lm-heading { font-size: 18px; }`,
  },
};

const text: BuiltinModule = {
  label: "テキスト",
  description: "本文の段落",
  category: "content",
  icon: "type",
  width: fill,
  height: hug,
  params: [
    { kind: "style", prop: "text-align", label: "揃え", options: alignOptions },
    {
      kind: "style",
      prop: "font-size",
      label: "文字サイズ",
      options: [
        { value: "", label: "既定 (16px)" },
        { value: "14px", label: "小 (14px)" },
        { value: "19px", label: "大 (19px)" },
        { value: "24px", label: "特大 (24px)" },
      ],
    },
  ],
  def: {
    name: "text",
    snapshot: root(el("p", { classes: ["lm-text"], content: "戦略とデザインを組み合わせ、役に立ち、記憶に残るものをつくります。" })),
    css: `.lm-text { max-width: 42em; font-size: 16px; line-height: 1.8; opacity: .85; }`,
  },
};

const button: BuiltinModule = {
  label: "ボタン",
  description: "リンク／CTA",
  category: "content",
  icon: "mouse-pointer-click",
  width: hug,
  height: hug,
  params: [
    {
      kind: "class",
      label: "スタイル",
      options: [
        { value: "", label: "アクセント" },
        { value: "lm-btn--dark", label: "ダーク" },
        { value: "lm-btn--ghost", label: "線のみ" },
      ],
    },
    {
      kind: "attr",
      key: "target",
      label: "開き方",
      input: "select",
      options: [
        { value: "", label: "同じタブ" },
        { value: "_blank", label: "新しいタブ" },
      ],
    },
  ],
  def: {
    name: "button",
    snapshot: root(el("a", { classes: ["lm-btn"], attributes: { href: "#contact" }, content: "プロジェクトを始める" })),
    css: BUTTON_CSS,
  },
};

const slideImages = [
  placeholderImage("FIELD NOTES", "#273d36", "#87c826"),
  placeholderImage("FORM / FUNCTION", "#5268ff", "#151816"),
  placeholderImage("QUIET OBJECTS", "#e6ddd0", "#a2643b"),
];

const carousel: BuiltinModule = {
  label: "カルーセル",
  description: "スライドショー",
  category: "media",
  icon: "gallery-horizontal",
  width: fill,
  height: hug,
  params: [
    {
      kind: "attr",
      key: "data-autoplay",
      label: "自動再生 (ミリ秒)",
      input: "number",
      help: "0 で自動再生しません",
    },
    {
      kind: "attr",
      key: "data-loop",
      label: "最後から最初へ戻る",
      input: "boolean",
    },
  ],
  def: {
    name: "carousel",
    snapshot: root(
      el(
        "div",
        {
          classes: ["lm-carousel"],
          attributes: { "data-autoplay": "5000", "data-loop": "true", "aria-roledescription": "carousel" },
          js: `var track = el.querySelector('.lm-carousel__track');
var slides = el.querySelectorAll('.lm-carousel__slide');
var dotsBox = el.querySelector('.lm-carousel__dots');
var prev = el.querySelector('.lm-carousel__prev');
var next = el.querySelector('.lm-carousel__next');
var count = slides.length;
var index = 0;
var timer = null;
var loop = el.getAttribute('data-loop') !== 'false';
var delay = parseInt(el.getAttribute('data-autoplay') || '0', 10) || 0;
var dots = [];
function go(n) {
  if (!count) return;
  index = loop ? (n + count) % count : Math.max(0, Math.min(count - 1, n));
  if (track) track.style.transform = 'translateX(' + (-index * 100) + '%)';
  for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('is-active', d === index);
  if (!loop && prev) prev.disabled = index === 0;
  if (!loop && next) next.disabled = index === count - 1;
}
function restart() {
  if (timer) clearInterval(timer);
  timer = null;
  if (delay > 0 && count > 1) timer = setInterval(function () { go(index + 1); }, delay);
}
if (dotsBox) {
  dotsBox.innerHTML = '';
  for (var i = 0; i < count; i++) {
    (function (target) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'lm-carousel__dot';
      dot.setAttribute('aria-label', (target + 1) + ' / ' + count);
      dot.addEventListener('click', function () { go(target); restart(); });
      dotsBox.appendChild(dot);
      dots.push(dot);
    })(i);
  }
}
if (prev) prev.addEventListener('click', function () { go(index - 1); restart(); });
if (next) next.addEventListener('click', function () { go(index + 1); restart(); });
el.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); timer = null; });
el.addEventListener('mouseleave', restart);
var startX = null;
el.addEventListener('pointerdown', function (event) { startX = event.clientX; });
el.addEventListener('pointerup', function (event) {
  if (startX === null) return;
  var dx = event.clientX - startX;
  startX = null;
  if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); restart(); }
});
go(0);
restart();`,
        },
        [
          el("div", { classes: ["lm-carousel__viewport"] }, [
            el(
              "div",
              { classes: ["lm-carousel__track"] },
              [
                ["Field Notes", "Identity & digital · 2026"],
                ["Form / Function", "Product design · 2025"],
                ["Quiet Objects", "Spatial · 2025"],
              ].map(([title, meta], index) =>
                el("figure", { classes: ["lm-carousel__slide"] }, [
                  el("img", { classes: ["lm-carousel__img"], attributes: { src: slideImages[index], alt: title } }),
                  el("figcaption", { classes: ["lm-carousel__caption"] }, [
                    el("strong", { content: title }),
                    el("span", { content: meta }),
                  ]),
                ]),
              ),
            ),
          ]),
          el("button", { classes: ["lm-carousel__prev"], attributes: { type: "button", "aria-label": "前へ" }, content: "‹" }),
          el("button", { classes: ["lm-carousel__next"], attributes: { type: "button", "aria-label": "次へ" }, content: "›" }),
          el("div", { classes: ["lm-carousel__dots"] }),
        ],
      ),
    ),
    css: `.lm-carousel { position: relative; overflow: hidden; border-radius: 18px; background: #0f1412; color: #fff; }
.lm-carousel__viewport { height: 100%; overflow: hidden; }
.lm-carousel__track { display: flex; height: 100%; transition: transform .5s cubic-bezier(.2, .7, .2, 1); }
.lm-carousel__slide { position: relative; flex: 0 0 100%; min-height: 380px; margin: 0; }
.lm-carousel__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lm-carousel__caption { position: absolute; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; gap: 6px; padding: 40px 32px 48px; background: linear-gradient(transparent, rgba(0, 0, 0, .55)); }
.lm-carousel__caption strong { font-size: 26px; font-weight: 750; letter-spacing: -.02em; }
.lm-carousel__caption span { font-size: 14px; opacity: .8; }
.lm-carousel__prev, .lm-carousel__next { position: absolute; top: 50%; z-index: 2; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .9); color: #17201d; font-size: 26px; line-height: 1; cursor: pointer; transform: translateY(-50%); }
.lm-carousel__prev { left: 16px; }
.lm-carousel__next { right: 16px; }
.lm-carousel__prev:disabled, .lm-carousel__next:disabled { opacity: .35; cursor: default; }
.lm-carousel__dots { position: absolute; right: 0; bottom: 18px; left: 0; z-index: 2; display: flex; justify-content: center; gap: 8px; }
.lm-carousel__dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 4px; background: rgba(255, 255, 255, .5); cursor: pointer; transition: width .2s ease; }
.lm-carousel__dot.is-active { width: 24px; background: #fff; }`,
  },
};

const cards: BuiltinModule = {
  label: "カード",
  description: "繰り返しの項目",
  category: "content",
  icon: "layout-grid",
  width: fill,
  height: hug,
  params: [
    {
      kind: "style",
      prop: "grid-template-columns",
      label: "列",
      options: [
        { value: "", label: "自動" },
        { value: "repeat(2, minmax(0, 1fr))", label: "2列" },
        { value: "repeat(3, minmax(0, 1fr))", label: "3列" },
        { value: "repeat(4, minmax(0, 1fr))", label: "4列" },
        { value: "minmax(0, 1fr)", label: "1列" },
      ],
    },
  ],
  def: {
    name: "cards",
    snapshot: root(
      el(
        "div",
        { classes: ["lm-cards"] },
        [
          ["01", "Strategy", "ブランドの立ち位置と言葉を、一緒に整理します。"],
          ["02", "Identity", "ロゴ、色、タイポグラフィで一貫した印象をつくります。"],
          ["03", "Digital", "Webサイトとプロダクトを、使いやすく形にします。"],
        ].map(([tag, title, body]) =>
          el("article", { classes: ["lm-card"] }, [
            el("span", { classes: ["lm-card__tag"], content: tag }),
            el("h3", { classes: ["lm-card__title"], content: title }),
            el("p", { classes: ["lm-card__text"], content: body }),
            el("a", { classes: ["lm-card__link"], attributes: { href: "#" }, content: "詳しく見る →" }),
          ]),
        ),
      ),
    ),
    css: `.lm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.lm-card { display: flex; flex-direction: column; gap: 10px; padding: 26px; border: 1px solid rgba(23, 32, 29, .1); border-radius: 16px; background: rgba(255, 255, 255, .72); color: var(--lm-ink, #17201d); }
.lm-card__tag { font-size: 12px; font-weight: 700; letter-spacing: .14em; opacity: .55; }
.lm-card__title { font-size: 21px; font-weight: 750; letter-spacing: -.02em; }
.lm-card__text { line-height: 1.7; opacity: .78; }
.lm-card__link { margin-top: auto; padding-top: 8px; color: inherit; font-weight: 650; text-decoration: none; }`,
  },
};

const image: BuiltinModule = {
  label: "画像",
  description: "写真＋キャプション",
  category: "media",
  icon: "image",
  width: fill,
  height: hug,
  params: [
    {
      kind: "class",
      label: "比率",
      options: [
        { value: "", label: "画像のまま" },
        { value: "lm-image--wide", label: "16:9" },
        { value: "lm-image--photo", label: "4:3" },
        { value: "lm-image--square", label: "1:1" },
      ],
    },
  ],
  def: {
    name: "image",
    snapshot: root(
      el("figure", { classes: ["lm-image"] }, [
        el("img", { classes: ["lm-image__img"], attributes: { src: placeholderImage("IMAGE", "#c5d0c1", "#5f7a6a"), alt: "" } }),
        el("figcaption", { classes: ["lm-image__caption"], content: "キャプション" }),
      ]),
    ),
    css: `.lm-image { display: flex; flex-direction: column; gap: 10px; margin: 0; }
.lm-image__img { width: 100%; height: auto; border-radius: 16px; object-fit: cover; }
.lm-image--wide .lm-image__img { aspect-ratio: 16 / 9; }
.lm-image--photo .lm-image__img { aspect-ratio: 4 / 3; }
.lm-image--square .lm-image__img { aspect-ratio: 1 / 1; }
.lm-image__caption { font-size: 13px; opacity: .65; }`,
  },
};

const form: BuiltinModule = {
  label: "フォーム",
  description: "お問い合わせ",
  category: "form",
  icon: "text-cursor-input",
  width: fill,
  height: hug,
  params: [
    { kind: "attr", key: "action", label: "送信先URL", input: "text", help: "# のままなら送信せずに完了メッセージを表示します" },
    {
      kind: "attr",
      key: "method",
      label: "送信方式",
      input: "select",
      options: [
        { value: "post", label: "POST" },
        { value: "get", label: "GET" },
      ],
    },
    { kind: "attr", key: "data-thanks", label: "完了メッセージ", input: "text" },
  ],
  def: {
    name: "form",
    snapshot: root(
      el(
        "form",
        {
          classes: ["lm-form"],
          attributes: { action: "#", method: "post", "data-thanks": "送信しました。ありがとうございます。" },
          js: `var status = el.querySelector('.lm-form__status');
el.addEventListener('submit', function (event) {
  var action = el.getAttribute('action') || '';
  if (action === '' || action === '#') {
    event.preventDefault();
    if (status) status.textContent = el.getAttribute('data-thanks') || '';
    el.reset();
  }
});`,
        },
        [
          el("label", { classes: ["lm-form__field"] }, [
            el("span", { classes: ["lm-form__label"], content: "お名前" }),
            el("input", { classes: ["lm-form__input"], attributes: { type: "text", name: "name", placeholder: "山田 太郎", required: "" } }),
          ]),
          el("label", { classes: ["lm-form__field"] }, [
            el("span", { classes: ["lm-form__label"], content: "メールアドレス" }),
            el("input", { classes: ["lm-form__input"], attributes: { type: "email", name: "email", placeholder: "you@example.com", required: "" } }),
          ]),
          el("label", { classes: ["lm-form__field"] }, [
            el("span", { classes: ["lm-form__label"], content: "お問い合わせ内容" }),
            el("textarea", { classes: ["lm-form__input"], attributes: { name: "message", rows: "4", placeholder: "ご相談内容をお書きください" } }),
          ]),
          el("button", { classes: ["lm-btn", "lm-btn--dark"], attributes: { type: "submit" }, content: "送信する" }),
          el("p", { classes: ["lm-form__status"], attributes: { "aria-live": "polite" } }),
        ],
      ),
    ),
    css: `.lm-form { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; width: 100%; max-width: 560px; }
.lm-form__field { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.lm-form__label { font-size: 13px; font-weight: 650; }
.lm-form__input { width: 100%; min-height: 46px; padding: 12px 14px; border: 1px solid rgba(23, 32, 29, .22); border-radius: 10px; background: #fff; color: #17201d; }
.lm-form__input:focus { outline: 2px solid var(--lm-accent, #c7ff5e); outline-offset: 1px; }
.lm-form__status { min-height: 1.5em; font-weight: 650; }
${BUTTON_CSS}`,
  },
};

const faq: BuiltinModule = {
  label: "FAQ",
  description: "開閉する質問",
  category: "content",
  icon: "circle-help",
  width: fill,
  height: hug,
  params: [],
  def: {
    name: "faq",
    snapshot: root(
      el(
        "div",
        { classes: ["lm-faq"] },
        [
          ["制作期間はどのくらいですか？", "規模によりますが、Webサイトはおおよそ6〜10週間です。"],
          ["小さな相談からでも大丈夫ですか？", "もちろんです。まずは気軽にお問い合わせください。"],
          ["公開後の更新もお願いできますか？", "はい。運用や改善のご相談も承っています。"],
        ].map(([question, answer]) =>
          el("details", { classes: ["lm-faq__item"] }, [
            el("summary", { classes: ["lm-faq__q"], content: question }),
            el("p", { classes: ["lm-faq__a"], content: answer }),
          ]),
        ),
      ),
    ),
    css: `.lm-faq { display: flex; flex-direction: column; border-top: 1px solid rgba(23, 32, 29, .15); }
.lm-faq__item { border-bottom: 1px solid rgba(23, 32, 29, .15); }
.lm-faq__q { position: relative; padding: 20px 40px 20px 0; font-size: 17px; font-weight: 650; list-style: none; cursor: pointer; }
.lm-faq__q::-webkit-details-marker { display: none; }
.lm-faq__q::after { content: "+"; position: absolute; top: 50%; right: 6px; font-size: 22px; font-weight: 400; transform: translateY(-50%); }
.lm-faq__item[open] .lm-faq__q::after { content: "−"; }
.lm-faq__a { padding: 0 0 20px; line-height: 1.8; opacity: .8; }`,
  },
};

const social: BuiltinModule = {
  label: "SNSリンク",
  description: "外部リンク一覧",
  category: "navigation",
  icon: "share-2",
  width: hug,
  height: hug,
  params: [],
  def: {
    name: "social",
    snapshot: root(
      el(
        "ul",
        { classes: ["lm-social"] },
        [
          ["Instagram", "https://www.instagram.com/"],
          ["LinkedIn", "https://www.linkedin.com/"],
          ["GitHub", "https://github.com/"],
        ].map(([label, href]) =>
          el("li", {}, [el("a", { classes: ["lm-social__link"], attributes: { href, target: "_blank", rel: "noopener" }, content: label })]),
        ),
      ),
    ),
    css: `.lm-social { display: flex; flex-wrap: wrap; gap: 18px; }
.lm-social__link { color: inherit; font-size: 14px; text-decoration: none; opacity: .8; }
.lm-social__link:hover { opacity: 1; text-decoration: underline; text-underline-offset: 4px; }`,
  },
};

const copyright: BuiltinModule = {
  label: "コピーライト",
  description: "著作権表示",
  category: "utility",
  icon: "copyright",
  width: hug,
  height: hug,
  params: [],
  def: {
    name: "copyright",
    snapshot: root(el("small", { classes: ["lm-copyright"], content: "© 2026 NORTH/STUDIO" })),
    css: `.lm-copyright { font-size: 13px; opacity: .65; }`,
  },
};

const spacer: BuiltinModule = {
  label: "スペーサー",
  description: "空白をあける",
  category: "utility",
  icon: "move-vertical",
  width: fill,
  height: fixed(48),
  params: [],
  def: {
    name: "spacer",
    snapshot: root(el("div", { classes: ["lm-spacer"], attributes: { "aria-hidden": "true" } })),
    css: `.lm-spacer { flex-shrink: 0; }`,
  },
};

const divider: BuiltinModule = {
  label: "区切り線",
  description: "水平線",
  category: "utility",
  icon: "minus",
  width: fill,
  height: hug,
  params: [],
  def: {
    name: "divider",
    snapshot: root(el("hr", { classes: ["lm-divider"] })),
    css: `.lm-divider { width: 100%; border: 0; border-top: 1px solid currentColor; opacity: .18; }`,
  },
};

export const builtinModules: BuiltinModule[] = [
  logo,
  nav,
  hamburger,
  social,
  hero,
  heading,
  text,
  button,
  cards,
  faq,
  carousel,
  image,
  form,
  copyright,
  spacer,
  divider,
];

export const builtinByName: Record<string, BuiltinModule> = Object.fromEntries(
  builtinModules.map((module) => [module.def.name, module]),
);
