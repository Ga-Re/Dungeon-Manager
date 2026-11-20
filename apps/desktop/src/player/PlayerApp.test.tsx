import type { PlayerViewMessage } from "@dungeon-manager/protocol";
import type { MapImage } from "@dungeon-manager/renderer";
import type { ViewerScene } from "@dungeon-manager/schema";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, test, vi } from "vitest";
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

  test("on a calibrated TV, one cell has the DM's size; a check square shows to measure (T-106a/d)", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    const square = document.querySelector<HTMLElement>(".player-check-square");
    // Black until asked: no square before the first message.
    expect(square?.hidden).toBe(true);
    const scene = sceneWith("library/maps/a.png");
    feed.send({ v: 1, scene, rotation: 0, checkSquarePx: 720 });
    await waitFor(() => {
      expect(square?.hidden).toBe(false);
    });
    expect(square?.style.width).toBe("720px");

    feed.send({
      v: 1,
      scene,
      rotation: 0,
      scale: { inchPx: 80, cellInches: 1 },
    });
    await waitFor(() => {
      // 80 pixels per inch (devicePixelRatio 1 in tests) over cells of 100 map pixels.
      expect(maps.camera()?.zoom).toBeCloseTo(0.8);
    });
    expect(square?.hidden).toBe(true);

    // Cells of 2 inches (the DM's setting): twice as large.
    feed.send({
      v: 1,
      scene,
      rotation: 0,
      scale: { inchPx: 80, cellInches: 2 },
    });
    await waitFor(() => {
      expect(maps.camera()?.zoom).toBeCloseTo(1.6);
    });

    // Two device pixels per CSS pixel: the same inch and square are half as many CSS pixels.
    vi.stubGlobal("devicePixelRatio", 2);
    feed.send({
      v: 1,
      scene,
      rotation: 0,
      scale: { inchPx: 80, cellInches: 1 },
      checkSquarePx: 720,
    });
    await waitFor(() => {
      expect(maps.camera()?.zoom).toBeCloseTo(0.4);
    });
    expect(square?.style.width).toBe("360px");
    vi.unstubAllGlobals();

    // Without a calibration the whole map fits again.
    feed.send({ v: 1, scene, rotation: 0 });
    await waitFor(() => {
      expect(maps.camera()?.zoom).not.toBeCloseTo(0.8);
    });
    expect(square?.hidden).toBe(true);
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

  test("loads a level's own image as an image, also on a video map", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    const scene = sceneWith("library/maps/burg.webm");
    const map = scene.map;
    if (!map) throw new Error("the sample scene has a map");
    feed.send({
      v: 1,
      scene: {
        ...scene,
        map: {
          ...map,
          kind: "video",
          currentLevelId: "cellar",
          levels: [
            ...map.levels,
            {
              id: "cellar",
              name: "Keller",
              asset: {
                path: "library/maps/keller.png",
                hash: `sha256:${"b".repeat(64)}`,
              },
            },
          ],
        },
        fog: { ...scene.fog, cellar: { revealed: [], remembered: [] } },
      },
      rotation: 0,
    });
    await waitFor(() => {
      expect(maps.service.loadImage).toHaveBeenCalledWith(
        "library/maps/keller.png",
      );
    });
    expect(maps.service.loadVideo).not.toHaveBeenCalled();
  });

  test("switches to a level sharing the map's image without a fade or a reload", async () => {
    const { maps, feed } = renderPlayer();
    await waitFor(() => {
      expect(feed.subscribed()).toBe(true);
    });
    const scene = sceneWith("library/maps/a.png");
    const map = scene.map;
    if (!map) throw new Error("the sample scene has a map");
    feed.send({ v: 1, scene, rotation: 0 });
    await waitFor(() => {
      expect(maps.view.setMap).toHaveBeenLastCalledWith(image);
    });
    feed.send({
      v: 1,
      scene: {
        ...scene,
        map: {
          ...map,
          currentLevelId: "cellar",
          levels: [...map.levels, { id: "cellar", name: "Keller" }],
        },
        fog: { ...scene.fog, cellar: { revealed: [], remembered: [] } },
      },
      rotation: 0,
    });
    expect(maps.view.setFog).toHaveBeenLastCalledWith([], {
      softEdge: 25,
      fade: 0,
    });
    expect(maps.service.loadImage).toHaveBeenCalledTimes(1);
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
