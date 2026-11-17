// Vite client types: import.meta.env and side-effect imports such as stylesheets.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SPIKE (T-007): "1" when started via `pnpm spike:desktop`. */
  readonly VITE_SPIKE?: string;
  /** SPIKE (T-007): seconds measured per scenario (default 20). */
  readonly VITE_SPIKE_SECONDS?: string;
}
