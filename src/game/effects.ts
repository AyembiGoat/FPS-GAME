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
  concrete: 0xc4c0b6,
  plywood: 0xc9a878,
  crate: 0xb89868,
  container: 0xd0d8e0,
  timber: 0x8e7254,
  target: 0xffd28a,
  enemy: 0xb9ad98,
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

  // Scratch math objects reused across calls.
  const facing = new THREE.Vector3(0, 0, 1);
  const normalVector = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const ejectRight = new THREE.Vector3();
  const ejectUp = new THREE.Vector3();
  const ejectBack = new THREE.Vector3();

  return {
    impact(point: Vec3, normal: Vec3, surface: SurfaceMaterial | 'target' | 'enemy') {
      normalVector.set(normal.x, normal.y, normal.z);

      // Targets fall over and people move, so a hole left hanging in the air would be wrong.
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
    },
  };
}
