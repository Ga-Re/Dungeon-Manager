import type { MapImage } from "@dungeon-manager/renderer";
import { createI18n } from "@dungeon-manager/ui";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fakeMapService } from "../fake-renderer.test-data.js";
import { createPlayerFeedSender } from "../platform/player-feed.js";
import { TvPreview } from "./TvPreview.js";

// The TV preview (T-113b): what the TV is sent, nothing else.

// jsdom does no layout: a shown panel's box gets a size, a hidden one stays at 0.
let boxSize = { width: 480, height: 270 };
const originals = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  height: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  ),
};
beforeEach(() => {
  boxSize = { width: 480, height: 270 };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => boxSize.width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => boxSize.height,
  });
});
afterEach(() => {
  if (originals.width)
    Object.defineProperty(
      HTMLElement.prototype,
      "clientWidth",
      originals.width,
    );
  if (originals.height)
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      originals.height,
    );
});

describe("TvPreview", () => {
  test("draws exactly what the TV is sent, in the TV's shape, blackout included", async () => {
    const feed = createPlayerFeedSender(
      () => undefined,
      () => undefined,
    );
    const maps = fakeMapService(() =>
      Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
    );
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <TvPreview
          feed={feed}
          maps={maps.service}
          tv={{ width: 3840, height: 2160 }}
        />
      </I18nextProvider>,
    );
    const preview = screen.getByRole("region", {
      name: "Vorschau der Spieleransicht",
    });
    expect(
      (preview.closest(".dm-tv-preview") as HTMLElement).style.aspectRatio,
    ).toBe("3840 / 2160");
    // The scene as projected for the table – the only thing the TV ever gets – is drawn.
    feed.show({
      id: "s",
      name: "Höhle",
      map: {
        kind: "image",
        asset: { path: "library/maps/a.png", hash: `sha256:${"a".repeat(64)}` },
        currentLevelId: "ground",
        grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
        levels: [{ id: "ground", name: "Erdgeschoss" }],
      },
      fog: { ground: { revealed: [], remembered: [] } },
      tokens: [
        {
          id: "t-aria",
          name: "Aria",
          size: "medium",
          position: { col: 1, row: 0 },
          levelId: "ground",
        },
      ],
    });
    await waitFor(() => {
      expect(maps.view.setTokens.mock.lastCall?.[0]).toEqual([
        expect.objectContaining({ id: "t-aria", name: "Aria" }),
      ]);
    });
    const blackout = () =>
      preview
        .closest(".player-frame")
        ?.querySelector<HTMLElement>(".player-blackout");
    expect(blackout()?.hidden).toBe(true);
    feed.blackout(true);
    await waitFor(() => {
      expect(blackout()?.hidden).toBe(false);
    });
  });

  test("a preview opened later shows the TV's current state at once", async () => {
    const feed = createPlayerFeedSender(
      () => undefined,
      () => undefined,
    );
    feed.blackout(true);
    const maps = fakeMapService(() =>
      Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
    );
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <TvPreview
          feed={feed}
          maps={maps.service}
          tv={{ width: 1920, height: 1080 }}
        />
      </I18nextProvider>,
    );
    await waitFor(() => {
      expect(
        document.querySelector<HTMLElement>(".player-blackout")?.hidden,
      ).toBe(false);
    });
  });

  test("a hidden panel runs no player view: no renderer, no video", () => {
    boxSize = { width: 0, height: 0 };
    const feed = createPlayerFeedSender(
      () => undefined,
      () => undefined,
    );
    const maps = fakeMapService(() =>
      Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
    );
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <TvPreview feed={feed} maps={maps.service} tv={null} />
      </I18nextProvider>,
    );
    expect(
      screen.queryByRole("region", { name: "Vorschau der Spieleransicht" }),
    ).toBeNull();
    expect(maps.service.createRenderer).not.toHaveBeenCalled();
    // Without a chosen TV it says what it models.
    expect(screen.getByText(/Kein TV gewählt/)).toBeTruthy();
  });

  test("the calibration is scaled to the preview: one TV pixel is box width / TV width", async () => {
    const feed = createPlayerFeedSender(
      () => undefined,
      () => undefined,
    );
    const maps = fakeMapService(() =>
      Promise.resolve({ width: 1000, height: 500 } as unknown as MapImage),
    );
    render(
      <I18nextProvider i18n={createI18n("de")}>
        <TvPreview
          feed={feed}
          maps={maps.service}
          tv={{ width: 3840, height: 2160 }}
        />
      </I18nextProvider>,
    );
    feed.calibrate({ inchPx: 100, cellInches: 1 });
    feed.showCheckSquare(960);
    feed.show({
      id: "s",
      name: "Höhle",
      map: {
        kind: "image",
        asset: { path: "library/maps/a.png", hash: `sha256:${"a".repeat(64)}` },
        currentLevelId: "ground",
        grid: { cellSizePx: 100, offsetXPx: 0, offsetYPx: 0 },
        levels: [{ id: "ground", name: "Erdgeschoss" }],
      },
      fog: { ground: { revealed: [], remembered: [] } },
      tokens: [],
    });
    // 480 / 3840 = 1/8: a cell of 100 TV pixels is 12.5 preview pixels, its 100 map pixels
    // drawn at zoom 0.125; the 960-pixel check square is 120 preview pixels wide.
    await waitFor(() => {
      expect(maps.camera()?.zoom).toBeCloseTo(0.125);
    });
    const square = document.querySelector<HTMLElement>(".player-check-square");
    expect(square?.style.width).toBe("120px");
  });
});
