import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  addSportingTriggerGuard,
  anchor,
  barrelCyl,
  brassMaterial,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  sportingGripAnchors,
  sportingStockShape,
  underHandguardAnchor,
} from './parts';

/**
 * Mauser Karabiner 98k, 7.92×57mm bolt action. Laminated stock with a semi-pistol wrist,
 * handguard from the rear sight to the lower band, two barrel bands, hooded front sight,
 * turned-down bolt handle and the sling slot cut through the butt. Five rounds, loaded
 * from the top on a stripper clip.
 * Built from reference/arsenal/br/mauser-karabiner-98k-rifle-side-profile--3, -4 and -1.
 */

const BORE_Y = 0.024;
const SIGHT_Y = 0.058;

export function buildKar98k(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  const stock = sportingStockShape({
    forendTip: -0.47,
    forendDepth: -0.016,
    buttZ: 0.42,
    wrist: 'pistol',
  });
  // Sling slot through the butt.
  const slot = new THREE.Path();
  slot.moveTo(0.3, -0.05);
  slot.lineTo(0.34, -0.052);
  slot.lineTo(0.34, -0.07);
  slot.lineTo(0.3, -0.066);
  slot.closePath();
  stock.holes.push(slot);
  root.add(
    new THREE.Mesh(fromSideProfile(stock, 0.042, 0.008, 'rifle-walnut'), surface('rifle-walnut')),
  );
  // Cupped steel butt plate, bolt take-down disc.
  root.add(partBox('gun-steel', [0.042, 0.12, 0.008], [0, -0.066, 0.423], [0.02, 0, 0]));
  root.add(partBox('gun-steel', [0.044, 0.016, 0.016], [0, -0.03, 0.26]));
  addSportingTriggerGuard(root);
  // Flush magazine floor plate ahead of the guard.
  root.add(partBox('steel-dark', [0.022, 0.004, 0.09], [0, -0.03, -0.046]));

  // Receiver ring, left wall, rear bridge.
  root.add(barrelCyl('steel-dark', 0.0185, 0.0185, 0.05, [0, BORE_Y, -0.085], 16));
  root.add(partBox('steel-dark', [0.01, 0.026, 0.14], [-0.013, BORE_Y - 0.004, 0.012]));
  root.add(partBox('steel-dark', [0.034, 0.016, 0.14], [0, 0.006, 0.012]));
  root.add(partBox('steel-dark', [0.034, 0.014, 0.022], [0, BORE_Y + 0.014, 0.066]));

  // Bolt: body, cocking piece with the wing safety, handle turned down on the right.
  const slide = new THREE.Group();
  slide.position.set(0, BORE_Y, 0);
  slide.add(barrelCyl('stainless-steel', 0.0092, 0.0092, 0.15, [0, 0, 0.03], 14));
  slide.add(barrelCyl('steel-dark', 0.0104, 0.0098, 0.034, [0, 0, 0.122], 14));
  slide.add(partBox('steel-dark', [0.006, 0.016, 0.02], [0, 0.014, 0.124]));
  slide.add(partBox('stainless-steel', [0.03, 0.009, 0.01], [0.022, -0.008, 0.094], [0, 0, -0.55]));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 14, 12), surface('stainless-steel'));
  knob.position.set(0.037, -0.019, 0.094);
  slide.add(knob);
  root.add(slide);

  // Tangent rear sight base on the chamber, handguard, lower band, H-shaped upper band.
  root.add(partBox('steel-dark', [0.024, 0.016, 0.06], [0, BORE_Y + 0.022, -0.15]));
  root.add(barrelCyl('rifle-walnut', 0.0165, 0.018, 0.2, [0, BORE_Y + 0.006, -0.282], 14));
  root.add(partBox('gun-steel', [0.045, 0.052, 0.014], [0, 0.006, -0.37]));
  root.add(partBox('gun-steel', [0.044, 0.05, 0.03], [0, 0.008, -0.462]));
  root.add(partBox('gun-steel', [0.012, 0.012, 0.04], [0, -0.022, -0.485]));

  // Barrel, cleaning rod stub, hooded front sight.
  root.add(barrelCyl('steel-dark', 0.0078, 0.0098, 0.59, [0, BORE_Y, -0.395], 16));
  root.add(barrelCyl('polymer-black', 0.0044, 0.0044, 0.004, [0, BORE_Y, -0.691], 12));
  root.add(barrelCyl('gun-steel', 0.0028, 0.0028, 0.11, [0, 0.0, -0.53], 8));
  root.add(partBox('steel-dark', [0.014, 0.02, 0.03], [0, BORE_Y + 0.014, -0.658]));
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.002, 8, 20), surface('steel-dark'));
  hood.position.set(0, SIGHT_Y - 0.002, -0.658);
  root.add(hood);
  root.add(partBox('steel-dark', [0.0022, 0.012, 0.0026], [0, SIGHT_Y - 0.006, -0.658]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0006, -0.658);
  root.add(tip);

  let sightY = SIGHT_Y;
  let sightZ = -0.136;
  // The eye sits well behind the bolt so the receiver bridge does not fill the view.
  let aimDistance = 0.33;
  if (opticId === 'irons') {
    // Tangent leaf with the V notch.
    root.add(
      partBox('steel-dark', [0.02, 0.004, 0.058], [0, SIGHT_Y - 0.01, -0.152], [0.05, 0, 0]),
    );
    root.add(partBox('steel-dark', [0.008, 0.01, 0.01], [-0.006, SIGHT_Y - 0.003, -0.128]));
    root.add(partBox('steel-dark', [0.008, 0.01, 0.01], [0.006, SIGHT_Y - 0.003, -0.128]));
  } else {
    // Turret-style base bridging the receiver ring and rear bridge.
    root.add(partBox('steel-dark', [0.022, 0.012, 0.03], [0, BORE_Y + 0.022, -0.085]));
    root.add(partBox('steel-dark', [0.022, 0.012, 0.022], [0, BORE_Y + 0.026, 0.066]));
    buildPicatinnyRail(root, BORE_Y + 0.03, -0.105, 0.085, 'steel-dark');
    const mounted = buildMountedOptic(root, opticId, BORE_Y + 0.036, -0.015);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Five rounds on a stripper clip, shown above the open action during a reload.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.008, -0.02);
  const brass = brassMaterial();
  for (let i = 0; i < 5; i++) {
    magazine.add(barrelCyl(brass, 0.0042, 0.006, 0.07, [0, -0.02 + i * 0.0105, 0], 8));
  }
  magazine.add(partBox('gun-steel', [0.004, 0.056, 0.008], [0, 0.002, 0.036]));
  root.add(magazine);

  const hands = sportingGripAnchors(root, 'pistol');
  const supportAnchor = underHandguardAnchor(root, [0, -0.008, -0.25]);
  const boltHand = anchor(slide, [0.037, -0.019, 0.094], [0.22, -0.35, -0.32]);
  const magazineHand = anchor(magazine, [0, 0.0, 0.03], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.694]);
  const ejection = anchor(root, [0.02, BORE_Y + 0.012, -0.02]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: hands.grip, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger: hands.trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.048], thumb: 'alongside' },
    boltHand,
    magazineHand,
    magazine,
    magazineTravel: -0.085,
    slide,
    slideTravel: 0.085,
    action: 'bolt',
    recoilProfile: 'sniper',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.165, -0.165, -0.27),
      rotation: new THREE.Euler(0.016, -0.042, -0.022),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.68, slideRelease: 0.88 },
  };
}
