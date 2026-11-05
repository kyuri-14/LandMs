// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure helpers for walking and editing the layout tree. Every edit returns a
// new object (no mutation), so the undo history can keep old versions as-is.

import type { FolingSnapshot, FrameNode, LayoutNode, Project, Screen } from "./types";

let counter = 0;
/** Short unique id. Readable in the layer panel and stable across sessions. */
export function newId(prefix = "n"): string {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36).slice(-5);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${random}${counter.toString(36)}`;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type NodeLocation = {
  node: LayoutNode;
  parent: FrameNode | null;
  index: number;
  depth: number;
};

export function findNode(root: FrameNode, id: string): NodeLocation | null {
  if (root.id === id) return { node: root, parent: null, index: 0, depth: 0 };
  const walk = (frame: FrameNode, depth: number): NodeLocation | null => {
    for (let index = 0; index < frame.children.length; index += 1) {
      const child = frame.children[index];
      if (child.id === id) return { node: child, parent: frame, index, depth: depth + 1 };
      if (child.kind === "frame") {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, 0);
}

/** Ids from the root down to (and including) `id`. */
export function pathTo(root: FrameNode, id: string): string[] {
  const trail: string[] = [];
  const walk = (node: LayoutNode): boolean => {
    trail.push(node.id);
    if (node.id === id) return true;
    if (node.kind === "frame") {
      for (const child of node.children) if (walk(child)) return true;
    }
    trail.pop();
    return false;
  };
  return walk(root) ? trail : [];
}

export function isDescendant(root: FrameNode, ancestorId: string, id: string): boolean {
  return pathTo(root, id).includes(ancestorId);
}

/** Replace one node anywhere in the tree. */
export function mapNode(root: FrameNode, id: string, update: (node: LayoutNode) => LayoutNode): FrameNode {
  const walk = (node: LayoutNode): LayoutNode => {
    if (node.id === id) return update(node);
    if (node.kind !== "frame") return node;
    let changed = false;
    const children = node.children.map((child) => {
      const next = walk(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...node, children } : node;
  };
  return walk(root) as FrameNode;
}

export function removeNode(root: FrameNode, id: string): FrameNode {
  if (root.id === id) return root;
  const walk = (frame: FrameNode): FrameNode => {
    if (frame.children.some((child) => child.id === id)) {
      return { ...frame, children: frame.children.filter((child) => child.id !== id) };
    }
    let changed = false;
    const children = frame.children.map((child) => {
      if (child.kind !== "frame") return child;
      const next = walk(child);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? { ...frame, children } : frame;
  };
  return walk(root);
}

export function insertNode(root: FrameNode, parentId: string, index: number, node: LayoutNode): FrameNode {
  return mapNode(root, parentId, (parent) => {
    if (parent.kind !== "frame") return parent;
    const children = [...parent.children];
    const at = Math.max(0, Math.min(index, children.length));
    children.splice(at, 0, node);
    return { ...parent, children };
  });
}

/**
 * Move a node to `parentId` at `index` (index counted in the parent's children
 * *before* the move). Moving a frame into itself or its descendants is refused.
 */
export function moveNode(root: FrameNode, id: string, parentId: string, index: number): FrameNode {
  const from = findNode(root, id);
  if (!from || !from.parent) return root;
  if (id === parentId || isDescendant(root, id, parentId)) return root;
  let target = index;
  if (from.parent.id === parentId && from.index < index) target -= 1;
  const without = removeNode(root, id);
  return insertNode(without, parentId, target, from.node);
}

/** Copy a subtree giving every frame/module a fresh id. */
export function cloneWithNewIds<T extends LayoutNode>(node: T): T {
  const copy = deepClone(node);
  const walk = (current: LayoutNode) => {
    current.id = newId(current.kind === "frame" ? "f" : current.kind === "shape" ? "sh" : "m");
    if (current.kind === "frame") current.children.forEach(walk);
  };
  walk(copy);
  return copy;
}

export function flattenTree(root: FrameNode): NodeLocation[] {
  const rows: NodeLocation[] = [];
  const walk = (node: LayoutNode, parent: FrameNode | null, index: number, depth: number) => {
    rows.push({ node, parent, index, depth });
    if (node.kind === "frame") node.children.forEach((child, i) => walk(child, node, i, depth + 1));
  };
  walk(root, null, 0, 0);
  return rows;
}

export function updateScreen(project: Project, screenId: string, update: (screen: Screen) => Screen): Project {
  return {
    ...project,
    screens: project.screens.map((screen) => (screen.id === screenId ? update(screen) : screen)),
  };
}

export function updateRoot(project: Project, screenId: string, update: (root: FrameNode) => FrameNode): Project {
  return updateScreen(project, screenId, (screen) => ({ ...screen, root: update(screen.root) }));
}

// ---------- Foling snapshot helpers (module internals) ----------

/** Path of a node inside a module snapshot: child indexes from the root. */
export type SnapshotPath = number[];

export function snapshotAt(root: FolingSnapshot, path: SnapshotPath): FolingSnapshot | null {
  let current: FolingSnapshot | undefined = root;
  for (const index of path) {
    current = current?.children[index];
    if (!current) return null;
  }
  return current ?? null;
}

export function mapSnapshot(
  root: FolingSnapshot,
  path: SnapshotPath,
  update: (node: FolingSnapshot) => FolingSnapshot | null,
): FolingSnapshot {
  if (path.length === 0) return update(root) ?? root;
  const [head, ...rest] = path;
  const children: FolingSnapshot[] = [];
  root.children.forEach((child, index) => {
    if (index !== head) {
      children.push(child);
      return;
    }
    const next = rest.length === 0 ? update(child) : mapSnapshot(child, rest, update);
    if (next) children.push(next);
  });
  return { ...root, children };
}

export function duplicateSnapshotChild(root: FolingSnapshot, path: SnapshotPath): FolingSnapshot {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return mapSnapshot(root, parentPath, (parent) => {
    const children = [...parent.children];
    children.splice(index + 1, 0, deepClone(parent.children[index]));
    return { ...parent, children: renumberSnapshotNames(children) };
  });
}

export function removeSnapshotChild(root: FolingSnapshot, path: SnapshotPath): FolingSnapshot {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return mapSnapshot(root, parentPath, (parent) => ({
    ...parent,
    children: renumberSnapshotNames(parent.children.filter((_, i) => i !== index)),
  }));
}

export function moveSnapshotChild(root: FolingSnapshot, path: SnapshotPath, delta: -1 | 1): FolingSnapshot {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return mapSnapshot(root, parentPath, (parent) => {
    const target = index + delta;
    if (target < 0 || target >= parent.children.length) return parent;
    const children = [...parent.children];
    [children[index], children[target]] = [children[target], children[index]];
    return { ...parent, children: renumberSnapshotNames(children) };
  });
}

/** Strip a Foling `NN_` ordering prefix: `02_section` → `section`. */
export function displayName(folder: string): string {
  const match = folder.match(/^(\d+)_(.+)$/);
  return match ? match[2] : folder;
}

/** Re-apply `01_`, `02_` … prefixes after the children were reordered. */
export function renumberSnapshotNames(children: FolingSnapshot[]): FolingSnapshot[] {
  return children.map((child, index) => ({
    ...child,
    name: `${String(index + 1).padStart(2, "0")}_${displayName(child.name)}`,
  }));
}
