import type { PlayerViewMessage } from "@dungeon-manager/protocol";
import type { ViewerScene } from "@dungeon-manager/schema";
import { expect, test } from "vitest";
import { createPlayerFeedSender } from "./player-feed.js";

const scene: ViewerScene = {
  id: "s",
  name: "Höhle",
  map: null,
  fog: {},
  tokens: [],
};

test("sends every change and repeats the latest state when the player window loads", () => {
  const sent: PlayerViewMessage[] = [];
  let ready: () => void = () => undefined;
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    (callback) => {
      ready = callback;
    },
  );

  feed.show(scene);
  feed.rotate(180);
  expect(feed.rotation).toBe(180);
  ready();
  feed.show(null);

  expect(sent).toEqual([
    { v: 1, scene, rotation: 0 },
    { v: 1, scene, rotation: 180 },
    { v: 1, scene, rotation: 180 },
    { v: 1, scene: null, rotation: 180 },
  ]);
});

test("sends the TV's calibration, again when the player window reloads, and leaves it out when removed (T-106a)", () => {
  const sent: PlayerViewMessage[] = [];
  let ready: () => void = () => undefined;
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    (callback) => {
      ready = callback;
    },
  );
  const scale = { inchPx: 80, cellInches: 1 };
  feed.calibrate(scale);
  feed.showCheckSquare(720);
  ready();
  expect(sent.at(-1)).toEqual({
    v: 1,
    scene: null,
    rotation: 0,
    scale,
    checkSquarePx: 720,
  });
  feed.calibrate(null);
  feed.showCheckSquare(null);
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0 });
  expect("scale" in (sent.at(-1) ?? {})).toBe(false);
});

test("switches grid lines on the TV, off by default (T-106b)", () => {
  const sent: PlayerViewMessage[] = [];
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    () => undefined,
  );
  feed.showGrid(true);
  expect(sent.at(-1)).toEqual({
    v: 1,
    scene: null,
    rotation: 0,
    showGrid: true,
  });
  feed.showGrid(false);
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0 });
});

test("sends where the calibrated TV view centres (T-106c)", () => {
  const sent: PlayerViewMessage[] = [];
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    () => undefined,
  );
  feed.setViewCenter({ x: 300, y: 200 });
  expect(sent.at(-1)).toEqual({
    v: 1,
    scene: null,
    rotation: 0,
    viewCenter: { x: 300, y: 200 },
  });
  feed.setViewCenter(null);
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0 });
});

test("a new scene on the TV starts in its middle, not at the old one's centre (T-106c)", () => {
  const sent: PlayerViewMessage[] = [];
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    () => undefined,
  );
  feed.show(scene);
  feed.setViewCenter({ x: 300, y: 200 });
  feed.show({ ...scene, name: "Höhle (neu)" });
  expect(sent.at(-1)?.viewCenter).toEqual({ x: 300, y: 200 });
  feed.show({ ...scene, id: "t" });
  expect(sent.at(-1)?.viewCenter).toBeUndefined();
});

test("blacks the TV out and back (T-113a)", () => {
  const sent: PlayerViewMessage[] = [];
  const feed = createPlayerFeedSender(
    (message) => sent.push(message),
    () => undefined,
  );
  feed.blackout(true);
  expect(sent.at(-1)).toEqual({
    v: 1,
    scene: null,
    rotation: 0,
    blackout: true,
  });
  feed.blackout(false);
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0 });
});
