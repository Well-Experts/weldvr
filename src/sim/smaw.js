// Shielded metal arc welding (ISO 4063 process 111, SMAW / MMA / stick): covered electrodes, their
// current ranges, deposition and burn-off, storage, and the arc state for a given arc length.
//
// Sources (manufacturer data sheets and guides; numbers as printed, see README "SMAW sources"):
//   E6010  Hobart 610 data sheet (rev. 180316): DCEP ranges, optimum current, arc voltage, deposition;
//          Lincoln Fleetweld 5P+ (DC+ ranges). Arc length "Average length (1/8" to 1/4")". Storage at
//          room temperature, reconditioning not recommended.
//   E6013  Lincoln Fleetweld 37 (C.2.10.19, 09/16): AC and DC ranges, AC preferred; Hobart 447A
//          (rev. 250725): ranges, arc length 1/8-1/4 in, storage and reconditioning; ESAB OK 46.30:
//          current, voltage, efficiency, fusion time per electrode, deposition rate.
//   E7018  Lincoln Excalibur 7018 MR (C2.10.10b, 06/15): DC+ and AC ranges; Hobart 718: ranges,
//          "Very short arc", storage oven 250-350 F, 9 h exposure (E7018 H4R per AWS D1.1-2002);
//          ESAB OK 48.00: current, voltage, efficiency, fusion time, deposition rate; Lincoln
//          MC22-140 (12/22): holding at 250-300 F, redrying 650-750 F for one hour.
//   General: out-of-position work at 15% less current (Hobart 610, 447A, 718); weave width at most
//          2-1/2 x (Hobart/Miller 155095F) or 3 x (Kobelco) the electrode diameter; drag angle 10-30 deg
//          (Lincoln C2.410) or 20-30 deg (Kobelco); arc length about the electrode diameter (Hobart
//          "Basic Stick Welding", Hobart/Miller 155095F); k = 0.8 for 111 (TWI, Kiwa, SSAB, AWI).
//
// The training current window of each size is the overlap of the cited data-sheet ranges (so it is
// inside every one of them). Values marked `seed` are model coefficients of this build (uncalibrated).

import { clamp } from './util.js';

const RHO_STEEL = 7.85e-6; // kg/mm^3

// Data-sheet rows: d (mm), length (mm), [lo, hi] training current (overlap of the sources),
// ref current (A), ref voltage (V), deposition rate at the ref current (kg/h), fusion time (s) of one
// electrode at the ref current (ESAB, at 90% of I max) or null.
export const ELECTRODES = {
  E6010: {
    id: 'E6010', label: 'E6010 cellulosic', coating: 'cellulosic', iso: 'cellulosic (AWS A5.1 E6010)',
    polarities: ['DCEP'], // Hobart 610: DCEP; Fleetweld 5P+ Europe sheet: DC+
    arcWindow: [1.0, 2.0], // x d: "Average length (1/8" to 1/4")" for 1/8 in (Hobart 610), scaled with d (seed)
    storage: 'room', // Hobart 610 / Lincoln MC22-140: room temperature, do not re-bake
    penetration: 1.4, // seed: "deeply penetrating arc and a rapid burn-off rate" (TWI JK2)
    wetting: 0.42, // seed (fast-freeze slag)
    spatter: 8, // seed, particles/s
    slagRemoval: 0.7, // seed: "deslagging can be difficult" (TWI JK2)
    color: 0xd9cfb8,
    sizes: {
      2.5: { L: 300, range: [50, 70], Iref: 55, Uref: 27, kgh: 0.6, tf: null }, // Hobart 610 3/32: 40-70, opt 55, 26-28 V, 0.60 kg/h; 5P+ 50-85
      3.2: { L: 350, range: [80, 120], Iref: 100, Uref: 26.5, kgh: 0.73, tf: null }, // Hobart 610 1/8: 80-120, opt 100, 26-27 V, 0.73 kg/h; 5P+ 75-135
      4.0: { L: 350, range: [100, 160], Iref: 140, Uref: 27.5, kgh: 0.9, tf: null }, // Hobart 610 5/32: 100-160, opt 140, 26-29 V, 0.90 kg/h; 5P+ 100-175
    },
  },
  E6013: {
    id: 'E6013', label: 'E6013 rutile', coating: 'rutile', iso: 'rutile (AWS A5.1 E6013)',
    polarities: ['AC', 'DCEP', 'DCEN'], // Fleetweld 37: AC preferred, DC+/-; Hobart 447A: AC, DCEP or DCEN
    arcWindow: [1.0, 2.0], // Hobart 447A: "Average length (1/8" to 1/4")", scaled with d (seed)
    storage: 'warm', // Hobart 447A: 20-40 C below 50% RH or holding oven 38-49 C
    penetration: 0.75, // seed
    wetting: 0.62, // seed: smooth rutile bead
    spatter: 2.5, // seed
    slagRemoval: 1.4, // seed: "easily removable slag" (TWI JK2)
    color: 0x8f8a7c,
    sizes: {
      2.5: { L: 350, range: [70, 80], Iref: 90, Uref: 24, kgh: 0.7, tf: 58 }, // ESAB OK 46.30 2.5x350: 70-100 A, 24 V, 58 s, 0.7 kg/h; Fleetweld 37 DC 70-105; Hobart 447A 40-80
      3.2: { L: 350, range: [100, 120], Iref: 126, Uref: 23, kgh: 1.1, tf: 60 }, // OK 46.30 3.2x350: 100-140, 23 V, 60 s, 1.1 kg/h; FW37 DC 100-135; 447A 70-120
      4.0: { L: 450, range: [145, 160], Iref: 153, Uref: 21, kgh: 1.4, tf: 96 }, // OK 46.30 4.0x450: 120-170, 21 V, 96 s, 1.4 kg/h; FW37 DC 145-180; 447A 130-160
    },
  },
  E7018: {
    id: 'E7018', label: 'E7018 basic, low hydrogen', coating: 'basic', iso: 'basic, low hydrogen (AWS A5.1 E7018 H4R)',
    polarities: ['DCEP', 'AC'], // Excalibur 7018 MR: DC+ preferred, AC; Hobart 718: DCEP or AC
    arcWindow: [0.3, 1.0], // seed: "Very short arc" (Hobart 718), "drag the electrode lightly ... never hold a long arc" (Lincoln C2.410)
    storage: 'oven', // Lincoln MC22-140: opened cans in a cabinet at 250-300 F (120-150 C)
    exposureLimitH: 9, // Hobart 718: E7018 H4R, 9 h per AWS D1.1-2002; Lincoln: moisture resistant types up to 9 h
    penetration: 1.0, // seed
    wetting: 0.55, // seed
    spatter: 4, // seed
    slagRemoval: 0.8, // seed: basic slag "removal difficult" (TWI JK2)
    color: 0x6f747a,
    sizes: {
      2.5: { L: 350, range: [70, 110], Iref: 99, Uref: 24, kgh: 0.96, tf: 57 }, // ESAB OK 48.00 2.5x350: 70-110, 24 V, 57 s, 0.96 kg/h; Excalibur 2.4 DC+ 70-110; Hobart 718 70-110
      3.2: { L: 350, range: [100, 140], Iref: 126, Uref: 23, kgh: 1.24, tf: 68 }, // OK 48.00 3.2x350: 90-140, 23 V, 68 s, 1.24 kg/h; Excalibur 90-160; Hobart 718 100-150
      4.0: { L: 350, range: [140, 190], Iref: 171, Uref: 24, kgh: 1.63, tf: 75 }, // OK 48.00 4.0x350: 120-190, 24 V, 75 s, 1.63 kg/h; Excalibur 130-210; Hobart 718 140-220
    },
  },
};

export const ELECTRODE_LIST = ['E6010', 'E6013', 'E7018'];
export const DIAMETERS = [2.5, 3.2, 4.0];
export const GRIP_LEN = 25; // mm of bare core held in the holder jaws (seed geometry)
export const STUB_LEN = 50; // mm stub, including the gripped end (Hobart deposition data: "Allowance made for 2" stub loss")
export const MIN_FREE = STUB_LEN - GRIP_LEN; // electrode left beyond the jaws when it is used up (mm)
export const OUT_OF_POSITION = 0.85; // Hobart 610, 447A, 718: reduce the current 15% out of position

export function electrodeData(type, d) {
  const e = ELECTRODES[type] || ELECTRODES.E7018;
  const sz = e.sizes[d] || e.sizes[3.2];
  return { e, sz };
}

// Electrode burn-off speed (mm of electrode per second). From the ESAB fusion time of one electrode
// at the reference current, taken as the time to burn it down to a 2 in (50 mm) stub (seed reading of
// the data), scaled in proportion to the current (seed). Cellulosic E6010 has no fusion-time row: the
// rutile rate per ampere of the same size times 1.15 (seed: "rapid burn-off rate", TWI JK2).
export function burnOffRate(type, d, I) {
  const { sz } = electrodeData(type, d);
  if (sz.tf) return ((sz.L - STUB_LEN) / sz.tf) * (I / sz.Iref);
  const r = ELECTRODES.E6013.sizes[d] || ELECTRODES.E6013.sizes[3.2];
  return 1.15 * ((r.L - STUB_LEN) / r.tf) * (I / r.Iref);
}

// Deposited metal (mm^3/s): data-sheet deposition rate at the reference current, in proportion to the
// current (seed).
export function smawDeposition(type, d, I) {
  const { sz } = electrodeData(type, d);
  return ((sz.kgh / 3600) / RHO_STEEL) * (I / sz.Iref);
}

// Arc-length window (mm) for an electrode.
export function arcWindow(type, d) {
  const e = ELECTRODES[type] || ELECTRODES.E7018;
  return [e.arcWindow[0] * d, e.arcWindow[1] * d];
}

// The arc goes out when the electrode is lifted further than this (mm). seed
export function arcOutLength(type, d) {
  return 2.6 * d;
}

// Nominal arc length (middle of the window).
export function nominalArcLength(type, d) {
  const [a, b] = arcWindow(type, d);
  return (a + b) / 2;
}

// Training current window for a position: data-sheet overlap, less 15% out of position.
export function currentWindow(type, d, position) {
  const { sz } = electrodeData(type, d);
  const f = position === 'PA' || position === 'PB' || position === 'PC' ? 1 : OUT_OF_POSITION;
  return [Math.round(sz.range[0] * f), Math.round(sz.range[1] * f)];
}

// Moisture state of the electrodes: 'dry' (from the oven or a fresh hermetic can), 'exposed' (out of the
// oven longer than the exposure limit), 'wet' (direct contact with water).
export const CONDITIONS = ['dry', 'exposed', 'wet'];

// Arc state for SMAW at arc length l (mm): the machine is a constant-current source, so the current is
// the set current; the arc voltage rises with arc length (1 V/mm about the data-sheet voltage: seed).
export function smawArcState(s, l, travelAngle, env = {}) {
  const { e, sz } = electrodeData(s.electrode, s.dia);
  const I = s.current;
  const [w0, w1] = arcWindow(s.electrode, s.dia);
  const lOpt = (w0 + w1) / 2;
  const Uopt = sz.Uref + 0.012 * (I - sz.Iref); // seed slope
  const U = Uopt + 1.0 * (l - lOpt); // seed: 1 V per mm of arc length
  const dU = U - Uopt;
  const polarityOk = e.polarities.includes(s.polarity);
  let stability = 1;
  // arc length outside the window: a long arc wanders and crackles coarsely, a very short one buzzes
  // and tends to stick (Hobart "Basic Stick Welding")
  if (l > w1) stability *= Math.exp(-(((l - w1) / (0.5 * s.dia)) ** 2));
  if (l < w0) stability *= clamp(0.55 + 0.45 * (l / Math.max(w0, 0.1)), 0.4, 1);
  if (!polarityOk) stability *= 0.35;
  const [i0, i1] = sz.range;
  if (I < i0 * 0.9 || I > i1 * 1.1) stability *= 0.75; // outside the data-sheet range. seed
  // moisture: "noisy arc and high spatter" (Lincoln MC22-140), "stronger and unstable arc" (Kobelco)
  const moist = s.condition === 'wet' ? 2 : s.condition === 'exposed' ? 1 : 0;
  if (moist) stability *= moist === 2 ? 0.6 : 0.85;
  // shielding by the coating gas: lost with a long arc (porosity: Hobart/Miller 155095F "Arc length
  // too long"), and for low-hydrogen electrodes by moisture (TWI JK42, Kobelco). seed magnitudes
  let shielding = 1;
  const longStart = e.coating === 'basic' ? w1 : 1.3 * w1;
  if (l > longStart) shielding *= clamp(1 - (l - longStart) / (1.2 * s.dia), 0.15, 1);
  if (e.coating === 'basic' && moist) shielding *= moist === 2 ? 0.35 : 0.65;
  if (e.coating !== 'basic' && moist === 2) shielding *= 0.8;
  const ta = Math.abs(travelAngle);
  if (ta > 40) shielding *= clamp(1 - (ta - 40) * 0.03, 0.4, 1); // steep angles. seed

  let wetting = e.wetting + 0.06 * dU - 0.006 * travelAngle; // seed
  if (moist && e.coating !== 'basic') wetting -= 0.05; // undercut with damp rutile (Lincoln MC22-140)
  wetting = clamp(wetting, 0.12, 0.95);
  const spatterRate = e.spatter * (1 + 1.5 * Math.max(0, l / Math.max(w1, 0.5) - 1)) * (1 + 3 * (1 - stability)) * (polarityOk ? 1 : 3) * (moist ? 1.8 : 1);
  const vdot = smawDeposition(s.electrode, s.dia, I);
  return {
    I, U, Uopt, dU, mode: 'smaw', stability, arcLen: l, stickOut: 0, shielding, wetting, spatterRate,
    scFreq: 0, k: 0.8, polarityOk, vdot, burnOff: burnOffRate(s.electrode, s.dia, I), lWindow: [w0, w1],
    coating: e.coating, pen: e.penetration,
    Ihi: sz.range[1] * 1.15, // undercut grows above this current (seed: 15% over the training window)
  };
}

// Default SMAW settings: E7018 3.2 mm, DCEP, the middle of its training window.
export function smawDefaults(type = 'E7018', d = 3.2, position = 'PA') {
  const e = ELECTRODES[type];
  const w = currentWindow(type, d, position);
  return {
    process: '111', electrode: type, dia: d, current: Math.round((w[0] + w[1]) / 2), polarity: e.polarities[0], condition: 'dry',
    wire: d, wfs: 0, voltage: 0, gas: 'none', gasFlow: 0, wireNeedsDCEN: false,
  };
}

// Length of the coated electrode beyond the holder jaws at the start (mm).
export function freshLength(type, d) {
  const { sz } = electrodeData(type, d);
  return sz.L - GRIP_LEN;
}
