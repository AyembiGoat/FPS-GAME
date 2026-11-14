import * as THREE from 'three';
import type { GameEvent, GameState } from '../core/game';
import { activeWeaponSpec } from '../core/game';
import type { GameMap } from '../core/map';
import { eyeAt, PLAYER_TUNING } from '../core/player';
import type { OpticId, ScopeOverlayKind, WeaponId } from '../core/weapon';
import { currentOpticZoom, OPTICS } from '../core/weapon';
import type { GameAudio } from './audio';
import { createEffects } from './effects';
import { createViewmodel } from './weapons/viewmodel';
import { buildWorld } from './world';

const DEFAULT_FIELD_OF_VIEW = 78;
/** Metres between footsteps. */
const STRIDE = 1.9;
/** Cap initial DPR at 1.25× so retina/4K displays stay locked at smooth 60 FPS. */
const MAX_RESOLUTION = Math.min(window.devicePixelRatio || 1, 1.25);
const MIN_RESOLUTION = 0.6;
const RESOLUTION_STEP = 0.85;
/** A frame longer than ~52 fps counts as slow so resolution adapts fast. */
const SLOW_FRAME_SECONDS = 0.019;
/** Radians the world camera rolls at full lean (~8.3 deg). */
const LEAN_ROLL = 0.145;
/** Minimum seconds between shadow re-rasterizations while targets are falling. */
const SHADOW_UPDATE_INTERVAL = 0.065;

/** The lens angle that magnifies the centre of the view `zoom` times. */
function zoomedFieldOfView(baseFov: number, zoom: number): number {
  const half = THREE.MathUtils.degToRad(baseFov / 2);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / zoom));
}

function casingStyleFor(weaponId: WeaponId): 'pistol' | 'rifle' | 'heavy' | 'shotgun' {
  switch (weaponId) {
    case 'remington-870':
      return 'shotgun';
    case 'awm':
    case 'scar-h':
    case 'desert-eagle':
      return 'heavy';
    case 'hk416':
    case 'ak47':
      return 'rifle';
    case 'mp5':
    case 'm1911':
    default:
      return 'pistol';
  }
}

export interface ScopeOverlayState {
  readonly active: boolean;
  readonly style: ScopeOverlayKind;
  readonly opacity: number;
  /** Roll cant in radians matching the leaned viewmodel cant so scoped lean feels unified. */
  readonly cantRad: number;
  readonly zoom: number;
  readonly variableZoom: boolean;
  readonly opticName: string;
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
  let shadowCooldown = 0;
  let targetsWereMoving = false;
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

  // Single viewmodel rig with lazy weapon+optic caching (zero hitching on swap).
  const initialSpec = activeWeaponSpec({
    weapon: { weaponId: 'hk416', loadout: { primary: 'hk416', secondary: 'm1911' } },
  } as GameState);
  const viewmodel = createViewmodel(initialSpec, world.scene.environment, initialSpec.opticId);
  let currentWeaponId: WeaponId = initialSpec.id;
  let currentOpticId: OpticId = initialSpec.opticId;
  const compiledKeys = new Set<string>();

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
  compileScene(viewmodel.scene, viewmodel.camera);
  compiledKeys.add(`${currentWeaponId}:${currentOpticId}`);

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
  const ejectLocalPos = new THREE.Vector3();
  const ejectLocalQuat = new THREE.Quaternion();
  const ejectWorldPos = new THREE.Vector3();

  let zoom = 1;
  let smoothedZoomTarget = 1;
  let currentAim = 0;
  let aimDirection = -1;
  let reloadStartedEmpty = false;
  let orbitClock = 0;
  let scopeState: ScopeOverlayState = {
    active: false,
    style: 'none',
    opacity: 0,
    cantRad: 0,
    zoom: 1,
    variableZoom: false,
    opticName: '',
  };

  function ensureWeaponRig(state: GameState) {
    const spec = activeWeaponSpec(state);
    if (spec.id === currentWeaponId && spec.opticId === currentOpticId) return spec;
    currentWeaponId = spec.id;
    currentOpticId = spec.opticId;
    viewmodel.setWeapon(spec, spec.opticId);
    const key = `${spec.id}:${spec.opticId}`;
    if (!compiledKeys.has(key)) {
      compileScene(viewmodel.scene, viewmodel.camera);
      compiledKeys.add(key);
    }
    return spec;
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

  function spawnWorldCasing(weaponId: WeaponId) {
    viewmodel.ejectionInViewSpace(ejectLocalPos, ejectLocalQuat);
    // Transform view-space ejection port into world space right beside the camera!
    ejectWorldPos.copy(ejectLocalPos).applyMatrix4(camera.matrixWorld);
    effects.ejectCasing(ejectWorldPos, camera.quaternion, casingStyleFor(weaponId));
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

    /** Expose active draw call & geometry stats for performance verification. */
    renderStats() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        pixelRatio: resolution,
      };
    },

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
      shadowCooldown = 0;
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
      if (slowSeconds > 0.35) {
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
      const spec = ensureWeaponRig(state);

      for (const event of events) {
        switch (event.type) {
          case 'shot': {
            const shotWeaponId = event.weaponId;
            viewmodel.onShot(state.weapon.aim, () => {
              spawnWorldCasing(shotWeaponId);
            });
            audio.shot(shotWeaponId);

            // Paint all pellet/bullet holes & dust, deduplicating simultaneous steel/surface audio.
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
          case 'zoom-toggle':
            viewmodel.onZoomToggle();
            audio.zoomClick();
            break;
          case 'weapon-switch':
            ensureWeaponRig(state);
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
            reloadStartedEmpty = state.weapon.rounds === 0;
            audio.reload(spec.reloadTime, viewmodel.reloadTiming(), reloadStartedEmpty, spec.id);
            break;
          case 'jump':
            audio.footstep(0.8);
            break;
          case 'land':
            audio.land(event.speed);
            landVelocity -= Math.min(event.speed, 10) * 0.16;
            break;
          case 'reload-end':
            reloadStartedEmpty = false;
            break;
        }
      }
    },

    /** Slowly drifting vantage camera overlooking the Shoot House for the Title Screen. */
    renderTitleBackdrop(dt: number, reducedMotion: boolean) {
      orbitClock += reducedMotion ? dt * 0.08 : dt * 0.22;
      const swayX = -1.2 + Math.sin(orbitClock) * 3.6;
      const swayZ = 14.8 + Math.cos(orbitClock * 0.7) * 1.8;
      const swayY = 3.1 + Math.sin(orbitClock * 0.5) * 0.2;

      if (zoom !== 1) {
        zoom = 1;
        smoothedZoomTarget = 1;
        syncCameraFov();
      }
      scopeState = {
        active: false,
        style: 'none',
        opacity: 0,
        cantRad: 0,
        zoom: 1,
        variableZoom: false,
        opticName: '',
      };
      camera.position.set(swayX, swayY, swayZ);
      camera.lookAt(swayX * 0.15 + 1.5, 1.45, -4.5);
      camera.updateMatrixWorld();

      let anyMoving = false;
      for (const target of world.targets) {
        if (target.update(dt)) anyMoving = true;
      }
      if (anyMoving) shadowsStale = true;
      effects.update(dt);

      shadowCooldown = Math.max(0, shadowCooldown - dt);
      if (shadowsStale && shadowCooldown <= 0) {
        renderer.shadowMap.needsUpdate = true;
        shadowsStale = false;
        shadowCooldown = SHADOW_UPDATE_INTERVAL;
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
      const spec = ensureWeaponRig(state);
      const optic = OPTICS[spec.opticId];

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

      const vx = state.player.velocity.x;
      const vz = state.player.velocity.z;
      const speed = Math.hypot(vx, vz);
      const moveAmount = state.player.grounded ? speed / PLAYER_TUNING.walkSpeed : 0;
      const bob =
        -Math.abs(Math.cos((walked / STRIDE) * Math.PI)) * 0.02 * Math.min(moveAmount, 1.35);

      const yaw = state.player.yaw + look.yaw;
      const pitch = THREE.MathUtils.clamp(
        state.player.pitch + look.pitch,
        -PLAYER_TUNING.maxPitch,
        PLAYER_TUNING.maxPitch,
      );
      // Project horizontal velocity onto player's right vector for natural strafe banking!
      const strafeSpeed = vx * Math.cos(yaw) - vz * Math.sin(yaw);

      const lean = THREE.MathUtils.lerp(previous.player.lean, state.player.lean, alpha);
      const leanAmount = lean / PLAYER_TUNING.leanDistance;
      const eye = eyeAt({ x, y, z }, yaw, lean);
      const camKick = viewmodel.cameraKick();

      camera.position.set(eye.x, eye.y + bob + landOffset, eye.z);
      camera.rotation.set(
        pitch + state.weapon.recoil + camKick.pitch,
        yaw,
        -leanAmount * LEAN_ROLL + camKick.roll,
      );

      // Smoothly interpolate active optic zoom (including variable-zoom toggles on LPVO & PM II!).
      const aim = THREE.MathUtils.lerp(previous.weapon.aim, state.weapon.aim, alpha);
      currentAim = aim;
      const smoothAim = THREE.MathUtils.smoothstep(aim, 0, 1);
      const activeStageZoom = currentOpticZoom(spec, state.weapon.zoomStage);
      smoothedZoomTarget += (activeStageZoom - smoothedZoomTarget) * (1 - Math.exp(-16 * dt));
      const wantedZoom = 1 + (smoothedZoomTarget - 1) * smoothAim;
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

      // Magnified scope overlays (`acog` 3.5×, `lpvo` 2×/5×, `sniper` 6×/10×) snap cleanly
      // into view once ADS crosses 72% and hide the 3D viewmodel so zero scope housing clips!
      const overlayStyle = optic.overlay;
      const hasOverlay = overlayStyle !== 'none';
      const scopeOpacity = hasOverlay ? THREE.MathUtils.smoothstep(aim, 0.72, 0.94) : 0;
      const hideModelForScope = hasOverlay && aim >= 0.82;
      const scopedCant = -leanAmount * LEAN_ROLL;

      scopeState = {
        active: scopeOpacity > 0.01,
        style: overlayStyle,
        opacity: scopeOpacity,
        cantRad: scopedCant,
        zoom: activeStageZoom,
        variableZoom: spec.zoomStages.length > 1,
        opticName: optic.shortName,
      };

      const reloading = state.weapon.reloadRemaining > 0;
      const reloadFrac = reloading ? 1 - state.weapon.reloadRemaining / spec.reloadTime : 0;
      const equipFrac =
        state.weapon.switchRemaining > 0 ? 1 - state.weapon.switchRemaining / spec.equipTime : 1;

      viewmodel.update(dt, {
        speed,
        strafeSpeed,
        verticalSpeed: state.player.velocity.y,
        grounded: state.player.grounded,
        sprinting: speed > PLAYER_TUNING.walkSpeed * 1.1 && state.player.grounded,
        yawDelta: yaw - lastYaw,
        pitchDelta: pitch - lastPitch,
        reload: reloadFrac,
        reloadEmpty: reloadStartedEmpty,
        aim,
        equip: equipFrac,
        hasRounds: state.weapon.rounds > 0,
        lean: leanAmount,
        scopeHidden: hideModelForScope,
      });
      lastYaw = yaw;
      lastPitch = pitch;

      sunInView.copy(world.sunDirection).transformDirection(camera.matrixWorldInverse);
      viewmodel.setSun(sunInView);

      let anyTargetMoving = false;
      for (const target of world.targets) {
        if (target.update(dt)) anyTargetMoving = true;
      }
      if (anyTargetMoving) {
        shadowsStale = true;
      } else if (targetsWereMoving) {
        // Guarantee a crisp final shadow update the exact frame targets come to rest!
        shadowsStale = true;
        shadowCooldown = 0;
      }
      targetsWereMoving = anyTargetMoving;

      effects.update(dt);

      if (!draw) return;
      shadowCooldown = Math.max(0, shadowCooldown - dt);
      if (shadowsStale && shadowCooldown <= 0) {
        renderer.shadowMap.needsUpdate = true;
        shadowsStale = false;
        shadowCooldown = SHADOW_UPDATE_INTERVAL;
      }
      renderer.clear();
      renderer.render(world.scene, camera);
      if (!hideModelForScope) {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      }
    },
  };
}
