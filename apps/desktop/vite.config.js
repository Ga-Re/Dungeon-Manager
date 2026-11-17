import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two entry points: the DM window and the player window (SPEC 2.1–2.2).
export default defineConfig({
  plugins: [react()],
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
