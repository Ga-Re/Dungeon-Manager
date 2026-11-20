import type { Creature } from "@dungeon-manager/schema";
import { describe, expect, test } from "vitest";
import {
  createMemoryFileSystem,
  ensureLibraryLayout,
  listCharacters,
  listCreatures,
  loadCharacter,
  loadCreature,
  saveCharacter,
  saveCreature,
} from "./index.js";

// Creature files (T-180a, ADR-0018): global ones in folders under `library/creatures/`, player
// characters per campaign under `campaigns/<slug>/characters/`.

const creature = (id: string, name = id): Creature => ({
  schemaVersion: 1,
  id,
  name,
  size: "medium",
  look: { style: "round" },
});

describe("library creatures", () => {
  test("live in folders the DM makes, one file per creature, and round-trip", async () => {
    const fs = createMemoryFileSystem();
    await ensureLibraryLayout(fs);
    await saveCreature(fs, "untote/klein", creature("ghul", "Ghul"));
    await saveCreature(fs, "", creature("fass", "Fass"));
    expect(fs.files().has("library/creatures/untote/klein/ghul.json")).toBe(
      true,
    );
    expect(fs.files().has("library/creatures/fass.json")).toBe(true);
    expect(await loadCreature(fs, "untote/klein", "ghul")).toEqual({
      status: "ok",
      value: creature("ghul", "Ghul"),
    });
    expect((await listCreatures(fs)).creatures).toEqual([
      { id: "fass", folder: "" },
      { id: "ghul", folder: "untote/klein" },
    ]);
  });

  test("report an id found in two folders instead of picking one silently", async () => {
    const fs = createMemoryFileSystem();
    await saveCreature(fs, "a", creature("ghul"));
    await saveCreature(fs, "b", creature("ghul"));
    const listed = await listCreatures(fs);
    expect(listed.creatures).toEqual([{ id: "ghul", folder: "a" }]);
    expect(listed.duplicates).toEqual([{ id: "ghul", folder: "b" }]);
  });

  test("skip hidden folders, other files and conflict copies", async () => {
    const fs = createMemoryFileSystem({
      "library/creatures/.trash/alt.json": "{}",
      "library/creatures/ghul.webp": "png",
      "library/creatures/notizen.md": "# x",
    });
    await saveCreature(fs, "", creature("ghul"));
    await fs.writeAtomic(
      "library/creatures/ghul (1).json",
      JSON.stringify(creature("ghul")),
    );
    const listed = await listCreatures(fs);
    expect(listed.creatures).toEqual([{ id: "ghul", folder: "" }]);
    expect(listed.conflicts.map((each) => each.copy)).toEqual([
      "ghul (1).json",
    ]);
  });

  test("refuse unsafe folders and ids", async () => {
    const fs = createMemoryFileSystem();
    for (const folder of ["../x", "a//b", ".versteckt", "a\\b", "/abs"])
      await expect(
        saveCreature(fs, folder, creature("ghul")),
      ).rejects.toThrow();
    await expect(saveCreature(fs, "", creature("NUL"))).rejects.toThrow();
    expect(await loadCreature(fs, "../x", "ghul")).toEqual({
      status: "invalid",
      reason: "path",
    });
  });

  test("a file whose id does not match its name is invalid", async () => {
    const fs = createMemoryFileSystem({
      "library/creatures/ghul.json": JSON.stringify(creature("wolf")),
    });
    expect(await loadCreature(fs, "", "ghul")).toEqual({
      status: "invalid",
      reason: "schema",
    });
  });

  test("an empty or missing creatures folder lists nothing", async () => {
    expect(await listCreatures(createMemoryFileSystem())).toEqual({
      creatures: [],
      duplicates: [],
      conflicts: [],
    });
  });
});

describe("player characters", () => {
  test("are creatures of the campaign, linked to a player", async () => {
    const fs = createMemoryFileSystem();
    const hero = { ...creature("mira", "Mira"), playerId: "anna" };
    await saveCharacter(fs, "mine", hero);
    expect(fs.files().has("campaigns/mine/characters/mira.json")).toBe(true);
    expect(await loadCharacter(fs, "mine", "mira")).toEqual({
      status: "ok",
      value: hero,
    });
    expect(await listCharacters(fs, "mine")).toEqual({
      characterIds: ["mira"],
      conflicts: [],
    });
    expect(await loadCharacter(fs, "mine", "fehlt")).toEqual({
      status: "missing",
    });
  });
});
