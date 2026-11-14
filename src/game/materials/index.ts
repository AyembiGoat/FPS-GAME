import * as THREE from 'three';
import { RECIPES } from './recipes';
import { buildSurface } from './surface';

export type SurfaceName = keyof typeof RECIPES;

export const SURFACE_NAMES = Object.keys(RECIPES) as SurfaceName[];

const cache = new Map<SurfaceName, THREE.MeshStandardMaterial>();

/** The one shared material for a named surface. Built the first time it is asked for. */
export function surface(name: SurfaceName): THREE.MeshStandardMaterial {
  let material = cache.get(name);
  if (!material) {
    material = buildSurface(RECIPES[name]);
    cache.set(name, material);
  }
  return material;
}

/**
 * Lay a surface onto a mesh at its real-world scale. Geometry must be in metres.
 * Each face is mapped flat-on from the side it mostly faces, so the texture keeps
 * the same size on every object and lines up across neighbouring boxes.
 * Surfaces with no tile size (one repeat per face) are left as they are.
 */
export function applySurface(geometry: THREE.BufferGeometry, name: SurfaceName): void {
  const tile: readonly [number, number] | null = RECIPES[name].tile;
  if (!tile) return;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (nx >= ny && nx >= nz) uv.setXY(i, z / tile[0], y / tile[1]);
    else if (ny >= nz) uv.setXY(i, x / tile[0], z / tile[1]);
    else uv.setXY(i, x / tile[0], y / tile[1]);
  }
}

/** A mesh in the given surface, mapped at real-world scale. */
export function surfaceMesh(geometry: THREE.BufferGeometry, name: SurfaceName): THREE.Mesh {
  applySurface(geometry, name);
  return new THREE.Mesh(geometry, surface(name));
}

/** Soft round blob for dust puffs and the muzzle flash. Not a surface. */
export function softDot(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
