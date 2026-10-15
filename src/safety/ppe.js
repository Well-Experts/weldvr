// Personal protective equipment for arc welding: the items on the PPE rack, their possible defects,
// and the requirements for a task, each tied to its source. "shall" = mandatory wording in the cited
// clause; "should" = recommendation in the cited source.

import { shadeGuide, assessShade } from './shade.js';

// slot: where the item is worn. Only one item per slot.
export const PPE_ITEMS = {
  helmet_adf: { slot: 'helmet', name: 'Auto-darkening welding helmet', sub: 'Variable dark shade 9–13, light state 3.5, marked Z87.1', helmet: true, adf: true, shadeRange: [9, 13] },
  helmet_passive: { slot: 'helmet', name: 'Welding helmet, fixed filter plate', sub: 'Filter plate shade 10, marked Z87.1', helmet: true, adf: false, fixedShade: 10 },
  glasses: { slot: 'eyes', name: 'Safety glasses with side shields', sub: 'Marked Z87.1, clear lenses', sideShields: true, marked: true },
  // oxy-fuel cutting: goggles with a filter lens (OSHA 1910.133(a)(5) oxygen cutting minimum 3 to 5 by thickness)
  goggles_gas: { slot: 'eyes', name: 'Gas cutting goggles, filter shade 5', sub: 'Indirect vents, marked Z87.1', sideShields: true, marked: true, filterShade: 5 },
  spectacles: { slot: 'eyes', name: 'Reading spectacles', sub: 'No side shields, no Z87.1 marking', sideShields: false, marked: false },
  cap_fr: { slot: 'cap', name: 'Flame-resistant skull cap', sub: 'Worn under the helmet' },
  earplugs_fr: { slot: 'ears', name: 'Flame-resistant ear plugs', sub: 'Keep sparks out of the ear canals' },
  respirator: { slot: 'resp', name: 'Half mask respirator, P3 filters', sub: 'Particulate filters only: no protection against gases' },
  jacket_fr: { slot: 'torso', name: 'Flame-resistant cotton welding jacket', sub: 'Long sleeves, collar, covered pockets', fr: true, arms: true },
  jacket_leather: { slot: 'torso', name: 'Leather welding jacket', sub: 'Heavy cowhide, long sleeves', fr: true, arms: true, leather: true },
  fleece: { slot: 'torso', name: 'Polyester fleece jacket', sub: '100% polyester', fr: false, melts: true, arms: true },
  tshirt: { slot: 'torso', name: 'Short-sleeved cotton T-shirt', sub: 'Arms uncovered', fr: false, arms: false },
  apron: { slot: 'apron', name: 'Leather welding apron', sub: 'Chest and lap' },
  cape: { slot: 'cape', name: 'Leather cape sleeves with bib', sub: 'Shoulders and arms, for overhead work' },
  gloves_gauntlet: { slot: 'hands', name: 'Leather gauntlet welding gloves', sub: 'Cowhide, insulated, long cuff', fr: true, gauntlet: true },
  gloves_tig: { slot: 'hands', name: 'Goatskin TIG gloves', sub: 'Thin and flexible, short cuff', fr: true, thin: true },
  gloves_nitrile: { slot: 'hands', name: 'Nitrile work gloves', sub: 'Thin synthetic rubber', fr: false, melts: true },
  trousers: { slot: 'legs', name: 'Cuffless work trousers', sub: 'Worn over the boot tops' },
  jeans_cuffed: { slot: 'legs', name: 'Jeans with turned-up cuffs', sub: 'Cuffs catch sparks', cuffs: true },
  boots: { slot: 'feet', name: 'Leather safety boots', sub: 'High top, safety toe, laced' },
  trainers: { slot: 'feet', name: 'Trainers', sub: 'Fabric sports shoes', fabric: true },
};

// Defects an item can carry in a scenario; the trainee is expected to spot them before use.
export const DEFECTS = {
  hole: { label: 'Hole in the glove', applies: ['gloves_gauntlet', 'gloves_tig'] },
  wet: { label: 'Wet gloves', applies: ['gloves_gauntlet', 'gloves_tig'] },
  oily: { label: 'Oil and grease on the jacket', applies: ['jacket_fr', 'jacket_leather'] },
  frayed: { label: 'Frayed, torn sleeve', applies: ['jacket_fr'] },
  cracked: { label: 'Cracked filter plate', applies: ['helmet_passive'] },
  sensor: { label: 'Arc sensors covered with spatter (ADF will not darken)', applies: ['helmet_adf'] },
};

export const SLOTS = ['helmet', 'eyes', 'cap', 'ears', 'resp', 'torso', 'apron', 'cape', 'hands', 'legs', 'feet'];

// Overhead positions (ISO 6947): PE (plate butt overhead), PD (fillet overhead), and the fixed pipe
// positions, which take the weld through the overhead position at the bottom of the pipe (ESAB: "5G/5F
// contains 1G/1F, 3G/3F and 4G/4F positions"; "6G contains all 4 positions"): PH, PJ (5G), H-L045, J-L045 (6G).
const OVERHEAD = new Set(['PE', 'PD', 'PH', 'PJ', 'H-L045', 'J-L045']);
export function isOverhead(position) {
  return OVERHEAD.has(position);
}

// Requirements for a task. task: { process, current, position, levOk, shade }
// Each rule: { id, level, text, refs, check(worn) -> { status, note } }, status: ok | missing | wrong | defect | na
export function ppeRules(task) {
  const rules = [];
  const item = (worn, slot) => (worn[slot] ? { ...PPE_ITEMS[worn[slot].id], id: worn[slot].id, defect: worn[slot].defect || null } : null);
  const overhead = isOverhead(task.position);
  if (task.process === '81') return gasCuttingRules(task, item);

  rules.push({
    id: 'helmet', level: 'shall', text: 'Welding helmet with a filter lens for all arc welding',
    refs: [{ ref: 'OSHA252', at: '(b)(2)(i)(A)' }, { ref: 'Z49', at: '4.2.1.1' }],
    check(worn) {
      const h = item(worn, 'helmet');
      if (!h) return { status: 'missing' };
      if (h.defect === 'cracked') return { status: 'defect', note: 'Filter plates must be free of flaws (OSHA 1910.252(b)(2)(ii)(F)); replace it.' };
      if (h.defect === 'sensor') return { status: 'defect', note: 'Blocked light sensors can stop an ADF switching to the dark shade (AWS Fact Sheet No. 31).' };
      return { status: 'ok' };
    },
  });

  const guide = shadeGuide(task.process, task.current);
  rules.push({
    id: 'shade', level: 'shall', text: 'Filter shade at or above the minimum for the process and current',
    refs: [{ ref: 'OSHA133', at: '(a)(5)' }, { ref: 'Z49', at: 'Table 1 (suggested shade)' }],
    guide,
    check(worn) {
      const h = item(worn, 'helmet');
      if (!h || !guide) return { status: 'na' };
      const shade = h.adf ? task.shade : h.fixedShade;
      const a = assessShade(shade, guide);
      // notes are interface keys with values (translated with t(note, vars))
      if (a.below) return { status: 'wrong', note: 'Shade {s} is below the minimum {m}.', vars: { s: shade, m: guide.min }, shade };
      if (a.belowSuggested) return { status: 'ok', note: 'Shade {s} meets the minimum {m}; Z49.1 suggests {g} for comfort.', vars: { s: shade, m: guide.min, g: Array.isArray(guide.suggested) ? guide.suggested.join('–') : guide.suggested }, shade, comfort: false };
      return { status: 'ok', shade, comfort: true };
    },
  });

  rules.push({
    id: 'glasses', level: 'shall', text: 'Safety glasses with side shields under the helmet',
    refs: [{ ref: 'Z49', at: '4.2.1.1' }, { ref: 'FS31' }, { ref: 'OSHA133', at: '(a)(2)' }],
    check(worn) {
      const g = item(worn, 'eyes');
      if (!g) return { status: 'missing' };
      if (!g.sideShields || !g.marked) return { status: 'wrong', note: 'Eye protection needs side protection (OSHA 1910.133(a)(2)) and a Z87.1 marking (AWS Fact Sheet No. 31).' };
      return { status: 'ok' };
    },
  });

  rules.push({
    id: 'clothing', level: 'shall', text: 'Flame-resistant clothing covering the arms; no meltable synthetics',
    refs: [{ ref: 'Z49', at: '4.3, 4.3.1, E4.3' }, { ref: 'CCOHS_PPE' }, { ref: 'FS7' }],
    check(worn) {
      const c = item(worn, 'torso');
      if (!c) return { status: 'missing' };
      if (c.melts) return { status: 'wrong', note: 'Synthetic fabric can burn vigorously, melt and cause bad skin burns (CCOHS).' };
      if (!c.arms) return { status: 'wrong', note: 'Bare arms: clothing must give enough coverage against sparks, spatter and radiation (Z49.1 4.3.1).' };
      if (!c.fr) return { status: 'wrong' };
      if (c.defect === 'oily') return { status: 'defect', note: 'Keep clothing free of grease and oil (AWS Fact Sheet No. 7).' };
      if (c.defect === 'frayed') return { status: 'defect', note: 'Frayed clothing ignites easily and should not be worn (Z49.1 E4.3).' };
      return { status: 'ok' };
    },
  });

  rules.push({
    id: 'gloves', level: 'shall', text: 'Flame-resistant gloves, dry and in good repair',
    refs: [{ ref: 'Z49', at: '4.3.2' }, { ref: 'FS37' }, { ref: 'FS33' }],
    check(worn) {
      const g = item(worn, 'hands');
      if (!g) return { status: 'missing' };
      if (!g.fr) return { status: 'wrong', note: 'Welding gloves must be flame resistant (Z49.1 4.3.2).' };
      if (g.defect === 'hole') return { status: 'defect', note: 'Gloves must be in good repair: no holes (Z49.1 4.3.2).' };
      if (g.defect === 'wet') return { status: 'defect', note: 'Gloves must be dry: wet gloves conduct (Z49.1 4.3.2, AWS Fact Sheet No. 5).' };
      // AWS FS 37: thin, flexible gloves suit low-current GTAW, not every process
      if (g.thin && task.process !== '141') return { status: 'wrong', note: 'Thin TIG gloves suit low-current GTAW; use insulated gauntlet gloves for this process (AWS Fact Sheet No. 37).' };
      return { status: 'ok' };
    },
  });

  rules.push({
    id: 'legs', level: 'should', text: 'Trousers without cuffs, over the boot tops',
    refs: [{ ref: 'Z49', at: 'E4.3' }, { ref: 'FS33' }, { ref: 'CCOHS_PPE' }],
    check(worn) {
      const l = item(worn, 'legs');
      if (!l) return { status: 'missing' };
      if (l.cuffs) return { status: 'wrong', note: 'Cuffs collect sparks (CCOHS); pants should not have cuffs (Z49.1 E4.3).' };
      return { status: 'ok' };
    },
  });

  rules.push({
    id: 'boots', level: 'should', text: 'Leather safety boots, high top',
    refs: [{ ref: 'FS33' }, { ref: 'CCOHS_PPE' }],
    check(worn) {
      const b = item(worn, 'feet');
      if (!b) return { status: 'missing' };
      if (b.fabric) return { status: 'wrong', note: 'Wear leather, safety-toed, high-topped boots (AWS Fact Sheet No. 33).' };
      return { status: 'ok' };
    },
  });

  if (overhead) {
    rules.push({
      id: 'cape', level: 'shall', text: 'Cape sleeves or shoulder cover for overhead welding',
      refs: [{ ref: 'Z49', at: '4.3.5' }],
      check: (worn) => (item(worn, 'cape') ? { status: 'ok' } : { status: 'missing' }),
    });
    rules.push({
      id: 'ears', level: 'shall', text: 'Flame-resistant ear plugs when working overhead',
      refs: [{ ref: 'Z49', at: '4.3.6' }, { ref: 'FS33' }],
      check: (worn) => (item(worn, 'ears') ? { status: 'ok' } : { status: 'missing' }),
    });
    rules.push({
      id: 'cap', level: 'should', text: 'Flame-resistant cap under the helmet',
      refs: [{ ref: 'Z49', at: '4.3.6' }, { ref: 'CCOHS_PPE' }],
      check: (worn) => (item(worn, 'cap') ? { status: 'ok' } : { status: 'missing' }),
    });
  }

  if (task.levOk === false) {
    rules.push({
      id: 'resp', level: 'shall', text: 'Respirator when fume extraction cannot control the fume',
      refs: [{ ref: 'Z49', at: '4.5' }, { ref: 'HSE_STSU1' }, { ref: 'HSE_WL3' }],
      check: (worn) => (item(worn, 'resp') ? { status: 'ok' } : { status: 'missing' }),
    });
  }
  return rules;
}

export function checkPPE(worn, task) {
  const rules = ppeRules(task);
  const out = rules.map((r) => ({ ...r, result: r.check(worn) }));
  const failsShall = out.filter((r) => r.level === 'shall' && r.result.status !== 'ok' && r.result.status !== 'na');
  const failsShould = out.filter((r) => r.level === 'should' && r.result.status !== 'ok' && r.result.status !== 'na');
  return { rules: out, ok: failsShall.length === 0, failsShall, failsShould };
}

// What the worn PPE protects, used by the exposure and burn models.
export function protection(worn) {
  const get = (slot) => (worn[slot] ? { ...PPE_ITEMS[worn[slot].id], defect: worn[slot].defect || null } : null);
  const torso = get('torso');
  const hands = get('hands');
  const helmet = get('helmet');
  const eyes = get('eyes');
  return {
    helmet,
    glasses: !!(eyes && eyes.sideShields),
    arms: !!(torso && torso.arms && !torso.melts && !(torso.defect === 'frayed')),
    armsMelt: !!(torso && torso.melts),
    armsCovered: !!(torso && torso.arms),
    hands: !!(hands && hands.fr),
    handHole: !!(hands && hands.defect === 'hole'),
    handsWet: !!(hands && hands.defect === 'wet'),
    handsMelt: !!(hands && hands.melts),
    gloveItem: hands,
    resp: !!get('resp'),
    ears: !!get('ears'),
    cape: !!get('cape'),
    apron: !!get('apron'),
    feet: get('feet'),
    legs: get('legs'),
  };
}

// Oxy-fuel cutting (ISO 4063 81). Eyes: goggles (or a helmet) with a filter at or above the OSHA minimum for
// oxygen cutting by plate thickness (OSHA 1910.133(a)(5): under 1 in shade 3, 1 to 6 in shade 4, over 6 in
// shade 5); Harris Safeguard 1: goggles, gloves and protective clothing, "Watch for sparks in cuffs". Clothing,
// gloves, legs and boots as for welding (Z49.1 4.3, E4.3; AWS Fact Sheet 33).
function gasCuttingRules(task, item) {
  const rules = [];
  const guide = shadeGuide('81', task.thickness ?? 12.7);
  const filterOf = (worn) => {
    const h = item(worn, 'helmet');
    if (h) return { kind: 'helmet', shade: h.adf ? h.lightShade ?? 3.5 : h.fixedShade, h };
    const e = item(worn, 'eyes');
    if (e && e.filterShade) return { kind: 'goggles', shade: e.filterShade, e };
    return null;
  };
  rules.push({
    id: 'shade', level: 'shall', text: 'Eye protection with a filter lens at or above the minimum shade for oxygen cutting',
    refs: [{ ref: 'OSHA133', at: '(a)(5)' }, { ref: 'Z49', at: 'Table 1 (suggested shade)' }],
    guide,
    check(worn) {
      const f = filterOf(worn);
      if (!f) {
        const e = item(worn, 'eyes');
        return e ? { status: 'wrong', note: 'Clear safety glasses have no filter: use cutting goggles with a filter lens (OSHA 1910.133(a)(5)).' } : { status: 'missing' };
      }
      const a = assessShade(f.shade, guide);
      if (a && a.below) return { status: 'wrong', note: 'Shade {s} is below the minimum {m}.', vars: { s: f.shade, m: guide.min }, shade: f.shade };
      return { status: 'ok', shade: f.shade, comfort: !(a && a.belowSuggested) };
    },
  });
  rules.push({
    id: 'glasses', level: 'shall', text: 'Eye protection with side protection, marked Z87.1',
    refs: [{ ref: 'OSHA133', at: '(a)(2)' }, { ref: 'FS31' }],
    check(worn) {
      const e = item(worn, 'eyes');
      const h = item(worn, 'helmet');
      if (!e && !h) return { status: 'missing' };
      if (e && (!e.sideShields || !e.marked)) return { status: 'wrong', note: 'Eye protection needs side protection (OSHA 1910.133(a)(2)) and a Z87.1 marking (AWS Fact Sheet No. 31).' };
      return { status: 'ok' };
    },
  });
  rules.push({
    id: 'clothing', level: 'shall', text: 'Flame-resistant clothing covering the arms; no meltable synthetics',
    refs: [{ ref: 'Z49', at: '4.3, 4.3.1, E4.3' }, { ref: 'CCOHS_PPE' }, { ref: 'FS7' }],
    check(worn) {
      const c = item(worn, 'torso');
      if (!c) return { status: 'missing' };
      if (c.melts) return { status: 'wrong', note: 'Synthetic fabric can burn vigorously, melt and cause bad skin burns (CCOHS).' };
      if (!c.arms) return { status: 'wrong', note: 'Bare arms: clothing must give enough coverage against sparks, spatter and radiation (Z49.1 4.3.1).' };
      if (!c.fr) return { status: 'wrong' };
      if (c.defect === 'oily') return { status: 'defect', note: 'Keep clothing free of grease and oil (AWS Fact Sheet No. 7).' };
      if (c.defect === 'frayed') return { status: 'defect', note: 'Frayed clothing ignites easily and should not be worn (Z49.1 E4.3).' };
      return { status: 'ok' };
    },
  });
  rules.push({
    id: 'gloves', level: 'shall', text: 'Flame-resistant gauntlet gloves, dry and in good repair',
    refs: [{ ref: 'Z49', at: '4.3.2' }, { ref: 'FS33' }],
    check(worn) {
      const g = item(worn, 'hands');
      if (!g) return { status: 'missing' };
      if (!g.fr) return { status: 'wrong', note: 'Welding gloves must be flame resistant (Z49.1 4.3.2).' };
      if (g.defect === 'hole') return { status: 'defect', note: 'Gloves must be in good repair: no holes (Z49.1 4.3.2).' };
      if (g.thin) return { status: 'wrong', note: 'Use insulated gauntlet gloves against the sparks and hot metal of cutting.' };
      return { status: 'ok' };
    },
  });
  rules.push({
    id: 'legs', level: 'should', text: 'Trousers without cuffs, over the boot tops',
    refs: [{ ref: 'Z49', at: 'E4.3' }, { ref: 'FS33' }, { ref: 'CCOHS_PPE' }],
    check(worn) {
      const l = item(worn, 'legs');
      if (!l) return { status: 'missing' };
      if (l.cuffs) return { status: 'wrong', note: 'Cuffs collect sparks (CCOHS); pants should not have cuffs (Z49.1 E4.3).' };
      return { status: 'ok' };
    },
  });
  rules.push({
    id: 'boots', level: 'should', text: 'Leather safety boots, high top',
    refs: [{ ref: 'FS33' }, { ref: 'CCOHS_PPE' }],
    check(worn) {
      const b = item(worn, 'feet');
      if (!b) return { status: 'missing' };
      if (b.fabric) return { status: 'wrong', note: 'Wear leather, safety-toed, high-topped boots (AWS Fact Sheet No. 33).' };
      return { status: 'ok' };
    },
  });
  return rules;
}

// The PPE a trained welder would put on for a task (used by "Quick dress" outside the safety drills).
export function standardKit(task) {
  if (task.process === '81') {
    return { eyes: { id: 'goggles_gas' }, torso: { id: 'jacket_fr' }, hands: { id: 'gloves_gauntlet' }, legs: { id: 'trousers' }, feet: { id: 'boots' } };
  }
  const kit = {
    helmet: { id: 'helmet_adf' },
    eyes: { id: 'glasses' },
    torso: { id: 'jacket_fr' },
    hands: { id: task.process === '141' ? 'gloves_tig' : 'gloves_gauntlet' },
    legs: { id: 'trousers' },
    feet: { id: 'boots' },
  };
  if (isOverhead(task.position)) {
    kit.cape = { id: 'cape' };
    kit.ears = { id: 'earplugs_fr' };
    kit.cap = { id: 'cap_fr' };
  }
  if (task.levOk === false) kit.resp = { id: 'respirator' };
  return kit;
}
