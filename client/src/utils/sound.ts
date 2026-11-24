export type SoundType =
  | 'BANG'
  | 'HIT'
  | 'HEAL'
  | 'MISSED'
  | 'BOOM'
  | 'DEATH'
  | 'DRAW'
  | 'TURN';

const SOUND_KEY = 'bang_sound_enabled';
let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  delay = 0
): void {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playNoise(ctx: AudioContext, duration: number, gainPeak: number): void {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / length) * 4);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainPeak, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export function playSound(sound: SoundType): void {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getContext();
    if (!ctx) return;

    switch (sound) {
      case 'BANG':
        playNoise(ctx, 0.16, 0.28);
        playTone(ctx, 320, 75, 0.14, 'sawtooth', 0.18);
        break;
      case 'HIT':
        playTone(ctx, 180, 55, 0.18, 'triangle', 0.25);
        break;
      case 'BOOM':
        playNoise(ctx, 0.45, 0.35);
        playTone(ctx, 140, 35, 0.42, 'sawtooth', 0.26);
        break;
      case 'HEAL':
        playTone(ctx, 440, 660, 0.16, 'sine', 0.14, 0);
        playTone(ctx, 660, 880, 0.2, 'sine', 0.14, 0.1);
        break;
      case 'MISSED':
        playTone(ctx, 740, 420, 0.14, 'sine', 0.13);
        break;
      case 'DEATH':
        playTone(ctx, 260, 90, 0.45, 'sawtooth', 0.18);
        break;
      case 'DRAW':
        playTone(ctx, 520, 680, 0.08, 'triangle', 0.08);
        break;
      case 'TURN':
        playTone(ctx, 523, 523, 0.1, 'triangle', 0.12, 0);
        playTone(ctx, 659, 659, 0.16, 'triangle', 0.12, 0.09);
        break;
    }
  } catch {
    // ignore autoplay or audio context errors
  }
}
