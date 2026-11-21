// Renderer benchmark (T-105d, ARCHITECTURE §11): the real renderer draws the benchmark scene –
// a 4K video map, soft fog with holes, 20 tokens, a camera that never stands still – in the
// player window on the TV, while the DM window is open. Developer tool: its text is English on
// purpose.
//
// What is measured: the intervals between animation frames (WebKit's requestAnimationFrame
// cadence – main-thread work plus compositor back-pressure), not GPU completion; and the video's
// dropped frames. The renderer draws on demand in its own animation frame: each frame here moves
// the camera, the renderer draws it in the next one, so every frame draws (one frame behind).
// The spike (T-007, docs/benchmarks) took its intervals inside PixiJS's ticker instead; the
// cadence is the same.
import { createRenderer, type Size } from "@dungeon-manager/renderer";
import {
  BENCH_SOFT_EDGE,
  MAX_MISSED_PERCENT,
  TARGET_FPS,
  benchCamera,
  benchFog,
  benchTokens,
  summarize,
  verdict,
  type FrameStats,
} from "@dungeon-manager/test-fixtures";
import { releaseVideo } from "../platform/map-images.js";
import { createTauriMapViewService } from "../platform/tauri-map-images.js";

const WARM_UP_MS = 5_000;
const MEASURE_MS = Number(import.meta.env.VITE_BENCH_SECONDS ?? "30") * 1000;
/** Idle frames first: the display's own refresh interval, to judge missed refreshes. */
const REFRESH_SAMPLE_MS = 2_000;
/** The window counts as settled once it is visible and unchanged this long. */
const STABLE_MS = 1_500;
/** The video map, from the library like any map (the app's content policy allows only that). */
const VIDEO_PATH =
  import.meta.env.VITE_BENCH_VIDEO ?? "library/maps/bench-4k.mp4";
/** The budget is for a 4K picture; a smaller one is noted in the report. */
const TARGET_BACKING = { width: 3840, height: 2160 };
/** At most this many times of missed frames are listed (to relate hitches to the camera or loop). */
const MISSED_LISTED = 50;

const report = document.querySelector<HTMLPreElement>("#report");
const stage = document.querySelector<HTMLDivElement>("#stage");
const say = (text: string) => {
  if (report) report.textContent = text;
};

const viewSize = (): Size => ({
  width: window.innerWidth,
  height: window.innerHeight,
});
const describeWindow = () =>
  `${String(window.innerWidth)}×${String(window.innerHeight)}@${String(window.devicePixelRatio)}`;
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Waits until the window is visible and its size has settled: the player window starts hidden,
 * is moved to the TV and made fullscreen (tauri-displays.ts) – sampling before that would measure
 * the wrong display.
 */
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
      performance.now() - stableSince > STABLE_MS
    )
      return;
    await sleep(100);
  }
}

/** Intervals between animation frames for `ms`; `onFrame` gets the time since the start. */
function recordFrames(
  ms: number,
  onFrame: (elapsed: number) => void = () => undefined,
): Promise<{ intervals: number[]; at: number[] }> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    const at: number[] = [];
    let start: number | null = null;
    let last: number | null = null;
    const step = (now: number) => {
      start ??= now;
      if (last !== null) {
        intervals.push(now - last);
        at.push(now - start);
      }
      last = now;
      onFrame(now - start);
      if (now - start < ms) requestAnimationFrame(step);
      else resolve({ intervals, at });
    };
    requestAnimationFrame(step);
  });
}

const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 16.7;

/** The GPU's name, from the renderer's WebGL context (asking for the same type returns it). */
function describeGpu(canvas: HTMLCanvasElement): string {
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return "unknown";
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return String(
    gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
  );
}

interface BenchReport {
  readonly date: string;
  readonly userAgent: string;
  readonly gpu: string;
  readonly window: string;
  readonly canvas: string;
  readonly refreshHz: number;
  readonly measureSeconds: number;
  /** The video map's resolution, or why there was none. */
  readonly video: string;
  readonly frames: FrameStats;
  /** When the first missed frames came, in ms into the measurement. */
  readonly missedAtMs: readonly number[];
  readonly droppedVideoFrames: number | null;
  readonly warnings: readonly string[];
  readonly verdict: string;
}

async function main() {
  if (!stage) throw new Error("#stage is missing in bench.html");
  say("Waiting for the player window to settle on the TV …");
  await waitForStableWindow();
  say("Measuring the display's refresh rate …");
  const refreshMs = median((await recordFrames(REFRESH_SAMPLE_MS)).intervals);
  const refreshHz = 1000 / refreshMs;

  const canvas = document.createElement("canvas");
  stage.appendChild(canvas);
  const renderer = await createRenderer({
    canvas,
    size: viewSize(),
    resolution: window.devicePixelRatio,
  });
  const onResize = () => {
    renderer.resize(viewSize());
  };
  window.addEventListener("resize", onResize);
  // Fog first, then the video (ADR-0010: never a map without its fog).
  renderer.setFog(benchFog(), { opacity: 1, softEdge: BENCH_SOFT_EDGE });
  renderer.setTokens(benchTokens());
  let video: HTMLVideoElement | null = null;
  let videoNote: string;
  try {
    video = await createTauriMapViewService().loadVideo(VIDEO_PATH);
    canvas.before(video);
    renderer.setVideo(video);
    videoNote = `${String(video.videoWidth)}×${String(video.videoHeight)} (${VIDEO_PATH})`;
  } catch (error) {
    videoNote = `none – ${VIDEO_PATH} could not be played (${String(error)}); see README "Renderer benchmark"`;
  }

  const moveCamera = (elapsed: number) => {
    renderer.setCamera(benchCamera(elapsed, viewSize()));
  };
  say(`Warming up (${String(WARM_UP_MS / 1000)} s) …`);
  await recordFrames(WARM_UP_MS, moveCamera);
  say(`Measuring (${String(MEASURE_MS / 1000)} s) – don't touch the windows …`);
  const windowBefore = describeWindow();
  const before = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;
  const { intervals, at } = await recordFrames(MEASURE_MS, (elapsed) => {
    moveCamera(WARM_UP_MS + elapsed);
  });
  const after = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;
  const windowAfter = describeWindow();

  // A frame later than 1.5 refresh intervals missed at least one refresh.
  const threshold = refreshMs * 1.5;
  const frames = summarize(intervals, threshold);
  const warnings: string[] = [];
  if (windowAfter !== windowBefore)
    warnings.push(
      `The window changed during the measurement (${windowBefore} → ${windowAfter}).`,
    );
  if (
    canvas.width !== TARGET_BACKING.width ||
    canvas.height !== TARGET_BACKING.height
  )
    warnings.push(
      `The picture is ${String(canvas.width)}×${String(canvas.height)}, not 3840×2160: the budget is for 4K.`,
    );
  if (!video)
    warnings.push("No video map: only fog, tokens and camera were measured.");
  const result: BenchReport = {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu: describeGpu(canvas),
    window: windowAfter,
    canvas: `${String(canvas.width)}×${String(canvas.height)}`,
    refreshHz,
    measureSeconds: MEASURE_MS / 1000,
    video: videoNote,
    frames,
    missedAtMs: at
      .filter((_, index) => (intervals[index] ?? 0) > threshold)
      .slice(0, MISSED_LISTED)
      .map((ms) => Math.round(ms)),
    droppedVideoFrames:
      before === null || after === null ? null : after - before,
    warnings,
    verdict: verdict(frames, refreshHz),
  };
  // Measured: stop decoding while the DM reads the result.
  releaseVideo(video);
  window.removeEventListener("resize", onResize);
  say(
    [
      `Budget: ${String(TARGET_FPS)} FPS, at most ${String(MAX_MISSED_PERCENT)} % missed refreshes`,
      `Verdict: ${result.verdict}`,
      ...warnings.map((warning) => `Warning: ${warning}`),
      `Display: ${refreshHz.toFixed(1)} Hz, window ${result.window}, picture ${result.canvas}`,
      `GPU: ${result.gpu}`,
      `Video map: ${result.video}`,
      `Frames: ${String(frames.frames)} in ${String(result.measureSeconds)} s, ${frames.averageFps.toFixed(1)} FPS average`,
      `Intervals ms: p50 ${frames.p50.toFixed(1)}, p95 ${frames.p95.toFixed(1)}, p99 ${frames.p99.toFixed(1)}, max ${frames.max.toFixed(1)}`,
      `Missed refreshes: ${String(frames.missed)} (${frames.missedPercent.toFixed(2)} %)`,
      `Dropped video frames: ${result.droppedVideoFrames === null ? "–" : String(result.droppedVideoFrames)}`,
      "Saved by the dev server in apps/desktop/bench-results/.",
    ].join("\n"),
  );
  await fetch("/__bench/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  }).catch(() => undefined);
}

main().catch((error: unknown) => {
  say(`The benchmark failed: ${String(error)}`);
});
