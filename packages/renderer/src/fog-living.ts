// Living fog (T-245, ADR-0019): the fog drifts and its edge wobbles. Drawn by a shader over the
// soft fog mask; the player view keeps the exact hard fog underneath (see `drawFog`), and the
// shader keeps every fogged texel opaque, so the animation only ever reaches into revealed area.
import {
  AlphaFilter,
  type Container,
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  type Texture,
} from "pixi.js";
import { FRONT } from "./fog-spread.js";

/** How the living fog looks and moves on this device (the settings of T-245). */
export interface LivingFog {
  /** Detail and resolution of the effect (ADR-0019); "off" is no living fog at all. */
  readonly quality: "high" | "medium";
  /** Map pixels per grid cell: the swirls and the edge scale with the grid, not the image. */
  readonly cellSizePx: number;
  /** Edge wobble, 0 … {@link LIVING_EDGE_MAX} (1.2 by default). */
  readonly edge: number;
  /** Speed of the drift, 0 (still) … 3. */
  readonly motion: number;
}

export const LIVING_EDGE_MAX = 2.5;

/**
 * How far the living fog may reach into revealed area, in grid cells: at least the soft edge's
 * 0.25 cells, at most 0.45 so a revealed one-cell corridor keeps its middle open.
 */
const REACH_MIN_CELLS = 0.25;
const REACH_MAX_CELLS = 0.45;

/** Octaves of noise and the share of the screen's resolution the effect renders at. */
export const LIVING_QUALITY = {
  high: { octaves: 5, resolution: 0.75 },
  medium: { octaves: 3, resolution: 0.5 },
} as const;

/**
 * The band of the soft mask the living edge plays in and how far the shader shifts its samples,
 * both in map pixels. Together they stay within the reach for `edge`, so the fog never creeps
 * further than {@link REACH_MAX_CELLS} into revealed area.
 */
export function livingReach(living: LivingFog): {
  readonly band: number;
  readonly warp: number;
} {
  const edge = Math.min(LIVING_EDGE_MAX, Math.max(0, living.edge));
  const reach =
    living.cellSizePx *
    (REACH_MIN_CELLS +
      ((REACH_MAX_CELLS - REACH_MIN_CELLS) * edge) / LIVING_EDGE_MAX);
  // A shifted sample moves by the warp times a noise vector of components within ±0.5, so at
  // most √½ of the warp (diagonally): the shift stays within 0.35 of the reach.
  return {
    band: reach * 0.65,
    warp: edge > 0 ? (reach * 0.35) / Math.SQRT1_2 : 0,
  };
}

/** Bodennebel (ADR-0019): deep, body and highlight of the fog, until biomes arrive (T-168). */
const COLOURS = [
  [0x2a / 255, 0x32 / 255, 0x38 / 255],
  [0x66 / 255, 0x73 / 255, 0x7c / 255],
  [0xb9 / 255, 0xc5 / 255, 0xcc / 255],
] as const;

const VERTEX = `in vec2 aPosition;
out vec2 vPos;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPos = aPosition;
}`;

const fragment = (octaves: number) => `in vec2 vPos;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uOrder;
uniform float uMix;
uniform float uTime;
uniform float uEdge;
uniform float uWarp;
uniform float uCell;
uniform float uOpacity;
uniform vec2 uMaskSize;
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uLight;
out vec4 finalColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < ${String(octaves)}; i++) {
    s += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return s / (1.0 - pow(0.5, ${octaves.toFixed(1)}));
}
// Fog alpha at a map point, mid-spread as the fade shader mixes it; fog beyond the map.
float fogAt(vec2 pos) {
  vec2 uv = pos / uMaskSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  float local = clamp(
    (uMix * (1.0 + ${FRONT.toFixed(3)}) - texture(uOrder, uv).a) / ${FRONT.toFixed(3)},
    0.0,
    1.0
  );
  return mix(texture(uFrom, uv).a, texture(uTo, uv).a, local);
}
void main() {
  vec2 p = vPos / (uCell * 4.0);
  float t = uTime;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.035)), fbm(p + vec2(5.2, 1.3) + vec2(t * 0.03, 0.0)));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 0.045),
                fbm(p + 2.6 * q + vec2(8.3, 2.8) - t * 0.04));
  float f = fbm(p * 1.3 + 2.2 * r);
  // Faster, finer turbulence that only shows where the fog has an edge.
  vec2 e = vec2(fbm(p * 2.4 + 1.2 * r + vec2(t * 0.21, 0.0)),
                fbm(p * 2.4 + 1.2 * r + vec2(4.1, 7.3 - t * 0.19))) - 0.5;
  float m = fogAt(vPos + e * uWarp);
  float edge = clamp(m * (1.0 - m) * 4.0, 0.0, 1.0);
  float d = m + (f - 0.5) * 0.9 * edge + (e.x + e.y) * 0.5 * uEdge * edge;
  float a = smoothstep(0.2, 0.8, d);
  // Only towards the revealed side: where the fog is, it stays opaque whatever the noise does.
  a = max(a, smoothstep(0.96, 1.0, fogAt(vPos)));
  vec3 colour = mix(uDeep, uBody, smoothstep(0.22, 0.88, f));
  float wisp = smoothstep(0.48, 0.95, fbm(p * 0.7 + r * 1.5 + vec2(t * 0.06, -t * 0.02)));
  colour = mix(colour, uLight, wisp * 0.5);
  colour = mix(colour, uLight, edge * 0.3);
  float alpha = a * uOpacity;
  finalColor = vec4(colour * alpha, alpha);
}`;

/** A living fog layer's controls: the spread's mix (fades) and the animation time. */
export interface LivingHandle {
  readonly mesh: Container;
  readonly setMix: (t: number) => void;
  readonly setTime: (seconds: number) => void;
}

/**
 * The living fog over the map and a margin around it (`margin` map pixels; fog beyond the map
 * stays fog): the masks `from` and `to` (fog alpha textures of `maskSize` map pixels) mixed in
 * `order` as a fade does, then shaded. It renders at a share of `rootResolution` (quality).
 * Owns and frees the textures and the filter it is given or makes.
 */
export function drawLivingFog({
  from,
  to,
  order,
  maskSize,
  map,
  margin,
  living,
  opacity,
  rootResolution,
}: {
  readonly from: Texture;
  readonly to: Texture;
  readonly order: Texture;
  readonly maskSize: { readonly width: number; readonly height: number };
  readonly map: { readonly width: number; readonly height: number };
  readonly margin: number;
  readonly living: LivingFog;
  readonly opacity: number;
  readonly rootResolution: number;
}): LivingHandle {
  const { warp } = livingReach(living);
  const quality = LIVING_QUALITY[living.quality];
  const uniforms = new UniformGroup({
    uMix: { value: 1, type: "f32" },
    uTime: { value: 0, type: "f32" },
    uEdge: {
      value: Math.min(LIVING_EDGE_MAX, Math.max(0, living.edge)),
      type: "f32",
    },
    uWarp: { value: warp, type: "f32" },
    uCell: { value: Math.max(1, living.cellSizePx), type: "f32" },
    uOpacity: { value: opacity, type: "f32" },
    uMaskSize: {
      value: new Float32Array([maskSize.width, maskSize.height]),
      type: "vec2<f32>",
    },
    uDeep: { value: new Float32Array(COLOURS[0]), type: "vec3<f32>" },
    uBody: { value: new Float32Array(COLOURS[1]), type: "vec3<f32>" },
    uLight: { value: new Float32Array(COLOURS[2]), type: "vec3<f32>" },
  });
  const left = -margin;
  const top = -margin;
  const right = map.width + margin;
  const bottom = map.height + margin;
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      left,
      top,
      right,
      top,
      right,
      bottom,
      left,
      bottom,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const shader = Shader.from({
    gl: {
      vertex: VERTEX,
      fragment: fragment(quality.octaves),
      // Map pixels and noise need more than mediump's 16 bits on GPUs that honour it.
      preferredFragmentPrecision: "highp",
    },
    resources: {
      uFrom: from.source,
      uTo: to.source,
      uOrder: order.source,
      livingUniforms: uniforms,
    },
  });
  // Its own texture (the target): destroying the mesh with its texture never reaches a shared
  // default texture.
  const mesh = new Mesh({ geometry, texture: to, shader });
  // Rendered at a lower resolution and stretched: soft fog needs few pixels (ADR-0019).
  const filter = new AlphaFilter({
    alpha: 1,
    resolution: rootResolution * quality.resolution,
  });
  mesh.filters = [filter];
  mesh.on("destroyed", () => {
    if (from !== to) from.destroy(true);
    order.destroy(true);
    geometry.destroy();
    shader.destroy();
    filter.destroy();
  });
  return {
    mesh,
    setMix: (t) => {
      uniforms.uniforms.uMix = t;
    },
    setTime: (seconds) => {
      uniforms.uniforms.uTime = seconds;
    },
  };
}
