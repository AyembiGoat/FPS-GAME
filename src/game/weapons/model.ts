import type * as THREE from 'three';

/**
 * What the arms and viewmodel need to know about a gun. Every weapon module
 * returns one of these. Nothing outside a gun's own file knows its shape.
 */

export interface Handhold {
  /** Positioned at the centre of what is held. +Y runs toward the thumb, +Z toward the wrist. */
  readonly anchor: THREE.Object3D;
  /** [width across the palm, depth front to back] of what is held, in metres. */
  readonly size: readonly [number, number];
  /** Wrapped behind the grip (firing hand) or resting along the side (support hand). */
  readonly thumb: 'wrapped' | 'alongside';
}

export type RecoilProfile =
  'carbine' | 'heavy-rifle' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'hand-cannon';

export interface WeaponModel {
  readonly root: THREE.Group;
  readonly grip: Handhold;
  /** Where the trigger fingertip rests, in root space. */
  readonly trigger: THREE.Object3D;
  readonly support: Handhold;
  /** Where the support hand holds the magazine while changing it. Parented to the magazine. */
  readonly magazineHand: THREE.Object3D;
  readonly magazine: THREE.Object3D;
  /** How far the magazine slides down to clear the grip, in metres. */
  readonly magazineTravel: number;
  /** Reciprocating bolt/slide, pump forend, or sniper bolt handle, if the gun has one. */
  readonly slide?: THREE.Object3D;
  readonly slideTravel: number;
  /** Mechanical action animated on `slide` (`'slide'` default, `'pump'` for shotgun, `'bolt'` for sniper). */
  readonly action?: 'slide' | 'pump' | 'bolt';
  /** Optional bolt-handle hand anchor (parented to `slide`) so the firing hand works bolt actions. */
  readonly boltHand?: THREE.Object3D;
  /** Optional side muzzle-brake vents (renders twin horizontal gas-jet flashes on heavy brakes). */
  readonly muzzleBrake?: boolean;
  /** Multi-spring recoil character for this firearm. */
  readonly recoilProfile?: RecoilProfile;
  /** Where flash and smoke leave, facing -Z. */
  readonly muzzle: THREE.Object3D;
  /** Where spent cases leave, facing +X. */
  readonly ejection: THREE.Object3D;
  /** Point on the sight line placed in front of the eye when aiming, facing -Z. */
  readonly sight: THREE.Object3D;
  /** Metres in front of the eye to hold `sight` when aiming. */
  readonly aimDistance: number;
  /** Rest pose at the hip, in camera space. */
  readonly hip: { readonly position: THREE.Vector3; readonly rotation: THREE.Euler };
  /**
   * Reload beats as fractions of reload time: when the old magazine leaves, when the
   * new one seats, and when the slide shuts on an empty reload. Both the animation
   * and the sound read these so they stay in step.
   */
  readonly reload: {
    readonly magazineOut: number;
    readonly magazineIn: number;
    readonly slideRelease: number;
  };
}

/** Thickness of a gloved finger, in metres. Guns size their trigger guard from this. */
export const FINGER = 0.0175;
