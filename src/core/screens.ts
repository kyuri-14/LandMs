// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Responsive screens: each screen has its own layout tree and a width
// condition. The exported site keeps every screen in the HTML and lets CSS
// media queries show the one whose condition matches — no JavaScript needed,
// so it also works in Foling (where scripts are optional) and with JS off.

import type { Screen } from "./types";

export function mediaQuery(screen: Pick<Screen, "minWidth" | "maxWidth">): string | null {
  const parts: string[] = [];
  if (screen.minWidth !== null) parts.push(`(min-width: ${screen.minWidth}px)`);
  if (screen.maxWidth !== null) parts.push(`(max-width: ${screen.maxWidth}px)`);
  return parts.length ? parts.join(" and ") : null;
}

export function describeCondition(screen: Pick<Screen, "minWidth" | "maxWidth">): string {
  const { minWidth: min, maxWidth: max } = screen;
  if (min === null && max === null) return "常に表示";
  if (min !== null && max !== null) return `${min}〜${max}px`;
  if (min !== null) return `${min}px以上`;
  return `${max}px以下`;
}

export function matchesWidth(screen: Pick<Screen, "minWidth" | "maxWidth">, width: number): boolean {
  return (screen.minWidth === null || width >= screen.minWidth) && (screen.maxWidth === null || width <= screen.maxWidth);
}

/** First screen (in list order) whose condition matches a viewport width. */
export function screenForWidth(screens: Screen[], width: number): Screen | null {
  return screens.find((screen) => matchesWidth(screen, width)) ?? null;
}

export type ScreenIssue = { level: "warning" | "error"; screenIds: string[]; message: string };

const LIMIT = 100_000;

/** Overlapping conditions, uncovered widths and impossible ranges. */
export function validateScreens(screens: Screen[]): ScreenIssue[] {
  const issues: ScreenIssue[] = [];
  for (const screen of screens) {
    if (screen.minWidth !== null && screen.maxWidth !== null && screen.minWidth > screen.maxWidth) {
      issues.push({ level: "error", screenIds: [screen.id], message: `「${screen.name}」は最小幅が最大幅より大きいため、表示されることがありません。` });
    } else if (!matchesWidth(screen, screen.canvasWidth)) {
      issues.push({
        level: "warning",
        screenIds: [screen.id],
        message: `「${screen.name}」の編集幅 ${screen.canvasWidth}px は表示条件（${describeCondition(screen)}）の外です。実際の表示と見た目が変わります。`,
      });
    }
  }
  for (let a = 0; a < screens.length; a += 1) {
    for (let b = a + 1; b < screens.length; b += 1) {
      const first = screens[a];
      const second = screens[b];
      const low = Math.max(first.minWidth ?? 0, second.minWidth ?? 0);
      const high = Math.min(first.maxWidth ?? LIMIT, second.maxWidth ?? LIMIT);
      if (low <= high) {
        issues.push({
          level: "warning",
          screenIds: [first.id, second.id],
          message: `「${first.name}」と「${second.name}」は ${low}〜${high >= LIMIT ? "" : `${high}`}px で条件が重なっており、両方が同時に表示されます。`,
        });
      }
    }
  }
  const gaps = uncoveredRanges(screens);
  for (const [low, high] of gaps) {
    issues.push({
      level: "warning",
      screenIds: [],
      message: `${low}〜${high >= LIMIT ? "" : `${high}`}px ではどの画面も表示されません。`,
    });
  }
  return issues;
}

/** Width ranges (inclusive, px) that no screen covers. */
export function uncoveredRanges(screens: Screen[]): Array<[number, number]> {
  const ranges = screens
    .filter((screen) => screen.minWidth === null || screen.maxWidth === null || screen.minWidth <= screen.maxWidth)
    .map((screen) => [screen.minWidth ?? 0, screen.maxWidth ?? LIMIT] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let covered = -1;
  for (const [low, high] of ranges) {
    if (low > covered + 1) gaps.push([covered + 1, low - 1]);
    covered = Math.max(covered, high);
  }
  if (covered < LIMIT) gaps.push([covered + 1, LIMIT]);
  return gaps;
}

/** CSS that shows exactly the matching screen. `!important` beats the inline display:flex. */
export function screenSwitchCss(screens: Screen[], keys: Record<string, string>): string {
  if (screens.length <= 1) return "";
  const lines = [
    "/* LandMs responsive screens: each screen is shown only when its condition matches. */",
    ".lm-screen { display: none !important; }",
  ];
  for (const screen of screens) {
    const query = mediaQuery(screen);
    const rule = `.lm-screen[data-screen="${keys[screen.id]}"] { display: flex !important; }`;
    lines.push(query ? `@media ${query} { ${rule} }` : rule);
  }
  return lines.join("\n");
}

/** Readable, unique keys for `data-screen` (e.g. "desktop", "mobile", "screen-4"). */
export function screenKeys(screens: Screen[]): Record<string, string> {
  const used = new Set<string>();
  const keys: Record<string, string> = {};
  screens.forEach((screen, index) => {
    let key = screen.name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!key) key = `screen-${index + 1}`;
    let unique = key;
    for (let n = 2; used.has(unique); n += 1) unique = `${key}-${n}`;
    used.add(unique);
    keys[screen.id] = unique;
  });
  return keys;
}
