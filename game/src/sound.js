// The game's sounds, made in the browser with WebAudio so there are no audio files to load.
// Browsers only allow sound after the player has clicked or pressed a key, so the first click
// or key press anywhere switches it on.
const KEY = 'moonbase.sound';
let ctx = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* storage blocked: sound stays on */ }

function wake() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null; // no audio on this device: the game plays silently
  }
}
addEventListener('pointerdown', wake, true);
addEventListener('keydown', wake, true);

export const soundOn = () => !muted;
export function setSound(on) {
  muted = !on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* not saved, still works */ }
}

// One soft blip: a quick rise, then it rings off.
function blip(at, freq, length, wave, level) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

// A burst of filtered noise, for air and for the thud of a door.
function rush(at, length, level, type, freq) {
  const size = Math.ceil(ctx.sampleRate * length), buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = type;
  filter.frequency.value = freq;
  const fade = Math.min(0.25, length / 3);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + fade);
  gain.gain.setValueAtTime(level, at + length - fade);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(at);
}

// The airlock: a clunk when a door shuts or opens, a hiss for as long as the air is moving.
export function airlockSound(kind, seconds = 1) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + 0.02;
  if (kind === 'clunk') {
    blip(at, 92, 0.22, 'sine', 0.3);
    rush(at, 0.09, 0.12, 'lowpass', 900);
  } else {
    rush(at, Math.max(0.3, seconds), 0.045, 'highpass', 2600);
  }
}

// The incoming-message cue, in the rhythm "doop, do, dodo, doop": long, short, two quick, long.
// [start, length] of each note in seconds.
const RHYTHM = [[0, 0.15], [0.19, 0.08], [0.31, 0.07], [0.39, 0.07], [0.5, 0.2]];
// The base computer and Mission Control play the same rhythm in different notes, so you can
// tell who is talking without looking. Frequencies in hertz.
const VOICES = {
  base: { notes: [587, 440, 587, 587, 784], wave: 'triangle', level: 0.11 },
  earth: { notes: [784, 659, 784, 784, 1047], wave: 'sine', level: 0.1 },
};
let lastCue = -1;
export let cuesPlayed = 0; // for scripted checks

export function messageCue(fromEarth) {
  if (muted || !ctx || ctx.state !== 'running') return;
  if (ctx.currentTime - lastCue < 0.75) return; // several messages at once share one cue
  lastCue = ctx.currentTime;
  cuesPlayed++;
  const voice = fromEarth ? VOICES.earth : VOICES.base, t0 = ctx.currentTime + 0.02;
  RHYTHM.forEach(([start, length], i) => blip(t0 + start, voice.notes[i], length, voice.wave, voice.level));
}
