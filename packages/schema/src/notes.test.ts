import { describe, expect, it } from "vitest";
import {
  campaignSchema,
  notePathSchema,
  sceneSchema,
  sessionSchema,
} from "./index.js";

describe("note links (T-161)", () => {
  it.each([
    "wiki/NSCs/Strahd.md",
    "notes/sessions/s-1.md",
    "Orte/Burg Ravenloft.md",
    "Über die Krypta.md",
  ])("accepts %j relative to the campaign folder", (path) => {
    expect(notePathSchema.safeParse(path).success).toBe(true);
  });

  it.each([
    ["an absolute path", "/etc/passwd.md"],
    ["a parent folder", "../other/x.md"],
    ["a parent folder inside", "wiki/../../x.md"],
    ["a backslash", "wiki\\x.md"],
    ["a drive letter", "C:/x.md"],
    ["no Markdown file", "wiki/x.txt"],
    ["an empty segment", "wiki//x.md"],
    ["a dot segment", "./x.md"],
    ["a tool folder", ".obsidian/workspace.md"],
    ["a Windows device name", "nul.md"],
    ["a device name as a folder", "con/x.md"],
    ["a trailing space", "Orte /x.md"],
    ["a trailing dot", "a./x.md"],
    ["a forbidden character", "x?.md"],
  ])("rejects %s", (_case, path) => {
    expect(notePathSchema.safeParse(path).success).toBe(false);
  });

  it("is an optional list on campaign, session and scene files", () => {
    const campaign = {
      schemaVersion: 2,
      id: "c",
      name: "Mine",
      players: [],
      visibilityDefaults: {},
    };
    const scene = {
      schemaVersion: 3,
      id: "s",
      name: "Höhle",
      map: null,
      tokens: [],
      fog: { levels: {} },
      initiative: null,
    };
    const session = { schemaVersion: 2, id: "x", name: "S", sceneIds: [] };
    for (const [schema, doc] of [
      [campaignSchema, campaign],
      [sceneSchema, scene],
      [sessionSchema, session],
    ] as const) {
      expect(schema.safeParse(doc).success).toBe(true);
      expect(schema.safeParse({ ...doc, notes: ["wiki/a.md"] }).success).toBe(
        true,
      );
      expect(schema.safeParse({ ...doc, notes: ["../a.md"] }).success).toBe(
        false,
      );
    }
  });
});
