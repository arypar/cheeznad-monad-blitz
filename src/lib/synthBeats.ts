export interface SynthEngine {
  unlock(): void;
  setMuted(m: boolean): void;
  kick(): void;
  hihat(): void;
  pop(freq?: number): void;
  whoosh(): void;
  rise(ms: number): void;
  chord(freqs: number[]): void;
  blip(): void;
  arpeggio(): void;
}

export function createSynthEngine(): SynthEngine {
  let ctx: AudioContext | null = null;
  let muted = false;
  let master: GainNode | null = null;

  function getDest(): { c: AudioContext; out: AudioNode } | null {
    if (muted) return null;
    if (!ctx) return null;
    if (ctx.state === "suspended") ctx.resume();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 1.0;
      master.connect(ctx.destination);
    }
    return { c: ctx, out: master };
  }

  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function setMuted(m: boolean) {
    muted = m;
  }

  // Heavy 808-style kick: layered sine + distorted sub
  function kick() {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;

    // Sub layer
    const sub = c.createOscillator();
    const subGain = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.15);
    subGain.gain.setValueAtTime(1.0, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    sub.connect(subGain).connect(out);
    sub.start(t);
    sub.stop(t + 0.45);

    // Click transient layer
    const click = c.createOscillator();
    const clickGain = c.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(800, t);
    click.frequency.exponentialRampToValueAtTime(100, t + 0.02);
    clickGain.gain.setValueAtTime(0.6, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    click.connect(clickGain).connect(out);
    click.start(t);
    click.stop(t + 0.05);

    // Body thump
    const body = c.createOscillator();
    const bodyGain = c.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(80, t);
    body.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    bodyGain.gain.setValueAtTime(0.8, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    body.connect(bodyGain).connect(out);
    body.start(t);
    body.stop(t + 0.5);
  }

  // Punchy hi-hat with body
  function hihat() {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;

    const bufferSize = c.sampleRate * 0.08;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const hpf = c.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = 5000;

    const peak = c.createBiquadFilter();
    peak.type = "peaking";
    peak.frequency.value = 8000;
    peak.gain.value = 8;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    noise.connect(hpf).connect(peak).connect(gain).connect(out);
    noise.start(t);
    noise.stop(t + 0.08);
  }

  // Deep, punchy pop with sub-bass body
  function pop(freq = 440) {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;

    // Main tone
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq * 2, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.18);

    // Sub body underneath
    const sub = c.createOscillator();
    const subGain = c.createGain();
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    subGain.gain.setValueAtTime(0.5, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    sub.connect(subGain).connect(out);
    sub.start(t);
    sub.stop(t + 0.2);
  }

  // Big filtered noise sweep
  function whoosh() {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;
    const dur = 0.6;

    const bufferSize = c.sampleRate * dur;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const bpf = c.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.setValueAtTime(150, t);
    bpf.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.5);
    bpf.frequency.exponentialRampToValueAtTime(300, t + dur);
    bpf.Q.value = 3;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + dur * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bpf).connect(gain).connect(out);
    noise.start(t);
    noise.stop(t + dur);
  }

  // Deep ascending tone with resonance
  function rise(ms: number) {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;
    const dur = ms / 1000;

    // Main sawtooth
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + dur);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.linearRampToValueAtTime(0.3, t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    const lpf = c.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(200, t);
    lpf.frequency.exponentialRampToValueAtTime(3000, t + dur);
    lpf.Q.value = 4;

    osc.connect(lpf).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur);

    // Sub sine underneath
    const sub = c.createOscillator();
    const subGain = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(40, t);
    sub.frequency.exponentialRampToValueAtTime(200, t + dur);
    subGain.gain.setValueAtTime(0.2, t);
    subGain.gain.linearRampToValueAtTime(0.35, t + dur * 0.8);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    sub.connect(subGain).connect(out);
    sub.start(t);
    sub.stop(t + dur);
  }

  // Rich multi-tone chord with layered waveforms
  function chord(freqs: number[]) {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;
    const dur = 1.2;
    const vol = 0.3 / freqs.length;

    freqs.forEach((f) => {
      // Sine foundation
      const osc1 = c.createOscillator();
      const g1 = c.createGain();
      osc1.type = "sine";
      osc1.frequency.value = f;
      g1.gain.setValueAtTime(vol, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc1.connect(g1).connect(out);
      osc1.start(t);
      osc1.stop(t + dur);

      // Triangle overtone for warmth
      const osc2 = c.createOscillator();
      const g2 = c.createGain();
      osc2.type = "triangle";
      osc2.frequency.value = f;
      g2.gain.setValueAtTime(vol * 0.4, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
      osc2.connect(g2).connect(out);
      osc2.start(t);
      osc2.stop(t + dur);
    });
  }

  // Percussive hover blip
  function blip() {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Bold ascending arpeggio
  function arpeggio() {
    const d = getDest();
    if (!d) return;
    const { c, out } = d;
    const t = c.currentTime;
    const notes = [262, 330, 392, 523, 659]; // C4, E4, G4, C5, E5

    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = t + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + 0.5);

      // Octave shimmer
      const shim = c.createOscillator();
      const shimGain = c.createGain();
      shim.type = "triangle";
      shim.frequency.value = f * 2;
      shimGain.gain.setValueAtTime(0, start);
      shimGain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      shimGain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      shim.connect(shimGain).connect(out);
      shim.start(start);
      shim.stop(start + 0.35);
    });
  }

  return { unlock, setMuted, kick, hihat, pop, whoosh, rise, chord, blip, arpeggio };
}
