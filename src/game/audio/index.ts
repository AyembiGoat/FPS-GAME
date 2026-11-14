import type { SurfaceMaterial } from '../../core/map';
import type { Engine } from './engine';
import { createEngine } from './engine';
import * as sounds from './sounds';

/**
 * All sound is synthesised, so the game needs no audio files. Sounds from a
 * distance are delayed by the time sound takes to travel, which is what makes a
 * far steel plate ring a moment after the shot.
 */

export interface ReloadBeats {
  readonly magazineOut: number;
  readonly magazineIn: number;
  readonly slideRelease: number;
}

export function createAudio() {
  let engine: Engine | null = null;
  let leftFoot = false;

  return {
    /** Browsers only allow sound after a click or key press, so call this from one. */
    start() {
      if (engine) {
        if (engine.context instanceof AudioContext) void engine.context.resume();
        return;
      }
      engine = createEngine(new AudioContext());
      sounds.wind(engine);
    },

    shot() {
      if (!engine) return;
      sounds.shot(engine);
      sounds.casing(engine);
    },
    /** `pan` is where the sound is: -1 hard left, 1 hard right. */
    steel(distance: number, pan: number) {
      if (engine) sounds.steel(engine, distance, pan);
    },
    impact(distance: number, surface: SurfaceMaterial, pan: number) {
      if (engine) sounds.impact(engine, distance, surface, pan);
    },
    dryFire() {
      if (engine) sounds.dryFire(engine);
    },
    reload(duration: number, beats: ReloadBeats, empty: boolean) {
      if (engine) sounds.reload(engine, duration, beats, empty);
    },
    aim(up: boolean) {
      if (engine) sounds.aim(engine, up);
    },
    footstep(level: number) {
      if (!engine) return;
      leftFoot = !leftFoot;
      sounds.footstep(engine, level, leftFoot);
    },
    land(speed: number) {
      if (engine) sounds.land(engine, speed);
    },
  };
}

export type GameAudio = ReturnType<typeof createAudio>;

const MEASURED: Record<string, (engine: Engine) => void> = {
  shot: sounds.shot,
  reload: (engine) => {
    sounds.reload(engine, 2.1, { magazineOut: 0.16, magazineIn: 0.6, slideRelease: 0.84 }, true);
  },
  dryFire: sounds.dryFire,
  casing: sounds.casing,
  aim: (engine) => {
    sounds.aim(engine, true);
  },
  footstep: (engine) => {
    sounds.footstep(engine, 1, true);
  },
  land: (engine) => {
    sounds.land(engine, 6);
  },
  steelAt10m: (engine) => {
    sounds.steel(engine, 10, 0);
  },
  concreteAt10m: (engine) => {
    sounds.impact(engine, 10, 'concrete', 0);
  },
  plywoodAt10m: (engine) => {
    sounds.impact(engine, 10, 'plywood', 0);
  },
};

/**
 * Render each sound without speakers and report how loud it is, as a fraction of
 * the gunshot's peak. This is how a script (or an agent that cannot hear) checks
 * the mix. See scripts/playtest.mjs.
 */
export async function measureSounds(): Promise<Record<string, number>> {
  const peaks: Record<string, number> = {};
  for (const [name, play] of Object.entries(MEASURED)) {
    const context = new OfflineAudioContext(2, 48000 * 3, 48000);
    play(createEngine(context));
    const rendered = await context.startRendering();
    let peak = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      for (const sample of rendered.getChannelData(channel)) {
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    peaks[name] = peak;
  }
  const reference = peaks.shot ?? 1;
  return Object.fromEntries(
    Object.entries(peaks).map(([name, peak]) => [name, Math.round((peak / reference) * 100) / 100]),
  );
}
