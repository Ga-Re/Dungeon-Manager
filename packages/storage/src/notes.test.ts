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
