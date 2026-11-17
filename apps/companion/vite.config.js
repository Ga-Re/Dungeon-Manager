import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The companion is a static web app the desktop backend serves on the LAN (ADR-0007).
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the build works under whatever path the desktop backend mounts it.
  base: "./",
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
