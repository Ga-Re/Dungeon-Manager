// Smoke test for the real desktop app (T-006): start it via tauri-driver, open the player
// view from the DM window and check that both windows exist.
//
// Linux/Windows only – tauri-driver has no macOS support. Needs a debug build
// (`pnpm --filter @dungeon-manager/desktop build:app`), `tauri-driver` on PATH and, on Linux,
// WebKitWebDriver plus a display (CI uses xvfb-run). Run with `pnpm --filter @dungeon-manager/desktop smoke`.
//
// Speaks the W3C WebDriver protocol directly with fetch instead of pulling in a WebDriver client library.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DRIVER_URL = "http://127.0.0.1:4444";
// W3C WebDriver identifier under which element references are returned.
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const binaryName =
  process.platform === "win32"
    ? "dungeon-manager-desktop.exe"
    : "dungeon-manager-desktop";
const application = join(
  import.meta.dirname,
  "..",
  "src-tauri",
  "target",
  "debug",
  binaryName,
);

/** Sends a WebDriver command and returns its `value`, throwing on WebDriver errors. */
async function command(method, path, body) {
  const response = await fetch(`${DRIVER_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const { value } = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path} failed: ${JSON.stringify(value)}`);
  return value;
}

/** Retries `check` until it returns a truthy value or the timeout expires. */
async function waitFor(description, check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`,
  );
}

async function findElement(sessionPath, selector) {
  const element = await command("POST", `${sessionPath}/element`, {
    using: "css selector",
    value: selector,
  });
  return element[ELEMENT_KEY];
}

async function main() {
  if (!existsSync(application)) {
    throw new Error(
      `App binary not found at ${application}. Build it first: pnpm --filter @dungeon-manager/desktop build:app`,
    );
  }

  const driver = spawn("tauri-driver", [], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  driver.on("error", (error) => {
    console.error(`Could not start tauri-driver: ${error.message}`);
    process.exit(1);
  });

  let sessionPath;
  try {
    await waitFor(
      "tauri-driver",
      async () => (await fetch(`${DRIVER_URL}/status`)).ok,
    );
    const session = await command("POST", "/session", {
      capabilities: { alwaysMatch: { "tauri:options": { application } } },
    });
    sessionPath = `/session/${session.sessionId}`;

    const button = await waitFor("the open-player-view button", () =>
      findElement(sessionPath, "#open-player-view"),
    );
    await command("POST", `${sessionPath}/element/${button}/click`, {});

    const handles = await waitFor("the player window", async () => {
      const current = await command("GET", `${sessionPath}/window/handles`);
      return current.length === 2 ? current : undefined;
    });
    const dmHandle = await command("GET", `${sessionPath}/window`);
    const playerHandle = handles.find((handle) => handle !== dmHandle);
    await command("POST", `${sessionPath}/window`, { handle: playerHandle });
    await waitFor("the player view content", () =>
      findElement(sessionPath, "#player-view"),
    );

    console.log("Smoke test passed: DM window and player window are running.");
  } catch (error) {
    // Show what the window displayed, so CI failures can be diagnosed from the log.
    if (sessionPath) {
      const text = await command("POST", `${sessionPath}/execute/sync`, {
        script: "return document.title + ' | ' + document.body.textContent;",
        args: [],
      }).catch((reason) => `(could not read page: ${reason.message})`);
      console.error(`Window content: ${text}`);
    }
    throw error;
  } finally {
    if (sessionPath)
      await command("DELETE", sessionPath).catch(() => undefined);
    driver.kill();
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
