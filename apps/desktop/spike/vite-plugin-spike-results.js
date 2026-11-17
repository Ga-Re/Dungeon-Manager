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
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        let body = "";
        request.on("data", (chunk) => (body += String(chunk)));
        request.on("end", () => {
          let pretty;
          try {
            pretty = JSON.stringify(JSON.parse(body), null, 2);
          } catch {
            response.statusCode = 400;
            response.end("invalid JSON");
            return;
          }
          mkdirSync(outDir, { recursive: true });
          const file = join(
            outDir,
            `${new Date().toISOString().replaceAll(":", "-")}.json`,
          );
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
