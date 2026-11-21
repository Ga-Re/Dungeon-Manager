import { beforeEach, expect, test, vi } from "vitest";

// The backend's session marker (T-238): one command, no arguments, a boolean back.
const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));

const { tauriPreviousSessionCrashed } = await import("./tauri-session.js");

beforeEach(() => {
  tauri.invoke.mockReset();
});

test("asks the backend whether the last session ended cleanly", async () => {
  tauri.invoke.mockResolvedValue(true);
  await expect(tauriPreviousSessionCrashed()).resolves.toBe(true);
  expect(tauri.invoke).toHaveBeenCalledWith("session_previous_crashed");
});
