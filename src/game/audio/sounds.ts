import type { SurfaceMaterial } from '../../core/map';
import type { WeaponId } from '../../core/weapon';
import type { Bus, Engine } from './engine';

/**
 * What each thing in the game sounds like. Each function plays one sound on an
 * engine. Read .agents/skills/sound/SKILL.md before adding or changing one.
 */

const SPEED_OF_SOUND = 343;

/** Quieter with distance, and never louder than at arm's length. */
const falloff = (distance: number) => 1 / (1 + distance * 0.12);

/**
 * Two hard parts meeting: a tiny click and two short rings at unrelated pitches.
 * Real metal-on-metal is mostly this. A sine "bonk" is what makes it sound fake.
 */
function clack(
  engine: Engine,
  bus: Bus,
  at: number,
  options: { pitch: number; level: number; length?: number; pan?: number },
) {
  const pitch = engine.vary(options.pitch, 0.05);
  const length = options.length ?? 0.035;
  const pan = options.pan;
  engine.noise(bus, at, {
    filter: 'highpass',
    from: pitch * 1.6,
    level: options.level * 0.7,
    decay: 0.012,
    ...(pan !== undefined && { pan }),
  });
  engine.noise(bus, at, {
    filter: 'bandpass',
    from: pitch,
    q: 9,
    level: options.level,
    decay: length,
    ...(pan !== undefined && { pan }),
  });
  engine.noise(bus, at, {
    filter: 'bandpass',
    from: pitch * 2.37,
    q: 12,
    level: options.level * 0.5,
    decay: length * 0.6,
    ...(pan !== undefined && { pan }),
  });
}

/** Fabric moving: soft, slow to start, no pitch. */
function rustle(engine: Engine, at: number, level: number, length: number) {
  engine.noise('handling', at, {
    filter: 'bandpass',
    from: engine.vary(1500, 0.2),
    to: 900,
    q: 0.5,
    level,
    attack: length * 0.4,
    decay: length * 0.6,
  });
}

export function shot(engine: Engine, weaponId: WeaponId = 'm1911') {
  const now = engine.now();

  switch (weaponId) {
    case 'hk416':
      // Crisp supersonic 5.56×45mm crack, tight mid punch, fast piston bolt snap.
      engine.noise('weapon', now, { filter: 'highpass', from: 3200, level: 0.85, decay: 0.02 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(8400, 0.08),
        to: 780,
        level: 0.92,
        decay: 0.14,
      });
      engine.tone('weapon', now, { from: engine.vary(188, 0.06), to: 58, level: 0.72, decay: 0.1 });
      clack(engine, 'weapon', now + 0.036, { pitch: 2750, level: 0.095 });
      break;

    case 'ak47':
      // Heavy metallic 7.62×39mm bark with lower chest thump and stamped-steel bolt rattle.
      engine.noise('weapon', now, { filter: 'highpass', from: 2200, level: 0.72, decay: 0.026 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(6400, 0.1),
        to: 520,
        level: 0.96,
        decay: 0.18,
      });
      engine.tone('weapon', now, {
        from: engine.vary(142, 0.06),
        to: 42,
        level: 0.85,
        decay: 0.14,
      });
      clack(engine, 'weapon', now + 0.048, { pitch: 1850, level: 0.14, length: 0.045 });
      break;

    case 'scar-h':
      // Deep 7.62×51mm battle-rifle boom + wide PWS muzzle-brake air blast.
      engine.noise('weapon', now, { filter: 'highpass', from: 2800, level: 0.84, decay: 0.028 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7800, 0.08),
        to: 460,
        level: 0.98,
        decay: 0.21,
      });
      engine.tone('weapon', now, {
        from: engine.vary(124, 0.05),
        to: 38,
        level: 0.88,
        decay: 0.16,
      });
      clack(engine, 'weapon', now + 0.05, { pitch: 2100, level: 0.12 });
      break;

    case 'mp5':
      // Compact, tight 9×19mm SMG pop with shorter tail and crisp roller-delayed action.
      engine.noise('weapon', now, { filter: 'highpass', from: 3000, level: 0.72, decay: 0.016 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7200, 0.1),
        to: 980,
        level: 0.86,
        decay: 0.095,
      });
      engine.tone('weapon', now, {
        from: engine.vary(225, 0.07),
        to: 72,
        level: 0.68,
        decay: 0.08,
      });
      clack(engine, 'weapon', now + 0.032, { pitch: 2900, level: 0.08 });
      break;

    case 'remington-870':
      // Wide-band 12-gauge shotgun thunder followed by iconic two-stroke pump rack.
      engine.noise('weapon', now, { filter: 'highpass', from: 1800, level: 0.82, decay: 0.034 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(6200, 0.08),
        to: 320,
        level: 1.0,
        decay: 0.26,
      });
      engine.tone('weapon', now, { from: engine.vary(108, 0.05), to: 32, level: 0.92, decay: 0.2 });
      // Tactile pump-action rack: rearward pull ("chk") then forward chambering ("CHK").
      clack(engine, 'handling', now + 0.26, { pitch: 1680, level: 0.14, length: 0.05 });
      clack(engine, 'handling', now + 0.44, { pitch: 2150, level: 0.17, length: 0.045 });
      break;

    case 'awm':
      // Massive .338 Lapua Magnum supersonic whip, cannon bass, outdoor tail, and bolt cycle.
      engine.noise('weapon', now, { filter: 'highpass', from: 3600, level: 0.9, decay: 0.032 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(8600, 0.06),
        to: 280,
        level: 1.0,
        decay: 0.36,
      });
      engine.tone('weapon', now, { from: engine.vary(94, 0.04), to: 28, level: 0.95, decay: 0.24 });
      // Four-beat mechanical bolt cycle: unlock, pull back, push home, lock down.
      clack(engine, 'handling', now + 0.34, { pitch: 2650, level: 0.09, length: 0.025 });
      clack(engine, 'handling', now + 0.48, { pitch: 1850, level: 0.11, length: 0.045 });
      clack(engine, 'handling', now + 0.72, { pitch: 2050, level: 0.12, length: 0.04 });
      clack(engine, 'handling', now + 0.88, { pitch: 2850, level: 0.1, length: 0.022 });
      break;

    case 'desert-eagle':
      // Heavy .50 AE hand-cannon boom with big low-end punch and weighty stainless slide slam.
      engine.noise('weapon', now, { filter: 'highpass', from: 2100, level: 0.84, decay: 0.028 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(6800, 0.08),
        to: 420,
        level: 0.98,
        decay: 0.21,
      });
      engine.tone('weapon', now, { from: engine.vary(128, 0.05), to: 38, level: 0.9, decay: 0.16 });
      clack(engine, 'weapon', now + 0.058, { pitch: 1950, level: 0.13, length: 0.042 });
      break;

    case 'm1911':
    default:
      // Classic .45 ACP pistol crack, crisp body, and parkerized slide cycle.
      engine.noise('weapon', now, { filter: 'highpass', from: 2600, level: 0.8, decay: 0.022 });
      engine.noise('weapon', now, {
        filter: 'lowpass',
        from: engine.vary(7500, 0.1),
        to: 650,
        level: 1,
        decay: 0.15,
      });
      engine.tone('weapon', now, { from: engine.vary(165, 0.06), to: 48, level: 0.8, decay: 0.12 });
      clack(engine, 'weapon', now + 0.045, { pitch: 2300, level: 0.1 });
      break;
  }
}

/** A spent case landing on concrete a moment later: two small bounces. */
export function casing(engine: Engine) {
  const at = engine.now() + engine.vary(0.52, 0.12);
  const pitch = engine.vary(4300, 0.12);
  for (const [delay, level] of [
    [0, 0.045],
    [0.085, 0.028],
    [0.14, 0.014],
  ] as const) {
    engine.tone('handling', at + delay, { from: pitch, level, decay: 0.07, pan: 0.5 });
    engine.tone('handling', at + delay, {
      from: pitch * 1.48,
      level: level * 0.6,
      decay: 0.045,
      pan: 0.5,
    });
  }
}

/** A steel plate rings at unrelated pitches; the high ones die first. */
export function steel(engine: Engine, distance: number, pan: number) {
  const at = engine.now() + distance / SPEED_OF_SOUND;
  const level = falloff(distance);
  const tune = engine.vary(1, 0.03);
  for (const [pitch, loudness, decay] of [
    [2143, 0.2, 0.75],
    [3391, 0.14, 0.45],
    [5127, 0.08, 0.25],
    [6890, 0.05, 0.14],
  ] as const) {
    engine.tone('world', at, { from: pitch * tune, level: loudness * level, decay, pan });
  }
  engine.noise('world', at, {
    filter: 'bandpass',
    from: 4200,
    q: 2,
    level: 0.5 * level,
    decay: 0.03,
    pan,
  });
}

export function impact(engine: Engine, distance: number, surface: SurfaceMaterial, pan: number) {
  const at = engine.now() + distance / SPEED_OF_SOUND;
  const level = falloff(distance);
  if (surface === 'plywood' || surface === 'crate' || surface === 'timber') {
    // A hollow/solid wood knock.
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(surface === 'timber' ? 430 : 520, 0.15),
      q: 3,
      level: 0.45 * level,
      decay: 0.09,
      pan,
    });
    engine.noise('world', at, {
      filter: 'highpass',
      from: 2500,
      level: 0.12 * level,
      decay: 0.03,
      pan,
    });
  } else if (surface === 'container') {
    // Corrugated steel container: hollow resonant metallic clang.
    engine.tone('world', at, {
      from: engine.vary(320, 0.1),
      to: 180,
      level: 0.25 * level,
      decay: 0.24,
      pan,
    });
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(1650, 0.15),
      q: 4.5,
      level: 0.42 * level,
      decay: 0.14,
      pan,
    });
  } else {
    // Concrete/floor: a sharp smack and a little falling grit.
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(2100, 0.15),
      q: 1,
      level: 0.4 * level,
      decay: 0.05,
      pan,
    });
    engine.noise('world', at + 0.03, {
      filter: 'highpass',
      from: 4500,
      level: 0.05 * level,
      attack: 0.02,
      decay: 0.16,
      pan,
    });
  }
}

export function dryFire(engine: Engine) {
  clack(engine, 'handling', engine.now(), { pitch: 3100, level: 0.22, length: 0.02 });
}

/**
 * The reload, beat by beat. `beats` are fractions of `duration` and come from the
 * gun model, so the sounds land exactly when the animation shows them.
 */
export function reload(
  engine: Engine,
  duration: number,
  beats: { magazineOut: number; magazineIn: number; slideRelease: number },
  empty: boolean,
) {
  const now = engine.now();
  const out = now + duration * beats.magazineOut;
  const seat = now + duration * beats.magazineIn;
  const release = now + duration * beats.slideRelease;

  rustle(engine, now, 0.05, 0.22);
  // Magazine catch, then the magazine sliding out of the grip.
  clack(engine, 'handling', out, { pitch: 2600, level: 0.07, length: 0.02 });
  engine.noise('handling', out + 0.015, {
    filter: 'bandpass',
    from: 3200,
    to: 1900,
    q: 1.2,
    level: 0.04,
    attack: 0.02,
    decay: 0.1,
  });
  rustle(engine, out + 0.25, 0.035, 0.3);
  // New magazine: a short slide, then it locks with a lower, fuller click.
  engine.noise('handling', seat - 0.07, {
    filter: 'bandpass',
    from: 2000,
    to: 3000,
    q: 1.2,
    level: 0.04,
    attack: 0.04,
    decay: 0.04,
  });
  clack(engine, 'handling', seat, { pitch: 1450, level: 0.085, length: 0.04 });
  engine.noise('handling', seat, { filter: 'lowpass', from: 300, level: 0.12, decay: 0.035 });
  if (empty) {
    // Slide stop down, slide runs forward and shuts.
    clack(engine, 'handling', release, { pitch: 3000, level: 0.06, length: 0.015 });
    clack(engine, 'handling', release + 0.028, { pitch: 1900, level: 0.1, length: 0.045 });
  }
  rustle(engine, release + 0.05, 0.04, 0.2);
}

/** Bringing the sights up or lowering them. */
export function aim(engine: Engine, up: boolean) {
  rustle(engine, engine.now(), up ? 0.05 : 0.035, 0.16);
}

/** Drawing or slinging a firearm when switching Primary <-> Secondary. */
export function weaponSwitch(engine: Engine) {
  const now = engine.now();
  rustle(engine, now, 0.06, 0.2);
  clack(engine, 'handling', now + 0.1, { pitch: 2250, level: 0.065, length: 0.028 });
}

export function footstep(engine: Engine, level: number, left: boolean) {
  const now = engine.now();
  const pan = left ? -0.12 : 0.12;
  // Heel: a dull knock. Sole: grit under the boot a moment later.
  engine.noise('world', now, {
    filter: 'lowpass',
    from: engine.vary(420, 0.25),
    level: 0.45 * level,
    attack: 0.003,
    decay: 0.07,
    pan,
  });
  engine.noise('world', now + 0.025, {
    filter: 'bandpass',
    from: engine.vary(3400, 0.3),
    q: 0.6,
    level: 0.07 * level,
    attack: 0.012,
    decay: 0.07,
    pan,
  });
}

export function land(engine: Engine, speed: number) {
  const now = engine.now();
  const level = Math.min(1, speed / 9);
  engine.tone('world', now, { from: 95, to: 50, level: 0.4 * level, decay: 0.12 });
  engine.noise('world', now, {
    filter: 'lowpass',
    from: 420,
    level: 0.32 * level,
    attack: 0.003,
    decay: 0.12,
  });
  rustle(engine, now, 0.06 * level, 0.2);
}

/** Light wind, slowly rising and falling. */
export function wind(engine: Engine) {
  engine.bed('ambience', 380, 0.03, 0.09);
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
