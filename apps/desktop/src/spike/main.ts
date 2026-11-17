// SPIKE (T-007): throwaway performance spike, not product code. It answers one question for
// ADR-0002: does a 4K video map + fog + 20 tokens in PixiJS reach 60 FPS in the player window
// on the DM's notebook? The real renderer lives in packages/renderer (T-105).
// UI text here is English on purpose: this page is a developer tool, not part of the app UI.
//
// What is measured: intervals between PixiJS ticker frames (WebKit's requestAnimationFrame
// cadence = main-thread work plus compositor back-pressure), not GPU present times. Dropped
// video frames come from the video element's playback quality.
//
// Run 1 showed the 4K video upload into a WebGL texture as the bottleneck
// (docs/benchmarks/2026-11-17-t007-run1.md), so run 2 compares ways to show the video.

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

/**
 * How the map video reaches the screen:
 * - `texture`: uploaded into a PixiJS texture every video frame (one canvas, everything in PixiJS)
 * - `element`: a plain HTML <video> under a transparent PixiJS canvas, composited by the OS (no upload)
 */
type VideoMode = "texture" | "element";

interface Scenario {
  readonly name: string;
  /** Renderer resolution (backing pixels per CSS pixel). */
  readonly resolution: () => number;
  readonly renderer: "webgl" | "webgpu";
  readonly video: "uhd" | "fhd";
  readonly videoMode: VideoMode;
  readonly withScene: boolean;
}

const native = () => window.devicePixelRatio;
// Full HD: 1080 rendered rows, upscaled to the display (the setting the DM asked for, T-116).
const fullHd = () => 1080 / window.innerHeight;

const SCENARIOS: readonly Scenario[] = [
  {
    name: "A video only · WebGL texture · 4K video",
    resolution: native,
    renderer: "webgl",
    video: "uhd",
    videoMode: "texture",
    withScene: false,
  },
  {
    name: "B full scene · WebGL texture · 4K video",
    resolution: native,
    renderer: "webgl",
    video: "uhd",
    videoMode: "texture",
    withScene: true,
  },
  {
    name: "C full scene · WebGL texture · 1080p video",
    resolution: native,
    renderer: "webgl",
    video: "fhd",
    videoMode: "texture",
    withScene: true,
  },
  {
    name: "D full scene · WebGPU texture · 4K video",
    resolution: native,
    renderer: "webgpu",
    video: "uhd",
    videoMode: "texture",
    withScene: true,
  },
  {
    name: "E full scene · HTML video element · 4K video",
    resolution: native,
    renderer: "webgl",
    video: "uhd",
    videoMode: "element",
    withScene: true,
  },
  {
    name: "F full scene · HTML video element · 4K video · Full HD render",
    resolution: fullHd,
    renderer: "webgl",
    video: "uhd",
    videoMode: "element",
    withScene: true,
  },
  {
    name: "G full scene · WebGL texture · 4K video · Full HD render",
    resolution: fullHd,
    renderer: "webgl",
    video: "uhd",
    videoMode: "texture",
    withScene: true,
  },
  // Repeated last: a fanless notebook may throttle; compare with B.
  {
    name: "H repeat of B",
    resolution: native,
    renderer: "webgl",
    video: "uhd",
    videoMode: "texture",
    withScene: true,
  },
];

interface ScenarioResult extends FrameStats {
  readonly scenario: string;
  readonly renderer: string;
  readonly renderedPixels: string;
  /** Video frames decoded during the measurement; null if WebKit does not report them. */
  readonly totalVideoFrames: number | null;
  readonly droppedVideoFrames: number | null;
  readonly verdict: Verdict | "skipped";
  readonly warnings: readonly string[];
}

interface Manifest {
  readonly uhd: string;
  readonly fhd: string | null;
}

const reportElement = document.getElementById("report");
const show = (text: string) => {
  if (reportElement) reportElement.textContent = text;
};

async function main() {
  const manifest = await fetch("/spike/manifest.json").then((response) =>
    response.ok ? (response.json() as Promise<Partial<Manifest>>) : null,
  );
  if (!manifest?.uhd) {
    show(
      "No test video found.\nRun: pnpm --filter @dungeon-manager/desktop spike:video\nthen start the spike again.",
    );
    return;
  }

  show("Waiting for the window to settle on the display …");
  await waitForStableWindow();
  const sources = {
    uhd: `/spike/${manifest.uhd}`,
    fhd: manifest.fhd ? `/spike/${manifest.fhd}` : null,
  };
  const sizes = {
    uhd: await probeVideoSize(sources.uhd),
    fhd: sources.fhd ? await probeVideoSize(sources.fhd) : null,
  };

  show("Measuring the display refresh rate …");
  const baseline = await runScenario(null, {
    warmUpMs: 1_000,
    measureMs: BASELINE_MS,
    refreshMs: Number.POSITIVE_INFINITY,
  });
  const refreshMs = baseline.result.p50;
  const refreshHz = 1000 / refreshMs;

  const results: ScenarioResult[] = [];
  for (const [index, scenario] of SCENARIOS.entries()) {
    const src = sources[scenario.video];
    const skip = skipReason(scenario, src);
    if (skip) {
      results.push(skipped(scenario, skip));
      continue;
    }
    show(
      `Running ${String(index + 1)}/${String(SCENARIOS.length)}: ${scenario.name} …`,
    );
    const run = await runScenario(
      { scenario, src: src as string },
      { warmUpMs: WARM_UP_MS, measureMs: MEASURE_MS, refreshMs },
    );
    results.push({ ...run.result, verdict: verdict(run.result, refreshHz) });
  }

  const report = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu: baseline.gpu,
    window: `${String(window.innerWidth)}×${String(window.innerHeight)} CSS px, devicePixelRatio ${String(window.devicePixelRatio)}`,
    refreshHz: Math.round(refreshHz * 10) / 10,
    video: `${manifest.uhd} ${sizes.uhd}${sizes.fhd ? `, ${String(manifest.fhd)} ${sizes.fhd}` : ""}`,
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

function skipReason(scenario: Scenario, src: string | null): string | null {
  if (!src) return "no 1080p video (install ffmpeg and run spike:video again)";
  if (
    scenario.resolution === fullHd &&
    Math.round(window.innerHeight * window.devicePixelRatio) <= 1080
  ) {
    return "display already renders 1080 rows – same as native";
  }
  return null;
}

function skipped(scenario: Scenario, reason: string): ScenarioResult {
  return {
    ...summarize([], 1),
    scenario: scenario.name,
    renderer: "–",
    renderedPixels: "–",
    totalVideoFrames: null,
    droppedVideoFrames: null,
    verdict: "skipped",
    warnings: [reason],
  };
}

/** The page starts in the hidden window before it is moved fullscreen; wait until that is done. */
async function waitForStableWindow() {
  let last = "";
  let stableSince = performance.now();
  for (;;) {
    const current = describeWindow();
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

/** Reads a video's resolution and releases it again. */
async function probeVideoSize(src: string): Promise<string> {
  const video = await loadVideo(src);
  const size = `${String(video.videoWidth)}×${String(video.videoHeight)}`;
  releaseVideo(video);
  return size;
}

/**
 * A fresh, muted, looping video element. Every scenario gets its own, so no decoder state or
 * PixiJS video listeners carry over between scenarios.
 */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  Object.assign(video, {
    src,
    muted: true,
    loop: true,
    playsInline: true,
    preload: "auto",
  });
  video.className = "map-video";
  return new Promise((resolve, reject) => {
    video.addEventListener(
      "canplay",
      () => {
        resolve(video);
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

/** Stops decoding and frees the element's media resources. */
function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.remove();
}

/** Runs one scenario; `null` measures an empty stage (display refresh baseline). */
async function runScenario(
  setup: { scenario: Scenario; src: string } | null,
  timing: { warmUpMs: number; measureMs: number; refreshMs: number },
) {
  const scenario = setup?.scenario;
  const video = setup ? await loadVideo(setup.src) : undefined;
  const app = new Application();
  await app.init({
    resizeTo: window,
    resolution: scenario ? scenario.resolution() : native(),
    autoDensity: true,
    antialias: false,
    background: "#000000",
    // Transparent when the video element sits underneath the canvas.
    backgroundAlpha: scenario?.videoMode === "element" ? 0 : 1,
    preference: scenario?.renderer ?? "webgl",
  });
  app.canvas.classList.add("stage");
  document.body.prepend(app.canvas);
  const windowAtStart = describeWindow();

  if (video) await video.play();
  const { width, height } = app.screen;
  // Uncached (second argument): a cached texture would stay attached to the element.
  const videoTexture =
    video && scenario?.videoMode === "texture"
      ? Texture.from(video, true)
      : null;
  if (video && videoTexture) {
    // Map: the video as a texture, scaled to cover the screen.
    const map = new Sprite(videoTexture);
    map.scale.set(
      Math.max(width / video.videoWidth, height / video.videoHeight),
    );
    app.stage.addChild(map);
  }
  if (video && scenario?.videoMode === "element") document.body.prepend(video);

  const tokens: Sprite[] = [];
  const fog = new Graphics();
  if (scenario?.withScene) {
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
    if (!scenario?.withScene) return;
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
  const qualityBefore = video?.getVideoPlaybackQuality();
  measuring = true;
  await sleep(timing.measureMs);
  measuring = false;
  const qualityAfter = video?.getVideoPlaybackQuality();
  const totalVideoFrames =
    qualityBefore && qualityAfter
      ? qualityAfter.totalVideoFrames - qualityBefore.totalVideoFrames
      : 0;
  // WebKit may not count frames for file playback; 0 decoded frames means "not reported".
  const countsReported = totalVideoFrames > 0;

  const warnings: string[] = [];
  if (describeWindow() !== windowAtStart) {
    warnings.push(
      `window changed during measurement (${windowAtStart} → ${describeWindow()})`,
    );
  }
  const renderedPixels = `${String(app.canvas.width)}×${String(app.canvas.height)}`;
  if (scenario?.resolution === native && renderedPixels !== "3840×2160") {
    warnings.push(
      `native rendered ${renderedPixels}, not 3840×2160 – check the TV's macOS display setting`,
    );
  }
  if (scenario && scenario.renderer !== app.renderer.name) {
    warnings.push(
      `${scenario.renderer} unavailable, fell back to ${app.renderer.name}`,
    );
  }

  const info = { renderer: app.renderer.name, gpu: describeGpu(app.renderer) };
  const result = {
    scenario: scenario?.name ?? "baseline",
    renderer: info.renderer,
    renderedPixels,
    totalVideoFrames: countsReported ? totalVideoFrames : null,
    droppedVideoFrames:
      countsReported && qualityBefore && qualityAfter
        ? qualityAfter.droppedVideoFrames - qualityBefore.droppedVideoFrames
        : null,
    warnings,
    // A frame missed a refresh when it took clearly longer than one refresh interval.
    ...summarize(intervals, timing.refreshMs * 1.5),
  };
  app.destroy({ removeView: true }, { children: true });
  videoTexture?.destroy(true);
  if (video) releaseVideo(video);
  return { result, ...info };
}

function describeWindow() {
  return `${String(window.innerWidth)}×${String(window.innerHeight)}@${String(window.devicePixelRatio)}`;
}

function describeGpu(renderer: Renderer) {
  if (!("gl" in renderer)) return "unknown (WebGPU)";
  const gl = renderer.gl;
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
}

function formatReport(report: {
  gpu: string;
  window: string;
  refreshHz: number;
  video: string;
  results: ScenarioResult[];
}) {
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  const lines = report.results.map((r) =>
    r.verdict === "skipped"
      ? `${r.scenario}\n  skipped: ${r.warnings.join("; ")}`
      : [
          `${r.scenario} – ${r.renderer}, rendered ${r.renderedPixels}`,
          `  ${r.averageFps.toFixed(1)} FPS · missed refreshes ${r.missedPercent.toFixed(1)} % · video frames ${r.totalVideoFrames === null ? "n/a" : `${String(r.totalVideoFrames)} decoded, ${String(r.droppedVideoFrames)} dropped`}`,
          `  p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · p99 ${ms(r.p99)} · max ${ms(r.max)} · 60 FPS budget: ${r.verdict.toUpperCase()}`,
          ...r.warnings.map((warning) => `  ! ${warning}`),
        ].join("\n"),
  );
  return [
    `GPU: ${report.gpu}`,
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
