import type { Session } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  createScene,
  createSession,
  deleteScene,
  deleteSession,
  listSessions,
  loadSession,
  saveSession,
} from "./index.js";

const session: Session = {
  schemaVersion: 1,
  id: "s-1",
  name: "Session 1",
  sceneIds: ["a", "b"],
};

describe("session files (T-160)", () => {
  test("round-trip as pretty JSON in the campaign's sessions folder", async () => {
    const fs = createMemoryFileSystem();
    await saveSession(fs, "mine", session);
    expect(fs.files().get("campaigns/mine/sessions/s-1.json")).toBe(
      `${JSON.stringify(session, null, 2)}\n`,
    );
    expect(await loadSession(fs, "mine", "s-1")).toEqual({
      status: "ok",
      value: session,
    });
  });

  test("report missing, broken and unsafe files instead of throwing", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/sessions/bad.json": "{",
    });
    expect(await loadSession(fs, "mine", "nope")).toEqual({
      status: "missing",
    });
    expect(await loadSession(fs, "mine", "bad")).toEqual({
      status: "invalid",
      reason: "json",
    });
    expect(await loadSession(fs, "mine", "../x")).toEqual({
      status: "invalid",
      reason: "path",
    });
    await expect(
      saveSession(fs, "mine", { ...session, id: "con" }),
    ).rejects.toThrow(/Invalid session id/);
  });

  test("are listed by id, skipping conflict copies and other files", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/sessions/b.json": JSON.stringify({ ...session, id: "b" }),
      "campaigns/mine/sessions/a.json": JSON.stringify({ ...session, id: "a" }),
      "campaigns/mine/sessions/a (conflicted copy).json": "{}",
      "campaigns/mine/sessions/notes.txt": "x",
    });
    const listed = await listSessions(fs, "mine");
    expect(listed.sessionIds).toEqual(["a", "b"]);
    expect(listed.conflicts.map((conflict) => conflict.copy)).toEqual([
      "a (conflicted copy).json",
    ]);
    expect(await listSessions(createMemoryFileSystem(), "mine")).toEqual({
      sessionIds: [],
      conflicts: [],
    });
  });

  test("createSession saves an empty session with a trimmed name and an optional date", async () => {
    const fs = createMemoryFileSystem();
    const created = await createSession(fs, "mine", {
      id: "s-2",
      name: "  Session 2 ",
      date: "2026-12-05",
    });
    expect(created).toEqual({
      schemaVersion: 1,
      id: "s-2",
      name: "Session 2",
      date: "2026-12-05",
      sceneIds: [],
    });
    expect(await loadSession(fs, "mine", "s-2")).toEqual({
      status: "ok",
      value: created,
    });
    await expect(
      createSession(fs, "mine", { id: "s-3", name: " " }),
    ).rejects.toThrow(/name/);
  });

  test("deleteSession moves only the session file to the trash, not its scenes", async () => {
    const fs = createMemoryFileSystem();
    await createScene(fs, "mine", { id: "a", name: "Krypta" });
    await saveSession(fs, "mine", session);
    const trashed = await deleteSession(fs, "mine", "s-1");
    expect(trashed).toMatch(
      /^campaigns\/mine\/\.trash\/[^/]+\/sessions\/s-1\.json$/,
    );
    expect(fs.files().has("campaigns/mine/scenes/a.json")).toBe(true);
  });

  test("deleting a scene removes it from every session that lists it", async () => {
    const fs = createMemoryFileSystem();
    await createScene(fs, "mine", { id: "a", name: "Krypta" });
    await saveSession(fs, "mine", session);
    await saveSession(fs, "mine", {
      ...session,
      id: "s-2",
      sceneIds: ["b", "a"],
    });
    await saveSession(fs, "mine", { ...session, id: "s-3", sceneIds: ["b"] });
    const before = fs.files().get("campaigns/mine/sessions/s-3.json");

    await deleteScene(fs, "mine", "a");

    const ids = async (id: string) => {
      const loaded = await loadSession(fs, "mine", id);
      return loaded.status === "ok" ? loaded.value.sceneIds : null;
    };
    expect(await ids("s-1")).toEqual(["b"]);
    expect(await ids("s-2")).toEqual(["b"]);
    // Sessions without the scene are not rewritten (no needless sync traffic).
    expect(fs.files().get("campaigns/mine/sessions/s-3.json")).toBe(before);
  });

  test("deleting a scene leaves unreadable, renamed and conflicting sessions as they are", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/sessions/broken.json": "{",
      "campaigns/mine/sessions/future.json": JSON.stringify({
        ...session,
        id: "future",
        schemaVersion: 99,
      }),
      // Renamed by hand: the file name no longer matches the id inside.
      "campaigns/mine/sessions/renamed.json": JSON.stringify({
        ...session,
        id: "s-1",
      }),
      "campaigns/mine/sessions/s-1.json": JSON.stringify({
        ...session,
        sceneIds: ["b"],
      }),
      "campaigns/mine/sessions/s-2 (conflicted copy).json": JSON.stringify({
        ...session,
        id: "s-2",
      }),
    });
    await createScene(fs, "mine", { id: "a", name: "Krypta" });
    const before = new Map(fs.files());

    await deleteScene(fs, "mine", "a");

    for (const name of [
      "broken.json",
      "future.json",
      "renamed.json",
      "s-1.json",
      "s-2 (conflicted copy).json",
    ]) {
      const path = `campaigns/mine/sessions/${name}`;
      expect(fs.files().get(path)).toBe(before.get(path));
    }
  });

  test("deleting a scene keeps unknown session fields and still succeeds when a session cannot be written", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/sessions/s-1.json": JSON.stringify({
        ...session,
        mood: "düster",
      }),
    });
    await createScene(fs, "mine", { id: "a", name: "Krypta" });
    await deleteScene(fs, "mine", "a");
    expect(await loadSession(fs, "mine", "s-1")).toEqual({
      status: "ok",
      value: { ...session, sceneIds: ["b"], mood: "düster" },
    });

    await createScene(fs, "mine", { id: "b", name: "Gruft" });
    fs.writeAtomic = () => Promise.reject(new Error("Datenträger voll"));
    await expect(deleteScene(fs, "mine", "b")).resolves.toMatch(/\.trash/);
  });

  test("deleteSession rejects an unsafe id", async () => {
    await expect(
      deleteSession(createMemoryFileSystem(), "mine", "../x"),
    ).rejects.toThrow(/Invalid session id/);
  });
});
