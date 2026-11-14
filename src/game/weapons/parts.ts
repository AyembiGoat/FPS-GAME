import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { OpticId } from '../../core/weapon';
import { applySurface, surface, surfaceMesh } from '../materials';
import type { SurfaceName } from '../materials';
import type { WeaponModel } from './model';

/**
 * Shared procedural firearm building blocks used across the 8 weapon models.
 * Gun space: metres, +X right, +Y up, -Z forward toward the muzzle.
 */

/** Extrude a 2D side profile drawn in (z, y) so its thickness runs along X. */
export function fromSideProfile(
  shape: THREE.Shape,
  width: number,
  bevel: number,
  surfaceName?: SurfaceName,
): THREE.BufferGeometry {
  const depth = Math.max(0.001, width - bevel * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(-Math.PI / 2);
  if (surfaceName) applySurface(geometry, surfaceName);
  return geometry;
}

/** Axis-aligned box mesh placed at `at`, textured with a named surface or custom material. */
export function partBox(
  mat: SurfaceName | THREE.Material,
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  rot?: readonly [number, number, number],
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(...size);
  let mesh: THREE.Mesh;
  if (typeof mat === 'string') {
    mesh = surfaceMesh(geometry, mat);
  } else {
    mesh = new THREE.Mesh(geometry, mat);
  }
  mesh.position.set(...at);
  if (rot) mesh.rotation.set(...rot);
  return mesh;
}

/** Cylinder running along the Z axis (barrel, tube, scope body, handguard). */
export function barrelCyl(
  mat: SurfaceName | THREE.Material,
  radiusFront: number,
  radiusBack: number,
  length: number,
  at: readonly [number, number, number],
  segments = 18,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radiusFront, radiusBack, length, segments);
  geometry.rotateX(-Math.PI / 2);
  let mesh: THREE.Mesh;
  if (typeof mat === 'string') {
    mesh = surfaceMesh(geometry, mat);
  } else {
    mesh = new THREE.Mesh(geometry, mat);
  }
  mesh.position.set(...at);
  return mesh;
}

/** Vertical or angled cylinder (turret, pin, buffer tube cap, grip cylinder). */
export function uprightCyl(
  mat: SurfaceName | THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  at: readonly [number, number, number],
  rot?: readonly [number, number, number],
  segments = 16,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  const mesh = typeof mat === 'string' ? surfaceMesh(geometry, mat) : new THREE.Mesh(geometry, mat);
  mesh.position.set(...at);
  if (rot) mesh.rotation.set(...rot);
  return mesh;
}

export function anchor(
  parent: THREE.Object3D,
  at: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.set(...at);
  object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

/**
 * Orient a left-hand rifle/shotgun support anchor cleanly beneath a horizontal handguard:
 * palm cradles bottom-left, fingers wrap up the right side, index finger points toward
 * the muzzle (-Z), and wrist extends naturally down-left-back toward the left elbow.
 */
export function underHandguardAnchor(
  parent: THREE.Object3D,
  at: readonly [number, number, number],
): THREE.Object3D {
  const obj = new THREE.Object3D();
  obj.position.set(at[0], at[1] - 0.014, at[2]);
  // Handhold space for the left hand (mirrored):
  //   -X = palm side (cradling bottom-left under handguard),
  //   +Y = thumb/index side (pointing forward along handguard toward muzzle -Z),
  //   +Z = wrist direction (extending down-left-back toward left elbow).
  // Tilting roughX toward (-0.72, 0.69, 0) keeps fingertips curled neatly along the right flank
  // of the handguard — never poking up above the top Picatinny rail or iron sights!
  const yAxis = new THREE.Vector3(0.14, -0.05, -0.99).normalize();
  const roughX = new THREE.Vector3(-0.74, 0.67, 0).normalize();
  const zAxis = new THREE.Vector3().crossVectors(roughX, yAxis).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  obj.quaternion.setFromRotationMatrix(basis);
  parent.add(obj);
  return obj;
}

/** Repeating Mil-Std-1913 Picatinny rail running along Z at top surface `y`. */
export function buildPicatinnyRail(
  parent: THREE.Object3D,
  yBottom: number,
  zFront: number,
  zBack: number,
  surfaceName: SurfaceName = 'steel-dark',
): void {
  const len = zBack - zFront;
  const zMid = (zFront + zBack) / 2;
  // Base dovetail spine.
  parent.add(partBox(surfaceName, [0.021, 0.004, len], [0, yBottom + 0.002, zMid]));
  // Individual cross-lugs every 10 mm.
  const lugCount = Math.max(2, Math.floor(len / 0.01));
  const step = len / lugCount;
  for (let i = 0; i < lugCount; i++) {
    const z = zFront + (i + 0.5) * step;
    parent.add(partBox(surfaceName, [0.0215, 0.0032, step * 0.52], [0, yBottom + 0.0056, z]));
  }
}

/** Build a smooth continuous curved rifle/SMG magazine oriented downward from the magwell. */
export function buildCurvedMagazine(
  surfaceName: SurfaceName,
  width: number,
  depth: number,
  segmentLength: number,
  segments: number,
  curvePerSegment: number,
  startTilt = 0.06,
): THREE.Group {
  const mag = new THREE.Group();
  const totalLen = segmentLength * segments;
  const totalCurve = curvePerSegment * segments;
  const steps = Math.max(12, segments * 4);
  const stepLen = totalLen / steps;
  const halfD = depth / 2;

  const frontEdge: [number, number][] = [];
  const backEdge: [number, number][] = [];

  let cx = 0; // maps to -Z (forward toward muzzle) in weapon space
  let cy = 0; // maps to Y (downward) in weapon space
  let angle = startTilt;

  for (let i = 0; i <= steps; i++) {
    // Tangent vector going down-and-forward: (sin(angle), -cos(angle))
    // Forward normal perpendicular to tangent: (cos(angle), sin(angle))
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    frontEdge.push([cx + nx * halfD, cy + ny * halfD]);
    backEdge.push([cx - nx * halfD, cy - ny * halfD]);
    if (i < steps) {
      const midAngle = angle + (totalCurve / steps) * 0.5;
      cx += Math.sin(midAngle) * stepLen;
      cy -= Math.cos(midAngle) * stepLen;
      angle += totalCurve / steps;
    }
  }

  // Construct 2D side-profile Shape in (forward, up) space, extrude along X, then orient onto weapon Y-Z plane.
  const shape = new THREE.Shape();
  const first = frontEdge[0];
  if (first) shape.moveTo(first[0], first[1]);
  for (let i = 1; i < frontEdge.length; i++) {
    const pt = frontEdge[i];
    if (pt) shape.lineTo(pt[0], pt[1]);
  }
  for (let i = backEdge.length - 1; i >= 0; i--) {
    const pt = backEdge[i];
    if (pt) shape.lineTo(pt[0], pt[1]);
  }
  shape.closePath();

  const bevel = Math.min(0.0022, width * 0.12);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, width - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // Center along Z (extrusion axis) then rotate +90° around Y so shape +X -> weapon -Z and extrusion Z -> weapon +X.
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2);
  applySurface(geo, surfaceName);
  mag.add(new THREE.Mesh(geo, surface(surfaceName)));

  // Tapered bottom floorplate aligned seamlessly with the final curve tangent (+angle around +X).
  const plate = partBox('steel-dark', [width + 0.003, 0.009, depth + 0.006], [0, cy - 0.003, -cx]);
  plate.rotation.x = angle;
  mag.add(plate);
  return mag;
}

/** Crisp glowing EOTech EXPS3-0 holographic sight reticle canvas texture (65 MOA ring + 1 MOA dot). */
function holoReticleTexture(color: string, ring: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    if (ring) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(64, 64, 30, 0, Math.PI * 2);
      ctx.stroke();
      // Four cardinal tick marks at 12, 3, 6, 9 o'clock.
      const ticks: readonly (readonly [number, number, number, number])[] = [
        [64, 26, 64, 38],
        [64, 90, 64, 102],
        [26, 64, 38, 64],
        [90, 64, 102, 64],
      ];
      for (const [x1, y1, x2, y2] of ticks) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    // Central 1 MOA aiming dot.
    ctx.beginPath();
    ctx.arc(64, 64, ring ? 3.2 : 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * EOTech EXPS3-0 Holographic Weapon Sight (ref: 22-eotech-rear-view.jpg, 23-eotech-side.jpg).
 * Returns the exact sight-line Y height so `model.sight` sits dead-centre on the glowing dot.
 */
export function buildEotechHolo(parent: THREE.Object3D, railTopY: number, zCenter: number): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  // Low-profile QD riser base clamped onto Picatinny rail.
  g.add(partBox('steel-dark', [0.031, 0.012, 0.082], [0, 0.006, -0.004]));
  // Forward transverse CR123 battery housing kept sleek below the optical floor.
  g.add(partBox('steel-dark', [0.038, 0.017, 0.034], [0, 0.0185, -0.032]));
  g.add(
    uprightCyl('gun-steel', 0.0082, 0.0082, 0.042, [0, 0.019, -0.034], [0, 0, Math.PI / 2], 14),
  );
  // Side control button pad on left side.
  g.add(partBox('polymer-black', [0.005, 0.012, 0.02], [-0.018, 0.013, 0.015]));

  // Sleek chamfered steel hood around wide unobstructed viewing window (y = 0.021..0.051).
  const winCenterY = 0.036;
  const winW = 0.037;
  const winH = 0.029;
  const wall = 0.0025;
  // Left & right hood walls.
  g.add(
    partBox('steel-dark', [wall, winH + wall, 0.042], [-(winW / 2 + wall / 2), winCenterY, 0.01]),
  );
  g.add(partBox('steel-dark', [wall, winH + wall, 0.042], [winW / 2 + wall / 2, winCenterY, 0.01]));
  // Hood roof.
  g.add(
    partBox(
      'steel-dark',
      [winW + wall * 2, wall, 0.042],
      [0, winCenterY + winH / 2 + wall / 2, 0.01],
    ),
  );
  // Subtle lower glass sill.
  g.add(partBox('polymer-black', [winW, 0.002, 0.04], [0, winCenterY - winH / 2 - 0.001, 0.01]));

  // Subtle coated optic glass.
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x16242b,
    metalness: 0.2,
    roughness: 0.08,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.001, winH - 0.001), lensMat);
  lens.position.set(0, winCenterY, 0.006);
  g.add(lens);

  // Projected glowing holographic ring + dot reticle centred at exact sight height.
  const reticle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.022, 0.022),
    new THREE.MeshBasicMaterial({
      map: holoReticleTexture('#ff342c', true),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  reticle.position.set(0, winCenterY, 0.004);
  g.add(reticle);

  return railTopY + winCenterY;
}

/**
 * Compact open-window tactical reflex sight for the SCAR-H (1.8× combat optic).
 * Returns the exact sight-line Y height.
 */
export function buildCompactReflex(
  parent: THREE.Object3D,
  railTopY: number,
  zCenter: number,
): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  // Low-profile Picatinny mount + windage dial.
  g.add(partBox('steel-dark', [0.028, 0.014, 0.068], [0, 0.007, 0]));
  g.add(
    uprightCyl('gun-steel', 0.0055, 0.0055, 0.006, [0.016, 0.012, -0.006], [0, 0, Math.PI / 2], 12),
  );

  // Tubular hooded reflex housing with clean open sight picture.
  const winCenterY = 0.032;
  const winW = 0.032;
  const winH = 0.025;
  const t = 0.0036;
  g.add(partBox('anodized-fde', [t, winH + t, 0.056], [-(winW / 2 + t / 2), winCenterY, 0]));
  g.add(partBox('anodized-fde', [t, winH + t, 0.056], [winW / 2 + t / 2, winCenterY, 0]));
  g.add(partBox('anodized-fde', [winW + t * 2, t, 0.056], [0, winCenterY + winH / 2 + t / 2, 0]));
  g.add(partBox('steel-dark', [winW, 0.003, 0.052], [0, winCenterY - winH / 2, 0]));

  const lens = new THREE.Mesh(
    new THREE.PlaneGeometry(winW - 0.002, winH - 0.002),
    new THREE.MeshStandardMaterial({
      color: 0x102630,
      metalness: 0.25,
      roughness: 0.08,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  lens.position.set(0, winCenterY, -0.004);
  g.add(lens);

  // Crisp glowing amber-red precision dot.
  const reticle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.022, 0.022),
    new THREE.MeshBasicMaterial({
      map: holoReticleTexture('#ff5b28', false),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  reticle.position.set(0, winCenterY, -0.005);
  g.add(reticle);

  return railTopY + winCenterY;
}

/**
 * Schmidt & Bender PM II 5-25×56 style sniper riflescope (ref: 16-awm-side.jpg, 17-awm-side-2.jpg).
 * Returns the exact optical centerline Y height.
 */
export function buildSniperScope(
  parent: THREE.Object3D,
  railTopY: number,
  zCenter: number,
): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  const centerY = 0.044;
  // One-piece Spuhr-style cantilevered dual scope ring mount.
  g.add(partBox('steel-dark', [0.026, 0.014, 0.13], [0, 0.007, 0.005]));
  for (const rz of [-0.042, 0.052]) {
    g.add(partBox('steel-dark', [0.024, 0.022, 0.024], [0, 0.02, rz]));
    g.add(barrelCyl('steel-dark', 0.0215, 0.0215, 0.024, [0, centerY, rz], 18));
  }

  // Main 34 mm tube.
  g.add(barrelCyl('steel-dark', 0.017, 0.017, 0.2, [0, centerY, 0.0], 20));
  // Tapered bell + 56 mm objective bell + sunshade at front (-Z).
  g.add(barrelCyl('steel-dark', 0.031, 0.017, 0.055, [0, centerY, -0.125], 22));
  g.add(barrelCyl('steel-dark', 0.0315, 0.0315, 0.11, [0, centerY, -0.205], 22));
  // Flared ocular housing + magnification throw ring at rear (+Z).
  g.add(barrelCyl('steel-dark', 0.017, 0.022, 0.035, [0, centerY, 0.115], 20));
  g.add(barrelCyl('gun-steel', 0.0235, 0.0235, 0.022, [0, centerY, 0.135], 20));
  g.add(barrelCyl('steel-dark', 0.0225, 0.0225, 0.058, [0, centerY, 0.174], 20));

  // Elevation (top), windage (right), and parallax (left) tactical locking turrets.
  g.add(partBox('steel-dark', [0.038, 0.038, 0.038], [0, centerY, 0.005]));
  g.add(uprightCyl('gun-steel', 0.015, 0.016, 0.028, [0, centerY + 0.029, 0.005], undefined, 16));
  g.add(
    uprightCyl('gun-steel', 0.012, 0.013, 0.022, [0.026, centerY, 0.005], [0, 0, -Math.PI / 2], 16),
  );
  g.add(
    uprightCyl('gun-steel', 0.012, 0.013, 0.022, [-0.026, centerY, 0.005], [0, 0, Math.PI / 2], 16),
  );

  // Dark coated front and rear lenses.
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0a1c28,
    metalness: 0.75,
    roughness: 0.08,
  });
  const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.0285, 20), lensMat);
  frontLens.position.set(0, centerY, -0.258);
  frontLens.rotation.y = Math.PI;
  const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.0195, 20), lensMat);
  rearLens.position.set(0, centerY, 0.2035);
  g.add(frontLens, rearLens);

  return railTopY + centerY;
}

/**
 * Aimpoint Micro T-2 tubular red dot sight (ref: 46-aimpoint-t2-rear.png, 47-aimpoint-t2-mount.jpg).
 * Returns the exact optical centerline Y height.
 */
export function buildMicroRedDot(
  parent: THREE.Object3D,
  railTopY: number,
  zCenter: number,
  compact = false,
): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  const scale = compact ? 0.78 : 1;
  const centerY = compact ? 0.021 : 0.032;
  const tubeR = 0.0145 * scale;
  const innerR = 0.0115 * scale;
  const tubeLen = 0.064 * scale;

  // Skeletonized low/mid Picatinny mount base.
  g.add(
    partBox(
      'steel-dark',
      [0.024 * scale, centerY - tubeR + 0.004, 0.044 * scale],
      [0, (centerY - tubeR) / 2 + 0.002, 0],
    ),
  );
  // Clamping cross-bolt on left side of mount.
  g.add(
    uprightCyl(
      'gun-steel',
      0.0038 * scale,
      0.0038 * scale,
      0.006,
      [-0.014 * scale, 0.007, 0],
      [0, 0, Math.PI / 2],
      10,
    ),
  );

  // Hollow thin-wall cylindrical tube (ring of 12 slim housing staves around an open bore).
  const ringSegs = 12;
  const wallT = Math.max(0.0022, tubeR - innerR);
  const segW = (2 * Math.PI * ((tubeR + innerR) / 2)) / ringSegs + 0.0012;
  for (let i = 0; i < ringSegs; i++) {
    const a = (i / ringSegs) * Math.PI * 2;
    const midR = innerR + wallT / 2;
    const stave = partBox(
      'steel-dark',
      [segW, wallT, tubeLen],
      [Math.sin(a) * midR, centerY + Math.cos(a) * midR, 0],
      [0, 0, -a],
    );
    g.add(stave);
  }

  // Right-side signature knurled rotary intensity knob & battery cap (ref: 46-aimpoint-t2-rear.png).
  g.add(
    uprightCyl(
      'gun-steel',
      0.011 * scale,
      0.011 * scale,
      0.013 * scale,
      [tubeR + 0.004 * scale, centerY - 0.002, 0.005 * scale],
      [0, 0, Math.PI / 2],
      14,
    ),
  );
  // Top elevation turret protective wings + recessed cap.
  g.add(
    partBox(
      'steel-dark',
      [0.016 * scale, 0.006 * scale, 0.018 * scale],
      [0, centerY + tubeR + 0.0015, -0.004 * scale],
    ),
  );

  // Subtle ruby-coated optical lens + crisp glowing 2 MOA red dot.
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(innerR - 0.0005, 18),
    new THREE.MeshStandardMaterial({
      color: 0x301614,
      metalness: 0.25,
      roughness: 0.08,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  lens.position.set(0, centerY, -0.004 * scale);
  g.add(lens);

  const reticle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.015 * scale, 0.015 * scale),
    new THREE.MeshBasicMaterial({
      map: holoReticleTexture('#ff2e22', false),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  reticle.position.set(0, centerY, -0.005 * scale);
  g.add(reticle);

  return railTopY + centerY;
}

/**
 * Trijicon ACOG TA31 4×32 prism combat scope (ref: 44-acog-ta31-side.jpg, 45-acog-ta31-angle.jpg).
 * Features the unmistakable flared forward objective hood, glowing top fiber-optic tube,
 * twin knurled turrets, and flat-top thumbscrew mount.
 */
export function buildAcogScope(parent: THREE.Object3D, railTopY: number, zCenter: number): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  const centerY = 0.04;
  // Flat-top TA51 Picatinny clamp + dual knurled thumbscrews.
  g.add(partBox('steel-dark', [0.028, 0.015, 0.095], [0, 0.0075, 0.005]));
  g.add(partBox('steel-dark', [0.022, 0.014, 0.072], [0, 0.02, 0.004]));
  for (const tz of [-0.024, 0.032]) {
    g.add(
      uprightCyl('gun-steel', 0.0068, 0.0068, 0.009, [-0.018, 0.008, tz], [0, 0, Math.PI / 2], 12),
    );
  }

  // Tapered rear ocular bell + main prism body + iconic flared objective bell (-Z).
  g.add(barrelCyl('steel-dark', 0.017, 0.0185, 0.036, [0, centerY, 0.068], 18));
  g.add(barrelCyl('steel-dark', 0.018, 0.016, 0.044, [0, centerY, 0.03], 18));
  g.add(barrelCyl('steel-dark', 0.024, 0.018, 0.044, [0, centerY, -0.014], 18));
  g.add(barrelCyl('steel-dark', 0.025, 0.024, 0.044, [0, centerY, -0.056], 18));
  // Distinctive top brow overhang over objective bell.
  g.add(partBox('steel-dark', [0.026, 0.008, 0.046], [0, centerY + 0.022, -0.058]));

  // Signature glowing tritium/fiber-optic light collector spine running along the top!
  const fiberMat = new THREE.MeshBasicMaterial({ color: 0x4dff68 });
  const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.072, 10), fiberMat);
  fiber.rotation.x = Math.PI / 2;
  fiber.position.set(0, centerY + 0.0265, -0.034);
  g.add(fiber);

  // Top elevation and right windage turret caps.
  g.add(uprightCyl('gun-steel', 0.009, 0.0095, 0.012, [0, centerY + 0.022, 0.018], undefined, 14));
  g.add(
    uprightCyl('gun-steel', 0.009, 0.0095, 0.012, [0.022, centerY, 0.018], [0, 0, Math.PI / 2], 14),
  );

  // Dark AR-coated lenses.
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0b222c,
    metalness: 0.78,
    roughness: 0.08,
  });
  const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 18), lensMat);
  frontLens.position.set(0, centerY, -0.0785);
  frontLens.rotation.y = Math.PI;
  const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 18), lensMat);
  rearLens.position.set(0, centerY, 0.0865);
  g.add(frontLens, rearLens);

  return railTopY + centerY;
}

/**
 * Vortex Razor HD Gen II-E 1–6×24 LPVO on a dual-ring cantilever mount
 * (ref: 48-vortex-lpvo-cantilever.jpg, 49-vortex-lpvo-profile.jpg).
 */
export function buildLpvoScope(parent: THREE.Object3D, railTopY: number, zCenter: number): number {
  const g = new THREE.Group();
  g.position.set(0, railTopY, zCenter);
  parent.add(g);

  const centerY = 0.042;
  // Cantilevered dual-ring Picatinny mount.
  g.add(partBox('steel-dark', [0.026, 0.013, 0.11], [0, 0.0065, 0.006]));
  for (const rz of [-0.046, 0.038]) {
    g.add(partBox('steel-dark', [0.024, 0.02, 0.022], [0, 0.02, rz]));
    g.add(barrelCyl('steel-dark', 0.0195, 0.0195, 0.022, [0, centerY, rz], 18));
  }

  // Continuous 30mm bronze/dark-anodized Razor tube (longer forward straight objective).
  g.add(barrelCyl('gun-steel', 0.0155, 0.0155, 0.24, [0, centerY, -0.024], 20));
  // Subtle forward objective collar (-Z).
  g.add(barrelCyl('gun-steel', 0.0175, 0.016, 0.028, [0, centerY, -0.148], 20));
  // Flared ocular bell + ribbed magnification throw ring with throw lever (+Z).
  g.add(barrelCyl('gun-steel', 0.0155, 0.0205, 0.03, [0, centerY, 0.098], 20));
  g.add(barrelCyl('steel-dark', 0.022, 0.022, 0.022, [0, centerY, 0.116], 20));
  g.add(
    partBox('steel-dark', [0.006, 0.015, 0.006], [0.016, centerY + 0.018, 0.116], [0, 0, -0.5]),
  );
  g.add(barrelCyl('gun-steel', 0.021, 0.021, 0.044, [0, centerY, 0.148], 20));

  // Signature oversized Razor elevation, windage, and illumination turrets.
  g.add(partBox('gun-steel', [0.035, 0.035, 0.036], [0, centerY, -0.002]));
  g.add(uprightCyl('steel-dark', 0.015, 0.0155, 0.02, [0, centerY + 0.025, -0.002], undefined, 16));
  g.add(
    uprightCyl(
      'steel-dark',
      0.013,
      0.0135,
      0.018,
      [0.024, centerY, -0.002],
      [0, 0, -Math.PI / 2],
      16,
    ),
  );
  g.add(
    uprightCyl(
      'steel-dark',
      0.013,
      0.0135,
      0.018,
      [-0.024, centerY, -0.002],
      [0, 0, Math.PI / 2],
      16,
    ),
  );

  // Emerald-tinted front & rear glass lenses.
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0d2b24,
    metalness: 0.78,
    roughness: 0.07,
  });
  const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 18), lensMat);
  frontLens.position.set(0, centerY, -0.1625);
  frontLens.rotation.y = Math.PI;
  const rearLens = new THREE.Mesh(new THREE.CircleGeometry(0.0185, 18), lensMat);
  rearLens.position.set(0, centerY, 0.1705);
  g.add(frontLens, rearLens);

  return railTopY + centerY;
}

export interface MountedOpticResult {
  readonly sightY: number;
  readonly sightZ: number;
  readonly aimDistance: number;
}

/**
 * Mount any non-iron `OpticId` cleanly onto a weapon rail and return exact sight alignment.
 */
export function buildMountedOptic(
  parent: THREE.Object3D,
  opticId: Exclude<OpticId, 'irons'>,
  railTopY: number,
  zCenter: number,
  options?: { readonly compact?: boolean; readonly sightZOffset?: number },
): MountedOpticResult {
  const compact = options?.compact ?? false;
  switch (opticId) {
    case 'red-dot': {
      const sightY = buildMicroRedDot(parent, railTopY, zCenter, compact);
      return {
        sightY,
        sightZ: zCenter + (options?.sightZOffset ?? 0),
        aimDistance: compact ? 0.34 : 0.22,
      };
    }
    case 'holo': {
      const sightY = buildEotechHolo(parent, railTopY, zCenter);
      return {
        sightY,
        sightZ: zCenter + 0.01,
        aimDistance: 0.215,
      };
    }
    case 'acog': {
      const sightY = buildAcogScope(parent, railTopY, zCenter);
      return {
        sightY,
        sightZ: zCenter + 0.085,
        aimDistance: 0.14,
      };
    }
    case 'lpvo': {
      const sightY = buildLpvoScope(parent, railTopY, zCenter);
      return {
        sightY,
        sightZ: zCenter + 0.16,
        aimDistance: 0.135,
      };
    }
    case 'sniper-scope': {
      const sightY = buildSniperScope(parent, railTopY, zCenter);
      return {
        sightY,
        sightZ: zCenter + 0.18,
        aimDistance: 0.135,
      };
    }
  }
}

/**
 * Collapse dozens of static procedural weapon parts (rails, cooling ribs, screws, sight housings)
 * into one merged `THREE.Mesh` per shared opaque material. Cuts per-weapon draw calls by ~90%
 * while keeping animated sub-groups (`slide`, `magazine`) and transparent reticles intact!
 */
export function optimizeWeaponGroup(
  container: THREE.Object3D,
  skipSubtrees: readonly (THREE.Object3D | undefined)[] = [],
): void {
  const skip = new Set<THREE.Object3D>();
  for (const obj of skipSubtrees) {
    if (obj) skip.add(obj);
  }

  container.updateMatrixWorld(true);
  const invContainer = container.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const toRemove: THREE.Mesh[] = [];

  function walk(node: THREE.Object3D) {
    for (const child of [...node.children]) {
      if (skip.has(child)) continue;
      if (child instanceof THREE.Mesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material;
        const geo = mesh.geometry;
        // Skip multi-material arrays and transparent/additive lenses & glowing reticles.
        if (
          !Array.isArray(mat) &&
          !mat.transparent &&
          mat.blending === THREE.NormalBlending &&
          'position' in geo.attributes
        ) {
          const base = geo.index ? geo.toNonIndexed() : geo.clone();
          // Ensure matching attributes (`position`, `normal`, `uv`) before merging.
          if (!('normal' in base.attributes)) base.computeVertexNormals();
          if (!('uv' in base.attributes)) {
            const count = base.getAttribute('position').count;
            base.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
          }
          // Strip extra attributes like tangent/color if any differ across primitives.
          for (const key of Object.keys(base.attributes)) {
            if (key !== 'position' && key !== 'normal' && key !== 'uv') {
              base.deleteAttribute(key);
            }
          }
          const relMatrix = invContainer.clone().multiply(mesh.matrixWorld);
          base.applyMatrix4(relMatrix);
          const list = buckets.get(mat) ?? [];
          list.push(base);
          buckets.set(mat, list);
          toRemove.push(mesh);
        }
      } else {
        walk(child);
      }
    }
  }

  walk(container);

  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }

  for (const [mat, geos] of buckets) {
    if (geos.length === 0) continue;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (merged) {
      container.add(new THREE.Mesh(merged, mat));
    }
    if (geos.length > 1) {
      for (const g of geos) g.dispose();
    }
  }
}

/**
 * Batch static meshes on `root`, `slide`, and `magazine` while leaving all animated
 * groups, transparent lenses/reticles, and handhold anchors untouched.
 */
export function finalizeWeaponModel(model: WeaponModel): WeaponModel {
  optimizeWeaponGroup(model.root, [model.slide, model.magazine]);
  if (model.slide) optimizeWeaponGroup(model.slide, [model.boltHand]);
  optimizeWeaponGroup(model.magazine, [model.magazineHand]);
  return model;
}

/** Shared glowing tritium / white-dot sight material for iron sights. */
export function sightDotMaterial(hex = 0xe8f4e8): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: hex });
}

/** Convenience accessor to reuse the shared gun-steel material when needed. */
export { surface };
