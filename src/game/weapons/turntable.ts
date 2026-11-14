import * as THREE from 'three';
import type { OpticId, WeaponId, WeaponSpec } from '../../core/weapon';
import { clampWeaponOptic, getWeaponSpec } from '../../core/weapon';
import { buildWeaponModel } from './index';

/**
 * Interactive 3D Armory turntable rendered inside the Loadout screen's central preview
 * stage. Renders a single firearm on a dark studio pedestal with 3-point key/rim lighting,
 * auto-framing per weapon bounding box, slow idle presentation spin, and pointer-drag
 * 360° orbit inspection. Zero rendering work when hidden.
 */
export function createWeaponTurntable(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.className = 'armory-stage-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();

  // Procedural Armory studio softbox environment so dark metallic PBR steels & optics gleam.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x1f2733);
  const softboxMat = (color: number) =>
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const overhead = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.6), softboxMat(0xfff5e4));
  overhead.position.set(0, 3.8, 0.4);
  overhead.rotation.x = Math.PI / 2;
  const frontPanel = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), softboxMat(0xdce8f8));
  frontPanel.position.set(0, 1.2, 4.4);
  frontPanel.rotation.y = Math.PI;
  const rimPanel = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.0), softboxMat(0x9bc4f0));
  rimPanel.position.set(-2.6, 1.8, -3.6);
  rimPanel.lookAt(0, 0, 0);
  const warmAccent = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2), softboxMat(0xffcf82));
  warmAccent.position.set(3.2, 0.8, 1.8);
  warmAccent.lookAt(0, 0, 0);
  studio.add(overhead, frontPanel, rimPanel, warmAccent);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.04).texture;
  scene.environmentIntensity = 1.25;
  pmrem.dispose();

  // Crisp 3-point key/fill/rim lighting calibrated for matte gunmetal, FDE, walnut & OD green.
  const hemi = new THREE.HemisphereLight(0xe4eefc, 0x353c48, 1.55);
  const key = new THREE.DirectionalLight(0xfff4e2, 3.2);
  key.position.set(2.2, 2.8, 2.6);
  const rim = new THREE.DirectionalLight(0x9ac6f2, 2.2);
  rim.position.set(-2.8, 2.0, -2.0);
  const fill = new THREE.DirectionalLight(0xf2ba5c, 0.95);
  fill.position.set(-1.0, -0.6, 2.8);
  scene.add(hemi, key, rim, fill);

  // Subtle dark brushed studio turntable disc beneath the floating firearm.
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.6, 0.012, 48),
    new THREE.MeshStandardMaterial({
      color: 0x16191f,
      roughness: 0.72,
      metalness: 0.35,
    }),
  );
  disc.position.y = -0.22;
  const rimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.568, 48),
    new THREE.MeshBasicMaterial({
      color: 0xe5a93c,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    }),
  );
  rimRing.rotation.x = -Math.PI / 2;
  rimRing.position.y = -0.213;
  scene.add(disc, rimRing);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.02, 12);

  // Cache built turntable models per weapon+optic so swapping attachments in Armory is instant.
  const cache = new Map<string, { group: THREE.Group; radius: number }>();
  let currentId: WeaponId | null = null;
  let currentKey = '';
  let currentEntry: { group: THREE.Group; radius: number } | null = null;

  let yaw = 0.24; // Showcase clean left-to-right 3/4 side silhouette!
  let pitch = 0.08;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let idleDelay = 0;
  let active = false;
  let rafId = 0;
  let lastFrame = 0;

  function loadWeapon(spec: WeaponSpec, opticId: OpticId) {
    const key = `${spec.id}:${opticId}`;
    let entry = cache.get(key);
    if (!entry) {
      const built = buildWeaponModel(spec, opticId);
      const wrapper = new THREE.Group();
      // Rotate gun so barrel (-Z) points cleanly to the right (+X) in hero side-profile!
      built.root.rotation.y = -Math.PI / 2;
      built.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.root);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      built.root.position.sub(centre);
      wrapper.add(built.root);
      const radius = Math.max(size.x * 0.56, size.y * 0.9, 0.24);
      entry = { group: wrapper, radius };
      cache.set(key, entry);
    }
    return entry;
  }

  function frameCamera(radius: number) {
    const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    camera.aspect = aspect;
    // Ensure long sniper rifles fit cleanly horizontally even on narrower viewports.
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    const distH = (radius * 1.18) / Math.tan(hFov / 2);
    const distV = (radius * 0.62) / Math.tan(fovRad / 2);
    const dist = Math.max(distH, distV, 0.68);
    camera.position.set(0, 0.06, dist);
    camera.lookAt(0, -0.01, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = Math.max(2, container.clientWidth);
    const h = Math.max(2, container.clientHeight);
    renderer.setSize(w, h, false);
    if (currentEntry) frameCamera(currentEntry.radius);
  }

  function renderFrame(now: number) {
    if (!active) return;
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
    lastFrame = now;

    if (!dragging) {
      if (idleDelay > 0) {
        idleDelay = Math.max(0, idleDelay - dt);
      } else {
        yaw += dt * 0.22;
      }
      pitch += (0.08 - pitch) * Math.min(1, dt * 3);
    }

    pivot.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderFrame);
  }

  container.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    idleDelay = 2.5;
    container.setPointerCapture(event.pointerId);
  });

  container.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    yaw += dx * 0.01;
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.007, -0.55, 0.55);
  });

  const endDrag = () => {
    dragging = false;
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', resize);

  return {
    setWeapon(id: WeaponId, opticId?: OpticId) {
      const resolvedOptic = clampWeaponOptic(id, opticId);
      const key = `${id}:${resolvedOptic}`;
      if (key === currentKey && currentEntry) return;
      const sameWeapon = id === currentId;
      if (currentEntry) pivot.remove(currentEntry.group);
      currentId = id;
      currentKey = key;
      currentEntry = loadWeapon(getWeaponSpec(id), resolvedOptic);
      pivot.add(currentEntry.group);
      if (!sameWeapon) {
        yaw = 0.26;
        pitch = 0.07;
        idleDelay = 0.6;
      }
      resize();
      if (active) renderer.render(scene, camera);
    },

    setActive(on: boolean) {
      if (active === on) return;
      active = on;
      if (on) {
        lastFrame = 0;
        resize();
        rafId = requestAnimationFrame(renderFrame);
      } else {
        cancelAnimationFrame(rafId);
      }
    },

    renderNow() {
      resize();
      pivot.rotation.set(pitch, yaw, 0);
      renderer.render(scene, camera);
    },
  };
}

export type WeaponTurntable = ReturnType<typeof createWeaponTurntable>;
