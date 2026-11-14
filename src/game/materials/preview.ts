import * as THREE from 'three';
import { buildSky } from '../world';
import { SURFACE_NAMES, surfaceMesh } from './index';
import { RECIPES } from './recipes';

/**
 * Every surface side by side under the game's own light. Open the page with
 * `?materials`, or run `npm run playtest -- --materials` for a screenshot.
 * Large surfaces are shown on 1.2 m cubes; hand-sized ones on 12 cm cubes.
 */
export function showMaterials(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.autoClear = false;
  document.body.prepend(renderer.domElement);
  const { scene } = buildSky(renderer);

  // A surface that repeats in under 10 cm is something held in the hand.
  const small = (name: (typeof SURFACE_NAMES)[number]) => {
    const tile: readonly [number, number] | null = RECIPES[name].tile;
    return tile !== null && tile[0] < 0.1;
  };
  const rows = [SURFACE_NAMES.filter((name) => !small(name)), SURFACE_NAMES.filter(small)];
  const sizes = [1.2, 0.12];
  // The rows are far apart so neither appears in the other's picture.
  const origins = [new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 30, 0)];

  const cameras = rows.map((names, row) => {
    const size = sizes[row] ?? 1;
    const origin = origins[row] ?? new THREE.Vector3();
    names.forEach((name, i) => {
      const mesh = surfaceMesh(new THREE.BoxGeometry(size, size, size), name);
      mesh.position.set((i - (names.length - 1) / 2) * size * 1.25, 0, 0).add(origin);
      mesh.rotation.y = -0.5;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });
    const camera = new THREE.PerspectiveCamera(30, 1, size * 0.1, 3000);
    camera.position.set(0, size * 0.9, size * (1.6 + names.length * 1.25)).add(origin);
    camera.lookAt(origin);
    return camera;
  });

  const draw = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setScissorTest(true);
    cameras.forEach((camera, row) => {
      const y = row === 0 ? height / 2 : 0;
      renderer.setViewport(0, y, width, height / 2);
      renderer.setScissor(0, y, width, height / 2);
      camera.aspect = width / (height / 2);
      camera.updateProjectionMatrix();
      renderer.clear();
      renderer.render(scene, camera);
    });
  };
  window.addEventListener('resize', draw);
  draw();
  document.body.dataset.ready = 'true';
}
