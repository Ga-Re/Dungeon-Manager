// Renderer benchmark (T-105d, ARCHITECTURE §11): the real renderer draws the benchmark scene –
// a 4K video map, soft fog with holes, 20 tokens, a camera that never stands still – in the
// player window on the TV, while the DM window is open. It records the intervals between frames
// and the video's dropped frames, shows the verdict on the TV and reports it to the dev server
// (`bench/vite-plugin-bench-results.js`). Developer tool: its text is English on purpose.
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

const WARM_UP_MS = 5_000;
const MEASURE_MS = Number(import.meta.env.VITE_BENCH_SECONDS ?? "30") * 1000;
/** Idle frames first: the display's own refresh interval, to judge missed refreshes. */
const REFRESH_SAMPLE_MS = 2_000;

const report = document.querySelector<HTMLPreElement>("#report");
const stage = document.querySelector<HTMLDivElement>("#stage");
const say = (text: string) => {
  if (report) report.textContent = text;
};

const viewSize = (): Size => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/** Intervals between animation frames for `ms`, calling `onFrame` with the time since start. */
function recordFrames(
  ms: number,
  onFrame: (elapsed: number) => void = () => undefined,
): Promise<number[]> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let start: number | null = null;
    let last: number | null = null;
    const step = (now: number) => {
      start ??= now;
      if (last !== null) intervals.push(now - last);
      last = now;
      onFrame(now - start);
      if (now - start < ms) requestAnimationFrame(step);
      else resolve(intervals);
    };
    requestAnimationFrame(step);
  });
}

const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 16.7;

/** The 4K video map made by `pnpm bench:video`; `null` without one (the scene runs without it). */
async function loadVideo(): Promise<HTMLVideoElement | null> {
  const response = await fetch("/bench/manifest.json").catch(() => null);
  if (!response?.ok) return null;
  const manifest = (await response.json()) as { uhd?: string };
  if (!manifest.uhd) return null;
  const video = document.createElement("video");
  video.src = `/bench/${manifest.uhd}`;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  await video.play();
  return video;
}

interface BenchReport {
  readonly refreshHz: number;
  readonly view: Size;
  readonly devicePixelRatio: number;
  readonly video: boolean;
  readonly frames: FrameStats;
  readonly droppedVideoFrames: number | null;
  readonly verdict: string;
}

async function main() {
  if (!stage) throw new Error("#stage is missing in bench.html");
  say("Measuring the display's refresh rate …");
  const refreshMs = median(await recordFrames(REFRESH_SAMPLE_MS));
  const refreshHz = 1000 / refreshMs;

  const canvas = document.createElement("canvas");
  stage.appendChild(canvas);
  const renderer = await createRenderer({
    canvas,
    size: viewSize(),
    resolution: window.devicePixelRatio,
  });
  window.addEventListener("resize", () => {
    renderer.resize(viewSize());
  });
  const video = await loadVideo();
  renderer.setFog(benchFog(), { opacity: 1, softEdge: BENCH_SOFT_EDGE });
  if (video) {
    canvas.before(video);
    renderer.setVideo(video);
  }
  renderer.setTokens(benchTokens());

  const moveCamera = (elapsed: number) => {
    renderer.setCamera(benchCamera(elapsed, viewSize()));
  };
  say(`Warming up (${String(WARM_UP_MS / 1000)} s) …`);
  await recordFrames(WARM_UP_MS, moveCamera);
  say(`Measuring (${String(MEASURE_MS / 1000)} s) – don't touch the windows …`);
  const before = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;
  const intervals = await recordFrames(MEASURE_MS, (elapsed) => {
    moveCamera(WARM_UP_MS + elapsed);
  });
  const after = video?.getVideoPlaybackQuality().droppedVideoFrames ?? null;

  // A frame later than 1.5 refresh intervals missed at least one refresh.
  const frames = summarize(intervals, refreshMs * 1.5);
  const result: BenchReport = {
    refreshHz,
    view: viewSize(),
    devicePixelRatio: window.devicePixelRatio,
    video: video !== null,
    frames,
    droppedVideoFrames:
      before === null || after === null ? null : after - before,
    verdict: verdict(frames, refreshHz),
  };
  say(
    [
      `Budget: ${String(TARGET_FPS)} FPS, at most ${String(MAX_MISSED_PERCENT)} % missed refreshes`,
      `Verdict: ${result.verdict}`,
      `Display: ${refreshHz.toFixed(1)} Hz, ${String(result.view.width)}×${String(result.view.height)} @${String(result.devicePixelRatio)}x`,
      `Video map: ${result.video ? "4K video" : "none (run pnpm bench:video)"}`,
      `Frames: ${String(frames.frames)}, ${frames.averageFps.toFixed(1)} FPS average`,
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
