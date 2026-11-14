import * as THREE from 'three';
import type { SurfaceMaterial } from '../core/map';
import type { Vec3 } from '../core/vec';
import { softDot } from './materials';

const HOLES = 48;
const PUFFS = 8;
const PUFF_LIFE = 0.32;

const DUST: Record<SurfaceMaterial | 'target', number> = {
  floor: 0xcfc8b8,
  concrete: 0xc4c0b6,
  plywood: 0xc9a878,
  crate: 0xb89868,
  target: 0xe6e4de,
};

/** Bullet holes and dust where a shot lands. Both use fixed pools; nothing is allocated per shot. */
export function createEffects(scene: THREE.Scene) {
  const holeGeometry = new THREE.CircleGeometry(0.02, 10);
  const holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x15120f,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const holes = Array.from({ length: HOLES }, () => {
    const mesh = new THREE.Mesh(holeGeometry, holeMaterial);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  let nextHole = 0;

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

  const facing = new THREE.Vector3(0, 0, 1);
  const normalVector = new THREE.Vector3();

  return {
    /** Take every hole and dust puff off the map. Used when a run starts over. */
    clear() {
      for (const hole of holes) hole.visible = false;
      for (const puff of puffs) {
        puff.life = 0;
        puff.sprite.visible = false;
      }
    },

    impact(point: Vec3, normal: Vec3, surface: SurfaceMaterial | 'target') {
      normalVector.set(normal.x, normal.y, normal.z);

      // Targets fall over, so a hole left hanging in the air would be wrong.
      if (surface !== 'target') {
        const hole = holes[nextHole];
        nextHole = (nextHole + 1) % HOLES;
        if (hole) {
          hole.position.set(point.x, point.y, point.z).addScaledVector(normalVector, 0.002);
          hole.quaternion.setFromUnitVectors(facing, normalVector);
          hole.visible = true;
        }
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
    },
  };
}
