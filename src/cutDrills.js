// Oxy-fuel cutting drills (scope C): the outfit procedure, straight and bevel cuts on plate, and the response
// to a sustained backfire, each with its criteria. Criteria quote their source; limits without one are marked
// `seed` (training targets of this build).
//   Procedure: Victor 0056-3260 Sections 5-7 and Victor 0056-0138 4.01-4.02 (ofc.js STEPS); OSHA 1910.253.
//   Cut quality: Harris "Machine Cutting Guide" PN 9700208 categories (cut.js); ISO 9013:2017 perpendicularity
//   or angularity tolerance u ranges and EN 1090-2:2018 execution classes ("EXC2 Range 5"; "EXC3 and EXC4
//   Range 4"; EXC1 "dross shall be removed"), as reproduced by Lincoln Electric (secondary).
//   Backfire response: Victor 0056-3260 5.06 ("immediately turn off the oxygen valve on the torch handle."
//   "Then, turn off the fuel valve."); AWS Fact Sheet No. 28 definitions.

import { STEPS } from './sim/ofc.js';
import { CUT_CATEGORIES, CATEGORY_ORDER, ISO9013_U } from './sim/cut.js';

export const CUT_DRILLS = [
  {
    id: 'C1', title: 'Outfit set-up, lighting and shut-down', short: 'Set-up and shut-down',
    sub: 'Oxygen and acetylene cylinders, regulators, leak test, purge, neutral flame, shut-down',
    plate: 'P12', outfit: { ready: false }, cut: false,
    objective: 'Set up the outfit, light the torch to a neutral flame and shut it down, step by step as the instructions for the equipment say.',
    steps: [
      'Check the cylinders are chained upright; take the valve caps off.',
      'Crack each cylinder valve, standing to the side of the outlet, then fit the regulators.',
      'With both adjusting screws released, open the oxygen cylinder valve slowly, then fully; the acetylene valve about 3/4 turn, the wrench left on.',
      'Leak test: 20 psig oxygen, 10 psig fuel, cylinder valves closed, watch the gauges for five minutes.',
      'Set the working pressures from the tip chart (acetylene never above 15 psig) and purge each hose.',
      'Fuel valve about 1/8 turn, light with the spark lighter; open the fuel until the smoke stops; preheat oxygen to a neutral flame; press the lever and readjust.',
      'Shut down: preheat oxygen first, then fuel; close the cylinders; bleed oxygen, then fuel; release both screws.',
    ],
    criteria: ['allSteps', 'noPop', 'neutral', 'zero'],
  },
  {
    id: 'C2', title: 'Straight cut on 12.7 mm plate', short: 'Straight cut',
    sub: '1/2 in (12.7 mm) plate, tip 0, square cut along the soapstone line',
    plate: 'P12', outfit: { ready: true }, cut: true, bevel: 0,
    objective: 'Cut the strip off along the line with a square, clean face: a drop cut with slightly sloping drag lines and no slag stuck to the bottom.',
    steps: [
      'Light the torch and set a neutral flame; press the lever and readjust it.',
      'Hold the inner cones 3–6 mm above the edge at the start of the line until it is bright red.',
      'Press the lever slowly and fully; move along the line at a steady speed with the torch square to the plate.',
      'Listen for the steady sputter and watch the sparks: straight down out of the bottom of the kerf.',
      'If the cut is lost, release the lever, go back to the end of the kerf, preheat and start again.',
      'Run off the far edge; let the strip and the plate cool before you handle them.',
    ],
    criteria: ['severed', 'quality', 'square', 'dross', 'line', 'topEdge'],
    th: { quality: 0.8, range: 4, drossAdh: 0.1, line: 1.5, lineShare: 0.9, top: 1.0 },
  },
  {
    id: 'C3', title: 'Bevel cut, 30° on 12.7 mm plate', short: 'Bevel cut',
    sub: 'Weld preparation: a 30° bevel along the line, tip 0',
    plate: 'P12', outfit: { ready: true }, cut: true, bevel: 30,
    objective: 'Cut a 30° bevel along the line, the torch tilted toward the strip, with an even face and a clean top edge.',
    steps: [
      'Tilt the torch 30° from the vertical toward the strip, square to the line along it.',
      'Preheat the corner at the start; a bevel cut runs slower than a square cut (the preheat is deflected from the plate).',
      'Keep the angle and the cone distance steady to the far edge.',
    ],
    criteria: ['severed', 'quality', 'square', 'dross', 'line'],
    th: { quality: 0.75, range: 5, drossAdh: 0.15, line: 2.0, lineShare: 0.85 },
  },
  {
    id: 'C4', title: 'Straight cut on 25 mm plate', short: 'Thick plate',
    sub: '1 in (25.4 mm) plate, tip 2',
    plate: 'P25', outfit: { ready: true }, cut: true, bevel: 0,
    objective: 'Cut through 25 mm plate: a longer preheat at the edge, then a slower, steady travel.',
    steps: [
      'Set the pressures for 1 in plate from the tip chart; tip size 2.',
      'Preheat the whole edge at the start until it is bright red.',
      'Travel slower than on 12.7 mm: watch that the sparks still leave the bottom of the kerf.',
    ],
    criteria: ['severed', 'quality', 'square', 'dross', 'line'],
    th: { quality: 0.75, range: 4, drossAdh: 0.15, line: 1.5, lineShare: 0.9 },
  },
  {
    id: 'C5', title: 'Backfire: shut the torch down', short: 'Backfire response',
    sub: 'A sustained backfire in the torch: oxygen off first, then fuel',
    plate: 'P12', outfit: { ready: true }, cut: false, backfire: true,
    objective: 'The flame has gone back into the torch and keeps burning there (a squeal or hiss). Shut it off the way the instructions say, at once.',
    steps: [
      'Recognise it: a pop, then a squealing or hissing sound from the torch.',
      'Turn off the torch OXYGEN valve immediately.',
      'Then turn off the fuel valve.',
      'Let the torch cool before relighting; if it happens again, have the torch repaired.',
    ],
    criteria: ['o2First', 'quick', 'noBurn'],
    th: { quick: 3 },
  },
];

export const CUT_CRITERIA = {
  allSteps: 'Every step of the procedure done, and done right',
  noPop: 'No pop, backfire or flashback',
  neutral: 'Neutral flame set with the cutting lever pressed',
  zero: 'At the end: cylinders closed, both gauges at zero, screws released',
  severed: 'Strip cut off along its whole length (drop cut)',
  quality: 'Cut face: share of the length in an acceptable category',
  square: 'Face angle within the ISO 9013 range for the job',
  dross: 'Slag stuck to the bottom edge (share of the length)',
  line: 'On the line (share within the tolerance)',
  topEdge: 'Top edge rounding',
  o2First: 'Torch oxygen valve closed before the fuel valve',
  quick: 'Oxygen off within the time',
  noBurn: 'Torch not burnt through',
};

// ctx: { outfit (GasOutfit), log (station log), S (summarizeCut or null), backfire: { t0, tO2, tFuel } }
// measured / target: a plain string, or { k, v } for an interface key with values (translated by the panel)
export function evaluateCutDrill(ex, ctx) {
  const th = ex.th || {};
  const items = [];
  const add = (id, ok, measured, target, basis = 'source') => items.push({ id, label: CUT_CRITERIA[id], ok: !!ok, measured, target, basis });
  const o = ctx.outfit;
  const S = ctx.S;
  for (const c of ex.criteria) {
    switch (c) {
      case 'allSteps': {
        const pr = o.procedure();
        const bad = pr.filter((s) => !s.done || !s.ok);
        const nums = bad.map((s) => STEPS.findIndex((x) => x.id === s.id) + 1);
        add(c, bad.length === 0, bad.length ? { k: 'steps {n}', v: { n: nums.join(', ') } } : 'all', { k: 'all {n} steps', v: { n: STEPS.length } }, 'source');
        break;
      }
      case 'noPop': {
        const n = (ctx.log.pops || 0) + (ctx.log.backfires || 0) + (ctx.log.flashbacks || 0);
        add(c, n === 0, String(n), '0');
        break;
      }
      case 'neutral':
        add(c, !!(o.done.neutral && o.done.neutral.ok), o.done.neutral ? 'yes' : 'no', 'yes');
        break;
      case 'zero': {
        const z = o.cyl.oxygen.open <= 0.02 && o.cyl.fuel.open <= 0.02 && o.inlet('oxygen') < 1 && o.inlet('fuel') < 1 && o.delivery('oxygen') < 0.5 && o.delivery('fuel') < 0.5 && o.reg.oxygen.turns < 0.05 && o.reg.fuel.turns < 0.05;
        add(c, z, z ? 'yes' : 'no', 'yes');
        break;
      }
      case 'severed':
        add(c, !!(S && S.severed), S && S.severed ? 'yes' : { k: '{n} gap(s)', v: { n: S ? S.gaps.length : 0 } }, 'yes');
        break;
      case 'quality':
        add(c, !!(S && S.okShare >= th.quality), S ? `${Math.round(S.okShare * 100)}%` : '–', `≥ ${Math.round(th.quality * 100)}%`, 'seed');
        break;
      case 'square': {
        const r = S ? S.range : null;
        const lim = S ? ISO9013_U[th.range](S.a) : null;
        add(c, r != null && r <= th.range, S && S.u95 != null ? { k: 'u {u} mm (range {r})', v: { u: S.u95.toFixed(2), r: r ?? '>5' } } : '–', { k: 'range {r} (u ≤ {u} mm)', v: { r: th.range, u: lim != null ? lim.toFixed(2) : '–' } }, 'secondary');
        break;
      }
      case 'dross':
        add(c, !!(S && S.drossAdhShare <= th.drossAdh), S ? `${Math.round(S.drossAdhShare * 100)}%` : '–', `≤ ${Math.round(th.drossAdh * 100)}%`, 'seed');
        break;
      case 'line':
        add(c, !!(S && 1 - S.devShare >= th.lineShare), S ? { k: '{p}% within ±{d} mm', v: { p: Math.round((1 - S.devShare) * 100), d: th.line } } : '–', `≥ ${Math.round(th.lineShare * 100)}%`, 'seed');
        break;
      case 'topEdge':
        add(c, !!(S && S.topMax <= th.top), S ? `${S.topMax.toFixed(1)} mm` : '–', `≤ ${th.top} mm`, 'seed');
        break;
      case 'o2First': {
        const b = ctx.backfire || {};
        add(c, b.tO2 != null && (b.tFuel == null || b.tO2 <= b.tFuel), b.tO2 != null ? (b.tFuel != null && b.tFuel < b.tO2 ? 'fuel first' : 'oxygen first') : 'not closed', 'oxygen first');
        break;
      }
      case 'quick': {
        const b = ctx.backfire || {};
        const dt = b.tO2 != null && b.t0 != null ? b.tO2 - b.t0 : null;
        add(c, dt != null && dt <= th.quick, dt != null ? `${dt.toFixed(1)} s` : '–', `≤ ${th.quick} s`, 'seed');
        break;
      }
      case 'noBurn':
        add(c, !ctx.burnt, ctx.burnt ? 'burnt' : 'no', 'no');
        break;
      default:
        break;
    }
  }
  const met = items.filter((i) => i.ok).length;
  return { items, met, total: items.length, all: met === items.length };
}

export function categoryLabel(k) {
  return CUT_CATEGORIES[k] ? CUT_CATEGORIES[k].label : k;
}

export { CATEGORY_ORDER };
