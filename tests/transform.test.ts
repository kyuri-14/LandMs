// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { DEFAULT_PLACEMENT, placementDeclarations } from "../src/core/layout";
import {
  alignPlacement,
  boundsOf,
  centerOf,
  dragRect,
  lineBox,
  placementFromBox,
  resizeBox,
  rotateBox,
  settlePlacement,
  snapBounds,
  snapTargets,
  type Box,
} from "../src/editor/transform";
import type { Placement } from "../src/core/types";

const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

/** World position of a local point (relative to the box centre). */
function world(box: Box, local: { x: number; y: number }) {
  const c = centerOf(box);
  const r = (box.rotation * Math.PI) / 180;
  return { x: c.x + local.x * Math.cos(r) - local.y * Math.sin(r), y: c.y + local.x * Math.sin(r) + local.y * Math.cos(r) };
}

describe("resize", () => {
  const box: Box = { x: 100, y: 100, w: 200, h: 100, rotation: 0 };

  test("corner handle grows the box and keeps the opposite corner", () => {
    expect(resizeBox(box, "se", 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120, rotation: 0 });
    expect(resizeBox(box, "nw", -10, -30)).toEqual({ x: 90, y: 70, w: 210, h: 130, rotation: 0 });
  });

  test("edge handles change one dimension only", () => {
    expect(resizeBox(box, "e", 40, 999)).toEqual({ x: 100, y: 100, w: 240, h: 100, rotation: 0 });
    expect(resizeBox(box, "n", 999, 25)).toEqual({ x: 100, y: 125, w: 200, h: 75, rotation: 0 });
  });

  test("Shift keeps the proportions, Alt resizes from the centre", () => {
    const ratio = resizeBox(box, "se", 100, 0, { keepRatio: true });
    close(ratio.w / ratio.h, 2);
    const centred = resizeBox(box, "e", 20, 0, { fromCenter: true });
    expect(centred).toEqual({ x: 80, y: 100, w: 240, h: 100, rotation: 0 });
  });

  test("a rotated box keeps the opposite corner fixed in world coordinates", () => {
    const rotated: Box = { ...box, rotation: 30 };
    const before = world(rotated, { x: -rotated.w / 2, y: -rotated.h / 2 });
    const after = resizeBox(rotated, "se", 40, 25);
    const anchor = world(after, { x: -after.w / 2, y: -after.h / 2 });
    close(anchor.x, before.x);
    close(anchor.y, before.y);
    expect(after.rotation).toBe(30);
  });

  test("never collapses below the minimum size", () => {
    const tiny = resizeBox(box, "se", -500, -500);
    expect(tiny.w).toBe(1);
    expect(tiny.h).toBe(1);
  });
});

describe("rotate, lines and drags", () => {
  test("rotation follows the pointer around the centre and snaps to 15°", () => {
    const box: Box = { x: 0, y: 0, w: 100, h: 100, rotation: 0 };
    expect(rotateBox(box, { x: 50, y: -50 }, { x: 150, y: 50 })).toBe(90);
    expect(rotateBox(box, { x: 50, y: -50 }, { x: 60, y: -50 }, true)).toBe(0);
  });

  test("a line is a rotated box between its two points", () => {
    const line = lineBox({ x: 0, y: 0 }, { x: 100, y: 100 }, 2);
    close(line.w, Math.SQRT2 * 100);
    expect(line.rotation).toBe(45);
    close(centerOf(line).x, 50);
    close(centerOf(line).y, 50);
    expect(lineBox({ x: 0, y: 0 }, { x: 100, y: 8 }, 2, true).rotation).toBe(0);
  });

  test("drag rectangles work in every direction, as squares and from the centre", () => {
    expect(dragRect({ x: 100, y: 100 }, { x: 40, y: 160 })).toEqual({ x: 40, y: 100, w: 60, h: 60, rotation: 0 });
    expect(dragRect({ x: 0, y: 0 }, { x: 30, y: 80 }, true)).toEqual({ x: 0, y: 0, w: 80, h: 80, rotation: 0 });
    expect(dragRect({ x: 50, y: 50 }, { x: 70, y: 60 }, false, true)).toEqual({ x: 30, y: 40, w: 40, h: 20, rotation: 0 });
  });

  test("bounds of a rotated box", () => {
    const bounds = boundsOf({ x: 0, y: 0, w: 100, h: 100, rotation: 45 });
    close(bounds.right - bounds.left, Math.SQRT2 * 100);
  });
});

describe("smart guides", () => {
  test("snaps edges and centres to the frame and to siblings", () => {
    const targets = snapTargets({ w: 1000, h: 400 }, [{ left: 600, top: 50, right: 700, bottom: 150 }]);
    // Centre (498 + 2) snaps to the frame centre 500.
    expect(snapBounds({ left: 448, top: 10, right: 548, bottom: 60 }, targets, 6)).toEqual({ dx: 2, dy: 0, guideX: 500, guideY: null });
    // Left edge 597 snaps to the sibling's left edge 600; top 47 to its top 50.
    expect(snapBounds({ left: 597, top: 47, right: 640, bottom: 90 }, targets, 6)).toEqual({ dx: 3, dy: 3, guideX: 600, guideY: 50 });
    expect(snapBounds({ left: 300, top: 300, right: 320, bottom: 320 }, targets, 6)).toEqual({ dx: 0, dy: 0, guideX: null, guideY: null });
  });
});

describe("placements", () => {
  test("box ↔ placement keeps constraints and flips", () => {
    const previous = { ...DEFAULT_PLACEMENT, horizontal: "right" as const, flipY: true };
    const place = placementFromBox({ x: 10.123, y: 20, w: 30, h: 40, rotation: 370 }, { w: 800, h: 600 }, previous);
    expect(place).toMatchObject({ x: 10.12, y: 20, w: 30, h: 40, rotation: 10, horizontal: "right", flipY: true, pw: 800, ph: 600 });
  });

  test("settling a measured size keeps the element where it is drawn", () => {
    const unmeasured = { ...DEFAULT_PLACEMENT, x: 500, y: 100, horizontal: "center" as const, vertical: "top" as const, pw: 1000, ph: 400 };
    const settled = settlePlacement(unmeasured, 200, 50);
    expect(settled).toMatchObject({ x: 400, y: 100, w: 200, h: 50 });
    const css = (place: Placement) => placementDeclarations(place, { mode: "hug", value: 0 }, { mode: "hug", value: 0 }).find((decl) => decl.startsWith("left"));
    expect(css(settled)).toBe(css(unmeasured));
  });

  test("aligning inside the frame", () => {
    const place = { ...DEFAULT_PLACEMENT, x: 13, y: 7, w: 100, h: 50, pw: 500, ph: 300 };
    expect(alignPlacement(place, "hcenter").x).toBe(200);
    expect(alignPlacement(place, "right").x).toBe(400);
    expect(alignPlacement(place, "bottom").y).toBe(250);
  });
});
