import * as THREE from 'three';
import type { SurfaceMaterial } from '../core/map';
import type { Vec3 } from '../core/vec';
import { softDot } from './materials';

// Expanded fixed pools — all 128 bullet holes share ONE InstancedMesh (1 draw call total!).
const HOLES = 128;
const PUFFS = 24;
const PUFF_LIFE = 0.32;
const CASINGS = 28;
const CASING_LIFE = 1.65;

const DUST: Record<SurfaceMaterial | 'target' | 'enemy', number> = {
  floor: 0xcfc8b8,
  asphalt: 0x6f747d,
  concrete: 0xc4c0b6,
  brick: 0xb9755d,
  plywood: 0xc9a878,
  crate: 0xb89868,
  container: 0xd0d8e0,
  'container-red': 0xd8a298,
  timber: 0x8e7254,
  steel: 0xaab4c0,
  target: 0xffd28a,
  enemy: 0x8b7e6d,
};

interface CasingSlot {
  active: boolean;
  life: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
}

/**
 * Bullet holes (single InstancedMesh = 1 draw call), dust puffs, and tumbling brass/shotgun
 * casings (single InstancedMesh = 1 draw call). Zero allocations per shot or per frame.
 */
export function createEffects(scene: THREE.Scene) {
  // 1. Instanced bullet decals (up to 128 decals in 1 draw call).
  const holeGeometry = new THREE.CircleGeometry(0.018, 10);
  const holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x15120f,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const holeMesh = new THREE.InstancedMesh(holeGeometry, holeMaterial, HOLES);
  holeMesh.count = 0;
  holeMesh.frustumCulled = false;
  scene.add(holeMesh);
  let nextHole = 0;
  let activeHoles = 0;

  // 2. Impact dust puffs.
  const dot = softDot('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const puffs = Array.from({ length: PUFFS }, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false }),
    );
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, drift: new THREE.Vector3(), life: 0 };
  });
  let nextPuff = 0;

  // 3. Instanced tumbling spent brass & 12-gauge shells (up to 28 casings in 1 draw call).
  const casingGeom = new THREE.CylinderGeometry(0.0046, 0.0048, 0.028, 8);
  casingGeom.rotateX(Math.PI / 2);
  const casingMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.72,
  });
  const casingMesh = new THREE.InstancedMesh(casingGeom, casingMat, CASINGS);
  casingMesh.count = CASINGS;
  casingMesh.frustumCulled = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const brassColor = new THREE.Color(0xdcb45a);
  const redShellColor = new THREE.Color(0xb82c22);
  const casings: CasingSlot[] = Array.from({ length: CASINGS }, (_, i) => {
    casingMesh.setMatrixAt(i, zeroMatrix);
    casingMesh.setColorAt(i, brassColor);
    return {
      active: false,
      life: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      spin: new THREE.Vector3(),
      scale: new THREE.Vector3(1, 1, 1),
    };
  });
  casingMesh.instanceMatrix.needsUpdate = true;
  if (casingMesh.instanceColor) casingMesh.instanceColor.needsUpdate = true;
  scene.add(casingMesh);
  let nextCasing = 0;
  let activeCasings = 0;

  // 4. Instanced supersonic tracer streaks for enemy incoming volleys (1 draw call total).
  const TRACERS = 16;
  const TRACER_LIFE = 0.095;
  const tracerGeom = new THREE.BoxGeometry(0.018, 0.018, 1.0);
  tracerGeom.translate(0, 0, 0.5);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffc878,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tracerMesh = new THREE.InstancedMesh(tracerGeom, tracerMat, TRACERS);
  tracerMesh.count = TRACERS;
  tracerMesh.frustumCulled = false;

  // Scratch math objects reused across calls.
  const facing = new THREE.Vector3(0, 0, 1);
  const normalVector = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const ejectRight = new THREE.Vector3();
  const ejectUp = new THREE.Vector3();
  const ejectBack = new THREE.Vector3();
  const tracerFrom = new THREE.Vector3();
  const tracerTo = new THREE.Vector3();

  const tracers = Array.from({ length: TRACERS }, (_, i) => {
    tracerMesh.setMatrixAt(i, zeroMatrix);
    return { active: false, life: 0, start: new THREE.Vector3(), end: new THREE.Vector3() };
  });
  tracerMesh.instanceMatrix.needsUpdate = true;
  scene.add(tracerMesh);
  let nextTracer = 0;
  let activeTracers = 0;

  return {
    impact(point: Vec3, normal: Vec3, surface: SurfaceMaterial | 'target' | 'enemy') {
      normalVector.set(normal.x, normal.y, normal.z);

      // Moving/falling targets and human combatants never get floating static wall bullet holes.
      if (surface !== 'target' && surface !== 'enemy') {
        dummy.position.set(point.x, point.y, point.z).addScaledVector(normalVector, 0.0025);
        dummy.quaternion.setFromUnitVectors(facing, normalVector);
        dummy.scale.setScalar(0.85 + Math.random() * 0.32);
        dummy.updateMatrix();
        holeMesh.setMatrixAt(nextHole, dummy.matrix);
        nextHole = (nextHole + 1) % HOLES;
        if (activeHoles < HOLES) {
          activeHoles++;
          holeMesh.count = activeHoles;
        }
        holeMesh.instanceMatrix.needsUpdate = true;
      }

      const puff = puffs[nextPuff];
      nextPuff = (nextPuff + 1) % PUFFS;
      if (puff) {
        puff.sprite.position.set(point.x, point.y, point.z).addScaledVector(normalVector, 0.05);
        puff.sprite.material.color.setHex(DUST[surface]);
        puff.sprite.visible = true;
        puff.drift.copy(normalVector).multiplyScalar(0.7);
        puff.life = PUFF_LIFE;
      }
    },

    /** Spawn a physical tumbling brass case or 12-gauge red shotgun hull in world space. */
    ejectCasing(
      origin: THREE.Vector3,
      cameraQuat: THREE.Quaternion,
      style: 'pistol' | 'rifle' | 'heavy' | 'shotgun',
    ) {
      const slot = casings[nextCasing];
      const idx = nextCasing;
      nextCasing = (nextCasing + 1) % CASINGS;
      if (!slot) return;

      if (!slot.active) activeCasings++;
      slot.active = true;
      slot.life = CASING_LIFE;
      slot.position.copy(origin);

      ejectRight.set(1, 0, 0).applyQuaternion(cameraQuat);
      ejectUp.set(0, 1, 0).applyQuaternion(cameraQuat);
      ejectBack.set(0, 0, 1).applyQuaternion(cameraQuat);

      const speedR = 1.65 + Math.random() * 0.85;
      const speedU = 0.85 + Math.random() * 0.55;
      const speedB = 0.25 + Math.random() * 0.45;
      slot.velocity
        .copy(ejectRight)
        .multiplyScalar(speedR)
        .addScaledVector(ejectUp, speedU)
        .addScaledVector(ejectBack, speedB);

      slot.rotation.setFromQuaternion(cameraQuat);
      slot.spin.set(
        (Math.random() - 0.5) * 26,
        14 + Math.random() * 14,
        (Math.random() - 0.5) * 24,
      );

      if (style === 'shotgun') {
        slot.scale.set(1.9, 1.9, 2.0);
        casingMesh.setColorAt(idx, redShellColor);
      } else if (style === 'heavy') {
        slot.scale.set(1.25, 1.25, 1.85);
        casingMesh.setColorAt(idx, brassColor);
      } else if (style === 'rifle') {
        slot.scale.set(1.0, 1.0, 1.45);
        casingMesh.setColorAt(idx, brassColor);
      } else {
        slot.scale.set(0.95, 0.95, 0.8);
        casingMesh.setColorAt(idx, brassColor);
      }
      if (casingMesh.instanceColor) casingMesh.instanceColor.needsUpdate = true;
    },

    /** Spawn a brief visible bullet tracer streak from enemy muzzle toward impact. */
    tracer(origin: Vec3, endPoint: Vec3) {
      const slot = tracers[nextTracer];
      const idx = nextTracer;
      nextTracer = (nextTracer + 1) % TRACERS;
      if (!slot) return;
      if (!slot.active) activeTracers++;
      slot.active = true;
      slot.life = TRACER_LIFE;
      slot.start.set(origin.x, origin.y, origin.z);
      slot.end.set(endPoint.x, endPoint.y, endPoint.z);

      const dist = slot.start.distanceTo(slot.end);
      const segLen = Math.min(dist * 0.45, 5.5);
      dummy.position.copy(slot.start);
      dummy.lookAt(slot.end);
      dummy.scale.set(1, 1, Math.max(0.4, segLen));
      dummy.updateMatrix();
      tracerMesh.setMatrixAt(idx, dummy.matrix);
      tracerMesh.instanceMatrix.needsUpdate = true;
    },

    /** Clear bullet decals when starting a fresh match. */
    clearDecals() {
      nextHole = 0;
      activeHoles = 0;
      holeMesh.count = 0;
    },

    update(dt: number) {
      for (const puff of puffs) {
        if (puff.life <= 0) continue;
        puff.life -= dt;
        const age = 1 - Math.max(0, puff.life) / PUFF_LIFE;
        puff.sprite.position.addScaledVector(puff.drift, dt);
        puff.sprite.scale.setScalar(0.08 + age * 0.4);
        puff.sprite.material.opacity = 0.55 * (1 - age);
        if (puff.life <= 0) puff.sprite.visible = false;
      }

      if (activeCasings > 0) {
        let dirty = false;
        for (let i = 0; i < CASINGS; i++) {
          const c = casings[i];
          if (!c || !c.active) continue;
          dirty = true;
          c.life -= dt;
          if (c.life <= 0) {
            c.active = false;
            activeCasings--;
            casingMesh.setMatrixAt(i, zeroMatrix);
            continue;
          }
          c.velocity.y -= 9.8 * dt;
          c.position.addScaledVector(c.velocity, dt);
          if (c.position.y < 0.015) {
            c.position.y = 0.015;
            c.velocity.y = Math.abs(c.velocity.y) * 0.34;
            c.velocity.x *= 0.62;
            c.velocity.z *= 0.62;
            c.spin.multiplyScalar(0.5);
          }
          c.rotation.x += c.spin.x * dt;
          c.rotation.y += c.spin.y * dt;
          c.rotation.z += c.spin.z * dt;

          dummy.position.copy(c.position);
          dummy.rotation.copy(c.rotation);
          const fade = c.life < 0.25 ? c.life / 0.25 : 1;
          dummy.scale.copy(c.scale).multiplyScalar(fade);
          dummy.updateMatrix();
          casingMesh.setMatrixAt(i, dummy.matrix);
        }
        if (dirty) casingMesh.instanceMatrix.needsUpdate = true;
      }

      if (activeTracers > 0) {
        let dirty = false;
        for (let i = 0; i < TRACERS; i++) {
          const tr = tracers[i];
          if (!tr || !tr.active) continue;
          dirty = true;
          tr.life -= dt;
          if (tr.life <= 0) {
            tr.active = false;
            activeTracers--;
            tracerMesh.setMatrixAt(i, zeroMatrix);
            continue;
          }
          const progress = 1 - tr.life / TRACER_LIFE;
          const totalDist = tr.start.distanceTo(tr.end);
          const segLen = Math.min(totalDist * 0.42, 5.2);
          tracerFrom.lerpVectors(tr.start, tr.end, progress * 0.72);
          tracerTo.copy(tr.end);
          dummy.position.copy(tracerFrom);
          dummy.lookAt(tracerTo);
          dummy.scale.set(
            1 - progress * 0.45,
            1 - progress * 0.45,
            Math.max(0.3, segLen * (1 - progress * 0.5)),
          );
          dummy.updateMatrix();
          tracerMesh.setMatrixAt(i, dummy.matrix);
        }
        if (dirty) tracerMesh.instanceMatrix.needsUpdate = true;
      }
    },

    dispose() {
      scene.remove(holeMesh, casingMesh, tracerMesh);
      holeGeometry.dispose();
      holeMaterial.dispose();
      casingGeom.dispose();
      casingMat.dispose();
      tracerGeom.dispose();
      tracerMat.dispose();
      dot.dispose();
      for (const p of puffs) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
      }
    },
  };
}
