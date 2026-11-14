import * as THREE from 'three';

/**
 * Turns a surface recipe into a lit material.
 *
 * A recipe is one function that, for a point on the surface, says what colour it
 * is, how high it stands and how rough it is. From that this file builds three
 * matching textures: colour, a normal map worked out from the heights, and
 * roughness. Because all three come from the same function they always agree, and
 * every surface in the game is lit the same way.
 */

export interface Texel {
  /** Colour, 0..255 per channel, as it would look in a photo under white light. */
  r: number;
  g: number;
  b: number;
  /** 0 is the deepest point of the surface, 1 the highest. */
  height: number;
  /** 0 is mirror-smooth, 1 is fully matte. */
  roughness: number;
}

export interface Tools {
  /** Smooth random value 0..1 that repeats seamlessly. `fu` and `fv` are cells per tile. */
  noise(u: number, v: number, fu: number, fv: number, seed: number): number;
  /** Several layers of `noise` at doubling detail: cloudy, natural variation. */
  fbm(u: number, v: number, fu: number, fv: number, octaves: number, seed: number): number;
  /** A fixed random value 0..1 for a whole number, e.g. a different tone per board. */
  hash(n: number, seed: number): number;
}

export interface SurfaceRecipe {
  /** Texture size in pixels. */
  readonly pixels: readonly [number, number];
  /** Metres one repeat covers, or null to stretch one repeat over each face. */
  readonly tile: readonly [number, number] | null;
  /** Metres between the lowest and highest point. Sets how strong the relief looks. */
  readonly relief: number;
  readonly metalness: number;
  /** `u` runs left to right and `v` bottom to top, both 0..1 across one repeat. */
  texel(u: number, v: number, tools: Tools, out: Texel): void;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(u: number, v: number, fu: number, fv: number, seed: number): number {
  const x = u * fu;
  const y = v * fv;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  // Wrapping the cell coordinates is what makes the texture tile without a seam.
  const xa = ((x0 % fu) + fu) % fu;
  const ya = ((y0 % fv) + fv) % fv;
  const xb = (xa + 1) % fu;
  const yb = (ya + 1) % fv;
  const top = hash2(xa, ya, seed) + (hash2(xb, ya, seed) - hash2(xa, ya, seed)) * sx;
  const bottom = hash2(xa, yb, seed) + (hash2(xb, yb, seed) - hash2(xa, yb, seed)) * sx;
  return top + (bottom - top) * sy;
}

const TOOLS: Tools = {
  noise,
  fbm(u, v, fu, fv, octaves, seed) {
    let total = 0;
    let weight = 0;
    let amplitude = 1;
    for (let i = 0; i < octaves; i++) {
      total += noise(u, v, fu << i, fv << i, seed + i * 17) * amplitude;
      weight += amplitude;
      amplitude *= 0.5;
    }
    return total / weight;
  },
  hash: (n, seed) => hash2(n, 0, seed),
};

function texture(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  colour: boolean,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  context.putImageData(new ImageData(data, width, height), 0, 0);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.anisotropy = 4;
  return result;
}

export function buildSurface(recipe: SurfaceRecipe): THREE.MeshStandardMaterial {
  const [width, height] = recipe.pixels;
  const count = width * height;
  const colour = new Uint8ClampedArray(count * 4);
  const rough = new Uint8ClampedArray(count * 4);
  const normal = new Uint8ClampedArray(count * 4);
  const heights = new Float32Array(count);
  const out: Texel = { r: 0, g: 0, b: 0, height: 0, roughness: 0 };

  for (let j = 0; j < height; j++) {
    // Row 0 of an image is its top, which is v = 1.
    const v = 1 - (j + 0.5) / height;
    for (let i = 0; i < width; i++) {
      recipe.texel((i + 0.5) / width, v, TOOLS, out);
      const index = j * width + i;
      colour[index * 4] = out.r;
      colour[index * 4 + 1] = out.g;
      colour[index * 4 + 2] = out.b;
      colour[index * 4 + 3] = 255;
      // Three.js reads roughness from the green channel.
      rough[index * 4 + 1] = out.roughness * 255;
      rough[index * 4 + 3] = 255;
      heights[index] = out.height;
    }
  }

  // Slope of the height field, in metres of rise per metre across.
  const metresPerPixelU = (recipe.tile?.[0] ?? 1) / width;
  const metresPerPixelV = (recipe.tile?.[1] ?? 1) / height;
  for (let j = 0; j < height; j++) {
    const up = ((j - 1 + height) % height) * width;
    const down = ((j + 1) % height) * width;
    for (let i = 0; i < width; i++) {
      const left = (i - 1 + width) % width;
      const right = (i + 1) % width;
      const row = j * width;
      const slopeU =
        (((heights[row + right] ?? 0) - (heights[row + left] ?? 0)) * recipe.relief) /
        (2 * metresPerPixelU);
      const slopeV =
        (((heights[up + i] ?? 0) - (heights[down + i] ?? 0)) * recipe.relief) /
        (2 * metresPerPixelV);
      const length = Math.hypot(slopeU, slopeV, 1);
      const index = (row + i) * 4;
      normal[index] = (-slopeU / length) * 127.5 + 127.5;
      normal[index + 1] = (-slopeV / length) * 127.5 + 127.5;
      normal[index + 2] = (1 / length) * 127.5 + 127.5;
      normal[index + 3] = 255;
    }
  }

  return new THREE.MeshStandardMaterial({
    map: texture(colour, width, height, true),
    normalMap: texture(normal, width, height, false),
    roughnessMap: texture(rough, width, height, false),
    roughness: 1,
    metalness: recipe.metalness,
  });
}
