import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TARGET } from '../core/game';
import type { GameMap, MapId, SurfaceMaterial } from '../core/map';
import type { LootView } from './loot';
import { buildLoot } from './loot';
import type { SurfaceName } from './materials';
import { applySurface, surface } from './materials';

/** Which library surface each kind of map solid is made of. */
const SURFACES: Record<SurfaceMaterial, SurfaceName> = {
  floor: 'concrete-floor',
  asphalt: 'asphalt-floor',
  concrete: 'concrete-wall',
  brick: 'brick-wall',
  plywood: 'plywood',
  crate: 'crate',
  container: 'container-steel',
  'container-red': 'container-red',
  timber: 'timber-frame',
  steel: 'girder-steel',
};

interface AtmospherePreset {
  readonly sunElevationDeg: number;
  readonly sunAzimuthDeg: number;
  readonly turbidity: number;
  readonly rayleigh: number;
  readonly cloudCoverage: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly fogColor: number;
  readonly outsideGroundColor: number;
}

const SHOOT_HOUSE_ATMOSPHERE: AtmospherePreset = {
  sunElevationDeg: 31,
  sunAzimuthDeg: -58,
  turbidity: 6.0,
  rayleigh: 1.7,
  cloudCoverage: 0.32,
  sunColor: 0xffd3a1,
  sunIntensity: 4.6,
  hemiSky: 0x9c8f7e,
  hemiGround: 0xc9a67a,
  fogColor: 0xe2d3bb,
  outsideGroundColor: 0x9a8c6e,
};

const ATMOSPHERES: Readonly<Record<MapId, AtmospherePreset>> = {
  'shoot-house': SHOOT_HOUSE_ATMOSPHERE,
  // The dummy-range test fixture borrows the Shoot House sky.
  'test-dummy-range': SHOOT_HOUSE_ATMOSPHERE,
  'cargo-yard': {
    sunElevationDeg: 27,
    sunAzimuthDeg: 44,
    turbidity: 4.2,
    rayleigh: 2.25,
    cloudCoverage: 0.44,
    sunColor: 0xffdfb8,
    sunIntensity: 4.5,
    hemiSky: 0x8ea4be,
    hemiGround: 0x6f757e,
    fogColor: 0xcbd6e2,
    outsideGroundColor: 0x4c535d,
  },
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

  // One merged mesh per surface material keeps the entire arena under ~8 static draw calls!
  return [...byMaterial].map(([material, geometries]) => {
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    const mesh = new THREE.Mesh(merged, surface(SURFACES[material]));
    mesh.castShadow = material !== 'floor' && material !== 'asphalt';
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

/**
 * High-visibility IPSC/AR500 painted target face texture: dark charcoal ballistic steel
 * with crisp off-white perimeter outline, vibrant range-orange A-zone chest bullseye,
 * head strike box, and subtle shot wear — unmistakable against concrete, brick, asphalt, or shadow.
 */
function buildTargetFaceTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const toX = (wx: number) => ((wx + TARGET.bodyWidth / 2) / TARGET.bodyWidth) * w;
    const toY = (wy: number) =>
      h - ((wy - TARGET.bodyBottom) / (TARGET.headTop - TARGET.bodyBottom)) * h;

    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 65; i++) {
      const gx = ((i * 197) % 480) + 16;
      const gy = ((i * 331) % 940) + 40;
      const gr = 2 + (i % 5);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(175,180,186,0.14)' : 'rgba(10,12,15,0.22)';
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    const traceSilhouette = (inset: number) => {
      const bw = TARGET.bodyWidth / 2 - inset;
      const hw = TARGET.headWidth / 2 - inset;
      const ch = 0.03;
      ctx.beginPath();
      ctx.moveTo(toX(-bw), toY(TARGET.bodyBottom + inset));
      ctx.lineTo(toX(bw), toY(TARGET.bodyBottom + inset));
      ctx.lineTo(toX(bw), toY(TARGET.bodyTop - ch));
      ctx.lineTo(toX(bw - ch), toY(TARGET.bodyTop - inset));
      ctx.lineTo(toX(hw), toY(TARGET.bodyTop - inset));
      ctx.lineTo(toX(hw), toY(TARGET.headTop - ch));
      ctx.lineTo(toX(hw - ch), toY(TARGET.headTop - inset));
      ctx.lineTo(toX(-hw + ch), toY(TARGET.headTop - inset));
      ctx.lineTo(toX(-hw), toY(TARGET.headTop - ch));
      ctx.lineTo(toX(-hw), toY(TARGET.bodyTop - inset));
      ctx.lineTo(toX(-bw + ch), toY(TARGET.bodyTop - inset));
      ctx.lineTo(toX(-bw), toY(TARGET.bodyTop - ch));
      ctx.closePath();
    };
    ctx.strokeStyle = '#ece9df';
    ctx.lineWidth = 22;
    traceSilhouette(0.014);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236, 233, 223, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(toX(-0.155), toY(1.41), toX(0.155) - toX(-0.155), toY(0.84) - toY(1.41));

    const cx = toX(0);
    const cy = toY(1.16);
    ctx.fillStyle = '#eb5a20';
    ctx.fillRect(toX(-0.105), toY(1.34), toX(0.105) - toX(-0.105), toY(0.98) - toY(1.34));

    ctx.strokeStyle = '#f5f2ea';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1b1e24';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f5f2ea';
    ctx.lineWidth = 7;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 40, cy + dy * 40);
      ctx.lineTo(cx + dx * 86, cy + dy * 86);
      ctx.stroke();
    }

    ctx.fillStyle = '#eb5a20';
    ctx.fillRect(toX(-0.068), toY(1.69), toX(0.068) - toX(-0.068), toY(1.55) - toY(1.69));
    ctx.strokeStyle = '#f5f2ea';
    ctx.lineWidth = 7;
    ctx.strokeRect(toX(-0.068), toY(1.69), toX(0.068) - toX(-0.068), toY(1.55) - toY(1.69));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Floor stencil decal for distance markers (`15M`, `25M`, `40M`) in the East Marksman / Pier Lane. */
function makeDistanceStencil(label: string): {
  mesh: THREE.Mesh;
  dispose(): void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 192);
    ctx.fillStyle = 'rgba(235, 178, 52, 0.85)';
    ctx.fillRect(0, 148, 512, 18);
    ctx.fillStyle = 'rgba(240, 236, 224, 0.86)';
    ctx.font = '700 108px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 76);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geom = new THREE.PlaneGeometry(3.8, 1.4);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = false;
  return {
    mesh,
    dispose() {
      geom.dispose();
      mat.dispose();
      texture.dispose();
    },
  };
}

function buildRangeMarkings(map: GameMap, scene: THREE.Scene): () => void {
  const spec = map.rangeMarkings;
  if (!spec) return () => {};

  const group = new THREE.Group();
  const disposables: (() => void)[] = [];

  const lineGeom = new THREE.PlaneGeometry(spec.firingLineWidth, 0.22);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xe2a832,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const firingLine = new THREE.Mesh(lineGeom, lineMat);
  firingLine.rotation.x = -Math.PI / 2;
  firingLine.position.set(spec.firingLineX, 0.005, spec.firingLineZ);
  firingLine.receiveShadow = true;
  group.add(firingLine);
  disposables.push(() => {
    lineGeom.dispose();
    lineMat.dispose();
  });

  for (const [label, z] of spec.stencils) {
    const stencil = makeDistanceStencil(label);
    stencil.mesh.position.set(spec.firingLineX, 0.005, z);
    group.add(stencil.mesh);
    disposables.push(() => {
      stencil.dispose();
    });
  }

  scene.add(group);
  return () => {
    scene.remove(group);
    for (const d of disposables) d();
  };
}

const FALLEN_ANGLE = -Math.PI / 2 + 0.03;

export interface TargetView {
  /** Start falling over, or stand back up. */
  setDown(down: boolean): void;
  /** Show or hide steel silhouettes depending on whether active mode uses steel targets. */
  setVisible(visible: boolean): void;
  /** Advance the falling and hit-flash animation. Returns true while the plate is moving. */
  update(dt: number): boolean;
}

function buildTargets(
  map: GameMap,
  scene: THREE.Scene,
): { targets: TargetView[]; dispose(): void } {
  const shape = plateShape();
  const plateGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: TARGET.thickness,
    bevelEnabled: false,
  });
  plateGeometry.translate(0, 0, -TARGET.thickness / 2);
  applySurface(plateGeometry, 'target-steel');

  const faceGeometry = new THREE.ShapeGeometry(shape);
  const posAttr = faceGeometry.getAttribute('position');
  const uvArr = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    uvArr[i * 2] = (px + TARGET.bodyWidth / 2) / TARGET.bodyWidth;
    uvArr[i * 2 + 1] = (py - TARGET.bodyBottom) / (TARGET.headTop - TARGET.bodyBottom);
  }
  faceGeometry.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  faceGeometry.translate(0, 0, TARGET.thickness / 2 + 0.0018);

  const faceTexture = buildTargetFaceTexture();

  const postGeometry = new THREE.BoxGeometry(0.055, TARGET.bodyBottom + 0.3, 0.032);
  postGeometry.translate(0, (TARGET.bodyBottom + 0.3) / 2, -0.028);
  const footGeometry = new THREE.BoxGeometry(
    TARGET.bodyWidth + 0.14,
    0.035,
    TARGET.standDepth + 0.06,
  );
  footGeometry.translate(0, 0.0175, 0);
  const collarGeometry = new THREE.BoxGeometry(0.16, 0.055, 0.09);
  collarGeometry.translate(0, 0.045, 0);

  const standMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2024,
    roughness: 0.62,
    metalness: 0.55,
  });
  const collarMaterial = new THREE.MeshStandardMaterial({
    color: 0xd95520,
    roughness: 0.5,
    metalness: 0.2,
  });

  const faceMaterials: THREE.MeshStandardMaterial[] = [];
  const roots: THREE.Group[] = [];

  const targets = map.targets.map((spawn) => {
    const root = new THREE.Group();
    root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    root.rotation.y = Math.atan2(spawn.facing.x, spawn.facing.z);

    const foot = new THREE.Mesh(footGeometry, standMaterial);
    const collar = new THREE.Mesh(collarGeometry, collarMaterial);
    foot.receiveShadow = true;
    collar.receiveShadow = true;

    const faceMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.54,
      metalness: 0.18,
      emissive: new THREE.Color(0xff7722),
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    faceMaterials.push(faceMaterial);

    const hinge = new THREE.Group();
    const plate = new THREE.Mesh(plateGeometry, surface('target-steel'));
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    const post = new THREE.Mesh(postGeometry, standMaterial);
    for (const mesh of [plate, post]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    face.receiveShadow = true;
    hinge.add(plate, face, post);
    root.add(foot, collar, hinge);
    scene.add(root);
    roots.push(root);

    let down = false;
    let speed = 0;
    let flashTime = 0;

    return {
      setDown(value: boolean) {
        if (value && !down) flashTime = 0.16;
        down = value;
        speed = value ? -5.4 : 0;
      },
      setVisible(visible: boolean) {
        root.visible = visible;
      },
      update(dt: number) {
        if (flashTime > 0) {
          flashTime = Math.max(0, flashTime - dt);
          faceMaterial.emissiveIntensity = (flashTime / 0.16) * 0.9;
        } else if (faceMaterial.emissiveIntensity !== 0) {
          faceMaterial.emissiveIntensity = 0;
        }

        const before = hinge.rotation.x;
        if (down) {
          if (hinge.rotation.x === FALLEN_ANGLE && speed === 0) return false;
          speed -= 24 * dt;
          hinge.rotation.x += speed * dt;
          if (hinge.rotation.x <= FALLEN_ANGLE) {
            hinge.rotation.x = FALLEN_ANGLE;
            speed = speed < -3 ? -speed * 0.24 : 0;
          }
        } else if (hinge.rotation.x < 0) {
          hinge.rotation.x = Math.min(0, hinge.rotation.x + 4.4 * dt);
        }
        return hinge.rotation.x !== before;
      },
    };
  });

  return {
    targets,
    dispose() {
      for (const r of roots) scene.remove(r);
      plateGeometry.dispose();
      faceGeometry.dispose();
      faceTexture.dispose();
      postGeometry.dispose();
      footGeometry.dispose();
      collarGeometry.dispose();
      standMaterial.dispose();
      collarMaterial.dispose();
      for (const fm of faceMaterials) fm.dispose();
    },
  };
}

export interface World {
  readonly scene: THREE.Scene;
  readonly targets: readonly TargetView[];
  readonly loot: LootView;
  /** Unit vector pointing from the ground toward the sun. */
  readonly sunDirection: THREE.Vector3;
  dispose(): void;
}

/** A scene with the sky, sun and ground, and nothing else in it (used by material/weapon previews & maps). */
export function buildSky(
  renderer: THREE.WebGLRenderer,
  mapId: MapId = 'shoot-house',
): { scene: THREE.Scene; sunDirection: THREE.Vector3; readonly disposeSky: () => void } {
  const preset = ATMOSPHERES[mapId];
  const scene = new THREE.Scene();
  const sunDirection = new THREE.Vector3().setFromSphericalCoords(
    1,
    Math.PI / 2 - THREE.MathUtils.degToRad(preset.sunElevationDeg),
    THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
  );

  const sky = new Sky();
  sky.scale.setScalar(2000);
  const uniforms = sky.material.uniforms;
  const set = (name: string, value: number) => {
    const uniform = uniforms[name];
    if (uniform) uniform.value = value;
  };
  set('turbidity', preset.turbidity);
  set('rayleigh', preset.rayleigh);
  set('mieCoefficient', 0.004);
  set('mieDirectionalG', 0.82);
  set('cloudCoverage', preset.cloudCoverage);
  set('cloudDensity', 0.35);
  (uniforms.sunPosition?.value as THREE.Vector3 | undefined)?.copy(sunDirection);
  const skyOnly = new THREE.Scene();
  skyOnly.add(sky);

  const painted = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 5000, painted).update(renderer, skyOnly);
  scene.background = painted.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(skyOnly, 0, 1, 5000);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();

  scene.add(new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, 1.0));

  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  sun.position.copy(sunDirection).multiplyScalar(82);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1280, 1280);
  const shadowCamera = sun.shadow.camera;
  // ±50 m shadow frustum covers both Shoot House (70×56 m) and Cargo Yard (74×60 m).
  shadowCamera.left = -50;
  shadowCamera.right = 50;
  shadowCamera.top = 50;
  shadowCamera.bottom = -50;
  shadowCamera.near = 15;
  shadowCamera.far = 165;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  scene.fog = new THREE.Fog(preset.fogColor, 68, 620);

  const outsideGeom = new THREE.PlaneGeometry(1200, 1200);
  const outsideMat = new THREE.MeshStandardMaterial({
    color: preset.outsideGroundColor,
    roughness: 1,
  });
  const outside = new THREE.Mesh(outsideGeom, outsideMat);
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  scene.add(outside);

  return {
    scene,
    sunDirection,
    disposeSky() {
      sun.shadow.map?.dispose();
      painted.dispose();
      envTarget.dispose();
      outsideGeom.dispose();
      outsideMat.dispose();
    },
  };
}

export function buildWorld(map: GameMap, renderer: THREE.WebGLRenderer): World {
  const { scene, sunDirection, disposeSky } = buildSky(renderer, map.id);
  const solidMeshes = buildSolids(map);
  scene.add(...solidMeshes);
  const disposeMarkings = buildRangeMarkings(map, scene);
  const builtTargets = buildTargets(map, scene);
  const loot = buildLoot(map, scene);

  return {
    scene,
    targets: builtTargets.targets,
    loot,
    sunDirection,
    dispose() {
      for (const m of solidMeshes) {
        scene.remove(m);
        m.geometry.dispose();
      }
      disposeMarkings();
      builtTargets.dispose();
      loot.dispose();
      disposeSky();
    },
  };
}
