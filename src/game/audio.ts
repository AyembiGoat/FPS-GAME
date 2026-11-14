import type { SurfaceMaterial } from '../core/map';

/**
 * All sound is synthesised, so the slice needs no audio files. Sounds from a
 * distance are delayed by the time sound takes to travel, which is what makes a
 * far steel plate ring a moment after the shot.
 */

const SPEED_OF_SOUND = 343;

export function createAudio() {
  let context: AudioContext | null = null;
  let master: AudioNode | null = null;
  let noise: AudioBuffer | null = null;

  function noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    // Start at a different point each time so repeated sounds are not identical.
    source.loopStart = 0;
    source.start(0, Math.random() * 1.5);
    return source;
  }

  /** A burst of filtered noise. */
  function burst(
    at: number,
    options: {
      type: BiquadFilterType;
      from: number;
      to?: number;
      q?: number;
      gain: number;
      attack?: number;
      decay: number;
    },
  ) {
    if (!context || !master) return;
    const source = noiseSource(context);
    const filter = context.createBiquadFilter();
    filter.type = options.type;
    filter.Q.value = options.q ?? 0.7;
    filter.frequency.setValueAtTime(options.from, at);
    if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, at + options.decay);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.gain, at + (options.attack ?? 0.002));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.decay);
    source.connect(filter).connect(gain).connect(master);
    source.stop(at + options.decay + 0.05);
  }

  /** A sine tone that can slide in pitch and dies away. */
  function tone(at: number, from: number, to: number, level: number, decay: number) {
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + decay);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    oscillator.connect(gain).connect(master);
    oscillator.start(at);
    oscillator.stop(at + decay + 0.05);
  }

  function click(at: number, brightness: number, level: number) {
    burst(at, {
      type: 'bandpass',
      from: brightness,
      q: 2,
      gain: level,
      attack: 0.001,
      decay: 0.03,
    });
  }

  /** Quieter with distance, and never louder than at arm's length. */
  function falloff(distance: number): number {
    return 1 / (1 + distance * 0.12);
  }

  return {
    /** Browsers only allow sound after a click or key press, so call this from one. */
    start() {
      if (context) {
        void context.resume();
        return;
      }
      context = new AudioContext();
      const compressor = context.createDynamicsCompressor();
      const volume = context.createGain();
      volume.gain.value = 0.6;
      compressor.connect(volume).connect(context.destination);
      master = compressor;

      // Light wind, slowly rising and falling.
      const wind = noiseSource(context);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      const level = context.createGain();
      level.gain.value = 0.035;
      const swell = context.createOscillator();
      swell.frequency.value = 0.09;
      const depth = context.createGain();
      depth.gain.value = 0.018;
      swell.connect(depth).connect(level.gain);
      swell.start();
      wind.connect(filter).connect(level).connect(master);
    },

    shot() {
      if (!context) return;
      const now = context.currentTime;
      burst(now, { type: 'lowpass', from: 9000, to: 900, gain: 1, attack: 0.001, decay: 0.17 });
      tone(now, 170, 46, 0.9, 0.14);
      // The report rolling back off the perimeter wall.
      burst(now + 0.035, { type: 'lowpass', from: 1400, to: 300, gain: 0.16, decay: 0.75 });
    },

    steel(distance: number) {
      if (!context) return;
      const at = context.currentTime + distance / SPEED_OF_SOUND;
      const level = falloff(distance);
      // A struck plate rings at unrelated pitches; the high ones die first.
      tone(at, 2143, 2143, 0.3 * level, 0.7);
      tone(at, 3391, 3391, 0.22 * level, 0.45);
      tone(at, 5127, 5127, 0.14 * level, 0.25);
      tone(at, 6890, 6890, 0.08 * level, 0.14);
      click(at, 4200, 0.5 * level);
    },

    impact(distance: number, surface: SurfaceMaterial) {
      if (!context) return;
      const at = context.currentTime + distance / SPEED_OF_SOUND;
      const wood = surface === 'plywood' || surface === 'crate';
      burst(at, {
        type: 'bandpass',
        from: wood ? 650 : 1900,
        q: wood ? 1.6 : 0.9,
        gain: 0.35 * falloff(distance),
        decay: wood ? 0.09 : 0.06,
      });
    },

    dryFire() {
      if (!context) return;
      click(context.currentTime, 3200, 0.35);
    },

    /** Magazine out, magazine in, slide forward. Timed to the gun dropping out of view. */
    reload(duration: number) {
      if (!context) return;
      const now = context.currentTime;
      click(now + duration * 0.16, 1500, 0.3);
      burst(now + duration * 0.17, { type: 'bandpass', from: 2600, gain: 0.08, decay: 0.09 });
      click(now + duration * 0.6, 1900, 0.4);
      tone(now + duration * 0.6, 210, 150, 0.25, 0.05);
      click(now + duration * 0.86, 2800, 0.45);
      click(now + duration * 0.86 + 0.03, 1700, 0.35);
    },

    footstep(level: number) {
      if (!context) return;
      const now = context.currentTime;
      burst(now, {
        type: 'lowpass',
        from: 520 + Math.random() * 260,
        gain: 0.2 * level,
        attack: 0.004,
        decay: 0.08,
      });
      burst(now, { type: 'highpass', from: 3500, gain: 0.03 * level, decay: 0.04 });
    },

    land(speed: number) {
      if (!context) return;
      const now = context.currentTime;
      const level = Math.min(1, speed / 9);
      tone(now, 95, 50, 0.5 * level, 0.12);
      burst(now, { type: 'lowpass', from: 420, gain: 0.35 * level, attack: 0.003, decay: 0.12 });
    },
  };
}

export type GameAudio = ReturnType<typeof createAudio>;
