import { apply } from "./apply.js";
import type { Command, DomainEvent, RejectionReason } from "./commands.js";
import type { Ctx, SessionState } from "./state.js";

/** Maximum number of undo steps kept per document. */
export const HISTORY_LIMIT = 100;

/**
 * Undo/redo stacks of earlier states of one document ("inverse snapshots", ARCHITECTURE §5.1;
 * DM decision 2026-11-20, T-174): a scene's session state, later a map's, an asset's or a
 * creature's. States are immutable and share unchanged parts, so a snapshot is cheap. A history
 * lives as long as its document is open.
 */
export interface History<T = SessionState> {
  readonly past: readonly T[];
  readonly future: readonly T[];
}

/** An empty history, e.g. when a document is opened. */
export function createHistory<T = SessionState>(): History<T> {
  return { past: [], future: [] };
}

/**
 * The history after a change from `previous`: it can be undone, and what was undone before
 * can no longer be redone. Only the newest {@link HISTORY_LIMIT} steps are kept.
 */
export function record<T>(history: History<T>, previous: T): History<T> {
  return {
    past: [...history.past, previous].slice(-HISTORY_LIMIT),
    future: [],
  };
}

/**
 * Applies a command and records the previous state for undo; a new command clears redo. A
 * command that changes nothing (same state back) leaves the history as it is.
 */
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
  if (result.state === state)
    return { ok: true, state, events: result.events, history };
  return {
    ok: true,
    state: result.state,
    events: result.events,
    history: record(history, state),
  };
}

/** Steps back one change, or returns `null` if there is nothing to undo. */
export function undo<T>(
  state: T,
  history: History<T>,
): { state: T; history: History<T> } | null {
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

/** Re-applies the last undone change, or returns `null` if there is nothing to redo. */
export function redo<T>(
  state: T,
  history: History<T>,
): { state: T; history: History<T> } | null {
  const [next, ...future] = history.future;
  if (!next) return null;
  return { state: next, history: { past: [...history.past, state], future } };
}
