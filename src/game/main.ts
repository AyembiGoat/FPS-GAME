import * as THREE from 'three';
import { createFixedLoop } from '../core/fixedLoop';
import type { PlayerInput } from '../core/player';
import { createPlayer, PLAYER_TUNING, stepPlayer } from '../core/player';

/**
 * Baseline sandbox scene: just enough to prove the pipeline (input -> core
 * simulation -> render) end to end. Nothing here is final art or final design.
 */

const MOUSE_SENSITIVITY = 0.0022;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.Fog(0x0b0d12, 30, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1c22, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(8, 14, 6);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(200, 100, 0x3d4658, 0x2a303d));

// Reference blocks for a sense of scale and motion. Purely visual: no collision yet.
const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xe0723a, roughness: 0.7 });
for (let i = 0; i < 24; i++) {
  const angle = (i / 24) * Math.PI * 2;
  const radius = 10 + (i % 3) * 7;
  const height = 1 + (i % 4);
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, height, 2), blockMaterial);
  block.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
  scene.add(block);
}

const overlay = document.getElementById('overlay');
overlay?.addEventListener('click', () => {
  void renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (overlay) overlay.hidden = locked;
  if (!locked) keys.clear();
});

const keys = new Set<string>();
let yawDelta = 0;
let pitchDelta = 0;

document.addEventListener('keydown', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  keys.add(event.code);
  if (event.code === 'Space') event.preventDefault();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yawDelta -= event.movementX * MOUSE_SENSITIVITY;
  pitchDelta -= event.movementY * MOUSE_SENSITIVITY;
});

function axis(positive: string, negative: string): number {
  return (keys.has(positive) ? 1 : 0) - (keys.has(negative) ? 1 : 0);
}

/** Read and consume input for one simulation step. */
function sampleInput(): PlayerInput {
  const input: PlayerInput = {
    forward: axis('KeyW', 'KeyS'),
    right: axis('KeyD', 'KeyA'),
    jump: keys.has('Space'),
    sprint: keys.has('ShiftLeft'),
    yawDelta,
    pitchDelta,
  };
  yawDelta = 0;
  pitchDelta = 0;
  return input;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const loop = createFixedLoop();
let previous = createPlayer({ x: 0, y: 0, z: 4 });
let player = previous;
let lastTime = performance.now();

renderer.setAnimationLoop((now) => {
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;

  const alpha = loop.advance(elapsed, (dt) => {
    previous = player;
    player = stepPlayer(player, sampleInput(), dt);
  });

  // Interpolate position between the last two simulation states for smooth motion
  // on displays that are not an exact multiple of the simulation rate.
  camera.position.set(
    THREE.MathUtils.lerp(previous.position.x, player.position.x, alpha),
    THREE.MathUtils.lerp(previous.position.y, player.position.y, alpha) + PLAYER_TUNING.eyeHeight,
    THREE.MathUtils.lerp(previous.position.z, player.position.z, alpha),
  );
  // Apply look that has not been simulated yet so aiming has no added latency.
  camera.rotation.set(player.pitch + pitchDelta, player.yaw + yawDelta, 0);

  renderer.render(scene, camera);
});
