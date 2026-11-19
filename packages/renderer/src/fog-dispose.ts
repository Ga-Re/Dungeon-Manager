import { Container, Graphics } from "pixi.js";

/**
 * Frees a fog layer completely (T-165): its graphics with their contexts (the geometry PixiJS
 * keeps for them), and the textures its sprites and meshes own. `Graphics.destroy` with an
 * options object leaves the context behind unless asked, and asking for textures too would
 * destroy the shared `Texture.WHITE` of colour fills – so each kind gets its own options.
 */
export function disposeFog(layer: Container): void {
  for (const child of [...layer.children]) {
    if (child instanceof Graphics) child.destroy({ context: true });
    else if (child.constructor === Container) disposeFog(child);
    else child.destroy({ children: true, texture: true, textureSource: true });
  }
  layer.destroy();
}
