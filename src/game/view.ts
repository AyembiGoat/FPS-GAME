import * as THREE from 'three';
import type { GameEvent, GameState } from '../core/game';
import { activeWeaponSpec } from '../core/game';
import type { GameMap } from '../core/map';
import { eyeAt, PLAYER_TUNING } from '../core/player';
import type { WeaponId } from '../core/weapon';
import { getWeaponSpec } from '../core/weapon';
import type { GameAudio } from './audio';
import { createEffects } from './effects';
import { buildWeaponModel } from './weapons';
import type { WeaponModel } from './weapons/model';
import type { Viewmodel } from './weapons/viewmodel';
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
/** Radians the world camera rolls at full lean (~8.3 deg). */
const LEAN_ROLL = 0.145;

/** The lens angle that magnifies the centre of the view `zoom` times. */
function zoomedFieldOfView(baseFov: number, zoom: number): number {
  const half = THREE.MathUtils.degToRad(baseFov / 2);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / zoom));
}

export interface ScopeOverlayState {
  readonly active: boolean;
  readonly opacity: number;
  /** Roll cant in radians matching the leaned viewmodel cant so scoped lean feels unified. */
  readonly cantRad: number;
  readonly zoom: number;
}

/** Everything the player sees and hears. Reads simulation state; never changes it. */
export function createView(map: GameMap, audio: GameAudio) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  let resolution = MAX_RESOLUTION;
  renderer.setPixelRatio(resolution);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  let shadowsStale = true;
  let slowSeconds = 0;
  let smoothSeconds = 0;
  let secondsBeforeRaising = 8;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.autoClear = false;
  document.body.prepend(renderer.domElement);

  const world = buildWorld(map, renderer);
  let baseFov = DEFAULT_FIELD_OF_VIEW;
  const camera = new THREE.PerspectiveCamera(baseFov, 1, 0.05, 3000);
  camera.rotation.order = 'YXZ';
  const effects = createEffects(world.scene);

  const muzzleLight = new THREE.PointLight(0xffc98a, 0, 9, 2);
  world.scene.add(muzzleLight);

  // Lazy per-weapon viewmodel cache: builds and pre-compiles each firearm on first use so
  // switching weapons mid-run is instant with zero hitching.
  const viewmodelCache = new Map<WeaponId, { model: WeaponModel; viewmodel: Viewmodel }>();
  function getViewmodel(weaponId: WeaponId) {
    let entry = viewmodelCache.get(weaponId);
    if (!entry) {
      const spec = getWeaponSpec(weaponId);
      const model = buildWeaponModel(spec);
      const viewmodel = createViewmodel(model, world.scene.environment);
      viewmodel.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      viewmodel.camera.updateProjectionMatrix();
      compileScene(viewmodel.scene, viewmodel.camera);
      entry = { model, viewmodel };
      viewmodelCache.set(weaponId, entry);
    }
    return entry;
  }

  function compileScene(scene: THREE.Scene, lens: THREE.Camera) {
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

  compileScene(world.scene, camera);
  let currentWeaponId: WeaponId = 'hk416';
  let activeRig = getViewmodel(currentWeaponId);

  let muzzleLightTime = 0;
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
  let scopeState: ScopeOverlayState = { active: false, opacity: 0, cantRad: 0, zoom: 1 };

  function ensureWeaponRig(weaponId: WeaponId) {
    if (weaponId === currentWeaponId) return;
    currentWeaponId = weaponId;
    activeRig = getViewmodel(weaponId);
  }

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
    for (const entry of viewmodelCache.values()) {
      entry.viewmodel.camera.aspect = width / height;
      entry.viewmodel.camera.updateProjectionMatrix();
    }
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

    adapt(frameSeconds: number) {
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

    zoom: () => zoom,
    aimBlend: () => currentAim,
    scopeOverlay: () => scopeState,

    /** React to what happened in one simulation step. */
    handle(events: readonly GameEvent[], state: GameState) {
      ensureWeaponRig(state.weapon.weaponId);
      const spec = activeWeaponSpec(state);

      for (const event of events) {
        switch (event.type) {
          case 'shot': {
            const kickScale = spec.recoilKick / 0.032;
            activeRig.viewmodel.fire(kickScale);
            audio.shot(event.weaponId);
            muzzleLightTime = MUZZLE_LIGHT_SECONDS;

            // Paint all pellet/bullet holes & dust, but deduplicate simultaneous steel/surface audio.
            let playedSteel = false;
            let playedSurface = false;
            for (const impact of event.hits) {
              effects.impact(impact.point, impact.normal, impact.surface);
              const pan = panOf(impact.point);
              if (impact.surface === 'target') {
                if (!playedSteel) {
                  audio.steel(impact.distance, pan);
                  playedSteel = true;
                }
              } else if (!playedSurface) {
                audio.impact(impact.distance, impact.surface, pan);
                playedSurface = true;
              }
            }
            break;
          }
          case 'weapon-switch':
            ensureWeaponRig(event.weaponId);
            audio.weaponSwitch();
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
            audio.reload(spec.reloadTime, activeRig.model.reload, state.weapon.rounds === 0);
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

    /** Slowly drifting vantage camera overlooking the expanded Shoot House for the Title Screen. */
    renderTitleBackdrop(dt: number, reducedMotion: boolean) {
      orbitClock += reducedMotion ? dt * 0.08 : dt * 0.22;
      const swayX = -1.2 + Math.sin(orbitClock) * 3.6;
      const swayZ = 14.8 + Math.cos(orbitClock * 0.7) * 1.8;
      const swayY = 3.1 + Math.sin(orbitClock * 0.5) * 0.2;

      if (zoom !== 1) {
        zoom = 1;
        syncCameraFov();
      }
      scopeState = { active: false, opacity: 0, cantRad: 0, zoom: 1 };
      camera.position.set(swayX, swayY, swayZ);
      camera.lookAt(swayX * 0.15 + 1.5, 1.45, -4.5);
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

    frame(
      previous: GameState,
      state: GameState,
      alpha: number,
      dt: number,
      look: { yaw: number; pitch: number },
      draw = true,
    ) {
      ensureWeaponRig(state.weapon.weaponId);
      const spec = activeWeaponSpec(state);

      const from = previous.player.position;
      const to = state.player.position;
      const x = THREE.MathUtils.lerp(from.x, to.x, alpha);
      const y = THREE.MathUtils.lerp(from.y, to.y, alpha);
      const z = THREE.MathUtils.lerp(from.z, to.z, alpha);

      const moved = Math.hypot(x - lastPosition.x, z - lastPosition.z);
      lastPosition.set(x, 0, z);
      if (state.player.grounded) {
        walked += moved;
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
      const lean = THREE.MathUtils.lerp(previous.player.lean, state.player.lean, alpha);
      const leanAmount = lean / PLAYER_TUNING.leanDistance;
      const eye = eyeAt({ x, y, z }, yaw, lean);
      camera.position.set(eye.x, eye.y + bob + landOffset, eye.z);
      camera.rotation.set(pitch + state.weapon.recoil, yaw, -leanAmount * LEAN_ROLL);

      // Aiming narrows the lens by the active weapon's real magnification (1.25×..6×).
      const aim = THREE.MathUtils.lerp(previous.weapon.aim, state.weapon.aim, alpha);
      currentAim = aim;
      const smoothAim = THREE.MathUtils.smoothstep(aim, 0, 1);
      const wantedZoom = 1 + (spec.aimZoom - 1) * smoothAim;
      if (Math.abs(wantedZoom - zoom) > 1e-4) {
        zoom = wantedZoom;
        syncCameraFov();
      }
      camera.updateMatrixWorld();

      const direction = Math.sign(state.weapon.aim - previous.weapon.aim);
      if (direction !== 0 && direction !== aimDirection) {
        aimDirection = direction;
        audio.aim(direction > 0);
      }

      // Telescopic sniper scope (AWM): seamlessly snap into crisp full-screen mil-dot overlay
      // once aim crosses 78% and hide the 3D viewmodel so zero scope geometry clips near plane.
      const isTelescopic = spec.scopeStyle === 'telescopic';
      const scopeOpacity = isTelescopic ? THREE.MathUtils.smoothstep(aim, 0.72, 0.94) : 0;
      const hideModelForScope = isTelescopic && aim >= 0.82;
      // Rotate reticle slightly with lean cant so leaning while scoped feels physically grounded!
      const scopedCant = -leanAmount * 0.145;
      scopeState = {
        active: scopeOpacity > 0.01,
        opacity: scopeOpacity,
        cantRad: scopedCant,
        zoom: spec.aimZoom,
      };
      activeRig.viewmodel.setVisible(!hideModelForScope);

      const reloading = state.weapon.reloadRemaining > 0;
      const cycleProgress =
        state.weapon.cooldown > 0 ? 1 - state.weapon.cooldown / spec.fireInterval : 0;
      const switchProgress =
        state.weapon.switchRemaining > 0 ? state.weapon.switchRemaining / spec.equipTime : 0;

      activeRig.viewmodel.update(dt, {
        rounds: state.weapon.rounds,
        reloadProgress: reloading ? 1 - state.weapon.reloadRemaining / spec.reloadTime : null,
        cycleProgress,
        switchProgress,
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

      sunInView.copy(world.sunDirection).transformDirection(camera.matrixWorldInverse);
      activeRig.viewmodel.setSun(sunInView);

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
      if (!hideModelForScope) {
        renderer.clearDepth();
        renderer.render(activeRig.viewmodel.scene, activeRig.viewmodel.camera);
      }
    },
  };
}
