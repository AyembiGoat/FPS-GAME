import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * Accuracy International AWM / L115A3 (.338 Lapua Magnum) bolt-action precision sniper rifle.
 * Iconic NATO Olive Drab monolithic thumbhole chassis, 26" free-floating heavy barrel with
 * twin-chamber tactical muzzle brake, folded front bipod, rotating oversized bolt handle,
 * and Schmidt & Bender PM II 5-25×56 riflescope. Built from reference/arsenal/16–18.
 */

function chassisShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Full-length Accuracy International monolithic thumbhole chassis in (z, y).
  s.moveTo(-0.37, 0.012); // forend nose
  s.lineTo(0.12, 0.012); // top rail bed under receiver
  s.lineTo(0.145, 0.002); // behind bolt tang
  s.lineTo(0.365, -0.002); // top of stock body
  s.lineTo(0.372, -0.122); // rear buttpad plane
  s.lineTo(0.312, -0.126); // lower rear bag hook toe
  s.lineTo(0.282, -0.088); // rear monopod cutout
  s.lineTo(0.21, -0.09);
  s.lineTo(0.125, -0.128); // grip heel
  s.lineTo(0.068, -0.128); // pistol grip base
  s.lineTo(0.045, -0.044); // behind trigger guard
  s.lineTo(-0.022, -0.044); // trigger guard underside
  s.lineTo(-0.032, -0.04); // magwell rear
  s.lineTo(-0.128, -0.04); // magwell front
  s.lineTo(-0.148, -0.036); // forend belly
  s.lineTo(-0.355, -0.03); // tapered forend tip
  s.closePath();

  // Iconic Accuracy International large thumbhole cutout!
  const thumbhole = new THREE.Path();
  thumbhole.moveTo(0.118, -0.022);
  thumbhole.lineTo(0.232, -0.022);
  thumbhole.lineTo(0.222, -0.072);
  thumbhole.lineTo(0.132, -0.088);
  thumbhole.closePath();
  s.holes.push(thumbhole);

  // Trigger guard opening.
  const guard = new THREE.Path();
  guard.moveTo(-0.016, -0.014);
  guard.lineTo(0.036, -0.014);
  guard.lineTo(0.036, -0.038);
  guard.lineTo(-0.014, -0.038);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

const GRIP_RAKE = -0.26;

export function buildAWM(opticId: OpticId = 'sniper-scope'): WeaponModel {
  const root = new THREE.Group();

  // Monolithic Accuracy International NATO Olive Drab thumbhole chassis.
  root.add(
    new THREE.Mesh(
      fromSideProfile(chassisShape(), 0.044, 0.004, 'chassis-od'),
      surface('chassis-od'),
    ),
  );
  // Adjustable black polymer cheek riser + stacked buttpad spacers.
  root.add(partBox('polymer-black', [0.038, 0.028, 0.135], [0, 0.014, 0.255]));
  root.add(partBox('polymer-black', [0.042, 0.122, 0.018], [0, -0.062, 0.376]));
  root.add(partBox('glove', [0.042, 0.122, 0.018], [0, -0.062, 0.394]));
  // Curved precision match trigger.
  root.add(partBox('steel-dark', [0.005, 0.02, 0.005], [0, -0.026, 0.012], [0.18, 0, 0]));

  // Flat-bottomed machined precision steel bolt-action receiver (z: -0.11..0.115).
  root.add(partBox('steel-dark', [0.038, 0.038, 0.225], [0, 0.026, 0.002]));
  // Right-side ejection port cutout.
  root.add(partBox('polymer-black', [0.005, 0.016, 0.088], [0.018, 0.03, -0.01]));
  buildPicatinnyRail(root, 0.045, -0.105, 0.105, 'steel-dark');

  // Rotating bolt assembly (`slide`, `action: 'bolt'`) with swept-back tactical knob!
  const slide = new THREE.Group();
  slide.add(barrelCyl('gun-steel', 0.0105, 0.0105, 0.15, [0, 0.03, 0.04], 16));
  // Bolt handle stem & oversized teardrop knob extending right-downward.
  slide.add(partBox('steel-dark', [0.036, 0.008, 0.01], [0.024, 0.024, 0.088], [0, -0.25, -0.42]));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 12), surface('polymer-black'));
  knob.position.set(0.044, 0.012, 0.098);
  slide.add(knob);
  root.add(slide);

  // Heavy 26" free-floating fluted barrel + iconic AI dual-chamber rectangular muzzle brake.
  root.add(barrelCyl('steel-dark', 0.0118, 0.0148, 0.62, [0, 0.028, -0.415], 20));
  root.add(partBox('steel-dark', [0.032, 0.026, 0.068], [0, 0.028, -0.755]));
  for (const bz of [-0.738, -0.766]) {
    root.add(partBox('polymer-black', [0.033, 0.014, 0.014], [0, 0.028, bz]));
  }
  root.add(barrelCyl('polymer-black', 0.0068, 0.0068, 0.004, [0, 0.028, -0.79], 12));

  // Folded twin-leg sniper bipod tucked neatly underneath the forend!
  root.add(partBox('steel-dark', [0.034, 0.018, 0.032], [0, -0.042, -0.355]));
  for (const sx of [-0.022, 0.022]) {
    root.add(barrelCyl('steel-dark', 0.0065, 0.0065, 0.175, [sx, -0.046, -0.275], 10));
    root.add(
      uprightCyl('glove', 0.009, 0.009, 0.018, [sx, -0.046, -0.184], [Math.PI / 2, 0, 0], 10),
    );
  }

  // Removable 5-round .338 Lapua heavy steel box magazine.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.038, -0.078);
  magazine.add(partBox('steel-dark', [0.028, 0.092, 0.088], [0, -0.046, 0]));
  magazine.add(partBox('polymer-black', [0.031, 0.01, 0.092], [0, -0.094, 0]));
  root.add(magazine);

  // Mounted precision riflescope (PM II 6–10× default, LPVO 2–5×, or ACOG 3.5×).
  const resolvedOptic = opticId === 'irons' ? 'sniper-scope' : opticId;
  const mounted = buildMountedOptic(root, resolvedOptic, 0.052, -0.045);

  // Anchors.
  const gripAnchor = anchor(root, [0, -0.084, 0.086], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.014, -0.026, 0.012]);
  const supportAnchor = underHandguardAnchor(root, [0, -0.008, -0.235]);
  const boltHand = anchor(slide, [0.044, 0.012, 0.098], [0.22, -0.35, -0.32]);
  const magazineHand = anchor(magazine, [0, -0.055, 0], [0.04, 0, 0]);
  const muzzle = anchor(root, [0, 0.028, -0.794]);
  const ejection = anchor(root, [0.024, 0.032, -0.01]);
  const sight = anchor(root, [0, mounted.sightY, mounted.sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.034, 0.048], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.048], thumb: 'alongside' },
    boltHand,
    magazineHand,
    magazine,
    magazineTravel: 0.12,
    slide,
    slideTravel: 0.076,
    action: 'bolt',
    muzzleBrake: true,
    recoilProfile: 'sniper',
    muzzle,
    ejection,
    sight,
    aimDistance: mounted.aimDistance,
    hip: {
      position: new THREE.Vector3(0.17, -0.175, -0.29),
      rotation: new THREE.Euler(0.016, -0.042, -0.022),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.64, slideRelease: 0.85 },
  };
}
