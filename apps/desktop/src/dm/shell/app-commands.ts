import { createContext, useContext, useEffect, useRef } from "react";
import type { AppCommand } from "../../platform/app-menu.js";

/**
 * Who handles the app menu's commands (T-130d): the part of the DM window that owns the state
 * registers a handler; the native menu bar or the title bar's menu button runs it.
 */
export interface AppCommands {
  /** Registers `handler` for `command`; returns a function that removes it again. */
  register(command: AppCommand, handler: () => void): () => void;
  /** Runs the handler of `command`; nothing happens without one. */
  run(command: AppCommand): void;
}

/** A registry where the latest handler for a command wins. */
export function createAppCommands(): AppCommands {
  const handlers = new Map<AppCommand, () => void>();
  return {
    register(command, handler) {
      handlers.set(command, handler);
      return () => {
        if (handlers.get(command) === handler) handlers.delete(command);
      };
    },
    run(command) {
      handlers.get(command)?.();
    },
  };
}

export const AppCommandsContext = createContext<AppCommands | null>(null);

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
