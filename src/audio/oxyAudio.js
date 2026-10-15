// Sound of the oxy-fuel torch, synthesised from the simulated state (no recordings), placed at the tip:
//   the roar of the preheat flame (louder with the gas flow; a soft, lazy rumble for acetylene alone),
//   the rush of the cutting oxygen, and the sputter of the cut ("The correct cutting speed is accompanied by a
//   sputtering sound" - Harris), the escaping gas while purging or bleeding, the "pop" of a backfire or of a
//   wrong shut-down, and the squeal of a sustained backfire (AWS Fact Sheet 28: "an initial popping sound
//   followed by a squealing or hissing sound"; Victor 0056-3260: "a shrill hissing sound"). Levels and
//   spectra are display choices.

import * as THREE from 'three';

function noiseBuffer(ctx, seconds, pink = false) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return buf;
}

function popBuffer(ctx, ms, f0, seed) {
  const n = Math.floor((ctx.sampleRate * ms) / 1000);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    d[i] = (rnd() * 2 - 1) * Math.exp(-t / 0.004) * 0.8 + Math.sin(2 * Math.PI * f0 * t * (1 - t * 3)) * Math.exp(-t / 0.03) * 0.9;
  }
  return buf;
}

export class OxyAudio {
  constructor(listener) {
    this.ctx = listener.context;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.positional = new THREE.PositionalAudio(listener);
    this.positional.setRefDistance(0.4);
    this.positional.setRolloffFactor(1.1);
    this.positional.panner.panningModel = 'HRTF';
    this.positional.setNodeSource(this.master);
    const white = noiseBuffer(ctx, 2), pink = noiseBuffer(ctx, 2, true);
    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const chain = (src, type, f, q) => {
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      if (q != null) flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(flt).connect(g).connect(this.master);
      return { flt, g };
    };
    this.roar = chain(loop(pink), 'bandpass', 700, 0.6); // preheat flame
    this.lazy = chain(loop(pink), 'lowpass', 260, 0.7); // acetylene alone
    this.jet = chain(loop(white), 'highpass', 1600, 0.5); // cutting oxygen
    this.gas = chain(loop(white), 'bandpass', 5200, 0.9); // gas escaping (purge, bleed)
    this.squeal = chain(loop(white), 'bandpass', 3800, 12); // sustained backfire
    this.whistle = ctx.createOscillator();
    this.whistle.type = 'sine';
    this.whistle.frequency.value = 3100;
    this.whistleG = ctx.createGain();
    this.whistleG.gain.value = 0;
    this.whistle.connect(this.whistleG).connect(this.master);
    this.whistle.start();
    this.sputBus = ctx.createBiquadFilter();
    this.sputBus.type = 'highpass';
    this.sputBus.frequency.value = 500;
    this.sputBus.connect(this.master);
    this.crackles = [];
    for (let i = 0; i < 8; i++) this.crackles.push(popBuffer(ctx, 6 + i, 180 + i * 30, 777 + i * 311));
    this.pops = [popBuffer(ctx, 60, 90, 4242), popBuffer(ctx, 80, 70, 9191)];
    this.next = 0;
    this.volume = 1;
  }

  get object() {
    return this.positional;
  }

  setVolume(v) {
    this.volume = v;
    this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.05);
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  play(buf, when, gain, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sputBus);
    src.start(when);
  }

  // st: { lit, type ('fuel' | 'carburizing' | 'neutral' | 'oxidizing'), size, fuelQ, o2Q (scfh out of the tip),
  //       lever, cutting, rate (0..1), sustained (bool), events [] }
  update(st) {
    const ctx = this.ctx, now = ctx.currentTime, k = 0.05;
    const set = (node, v) => node.gain.setTargetAtTime(v, now, k);
    const lit = !!st.lit;
    const fuelOnly = lit && st.type === 'fuel';
    set(this.roar.g, lit && !fuelOnly ? 0.05 + 0.05 * Math.min(2, st.size || 1) + (st.lever > 0.3 ? 0.05 : 0) : 0);
    this.roar.flt.frequency.setTargetAtTime(st.type === 'oxidizing' ? 950 : 700, now, 0.1);
    set(this.lazy.g, fuelOnly ? 0.12 + 0.06 * Math.min(2, st.size || 1) : 0);
    set(this.jet.g, st.lever > 0.3 && (st.o2Q || 0) > 1 ? 0.07 + (st.cutting ? 0.07 : 0) : 0);
    // unlit gas out of the torch (purging, bleeding)
    const out = !lit ? Math.min(1, ((st.fuelQ || 0) + (st.o2Q || 0)) / 40) : 0;
    set(this.gas.g, 0.06 * out);
    set(this.squeal.g, st.sustained ? 0.25 : 0);
    set(this.whistleG, st.sustained ? 0.05 : 0);
    // sputter of the cut
    if (st.cutting && now >= this.next) {
      const rate = 25 + 60 * (st.rate || 0);
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const b = this.crackles[Math.floor(Math.random() * this.crackles.length)];
        this.play(b, now + Math.random() * 0.01, 0.12 + Math.random() * 0.12, 0.8 + Math.random() * 0.5);
      }
      this.next = now + (1 / rate) * (0.5 + Math.random());
    }
    for (const e of st.events || []) {
      if (e === 'pop' || e === 'backfire' || e === 'blownOff' || e === 'flashbackStopped') this.play(this.pops[0], now, 0.9);
      else if (e === 'flashback') this.play(this.pops[1], now, 1.2, 0.8);
      else if (e === 'lit') this.play(this.pops[1], now, 0.25, 1.6);
      else if (e === 'spark') this.play(this.crackles[2], now, 0.3, 2.2);
    }
  }
}
