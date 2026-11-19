import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { disposeFog } from "./fog-dispose.js";

describe("disposeFog (T-165)", () => {
  it("frees the graphics contexts and own textures of a fog layer, never shared ones", () => {
    const layer = new Container();
    const cover = new Graphics().rect(0, 0, 10, 10).fill({ color: 0 });
    const open = new Graphics().rect(2, 2, 4, 4).fill({ color: 0xffffff });
    const nested = new Container();
    const inner = new Graphics().rect(0, 0, 1, 1).fill({ color: 0 });
    nested.addChild(inner);
    const own = Texture.from(document.createElement("canvas"));
    const soft = new Sprite(own);
    layer.addChild(cover, open, nested, soft);
    const contexts = [cover.context, open.context, inner.context];

    disposeFog(layer);

    expect(contexts.every((context) => context.destroyed)).toBe(true);
    expect(layer.destroyed && nested.destroyed && soft.destroyed).toBe(true);
    expect(own.destroyed).toBe(true);
    // Colour fills use the shared white texture: it must survive.
    expect(Texture.WHITE.destroyed).toBe(false);
  });
});
