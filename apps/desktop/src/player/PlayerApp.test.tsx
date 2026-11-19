import type { PlayerViewMessage } from "@dungeon-manager/protocol";
import type { MapImage } from "@dungeon-manager/renderer";
import type { ViewerScene } from "@dungeon-manager/schema";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test } from "vitest";
import { fakeMapService } from "../fake-renderer.test-data.js";
import { createI18n } from "@dungeon-manager/ui";
import type { PlayerFeedReceiver } from "../platform/player-feed.js";
import { PlayerApp } from "./PlayerApp.js";
import { memoryStorage } from "../dm/memory-storage.test-data.js";

const revealed = [
  {
    outer: [
      [0, 0],
      [100, 0],
      [100, 100],
    ] as [number, number][],
    holes: [],
  },
];

function sceneWith(path: string): ViewerScene {
  return {
    id: "s",
    name: "Höhle",
    map: {
      kind: "image",
      asset: { path, hash: `sha256:${"a".repeat(64)}` },
      currentLevelId: "ground",
      grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
      levels: [{ id: "ground", name: "Erdgeschoss" }],
    },
    fog: { ground: { revealed, remembered: [] } },
    tokens: [],
  };
}

function fakeFeed() {
  let listener: ((message: PlayerViewMessage) => void) | null = null;
  const feed: PlayerFeedReceiver = {
    subscribe(next) {
      listener = next;
      return Promise.resolve(() => {
        listener = null;
      });
    },
  };
  return {
    feed,
    send: (message: PlayerViewMessage) => listener?.(message),
    subscribed: () => listener !== null,
  };
}

const image = { width: 2000, height: 1000 } as unknown as MapImage;

function renderPlayer(load = () => Promise.resolve(image)) {
  const maps = fakeMapService(load);
  const feed = fakeFeed();
  const storage = memoryStorage();
  const result = render(
    <I18nextProvider i18n={createI18n()}>
      <PlayerApp feed={feed.feed} maps={maps.service} storage={storage} />
    </I18nextProvider>,
  );
  return { maps, feed, storage, ...result };
}

describe("PlayerApp", () => {
  test("has no controls and starts fully covered", async () => {
    const { maps } = renderPlayer();
    expect(screen.getByRole("main", { name: "Spieleransicht" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    await waitFor(() => {
      expect(maps.view.setFog).toHaveBeenCalledWith([]);
    });
    expect(maps.view.setMap).not.toHaveBeenCalled();
  });

  test("shows the map only with its fog, fitted and rotated", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    feed.send({ v: 1, scene: sceneWith("library/maps/a.png"), rotation: 90 });
    await waitFor(() => {
      expect(maps.view.setMap).toHaveBeenCalledWith(image);
    });
    const fogOrder =
      maps.view.setFog.mock.invocationCallOrder.at(-1) ?? Infinity;
    const mapOrder =
      maps.view.setMap.mock.invocationCallOrder.at(-1) ?? -Infinity;
    // Soft edges are on by default: 0.25 of the 100 px cell.
    // The first fog of a scene never fades.
    expect(maps.view.setFog).toHaveBeenLastCalledWith(revealed, {
      softEdge: 25,
      fade: 0,
    });
    expect(fogOrder).toBeLessThan(mapOrder);
    expect(maps.service.loadImage).toHaveBeenCalledWith("library/maps/a.png");
    expect(maps.camera()?.rotation).toBe(90);
  });

  test("removes the old map at once when the scene changes or closes", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    feed.send({ v: 1, scene: sceneWith("library/maps/a.png"), rotation: 0 });
    await waitFor(() => {
      expect(maps.view.setMap).toHaveBeenLastCalledWith(image);
    });
    let finish: (value: MapImage) => void = () => undefined;
    maps.service.loadImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    feed.send({ v: 1, scene: sceneWith("library/maps/b.png"), rotation: 0 });
    expect(maps.view.setMap).toHaveBeenLastCalledWith(null);
    finish(image);
    await waitFor(() => {
      expect(maps.view.setMap).toHaveBeenLastCalledWith(image);
    });

    feed.send({ v: 1, scene: null, rotation: 0 });
    expect(maps.view.setMap).toHaveBeenLastCalledWith(null);
    expect(maps.view.setFog).toHaveBeenLastCalledWith([], {
      softEdge: 0,
      fade: 0,
    });
  });

  test("closing a scene cancels a map that is still loading", async () => {
    let finish: (value: MapImage) => void = () => undefined;
    const { maps, feed } = renderPlayer(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    feed.send({ v: 1, scene: sceneWith("library/maps/a.png"), rotation: 0 });
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenCalled();
    });
    feed.send({ v: 1, scene: null, rotation: 0 });
    finish(image);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maps.view.setMap).not.toHaveBeenCalledWith(image);
    expect(screen.getByRole("main").dataset["showing"]).toBe("none");
  });

  test("a map that cannot be loaded leaves the screen covered", async () => {
    const { maps, feed } = renderPlayer(() => Promise.reject(new Error("404")));
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    feed.send({ v: 1, scene: sceneWith("library/maps/a.png"), rotation: 0 });
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenCalled();
    });
    expect(maps.view.setMap).not.toHaveBeenCalledWith(image);
  });

  test("releases the renderer and stops listening when closed", async () => {
    const { maps, feed, unmount } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    unmount();
    await waitFor(() => {
      expect(maps.view.destroy).toHaveBeenCalled();
    });
    expect(feed.subscribed()).toBe(false);
  });

  test("a video map goes under the canvas after its fog, and is released on change", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    const scene = sceneWith("library/maps/fluss.webm");
    feed.send({
      v: 1,
      scene: { ...scene, map: scene.map && { ...scene.map, kind: "video" } },
      rotation: 0,
    });
    await waitFor(() => {
      expect(maps.view.setVideo).toHaveBeenCalledWith(
        expect.any(HTMLVideoElement),
      );
    });
    const video = maps.view.setVideo.mock.calls.at(-1)?.[0];
    // Soft edges are on by default: 0.25 of the 100 px cell.
    // The first fog of a scene never fades.
    expect(maps.view.setFog).toHaveBeenLastCalledWith(revealed, {
      softEdge: 25,
      fade: 0,
    });
    expect(video?.isConnected).toBe(true);
    expect(screen.getByRole("main").dataset["showing"]).toBe("map");

    feed.send({ v: 1, scene: null, rotation: 0 });
    expect(maps.view.setVideo).toHaveBeenLastCalledWith(null);
    expect(video?.isConnected).toBe(false);
  });

  test("fades fog changes within a scene, never into a new scene", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(maps.view.setFog).toHaveBeenCalled();
    });
    const scene = sceneWith("library/maps/a.png");
    feed.send({ v: 1, scene, rotation: 0 });
    const more = [
      ...revealed,
      {
        ...revealed[0],
        outer: [
          [200, 0],
          [300, 0],
          [300, 100],
        ] as [number, number][],
        holes: [],
      },
    ];
    feed.send({
      v: 1,
      scene: { ...scene, fog: { ground: { revealed: more, remembered: [] } } },
      rotation: 0,
    });
    expect(maps.view.setFog).toHaveBeenLastCalledWith(more, {
      softEdge: 25,
      fade: 650,
    });

    feed.send({ v: 1, scene: { ...scene, id: "other" }, rotation: 0 });
    expect(maps.view.setFog).toHaveBeenLastCalledWith(revealed, {
      softEdge: 25,
      fade: 0,
    });
  });

  test("shows the TV's level: its fog and its own image, without a fade", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    const scene = sceneWith("library/maps/a.png");
    const map = scene.map;
    if (!map) throw new Error("the sample scene has a map");
    const cellar = {
      ...scene,
      map: {
        ...map,
        currentLevelId: "cellar",
        levels: [
          ...map.levels,
          {
            id: "cellar",
            name: "Keller",
            asset: {
              path: "library/maps/cellar.png",
              hash: `sha256:${"b".repeat(64)}`,
            },
          },
        ],
      },
      fog: { ...scene.fog, cellar: { revealed: [], remembered: [] } },
    };
    feed.send({ v: 1, scene, rotation: 0 });
    await waitFor(() => {
      expect(maps.view.setMap).toHaveBeenLastCalledWith(image);
    });
    feed.send({ v: 1, scene: cellar, rotation: 0 });
    expect(maps.view.setFog).toHaveBeenLastCalledWith([], {
      softEdge: 25,
      fade: 0,
    });
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenLastCalledWith(
        "library/maps/cellar.png",
      );
    });
  });

  test("redraws the fog with hard edges when the DM switches soft edges off", async () => {
    const { maps, feed, storage } = renderPlayer();
    await waitFor(() => {
      expect(maps.view.setFog).toHaveBeenCalled();
    });
    feed.send({ v: 1, scene: sceneWith("library/maps/a.png"), rotation: 0 });
    // The first fog of a scene never fades.
    expect(maps.view.setFog).toHaveBeenLastCalledWith(revealed, {
      softEdge: 25,
      fade: 0,
    });

    storage.setItem("dm.fog.softEdges", "off");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "dm.fog.softEdges", newValue: "off" }),
    );

    expect(maps.view.setFog).toHaveBeenLastCalledWith(revealed, {
      softEdge: 0,
      fade: 650,
    });
  });
});
