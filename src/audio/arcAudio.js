// Arc sound synthesised from the simulated arc state (no recordings).
// Short-circuit transfer: a train of short-circuit "crackles" at the simulated short-circuit
// frequency, made irregular by arc instability. Spray: steady hiss with a soft buzz.
// Globular: irregular, louder pops. SMAW: crackle that coarsens with a long arc and turns to a soft
// buzz with a short one. Plus gas pre-flow hiss, wire-feeder motor and spatter ticks.
// The sound is placed at the arc with an HRTF panner, so it moves with the work.

import * as THREE from 'three';

function noiseBuffer(ctx, seconds, color = 'white') {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return buf;
}

// A short-circuit event: sharp broadband click with a fast decay and a little low thump.
function clickBuffer(ctx, ms, seed) {
  const n = Math.floor((ctx.sampleRate * ms) / 1000);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const f = 90 + rnd() * 80;
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t / (0.0009 + rnd() * 0.0002));
    const env2 = Math.exp(-t / 0.004);
    d[i] = (rnd() * 2 - 1) * env * 0.9 + Math.sin(2 * Math.PI * f * t) * env2 * 0.35;
  }
  return buf;
}

export class ArcAudio {
  constructor(listener) {
    this.listener = listener;
    this.ctx = listener.context;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // positional output at the arc
    this.positional = new THREE.PositionalAudio(listener);
    this.positional.setRefDistance(0.35);
    this.positional.setRolloffFactor(1.2);
    this.positional.panner.panningModel = 'HRTF';
    this.positional.setNodeSource(this.master);
    // buses
    this.crackleBus = ctx.createBiquadFilter();
    this.crackleBus.type = 'highpass';
    this.crackleBus.frequency.value = 350;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0.8;
    this.crackleBus.connect(this.crackleGain).connect(this.master);

    // continuous noise beds
    const white = noiseBuffer(ctx, 2.0, 'white');
    const pink = noiseBuffer(ctx, 2.0, 'pink');
    const loop = (buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start();
      return src;
    };
    // spray / arc hiss
    this.hissSrc = loop(white);
    this.hissBP = ctx.createBiquadFilter();
    this.hissBP.type = 'bandpass';
    this.hissBP.frequency.value = 4200;
    this.hissBP.Q.value = 0.7;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    this.hissSrc.connect(this.hissBP).connect(this.hissGain).connect(this.master);
    // arc buzz (spray "hum" and arc roar)
    this.buzz = ctx.createOscillator();
    this.buzz.type = 'sawtooth';
    this.buzz.frequency.value = 300;
    this.buzzLP = ctx.createBiquadFilter();
    this.buzzLP.type = 'lowpass';
    this.buzzLP.frequency.value = 1200;
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    this.buzz.connect(this.buzzLP).connect(this.buzzGain).connect(this.master);
    this.buzz.start();
    // gas flow hiss (at the nozzle; non-positional, close to the hand anyway)
    this.gasSrc = loop(pink);
    this.gasHP = ctx.createBiquadFilter();
    this.gasHP.type = 'highpass';
    this.gasHP.frequency.value = 1800;
    this.gasGain = ctx.createGain();
    this.gasGain.gain.value = 0;
    this.gasSrc.connect(this.gasHP).connect(this.gasGain).connect(this.master);
    // wire feeder motor
    this.motor = ctx.createOscillator();
    this.motor.type = 'square';
    this.motor.frequency.value = 95;
    this.motorLP = ctx.createBiquadFilter();
    this.motorLP.type = 'lowpass';
    this.motorLP.frequency.value = 420;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motor.connect(this.motorLP).connect(this.motorGain).connect(ctx.destination);
    this.motor.start();
    // room tone: extractor fan (non-positional)
    this.roomSrc = loop(pink);
    this.roomLP = ctx.createBiquadFilter();
    this.roomLP.type = 'lowpass';
    this.roomLP.frequency.value = 500;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0.05;
    this.roomSrc.connect(this.roomLP).connect(this.roomGain).connect(ctx.destination);

    this.clicks = [];
    for (let i = 0; i < 10; i++) this.clicks.push(clickBuffer(ctx, 8 + i, 1234 + i * 977));
    this.pops = [];
    for (let i = 0; i < 6; i++) this.pops.push(clickBuffer(ctx, 22 + i * 3, 4321 + i * 131));
    this.nextEvent = 0;
    this.volume = 1;
    this.arcOn = false;
  }

  get object() {
    return this.positional;
  }

  setVolume(v) {
    this.volume = v;
    this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.05);
    this.roomGain.gain.setTargetAtTime(0.05 * v, this.ctx.currentTime, 0.05);
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  playBuffer(buf, when, gain, rate = 1, dest = this.crackleBus) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(when);
  }

  // st: { trigger, arcOn, arc (arcState) or null, wfs }
  update(st) {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const arc = st.arc;
    const on = !!(st.arcOn && arc);
    const tc = 0.03;
    // gas: flows while the trigger is held (pre-flow) and briefly after (post-flow)
    const gasLevel = st.trigger && st.gasFlow > 0 ? Math.min(1, st.gasFlow / 20) * 0.05 : 0;
    this.gasGain.gain.setTargetAtTime(gasLevel * this.volume, now, st.trigger ? 0.05 : 0.4);
    // wire feeder motor: wire processes only (SMAW has no feeder)
    const feed = on && st.wfs > 0;
    this.motorGain.gain.setTargetAtTime(feed ? 0.025 * this.volume : 0, now, 0.04);
    if (feed) this.motor.frequency.setTargetAtTime(60 + st.wfs * 9, now, 0.1);

    if (!on) {
      this.hissGain.gain.setTargetAtTime(0, now, tc);
      this.buzzGain.gain.setTargetAtTime(0, now, tc);
      this.nextEvent = 0;
      this.arcOn = false;
      return;
    }
    const startBurst = !this.arcOn;
    this.arcOn = true;
    const instab = 1 - arc.stability;
    let hiss = 0, buzz = 0;
    // SMAW: how far the arc length is outside the electrode's window (0 inside)
    const smaw = arc.mode === 'smaw';
    const long = smaw ? Math.max(0, (arc.arcLen - arc.lWindow[1]) / Math.max(arc.lWindow[1], 0.5)) : 0;
    const short = smaw ? Math.max(0, (arc.lWindow[0] - arc.arcLen) / Math.max(arc.lWindow[0], 0.5)) : 0;
    if (smaw) {
      // Hobart/Miller 155095F: "A short arc with correct amperage will give a sharp, crackling sound";
      // Hobart "Basic Stick Welding": too long "makes a coarse, uneven cracking sound", too short "a
      // soft buzzing noise". Levels and pitches are design values.
      hiss = 0.09 * (1 - Math.min(0.7, short));
      buzz = 0.008 + 0.07 * Math.min(1, short * 2);
      this.hissBP.frequency.setTargetAtTime(4200 - 1600 * Math.min(1, long), now, 0.05);
      this.buzz.frequency.setTargetAtTime(110, now, 0.1);
    } else if (arc.mode === 'gtaw') {
      // GTAW: a quiet steady hiss and hum without the crackle of metal transfer; a long arc sounds
      // louder and harsher (levels and pitches are design values)
      const longT = Math.max(0, (arc.arcLen - arc.lWindow[1]) / arc.lWindow[1]);
      hiss = 0.03 + 0.04 * Math.min(1, longT);
      buzz = 0.016;
      this.hissBP.frequency.setTargetAtTime(2200 + 6 * arc.I, now, 0.05);
      this.buzz.frequency.setTargetAtTime(100 + 0.4 * arc.I, now, 0.1);
    } else if (arc.mode === 'spray') {
      hiss = 0.22;
      buzz = 0.05;
      this.hissBP.frequency.setTargetAtTime(3600 + arc.I * 4, now, 0.05);
      this.buzz.frequency.setTargetAtTime(180 + arc.U * 4, now, 0.1);
    } else if (arc.mode === 'globular') {
      hiss = 0.12;
      buzz = 0.03;
      this.hissBP.frequency.setTargetAtTime(2800, now, 0.05);
      this.buzz.frequency.setTargetAtTime(140, now, 0.1);
    } else {
      hiss = 0.05 + 0.04 * Math.max(0, arc.dU) / 3;
      buzz = 0.012;
      this.hissBP.frequency.setTargetAtTime(3000, now, 0.05);
      this.buzz.frequency.setTargetAtTime(120, now, 0.1);
    }
    hiss *= 1 + instab * 0.8;
    this.hissGain.gain.setTargetAtTime(hiss * this.volume, now, tc);
    this.buzzGain.gain.setTargetAtTime(buzz * this.volume, now, tc);

    // discrete events scheduled ahead (lookahead scheduler)
    const ahead = now + 0.12;
    if (this.nextEvent < now) this.nextEvent = now + 0.005;
    const gtaw = arc.mode === 'gtaw';
    if (startBurst && gtaw) {
      // HF start: a short burst of spark crackle before the arc settles
      for (let i = 0; i < 10; i++) this.playBuffer(this.clicks[i % this.clicks.length], now + 0.004 + i * 0.011, 0.25, 2.4 + Math.random() * 0.6);
    } else if (startBurst) this.playBuffer(this.pops[0], now + 0.002, 0.9);
    while (this.nextEvent < ahead) {
      const t = this.nextEvent;
      if (gtaw) {
        // a stable TIG arc is nearly silent apart from its hiss; an unstable one (contaminated tungsten,
        // wrong polarity) sputters
        const rate = 1 + 50 * instab;
        const dt = -Math.log(1 - Math.random()) / rate;
        if (instab > 0.2) this.playBuffer(this.clicks[(Math.random() * this.clicks.length) | 0], t, 0.1 + 0.3 * instab, 1.1 + Math.random() * 0.4);
        this.nextEvent = t + dt;
      } else if (smaw) {
        if (long > 0.05) {
          // coarse, uneven cracks
          const dt = 0.015 + Math.random() * (0.05 + 0.08 * Math.min(1, long));
          this.playBuffer(this.pops[(Math.random() * this.pops.length) | 0], t, 0.5 + 0.4 * Math.random(), 0.75 + Math.random() * 0.35);
          this.nextEvent = t + dt;
        } else {
          // sharp crackle (frying); fewer cracks as the arc gets too short
          const rate = (110 - 80 * Math.min(1, short * 2)) * (1 + 0.5 * instab);
          const dt = -Math.log(1 - Math.random()) / rate;
          this.playBuffer(this.clicks[(Math.random() * this.clicks.length) | 0], t, (0.22 + 0.25 * Math.random()) * (1 - 0.6 * Math.min(1, short * 2)), 1.25 + Math.random() * 0.5);
          this.nextEvent = t + dt;
        }
      } else if (arc.mode === 'short') {
        const f = Math.max(20, arc.scFreq);
        const jitter = 0.15 + 1.1 * instab;
        const dt = (1 / f) * Math.exp((Math.random() - 0.5) * jitter * 1.6);
        const g = (0.35 + 0.4 * Math.random()) * (1 + 0.8 * instab);
        this.playBuffer(this.clicks[(Math.random() * this.clicks.length) | 0], t, g, 0.85 + Math.random() * 0.4);
        this.nextEvent = t + dt;
      } else if (arc.mode === 'globular') {
        const dt = 0.02 + Math.random() * 0.09;
        this.playBuffer(this.pops[(Math.random() * this.pops.length) | 0], t, 0.55 + 0.4 * Math.random(), 0.8 + Math.random() * 0.3);
        this.nextEvent = t + dt;
      } else {
        // spray: occasional faint ticks; unstable spray crackles more
        const rate = 6 + 60 * instab;
        const dt = -Math.log(1 - Math.random()) / rate;
        this.playBuffer(this.clicks[(Math.random() * this.clicks.length) | 0], t, 0.12 + 0.3 * instab, 1.4);
        this.nextEvent = t + dt;
      }
      // spatter ticks at the simulated spatter rate
      if (Math.random() < Math.min(0.6, arc.spatterRate / 200)) {
        this.playBuffer(this.clicks[(Math.random() * this.clicks.length) | 0], t + Math.random() * 0.02, 0.25, 1.8 + Math.random());
      }
    }
  }

  // one-off sounds
  // chipping hammer blow: a sharp metallic strike (slag coming off adds a few small ticks)
  chip(hit) {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playBuffer(this.pops[2], now, 0.7, 2.6);
    this.playBuffer(this.clicks[3], now + 0.001, 0.5, 3.2);
    if (hit) for (let i = 0; i < 4; i++) this.playBuffer(this.clicks[(i * 3) % this.clicks.length], now + 0.02 + i * 0.018 + Math.random() * 0.01, 0.12, 2.2 + Math.random());
  }

  brush() {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.playBuffer(this.clicks[i], now + i * 0.012, 0.08, 2.5);
  }
}
