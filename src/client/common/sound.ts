// Tiny synthesizer: every sound is generated with Web Audio, no asset files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem('katok-muted') === '1';
let musicTimer = 0;

function ac(): AudioContext | null {
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a click handler so browsers allow audio. */
export function unlockAudio() {
  ac();
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('katok-muted', m ? '1' : '0');
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, vol = 0.2, freq = 1200) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  pop() {
    tone(520, 0, 0.12, 'triangle', 0.25, 980);
  },
  click() {
    tone(700, 0, 0.06, 'square', 0.08);
  },
  tick(urgent = false) {
    tone(urgent ? 1200 : 900, 0, 0.05, 'square', urgent ? 0.14 : 0.08);
  },
  /** "Reng!" – time is up. */
  ring() {
    for (let r = 0; r < 3; r++) {
      const s = r * 0.32;
      [1318, 1976, 2637].forEach((f, k) => tone(f, s, 0.9, 'sine', 0.22 / (k + 1)));
      noise(s, 0.05, 0.15, 4000);
    }
  },
  start() {
    [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.25));
  },
  correct() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.25));
  },
  wrong() {
    tone(330, 0, 0.25, 'sawtooth', 0.12, 220);
    tone(220, 0.22, 0.35, 'sawtooth', 0.12, 150);
  },
  reveal() {
    tone(196, 0, 0.18, 'square', 0.12);
    tone(294, 0.12, 0.18, 'square', 0.12);
    [392, 494, 587].forEach((f) => tone(f, 0.26, 0.6, 'triangle', 0.18));
  },
  /** Clip-clop for `seconds`. */
  gallop(seconds: number) {
    const beats = Math.floor(seconds / 0.11);
    for (let i = 0; i < beats; i++) {
      const accent = i % 4 === 0;
      noise(i * 0.11, 0.04, accent ? 0.35 : 0.2, accent ? 700 : 1100);
    }
  },
  fanfare() {
    const seq: [number, number, number][] = [
      [523, 0, 0.18], [523, 0.18, 0.18], [523, 0.36, 0.18], [659, 0.54, 0.5],
      [587, 1.04, 0.18], [659, 1.22, 0.18], [784, 1.4, 0.9],
    ];
    for (const [f, s, d] of seq) {
      tone(f, s, d, 'square', 0.12);
      tone(f / 2, s, d, 'triangle', 0.15);
    }
  },
};

/** Light looping tune for the question timer. */
export function startMusic() {
  stopMusic();
  const bass = [130.8, 130.8, 174.6, 196, 130.8, 130.8, 155.6, 196];
  const lead = [523, 659, 784, 659, 587, 698, 784, 698];
  let step = 0;
  const play = () => {
    const i = step % 8;
    tone(bass[i], 0, 0.22, 'triangle', 0.16);
    if (step % 2 === 0) tone(lead[(step / 2) % 8], 0, 0.15, 'square', 0.04);
    noise(0, 0.02, 0.06, 6000);
    step++;
  };
  play();
  musicTimer = window.setInterval(play, 250);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = 0;
}
