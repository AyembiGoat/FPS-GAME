import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnemyState } from '../core/enemy';
import type { GameMap } from '../core/map';
import { angleDelta, clamp } from '../core/vec';
import type { GameState } from '../core/game';
import { applySurface, softDot } from './materials';

/**
 * Hostile combatants, drawn as instanced figures so six of them cost four draw calls.
 *
 * The body is split into what has to move on its own: the two legs (walk cycle), the torso
 * and head (they turn to wherever the rifle is pointing) and the rifle itself. Every part is
 * one merged geometry with per-vertex colours, so fatigues, vest, helmet, skin-tone neck wrap
 * and boots share a single fabric material and still read as separate kit.
 */

/** Hip height the legs hang from. */
const HIP = 0.9;
const FALL_SECONDS = 0.55;
/** Seconds the muzzle flash is visible. */
const MUZZLE_SECONDS = 0.055;
const WALK_STRIDE = 0.78;

const COLOURS = {
  fatigue: 0x6d7359,
  fatigueDark: 0x5a6049,
  vest: 0x847e64,
  pouch: 0x706a52,
  helmet: 0x5e6452,
  wrap: 0xa2957c,
  boot: 0x3a3934,
  rifle: 0x33373c,
  furniture: 0x5f5c4c,
  hand: 0x9a8469,
} as const;

/**
 * A neutral woven cotton weave, close to white so per-vertex colours decide the kit. Using a
 * shared material for the body keeps six figures to four draw calls without flat plastic.
 */
function weaveTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const weave = ((x + y) % 4 === 0 ? 0.05 : 0) + ((x * 7 + y * 13) % 11 === 0 ? -0.06 : 0);
        const grain = (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) + 1) % 1;
        const shade = 0.86 + weave + (grain - 0.5) * 0.1;
        const value = Math.max(0, Math.min(1, shade)) * 255;
        const offset = (y * size + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value * 0.98;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function geometry(
  size: readonly [number, number, number],
  centre: readonly [number, number, number],
  colour: number,
  rotation?: readonly [number, number, number],
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (rotation)
    box.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
  box.translate(centre[0], centre[1], centre[2]);
  applySurface(box, 'sleeve');
  const count = box.getAttribute('position').count;
  const tint = new THREE.Color(colour);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return box;
}

function merge(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  // mergeGeometries returns null when attribute sets disagree, which the typings hide.
  const merged = mergeGeometries([...parts]);
  for (const part of parts) part.dispose();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see above.
  if (!merged) throw new Error('Could not merge a hostile body part');
  merged.computeBoundingSphere();
  return merged;
}

/** One leg, built hanging from the hip so it can swing from that point. */
function legGeometry(side: -1 | 1): THREE.BufferGeometry {
  const x = side * 0.105;
  return merge([
    geometry([0.16, 0.45, 0.19], [x, -0.22, 0], COLOURS.fatigue),
    geometry([0.17, 0.09, 0.2], [x, -0.44, -0.01], COLOURS.pouch),
    geometry([0.14, 0.42, 0.17], [x, -0.65, 0.01], COLOURS.fatigueDark),
    geometry([0.17, 0.1, 0.28], [x, -0.85, -0.045], COLOURS.boot),
    geometry([0.19, 0.05, 0.2], [x, -0.05, 0], COLOURS.fatigueDark),
  ]);
}

/** Everything above the hips, in the figure's own space with the feet at y = 0. */
function bodyGeometry(): THREE.BufferGeometry {
  return merge([
    // Torso, hips and shoulders: narrower than the kit, so the vest reads as a separate layer.
    geometry([0.36, 0.46, 0.22], [0, 1.14, 0], COLOURS.fatigue),
    geometry([0.4, 0.16, 0.24], [0, 0.9, 0], COLOURS.fatigueDark),
    geometry([0.13, 0.1, 0.2], [-0.235, 1.35, 0], COLOURS.fatigue),
    geometry([0.13, 0.1, 0.2], [0.235, 1.35, 0], COLOURS.fatigue),
    // Plate carrier, front pouches and sling.
    geometry([0.4, 0.36, 0.28], [0, 1.16, 0], COLOURS.vest),
    geometry([0.24, 0.09, 0.05], [0, 1.05, -0.155], COLOURS.pouch),
    geometry([0.11, 0.08, 0.05], [-0.13, 1.24, -0.15], COLOURS.pouch),
    geometry([0.09, 0.11, 0.05], [-0.13, 1.05, -0.16], COLOURS.fatigueDark),
    geometry([0.06, 0.46, 0.03], [-0.15, 1.14, -0.15], COLOURS.fatigueDark),
    geometry([0.41, 0.06, 0.25], [0, 0.96, 0], COLOURS.fatigueDark),
    // Arms: shoulders forward, elbows tucked, both hands onto the rifle.
    geometry([0.11, 0.3, 0.13], [0.245, 1.22, -0.06], COLOURS.fatigue, [-0.5, 0, 0]),
    geometry([0.1, 0.28, 0.11], [0.18, 1.12, -0.24], COLOURS.fatigueDark, [-1.15, 0.2, 0]),
    geometry([0.11, 0.3, 0.13], [-0.25, 1.22, -0.06], COLOURS.fatigue, [-0.5, 0, 0]),
    geometry([0.1, 0.3, 0.11], [-0.11, 1.18, -0.26], COLOURS.fatigueDark, [-1.2, -0.5, 0]),
    // Neck, head, helmet with a brim, and a dark visor band over the face.
    geometry([0.1, 0.08, 0.1], [0, 1.44, 0], COLOURS.wrap),
    geometry([0.18, 0.22, 0.2], [0, 1.59, 0], COLOURS.wrap),
    geometry([0.17, 0.06, 0.02], [0, 1.62, -0.101], COLOURS.boot),
    geometry([0.15, 0.07, 0.02], [0, 1.53, -0.101], COLOURS.pouch),
    geometry([0.22, 0.11, 0.24], [0, 1.72, 0.005], COLOURS.helmet),
    geometry([0.2, 0.04, 0.1], [0, 1.68, -0.08], COLOURS.helmet),
  ]);
}

/** The AK-pattern rifle and the hands on it, in the figure's own space. */
function rifleGeometry(): THREE.BufferGeometry {
  const merged = merge([
    geometry([0.055, 0.1, 0.42], [0.04, 1.3, -0.24], COLOURS.rifle),
    geometry([0.05, 0.13, 0.12], [0.04, 1.29, 0.01], COLOURS.rifle),
    geometry([0.035, 0.035, 0.34], [0.04, 1.32, -0.55], COLOURS.rifle),
    geometry([0.05, 0.05, 0.12], [0.04, 1.32, -0.73], COLOURS.rifle),
    geometry([0.05, 0.17, 0.09], [0.04, 1.19, -0.2], COLOURS.furniture),
    geometry([0.045, 0.12, 0.16], [0.04, 1.26, -0.42], COLOURS.furniture),
    geometry([0.07, 0.09, 0.2], [0.04, 1.27, 0.12], COLOURS.furniture),
    // Hands: one on the grip, one under the handguard.
    geometry([0.09, 0.1, 0.12], [0.05, 1.22, 0.01], COLOURS.hand),
    geometry([0.1, 0.09, 0.13], [0.02, 1.27, -0.44], COLOURS.hand),
  ]);
  // Angled across the chest, so the rifle silhouette reads from the front.
  const pivot = new THREE.Vector3(0.02, 1.27, -0.2);
  merged.applyMatrix4(
    new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationY(-0.22))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)),
  );
  merged.computeBoundingSphere();
  return merged;
}

function instanced(
  geometryPart: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometryPart, material, Math.max(count, 1));
  mesh.count = count;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Instanced bounds would be wrong: a hostile can walk well outside the merged body bounds.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export interface HostileView {
  /** Advance the figures to match the simulation. Returns true while anything is moving. */
  sync(state: GameState, dt: number): boolean;
  /** Flash the muzzle of the hostile at this index. */
  muzzle(index: number, state: GameState): void;
  /** Put every hostile back on its feet after a restart. */
  reset(state: GameState): void;
}

export function buildHostiles(map: GameMap, scene: THREE.Scene): HostileView {
  const count = map.enemySpawns.length;
  const weave = weaveTexture();
  const fabric = new THREE.MeshStandardMaterial({
    map: weave,
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
  });
  const steel = new THREE.MeshStandardMaterial({
    map: weave,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.32,
  });

  const leftLeg = instanced(legGeometry(-1), fabric, count);
  const rightLeg = instanced(legGeometry(1), fabric, count);
  const body = instanced(bodyGeometry(), fabric, count);
  const rifle = instanced(rifleGeometry(), steel, count);
  const parts = [leftLeg, rightLeg, body, rifle];
  for (const part of parts) scene.add(part);

  // Instance colours run the hit flash, so a struck hostile flashes without an outline.
  const flashColour = new THREE.Color(1.26, 1.18, 1.06);
  const calm = new THREE.Color(1, 1, 1);
  for (const part of parts) {
    for (let i = 0; i < count; i++) part.setColorAt(i, calm);
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
  }

  // A single sprite handles every muzzle flash in the level, and always faces the camera.
  const flashMaterial = new THREE.SpriteMaterial({
    map: softDot('rgba(255,236,196,0.95)', 'rgba(255,170,60,0)'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const flash = new THREE.Sprite(flashMaterial);
  flash.scale.setScalar(0.42);
  flash.visible = false;
  flash.renderOrder = 4;
  scene.add(flash);

  const walkPhase = new Float32Array(count);
  const fallTime = new Float32Array(count);
  const lastPosition = Array.from({ length: count }, () => new THREE.Vector3());
  const seeded = new Uint8Array(count);
  let flashTime = 0;
  const flashAt = new THREE.Vector3();
  const scratch = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3(1, 1, 1);
  const forward = new THREE.Vector3();

  function compose(enemy: EnemyState, index: number, tilt: number, legSwing: number) {
    const aim = clamp(angleDelta(enemy.yaw, enemy.aimYaw), -0.75, 0.75);
    const falling = tilt > 0;

    euler.set(tilt, enemy.yaw, 0, 'YXZ');
    quaternion.setFromEuler(euler);
    position.set(enemy.position.x, enemy.position.y, enemy.position.z);
    scratch.compose(position, quaternion, scale);

    for (const [mesh, side] of [
      [leftLeg, -1],
      [rightLeg, 1],
    ] as const) {
      local.makeTranslation(side * 0.11, HIP, 0);
      if (!falling) local.multiply(new THREE.Matrix4().makeRotationX(legSwing * side));
      local.premultiply(scratch);
      mesh.setMatrixAt(index, local);
    }

    local.makeRotationY(aim);
    local.premultiply(scratch);
    body.setMatrixAt(index, local);
    rifle.setMatrixAt(index, local);
  }

  function ease(t: number): number {
    const x = clamp(t, 0, 1);
    return 1 - (1 - x) * (1 - x);
  }

  function poseOf(enemy: EnemyState, index: number, dt: number): { tilt: number; swing: number } {
    if (!seeded[index]) {
      seeded[index] = 1;
      lastPosition[index]?.set(enemy.position.x, enemy.position.y, enemy.position.z);
      walkPhase[index] = (index * 0.37) % 1;
    }
    const last = lastPosition[index];
    if (!last) return { tilt: 0, swing: 0 };
    const moved = Math.hypot(enemy.position.x - last.x, enemy.position.z - last.z);
    last.set(enemy.position.x, enemy.position.y, enemy.position.z);

    if (enemy.behavior === 'dead') {
      fallTime[index] = Math.min(FALL_SECONDS, (fallTime[index] ?? 0) + dt);
      return { tilt: -ease((fallTime[index] ?? 0) / FALL_SECONDS) * 1.45, swing: 0 };
    }
    fallTime[index] = 0;

    walkPhase[index] = ((walkPhase[index] ?? 0) + moved / WALK_STRIDE) % 1;
    const phase = (walkPhase[index] ?? 0) * Math.PI * 2;
    const swing = moved > 0.0004 ? Math.sin(phase) * 0.42 : 0;
    return { tilt: 0, swing };
  }

  function applyColors(state: GameState) {
    for (let i = 0; i < count; i++) {
      const enemy = state.enemies[i];
      const lit = enemy !== undefined && enemy.hitFlash > 0;
      const colour = lit ? flashColour : calm;
      for (const part of parts) part.setColorAt(i, colour);
    }
    for (const part of parts) {
      if (part.instanceColor) part.instanceColor.needsUpdate = true;
    }
  }

  return {
    sync(state, dt) {
      let moving = false;
      for (let i = 0; i < count; i++) {
        const enemy = state.enemies[i];
        if (!enemy) continue;
        const pose = poseOf(enemy, i, dt);
        compose(enemy, i, pose.tilt, pose.swing);
        if (pose.swing !== 0 || pose.tilt !== 0) moving = true;
        if (enemy.hitFlash > 0) moving = true;
      }
      applyColors(state);
      for (const part of parts) part.instanceMatrix.needsUpdate = true;

      if (flashTime > 0) {
        flashTime = Math.max(0, flashTime - dt);
        flashMaterial.opacity = flashTime / MUZZLE_SECONDS;
        if (flashTime === 0) flash.visible = false;
      }
      return moving;
    },

    muzzle(index, state) {
      const enemy = state.enemies[index];
      if (!enemy) return;
      const aim = clamp(angleDelta(enemy.yaw, enemy.aimYaw), -0.75, 0.75);
      const yaw = enemy.yaw + aim;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      flashAt.set(
        enemy.position.x + forward.x * 0.82 - Math.cos(yaw) * 0.05,
        enemy.position.y + 1.33,
        enemy.position.z + forward.z * 0.82 + Math.sin(yaw) * 0.05,
      );
      flash.position.copy(flashAt);
      flash.visible = true;
      flashTime = MUZZLE_SECONDS;
    },

    reset(state) {
      for (let i = 0; i < count; i++) {
        seeded[i] = 0;
        fallTime[i] = 0;
        walkPhase[i] = 0;
      }
      flash.visible = false;
      flashTime = 0;
      this.sync(state, 0);
    },
  };
}
