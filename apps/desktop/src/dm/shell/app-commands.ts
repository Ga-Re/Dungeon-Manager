import { createContext, useContext, useEffect, useRef } from "react";
import type { AppCommand } from "../../platform/app-menu.js";

/**
 * Who handles the app menu's commands (T-130d): the part of the DM window that owns the state
 * registers a handler; the native menu bar or the title bar's menu button runs it.
 */
export interface AppCommands {
  /**
   * Registers `handler` for `command`; returns a function that removes it again. Each command
   * has one owner in the window; a newer registration replaces an older one.
   */
  register(command: AppCommand, handler: () => void): () => void;
  /**
   * Registers how to close a modal dialog: the native menu bar works while one is open, so
   * every command first closes them (it then opens its own). Returns a function to remove it.
   */
  registerModal(close: () => void): () => void;
  /** Closes the open dialogs, then runs the handler of `command` (if any). */
  run(command: AppCommand): void;
}

/** A registry of the app's commands and of the dialogs they close. */
export function createAppCommands(): AppCommands {
  const handlers = new Map<AppCommand, () => void>();
  const modals = new Set<() => void>();
  return {
    register(command, handler) {
      handlers.set(command, handler);
      return () => {
        if (handlers.get(command) === handler) handlers.delete(command);
      };
    },
    registerModal(close) {
      modals.add(close);
      return () => {
        modals.delete(close);
      };
    },
    run(command) {
      modals.forEach((close) => {
        close();
      });
      handlers.get(command)?.();
    },
  };
}

export const AppCommandsContext = createContext<AppCommands | null>(null);

/** Closes this component's modal dialog before any app command runs (see `registerModal`). */
export function useAppModal(close: () => void): void {
  const commands = useContext(AppCommandsContext);
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(
    () =>
      commands?.registerModal(() => {
        latest.current();
      }),
    [commands],
  );
}

/** Handles `command` while the component is mounted, always with its latest `handler`. */
export function useAppCommand(command: AppCommand, handler: () => void): void {
  const commands = useContext(AppCommandsContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(
    () =>
      commands?.register(command, () => {
        latest.current();
      }),
    [commands, command],
  );
}
