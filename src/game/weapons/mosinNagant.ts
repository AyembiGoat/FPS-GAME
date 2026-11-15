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
 * Mosin-Nagant M91/30, 7.62×54mmR bolt action, in its sniper fitting: long shellacked
 * birch stock with a straight wrist, the angular magazine box hanging ahead of the
 * trigger guard, two barrel bands, a globe front sight and the bolt handle bent down to
 * clear a scope.
 * Built from reference/arsenal/br/mosin-nagant-m91-30-rifle-side-profile-i-1 and -4.
 */

const BORE_Y = 0.024;
const SIGHT_Y = 0.056;

function magazineBoxShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.118, -0.026);
  s.lineTo(0.004, -0.026);
  s.lineTo(0.004, -0.04);
  s.lineTo(-0.03, -0.062);
  s.lineTo(-0.102, -0.066);
  s.closePath();
  return s;
}

export function buildMosinNagant(opticId: OpticId = 'pso-1'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(
        sportingStockShape({
          forendTip: -0.56,
          forendDepth: -0.014,
          buttZ: 0.42,
          wrist: 'straight',
          heelDrop: 0.022,
        }),
        0.04,
        0.008,
        'ak-wood',
      ),
      surface('ak-wood'),
    ),
  );
  root.add(partBox('gun-steel', [0.04, 0.108, 0.006], [0, -0.074, 0.422], [0.03, 0, 0]));
  addSportingTriggerGuard(root);
  root.add(
    new THREE.Mesh(
      fromSideProfile(magazineBoxShape(), 0.02, 0.002, 'steel-dark'),
      surface('steel-dark'),
    ),
  );

  // Hexagonal-looking receiver ring, open-top receiver, split rear bridge.
  root.add(barrelCyl('steel-dark', 0.0185, 0.0185, 0.055, [0, BORE_Y, -0.082], 6));
  root.add(partBox('steel-dark', [0.034, 0.018, 0.15], [0, 0.007, 0.012]));
  root.add(partBox('steel-dark', [0.009, 0.024, 0.15], [-0.0135, BORE_Y - 0.004, 0.012]));

  // Bolt: body, knurled cocking knob, short handle bent downward on the right.
  const slide = new THREE.Group();
  slide.position.set(0, BORE_Y, 0);
  slide.add(barrelCyl('stainless-steel', 0.0092, 0.0092, 0.15, [0, 0, 0.03], 14));
  slide.add(barrelCyl('steel-dark', 0.0115, 0.0115, 0.02, [0, 0, 0.118], 14));
  slide.add(partBox('stainless-steel', [0.012, 0.016, 0.014], [0.012, 0.004, 0.058]));
  slide.add(partBox('stainless-steel', [0.008, 0.034, 0.009], [0.024, -0.012, 0.058], [0, 0, 0.5]));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 14, 12), surface('stainless-steel'));
  knob.position.set(0.033, -0.03, 0.058);
  slide.add(knob);
  root.add(slide);

  // Rear sight base, handguard, two barrel bands, nose cap.
  root.add(partBox('steel-dark', [0.022, 0.014, 0.07], [0, BORE_Y + 0.02, -0.16]));
  root.add(barrelCyl('ak-wood', 0.016, 0.0175, 0.33, [0, BORE_Y + 0.005, -0.375], 14));
  root.add(partBox('gun-steel', [0.043, 0.05, 0.012], [0, 0.006, -0.33]));
  root.add(partBox('gun-steel', [0.042, 0.048, 0.012], [0, 0.007, -0.51]));
  root.add(partBox('gun-steel', [0.04, 0.044, 0.018], [0, 0.008, -0.556]));

  // Long barrel, cleaning rod, globe front sight.
  root.add(barrelCyl('steel-dark', 0.0076, 0.0098, 0.72, [0, BORE_Y, -0.45], 16));
  root.add(barrelCyl('polymer-black', 0.0042, 0.0042, 0.004, [0, BORE_Y, -0.811], 12));
  root.add(barrelCyl('gun-steel', 0.0028, 0.0028, 0.2, [0, 0.002, -0.66], 8));
  root.add(partBox('steel-dark', [0.012, 0.016, 0.022], [0, BORE_Y + 0.014, -0.776]));
  const globe = new THREE.Mesh(
    new THREE.TorusGeometry(0.0092, 0.002, 8, 20),
    surface('steel-dark'),
  );
  globe.position.set(0, SIGHT_Y - 0.002, -0.776);
  root.add(globe);
  root.add(partBox('steel-dark', [0.0022, 0.012, 0.0026], [0, SIGHT_Y - 0.006, -0.776]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0006, -0.776);
  root.add(tip);

  // Tangent rear sight leaf stays on the rifle with or without a scope.
  root.add(partBox('steel-dark', [0.018, 0.004, 0.066], [0, SIGHT_Y - 0.01, -0.16], [0.04, 0, 0]));

  let sightY = SIGHT_Y;
  let sightZ = -0.134;
  // The eye sits well behind the bolt so the receiver bridge does not fill the view.
  let aimDistance = 0.33;
  if (opticId === 'irons') {
    root.add(partBox('steel-dark', [0.007, 0.01, 0.01], [-0.006, SIGHT_Y - 0.003, -0.13]));
    root.add(partBox('steel-dark', [0.007, 0.01, 0.01], [0.006, SIGHT_Y - 0.003, -0.13]));
  } else {
    // Side-plate mount on the left of the receiver carrying a rail over the action.
    root.add(partBox('gun-steel', [0.006, 0.03, 0.11], [-0.021, BORE_Y + 0.002, 0.0]));
    root.add(partBox('gun-steel', [0.012, 0.04, 0.03], [-0.018, BORE_Y + 0.03, -0.04]));
    root.add(partBox('gun-steel', [0.012, 0.04, 0.03], [-0.018, BORE_Y + 0.03, 0.04]));
    root.add(partBox('gun-steel', [0.03, 0.006, 0.12], [-0.006, BORE_Y + 0.05, 0.0]));
    buildPicatinnyRail(root, BORE_Y + 0.052, -0.07, 0.07, 'gun-steel');
    const mounted = buildMountedOptic(root, opticId, BORE_Y + 0.058, -0.01);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Five rimmed rounds on a stripper clip, shown above the open action during a reload.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.008, -0.02);
  const brass = brassMaterial();
  for (let i = 0; i < 5; i++) {
    magazine.add(barrelCyl(brass, 0.0042, 0.0062, 0.068, [0, -0.02 + i * 0.0105, 0], 8));
  }
  magazine.add(partBox('gun-steel', [0.004, 0.056, 0.008], [0, 0.002, 0.035]));
  root.add(magazine);

  const hands = sportingGripAnchors(root, 'straight');
  const supportAnchor = underHandguardAnchor(root, [0, -0.008, -0.26]);
  const boltHand = anchor(slide, [0.033, -0.03, 0.058], [0.22, -0.35, -0.32]);
  const magazineHand = anchor(magazine, [0, 0.0, 0.03], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.814]);
  const ejection = anchor(root, [0.02, BORE_Y + 0.012, -0.02]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: hands.grip, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger: hands.trigger,
    support: { anchor: supportAnchor, size: [0.044, 0.046], thumb: 'alongside' },
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
      position: new THREE.Vector3(0.165, -0.165, -0.26),
      rotation: new THREE.Euler(0.016, -0.042, -0.022),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.68, slideRelease: 0.88 },
  };
}
