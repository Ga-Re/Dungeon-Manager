// SPIKE (T-007): throwaway performance spike, not product code. It answers one question for
// ADR-0002: does a 4K video map + fog + 20 tokens in PixiJS reach 60 FPS in the player window
// on the DM's notebook? The real renderer lives in packages/renderer (T-105).
// UI text here is English on purpose: this page is a developer tool, not part of the app UI.
//
// What is measured: intervals between PixiJS ticker frames (WebKit's requestAnimationFrame
// cadence = main-thread work plus compositor back-pressure), not GPU present times. Dropped
// video frames come from the video element's playback quality.

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
import { summarize, verdict, type FrameStats, type Verdict } from "./stats.js";

const WARM_UP_MS = 5_000;
const MEASURE_MS = Number(import.meta.env.VITE_SPIKE_SECONDS ?? "20") * 1000;
const BASELINE_MS = 5_000;
const TOKEN_COUNT = 20;
const VISION_COUNT = 4;

interface Scenario {
  readonly name: string;
  /** Renderer resolution (backing pixels per CSS pixel). */
  readonly resolution: () => number;
  readonly withVideo: boolean;
  readonly withScene: boolean;
}

const native = () => window.devicePixelRatio;
// Full HD: 1080 rendered rows, upscaled to the display (the setting the DM asked for, T-116).
const fullHd = () => 1080 / window.innerHeight;

const SCENARIOS: readonly Scenario[] = [
  {
    name: "video only, native",
    resolution: native,
    withVideo: true,
    withScene: false,
  },
  {
    name: "full scene, native",
    resolution: native,
    withVideo: true,
    withScene: true,
  },
  {
    name: "full scene, Full HD",
    resolution: fullHd,
    withVideo: true,
    withScene: true,
  },
  // Repeated last: a fanless notebook may throttle; compare with the first native run.
  {
    name: "full scene, native (repeat)",
    resolution: native,
    withVideo: true,
    withScene: true,
  },
];

interface ScenarioResult extends FrameStats {
  readonly scenario: string;
  readonly renderedPixels: string;
  readonly droppedVideoFrames: number | null;
  readonly verdict: Verdict;
  readonly warnings: readonly string[];
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

  show("Waiting for the window to settle on the display …");
  await waitForStableWindow();
  const video = await loadVideo(`/spike/${manifest.video}`);

  show("Measuring the display refresh rate …");
  const baseline = await runScenario(
    {
      name: "baseline (empty)",
      resolution: native,
      withVideo: false,
      withScene: false,
    },
    video,
    {
      warmUpMs: 1_000,
      measureMs: BASELINE_MS,
      refreshMs: Number.POSITIVE_INFINITY,
    },
  );
  const refreshMs = baseline.result.p50;
  const refreshHz = 1000 / refreshMs;

  const results: ScenarioResult[] = [];
  for (const [index, scenario] of SCENARIOS.entries()) {
    show(
      `Running ${String(index + 1)}/${String(SCENARIOS.length)}: ${scenario.name} …`,
    );
    const run = await runScenario(scenario, video, {
      warmUpMs: WARM_UP_MS,
      measureMs: MEASURE_MS,
      refreshMs,
    });
    results.push({ ...run.result, verdict: verdict(run.result, refreshHz) });
  }

  const report = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu: baseline.gpu,
    renderer: baseline.renderer,
    window: `${String(window.innerWidth)}×${String(window.innerHeight)} CSS px, devicePixelRatio ${String(window.devicePixelRatio)}`,
    refreshHz: Math.round(refreshHz * 10) / 10,
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

/** The page starts in the hidden window before it is moved fullscreen; wait until that is done. */
async function waitForStableWindow() {
  let last = "";
  let stableSince = performance.now();
  for (;;) {
    const current = `${String(window.innerWidth)}×${String(window.innerHeight)}@${String(window.devicePixelRatio)}`;
    if (current !== last) {
      last = current;
      stableSince = performance.now();
    }
    if (
      document.visibilityState === "visible" &&
      performance.now() - stableSince > 1_500
    )
      return;
    await sleep(100);
  }
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

async function runScenario(
  scenario: Scenario,
  video: HTMLVideoElement,
  timing: { warmUpMs: number; measureMs: number; refreshMs: number },
) {
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
  const windowAtStart = describeWindow();

  const { width, height } = app.screen;
  if (scenario.withVideo) {
    // Map: the video as a texture, scaled to cover the screen.
    const map = new Sprite(Texture.from(video));
    map.scale.set(
      Math.max(width / video.videoWidth, height / video.videoHeight),
    );
    app.stage.addChild(map);
  }

  const tokens: Sprite[] = [];
  const fog = new Graphics();
  if (scenario.withScene) {
    // Tokens: 20 round tokens moving every frame.
    const tokenRadius = height / 30;
    const tokenTexture = app.renderer.generateTexture(
      new Graphics()
        .circle(tokenRadius, tokenRadius, tokenRadius - 3)
        .fill(0x2e86c1)
        .stroke({ width: 4, color: 0xffffff }),
    );
    for (let index = 0; index < TOKEN_COUNT; index++) {
      const token = new Sprite(tokenTexture);
      token.anchor.set(0.5);
      app.stage.addChild(token);
      tokens.push(token);
    }
    // Fog: soft-edged darkness with moving vision holes, rebuilt every frame (worst case).
    // "inherit": blur at the renderer resolution – PixiJS filters default to resolution 1.
    fog.filters = [
      new BlurFilter({ strength: 12, quality: 3, resolution: "inherit" }),
    ];
    app.stage.addChild(fog);
  }

  const intervals: number[] = [];
  let measuring = false;
  let last = performance.now();
  const started = last;
  app.ticker.add(() => {
    const now = performance.now();
    if (measuring) intervals.push(now - last);
    last = now;
    if (!scenario.withScene) return;
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

  await sleep(timing.warmUpMs);
  const droppedBefore = video.getVideoPlaybackQuality().droppedVideoFrames;
  measuring = true;
  await sleep(timing.measureMs);
  measuring = false;
  const droppedAfter = video.getVideoPlaybackQuality().droppedVideoFrames;

  const warnings: string[] = [];
  if (describeWindow() !== windowAtStart) {
    warnings.push(
      `window changed during measurement (${windowAtStart} → ${describeWindow()})`,
    );
  }
  const renderedPixels = `${String(app.canvas.width)}×${String(app.canvas.height)}`;
  if (scenario.resolution === native && renderedPixels !== "3840×2160") {
    warnings.push(
      `native rendered ${renderedPixels}, not 3840×2160 – check the TV's macOS display setting`,
    );
  }

  const info = describeRenderer(app.renderer);
  const result = {
    scenario: scenario.name,
    renderedPixels,
    droppedVideoFrames: scenario.withVideo
      ? droppedAfter - droppedBefore
      : null,
    warnings,
    // A frame missed a refresh when it took clearly longer than one refresh interval.
    ...summarize(intervals, timing.refreshMs * 1.5),
  };
  app.destroy({ removeView: true }, { children: true });
  return { result, ...info };
}

function describeWindow() {
  return `${String(window.innerWidth)}×${String(window.innerHeight)}@${String(window.devicePixelRatio)}`;
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
  refreshHz: number;
  video: string;
  results: ScenarioResult[];
}) {
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  const lines = report.results.map((r) =>
    [
      `${r.scenario} – rendered ${r.renderedPixels}`,
      `  ${r.averageFps.toFixed(1)} FPS · missed refreshes ${r.missedPercent.toFixed(1)} % · dropped video frames ${String(r.droppedVideoFrames ?? "–")}`,
      `  p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · p99 ${ms(r.p99)} · max ${ms(r.max)}`,
      `  60 FPS budget: ${r.verdict.toUpperCase()}`,
      ...r.warnings.map((warning) => `  ! ${warning}`),
    ].join("\n"),
  );
  return [
    `GPU: ${report.gpu} (${report.renderer})`,
    `Window: ${report.window} · display refresh ≈ ${String(report.refreshHz)} Hz`,
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
