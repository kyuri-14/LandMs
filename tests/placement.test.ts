// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { builtinByName } from "../src/core/builtins";
import { createFrame, createModuleInstance } from "../src/core/project";
import { createShape } from "../src/core/shapes";
import { fitNode, frameToFlex, frameToFree, orderIndex } from "../src/editor/placementOps";

describe("moving nodes between flex and free frames", () => {
  const free = createFrame("free");
  const flex = createFrame("column");

  test("a shape dropped into a free frame is centred on the drop point", () => {
    const rect = fitNode(createShape("rect"), free, { frame: { w: 1000, h: 500 }, point: { x: 300, y: 200 } });
    expect(rect.place).toMatchObject({ x: 200, y: 140, w: 200, h: 120, horizontal: "center", vertical: "top", pw: 1000, ph: 500 });
  });

  test("a module of unknown size is placed by its corner until measured", () => {
    const logo = fitNode(createModuleInstance(builtinByName.logo.def), free, { frame: { w: 800, h: 400 }, point: { x: 50, y: 60 }, anchor: "corner" });
    expect(logo.place).toMatchObject({ x: 50, y: 60, w: 0, horizontal: "left" });
  });

  test("fill sizes become fixed in a free frame, placements are dropped in a flex frame", () => {
    const hero = fitNode(createModuleInstance(builtinByName.hero.def), free, { frame: { w: 1000, h: 500 } });
    expect(hero.width).toEqual({ mode: "fixed", value: 600 });
    expect(hero.height.mode).toBe("hug");
    const back = fitNode(hero, flex);
    expect(back.place).toBeUndefined();
  });

  test("switching to free keeps every child where it was measured, and back again", () => {
    const frame = createFrame("row", { children: [createShape("rect"), createModuleInstance(builtinByName.button.def)] });
    const [a, b] = frame.children;
    const converted = frameToFree(frame, {
      frame: { w: 900, h: 200 },
      outer: { w: 900, h: 200 },
      children: { [a.id]: { x: 10, y: 20, w: 200, h: 120, rotation: 0 }, [b.id]: { x: 700, y: 77, w: 180, h: 46, rotation: 0 } },
    });
    expect(converted.layout.mode).toBe("free");
    expect(converted.height).toEqual({ mode: "fixed", value: 200 });
    expect(converted.children[1].place).toMatchObject({ x: 700, y: 77, w: 180, h: 46, pw: 900, ph: 200 });
    const restored = frameToFlex(converted);
    expect(restored.layout.mode).toBeUndefined();
    expect(restored.children.every((child) => child.place === undefined)).toBe(true);
  });

  test("stacking order moves", () => {
    expect(orderIndex(1, 4, "forward")).toBe(3);
    expect(orderIndex(3, 4, "forward")).toBeNull();
    expect(orderIndex(1, 4, "backward")).toBe(0);
    expect(orderIndex(1, 4, "front")).toBe(4);
    expect(orderIndex(0, 4, "back")).toBeNull();
  });
});
