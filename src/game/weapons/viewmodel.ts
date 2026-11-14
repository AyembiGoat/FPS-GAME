import * as THREE from 'three';
import { softDot } from '../materials';
import { createArms } from './arms';
import type { WeaponModel } from './model';

/**
 * Draws any gun in first person: the two arms holding it, recoil, slide/bolt/pump
 * cycling, muzzle flash, spent cases, sway, bringing the sights up, pivot-accurate
 * tactical leaning cant, weapon slot draw transitions, sprinting, and reload.
 * Everything it needs to know about a particular gun comes from its WeaponModel.
 */

export interface ViewmodelFrame {
  readonly rounds: number;
  /** 0..1 through the reload, or null when not reloading. */
  readonly reloadProgress: number | null;
  /** 0..1 through the post-shot cycle (used for pump forend and bolt-action animations). */
  readonly cycleProgress: number;
  /** 0..1 remaining in a weapon-slot draw transition (1 = just started, 0 = ready). */
  readonly switchProgress: number;
  /** 0 at the hip, 1 with the sights up. */
  readonly aim: number;
  /** Horizontal speed as a fraction of walk speed. */
  readonly moveAmount: number;
  readonly sprinting: boolean;
  /** Metres walked on the ground, for the walk cycle. */
  readonly walked: number;
  /** Look rates in radians per second, for the gun lagging behind the view. */
  readonly yawRate: number;
  readonly pitchRate: number;
  /** Camera dip from landing, in metres (negative is down). */
  readonly landOffset: number;
  /** -1 leaning fully left, 1 fully right. */
  readonly lean: number;
}

const CASINGS = 10;
const CASING_LIFE = 0.7;
const SLIDE_SECONDS = 0.065;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const { smoothstep, clamp } = THREE.MathUtils;

/** 0 before `start`, 1 after `end`, smooth in between. */
const ramp = (x: number, start: number, end: number) => smoothstep(x, start, end);
/** Rises over `inStart..inEnd`, holds, falls over `outStart..outEnd`. */
const hold = (x: number, inStart: number, inEnd: number, outStart: number, outEnd: number) =>
  ramp(x, inStart, inEnd) * (1 - ramp(x, outStart, outEnd));
/** A short bump centred on `at`. */
const bump = (x: number, at: number, width: number) =>
  Math.max(0, 1 - Math.abs(x - at) / width) ** 2;

export function createViewmodel(model: WeaponModel, environment: THREE.Texture | null) {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.72;
  // A narrower lens than the world camera keeps the gun from stretching at the edges.
  const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 5);
  const sun = new THREE.DirectionalLight(0xffd3a1, 3.2);
  scene.add(sun, sun.target);

  const root = model.root;
  const arms = createArms(model);
  scene.add(root, arms.group);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.085),
    new THREE.MeshBasicMaterial({
      map: softDot('rgba(255,244,210,1)', 'rgba(255,165,65,0)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  flash.position.z = -0.035;
  flash.visible = false;
  model.muzzle.add(flash);

  const brass = new THREE.MeshStandardMaterial({
    color: 0xb38f3e,
    metalness: 0.9,
    roughness: 0.35,
  });
  const casingGeometry = new THREE.CylinderGeometry(0.0056, 0.0056, 0.024, 8);
  const casings = Array.from({ length: CASINGS }, () => {
    const mesh = new THREE.Mesh(casingGeometry, brass);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 };
  });
  let nextCasing = 0;

  // The aimed pose puts `model.sight` dead on the camera's centre ray at `(0, 0, -aimDistance)`.
  const aimed = model.sight.position
    .clone()
    .negate()
    .add(new THREE.Vector3(0, 0, -model.aimDistance));
  const magazineHome = model.magazine.position.clone();
  const magazineDown = new THREE.Vector3(0, -1, 0).applyQuaternion(model.magazine.quaternion);
  /** Where the old magazine goes and the new one comes from: down and left, out of view. */
  const pouch = new THREE.Vector3(-0.1, -0.3, 0.1);

  // Recoil is a damped spring: each shot shoves it and it settles on its own.
  let kick = 0;
  let kickVelocity = 0;
  let slideTime = 0;
  let flashTime = 0;
  let shots = 0;
  let swayX = 0;
  let swayY = 0;
  let move = 0;
  let sprint = 0;
  let emptyReload = false;

  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const otherPosition = new THREE.Vector3();
  const otherRotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const hipRotation = new THREE.Quaternion().setFromEuler(model.hip.rotation);
  const extra = new THREE.Quaternion();
  const cantQuat = new THREE.Quaternion();
  const cantPivot = new THREE.Vector3();

  return {
    scene,
    camera,

    setSun(directionInView: THREE.Vector3) {
      sun.position.copy(directionInView);
    },

    setVisible(visible: boolean) {
      root.visible = visible;
      arms.group.visible = visible;
    },

    fire(kickScale = 1) {
      kickVelocity += 8.6 * clamp(kickScale, 0.55, 1.85);
      slideTime = SLIDE_SECONDS;
      flashTime = 0.036;
      shots++;
      flash.rotation.z = shots * 2.4;
      flash.scale.setScalar((0.8 + ((shots * 37) % 10) * 0.035) * clamp(kickScale, 0.7, 1.5));

      const casing = casings[nextCasing];
      nextCasing = (nextCasing + 1) % CASINGS;
      if (casing) {
        model.ejection.getWorldPosition(casing.mesh.position);
        casing.mesh.visible = true;
        casing.velocity.set(0.95 + (shots % 3) * 0.16, 1.15, 0.28);
        casing.spin.set(14, 9 + (shots % 4), 21);
        casing.life = CASING_LIFE;
      }
    },

    update(dt: number, frame: ViewmodelFrame) {
      kickVelocity += (-380 * kick - 26 * kickVelocity) * dt;
      kick += kickVelocity * dt;
      slideTime = Math.max(0, slideTime - dt);
      flashTime = Math.max(0, flashTime - dt);
      flash.visible = flashTime > 0 && root.visible;

      const aim = smoothstep(frame.aim, 0, 1);
      // Sights up means a steadier gun: less sway, bob and visible kick.
      const loose = 1 - aim * 0.78;
      const ease = 1 - Math.exp(-12 * dt);
      swayX += (clamp(-frame.yawRate * 0.004, -0.02, 0.02) - swayX) * ease;
      swayY += (clamp(frame.pitchRate * 0.004, -0.02, 0.02) - swayY) * ease;
      move += (Math.min(frame.moveAmount, 1.5) - move) * ease;
      sprint += ((frame.sprinting ? 1 : 0) - sprint) * (1 - Math.exp(-8 * dt));

      // One full left-right swing every two strides.
      const cycle = (frame.walked / 1.9) * Math.PI;
      const bobX = Math.sin(cycle) * 0.004 * move * loose;
      const bobY = -Math.abs(Math.cos(cycle)) * 0.004 * move * loose;

      // Reload phases.
      const p = frame.reloadProgress;
      const beats = model.reload;
      let tilt = 0;
      let toMagazine = 0;
      let magazineOut = 0;
      let away = 0;
      let seat = 0;
      let release = 0;
      if (p === null) {
        emptyReload = false;
      } else {
        if (frame.rounds === 0) emptyReload = true;
        tilt = hold(p, 0, beats.magazineOut * 0.8, beats.magazineIn + 0.06, beats.slideRelease);
        toMagazine = hold(
          p,
          0.02,
          beats.magazineOut - 0.02,
          beats.magazineIn + 0.05,
          beats.magazineIn + 0.2,
        );
        magazineOut =
          ramp(p, beats.magazineOut, beats.magazineOut + 0.07) *
          (1 - ramp(p, beats.magazineIn - 0.035, beats.magazineIn));
        away = hold(
          p,
          beats.magazineOut + 0.06,
          beats.magazineOut + 0.17,
          beats.magazineIn - 0.17,
          beats.magazineIn - 0.04,
        );
        seat = bump(p, beats.magazineIn + 0.01, 0.035);
        release = emptyReload ? bump(p, beats.slideRelease + 0.012, 0.03) : 0;
      }

      // Action animation: standard reciprocating slide, shotgun pump forend, or sniper bolt.
      if (model.slide) {
        const action = model.action ?? 'slide';
        if (action === 'pump') {
          // Pump back after recoil settles, then snap forward cleanly (carries left hand!).
          const pumpPull =
            frame.cycleProgress > 0 ? hold(frame.cycleProgress, 0.2, 0.45, 0.56, 0.82) : 0;
          model.slide.position.z = pumpPull * model.slideTravel;
          model.slide.rotation.z = 0;
        } else if (action === 'bolt') {
          // Lift bolt handle, draw rearward, push home, and lock down cleanly.
          const lift =
            frame.cycleProgress > 0 ? hold(frame.cycleProgress, 0.12, 0.24, 0.72, 0.88) : 0;
          const pull =
            frame.cycleProgress > 0 ? hold(frame.cycleProgress, 0.26, 0.46, 0.54, 0.72) : 0;
          model.slide.position.z = pull * model.slideTravel;
          model.slide.rotation.z = lift * 0.55;
        } else {
          // Slide/bolt locks back on empty and stays open until released.
          const locked =
            frame.rounds === 0 && p === null
              ? true
              : p !== null && emptyReload && p < beats.slideRelease;
          model.slide.position.z = locked
            ? model.slideTravel * 0.9
            : (slideTime / SLIDE_SECONDS) * model.slideTravel;
        }
      }

      model.magazine.position
        .copy(magazineHome)
        .addScaledVector(magazineDown, magazineOut * model.magazineTravel)
        .addScaledVector(pouch, away);

      // Draw/equip raise curve when switching Primary <-> Secondary.
      const drawDrop = smoothstep(frame.switchProgress, 0, 1);

      // Gun pose: from hip toward sights, then temporary offsets on top.
      const lowered = sprint * (1 - aim);
      position.lerpVectors(model.hip.position, aimed, aim);
      position.x += (swayX + bobX) * loose - lowered * 0.02 - tilt * 0.035 * (1 - aim * 0.5);
      position.y +=
        (swayY + bobY) * loose +
        kick * 0.012 * loose -
        lowered * 0.035 -
        drawDrop * 0.24 -
        frame.landOffset * 0.3 * loose +
        tilt * 0.022 +
        seat * 0.012 -
        tilt * aim * 0.07;
      position.z += kick * 0.07 * (1 - aim * 0.48) + release * 0.006 + drawDrop * 0.08;
      root.position.copy(position);

      rotation.identity().slerp(hipRotation, 1 - aim);
      euler.set(
        kick * 0.45 * loose -
          lowered * 0.35 -
          drawDrop * 0.55 +
          tilt * 0.3 +
          seat * 0.05 -
          release * 0.04,
        swayX * 2 * loose + lowered * 0.5 + tilt * 0.22 + drawDrop * 0.25,
        -swayX * 3 * loose - tilt * 0.62,
      );
      root.quaternion.copy(rotation).multiply(extra.setFromEuler(euler));

      // Unified tactical lean cant (~8 deg hipfire, ~12.6 deg ADS) pivoted strictly around
      // `(0, 0, -aimDistance)` so the aligned sight/reticle remains mathematically pinned
      // to `(0, 0)` screen centre and the firing raycast vector at all lean angles!
      const cantAngle = -frame.lean * (0.14 + aim * 0.08);
      if (Math.abs(cantAngle) > 1e-4) {
        cantQuat.setFromAxisAngle(Z_AXIS, cantAngle);
        cantPivot.set(0, 0, -model.aimDistance);
        root.position.sub(cantPivot).applyQuaternion(cantQuat).add(cantPivot);
        root.quaternion.premultiply(cantQuat);
      }

      root.updateMatrixWorld(true);

      // Hands follow the weapon anchors (including pump forend and canted lean!).
      model.grip.anchor.getWorldPosition(position);
      model.grip.anchor.getWorldQuaternion(rotation);
      arms.right.place(position, rotation);

      model.support.anchor.getWorldPosition(position);
      model.support.anchor.getWorldQuaternion(rotation);
      model.magazineHand.getWorldPosition(otherPosition);
      model.magazineHand.getWorldQuaternion(otherRotation);
      position.lerp(otherPosition, toMagazine);
      rotation.slerp(otherRotation, toMagazine);
      arms.left.place(position, rotation);

      for (const casing of casings) {
        if (casing.life <= 0) continue;
        casing.life -= dt;
        casing.velocity.y -= 9.8 * dt;
        casing.mesh.position.addScaledVector(casing.velocity, dt);
        casing.mesh.rotation.x += casing.spin.x * dt;
        casing.mesh.rotation.y += casing.spin.y * dt;
        casing.mesh.rotation.z += casing.spin.z * dt;
        if (casing.life <= 0) casing.mesh.visible = false;
      }
    },
  };
}

export type Viewmodel = ReturnType<typeof createViewmodel>;
