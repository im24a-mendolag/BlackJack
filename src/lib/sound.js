'use client'

let volumeOn = true;
let audioCtx = null;
const audioCache = {};
const SOUND_FILES = {
  shuffle: '/sounds/shuffle.mp3',
  deal: '/sounds/deal.mp3',
  draw: '/sounds/draw.mp3',
  win: '/sounds/win.mp3',
  bust: '/sounds/bust.mp3',
  push: '/sounds/push.mp3',
  chip: '/sounds/chip.mp3',
  clearbet: '/sounds/clearbet.mp3',
  stand: '/sounds/stand.mp3',
};

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

function setVolumeEnabled(enabled) {
  volumeOn = !!enabled;
  Object.values(audioCache).forEach(audio => {
    if (audio) audio.volume = volumeOn ? 1 : 0;
  });
}

function playAudioEvent(event) {
  if (!volumeOn) return false;
  const src = SOUND_FILES[event];
  if (!src) return false;

  try {
    if (!audioCache[event]) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = volumeOn ? 1 : 0;
      audioCache[event] = audio;
    }
    const audio = audioCache[event];
    audio.currentTime = 0;
    void audio.play();
    return true;
  } catch {
    return false;
  }
}

function playTone({ frequency, duration = 0.12, type = 'sine', volume = 0.18, when = 0 }) {
  if (!volumeOn) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(0, ctx.currentTime + when);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.02);
}

function playNoise({ duration = 0.14, volume = 0.18, when = 0 }) {
  if (!volumeOn) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);

  source.connect(gain);
  gain.connect(ctx.destination);

  source.start(ctx.currentTime + when);
  source.stop(ctx.currentTime + when + duration);
}

function playCardDraw({ duration = 0.16, volume = 0.16, when = 0 }) {
  if (!volumeOn) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    // Pink-ish noise by reducing high frequencies slightly
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize * 0.5);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, ctx.currentTime + when);
  filter.Q.setValueAtTime(8, ctx.currentTime + when);
  filter.frequency.linearRampToValueAtTime(1200, ctx.currentTime + when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime + when);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(ctx.currentTime + when);
  source.stop(ctx.currentTime + when + duration);
}

export function playSound(event) {
  if (!volumeOn) return;

  switch (event) {
    case 'shuffle':
      // A short noise-like shuffle (fallback if no audio file)
      if (!playAudioEvent('shuffle')) {
        playNoise({ duration: 0.18, volume: 0.14 });
      }
      break;
    case 'deal':
      // Quick paper/card sound (fallback if no audio file)
      if (!playAudioEvent('deal')) {
        playTone({ frequency: 540, duration: 0.08, type: 'triangle', volume: 0.14 });
      }
      break;
    case 'draw':
    case 'hit':
      // Card draw / hit sound (same effect)
      // Prefer an audio file if provided, fall back to generated sound.
      if (!playAudioEvent('draw')) {
        playCardDraw({ duration: 0.16, volume: 0.16 });
      }
      break;
    case 'win':
      // Winning jingle (fallback if no audio file)
      if (!playAudioEvent('win')) {
        playTone({ frequency: 820, duration: 0.12, type: 'sine', volume: 0.16 });
        playTone({ frequency: 1020, duration: 0.16, type: 'sine', volume: 0.16, when: 0.11 });
      }
      break;
    case 'bust':
      // Sad descending tone (fallback if no audio file)
      if (!playAudioEvent('bust')) {
        playTone({ frequency: 520, duration: 0.14, type: 'sawtooth', volume: 0.15 });
        playTone({ frequency: 360, duration: 0.14, type: 'sawtooth', volume: 0.15, when: 0.12 });
      }
      break;
    case 'push':
      // Neutral tone (fallback if no audio file)
      if (!playAudioEvent('push')) {
        playTone({ frequency: 680, duration: 0.12, type: 'triangle', volume: 0.14 });
      }
      break;
    case 'chip':
      playAudioEvent('chip');
      break;
    case 'clearbet':
      playAudioEvent('clearbet');
      break;
    case 'stand':
      // Soft two-step descending tone — like placing a card down to stand
      if (!playAudioEvent('stand')) {
        playTone({ frequency: 500, duration: 0.1, type: 'triangle', volume: 0.13 });
        playTone({ frequency: 360, duration: 0.13, type: 'triangle', volume: 0.11, when: 0.09 });
      }
      break;
    default:
      break;
  }
}

export { setVolumeEnabled };
