// Gas tungsten arc welding (ISO 4063 process 141, GTAW / TIG) of carbon steel: tungsten electrodes,
// current ranges, filler rods, argon shielding, arc starting, post-flow, and the arc state for a given
// arc length and torch-switch (amperage control) position.
//
// Sources (as printed; see README "GTAW sources"):
//   Tungsten types, AWS A5.12 / ISO 6848 codes and tip colours: CK Worldwide "Technical Guide", Form 116
//     (May 2017 / Feb 2019); Diamond Ground Products "Tungsten Electrode Guidebook"; Miller "All About
//     Tungsten in TIG Welding" (2026). DC steel: ceriated, lanthanated (or thoriated); pure tungsten "is only
//     used for AC welding" (DGP).
//   Typical current range by tungsten diameter, argon, "Direct Current, DC" column (DCEN), with the gas cup
//     listed: CK Worldwide Form 116 (May 2017 / Feb 2019) "Typical current range" table: 1/16 in #6 70-150 A,
//     3/32 in #8 150-250 A, 1/8 in #8 250-400 A. Tip geometry for a current level: DGP Table 8 "Tungsten
//     Electrode Tip Shapes and Current Ranges" (same numbers in CK Form 116): 2.4 mm, 1.1 mm flat, 45 deg:
//     15-150 A (pulsed 15-250 A). Miller/Hobart "TIG (GTAW) Welding Guidelines" OM-215994 rev F (2018).
//   Training parameters for 1/8 in mild and low-carbon steel: CK Form 116 "Low Alloy Steel (DCSP)" table
//     (scenarios.js, GTAW_TRAIN).
//   Argon (ISO 14175 I1), "Typical argon shielding gas flow rates are 10 to 25 CFH" (Miller OM-215994);
//     higher flow "increase[s] turbulence" (Miller, Best Practices for Proper Shielding Gas, 2026).
//   Cup inside diameter at least 3 x the tungsten diameter; tungsten extension no more than the cup inside
//     diameter (Miller OM-215994); "3/32-inch tungsten with a #8 cup", "about 1/8 to 1/4 inch exposed"
//     (Miller, Guide to TIG Welding Basics, 2026).
//   Arc length DC "1/16 to 1/8 in." (Miller OM-215994); torch 70-80 deg to the work, i.e. pushed 10-20 deg,
//     not 45 deg or more (Miller, Welding Tips, 2026; TWI Standard Data Vol. 2); filler rod 10-20 deg to the
//     surface (TWI), dabbed at the leading edge of the pool and kept inside the gas envelope (Miller, ESAB).
//   Post-flow one second per 10 A, at least 8 s (Miller 2026); pre-flow at least 0.2 s (Miller 2026).
//   Arc starting: HF (non-contact) or lift-arc ("Do NOT Strike Like A Match!", Miller OM-215994); scratch
//     starts risk a tungsten inclusion (TWI Job Knowledge 6).
//   Tungsten touching the pool or the filler touching the tungsten contaminates the tip, destabilises the arc
//     and risks tungsten inclusions (ESAB; CK Form 116; Fronius); remedy: "Remove 1/2 in. of contaminated
//     tungsten and repoint tungsten" (Miller OM-215994).
//   Filler rods for carbon steel: AWS A5.18 ER70S-2 and ER70S-6 (Lincoln data sheets), 100% argon, DC-.
//   Thermal efficiency k = 0.6 for TIG (TWI FAQ, SSAB, Weld Australia).
// Values marked `seed` are model coefficients of this build (uncalibrated).

import { clamp } from './util.js';

// Tungsten electrodes: AWS class -> ISO 6848 code, tip colour (CK Form 116), DC use.
export const TUNGSTENS = {
  'EWCe-2': { id: 'EWCe-2', iso: 'WC20', label: '2% ceriated', color: 0x8c8f93, colorName: 'grey', dc: true, radioactive: false },
  'EWLa-1.5': { id: 'EWLa-1.5', iso: 'WL15', label: '1.5% lanthanated', color: 0xc9a227, colorName: 'gold', dc: true, radioactive: false },
  'EWLa-2': { id: 'EWLa-2', iso: 'WL20', label: '2% lanthanated', color: 0x2f5fb3, colorName: 'blue', dc: true, radioactive: false },
  'EWTh-2': { id: 'EWTh-2', iso: 'WT20', label: '2% thoriated (radioactive)', color: 0xb3261e, colorName: 'red', dc: true, radioactive: true },
  EWP: { id: 'EWP', iso: 'WP', label: 'pure tungsten (AC only)', color: 0x2e8b3c, colorName: 'green', dc: false, radioactive: false },
};
export const TUNGSTEN_LIST = ['EWCe-2', 'EWLa-1.5', 'EWLa-2', 'EWTh-2', 'EWP'];

// Typical DC (DCEN) current range of a tungsten by diameter, argon, and the gas cup CK lists with it (CK
// Worldwide Form 116, "Typical current range", Direct Current column).
export const TUNGSTEN_SIZES = {
  1.6: { range: [70, 150], cup: 6 },
  2.4: { range: [150, 250], cup: 8 },
  3.2: { range: [250, 400], cup: 8 },
};
export const TUNGSTEN_DIAMETERS = [1.6, 2.4, 3.2];

// Filler rods (AWS A5.18) and diameters on the Lincoln and ESAB sheets.
export const FILLERS = {
  'ER70S-2': { id: 'ER70S-2', label: 'ER70S-2 (triple deoxidised)', fluidity: 0.5 },
  'ER70S-6': { id: 'ER70S-6', label: 'ER70S-6 (high Mn, Si)', fluidity: 0.58 }, // "Enhanced puddle fluidity compared to ER70S-2" (Lincoln C4.10.12)
};
export const FILLER_LIST = ['ER70S-2', 'ER70S-6'];
export const FILLER_DIAMETERS = [1.6, 2.4, 3.2];
export const ROD_LENGTH = 915; // mm (Lincoln ANZ ER70S-2: 915 mm; ESAB / Lincoln TIG S-6: 1000 mm)

// Argon flow window: Miller 10-25 CFH, in L/min (1 CFH = 0.4719 L/min).
export const ARGON_FLOW = [4.7, 11.8];
// Cup: #8 = 8/16 in inside diameter (CK: exit diameter in 1/16 in steps).
export const CUP_ID = 12.7; // mm
export const STICKOUT = [3.2, 6.4]; // mm tungsten beyond the cup (Miller: 1/8 to 1/4 in)
export const ARC_WINDOW = [1.6, 3.2]; // mm (Miller: 1/16 to 1/8 in, DC)
export const ARC_OUT = 12; // mm: arc length at which the arc goes out (seed)
export const HF_GAP = 6; // mm: largest tungsten-to-work gap HF starting bridges (seed)
export const PREFLOW = 0.2; // s minimum (Miller)

export function postflowFor(I) {
  return Math.max(8, I / 10); // s: one second per 10 A, at least 8 s (Miller)
}

// Typical DCEN current range of a tungsten diameter (CK Form 116).
export function tungstenRange(d) {
  return (TUNGSTEN_SIZES[d] || TUNGSTEN_SIZES[2.4]).range;
}

// Filler melting: while the rod tip is in the pool, the arc melts it at up to this rate (mm^3/s), in
// proportion to the current. Seed, set so that the training fillet of scenarios.js (3.2 mm leg, 225 A,
// rod in the pool 35% of the time) is laid at the 9 in/min of the CK Form 116 row:
// 8.45 mm^2 x 3.81 mm/s / (0.35 x 225 A) = 0.41 mm^3/s per A.
export const ROD_MELT_PER_A = 0.41;
export function rodMeltCapacity(I) {
  return ROD_MELT_PER_A * Math.max(0, I);
}

// Arc state for GTAW at arc length l (mm). s: settings { current, polarity, tungsten, tdia, gasFlow,
// startMode, filler, rodDia }; ctx: { pedal (0..1), contaminated, oxidizedTungsten, fillerRate (mm^3/s),
// rodOxide (0..1), gasAvailable, wind }.
export function gtawArcState(s, l, travelAngle, env = {}, ctx = {}) {
  const pedal = clamp(ctx.pedal ?? 1, 0, 1);
  const I = Math.max(5, s.current * pedal); // amperage control: minimum about 5 A (seed)
  const U = 8 + 1.2 * l; // seed: arc voltage rising with arc length in argon
  const tw = TUNGSTENS[s.tungsten] || TUNGSTENS['EWCe-2'];
  const range = tungstenRange(s.tdia);
  let stability = 1;
  if (l > ARC_WINDOW[1]) stability *= Math.exp(-(((l - ARC_WINDOW[1]) / 3) ** 2)); // arc wander with a long arc (ESAB)
  if (!tw.dc) stability *= 0.55; // pure tungsten on DC: poor arc stability (DGP: AC only). seed magnitude
  if (s.polarity !== 'DCEN') stability *= 0.3; // DCEP: the tungsten overheats (Miller; DGP ~10% capacity)
  if (ctx.contaminated) stability *= 0.45; // "A contaminated electrode produces an erratic arc" (DGP)
  if (I > range[1]) stability *= clamp(1 - (I - range[1]) / range[1], 0.4, 1); // tip erodes above its range
  // shielding: argon flow window, draughts, steep torch, long arc, rod tip oxidised outside the gas
  let shielding = 1;
  const flow = env.gasAvailable === false ? 0 : s.gasFlow;
  if (flow < ARGON_FLOW[0]) shielding *= clamp(flow / ARGON_FLOW[0], 0, 1);
  if (flow > ARGON_FLOW[1]) shielding *= clamp(1 - (flow - ARGON_FLOW[1]) / 15, 0.5, 1); // turbulence (Miller). seed slope
  if (env.wind) shielding *= clamp(1 - env.wind / 2.5, 0, 1); // seed: draught
  const ta = Math.abs(travelAngle);
  if (ta >= 45) shielding *= 0.4; // "At 45 degrees or more, you lose shielding gas coverage" (Miller)
  else if (ta > 30) shielding *= 1 - 0.04 * (ta - 30);
  if (l > ARC_WINDOW[1] * 1.5) shielding *= clamp(1 - (l - ARC_WINDOW[1] * 1.5) / 6, 0.3, 1); // long arc: porosity (ESAB). seed
  const contam = clamp(ctx.rodOxide ?? 0, 0, 1);
  const wetting = clamp(0.55 + 0.04 * (I / 100) - 0.004 * travelAngle + ((FILLERS[s.filler] || FILLERS['ER70S-2']).fluidity - 0.5), 0.2, 0.9); // seed
  return {
    I, U, Uopt: 8 + 1.2 * 2.4, dU: 1.2 * (l - 2.4), mode: 'gtaw', stability, arcLen: l, stickOut: 0,
    shielding, wetting, spatterRate: 0.2 * (1 + 4 * (1 - stability)), scFreq: 0, k: s.polarity === 'DCEN' ? 0.6 : 0.6 * (0.3 / 0.7), polarityOk: s.polarity === 'DCEN',
    // DCEP puts about 30% of the heat into the work instead of about 70% (CK Form 116, ESAB): the heat
    // reaching the work (k) scales by 0.3 / 0.7, and the wide arc penetrates less (the same ratio, seed)
    vdot: Math.max(0, ctx.fillerRate ?? 0), pen: s.polarity === 'DCEN' ? 1.15 : 1.15 * (0.3 / 0.7), lWindow: ARC_WINDOW.slice(), contam, range,
    Ihi: range[1],
    // the tungsten overheats on DCEP above about 10% of its DCEN capacity (DGP) or above its tip range
    overheat: (s.polarity !== 'DCEN' && I > 0.1 * range[1]) || I > 1.15 * range[1],
  };
}

// Default GTAW settings: EWCe-2 2.4 mm, ER70S-2 2.4 mm rod, DCEN, argon 9 L/min (18 CFH, CK Form 116).
export function gtawDefaults(o = {}) {
  return {
    process: '141', current: o.current ?? 225, polarity: 'DCEN', tungsten: o.tungsten || 'EWCe-2', tdia: o.tdia || 2.4,
    filler: o.filler || 'ER70S-2', rodDia: o.rodDia || 2.4, gas: 'Ar', gasFlow: o.gasFlow ?? 9, startMode: o.startMode || 'HF',
    postflow: o.postflow ?? postflowFor(o.current ?? 225), wire: o.rodDia || 2.4, wfs: 0, voltage: 0, wireNeedsDCEN: false,
  };
}
