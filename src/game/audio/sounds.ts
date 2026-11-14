import type { SurfaceMaterial } from '../../core/map';
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

export function shot(engine: Engine) {
  const now = engine.now();
  // Crack, then the body of the blast, then the push in the chest.
  engine.noise('weapon', now, { filter: 'highpass', from: 2600, level: 0.8, decay: 0.022 });
  engine.noise('weapon', now, {
    filter: 'lowpass',
    from: engine.vary(7500, 0.1),
    to: 650,
    level: 1,
    decay: 0.15,
  });
  engine.tone('weapon', now, { from: engine.vary(165, 0.06), to: 48, level: 0.8, decay: 0.12 });
  // The slide slamming back and forward again.
  clack(engine, 'weapon', now + 0.045, { pitch: 2300, level: 0.1 });
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
  if (surface === 'plywood' || surface === 'crate') {
    // A hollow knock.
    engine.noise('world', at, {
      filter: 'bandpass',
      from: engine.vary(520, 0.15),
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
  } else {
    // A sharp smack and a little falling grit.
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
