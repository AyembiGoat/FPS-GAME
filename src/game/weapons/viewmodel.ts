import * as THREE from 'three';
import { softDot } from '../materials';
import { createArms } from './arms';
import type { WeaponModel } from './model';

/**
 * Draws any gun in first person: the two arms holding it, recoil, the slide
 * cycling, muzzle flash, spent cases, sway, bringing the sights up, sprinting and
 * the reload. Everything it needs to know about a particular gun comes from its
 * WeaponModel, so a new gun gets all of this without new animation code.
 */

export interface ViewmodelFrame {
  readonly rounds: number;
  /** 0..1 through the reload, or null when not reloading. */
  readonly reloadProgress: number | null;
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

const CASINGS = 6;
const CASING_LIFE = 0.7;
const SLIDE_SECONDS = 0.07;

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
  scene.environmentIntensity = 0.7;
  // A narrower lens than the world camera keeps the gun from stretching at the edges.
  const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 5);
  const sun = new THREE.DirectionalLight(0xffd3a1, 3.2);
  scene.add(sun, sun.target);

  const root = model.root;
  const arms = createArms();
  scene.add(root, arms.group);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, 0.06),
    new THREE.MeshBasicMaterial({
      map: softDot('rgba(255,240,205,1)', 'rgba(255,170,70,0)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  flash.position.z = -0.03;
  flash.visible = false;
  model.muzzle.add(flash);

  const brass = new THREE.MeshStandardMaterial({
    color: 0xb38f3e,
    metalness: 0.9,
    roughness: 0.35,
  });
  const casingGeometry = new THREE.CylinderGeometry(0.0058, 0.0058, 0.022, 8);
  const casings = Array.from({ length: CASINGS }, () => {
    const mesh = new THREE.Mesh(casingGeometry, brass);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 };
  });
  let nextCasing = 0;

  // The aimed pose puts the sight on the centre of the view, level and straight.
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

  return {
    scene,
    camera,

    setSun(directionInView: THREE.Vector3) {
      sun.position.copy(directionInView);
    },

    fire() {
      kickVelocity += 9;
      slideTime = SLIDE_SECONDS;
      flashTime = 0.035;
      // Vary the flash a little so two shots never look identical.
      shots++;
      flash.rotation.z = shots * 2.4;
      flash.scale.setScalar(0.85 + ((shots * 37) % 10) * 0.035);

      const casing = casings[nextCasing];
      nextCasing = (nextCasing + 1) % CASINGS;
      if (casing) {
        model.ejection.getWorldPosition(casing.mesh.position);
        casing.mesh.visible = true;
        casing.velocity.set(0.9 + (shots % 3) * 0.15, 1.1, 0.25);
        casing.spin.set(14, 9 + (shots % 4), 21);
        casing.life = CASING_LIFE;
      }
    },

    update(dt: number, frame: ViewmodelFrame) {
      kickVelocity += (-380 * kick - 26 * kickVelocity) * dt;
      kick += kickVelocity * dt;
      slideTime = Math.max(0, slideTime - dt);
      flashTime = Math.max(0, flashTime - dt);
      flash.visible = flashTime > 0;

      const aim = smoothstep(frame.aim, 0, 1);
      // Sights up means a steadier gun: less sway, bob and visible kick.
      const loose = 1 - aim * 0.75;
      const ease = 1 - Math.exp(-12 * dt);
      swayX += (clamp(-frame.yawRate * 0.004, -0.02, 0.02) - swayX) * ease;
      swayY += (clamp(frame.pitchRate * 0.004, -0.02, 0.02) - swayY) * ease;
      move += (Math.min(frame.moveAmount, 1.5) - move) * ease;
      sprint += ((frame.sprinting ? 1 : 0) - sprint) * (1 - Math.exp(-8 * dt));

      // One full left-right swing every two strides.
      const cycle = (frame.walked / 1.9) * Math.PI;
      const bobX = Math.sin(cycle) * 0.004 * move * loose;
      const bobY = -Math.abs(Math.cos(cycle)) * 0.004 * move * loose;

      // Reload, in the order it happens:
      //   the gun is turned so the magazine well faces the left hand,
      //   the left hand takes the magazine out and down out of view,
      //   comes back with a full one and pushes it home,
      //   returns to the grip, and the slide is let forward if the gun was empty.
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

      // The slide locks back on an empty magazine and stays there until released.
      const locked =
        frame.rounds === 0 && p === null
          ? true
          : p !== null && emptyReload && p < beats.slideRelease;
      if (model.slide) {
        model.slide.position.z = locked
          ? model.slideTravel * 0.9
          : (slideTime / SLIDE_SECONDS) * model.slideTravel;
      }

      model.magazine.position
        .copy(magazineHome)
        .addScaledVector(magazineDown, magazineOut * model.magazineTravel)
        .addScaledVector(pouch, away);

      // Gun pose: from the hip toward the sights, then the temporary offsets on top.
      const lowered = sprint * (1 - aim);
      position.lerpVectors(model.hip.position, aimed, aim);
      position.x += (swayX + bobX) * loose - lowered * 0.02 - tilt * 0.035 * (1 - aim * 0.5);
      position.y +=
        (swayY + bobY) * loose +
        kick * 0.012 * loose -
        lowered * 0.035 -
        frame.landOffset * 0.3 * loose +
        tilt * 0.022 +
        seat * 0.012 -
        tilt * aim * 0.07;
      position.z += kick * 0.075 * (1 - aim * 0.45) + release * 0.006;
      root.position.copy(position);

      rotation.identity().slerp(hipRotation, 1 - aim);
      euler.set(
        kick * 0.5 * loose - lowered * 0.35 + tilt * 0.3 + seat * 0.05 - release * 0.04,
        swayX * 2 * loose + lowered * 0.5 + tilt * 0.22,
        -swayX * 3 * loose - tilt * 0.62 - frame.lean * 0.05 * (1 - aim),
      );
      root.quaternion.copy(rotation).multiply(extra.setFromEuler(euler));
      root.updateMatrixWorld(true);

      // Hands go wherever the gun says they belong.
      model.grip.getWorldPosition(position);
      model.grip.getWorldQuaternion(rotation);
      arms.right.place(position, rotation);

      model.support.getWorldPosition(position);
      model.support.getWorldQuaternion(rotation);
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
