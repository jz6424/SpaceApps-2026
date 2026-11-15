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
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    if (!musicMuted) startMusic();
  } catch {
    ctx = null; // no audio on this device: the game plays silently
  }
}
// Phones and tablets only allow sound from the end of a tap (touchend, click), not its start.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, wake, true);
// Quiet while the game is in a background tab, back on when you return.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

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
  osc.connect(gain).connect(out());
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
  src.connect(filter).connect(gain).connect(out());
  src.start(at);
}

// A rush of air: noise through a filter that glides from one pitch to another.
// shape: 'hump' swells then fades, 'decay' starts loud and thins out, 'swell' builds up.
function whoosh(at, length, level, from, to, shape = 'hump') {
  const size = Math.ceil(ctx.sampleRate * length), buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  if (shape === 'decay') {
    gain.gain.exponentialRampToValueAtTime(level, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  } else if (shape === 'swell') {
    gain.gain.exponentialRampToValueAtTime(level, at + length * 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  } else {
    gain.gain.exponentialRampToValueAtTime(level, at + length * 0.3);
    gain.gain.setValueAtTime(level, at + length * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  }
  src.connect(filter).connect(gain).connect(out());
  src.start(at);
}

// The airlock. The doors slide with a futuristic whoosh and chirp. The air pump is a long rush of
// air that thins out going out and builds back up coming in. seconds is how long it lasts.
//   door-open / door-close, pump-out / pump-in, prebreathe, done
export function airlockSound(kind, seconds = 1) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const at = ctx.currentTime + 0.02;
  if (kind === 'door-open' || kind === 'door-close') {
    const opening = kind === 'door-open', len = Math.max(0.35, seconds);
    blip(at, opening ? 1568 : 1175, 0.08, 'sine', 0.07);            // a chirp as the door wakes up
    blip(at + 0.07, opening ? 2093 : 880, 0.1, 'sine', 0.06);
    whoosh(at, len, 0.14, opening ? 500 : 3200, opening ? 3200 : 500, 'hump'); // the slide
    sweep(at, opening ? 220 : 520, opening ? 520 : 220, len, 'triangle', 0.05); // the motor, rising or falling
    blip(at + len, opening ? 1319 : 659, 0.14, 'sine', 0.05);         // a soft "locked" tone
    blip(at + len, 110, 0.12, 'sine', 0.11);                          // and a low thunk
  } else if (kind === 'pump-out') {
    whoosh(at, seconds, 0.2, 3200, 400, 'decay');                    // air leaving: loud, then thinner and thinner
    blip(at, 70, 0.3, 'sine', 0.12);
  } else if (kind === 'pump-in') {
    whoosh(at, seconds, 0.2, 400, 3200, 'swell');                    // air coming back: builds up
    blip(at + seconds, 1175, 0.2, 'sine', 0.06);
  } else if (kind === 'prebreathe') {
    // A slow pulse, once per breath in and out.
    for (let t = 0, i = 0; t < seconds - 0.5; t += 2.5, i++) {
      sweep(at + t, 180, 230, 1.2, 'sine', 0.06);
      sweep(at + t + 1.25, 230, 170, 1.2, 'sine', 0.05);
    }
  } else if (kind === 'done') {
    blip(at, 880, 0.12, 'sine', 0.08);
    blip(at + 0.12, 1319, 0.2, 'sine', 0.08);                        // pressure is ready
  }
}

// A station panel opening or closing: a smooth airy swoosh, then a gentle chime on top.
export function hologramSound(kind = 'open') {
  if (!live()) return;
  const at = ctx.currentTime + 0.01;
  if (kind === 'open') {
    whoosh(at, 0.3, 0.09, 700, 3600, 'hump');                        // the panel gliding open
    blip(at + 0.17, 1319, 0.55, 'sine', 0.1);                        // a soft chime as it settles
    blip(at + 0.17, 2637, 0.4, 'sine', 0.03);                        // with a quiet bright overtone
  } else {
    whoosh(at, 0.22, 0.06, 3200, 700, 'hump');                       // gliding shut
    blip(at + 0.12, 880, 0.2, 'sine', 0.05);
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


// ---------------------------------------------------------------------------------------------
// Effects: button clicks, warnings, solar storms and collecting. All made from blips and noise.
// ---------------------------------------------------------------------------------------------
const live = () => !muted && ctx && ctx.state === 'running';

// A tone that glides from one pitch to another.
function sweep(at, from, to, length, wave, level) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.linearRampToValueAtTime(to, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + Math.min(0.05, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out());
  osc.start(at);
  osc.stop(at + length + 0.02);
}

// A small soft tick for every button.
export function clickSound() {
  if (!live()) return;
  const at = ctx.currentTime + 0.005;
  blip(at, 1500, 0.05, 'sine', 0.05);
  blip(at, 760, 0.07, 'triangle', 0.035);
}
addEventListener('click', e => {
  const button = e.target?.closest?.('button');
  if (button && !button.disabled) clickSound();
}, true);

// Warnings. Level 1 is "careful", level 2 is "danger" and sounds faster and sharper.
// pitch lets a different warning (like low life support) use a lower voice of the same cue.
export function warningSound(level = 1, pitch = 1) {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  if (level >= 2) {
    [0, 0.16, 0.32, 0.48].forEach((t, i) => blip(at + t, (i % 2 ? 740 : 988) * pitch, 0.11, 'square', 0.055));
    duckMusic(2.5);
  } else {
    [0, 0.24].forEach(t => blip(at + t, 740 * pitch, 0.14, 'triangle', 0.11));
    duckMusic(1.5);
  }
}

// The battery ran out: a sinking "power down" tone.
export function lowPowerSound() {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  sweep(at, 330, 90, 1, 'sawtooth', 0.05);
  sweep(at, 220, 60, 1, 'sine', 0.12);
  duckMusic(2.5);
}

// Solar storms. warning: a rising and falling siren. start: a deep rumble. end: a calm chime.
export function stormSound(kind) {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  if (kind === 'warning') {
    for (let i = 0; i < 2; i++) sweep(at + i * 0.9, 520, 880, 0.45, 'sine', 0.1), sweep(at + i * 0.9 + 0.45, 880, 520, 0.45, 'sine', 0.1);
    duckMusic(3);
  } else if (kind === 'start') {
    rush(at, 4, 0.4, 'lowpass', 170);
    sweep(at, 58, 42, 4, 'sine', 0.2);
    duckMusic(6);
  } else {
    [523, 659, 784, 1047].forEach((f, i) => blip(at + i * 0.13, f, 0.8, 'sine', 0.09));
  }
}

// Collecting. A rock sample is a bright two-note ding; sending data is a quick rising blip.
export function sampleSound() {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  blip(at, 1319, 0.5, 'sine', 0.13);
  blip(at + 0.09, 1976, 0.7, 'sine', 0.12);
  blip(at + 0.09, 3951, 0.3, 'sine', 0.03);
}
// A mission won: one bright note for each star earned, climbing, then a soft chord under the last.
// lead: seconds before the first note. gap: seconds between notes (both match the success screen).
export function winSound(stars, gap = 0.5, lead = 0.5) {
  if (!live()) return;
  const at = ctx.currentTime + 0.02 + lead, notes = [659, 784, 1047];
  for (let i = 0; i < stars; i++) {
    blip(at + i * gap, notes[i], 0.8, 'sine', 0.13);
    blip(at + i * gap, notes[i] * 2, 0.4, 'sine', 0.035);
  }
  const end = at + Math.max(0, stars - 1) * gap + 0.14;
  [523, 659, 784].forEach(f => blip(end, f, 1.6, 'triangle', 0.04));
  duckMusic(lead + stars * gap + 1.5);
}

// Building with moon dirt: a low rumble of sliding dirt, then two soft notes as it settles.
export function buildSound() {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  rush(at, 1.4, 0.3, 'lowpass', 320);
  sweep(at, 90, 55, 1.2, 'sine', 0.12);
  blip(at + 1.25, 196, 0.5, 'sine', 0.12);
  blip(at + 1.4, 262, 0.7, 'sine', 0.1);
}
export function dataSentSound() {
  if (!live()) return;
  const at = ctx.currentTime + 0.02;
  blip(at, 880, 0.12, 'sine', 0.1);
  blip(at + 0.1, 1319, 0.22, 'sine', 0.1);
}

// ---------------------------------------------------------------------------------------------
// Music: slow, soft and spacey. Warm pad chords drift in and out (A minor 9, F major 7,
// C major 9, G 6), a low note holds each one, and a few bell notes echo over the top.
// It is all made live, so there is no music file. It never repeats exactly the same way twice.
// ---------------------------------------------------------------------------------------------
const MUSIC_KEY = 'moonbase.music';
const loadVolume = (key, fallback) => {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch { return fallback; }
};
let musicVol = loadVolume('moonbase.musicVol', 0.8); // 0 to 1
let sfxVol = loadVolume('moonbase.sfxVol', 1);
let sfxGain = null;
// All sound effects play through this one volume knob.
function out() {
  if (!sfxGain) {
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVol;
    sfxGain.connect(ctx.destination);
  }
  return sfxGain;
}
let musicMuted = false;
try { musicMuted = localStorage.getItem(MUSIC_KEY) === 'off'; } catch { /* storage blocked: music stays on */ }
let music = null; // { master, bus, bells, timer, nextChord, nextBell, chord }

export const musicOn = () => !musicMuted;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

// [bass, pad notes], as MIDI note numbers. Each chord lasts CHORD_SECONDS.
const CHORDS = [
  [45, [57, 60, 64, 67, 71]],  // A minor 9
  [41, [57, 60, 64, 65]],      // F major 7
  [48, [55, 59, 62, 64]],      // C major 9
  [43, [59, 62, 64, 67]],      // G 6
];
const CHORD_SECONDS = 8;
const BELLS = [69, 72, 74, 76, 79, 81]; // A minor pentatonic: it sounds fine over every chord

// A room-sized echo: noise that fades away over a few seconds.
function reverbBuffer(seconds = 3.5) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

function startMusic() {
  if (music || !ctx) return;
  const master = ctx.createGain();
  master.gain.value = musicMuted ? 0 : musicVol;
  master.connect(ctx.destination);
  const bus = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), room = ctx.createConvolver();
  room.buffer = reverbBuffer();
  dry.gain.value = 0.7;
  wet.gain.value = 0.5;
  bus.connect(dry).connect(master);
  bus.connect(room).connect(wet).connect(master);
  // Bells also go through a slow echo, which gives the "floating in space" feel.
  const bells = ctx.createGain(), echo = ctx.createDelay(2), feedback = ctx.createGain(), tone = ctx.createBiquadFilter();
  echo.delayTime.value = 0.62;
  feedback.gain.value = 0.4;
  tone.type = 'lowpass';
  tone.frequency.value = 1800;
  bells.connect(bus);
  bells.connect(echo);
  echo.connect(tone).connect(feedback).connect(echo);
  tone.connect(bus);
  music = { master, bus, bells, nextChord: ctx.currentTime + 0.3, nextBell: ctx.currentTime + 3, chord: 0 };
  music.timer = setInterval(scheduleMusic, 500);
  scheduleMusic();
}

// One pad or bass note that swells in slowly and fades out slowly.
function swell(freq, at, hold, peak, wave, detune) {
  const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 3);
  gain.gain.setValueAtTime(peak, at + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + hold + 4);
  osc.connect(filter).connect(gain).connect(music.bus);
  osc.start(at);
  osc.stop(at + hold + 4.1);
}

function bell(at, midi) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.05, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 3);
  gain.connect(music.bells);
  [[1, 1], [2, 0.25]].forEach(([mult, level]) => {
    const osc = ctx.createOscillator(), part = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz(midi) * mult;
    part.gain.value = level;
    osc.connect(part).connect(gain);
    osc.start(at);
    osc.stop(at + 3.1);
  });
}

// Runs twice a second and plans the next few seconds of music ahead of time.
function scheduleMusic() {
  if (!music || !ctx) return;
  const now = ctx.currentTime;
  if (music.nextChord < now) music.nextChord = now + 0.1; // the tab was asleep: pick up from here
  while (music.nextChord < now + 6) {
    const [bass, pad] = CHORDS[music.chord % CHORDS.length];
    swell(hz(bass), music.nextChord, CHORD_SECONDS, 0.05, 'sine', 0);
    pad.forEach(n => {
      swell(hz(n), music.nextChord, CHORD_SECONDS, 0.012, 'sine', -4);
      swell(hz(n), music.nextChord, CHORD_SECONDS, 0.01, 'triangle', 5);
    });
    music.nextChord += CHORD_SECONDS;
    music.chord++;
  }
  if (music.nextBell < now) music.nextBell = now + 1;
  while (music.nextBell < now + 6) {
    bell(music.nextBell, BELLS[Math.floor(Math.random() * BELLS.length)]);
    music.nextBell += 2.5 + Math.random() * 3.5;
  }
}

// Alerts make the music a little quieter for a moment so they stand out.
export function duckMusic(seconds) {
  if (!music || musicMuted) return;
  const now = ctx.currentTime;
  music.master.gain.cancelScheduledValues(now);
  music.master.gain.setTargetAtTime(musicVol * 0.35, now, 0.2);
  music.master.gain.setTargetAtTime(musicVol, now + seconds, 0.9);
}

export function setMusic(on) {
  musicMuted = !on;
  try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off'); } catch { /* not saved, still works */ }
  if (on) startMusic();
  if (music) {
    music.master.gain.cancelScheduledValues(ctx.currentTime);
    music.master.gain.setTargetAtTime(on ? musicVol : 0, ctx.currentTime, 0.4);
  }
  syncMusicButtons();
}

// Every button marked data-music (start screen, pause menu, mission box) toggles the music.
function syncMusicButtons() {
  document.querySelectorAll('[data-music]').forEach(b => {
    b.textContent = musicOn() ? 'Music on' : 'Music off';
    b.setAttribute('aria-pressed', musicOn());
  });
}
addEventListener('click', e => {
  if (e.target?.closest?.('[data-music]')) setMusic(!musicOn());
}, true);
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', syncMusicButtons);
else syncMusicButtons();

export const getVolume = which => (which === 'music' ? musicVol : sfxVol);
export function setVolume(which, v) {
  v = Math.min(1, Math.max(0, v));
  const save = (key, val) => { try { localStorage.setItem(key, String(val)); } catch { /* not saved, still works */ } };
  if (which === 'music') {
    musicVol = v;
    save('moonbase.musicVol', v);
    if (music && !musicMuted) music.master.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  } else {
    sfxVol = v;
    save('moonbase.sfxVol', v);
    if (sfxGain) sfxGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }
  syncVolumeControls();
}
function syncVolumeControls() {
  document.querySelectorAll('[data-volume]').forEach(input => {
    const v = Math.round(getVolume(input.dataset.volume) * 100);
    if (document.activeElement !== input || +input.value !== v) input.value = v;
    input.style.setProperty('--fill', `${v}%`);
    const label = input.closest('.volume-row')?.querySelector('output');
    if (label) label.textContent = `${v}%`;
  });
}
addEventListener('input', e => {
  const input = e.target?.closest?.('[data-volume]');
  if (input) setVolume(input.dataset.volume, input.value / 100);
}, true);
// Let go of the effects slider and you hear a click at the new volume.
addEventListener('change', e => {
  if (e.target?.dataset?.volume === 'sfx') { wake(); setTimeout(clickSound, 30); }
}, true);
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', syncVolumeControls);
else syncVolumeControls();

// For the sound test page.
export const stopMusic = () => { if (music) { clearInterval(music.timer); music.master.disconnect(); music = null; } };
export const wakeAudio = wake;
