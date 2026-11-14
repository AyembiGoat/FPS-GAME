import * as THREE from 'three';
import type { WeaponSpec } from '../../core/weapon';
import { buildSky } from '../world';
import { buildWeaponModel } from './index';
import { createViewmodel } from './viewmodel';

/**
 * The gun and the hands holding it from four sides: left, right, front and above.
 * Open the page with `?weapon` (or `?weapon=hk416`, `?weapon=awm`, etc.), or run
 * `npm run playtest -- --weapon` for screenshots. Auto-frames any firearm from pistol
 * to long-barrel sniper rifle so every grip, sight, and barrel is inspectable.
 */
export function showWeapon(spec: WeaponSpec): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.56;
  renderer.autoClear = false;
  renderer.setClearColor(0x82878d);
  document.body.prepend(renderer.domElement);

  const model = buildWeaponModel(spec);
  const viewmodel = createViewmodel(model, buildSky(renderer).scene.environment);
  viewmodel.setSun(new THREE.Vector3(-0.5, 0.85, 0.45));
  viewmodel.update(0, {
    rounds: spec.magazineSize,
    reloadProgress: null,
    cycleProgress: 0,
    switchProgress: 0,
    aim: 0,
    moveAmount: 0,
    sprinting: false,
    walked: 0,
    yawRate: 0,
    pitchRate: 0,
    landOffset: 0,
    lean: 0,
  });

  // Compute exact bounding box of the firearm (without full upper arms) for framing.
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.28);
  const dist = Math.max(0.52, span * 1.48);

  const views: readonly (readonly [number, number, number])[] = [
    [-1, 0.14, -0.18],
    [1, 0.14, -0.18],
    [0.22, 0.1, -1],
    [-0.1, 1, 0.35],
  ];
  const cameras = views.map(([x, y, z]) => {
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
    camera.position.set(x, y, z).setLength(dist).add(centre);
    camera.lookAt(centre);
    return camera;
  });

  // Subtle top-left identifier badge for visual review screenshots.
  const badge = document.createElement('div');
  badge.style.cssText =
    'position:fixed;top:12px;left:14px;padding:6px 12px;background:rgba(12,14,18,0.78);' +
    'color:#f1f3f5;font:700 13px/1.2 "Barlow Condensed",system-ui,sans-serif;' +
    'letter-spacing:0.12em;text-transform:uppercase;border-left:3px solid #e5a93c;pointer-events:none;';
  badge.textContent = `${spec.name}  ·  ${spec.caliber}  ·  ${spec.fireMode}`;
  document.body.append(badge);

  const draw = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setScissorTest(true);
    cameras.forEach((camera, i) => {
      const x = (i % 2) * (width / 2);
      const y = i < 2 ? height / 2 : 0;
      renderer.setViewport(x, y, width / 2, height / 2);
      renderer.setScissor(x, y, width / 2, height / 2);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.clear();
      renderer.render(viewmodel.scene, camera);
    });
  };
  window.addEventListener('resize', draw);
  draw();
  document.body.dataset.ready = 'true';
}
