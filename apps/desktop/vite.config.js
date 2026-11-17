import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { spikeResults } from "./spike/vite-plugin-spike-results.js";

// SPIKE (T-007): `pnpm spike:desktop` sets VITE_SPIKE=1 to serve the performance spike.
const spike = process.env["VITE_SPIKE"] === "1";

// Two entry points: the DM window and the player window (SPEC 2.1–2.2).
export default defineConfig({
  plugins: [react(), ...(spike ? [spikeResults()] : [])],
  // The spike's test video is served only in spike mode, so it never ends up in an app build.
  publicDir: spike ? "spike-assets" : false,
  // Tauri expects a fixed port and shows its own errors (tauri.conf.json → build.devUrl).
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        dm: join(import.meta.dirname, "dm.html"),
        player: join(import.meta.dirname, "player.html"),
      },
    },
  },
});
