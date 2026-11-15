import type { Box } from './collision';
import type { Vec3 } from './vec';
import type { WeaponId } from './weapon';

export type MapId = 'shoot-house' | 'cargo-yard';

export type SurfaceMaterial =
  | 'floor'
  | 'asphalt'
  | 'concrete'
  | 'brick'
  | 'plywood'
  | 'crate'
  | 'container'
  | 'container-red'
  | 'timber'
  | 'steel';

export interface MapSolid extends Box {
  readonly material: SurfaceMaterial;
}

export interface TargetSpawn {
  /** Centre of the target's base, on the floor. */
  readonly position: Vec3;
  /** Unit vector along X or Z that the front of the plate faces. */
  readonly facing: { readonly x: -1 | 0 | 1; readonly z: -1 | 0 | 1 };
}

export type EnemyArchetype = 'assaulter' | 'breacher' | 'marksman';

export interface EnemySpawn {
  readonly id: string;
  readonly archetype: EnemyArchetype;
  readonly weaponId: WeaponId;
  readonly position: Vec3;
  readonly yaw: number;
  /** Ordered patrol / reposition waypoints on the floor (y = 0). */
  readonly patrol: readonly Vec3[];
}

export interface MapMarkerSpec {
  readonly firingLineX: number;
  readonly firingLineZ: number;
  readonly firingLineWidth: number;
  readonly stencils: readonly (readonly [string, number])[];
}

/** A level, as plain data. Rendering builds its meshes from the same solids. */
export interface GameMap {
  readonly id: MapId;
  readonly name: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly locationTag: string;
  readonly sectors: readonly string[];
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
  readonly enemies: readonly EnemySpawn[];
  readonly rangeMarkings?: MapMarkerSpec;
}
