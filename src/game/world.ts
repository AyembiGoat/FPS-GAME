import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TARGET } from '../core/game';
import type { GameMap, SurfaceMaterial } from '../core/map';
import type { SurfaceName } from './materials';
import { applySurface, surface } from './materials';

/** Late afternoon: a low sun off to the left of the spawn, throwing long shadows across the lane. */
const SUN_ELEVATION = THREE.MathUtils.degToRad(31);
const SUN_AZIMUTH = THREE.MathUtils.degToRad(-58);

/** Which library surface each kind of map solid is made of. */
const SURFACES: Record<SurfaceMaterial, SurfaceName> = {
  floor: 'concrete-floor',
  concrete: 'concrete-wall',
  plywood: 'plywood',
  crate: 'crate',
};

function buildSolids(map: GameMap): THREE.Mesh[] {
  const byMaterial = new Map<SurfaceMaterial, THREE.BufferGeometry[]>();
  for (const solid of map.solids) {
    const size = new THREE.Vector3().subVectors(
      new THREE.Vector3(solid.max.x, solid.max.y, solid.max.z),
      new THREE.Vector3(solid.min.x, solid.min.y, solid.min.z),
    );
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    geometry.translate(
      solid.min.x + size.x / 2,
      solid.min.y + size.y / 2,
      solid.min.z + size.z / 2,
    );
    applySurface(geometry, SURFACES[solid.material]);
    const list = byMaterial.get(solid.material) ?? [];
    list.push(geometry);
    byMaterial.set(solid.material, list);
  }

  // One mesh per material keeps the whole level to a handful of draw calls.
  return [...byMaterial].map(([material, geometries]) => {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), surface(SURFACES[material]));
    mesh.castShadow = material !== 'floor';
    mesh.receiveShadow = true;
    return mesh;
  });
}

function plateShape(): THREE.Shape {
  const body = TARGET.bodyWidth / 2;
  const head = TARGET.headWidth / 2;
  const chamfer = 0.03;
  const shape = new THREE.Shape();
  shape.moveTo(-body, TARGET.bodyBottom);
  shape.lineTo(body, TARGET.bodyBottom);
  shape.lineTo(body, TARGET.bodyTop - chamfer);
  shape.lineTo(body - chamfer, TARGET.bodyTop);
  shape.lineTo(head, TARGET.bodyTop);
  shape.lineTo(head, TARGET.headTop - chamfer);
  shape.lineTo(head - chamfer, TARGET.headTop);
  shape.lineTo(-head + chamfer, TARGET.headTop);
  shape.lineTo(-head, TARGET.headTop - chamfer);
  shape.lineTo(-head, TARGET.bodyTop);
  shape.lineTo(-body + chamfer, TARGET.bodyTop);
  shape.lineTo(-body, TARGET.bodyTop - chamfer);
  shape.closePath();
  return shape;
}

const FALLEN_ANGLE = -Math.PI / 2 + 0.03;

export interface TargetView {
  /** Start falling over, or stand back up. */
  setDown(down: boolean): void;
  update(dt: number): void;
}

function buildTargets(map: GameMap, scene: THREE.Scene): TargetView[] {
  const plateGeometry = new THREE.ExtrudeGeometry(plateShape(), {
    depth: TARGET.thickness,
    bevelEnabled: false,
  });
  plateGeometry.translate(0, 0, -TARGET.thickness / 2);
  applySurface(plateGeometry, 'target-steel');
  const postGeometry = new THREE.BoxGeometry(0.05, TARGET.bodyBottom + 0.3, 0.03);
  postGeometry.translate(0, (TARGET.bodyBottom + 0.3) / 2, -0.025);
  const footGeometry = new THREE.BoxGeometry(TARGET.bodyWidth + 0.1, 0.03, TARGET.standDepth);
  footGeometry.translate(0, 0.015, 0);

  const standMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2c2d,
    roughness: 0.6,
    metalness: 0.5,
  });

  return map.targets.map((spawn) => {
    const root = new THREE.Group();
    root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    // The plate is modelled facing +Z.
    root.rotation.y = Math.atan2(spawn.facing.x, spawn.facing.z);

    const foot = new THREE.Mesh(footGeometry, standMaterial);
    foot.receiveShadow = true;
    // The plate and its post hinge at the floor and fall away from the shooter.
    const hinge = new THREE.Group();
    const plate = new THREE.Mesh(plateGeometry, surface('target-steel'));
    const post = new THREE.Mesh(postGeometry, standMaterial);
    for (const mesh of [plate, post]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    hinge.add(plate, post);
    root.add(foot, hinge);
    scene.add(root);

    let down = false;
    let speed = 0;
    return {
      setDown(value) {
        down = value;
        // The bullet gives the plate its first shove.
        speed = value ? -5 : 0;
      },
      update(dt) {
        if (down) {
          if (hinge.rotation.x === FALLEN_ANGLE && speed === 0) return;
          speed -= 22 * dt;
          hinge.rotation.x += speed * dt;
          if (hinge.rotation.x <= FALLEN_ANGLE) {
            hinge.rotation.x = FALLEN_ANGLE;
            // One small bounce off the ground, then rest.
            speed = speed < -3 ? -speed * 0.25 : 0;
          }
        } else if (hinge.rotation.x < 0) {
          hinge.rotation.x = Math.min(0, hinge.rotation.x + 4 * dt);
        }
      },
    };
  });
}

export interface World {
  readonly scene: THREE.Scene;
  readonly targets: readonly TargetView[];
  /** Unit vector pointing from the ground toward the sun. */
  readonly sunDirection: THREE.Vector3;
}

/** A scene with the sky, sun and ground, and nothing else in it. */
export function buildSky(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(
    1,
    Math.PI / 2 - SUN_ELEVATION,
    SUN_AZIMUTH,
  );

  const sky = new Sky();
  sky.scale.setScalar(2000);
  const uniforms = sky.material.uniforms;
  const set = (name: string, value: number) => {
    const uniform = uniforms[name];
    if (uniform) uniform.value = value;
  };
  set('turbidity', 6);
  set('rayleigh', 1.7);
  set('mieCoefficient', 0.004);
  set('mieDirectionalG', 0.82);
  set('cloudCoverage', 0.32);
  set('cloudDensity', 0.35);
  (uniforms.sunPosition?.value as THREE.Vector3 | undefined)?.copy(sunDirection);
  scene.add(sky);

  // Light the scene from the sky itself, so shaded surfaces pick up its colour.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyOnly = new THREE.Scene();
  skyOnly.add(sky.clone());
  scene.environment = pmrem.fromScene(skyOnly, 0, 1, 5000).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();

  // Warm fill: light bouncing off the sunlit concrete, which the sky alone does not give.
  scene.add(new THREE.HemisphereLight(0x9c8f7e, 0xc9a67a, 1.0));

  const sun = new THREE.DirectionalLight(0xffd3a1, 4.6);
  sun.position.copy(sunDirection).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -24;
  shadowCamera.right = 24;
  shadowCamera.top = 24;
  shadowCamera.bottom = -24;
  shadowCamera.near = 20;
  shadowCamera.far = 100;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  scene.fog = new THREE.Fog(0xe2d3bb, 60, 600);

  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x9a8c6e, roughness: 1 }),
  );
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  scene.add(outside);

  return { scene, sunDirection };
}

export function buildWorld(map: GameMap, renderer: THREE.WebGLRenderer): World {
  const { scene, sunDirection } = buildSky(renderer);
  scene.add(...buildSolids(map));
  return { scene, targets: buildTargets(map, scene), sunDirection };
}
