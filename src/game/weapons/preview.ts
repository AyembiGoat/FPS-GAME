import * as THREE from 'three';
import type { WeaponSpec } from '../../core/weapon';
import { buildSky } from '../world';
import { buildWeaponModel } from './index';
import { createViewmodel } from './viewmodel';

/**
 * The gun and the hands holding it from four sides: left, right, front and above.
 * Open the page with `?weapon`, or run `npm run playtest -- --weapon` for a
 * screenshot. Use it to check that no finger passes through the gun or the other hand.
 */
export function showWeapon(spec: WeaponSpec): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.autoClear = false;
  renderer.setClearColor(0x8a8d90);
  document.body.prepend(renderer.domElement);

  const model = buildWeaponModel(spec);
  const viewmodel = createViewmodel(model, buildSky(renderer).scene.environment);
  viewmodel.setSun(new THREE.Vector3(-0.5, 0.8, 0.4));
  viewmodel.update(0, {
    rounds: spec.magazineSize,
    reloadProgress: null,
    aim: 0,
    moveAmount: 0,
    sprinting: false,
    walked: 0,
    yawRate: 0,
    pitchRate: 0,
    landOffset: 0,
    lean: 0,
  });

  const centre = model.grip.anchor.getWorldPosition(new THREE.Vector3());
  centre.y += 0.02;
  const views: readonly (readonly [number, number, number])[] = [
    [-1, 0.15, -0.25],
    [1, 0.15, -0.25],
    [0.25, 0.1, -1],
    [-0.1, 1, 0.45],
  ];
  const cameras = views.map(([x, y, z]) => {
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    camera.position.set(x, y, z).setLength(0.52).add(centre);
    camera.lookAt(centre);
    return camera;
  });

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
