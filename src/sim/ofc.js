// Oxy-fuel gas cutting with acetylene (oxyacetylene cutting) of carbon steel: the cutting-tip chart, the gas
// outfit (cylinders, regulators, hoses with check valves and flashback arrestors, the torch handle and its
// cutting attachment), the preheat flame (fuel and oxygen balance: smoke, carburizing feather, neutral,
// oxidizing, flame separated from the tip), and the set-up, lighting and shut-down procedure with the
// hazardous events it can lead to (backfire, sustained backfire, flashback, the "pop" at shut-down).
//
// Sources (as printed; see README "Oxy-fuel cutting sources"):
//   Tip chart: Victor (Thermadyne) Form 0056-0138 Rev. C (May 14, 2008), "Safety and Operating Instructions:
//     Torch Handles, Cutting Attachments, and Heating Nozzles", Section 7, "TYPES 1-101, 3-101 (OXY-ACETYLENE)":
//     metal thickness, tip size, cutting oxygen pressure (psig) and flow (scfh), preheat oxygen pressure ("*
//     Applicable for three-hose machine cutting torches only. With a two hose cuting torch, preheat pressure is
//     set by the cuttting oxygen."), acetylene pressure (psig) and flow (scfh), speed (IPM), kerf width (in).
//     "*** All pressures are measured at the regulator using 25' x 1/4" hose through tip size 5".
//   Acetylene: Victor 0056-3260 Rev. AG (2017) Section 3.02 table ("All values are approximations"): unstable
//     over 15 PSIG (103 kPa) outside the cylinder, maximum allowable use pressure 15 PSIG, maximum withdrawal
//     rate 1/7 of the cylinder contents per hour, neutral flame 5720 F (3160 C), primary flame 507 BTU/ft3
//     (18.9 MJ/m3), total heat 1470 BTU/ft3 (54.8 MJ/m3). OSHA 29 CFR 1910.253(a)(2): acetylene shall not be
//     "utilized at a pressure in excess of 15 psig (103 kPa gauge pressure)"; AWS Fact Sheet 30: "Do not use
//     acetylene above 15 psi (103 kPa) flowing." Cylinder pressure: 49 CFR 173.303, "the pressure in the
//     cylinder containing acetylene gas may not exceed 250 psig at 70 F".
//   Set-up, lighting and shut-down: Victor 0056-3260 Sections 5-7 and Victor 0056-0138 Sections 4.01-4.02
//     (the outfit in this simulator is operated by these instructions; Smith, Harris and Hobart differ in
//     details, see the README); cylinder valves: OSHA 1910.253(b)(5)(iii), Victor 5.02 ("approximately 3/4 of
//     a turn and no more than 1 1/2 turns"); regulator screws released before the cylinder valve is opened
//     (Victor 5.02 step 6; AWS Fact Sheet 30); purge (Victor 5.03.2 "5-10 seconds", 5.06 "10 seconds for tips
//     up to a size 3 ... for each 25 feet (7m) of hose"); leak test (Victor 5.05: 20 PSIG oxygen, 10 PSIG fuel,
//     "Observe the gauges on both regulators for five minutes").
//   Flame: Smith OM-262659J 9-2 ("a long white flame will appear; this is known as the acetylene feather."
//     "Continue to add oxygen and reduce the feather until it just disappears into the small, bright, inner
//     cones at the end of the tip." "This will produce what is known as a neutral flame."); Victor 0056-3260
//     ("increasing the oxygen or decreasing the fuel will make the inner cone become a lighter shade of blue and
//     the flame will become oxidizing"); Hobart 7-3 ("neutral flame (ratio of fuel to oxygen is 1:1)"); Harris
//     ("Keep opening torch fuel "GAS" valve until flame stops excessive smoking and leaves the end of tip about
//     1/8", then reduce slightly to bring flame back to tip").
//   Hazardous events: AWS Fact Sheet No. 28 (10/23) definitions of backfire, sustained backfire ("an initial
//     popping sound followed by a squealing or hissing sound, potentially burning through the torch body") and
//     flashback ("potentially causing an explosion"), their causes ("Don't allow the tip to touch the work";
//     reverse flow from "improper shutdown and/or startup procedures", cylinder pressures "too low", a check
//     valve not working); responses: Victor 0056-3260 5.06 ("immediately turn off the oxygen valve on the torch
//     handle." "Then, turn off the fuel valve.") and Smith Section 5 (then both cylinder valves; "Do not relight
//     the torch until the equipment has cooled"); the shut-down "pop": Victor 0056-0138 4.02 ("Be careful not
//     to shut off the fuel valve first, this may create a 'pop' type sound.").
// Values marked `seed` are model coefficients of this build (uncalibrated).

import { clamp } from './util.js';

export const PSI_KPA = 6.894757;
export const SCFH_LMIN = 0.4719474; // 1 ft3/h in L/min
export const IN_MM = 25.4;
export const IPM_MMS = IN_MM / 60; // in/min -> mm/s
export const ATM_PSI = 14.696;

export const ACETYLENE = {
  maxUsePsig: 15, // "Maximum allowable use pressure 15 PSIG (103 kPa)" (Victor 0056-3260 3.02)
  withdrawalPerHour: 1 / 7, // "Maximum Withdrawal Rate 1/7 of cylinder contents per hour"
  flameC: 3160,
  primaryMJm3: 18.9,
  totalMJm3: 54.8,
  burningVelocity: 6.9, // m/s in oxygen
  cylinderPsig: 250, // 49 CFR 173.303: may not exceed 250 psig at 70 F
};

// Victor 0056-0138 Section 7, oxy-acetylene cutting tips, as printed (inch plate thickness, ranges [lo, hi]).
// cutP / cutQ: cutting oxygen psig / scfh; preP: preheat oxygen psig (three-hose machine torches only);
// fuelP / fuelQ: acetylene psig / scfh; speed: in/min; kerf: in.
export const TIP_CHART = [
  { tIn: 1 / 8, label: '1/8"', tip: '000', cutP: [20, 25], cutQ: [20, 25], preP: [3, 5], fuelP: [3, 5], fuelQ: [6, 11], speed: [20, 30], kerf: 0.04 },
  { tIn: 1 / 4, label: '1/4"', tip: '00', cutP: [20, 25], cutQ: [30, 35], preP: [3, 5], fuelP: [3, 5], fuelQ: [6, 11], speed: [20, 28], kerf: 0.05 },
  { tIn: 3 / 8, label: '3/8"', tip: '0', cutP: [25, 30], cutQ: [55, 60], preP: [3, 5], fuelP: [3, 5], fuelQ: [6, 11], speed: [18, 26], kerf: 0.06 },
  { tIn: 1 / 2, label: '1/2"', tip: '0', cutP: [30, 35], cutQ: [60, 65], preP: [3, 6], fuelP: [3, 5], fuelQ: [9, 16], speed: [16, 22], kerf: 0.06 },
  { tIn: 3 / 4, label: '3/4"', tip: '1', cutP: [30, 35], cutQ: [80, 85], preP: [4, 7], fuelP: [3, 5], fuelQ: [8, 13], speed: [15, 20], kerf: 0.07 },
  { tIn: 1, label: '1"', tip: '2', cutP: [35, 40], cutQ: [140, 160], preP: [4, 8], fuelP: [3, 6], fuelQ: [10, 18], speed: [13, 18], kerf: 0.09 },
  { tIn: 2, label: '2"', tip: '3', cutP: [40, 45], cutQ: [210, 240], preP: [5, 10], fuelP: [4, 8], fuelQ: [14, 24], speed: [10, 12], kerf: 0.11 },
  { tIn: 3, label: '3"', tip: '4', cutP: [40, 50], cutQ: [280, 320], preP: [5, 10], fuelP: [5, 11], fuelQ: [18, 28], speed: [10, 12], kerf: 0.12 },
  { tIn: 4, label: '4"', tip: '5', cutP: [45, 55], cutQ: [390, 450], preP: [6, 12], fuelP: [6, 13], fuelQ: [22, 30], speed: [6, 9], kerf: 0.15 },
  // "** For best results use HC1200C series torches and 3/8" hose using a size 6 tip or larger."
  { tIn: 6, label: '6"', tip: '6', cutP: [45, 55], cutQ: [500, 600], preP: [6, 15], fuelP: [8, 14], fuelQ: [25, 35], speed: [4, 7], kerf: 0.15, heavy: true },
  { tIn: 10, label: '10"', tip: '7', cutP: [45, 55], cutQ: [700, 850], preP: [6, 20], fuelP: [10, 15], fuelQ: [25, 35], speed: [3, 5], kerf: 0.34, heavy: true },
  { tIn: 12, label: '12"', tip: '8', cutP: [45, 55], cutQ: [900, 1050], preP: [7, 25], fuelP: [10, 15], fuelQ: [25, 35], speed: [3, 4], kerf: 0.41, heavy: true },
];

// Plates of the training kit (the chart rows a hand torch with 1/4 in hose covers in the cutting bay).
export const CUT_PLATES = {
  'P6': { id: 'P6', row: 1, label: '6.4 mm (1/4 in) plate', short: '6.4 mm (1/4 in)' },
  'P10': { id: 'P10', row: 2, label: '9.5 mm (3/8 in) plate', short: '9.5 mm (3/8 in)' },
  'P12': { id: 'P12', row: 3, label: '12.7 mm (1/2 in) plate', short: '12.7 mm (1/2 in)' },
  'P19': { id: 'P19', row: 4, label: '19 mm (3/4 in) plate', short: '19 mm (3/4 in)' },
  'P25': { id: 'P25', row: 5, label: '25.4 mm (1 in) plate', short: '25.4 mm (1 in)' },
};
export const CUT_PLATE_LIST = ['P6', 'P10', 'P12', 'P19', 'P25'];
export const TIP_SIZES = ['000', '00', '0', '1', '2', '3'];

export const mid = (r) => (r[0] + r[1]) / 2;

export function chartRow(plateId) {
  const p = CUT_PLATES[plateId] || CUT_PLATES.P12;
  return TIP_CHART[p.row];
}

export function plateThickness(plateId) {
  return chartRow(plateId).tIn * IN_MM;
}

// Orifice data of a tip, from the chart rows that use it: the cutting bore passes oxygen in proportion to the
// absolute pressure (choked flow; the printed pairs of pressure and flow agree with it within 3%), the
// preheat ports cover the acetylene flows printed for the tip.
export function tipData(tip) {
  const rows = TIP_CHART.filter((r) => r.tip === tip);
  if (!rows.length) return null;
  let kc = 0;
  for (const r of rows) kc += mid(r.cutQ) / (mid(r.cutP) + ATM_PSI);
  kc /= rows.length;
  const fuelLo = Math.min(...rows.map((r) => r.fuelQ[0]));
  const fuelHi = Math.max(...rows.map((r) => r.fuelQ[1]));
  const fuelPref = mid([Math.min(...rows.map((r) => r.fuelP[0])), Math.max(...rows.map((r) => r.fuelP[1]))]);
  return { tip, kc, fuelLo, fuelHi, fuelPref, rows };
}

// Cutting oxygen flow (scfh) through a tip's bore at a delivery pressure (psig): proportional to the absolute
// pressure at the chart pressures (choked), falling to zero with the gauge pressure below 15 psig (seed blend).
export function cuttingFlow(tip, psig) {
  const d = tipData(tip);
  if (!d || !(psig > 0)) return 0;
  return d.kc * (psig + ATM_PSI) * Math.min(1, Math.sqrt(psig / 15));
}

// Flame of a lit tip from the gas flows (scfh): type and the look of the preheat flames.
//   ratio = preheat oxygen / acetylene; neutral at 1:1 (Hobart), band 0.95-1.15 (seed); below: carburizing,
//   the acetylene feather longer the less oxygen (Smith 9-2); above: oxidizing, inner cones lighter blue
//   (Victor). Acetylene alone smokes at low flow and leaves the tip at high flow (Victor 5.06 step 7, Harris).
export const NEUTRAL_BAND = [0.95, 1.15]; // seed around the printed 1:1
export const SEPARATE_FACTOR = 1.25; // seed: flame leaves the tip above 1.25 x the tip's highest printed flow
export function flameOf(tip, fuelQ, preO2) {
  const d = tipData(tip);
  if (!d || !(fuelQ > 0)) return { type: 'none', ratio: 0, size: 0, feather: 0, smoke: 0, separated: false };
  const ratio = preO2 / fuelQ;
  const size = fuelQ / mid([d.fuelLo, d.fuelHi]); // 1 = middle of the printed flows
  let type;
  if (ratio < 0.05) type = 'fuel';
  else if (ratio < NEUTRAL_BAND[0]) type = 'carburizing';
  else if (ratio <= NEUTRAL_BAND[1]) type = 'neutral';
  else type = 'oxidizing';
  // acetylene only: smoke below the lowest printed flow (seed: the flame clears at the printed minimum)
  const smoke = type === 'fuel' ? clamp(1 - fuelQ / d.fuelLo, 0, 1) : 0;
  const separated = fuelQ > SEPARATE_FACTOR * d.fuelHi && ratio < NEUTRAL_BAND[1];
  // feather: length of the white acetylene feather beyond the inner cones, relative to the cone (seed)
  const feather = type === 'carburizing' || type === 'fuel' ? clamp((NEUTRAL_BAND[0] - ratio) / NEUTRAL_BAND[0], 0, 1) : 0;
  return { type, ratio, size, feather, smoke, separated };
}

// Heat the preheat flames put into the plate (W): acetylene burnt in the primary flame (18.9 MJ/m3) plus part
// of the secondary flame; `eta` is the share that enters the steel (seed), lower when the flame is not
// neutral (seed), with the cones held at the distance `cone` mm above the surface (seed falloff).
export const PREHEAT_ETA = 0.22; // seed
export function preheatPower(fuelQ, flame, cone) {
  if (!(fuelQ > 0) || !flame || flame.type === 'none' || flame.separated) return 0;
  const m3s = (fuelQ * 0.0283168) / 3600; // scfh -> m3/s
  const Pfull = m3s * ACETYLENE.totalMJm3 * 1e6;
  const mix = flame.type === 'neutral' ? 1 : flame.type === 'oxidizing' ? 0.95 : flame.type === 'carburizing' ? 0.8 : 0.35; // seed
  // the inner cones are the hottest part: best a few mm above the surface (Smith: cones 1/8-1/4 in from the
  // steel), less heat when held higher (seed falloff), none when the tip is in the work
  const c = Math.max(0, cone);
  const fall = c <= 6 ? 1 : clamp(1 - (c - 6) / 20, 0.15, 1);
  return PREHEAT_ETA * mix * fall * Pfull;
}

// ---- the outfit --------------------------------------------------------------------------------------
// Valves in turns. Regulators: delivery pressure set by the adjusting screw (psig per turn, seed), drooping
// a little with flow (seed). Torch needle valves pass flow in proportion to their opening up to FULL_OPEN
// turns (seed). The oxygen hose loses pressure when the cutting oxygen flows, so the preheat flame turns
// carburizing when the lever is pressed and is readjusted with it pressed (Victor 0056-0138 4.01 step 17).
export const REG = {
  oxygen: { psiPerTurn: 8, max: 125, droop: 0.02 }, // seed
  fuel: { psiPerTurn: 3, max: 30, droop: 0.04 }, // seed (the gauge reads past 15 psig: the limit is the user's)
};
export const FULL_OPEN = 1.5; // turns, seed for the torch needle valves
export const CYL_FULL_OPEN = { oxygen: 3, fuel: 1.5 }; // turns to fully open (seed; acetylene: OSHA maximum)
export const OXY_CYL_PSIG = 2000; // seed: an oxygen cylinder's contents for the high-pressure gauge (not sourced)
export const CYL_FT3 = { oxygen: 244, fuel: 145 }; // seed: cylinder capacities used for the contents gauges
export const HOSE_DROP = 0.15; // seed: oxygen pressure lost in the hose at the chart cutting flow (share)
export const LEAK_TEST = { oxygen: 20, fuel: 10, minutes: 5 }; // Victor 0056-3260 5.05
export const OPEN_RATE = 2; // turns/s: faster counts as not opening the cylinder valve slowly (seed)

export const STEPS = [
  // the steps of the outfit, in order, with the instruction each is checked against
  { id: 'secure', short: 'Cylinders chained', text: 'Cylinders chained upright on the cart', ref: 'Victor 0056-3260 5.01; OSHA 1910.253(b)(5)(iii)(A)' },
  { id: 'caps', short: 'Caps removed', text: 'Valve protection caps removed', ref: 'Smith OM-262659J 6-1' },
  { id: 'crack', short: 'Valves cracked, standing aside', text: 'Cylinder valves cracked before the regulators are fitted, standing to the side of the outlet', ref: 'OSHA 1910.253(b)(5)(iii)(C); Victor 0056-3260 5.02 step 2' },
  { id: 'screwsOut', short: 'Screws released before opening', text: 'Regulator adjusting screws released before the cylinder valves are opened', ref: 'Victor 0056-3260 5.02 step 6; AWS Fact Sheet 30' },
  { id: 'oxyOpen', short: 'Oxygen opened slowly, then fully', text: 'Oxygen cylinder valve opened slowly, then fully', ref: 'OSHA 1910.253(b)(5)(iii)(J); Victor 0056-3260 5.02' },
  { id: 'fuelOpen', short: 'Acetylene about 3/4 turn', text: 'Acetylene cylinder valve opened about 3/4 turn (no more than 1 1/2 turns), wrench left on', ref: 'OSHA 1910.253(b)(5)(iii)(K) and (L); Victor 0056-3260 5.02' },
  { id: 'leak', short: 'Leak test, five minutes', text: 'Leak test: 20 psig oxygen and 10 psig fuel, cylinder valves closed, gauges watched for five minutes', ref: 'Victor 0056-3260 5.05' },
  { id: 'pressures', short: 'Pressures from the tip chart', text: 'Working pressures set from the tip chart (acetylene never above 15 psig)', ref: 'Victor 0056-0138 Section 7; OSHA 1910.253(a)(2)' },
  { id: 'purge', short: 'Each hose purged', text: 'Each hose purged on its own before lighting', ref: 'Victor 0056-3260 5.06; Victor 0056-0138 4.01 steps 8-13' },
  { id: 'light', short: 'Lit: fuel 1/8 turn, spark lighter', text: 'Fuel valve opened about 1/8 turn and lit with the spark lighter (oxygen closed)', ref: 'Victor 0056-0138 4.01 step 14; 0056-3260 5.06' },
  { id: 'smoke', short: 'Fuel opened until no smoke', text: 'Fuel opened until the flame stops smoking', ref: 'Victor 0056-0138 4.01 step 15' },
  { id: 'neutral', short: 'Neutral flame, lever pressed', text: 'Preheat oxygen opened to a neutral flame, readjusted with the cutting lever pressed', ref: 'Victor 0056-0138 4.01 steps 16-17' },
  { id: 'shutO2', short: 'Off: preheat oxygen, then fuel', text: 'Shut-down: preheat oxygen closed first, then the fuel valve', ref: 'Victor 0056-0138 4.02 step 1' },
  { id: 'cylClosed', short: 'Cylinder valves closed', text: 'Both cylinder valves closed', ref: 'Victor 0056-0138 4.02 step 2' },
  { id: 'bled', short: 'Bled, screws released, zero', text: 'Oxygen, then fuel bled through the torch; regulator screws released; gauges at zero', ref: 'Victor 0056-0138 4.02 steps 3-7' },
];
export const STEP_IDS = STEPS.map((x) => x.id);

// The gas outfit: cylinders, regulators, hoses, the torch handle with a cutting attachment and a tip.
// Controls are set by the user (VR knobs or the desktop panel); step(dt, ctx) advances pressures and flows,
// the flame, purge times and the procedure record, and returns the events of the step.
//   opts.ready: the outfit as the app sets it up (regulators fitted, cylinders open, pressures from the chart,
//   hoses purged) for practice; otherwise cylinders capped, regulators off, everything closed.
export class GasOutfit {
  constructor(opts = {}) {
    this.tip = opts.tip || '0';
    this.checkValves = opts.checkValves !== false; // reverse-flow check valves (on the "FC" torch handle)
    this.arrestors = opts.arrestors !== false; // flashback arrestors (on the "FC" torch handle)
    this.hoseFt = opts.hoseFt ?? 25;
    const ready = !!opts.ready;
    const secured = opts.secured !== false;
    this.cyl = {
      oxygen: { P: opts.oxyPsig ?? OXY_CYL_PSIG, Pfull: opts.oxyPsig ?? OXY_CYL_PSIG, open: 0, secured, cap: !ready, cracked: ready, regOn: ready, wrench: true, maxOpen: 0, rate: 0 },
      fuel: { P: opts.fuelPsig ?? ACETYLENE.cylinderPsig, Pfull: ACETYLENE.cylinderPsig, open: 0, secured, cap: !ready, cracked: ready, regOn: ready, wrench: opts.wrench !== false, maxOpen: 0, rate: 0 },
    };
    this.reg = { oxygen: { turns: opts.screwsIn ? 2 : 0 }, fuel: { turns: opts.screwsIn ? 1 : 0 } };
    // pressure held behind a closed cylinder valve: in the regulator inlet (high-pressure gauge) and the outlet
    // and hose (low-pressure gauge)
    this.trap = { oxygen: { in: 0, out: 0 }, fuel: { in: 0, out: 0 } };
    this.leak = opts.leak || null; // { gas, at, rate (psig/min) } a leaking connection (troubleshooting)
    this.valve = { oxygen: 0, fuel: 0, preheat: 0 }; // torch handle oxygen and fuel valves, attachment preheat valve (turns)
    this.lever = 0; // cutting oxygen lever 0..1
    this.lit = false;
    this.flame = flameOf(this.tip, 0, 0);
    this.flow = { fuel: 0, preO2: 0, cutO2: 0, Po: 0, Pf: 0 };
    this.hose = { oxygen: { purged: ready ? 99 : 0, mixed: false }, fuel: { purged: ready ? 99 : 0, mixed: false } };
    this.backfireT = 0; // > 0 while a sustained backfire burns inside the torch (s)
    this.tipHeat = 0; // tip overheating index (seed)
    this.done = {}; // step id -> { t, ok }
    this.faults = []; // { t, step, note }
    this.time = 0;
    this.used = { oxygen: 0, fuel: 0 }; // ft3
    this.leakT = 0; // s the leak-test conditions have held
    this.leakP0 = null;
    this.smokeCleared = false;
    this.neutralT = 0;
    this.shutting = false;
    this.events = [];
    this.queue = []; // events of actions between steps (returned by the next step)
    if (ready) {
      for (const g of ['oxygen', 'fuel']) {
        this.cyl[g].open = g === 'oxygen' ? CYL_FULL_OPEN.oxygen : 0.75;
        this.cyl[g].maxOpen = this.cyl[g].open;
      }
      const row = TIP_CHART.find((r) => r.tip === this.tip) || TIP_CHART[3];
      const r2 = opts.row || row;
      this.reg.oxygen.turns = mid(r2.cutP) / REG.oxygen.psiPerTurn;
      this.reg.fuel.turns = mid(r2.fuelP) / REG.fuel.psiPerTurn;
      this.valve.oxygen = FULL_OPEN;
      for (const id of ['secure', 'caps', 'crack', 'screwsOut', 'oxyOpen', 'fuelOpen', 'leak', 'pressures', 'purge']) this.done[id] = { t: 0, ok: true, byApp: true };
    }
  }

  // ---- discrete actions ------------------------------------------------------------------------------
  chain(gas, on = true) {
    this.cyl[gas].secured = on;
  }

  removeCap(gas) {
    const c = this.cyl[gas];
    if (!c.cap) return false;
    c.cap = false;
    if (!this.cyl.oxygen.cap && !this.cyl.fuel.cap) this.mark('caps');
    return true;
  }

  // open the cylinder valve slightly and close it at once, before the regulator is fitted (OSHA (b)(5)(iii)(C))
  crack(gas, ctx = {}) {
    const c = this.cyl[gas];
    if (c.cap || c.regOn || c.open > 0) return false;
    if (!c.secured) this.fault('secure', 'Cylinder valve opened on a cylinder that is not chained upright');
    if (ctx.inFront) this.fault('crack', 'Standing in front of the valve outlet while cracking it');
    if (ctx.nearFlame) this.fault('crack', 'Fuel-gas cylinder valve cracked near a flame or sparks');
    c.cracked = true;
    this.event('crack');
    if (this.cyl.oxygen.cracked && this.cyl.fuel.cracked) this.mark('crack', !this.faults.some((f) => f.step === 'crack'));
    return true;
  }

  attachRegulator(gas) {
    const c = this.cyl[gas];
    if (c.cap || c.regOn || c.open > 0) return false;
    if (!c.cracked) this.fault('crack', `Regulator fitted to the ${gas === 'oxygen' ? 'oxygen' : 'acetylene'} cylinder without cracking the valve first`);
    c.regOn = true;
    return true;
  }

  // ---- knobs ---------------------------------------------------------------------------------------------
  setCylinder(gas, turns, ctx = {}) {
    const c = this.cyl[gas];
    if (c.cap) return;
    const was = c.open;
    const now = clamp(turns, 0, CYL_FULL_OPEN[gas] + (gas === 'fuel' ? 1 : 0.5));
    if (now === was) return;
    if (was <= 0.02 && now > 0.02) {
      // opening: chained, regulator fitted with its adjusting screw released (while its inlet is empty, the
      // full cylinder pressure reaches the regulator), standing to the side
      if (!c.secured) this.fault('secure', 'Cylinder valve opened on a cylinder that is not chained upright');
      else if (this.cyl.oxygen.secured && this.cyl.fuel.secured && !this.done.secure) this.mark('secure');
      if (!c.regOn) this.fault('crack', 'Cylinder valve opened with no regulator fitted');
      else if (this.trap[gas].in < 0.5 * c.P) {
        if (this.reg[gas].turns > 0.05) this.fault('screwsOut', `${gas === 'oxygen' ? 'Oxygen' : 'Acetylene'} cylinder valve opened with the regulator adjusting screw turned in`);
        else if (!this.done.screwsOut && (gas === 'fuel' ? this.cyl.oxygen.open > 0.02 || this.firstOpened : true)) this.firstOpened = true;
      }
      if (ctx.inFront) this.fault('crack', 'Standing in front of the regulator while opening the cylinder valve');
      c.opening = true; // the first opening, slowly then fully (OSHA (b)(5)(iii)(J))
    }
    if (c.opening && now > was && ctx.dt > 0) c.rate = Math.max(c.rate, (now - was) / ctx.dt);
    c.open = now;
    c.maxOpen = Math.max(c.maxOpen, now);
    if (now <= 0.02 && was > 0.02) {
      // closed: the regulator and hose hold their pressure
      this.trap[gas] = { in: c.regOn ? c.P : 0, out: c.regOn ? Math.min(c.P, this.reg[gas].turns * REG[gas].psiPerTurn) : 0 };
    }
    if (gas === 'fuel' && now > 1.5 + 1e-6) this.fault('fuelOpen', 'Acetylene cylinder valve opened more than 1 1/2 turns');
    if (gas === 'oxygen' && c.opening && now >= CYL_FULL_OPEN.oxygen - 0.25) {
      c.opening = false;
      if (c.rate > OPEN_RATE + 1e-6) this.fault('oxyOpen', 'Oxygen cylinder valve opened quickly (open it slowly)');
      if (!this.done.oxyOpen) this.mark('oxyOpen', c.rate <= OPEN_RATE + 1e-6);
    }
    if (gas === 'fuel' && c.opening && now >= 0.5) {
      c.opening = false;
      if (!this.done.fuelOpen) this.mark('fuelOpen', c.wrench && c.rate <= OPEN_RATE + 1e-6 && now <= 1.5);
    }
    // both cylinders opened against released screws: the step is done
    if (!this.done.screwsOut && this.cyl.oxygen.open > 0.02 && this.cyl.fuel.open > 0.02 && !this.faults.some((f) => f.step === 'screwsOut')) this.mark('screwsOut');
  }

  removeWrench() {
    this.cyl.fuel.wrench = false;
    if (this.cyl.fuel.open > 0.02) this.fault('fuelOpen', 'Acetylene cylinder wrench taken off the open valve');
  }

  setRegulator(gas, turns) {
    this.reg[gas].turns = clamp(turns, 0, REG[gas].max / REG[gas].psiPerTurn);
  }

  setValve(name, turns) {
    const was = this.valve[name];
    this.valve[name] = clamp(turns, 0, 3);
    // shut-down order: preheat oxygen first, then the fuel (Victor 0056-0138 4.02 step 1)
    if (this.lit && name === 'fuel' && this.valve.fuel < 0.02 && was >= 0.02) {
      if (this.valve.preheat > 0.02 || this.lever > 0.1) {
        this.event('pop');
        this.fault('shutO2', 'Fuel valve closed before the oxygen: "pop"');
      } else this.mark('shutO2');
      this.lit = false;
      this.event('out');
      this.shutting = true;
    }
  }

  setLever(x) {
    this.lever = clamp(x, 0, 1);
  }

  // the spark lighter at the tip
  spark() {
    if (this.lit) return false;
    const f = this.flows();
    this.event('spark');
    if (!(f.fuel > 0.3)) return false;
    const o2 = f.preO2 + f.cutO2;
    // marks checked when the torch is lit: working pressures and purging done first
    const row = this.row || TIP_CHART.find((r) => r.tip === this.tip);
    if (!this.done.pressures) this.mark('pressures', this.pressuresOk(row));
    if (!this.done.purge) this.mark('purge', this.hose.fuel.purged >= this.purgeNeed() && this.hose.oxygen.purged >= this.purgeNeed());
    if (o2 > 0.1 * f.fuel) {
      this.fault('light', 'Lit with the oxygen open: "Never open and light the fuel gas and oxygen at the same time"');
      this.event('pop');
    }
    if (this.hose.fuel.mixed || this.hose.oxygen.mixed) {
      // a hose holding a mixture (reverse flow, not purged out): the flame runs back into it (AWS FS28)
      this.hose.fuel.mixed = this.hose.oxygen.mixed = false;
      if (this.arrestors) this.event('flashbackStopped');
      else {
        this.event('flashback');
        return false;
      }
    }
    const fl = flameOf(this.tip, f.fuel, f.preO2);
    if (fl.separated) {
      this.event('blownOff'); // too much fuel: the flame will not stay on the tip
      return false;
    }
    this.lit = true;
    this.flame = fl;
    this.smokeCleared = false;
    this.event('lit');
    if (!this.done.light) this.mark('light', this.valve.fuel <= 0.5 && o2 <= 0.1 * f.fuel);
    return true;
  }

  // purge time per hose (Victor 0056-3260 5.06: 10 s per 25 ft for tips up to size 3, 5 s for larger tips)
  purgeNeed() {
    const big = ['4', '5', '6', '7', '8'].includes(this.tip);
    return (big ? 5 : 10) * (this.hoseFt / 25);
  }

  pressuresOk(row) {
    if (!row) return true;
    const Po = this.deliverySet('oxygen'), Pf = this.deliverySet('fuel');
    return Po >= row.cutP[0] - 1 && Po <= row.cutP[1] + 1 && Pf >= row.fuelP[0] - 0.5 && Pf <= Math.min(row.fuelP[1] + 0.5, ACETYLENE.maxUsePsig);
  }

  // time skip of the leak test (the gauges watched for five minutes): "If the gauge readings do not change,
  // then the system is leak tight." (Victor 0056-3260 5.05.6)
  watchGauges(seconds = LEAK_TEST.minutes * 60) {
    const read = () => ({ oxygen: [this.inlet('oxygen'), this.delivery('oxygen')], fuel: [this.inlet('fuel'), this.delivery('fuel')] });
    const before = read();
    const ok0 = this.leakConditions();
    let t = 0;
    while (t < seconds) {
      const d = Math.min(1, seconds - t);
      this.step(d, {});
      t += d;
    }
    const after = read();
    const dropOf = (g) => Math.max(before[g][0] - after[g][0], before[g][1] - after[g][1]);
    const drop = { oxygen: dropOf('oxygen'), fuel: dropOf('fuel') };
    const tight = drop.oxygen < 0.5 && drop.fuel < 0.5;
    if (ok0 && seconds >= LEAK_TEST.minutes * 60 - 1 && tight && !this.done.leak) this.mark('leak');
    this.event(tight ? 'leakTight' : 'leakFound');
    return { before, after, drop, tight, conditions: ok0 };
  }

  leakConditions() {
    const o = this.cyl.oxygen, f = this.cyl.fuel;
    const torchClosed = this.valve.oxygen < 0.02 && this.valve.fuel < 0.02 && this.valve.preheat < 0.02 && this.lever < 0.05;
    const Po = this.delivery('oxygen'), Pf = this.delivery('fuel');
    return torchClosed && o.open <= 0.02 && f.open <= 0.02 && o.regOn && f.regOn && Math.abs(Po - LEAK_TEST.oxygen) <= 3 && Math.abs(Pf - LEAK_TEST.fuel) <= 2;
  }

  // leak detection solution on the connections: bubbles where the leak is
  leakSolution() {
    return this.leak && !this.leak.fixed && this.delivery(this.leak.gas) > 0.5 ? this.leak.at : null;
  }

  tighten(at) {
    if (this.leak && this.leak.at === at) {
      this.leak.fixed = true;
      return true;
    }
    return false;
  }

  // ---- state ---------------------------------------------------------------------------------------------
  deliverySet(gas) {
    const c = this.cyl[gas];
    if (!c.regOn) return 0;
    if (c.open > 0.02 && c.P > 0) return Math.min(c.P, this.reg[gas].turns * REG[gas].psiPerTurn);
    return this.trap[gas].out;
  }

  // regulator delivery pressure (psig) with the droop of the flow
  delivery(gas) {
    const set = this.deliverySet(gas);
    if (!(set > 0)) return 0;
    const q = gas === 'oxygen' ? this.flow.preO2 + this.flow.cutO2 : this.flow.fuel;
    return Math.max(0, set - REG[gas].droop * q);
  }

  // high-pressure (inlet) gauge: the cylinder contents with the valve open, else what the regulator inlet holds
  inlet(gas) {
    const c = this.cyl[gas];
    if (!c.regOn) return 0;
    return c.open > 0.02 ? c.P : this.trap[gas].in;
  }

  flows() {
    const d = tipData(this.tip);
    const Po = this.delivery('oxygen');
    const Pf = this.delivery('fuel');
    const vf = (x) => clamp(x / FULL_OPEN, 0, 1);
    const handO2 = vf(this.valve.oxygen);
    // cutting oxygen: the torch handle oxygen valve fully open for a cutting attachment (Victor 0056-0138 4.01
    // step 8); a part-open handle valve throttles it (seed)
    const cutO2 = this.lever >= 0.05 ? this.lever * Math.min(1, handO2 * 1.2) * cuttingFlow(this.tip, Po) : 0;
    // the hose loses pressure while the cutting oxygen flows (seed), which the preheat oxygen feels
    const qRef = cuttingFlow(this.tip, mid((TIP_CHART.find((r) => r.tip === this.tip) || TIP_CHART[3]).cutP));
    const PoTorch = Po * (1 - HOSE_DROP * clamp(cutO2 / Math.max(qRef, 1), 0, 1.5));
    // fuel through the preheat ports (seed: up to 1.25 x the tip's highest printed flow at the printed pressure)
    const fuel = vf(this.valve.fuel) * 1.25 * d.fuelHi * Math.sqrt(Math.max(0, Pf) / d.fuelPref);
    // preheat oxygen through the attachment's preheat valve (seed: up to 1.6 x the highest fuel flow at 30 psig)
    const preO2 = vf(this.valve.preheat) * handO2 * 1.6 * d.fuelHi * Math.sqrt(Math.max(0, PoTorch) / 30);
    return { fuel, preO2, cutO2, Po, Pf };
  }

  // Advance dt seconds. ctx: { tipGap (mm from the tip face to the work, or null), hot (0..1 heat reaching the
  // tip from the work) }. Returns the events of the step.
  step(dt, ctx = {}) {
    this.events = this.queue;
    this.queue = [];
    this.time += dt;
    const f = this.flows();
    this.flow = f;
    if (f.Pf > ACETYLENE.maxUsePsig + 0.25 && this.cyl.fuel.open > 0.02) this.fault('pressures', 'Acetylene delivery pressure above 15 psig');
    // gas out of the torch: purge (no flame), usage, the trapped pressure falling, the cylinders emptying
    const outO2 = f.preO2 + f.cutO2, outF = f.fuel;
    if (!this.lit) {
      if (outO2 > 1) this.hose.oxygen.purged += dt;
      if (outF > 0.5) this.hose.fuel.purged += dt;
    }
    this.used.oxygen += (outO2 * dt) / 3600;
    this.used.fuel += (outF * dt) / 3600;
    for (const g of ['oxygen', 'fuel']) {
      const c = this.cyl[g];
      const q = g === 'oxygen' ? outO2 : outF;
      const leakRate = this.leak && !this.leak.fixed && this.leak.gas === g ? this.leak.rate / 60 : 0; // psig/s
      if (c.open > 0.02) c.P = Math.max(0, c.P - (c.Pfull * q * dt) / 3600 / CYL_FT3[g]);
      else {
        // behind a closed cylinder valve: gas out of the torch (or a leak downstream) empties the hose within
        // seconds; the regulator refills its outlet up to the set pressure from its inlet while it can (with
        // the adjusting screw released it stays shut and the inlet keeps its pressure). A leak at the inlet
        // shows on the high-pressure gauge. Volumes and drain rates are seeds (inlet volume 1/5 of the hose).
        const tr = this.trap[g];
        const set = this.reg[g].turns * REG[g].psiPerTurn;
        const leakIn = leakRate > 0 && this.leak.at === 'inlet' ? leakRate : 0;
        const leakOut = leakRate > 0 && this.leak.at !== 'inlet' ? leakRate : 0;
        if (q > 0.05) {
          // bleeding through the torch: the hose empties, and the regulator inlet with it while the screw is in
          if (set > 0.5) tr.in = Math.max(0, tr.in - dt * (2.5 * tr.in + 40));
          tr.out = Math.max(0, Math.min(set > 0.5 ? Math.min(set, tr.in) : tr.out, tr.out - dt * (2 * tr.out + 10)));
          if (set > 0.5) tr.out = Math.min(set, tr.in, Math.max(tr.out, 0));
        } else {
          tr.out = Math.max(0, tr.out - dt * leakOut);
          tr.in = Math.max(0, tr.in - dt * leakIn);
          if (set > tr.out + 1e-3 && tr.in > tr.out) {
            const need = Math.min(set, tr.in) - tr.out;
            tr.in = Math.max(0, tr.in - 5 * need);
            tr.out = Math.min(tr.out + need, Math.max(tr.in, tr.out));
          }
        }
      }
    }
    // the acetylene withdrawal limit (Victor 0056-3260 3.02: 1/7 of the cylinder contents per hour)
    const contentFt3 = (this.cyl.fuel.P / this.cyl.fuel.Pfull) * CYL_FT3.fuel;
    if (this.lit && outF > contentFt3 / 7 + 1e-6) this.fault('pressures', 'Acetylene drawn faster than 1/7 of the cylinder contents per hour');
    // flame
    if (this.lit) {
      if (!(outF > 0.3)) {
        this.lit = false;
        this.event('out');
      } else {
        const fl = flameOf(this.tip, outF, f.preO2);
        this.flame = fl;
        if (fl.separated) {
          this.lit = false;
          this.event('blownOff');
        } else {
          if (fl.type === 'fuel' && fl.smoke <= 0) this.smokeCleared = true;
          if (f.preO2 > 0.1 * outF && !this.done.smoke) this.mark('smoke', this.smokeCleared);
          this.neutralT = this.lever >= 0.9 && fl.type === 'neutral' ? this.neutralT + dt : 0;
          if (this.neutralT >= 1 && !this.done.neutral) this.mark('neutral');
        }
      }
      // backfire: the tip touching the work (AWS FS28: "Don't allow the tip to touch the work") or overheated
      if (this.lit && ctx.tipGap != null && ctx.tipGap < 0.5) this.backfire(ctx);
      this.tipHeat = clamp(this.tipHeat + dt * ((ctx.hot || 0) - 0.15), 0, 3);
      if (this.lit && this.tipHeat > 2.5) this.backfire(ctx);
    } else this.flame = flameOf(this.tip, 0, 0);
    // reverse flow with no check valves: the higher-pressure gas pushes into the other hose while both torch
    // valves are open and the torch is not lit (AWS FS28: reverse flow and its causes)
    if (!this.checkValves && !this.lit && outO2 > 0.5 && outF > 0.3) {
      const dP = f.Po - f.Pf;
      if (dP > 5) this.hose.fuel.mixed = true;
      else if (dP < -5) this.hose.oxygen.mixed = true;
    }
    if (this.backfireT > 0) {
      // burning inside the torch until the oxygen is shut off (Victor 5.06; Smith Section 5)
      if (outO2 < 0.5) {
        this.backfireT = 0;
        this.event('backfireOut');
      } else {
        this.backfireT += dt;
        if (this.backfireT > 4 && !this.burnt) {
          this.burnt = true; // seed time
          this.event('torchBurnt');
        }
      }
    }
    // shut-down: cylinders closed, then oxygen and fuel bled, screws released, gauges at zero
    if (this.shutting) {
      const closed = this.cyl.oxygen.open <= 0.02 && this.cyl.fuel.open <= 0.02;
      if (closed && !this.done.cylClosed) this.mark('cylClosed');
      const empty = (g) => this.trap[g].in <= 0.5 && this.trap[g].out <= 0.1;
      if (closed && empty('oxygen') && !empty('fuel')) this.o2BledFirst = true;
      if (closed && empty('oxygen') && empty('fuel') && this.reg.oxygen.turns < 0.05 && this.reg.fuel.turns < 0.05 && !this.done.bled) this.mark('bled', !!this.o2BledFirst);
    }
    return this.events;
  }

  backfire(ctx = {}) {
    this.event('backfire');
    this.lit = false;
    // sustained when the tip is hot and the gases keep flowing (seed rule): burns inside the torch
    if (this.tipHeat > 1.5 || ctx.sustain) {
      this.backfireT = 1e-3;
      this.event('sustained');
    }
    this.tipHeat = Math.max(0, this.tipHeat - 0.5);
  }

  event(type) {
    this.queue.push(type);
  }

  fault(step, note) {
    if (this.faults.some((x) => x.step === step && x.note === note)) return;
    this.faults.push({ t: this.time, step, note });
  }

  mark(id, ok = true) {
    if (!this.done[id]) this.done[id] = { t: this.time, ok };
  }

  // procedure record in step order: done / ok / faults per step
  procedure() {
    return STEPS.map((s) => ({ ...s, done: !!this.done[s.id], ok: !!(this.done[s.id] && this.done[s.id].ok) && !this.faults.some((f) => f.step === s.id), byApp: !!(this.done[s.id] && this.done[s.id].byApp), faults: this.faults.filter((f) => f.step === s.id).map((f) => f.note) }));
  }
}
