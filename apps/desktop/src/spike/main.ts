// SPIKE (T-007): throwaway performance spike, not product code. It answers one question for
// ADR-0002: does a 4K video map + fog + 20 tokens in PixiJS reach 60 FPS in the player window
// on the DM's notebook? The real renderer lives in packages/renderer (T-105).
// UI text here is English on purpose: this page is a developer tool, not part of the app UI.

// Our CSP forbids eval; this PixiJS module replaces its runtime code generation.
import "pixi.js/unsafe-eval";
import {
  Application,
  BlurFilter,
  Graphics,
  Sprite,
  Texture,
  type Renderer,
} from "pixi.js";
import { summarize, type FrameStats } from "./stats.js";

const WARM_UP_MS = 5_000;
const MEASURE_MS = Number(import.meta.env["VITE_SPIKE_SECONDS"] ?? "30") * 1000;
const TOKEN_COUNT = 20;
const VISION_COUNT = 4;

interface Scenario {
  readonly name: string;
  /** Renderer resolution (backing pixels per CSS pixel). */
  readonly resolution: () => number;
}

// The two render resolutions the DM wants to choose between in the settings.
const SCENARIOS: readonly Scenario[] = [
  { name: "native (TV resolution)", resolution: () => window.devicePixelRatio },
  {
    name: "Full HD (1080p, upscaled)",
    resolution: () => 1080 / window.innerHeight,
  },
];

interface ScenarioResult extends FrameStats {
  readonly scenario: string;
  readonly renderedPixels: string;
  readonly droppedVideoFrames: number | null;
}

const reportElement = document.getElementById("report");
const show = (text: string) => {
  if (reportElement) reportElement.textContent = text;
};

async function main() {
  const manifest = await fetch("/spike/manifest.json").then((response) =>
    response.ok ? (response.json() as Promise<{ video: string }>) : null,
  );
  if (!manifest) {
    show(
      "No test video found.\nRun: pnpm --filter @dungeon-manager/desktop spike:video\nthen start the spike again.",
    );
    return;
  }

  const video = await loadVideo(`/spike/${manifest.video}`);
  const results: ScenarioResult[] = [];
  let gpu = "unknown";
  let rendererName = "unknown";
  for (const scenario of SCENARIOS) {
    show(
      `Running: ${scenario.name} …\n(${String((WARM_UP_MS + MEASURE_MS) / 1000)} s)`,
    );
    const run = await runScenario(scenario, video);
    results.push(run.result);
    gpu = run.gpu;
    rendererName = run.renderer;
  }

  const report = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu,
    renderer: rendererName,
    window: `${String(window.innerWidth)}×${String(window.innerHeight)} CSS px, devicePixelRatio ${String(window.devicePixelRatio)}`,
    video: `${manifest.video}, ${String(video.videoWidth)}×${String(video.videoHeight)}`,
    tokens: TOKEN_COUNT,
    measureSeconds: MEASURE_MS / 1000,
    results,
  };
  show(formatReport(report));
  await fetch("/__spike/results", {
    method: "POST",
    body: JSON.stringify(report),
  }).catch(() => undefined);
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  Object.assign(video, {
    src,
    muted: true,
    loop: true,
    playsInline: true,
    autoplay: true,
    preload: "auto",
  });
  return new Promise((resolve, reject) => {
    video.addEventListener(
      "canplay",
      () => {
        void video.play().then(() => {
          resolve(video);
        }, reject);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        reject(new Error(`Cannot load ${src}`));
      },
      { once: true },
    );
  });
}

async function runScenario(scenario: Scenario, video: HTMLVideoElement) {
  const app = new Application();
  await app.init({
    resizeTo: window,
    resolution: scenario.resolution(),
    autoDensity: true,
    antialias: false,
    background: "#000000",
    preference: "webgl",
  });
  document.body.prepend(app.canvas);

  const { width, height } = app.screen;
  // Map: the video as a texture, scaled to cover the screen.
  const map = new Sprite(Texture.from(video));
  const cover = Math.max(width / video.videoWidth, height / video.videoHeight);
  map.scale.set(cover);
  app.stage.addChild(map);

  // Tokens: 20 round tokens moving every frame.
  const tokenRadius = height / 30;
  const tokenTexture = app.renderer.generateTexture(
    new Graphics()
      .circle(tokenRadius, tokenRadius, tokenRadius - 3)
      .fill(0x2e86c1)
      .stroke({ width: 4, color: 0xffffff }),
  );
  const tokens = Array.from({ length: TOKEN_COUNT }, () => {
    const token = new Sprite(tokenTexture);
    token.anchor.set(0.5);
    app.stage.addChild(token);
    return token;
  });

  // Fog: a soft-edged darkness layer with moving vision holes, rebuilt every frame (worst case).
  const fog = new Graphics();
  fog.filters = [new BlurFilter({ strength: 12, quality: 3 })];
  app.stage.addChild(fog);

  const intervals: number[] = [];
  let measuring = false;
  let last = performance.now();
  const started = last;
  app.ticker.add(() => {
    const now = performance.now();
    if (measuring) intervals.push(now - last);
    last = now;
    const t = (now - started) / 1000;
    tokens.forEach((token, index) => {
      const phase = (index / TOKEN_COUNT) * Math.PI * 2;
      token.position.set(
        width / 2 + Math.cos(t * 0.7 + phase) * width * 0.35,
        height / 2 + Math.sin(t * 1.1 + phase * 2) * height * 0.35,
      );
    });
    fog
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x000000, alpha: 0.92 });
    for (let index = 0; index < VISION_COUNT; index++) {
      const anchor = tokens[index * 5];
      if (anchor) fog.circle(anchor.x, anchor.y, height / 6).cut();
    }
  });

  await sleep(WARM_UP_MS);
  const droppedBefore = video.getVideoPlaybackQuality().droppedVideoFrames;
  measuring = true;
  await sleep(MEASURE_MS);
  measuring = false;
  const droppedAfter = video.getVideoPlaybackQuality().droppedVideoFrames;

  const info = describeRenderer(app.renderer);
  const result: ScenarioResult = {
    scenario: scenario.name,
    renderedPixels: `${String(app.canvas.width)}×${String(app.canvas.height)}`,
    droppedVideoFrames: droppedAfter - droppedBefore,
    ...summarize(intervals),
  };
  app.destroy({ removeView: true }, { children: true });
  return { result, ...info };
}

function describeRenderer(renderer: Renderer) {
  if (!("gl" in renderer))
    return { renderer: renderer.name, gpu: "unknown (WebGPU)" };
  const gl = renderer.gl;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
  return { renderer: renderer.name, gpu };
}

function formatReport(report: {
  gpu: string;
  renderer: string;
  window: string;
  video: string;
  results: ScenarioResult[];
}) {
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  const lines = report.results.map(
    (r) =>
      `${r.scenario} – rendered ${r.renderedPixels}\n` +
      `  p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · p99 ${ms(r.p99)} · max ${ms(r.max)}\n` +
      `  ${r.averageFps.toFixed(1)} FPS · ${String(r.janks)} janks (>25 ms) · ${String(r.droppedVideoFrames ?? "?")} dropped video frames\n` +
      `  budget p95 ≤ 16.7 ms: ${r.p95 <= 16.7 ? "MET" : "NOT MET"}`,
  );
  return [
    `GPU: ${report.gpu} (${report.renderer})`,
    `Window: ${report.window}`,
    `Video: ${report.video}`,
    "",
    ...lines,
    "",
    "Results were also printed in the terminal.",
  ].join("\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  show(
    `Spike failed: ${error instanceof Error ? error.message : String(error)}`,
  );
});
