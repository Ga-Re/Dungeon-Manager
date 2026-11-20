import type { Session } from "@dungeon-manager/schema";
import { describe, expect, it } from "vitest";
import { linkedNotes } from "./file-name.js";
import { addScene, moveScene, removeScene } from "./session-ops.js";
import { noteNodeId, parseTreeId, sceneNodeId } from "./tree-ids.js";

const session: Session = {
  schemaVersion: 2,
  id: "s",
  name: "Session 1",
  sceneIds: ["a", "b", "c"],
  extra: "kept",
};

describe("session scene list", () => {
  it("appends a scene once and keeps unknown fields", () => {
    expect(addScene(session, "d").sceneIds).toEqual(["a", "b", "c", "d"]);
    expect(addScene(session, "b")).toBe(session);
    expect(addScene(session, "d")["extra"]).toBe("kept");
  });

  it("removes a scene", () => {
    expect(removeScene(session, "b").sceneIds).toEqual(["a", "c"]);
  });

  it("moves a scene up and down, not past the ends", () => {
    expect(moveScene(session, "b", -1).sceneIds).toEqual(["b", "a", "c"]);
    expect(moveScene(session, "b", 1).sceneIds).toEqual(["a", "c", "b"]);
    expect(moveScene(session, "a", -1)).toBe(session);
    expect(moveScene(session, "c", 1)).toBe(session);
    expect(moveScene(session, "x", 1)).toBe(session);
  });
});

describe("tree ids", () => {
  it("round-trip a scene in a session and without one", () => {
    expect(parseTreeId(sceneNodeId({ sessionId: "s-1" }, "krypta"))).toEqual({
      kind: "scene",
      slot: { sessionId: "s-1" },
      sceneId: "krypta",
    });
    expect(parseTreeId(sceneNodeId("unsorted", "krypta"))).toEqual({
      kind: "scene",
      slot: "unsorted",
      sceneId: "krypta",
    });
  });

  it("tells sessions, maps, players, groups and the rest apart", () => {
    expect(parseTreeId("session:s-1")).toEqual({
      kind: "session",
      sessionId: "s-1",
    });
    expect(parseTreeId("map:library/maps/a.webp")).toEqual({
      kind: "map",
      path: "library/maps/a.webp",
    });
    expect(parseTreeId("player:p")).toEqual({ kind: "player", playerId: "p" });
    expect(parseTreeId("group:notes")).toEqual({
      kind: "group",
      id: "group:notes",
    });
    expect(parseTreeId("campaign")).toEqual({ kind: "campaign" });
    expect(parseTreeId("content:fog")).toEqual({ kind: "other" });
    expect(parseTreeId("missing:s-1/x")).toEqual({
      kind: "missing",
      sessionId: "s-1",
      sceneId: "x",
    });
  });
});

describe("note ids (T-161b)", () => {
  it("round-trip the owner and the path, also with folders and colons in names", () => {
    for (const owner of [
      { kind: "campaign" } as const,
      { kind: "session", id: "s-1" } as const,
      { kind: "scene", id: "krypta" } as const,
    ]) {
      const path = "wiki/Orte: Burg/Strahd.md";
      expect(parseTreeId(noteNodeId(owner, path))).toEqual({
        kind: "note",
        owner,
        path,
      });
    }
  });
});

describe("linked notes", () => {
  it("lists each link once and never the own note", () => {
    expect(
      linkedNotes(
        [
          "wiki/a.md",
          "notes/scenes/x.md",
          "wiki/a.md",
          "U\u0308ber.md",
          "Über.md",
        ],
        "notes/scenes/x.md",
      ),
    ).toEqual(["wiki/a.md", "U\u0308ber.md"]);
  });
});
