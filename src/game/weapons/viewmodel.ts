import * as THREE from 'three';
import type { OpticId, WeaponSpec } from '../../core/weapon';
import { clampWeaponOptic } from '../../core/weapon';
import { createArms } from './arms';
import type { Arms } from './arms';
import { buildWeaponModel } from './index';
import type { RecoilProfile, WeaponModel } from './model';

/**
 * First-person weapon animation rig: multi-spring recoil physics, figure-8 organic breathing
 * & stride bob, strafe banking, jump/land weight dip, tactical angled sprint carry,
 * multi-beat reload choreography with seating punch, physical bolt/pump hand actuation
 * with action-timed casing ejection, multi-fin muzzle flash + side brake jets, and
 * barrel heat smoke.
 */

export interface ViewmodelMotion {
  /** Horizontal speed along the floor, m/s. */
  readonly speed: number;
  /** Lateral speed along player right (+X) for strafe banking, m/s. */
  readonly strafeSpeed: number;
  /** Vertical velocity for jump/land feel, m/s. */
  readonly verticalSpeed: number;
  readonly grounded: boolean;
  /** True when sprinting forward. */
  readonly sprinting: boolean;
  /** Look angle change since the previous frame, radians. */
  readonly yawDelta: number;
  readonly pitchDelta: number;
  /** Reload progress, 0 to 1, or 0 when not reloading. */
  readonly reload: number;
  /** Whether the current reload started from an empty magazine. */
  readonly reloadEmpty: boolean;
  /** 0 at hip, 1 on the sights. */
  readonly aim: number;
  /** 0 to 1 draw/equip animation progress (0 = hidden low, 1 = fully ready). */
  readonly equip: number;
  /** True when holding a round in the chamber; false locks the slide back. */
  readonly hasRounds: boolean;
  /** Lean fraction, -1 left .. +1 right. */
  readonly lean: number;
  /** Hide the gun/arms completely when looking through a magnified scope overlay. */
  readonly scopeHidden?: boolean;
}

export interface CameraRecoilKick {
  readonly pitch: number;
  readonly roll: number;
}

interface Spring1D {
  value: number;
  velocity: number;
}

function stepSpring(s: Spring1D, target: number, stiffness: number, damping: number, dt: number) {
  const force = (target - s.value) * stiffness - s.velocity * damping;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  return s.value;
}

interface RecoilTuning {
  kickZ: number;
  kickPitch: number;
  kickRoll: number;
  kickYaw: number;
  stiffnessZ: number;
  dampingZ: number;
  stiffnessRot: number;
  dampingRot: number;
  cameraPitch: number;
  cameraRoll: number;
  flashScale: number;
}

const RECOIL_TUNING: Record<RecoilProfile, RecoilTuning> = {
  carbine: {
    kickZ: 0.036,
    kickPitch: 0.095,
    kickRoll: 0.045,
    kickYaw: 0.018,
    stiffnessZ: 280,
    dampingZ: 24,
    stiffnessRot: 220,
    dampingRot: 21,
    cameraPitch: 0.0045,
    cameraRoll: 0.0022,
    flashScale: 1.0,
  },
  'heavy-rifle': {
    kickZ: 0.052,
    kickPitch: 0.145,
    kickRoll: 0.068,
    kickYaw: 0.026,
    stiffnessZ: 230,
    dampingZ: 21,
    stiffnessRot: 185,
    dampingRot: 19,
    cameraPitch: 0.0085,
    cameraRoll: 0.0042,
    flashScale: 1.25,
  },
  smg: {
    kickZ: 0.024,
    kickPitch: 0.062,
    kickRoll: 0.035,
    kickYaw: 0.015,
    stiffnessZ: 340,
    dampingZ: 27,
    stiffnessRot: 270,
    dampingRot: 24,
    cameraPitch: 0.0026,
    cameraRoll: 0.0016,
    flashScale: 0.72,
  },
  shotgun: {
    kickZ: 0.088,
    kickPitch: 0.24,
    kickRoll: 0.09,
    kickYaw: 0.03,
    stiffnessZ: 175,
    dampingZ: 18,
    stiffnessRot: 150,
    dampingRot: 17,
    cameraPitch: 0.016,
    cameraRoll: 0.006,
    flashScale: 1.55,
  },
  sniper: {
    kickZ: 0.095,
    kickPitch: 0.23,
    kickRoll: 0.075,
    kickYaw: 0.022,
    stiffnessZ: 165,
    dampingZ: 18,
    stiffnessRot: 145,
    dampingRot: 17,
    cameraPitch: 0.019,
    cameraRoll: 0.0055,
    flashScale: 1.75,
  },
  pistol: {
    kickZ: 0.032,
    kickPitch: 0.125,
    kickRoll: 0.04,
    kickYaw: 0.014,
    stiffnessZ: 310,
    dampingZ: 25,
    stiffnessRot: 250,
    dampingRot: 22,
    cameraPitch: 0.0042,
    cameraRoll: 0.0018,
    flashScale: 0.8,
  },
  'hand-cannon': {
    kickZ: 0.064,
    kickPitch: 0.27,
    kickRoll: 0.095,
    kickYaw: 0.028,
    stiffnessZ: 210,
    dampingZ: 19,
    stiffnessRot: 175,
    dampingRot: 18,
    cameraPitch: 0.0135,
    cameraRoll: 0.0055,
    flashScale: 1.45,
  },
};

function flashTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, 'rgba(255, 255, 240, 1)');
    grad.addColorStop(0.24, 'rgba(255, 232, 150, 0.94)');
    grad.addColorStop(0.55, 'rgba(255, 148, 42, 0.45)');
    grad.addColorStop(1, 'rgba(255, 80, 10, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smokeTexture(): THREE.CanvasTexture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 4, half, half, half);
    grad.addColorStop(0, 'rgba(215, 218, 224, 0.34)');
    grad.addColorStop(0.5, 'rgba(185, 190, 198, 0.14)');
    grad.addColorStop(1, 'rgba(160, 165, 175, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Smooth 0 -> 1 -> 0 over [from, to], zero outside. */
function pulse(t: number, from: number, to: number): number {
  if (t <= from || t >= to) return 0;
  return Math.sin(((t - from) / (to - from)) * Math.PI);
}

/** 0 before `from`, 1 after `to`, smooth cubic in between. */
function ramp(t: number, from: number, to: number): number {
  const u = THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
  return u * u * (3 - 2 * u);
}

function createMuzzleFlash(hasBrake: boolean) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: flashTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  // Forward flame cone (3 intersecting elongated star fins).
  const finGeom = new THREE.PlaneGeometry(0.11, 0.21);
  finGeom.translate(0, 0.085, 0);
  finGeom.rotateX(-Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeom, mat);
    fin.rotation.z = (i * Math.PI) / 3;
    group.add(fin);
  }

  // Bright star cross facing camera along muzzle plane.
  const starGeom = new THREE.PlaneGeometry(0.15, 0.15);
  const starA = new THREE.Mesh(starGeom, mat);
  const starB = new THREE.Mesh(starGeom, mat);
  starB.rotation.z = Math.PI / 4;
  group.add(starA, starB);

  // Twin side horizontal gas jets on heavy muzzle-brake rifles (SCAR-H, AWM).
  if (hasBrake) {
    const jetGeom = new THREE.PlaneGeometry(0.08, 0.19);
    jetGeom.rotateZ(Math.PI / 2);
    const jetH = new THREE.Mesh(jetGeom, mat);
    jetH.position.set(0, 0, 0.015);
    const jetV = new THREE.Mesh(jetGeom, mat);
    jetV.rotation.x = Math.PI / 2;
    jetV.position.set(0, 0, 0.015);
    group.add(jetH, jetV);
  }

  group.visible = false;
  return group;
}

interface BuiltWeaponRig {
  readonly spec: WeaponSpec;
  readonly opticId: OpticId;
  readonly model: WeaponModel;
  readonly arms: Arms;
  readonly container: THREE.Group;
  readonly gunAnchor: THREE.Group;
  readonly flash: THREE.Group;
  readonly smoke: THREE.Sprite;
  readonly smokeMat: THREE.SpriteMaterial;
  readonly aimPosition: THREE.Vector3;
  readonly hipPosition: THREE.Vector3;
  readonly hipRotation: THREE.Euler;
  readonly magRest: THREE.Vector3;
  readonly slideRest: THREE.Vector3;
  readonly tuning: RecoilTuning;
  readonly isPistol: boolean;
}

function buildWeaponRig(spec: WeaponSpec, opticId: OpticId): BuiltWeaponRig {
  const model = buildWeaponModel(spec, opticId);
  const arms = createArms(model);

  const container = new THREE.Group();
  const gunAnchor = new THREE.Group();
  gunAnchor.add(model.root);
  container.add(gunAnchor, arms.group);

  const flash = createMuzzleFlash(model.muzzleBrake === true);
  model.muzzle.add(flash);

  const smokeMat = new THREE.SpriteMaterial({
    map: smokeTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.scale.set(0.06, 0.06, 1);
  smoke.visible = false;
  model.muzzle.add(smoke);

  // Exact ADS position puts `model.sight` at (0, 0, -model.aimDistance) in view space.
  model.root.updateMatrixWorld(true);
  const sightInGun = model.sight.getWorldPosition(new THREE.Vector3());
  const aimPosition = new THREE.Vector3(
    -sightInGun.x,
    -sightInGun.y,
    -sightInGun.z - model.aimDistance,
  );

  const profile: RecoilProfile = model.recoilProfile ?? 'carbine';
  const tuning = RECOIL_TUNING[profile];
  const isPistol = spec.slot === 'secondary';

  return {
    spec,
    opticId,
    model,
    arms,
    container,
    gunAnchor,
    flash,
    smoke,
    smokeMat,
    aimPosition,
    hipPosition: model.hip.position.clone(),
    hipRotation: model.hip.rotation.clone(),
    magRest: model.magazine.position.clone(),
    slideRest: model.slide ? model.slide.position.clone() : new THREE.Vector3(),
    tuning,
    isPistol,
  };
}

/**
 * The player's equipped weapon & arms rig, rendered in its own camera-local viewmodel
 * scene so it never clips into walls and receives crisp local sun + muzzle illumination.
 */
export function createViewmodel(
  initialSpec: WeaponSpec,
  environment: THREE.Texture | null,
  initialOptic?: OpticId,
) {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.012, 4);

  // Viewmodel lighting tracks the outdoor sun direction plus sky hemisphere fill.
  const hemi = new THREE.HemisphereLight(0xb2a696, 0x9b7e5c, 1.15);
  const sun = new THREE.DirectionalLight(0xffd7ab, 3.8);
  sun.position.set(1, 1.6, 0.8);
  scene.add(hemi, sun);

  const root = new THREE.Group();
  scene.add(root);
  const cache = new Map<string, BuiltWeaponRig>();

  // Local muzzle-flash light attached to the viewmodel scene ONLY (zero world shader cost!).
  const localFlashLight = new THREE.PointLight(0xffb452, 0, 2.2, 2);
  root.add(localFlashLight);

  function getOrCreateRig(spec: WeaponSpec, opticId?: OpticId): BuiltWeaponRig {
    const resolved = clampWeaponOptic(spec.id, opticId);
    const key = `${spec.id}:${resolved}`;
    let rig = cache.get(key);
    if (!rig) {
      rig = buildWeaponRig(spec, resolved);
      cache.set(key, rig);
    }
    return rig;
  }

  let active = getOrCreateRig(initialSpec, initialOptic);
  root.add(active.container);

  // Multi-spring recoil state.
  const kickZ: Spring1D = { value: 0, velocity: 0 };
  const kickPitch: Spring1D = { value: 0, velocity: 0 };
  const kickRoll: Spring1D = { value: 0, velocity: 0 };
  const kickYaw: Spring1D = { value: 0, velocity: 0 };
  const landSpring: Spring1D = { value: 0, velocity: 0 };
  const magPunch: Spring1D = { value: 0, velocity: 0 };
  const camPitchSpring: Spring1D = { value: 0, velocity: 0 };
  const camRollSpring: Spring1D = { value: 0, velocity: 0 };

  let flashTime = 0;
  let slideTime = 0;
  let actionCycleTime = 0;
  let actionCycleDuration = 0;
  let pendingActionEject = false;
  let ejectCallback: (() => void) | null = null;
  let smokeLife = 0;
  const smokeMaxLife = 0.65;

  let bobPhase = 0;
  let breathePhase = 0;
  let swayX = 0;
  let swayY = 0;
  let strafeSmooth = 0;
  let sprintBlend = 0;
  let wasGrounded = true;
  let prevVerticalSpeed = 0;
  let prevReload = 0;
  let shotSign = 1;

  // Scratch objects reused every frame — zero per-frame allocations!
  const aimRot = new THREE.Euler(0, 0, 0);
  const hipQuat = new THREE.Quaternion();
  const aimQuat = new THREE.Quaternion();
  const targetQuat = new THREE.Quaternion();
  const extraEuler = new THREE.Euler();
  const extraQuat = new THREE.Quaternion();

  const rightPos = new THREE.Vector3();
  const rightRot = new THREE.Quaternion();
  const boltPos = new THREE.Vector3();
  const boltRot = new THREE.Quaternion();
  const leftPos = new THREE.Vector3();
  const leftRot = new THREE.Quaternion();
  const magPos = new THREE.Vector3();
  const magRot = new THREE.Quaternion();
  const muzzleWorld = new THREE.Vector3();

  function resetSprings() {
    kickZ.value = 0;
    kickZ.velocity = 0;
    kickPitch.value = 0;
    kickPitch.velocity = 0;
    kickRoll.value = 0;
    kickRoll.velocity = 0;
    kickYaw.value = 0;
    kickYaw.velocity = 0;
    magPunch.value = 0;
    magPunch.velocity = 0;
    flashTime = 0;
    slideTime = 0;
    actionCycleTime = 0;
    actionCycleDuration = 0;
    pendingActionEject = false;
    ejectCallback = null;
    smokeLife = 0;
    prevReload = 0;
  }

  return {
    scene,
    camera,
    root,

    setSun(direction: THREE.Vector3) {
      sun.position.copy(direction).multiplyScalar(4);
    },

    setEnvironment(env: THREE.Texture | null) {
      scene.environment = env;
    },

    reloadTiming() {
      return active.model.reload;
    },

    /** Switch active weapon or optic model cleanly (cached by weapon+optic). */
    setWeapon(spec: WeaponSpec, opticId?: OpticId) {
      const resolved = clampWeaponOptic(spec.id, opticId);
      if (spec.id === active.spec.id && resolved === active.opticId) return;
      active.flash.visible = false;
      active.smoke.visible = false;
      root.remove(active.container);
      active = getOrCreateRig(spec, resolved);
      root.add(active.container);
      resetSprings();
    },

    /** Trigger weapon recoil, muzzle flash, barrel smoke, and bolt/pump/slide animation. */
    /** `flashScale` shrinks the muzzle flash: 0 for a flash hider, about 0.3 for a suppressor. */
    onShot(aimFraction: number, onActionEject?: () => void, flashScale = 1) {
      const t = active.tuning;
      const aimScale = THREE.MathUtils.lerp(1, 0.52, aimFraction);
      shotSign = -shotSign;
      const jitter = (Math.random() - 0.5) * 0.35;

      // Impulse velocities into independent recoil springs for crisp physical kick!
      kickZ.velocity += t.kickZ * 17.5 * THREE.MathUtils.lerp(1, 0.68, aimFraction);
      kickPitch.velocity += t.kickPitch * 16.5 * aimScale;
      kickRoll.velocity += t.kickRoll * (shotSign * 0.7 + jitter) * 18 * aimScale;
      kickYaw.velocity += t.kickYaw * (shotSign * 0.5 + jitter) * 16 * aimScale;

      // Subtle camera recoil micro-punch (returns cleanly to 0, never drifts aim).
      camPitchSpring.velocity += t.cameraPitch * 32 * THREE.MathUtils.lerp(1, 0.72, aimFraction);
      camRollSpring.velocity += t.cameraRoll * shotSign * 30;

      // Multi-fin flash + local illumination pulse.
      if (flashScale > 0.02) {
        flashTime = 0.048;
        active.flash.rotation.z = Math.random() * Math.PI * 2;
        const s = t.flashScale * flashScale * (0.85 + Math.random() * 0.32);
        active.flash.scale.set(s, s, s * (0.9 + Math.random() * 0.25));
        active.flash.visible = true;
      }

      // Rising subtle muzzle smoke wisp.
      smokeLife = smokeMaxLife;
      active.smoke.visible = true;
      active.smoke.position.set(0, 0, -0.02);

      // Slide blowback vs pump/bolt cycle choreography.
      const action = active.model.action ?? 'slide';
      if (action === 'pump' || action === 'bolt') {
        actionCycleDuration = action === 'bolt' ? 0.92 : 0.64;
        actionCycleTime = actionCycleDuration;
        pendingActionEject = Boolean(onActionEject);
        ejectCallback = onActionEject ?? null;
      } else {
        slideTime = 0.095;
        onActionEject?.();
      }
    },

    /** Subtle tactile click nudge when toggling variable scope magnification (`V`). */
    onZoomToggle() {
      kickRoll.velocity += 0.48;
      kickZ.velocity += 0.04;
    },

    /** World position and direction of the muzzle in viewmodel space (for tracers). */
    muzzleInViewSpace(out: THREE.Vector3): THREE.Vector3 {
      active.container.updateMatrixWorld(true);
      return active.model.muzzle.getWorldPosition(out);
    },

    /** Ejection port transform in viewmodel space (for brass/shotgun hull spawning). */
    ejectionInViewSpace(outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
      active.container.updateMatrixWorld(true);
      active.model.ejection.getWorldPosition(outPos);
      active.model.ejection.getWorldQuaternion(outQuat);
    },

    /** Current subtle camera recoil punch (in radians) to add to main camera pitch/roll. */
    cameraKick(): CameraRecoilKick {
      return { pitch: camPitchSpring.value, roll: camRollSpring.value };
    },

    update(dt: number, motion: ViewmodelMotion) {
      const clampedDt = Math.min(dt, 0.05);
      const { model, arms, gunAnchor, tuning, isPistol } = active;

      // Step all recoil, landing, magazine punch, and camera springs.
      stepSpring(kickZ, 0, tuning.stiffnessZ, tuning.dampingZ, clampedDt);
      stepSpring(kickPitch, 0, tuning.stiffnessRot, tuning.dampingRot, clampedDt);
      stepSpring(kickRoll, 0, tuning.stiffnessRot * 0.9, tuning.dampingRot * 0.9, clampedDt);
      stepSpring(kickYaw, 0, tuning.stiffnessRot * 0.85, tuning.dampingRot * 0.85, clampedDt);
      stepSpring(landSpring, 0, 145, 16, clampedDt);
      stepSpring(magPunch, 0, 220, 18, clampedDt);
      stepSpring(camPitchSpring, 0, 260, 24, clampedDt);
      stepSpring(camRollSpring, 0, 240, 22, clampedDt);

      // Detect jump lift & landing weight impact!
      if (!wasGrounded && motion.grounded) {
        const impact = Math.min(1, Math.abs(prevVerticalSpeed) / 7.5);
        landSpring.velocity -= (0.45 + impact * 0.85) * THREE.MathUtils.lerp(1, 0.35, motion.aim);
      } else if (wasGrounded && !motion.grounded && motion.verticalSpeed > 1) {
        landSpring.velocity += 0.32 * THREE.MathUtils.lerp(1, 0.3, motion.aim);
      }
      wasGrounded = motion.grounded;
      prevVerticalSpeed = motion.verticalSpeed;

      // Hide viewmodel completely when full-screen magnified optic overlay is active.
      if (motion.scopeHidden) {
        active.container.visible = false;
        localFlashLight.intensity = 0;
        // Still advance action timers so bolt-cycling completes cleanly while scoped!
        if (actionCycleTime > 0) {
          actionCycleTime = Math.max(0, actionCycleTime - clampedDt);
          const prog = 1 - actionCycleTime / Math.max(0.001, actionCycleDuration);
          if (pendingActionEject && prog >= 0.42) {
            pendingActionEject = false;
            ejectCallback?.();
          }
        }
        return;
      }
      active.container.visible = true;

      // Muzzle flash timer + viewmodel-only local light falloff.
      if (flashTime > 0) {
        flashTime = Math.max(0, flashTime - clampedDt);
        const f = flashTime / 0.048;
        active.flash.visible = flashTime > 0;
        model.muzzle.getWorldPosition(muzzleWorld);
        localFlashLight.position.copy(muzzleWorld);
        localFlashLight.intensity = f * f * 4.5 * tuning.flashScale;
      } else {
        active.flash.visible = false;
        localFlashLight.intensity = 0;
      }

      // Subtle rising barrel smoke wisp after shots.
      if (smokeLife > 0) {
        smokeLife = Math.max(0, smokeLife - clampedDt);
        const u = 1 - smokeLife / smokeMaxLife;
        active.smoke.visible = smokeLife > 0;
        active.smoke.position.set(Math.sin(u * 6) * 0.006, u * 0.065, -0.02 - u * 0.04);
        const sc = 0.045 + u * 0.095;
        active.smoke.scale.set(sc, sc, 1);
        active.smokeMat.opacity = Math.sin(u * Math.PI) * 0.32 * (1 - motion.aim * 0.7);
      } else {
        active.smoke.visible = false;
      }

      // Smooth sprint blend, strafe banking, and mouse look-turn inertia.
      const sprintTarget = motion.sprinting && motion.aim < 0.1 && motion.reload === 0 ? 1 : 0;
      sprintBlend += (sprintTarget - sprintBlend) * (1 - Math.exp(-11 * clampedDt));
      strafeSmooth += (motion.strafeSpeed - strafeSmooth) * (1 - Math.exp(-12 * clampedDt));

      const swayScale = THREE.MathUtils.lerp(1, 0.18, motion.aim);
      const decay = Math.exp(-14 * clampedDt);
      swayX = THREE.MathUtils.clamp(
        swayX * decay - motion.yawDelta * 0.18 * swayScale,
        -0.042,
        0.042,
      );
      swayY = THREE.MathUtils.clamp(
        swayY * decay - motion.pitchDelta * 0.14 * swayScale,
        -0.032,
        0.032,
      );

      // Organic idle figure-8 breathing + rhythmic walk/sprint stride bob.
      breathePhase += clampedDt * 1.65;
      const moving = motion.grounded && motion.speed > 0.2;
      const moveRatio = moving ? THREE.MathUtils.clamp(motion.speed / 5.5, 0, 1.5) : 0;
      if (moving) {
        bobPhase += clampedDt * (7.8 + moveRatio * 3.1);
      } else {
        // Settle bob gently to rest phase.
        bobPhase += clampedDt * 0.8;
      }

      const breatheAmp = THREE.MathUtils.lerp(0.0028, 0.00045, motion.aim);
      const breatheX = Math.sin(breathePhase) * breatheAmp;
      const breatheY = Math.sin(breathePhase * 2) * breatheAmp * 0.65;

      const bobAmp =
        moveRatio * THREE.MathUtils.lerp(0.0115, 0.0016, motion.aim) * (1 + sprintBlend * 0.65);
      const bobX = Math.cos(bobPhase) * bobAmp;
      const bobY = -Math.abs(Math.sin(bobPhase)) * bobAmp * 1.15;
      const bobRoll = Math.cos(bobPhase) * bobAmp * 1.85;

      // Non-linear smoothstep ADS curve for crisp weighted sight snap!
      const aimT = motion.aim * motion.aim * (3 - 2 * motion.aim);
      const reloadT = motion.reload;

      // Trigger subtle tactile upward/downward punches at exact reload beats!
      if (reloadT > 0) {
        if (prevReload < model.reload.magazineOut && reloadT >= model.reload.magazineOut) {
          magPunch.velocity -= 0.42; // mag drops free
        }
        if (prevReload < model.reload.magazineIn && reloadT >= model.reload.magazineIn) {
          magPunch.velocity += 0.95; // loaded mag slaps firmly into magwell!
        }
        if (
          motion.reloadEmpty &&
          prevReload < model.reload.slideRelease &&
          reloadT >= model.reload.slideRelease
        ) {
          kickZ.velocity += 0.28; // bolt release / slide slams home!
          kickRoll.velocity -= 0.55;
        }
      }
      prevReload = reloadT;

      // Base hip -> ADS interpolation.
      gunAnchor.position.lerpVectors(active.hipPosition, active.aimPosition, aimT);
      hipQuat.setFromEuler(active.hipRotation);
      aimQuat.setFromEuler(aimRot);
      targetQuat.slerpQuaternions(hipQuat, aimQuat, aimT);

      // Tactical diagonal sprint carry pose!
      if (sprintBlend > 0.001) {
        if (isPistol) {
          gunAnchor.position.x -= 0.025 * sprintBlend;
          gunAnchor.position.y -= 0.055 * sprintBlend;
          gunAnchor.position.z += 0.03 * sprintBlend;
        } else {
          gunAnchor.position.x -= 0.085 * sprintBlend;
          gunAnchor.position.y -= 0.055 * sprintBlend;
          gunAnchor.position.z += 0.025 * sprintBlend;
        }
      }

      // Weapon draw / equip arc from below with weighted settle.
      const equipDrop = 1 - motion.equip;
      const equipEased = equipDrop * equipDrop * (3 - 2 * equipDrop);
      if (equipEased > 0.0005) {
        gunAnchor.position.y -= 0.26 * equipEased;
        gunAnchor.position.z += 0.09 * equipEased;
        gunAnchor.position.x += 0.04 * equipEased;
      }

      // Reload tilt choreography: cant weapon cleanly so player sees magazine swap!
      const reloadTilt = reloadT > 0 ? Math.min(1, pulse(reloadT, 0.0, 0.96) * 1.45) : 0;
      const slideSlapPulse =
        reloadT > 0 && motion.reloadEmpty
          ? pulse(reloadT, model.reload.slideRelease - 0.09, model.reload.slideRelease + 0.08)
          : 0;

      // Pump / Bolt mechanical cycle pose twist (gives sniper bolt pull real physical weight!).
      let boltLiftAngle = 0;
      let boltPullFrac = 0;
      let boltHandBlend = 0;
      let cycleGunRoll = 0;
      let cycleGunPitch = 0;
      const action = model.action ?? 'slide';

      if (actionCycleTime > 0 && actionCycleDuration > 0) {
        actionCycleTime = Math.max(0, actionCycleTime - clampedDt);
        const prog = 1 - actionCycleTime / actionCycleDuration;

        if (action === 'bolt') {
          // 0.00-0.14 recoil pause | 0.14-0.30 hand reaches + lifts bolt | 0.30-0.52 pull back + eject
          // 0.52-0.74 push forward | 0.74-0.88 lock bolt down | 0.88-1.00 return hand to grip.
          boltHandBlend = ramp(prog, 0.12, 0.24) * (1 - ramp(prog, 0.82, 0.96));
          boltLiftAngle = ramp(prog, 0.2, 0.32) * (1 - ramp(prog, 0.72, 0.84));
          boltPullFrac = pulse(prog, 0.3, 0.74);
          // Slight ergonomic cant left while right hand works the bolt!
          cycleGunRoll = 0.14 * boltHandBlend + 0.05 * boltPullFrac;
          cycleGunPitch = 0.05 * boltPullFrac;
          if (pendingActionEject && prog >= 0.44) {
            pendingActionEject = false;
            ejectCallback?.();
          }
        } else if (action === 'pump') {
          // 0.00-0.16 recoil | 0.16-0.50 rack back + eject | 0.50-0.82 rack forward!
          boltPullFrac = pulse(prog, 0.16, 0.82);
          cycleGunRoll = -0.09 * boltPullFrac;
          cycleGunPitch = -0.045 * boltPullFrac;
          if (pendingActionEject && prog >= 0.38) {
            pendingActionEject = false;
            ejectCallback?.();
          }
        }
      }

      // Apply positional offsets: recoil Z, breathing, stride bob, look lag, jump/land dip, mag punch.
      const strafeShift =
        THREE.MathUtils.clamp(-strafeSmooth * 0.0038, -0.022, 0.022) * (1 - aimT * 0.78);
      gunAnchor.position.x += breatheX + bobX + swayX + strafeShift + reloadTilt * 0.032;
      gunAnchor.position.y +=
        breatheY +
        bobY +
        swayY +
        landSpring.value * 0.038 +
        magPunch.value * 0.022 -
        reloadTilt * 0.028;
      gunAnchor.position.z += kickZ.value + Math.abs(bobX) * 0.35;

      // Compose dynamic additive rotations cleanly via scratch Euler -> Quaternion.
      const strafeRoll =
        THREE.MathUtils.clamp(-strafeSmooth * 0.011, -0.065, 0.065) * (1 - aimT * 0.8);
      const sprintPitch = isPistol ? -0.18 * sprintBlend : -0.14 * sprintBlend;
      const sprintYaw = isPistol ? 0.28 * sprintBlend : 0.58 * sprintBlend;
      const sprintRoll = isPistol ? 0.18 * sprintBlend : 0.26 * sprintBlend;
      const leanRoll = -motion.lean * 0.045 * (1 - aimT * 0.65);

      extraEuler.set(
        kickPitch.value +
          sprintPitch -
          equipEased * 0.58 +
          reloadTilt * 0.24 +
          magPunch.value * 0.08 +
          landSpring.value * 0.12 +
          cycleGunPitch +
          swayY * 1.1,
        kickYaw.value + sprintYaw + swayX * 1.6 - reloadTilt * 0.14,
        kickRoll.value +
          sprintRoll +
          bobRoll +
          strafeRoll +
          leanRoll +
          reloadTilt * (0.48 - slideSlapPulse * 0.35) +
          cycleGunRoll,
      );
      extraQuat.setFromEuler(extraEuler);
      gunAnchor.quaternion.copy(targetQuat).multiply(extraQuat);

      // Animate magazine drop, off-screen swap, and seated upward lock!
      model.magazine.position.copy(active.magRest);
      if (reloadT > 0) {
        const dropOut = ramp(reloadT, model.reload.magazineOut, model.reload.magazineOut + 0.14);
        const swapIn = 1 - ramp(reloadT, model.reload.magazineIn - 0.15, model.reload.magazineIn);
        const outFraction = Math.min(dropOut, swapIn);
        model.magazine.position.y -= model.magazineTravel * outFraction;
        model.magazine.position.z += 0.014 * outFraction;
      }

      // Animate slide / bolt / shotgun pump forend!
      if (model.slide) {
        model.slide.position.copy(active.slideRest);
        model.slide.rotation.set(0, 0, 0);

        if (action === 'bolt') {
          model.slide.rotation.z = boltLiftAngle * 1.05;
          model.slide.position.z = active.slideRest.z + model.slideTravel * boltPullFrac;
        } else if (action === 'pump') {
          model.slide.position.z = active.slideRest.z + model.slideTravel * boltPullFrac;
        } else {
          // Semi/auto reciprocating slide or bolt carrier.
          let slideBack = 0;
          if (slideTime > 0) {
            slideTime = Math.max(0, slideTime - clampedDt);
            slideBack = Math.sin((slideTime / 0.095) * Math.PI);
          }
          // Hold slide locked open on empty pistol/rifle until empty-reload release beat!
          const lockedOpen =
            !motion.hasRounds &&
            (reloadT === 0 || (motion.reloadEmpty && reloadT < model.reload.slideRelease));
          if (lockedOpen) slideBack = 1;
          model.slide.position.z = active.slideRest.z + model.slideTravel * slideBack;
        }
      }

      // Update world matrices once, then solve right & left IK arms onto the weapon anchors!
      active.container.updateMatrixWorld(true);

      // Right hand: stays on grip, OR smoothly reaches up to work the AWM sniper bolt!
      model.grip.anchor.getWorldPosition(rightPos);
      model.grip.anchor.getWorldQuaternion(rightRot);
      if (model.boltHand && boltHandBlend > 0.001) {
        model.boltHand.getWorldPosition(boltPos);
        model.boltHand.getWorldQuaternion(boltRot);
        rightPos.lerp(boltPos, boltHandBlend);
        rightRot.slerp(boltRot, boltHandBlend);
      }
      arms.right.place(rightPos, rightRot);

      // Left hand: stays on forend (moving with shotgun pump!) OR blends onto magazine during reload!
      model.support.anchor.getWorldPosition(leftPos);
      model.support.anchor.getWorldQuaternion(leftRot);
      if (reloadT > 0) {
        const magBlend =
          ramp(reloadT, 0.06, model.reload.magazineOut) *
          (1 - ramp(reloadT, model.reload.magazineIn + 0.04, 0.92));
        if (magBlend > 0.001) {
          model.magazineHand.getWorldPosition(magPos);
          model.magazineHand.getWorldQuaternion(magRot);
          leftPos.lerp(magPos, magBlend);
          leftRot.slerp(magRot, magBlend);
        }
      }
      arms.left.place(leftPos, leftRot);
    },
  };
}

export type Viewmodel = ReturnType<typeof createViewmodel>;
