// Smoke test for the real desktop app (T-006, T-103b): start it via tauri-driver, open the
// player view from the DM window and check that both windows exist; check that the player
// window cannot call library commands; open a temporary library and check that a campaign
// written from outside the app shows up while it runs.
//
// Linux/Windows only – tauri-driver has no macOS support. Needs a debug build
// (`pnpm --filter @dungeon-manager/desktop build:app`), `tauri-driver` on PATH and, on Linux,
// WebKitWebDriver plus a display (CI uses xvfb-run). Run with `pnpm --filter @dungeon-manager/desktop smoke`.
//
// Speaks the W3C WebDriver protocol directly with fetch instead of pulling in a WebDriver client library.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

async function findElement(sessionPath, selector, using = "css selector") {
  const element = await command("POST", `${sessionPath}/element`, {
    using,
    value: selector,
  });
  return element[ELEMENT_KEY];
}

/** Waits for the element `xpath` points to and clicks it. */
async function clickXPath(sessionPath, description, xpath) {
  const element = await waitFor(description, () =>
    findElement(sessionPath, xpath, "xpath"),
  );
  await command("POST", `${sessionPath}/element/${element}/click`, {});
}

async function main() {
  if (!existsSync(application)) {
    throw new Error(
      `App binary not found at ${application}. Build it first: pnpm --filter @dungeon-manager/desktop build:app`,
    );
  }

  // Debug builds open this folder instead of the saved library (see commands.rs).
  const library = mkdtempSync(join(tmpdir(), "dm-smoke-library-"));
  const driver = spawn("tauri-driver", [], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, DUNGEON_MANAGER_LIBRARY: library },
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

    // The player window has no capability: library commands must be refused there.
    const playerAccess = await command("POST", `${sessionPath}/execute/async`, {
      script: `const done = arguments[arguments.length - 1];
        window.__TAURI_INTERNALS__.invoke("library_read", { path: "campaigns" })
          .then(() => done("allowed"), (error) => done("refused: " + String(error)));`,
      args: [],
    });
    if (!String(playerAccess).startsWith("refused"))
      throw new Error(`Player window could call library_read: ${playerAccess}`);

    await command("POST", `${sessionPath}/window`, { handle: dmHandle });
    const pageText = () =>
      command("POST", `${sessionPath}/execute/sync`, {
        script: "return document.body.textContent;",
        args: [],
      });
    await waitFor("the empty library", async () =>
      (await pageText()).includes("Noch keine Kampagnen"),
    );
    if (!existsSync(join(library, "library", "maps")))
      throw new Error("The library layout was not created.");

    mkdirSync(join(library, "campaigns", "smoke"));
    writeFileSync(
      join(library, "campaigns", "smoke", "campaign.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "smoke",
        name: "Smoke-Kampagne",
        players: [],
        visibilityDefaults: {},
      }),
    );
    await waitFor("the campaign written from outside", async () =>
      (await pageText()).includes("Smoke-Kampagne"),
    );

    // Creating a scene through the UI goes through the real Rust write path.
    await clickXPath(
      sessionPath,
      "the campaign button",
      "//button[text()='Smoke-Kampagne']",
    );
    const sceneName = await waitFor("the scene name field", () =>
      findElement(
        sessionPath,
        "//label[text()='Name der neuen Szene']/following-sibling::input",
        "xpath",
      ),
    );
    await command("POST", `${sessionPath}/element/${sceneName}/value`, {
      text: "Smoke-Szene",
    });
    await clickXPath(
      sessionPath,
      "the create-scene button",
      "//button[text()='Szene anlegen']",
    );
    await clickXPath(
      sessionPath,
      "the new scene",
      "//button[text()='Smoke-Szene']",
    );
    await waitFor("the opened scene", async () =>
      (await pageText()).includes("Geöffnete Szene: Smoke-Szene"),
    );
    const scenes = readdirSync(join(library, "campaigns", "smoke", "scenes"));
    if (scenes.length !== 1 || !scenes[0].endsWith(".json"))
      throw new Error(`Unexpected scene files: ${scenes.join(", ")}`);

    // Deleting goes through the real trash command: the file moves, nothing is removed.
    await clickXPath(
      sessionPath,
      "the delete button",
      "//button[text()='Szene löschen …']",
    );
    await clickXPath(
      sessionPath,
      "the delete confirmation",
      "//button[text()='Ja, löschen']",
    );
    await waitFor("the deleted scene to leave the list", async () =>
      (await pageText()).includes("Noch keine Szenen in dieser Kampagne."),
    );
    const trash = readdirSync(join(library, "campaigns", "smoke", ".trash"));
    if (trash.length !== 1 || !trash[0].endsWith(scenes[0]))
      throw new Error(`Unexpected trash content: ${trash.join(", ")}`);

    // Reading files must not count as a change: on Linux, inotify reports opens and reads, and
    // a reload reacting to them would read again, forever. A quiet library sends no events.
    const eventsWhileIdle = await command(
      "POST",
      `${sessionPath}/execute/async`,
      {
        script: `const done = arguments[arguments.length - 1];
        const internals = window.__TAURI_INTERNALS__;
        let count = 0;
        const handler = internals.transformCallback(() => { count++; });
        internals.invoke("plugin:event|listen", { event: "library-changed", target: { kind: "Any" }, handler })
          .then(() => setTimeout(() => done(count), 2000), (error) => done("listen failed: " + String(error)));`,
        args: [],
      },
    );
    if (eventsWhileIdle !== 0)
      throw new Error(
        `Idle library sent change events: ${String(eventsWhileIdle)}`,
      );

    console.log(
      "Smoke test passed: both windows run, the player window has no file access, and library changes are picked up.",
    );
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
    rmSync(library, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exit(1);
});
