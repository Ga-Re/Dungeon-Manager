// SPIKE (T-007): dev-server endpoint that receives the spike report, prints it in the terminal
// and stores it as JSON in apps/desktop/spike-results/ (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @returns {import("vite").Plugin} */
export function spikeResults() {
  const outDir = join(import.meta.dirname, "..", "spike-results");
  return {
    name: "spike-results",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__spike/results", (request, response) => {
        let body = "";
        request.on("data", (chunk) => (body += String(chunk)));
        request.on("end", () => {
          mkdirSync(outDir, { recursive: true });
          const file = join(
            outDir,
            `${new Date().toISOString().replaceAll(":", "-")}.json`,
          );
          const pretty = JSON.stringify(JSON.parse(body), null, 2);
          writeFileSync(file, pretty + "\n");
          console.log(
            `\n===== SPIKE RESULTS (copy everything up to END) =====\n${pretty}\n===== END (saved to ${file}) =====\n`,
          );
          response.end("ok");
        });
      });
    },
  };
}
