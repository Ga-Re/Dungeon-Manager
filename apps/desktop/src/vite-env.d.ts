// Vite client types: import.meta.env and side-effect imports such as stylesheets.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Renderer benchmark (T-105d): "1" when started via `pnpm bench`. */
  readonly VITE_BENCH?: string;
  /** Renderer benchmark (T-105d): seconds measured (default 30). */
  readonly VITE_BENCH_SECONDS?: string;
}
