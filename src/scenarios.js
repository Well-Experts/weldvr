// Scenario data: training WPS per process/position, practice options, troubleshooting faults
// (scope catalogue family C) and Inspector-lab coupons (family D); the mock tests (family E) are in
// qual/catalog.js.
//
// All machine settings and technique windows here are SEED values for a training WPS, consistent
// with the uncalibrated process model. They are not a qualified welding procedure.

import { makeJoint, POSITIONS } from './sim/joint.js';
import { t } from './ui/i18n.js';
import { makePipeJoint, PIPE_SIZES, PIPE_POSITIONS, SMAW_PIPE_ANGLES } from './sim/pipe.js';
import { defaultSettings, PROCESSES } from './sim/process.js';
import { speedTarget } from './sim/session.js';
import { TRAINING_INTERPASS_MAX } from './sim/scripted.js';
import { ELECTRODES, ELECTRODE_LIST, DIAMETERS, smawDefaults, currentWindow, arcWindow } from './sim/smaw.js';
import { TUNGSTENS, TUNGSTEN_LIST, FILLERS, FILLER_LIST, ARGON_FLOW, ARC_WINDOW as GTAW_ARC, postflowFor, gtawDefaults } from './sim/gtaw.js';

export const PROCESS_LIST = [
  { id: '135', short: 'GMAW 135', name: 'MAG solid wire (135 / GMAW)' },
  { id: '136', short: 'FCAW-G 136', name: 'Flux-cored, gas-shielded (136 / FCAW-G)' },
  { id: '114', short: 'FCAW-S 114', name: 'Flux-cored, self-shielded (114 / FCAW-S)' },
  { id: '111', short: 'SMAW 111', name: 'MMA, covered electrode (111 / SMAW)' },
  { id: '141', short: 'GTAW 141', name: 'TIG, tungsten inert gas (141 / GTAW)' },
];

// Covered electrodes offered for SMAW practice (data in sim/smaw.js).
export const SMAW_CHOICES = { electrodes: ELECTRODE_LIST, diameters: DIAMETERS };

// GTAW practice: tungsten types (pure tungsten is offered to show why it is not used on DC) and filler
// rods; the training WPS fixes 2.4 mm tungsten and rod (data in sim/gtaw.js).
export const GTAW_CHOICES = { tungstens: TUNGSTEN_LIST, fillers: FILLER_LIST };

// GTAW coupons: 3.2 mm (1/8 in) sheet, a fillet weld on a T-joint (3.2 mm leg) or a bead on plate. The bead
// area of the bead on plate (seed) is the one the model lays at the 11 in/min of the CK row below.
export function gtawJoint(type, position) {
  if (type === 'plate') return makeJoint('plate', 'PA', { thickness: 3.2, lanes: [0], beadArea: 6.2, width: 100 });
  return makeJoint('fillet', position, { thickness: 3.2, leg: 3.2 });
}

// Training WPS for GTAW of 3.2 mm (1/8 in) carbon steel. CK Worldwide Form 116 (Technical Guide, May 2017 /
// Feb 2019), "Low Alloy Steel (DCSP)" table, which covers mild and low-carbon steels, row 1/8 in (3.2 mm):
// tungsten 3/32 in (2.4 mm), filler rod 3/32 in (2.4 mm), argon 18 CFH (9 L/min); butt joint 175-225 A at
// 11 in/min, fillet 200-250 A at 9 in/min (DCSP = DCEN). The bead on plate uses the butt row. 3/32 in
// tungsten: typical DCEN range 150-250 A with a #8 cup (CK Form 116). Argon window 10-25 CFH, arc length
// 1/16-1/8 in (Miller OM-215994); torch pushed 10-20 deg (Miller; TWI); post-flow one second per 10 A, at
// least 8 s (Miller). Not a qualified procedure.
const IPM = 25.4 / 60; // 1 in/min in mm/s
export const GTAW_TRAIN = {
  fillet: { current: [200, 250], nominal: 225, speed: 9 * IPM },
  plate: { current: [175, 225], nominal: 200, speed: 11 * IPM },
  tdia: 2.4, rodDia: 2.4, gasFlow: 9,
};
function gtawWps(joint, opts = {}) {
  const tungsten = TUNGSTENS[opts.tungsten] ? opts.tungsten : 'EWCe-2';
  const filler = FILLERS[opts.filler] ? opts.filler : 'ER70S-2';
  const row = joint.type === 'fillet' ? GTAW_TRAIN.fillet : GTAW_TRAIN.plate;
  const settings = gtawDefaults({ current: row.nominal, tungsten, filler, tdia: GTAW_TRAIN.tdia, rodDia: GTAW_TRAIN.rodDia, gasFlow: GTAW_TRAIN.gasFlow, postflow: postflowFor(row.current[1]) });
  const p = PROCESSES['141'];
  const passes = joint.passPlan.map((pl, k) => {
    const v = speedTarget(joint, settings, k);
    return { kind: pl.kind, speed: [v * 0.8, v * 1.2], target: v };
  });
  const tw = TUNGSTENS[tungsten];
  return {
    id: `TRAIN-141-${{ fillet: 'FW', butt: 'BW', plate: 'BOP' }[joint.type]}-${joint.position}-T${joint.t}`,
    process: '141',
    settings,
    tungsten: { type: tungsten, dia: GTAW_TRAIN.tdia, iso: tw.iso, label: tw.label, colorName: tw.colorName },
    filler: { type: filler, dia: GTAW_TRAIN.rodDia, label: FILLERS[filler].label },
    ranges: {
      wfs: null,
      voltage: null,
      gasFlow: ARGON_FLOW.slice(),
      current: row.current.slice(),
      polarity: 'DCEN',
      // tungsten types for DC steel (DGP: ceriated, lanthanated or thoriated; pure tungsten is for AC)
      tungsten: TUNGSTEN_LIST.filter((k) => TUNGSTENS[k].dc),
      postflowMin: postflowFor(row.current[1]),
    },
    stickOut: GTAW_ARC.slice(), // GTAW: the arc-length window
    travelAngle: p.travelAngle,
    passes,
    sourceSpeed: row.speed, // mm/s, the travel speed printed in the CK row
    interpassMax: null,
    note: 'Training WPS: current, tungsten, rod, argon and travel speed from the CK Form 116 row for 1/8 in mild steel; arc length, torch angle and post-flow from Miller (README, GTAW sources). Not a qualified procedure.',
  };
}

export const POSITION_LIST = {
  fillet: ['PA', 'PB', 'PF', 'PG', 'PD'],
  butt: ['PA', 'PC', 'PF', 'PG', 'PE'],
};

// Nominal settings by process and position group (seed training WPS).
const NOMINAL = {
  135: { flat: [5.5, 21.5], up: [4.0, 19.5], down: [5.0, 20.5], over: [4.5, 20.0] },
  136: { flat: [8.0, 26.0], up: [6.0, 23.8], down: [7.0, 25.0], over: [6.5, 24.4] },
  114: { flat: [6.0, 24.0], up: [5.0, 22.7], down: [5.5, 23.3], over: [5.5, 23.3] },
};

function group(position) {
  if (position === 'PF') return 'up';
  if (position === 'PG') return 'down';
  if (position === 'PD' || position === 'PE') return 'over';
  return 'flat';
}

// opts (SMAW): { electrode, dia, polarity }
export function wpsFor(process, joint, opts = {}) {
  if (joint.pipe) return pipeWps(joint, opts);
  if (process === '111') return smawWps(joint, opts);
  if (process === '141') return gtawWps(joint, opts);
  const base = defaultSettings(process);
  const [wfs, voltage] = NOMINAL[process][group(joint.position)];
  const settings = { ...base, wfs, voltage };
  const p = PROCESSES[process];
  const passes = joint.passPlan.map((pl, k) => {
    const v = speedTarget(joint, settings, k);
    return { kind: pl.kind, speed: [v * 0.8, v * 1.2], target: v };
  });
  return {
    id: `TRAIN-${process}-${{ fillet: 'FW', butt: 'BW', plate: 'BOP' }[joint.type]}-${joint.position}`,
    process,
    settings,
    ranges: {
      wfs: [wfs - 0.5, wfs + 0.5],
      voltage: [voltage - 1.0, voltage + 1.0],
      gasFlow: p.gasRequired ? [12, 18] : null,
      polarity: settings.polarity,
    },
    stickOut: p.stickOut,
    travelAngle: p.travelAngle,
    passes,
    // multi-run welds (a groove, or a pad of overlapping beads): maximum interpass temperature
    // (training value, seed; not from a code)
    interpassMax: joint.type === 'butt' || (joint.type === 'plate' && joint.passPlan.length > joint.lanes.length) ? TRAINING_INTERPASS_MAX : null,
    note: 'Training WPS with seed values from the uncalibrated model. Not a qualified procedure.',
  };
}

// Training WPS for SMAW. Current: the overlap of the electrode data-sheet ranges for the size, less
// 15% out of position (Hobart 610, 447A, 718); polarity: the first one the data sheets list (E6013:
// AC, "AC preferred" in Lincoln Fleetweld 37); arc length: the electrode's window (smaw.js); drag
// angle 10-30 degrees (Lincoln C2.410). Travel speeds and interpass limit are seeds as for the other
// processes.
function smawWps(joint, opts) {
  const type = ELECTRODES[opts.electrode] ? opts.electrode : 'E7018';
  const dia = ELECTRODES[type].sizes[opts.dia] ? opts.dia : 3.2;
  const settings = smawDefaults(type, dia, joint.position);
  if (opts.polarity && ELECTRODES[type].polarities.includes(opts.polarity)) settings.polarity = opts.polarity;
  const p = PROCESSES['111'];
  const passes = joint.passPlan.map((pl, k) => {
    const v = speedTarget(joint, settings, k);
    return { kind: pl.kind, speed: [v * 0.8, v * 1.2], target: v };
  });
  const aw = arcWindow(type, dia).map((v) => Math.round(v * 10) / 10);
  return {
    id: `TRAIN-111-${type}-${dia}-${{ fillet: 'FW', butt: 'BW', plate: 'BOP' }[joint.type]}-${joint.position}`,
    process: '111',
    settings,
    electrode: { type, dia, label: ELECTRODES[type].label, polarities: ELECTRODES[type].polarities.slice(), storage: ELECTRODES[type].storage },
    ranges: {
      wfs: null,
      voltage: null,
      gasFlow: null,
      current: currentWindow(type, dia, joint.position),
      polarity: settings.polarity,
    },
    stickOut: aw, // SMAW: the arc-length window
    travelAngle: p.travelAngle,
    passes,
    interpassMax: joint.type === 'butt' || (joint.type === 'plate' && joint.passPlan.length > joint.lanes.length) ? TRAINING_INTERPASS_MAX : null,
    note: 'Training WPS: current from the electrode data sheets (less 15% out of position); other values are seeds. Not a qualified procedure.',
  };
}

// Training WPS for the open-root pipe joint (SMAW, DC+). Lincoln Electric C2.420 (Stick C2.420 10/02), in-plant
// pipe procedures without a backup ring ("When no backup ring is used a 1/8" Fleetweld 5P or 5P+ are
// recommended for the root pass"; joint: bevel 30 deg, land and gap 3/32-1/8 in, "A 1/8" (3.2mm) gap must be
// maintained accurately all the way around the joint"). Procedure table, "Vertical Joint (Pipe Axis
// Horizontal)": E6010-E9010 1/8 in 85-95 A, 5/32 in 115-125 A; low hydrogen EXX18 1/8 in 115-135 A, 5/32 in
// 140-160 A, 3/32 in 85-105 A. "Horizontal Joint (Pipe Axis Vertical)": EXX10 1/8 in 80-110 A, 5/32 in
// 120-150 A, EXX18 1/8 in 115-135 A. This build: 1/8 in (3.2 mm) E6010 root; E7018 fill and cap 1/8 in, or
// 3/32 in (2.5 mm) on NPS 2 pipe with its axis horizontal (the horizontal-joint table has no 3/32 in row).
// Electrode angles by position: ESAB (sim/pipe.js SMAW_PIPE_ANGLES). Nominal currents (the middle of the
// table range, 90 A for the root on both joints) and travel speeds are this build's; the interpass limit is
// the training value. Not a qualified procedure.
// Downhill (vertical down) root: C2.420's in-plant table is for vertical-up welding and its cross-country
// downhill procedure runs 5/32 in roots and 5/32-3/16 in fill and cap passes at currents above the kit's
// electrodes (hot pass 160-200 A), so a downhill joint is a root-pass coupon here: 1/8 in E6010 inside the
// data-sheet range (Hobart 610 1/8 in 80-120 A; Lincoln Fleetweld 5P+ DC+ 75-135 A), nominal 90 A.
export const PIPE_WPS = {
  vertical: { root: { electrode: 'E6010', dia: 3.2, current: [85, 95], nominal: 90 }, fill: { 3.2: { current: [115, 135], nominal: 125 }, 2.5: { current: [85, 105], nominal: 95 } } },
  horizontal: { root: { electrode: 'E6010', dia: 3.2, current: [80, 110], nominal: 90 }, fill: { 3.2: { current: [115, 135], nominal: 125 } } },
  downhill: { root: { electrode: 'E6010', dia: 3.2, current: [80, 120], nominal: 90 } },
};

// Electrode, size and current window of pass k of the pipe WPS.
export function pipePassProcedure(joint, k) {
  const tab = joint.pipe.progression === 'down' ? PIPE_WPS.downhill : joint.pipe.axis === 'vertical' ? PIPE_WPS.horizontal : PIPE_WPS.vertical;
  const kind = joint.passPlan[Math.min(k, joint.passPlan.length - 1)].kind;
  if (kind === 'root' || !tab.fill) return { kind, ...tab.root };
  const dia = joint.pipe.D < 100 && tab.fill[2.5] ? 2.5 : 3.2;
  return { kind, electrode: 'E7018', dia, ...tab.fill[dia] };
}

function pipeWps(joint, opts = {}) {
  const passes = joint.passPlan.map((pl, k) => {
    const pr = pipePassProcedure(joint, k);
    const settings = { ...smawDefaults(pr.electrode, pr.dia, joint.position), current: pr.nominal, polarity: 'DCEP' };
    const v = speedTarget(joint, settings, k);
    return { ...pr, settings, label: ELECTRODES[pr.electrode].label, arc: arcWindow(pr.electrode, pr.dia).map((a) => Math.round(a * 10) / 10), speed: [v * 0.8, v * 1.2], target: v };
  });
  const root = passes[0];
  const pos = PIPE_POSITIONS[joint.aws];
  void opts;
  return {
    id: `TRAIN-111-PIPE-${joint.pipe.size}-${joint.aws}${joint.pipe.progression ? '-' + joint.pipe.progression.toUpperCase() : ''}`,
    process: '111',
    pipe: true,
    settings: { ...root.settings },
    electrode: { type: root.electrode, dia: root.dia, label: root.label, polarities: ELECTRODES[root.electrode].polarities.slice(), storage: ELECTRODES[root.electrode].storage },
    ranges: { wfs: null, voltage: null, gasFlow: null, current: root.current.slice(), polarity: 'DCEP' },
    stickOut: root.arc,
    travelAngle: null, // by position around the pipe: SMAW_PIPE_ANGLES
    pipeAngles: SMAW_PIPE_ANGLES,
    passes,
    joint: { size: PIPE_SIZES[joint.pipe.size].label, position: pos ? joint.aws : '', iso: joint.position, gap: joint.rootGap, land: joint.rootFace, angle: joint.grooveAngle },
    interpassMax: TRAINING_INTERPASS_MAX,
    note: joint.pipe.progression === 'down'
      ? 'Training WPS (downhill root pass): 1/8 in E6010 in the electrode data-sheet range (Hobart 610, Lincoln Fleetweld 5P+), DC+; electrode angles by position from ESAB and Lincoln C2.410; travel speed is a seed. Not a qualified procedure.'
      : 'Training WPS: electrodes and currents from the Lincoln C2.420 in-plant pipe procedure table (DC+), electrode angles by position from ESAB; travel speeds and the interpass limit are seeds. Not a qualified procedure.',
  };
}

// Settings of pass k for the welding station (the pipe WPS changes the electrode between the root and the
// fill passes; other WPS keep one setting for every pass).
export function passSettings(wps, k) {
  if (!wps || !wps.pipe) return null;
  const p = wps.passes[Math.min(k, wps.passes.length - 1)];
  return { ...p.settings };
}

// Current window of pass k (pipe WPS), or the WPS window.
export function passCurrent(wps, k) {
  if (wps && wps.pipe) return wps.passes[Math.min(k, wps.passes.length - 1)].current;
  return wps ? wps.ranges.current : null;
}

// Human-readable joint: position designation and type (plate joints), or pipe size and test position.
export function jointLabel(j) {
  if (j.pipe) return `${t(j.pipe.sizeLabel)} · ${t(j.label)}`;
  return t(POSITIONS[j.type][j.position].label);
}

export function jointKind(j) {
  if (j.pipe) return 'Pipe butt weld, open root';
  return j.type === 'fillet' ? 'Fillet weld' : j.type === 'plate' ? 'Bead on plate' : 'Butt weld on backing';
}

export function inRange(v, r) {
  return r == null || (v >= r[0] - 1e-9 && v <= r[1] + 1e-9);
}

// Technique plans used for scripted welds ("a colleague welded this").
const G = { workAngle: 45, travelAngle: 5, ctwd: 17, aim: 0, craterDwell: 0.6 };
const B = { workAngle: 90, travelAngle: 5, ctwd: 17, aim: 0, craterDwell: 0.6 };
// SMAW: electrode at 42 deg in the PB fillet, 20 deg drag (Lincoln C2.410 10-30), nominal arc length
const GS = { workAngle: 42, travelAngle: 20, aim: 0, craterDwell: 0.6 };
const BS = { workAngle: 90, travelAngle: 20, aim: 0, craterDwell: 0.6 };
const buttSmaw = (o = {}) => [
  { ...BS, ...o },
  { ...BS, weaveAmp: 2, toeDwell: 0.4, ...o },
  { ...BS, weaveAmp: 3, toeDwell: 0.4, ...o },
  { ...BS, weaveAmp: 4, toeDwell: 0.4, ...o },
];
// GTAW: torch pushed 15 deg on a 3.2 mm fillet (Miller: 10-20 deg push)
const GT = { workAngle: 45, travelAngle: -15 };
const TIG_JOINT = ['fillet', 'PB', { thickness: 3.2, leg: 3.2 }];
const buttGood = (o = {}) => [
  { ...B, ...o },
  { ...B, weaveAmp: 2, toeDwell: 0.4, ...o },
  { ...B, weaveAmp: 3, toeDwell: 0.4, ...o },
  { ...B, weaveAmp: 4.5, toeDwell: 0.4, ...o },
];

// ---- Troubleshoot (scope family C) --------------------------------------------------------------
// fault.env / fault.settings persist on the bench until the trainee corrects them.
// check(state) tells whether the equipment fault has been corrected.
export const TROUBLESHOOT = [
  {
    id: 'C1', title: 'Shielding gas lost', iso: '2017, 2011',
    joint: ['fillet', 'PB'], process: '135', seed: 101,
    fault: { equipment: { cylinderEmpty: true }, settings: { gasFlow: 15 } },
    preweld: [{ ...G, workAngle: 42 }],
    causes: [
      { id: 'gas', text: 'No shielding gas at the arc: the cylinder is empty', correct: true },
      { id: 'volt', text: 'Arc voltage set too high' },
      { id: 'speed', text: 'Travel speed too fast' },
      { id: 'pol', text: 'Wrong polarity' },
    ],
    fixes: 'Replace the gas cylinder and check the flowmeter is in the WPS range before welding again.',
    hint: 'Look at the surface of the bead and the cylinder pressure gauge.',
    targets: ['2017', '2011', '(8)'],
    check: (s) => !s.equipment.cylinderEmpty && s.settings.gasFlow >= 12 && s.settings.gasFlow <= 18,
  },
  {
    id: 'C2', title: 'Draught on site', iso: '2017, 2011',
    joint: ['fillet', 'PB'], process: '135', seed: 102,
    fault: { equipment: { fan: true } },
    preweld: [{ ...G, workAngle: 42 }],
    causes: [
      { id: 'wind', text: 'Draught from the fan blows the shielding gas away', correct: true },
      { id: 'flow', text: 'Gas flow set too high' },
      { id: 'wire', text: 'Wire feed speed too low' },
      { id: 'angle', text: 'Work angle too steep' },
    ],
    fixes: 'Switch the fan off or put up a welding screen, or change to a self-shielded wire.',
    hint: 'Something in the booth moves the air around the arc.',
    targets: ['2017', '2011', '(8)'],
    check: (s) => !s.equipment.fan || s.equipment.screen,
  },
  {
    id: 'C3', title: 'Oil on the joint', iso: '2017, 2011',
    joint: ['fillet', 'PB'], process: '135', seed: 103,
    fault: { equipment: { oily: { s0: 70, s1: 160 } } },
    preweld: [{ ...G, workAngle: 42 }],
    causes: [
      { id: 'oil', text: 'Oil or primer on the joint surfaces', correct: true },
      { id: 'gas', text: 'Shielding gas flow too low along the whole weld' },
      { id: 'volt', text: 'Arc voltage too low' },
      { id: 'crater', text: 'Crater not filled at the stop' },
    ],
    fixes: 'Degrease and grind the joint area clean before welding.',
    hint: 'Where along the weld do the pores start and stop?',
    targets: ['2017', '2011', '(8)'],
    check: (s) => !s.equipment.oily,
  },
  {
    id: 'C5', title: 'Arc too hot, travel too fast', iso: '5011, 5012',
    joint: ['fillet', 'PB'], process: '135', seed: 105,
    fault: { settings: { voltage: 26.0 } },
    preweld: [{ ...G, workAngle: 42, speedFactor: 1.5 }],
    causes: [
      { id: 'hot', text: 'Voltage too high and travel too fast for the current', correct: true },
      { id: 'slow', text: 'Travel too slow' },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'ctwd', text: 'Contact tip too close to the work' },
    ],
    fixes: 'Set the voltage back inside the WPS range and slow down to the WPS travel speed.',
    hint: 'Run a finger (or a gauge) along both toes of the weld.',
    targets: ['5011', '(7)'],
    check: (s) => s.settings.voltage <= s.wps.ranges.voltage[1] + 1e-9,
  },
  {
    id: 'C6', title: 'Travel too slow, cold pool', iso: '506',
    joint: ['fillet', 'PB'], process: '135', seed: 106,
    fault: { settings: { voltage: 19.0 } },
    preweld: [{ ...G, workAngle: 42, speedFactor: 0.5 }],
    causes: [
      { id: 'slow', text: 'Travel too slow with a cold (low-voltage) arc: the pool rolls over the toe', correct: true },
      { id: 'hot', text: 'Arc too hot' },
      { id: 'pol', text: 'Wrong polarity' },
      { id: 'oil', text: 'Oil on the plate' },
    ],
    fixes: 'Set the voltage inside the WPS range and keep up with the pool at the WPS travel speed.',
    hint: 'Look at the lower toe: does the weld metal wet into the plate?',
    targets: ['506', '401', '(2)', '503'],
    check: (s) => s.settings.voltage >= s.wps.ranges.voltage[0] - 1e-9,
  },
  {
    id: 'C7', title: 'Side-wall lack of fusion in a bevel', iso: '4011',
    joint: ['butt', 'PA'], process: '135', seed: 107,
    fault: {},
    preweld: [{ ...B }, { ...B, aim: 2.5, speedFactor: 1.6 }, { ...B, weaveAmp: 3, toeDwell: 0.4 }, { ...B, weaveAmp: 4.5, toeDwell: 0.4 }],
    internal: true,
    causes: [
      { id: 'aim', text: 'Fill pass aimed at one side wall and run too fast: the other wall did not fuse', correct: true },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'crater', text: 'Crater not filled' },
      { id: 'pol', text: 'Wrong polarity' },
    ],
    fixes: 'Weave across the groove with a short dwell at each side wall and keep to the WPS travel speed.',
    hint: 'The surface looks fine. Cut a macro section.',
    targets: ['401'],
    check: () => true,
  },
  {
    id: 'C8', title: 'Short-circuit transfer on thick section', iso: '4012',
    joint: ['butt', 'PA'], process: '135', seed: 108,
    fault: { settings: { wfs: 3.0, voltage: 16.5 } },
    preweld: buttGood(),
    internal: true,
    causes: [
      { id: 'cold', text: 'Wire feed and voltage far too low: cold short-circuit runs do not fuse to the previous pass', correct: true },
      { id: 'hot', text: 'Arc too hot' },
      { id: 'oil', text: 'Oil on the plate' },
      { id: 'slag', text: 'Slag left between passes' },
    ],
    fixes: 'Set wire feed speed and voltage inside the WPS range.',
    hint: 'Compare the machine settings with the WPS. Then cut a section.',
    targets: ['401'],
    check: (s) => s.settings.wfs >= s.wps.ranges.wfs[0] - 1e-9 && s.settings.voltage >= s.wps.ranges.voltage[0] - 1e-9,
  },
  {
    id: 'C12', title: 'Slag left between passes', iso: '301',
    joint: ['butt', 'PA'], process: '136', seed: 112,
    fault: {},
    preweld: buttGood({ travelAngle: 12 }).map((p, k) => ({ ...p, clean: k === 0 ? undefined : false })),
    internal: true,
    causes: [
      { id: 'slag', text: 'Passes were not cleaned: flux-cored slag trapped under the next pass', correct: true },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'pol', text: 'Wrong polarity' },
      { id: 'hot', text: 'Arc too hot' },
    ],
    fixes: 'Brush or chip every flux-cored pass clean before the next one.',
    hint: 'This wire makes slag. Cut a section through the passes.',
    targets: ['301'],
    check: () => true,
  },
  {
    id: 'C14', title: 'Arc broken at the end of a run', iso: '2025, 104',
    joint: ['fillet', 'PB'], process: '135', seed: 114,
    fault: {},
    preweld: [{ ...G, workAngle: 42, stopsAt: [92, 150], craterDwell: 0 }],
    causes: [
      { id: 'crater', text: 'The arc was cut off without filling the crater', correct: true },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'volt', text: 'Voltage too high' },
      { id: 'oil', text: 'Oil on the plate' },
    ],
    fixes: 'Pause briefly at every stop (or reverse a little) to fill the crater before releasing the trigger.',
    hint: 'Look at each place where the arc stopped.',
    targets: ['2025', '104', '(3)', '(1)'],
    check: () => true,
  },
  {
    id: 'C15', title: 'Deep, narrow bead at high current', iso: '100 (101)',
    joint: ['fillet', 'PB'], process: '135', seed: 115,
    fault: { settings: { wfs: 12, voltage: 29.5 } },
    preweld: [{ ...G, workAngle: 42, speedFactor: 1.5 }],
    causes: [
      { id: 'crack', text: 'Current too high for the bead width: deep narrow bead cracked on solidification', correct: true },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'slow', text: 'Travel too slow' },
      { id: 'oil', text: 'Oil on the plate' },
    ],
    fixes: 'Set wire feed speed and voltage inside the WPS range to get a wider, shallower bead.',
    hint: 'Look along the centre of the bead.',
    targets: ['101', '(1)', '100'],
    check: (s) => s.settings.wfs <= s.wps.ranges.wfs[1] + 1e-9,
  },
  {
    id: 'C17', title: 'Wrong polarity', iso: '602',
    joint: ['fillet', 'PB'], process: '135', seed: 117,
    fault: { settings: { polarity: 'DCEN' } },
    preweld: [{ ...G, workAngle: 42 }],
    causes: [
      { id: 'pol', text: 'Polarity reversed (DCEN with solid wire): unstable arc and heavy spatter', correct: true },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'slow', text: 'Travel too slow' },
      { id: 'crater', text: 'Crater not filled' },
    ],
    fixes: 'Set the polarity required by the wire (DCEP for this solid wire).',
    hint: 'Listen to the arc and look at the plate beside the weld.',
    targets: ['602'],
    check: (s) => s.settings.polarity === 'DCEP',
  },
  {
    id: 'C18', title: 'Too much metal for the travel speed', iso: '502, 506',
    joint: ['butt', 'PA'], process: '135', seed: 118,
    fault: {},
    preweld: [{ ...B }, { ...B, weaveAmp: 2, toeDwell: 0.4 }, { ...B, weaveAmp: 3, toeDwell: 0.4 }, { ...B, weaveAmp: 3, toeDwell: 0.4, speedFactor: 0.36 }],
    causes: [
      { id: 'slow', text: 'Cap run too slowly: too much weld metal for the joint', correct: true },
      { id: 'fast', text: 'Cap run too fast' },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'pol', text: 'Wrong polarity' },
    ],
    fixes: 'Run the cap at the WPS travel speed.',
    hint: 'Measure the cap height with the bridge cam gauge.',
    targets: ['502', '506'],
    check: () => true,
  },
  {
    id: 'C20', title: 'Arc struck outside the joint', iso: '601',
    joint: ['fillet', 'PB'], process: '135', seed: 120,
    fault: {},
    preweld: [{ ...G, workAngle: 42, strikes: [{ s: 95, u: 30 }, { s: 150, u: 24 }] }],
    causes: [
      { id: 'strike', text: 'The arc was struck on the plate surface outside the joint', correct: true },
      { id: 'spatter', text: 'Spatter from a wrong voltage' },
      { id: 'gas', text: 'Shielding gas lost' },
      { id: 'crater', text: 'Crater not filled' },
    ],
    fixes: 'Strike the arc in the joint (or on the run-on tab) only.',
    hint: 'Look at the plate surface beside the weld.',
    targets: ['601'],
    check: () => true,
  },
  // ---- SMAW (111) ------------------------------------------------------------------------------
  {
    id: 'C1-S', title: 'Damp low-hydrogen electrodes', iso: '2017, 2011',
    joint: ['fillet', 'PB'], process: '111', smaw: { electrode: 'E7018', dia: 3.2 }, seed: 131,
    fault: { settings: { condition: 'exposed' } },
    preweld: [{ ...GS }],
    causes: [
      { id: 'moist', text: 'E7018 electrodes from an open box on the bench: the low-hydrogen coating has picked up moisture', correct: true },
      { id: 'hot', text: 'Current too high for the electrode' },
      { id: 'pol', text: 'Wrong polarity' },
      { id: 'fast', text: 'Travel too fast' },
    ],
    fixes: 'Use low-hydrogen electrodes straight from the holding oven (or a freshly opened hermetic can) and keep exposed ones within the manufacturer\'s time limit; redry or discard exposed electrodes as the manufacturer specifies.',
    hint: 'Where were these electrodes kept? Look at the surface of the weld.',
    targets: ['2017', '2011', '(8)'],
    check: (s) => s.settings.condition === 'dry',
  },
  {
    id: 'C2-S', title: 'Long arc with a low-hydrogen electrode', iso: '2017, 5011',
    joint: ['fillet', 'PB'], process: '111', smaw: { electrode: 'E7018', dia: 3.2 }, seed: 132,
    fault: {},
    preweld: [{ ...GS, ctwd: 5.5 }],
    causes: [
      { id: 'long', text: 'Arc held far too long: the coating\'s shielding was lost and the arc dug into the toes', correct: true },
      { id: 'moist', text: 'Damp electrodes' },
      { id: 'low', text: 'Current too low' },
      { id: 'pol', text: 'Wrong polarity' },
    ],
    fixes: 'Hold a very short arc with E7018, about the electrode diameter or less, and feed the holder down as the electrode burns.',
    hint: 'The electrodes came straight from the holding oven. Look at the pores, the toes and the spatter.',
    targets: ['2017', '2011', '5011', '(8)', '(7)'],
    check: () => true,
  },
  {
    id: 'C12-S', title: 'Slag left between SMAW passes', iso: '301',
    joint: ['butt', 'PA'], process: '111', smaw: { electrode: 'E7018', dia: 3.2 }, seed: 133,
    fault: {},
    preweld: buttSmaw().map((p, k) => ({ ...p, clean: k === 0 ? undefined : false })),
    internal: true,
    causes: [
      { id: 'slag', text: 'Passes were not chipped and brushed: slag trapped under the next pass', correct: true },
      { id: 'moist', text: 'Damp electrodes' },
      { id: 'pol', text: 'Wrong polarity' },
      { id: 'hot', text: 'Current too high' },
    ],
    fixes: 'Chip the slag off every pass with the chipping hammer and brush it clean before the next pass.',
    hint: 'Covered electrodes leave slag on every pass. Cut a section through the passes.',
    targets: ['301'],
    check: () => true,
  },
  {
    id: 'C17-S', title: 'Wrong polarity for E7018', iso: '602',
    joint: ['fillet', 'PB'], process: '111', smaw: { electrode: 'E7018', dia: 3.2 }, seed: 134,
    fault: { settings: { polarity: 'DCEN' } },
    preweld: [{ ...GS }],
    causes: [
      { id: 'pol', text: 'E7018 run on DCEN: its data sheets give DCEP (or AC), so the arc is unstable and spatters', correct: true },
      { id: 'hot', text: 'Current too high' },
      { id: 'short', text: 'Arc too short' },
      { id: 'moist', text: 'Damp electrodes' },
    ],
    fixes: 'Set the machine to DCEP (electrode positive), the polarity of the WPS and the first one the E7018 data sheets give.',
    hint: 'Compare the machine with the electrode data sheet. Look at the plate beside the weld.',
    targets: ['602'],
    check: (s) => s.settings.polarity === s.wps.ranges.polarity,
  },
  // ---- GTAW (141) on 3.2 mm sheet: the training WPS of gtawWps ----------------------------------------------
  {
    id: 'C1-T', title: 'Too much argon on the TIG torch', iso: '2017, 2011',
    joint: TIG_JOINT, process: '141', gtaw: { tungsten: 'EWCe-2', filler: 'ER70S-2' }, seed: 141,
    fault: { settings: { gasFlow: 25 } },
    preweld: [{ ...GT }],
    causes: [
      { id: 'flow', text: 'Argon flow far above the WPS range: the turbulent gas stream draws air into the shield', correct: true },
      { id: 'dip', text: 'Tungsten dipped into the pool' },
      { id: 'pol', text: 'Wrong polarity' },
      { id: 'speed', text: 'Travel too slow' },
    ],
    fixes: 'Set the argon flow inside the WPS range: 10–25 CFH, 4.7–11.8 L/min (Miller).',
    hint: 'Look at the bead surface, then at the flowmeter.',
    targets: ['2017', '2011', '(8)'],
    check: (s) => inRange(s.settings.gasFlow, s.wps.ranges.gasFlow),
  },
  {
    id: 'C3-T', title: 'Filler rod pulled out of the gas', iso: '2017, 2011',
    joint: TIG_JOINT, process: '141', gtaw: { tungsten: 'EWCe-2', filler: 'ER70S-2' }, seed: 9,
    fault: {},
    preweld: [{ ...GT, rodOut: true }],
    causes: [
      { id: 'rod', text: 'The hot rod end was pulled out of the argon between dabs: it oxidised and the oxide went into the pool', correct: true },
      { id: 'flow', text: 'Argon flow too high' },
      { id: 'oil', text: 'Oil on the joint' },
      { id: 'pol', text: 'Wrong polarity' },
    ],
    fixes: 'Keep the hot end of the rod inside the argon shield all the time: dab it into the front of the pool and pull it back only a little (Miller, ESAB).',
    hint: 'The machine and the gas are set right. Think about what the rod hand did between dabs.',
    targets: ['2017', '2011', '(8)'],
    check: () => true,
  },
  {
    id: 'C17-T', title: 'TIG welding on DCEP', iso: '401',
    joint: TIG_JOINT, process: '141', gtaw: { tungsten: 'EWCe-2', filler: 'ER70S-2' }, seed: 142,
    fault: { settings: { polarity: 'DCEP' } },
    preweld: [{ ...GT }],
    internal: true,
    causes: [
      { id: 'pol', text: 'Machine on DCEP: most of the heat goes into the tungsten, which melts into the pool, and the weld is shallow', correct: true },
      { id: 'gas', text: 'Argon flow too low' },
      { id: 'rod', text: 'Filler rod pulled out of the gas' },
      { id: 'hot', text: 'Current too high for the sheet' },
    ],
    fixes: 'Set the machine to DCEN (electrode negative) for TIG welding of steel, and regrind the tungsten before welding again.',
    hint: 'Look at the tungsten and at the polarity on the machine. Then cut a macro section.',
    targets: ['401'],
    check: (s) => s.settings.polarity === 'DCEN',
  },
];

// Mock tests (scope family E) are the welder qualification tests of qual/catalog.js.

// ---- Inspector lab coupons (scope family D) -------------------------------------------------------
export const INSPECT_COUPONS = [
  {
    id: 'D-1', title: 'Fillet PB: toe condition', pack: 'iso5817-2023', level: 'C',
    joint: ['fillet', 'PB'], process: '135', seed: 601,
    settings: { voltage: 25.0 },
    passes: [{ ...G, workAngle: 42, speedFactor: 1.0, settingsAt: (s) => (s > 70 && s < 150 ? { voltage: 25.0 } : { voltage: 21.5 }), speedNoise: 0.05 }],
    brief: 'Judge this fillet weld to ISO 5817:2023 level C.',
  },
  {
    id: 'D-2', title: 'Fillet PB: surface', pack: 'aws-d11-static', level: null,
    joint: ['fillet', 'PB'], process: '135', seed: 602,
    passes: [{ ...G, workAngle: 42, envAt: (s) => (s > 95 && s < 135 ? { gasAvailable: false } : {}) }],
    brief: 'Judge this fillet weld to AWS D1.1 Table 8.1, statically loaded.',
  },
  {
    id: 'D-3', title: 'Butt PA: cap and stop', pack: 'iso5817-2023', level: 'B',
    joint: ['butt', 'PA'], process: '135', seed: 603,
    passes: buttGood().map((p, k) => (k === 3 ? { ...p, stopsAt: [125], speedFactor: 0.62, restartGap: 0 } : p)),
    brief: 'Judge this butt weld to ISO 5817:2023. Try levels B, C and D.',
  },
  {
    id: 'D-4', title: 'Fillet PB: welder test piece', pack: 'iso9606-1', level: null,
    joint: ['fillet', 'PB'], process: '135', seed: 604,
    settings: { voltage: 19.5 },
    passes: [{ ...G, workAngle: 42, speedFactor: 0.62, strikes: [{ s: 140, u: 28 }] }],
    brief: 'Judge this welder test piece to ISO 9606-1 (visual).',
  },
  {
    id: 'D-5', title: 'Fillet PF: vertical up', pack: 'iso5817-2023', level: 'C',
    joint: ['fillet', 'PF'], process: '135', seed: 605,
    settings: { wfs: 4.0, voltage: 19.5 },
    passes: [{ ...G, weaveAmp: 2, toeDwell: 0.4 }],
    brief: 'Judge this vertical-up fillet weld to ISO 5817:2023 level C.',
  },
  {
    id: 'D-6', title: 'Butt PC: horizontal', pack: 'api1104', level: null,
    joint: ['butt', 'PC'], process: '135', seed: 606,
    passes: buttGood().map((p, k) => (k === 3 ? { ...p, settingsAt: (s) => (s > 60 && s < 120 ? { voltage: 25.5 } : {}), speedFactor: 1.15 } : p)),
    brief: 'Judge this butt weld to API 1104 visual criteria (training application to plate).',
  },
];

export function jointFor(def) {
  if (def[0] === 'pipe') return makePipeJoint({ ...(def[2] || {}), position: def[1] });
  return makeJoint(def[0], def[1], def[2] || {});
}
