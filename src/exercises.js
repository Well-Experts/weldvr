// Technique drills (scope catalogue family B) as guided exercises with objective criteria.
//
// What is sourced: the drill list and positions (scope Rev 0, family B); the progression of
// GMAW-S and FCAW fillet and groove welds in all positions, and spray transfer limited to
// 1F/2F fillets and 1G grooves (AWS SENSE Level I, Modules 5 and 6); spray transfer "mainly used
// ... in the flat or horizontal positions" for steel (CWB Group); restart by striking about 1.5 x
// the weld size ahead and backing up, and crater fill by backing up about 1.5 x the weld size
// (The Fabricator, "Minimizing start/stop welding defects"); work angle 45 deg on T-joints and
// 90 deg on butt joints, travel angle 5-15 deg in all positions, a slight weave to control the
// pool in vertical up, travel fast enough overhead that the metal does not fall out of the joint,
// a slight pause at the side of a weave bead against undercut (Miller Electric, "MIG Welding: The
// Basics for Mild Steel"); overlap the previous pass and clean the weld before the next run (iCEV
// pad-of-beads project, written for SMAW); temperature crayons used with contact thermometers or
// thermocouples to check interpass temperature (TWI FAQ); undercut limit as ISO 5817:2023 level C
// (h <= 0.1 t, max 0.5 mm), used as a reference.
// What is NOT sourced: every numeric pass threshold below is a SEED for the welding SME to set
// (the scope: "No pass mark is built in"). The results label them as such.

import { makeJoint } from './sim/joint.js';
import { makePipeJoint } from './sim/pipe.js';
import { evaluate, isoUndercutLimit } from './sim/rules/packs.js';
import { nominalCTWD } from './sim/process.js';
import { plateHeight } from './sim/record.js';

import { TRAINING_INTERPASS_MAX, pipeDemoPlan } from './sim/scripted.js'; // C, training WPS value (seed)
export { TRAINING_INTERPASS_MAX };

const STRINGER = { widthSd: 0.7, heightSd: 0.3, centreSd: 1.0, centreOff: 2.5, height: [1.5, 3.8], tech: 0.7, spatter: 40 };

export const EXERCISES = [
  {
    id: 'B1-S', scope: 'B1', title: 'Stringer beads', short: 'Stringer beads', sub: 'Bead on plate, flat (PA), three lanes',
    joint: ['plate', 'PA', { lanes: [-30, 0, 30], beadArea: 16 }],
    processes: ['135', '136', '114', '111'], passes: 3, laneMode: 'fixed',
    objective: 'Run three straight stringer beads along the scribed lines with a steady travel speed, stick-out and gun angle.',
    steps: [
      'Strike on the scribed start line of the first lane, keep the gun upright across the plate (work angle about 90°) with a 5–15° travel angle.',
      'Keep the arc on the line and the pacer chevron just ahead of the pool. Fill the crater at the end line, then release the trigger.',
      'Weld the other two lanes the same way. Clean flux-cored beads before you look at them.',
    ],
    criteria: ['widthSd', 'straight', 'height', 'undercut', 'pores', 'overlap', 'craterEnd', 'strikes', 'spatter', 'tech'],
    th: STRINGER,
    refs: ['Scope B1', 'AWS SENSE Level I Mod. 5/6', 'Miller: travel angle 5–15°'],
    smaw: {
      steps: [
        'Strike on the scribed start line of the first lane (scratch it like a match, or tap straight down) and lift at once to the arc length: about one electrode diameter, very short with E7018.',
        'Hold the electrode upright across the plate (work angle about 90°) and tip it 10–30° in the direction of travel (drag). Feed it down as it burns to keep the arc length.',
        'Keep the pool on the line at the pacer speed. Fill the crater at the end line, then lift to break the arc. Chip and brush the slag off each bead.',
      ],
      refs: ['Scope B1', 'Hobart/Miller 155095F: striking, arc length, slag removal', 'Hobart: arc length about the electrode diameter', 'Lincoln C2.410: drag 10–30°'],
    },
  },
  {
    id: 'B1-P', scope: 'B1', title: 'Pad of stringer beads', short: 'Pad of beads', sub: 'Five overlapping beads, flat (PA)',
    joint: ['plate', 'PA', { lanes: [-18], beadArea: 16, passes: 5 }],
    processes: ['135', '136', '114', '111'], passes: 5, laneMode: 'pad', padOverlap: 0.5,
    objective: 'Build a flat pad: each bead overlaps the previous one (about half its width in this drill) with no valleys, no lack of fusion between beads and no slag left between runs.',
    steps: [
      'Weld the first bead on the scribed line.',
      'Aim each next bead at the toe of the previous one (the guide line moves for you). Clean the weld before the next run: brush flux-cored slag off.',
      'Keep the same speed and angles on every bead so the pad stays flat.',
    ],
    criteria: ['widthSd', 'padFlat', 'lofInter', 'slag', 'undercut', 'pores', 'craterEnd', 'tech'],
    th: { ...STRINGER, padRipple: 1.0 },
    refs: ['Scope B1', 'iCEV pad of beads (SMAW project): overlap the previous pass, clean before the next run'],
    smaw: {
      steps: [
        'Weld the first bead on the scribed line: short arc, 10–30° drag.',
        'Chip and brush the slag off, then aim each next bead at the toe of the previous one (the guide line moves for you).',
        'Keep the same current, speed and angles on every bead so the pad stays flat.',
      ],
      refs: ['Scope B1', 'iCEV pad of beads (SMAW project): overlap the previous pass, clean before the next run', 'Hobart/Miller 155095F: remove slag before another pass'],
    },
  },
  {
    id: 'B2', scope: 'B2', title: 'Weave beads with toe dwell', short: 'Weave beads', sub: 'Bead on plate, flat (PA), two lanes',
    joint: ['plate', 'PA', { lanes: [-25, 25], beadArea: 30, weave: true }],
    processes: ['135', '136', '111'], passes: 2, laneMode: 'fixed',
    objective: 'Weave a wide, even bead with a short pause at each side so the edges fill without undercut.',
    steps: [
      'Move the gun side to side across the lane about 1.5 times per second, about 8 mm total width.',
      'Pause briefly at each side (toe dwell): a slight pause at the side of a weave bead helps avoid undercut (Miller).',
      'Travel slower than for a stringer: the pacer shows the speed for the wider bead.',
    ],
    criteria: ['widthBand', 'widthSd', 'straight', 'dwell', 'undercut', 'pores', 'craterEnd', 'tech'],
    th: { ...STRINGER, widthSd: 1.2, heightSd: 0.4, widthBand: [10, 17], dwell: 0.55 },
    refs: ['Scope B2', 'Miller: a slight pause at the side of a weave bead helps avoid undercut'],
    smaw: {
      steps: [
        'Weave side to side across the lane, no wider than 2.5 times the electrode diameter (Hobart/Miller).',
        'Pause briefly at each side so the edges fill without undercut.',
        'Travel slower than for a stringer: the pacer shows the speed for the wider bead. Chip and brush the slag off.',
      ],
      refs: ['Scope B2', 'Hobart/Miller 155095F: weave width at most 2-1/2 x the electrode diameter', 'Miller: pause at the side of a weave bead against undercut'],
    },
  },
  ...['PB', 'PF', 'PD'].map((pos) => ({
    id: `B3-${{ PB: '2F', PF: '3F', PD: '4F' }[pos]}`, scope: 'B3', title: `Fillet weld ${{ PB: '2F (PB)', PF: '3F vertical up (PF)', PD: '4F overhead (PD)' }[pos]}`, short: `Fillet ${{ PB: '2F (PB)', PF: '3F up (PF)', PD: '4F (PD)' }[pos]}`, sub: 'T-joint, 10 mm plate, 6 mm leg',
    joint: ['fillet', pos, {}], processes: ['135', '136', '114', '111'], passes: 1,
    objective: 'Make a single-pass 6 mm fillet weld that meets ISO 5817 level C on visual examination.',
    steps: pos === 'PF'
      ? ['Weld upward from the bottom, the gun pointing slightly up (travel angle 5–15°) and at 45° to both plates (Miller).', 'Use a slight weave to control the size and shape of the pool, with a short pause at each side (Miller).', 'Fill the crater at the top before you release the trigger.']
      : pos === 'PD'
        ? ['Aim at the root with a 45° work angle, equal distance from each plate (Miller).', 'Travel fast enough that the weld metal does not fall out of the joint (Miller).', 'Fill the crater at the end.']
        : ['Aim at the root with a 45° work angle, equal distance from each plate (Miller).', 'Travel at the pacer speed with a 5–15° travel angle.', 'Fill the crater at the end.'],
    criteria: ['code', 'tech'],
    code: { pack: 'iso5817-2023', level: 'C', mode: 'visual' },
    th: { tech: 0.7 },
    weave: pos === 'PF' ? { amp: 2, dwell: 0.4 } : null,
    refs: ['Scope B3', 'AWS SENSE Level I: fillet welds in all positions (GMAW-S, FCAW)', 'Miller: T-joint 45°, travel angle 5–15°'],
    smaw: {
      steps: pos === 'PF'
        ? ['Weld upward from the bottom at the WPS current (about 15% below flat: electrode data sheets), the electrode pointing into the joint at 45° to both plates.', 'Use a slight weave with a short pause at each side, no wider than 2.5 electrode diameters.', 'Change the electrode before the stub; restart ahead of the crater and move back into it. Fill the crater at the top, then chip and brush.']
        : pos === 'PD'
          ? ['Overhead: WPS current (about 15% below flat: electrode data sheets), electrode at 45° to both plates, a short arc.', 'Keep the pool small at the pacer speed; change the electrode before the stub, restart ahead of the crater and move back into it.', 'Fill the crater at the end, then chip and brush the slag off.']
          : ['Point the electrode into the joint at 45° and drag it 10–30° (Hobart, Lincoln C2.410), with a short arc.', 'Travel at the pacer speed. Change the electrode before it burns down to the stub; restart ahead of the crater and move back into it (Lincoln C2.410).', 'Fill the crater at the end, then chip and brush the slag off before inspection.'],
      refs: ['Scope B3', 'Hobart: T-joint electrode at 45°', 'Lincoln C2.410: drag 10–30°, restart ahead of the crater', 'Hobart 610 / 447A / 718: 15% less current out of position'],
    },
  })),
  ...['PA', 'PC', 'PF', 'PE'].map((pos) => ({
    id: `B4-${{ PA: '1G', PC: '2G', PF: '3G', PE: '4G' }[pos]}`, scope: 'B4', title: `Groove weld with backing ${{ PA: '1G (PA)', PC: '2G (PC)', PF: '3G vertical up (PF)', PE: '4G overhead (PE)' }[pos]}`, short: `Groove ${{ PA: '1G (PA)', PC: '2G (PC)', PF: '3G up (PF)', PE: '4G (PE)' }[pos]}`, sub: '10 mm plate, 60° V on backing, 4 passes',
    joint: ['butt', pos, {}], processes: ['135', '136', '114', '111'], passes: 4,
    objective: 'Weld root, two fills and cap in sequence, cleaning between runs and keeping the interpass temperature under the training WPS limit.',
    steps: [
      'Root: aim at the centre of the gap so both root faces and the backing bar fuse.',
      'Fills: weave across the groove with a short dwell at each side wall.',
      `Before every pass: clean the previous pass, and measure the temperature next to the joint with the thermometer (training WPS max ${TRAINING_INTERPASS_MAX} °C).`,
      'Cap: weave to just past both groove edges, pause at the toes.',
    ],
    criteria: ['passes', 'code', 'cleaning', 'interpass', 'tech'],
    code: { pack: 'iso5817-2023', level: 'C', mode: 'full' },
    interpass: TRAINING_INTERPASS_MAX,
    th: { tech: 0.6 },
    refs: ['Scope B4', 'AWS SENSE Level I: groove welds in all positions (GMAW-S, FCAW)'],
    smaw: {
      steps: [
        'Root: aim at the centre of the gap so both root faces and the backing bar fuse; short arc, 10–30° drag.',
        'Fills: weave across the groove, no wider than 2.5 electrode diameters, with a short dwell at each side wall.',
        `Before every pass: chip and brush the slag off, and measure the temperature next to the joint with the thermometer (training WPS max ${TRAINING_INTERPASS_MAX} °C).`,
        'Cap: weave to just past both groove edges, pause at the toes.',
      ],
      refs: ['Scope B4', 'Hobart/Miller 155095F: weave width, remove slag before another pass', 'Lincoln C2.410: clean the slag after each bead'],
    },
  })),
  {
    id: 'B7', scope: 'B7', title: 'Starts, stops, tie-ins and crater fill', short: 'Starts and stops', sub: 'Bead on plate, flat (PA), two planned stops',
    joint: ['plate', 'PA', { lanes: [0], beadArea: 16, marks: [85, 145] }],
    processes: ['135', '136', '114', '111'], passes: 1, laneMode: 'fixed',
    objective: 'Stop at each scribed mark without leaving a crater defect, and restart so the beads join with no gap and no cold lap.',
    steps: [
      'Weld to the first mark. Fill the crater: back up over the end of the bead about 1.5 times the weld size, then release the trigger (The Fabricator).',
      'Restart: strike the arc about 1.5 times the weld size ahead of the crater, back up quickly into the crater, then travel on (The Fabricator).',
      'Repeat at the second mark and fill the end crater.',
    ],
    criteria: ['stopsAtMarks', 'cratersFilled', 'tieIns', 'widthSd', 'straight', 'undercut', 'strikes'],
    th: { ...STRINGER, markTol: 10, tieGap: 1.5 },
    demo: { stopsAt: [85, 145], craterAtStops: 'backup', restartTech: 'aheadBackup', endBackup: true },
    refs: ['Scope B7', 'The Fabricator: restart 1.5 × weld size ahead, back up; crater fill by backing up'],
    smaw: {
      steps: [
        'Weld to the first mark. Fill the crater: back up over the end of the bead about 1.5 times the weld size, then lift to break the arc (The Fabricator).',
        'Restart: strike the arc ahead of the crater, move quickly back into the crater, then proceed in the direction of welding (Lincoln C2.410).',
        'Repeat at the second mark and fill the end crater. Change the electrode the same way if it runs short.',
      ],
      refs: ['Scope B7', 'The Fabricator: crater fill by backing up', 'Lincoln C2.410: strike ahead of the crater, move back into it'],
    },
  },
  {
    id: 'B8', scope: 'B8', title: 'Multi-pass sequence, cleaning and interpass temperature', short: 'Multi-pass and interpass', sub: 'FCAW-G (136) or SMAW (111) groove on backing, flat (PA)',
    joint: ['butt', 'PA', {}], processes: ['136', '111'], passes: 4,
    objective: 'Complete root, fills and cap with every pass cleaned and the interpass temperature measured and kept under the training WPS limit.',
    steps: [
      'Weld the root. Chip and brush the slag off the whole pass.',
      `Measure the temperature next to the joint with the thermometer. Wait until it is at or below ${TRAINING_INTERPASS_MAX} °C (the cooling can be sped up from the panel).`,
      'Weld each next pass the same way: clean, measure, then weld.',
    ],
    criteria: ['passes', 'cleaning', 'measured', 'interpass', 'code', 'tech'],
    code: { pack: 'iso5817-2023', level: 'C', mode: 'full' },
    interpass: TRAINING_INTERPASS_MAX,
    measure: true,
    th: { tech: 0.6 },
    refs: ['Scope B8 (and A6 interpass control)', 'TWI: temperature-indicating crayons and contact thermometers for interpass checks'],
  },
  // ---- Pipe, open root (scope B6): SMAW on NPS 2 Sch 80 (2 in extra strong: Lincoln Electric school ASME
  // pipe course; ASME B36.10 OD 60.3 mm, wall 5.54 mm), single-V groove without backing (Lincoln C2.420
  // in-plant pipe: bevel 30 deg, land 3/32-1/8 in, gap 1/8 in). The pass marks are seeds.
  ...PIPE_DRILLS(),
];

// Pipe drills (scope B6). Sources of the technique text: Lincoln C2.420 (in-plant and cross-country pipe),
// Lincoln C2.410 (vertical down angle, whipping, restarts), ESAB (electrode angles by position), ASME BPVC
// Section IX-2023 QW-122 (test positions), ISO 9606-1:2012 6.1 (12 o'clock mark on fixed pipe).
function PIPE_DRILLS() {
  const fitUp = 'Check the fit-up: a 3.2 mm (1/8 in) gap all the way round, a 2.4 mm land, and the 12 o\'clock mark on the pipe.';
  const grind = 'Grind the start and the crater of the first side to a feathered edge before the other side runs onto them (C2.420).';
  const change = 'Change the electrode with a fast pull-out (a flick) to shrink the keyhole; restart ahead of the crater and move back into it.';
  const refsRoot = ['Scope B6', 'Lincoln C2.420: 1/8 in gap, keyhole, root from bottom to top one side at a time, feathered stops', 'ESAB: electrode angles by position', 'ISO 9606-1 6.1: 12 o\'clock mark'];
  const root = (id, pos, prog, extra) => ({
    id, scope: 'B6',
    title: `Open root, ${pos} ${prog === 'up' ? 'uphill' : 'downhill'} (${prog === 'up' ? 'PH' : 'PJ'})`, short: `Root ${pos} ${prog === 'up' ? 'up' : 'down'}`,
    sub: 'NPS 2 Sch 80, root pass only (E6010)',
    joint: ['pipe', pos, { size: 'NPS2-80', progression: prog, rootOnly: true }],
    processes: ['111'], electrodes: ['E6010'], passes: 1,
    objective: prog === 'up'
      ? 'Run the root of a fixed pipe from the bottom to the top, one side at a time, with a small keyhole the whole way: complete penetration on both lips and an inside bead with no burn-through.'
      : 'Run the root of a fixed pipe from the top down each side, staying ahead of the pool: complete penetration on both lips and an inside bead with no burn-through.',
    steps: extra,
    criteria: ['code', 'keyhole', 'tieIns', 'tech'],
    code: { pack: 'iso5817-2023', level: 'C', mode: 'full' },
    th: { tech: 0.5, keyhole: 0.7, tieGap: 1.5 },
    refs: refsRoot,
  });
  const full = (id, pos, prog, steps, extraRefs = []) => ({
    id, scope: 'B6',
    title: `Pipe ${pos}${prog ? ` ${prog === 'up' ? 'uphill' : 'downhill'}` : ''}: root and cap`, short: `Pipe ${pos}`,
    sub: 'NPS 2 Sch 80, E6010 root + E7018 cap',
    joint: ['pipe', pos, { size: 'NPS2-80', progression: prog || undefined }],
    processes: ['111'], electrodes: ['E6010', 'E7018'], passes: 2,
    objective: 'Weld the open root and the cap with the WPS electrode for each pass, cleaning between runs, keeping under the interpass limit, and meet ISO 5817 level C on the finished joint.',
    steps,
    criteria: ['passes', 'code', 'keyhole', 'cleaning', 'interpass', 'tech'],
    code: { pack: 'iso5817-2023', level: 'C', mode: 'full' },
    interpass: TRAINING_INTERPASS_MAX,
    th: { tech: 0.5, keyhole: 0.7, tieGap: 1.5 },
    refs: [...refsRoot, 'Lincoln C2.420: cap about 1/16 in above the wall, 1/16-1/8 in over the groove edges', ...extraRefs],
  });
  const capUp = 'Chip and brush the root. Cap with E7018: weave to just past both groove edges with a pause at each side, about 1.6 mm (1/16 in) higher than the pipe wall; start it away from where the root was started.';
  return [
    root('B6-R5', '5G', 'up', [
      fitUp,
      'Strike just past 6 o\'clock and weld up one side to just past 12 o\'clock. Keep a small keyhole open at the root; if it closes the root is not penetrating. Push the electrode 5–10° up the joint on the sides, drag it slightly at the bottom and the top.',
      grind,
      'Weld the other side from the bottom, over the first side\'s start, and finish over its crater at the top.',
      change,
    ]),
    root('B6-RD', '5G', 'down', [
      fitUp,
      'Strike just past 12 o\'clock (not exactly at the top) and weld down one side, the electrode tipped 10–30° in the direction of travel. Travel fast enough to stay ahead of the pool.',
      grind,
      'Weld the other side from the top, over the first side\'s start, and finish over its crater just past 6 o\'clock (stopping exactly at 6 o\'clock invites burn-through, tie-in and suck-back problems: C2.420).',
      change,
    ]),
    full('B6-1G', '1G', null, [
      fitUp,
      'Weld on top of the pipe and roll it a quarter turn between runs (1G: the pipe is rolled during welding so that the weld metal is deposited from above: ASME IX QW-122). Keep a small keyhole on the root.',
      'Start each run in the crater of the last one; finish the last run over the start of the first.',
      capUp,
    ], ['ASME IX QW-122: 1G rolled, metal deposited from above']),
    full('B6-2G', '2G', null, [
      fitUp,
      'Pipe axis vertical: weld the root round the pipe in two halves the same way round; grind the first half\'s start and crater before the second half runs onto them.',
      'Cap: take care not to undercut the top of the weld; use the lower part of the current range and a short arc (C2.420).',
      capUp,
    ], ['Lincoln C2.420: horizontal cap passes, undercut on the top edge']),
    full('B6-5G', '5G', 'up', [
      fitUp,
      'Root from the bottom to the top, one side at a time, with a small keyhole; grind the first side\'s start and crater before the second side.',
      change,
      capUp,
    ]),
    full('B6-6G', '6G', 'up', [
      fitUp,
      'Pipe fixed at 45°: the joint goes through the overhead, vertical and flat positions. Root uphill, one side at a time, with a small keyhole; keep the arc in the middle of the gap so both lips fuse.',
      'Cap: watch the upper toe; the weld metal tends to sag toward the lower pipe.',
      capUp,
    ], ['ESAB: 6G contains all four positions']),
  ];
}

// Short names of the criteria (brief screen).
export const CRITERIA = {
  passes: 'Passes completed', widthSd: 'Bead size consistency', widthBand: 'Weave bead width', straight: 'Straightness',
  height: 'Bead height', padFlat: 'Pad surface flatness', lofInter: 'Fusion between beads', slag: 'No slag between runs',
  dwell: 'Toe dwell', undercut: 'Undercut', pores: 'Surface pores', overlap: 'Overlap and cold lap', craterEnd: 'End crater filled',
  strikes: 'No stray arc strikes', spatter: 'Spatter', stopsAtMarks: 'Stops at the marks', cratersFilled: 'Craters filled at the stops',
  tieIns: 'Tie-ins', cleaning: 'Cleaning between runs', interpass: 'Interpass temperature', measured: 'Temperature measured before each run',
  code: 'ISO 5817 level C', tech: 'Technique in window', keyhole: 'Keyhole kept on the root',
};

export function exerciseJoint(ex) {
  const [type, pos, opts] = ex.joint;
  if (type === 'pipe') return makePipeJoint({ ...(opts || {}), position: pos });
  return makeJoint(type, pos, opts);
}

export const isPipeDrill = (ex) => ex.joint[0] === 'pipe';

// Lane (u, mm) for pass k of a drill on a plate.
export function laneFor(ex, joint, rec, k) {
  if (joint.type !== 'plate') return 0;
  if (ex.laneMode === 'pad') {
    if (k === 0) return joint.lanes[0];
    const prev = rec.passes[k - 1];
    const w = meanOf(rowsOf(rec, k - 1), 'wb') || 8.6;
    const c = prev && prev.lane != null ? prev.lane : joint.lanes[0];
    return c + (1 - ex.padOverlap) * w;
  }
  return joint.lanes[Math.min(k, joint.lanes.length - 1)];
}

function rowsOf(rec, k, skipStops = false) {
  const j = rec.joint;
  const p = rec.passes[k];
  if (!p) return [];
  const near = skipStops ? p.stops.flatMap((s) => [s.s, s.sEnd ?? s.s]).concat(p.starts.filter((s) => s.restart).map((s) => s.s)) : [];
  const out = [];
  for (let i = j.tab; i < j.L - j.tab; i++) {
    if (!(p.area[i] > 0.05)) continue;
    if (near.some((x) => Math.abs(i - x) < 12)) continue; // stops and tie-ins are judged on their own
    out.push(rec.sample(k, i));
  }
  // drop 5 mm at each end of the deposited length (start and crater tapers)
  return out.slice(5, Math.max(5, out.length - 5));
}

function meanOf(rows, key) {
  if (!rows.length) return null;
  return rows.reduce((a, r) => a + (r[key] || 0), 0) / rows.length;
}

function sdOf(rows, key) {
  if (rows.length < 2) return null;
  const m = meanOf(rows, key);
  return Math.sqrt(rows.reduce((a, r) => a + ((r[key] || 0) - m) ** 2, 0) / rows.length);
}

const f1 = (x) => (x == null ? '–' : x.toFixed(1));

// ctx: { rec, sum, tech (per-pass technique summary), readings [{t, x, T, pass}] }
export function evaluateExercise(ex, ctx) {
  const { rec, sum } = ctx;
  const j = rec.joint;
  const th = ex.th || {};
  const items = [];
  const add = (id, label, ok, measured, target, note = '') => items.push({ id, label, ok, measured, target, note });
  const passes = rec.passes.filter((p) => p.tLast.some((v) => v >= 0)).map((p) => p.index);
  const plate = j.type === 'plate';
  const passRows = passes.map((k) => ({ k, rows: rowsOf(rec, k, true), lane: rec.passes[k].lane ?? 0 }));
  const ucLim = isoUndercutLimit(j.t, 'C');
  for (const c of ex.criteria) {
    switch (c) {
      case 'passes': {
        add(c, 'Passes completed', passes.length >= ex.passes, `${passes.length}`, `${ex.passes}`);
        break;
      }
      case 'widthSd': {
        const worst = Math.max(0, ...passRows.map((p) => sdOf(p.rows, 'wb') ?? 0));
        const worstH = Math.max(0, ...passRows.map((p) => sdOf(p.rows, 'h') ?? 0));
        const ok = passRows.length > 0 && worst <= th.widthSd && worstH <= th.heightSd;
        add(c, 'Bead size consistency: width / height (standard deviation)', ok, `${f1(worst)} / ${f1(worstH)} mm`, `≤ ${th.widthSd} / ${th.heightSd} mm`, 'seed');
        break;
      }
      case 'widthBand': {
        const ws = passRows.map((p) => meanOf(p.rows, 'wb')).filter((x) => x != null);
        const ok = ws.length > 0 && ws.every((w) => w >= th.widthBand[0] && w <= th.widthBand[1]);
        add(c, 'Weave bead width', ok, ws.map(f1).join(' / ') + ' mm', `${th.widthBand[0]}–${th.widthBand[1]} mm`, 'seed');
        break;
      }
      case 'straight': {
        let worstSd = 0, worstOff = 0;
        for (const p of passRows) {
          worstSd = Math.max(worstSd, sdOf(p.rows, 'uc') ?? 0);
          const m = meanOf(p.rows, 'uc');
          if (m != null) worstOff = Math.max(worstOff, Math.abs(m - p.lane));
        }
        add(c, 'Straightness: wander / offset from the line', passRows.length > 0 && worstSd <= th.centreSd && worstOff <= th.centreOff, `${f1(worstSd)} / ${f1(worstOff)} mm`, `≤ ${th.centreSd} / ${th.centreOff} mm`, 'seed');
        break;
      }
      case 'height': {
        const hs = passRows.map((p) => meanOf(p.rows, 'h')).filter((x) => x != null);
        const ok = hs.length > 0 && hs.every((h) => h >= th.height[0] && h <= th.height[1]);
        add(c, 'Bead height', ok, hs.map(f1).join(' / ') + ' mm', `${th.height[0]}–${th.height[1]} mm`, 'seed');
        break;
      }
      case 'padFlat': {
        // pad surface: deepest valley between neighbouring bead crowns, at three cross-sections
        const lanes = passRows.map((p) => p.lane).sort((a, b) => a - b);
        let worst = lanes.length >= 2 ? 0 : null;
        for (const f of [0.25, 0.5, 0.75]) {
          const i = Math.round(j.tab + j.evalL * f);
          for (let q = 0; q + 1 < lanes.length; q++) {
            const a = lanes[q], b = lanes[q + 1];
            const ca = surfacePlate(rec, i, a), cb = surfacePlate(rec, i, b);
            let lo = Infinity;
            for (let u = a; u <= b; u += 0.25) lo = Math.min(lo, surfacePlate(rec, i, u));
            worst = Math.max(worst, Math.min(ca, cb) - lo);
          }
        }
        add(c, 'Pad surface: valley between beads', worst != null && worst <= th.padRipple, `${f1(worst)} mm`, `≤ ${th.padRipple} mm`, 'seed');
        break;
      }
      case 'lofInter': {
        const n = sum.internal.filter((it) => it.type === 'lofInter').length;
        add(c, 'Fusion between beads (macro section, model)', n === 0, `${n} mm`, '0 mm');
        break;
      }
      case 'slag': {
        const n = sum.internal.filter((it) => it.type === 'slag').length;
        add(c, 'Slag trapped between runs (301, model)', n === 0, `${n} mm`, '0 mm');
        break;
      }
      case 'dwell': {
        const d = passRows.map((p) => meanOf(p.rows, 'dwell')).filter((x) => x != null);
        add(c, 'Toe dwell share', d.length > 0 && d.every((x) => x >= th.dwell), d.map((x) => `${Math.round(x * 100)}%`).join(' / '), `≥ ${Math.round(th.dwell * 100)}%`, 'seed');
        break;
      }
      case 'undercut': {
        let m = 0;
        for (const p of passRows) for (const r of p.rows) m = Math.max(m, r.uc1 || 0, r.uc2 || 0);
        add(c, 'Undercut (ISO 5817 C limit as reference)', m <= ucLim, `${m.toFixed(2)} mm`, `≤ ${ucLim} mm`);
        break;
      }
      case 'pores': {
        // surface pores on the worst bead: the model keeps a small sporadic rate even with good
        // shielding, while lost shielding gives tens of pores per bead
        const per = passes.map((k) => sum.pores.filter((p) => p.surface && p.pass === k).length);
        const worst = Math.max(0, ...per);
        add(c, 'Surface pores (2017), worst bead', passes.length > 0 && worst <= (th.pores ?? 1), `${worst}`, `≤ ${th.pores ?? 1} per bead`, 'seed');
        break;
      }
      case 'overlap': {
        let n = 0;
        for (const p of passRows) for (const r of p.rows) if ((r.ov1 || 0) > 0.3 || (r.ov2 || 0) > 0.3 || r.lofSurface) n++;
        add(c, 'Overlap / cold lap (506, 401)', n === 0, `${n} mm`, '0 mm');
        break;
      }
      case 'craterEnd': {
        const ends = passes.map((k) => {
          const st = rec.passes[k].stops;
          return st.length ? st[st.length - 1] : null;
        });
        const open = ends.filter((s) => s && !s.filled).length;
        add(c, 'End crater filled (no crater pipe 2025)', ends.length > 0 && open === 0, `${open} open`, '0 open');
        break;
      }
      case 'strikes': {
        add(c, 'Arc strikes outside the weld (601)', sum.arcStrikes.length === 0, `${sum.arcStrikes.length}`, '0');
        break;
      }
      case 'spatter': {
        const per100 = (sum.spatter.length / Math.max(1, sum.joint.L)) * 100 / Math.max(1, passes.length);
        add(c, 'Spatter (balls per 100 mm per bead)', per100 <= th.spatter, `${per100.toFixed(0)}`, `≤ ${th.spatter}`, 'seed');
        break;
      }
      case 'stopsAtMarks': {
        const stops = rec.passes.flatMap((p) => p.stops);
        const okMarks = (j.marks || []).map((m) => stops.some((s) => Math.abs((s.sEnd ?? s.s) - m) <= th.markTol));
        add(c, 'Stopped at each mark', okMarks.length > 0 && okMarks.every(Boolean), `${okMarks.filter(Boolean).length}/${okMarks.length}`, `±${th.markTol} mm`, 'seed tolerance');
        break;
      }
      case 'cratersFilled': {
        const stops = rec.passes.flatMap((p) => p.stops).filter((s) => s.s >= j.tab && s.s <= j.L - j.tab);
        const open = stops.filter((s) => !s.filled);
        add(c, 'Craters filled at the stops (2025, 104)', stops.length > 0 && open.length === 0, `${stops.length - open.length}/${stops.length}`, 'all', stops.map((s) => s.method).join(', '));
        break;
      }
      case 'tieIns': {
        const rs = rec.passes.flatMap((p) => p.starts.filter((s) => s.restart).map((s) => ({ ...s, pass: p.index })));
        const bad = rs.filter((r) => {
          if (r.gap > th.tieGap) return true;
          // cold lap where the new bead joins the old one
          const k = r.pass;
          for (let i = Math.floor(Math.min(r.sMin, r.s)) - 3; i <= Math.ceil(r.s) + 3; i++) {
            const sm = i >= 0 && i < j.n && rec.passes[k].area[i] > 0.05 ? rec.sample(k, i) : null;
            if (sm && sm.lofSurface) return true;
          }
          return false;
        });
        add(c, 'Tie-ins: no gap, no cold lap', rs.length >= (j.marks || []).length && bad.length === 0, `${rs.length - bad.length}/${rs.length}`, 'all', rs.map((r) => (r.backed ? 'backed up' : 'direct')).join(', '));
        break;
      }
      case 'cleaning': {
        const slagPasses = passes.filter((k) => rec.passes[k].slagProcess);
        if (!slagPasses.length) {
          add(c, 'Slag cleaned between runs', true, 'no slag', '—', 'solid wire: no slag');
          break;
        }
        const dirty = slagPasses.filter((k) => k < passes[passes.length - 1] && rec.cleanFraction(k) < 0.95);
        const n301 = sum.internal.filter((it) => it.type === 'slag').length;
        add(c, 'Slag cleaned between runs', dirty.length === 0 && n301 === 0, dirty.length ? `pass ${dirty.map((k) => k + 1).join(', ')} not clean` : 'clean', '≥ 95% of each run');
        break;
      }
      case 'interpass': {
        const lim = ex.interpass;
        const vals = passes.slice(1).map((k) => rec.passes[k].interpass);
        const worst = Math.max(-Infinity, ...vals.map((v) => (v ? v.max : -Infinity)));
        add(c, 'Interpass temperature at each run start (model)', vals.length > 0 && vals.every((v) => v && v.max <= lim + 0.5), Number.isFinite(worst) ? `${Math.round(worst)} °C` : '–', `≤ ${lim} °C`, 'training WPS value');
        break;
      }
      case 'measured': {
        const rd = ctx.readings || [];
        const need = passes.slice(1);
        const ok = need.filter((k) => {
          const ip = rec.passes[k].interpass;
          if (!ip) return false;
          return rd.some((r) => r.t <= ip.t && ip.t - r.t <= 120);
        });
        add(c, 'Temperature measured before each run', need.length > 0 && ok.length === need.length, `${ok.length}/${need.length}`, 'all', 'within 2 min before the run (seed)');
        break;
      }
      case 'code': {
        const e = evaluate(sum, ex.code.pack, ex.code.level, { mode: ex.code.mode });
        const dec = e.findings.find((f) => f.verdict === 'reject');
        add(c, `ISO 5817:2023 level ${ex.code.level}${ex.code.mode === 'full' ? ' incl. internal (model)' : ' (visual)'}`, e.verdict === 'accept', e.verdict === 'accept' ? 'accept' : `reject: ${dec ? `${dec.ref} ${dec.name}` : ''}`, 'accept');
        break;
      }
      case 'keyhole': {
        // root run of an open-root joint: share of the arc time with the keyhole open and not too big
        // (station stats; window as the live cue)
        const k0 = (ctx.tech || [])[0];
        const kh = k0 && k0.keyhole;
        const share = kh && kh.t > 0 ? kh.tin / kh.t : null;
        add(c, 'Keyhole kept open on the root (share of the root arc time)', share != null && share >= th.keyhole, share == null ? '–' : `${Math.round(share * 100)}%`, `≥ ${Math.round(th.keyhole * 100)}%`, 'seed');
        break;
      }
      case 'tech': {
        const keys = ['workAngle', 'travelAngle', 'stickOut', 'speed', 'aim'];
        let worst = 1, worstKey = null;
        for (const p of ctx.tech || []) {
          if (!p || !(p.arcTime > 0)) continue;
          for (const k of keys) {
            const m = p[k];
            if (m && m.inWindow < worst) {
              worst = m.inWindow;
              worstKey = k;
            }
          }
        }
        const names = { workAngle: 'work angle', travelAngle: 'travel angle', stickOut: 'stick-out', speed: 'travel speed', aim: 'aim' };
        add(c, 'Technique in window (worst metric)', worst >= th.tech, `${Math.round(worst * 100)}%${worstKey ? ` (${names[worstKey]})` : ''}`, `≥ ${Math.round(th.tech * 100)}%`, 'seed');
        break;
      }
      default:
        break;
    }
  }
  const met = items.filter((i) => i.ok).length;
  return { items, met, total: items.length, all: met === items.length };
}

// Bead-on-plate surface height at sample i, lateral u (all passes).
function surfacePlate(rec, i, u) {
  return plateHeight(rec, i, u);
}

// Scripted plan that performs an exercise well (demo welds and tests).
export function demoPlan(ex, joint, k, process = '135', settings = null) {
  if (joint.pipe) return pipeDemoPlan(joint, k);
  // travel angle 10 deg: middle of Miller's 5-15 deg and inside every wire-process window; SMAW: 20 deg,
  // the middle of Lincoln's 10-30 deg drag, at the electrode's nominal arc length
  const smaw = process === '111';
  const base = { travelAngle: smaw ? 20 : 10, ctwd: nominalCTWD(process, settings), craterDwell: 0.6 };
  if (joint.type === 'plate') {
    const p = { ...base, workAngle: 90 };
    if (ex.id === 'B2') Object.assign(p, { weaveAmp: 3.5, toeDwell: 0.5 });
    if (ex.demo) Object.assign(p, ex.demo);
    return p;
  }
  if (joint.type === 'fillet') {
    const p = { ...base, workAngle: joint.position === 'PB' ? 42 : 45 };
    if (ex.weave) Object.assign(p, { weaveAmp: ex.weave.amp, toeDwell: ex.weave.dwell });
    return p;
  }
  return { ...base, workAngle: 90, weaveAmp: [0.5, 2, 3, 4.5][Math.min(k, 3)], toeDwell: k ? 0.4 : 0 };
}
