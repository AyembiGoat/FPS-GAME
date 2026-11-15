import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LootItem, LootSpawn } from '../core/loot';
import type { GameMap } from '../core/map';
import type { SurfaceName } from './materials';
import { applySurface, surface } from './materials';

/**
 * The items lying in the level. Each kind of item is modelled once, in metres, standing on its
 * base at the origin. All the items on a map are then merged into one mesh per surface.
 *
 * Small printed parts (labels, a cross patch, a can's paint) have no texture worth mapping; they
 * share one plain material and carry their colour per vertex.
 */

type Part = { readonly geometry: THREE.BufferGeometry; readonly surface: SurfaceName | null };

const LABEL_WHITE = 0xd9d6cc;
const LABEL_CREAM = 0xc9bf9f;
const CAN_BLUE = 0x1f3a5c;
const BOTTLE_AMBER = 0xa8581c;
const STRAP_BLACK = 0x1c1d1f;

function place(geometry: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0) {
  if (yaw !== 0) geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  return geometry;
}

/** A box resting with its centre at `(x, y, z)`. */
function box(
  surfaceName: SurfaceName | null,
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  options: { yaw?: number; colour?: number } = {},
): Part {
  const geometry = place(new THREE.BoxGeometry(...size), at[0], at[1], at[2], options.yaw);
  return tinted({ geometry, surface: surfaceName }, options.colour);
}

/** An upright cylinder with its centre at `(x, y, z)`. */
function cylinder(
  surfaceName: SurfaceName | null,
  radius: number,
  height: number,
  at: readonly [number, number, number],
  colour?: number,
): Part {
  const geometry = place(new THREE.CylinderGeometry(radius, radius, height, 14), ...at);
  return tinted({ geometry, surface: surfaceName }, colour);
}

function tinted(part: Part, colour: number | undefined): Part {
  if (part.surface !== null || colour === undefined) return part;
  const count = part.geometry.getAttribute('position').count;
  const tint = new THREE.Color(colour);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) tint.toArray(colours, i * 3);
  part.geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return part;
}

/** A plus-shaped patch lying in the XZ plane (`flat`) or standing in the XY plane. */
function cross(
  at: readonly [number, number, number],
  arm: number,
  flat: boolean,
  colour: number,
): Part[] {
  const thick = arm * 0.34;
  const skin = 0.003;
  return flat
    ? [box(null, [arm, skin, thick], at, { colour }), box(null, [thick, skin, arm], at, { colour })]
    : [
        box(null, [arm, thick, skin], at, { colour }),
        box(null, [thick, arm, skin], at, { colour }),
      ];
}

/** Vacuum-packed field dressings: flat olive packets with a printed label, loosely stacked. */
function bandageParts(): Part[] {
  const packet = (y: number, x: number, z: number, yaw: number): Part[] => [
    box('chassis-od', [0.13, 0.028, 0.09], [x, y + 0.014, z], { yaw }),
    box(null, [0.075, 0.002, 0.05], [x, y + 0.029, z], { yaw, colour: LABEL_CREAM }),
  ];
  return [...packet(0, 0, 0, 0.18), ...packet(0.028, 0.012, -0.008, -0.32)];
}

/** Individual first aid kit: an upright olive pouch with a flap, webbing and a white cross. */
function firstAidParts(): Part[] {
  return [
    box('cordura-olive', [0.16, 0.19, 0.085], [0, 0.095, 0]),
    box('cordura-olive', [0.168, 0.07, 0.012], [0, 0.158, 0.047]),
    box('opfor-cloth', [0.164, 0.022, 0.006], [0, 0.085, 0.045]),
    box('opfor-cloth', [0.164, 0.022, 0.006], [0, 0.04, 0.045]),
    box('opfor-cloth', [0.03, 0.03, 0.012], [0, 0.126, 0.056]),
    ...cross([0, 0.158, 0.0545], 0.05, false, LABEL_WHITE),
  ];
}

/** Medic's trauma bag: a red holdall lying flat, with a carry handle, zip and white cross. */
function medKitParts(): Part[] {
  return [
    box('cordura-crimson', [0.38, 0.16, 0.25], [0, 0.08, 0]),
    box('cordura-crimson', [0.1, 0.11, 0.03], [0.1, 0.07, 0.14]),
    box('cordura-crimson', [0.1, 0.11, 0.03], [-0.1, 0.07, 0.14]),
    box('opfor-cloth', [0.36, 0.006, 0.012], [0, 0.163, 0.06]),
    box('opfor-cloth', [0.025, 0.05, 0.02], [-0.07, 0.185, -0.03]),
    box('opfor-cloth', [0.025, 0.05, 0.02], [0.07, 0.185, -0.03]),
    box('opfor-cloth', [0.165, 0.02, 0.022], [0, 0.215, -0.03]),
    ...cross([0, 0.1615, -0.035], 0.085, true, LABEL_WHITE),
  ];
}

/** Two slim drink cans: bare aluminium ends, painted body. */
function energyDrinkParts(): Part[] {
  const can = (x: number, z: number): Part[] => [
    cylinder('stainless-steel', 0.0265, 0.135, [x, 0.0675, z]),
    cylinder(null, 0.0272, 0.098, [x, 0.066, z], CAN_BLUE),
    cylinder(null, 0.0274, 0.016, [x, 0.074, z], LABEL_WHITE),
  ];
  return [...can(-0.034, 0.008), ...can(0.034, -0.012)];
}

/** Pill bottle: amber plastic, white label, white screw cap. */
function painkillerParts(): Part[] {
  return [
    cylinder(null, 0.024, 0.07, [0, 0.035, 0], BOTTLE_AMBER),
    cylinder(null, 0.0246, 0.038, [0, 0.036, 0], LABEL_WHITE),
    cylinder(null, 0.0262, 0.02, [0, 0.08, 0], LABEL_WHITE),
  ];
}

/**
 * Plate carrier lying on its back: plate bag, cummerbund wings and shoulder straps. Higher
 * levels are darker, cover more and carry magazine pouches.
 */
function vestParts(level: 1 | 2 | 3): Part[] {
  const cloth: SurfaceName = level === 1 ? 'cordura-olive' : 'opfor-cloth';
  const webbing: SurfaceName = level === 1 ? 'opfor-cloth' : 'polymer-black';
  const length = level === 1 ? 0.34 : 0.4;
  const parts: Part[] = [
    box(cloth, [0.3, 0.05, length], [0, 0.025, 0]),
    box(cloth, [0.13, 0.04, 0.15], [-0.215, 0.02, 0.07]),
    box(cloth, [0.13, 0.04, 0.15], [0.215, 0.02, 0.07]),
    box(cloth, [0.07, 0.022, 0.16], [-0.1, 0.011, -length / 2 - 0.08]),
    box(cloth, [0.07, 0.022, 0.16], [0.1, 0.011, -length / 2 - 0.08]),
  ];
  for (let row = 0; row < 3; row++) {
    parts.push(box(webbing, [0.27, 0.004, 0.022], [0, 0.052, 0.02 + row * 0.05]));
  }
  if (level >= 2) {
    for (const x of [-0.09, 0, 0.09]) {
      parts.push(box(cloth, [0.075, 0.035, 0.13], [x, 0.0675, 0.085]));
    }
  }
  if (level === 3) parts.push(box(cloth, [0.24, 0.03, 0.07], [0, 0.015, -length / 2 - 0.035]));
  return parts;
}

/** Combat helmet resting on its rim. Level 1 is a plain olive shell; higher levels add rails. */
function helmetParts(level: 1 | 2 | 3): Part[] {
  const shellSurface: SurfaceName = level === 1 ? 'chassis-od' : 'polymer-black';
  const dome = new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(0.92, 1.24, 1.1);
  const parts: Part[] = [
    { geometry: dome, surface: shellSurface },
    box(shellSurface, [0.2, 0.012, 0.05], [0, 0.006, 0.125]),
    box(null, [0.012, 0.004, 0.2], [-0.105, 0.012, 0], { colour: STRAP_BLACK }),
    box(null, [0.012, 0.004, 0.2], [0.105, 0.012, 0], { colour: STRAP_BLACK }),
  ];
  if (level >= 2) {
    parts.push(
      box('steel-dark', [0.012, 0.022, 0.12], [-0.117, 0.05, -0.01]),
      box('steel-dark', [0.012, 0.022, 0.12], [0.117, 0.05, -0.01]),
      box('steel-dark', [0.045, 0.04, 0.012], [0, 0.085, 0.128]),
    );
  }
  if (level === 3) parts.push(box(shellSurface, [0.2, 0.05, 0.012], [0, 0.03, -0.132]));
  return parts;
}

function itemKey(item: LootItem): string {
  return item.kind === 'consumable' ? item.id : `${item.piece}-${item.level}`;
}

function itemParts(item: LootItem): Part[] {
  if (item.kind === 'armour') {
    return item.piece === 'vest' ? vestParts(item.level) : helmetParts(item.level);
  }
  switch (item.id) {
    case 'bandage':
      return bandageParts();
    case 'first-aid':
      return firstAidParts();
    case 'med-kit':
      return medKitParts();
    case 'energy-drink':
      return energyDrinkParts();
    case 'painkiller':
      return painkillerParts();
  }
}

interface ItemModel {
  readonly meshes: readonly { geometry: THREE.BufferGeometry; surface: SurfaceName | null }[];
}

/** Merge an item's parts into one geometry per surface. */
function buildModel(item: LootItem): ItemModel {
  const bySurface = new Map<SurfaceName | null, THREE.BufferGeometry[]>();
  for (const part of itemParts(item)) {
    if (part.surface !== null) applySurface(part.geometry, part.surface);
    const list = bySurface.get(part.surface) ?? [];
    list.push(part.geometry);
    bySurface.set(part.surface, list);
  }
  const meshes: { geometry: THREE.BufferGeometry; surface: SurfaceName | null }[] = [];
  for (const [surfaceName, geometries] of bySurface) {
    meshes.push({ geometry: mergeGeometries(geometries), surface: surfaceName });
    for (const geometry of geometries) geometry.dispose();
  }
  return { meshes };
}

export interface LootView {
  /**
   * Show the items still lying there. `taken` is empty in modes without loot, which hides them
   * all. Returns true when something appeared or vanished, so shadows can be redrawn.
   */
  sync(taken: readonly boolean[]): boolean;
  dispose(): void;
}

/** Where one item's triangles sit inside a batch's index buffer. */
interface Slice {
  readonly batch: number;
  readonly start: number;
  readonly count: number;
}

export function buildLoot(map: GameMap, scene: THREE.Scene): LootView {
  const spawns: readonly LootSpawn[] = map.loot ?? [];
  const models = new Map<string, ItemModel>();
  const printed = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });

  // Every item on the map is merged into one mesh per surface, already in its place, so all the
  // loot costs a handful of draw calls however much of it there is. An item is hidden by
  // collapsing its own triangles in the shared index buffer.
  const pending = new Map<SurfaceName | null, { geometry: THREE.BufferGeometry; item: number }[]>();
  const transform = new THREE.Matrix4();
  spawns.forEach((spawn, index) => {
    const key = itemKey(spawn.item);
    let model = models.get(key);
    if (!model) {
      model = buildModel(spawn.item);
      models.set(key, model);
    }
    // Each item lies at its own angle, the same on every run.
    transform
      .makeRotationY(((index * 2.399963) % (Math.PI * 2)) - Math.PI)
      .setPosition(spawn.position.x, spawn.position.y, spawn.position.z);
    for (const part of model.meshes) {
      const list = pending.get(part.surface) ?? [];
      list.push({ geometry: part.geometry.clone().applyMatrix4(transform), item: index });
      pending.set(part.surface, list);
    }
  });
  for (const model of models.values()) {
    for (const part of model.meshes) part.geometry.dispose();
  }

  const batches: {
    mesh: THREE.Mesh;
    index: THREE.BufferAttribute;
    shown: Uint16Array | Uint32Array;
  }[] = [];
  const slices: Slice[][] = spawns.map(() => []);
  for (const [surfaceName, parts] of pending) {
    const geometry = mergeGeometries(parts.map((part) => part.geometry));
    let start = 0;
    for (const part of parts) {
      const count = part.geometry.getIndex()?.count ?? 0;
      slices[part.item]?.push({ batch: batches.length, start, count });
      start += count;
      part.geometry.dispose();
    }
    const index = geometry.getIndex();
    if (!index) continue;
    const mesh = new THREE.Mesh(geometry, surfaceName === null ? printed : surface(surfaceName));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    batches.push({ mesh, index, shown: (index.array as Uint16Array | Uint32Array).slice() });
  }

  // What is drawn now: nothing until the first sync.
  const lying = spawns.map(() => true);
  let anyVisible = false;

  return {
    sync(taken) {
      let changed = false;
      const visible = taken.length > 0;
      if (visible !== anyVisible) {
        anyVisible = visible;
        for (const batch of batches) batch.mesh.visible = visible;
        changed = true;
      }
      if (!visible) return changed;
      for (let item = 0; item < lying.length; item++) {
        const show = taken[item] === false;
        if (lying[item] === show) continue;
        lying[item] = show;
        changed = true;
        for (const slice of slices[item] ?? []) {
          const batch = batches[slice.batch];
          if (!batch) continue;
          const indices = batch.index.array;
          const end = slice.start + slice.count;
          // Hidden triangles all point at one vertex, so they have no area and draw nothing.
          if (show) indices.set(batch.shown.subarray(slice.start, end), slice.start);
          else indices.fill(0, slice.start, end);
          batch.index.needsUpdate = true;
        }
      }
      return changed;
    },
    dispose() {
      for (const batch of batches) {
        scene.remove(batch.mesh);
        batch.mesh.geometry.dispose();
      }
      printed.dispose();
    },
  };
}
