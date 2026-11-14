/**
 * The mixing desk. Every sound is built from filtered noise and pitched transients,
 * routed into five buses with calibrated levels and outdoor concrete Shoot House
 * stereo early reflections + tail reverb. The `weapon` bus runs through a subtle
 * soft-clipping harmonic saturator so muzzle blasts carry genuine punch without clipping.
 *
 * Runs on any AudioContext or OfflineAudioContext (used by `measureSounds()`).
 */

export type Bus = 'weapon' | 'handling' | 'world' | 'ambience' | 'ui';

/** `level` is the bus volume. `echo` is how much of it reaches the outdoor shoot-house reverb. */
const BUSES: Record<Bus, { level: number; echo: number }> = {
  weapon: { level: 0.82, echo: 0.32 },
  // Reloading, dry fire, turret clicks, cloth: arm's-length handling stays well below gunfire.
  handling: { level: 0.12, echo: 0.04 },
  world: { level: 0.3, echo: 0.36 },
  ambience: { level: 1, echo: 0 },
  ui: { level: 0.15, echo: 0 },
};

const MASTER_LEVEL = 0.72;
const ECHO_SECONDS = 1.55;

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
  readonly attack?: number;
  readonly type?: OscillatorType;
  readonly pan?: number;
}

/** Unity-gain warm soft-clip transfer curve (`tanh(x*drive)/drive`) adding punch without boosting bus level. */
function makeSaturatorCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive) / drive;
  }
  return curve;
}

/** Deterministic pseudo-random for reproducible stereo reverb IRs across runs. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEngine(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = MASTER_LEVEL;

  // Transparent bus limiter catching peaks cleanly without pumping.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 5;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.0005;
  limiter.release.value = 0.11;
  limiter.connect(master).connect(context.destination);

  // Two seconds of white noise, shared by every sound and read from a random offset.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  // Open-air concrete Shoot House impulse response: discrete stereo concrete wall early
  // reflections (18–92 ms) feeding into a darkening desert canyon outdoor tail.
  const irLen = Math.floor(context.sampleRate * ECHO_SECONDS);
  const echoBuffer = context.createBuffer(2, irLen, context.sampleRate);
  const earlyTaps: readonly (readonly [number, number, number])[] = [
    // [timeSec, leftGain, rightGain]
    [0.019, 0.58, 0.22],
    [0.027, 0.24, 0.54],
    [0.044, 0.44, 0.36],
    [0.063, 0.28, 0.46],
    [0.088, 0.34, 0.26],
  ];

  for (let channel = 0; channel < 2; channel++) {
    const data = echoBuffer.getChannelData(channel);
    const rand = mulberry32(channel === 0 ? 41983 : 98217);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const keep = 0.46 - t * 0.4;
      smooth += (rand() * 2 - 1 - smooth) * keep;
      const tail = i < context.sampleRate * 0.024 ? 0 : smooth * (1 - t) ** 2.35;
      data[i] = tail * 0.72;
    }
    // Stamp crisp early concrete wall slapback reflections without phase-spiking peaks.
    for (const [sec, lGain, rGain] of earlyTaps) {
      const idx = Math.floor(sec * context.sampleRate);
      const gain = channel === 0 ? lGain : rGain;
      for (let k = 0; k < 26 && idx + k < data.length; k++) {
        const env = Math.exp(-k / 6.5);
        data[idx + k] = (data[idx + k] ?? 0) + (rand() * 2 - 1) * gain * env * 0.18;
      }
    }
  }

  const echo = context.createConvolver();
  echo.buffer = echoBuffer;
  const echoFilter = context.createBiquadFilter();
  echoFilter.type = 'lowpass';
  echoFilter.frequency.value = 4600;
  const echoLevel = context.createGain();
  echoLevel.gain.value = 0.52;
  echo.connect(echoFilter).connect(echoLevel).connect(limiter);

  // Subtle warm unity-gain soft-clipper dedicated to the weapon bus for tactile transient snap.
  const weaponDrive = context.createWaveShaper();
  weaponDrive.curve = makeSaturatorCurve(1.65);
  weaponDrive.oversample = '2x';

  const inputs = {} as Record<Bus, GainNode>;
  for (const name of Object.keys(BUSES) as Bus[]) {
    const input = context.createGain();
    input.gain.value = BUSES[name].level;

    if (name === 'weapon') {
      input.connect(weaponDrive);
      weaponDrive.connect(limiter);
      const send = context.createGain();
      send.gain.value = BUSES[name].echo;
      weaponDrive.connect(send).connect(echo);
    } else {
      input.connect(limiter);
      if (BUSES[name].echo > 0) {
        const send = context.createGain();
        send.gain.value = BUSES[name].echo;
        input.connect(send).connect(echo);
      }
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
    setVolume(volume: number) {
      const clamped = Math.max(0, Math.min(1, volume));
      master.gain.setTargetAtTime(MASTER_LEVEL * clamped, context.currentTime, 0.015);
    },
    /** A random amount either side of `centre`, so repeats never sound identical. */
    vary: (centre: number, spread: number) => centre * (1 + (Math.random() * 2 - 1) * spread),

    /** A burst of filtered noise: hiss, thump, crack or scrape depending on the filter. */
    noise(bus: Bus, at: number, shape: NoiseShape) {
      const source = noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = shape.filter;
      filter.Q.value = shape.q ?? 0.7;
      filter.frequency.value = shape.from;
      filter.frequency.setValueAtTime(shape.from, at);
      if (shape.to) filter.frequency.exponentialRampToValueAtTime(shape.to, at + shape.decay);
      const gain = context.createGain();
      const atk = shape.attack ?? 0.001;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.level), at + atk);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + atk + shape.decay);
      source.connect(filter).connect(gain).connect(output(bus, shape.pan));
      source.start(at, Math.random() * 1.5);
      source.stop(at + atk + shape.decay + 0.02);
    },

    /** A pitched tone (sine/triangle/sawtooth) that decays and can sweep in frequency. */
    tone(bus: Bus, at: number, shape: ToneShape) {
      const oscillator = context.createOscillator();
      oscillator.type = shape.type ?? 'sine';
      oscillator.frequency.value = shape.from;
      oscillator.frequency.setValueAtTime(shape.from, at);
      if (shape.to) oscillator.frequency.exponentialRampToValueAtTime(shape.to, at + shape.decay);
      const gain = context.createGain();
      const atk = shape.attack ?? 0.0012;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.level), at + atk);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + atk + shape.decay);
      oscillator.connect(gain).connect(output(bus, shape.pan));
      oscillator.start(at);
      oscillator.stop(at + atk + shape.decay + 0.02);
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
      depth.gain.value = level * 0.4;
      swell.connect(depth).connect(gain.gain);
      source.connect(filter).connect(gain).connect(inputs[bus]);
      source.start();
      swell.start();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
