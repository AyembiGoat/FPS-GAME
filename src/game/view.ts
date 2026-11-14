import * as THREE from 'three';
import type { GameEvent, GameState } from '../core/game';
import type { GameMap } from '../core/map';
import { PLAYER_TUNING } from '../core/player';
import { M1911 } from '../core/weapon';
import type { GameAudio } from './audio';
import { createEffects } from './effects';
import { createHud } from './hud';
import { createViewmodel } from './viewmodel';
import { buildWorld } from './world';

const FIELD_OF_VIEW = 78;
/** Metres between footsteps. */
const STRIDE = 1.9;
const MUZZLE_LIGHT_SECONDS = 0.05;

/** Everything the player sees and hears. Reads simulation state; never changes it. */
export function createView(map: GameMap, audio: GameAudio) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  // The gun is drawn in a second pass over the world, so clearing is done by hand.
  renderer.autoClear = false;
  document.body.prepend(renderer.domElement);

  const world = buildWorld(map, renderer);
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 3000);
  camera.rotation.order = 'YXZ';
  const viewmodel = createViewmodel(world.scene.environment);
  const effects = createEffects(world.scene);
  const hud = createHud();

  const muzzleLight = new THREE.PointLight(0xffc98a, 0, 9, 2);
  world.scene.add(muzzleLight);
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

    /** React to what happened in one simulation step. */
    handle(events: readonly GameEvent[]) {
      for (const event of events) {
        switch (event.type) {
          case 'shot':
            viewmodel.fire();
            audio.shot();
            muzzleLightTime = MUZZLE_LIGHT_SECONDS;
            if (event.hit) {
              effects.impact(event.hit.point, event.hit.normal, event.hit.surface);
              if (event.hit.surface === 'target') audio.steel(event.hit.distance);
              else audio.impact(event.hit.distance, event.hit.surface);
            }
            break;
          case 'target-down':
            world.targets[event.index]?.setDown(true);
            hud.hit();
            break;
          case 'targets-reset':
            for (const target of world.targets) target.setDown(false);
            break;
          case 'dry-fire':
            audio.dryFire();
            break;
          case 'reload-start':
            audio.reload(M1911.reloadTime);
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
      camera.position.set(x, y + PLAYER_TUNING.eyeHeight + bob + landOffset, z);
      camera.rotation.set(pitch + state.weapon.recoil, yaw, 0);
      camera.updateMatrixWorld();

      const reloading = state.weapon.reloadRemaining > 0;
      viewmodel.update(dt, {
        rounds: state.weapon.rounds,
        reloadProgress: reloading ? 1 - state.weapon.reloadRemaining / M1911.reloadTime : null,
        moveAmount,
        sprinting: speed > PLAYER_TUNING.walkSpeed * 1.1 && state.player.grounded,
        walked,
        yawRate: dt > 0 ? (yaw - lastYaw) / dt : 0,
        pitchRate: dt > 0 ? (pitch - lastPitch) / dt : 0,
        landOffset,
      });
      lastYaw = yaw;
      lastPitch = pitch;

      // The gun has its own scene, so hand it the sun as seen from the camera.
      sunInView.copy(world.sunDirection).transformDirection(camera.matrixWorldInverse);
      viewmodel.setSun(sunInView);

      muzzleLightTime = Math.max(0, muzzleLightTime - dt);
      muzzleLight.intensity = muzzleLightTime > 0 ? 14 : 0;
      muzzleLight.position.copy(camera.position);

      for (const target of world.targets) target.update(dt);
      effects.update(dt);
      hud.update(dt, {
        rounds: state.weapon.rounds,
        reloading,
        down: state.targetsDown.filter(Boolean).length,
        total: state.targetsDown.length,
      });

      if (!draw) return;
      renderer.clear();
      renderer.render(world.scene, camera);
      renderer.clearDepth();
      renderer.render(viewmodel.scene, viewmodel.camera);
    },
  };
}
