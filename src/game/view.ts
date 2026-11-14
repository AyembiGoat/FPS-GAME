import * as THREE from 'three';
import type { GameEvent, GameState } from '../core/game';
import { WEAPON } from '../core/game';
import type { GameMap } from '../core/map';
import { eyeAt, PLAYER_TUNING } from '../core/player';
import type { GameAudio } from './audio';
import { createEffects } from './effects';
import { buildWeaponModel } from './weapons';
import { createViewmodel } from './weapons/viewmodel';
import { buildWorld } from './world';

const DEFAULT_FIELD_OF_VIEW = 78;
/** Metres between footsteps. */
const STRIDE = 1.9;
const MUZZLE_LIGHT_SECONDS = 0.05;
/** Rendered pixels per screen pixel: the most used, the least, and the step between. */
const MAX_RESOLUTION = Math.min(window.devicePixelRatio, 1.5);
const MIN_RESOLUTION = 0.6;
const RESOLUTION_STEP = 0.85;
/** A frame longer than this (about 45 a second) counts as slow. */
const SLOW_FRAME_SECONDS = 0.022;
/** Radians the view rolls at full lean. */
const LEAN_ROLL = 0.15;

/** The lens angle that magnifies the centre of the view `zoom` times. */
function zoomedFieldOfView(baseFov: number, zoom: number): number {
  const half = THREE.MathUtils.degToRad(baseFov / 2);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / zoom));
}

/** Everything the player sees and hears. Reads simulation state; never changes it. */
export function createView(map: GameMap, audio: GameAudio) {
  // Ask for the fast graphics card on laptops that have two.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  let resolution = MAX_RESOLUTION;
  renderer.setPixelRatio(resolution);
  renderer.shadowMap.enabled = true;
  // Nearly everything that casts a shadow stands still, so shadows are redrawn only
  // while a target is falling or getting up, not every frame.
  renderer.shadowMap.autoUpdate = false;
  let shadowsStale = true;
  let slowSeconds = 0;
  let smoothSeconds = 0;
  let secondsBeforeRaising = 8;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  // The gun is drawn in a second pass over the world, so clearing is done by hand.
  renderer.autoClear = false;
  document.body.prepend(renderer.domElement);

  const world = buildWorld(map, renderer);
  let baseFov = DEFAULT_FIELD_OF_VIEW;
  const camera = new THREE.PerspectiveCamera(baseFov, 1, 0.05, 3000);
  camera.rotation.order = 'YXZ';
  const weaponModel = buildWeaponModel(WEAPON);
  const viewmodel = createViewmodel(weaponModel, world.scene.environment);
  const effects = createEffects(world.scene);

  const muzzleLight = new THREE.PointLight(0xffc98a, 0, 9, 2);
  world.scene.add(muzzleLight);

  // Build every shader now. Otherwise the first shot, the first bullet hole and the
  // first dust puff each freeze the game for a moment while theirs is built.
  for (const [scene, lens] of [
    [world.scene, camera],
    [viewmodel.scene, viewmodel.camera],
  ] as const) {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    renderer.compile(scene, lens);
    for (const object of hidden) object.visible = false;
  }
  let muzzleLightTime = 0;

  // Landing pushes the camera down; a spring brings it back.
  let landOffset = 0;
  let landVelocity = 0;
  let walked = 0;
  let lastStride = 0;
  let lastYaw = map.spawn.yaw;
  let lastPitch = 0;
  const lastPosition = new THREE.Vector3(map.spawn.position.x, 0, map.spawn.position.z);
  const sunInView = new THREE.Vector3();
  const toSound = new THREE.Vector3();
  const rightward = new THREE.Vector3();
  let zoom = 1;
  let currentAim = 0;
  let aimDirection = -1;
  let orbitClock = 0;

  /** Where a point in the world sits between the ears: -1 left, 1 right. */
  function panOf(point: { x: number; y: number; z: number }): number {
    toSound.set(point.x, point.y, point.z).sub(camera.position).normalize();
    rightward.setFromMatrixColumn(camera.matrixWorld, 0);
    return toSound.dot(rightward) * 0.8;
  }

  function syncCameraFov() {
    camera.fov = zoomedFieldOfView(baseFov, zoom);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewmodel.camera.aspect = width / height;
    viewmodel.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    canvas: renderer.domElement,

    setFieldOfView(fovDegrees: number) {
      if (fovDegrees === baseFov) return;
      baseFov = fovDegrees;
      syncCameraFov();
    },

    resetTargets(state: GameState) {
      state.targetsDown.forEach((down, idx) => {
        world.targets[idx]?.setDown(down);
      });
      shadowsStale = true;
    },

    /**
     * Keep the game smooth on slower machines. Call once per displayed frame with how
     * long that frame took. After a run of slow frames the picture is drawn with fewer
     * pixels; after a long smooth spell it is sharpened again, more cautiously each
     * time it has had to back off.
     */
    adapt(frameSeconds: number) {
      // A very long frame is the tab being hidden or the page loading, not a slow machine.
      if (frameSeconds > 0.2) return;
      if (frameSeconds > SLOW_FRAME_SECONDS) {
        slowSeconds += frameSeconds;
        smoothSeconds = 0;
      } else {
        smoothSeconds += frameSeconds;
        slowSeconds = Math.max(0, slowSeconds - frameSeconds);
      }

      let wanted = resolution;
      if (slowSeconds > 0.6) {
        wanted = Math.max(MIN_RESOLUTION, resolution * RESOLUTION_STEP);
        slowSeconds = 0;
        secondsBeforeRaising *= 2;
      } else if (smoothSeconds > secondsBeforeRaising) {
        wanted = Math.min(MAX_RESOLUTION, resolution / RESOLUTION_STEP);
        smoothSeconds = 0;
      }
      if (wanted !== resolution) {
        resolution = wanted;
        renderer.setPixelRatio(resolution);
      }
    },

    /** Current magnification, so mouse speed can be scaled to match. */
    zoom: () => zoom,
    aimBlend: () => currentAim,

    /** React to what happened in one simulation step. */
    handle(events: readonly GameEvent[], state: GameState) {
      for (const event of events) {
        switch (event.type) {
          case 'shot':
            viewmodel.fire();
            audio.shot();
            muzzleLightTime = MUZZLE_LIGHT_SECONDS;
            if (event.hit) {
              effects.impact(event.hit.point, event.hit.normal, event.hit.surface);
              const pan = panOf(event.hit.point);
              if (event.hit.surface === 'target') audio.steel(event.hit.distance, pan);
              else audio.impact(event.hit.distance, event.hit.surface, pan);
            }
            break;
          case 'target-down':
            world.targets[event.index]?.setDown(true);
            break;
          case 'targets-reset':
            for (const target of world.targets) target.setDown(false);
            break;
          case 'dry-fire':
            audio.dryFire();
            break;
          case 'reload-start':
            audio.reload(WEAPON.reloadTime, weaponModel.reload, state.weapon.rounds === 0);
            break;
          case 'jump':
            audio.footstep(0.8);
            break;
          case 'land':
            audio.land(event.speed);
            landVelocity -= Math.min(event.speed, 10) * 0.16;
            break;
          case 'reload-end':
            break;
        }
      }
    },

    /**
     * Slowly drifting vantage camera overlooking Shoot House for the live Title Screen.
     */
    renderTitleBackdrop(dt: number, reducedMotion: boolean) {
      orbitClock += reducedMotion ? dt * 0.08 : dt * 0.24;
      const swayX = Math.sin(orbitClock) * 2.8;
      const swayZ = 9.4 + Math.cos(orbitClock * 0.7) * 1.4;
      const swayY = 2.45 + Math.sin(orbitClock * 0.5) * 0.16;

      if (zoom !== 1) {
        zoom = 1;
        syncCameraFov();
      }
      camera.position.set(swayX, swayY, swayZ);
      camera.lookAt(swayX * 0.18, 1.35, -3.8);
      camera.updateMatrixWorld();

      for (const target of world.targets) {
        if (target.update(dt)) shadowsStale = true;
      }
      effects.update(dt);

      if (shadowsStale) {
        renderer.shadowMap.needsUpdate = true;
        shadowsStale = false;
      }
      renderer.clear();
      renderer.render(world.scene, camera);
    },

    /**
     * Draw one frame. `alpha` blends between the last two simulation states;
     * `look` is mouse movement the simulation has not consumed yet. Pass `draw` as
     * false to advance animations without rendering.
     */
    frame(
      previous: GameState,
      state: GameState,
      alpha: number,
      dt: number,
      look: { yaw: number; pitch: number },
      draw = true,
    ) {
      const from = previous.player.position;
      const to = state.player.position;
      const x = THREE.MathUtils.lerp(from.x, to.x, alpha);
      const y = THREE.MathUtils.lerp(from.y, to.y, alpha);
      const z = THREE.MathUtils.lerp(from.z, to.z, alpha);

      const moved = Math.hypot(x - lastPosition.x, z - lastPosition.z);
      lastPosition.set(x, 0, z);
      if (state.player.grounded) {
        walked += moved;
        // Offset by half a stride so the first step sounds soon after setting off.
        const stride = Math.floor(walked / STRIDE + 0.5);
        if (stride !== lastStride) {
          lastStride = stride;
          audio.footstep(1);
        }
      }

      landVelocity += (-190 * landOffset - 22 * landVelocity) * dt;
      landOffset += landVelocity * dt;

      const speed = Math.hypot(state.player.velocity.x, state.player.velocity.z);
      const moveAmount = state.player.grounded ? speed / PLAYER_TUNING.walkSpeed : 0;
      const bob =
        -Math.abs(Math.cos((walked / STRIDE) * Math.PI)) * 0.022 * Math.min(moveAmount, 1.4);

      const yaw = state.player.yaw + look.yaw;
      const pitch = THREE.MathUtils.clamp(
        state.player.pitch + look.pitch,
        -PLAYER_TUNING.maxPitch,
        PLAYER_TUNING.maxPitch,
      );
      // The eye moves sideways with the lean, exactly as the simulation fires from it.
      const lean = THREE.MathUtils.lerp(previous.player.lean, state.player.lean, alpha);
      const leanAmount = lean / PLAYER_TUNING.leanDistance;
      const eye = eyeAt({ x, y, z }, yaw, lean);
      camera.position.set(eye.x, eye.y + bob + landOffset, eye.z);
      camera.rotation.set(pitch + state.weapon.recoil, yaw, -leanAmount * LEAN_ROLL);

      // Aiming narrows the lens by the gun's magnification.
      const aim = THREE.MathUtils.lerp(previous.weapon.aim, state.weapon.aim, alpha);
      currentAim = aim;
      const wantedZoom = 1 + (WEAPON.aimZoom - 1) * THREE.MathUtils.smoothstep(aim, 0, 1);
      if (wantedZoom !== zoom) {
        zoom = wantedZoom;
        syncCameraFov();
      }
      camera.updateMatrixWorld();

      const direction = Math.sign(state.weapon.aim - previous.weapon.aim);
      if (direction !== 0 && direction !== aimDirection) {
        aimDirection = direction;
        audio.aim(direction > 0);
      }

      const reloading = state.weapon.reloadRemaining > 0;
      viewmodel.update(dt, {
        rounds: state.weapon.rounds,
        reloadProgress: reloading ? 1 - state.weapon.reloadRemaining / WEAPON.reloadTime : null,
        aim,
        moveAmount,
        sprinting: speed > PLAYER_TUNING.walkSpeed * 1.1 && state.player.grounded,
        walked,
        yawRate: dt > 0 ? (yaw - lastYaw) / dt : 0,
        pitchRate: dt > 0 ? (pitch - lastPitch) / dt : 0,
        landOffset,
        lean: leanAmount,
      });
      lastYaw = yaw;
      lastPitch = pitch;

      // The gun has its own scene, so hand it the sun as seen from the camera.
      sunInView.copy(world.sunDirection).transformDirection(camera.matrixWorldInverse);
      viewmodel.setSun(sunInView);

      muzzleLightTime = Math.max(0, muzzleLightTime - dt);
      muzzleLight.intensity = muzzleLightTime > 0 ? 14 : 0;
      muzzleLight.position.copy(camera.position);

      for (const target of world.targets) {
        if (target.update(dt)) shadowsStale = true;
      }
      effects.update(dt);

      if (!draw) return;
      if (shadowsStale) {
        renderer.shadowMap.needsUpdate = true;
        shadowsStale = false;
      }
      renderer.clear();
      renderer.render(world.scene, camera);
      renderer.clearDepth();
      renderer.render(viewmodel.scene, viewmodel.camera);
    },
  };
}
