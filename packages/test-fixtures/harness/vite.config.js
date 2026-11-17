// Builds the renderer harness into a classic script for the screenshot pages (T-105a).
// Built on the host before the Docker run, so no native bundler binary runs in the container.
import { join } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  logLevel: "warn",
  build: {
    outDir: join(import.meta.dirname, "..", "pages", "dist"),
    emptyOutDir: true,
    lib: {
      entry: join(import.meta.dirname, "renderer.ts"),
      formats: ["iife"],
      name: "rendererHarness",
      fileName: () => "renderer-harness.js",
    },
  },
});
