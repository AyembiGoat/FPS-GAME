import * as THREE from 'three';
import { softDot, walnutChecker } from './textures';

/**
 * First-person M1911, built from reference/m1911.png (side) and
 * reference/m1911-rear.png (the view the player has of it).
 *
 * Gun space: +X right, +Y up, barrel along -Z. The top of the frame is y = 0.
 * Dimensions are in metres and follow the real pistol: 216 mm long, 23 mm slide.
 */

const SLIDE_WIDTH = 0.023;
const SLIDE_HEIGHT = 0.028;
const FRAME_WIDTH = 0.019;
const MUZZLE_Z = -0.105;
const SLIDE_TRAVEL = 0.03;

/** Extrude a side profile drawn in (z, y) so that its thickness runs along X. */
function fromSideProfile(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

function frameProfile(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.058, 0);
  shape.lineTo(0.082, 0);
  shape.lineTo(0.1, -0.004); // grip safety tang
  shape.lineTo(0.098, -0.01);
  shape.lineTo(0.084, -0.022);
  shape.lineTo(0.086, -0.05); // back strap
  shape.lineTo(0.1, -0.105);
  shape.lineTo(0.05, -0.112); // butt
  shape.lineTo(0.024, -0.034); // front strap
  shape.lineTo(0.018, -0.046);
  shape.lineTo(-0.022, -0.048); // trigger guard
  shape.lineTo(-0.034, -0.038);
  shape.lineTo(-0.036, -0.014);
  shape.lineTo(-0.058, -0.013); // dust cover
  shape.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.03, -0.019);
  guard.lineTo(0.014, -0.019);
  guard.lineTo(0.014, -0.042);
  guard.lineTo(-0.022, -0.043);
  guard.lineTo(-0.03, -0.036);
  guard.closePath();
  shape.holes.push(guard);
  return shape;
}

function gripPanelProfile(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0.031, -0.03);
  shape.lineTo(0.08, -0.025);
  shape.lineTo(0.095, -0.1);
  shape.lineTo(0.05, -0.106);
  shape.closePath();
  return shape;
}

function slideGeometry(): THREE.BufferGeometry {
  const w = SLIDE_WIDTH / 2;
  const chamfer = 0.005;
  const section = new THREE.Shape();
  section.moveTo(-w, 0);
  section.lineTo(w, 0);
  section.lineTo(w, SLIDE_HEIGHT - chamfer);
  section.lineTo(w - chamfer, SLIDE_HEIGHT);
  section.lineTo(-w + chamfer, SLIDE_HEIGHT);
  section.lineTo(-w, SLIDE_HEIGHT - chamfer);
  section.closePath();
  const geometry = new THREE.ExtrudeGeometry(section, { depth: 0.19, bevelEnabled: false });
  geometry.translate(0, 0, MUZZLE_Z);
  return geometry;
}

function box(
  material: THREE.Material,
  size: readonly [number, number, number],
  at: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  return mesh;
}

function buildPistol() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x504f4d, metalness: 0.6, roughness: 0.5 });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x2b2a29,
    metalness: 0.6,
    roughness: 0.5,
  });
  const checker = walnutChecker();
  // Extruded shapes are mapped in metres, so repeat the texture to get fine checkering.
  checker.repeat.set(18, 18);
  const walnut = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.75 });

  const root = new THREE.Group();
  root.add(new THREE.Mesh(fromSideProfile(frameProfile(), FRAME_WIDTH, 0.0012), steel));

  const panelGeometry = fromSideProfile(gripPanelProfile(), 0.0045, 0.001);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(panelGeometry, walnut);
    panel.position.x = side * (FRAME_WIDTH / 2 + 0.002);
    root.add(panel);
    for (const [z, y] of [
      [0.058, -0.038],
      [0.071, -0.092],
    ] as const) {
      const screw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0025, 0.0025, 0.0012, 10),
        darkSteel,
      );
      screw.rotation.z = Math.PI / 2;
      screw.position.set(side * (FRAME_WIDTH / 2 + 0.0047), y, z);
      root.add(screw);
    }
  }

  root.add(box(darkSteel, [0.006, 0.017, 0.005], [0, -0.0275, 0.0]));
  // Controls on the left side, which is the side the player sees.
  root.add(box(darkSteel, [0.003, 0.005, 0.032], [-0.0108, -0.004, 0.012]));
  root.add(box(darkSteel, [0.004, 0.007, 0.02], [-0.0112, -0.003, 0.068]));
  const hammer = box(darkSteel, [0.006, 0.018, 0.006], [0, 0.012, 0.092]);
  hammer.rotation.x = 0.55;
  root.add(hammer);

  // Everything that moves back when the gun cycles.
  const slide = new THREE.Group();
  slide.add(new THREE.Mesh(slideGeometry(), steel));
  slide.add(box(steel, [FRAME_WIDTH, 0.013, 0.047], [0, -0.0065, MUZZLE_Z + 0.0235]));
  slide.add(box(darkSteel, [0.003, 0.0045, 0.009], [0, SLIDE_HEIGHT + 0.002, MUZZLE_Z + 0.01]));
  // Rear sight: two posts with the notch between them.
  for (const side of [-1, 1]) {
    slide.add(box(darkSteel, [0.005, 0.005, 0.008], [side * 0.0045, SLIDE_HEIGHT + 0.0022, 0.072]));
  }
  slide.add(box(darkSteel, [0.014, 0.002, 0.008], [0, SLIDE_HEIGHT + 0.0007, 0.072]));
  // Ejection port on the top right.
  slide.add(box(darkSteel, [0.011, 0.008, 0.03], [0.0062, SLIDE_HEIGHT - 0.0038, -0.014]));
  // Cocking serrations.
  const serration = new THREE.BoxGeometry(0.0008, 0.017, 0.0016);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const ridge = new THREE.Mesh(serration, steel);
      ridge.position.set(side * (SLIDE_WIDTH / 2 + 0.0002), 0.0125, 0.034 + i * 0.0036);
      slide.add(ridge);
    }
  }
  root.add(slide);

  return { root, slide };
}

export interface ViewmodelFrame {
  readonly rounds: number;
  /** 0..1 through the reload, or null when not reloading. */
  readonly reloadProgress: number | null;
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
}

const REST = new THREE.Vector3(0.1, -0.098, -0.42);
const CASINGS = 6;
const CASING_LIFE = 0.7;

export function createViewmodel(environment: THREE.Texture | null) {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.7;
  // A narrower lens than the world camera keeps the gun from stretching at the edges.
  const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 5);
  const sun = new THREE.DirectionalLight(0xffd3a1, 3.2);
  scene.add(sun, sun.target);

  const { root, slide } = buildPistol();
  scene.add(root);

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
  flash.position.set(0, 0.016, MUZZLE_Z - 0.03);
  flash.visible = false;
  root.add(flash);

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
  const port = new THREE.Vector3();

  return {
    scene,
    camera,

    setSun(directionInView: THREE.Vector3) {
      sun.position.copy(directionInView);
    },

    fire() {
      kickVelocity += 9;
      slideTime = 0.07;
      flashTime = 0.035;
      // Vary the flash a little so two shots never look identical.
      shots++;
      flash.rotation.z = shots * 2.4;
      flash.scale.setScalar(0.85 + ((shots * 37) % 10) * 0.035);

      const casing = casings[nextCasing];
      nextCasing = (nextCasing + 1) % CASINGS;
      if (casing) {
        port.set(0.012, SLIDE_HEIGHT, -0.014);
        casing.mesh.position.copy(root.localToWorld(port));
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

      // The slide locks back on an empty magazine.
      slide.position.z =
        frame.rounds === 0 ? SLIDE_TRAVEL * 0.9 : (slideTime / 0.07) * SLIDE_TRAVEL;

      const ease = 1 - Math.exp(-12 * dt);
      swayX += (THREE.MathUtils.clamp(-frame.yawRate * 0.004, -0.02, 0.02) - swayX) * ease;
      swayY += (THREE.MathUtils.clamp(frame.pitchRate * 0.004, -0.02, 0.02) - swayY) * ease;
      move += (Math.min(frame.moveAmount, 1.5) - move) * ease;
      sprint += ((frame.sprinting ? 1 : 0) - sprint) * (1 - Math.exp(-8 * dt));

      // One full left-right swing every two strides.
      const cycle = (frame.walked / 1.9) * Math.PI;
      const bobX = Math.sin(cycle) * 0.004 * move;
      const bobY = -Math.abs(Math.cos(cycle)) * 0.004 * move;

      // During a reload the gun drops below the screen and comes back.
      let lowered = 0;
      if (frame.reloadProgress !== null) {
        const p = frame.reloadProgress;
        lowered =
          THREE.MathUtils.smoothstep(p, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(p, 0.8, 1));
      }

      root.position.set(
        REST.x + swayX + bobX - sprint * 0.02,
        REST.y +
          swayY +
          bobY +
          kick * 0.012 -
          lowered * 0.22 -
          sprint * 0.035 -
          frame.landOffset * 0.3,
        REST.z + kick * 0.075,
      );
      root.rotation.set(
        kick * 0.5 - lowered * 0.9 - sprint * 0.35,
        0.035 + swayX * 2 + sprint * 0.5,
        -swayX * 3 + lowered * 0.3,
      );

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
