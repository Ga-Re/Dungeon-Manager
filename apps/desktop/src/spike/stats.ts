// SPIKE (T-007): throwaway measurement code, not product code. Replaced by the renderer benchmark (T-105).

/** Summary of recorded frame intervals in milliseconds. */
export interface FrameStats {
  readonly frames: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly averageFps: number;
  /** Frames that took longer than `jankThresholdMs` (visible stutter). */
  readonly janks: number;
}

/** Nearest-rank percentile of an ascending list; `rank` in (0, 100]. */
export function percentile(sorted: readonly number[], rank: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? Number.NaN;
}

/** Summarises frame intervals (ms between consecutive frames). */
export function summarize(
  intervals: readonly number[],
  jankThresholdMs = 25,
): FrameStats {
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, value) => sum + value, 0);
  return {
    frames: intervals.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? Number.NaN,
    averageFps: total > 0 ? (intervals.length * 1000) / total : Number.NaN,
    janks: intervals.filter((value) => value > jankThresholdMs).length,
  };
}
