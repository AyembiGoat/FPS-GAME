import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnemyState } from '../core/enemy';
import type { EnemyArchetype } from '../core/map';
import type { WeaponId } from '../core/weapon';
import type { SurfaceName } from './materials';
import { applySurface, softDot, surface } from './materials';

/**
 * Procedural 3D human tactical combatant builder & articulated pose animator.
 *
 * Proportions match `ENEMY_BODY` hitboxes (`1.78 m` standing height, `0.88 m` hip height,
 * `1.48..1.78 m` head/helmet crown) and reuse shared `src/game/materials` PBR recipes.
 *
 * Performance architecture:
 * - Geometries are pre-merged per articulated sub-rig (`torso`, `head`, `leftLeg`, `rightLeg`,
 *   `armsAndWeapon`) and cached per `(archetype, weaponId)` so spawning 10–12 combatants
 *   allocates almost zero extra GPU geometry buffers and keeps draw calls low.
 */

interface PartSpec {
  readonly surface: SurfaceName;
  readonly geo: THREE.BufferGeometry;
}

function boxPart(
  mat: SurfaceName,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): PartSpec {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    const euler = new THREE.Euler(rx, ry, rz);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
  }
  geo.translate(x, y, z);
  applySurface(geo, mat);
  return { surface: mat, geo };
}

function cylPart(
  mat: SurfaceName,
  rTop: number,
  rBot: number,
  len: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  seg = 10,
): PartSpec {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, seg);
  if (rx !== 0 || ry !== 0 || rz !== 0) {
    const euler = new THREE.Euler(rx, ry, rz);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
  }
  geo.translate(x, y, z);
  applySurface(geo, mat);
  return { surface: mat, geo };
}

function sphereDomePart(
  mat: SurfaceName,
  radius: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  x: number,
  y: number,
  z: number,
): PartSpec {
  const geo = new THREE.SphereGeometry(radius, 12, 8);
  geo.scale(scaleX, scaleY, scaleZ);
  geo.translate(x, y, z);
  applySurface(geo, mat);
  return { surface: mat, geo };
}

interface MergedSegment {
  readonly surface: SurfaceName;
  readonly geometry: THREE.BufferGeometry;
}

function compileParts(parts: readonly PartSpec[]): MergedSegment[] {
  const buckets = new Map<SurfaceName, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const list = buckets.get(p.surface) ?? [];
    list.push(p.geo);
    buckets.set(p.surface, list);
  }
  const compiled: MergedSegment[] = [];
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    compiled.push({ surface: mat, geometry: merged });
  }
  return compiled;
}

function attachSegments(parent: THREE.Group, segments: readonly MergedSegment[]): void {
  for (const seg of segments) {
    const mesh = new THREE.Mesh(seg.geometry, surface(seg.surface));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

interface ArchetypePalette {
  readonly uniform: SurfaceName;
  readonly carrier: SurfaceName;
  readonly helmet: SurfaceName;
  readonly trim: SurfaceName;
}

function paletteFor(archetype: EnemyArchetype): ArchetypePalette {
  switch (archetype) {
    case 'breacher':
      return {
        uniform: 'opfor-cloth',
        carrier: 'polymer-black',
        helmet: 'polymer-black',
        trim: 'cordura-crimson',
      };
    case 'marksman':
      return {
        uniform: 'sleeve',
        carrier: 'anodized-fde',
        helmet: 'anodized-fde',
        trim: 'cordura-crimson',
      };
    case 'assaulter':
    default:
      return {
        uniform: 'opfor-cloth',
        carrier: 'chassis-od',
        helmet: 'steel-dark',
        trim: 'cordura-crimson',
      };
  }
}

function buildTorsoParts(pal: ArchetypePalette): PartSpec[] {
  // Local origin at hip pivot `y = 0` (placed at `y = 0.88` in root space).
  // Spans pelvis (`-0.06..0.08`) up to shoulders (`0.58`, i.e. `1.46 m` world height).
  return [
    // Pelvis & tactical battle belt
    boxPart(pal.uniform, 0.34, 0.14, 0.22, 0, 0.01, 0),
    boxPart('polymer-black', 0.36, 0.065, 0.24, 0, 0.07, 0),
    // Side dump pouch & pistol holster on belt
    boxPart(pal.carrier, 0.07, 0.14, 0.11, 0.19, -0.02, 0.01),
    boxPart('polymer-black', 0.06, 0.13, 0.09, -0.19, 0.01, -0.02),
    // Core combat shirt upper torso
    boxPart(pal.uniform, 0.35, 0.46, 0.22, 0, 0.31, 0),
    // Plate carrier front & rear ballistic plates (`0.31 m` wide × `0.36 m` tall)
    boxPart(pal.carrier, 0.31, 0.35, 0.055, 0, 0.33, -0.115),
    boxPart(pal.carrier, 0.3, 0.35, 0.06, 0, 0.33, 0.115),
    // Cummerbund side straps
    boxPart(pal.carrier, 0.37, 0.14, 0.21, 0, 0.24, 0),
    // Shoulder straps + crimson tactical ID band on left shoulder/chest
    boxPart(pal.carrier, 0.075, 0.06, 0.24, -0.11, 0.52, 0),
    boxPart(pal.carrier, 0.075, 0.06, 0.24, 0.11, 0.52, 0),
    boxPart(pal.trim, 0.11, 0.045, 0.018, 0, 0.43, -0.146),
    // Three front rifle magazine pouches along chest rig
    boxPart(pal.carrier, 0.072, 0.14, 0.042, -0.09, 0.24, -0.152),
    boxPart(pal.carrier, 0.072, 0.14, 0.042, 0, 0.24, -0.152),
    boxPart(pal.carrier, 0.072, 0.14, 0.042, 0.09, 0.24, -0.152),
    // Rear hydration/radio pack + short whip antenna
    boxPart(pal.carrier, 0.22, 0.26, 0.075, 0, 0.34, 0.165),
    cylPart('polymer-black', 0.006, 0.008, 0.28, -0.09, 0.58, 0.15),
  ];
}

function buildHeadParts(pal: ArchetypePalette): PartSpec[] {
  // Local origin at neck base `y = 0` (placed at `y = 0.58` inside torso -> `1.46 m` world height).
  // Crown reaches `+0.31 m` (`1.77 m` world height), matching `head: 1.48..1.78 m` hitbox!
  return [
    // Neck gaiter / collar
    cylPart('glove', 0.068, 0.078, 0.09, 0, 0.04, 0),
    // Balaclava / lower face mask
    sphereDomePart('glove', 0.105, 0.92, 1.08, 0.98, 0, 0.15, -0.005),
    // Dark ballistic wraparound eye-shield / goggles
    boxPart('gun-steel', 0.175, 0.052, 0.08, 0, 0.175, -0.072),
    boxPart('polymer-black', 0.185, 0.016, 0.18, 0, 0.175, -0.01),
    // High-cut FAST ballistic helmet shell
    sphereDomePart(pal.helmet, 0.132, 0.96, 0.92, 1.04, 0, 0.205, 0.005),
    // Helmet brim & side ARC accessory rails + ear-pro headset cups
    boxPart(pal.helmet, 0.23, 0.032, 0.24, 0, 0.205, -0.008),
    boxPart('polymer-black', 0.045, 0.085, 0.085, -0.118, 0.155, 0.01),
    boxPart('polymer-black', 0.045, 0.085, 0.085, 0.118, 0.155, 0.01),
    // Front NVG mount shroud + rear counterweight pack + crimson ID velcro strip
    boxPart('steel-dark', 0.052, 0.048, 0.025, 0, 0.235, -0.132),
    boxPart('polymer-black', 0.085, 0.05, 0.03, 0, 0.19, 0.132),
    boxPart(pal.trim, 0.075, 0.028, 0.012, 0, 0.22, 0.145),
  ];
}

function buildLegParts(pal: ArchetypePalette, side: -1 | 1): PartSpec[] {
  // Local origin at hip socket `(0, 0, 0)`, hanging down to `-0.88 m` (boot sole at `y = -0.88`).
  return [
    // Thigh + cargo pocket
    cylPart(pal.uniform, 0.086, 0.072, 0.4, 0, -0.2, 0, 0, 0, 0, 10),
    boxPart(pal.uniform, 0.035, 0.15, 0.12, side * 0.078, -0.21, 0),
    // Tactical hardshell knee pad
    boxPart('polymer-black', 0.105, 0.1, 0.05, 0, -0.41, -0.058),
    // Calf / trouser leg
    cylPart(pal.uniform, 0.07, 0.056, 0.36, 0, -0.58, 0.008, 0, 0, 0, 10),
    // Combat boot ankle & sole
    boxPart('glove', 0.11, 0.11, 0.16, 0, -0.81, -0.015),
    boxPart('polymer-black', 0.116, 0.055, 0.23, 0, -0.852, -0.045),
  ];
}

interface WeaponRigResult {
  readonly segments: MergedSegment[];
  readonly muzzleOffset: THREE.Vector3;
}

function buildWeaponAndArmsParts(pal: ArchetypePalette, weaponId: WeaponId): WeaponRigResult {
  // Local origin at chest/shoulder pivot `(0, 0, 0)` placed at `(0, 0.46, 0)` in torso (`y = 1.34 m` world).
  // Forward is `-Z` so yaw 0 points down `-Z` cleanly!
  const parts: PartSpec[] = [
    // Right shoulder deltoid + upper arm + forearm tucked into firing pocket
    boxPart(pal.trim, 0.085, 0.095, 0.095, 0.2, 0.02, 0), // Shoulder patch accent
    cylPart(pal.uniform, 0.056, 0.048, 0.27, 0.185, -0.08, -0.07, 0.65, -0.18, -0.12),
    cylPart(pal.uniform, 0.046, 0.04, 0.24, 0.11, -0.15, -0.22, 1.28, -0.35, 0),
    boxPart('glove', 0.062, 0.068, 0.085, 0.065, -0.13, -0.31),

    // Left shoulder + support arm reaching forward to handguard
    cylPart(pal.uniform, 0.056, 0.048, 0.28, -0.185, -0.07, -0.09, 0.85, 0.24, 0.14),
    cylPart(pal.uniform, 0.046, 0.039, 0.27, -0.09, -0.11, -0.32, 1.38, 0.36, 0),
    boxPart('glove', 0.062, 0.064, 0.09, 0.035, -0.075, -0.49),
  ];

  // Compact high-contrast firearm held in the firing pocket (`x = 0.055`, `y = -0.05`, extending `-Z`).
  const gx = 0.055;
  const gy = -0.05;
  let muzzleZ: number;

  if (weaponId === 'ak47') {
    muzzleZ = -0.88;
    parts.push(
      boxPart('ak-wood', 0.042, 0.09, 0.23, gx, gy - 0.02, -0.12, 0.12, 0, 0), // Wood stock
      boxPart('steel-dark', 0.046, 0.078, 0.25, gx, gy, -0.35), // Receiver
      boxPart('steel-dark', 0.036, 0.17, 0.065, gx, gy - 0.11, -0.38, 0.32, 0, 0), // Banana mag
      boxPart('ak-wood', 0.046, 0.065, 0.19, gx, gy + 0.005, -0.56), // Wood handguard
      cylPart('gun-steel', 0.012, 0.014, 0.26, gx, gy + 0.015, -0.76, Math.PI / 2, 0, 0, 8),
    );
  } else if (weaponId === 'scar-h') {
    muzzleZ = -0.92;
    parts.push(
      boxPart('anodized-fde', 0.048, 0.1, 0.24, gx, gy - 0.01, -0.12),
      boxPart('anodized-fde', 0.05, 0.092, 0.42, gx, gy + 0.01, -0.44),
      boxPart('steel-dark', 0.036, 0.15, 0.075, gx, gy - 0.1, -0.38), // 7.62 straight mag
      cylPart('polymer-black', 0.022, 0.022, 0.16, gx, gy + 0.075, -0.38, Math.PI / 2, 0, 0, 8), // ACOG
      cylPart('gun-steel', 0.013, 0.015, 0.28, gx, gy + 0.01, -0.78, Math.PI / 2, 0, 0, 8),
    );
  } else if (weaponId === 'mp5') {
    muzzleZ = -0.68;
    parts.push(
      boxPart('polymer-black', 0.04, 0.08, 0.2, gx, gy - 0.01, -0.12),
      boxPart('gun-steel', 0.044, 0.078, 0.24, gx, gy + 0.005, -0.34),
      boxPart('polymer-black', 0.026, 0.15, 0.045, gx, gy - 0.1, -0.38, 0.22, 0, 0),
      cylPart('polymer-black', 0.024, 0.024, 0.16, gx, gy + 0.005, -0.54, Math.PI / 2, 0, 0, 8),
      cylPart('gun-steel', 0.012, 0.012, 0.09, gx, gy + 0.01, -0.64, Math.PI / 2, 0, 0, 8),
    );
  } else if (weaponId === 'remington-870') {
    muzzleZ = -0.9;
    parts.push(
      boxPart('polymer-black', 0.044, 0.09, 0.25, gx, gy - 0.02, -0.12, 0.12, 0, 0),
      boxPart('steel-dark', 0.046, 0.075, 0.22, gx, gy + 0.005, -0.34),
      boxPart('walnut', 0.052, 0.055, 0.18, gx, gy - 0.015, -0.56), // Pump forend
      cylPart('gun-steel', 0.015, 0.015, 0.46, gx, gy + 0.02, -0.67, Math.PI / 2, 0, 0, 8),
      cylPart('steel-dark', 0.014, 0.014, 0.38, gx, gy - 0.012, -0.63, Math.PI / 2, 0, 0, 8),
    );
  } else {
    // HK416 tactical carbine default
    muzzleZ = -0.84;
    parts.push(
      boxPart('polymer-black', 0.044, 0.095, 0.22, gx, gy - 0.01, -0.12),
      boxPart('gun-steel', 0.048, 0.085, 0.24, gx, gy + 0.008, -0.34),
      boxPart('polymer-black', 0.034, 0.15, 0.065, gx, gy - 0.1, -0.37, 0.16, 0, 0),
      boxPart('gun-steel', 0.048, 0.068, 0.22, gx, gy + 0.012, -0.56),
      boxPart('polymer-black', 0.042, 0.048, 0.075, gx, gy + 0.068, -0.35), // Holo optic
      cylPart('gun-steel', 0.012, 0.014, 0.2, gx, gy + 0.012, -0.75, Math.PI / 2, 0, 0, 8),
    );
  }

  return {
    segments: compileParts(parts),
    muzzleOffset: new THREE.Vector3(gx, gy + 0.012, muzzleZ),
  };
}

interface CompiledEnemyTemplate {
  readonly torso: MergedSegment[];
  readonly head: MergedSegment[];
  readonly leftLeg: MergedSegment[];
  readonly rightLeg: MergedSegment[];
  readonly weaponRig: WeaponRigResult;
}

const templateCache = new Map<string, CompiledEnemyTemplate>();

function getTemplate(archetype: EnemyArchetype, weaponId: WeaponId): CompiledEnemyTemplate {
  const key = `${archetype}:${weaponId}`;
  const existing = templateCache.get(key);
  if (existing) return existing;

  const pal = paletteFor(archetype);
  const compiled: CompiledEnemyTemplate = {
    torso: compileParts(buildTorsoParts(pal)),
    head: compileParts(buildHeadParts(pal)),
    leftLeg: compileParts(buildLegParts(pal, -1)),
    rightLeg: compileParts(buildLegParts(pal, 1)),
    weaponRig: buildWeaponAndArmsParts(pal, weaponId),
  };
  templateCache.set(key, compiled);
  return compiled;
}

let sharedFlashMaterial: THREE.MeshBasicMaterial | null = null;
let sharedFlashQuad: THREE.PlaneGeometry | null = null;

function getMuzzleFlashAssets() {
  if (!sharedFlashMaterial) {
    sharedFlashMaterial = new THREE.MeshBasicMaterial({
      map: softDot('rgba(255, 245, 200, 1)', 'rgba(255, 130, 30, 0)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  if (!sharedFlashQuad) {
    sharedFlashQuad = new THREE.PlaneGeometry(0.28, 0.28);
  }
  return { mat: sharedFlashMaterial, geo: sharedFlashQuad };
}

interface EnemyActor {
  readonly id: string;
  readonly root: THREE.Group;
  readonly pelvisPivot: THREE.Group;
  readonly torsoPivot: THREE.Group;
  readonly headPivot: THREE.Group;
  readonly leftLegPivot: THREE.Group;
  readonly rightLegPivot: THREE.Group;
  readonly weaponPivot: THREE.Group;
  readonly flashGroup: THREE.Group;
}

function createEnemyActor(enemy: EnemyState): EnemyActor {
  const tpl = getTemplate(enemy.archetype, enemy.weaponId);

  const root = new THREE.Group();
  const pelvisPivot = new THREE.Group();
  pelvisPivot.position.set(0, 0.88, 0);
  root.add(pelvisPivot);

  const torsoPivot = new THREE.Group();
  attachSegments(torsoPivot, tpl.torso);
  pelvisPivot.add(torsoPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.58, 0);
  attachSegments(headPivot, tpl.head);
  torsoPivot.add(headPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.095, 0, 0);
  attachSegments(leftLegPivot, tpl.leftLeg);
  pelvisPivot.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.095, 0, 0);
  attachSegments(rightLegPivot, tpl.rightLeg);
  pelvisPivot.add(rightLegPivot);

  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0, 0.46, 0);
  attachSegments(weaponPivot, tpl.weaponRig.segments);
  torsoPivot.add(weaponPivot);

  const { mat, geo } = getMuzzleFlashAssets();
  const flashGroup = new THREE.Group();
  flashGroup.position.copy(tpl.weaponRig.muzzleOffset);
  const f1 = new THREE.Mesh(geo, mat);
  const f2 = new THREE.Mesh(geo, mat);
  f2.rotation.y = Math.PI / 2;
  const f3 = new THREE.Mesh(geo, mat);
  f3.rotation.x = Math.PI / 2;
  flashGroup.add(f1, f2, f3);
  flashGroup.visible = false;
  weaponPivot.add(flashGroup);

  return {
    id: enemy.id,
    root,
    pelvisPivot,
    torsoPivot,
    headPivot,
    leftLegPivot,
    rightLegPivot,
    weaponPivot,
    flashGroup,
  };
}

export interface EnemyCrowd {
  /** Sync 3D combatant meshes to current `enemies` array; returns true when shadow-casters moved. */
  sync(enemies: readonly EnemyState[], elapsedTime: number): boolean;
  dispose(): void;
}

export function createEnemyCrowd(scene: THREE.Scene): EnemyCrowd {
  const container = new THREE.Group();
  scene.add(container);

  const actors = new Map<string, EnemyActor>();
  let prevAliveCount = -1;

  return {
    sync(enemies, elapsedTime) {
      let shadowsMoved = false;

      // Remove stale actors if mode switched to Range (`enemies.length === 0`) or match restarted with new roster.
      const wantedIds = new Set(enemies.map((e) => e.id));
      for (const [id, actor] of actors) {
        if (!wantedIds.has(id)) {
          container.remove(actor.root);
          actors.delete(id);
          shadowsMoved = true;
        }
      }

      let aliveCount = 0;

      for (let i = 0; i < enemies.length; i++) {
        const state = enemies[i];
        if (!state) continue;
        let actor = actors.get(state.id);
        if (!actor) {
          actor = createEnemyActor(state);
          actors.set(state.id, actor);
          container.add(actor.root);
          shadowsMoved = true;
        }

        const speed = Math.hypot(state.velocity.x, state.velocity.z);
        if (speed > 0.05) shadowsMoved = true;

        actor.root.position.set(state.position.x, state.position.y, state.position.z);
        actor.root.rotation.set(0, state.yaw, 0);

        if (!state.alive) {
          // Grounded tactical collapse onto concrete floor (`deathProgress: 0..1`).
          const t = Math.min(1, state.deathProgress);
          const ease = 1 - Math.pow(1 - t, 3);
          const fallSide = i % 2 === 0 ? 1 : -1;

          actor.pelvisPivot.position.y = 0.88 * (1 - ease * 0.82);
          actor.pelvisPivot.rotation.set(-ease * 1.48, 0, fallSide * ease * 0.24);
          actor.torsoPivot.rotation.set(-ease * 0.12, fallSide * ease * 0.18, 0);
          actor.headPivot.rotation.set(ease * 0.22, fallSide * ease * 0.32, 0);
          actor.leftLegPivot.rotation.set(ease * 0.18, 0, -ease * 0.12);
          actor.rightLegPivot.rotation.set(-ease * 0.12, 0, ease * 0.15);
          actor.weaponPivot.rotation.set(
            -0.35 * ease,
            fallSide * 0.4 * ease,
            fallSide * 0.6 * ease,
          );
          actor.flashGroup.visible = false;
          if (t < 1) shadowsMoved = true;
          continue;
        }

        aliveCount++;

        // Crouch / cover tuck compression
        const crouchOffset = state.crouched ? -0.34 : 0;
        const strideAmp = Math.min(1, speed / 3.8) * 0.58;
        const bob = Math.abs(Math.sin(state.walkPhase)) * strideAmp * 0.045;
        const breath = Math.sin(elapsedTime * 2.1 + i * 1.3) * 0.008;

        actor.pelvisPivot.position.set(0, 0.88 + crouchOffset + bob, 0);
        actor.pelvisPivot.rotation.set(0, 0, 0);

        // Leg stride swing + crouched knee bend
        const legSwing = Math.sin(state.walkPhase) * strideAmp;
        const crouchLegPitch = state.crouched ? -0.52 : 0;
        actor.leftLegPivot.rotation.set(crouchLegPitch + legSwing, 0, 0);
        actor.rightLegPivot.rotation.set(crouchLegPitch - legSwing, 0, 0);

        // Upper torso lean + hit flinch reaction
        const flinch = state.hitReact;
        const forwardLean =
          (state.crouched ? 0.28 : 0.06) + Math.min(0.12, speed * 0.022) - flinch * 0.24;
        const torsoTwist =
          (state.aiState === 'engage' ? -0.14 : 0) + (i % 2 === 0 ? 1 : -1) * flinch * 0.22;
        actor.torsoPivot.rotation.set(forwardLean + breath, torsoTwist, 0);

        // Head tracks aim pitch + subtle patrol scan when unengaged
        const patrolScan =
          state.aiState === 'patrol' ? Math.sin(elapsedTime * 1.15 + i * 2.1) * 0.22 : 0;
        actor.headPivot.rotation.set(
          state.pitch * 0.55 - forwardLean * 0.6 + flinch * 0.18,
          patrolScan - torsoTwist * 0.5,
          0,
        );

        // Weapon & arms stance:
        // - `engage` / `alert`: rifle raised cleanly into shoulder pocket tracking `state.pitch`
        // - `reloadRemaining > 0`: dipped down/inward (`-0.52 rad` pitch) for clear visual reload read
        // - `patrol`: calm tactical low-ready (`-0.28 rad` pitch)
        let gunPitch = state.pitch - forwardLean * 0.75;
        let gunRoll = 0;
        if (state.reloadRemaining > 0) {
          gunPitch = -0.55;
          gunRoll = 0.35;
        } else if (state.aiState === 'patrol') {
          gunPitch = -0.28 + breath * 1.5;
        }
        // Recoil kick on enemy muzzle flash
        const kickBack = state.muzzleFlash * 0.045;
        actor.weaponPivot.position.set(0, 0.46, kickBack);
        actor.weaponPivot.rotation.set(
          gunPitch + state.muzzleFlash * 0.08,
          -torsoTwist * 0.6,
          gunRoll,
        );

        // Muzzle flash visibility
        if (state.muzzleFlash > 0.15) {
          actor.flashGroup.visible = true;
          const s = 0.7 + state.muzzleFlash * 0.65;
          actor.flashGroup.scale.setScalar(s);
          actor.flashGroup.rotation.z = state.muzzleFlash * 6.2;
        } else {
          actor.flashGroup.visible = false;
        }
      }

      if (aliveCount !== prevAliveCount) {
        prevAliveCount = aliveCount;
        shadowsMoved = true;
      }

      return shadowsMoved;
    },

    dispose() {
      container.clear();
      scene.remove(container);
      actors.clear();
    },
  };
}
