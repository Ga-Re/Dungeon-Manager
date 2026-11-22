import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  createNote,
  linkNote,
  listNoteOwners,
  noteFile,
  readNote,
  unlinkNote,
} from "./index.js";

describe("note files (T-161)", () => {
  test("have fixed places in the campaign folder", () => {
    expect(noteFile("mine", { kind: "campaign" })).toBe(
      "campaigns/mine/notes/campaign.md",
    );
    expect(noteFile("mine", { kind: "session", id: "s-1" })).toBe(
      "campaigns/mine/notes/sessions/s-1.md",
    );
    expect(noteFile("mine", { kind: "scene", id: "krypta" })).toBe(
      "campaigns/mine/notes/scenes/krypta.md",
    );
    expect(() => noteFile("mine", { kind: "scene", id: "../x" })).toThrow();
    expect(() => noteFile("../x", { kind: "campaign" })).toThrow();
  });

  test("are read by their path relative to the campaign folder", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/wiki/Strahd.md": "---\nrole: villain\n---\n# Strahd\n",
    });
    expect(await readNote(fs, "mine", "wiki/Strahd.md")).toEqual({
      status: "ok",
      text: "---\nrole: villain\n---\n# Strahd\n",
    });
    expect(await readNote(fs, "mine", "wiki/none.md")).toEqual({
      status: "missing",
    });
    expect(await readNote(fs, "mine", "../other/x.md")).toEqual({
      status: "invalid",
    });
  });

  test("createNote starts a missing note with its title and never overwrites", async () => {
    const fs = createMemoryFileSystem();
    expect(
      await createNote(fs, "mine", "notes/scenes/krypta.md", "Krypta"),
    ).toBe(true);
    expect(fs.files().get("campaigns/mine/notes/scenes/krypta.md")).toBe(
      "# Krypta\n",
    );
    await fs.writeAtomic(
      "campaigns/mine/notes/scenes/krypta.md",
      "Mein Text\n",
    );
    expect(
      await createNote(fs, "mine", "notes/scenes/krypta.md", "Krypta"),
    ).toBe(false);
    expect(fs.files().get("campaigns/mine/notes/scenes/krypta.md")).toBe(
      "Mein Text\n",
    );
    await expect(createNote(fs, "mine", "../x.md", "X")).rejects.toThrow(
      /note path/,
    );
  });

  test("links and unlinks notes on any document with a notes list", () => {
    const scene: { id: string; extra: number; notes?: string[] } = {
      id: "s",
      extra: 1,
    };
    const linked = linkNote(scene, "wiki/Strahd.md");
    expect(linked).toEqual({ id: "s", extra: 1, notes: ["wiki/Strahd.md"] });
    expect(linkNote(linked, "wiki/Strahd.md")).toBe(linked);
    expect(unlinkNote(linked, "wiki/Strahd.md")).toEqual({
      id: "s",
      extra: 1,
    });
    expect(() => linkNote(scene, "../x.md")).toThrow(/note path/);
    // Decomposed umlauts (macOS file names) are the same link.
    const nfc = linkNote(scene, "Über.md");
    expect(linkNote(nfc, "U\u0308ber.md")).toBe(nfc);
    expect(unlinkNote(nfc, "U\u0308ber.md")).toEqual({ id: "s", extra: 1 });
  });

  test("lists the sessions and scenes that have a note file", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/sessions/s-1.md": "x",
      "campaigns/mine/notes/sessions/readme.txt": "x",
      "campaigns/mine/notes/scenes/krypta.md": "x",
      "campaigns/mine/notes/scenes/Not an id!.md": "x",
    });
    expect(await listNoteOwners(fs, "mine")).toEqual({
      sessions: ["s-1"],
      scenes: ["krypta"],
    });
    expect(await listNoteOwners(createMemoryFileSystem(), "mine")).toEqual({
      sessions: [],
      scenes: [],
    });
  });
});

describe("own notes under version 1 names with capitals (T-234)", () => {
  test("are listed under their lowercase id", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/scenes/Turm.md": "x",
      "campaigns/mine/notes/sessions/Abend.md": "x",
    });
    expect(await listNoteOwners(fs, "mine")).toEqual({
      sessions: ["abend"],
      scenes: ["turm"],
    });
  });

  test("are read ignoring case and moved to the lowercase name", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/scenes/Turm.md": "# Turm",
    });
    expect(await readNote(fs, "mine", "notes/scenes/turm.md")).toEqual({
      status: "ok",
      text: "# Turm",
    });
    const files = [...fs.files().keys()];
    expect(files).toContain("campaigns/mine/notes/scenes/turm.md");
    expect(files).not.toContain("campaigns/mine/notes/scenes/Turm.md");
  });

  test("a linked note keeps its exact name: only own notes are looked up ignoring case", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/Orte/Turm.md": "x",
    });
    expect(await readNote(fs, "mine", "notes/Orte/turm.md")).toEqual({
      status: "missing",
    });
  });

  test("starting the own note keeps and moves the old one instead of shadowing it", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/scenes/Turm.md": "# Turm\nAlter Text",
    });
    expect(await createNote(fs, "mine", "notes/scenes/turm.md", "Turm")).toBe(
      false,
    );
    expect(await readNote(fs, "mine", "notes/scenes/turm.md")).toEqual({
      status: "ok",
      text: "# Turm\nAlter Text",
    });
  });

  test("never overwrites a lowercase note that exists, and still reads when the trash fails", async () => {
    const fs = createMemoryFileSystem({
      "campaigns/mine/notes/sessions/Abend.md": "alt",
    });
    fs.moveToTrash = () => Promise.reject(new Error("denied"));
    expect(await readNote(fs, "mine", "notes/sessions/abend.md")).toEqual({
      status: "ok",
      text: "alt",
    });
    // Written to the lowercase name although the old one could not go to the trash.
    expect(fs.files().get("campaigns/mine/notes/sessions/abend.md")).toBe(
      "alt",
    );
  });
});
