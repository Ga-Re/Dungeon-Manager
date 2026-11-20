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
  const scale = { inchPx: 80, cellInches: 1, checkSquare: false };
  feed.calibrate(scale);
  ready();
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0, scale });
  feed.calibrate(null);
  expect(sent.at(-1)).toEqual({ v: 1, scene: null, rotation: 0 });
  expect("scale" in (sent.at(-1) ?? {})).toBe(false);
});
