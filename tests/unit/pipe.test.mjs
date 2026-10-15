// Pipe butt joints (open root) in the 1G, 2G, 5G and 6G positions: geometry around the pipe, gravity at the
// clock positions, the closed (periodic) joint in the weld record and the heat-flow model, the open root
// under the root run, a whole scripted 5G uphill weld (E6010 root, E7018 fill and cap) judged to ISO 5817
// and ISO 9606-1, and the root faults the model must show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makePipeJoint, PIPE_SIZES, PIPE_POSITIONS, pipePoint, pipeLocal, pipeFrame, dirToJoint, dirFromJoint,
  gravityAt, clockAt, xAtClock, wrapX, diffX, pipeTravelWindow, SMAW_PIPE_ANGLES, positionClassAt,
} from '../../src/sim/pipe.js';
import { WeldSession } from '../../src/sim/session.js';
import { WeldRecord } from '../../src/sim/record.js';
import { ThermalModel } from '../../src/sim/thermal.js';
import { scriptedPipeWeld, scriptedPipeRun, pipeRunsFor } from '../../src/sim/scripted.js';
import { smawDefaults } from '../../src/sim/smaw.js';
import { evaluate } from '../../src/sim/rules/packs.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const ROOT = (I = 90) => ({ ...smawDefaults('E6010', 3.2, 'PF'), current: I, polarity: 'DCEP' });
const FILL = { ...smawDefaults('E7018', 3.2, 'PF'), current: 125, polarity: 'DCEP' };

test('pipe sizes and positions: ASME B36.10 values, ISO 6947 designations of the ASME positions', () => {
  assert.deepEqual([PIPE_SIZES['NPS6-80'].D, PIPE_SIZES['NPS6-80'].t], [168.3, 10.97]);
  assert.deepEqual([PIPE_SIZES['NPS2-80'].D, PIPE_SIZES['NPS2-80'].t], [60.3, 5.54]);
  assert.equal(PIPE_POSITIONS['1G'].iso, 'PA');
  assert.equal(PIPE_POSITIONS['2G'].iso, 'PC');
  assert.equal(makePipeJoint({ position: '5G', progression: 'up' }).position, 'PH');
  assert.equal(makePipeJoint({ position: '5G', progression: 'down' }).position, 'PJ');
  assert.equal(makePipeJoint({ position: '6G', progression: 'up' }).position, 'H-L045');
  assert.equal(makePipeJoint({ position: '6G', progression: 'down' }).position, 'J-L045');
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G' });
  assert.equal(j.type, 'butt');
  assert.equal(j.backing, null);
  assert.equal(j.L, Math.round(Math.PI * 168.3));
  assert.ok(Math.abs(j.pipe.Rx - j.pipe.R) < 0.1);
  assert.ok(j.pipe.length >= 125, 'ISO 9606-1 Figure 5: each pipe at least 125 mm');
  assert.deepEqual([j.rootGap, j.rootFace, j.grooveAngle], [3.2, 2.4, 60]);
  assert.deepEqual(j.passPlan.map((p) => p.kind), ['root', 'fill', 'fill', 'cap']);
  assert.deepEqual(makePipeJoint({ size: 'NPS2-80' }).passPlan.map((p) => p.kind), ['root', 'cap']);
});

test('pipe geometry: joint-local (x, u, v) <-> pipe-local mm, frame, directions, clock positions', () => {
  for (const pos of ['1G', '2G', '5G', '6G']) {
    const j = makePipeJoint({ position: pos });
    for (const [x, u, v] of [[0, 0, 0], [10.3, -4, 2.5], [j.L / 2, 7, -j.t], [j.L - 0.2, 1, 30]]) {
      const P = pipePoint(j, x, u, v);
      const b = pipeLocal(j, P[0], P[1], P[2]);
      assert.ok(Math.abs(diffX(j, b[0], x)) < 1e-6 && near(b[1], u, 1e-9) && near(b[2], v, 1e-9), `${pos} ${x},${u},${v} -> ${b}`);
    }
    const f = pipeFrame(j, 123.4);
    const cross = [f.t[1] * f.u[2] - f.t[2] * f.u[1], f.t[2] * f.u[0] - f.t[0] * f.u[2], f.t[0] * f.u[1] - f.t[1] * f.u[0]];
    assert.ok(near(cross[0], -f.v[0], 1e-12) && near(cross[1], -f.v[1], 1e-12) && near(cross[2], -f.v[2], 1e-12), 't x u = -v as for the plate joints');
    const d = [0.3, -0.5, 0.81];
    const back = dirFromJoint(j, 200, dirToJoint(j, 200, d));
    assert.ok(back.every((c, k) => near(c, d[k], 1e-12)));
    const b = j.pipe.basis;
    const ex = b.ex, ey = b.ey, ez = b.ez;
    const exy = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
    assert.ok(exy.every((c, k) => near(c, ez[k], 1e-12)), `${pos}: basis right-handed`);
  }
  const j = makePipeJoint({ position: '5G' });
  for (const h of [6, 3, 12, 9, 1.5]) assert.ok(Math.abs(clockAt(j, xAtClock(j, h)) - h) < 1e-9);
  assert.ok(near(xAtClock(j, 6), 0) && Math.abs(xAtClock(j, 12) - j.L / 2) < 1e-9);
  assert.equal(wrapX(j, -1), j.L - 1);
  assert.equal(diffX(j, 2, j.L - 3), 5, 'distances are taken the short way round');
});

test('gravity around the pipe: 5G overhead at 6 o\'clock, vertical at 3 and 9, flat at 12; 6G; 2G; 1G rolled', () => {
  const j = makePipeJoint({ position: '5G' });
  const at = (h, s = 1) => gravityAt(j, xAtClock(j, h), s);
  assert.ok(near(at(6).v, 1, 1e-9) && near(at(6).t, 0, 1e-9), '6 o\'clock: overhead');
  assert.ok(near(at(3).t, -1, 1e-9) && near(at(3).v, 0, 1e-9), '3 o\'clock: +x is uphill');
  assert.ok(near(at(9).t, 1, 1e-9) && near(at(9, -1).t, -1, 1e-9), '9 o\'clock: -x is uphill');
  assert.ok(near(at(12).v, -1, 1e-9), '12 o\'clock: flat');
  assert.equal(positionClassAt(j, xAtClock(j, 6)), 'overhead');
  assert.equal(positionClassAt(j, xAtClock(j, 3)), 'vertical');
  assert.equal(positionClassAt(j, xAtClock(j, 12)), 'flat');
  // electrode angles follow the position (ESAB): push uphill on the vertical, drag at the top and overhead
  assert.deepEqual(pipeTravelWindow(j, xAtClock(j, 3), 1), SMAW_PIPE_ANGLES.up);
  assert.deepEqual(pipeTravelWindow(j, xAtClock(j, 9), -1), SMAW_PIPE_ANGLES.up);
  assert.deepEqual(pipeTravelWindow(j, xAtClock(j, 12), 1), SMAW_PIPE_ANGLES.flat);
  assert.deepEqual(pipeTravelWindow(j, xAtClock(j, 6), 1), SMAW_PIPE_ANGLES.overhead);
  const j6 = makePipeJoint({ position: '6G' });
  const g6 = gravityAt(j6, xAtClock(j6, 6));
  assert.ok(near(g6.v, Math.SQRT1_2, 1e-9) && near(g6.u, -Math.SQRT1_2, 1e-9), '6G: the joint face tilts 45 deg at the bottom');
  const j2 = makePipeJoint({ position: '2G' });
  for (const x of [0, 100, 300]) {
    const g = gravityAt(j2, x);
    assert.ok(near(g.u, -1, 1e-9) && near(g.v, 0, 1e-9) && near(g.t, 0, 1e-9), '2G: gravity across the joint (PC)');
  }
  const j1 = makePipeJoint({ position: '1G' });
  const top = xAtClock(j1, 12);
  assert.ok(near(gravityAt(j1, top).v, -1, 1e-9));
  j1.pipe.roll = Math.PI; // rolled half a turn: the point that was on top is now at the bottom
  assert.ok(near(gravityAt(j1, top).v, 1, 1e-9));
  assert.ok(Math.abs(clockAt(j1, top) - 6) < 1e-9);
});

test('closed joint: deposits and heat spread across x = 0 / L on the pipe', () => {
  const j = makePipeJoint({ position: '5G' });
  const rec = new WeldRecord(j, { seed: 1 });
  rec.deposit(0.5, j.L - 0.5, ROOT(), { mode: 'smaw', vdot: 30, k: 0.8, U: 26, I: 90, dU: 0, wetting: 0.4, stability: 1, shielding: 1, spatterRate: 0, pen: 1.4 },
    { workAngle: 90, travelAngle: 5, aim: 0, ctwd: 4, speed: 1, weaveAmp: 0, toeDwell: 0, coldStart: 1, T0: 20, poolW: 6, u: 0, v: -8.5, g: gravityAt(j, j.L - 0.5) });
  assert.ok(rec.pass.area[j.L - 1] > 0 && rec.pass.area[0] > 0 && rec.pass.area[2] > 0, 'pool spreads over the seam');
  const th = new ThermalModel(j, { dtMax: 1 / 24 });
  assert.equal(th.lay.nx % 2, 0);
  th.addArc(1, 0.5, 0, 0, 2000);
  for (let k = 0; k < 48; k++) th.advance(1 / 24);
  const a = th.lineT(5), b = th.lineT(j.L - 4);
  assert.ok(a > 60 && Math.abs(a - b) / (a - 20) < 0.08, `symmetric about the arc across the seam: ${a.toFixed(1)} vs ${b.toFixed(1)}`);
  assert.ok(th.heatContent() > 0);
  // energy: input = gain + losses
  const th2 = new ThermalModel(j, { dtMax: 1 / 24 });
  const E0 = th2.heatContent();
  th2.addArc(1, j.L - 1, 0, 0, 3000);
  for (let k = 0; k < 120; k++) th2.advance(1 / 24);
  th2.cool(30);
  const gain = th2.heatContent() - E0;
  assert.ok(Math.abs(gain + th2.energyLost - th2.energyIn) / th2.energyIn < 0.01, 'energy balance across the seam (fine and coarse grids)');
});

test('5G uphill root (E6010 3.2 mm, 90 A): both halves bottom to top, keyhole held, inside bead all round', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'up' });
  const ses = new WeldSession({ joint: j, settings: ROOT(), seed: 3, thermalDt: 1 / 12 });
  scriptedPipeWeld({ session: ses, passes: [{ settings: ROOT() }], dt: 1 / 60 });
  const p = ses.record.passes[0];
  assert.ok(p.starts.some((s) => s.sigma === 1) && p.starts.some((s) => s.sigma === -1), 'one half each way');
  const sum = ses.record.summary();
  const rr = sum.rootRows;
  assert.equal(rr.filter((r) => !r).length, 0, 'root all round');
  assert.equal(rr.filter((r) => r.lop > 0 || r.burn).length, 0, 'penetrated, no burn-through');
  const h = (c) => rr[Math.floor(xAtClock(j, c))].rootH;
  assert.ok(h(6) >= 0 && h(6) < h(3) && h(3) < h(12), `inside bead grows from the bottom to the top: ${h(6).toFixed(2)} ${h(3).toFixed(2)} ${h(12).toFixed(2)}`);
  assert.ok(Math.abs(h(3) - 1.6) < 0.4, 'vertical: about the C2.420 1/16 in inside bead');
});

test('scripted 5G uphill weld, NPS 6 Sch 80 (E6010 root, E7018 fills and cap): ISO 5817 C and ISO 9606-1 accept', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'up' });
  const ses = new WeldSession({ joint: j, settings: ROOT(), seed: 3, thermalDt: 1 / 12 });
  const plans = j.passPlan.map((pl, k) => ({ settings: k ? FILL : ROOT(), weaveAmp: pl.kind === 'root' ? 0 : pl.kind === 'cap' ? 3 : 1.5 + 0.5 * k, toeDwell: k ? 0.4 : 0 }));
  scriptedPipeWeld({ session: ses, passes: plans, dt: 1 / 60 });
  const sum = ses.record.summary();
  assert.equal(sum.passes, 4);
  assert.equal(sum.rows.filter((r) => !r).length, 0);
  const c = evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' });
  assert.equal(c.verdict, 'accept', JSON.stringify(c.findings.filter((f) => f.verdict === 'reject').map((f) => `${f.ref} ${f.name} ${f.s0}`)));
  const w = evaluate(sum, 'iso9606-1', 'test', { mode: 'full' });
  assert.equal(w.verdict, 'accept');
  // ISO 5817 B is stricter on the root side (504 h <= 1 mm + 0.2b): the inside bead at the top exceeds it
  const b = evaluate(sum, 'iso5817-2023', 'B', { mode: 'full' });
  assert.ok(b.findings.every((f) => f.verdict === 'accept' || f.ref === '504'));
});

test('root faults: too little current leaves the root unpenetrated (4021); arc off the gap leaves a land unfused', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'up' });
  const cold = new WeldSession({ joint: j, settings: ROOT(62), seed: 3, thermalDt: 1 / 12 });
  const [run] = pipeRunsFor(j, 0);
  scriptedPipeRun(cold, { ...run, keyhole: false }, { dt: 1 / 60 });
  const sum = cold.record.summary();
  assert.ok(sum.rootRows.filter((r) => r && r.lop > 0).length > 50, 'incomplete root penetration along the run');
  const r = evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' });
  assert.ok(r.findings.some((f) => f.ref === '4021' && f.verdict === 'reject'));
  const off = new WeldSession({ joint: j, settings: ROOT(), seed: 3, thermalDt: 1 / 12 });
  scriptedPipeRun(off, { ...run, keyhole: true, aim: 2.6 }, { dt: 1 / 60 });
  const so = off.record.summary();
  assert.ok(so.rootRows.filter((q) => q && q.lofRoot1 > 0).length > 30, 'the far land (-u) not fused with the arc held toward +u');
  assert.ok(so.internal.some((x) => x.type === 'lofRoot'));
});

test('root faults: too much current overheats the root: burn-through or excessive penetration near the top; suck-back overhead', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'up' });
  const hot = new WeldSession({ joint: j, settings: ROOT(125), seed: 3, thermalDt: 1 / 12 });
  const [run] = pipeRunsFor(j, 0);
  scriptedPipeRun(hot, { ...run, keyhole: false }, { dt: 1 / 60 });
  const sum = hot.record.summary();
  const r = evaluate(sum, 'iso5817-2023', 'C', { mode: 'full' });
  assert.ok(r.findings.some((f) => (f.ref === '510' || f.ref === '504') && f.verdict === 'reject'), JSON.stringify(r.findings.map((f) => f.ref)));
  // overhead: the hotter root sags back out (lower inside bead than at nominal current)
  const nom = new WeldSession({ joint: j, settings: ROOT(), seed: 3, thermalDt: 1 / 12 });
  scriptedPipeRun(nom, { ...run, keyhole: false }, { dt: 1 / 60 });
  const i5 = Math.floor(xAtClock(j, 5.5));
  assert.ok(hot.record.sample(0, i5).rootH < nom.record.sample(0, i5).rootH, 'more heat overhead: less inside bead (suck-back)');
});

test('5G downhill (PJ): runs from the top down each side; the plate window applies going down', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '5G', progression: 'down' });
  const runs = pipeRunsFor(j, 0);
  assert.equal(runs.length, 2);
  for (const r of runs) {
    const g0 = gravityAt(j, wrapX(j, r.x0 + r.sigma * 20), r.sigma);
    assert.ok(g0.t > 0, 'each run travels downhill');
  }
  assert.deepEqual(pipeTravelWindow(j, xAtClock(j, 3), -1), SMAW_PIPE_ANGLES.down);
});

// Training WPS of the pipe drills (Lincoln C2.420 in-plant table): 1/8 in E6010 root; E7018 fill and cap, 1/8 in
// on NPS 6 and on the horizontal joint, 3/32 in on NPS 2 pipe with its axis horizontal.
const pipeWeld = (size, position, progression = 'up', seed = 3) => {
  const j = makePipeJoint({ size, position, progression });
  const small = j.pipe.D < 100 && position !== '2G';
  const fill = { ...smawDefaults('E7018', small ? 2.5 : 3.2, 'PF'), current: small ? 95 : 125, polarity: 'DCEP' };
  const ses = new WeldSession({ joint: j, settings: ROOT(), seed, thermalDt: 1 / 12 });
  const plans = j.passPlan.map((pl, k) => ({ settings: k ? fill : ROOT(), weaveAmp: pl.kind === 'root' ? 0 : pl.kind === 'cap' ? 3 : 1.5 + 0.5 * k, toeDwell: k ? 0.4 : 0 }));
  scriptedPipeWeld({ session: ses, passes: plans, dt: 1 / 60 });
  return ses.record.summary();
};
const rejects = (sum, pack, level) => evaluate(sum, pack, level, { mode: 'full' }).findings.filter((f) => f.verdict === 'reject').map((f) => `${f.ref} ${f.name} @${f.s0}`);

test('scripted pipe welds in every test position on NPS 2 Sch 80 (root and cap): ISO 5817 C and ISO 9606-1 accept', () => {
  for (const [pos, prog] of [['1G'], ['2G'], ['5G', 'up'], ['6G', 'up']]) {
    const sum = pipeWeld('NPS2-80', pos, prog);
    assert.deepEqual(rejects(sum, 'iso5817-2023', 'C'), [], `${pos} ISO 5817 C`);
    assert.deepEqual(rejects(sum, 'iso9606-1', 'test'), [], `${pos} ISO 9606-1`);
  }
});

test('scripted 6G uphill and 2G welds on NPS 6 Sch 80: ISO 5817 C and ISO 9606-1 accept', () => {
  for (const pos of ['6G', '2G']) {
    const sum = pipeWeld('NPS6-80', pos, 'up');
    assert.deepEqual(rejects(sum, 'iso5817-2023', 'C'), [], `${pos} ISO 5817 C`);
    assert.deepEqual(rejects(sum, 'iso9606-1', 'test'), [], `${pos} ISO 9606-1`);
  }
});

test('2G: two halves the same way round, the second starting on the first one\'s feathered end and tying in on its start', () => {
  const j = makePipeJoint({ size: 'NPS6-80', position: '2G' });
  const [a, b] = pipeRunsFor(j, 3);
  assert.ok(a.sigma === 1 && b.sigma === 1 && a.feather && b.end === 'tieIn');
  assert.ok(Math.abs(diffX(j, b.x0, a.x1) + 5) < 1e-9, 'B starts 5 mm back on the end of A');
  assert.ok(Math.abs(diffX(j, b.x1, a.x0) - 9) < 1e-9, 'B ends 9 mm into the start of A');
});

test('a run started just past the bottom that goes back through it gets its direction from the motion', () => {
  // NPS 2: 9 mm from 6 o'clock the joint already climbs, but the second half of an uphill pass started there
  // travels the other way round, through the bottom
  const j = makePipeJoint({ size: 'NPS2-80', position: '5G', progression: 'up' });
  const ses = new WeldSession({ joint: j, settings: ROOT(), seed: 3, thermalDt: 1 / 12 });
  scriptedPipeRun(ses, { x0: 18, x1: wrapX(j, xAtClock(j, 12) - 4), sigma: -1, keyhole: true, end: 'crater' }, { dt: 1 / 60 });
  const st = ses.record.passes[0].starts;
  assert.ok(st.length >= 1 && st.every((s) => s.sigma === -1), JSON.stringify(st.map((s) => s.sigma)));
});
