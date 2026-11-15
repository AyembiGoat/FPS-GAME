import type { SurfaceMaterial } from '../../core/map';
import type { WeaponId } from '../../core/weapon';
import type { Bus, Engine } from './engine';

/**
 * Multi-layered tactical sound synthesis for all 8 calibers, optics turret clicks,
 * weapon-specific reload choreography, steel plate gongs, and Shoot House acoustics.
 */

const SPEED_OF_SOUND = 343;

/** Quieter with distance, and never louder than at arm's length. */
const falloff = (distance: number) => 1 / (1 + distance * 0.12);

/**
 * Two hard metallic parts meeting: transient click + two inharmonic narrow resonances.
 */
function clack(
  engine: Engine,
  bus: Bus,
  at: number,
  options: { pitch: number; level: number; length?: number; pan?: number },
) {
  const pitch = engine.vary(options.pitch, 0.045);
  const length = options.length ?? 0.032;
  const pan = options.pan;
  engine.noise(bus, at, {
    filter: 'highpass',
    from: pitch * 1.65,
    level: options.level * 0.72,
    decay: 0.011,
    ...(pan !== undefined && { pan }),
  });
  engine.noise(bus, at, {
    filter: 'bandpass',
    from: pitch,
    q: 9.5,
    level: options.level,
    decay: length,
    ...(pan !== undefined && { pan }),
  });
  engine.noise(bus, at, {
    filter: 'bandpass',
    from: pitch * 2.34,
    q: 7,
    level: options.level * 0.45,
    decay: length * 0.62,
    ...(pan !== undefined && { pan }),
  });
}

/** Stereo early concrete wall slapback reflection — sells the open-air Shoot House space! */
function wallSlap(engine: Engine, at: number, level: number, brightness = 1650) {
  const leftFirst = Math.random() < 0.5;
  const t1 = at + engine.vary(0.052, 0.12);
  const t2 = at + engine.vary(0.088, 0.12);
  engine.noise('weapon', t1, {
    filter: 'bandpass',
    from: engine.vary(brightness, 0.12),
    to: brightness * 0.45,
    q: 0.9,
    level: level * 0.24,
    attack: 0.004,
    decay: 0.13,
    pan: leftFirst ? -0.45 : 0.45,
  });
  engine.noise('weapon', t2, {
    filter: 'bandpass',
    from: engine.vary(brightness * 0.72, 0.12),
    to: brightness * 0.3,
    q: 0.85,
    level: level * 0.18,
    attack: 0.005,
    decay: 0.17,
    pan: leftFirst ? 0.52 : -0.52,
  });
}

/** Fabric / gear handling rustle: soft, unpitched. */
function rustle(engine: Engine, at: number, level: number, length: number) {
  engine.noise('handling', at, {
    filter: 'bandpass',
    from: engine.vary(1450, 0.18),
    to: 860,
    q: 0.55,
    level,
    attack: length * 0.38,
    decay: length * 0.62,
  });
}

/** One gun's report, as the settings of the five layers `shot` is built from. */
interface ShotVoice {
  /** Muzzle crack: [high-pass frequency, level, decay]. */
  readonly crack: readonly [number, number, number];
  /** Pressure body: [from, to, q, level, decay]. */
  readonly body: readonly [number, number, number, number, number];
  /** Air tail: [from, to, level, decay]. */
  readonly tail: readonly [number, number, number, number];
  /** Chest thump: [from, to, level, decay]. */
  readonly thump: readonly [number, number, number, number];
  /** Parts moving after the shot: [delay, pitch, level, length]. */
  readonly action: readonly (readonly [number, number, number, number])[];
  /** Echo off the walls: [level, brightness]. */
  readonly slap: readonly [number, number];
}

/** The guns added with the survival arsenal. Each differs by calibre, barrel and action. */
const SHOT_VOICES: Partial<Record<WeaponId, ShotVoice>> = {
  // 5.56 from a 20-inch barrel: the brightest crack of the rifles, buffer spring twang.
  m16a4: {
    crack: [3800, 0.96, 0.018],
    body: [1950, 520, 1.1, 0.86, 0.09],
    tail: [8800, 720, 0.8, 0.15],
    thump: [220, 58, 0.68, 0.09],
    action: [
      [0.034, 2700, 0.11, 0.026],
      [0.06, 3400, 0.05, 0.03],
    ],
    slap: [0.82, 1900],
  },
  // Bullpup: the action cycles beside the ear.
  'aug-a3': {
    crack: [3500, 0.92, 0.018],
    body: [1750, 470, 1.15, 0.88, 0.095],
    tail: [8200, 650, 0.82, 0.15],
    thump: [205, 54, 0.72, 0.095],
    action: [[0.03, 2500, 0.15, 0.028]],
    slap: [0.8, 1750],
  },
  // .45 ACP, subsonic: a dull heavy knock with a slow bolt.
  ump45: {
    crack: [1900, 0.7, 0.022],
    body: [980, 300, 1.2, 0.9, 0.1],
    tail: [5200, 420, 0.8, 0.14],
    thump: [150, 44, 0.8, 0.11],
    action: [[0.03, 1500, 0.14, 0.035]],
    slap: [0.7, 1300],
  },
  // .45 ACP at 1,100 rounds a minute: short and tight so the shots do not smear.
  vector: {
    crack: [2300, 0.76, 0.016],
    body: [1150, 340, 1.3, 0.86, 0.075],
    tail: [6000, 480, 0.74, 0.11],
    thump: [170, 50, 0.7, 0.08],
    action: [[0.02, 2100, 0.1, 0.02]],
    slap: [0.68, 1450],
  },
  // 12 gauge with a self-loading Kalashnikov action: the boom, then two beats of the carrier.
  'saiga-12': {
    crack: [2000, 0.9, 0.03],
    body: [800, 190, 0.9, 1.05, 0.17],
    tail: [5600, 300, 1.0, 0.26],
    thump: [120, 30, 1.0, 0.2],
    action: [
      [0.03, 1400, 0.16, 0.04],
      [0.065, 2000, 0.15, 0.045],
    ],
    slap: [1.0, 1250],
  },
  // 7.62×39 from a long barrel: the AK's bark with a heavier milled action.
  sks: {
    crack: [2550, 0.84, 0.024],
    body: [1220, 320, 1.2, 0.95, 0.12],
    tail: [7000, 450, 0.9, 0.19],
    thump: [160, 40, 0.88, 0.14],
    action: [
      [0.028, 1700, 0.14, 0.034],
      [0.058, 2400, 0.12, 0.036],
    ],
    slap: [0.92, 1500],
  },
  // 5.56 with a Garand-style operating rod slapping home.
  'mini-14': {
    crack: [3650, 0.94, 0.018],
    body: [1900, 500, 1.1, 0.86, 0.09],
    tail: [8600, 700, 0.8, 0.15],
    thump: [215, 56, 0.7, 0.09],
    action: [
      [0.03, 2300, 0.13, 0.03],
      [0.055, 3000, 0.08, 0.03],
    ],
    slap: [0.82, 1850],
  },
  // 7.92×57 full-power rifle round, then the bolt: lift, pull, push, lock.
  kar98k: {
    crack: [3400, 1.0, 0.03],
    body: [1300, 210, 0.95, 1.04, 0.2],
    tail: [8600, 280, 1.0, 0.33],
    thump: [110, 28, 1.0, 0.23],
    action: [
      [0.2, 1900, 0.14, 0.04],
      [0.3, 1500, 0.16, 0.05],
      [0.5, 1700, 0.16, 0.05],
      [0.68, 2300, 0.15, 0.04],
    ],
    slap: [1.05, 1500],
  },
  // 7.62×54R from a 73 cm barrel: a touch deeper and longer, with a stiffer bolt.
  'mosin-nagant': {
    crack: [3300, 1.0, 0.032],
    body: [1250, 200, 0.95, 1.05, 0.21],
    tail: [8400, 270, 1.0, 0.35],
    thump: [104, 26, 1.02, 0.24],
    action: [
      [0.2, 1700, 0.15, 0.045],
      [0.3, 1350, 0.17, 0.055],
      [0.5, 1550, 0.17, 0.055],
      [0.68, 2100, 0.16, 0.04],
    ],
    slap: [1.05, 1450],
  },
  // 7.62×54R machine gun firing from an open bolt: a heavy thud before and after each round.
  'dp-28': {
    crack: [2900, 0.9, 0.026],
    body: [1200, 260, 1.0, 1.0, 0.14],
    tail: [7600, 380, 0.96, 0.22],
    thump: [135, 34, 0.95, 0.16],
    action: [
      [0.03, 1300, 0.16, 0.04],
      [0.07, 1800, 0.1, 0.04],
    ],
    slap: [0.98, 1400],
  },
  // 9×19 pistol: lighter and sharper than the .45.
  'beretta-92fs': {
    crack: [2700, 0.78, 0.016],
    body: [1500, 420, 1.2, 0.8, 0.07],
    tail: [7000, 560, 0.68, 0.1],
    thump: [200, 60, 0.58, 0.07],
    action: [[0.026, 2600, 0.12, 0.024]],
    slap: [0.64, 1700],
  },
};

function voicedShot(engine: Engine, voice: ShotVoice, now: number) {
  const [crackFrom, crackLevel, crackDecay] = voice.crack;
  engine.noise('weapon', now, {
    filter: 'highpass',
    from: engine.vary(crackFrom, 0.06),
    level: crackLevel,
    attack: 0.0006,
    decay: crackDecay,
  });
  const [bodyFrom, bodyTo, bodyQ, bodyLevel, bodyDecay] = voice.body;
  engine.noise('weapon', now, {
    filter: 'bandpass',
    from: engine.vary(bodyFrom, 0.07),
    to: bodyTo,
    q: bodyQ,
    level: bodyLevel,
    decay: bodyDecay,
  });
  const [tailFrom, tailTo, tailLevel, tailDecay] = voice.tail;
  engine.noise('weapon', now, {
    filter: 'lowpass',
    from: engine.vary(tailFrom, 0.07),
    to: tailTo,
    level: tailLevel,
    decay: tailDecay,
  });
  const [thumpFrom, thumpTo, thumpLevel, thumpDecay] = voice.thump;
  engine.tone('weapon', now, {
    type: 'triangle',
    from: engine.vary(thumpFrom, 0.06),
    to: thumpTo,
    level: thumpLevel,
    decay: thumpDecay,
  });
  for (const [delay, pitch, level, length] of voice.action) {
    // Anything later than a tenth of a second is the shooter working the gun by hand.
    clack(engine, delay > 0.1 ? 'handling' : 'weapon', now + delay, { pitch, level, length });
  }
  wallSlap(engine, now, voice.slap[0], voice.slap[1]);
}

/**
 * A shot through a suppressor: the muzzle blast is gone, leaving a short low cough, the
 * action, and (for rifle rounds) a faint crack from the bullet itself. About a third as
 * loud as the same gun unsuppressed.
 */
export function suppressedShot(engine: Engine, weaponId: WeaponId = 'm1911') {
  const now = engine.now();
  const voice = SHOT_VOICES[weaponId];
  const supersonic = voice ? voice.crack[0] >= 2500 : weaponId !== 'm1911' && weaponId !== 'mp5';
  engine.noise('weapon', now, {
    filter: 'bandpass',
    from: engine.vary(980, 0.08),
    to: 300,
    q: 0.8,
    level: 0.34,
    attack: 0.002,
    decay: 0.06,
  });
  engine.noise('weapon', now, {
    filter: 'lowpass',
    from: engine.vary(2600, 0.08),
    to: 320,
    level: 0.3,
    attack: 0.002,
    decay: 0.1,
  });
  engine.tone('weapon', now, {
    type: 'triangle',
    from: engine.vary(132, 0.06),
    to: 52,
    level: 0.24,
    decay: 0.07,
  });
  if (supersonic) {
    engine.noise('weapon', now, {
      filter: 'highpass',
      from: engine.vary(4200, 0.06),
      level: 0.16,
      attack: 0.0006,
      decay: 0.012,
    });
  }
  const actions = voice?.action ?? [[0.036, 2400, 0.11, 0.03] as const];
  for (const [delay, pitch, level, length] of actions) {
    clack(engine, delay > 0.1 ? 'handling' : 'weapon', now + delay, { pitch, level, length });
  }
  wallSlap(engine, now, 0.12, 1100);
}

/**
 * 5-layer gunshot synthesizer tailored to every firearm's caliber, barrel length,
 * muzzle device, and bolt/piston/pump mechanics:
 *   1. Supersonic muzzle crack / whip transient
 *   2. Propellant chamber pressure explosion (resonant downward sweep)
 *   3. Sub-bass chest thump (pitched triangle/sine drop)
 *   4. Signature mechanical action sound (bolt/piston/slide/pump/bolt-cycle)
 *   5. Stereo outdoor concrete wall slapback
 */
export function shot(engine: Engine, weaponId: WeaponId = 'm1911') {
  const now = engine.now();
  const voice = SHOT_VOICES[weaponId];
  if (voice) {
    voicedShot(engine, voice, now);
    return;
  }

  switch (weaponId) {
    case 'hk416': {
      // 5.56×45mm NATO carbine: sharp supersonic whip, punchy mid snap, crisp gas-piston bolt!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(3600, 0.06),
        level: 0.95,
        attack: 0.0006,
        decay: 0.018,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1850, 0.07),
        to: 480,
        q: 1.1,
        level: 0.88,
        decay: 0.095,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(8600, 0.07),
        to: 680,
        level: 0.82,
        decay: 0.15,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(210, 0.06),
        to: 54,
        level: 0.72,
        decay: 0.095,
      });
      // Crisp short-stroke piston + aluminum receiver bolt snap.
      clack(engine, 'weapon', now + 0.032, { pitch: 2880, level: 0.12, length: 0.026 });
      wallSlap(engine, now, 0.82, 1850);
      break;
    }

    case 'ak47': {
      // 7.62×39mm Kalashnikov: throaty metallic bark, deep chest knock, stamped-steel bolt rattle!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(2450, 0.07),
        level: 0.82,
        attack: 0.0007,
        decay: 0.024,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1180, 0.08),
        to: 310,
        q: 1.25,
        level: 0.96,
        decay: 0.12,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(6800, 0.08),
        to: 440,
        level: 0.92,
        decay: 0.19,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(156, 0.06),
        to: 39,
        level: 0.9,
        decay: 0.145,
      });
      // Iconic twin-beat AK long-stroke bolt carrier + stamped dust-cover metallic clatter.
      clack(engine, 'weapon', now + 0.024, { pitch: 1540, level: 0.15, length: 0.036 });
      clack(engine, 'weapon', now + 0.056, { pitch: 2220, level: 0.16, length: 0.044 });
      wallSlap(engine, now, 0.92, 1450);
      break;
    }

    case 'scar-h': {
      // 7.62×51mm NATO battle rifle: concussive PWS brake side-blast + thunderous low-mid boom!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(3100, 0.06),
        level: 0.98,
        attack: 0.0006,
        decay: 0.028,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1450, 0.07),
        to: 280,
        q: 1.0,
        level: 1.0,
        decay: 0.14,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(8200, 0.07),
        to: 380,
        level: 0.96,
        decay: 0.23,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(134, 0.05),
        to: 35,
        level: 0.94,
        decay: 0.17,
      });
      // Heavy reciprocating steel SCAR bolt carrier slam.
      clack(engine, 'weapon', now + 0.046, { pitch: 2050, level: 0.15, length: 0.042 });
      wallSlap(engine, now, 1.0, 1550);
      break;
    }

    case 'mp5': {
      // 9×19mm SMG: tight, punchy sub-carbine pop, crisp high roller-delayed mechanical zip.
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(3300, 0.08),
        level: 0.78,
        attack: 0.0006,
        decay: 0.015,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(2200, 0.08),
        to: 720,
        q: 1.15,
        level: 0.82,
        decay: 0.07,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7000, 0.09),
        to: 880,
        level: 0.78,
        decay: 0.095,
      });
      engine.tone('weapon', now, {
        type: 'sine',
        from: engine.vary(240, 0.07),
        to: 76,
        level: 0.68,
        decay: 0.075,
      });
      clack(engine, 'weapon', now + 0.028, { pitch: 3100, level: 0.11, length: 0.022 });
      wallSlap(engine, now, 0.56, 2100);
      break;
    }

    case 'remington-870': {
      // 12-gauge 00 Buckshot: massive broad-spectrum chest blast + crisp twin-stroke pump rack!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(1950, 0.07),
        level: 0.92,
        attack: 0.0008,
        decay: 0.036,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(950, 0.07),
        to: 190,
        q: 0.85,
        level: 1.05,
        decay: 0.19,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(6400, 0.07),
        to: 270,
        level: 1.0,
        decay: 0.28,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(114, 0.05),
        to: 29,
        level: 1.0,
        decay: 0.22,
      });
      wallSlap(engine, now, 1.05, 1250);
      // Iconic two-stroke pump forend rack timed cleanly to the animation (`0.22s` & `0.40s`)!
      clack(engine, 'handling', now + 0.22, { pitch: 1580, level: 0.16, length: 0.052 });
      engine.noise('handling', now + 0.23, {
        filter: 'bandpass',
        from: 2400,
        to: 1350,
        q: 1.6,
        level: 0.09,
        decay: 0.09,
      });
      clack(engine, 'handling', now + 0.41, { pitch: 2220, level: 0.2, length: 0.048 });
      engine.noise('handling', now + 0.41, {
        filter: 'lowpass',
        from: 360,
        level: 0.16,
        decay: 0.04,
      });
      break;
    }

    case 'awm': {
      // .338 Lapua Magnum: supersonic crack whip + cannon pressure boom + 4-stage precision bolt!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(3900, 0.05),
        level: 1.02,
        attack: 0.0005,
        decay: 0.034,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1350, 0.06),
        to: 185,
        q: 0.9,
        level: 1.08,
        decay: 0.24,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(9000, 0.06),
        to: 240,
        level: 1.05,
        decay: 0.4,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(98, 0.04),
        to: 25,
        level: 1.04,
        decay: 0.27,
      });
      wallSlap(engine, now, 1.15, 1380);
      // 4-stage precision steel bolt choreography synced with right-hand animation:
      // 0.24s unlock lift -> 0.37s smooth pull back -> 0.59s push forward -> 0.74s lock down!
      clack(engine, 'handling', now + 0.24, { pitch: 2780, level: 0.11, length: 0.026 });
      clack(engine, 'handling', now + 0.37, { pitch: 1820, level: 0.13, length: 0.048 });
      engine.noise('handling', now + 0.38, {
        filter: 'bandpass',
        from: 2900,
        to: 1800,
        q: 2.2,
        level: 0.07,
        decay: 0.09,
      });
      clack(engine, 'handling', now + 0.6, { pitch: 2050, level: 0.14, length: 0.042 });
      clack(engine, 'handling', now + 0.74, { pitch: 2950, level: 0.13, length: 0.025 });
      break;
    }

    case 'desert-eagle': {
      // .50 Action Express hand cannon: explosive blast + deep thud + heavy stainless slide slam!
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(2400, 0.06),
        level: 0.94,
        attack: 0.0006,
        decay: 0.03,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1250, 0.07),
        to: 260,
        q: 1.05,
        level: 1.0,
        decay: 0.14,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7400, 0.07),
        to: 360,
        level: 0.96,
        decay: 0.22,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(132, 0.05),
        to: 35,
        level: 0.94,
        decay: 0.17,
      });
      clack(engine, 'weapon', now + 0.054, { pitch: 1880, level: 0.16, length: 0.046 });
      wallSlap(engine, now, 0.96, 1500);
      break;
    }

    case 'm1911':
    default: {
      // Classic .45 ACP service pistol: authoritative bark, warm low punch, steel slide snap.
      engine.noise('weapon', now, {
        filter: 'highpass',
        from: engine.vary(2850, 0.07),
        level: 0.72,
        attack: 0.0006,
        decay: 0.022,
      });
      engine.noise('weapon', now, {
        filter: 'bandpass',
        from: engine.vary(1650, 0.08),
        to: 440,
        q: 1.05,
        level: 0.72,
        decay: 0.09,
      });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7600, 0.09),
        to: 580,
        level: 0.74,
        decay: 0.15,
      });
      engine.tone('weapon', now, {
        type: 'triangle',
        from: engine.vary(172, 0.06),
        to: 46,
        level: 0.68,
        decay: 0.12,
      });
      clack(engine, 'weapon', now + 0.042, { pitch: 2380, level: 0.11, length: 0.03 });
      wallSlap(engine, now, 0.62, 1750);
      break;
    }
  }
}

/** Caliber-appropriate spent casing / shotgun hull bouncing on concrete. */
export function casing(engine: Engine, weaponId: WeaponId = 'm1911') {
  if (weaponId === 'remington-870' || weaponId === 'saiga-12') {
    // Hollow plastic & brass 12-gauge hull clattering on concrete (later for the pump gun).
    const at = engine.now() + engine.vary(weaponId === 'saiga-12' ? 0.5 : 0.76, 0.1);
    for (const [delay, level] of [
      [0, 0.055],
      [0.11, 0.035],
      [0.19, 0.018],
    ] as const) {
      engine.noise('handling', at + delay, {
        filter: 'bandpass',
        from: engine.vary(1150, 0.12),
        q: 3.5,
        level,
        decay: 0.032,
        pan: 0.45,
      });
      engine.tone('handling', at + delay, {
        from: engine.vary(2450, 0.1),
        level: level * 0.45,
        decay: 0.038,
        pan: 0.45,
      });
    }
    return;
  }

  const boltAction = weaponId === 'awm' || weaponId === 'kar98k' || weaponId === 'mosin-nagant';
  const baseDelay = boltAction ? 0.88 : 0.5;
  const basePitch =
    boltAction || weaponId === 'dp-28'
      ? 3150
      : weaponId === 'scar-h' ||
          weaponId === 'ak47' ||
          weaponId === 'desert-eagle' ||
          weaponId === 'sks'
        ? 3650
        : 4350;

  const at = engine.now() + engine.vary(baseDelay, 0.12);
  const pitch = engine.vary(basePitch, 0.1);
  for (const [delay, level] of [
    [0, 0.048],
    [0.088, 0.03],
    [0.148, 0.015],
  ] as const) {
    engine.tone('handling', at + delay, { from: pitch, level, decay: 0.072, pan: 0.5 });
    engine.tone('handling', at + delay, {
      from: pitch * 1.49,
      level: level * 0.62,
      decay: 0.048,
      pan: 0.5,
    });
  }
}

/**
 * AR500 hardened steel target gong: crisp high-velocity lead splash, complex inharmonic
 * steel ring, and heavy steel hinge knock as the plate falls!
 */
export function steel(engine: Engine, distance: number, pan: number) {
  const at = engine.now() + distance / SPEED_OF_SOUND;
  const level = falloff(distance);
  const tune = engine.vary(1, 0.035);

  // Initial supersonic bullet jacket splatter against steel face.
  engine.noise('world', at, {
    filter: 'bandpass',
    from: engine.vary(4400, 0.08),
    to: 2200,
    q: 1.8,
    level: 0.56 * level,
    decay: 0.028,
    pan,
  });
  // Solid mid-low steel plate body punch.
  engine.tone('world', at, {
    type: 'triangle',
    from: 410 * tune,
    to: 360 * tune,
    level: 0.18 * level,
    decay: 0.16,
    pan,
  });
  // Authentic AR500 inharmonic metallic ring partials.
  for (const [pitch, loudness, decay] of [
    [1890, 0.18, 0.85],
    [2974, 0.15, 0.52],
    [4682, 0.09, 0.3],
    [6540, 0.055, 0.16],
  ] as const) {
    engine.tone('world', at, { from: pitch * tune, level: loudness * level, decay, pan });
  }
  // Delayed steel hinge knock as the target tips backward onto its stop!
  clack(engine, 'world', at + 0.22, {
    pitch: 920,
    level: 0.14 * level,
    length: 0.055,
    pan,
  });
}

export function impact(engine: Engine, distance: number, surface: SurfaceMaterial, pan: number) {
  const at = engine.now() + distance / SPEED_OF_SOUND;
  const level = falloff(distance);
  if (surface === 'plywood' || surface === 'crate' || surface === 'timber') {
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(surface === 'timber' ? 420 : 540, 0.15),
      q: 2.8,
      level: 0.48 * level,
      decay: 0.095,
      pan,
    });
    engine.noise('world', at, {
      filter: 'highpass',
      from: 2600,
      level: 0.14 * level,
      decay: 0.032,
      pan,
    });
  } else if (surface === 'container' || surface === 'container-red' || surface === 'steel') {
    engine.tone('world', at, {
      type: 'triangle',
      from: engine.vary(310, 0.1),
      to: 175,
      level: 0.28 * level,
      decay: 0.26,
      pan,
    });
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(1680, 0.15),
      q: 4.5,
      level: 0.44 * level,
      decay: 0.15,
      pan,
    });
  } else {
    // Concrete/floor: sharp stone chip crack + falling masonry grit.
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(2250, 0.15),
      q: 1.1,
      level: 0.44 * level,
      decay: 0.048,
      pan,
    });
    engine.noise('world', at + 0.028, {
      filter: 'highpass',
      from: 4600,
      level: 0.065 * level,
      attack: 0.018,
      decay: 0.17,
      pan,
    });
  }
}

export function dryFire(engine: Engine) {
  clack(engine, 'handling', engine.now(), { pitch: 3150, level: 0.22, length: 0.018 });
}

/** Precision mechanical scope throw-lever / magnification turret detent click (`V`). */
export function zoomClick(engine: Engine) {
  const now = engine.now();
  clack(engine, 'handling', now, { pitch: 2950, level: 0.16, length: 0.018 });
  engine.tone('handling', now + 0.008, {
    from: 1380,
    to: 980,
    level: 0.055,
    decay: 0.022,
  });
}

/**
 * Reload foley synchronized to the weapon model's exact beat fractions, with
 * distinct steel/polymer/shotgun textures per firearm!
 */
export function reload(
  engine: Engine,
  duration: number,
  beats: { magazineOut: number; magazineIn: number; slideRelease: number },
  empty: boolean,
  weaponId: WeaponId = 'm1911',
) {
  const now = engine.now();
  const out = now + duration * beats.magazineOut;
  const seat = now + duration * beats.magazineIn;
  const release = now + duration * beats.slideRelease;

  rustle(engine, now, 0.052, 0.22);

  if (weaponId === 'remington-870') {
    // Individual 12-gauge shells thumbed briskly up into the under-barrel tubular magazine!
    const shellCount = 4;
    const span = seat - out;
    for (let i = 0; i < shellCount; i++) {
      const t = out + (span * i) / shellCount;
      clack(engine, 'handling', t, { pitch: 1850 + i * 95, level: 0.085, length: 0.028 });
      engine.noise('handling', t + 0.02, {
        filter: 'lowpass',
        from: 420,
        level: 0.09,
        decay: 0.03,
      });
    }
    if (empty) {
      clack(engine, 'handling', release - 0.05, { pitch: 1620, level: 0.11, length: 0.042 });
      clack(engine, 'handling', release + 0.04, { pitch: 2240, level: 0.14, length: 0.042 });
    }
    rustle(engine, release + 0.05, 0.04, 0.2);
    return;
  }

  if (
    weaponId === 'kar98k' ||
    weaponId === 'mosin-nagant' ||
    (weaponId === 'sks' && beats.magazineIn > beats.magazineOut)
  ) {
    // Stripper clip: the bolt is drawn back, the clip is set in its guide, the rounds are
    // thumbed down into the magazine in one push, and closing the bolt throws the clip clear.
    const boltGun = weaponId !== 'sks';
    clack(engine, 'handling', now + 0.1, {
      pitch: boltGun ? 1500 : 1750,
      level: 0.1,
      length: 0.04,
    });
    clack(engine, 'handling', now + 0.2, {
      pitch: boltGun ? 1180 : 1420,
      level: 0.12,
      length: 0.05,
    });
    clack(engine, 'handling', out, { pitch: 3350, level: 0.07, length: 0.02 });
    const rounds = boltGun ? 5 : 6;
    const span = Math.max(0.2, seat - out - 0.08);
    for (let i = 0; i < rounds; i++) {
      const t = out + 0.08 + (span * i) / rounds;
      clack(engine, 'handling', t, { pitch: 2150 - i * 70, level: 0.06, length: 0.02 });
      engine.noise('handling', t + 0.012, {
        filter: 'bandpass',
        from: 1500,
        q: 1.1,
        level: 0.04,
        decay: 0.03,
      });
    }
    engine.noise('handling', seat, { filter: 'lowpass', from: 300, level: 0.11, decay: 0.04 });
    clack(engine, 'handling', release - 0.03, { pitch: 3900, level: 0.06, length: 0.03 });
    clack(engine, 'handling', release, { pitch: boltGun ? 1320 : 1650, level: 0.13, length: 0.05 });
    if (boltGun) {
      clack(engine, 'handling', release + 0.09, { pitch: 1900, level: 0.1, length: 0.035 });
    }
    rustle(engine, release + 0.06, 0.042, 0.2);
    return;
  }

  if (weaponId === 'dp-28') {
    // Pan magazine: latch thumbed back, the empty pan lifted off the receiver, a full pan set
    // down on the post and pressed until the latch snaps, then the charging handle is drawn.
    clack(engine, 'handling', out - 0.05, { pitch: 2400, level: 0.08, length: 0.025 });
    engine.noise('handling', out, {
      filter: 'bandpass',
      from: 900,
      to: 1500,
      q: 0.9,
      level: 0.07,
      attack: 0.02,
      decay: 0.14,
    });
    clack(engine, 'handling', out + 0.03, { pitch: 760, level: 0.09, length: 0.09 });
    rustle(engine, out + 0.3, 0.05, 0.36);
    clack(engine, 'handling', seat - 0.06, { pitch: 820, level: 0.1, length: 0.1 });
    engine.noise('handling', seat, { filter: 'lowpass', from: 260, level: 0.17, decay: 0.05 });
    clack(engine, 'handling', seat + 0.02, { pitch: 1900, level: 0.12, length: 0.04 });
    clack(engine, 'handling', release, { pitch: 1250, level: 0.12, length: 0.05 });
    clack(engine, 'handling', release + 0.12, { pitch: 1480, level: 0.14, length: 0.055 });
    rustle(engine, release + 0.16, 0.045, 0.22);
    return;
  }

  const heavySteel =
    weaponId === 'ak47' ||
    weaponId === 'scar-h' ||
    weaponId === 'awm' ||
    weaponId === 'desert-eagle' ||
    weaponId === 'saiga-12' ||
    weaponId === 'mini-14' ||
    weaponId === 'sks';
  const magPitch = heavySteel ? 1320 : 1620;

  // Magazine release latch + mag sliding free of the magwell.
  clack(engine, 'handling', out, { pitch: heavySteel ? 2250 : 2750, level: 0.08, length: 0.022 });
  engine.noise('handling', out + 0.016, {
    filter: 'bandpass',
    from: 3100,
    to: 1750,
    q: 1.3,
    level: 0.048,
    attack: 0.02,
    decay: 0.11,
  });
  rustle(engine, out + 0.22, 0.04, 0.3);

  // Fresh mag insertion slide + firm palm slap seating click!
  engine.noise('handling', seat - 0.075, {
    filter: 'bandpass',
    from: 1950,
    to: 3100,
    q: 1.3,
    level: 0.048,
    attack: 0.04,
    decay: 0.045,
  });
  clack(engine, 'handling', seat, { pitch: magPitch, level: 0.105, length: 0.042 });
  engine.noise('handling', seat, { filter: 'lowpass', from: 320, level: 0.14, decay: 0.038 });

  if (empty) {
    // Bolt release slap / charging handle rack closing the breech!
    clack(engine, 'handling', release, { pitch: 2950, level: 0.075, length: 0.018 });
    clack(engine, 'handling', release + 0.03, {
      pitch: heavySteel ? 1680 : 2020,
      level: 0.125,
      length: 0.046,
    });
  }
  rustle(engine, release + 0.05, 0.042, 0.2);
}

/** Bringing the sights up or lowering them. */
export function aim(engine: Engine, up: boolean) {
  rustle(engine, engine.now(), up ? 0.055 : 0.038, 0.16);
}

/** Drawing or slinging a firearm when switching Primary <-> Secondary. */
export function weaponSwitch(engine: Engine) {
  const now = engine.now();
  rustle(engine, now, 0.065, 0.2);
  clack(engine, 'handling', now + 0.095, { pitch: 2280, level: 0.075, length: 0.03 });
}

export function footstep(engine: Engine, level: number, left: boolean) {
  const now = engine.now();
  const pan = left ? -0.14 : 0.14;
  engine.noise('world', now, {
    filter: 'lowpass',
    from: engine.vary(410, 0.24),
    level: 0.45 * level,
    attack: 0.003,
    decay: 0.068,
    pan,
  });
  engine.noise('world', now + 0.024, {
    filter: 'bandpass',
    from: engine.vary(3350, 0.28),
    q: 0.65,
    level: 0.075 * level,
    attack: 0.011,
    decay: 0.068,
    pan,
  });
}

export function land(engine: Engine, speed: number) {
  const now = engine.now();
  const level = Math.min(1, speed / 9);
  engine.tone('world', now, { from: 96, to: 48, level: 0.42 * level, decay: 0.125 });
  engine.noise('world', now, {
    filter: 'lowpass',
    from: 420,
    level: 0.34 * level,
    attack: 0.003,
    decay: 0.125,
  });
  rustle(engine, now, 0.065 * level, 0.2);
}

/** Light outdoor range wind slowly rising and falling. */
export function wind(engine: Engine) {
  engine.bed('ambience', 380, 0.028, 0.09);
}

/** Subtle damped detent tick when pointer or keyboard focus moves across menu items. */
export function uiHover(engine: Engine) {
  const now = engine.now();
  engine.noise('ui', now, {
    filter: 'bandpass',
    from: engine.vary(2050, 0.03),
    q: 5,
    level: 0.14,
    decay: 0.016,
  });
  engine.tone('ui', now, {
    from: 920,
    to: 720,
    level: 0.085,
    decay: 0.018,
  });
}

/** Crisp tactile switch click for selecting an option, switching tabs, or stepping a control. */
export function uiSelect(engine: Engine) {
  const now = engine.now();
  engine.noise('ui', now, {
    filter: 'bandpass',
    from: engine.vary(2450, 0.03),
    q: 8,
    level: 0.14,
    decay: 0.018,
  });
  engine.tone('ui', now + 0.004, {
    from: 640,
    to: 520,
    level: 0.085,
    decay: 0.032,
  });
}

/** Soft descending two-step release when backing out of a menu or closing an overlay. */
export function uiBack(engine: Engine) {
  const now = engine.now();
  engine.noise('ui', now, {
    filter: 'bandpass',
    from: 1450,
    q: 5,
    level: 0.12,
    decay: 0.02,
  });
  engine.tone('ui', now, {
    from: 520,
    to: 340,
    level: 0.115,
    decay: 0.052,
  });
}

/** Clean two-note confirmation chime when entering play, restarting, or clearing all targets. */
export function uiConfirm(engine: Engine) {
  const now = engine.now();
  engine.noise('ui', now, {
    filter: 'bandpass',
    from: 2700,
    q: 7,
    level: 0.12,
    decay: 0.016,
  });
  engine.tone('ui', now, {
    from: 587.33,
    level: 0.09,
    decay: 0.075,
  });
  engine.tone('ui', now + 0.038, {
    from: 880,
    level: 0.105,
    decay: 0.11,
  });
}

/**
 * Spatialized enemy gunfire: exterior muzzle report delayed by speed of sound, slightly
 * darker/more distant than the player's own first-person rifle, paired with a sharp
 * supersonic crack so incoming fire is immediately distinguishable and localizable.
 */
export function enemyShot(
  engine: Engine,
  distance: number,
  pan: number,
  weaponId: WeaponId = 'hk416',
) {
  const crackAt = engine.now() + Math.min(0.06, distance / 820);
  const reportAt = engine.now() + distance / SPEED_OF_SOUND;
  const atten = falloff(Math.max(3, distance));
  const heavy =
    weaponId === 'scar-h' ||
    weaponId === 'ak47' ||
    weaponId === 'remington-870' ||
    weaponId === 'saiga-12' ||
    weaponId === 'sks' ||
    weaponId === 'kar98k' ||
    weaponId === 'mosin-nagant' ||
    weaponId === 'dp-28';

  // Supersonic passing snap/crack
  engine.noise('world', crackAt, {
    filter: 'bandpass',
    from: engine.vary(3200, 0.09),
    to: 1450,
    q: 1.9,
    level: 0.44 * atten,
    attack: 0.0006,
    decay: 0.026,
    pan,
  });

  // Exterior muzzle report body
  engine.noise('world', reportAt, {
    filter: 'lowpass',
    from: engine.vary(heavy ? 3600 : 4400, 0.08),
    to: 340,
    level: (heavy ? 0.85 : 0.7) * atten,
    attack: 0.001,
    decay: heavy ? 0.22 : 0.17,
    pan,
  });
  engine.tone('world', reportAt, {
    type: 'triangle',
    from: engine.vary(heavy ? 128 : 158, 0.06),
    to: 44,
    level: (heavy ? 0.68 : 0.54) * atten,
    decay: 0.14,
    pan,
  });
}

/**
 * Tactile hit confirmation when the player's round strikes an enemy combatant:
 * heavy kevlar/plate thump for torso/legs, or crisp ballistic helmet ring + snap on headshots.
 */
export function enemyHit(engine: Engine, distance: number, pan: number, headshot: boolean) {
  const at = engine.now() + Math.min(0.04, distance / SPEED_OF_SOUND);
  const level = Math.max(0.45, falloff(Math.max(4, distance * 0.55)));

  // Solid kevlar / ballistic plate thump
  engine.tone('world', at, {
    type: 'triangle',
    from: engine.vary(235, 0.05),
    to: 72,
    level: 0.34 * level,
    decay: 0.075,
    pan,
  });
  engine.noise('world', at, {
    filter: 'bandpass',
    from: engine.vary(1850, 0.08),
    to: 780,
    q: 1.6,
    level: 0.28 * level,
    decay: 0.045,
    pan,
  });

  if (headshot) {
    // Crisp high-cut ballistic helmet impact ring
    engine.tone('world', at, {
      from: engine.vary(2420, 0.03),
      to: 2180,
      level: 0.24 * level,
      decay: 0.12,
      pan,
    });
    engine.noise('world', at, {
      filter: 'highpass',
      from: 3400,
      level: 0.22 * level,
      decay: 0.024,
      pan,
    });
  }
}

/** Grounded gear rattle + heavy body drop when an enemy combatant is neutralized. */
export function enemyDown(engine: Engine, distance: number, pan: number) {
  const at = engine.now() + Math.min(0.08, distance / SPEED_OF_SOUND) + 0.09;
  const level = Math.max(0.35, falloff(Math.max(4, distance * 0.65)));

  engine.tone('world', at, {
    from: 108,
    to: 44,
    level: 0.42 * level,
    decay: 0.16,
    pan,
  });
  engine.noise('world', at + 0.02, {
    filter: 'lowpass',
    from: 520,
    level: 0.3 * level,
    attack: 0.004,
    decay: 0.14,
    pan,
  });
  rustle(engine, at + 0.015, 0.06 * level, 0.18);
}

/** Incoming round striking the player's armor/body: visceral low punch + directional snap. */
export function playerHit(engine: Engine, pan: number, critical: boolean) {
  const now = engine.now();
  engine.tone('world', now, {
    type: 'triangle',
    from: 145,
    to: 42,
    level: 0.56,
    decay: 0.14,
    pan: pan * 0.5,
  });
  engine.noise('world', now, {
    filter: 'bandpass',
    from: 1650,
    to: 520,
    q: 1.3,
    level: 0.42,
    attack: 0.0008,
    decay: 0.065,
    pan,
  });
  if (critical) {
    // Low-health double heartbeat thump when below 35 HP (plays once per hit, never a drone loop).
    engine.tone('world', now + 0.14, { from: 72, to: 46, level: 0.34, decay: 0.11 });
    engine.tone('world', now + 0.32, { from: 66, to: 42, level: 0.26, decay: 0.13 });
  }
}

/** Restrained tactical chord stinger when all hostiles are neutralized (`victory`). */
export function modeVictory(engine: Engine) {
  const now = engine.now();
  engine.tone('ui', now, { type: 'triangle', from: 440, level: 0.12, decay: 0.24 });
  engine.tone('ui', now + 0.07, { type: 'triangle', from: 554.37, level: 0.12, decay: 0.26 });
  engine.tone('ui', now + 0.14, { type: 'triangle', from: 659.25, level: 0.14, decay: 0.38 });
}

/** Low sombre descending interval when player HP reaches zero (`defeat`). */
export function playerDefeat(engine: Engine) {
  const now = engine.now();
  engine.tone('ui', now, { type: 'triangle', from: 293.66, to: 261.63, level: 0.14, decay: 0.32 });
  engine.tone('ui', now + 0.14, {
    type: 'triangle',
    from: 220,
    to: 164.81,
    level: 0.15,
    decay: 0.48,
  });
}

/** Crisp upward mechanical rack + tactical brass chime when advancing a Gun Game weapon tier. */
export function tierAdvance(engine: Engine) {
  const now = engine.now();
  clack(engine, 'handling', now, { pitch: 2560, level: 0.095, length: 0.028 });
  engine.tone('ui', now + 0.015, {
    type: 'triangle',
    from: 523.25,
    level: 0.095,
    decay: 0.09,
  });
  engine.tone('ui', now + 0.068, {
    type: 'triangle',
    from: 783.99,
    level: 0.115,
    decay: 0.16,
  });
}

/** Starting to use a healing or boost item: kit rustle, then a wrapper tear or a can tab. */
export function consumableStart(engine: Engine, kind: 'heal' | 'boost') {
  const now = engine.now();
  rustle(engine, now, 0.1, 0.22);
  if (kind === 'heal') {
    engine.noise('handling', now + 0.2, {
      filter: 'highpass',
      from: 2600,
      level: 0.07,
      attack: 0.02,
      decay: 0.16,
    });
  } else {
    clack(engine, 'handling', now + 0.2, { pitch: 3100, level: 0.09, length: 0.03 });
    engine.noise('handling', now + 0.23, {
      filter: 'highpass',
      from: 5200,
      level: 0.05,
      attack: 0.004,
      decay: 0.12,
    });
  }
}

/** The item took effect: two soft rising notes, warmer for healing. */
export function consumableComplete(engine: Engine, kind: 'heal' | 'boost') {
  const now = engine.now();
  const base = kind === 'heal' ? 523 : 659;
  engine.tone('ui', now, { from: base, level: 0.09, attack: 0.008, decay: 0.16 });
  engine.tone('ui', now + 0.09, { from: base * 1.5, level: 0.08, attack: 0.008, decay: 0.22 });
}

/** The item was interrupted: a short dull drop. */
export function consumableCancel(engine: Engine) {
  const now = engine.now();
  rustle(engine, now, 0.07, 0.12);
  engine.tone('ui', now, { from: 300, to: 190, level: 0.07, decay: 0.1 });
}

/** Picking something up off a surface: a hand closing on it, then it going into the kit. */
export function lootPickup(engine: Engine, kind: 'item' | 'armour') {
  const now = engine.now();
  if (kind === 'item') {
    rustle(engine, now, 0.14, 0.1);
    clack(engine, 'handling', now + 0.07, { pitch: 1500, level: 0.12, length: 0.03 });
    rustle(engine, now + 0.12, 0.11, 0.14);
  } else {
    // Heavier: webbing dragged on, then a buckle snapping shut.
    rustle(engine, now, 0.12, 0.26);
    rustle(engine, now + 0.2, 0.09, 0.18);
    clack(engine, 'handling', now + 0.34, { pitch: 2300, level: 0.1, length: 0.028 });
  }
}

/** A vest or helmet giving out: a ceramic crack with a dull thud under it. */
export function armourBreak(engine: Engine, pan = 0) {
  const now = engine.now();
  engine.noise('world', now, {
    filter: 'highpass',
    from: 3200,
    level: 0.3,
    attack: 0.0008,
    decay: 0.04,
    pan,
  });
  engine.noise('world', now + 0.012, {
    filter: 'bandpass',
    from: 1700,
    to: 600,
    q: 2.2,
    level: 0.26,
    decay: 0.11,
    pan,
  });
  engine.tone('world', now, { type: 'triangle', from: 190, to: 70, level: 0.24, decay: 0.1, pan });
}
