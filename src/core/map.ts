import type { Box } from './collision';
import type { Vec3 } from './vec';

export type SurfaceMaterial = 'floor' | 'concrete' | 'plywood' | 'crate' | 'container' | 'timber';

export interface MapSolid extends Box {
  readonly material: SurfaceMaterial;
}

export interface TargetSpawn {
  /** Centre of the target's base, on the floor. */
  readonly position: Vec3;
  /** Unit vector along X or Z that the front of the plate faces. */
  readonly facing: { readonly x: -1 | 0 | 1; readonly z: -1 | 0 | 1 };
}

/** A level, as plain data. Rendering builds its meshes from the same solids. */
export interface GameMap {
  readonly name: string;
  /** Walkable extent on the ground plane. */
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly solids: readonly MapSolid[];
  readonly spawn: { readonly position: Vec3; readonly yaw: number };
  readonly targets: readonly TargetSpawn[];
}
