// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Editor state with undo / redo. Every change goes through `commit`, which
// keeps the previous project in the history. Rapid edits of the same field
// (typing in a text box, dragging a number) are merged into one undo step.

import { useCallback, useMemo, useReducer } from "react";
import type { Project } from "../core/types";

const HISTORY_LIMIT = 150;
const MERGE_WINDOW_MS = 900;

export type Selection = {
  /** Frame or module id. */
  id: string | null;
  /** Element inside a module (child indexes from the module root). */
  path: number[] | null;
};

type State = {
  project: Project;
  past: Project[];
  future: Project[];
  mergeKey: string | null;
  mergeTime: number;
  screenId: string;
  selection: Selection;
  dirty: boolean;
  filePath: string | null;
};

type Action =
  | { type: "commit"; update: (project: Project) => Project; key?: string; select?: Selection; screenId?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; project: Project; filePath: string | null; dirty?: boolean }
  | { type: "select"; selection: Selection }
  | { type: "screen"; screenId: string }
  | { type: "saved"; filePath: string | null };

function firstScreen(project: Project): string {
  return project.screens[0]?.id ?? "";
}

function keepScreen(project: Project, screenId: string): string {
  return project.screens.some((screen) => screen.id === screenId) ? screenId : firstScreen(project);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "commit": {
      const next = action.update(state.project);
      if (next === state.project) {
        return action.select ? { ...state, selection: action.select } : state;
      }
      const now = Date.now();
      const merge = !!action.key && action.key === state.mergeKey && now - state.mergeTime < MERGE_WINDOW_MS;
      const past = merge ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT);
      const screenId = keepScreen(next, action.screenId ?? state.screenId);
      return {
        ...state,
        project: next,
        past,
        future: [],
        mergeKey: action.key ?? null,
        mergeTime: now,
        screenId,
        selection: action.select ?? state.selection,
        dirty: true,
      };
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
        mergeKey: null,
        screenId: keepScreen(previous, state.screenId),
        dirty: true,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        project: next,
        past: [...state.past, state.project],
        future: rest,
        mergeKey: null,
        screenId: keepScreen(next, state.screenId),
        dirty: true,
      };
    }
    case "load":
      return {
        project: action.project,
        past: [],
        future: [],
        mergeKey: null,
        mergeTime: 0,
        screenId: firstScreen(action.project),
        selection: { id: null, path: null },
        dirty: action.dirty ?? false,
        filePath: action.filePath,
      };
    case "select":
      return { ...state, selection: action.selection };
    case "screen":
      return { ...state, screenId: keepScreen(state.project, action.screenId), selection: { id: null, path: null } };
    case "saved":
      return { ...state, dirty: false, filePath: action.filePath };
    default:
      return state;
  }
}

export function useEditorStore(initial: () => Project) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const project = initial();
    return {
      project,
      past: [],
      future: [],
      mergeKey: null,
      mergeTime: 0,
      screenId: firstScreen(project),
      selection: { id: null, path: null },
      dirty: false,
      filePath: null,
    } satisfies State;
  });

  const commit = useCallback(
    (update: (project: Project) => Project, options: { key?: string; select?: Selection; screenId?: string } = {}) =>
      dispatch({ type: "commit", update, ...options }),
    [],
  );
  const select = useCallback((id: string | null, path: number[] | null = null) => dispatch({ type: "select", selection: { id, path } }), []);
  const setScreen = useCallback((screenId: string) => dispatch({ type: "screen", screenId }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const load = useCallback((project: Project, filePath: string | null = null, dirty = false) => dispatch({ type: "load", project, filePath, dirty }), []);
  const markSaved = useCallback((filePath: string | null) => dispatch({ type: "saved", filePath }), []);

  const screen = useMemo(
    () => state.project.screens.find((item) => item.id === state.screenId) ?? state.project.screens[0],
    [state.project, state.screenId],
  );

  return {
    ...state,
    screen,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    select,
    setScreen,
    undo,
    redo,
    load,
    markSaved,
  };
}

export type EditorStore = ReturnType<typeof useEditorStore>;
