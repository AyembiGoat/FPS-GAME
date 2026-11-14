import type { SurfaceRecipe, Texel } from './surface';

/**
 * Every surface in the game. To add one, add an entry here and read
 * .agents/skills/textures/SKILL.md. Seeds only need to differ within one recipe.
 */

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Distance from `x` to the nearest multiple of `spacing`. */
function toNearest(x: number, spacing: number): number {
  const m = ((x % spacing) + spacing) % spacing;
  return Math.min(m, spacing - m);
}

function grey(out: Texel, shade: number, warmth: number) {
  out.r = shade;
  out.g = shade * (1 - warmth * 0.5);
  out.b = shade * (1 - warmth);
}

/** Cast concrete wall: 1.2 m lifts, form seams, tie holes, pores and rain streaks. */
const concreteWall: SurfaceRecipe = {
  pixels: [512, 512],
  tile: [2.4, 2.4],
  relief: 0.004,
  metalness: 0,
  texel(u, v, t, out) {
    const big = t.fbm(u, v, 3, 3, 4, 1);
    const mid = t.fbm(u, v, 14, 14, 3, 2);
    const fine = t.noise(u, v, 180, 180, 3);
    let shade = 150 + (big - 0.5) * 36 + (mid - 0.5) * 18 + (fine - 0.5) * 10;
    let height = 0.7 + (mid - 0.5) * 0.25;

    const pit = smoothstep(0.78, 0.9, t.noise(u, v, 110, 110, 4)) * t.noise(u, v, 37, 37, 5);
    shade -= pit * 50;
    height -= pit * 0.5;

    // Water runs down from the top edge of each lift and leaves dark streaks.
    const lift = (v * 2) % 1;
    const streak =
      smoothstep(0.55, 0.9, t.noise(u, 0.5, 70, 1, 6)) *
      smoothstep(0.2, 1, lift) *
      (0.4 + 0.6 * t.noise(u, v, 9, 9, 7));
    shade -= streak * 34;

    const seam = 1 - smoothstep(0.0015, 0.0045, Math.min(toNearest(u, 1), toNearest(v, 0.5)));
    shade -= seam * 40;
    height -= seam * 0.6;

    const hole =
      1 - smoothstep(0.007, 0.011, Math.hypot(toNearest(u - 0.25, 0.5), toNearest(v - 0.25, 0.5)));
    shade -= hole * 85;
    height -= hole * 0.7;

    grey(out, shade, 0.06);
    out.height = height;
    out.roughness = 0.9 + pit * 0.08 - streak * 0.08;
  },
};

/** Poured slab: 2 m control joints, hairline cracks, oil stains and exposed grit. */
const concreteFloor: SurfaceRecipe = {
  pixels: [1024, 1024],
  tile: [4, 4],
  relief: 0.004,
  metalness: 0,
  texel(u, v, t, out) {
    const big = t.fbm(u, v, 4, 4, 4, 11);
    const mid = t.fbm(u, v, 22, 22, 3, 12);
    const fine = t.noise(u, v, 420, 420, 13);
    let shade = 176 + (big - 0.5) * 30 + (mid - 0.5) * 16 + (fine - 0.5) * 14;
    let height = 0.8 + (mid - 0.5) * 0.15;

    const grit = smoothstep(0.86, 0.95, t.noise(u, v, 260, 260, 14));
    shade -= grit * 30;
    height -= grit * 0.15;

    const stain = smoothstep(0.55, 0.85, t.fbm(u, v, 4, 4, 3, 15));
    shade -= stain * 18;

    // A crack follows the line where a slow noise crosses its midpoint.
    const line = Math.abs(t.fbm(u, v, 6, 6, 4, 16) - 0.5);
    const crack =
      (1 - smoothstep(0.0006, 0.004, line)) * smoothstep(0.6, 0.7, t.fbm(u, v, 3, 3, 2, 17));
    shade -= crack * 45;
    height -= crack * 0.6;

    const joint = 1 - smoothstep(0.0012, 0.003, Math.min(toNearest(u, 0.5), toNearest(v, 0.5)));
    shade -= joint * 75;
    height -= joint * 0.8;

    grey(out, shade, 0.11);
    out.height = height;
    out.roughness = 0.92 - stain * 0.2;
  },
};

/** One 1.22 m by 2.44 m plywood sheet left outdoors: grain, greying, damp foot, screws. */
const plywood: SurfaceRecipe = {
  pixels: [256, 512],
  tile: [1.22, 2.44],
  relief: 0.0025,
  metalness: 0,
  texel(u, v, t, out) {
    const warp = t.fbm(u, v, 3, 3, 3, 21) - 0.5;
    // Grain runs up the sheet: tight across it, long along it.
    const grain = t.fbm(u + warp * 0.08, v, 48, 2, 3, 22);
    const figure =
      0.5 + 0.5 * Math.sin((u * 14 + (t.fbm(u, v, 2, 1, 2, 23) - 0.5) * 5) * Math.PI * 2);
    const tone = grain * 0.6 + figure * 0.4;
    let r = mix(142, 198, tone);
    let g = mix(104, 162, tone);
    let b = mix(64, 116, tone);

    const weathered = smoothstep(0.3, 0.8, t.fbm(u, v, 2, 2, 3, 24)) * 0.28;
    r = mix(r, 156, weathered);
    g = mix(g, 149, weathered);
    b = mix(b, 137, weathered);

    const damp = (1 - smoothstep(0, 0.1, v)) * 0.2;
    let dark = damp;
    let height = 0.6 + (grain - 0.5) * 0.35;

    const edge = Math.min(Math.min(u, 1 - u) * 1.22, Math.min(v, 1 - v) * 2.44);
    const seam = 1 - smoothstep(0.0015, 0.004, edge);
    dark = Math.max(dark, seam * 0.65);
    height -= seam * 0.6;

    // Screws down both edges and the middle, every 0.3 m.
    const column = Math.min(Math.abs(u - 0.03), Math.abs(u - 0.5), Math.abs(u - 0.97)) * 1.22;
    const screw =
      1 - smoothstep(0.004, 0.0065, Math.hypot(column, toNearest(v - 0.0625, 0.125) * 2.44));
    r = mix(r, 70, screw);
    g = mix(g, 68, screw);
    b = mix(b, 66, screw);
    height -= screw * 0.35;

    out.r = r * (1 - dark);
    out.g = g * (1 - dark);
    out.b = b * (1 - dark);
    out.height = height;
    out.roughness = 0.82 - screw * 0.3;
  },
};

/** One face of a slatted wooden crate: four slats set inside a raised frame. */
const crate: SurfaceRecipe = {
  pixels: [256, 256],
  tile: null,
  relief: 0.012,
  metalness: 0,
  texel(u, v, t, out) {
    const frame = 0.13;
    const sides = u < frame || u > 1 - frame;
    const inFrame = sides || v < frame || v > 1 - frame;
    let board: number;
    let alongU: boolean;
    let height: number;
    let gap: number;

    if (inFrame) {
      // Side rails run the full height; top and bottom rails fit between them.
      alongU = !sides;
      board = sides ? (u < 0.5 ? 1 : 2) : v < 0.5 ? 3 : 4;
      height = 1;
      const joint = sides ? 1 : 1 - smoothstep(0, 0.012, Math.min(u - frame, 1 - frame - u));
      gap = sides ? 0 : joint * 0.7;
    } else {
      const slat = ((v - frame) / (1 - frame * 2)) * 4;
      alongU = true;
      board = 5 + Math.floor(slat);
      height = 0.45;
      gap = 1 - smoothstep(0.02, 0.07, toNearest(slat, 1));
      // Shade under the inner lip of the frame.
      const lip = Math.min(u - frame, 1 - frame - u, v - frame, 1 - frame - v);
      gap = Math.max(gap, (1 - smoothstep(0, 0.035, lip)) * 0.45);
    }

    const grain = alongU ? t.fbm(u, v, 3, 44, 3, 31 + board) : t.fbm(u, v, 44, 3, 3, 31 + board);
    const tone = 0.78 + t.hash(board, 32) * 0.3;
    const outer = 1 - smoothstep(0, 0.012, Math.min(u, 1 - u, v, 1 - v));
    const shade = tone * (1 - gap * 0.75) * (1 - outer * 0.5);

    out.r = mix(118, 178, grain) * shade;
    out.g = mix(86, 138, grain) * shade;
    out.b = mix(50, 88, grain) * shade;
    out.height = height - gap * 0.4 + (grain - 0.5) * 0.08;
    out.roughness = 0.84;
  },
};

/** Steel target plate: white paint, chipped to bare metal and marked by earlier hits. */
const targetSteel: SurfaceRecipe = {
  pixels: [256, 256],
  tile: [1, 1],
  relief: 0.0008,
  metalness: 0.25,
  texel(u, v, t, out) {
    const wear = t.fbm(u, v, 9, 9, 4, 41);
    const chip = smoothstep(0.7, 0.74, wear);
    const rust = smoothstep(0.66, 0.7, wear) * (1 - chip);
    const splash = smoothstep(0.86, 0.9, t.noise(u, v, 10, 10, 42));
    const paint = 208 + (t.noise(u, v, 60, 60, 43) - 0.5) * 12;

    let r = mix(paint, 150, splash * 0.8);
    let g = mix(paint * 0.99, 150, splash * 0.8);
    let b = mix(paint * 0.95, 152, splash * 0.8);
    r = mix(mix(r, 150, rust), 92, chip);
    g = mix(mix(g, 104, rust), 90, chip);
    b = mix(mix(b, 76, rust), 88, chip);

    out.r = r;
    out.g = g;
    out.b = b;
    out.height = 1 - chip * 0.8 - splash * 0.4;
    out.roughness = mix(0.62, 0.4, Math.max(chip, splash));
  },
};

/** Parkerized gun steel: dark matte grey with a faint mottle. */
const gunSteel: SurfaceRecipe = {
  pixels: [128, 128],
  tile: [0.08, 0.08],
  relief: 0.00015,
  metalness: 0.5,
  texel(u, v, t, out) {
    const mottle = t.fbm(u, v, 6, 6, 3, 51);
    const fine = t.noise(u, v, 64, 64, 52);
    const shade = 38 + (mottle - 0.5) * 8 + (fine - 0.5) * 5;
    out.r = shade;
    out.g = shade;
    out.b = shade * 0.97;
    out.height = fine;
    out.roughness = 0.52 + (mottle - 0.5) * 0.12;
  },
};

/** Checkered walnut grip panel: rows of small cut pyramids. */
const walnut: SurfaceRecipe = {
  pixels: [64, 64],
  tile: [0.012, 0.012],
  relief: 0.0006,
  metalness: 0,
  texel(u, v, _t, out) {
    const ridge = (x: number) => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);
    const point = Math.min(ridge((u + v) * 2), ridge((u - v) * 2));
    out.r = mix(50, 108, point);
    out.g = mix(29, 66, point);
    out.b = mix(17, 38, point);
    out.height = point;
    out.roughness = 0.7;
  },
};

/** Black synthetic glove: matte, with a fine grain and no visible pattern. */
const glove: SurfaceRecipe = {
  pixels: [64, 64],
  tile: [0.04, 0.04],
  relief: 0.0004,
  metalness: 0,
  texel(u, v, t, out) {
    const grain = t.fbm(u, v, 16, 16, 2, 61);
    const shade = 13 + grain * 7;
    out.r = shade;
    out.g = shade;
    out.b = shade * 1.03;
    out.height = grain;
    out.roughness = 0.86;
  },
};

/** Olive drab sleeve: cotton with slight uneven fading and a faint ripstop grid. */
const sleeve: SurfaceRecipe = {
  pixels: [128, 128],
  tile: [0.06, 0.06],
  relief: 0.00012,
  metalness: 0,
  texel(u, v, t, out) {
    const grain = t.noise(u, v, 64, 64, 72);
    const rip = 1 - smoothstep(0.01, 0.025, Math.min(toNearest(u, 0.125), toNearest(v, 0.125)));
    const tone = 0.9 + (grain - 0.5) * 0.08 + rip * 0.03 + (t.fbm(u, v, 3, 3, 2, 71) - 0.5) * 0.14;
    out.r = 54 * tone;
    out.g = 58 * tone;
    out.b = 39 * tone;
    out.height = grain * 0.5 + rip * 0.5;
    out.roughness = 0.92;
  },
};

export const RECIPES = {
  'concrete-wall': concreteWall,
  'concrete-floor': concreteFloor,
  plywood,
  crate,
  'target-steel': targetSteel,
  'gun-steel': gunSteel,
  walnut,
  glove,
  sleeve,
} satisfies Record<string, SurfaceRecipe>;
