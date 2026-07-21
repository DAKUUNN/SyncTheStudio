/**
 * Pure audio-analysis helpers for the master review player: waveform peaks,
 * a log-frequency spectrogram (rendered to a PNG data URL), and integrated
 * loudness (ITU-R BS.1770 K-weighting + two-pass gating) + sample peak.
 *
 * Everything below the AudioBuffer decode step operates on plain
 * Float32Array channel data so the DSP itself is unit-testable outside a
 * browser (no AudioContext/canvas dependency in computeLoudness/buildFft).
 */

export interface LoudnessResult {
  /** Integrated (gated) loudness in LUFS, or null if the signal is too short/silent to gate. */
  integratedLufs: number | null;
  /** Sample peak in dBFS (not oversampled true-peak). */
  peakDb: number;
}

export interface SpectrogramResult {
  dataUrl: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Decode (browser-only — relies on Web Audio API, same as the existing
// waveform decode this replaces).
// ---------------------------------------------------------------------------

export async function decodeToAudioBuffer(bytes: Uint8Array): Promise<AudioBuffer | null> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const ctx = new AudioContextCtor();
  try {
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return await ctx.decodeAudioData(buffer);
  } catch (e) {
    console.warn("audio decode failed:", e);
    return null;
  } finally {
    void ctx.close();
  }
}

export function getChannels(audioBuffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) channels.push(audioBuffer.getChannelData(c));
  return channels;
}

// ---------------------------------------------------------------------------
// Waveform peaks (unchanged behavior from the previous inline implementation).
// ---------------------------------------------------------------------------

export function computeWaveformPeaks(channelData: Float32Array, buckets: number): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let blockMax = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const value = Math.abs(channelData[start + j] ?? 0);
      if (value > blockMax) blockMax = value;
    }
    peaks.push(blockMax);
    if (blockMax > max) max = blockMax;
  }
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}

// ---------------------------------------------------------------------------
// Radix-2 FFT (iterative, in-place on parallel real/imag Float64Arrays).
// ---------------------------------------------------------------------------

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let start = 0; start < n; start += len) {
      let curWr = 1;
      let curWi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = real[start + k];
        const ui = imag[start + k];
        const vr = real[start + k + len / 2] * curWr - imag[start + k + len / 2] * curWi;
        const vi = real[start + k + len / 2] * curWi + imag[start + k + len / 2] * curWr;
        real[start + k] = ur + vr;
        imag[start + k] = ui + vi;
        real[start + k + len / 2] = ur - vr;
        imag[start + k + len / 2] = ui - vi;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ---------------------------------------------------------------------------
// Spectrogram (log-frequency, rendered to an off-screen canvas -> data URL).
// ---------------------------------------------------------------------------

const SPECTROGRAM_ROWS = 128;
const SPECTROGRAM_MIN_HZ = 30;
const SPECTROGRAM_FLOOR_DB = -90;

function magToColor(t: number): [number, number, number] {
  // 5-stop "inferno-ish" ramp: black -> indigo -> magenta -> orange -> pale yellow.
  const stops: [number, number, number][] = [
    [6, 4, 20],
    [73, 30, 110],
    [170, 40, 110],
    [240, 110, 40],
    [252, 233, 150],
  ];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

export function buildSpectrogramImage(
  channelData: Float32Array,
  sampleRate: number,
  durationSeconds: number
): SpectrogramResult | null {
  const columns = Math.min(500, Math.max(120, Math.round(durationSeconds * 8)));
  const hop = Math.max(1, Math.floor(channelData.length / columns));
  const fftSize = Math.min(4096, Math.max(1024, nextPow2(hop * 2)));
  const half = fftSize / 2;
  const nyquist = sampleRate / 2;
  const maxHz = Math.min(nyquist, 20000);

  // Precompute a Hann window once.
  const window = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));

  // Precompute log-spaced row -> linear-bin mapping once.
  const rowBins = new Int32Array(SPECTROGRAM_ROWS);
  const logMin = Math.log(SPECTROGRAM_MIN_HZ);
  const logMax = Math.log(maxHz);
  for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
    const freq = Math.exp(logMin + ((logMax - logMin) * r) / (SPECTROGRAM_ROWS - 1));
    rowBins[r] = Math.min(half - 1, Math.round((freq / nyquist) * half));
  }

  const image = new Uint8ClampedArray(columns * SPECTROGRAM_ROWS * 4);
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let col = 0; col < columns; col++) {
    const start = Math.min(channelData.length - fftSize, col * hop);
    real.fill(0);
    imag.fill(0);
    if (start >= 0) {
      for (let i = 0; i < fftSize; i++) real[i] = (channelData[start + i] ?? 0) * window[i];
    } else {
      // Signal shorter than one FFT window — pad from the start.
      for (let i = 0; i < Math.min(fftSize, channelData.length); i++) real[i] = channelData[i] * window[i];
    }
    fft(real, imag);

    for (let r = 0; r < SPECTROGRAM_ROWS; r++) {
      const bin = rowBins[r];
      const mag = Math.hypot(real[bin], imag[bin]) / fftSize;
      const db = 20 * Math.log10(mag + 1e-12);
      const t = (Math.max(SPECTROGRAM_FLOOR_DB, Math.min(0, db)) - SPECTROGRAM_FLOOR_DB) / -SPECTROGRAM_FLOOR_DB;
      const [rr, gg, bb] = magToColor(t);
      // Row 0 = lowest frequency -> bottom of the image.
      const y = SPECTROGRAM_ROWS - 1 - r;
      const idx = (y * columns + col) * 4;
      image[idx] = rr;
      image[idx + 1] = gg;
      image[idx + 2] = bb;
      image[idx + 3] = 255;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = SPECTROGRAM_ROWS;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return null;
  ctx2d.putImageData(new ImageData(image, columns, SPECTROGRAM_ROWS), 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), width: columns, height: SPECTROGRAM_ROWS };
}

// ---------------------------------------------------------------------------
// Loudness — ITU-R BS.1770 K-weighting (RBJ high-shelf + high-pass biquads)
// with the standard two-pass relative gating for integrated LUFS.
// ---------------------------------------------------------------------------

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function highShelfCoeffs(sampleRate: number, f0: number, dbGain: number, q: number): BiquadCoeffs {
  const A = Math.pow(10, dbGain / 40);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const sqrtA = Math.sqrt(A);
  const b0 = A * (A + 1 + (A - 1) * cosw0 + 2 * sqrtA * alpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cosw0);
  const b2 = A * (A + 1 + (A - 1) * cosw0 - 2 * sqrtA * alpha);
  const a0 = A + 1 - (A - 1) * cosw0 + 2 * sqrtA * alpha;
  const a1 = 2 * (A - 1 - (A + 1) * cosw0);
  const a2 = A + 1 - (A - 1) * cosw0 - 2 * sqrtA * alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function highPassCoeffs(sampleRate: number, f0: number, q: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosw0 = Math.cos(w0);
  const b0 = (1 + cosw0) / 2;
  const b1 = -(1 + cosw0);
  const b2 = (1 + cosw0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(input: Float32Array | Float64Array, c: BiquadCoeffs): Float64Array {
  const out = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function kWeight(channel: Float32Array, sampleRate: number): Float64Array {
  const stage1 = highShelfCoeffs(sampleRate, 1681.9744509555319, 3.999843853973347, 0.7071752369554196);
  const stage2 = highPassCoeffs(sampleRate, 38.13547087602444, 0.5003270373238773);
  return applyBiquad(applyBiquad(channel, stage1), stage2);
}

const BLOCK_SECONDS = 0.4;
const BLOCK_HOP_SECONDS = 0.1;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_OFFSET_LU = -10;

export function computeLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const abs = Math.abs(ch[i]);
      if (abs > peak) peak = abs;
    }
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

  const weighted = channels.map((ch) => kWeight(ch, sampleRate));
  const blockSamples = Math.round(BLOCK_SECONDS * sampleRate);
  const hopSamples = Math.round(BLOCK_HOP_SECONDS * sampleRate);
  const length = weighted[0]?.length ?? 0;
  if (length < blockSamples) return { integratedLufs: null, peakDb };

  const blockPower: number[] = [];
  for (let start = 0; start + blockSamples <= length; start += hopSamples) {
    let sum = 0;
    for (const ch of weighted) {
      let chSum = 0;
      for (let i = start; i < start + blockSamples; i++) chSum += ch[i] * ch[i];
      sum += chSum / blockSamples;
    }
    blockPower.push(sum);
  }
  if (blockPower.length === 0) return { integratedLufs: null, peakDb };

  const toLufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity);

  const absoluteGated = blockPower.filter((p) => toLufs(p) > ABSOLUTE_GATE_LUFS);
  if (absoluteGated.length === 0) return { integratedLufs: null, peakDb };
  const ungatedMean = absoluteGated.reduce((a, b) => a + b, 0) / absoluteGated.length;
  const relativeThreshold = toLufs(ungatedMean) + RELATIVE_GATE_OFFSET_LU;

  const relativeGated = absoluteGated.filter((p) => toLufs(p) > relativeThreshold);
  const finalSet = relativeGated.length > 0 ? relativeGated : absoluteGated;
  const finalMean = finalSet.reduce((a, b) => a + b, 0) / finalSet.length;
  return { integratedLufs: toLufs(finalMean), peakDb };
}
