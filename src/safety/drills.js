// Data and scoring of the Safety and PPE drills (pure: no rendering), used by modes/safety.js.
// Requirements come from safety/ppe.js, hazards.js and incidents.js, each with its source.

import { PPE_ITEMS } from './ppe.js';
import { makeJoint } from '../sim/joint.js';
import { wpsFor, gtawJoint } from '../scenarios.js';
import { arcState, nominalCTWD } from '../sim/process.js';

// ---- S1 jobs -----------------------------------------------------------------------------------------
// Each job: the welding task the PPE is checked against, an optional test-run coupon, and the extra
// (defective or unsuitable) items placed on the rack beside the normal stock.
const it = (id, defect = null) => ({ id, slot: PPE_ITEMS[id].slot, defect });
export const PPE_JOBS = [
  {
    id: 'J1',
    title: 'MAG fillet weld in the booth',
    brief: 'GMAW (135) fillet weld on 10 mm steel, horizontal position (PB), 1.0 mm solid wire, Ar + 18% CO2. The booth has an extraction arm.',
    process: '135', type: 'fillet', position: 'PB', levOk: true,
    extra: [it('helmet_adf', 'sensor'), it('spectacles'), it('fleece'), it('gloves_gauntlet', 'hole'), it('gloves_nitrile')],
    tryWeld: true,
  },
  {
    id: 'J2',
    title: 'Overhead flux-cored fillet weld',
    brief: 'FCAW-G (136) fillet weld overhead (PD) on 10 mm steel. Sparks and spatter fall toward the welder.',
    process: '136', type: 'fillet', position: 'PD', levOk: true,
    extra: [it('helmet_passive', 'cracked'), it('jacket_fr', 'oily'), it('gloves_gauntlet', 'wet'), it('spectacles')],
    tryWeld: true,
  },
  {
    id: 'J4',
    title: 'Stick (MMA) fillet weld with E7018',
    brief: 'SMAW (111) fillet weld on 10 mm steel, horizontal position (PB), E7018 3.2 mm electrodes on DCEP. The electrode is live whenever the machine is on, and you change electrodes by hand during the weld.',
    process: '111', type: 'fillet', position: 'PB', levOk: true,
    extra: [it('gloves_gauntlet', 'wet'), it('gloves_tig'), it('gloves_gauntlet', 'hole'), it('spectacles')],
    tryWeld: true,
  },
  {
    id: 'J5',
    title: 'TIG fillet weld on 3.2 mm sheet',
    brief: 'GTAW (141) fillet weld on 3.2 mm (1/8 in) steel sheet, horizontal position (PB), 2.4 mm ceriated tungsten, ER70S-2 filler rod, argon. One hand holds the torch, the other feeds the rod close to the arc.',
    process: '141', type: 'fillet', position: 'PB', levOk: true,
    extra: [it('gloves_tig', 'hole'), it('gloves_nitrile'), it('spectacles'), it('helmet_adf', 'sensor')],
    tryWeld: true,
  },
  {
    id: 'J3',
    title: 'Outdoor repair on a steel frame',
    brief: 'FCAW-S (114) fillet welds on a steel frame outside the workshop door. Local exhaust ventilation cannot capture fume outdoors.',
    process: '114', type: 'fillet', position: 'PB', levOk: false,
    extra: [it('jacket_fr', 'frayed'), it('fleece'), it('gloves_nitrile')],
    tryWeld: false,
    note: 'This job is checked at the rack only; there is no test run outdoors in this build.',
    noteRefs: [{ ref: 'HSE_CONTROLS' }, { ref: 'HSE_STSU1' }],
  },
];

// Arc current of the training WPS for a job (A), from the process model.
// Coupon of a job (GTAW jobs weld 3.2 mm sheet).
export function jobJoint(job) {
  return job.process === '141' ? gtawJoint(job.type, job.position) : makeJoint(job.type, job.position);
}

export function jobCurrent(job) {
  const joint = jobJoint(job);
  const w = wpsFor(job.process, joint);
  const a = arcState(w.settings, nominalCTWD(job.process, w.settings), 5, { gasAvailable: true });
  return a ? Math.round(a.I) : null;
}

export function jobTask(job) {
  return { process: job.process, current: jobCurrent(job), position: job.position, levOk: job.levOk };
}

// ---- S2 spots ----------------------------------------------------------------------------------------
// Places the trainee can point at, with the hazards that can be there (the box is the first hazard's).
export const SPOTS = [
  { id: 'cylinder', label: 'Shielding-gas cylinder at the bench', hazards: ['cylinderLoose', 'holderOnCylinder'] },
  { id: 'spare', label: 'Spare cylinder in the booth corner', hazards: ['cylinderNoCap'] },
  { id: 'entrance', label: 'Walkway at the booth entrance', hazards: ['combustibles'] },
  { id: 'extinguisher', label: 'Fire extinguisher', hazards: ['extinguisherMissing', 'extinguisherEmpty', 'extinguisherBlocked'] },
  { id: 'workLead', label: 'Work lead (return cable)', hazards: ['cableDamaged'] },
  { id: 'gunCable', label: 'Gun cable', hazards: ['cableSplice'] },
  { id: 'clamp', label: 'Work clamp', hazards: ['clampFar'] },
  { id: 'curtain', label: 'Booth curtain', hazards: ['curtainOpen'] },
  { id: 'signs', label: 'Signs at the booth entrance', hazards: ['signsMissing'] },
  { id: 'hood', label: 'Fume extraction hood', hazards: ['hoodFar'] },
  { id: 'floor', label: 'Floor at the machine', hazards: ['wetFloor'] },
  { id: 'gasStore', label: 'Gas cylinder store', hazards: ['oxyFuelTogether', 'acetyleneLying'] },
  { id: 'oxyCart', label: 'Oxy-fuel cutting cart', hazards: ['oilyRegulator'] },
  { id: 'grinder', label: 'Angle grinder', hazards: ['grinderGuard'] },
  { id: 'hotCoupon', label: 'Coupon on the bench corner', hazards: ['hotUnmarked'] },
];
export const spotOf = (h) => SPOTS.find((s) => s.hazards.includes(h));

// Score of a hunt. tags: { spotId: { choices: [hazard ids], none: bool } } (several hazards can be
// named at one place). A named hazard that is present is found; a wrong name at a place where a
// hazard is present but was not named counts as the right place with the wrong name (once per
// missed hazard); other wrong names are false alarms.
export function scoreTags(present, tags) {
  const chosen = (id) => {
    const tg = tags[id];
    if (!tg) return [];
    if (tg.choices) return tg.choices;
    return tg.choice && tg.choice !== 'none' ? [tg.choice] : [];
  };
  const found = [], misnamed = [], missed = [], falseAlarms = [];
  for (const spot of SPOTS) {
    const ch = chosen(spot.id);
    const here = spot.hazards.filter((h) => present.includes(h));
    const wrong = ch.filter((c) => !present.includes(c));
    for (const h of here) {
      if (ch.includes(h)) found.push(h);
      else if (wrong.length) {
        misnamed.push(h);
        wrong.shift();
      } else missed.push(h);
    }
    falseAlarms.push(...wrong);
  }
  const n = present.length || 1;
  const score = Math.max(0, (found.length + 0.5 * misnamed.length - 0.25 * falseAlarms.length) / n);
  return { found, misnamed, missed, falseAlarms, score };
}

// ---- S3 permit -----------------------------------------------------------------------------------------
export const FIRE_WATCH_RULES = {
  osha: { label: 'OSHA 29 CFR 1910.252', minutes: 30, refs: [{ ref: 'OSHA252', at: '(a)(2)(iii)(B)' }] },
  z49: { label: 'ANSI Z49.1:2021', minutes: 60, refs: [{ ref: 'Z49', at: '6.2.4' }] },
};

export const PERMIT_ITEMS = [
  { id: 'combustibles', text: 'Combustibles moved at least 35 ft (10.7 m) away, or protected with fire-resistant covers', refs: [{ ref: 'OSHA252', at: '(a)(2)(vii)' }, { ref: 'FS6' }] },
  { id: 'extinguisher', text: 'Charged fire extinguisher in place and accessible at the work', refs: [{ ref: 'OSHA252', at: '(a)(2)(ii)' }, { ref: 'OSHA157', at: '(c)(1), (c)(4)' }] },
  { id: 'curtain', text: 'Booth curtain closed so others are protected from the arc', refs: [{ ref: 'OSHA252', at: '(b)(2)(iii)' }, { ref: 'Z49', at: '4.1.3' }] },
  { id: 'watch', text: 'Fire watch assigned: during the work and after it', refs: [{ ref: 'OSHA252', at: '(a)(2)(iii)(A), (B)' }, { ref: 'Z49', at: '6.2.2, 6.2.4' }] },
];
