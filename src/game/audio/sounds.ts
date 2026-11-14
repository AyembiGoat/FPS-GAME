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
    q: 12,
    level: options.level * 0.48,
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
  if (weaponId === 'remington-870') {
    // Hollow plastic & brass 12-gauge hull clattering on concrete after pump cycle!
    const at = engine.now() + engine.vary(0.76, 0.1);
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

  const baseDelay = weaponId === 'awm' ? 0.88 : 0.5;
  const basePitch =
    weaponId === 'awm'
      ? 3150
      : weaponId === 'scar-h' || weaponId === 'ak47' || weaponId === 'desert-eagle'
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
  } else if (surface === 'container') {
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

  const heavySteel =
    weaponId === 'ak47' ||
    weaponId === 'scar-h' ||
    weaponId === 'awm' ||
    weaponId === 'desert-eagle';
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
    level: 0.055,
    decay: 0.016,
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
    level: 0.09,
    decay: 0.018,
  });
  engine.tone('ui', now, {
    from: 520,
    to: 340,
    level: 0.085,
    decay: 0.05,
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
