import type * as THREE from 'three';

/** Thickness of one gloved finger, in metres. */
export const FINGER = 0.017;

/**
 * A place a hand holds. The fingers are bent round a box of the given size, so they
 * sit on the surface and never pass through it. Measure the real part.
 *
 * The anchor is an empty object at the centre of that box:
 *   - +Y: up the grip, toward the thumb.
 *   - +Z: toward the shooter's wrist.
 *   - The palm is on the hand's own side: +X for the right hand, -X for the left.
 */
export interface Handhold {
  readonly anchor: THREE.Object3D;
  /** Width (X) and depth (Z) of what the fingers close round, in metres. */
  readonly size: readonly [number, number];
  /**
   * `wrapped`: the thumb crosses behind and lies on the far side, as on a pistol grip.
   * `alongside`: the thumb lies forward on the palm's side, as on a handguard or when
   * this hand closes over the other one.
   */
  readonly thumb: 'wrapped' | 'alongside';
}

/**
 * What a gun model must provide so the shared arms, animations and aiming work
 * with it. Build the model in gun space and fill this in; nothing else needs to
 * know the gun's shape. See .agents/skills/weapons/SKILL.md.
 *
 * Gun space: metres, +X to the shooter's right, +Y up, barrel pointing along -Z.
 */
export interface WeaponModel {
  readonly root: THREE.Group;

  /** The firing hand. Always the right hand. */
  readonly grip: Handhold;
  /** Where the tip of the trigger finger rests: beside the trigger, on the right. */
  readonly trigger: THREE.Object3D;
  /** Where the left hand rests when it is not reloading. */
  readonly support: Handhold;
  /**
   * Where the left hand holds the magazine, with the same axes as a handhold anchor.
   * Must be a child of `magazine`, so the hand follows the magazine as it slides out.
   */
  readonly magazineHand: THREE.Object3D;
  /** The removable magazine. During a reload it slides along its own -Y axis. */
  readonly magazine: THREE.Object3D;
  /** Metres the magazine travels before it is clear of the gun. */
  readonly magazineTravel: number;

  /** The part that cycles back on each shot (slide, bolt carrier, pump forend, or bolt), or null. */
  readonly slide: THREE.Object3D | null;
  readonly slideTravel: number;
  /** How `slide` cycles: standard slide/carrier, shotgun pump forend, or sniper bolt handle. */
  readonly action?: 'slide' | 'pump' | 'bolt';

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
