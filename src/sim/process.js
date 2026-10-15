// Process model: electrical state, metal transfer, heat input, deposition, bead wetting
// and penetration for GMAW (ISO 4063 135), FCAW (136 gas-shielded, 114 self-shielded), and the entry
// points for SMAW (111, smaw.js) and GTAW (141, gtaw.js).
//
// STATUS: UNCALIBRATED ENGINEERING MODEL. Directions of effect follow published guidance
// (TWI Job Knowledge 004, EWI on CTWD, Kobelco on current/voltage/speed effects, EN 1011-1
// thermal efficiency). Coefficients are seed values to be replaced by the calibration welds
// described in the scope ("Calibration welds"). Every seed is labelled `seed` below.

import { clamp, interp } from './util.js';
import { smawArcState, smawDeposition, smawDefaults, nominalArcLength } from './smaw.js';
import { gtawArcState, gtawDefaults, rodMeltCapacity, ARC_WINDOW as GTAW_ARC } from './gtaw.js';

export const PROCESSES = {
  135: {
    id: '135', aws: 'GMAW', label: 'MAG, solid wire (135)',
    gasRequired: true, slag: false,
    k: 0.8, // EN 1011-1 thermal efficiency for MIG/MAG (TWI FAQ heat input; Weld Australia)
    currentFactor: 1.0,
    ctwdRef: 15, // mm
    stickOut: [15, 20], // mm, ESAB "stick out of 15 to 20mm"; Weld Australia FCAW/GMAW page
    travelAngle: [-5, 15], // deg, + = drag. ESAB: short-circuit "slight drag or a neutral gun angle". seed window
    efficiency: { short: 0.92, globular: 0.89, spray: 0.97 }, // seed (trade-source ranges 89-94 / 97 %)
  },
  136: {
    id: '136', aws: 'FCAW-G', label: 'MAG, flux-cored wire (136)',
    gasRequired: true, slag: true,
    k: 0.8,
    currentFactor: 0.9, // seed
    ctwdRef: 17,
    stickOut: [15, 20], // Weld Australia: gas-shielded "about 15-20 mm or less"
    travelAngle: [5, 20], // drag; Weld Australia: backhand (drag) common. seed window
    efficiency: { short: 0.86, globular: 0.85, spray: 0.86 }, // seed
  },
  111: {
    id: '111', aws: 'SMAW', label: 'MMA, covered electrode (111)',
    gasRequired: false, slag: true,
    k: 0.8, // TWI FAQ heat input, Kiwa (ISO 15614-1 guide), SSAB, Weld Australia: 0.8 for 111
    currentFactor: 1,
    ctwdRef: 3,
    stickOut: [0, 0], // no wire stick-out: the electrode burns back (see smaw.js)
    travelAngle: [10, 30], // drag: Lincoln C2.410 "Tip the electrode 10 to 30 degrees in the direction of travel"
    efficiency: { smaw: 1 }, // deposition comes from the electrode data (smaw.js)
    covered: true,
  },
  141: {
    id: '141', aws: 'GTAW', label: 'TIG, tungsten inert gas (141)',
    gasRequired: true, slag: false,
    k: 0.6, // TWI FAQ heat input, SSAB, Weld Australia: 0.6 for TIG
    currentFactor: 1,
    ctwdRef: 2.4,
    stickOut: [1.6, 3.2], // GTAW: the arc-length window (Miller OM-215994: 1/16 to 1/8 in, DC)
    travelAngle: [-20, -10], // push (negative = push): torch 70-80 deg to the work (Miller, TWI)
    efficiency: { gtaw: 1 }, // deposition comes from the filler rod (gtaw.js)
    tig: true,
  },
  114: {
    id: '114', aws: 'FCAW-S', label: 'Self-shielded flux-cored (114)',
    gasRequired: false, slag: true,
    k: 0.8,
    currentFactor: 0.88, // seed
    ctwdRef: 22, // Lincoln Innershield NR-440Ni2 / NR-233: CTWD 22 mm
    stickOut: [20, 25], // Weld Australia: self-shielded 20-25 mm
    travelAngle: [5, 20], // drag. seed window
    efficiency: { short: 0.82, globular: 0.8, spray: 0.82 }, // seed
  },
};

export const GASES = {
  'Ar-18CO2': { label: 'Ar + 18% CO2', spray: true, dUopt: 0 },
  CO2: { label: '100% CO2', spray: false, dUopt: 1.5 }, // CO2 runs ~1-2 V higher. seed
  none: { label: 'No gas', spray: false, dUopt: 0 },
  Ar: { label: 'Argon (ISO 14175 I1)', spray: false, dUopt: 0 },
};

// Current at CTWD 15 mm for 1.2 mm solid steel wire versus wire-feed speed (m/min).
// seed curve, consistent with TWI 004 (1.2 mm wire: dip ~100-200 A, spray ~250-400 A).
const I_TABLE_12 = [
  [2, 85], [3, 120], [4, 150], [5, 180], [6, 205], [8, 250], [10, 290], [12, 325], [14, 355],
];

export function currentFor(s, ctwd) {
  if (s.process === '111' || s.process === '141') return s.current; // constant-current source: the set current
  const p = PROCESSES[s.process];
  const base = interp(I_TABLE_12, s.wfs) * Math.pow(s.wire / 1.2, 1.6) * p.currentFactor;
  // EWI: at fixed wire feed, a longer CTWD lowers current. Exponent is a seed.
  const ct = clamp(ctwd, 5, 45);
  return base * Math.pow(p.ctwdRef / ct, 0.25);
}

// Optimum arc voltage. Straight lines through TWI 004 points for 1.2 mm wire:
// dip 17 V @100 A to 22 V @200 A; spray 27 V @250 A to 35 V @400 A.
export function optimumVoltage(s, I, mode) {
  const g = GASES[s.gas] || GASES['Ar-18CO2'];
  if (s.process === '135') {
    const u = mode === 'spray' ? 13.67 + 0.0533 * I : 12 + 0.05 * I;
    return u + g.dUopt;
  }
  if (s.process === '136') return 13 + 0.06 * I; // seed: 200 A -> 25 V, 250 A -> 28 V
  return 15 + 0.05 * I; // 114 seed
}

export function sprayTransitionCurrent(s) {
  // seed: about 230 A for 1.2 mm in Ar-rich gas, scaling with diameter
  return 230 * Math.pow(s.wire / 1.2, 1.3);
}

export function transferMode(s, I, U) {
  if (s.process !== '135') return 'spray'; // flux-cored treated as continuous transfer for the model
  const g = GASES[s.gas] || GASES['Ar-18CO2'];
  const It = sprayTransitionCurrent(s);
  if (I < It * 0.85) return 'short';
  if (!g.spray) return I > It ? 'globular' : 'short';
  const uSpray = optimumVoltage(s, I, 'spray');
  if (I >= It && U >= uSpray - 2.0) return 'spray';
  return I >= It ? 'globular' : 'short';
}

// Shielding quality 0..1 (1 = full coverage). Used by the porosity rule.
export function shieldingQuality(s, env, ctwd, travelAngle) {
  const p = PROCESSES[s.process];
  let q = 1;
  if (p.gasRequired) {
    const f = env.gasAvailable === false ? 0 : s.gasFlow;
    if (f < 8) q *= Math.pow(clamp(f / 8, 0, 1), 1.6); // seed: below ~8 L/min coverage falls
    if (f > 25) q *= clamp(1 - (f - 25) * 0.03, 0.4, 1); // turbulence draws in air. seed
    const wind = env.wind || 0; // m/s at the arc
    q *= clamp(1 - Math.max(0, wind - 1.0) * 0.45, 0, 1); // seed
    const nozzleToWork = ctwd - 3; // contact tip recessed ~3 mm in the nozzle (seed geometry)
    if (nozzleToWork > 20) q *= clamp(1 - (nozzleToWork - 20) * 0.06, 0.2, 1);
  } else {
    const wind = env.wind || 0;
    q *= clamp(1 - Math.max(0, wind - 4.0) * 0.25, 0, 1); // self-shielded is more wind tolerant. seed
  }
  const ta = Math.abs(travelAngle);
  if (ta > 25) q *= clamp(1 - (ta - 25) * 0.04, 0.3, 1); // steep angles aspirate air. seed
  return clamp(q, 0, 1);
}

// Full electrical and arc state for one instant. For SMAW (111) `ctwd` is the arc length.
// GTAW: env.gtaw carries the per-frame context (amperage control, tungsten state, filler melting).
export function arcState(s, ctwd, travelAngle, env = {}) {
  if (s.process === '111') return smawArcState(s, ctwd, travelAngle, env);
  if (s.process === '141') return gtawArcState(s, ctwd, travelAngle, env, env.gtaw || { fillerRate: gtawNominalFeed(s) });
  const p = PROCESSES[s.process];
  const I = currentFor(s, ctwd);
  const U = s.voltage;
  const mode = transferMode(s, I, U);
  const Uopt = optimumVoltage(s, I, mode);
  const dU = U - Uopt;
  const sigma = mode === 'spray' ? 3.0 : 2.5;
  let stability = Math.exp(-((dU / sigma) ** 2));
  if (mode === 'globular') stability *= 0.45;
  // Correct polarity comes from the consumable data sheet: solid and gas-shielded cored wires
  // here run DCEP; the self-shielded wire modelled for 114 is a DCEN type (wireNeedsDCEN).
  const polarityOk = s.wireNeedsDCEN ? s.polarity === 'DCEN' : s.polarity === 'DCEP';
  if (!polarityOk) stability *= 0.25; // wrong polarity: erratic arc, heavy spatter
  const [so0, so1] = p.stickOut;
  const arcLen = clamp(mode === 'spray' ? 4 + 0.6 * dU : 1.6 + 0.35 * dU, 0.5, 9);
  const stickOut = ctwd - arcLen;
  if (stickOut < so0 - 5 || stickOut > so1 + 8) stability *= 0.7;
  const shielding = shieldingQuality(s, env, ctwd, travelAngle);

  let wetting = { short: 0.5, globular: 0.42, spray: 0.7 }[mode];
  if (p.slag) wetting += 0.06;
  wetting += 0.07 * dU; // higher voltage: wider, flatter bead (Kobelco)
  wetting -= 0.008 * travelAngle; // drag narrows and raises the bead; push flattens. seed
  wetting = clamp(wetting, 0.12, 0.95);

  const spatterRate = ({ short: 6, globular: 30, spray: 1.5 }[mode] + (p.slag ? 2 : 0)) *
    (1 + 4 * (1 - stability)) * (polarityOk ? 1 : 4); // particles per second, seed
  const scFreq = mode === 'short' ? clamp(80 + 60 * (1 - Math.abs(dU) / 4), 30, 160) : 0; // Hz, seed

  return {
    I, U, Uopt, dU, mode, stability, arcLen, stickOut, shielding, wetting, spatterRate, scFreq,
    k: p.k, polarityOk,
  };
}

// Arc energy and heat input in kJ/mm. EN 1011-1 form:
// arc energy = U x I x 60 / (v[mm/min] x 1000); heat input = k x arc energy.
export function heatInput(k, U, I, v_mm_s) {
  const v = Math.max(v_mm_s, 0.05) * 60; // mm/min
  return (k * U * I * 60) / (v * 1000);
}

// Deposited metal volume rate (mm^3/s) = wire area x wire feed speed x deposition efficiency.
export function depositionRate(s, mode) {
  if (s.process === '111') return smawDeposition(s.electrode, s.dia, s.current);
  if (s.process === '141') return gtawNominalFeed(s);
  const p = PROCESSES[s.process];
  const A = (Math.PI * s.wire * s.wire) / 4;
  const wfs = (s.wfs * 1000) / 60; // mm/s
  return A * wfs * p.efficiency[mode];
}

// GTAW: filler metal fed on average by a welder dabbing at a steady rhythm: the rod is in the pool a
// share GTAW_FEED_DUTY of the time (seed), melting at the arc's capacity.
export const GTAW_FEED_DUTY = 0.35;
export function gtawNominalFeed(s) {
  return GTAW_FEED_DUTY * rodMeltCapacity(s.current);
}

// Penetration depth (mm) into the parent metal. seed model; monotonic in the directions
// published by Kobelco (current up -> deeper; voltage up -> shallower; speed up -> shallower)
// and ESAB (drag/pull gives better penetration than push).
export function penetration(I, Q_kJmm, mode, travelAngle, dU, fType = 1) {
  // SMAW: factor of the electrode coating (smaw.js: cellulosic deep, rutile shallow; seeds)
  const fMode = mode === 'smaw' || mode === 'gtaw' ? fType : { short: 1.0, globular: 0.9, spray: 1.4 }[mode];
  const ta = clamp(travelAngle, -20, 20);
  const fAngle = ta >= 0 ? 1 + 0.006 * ta : 1 + 0.008 * ta;
  const fArc = dU > 0 ? clamp(1 - 0.04 * dU, 0.7, 1) : clamp(1 - 0.02 * dU, 1, 1.1);
  const q = clamp(Q_kJmm, 0.05, 4);
  return 1.1 * Math.pow(I / 150, 1.3) * Math.pow(q / 0.5, 0.35) * fMode * fAngle * fArc;
}

// Default settings for each process and wire size (a sensible starting WPS for 10 mm plate).
export function defaultSettings(process = '135') {
  if (process === '111') return smawDefaults();
  if (process === '141') return gtawDefaults();
  if (process === '136') return { process, wire: 1.2, wfs: 8, voltage: 26.5, gas: 'Ar-18CO2', gasFlow: 15, polarity: 'DCEP', wireNeedsDCEN: false };
  if (process === '114') return { process, wire: 1.2, wfs: 6, voltage: 24, gas: 'none', gasFlow: 0, polarity: 'DCEN', wireNeedsDCEN: true };
  return { process, wire: 1.2, wfs: 5.5, voltage: 21.5, gas: 'Ar-18CO2', gasFlow: 15, polarity: 'DCEP', wireNeedsDCEN: false };
}

// Nominal contact-tip-to-work distance: middle of the stick-out window plus a short arc (seed).
export function nominalCTWD(process, settings = null) {
  // SMAW: the nominal arc length of the electrode in use
  if (process === '111') return settings && settings.electrode ? nominalArcLength(settings.electrode, settings.dia) : nominalArcLength('E7018', 3.2);
  if (process === '141') return (GTAW_ARC[0] + GTAW_ARC[1]) / 2;
  const p = PROCESSES[process];
  return (p.stickOut[0] + p.stickOut[1]) / 2 + 2;
}

export const SETTING_LIMITS = {
  wfs: [2, 14, 0.1],
  voltage: [14, 36, 0.1],
  gasFlow: [0, 30, 1],
  current: [30, 250, 5],
};
