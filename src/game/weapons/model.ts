import type * as THREE from 'three';

/**
 * What a gun model must provide so the shared arms, animations and aiming work
 * with it. Build the model in gun space and fill this in; nothing else needs to
 * know the gun's shape. See .agents/skills/weapons/SKILL.md.
 *
 * Gun space: metres, +X to the shooter's right, +Y up, barrel pointing along -Z.
 *
 * Hand anchors are empty objects placed where a hand holds the gun:
 *   - position: the centre of whatever the hand wraps (the middle of the grip).
 *   - +Y: up the grip, toward the thumb.
 *   - +Z: toward the shooter's wrist.
 * The arms module puts a hand at each anchor and solves the elbow itself.
 */
export interface WeaponModel {
  readonly root: THREE.Group;

  /** The firing hand. Always the right hand. */
  readonly grip: THREE.Object3D;
  /** Where the left hand rests when it is not reloading. */
  readonly support: THREE.Object3D;
  /**
   * Where the left hand holds the magazine. Must be a child of `magazine`, so the
   * hand follows the magazine as it slides out.
   */
  readonly magazineHand: THREE.Object3D;
  /** The removable magazine. During a reload it slides along its own -Y axis. */
  readonly magazine: THREE.Object3D;
  /** Metres the magazine travels before it is clear of the gun. */
  readonly magazineTravel: number;

  /** The part that cycles back on each shot, or null if nothing does. */
  readonly slide: THREE.Object3D | null;
  readonly slideTravel: number;

  /** Tip of the barrel; the muzzle flash appears here. */
  readonly muzzle: THREE.Object3D;
  /** Where spent cases leave the gun. +X of this object is the direction they fly. */
  readonly ejection: THREE.Object3D;
  /**
   * The point the eye lines up with when aiming: on the sight line, at the rear
   * sight, with -Z pointing at the front sight.
   */
  readonly sight: THREE.Object3D;
  /** Metres from the eye to `sight` when aimed. */
  readonly aimDistance: number;

  /** Where the gun sits when held at the hip, relative to the camera. */
  readonly hip: { readonly position: THREE.Vector3; readonly rotation: THREE.Euler };

  /** When each reload beat happens, as a fraction of the reload time. Sounds use these too. */
  readonly reload: {
    readonly magazineOut: number;
    readonly magazineIn: number;
    /** Only happens when the gun was emptied before the reload. */
    readonly slideRelease: number;
  };
}
