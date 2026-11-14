import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TARGET } from '../core/game';
import type { GameMap, SurfaceMaterial } from '../core/map';
import type { SurfaceName } from './materials';
import { applySurface, surface } from './materials';

/** Late afternoon: a low sun off to the left of the spawn, throwing long shadows across the compound. */
const SUN_ELEVATION = THREE.MathUtils.degToRad(31);
const SUN_AZIMUTH = THREE.MathUtils.degToRad(-58);

/** Which library surface each kind of map solid is made of. */
const SURFACES: Record<SurfaceMaterial, SurfaceName> = {
  floor: 'concrete-floor',
  concrete: 'concrete-wall',
  plywood: 'plywood',
  crate: 'crate',
  container: 'container-steel',
  timber: 'timber-frame',
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

  // One mesh per material keeps the whole level to just 6 draw calls.
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

/**
 * High-visibility IPSC/AR500 painted target face texture: dark charcoal ballistic steel
 * with crisp off-white perimeter outline, vibrant range-orange A-zone chest bullseye,
 * head strike box, and subtle shot wear — unmistakable against concrete, plywood, or shadow.
 */
function buildTargetFaceTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Map world (x in [-0.225, 0.225], y in [0.75, 1.74]) to canvas (0..w, h..0).
    const toX = (wx: number) => ((wx + TARGET.bodyWidth / 2) / TARGET.bodyWidth) * w;
    const toY = (wy: number) =>
      h - ((wy - TARGET.bodyBottom) / (TARGET.headTop - TARGET.bodyBottom)) * h;

    // Deep charcoal AR500 plate base.
    ctx.fillStyle = '#20242a';
    ctx.fillRect(0, 0, w, h);

    // Subtle matte steel grain & old bullet-splash pockmarks.
    for (let i = 0; i < 65; i++) {
      const gx = ((i * 197) % 480) + 16;
      const gy = ((i * 331) % 940) + 40;
      const gr = 2 + (i % 5);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(175,180,186,0.14)' : 'rgba(10,12,15,0.22)';
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp off-white silhouette border frame (pops cleanly against dark shadows & container).
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

    // Inner C-zone tactical scoring outline.
    ctx.strokeStyle = 'rgba(236, 233, 223, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(toX(-0.155), toY(1.41), toX(0.155) - toX(-0.155), toY(0.84) - toY(1.41));

    // Vibrant international range-orange A-zone chest plate & bullseye (y = 1.0..1.34).
    const cx = toX(0);
    const cy = toY(1.16);
    ctx.fillStyle = '#eb5a20';
    ctx.fillRect(toX(-0.105), toY(1.34), toX(0.105) - toX(-0.105), toY(0.98) - toY(1.34));

    // Crisp off-white chest target ring + centre bullseye dot.
    ctx.strokeStyle = '#f5f2ea';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1b1e24';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair index ticks around chest ring.
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

    // High-contrast orange head A-box (unmistakable headshot sight picture at 35 m!).
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

/** Floor stencil decal for distance markers (`10M`, `25M`, `35M`) in the East Sniper Lane. */
function makeDistanceStencil(label: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 192);
    // Painted dashed firing-range yard line + crisp military stencil text.
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
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.4),
    new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.92,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = false;
  return mesh;
}

function buildRangeMarkings(map: GameMap, scene: THREE.Scene): void {
  if (map.name !== 'Shoot House') return;
  const group = new THREE.Group();

  // Firing-line yellow hazard stripe in front of the East Overwatch shooting bench.
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xe2a832,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const firingLine = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 0.22), lineMat);
  firingLine.rotation.x = -Math.PI / 2;
  firingLine.position.set(18.6, 0.005, 11.8);
  firingLine.receiveShadow = true;
  group.add(firingLine);

  // Stencilled yardage lines down the 38 m East Sniper Lane (measured from shooting bench z = 12.6).
  const markers: readonly (readonly [string, number])[] = [
    ['10M', 2.6],
    ['20M', -7.4],
    ['30M', -14.2],
  ];
  for (const [label, z] of markers) {
    const stencil = makeDistanceStencil(label);
    stencil.position.set(18.4, 0.005, z);
    group.add(stencil);
  }

  scene.add(group);
}

const FALLEN_ANGLE = -Math.PI / 2 + 0.03;

export interface TargetView {
  /** Start falling over, or stand back up. */
  setDown(down: boolean): void;
  /** Advance the falling and hit-flash animation. Returns true while the plate is moving. */
  update(dt: number): boolean;
}

function buildTargets(map: GameMap, scene: THREE.Scene): TargetView[] {
  const shape = plateShape();
  const plateGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: TARGET.thickness,
    bevelEnabled: false,
  });
  plateGeometry.translate(0, 0, -TARGET.thickness / 2);
  applySurface(plateGeometry, 'target-steel');

  // Front painted face geometry using the exact silhouette shape mapped cleanly to [0..1] UVs.
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

  return map.targets.map((spawn) => {
    const root = new THREE.Group();
    root.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
    // The plate is modelled facing +Z.
    root.rotation.y = Math.atan2(spawn.facing.x, spawn.facing.z);

    const foot = new THREE.Mesh(footGeometry, standMaterial);
    const collar = new THREE.Mesh(collarGeometry, collarMaterial);
    foot.receiveShadow = true;
    collar.receiveShadow = true;

    // Dedicated per-target front material so hit flash flares only the struck target.
    const faceMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.54,
      metalness: 0.18,
      emissive: new THREE.Color(0xff7722),
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

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

    let down = false;
    let speed = 0;
    let flashTime = 0;

    return {
      setDown(value) {
        if (value && !down) flashTime = 0.16;
        down = value;
        // The bullet gives the plate its first shove.
        speed = value ? -5.4 : 0;
      },
      update(dt) {
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
            // One small bounce off the ground, then rest.
            speed = speed < -3 ? -speed * 0.24 : 0;
          }
        } else if (hinge.rotation.x < 0) {
          hinge.rotation.x = Math.min(0, hinge.rotation.x + 4.4 * dt);
        }
        return hinge.rotation.x !== before;
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
  const skyOnly = new THREE.Scene();
  skyOnly.add(sky);

  const painted = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  new THREE.CubeCamera(1, 5000, painted).update(renderer, skyOnly);
  scene.background = painted.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyOnly, 0, 1, 5000).texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();

  scene.add(new THREE.HemisphereLight(0x9c8f7e, 0xc9a67a, 1.0));

  const sun = new THREE.DirectionalLight(0xffd3a1, 4.6);
  sun.position.copy(sunDirection).multiplyScalar(70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const shadowCamera = sun.shadow.camera;
  // Wide ±36 m frustum cleanly covers the entire 52 m × 40 m Shoot House with crisp shadows.
  shadowCamera.left = -36;
  shadowCamera.right = 36;
  shadowCamera.top = 36;
  shadowCamera.bottom = -36;
  shadowCamera.near = 15;
  shadowCamera.far = 135;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  scene.fog = new THREE.Fog(0xe2d3bb, 65, 620);

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
  buildRangeMarkings(map, scene);
  return { scene, targets: buildTargets(map, scene), sunDirection };
}
