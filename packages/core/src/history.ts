import { apply } from "./apply.js";
import type { Command, DomainEvent, RejectionReason } from "./commands.js";
import type { Ctx, SessionState } from "./state.js";

/** Maximum number of undo steps kept per scene. */
export const HISTORY_LIMIT = 100;

/**
 * Undo/redo stacks of earlier states ("inverse snapshots", ARCHITECTURE §5.1). States are
 * immutable and share unchanged parts, so a snapshot is cheap.
 */
export interface History {
  readonly past: readonly SessionState[];
  readonly future: readonly SessionState[];
}

/** An empty history, e.g. when a scene is opened. */
export function createHistory(): History {
  return { past: [], future: [] };
}

/** Applies a command and records the previous state for undo; a new command clears redo. */
export function execute(
  state: SessionState,
  history: History,
  command: Command,
  ctx: Ctx,
):
  | {
      readonly ok: true;
      readonly state: SessionState;
      readonly history: History;
      readonly events: readonly DomainEvent[];
    }
  | { readonly ok: false; readonly reason: RejectionReason } {
  const result = apply(state, command, ctx);
  if (!result.ok) return result;
  return {
    ok: true,
    state: result.state,
    events: result.events,
    history: {
      past: [...history.past, state].slice(-HISTORY_LIMIT),
      future: [],
    },
  };
}

/** Steps back one command, or returns `null` if there is nothing to undo. */
export function undo(
  state: SessionState,
  history: History,
): { state: SessionState; history: History } | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    state: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [state, ...history.future],
    },
  };
}

/** Re-applies the last undone command, or returns `null` if there is nothing to redo. */
export function redo(
  state: SessionState,
  history: History,
): { state: SessionState; history: History } | null {
  const [next, ...future] = history.future;
  if (!next) return null;
  return { state: next, history: { past: [...history.past, state], future } };
}
