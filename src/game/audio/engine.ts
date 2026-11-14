/**
 * The mixing desk. Every sound is built from two ingredients, filtered noise and
 * decaying sine tones, and is sent to one of four buses. Each bus has its own
 * volume and its own share of the outdoor echo, so the balance between kinds of
 * sound is set in one place (BUSES) and not by each sound guessing a number.
 *
 * It runs on any audio context, including an offline one, which is how
 * `measureSounds` checks loudness without speakers.
 */

export type Bus = 'weapon' | 'handling' | 'world' | 'ambience';

/** `level` is the bus volume. `echo` is how much of it reaches the outdoor echo. */
const BUSES: Record<Bus, { level: number; echo: number }> = {
  weapon: { level: 0.6, echo: 0.3 },
  // Reloading, dry fire, cloth: things heard at arm's length. Deliberately quiet.
  handling: { level: 0.3, echo: 0.03 },
  world: { level: 0.6, echo: 0.35 },
  ambience: { level: 1, echo: 0 },
};

const MASTER_LEVEL = 0.7;
const ECHO_SECONDS = 1.4;

export interface NoiseShape {
  readonly filter: BiquadFilterType;
  readonly from: number;
  /** Frequency the filter slides to by the end. Omit to stay put. */
  readonly to?: number;
  readonly q?: number;
  readonly level: number;
  readonly attack?: number;
  readonly decay: number;
  /** -1 is hard left, 1 hard right. */
  readonly pan?: number;
}

export interface ToneShape {
  readonly from: number;
  readonly to?: number;
  readonly level: number;
  readonly decay: number;
  readonly pan?: number;
}

export function createEngine(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = MASTER_LEVEL;
  // Catches the peak of a gunshot so it is loud without clipping.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(master).connect(context.destination);

  // Two seconds of noise, shared by every sound and read from a random point.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  // The echo of an open yard with a wall round it: noise that fades and dulls.
  const echoBuffer = context.createBuffer(
    2,
    Math.floor(context.sampleRate * ECHO_SECONDS),
    context.sampleRate,
  );
  for (let channel = 0; channel < 2; channel++) {
    const data = echoBuffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      // Later echoes have lost more of their treble.
      const keep = 0.5 - t * 0.42;
      smooth += (Math.random() * 2 - 1 - smooth) * keep;
      // Nothing for the first few milliseconds: the nearest wall is metres away.
      data[i] = i < context.sampleRate * 0.03 ? 0 : smooth * (1 - t) ** 2.4;
    }
  }
  const echo = context.createConvolver();
  echo.buffer = echoBuffer;
  const echoLevel = context.createGain();
  echoLevel.gain.value = 0.5;
  echo.connect(echoLevel).connect(limiter);

  const inputs = {} as Record<Bus, GainNode>;
  for (const name of Object.keys(BUSES) as Bus[]) {
    const input = context.createGain();
    input.gain.value = BUSES[name].level;
    input.connect(limiter);
    if (BUSES[name].echo > 0) {
      const send = context.createGain();
      send.gain.value = BUSES[name].echo;
      input.connect(send).connect(echo);
    }
    inputs[name] = input;
  }

  function output(bus: Bus, pan: number | undefined): AudioNode {
    if (pan === undefined || pan === 0) return inputs[bus];
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(inputs[bus]);
    return panner;
  }

  function noiseSource(): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    return source;
  }

  return {
    context,
    now: () => context.currentTime,
    /** A random amount either side of `centre`, so repeats never sound identical. */
    vary: (centre: number, spread: number) => centre * (1 + (Math.random() * 2 - 1) * spread),

    /** A burst of filtered noise: hiss, thump, crack or scrape depending on the filter. */
    noise(bus: Bus, at: number, shape: NoiseShape) {
      const source = noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = shape.filter;
      filter.Q.value = shape.q ?? 0.7;
      filter.frequency.setValueAtTime(shape.from, at);
      if (shape.to) filter.frequency.exponentialRampToValueAtTime(shape.to, at + shape.decay);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(shape.level, at + (shape.attack ?? 0.001));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + (shape.attack ?? 0.001) + shape.decay);
      source.connect(filter).connect(gain).connect(output(bus, shape.pan));
      source.start(at, Math.random() * 1.5);
      source.stop(at + (shape.attack ?? 0.001) + shape.decay + 0.02);
    },

    /** A sine tone that dies away and can slide in pitch. */
    tone(bus: Bus, at: number, shape: ToneShape) {
      const oscillator = context.createOscillator();
      oscillator.frequency.setValueAtTime(shape.from, at);
      if (shape.to) oscillator.frequency.exponentialRampToValueAtTime(shape.to, at + shape.decay);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(shape.level, at + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + shape.decay);
      oscillator.connect(gain).connect(output(bus, shape.pan));
      oscillator.start(at);
      oscillator.stop(at + shape.decay + 0.02);
    },

    /** Noise that plays until the page closes, with a slow swell. For wind. */
    bed(bus: Bus, cutoff: number, level: number, swellHz: number) {
      const source = noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = context.createGain();
      gain.gain.value = level;
      const swell = context.createOscillator();
      swell.frequency.value = swellHz;
      const depth = context.createGain();
      depth.gain.value = level * 0.5;
      swell.connect(depth).connect(gain.gain);
      swell.start();
      source.connect(filter).connect(gain).connect(inputs[bus]);
      source.start();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
