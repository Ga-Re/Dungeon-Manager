import { describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  forgetCampaign,
  readRecent,
  recentIn,
  recordCampaign,
  recordScene,
  recordTabs,
  saveRecent,
  type RecentCampaign,
} from "./recent-campaigns.js";
import { memoryStorage } from "./memory-storage.test-data.js";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 19, 12, minute));

const krypta: RecentCampaign = {
  root: "/lib",
  slug: "krypta",
  name: "Fluch der Krypta",
  sceneId: null,
  sceneName: null,
  openedAt: at(0).toISOString(),
};

describe("recent campaigns", () => {
  it("puts an opened campaign first and keeps its last scene", () => {
    let list = recordCampaign(
      [],
      { root: "/lib", slug: "mine", name: "Mine" },
      at(0),
    );
    list = recordScene(
      list,
      { root: "/lib", slug: "mine" },
      { id: "s1", name: "Stollen" },
      at(1),
    );
    list = recordCampaign(
      list,
      { root: "/lib", slug: "krypta", name: "Krypta" },
      at(2),
    );
    list = recordCampaign(
      list,
      { root: "/lib", slug: "mine", name: "Die Mine" },
      at(3),
    );
    expect(list.map((each) => each.slug)).toEqual(["mine", "krypta"]);
    expect(list[0]).toMatchObject({
      name: "Die Mine",
      sceneId: "s1",
      sceneName: "Stollen",
      openedAt: at(3).toISOString(),
    });
  });

  it("records a scene only for a campaign in the list", () => {
    const list = recordScene(
      [krypta],
      { root: "/other", slug: "krypta" },
      { id: "s", name: "S" },
      at(5),
    );
    expect(list).toEqual([krypta]);
  });

  it("keeps the same slug in another library apart", () => {
    const list = recordCampaign(
      [krypta],
      { root: "/other", slug: "krypta", name: "Andere" },
      at(1),
    );
    expect(list).toHaveLength(2);
    expect(recentIn(list, "/lib")).toEqual([krypta]);
    expect(recentIn(list, "/other").map((each) => each.name)).toEqual([
      "Andere",
    ]);
  });

  it(`keeps at most ${String(MAX_RECENT)} campaigns`, () => {
    let list: RecentCampaign[] = [];
    for (let index = 0; index < MAX_RECENT + 3; index++)
      list = recordCampaign(
        list,
        { root: "/lib", slug: `c${String(index)}`, name: "C" },
        at(index),
      );
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]?.slug).toBe(`c${String(MAX_RECENT + 2)}`);
  });

  it("forgets a campaign", () => {
    expect(forgetCampaign([krypta], { root: "/lib", slug: "krypta" })).toEqual(
      [],
    );
  });

  it("survives a restart and skips unreadable entries", () => {
    const storage = memoryStorage();
    saveRecent(storage, [krypta]);
    expect(readRecent(storage)).toEqual([krypta]);
    const broken = memoryStorage({
      "dm.recentCampaigns": JSON.stringify([krypta, { slug: 3 }, null]),
    });
    expect(readRecent(broken)).toEqual([krypta]);
  });

  it("reads nothing from missing, malformed or failing storage", () => {
    expect(readRecent(undefined)).toEqual([]);
    expect(readRecent(memoryStorage({ "dm.recentCampaigns": "{" }))).toEqual(
      [],
    );
    expect(readRecent(memoryStorage({ "dm.recentCampaigns": "{}" }))).toEqual(
      [],
    );
    const failing = memoryStorage();
    failing.getItem = () => {
      throw new Error("denied");
    };
    failing.setItem = () => {
      throw new Error("denied");
    };
    expect(readRecent(failing)).toEqual([]);
    expect(() => {
      saveRecent(failing, [krypta]);
    }).not.toThrow();
  });

  it("remembers the open scene tabs and keeps them when the campaign opens again (T-114a)", () => {
    let list = recordTabs(
      [krypta],
      { root: "/lib", slug: "krypta" },
      { open: ["a", "b"], active: "b", tv: null },
      at(1),
    );
    expect(list[0]).toMatchObject({
      openSceneIds: ["a", "b"],
      activeSceneId: "b",
    });
    list = recordCampaign(
      list,
      { root: "/lib", slug: "krypta", name: "Krypta" },
      at(2),
    );
    expect(list[0]).toMatchObject({
      openSceneIds: ["a", "b"],
      activeSceneId: "b",
    });
    // Stored and read back; an entry from before (no tabs) still reads.
    const storage = memoryStorage();
    saveRecent(storage, [...list, { ...krypta, slug: "alt" }]);
    expect(readRecent(storage)).toHaveLength(2);
    expect(readRecent(storage)[0]?.openSceneIds).toEqual(["a", "b"]);
  });

  it("skips entries whose tabs are not a list of ids", () => {
    const storage = memoryStorage({
      "dm.recentCampaigns": JSON.stringify([
        { ...krypta, openSceneIds: "a" },
        { ...krypta, slug: "b", openSceneIds: [1] },
        { ...krypta, slug: "c", activeSceneId: 3 },
      ]),
    });
    expect(readRecent(storage)).toEqual([]);
  });
});
