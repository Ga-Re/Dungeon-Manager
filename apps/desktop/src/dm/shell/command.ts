import { createContext } from "react";

/**
 * Keeps one ribbon command running at a time (ADR-0020): opening a command cancels the one
 * that was running, as starting another tool does in CAD programs.
 */
export interface CommandRegistry {
  /** Marks a command as running; `cancel` ends it when another starts. Returns its release. */
  claim(cancel: () => void): () => void;
}

/** A registry for one DM window. */
export function createCommandRegistry(): CommandRegistry {
  let running: { readonly cancel: () => void } | null = null;
  return {
    claim(cancel) {
      const previous = running;
      const entry = { cancel };
      running = entry;
      previous?.cancel();
      return () => {
        if (running === entry) running = null;
      };
    },
  };
}

/** `null` outside the shell (component tests): commands then run side by side. */
export const CommandRegistryContext = createContext<CommandRegistry | null>(
  null,
);
