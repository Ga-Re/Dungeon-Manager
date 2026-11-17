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
