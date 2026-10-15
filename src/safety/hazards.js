// Hazard hunt: unsafe conditions that can be placed in the workshop. The trainee inspects the area,
// points at each hazard and names it; the debrief shows the rule and its source. Every hazard is a
// condition named in a cited rule.

export const HAZARDS = {
  cylinderLoose: {
    title: 'Gas cylinder not secured',
    what: 'The shielding-gas cylinder stands free: the chain is unhooked.',
    rule: 'Cylinders are secured upright with a chain, strap or cable so they cannot be knocked over.',
    refs: [{ ref: 'Z49', at: '10.8.4.12' }, { ref: 'FS30' }, { ref: 'OSHA350', at: '(a)(9)' }],
    fix: 'Hook the chain around the cylinder.',
  },
  cylinderNoCap: {
    title: 'Valve protection cap missing',
    what: 'A spare cylinder in storage has no valve protection cap.',
    rule: 'Valve protection caps are kept in place, hand-tight, except when the cylinder is in use or connected for use.',
    refs: [{ ref: 'OSHA253', at: '(b)(2)(iv)' }, { ref: 'Z49', at: '10.8.3.6' }],
    fix: 'Screw the cap on hand-tight.',
  },
  combustibles: {
    title: 'Combustibles near the welding',
    what: 'Cardboard boxes and rags are within 35 ft (10.7 m) of the work.',
    rule: 'Where practicable, combustibles are moved at least 35 ft (10.7 m) from the work; otherwise they are covered or shielded, and a fire watch is kept.',
    refs: [{ ref: 'OSHA252', at: '(a)(2)(vii), (a)(2)(iii)(A)' }, { ref: 'FS6' }],
    fix: 'Move them out of the area or cover them with a fire-resistant blanket.',
  },
  extinguisherMissing: {
    title: 'Fire extinguisher missing',
    what: 'The extinguisher bracket at the booth is empty.',
    rule: 'Suitable fire extinguishing equipment is kept ready for instant use, in its designated place.',
    refs: [{ ref: 'OSHA252', at: '(a)(2)(ii)' }, { ref: 'OSHA157', at: '(c)(4)' }, { ref: 'Z49', at: '6.2.1.1' }],
    fix: 'Return a charged extinguisher to the bracket before hot work.',
  },
  extinguisherEmpty: {
    title: 'Fire extinguisher discharged',
    what: 'The extinguisher gauge needle is in the red (empty) zone.',
    rule: 'Portable extinguishers are kept fully charged and operable, and inspected monthly.',
    refs: [{ ref: 'OSHA157', at: '(c)(4), (e)(2)' }],
    fix: 'Replace it with a charged extinguisher and report it.',
  },
  extinguisherBlocked: {
    title: 'Fire extinguisher blocked',
    what: 'Boxes are stacked in front of the extinguisher.',
    rule: 'Extinguishers are mounted and located so that they are readily accessible.',
    refs: [{ ref: 'OSHA157', at: '(c)(1)' }],
    fix: 'Clear the access to the extinguisher.',
  },
  cableDamaged: {
    title: 'Damaged welding cable',
    what: 'The work lead has cut insulation with bare conductor showing.',
    rule: 'Cables with damaged insulation or exposed bare conductors are replaced.',
    refs: [{ ref: 'OSHA254', at: '(d)(9)(iii)' }, { ref: 'FS39' }],
    fix: 'Take the cable out of service and replace it.',
  },
  cableSplice: {
    title: 'Splice near the holder',
    what: 'The gun cable is taped together less than 10 ft (3 m) from the gun.',
    rule: 'Cables with splices within 10 ft (3 m) of the holder are not used.',
    refs: [{ ref: 'OSHA254', at: '(d)(8)' }, { ref: 'FS5' }],
    fix: 'Replace the cable.',
  },
  curtainOpen: {
    title: 'Welding curtain left open',
    what: 'The booth curtain is pulled back toward the walkway.',
    rule: 'People near the welding area are protected from the rays by noncombustible or flameproof screens, or wear eye protection.',
    refs: [{ ref: 'OSHA252', at: '(b)(2)(iii)' }, { ref: 'Z49', at: '4.1.3' }],
    fix: 'Close the curtain before striking an arc.',
  },
  hoodFar: {
    title: 'Fume hood out of position',
    what: 'The extraction hood is parked far from the weld.',
    rule: 'Movable hoods are placed within one hood diameter of the welding point; otherwise they will not capture the fume.',
    refs: [{ ref: 'HSE_WL3' }, { ref: 'OSHA252', at: '(c)(3)(i)' }],
    fix: 'Bring the hood close to the weld and check the airflow indicator.',
  },
  wetFloor: {
    title: 'Water on the floor at the machine',
    what: 'A puddle of water around the welding machine and where the welder stands.',
    rule: 'Machines that have become wet are dried and tested before use; in damp conditions the welder is insulated from wet surfaces.',
    refs: [{ ref: 'OSHA254', at: '(d)(9)(ii)' }, { ref: 'OSHA252', at: '(a)(2)(v)' }, { ref: 'HSE_SAFETY' }],
    fix: 'Clear the water, check the machine, use a dry insulating mat.',
  },
  clampFar: {
    title: 'Work clamp far from the weld',
    what: 'The work clamp is attached to the bench leg, far from the joint.',
    rule: 'Connect the work clamp to the work as close to the point of welding as possible; the work lead is firmly attached to the work.',
    refs: [{ ref: 'FS5' }, { ref: 'OSHA254', at: '(d)(2)' }, { ref: 'HSE_SAFETY' }],
    fix: 'Clamp the work lead next to the joint on clean metal.',
  },
  holderOnCylinder: {
    title: 'Gun hung on the gas cylinder',
    what: 'The welding gun hangs on the cylinder valve.',
    rule: 'Electrode holders are placed so they cannot touch people, conducting objects or gas cylinders; cylinders must not become part of an electric circuit.',
    refs: [{ ref: 'OSHA254', at: '(d)(7)' }, { ref: 'OSHA253', at: '(b)(5)(ii)(J)' }],
    fix: 'Hang the gun on its insulated holder.',
  },
  oxyFuelTogether: {
    title: 'Oxygen stored with acetylene',
    what: 'Oxygen and acetylene cylinders are stored side by side.',
    rule: 'Stored oxygen cylinders are separated from fuel-gas cylinders by 20 ft (6.1 m) or by a noncombustible barrier at least 5 ft (1.5 m) high with a fire rating of at least half an hour.',
    refs: [{ ref: 'OSHA253', at: '(b)(4)(iii)' }, { ref: 'Z49', at: '10.8.2.3' }],
    fix: 'Move the oxygen to the other side of the storage barrier.',
  },
  acetyleneLying: {
    title: 'Acetylene cylinder lying down',
    what: 'An acetylene cylinder lies on its side on the floor.',
    rule: 'Acetylene cylinders are stored and used valve end up.',
    refs: [{ ref: 'OSHA253', at: '(b)(3)(ii), (b)(5)(iii)(A)' }, { ref: 'Z49', at: '10.8.2.5' }],
    fix: 'Stand it up, secure it and let it stand before use (supplier instructions).',
  },
  oilyRegulator: {
    title: 'Oil on the oxygen equipment',
    what: 'An oily rag lies on the oxygen regulator.',
    rule: 'Cylinders, valves, regulators and hoses are kept free from oily or greasy substances.',
    refs: [{ ref: 'OSHA253', at: '(b)(5)(i)' }],
    fix: 'Remove the rag; have the regulator checked.',
  },
  grinderGuard: {
    title: 'Grinder without its guard',
    what: 'The angle grinder on the bench has its wheel guard removed.',
    rule: 'Right-angle grinders have a guard between the operator and the wheel, exposing no more than 180 degrees of the wheel.',
    refs: [{ ref: 'OSHA243', at: '(c)(3)' }],
    fix: 'Refit the guard before use.',
  },
  signsMissing: {
    title: 'No welding area signs',
    what: 'There are no signs at the booth entrance.',
    rule: 'Signs designate welding areas and show that eye protection and other protective devices must be worn.',
    refs: [{ ref: 'Z49', at: '4.1.2' }],
    fix: 'Post the welding area and PPE signs.',
  },
  hotUnmarked: {
    title: 'Hot work piece not marked',
    what: 'A freshly welded coupon cools on the bench with no warning.',
    rule: 'After welding, hot metal is marked or another warning is given to others.',
    refs: [{ ref: 'OSHA252', at: '(b)(4)(vii)' }, { ref: 'FS7' }],
    fix: 'Write HOT on it with soapstone.',
  },
};

export const HAZARD_IDS = Object.keys(HAZARDS);

// Hazards that cannot appear together (one place in the scene).
const EXCLUSIVE = [['extinguisherMissing', 'extinguisherEmpty', 'extinguisherBlocked'], ['holderOnCylinder', 'cylinderLoose']];

// Pick n hazards with a seeded generator.
export function pickHazards(n, rand) {
  const pool = HAZARD_IDS.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const k = Math.floor(rand() * pool.length);
    const id = pool.splice(k, 1)[0];
    const group = EXCLUSIVE.find((g) => g.includes(id));
    if (group && out.some((o) => group.includes(o))) continue;
    out.push(id);
  }
  return out;
}

export function scoreHunt(present, found, falseAlarms) {
  const hit = present.filter((id) => found.includes(id));
  const missed = present.filter((id) => !found.includes(id));
  return { hit, missed, falseAlarms: falseAlarms.slice(), score: present.length ? hit.length / present.length : 1 };
}
