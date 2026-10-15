// Welder qualification (mock test, scope family E): a test per ISO 9606-1, ASME IX or API 1104 welded on
// the test piece the code describes, then the visual examination and the tests the code asks for
// (radiography, bend, fracture, nick-break or macro tests) simulated from the weld, the verdict with the
// deciding clause, the range of qualification, the retest and validity rules, and a training record.
// AWS D1.1 mock tests stay visual only (no licensed copy loaded).

import { COLORS } from '../ui/ui.js';
import { t } from '../ui/i18n.js';
import { WeldingMode, PAD, polarityLabel } from './welding.js';
import { STANDARDS, METHOD_LABELS, testsFor, FILLERS } from '../qual/catalog.js';
import { spLabel, whereText } from '../ui/lab.js';
import { runQualification, plannedFacts, briefLines, methodsFor } from '../qual/run.js';
import { rtAllowed } from '../qual/asme.js';
import { loadRecords, saveRecords, makeRecord, recordHTML, recordStatus, offerFile, passParams } from '../qual/records.js';
import { jointFor, wpsFor } from '../scenarios.js';
import { PROCESSES, arcState, nominalCTWD } from '../sim/process.js';
import { clamp } from '../sim/util.js';

const STD_ORDER = ['iso', 'asme', 'api', 'aws'];
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
const today = () => new Date().toISOString().slice(0, 10);
// a brief line: a plain string or a { k, v } template (qual/iso.js brief)
const tl = (ln) => (typeof ln === 'string' ? t(ln) : t(ln.k, ln.v));

// What the chosen method examines (shown in the brief).
const METHOD_TEXT = {
  iso: {
    rt: 'Visual testing (ISO 17637), then radiography of the examination length (ISO 17636); both judged to clause 7 (ISO 5817 level B, level C for 501, 502, 503, 504, 5214). With 135, one root and one face fracture test as well (Table 13 b).',
    bend: 'Visual testing, then two root and two face bends covering the examination length (6.5.2.3), former 4t, 180°; clause 7: no discontinuity of 3 mm or more, discontinuities over 1 mm and under 3 mm not over 10 mm in total per specimen.',
    fracture: 'Visual testing, then fracture tests (ISO 9017): the examination length cut into four specimens (6.5.2.2) or, for a fillet weld, fractured whole (6.5.3); judged to clause 7.',
    macro: 'Visual testing, then two macro sections, one at the stop and restart (Table 13 e); judged to clause 7.',
  },
  asme: {
    bend: 'Visual examination (QW-302.4, QW-194), then guided-bend tests (QW-452.1(a), QW-462, QW-466.1): no open discontinuity over 1/8 in (3 mm) on the convex surface (QW-163).',
    bendFR: 'Visual examination, then face and root bends in place of the side bends (QW-452.1(a) Note (3)); QW-163.',
    rt: 'Visual examination, then radiography of the coupon (QW-302.2: at least 6 in, the whole circumference of a pipe) to QW-191.1.2.2.',
    fillet: 'Visual examination, then the centre section fracture tested with the root in tension (QW-182) and an end section macro-examined (QW-184).',
  },
  api: {
    destructive: 'Visual examination (6.4), then the nick-break and bend specimens of Table 7 at the Figure 12 locations: nick breaks to 5.6.3.3, bends to 5.6.4.3.',
    rt: 'Visual examination (6.4), then radiography of the whole test weld to 9.3 (6.6).',
    rtDestructive: 'Visual examination, radiography to 9.3 and the Table 7 destructive tests; failing either fails the test (6.7).',
  },
  aws: { visual: 'Visual examination only, criteria from secondary sources (no licensed AWS D1.1 copy).' },
};

export class QualificationMode extends WeldingMode {
  constructor(app) {
    super(app);
    this.id = 'qual';
    this.phase = 'list';
    this.std = 'iso';
    this.cuesOn = false;
    this.records = loadRecords();
    this.tab = 'summary';
    this.scroll = 0;
    this.attempt = 1;
    this.retestSeq = null;
  }

  // The demonstration pass is a desktop preview only; in the headset the welder makes the test piece.
  get allowDemo() {
    return !this.app.renderer.xr.isPresenting;
  }

  set allowDemo(v) {
    void v;
  }

  title() {
    if (this.phase === 'list') return t('Welder qualification: choose a test');
    if (this.phase === 'records') return t('Training records');
    return `${STANDARDS[this.test.std].short} · ${t(this.test.title)}`;
  }

  hint() {
    if (this.phase === 'weld') {
      const st = this.app.station;
      if (st.session && st.session.settings.process === '111') return t('Test: no cues. Touch and lift to strike; A/X new electrode; chip and brush every run.');
      return t('Test: no cues; machine settings stay inside the WPS ranges.');
    }
    return '';
  }

  settingsLocked() {
    return this.phase === 'weld' || this.phase === 'demo';
  }

  enter() {
    this.app.setTool('gun');
  }

  exit() {
    this.app.showLab(false);
  }

  // ---- flow ------------------------------------------------------------------------------------------
  brief(test) {
    this.test = test;
    this.method = test.methods[0];
    this.phase = 'brief';
    this.attempt = 1;
    this.retestSeq = null;
    this.Q = null;
    this.app.showLab(false);
    this.app.main.invalidate();
  }

  start() {
    const tst = this.test;
    const joint = jointFor(tst.joint);
    this.usedDemo = false;
    // a fresh test piece each time; tests can fix the seed (window.__weldSeed)
    const fixed = typeof window !== 'undefined' && Number.isFinite(window.__weldSeed) ? window.__weldSeed : null;
    this.loadCoupon({ joint, process: tst.process, seed: fixed ?? Math.floor(Math.random() * 1e6), ...(tst.smaw || tst.gtaw || {}) });
    this.app.helmet.setDown(false);
    this.app.showLab(false);
  }

  startDemo() {
    this.usedDemo = true;
    super.startDemo();
  }

  // The demonstration pass makes the stop and restart the test piece needs: ISO 9606-1 6.3 in the root run
  // and in the capping run (the one run of a single-run test piece); ASME Figure QW-462.4(b) near the centre
  // of the fillet coupon. Plates: inside the examination length; pipes: half-way along the first run, made
  // like an electrode change. Technique: SMAW, crater filled by backing up, restart struck ahead and backed
  // into the crater (Lincoln C2.410 for low-hydrogen electrodes, The Fabricator); GMAW, crater filled with a
  // short pause and the restart made in the crater while it is still hot (weldingtipsandtricks.com, "bead
  // restart"); GTAW, crater filled with the current ramped down, post-flow, restart near the centre of the
  // crater (weldingtipsandtricks.com, "TIG restarts"; sim/scripted.js).
  demoPlanFor() {
    const plan = super.demoPlanFor();
    const st = this.app.station;
    const j = st.joint;
    const k = st.record.passes.length - 1;
    const capK = j.passPlan.length - 1;
    const tst = this.test;
    let s = null;
    const a = j.tab ?? 0, L = j.evalL ?? j.L - 2 * a;
    if (tst.std === 'iso' && (k === 0 || k === capK)) s = a + L * (k === 0 ? 0.4 : 0.6);
    if (tst.std === 'asme' && j.type === 'fillet' && k === 0) s = a + L / 2;
    if (s == null) return plan;
    if (j.pipe) return { ...plan, stopRuns: [0], stopFrac: 0.5 };
    const P = st.session.settings.process;
    if (P === '111') return { ...plan, stopsAt: [s], craterAtStops: 'backup', restartTech: 'aheadBackup' };
    if (P === '141') return { ...plan, stopsAt: [s] };
    return { ...plan, stopsAt: [s], craterAtStops: 'pause', restartTech: 'same' };
  }

  onFinished() {
    const app = this.app;
    const st = app.station;
    const ctx = { rec: st.record, sum: this.R.sum, settings: st.session.settings, wpsInside: this.R.wpsInside, date: today(), demo: this.usedDemo };
    this.Q = runQualification(this.test, this.method, ctx);
    this.Q.passes = passParams(st.record, this.cfgWps, this.R.tech);
    this.saved = false;
    if (this.retestSeq) {
      this.retestSeq.results.push(this.Q.verdict);
      this.retestSeq.n++;
    }
    this.phase = 'exam';
    this.tab = 'summary';
    this.scroll = 0;
    app.labView = { result: this.Q, exam: 0, page: 0, overlay: false };
    app.showLab(this.Q.exams.some((e) => e.id !== 'vt'));
    app.main.invalidate();
  }

  // Retest by the standard's rule.
  retest() {
    const s = this.test.std;
    if (s === 'asme') {
      // QW-321.1 / QW-321.2: immediate retest, two consecutive coupons for the position failed, all to pass
      if (!this.retestSeq) this.retestSeq = { total: 2, n: 0, results: [] };
    } else this.attempt++;
    this.start();
  }

  retestState() {
    const s = this.test.std;
    const failed = this.Q && this.Q.verdict === 'fail';
    if (s === 'iso') {
      if (!failed) return null;
      return this.attempt === 1
        ? { can: true, label: t('Retest (clause 8)'), text: t('Clause 8: the welder may repeat the qualification test once without further training.') }
        : { can: false, text: t('The retest failed: further training before a new test (clause 8 allows one retest without training).') };
    }
    if (s === 'asme') {
      const seq = this.retestSeq;
      if (seq && seq.n < seq.total) return { can: true, label: `${t('Next retest coupon')} (${seq.n + 1}/${seq.total})`, text: t('QW-321: immediate retest with two consecutive test coupons, all of which shall pass.') };
      if (seq && seq.n >= seq.total) {
        const all = seq.results.every((v) => v === 'pass');
        return { can: false, text: all ? t('Both retest coupons passed (QW-321).') : t('A retest coupon failed: further training or practice, then a new test (QW-321.4).') };
      }
      if (!failed) return null;
      return { can: true, label: t('Immediate retest (QW-321)'), text: t('QW-321.1 / QW-321.2: immediate retest with two consecutive test coupons for the position failed, all of which shall pass.') };
    }
    if (s === 'api') {
      if (!failed) return null;
      return this.attempt === 1
        ? { can: true, label: t('Second opportunity (6.7)'), text: t('6.7: when the failure was due to conditions beyond the welder\'s control, a second opportunity should be given.') }
        : { can: false, text: t('6.7: no further retests until proof of subsequent welder training acceptable to the company.') };
    }
    return failed ? { can: true, label: t('Weld again'), text: '' } : null;
  }

  saveRecord() {
    if (!this.Q || this.saved) return;
    const app = this.app;
    if (!app.settings.traineeId) app.set('traineeId', `T-${Math.floor(1000 + Math.random() * 9000)}`);
    const rec = makeRecord(this.Q, { name: app.settings.trainee || 'Trainee', welderId: app.settings.traineeId, wps: this.cfgWps, attempt: this.retestSeq ? `retest ${this.retestSeq.n}/${this.retestSeq.total}` : this.attempt, passes: this.Q.passes });
    this.records.push(rec);
    const ok = saveRecords(this.records);
    this.saved = true;
    this.lastRecord = rec;
    app.say(ok ? t('Training record saved on this headset.') : t('Storage unavailable: the record is kept for this session only.'));
    app.main.invalidate();
  }

  async downloadRecord(rec) {
    const r = rec || this.lastRecord || (this.Q ? makeRecord(this.Q, { name: this.app.settings.trainee, welderId: this.app.settings.traineeId, wps: this.cfgWps, attempt: this.attempt, passes: this.Q.passes }) : null);
    if (!r) return;
    const res = await offerFile(`${r.testId}-${r.date}-training-record.html`, recordHTML(r));
    this.app.say(res === 'saved' || res === 'downloaded' ? t('Record file offered for download.') : res === 'declined' ? t('Download declined.') : t('Download is not available here.'));
  }

  // ---- drawing --------------------------------------------------------------------------------------
  draw(ui) {
    if (this.phase === 'list') return this.drawList(ui);
    if (this.phase === 'records') return this.drawRecords(ui);
    if (this.phase === 'brief') return this.drawBrief(ui);
    if (this.phase === 'weld' || this.phase === 'demo') return this.drawTestWeld(ui);
    if (this.phase === 'exam') return this.drawExam(ui);
    if (this.phase === 'results' || this.phase === 'replay') {
      // the weld's own results (technique, rule packs) from the exam screen
      this.drawResultsScreen(ui, [{ id: 'r-back', label: t('Back to the examination'), go: () => { this.phase = 'exam'; this.app.main.invalidate(); }, style: 'primary' }]);
    }
  }

  drawList(ui) {
    const app = this.app;
    const W = ui.W;
    ui.segmented('q-std', PAD, 108, W - 2 * PAD, 62, STD_ORDER.map((s) => ({ value: s, label: STANDARDS[s].short })), this.std, (v) => {
      this.std = v;
      app.main.invalidate();
    }, { size: 24 });
    ui.text(t(STANDARDS[this.std].code), PAD, 206, { size: 20, color: COLORS.dim, maxW: W - 2 * PAD });
    const list = testsFor(this.std);
    const cw = (W - 2 * PAD - 16) / 2;
    const rh = 118;
    list.forEach((tst, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const x = PAD + col * (cw + 16), y = 226 + row * rh;
      const p = PROCESSES[tst.process];
      ui.button(`q-${tst.id}`, x, y, cw, rh - 14, t(tst.title), () => this.brief(tst), { size: 21, sub: `${p.aws} ${tst.process} · ${tst.methods.map((m) => t(METHOD_LABELS[m])).join(' / ')}` });
    });
    const y = 226 + Math.ceil(list.length / 2) * rh + 6;
    ui.button('q-records', PAD, Math.min(y, ui.H - 210), 420, 60, `${t('Training records')} (${this.records.length})`, () => {
      this.phase = 'records';
      this.scroll = 0;
      app.main.invalidate();
    }, { size: 22 });
    ui.wrap(t('Each test is welded on the test piece of the code, then examined and tested as the code requires, from the weld you made. Simulator training record — not a welder qualification under any code.'), PAD, Math.min(y, ui.H - 210) + 92, W - 2 * PAD, { size: 20, color: COLORS.warn, maxLines: 3 });
  }

  wpsLines(wps) {
    const s = wps.settings;
    if (wps.pipe) return [`${t('Training WPS')} ${wps.id}`, ...wps.passes.map((p, k) => `${k + 1}. ${t(p.kind)}: ${p.electrode} Ø ${p.dia} mm · ${p.current[0]}–${p.current[1]} A · DCEP (+)`)];
    if (s.process === '111') return [`${t('Training WPS')} ${wps.id}`, `${s.electrode} Ø ${s.dia} mm · ${wps.ranges.current[0]}–${wps.ranges.current[1]} A · ${polarityLabel(s.polarity)}`];
    if (s.process === '141') return [`${t('Training WPS')} ${wps.id}`, `${s.tungsten} Ø ${s.tdia} mm · ${s.filler} Ø ${s.rodDia} mm · ${wps.ranges.current[0]}–${wps.ranges.current[1]} A · DCEN (−) · Ar ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]} L/min`];
    return [`${t('Training WPS')} ${wps.id}`, `Ø ${s.wire} mm · ${wps.ranges.wfs[0].toFixed(1)}–${wps.ranges.wfs[1].toFixed(1)} m/min · ${wps.ranges.voltage[0].toFixed(1)}–${wps.ranges.voltage[1].toFixed(1)} V · ${s.polarity}${wps.ranges.gasFlow ? ` · Ar + 18% CO2 ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]} L/min` : ''}`];
  }

  // Methods for the brief: ASME radiography only where QW-304 allows it (GMAW: the WPS transfer mode).
  briefMethods(wps, facts) {
    const tst = this.test;
    return tst.methods.map((m) => {
      let why = null;
      if (tst.std === 'asme' && m === 'rt') {
        let transfer = null;
        if (tst.process === '135') transfer = arcState(wps.settings, nominalCTWD('135', wps.settings), 5, { gasAvailable: true }).mode;
        const a = rtAllowed({ process: tst.process, transfer });
        if (!a.ok) why = a.why;
      }
      if (tst.std === 'asme' && m === 'bendFR' && facts.t < 10) why = 'face and root bends are already the required test';
      return { m, why };
    });
  }

  drawBrief(ui) {
    const app = this.app;
    const W = ui.W;
    const tst = this.test;
    const joint = jointFor(tst.joint);
    const wps = wpsFor(tst.process, joint, tst.smaw || tst.gtaw || {});
    const facts = plannedFacts(tst, joint);
    let y = 104;
    ui.text(t(STANDARDS[tst.std].code), PAD, y + 26, { size: 21, color: COLORS.accent, weight: 600, maxW: W - 2 * PAD });
    y += 40;
    for (const ln of briefLines(tst, { ...facts, passesPlanned: joint.passPlan.length })) y = ui.wrap(tl(ln), PAD, y + 22, W - 2 * PAD, { size: 19, color: COLORS.text, maxLines: 3 }) - 8;
    if (facts.material) y = ui.wrap(`${t('Material')}: ${facts.material.label} (P-No. ${facts.material.pNo}, ISO/TR 15608 group ${facts.material.iso15608})`, PAD, y + 22, W - 2 * PAD, { size: 19, color: COLORS.dim, maxLines: 1 }) - 8;
    const fl = tst.fillers.map((f) => FILLERS[f]).filter(Boolean);
    if (fl.length) y = ui.wrap(`${t('Filler')}: ${fl.map((f) => `${f.aws} (F-No. ${f.fNo}, ${f.fm}, ${f.isoType}${f.api ? `, ${f.api}` : ''})`).join(' · ')}`, PAD, y + 22, W - 2 * PAD, { size: 19, color: COLORS.dim, maxLines: 2 }) - 8;
    // WPS box
    const lines = this.wpsLines(wps);
    const bh = 26 + lines.length * 30;
    ui.rect(PAD, y + 14, W - 2 * PAD, bh, COLORS.bg2, 12, COLORS.line);
    lines.forEach((ln, k) => ui.text(ln, PAD + 16, y + 44 + k * 30, { size: k ? 19 : 20, weight: k ? 400 : 700, color: k ? COLORS.text : COLORS.accent, maxW: W - 2 * PAD - 32 }));
    y += bh + 28;
    // method
    const ms = this.briefMethods(wps, facts);
    if (!ms.some((x) => x.m === this.method && !x.why)) this.method = (ms.find((x) => !x.why) || ms[0]).m;
    ui.text(t('Examination'), PAD, y + 36, { size: 21, color: COLORS.dim });
    ui.segmented('q-method', PAD + 190, y, W - 2 * PAD - 190, 56, ms.map((x) => ({ value: x.m, label: t(METHOD_LABELS[x.m]), disabled: !!x.why })), this.method, (v) => {
      this.method = v;
      app.main.invalidate();
    }, { size: 19 });
    y += 64;
    const why = ms.filter((x) => x.why).map((x) => `${t(METHOD_LABELS[x.m])}: ${t(x.why)}`);
    y = ui.wrap(t((METHOD_TEXT[tst.std] || {})[this.method] || ''), PAD, y + 20, W - 2 * PAD, { size: 18, color: COLORS.info, maxLines: 4 });
    for (const w of why) y = ui.wrap(w, PAD, y + 2, W - 2 * PAD, { size: 17, color: COLORS.faint, maxLines: 2 });
    y = ui.wrap(t('Test rules: no cues; the machine stays inside the WPS ranges; in the headset no demonstration pass. The conditions are checked when you submit the test piece.'), PAD, y + 6, W - 2 * PAD, { size: 18, color: COLORS.warn, maxLines: 2 });
    const by = Math.min(ui.H - 100, y + 12);
    ui.button('q-start', PAD, by, 420, 76, t('Start the test'), () => this.start(), { style: 'primary', size: 28 });
    ui.button('q-back', PAD + 440, by, 260, 76, t('Back'), () => { this.phase = 'list'; app.main.invalidate(); }, { size: 24 });
  }

  // Live test conditions while welding (ISO 9606-1 6.3; ASME QW-462.4(b)).
  liveConditions() {
    const st = this.app.station;
    const rec = st.record;
    const j = st.joint;
    const tst = this.test;
    const out = [];
    const restartIn = (k, lo = -Infinity, hi = Infinity) => (rec.passes[k] ? rec.passes[k].starts.some((s) => s.restart && s.s >= lo && s.s <= hi && (j.pipe || (s.s >= j.tab && s.s <= j.L - j.tab))) : false);
    const welded = rec.passes.filter((p) => p.area.some((v) => v > 0.05));
    if (tst.std === 'iso') {
      const single = j.passPlan.length === 1;
      out.push({ text: single ? t('Stop and restart in the run (6.3)') : t('Stop and restart in the root run (6.3)'), ok: restartIn(0) });
      if (!single) {
        const capK = j.passPlan.length - 1;
        out.push({ text: t('Stop and restart in the capping run (6.3)'), ok: rec.passes.length - 1 >= capK && restartIn(capK) });
      }
    }
    if (tst.std === 'asme' && j.type === 'fillet') {
      const c = j.tab + j.evalL / 2;
      out.push({ text: t('Stop and restart near the centre (Figure QW-462.4(b))'), ok: restartIn(0, c - 50, c + 50) });
    }
    out.push({ text: `${t('Passes')}: ${welded.length} / ${j.passPlan.length}`, ok: welded.length >= j.passPlan.length, info: true });
    return out;
  }

  drawTestWeld(ui) {
    const W = ui.W;
    let y = this.drawWeldControls(ui, 140);
    const cond = this.liveConditions();
    ui.rect(PAD, y, W - 2 * PAD, 30 + cond.length * 34, COLORS.bg2, 12, COLORS.line);
    ui.text(t('Test conditions'), PAD + 16, y + 30, { size: 20, weight: 700 });
    cond.forEach((c, k) => ui.text(`${c.ok ? '✓' : c.info ? '·' : '○'} ${c.text}`, PAD + 230, y + 30 + k * 34, { size: 20, color: c.ok ? COLORS.ok : c.info ? COLORS.dim : COLORS.warn, maxW: W - 2 * PAD - 250 }));
    y += 46 + cond.length * 34;
    if (this.retestSeq) ui.text(`${t('Retest coupon')} ${this.retestSeq.n + 1} / ${this.retestSeq.total} (QW-321)`, PAD, y + 20, { size: 21, color: COLORS.info });
    if (this.usedDemo) ui.text(t('Demonstration pass used: the record will say so.'), PAD, y + 52, { size: 19, color: COLORS.warn });
  }

  drawExam(ui) {
    const app = this.app;
    const W = ui.W;
    const Q = this.Q;
    const tabs = [
      { value: 'summary', label: t('Summary') },
      { value: 'visual', label: t('Visual') },
      { value: 'tests', label: t('Tests') },
      { value: 'range', label: t('Range') },
      { value: 'record', label: t('Record') },
    ];
    ui.segmented('q-tab', PAD, 104, W - 2 * PAD, 54, tabs, this.tab, (v) => {
      this.tab = v;
      this.scroll = 0;
      app.main.invalidate();
    }, { size: 21 });
    const y0 = 176;
    if (this.tab === 'summary') this.drawSummary(ui, y0);
    else if (this.tab === 'visual') this.drawFindings(ui, y0, Q.exams.filter((e) => e.id === 'vt'), true);
    else if (this.tab === 'tests') this.drawTests(ui, y0);
    else if (this.tab === 'range') this.drawRange(ui, y0);
    else this.drawRecord(ui, y0);
    // bottom buttons
    const by = ui.H - 96;
    const bw = (W - 2 * PAD - 3 * 16) / 4;
    const rs = this.retestState();
    const btns = [
      rs && rs.can ? { id: 'q-retest', label: rs.label, go: () => this.retest(), style: 'primary' } : { id: 'q-new', label: t('New test piece'), go: () => { this.attempt = 1; this.retestSeq = null; this.start(); } },
      { id: 'q-lab', label: app.lab.visible ? t('Hide the test lab') : t('Show the test lab'), go: () => app.showLab(!app.lab.visible), disabled: !Q.exams.some((e) => e.id !== 'vt') },
      { id: 'q-weld', label: t('Weld results'), go: () => { this.phase = 'results'; app.main.invalidate(); } },
      { id: 'q-list', label: t('Other tests'), go: () => { this.phase = 'list'; app.showLab(false); app.main.invalidate(); } },
    ];
    btns.forEach((b, k) => ui.button(b.id, PAD + k * (bw + 16), by, bw, 64, b.label, b.go, { size: 20, style: b.style, disabled: b.disabled }));
  }

  drawSummary(ui, y) {
    const W = ui.W;
    const Q = this.Q;
    const v = Q.verdict;
    ui.badge(PAD, y, v === 'pass' ? t('PASSED') : v === 'invalid' ? t('NOT VALID') : t('FAILED'), v === 'pass' ? 'ok' : v === 'invalid' ? 'warn' : 'bad', 30);
    ui.text(`${t(METHOD_LABELS[Q.method] || '')} · ${Q.date}${Q.demo ? ` · ${t('demonstration weld')}` : ''}`, PAD + 260, y + 34, { size: 21, color: COLORS.dim, maxW: W - PAD - 280 - PAD });
    y += 64;
    if (Q.deciding) {
      const d = Q.deciding;
      const txt = d.condition
        ? `${t('Test conditions not met')} (${d.condition.clause}): ${t(d.condition.text)} — ${t(d.condition.detail, d.condition.vars)}`
        : `${t('Deciding clause')} ${d.finding.clause}: ${t(d.finding.name)} ${d.finding.measured} ${d.finding.unit || ''} (${t('limit')}: ${d.finding.limit})${d.specimen ? ` · ${spLabel(d.specimen)}` : ''}`;
      y = ui.wrap(txt, PAD, y + 8, W - 2 * PAD, { size: 21, color: COLORS.bad, maxLines: 3 });
    } else if (v === 'pass' && Q.designation) y = ui.wrap(`${t('Designation')}: ${Q.designation}`, PAD, y + 8, W - 2 * PAD, { size: 22, color: COLORS.ok, weight: 600, maxLines: 2 });
    y += 6;
    for (const c of Q.conditions) y = ui.wrap(`${c.ok ? '✓' : '✗'} ${t(c.text)} (${c.clause}): ${t(c.detail, c.vars)}`, PAD, y + 4, W - 2 * PAD, { size: 19, color: c.ok ? COLORS.dim : c.blocking ? COLORS.bad : COLORS.warn, maxLines: 2 });
    y += 8;
    Q.exams.forEach((e) => {
      const ok = e.verdict === 'accept';
      const nSp = e.specimens ? e.specimens.length : 0;
      const nBad = e.specimens ? e.specimens.filter((s) => s.verdict !== 'accept').length : 0;
      ui.rect(PAD, y + 6, W - 2 * PAD, 52, COLORS.bg2, 10, ok ? '#1f4a33' : '#5a2320');
      ui.text(`${t(e.title)}`, PAD + 14, y + 40, { size: 20, weight: 600, maxW: W - 2 * PAD - 420 });
      ui.text(`${nSp ? `${nSp - nBad}/${nSp} ${t('specimens')} · ` : ''}${ok ? t('acceptable') : t('not acceptable')}`, W - PAD - 14, y + 40, { size: 19, color: ok ? COLORS.ok : COLORS.bad, align: 'end' });
      y += 60;
    });
    if (Q.stoppedAfterVisual) y = ui.wrap(t('The visual examination failed, so no further tests were made (ISO 9606-1 6.4, ASME QW-302.4, API 1104 6.4).'), PAD, y + 12, W - 2 * PAD, { size: 19, color: COLORS.warn, maxLines: 2 });
    const rs = this.retestState();
    if (rs && rs.text) ui.wrap(rs.text, PAD, Math.min(y + 18, ui.H - 160), W - 2 * PAD, { size: 19, color: COLORS.info, maxLines: 2 });
  }

  drawFindings(ui, y, exams, visualTab) {
    const W = ui.W;
    const rows = [];
    for (const e of exams) {
      rows.push({ head: `${t(e.title)} — ${e.clause}`, ok: e.verdict === 'accept' });
      for (const f of e.findings || []) rows.push(f);
      for (const n of e.notes || []) rows.push({ note: n });
    }
    if (!exams.length) rows.push({ note: visualTab ? 'No visual examination: the test conditions were not met.' : '' });
    const maxRows = Math.floor((ui.H - 120 - y) / 40);
    const start = clamp(this.scroll, 0, Math.max(0, rows.length - maxRows));
    ui.region('q-scroll', 0, y, W, maxRows * 40, null, { scroll: (d) => { this.scroll = clamp(this.scroll + d, 0, Math.max(0, rows.length - maxRows)); } });
    rows.slice(start, start + maxRows).forEach((r, k) => {
      const yy = y + k * 40 + 28;
      if (r.head) ui.text(r.head, PAD, yy, { size: 20, weight: 700, color: r.ok ? COLORS.ok : COLORS.bad, maxW: W - 2 * PAD });
      else if (r.note) ui.text(t(r.note), PAD, yy, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
      else ui.text(`${r.ok ? '✓' : '✗'} ${r.clause ? `${r.clause}: ` : ''}${t(r.name)} ${r.measured ?? ''} ${r.unit || ''} — ${r.limit || ''}`, PAD, yy, { size: 18, color: r.info ? COLORS.dim : r.ok ? COLORS.text : COLORS.bad, maxW: W - 2 * PAD });
    });
    if (!rows.some((r) => !r.head && !r.note) && exams.length) ui.text(t('No imperfection found against the limits.'), PAD, y + rows.length * 40 + 30, { size: 20, color: COLORS.ok });
    if (rows.length > maxRows) ui.text(t('Scroll for more'), W - PAD, ui.H - 112, { size: 17, color: COLORS.faint, align: 'end' });
  }

  drawTests(ui, y) {
    const app = this.app;
    const W = ui.W;
    const exams = this.Q.exams.filter((e) => e.id !== 'vt');
    if (!exams.length) {
      ui.wrap(this.Q.verdict === 'invalid' ? t('The test piece was not accepted for testing (test conditions).') : t('No further tests: the visual examination failed.'), PAD, y + 30, W - 2 * PAD, { size: 22, color: COLORS.warn });
      return;
    }
    let yy = y;
    exams.forEach((e, n) => {
      const specs = e.specimens || [];
      ui.text(`${t(e.title)} — ${e.clause}`, PAD, yy + 26, { size: 21, weight: 700, color: e.verdict === 'accept' ? COLORS.ok : COLORS.bad, maxW: W - 2 * PAD - (specs.length ? 0 : 240) });
      if (!specs.length) {
        // radiography: the findings under the heading, the film in the test lab
        ui.button(`q-view-${n}`, W - PAD - 220, yy - 2, 220, 46, t('View the film'), () => { app.labView = { ...app.labView, exam: n, page: 0 }; app.showLab(true); }, { size: 18 });
        const bad = (e.findings || []).filter((f) => !f.ok);
        const lines = bad.length ? bad.slice(0, 4) : (e.findings || []).filter((f) => !f.info).slice(0, 3);
        let by = yy + 62;
        for (const f of lines) by = ui.wrap(`${f.ok ? '✓' : '✗'} ${f.clause}: ${t(f.name)} ${f.measured} ${f.unit || ''} — ${f.limit}`, PAD + 16, by, W - 2 * PAD - 16, { size: 17, color: f.ok ? COLORS.dim : COLORS.bad, maxLines: 2 });
        if (!lines.length) by = ui.wrap(t('No reportable indications.'), PAD + 16, by, W - 2 * PAD - 16, { size: 18, color: COLORS.ok });
        yy = by + 6;
        return;
      }
      yy += 36;
      const cw = (W - 2 * PAD - 3 * 12) / 4;
      specs.forEach((sp, k) => {
        const col = k % 4, row = Math.floor(k / 4);
        const x = PAD + col * (cw + 12), yb = yy + row * 76;
        const worst = (sp.findings || []).find((f) => !f.ok);
        ui.button(`q-sp-${n}-${k}`, x, yb, cw, 66, spLabel(sp), () => { app.labView = { ...app.labView, exam: n, page: specs[0].test === 'macro' ? k : Math.floor(k / 4) }; app.showLab(true); }, { size: 17, sub: worst ? `${t(worst.name)} ${worst.measured}` : whereText(sp.where), style: sp.verdict === 'accept' ? 'ok' : 'bad' });
      });
      yy += Math.ceil(specs.length / 4) * 76 + 8;
      for (const nt of (e.notes || []).slice(0, 2)) if (yy < ui.H - 150) yy = ui.wrap(t(nt), PAD, yy + 4, W - 2 * PAD, { size: 16, color: COLORS.faint, maxLines: 2 });
    });
  }

  drawRange(ui, y) {
    const W = ui.W;
    const Q = this.Q;
    if (!Q.range) {
      ui.wrap(Q.verdict === 'invalid' ? t('No range: the test conditions were not met.') : t('No range of qualification: the test was not passed (ISO 9606-1 clause 10: no certificate when a test fails).'), PAD, y + 30, W - 2 * PAD, { size: 22, color: COLORS.warn });
      return;
    }
    const rows = Q.range;
    const maxRows = Math.floor((ui.H - 120 - y) / 54);
    const start = clamp(this.scroll, 0, Math.max(0, rows.length - maxRows));
    ui.region('q-rscroll', 0, y, W, maxRows * 54, null, { scroll: (d) => { this.scroll = clamp(this.scroll + d, 0, Math.max(0, rows.length - maxRows)); } });
    const c1 = PAD, c2 = PAD + 330, c3 = PAD + 560;
    rows.slice(start, start + maxRows).forEach((r, k) => {
      const yy = y + k * 54;
      ui.rect(PAD, yy + 2, W - 2 * PAD, 50, k % 2 ? COLORS.bg2 : 'rgba(255,255,255,0.03)', 8);
      ui.text(t(r.label), c1 + 10, yy + 24, { size: 17, weight: 600, maxW: 310 });
      ui.text(r.clause, c1 + 10, yy + 44, { size: 14, color: COLORS.faint, maxW: 310 });
      ui.text(t(String(r1(r.test))), c2, yy + 34, { size: 17, color: COLORS.dim, maxW: 215 });
      ui.wrap(t(r.range), c3, yy + 22, W - PAD - c3 - 10, { size: 16, maxLines: 2, lineHeight: 20 });
    });
    if (rows.length > maxRows) ui.text(t('Scroll for more'), W - PAD, ui.H - 112, { size: 17, color: COLORS.faint, align: 'end' });
  }

  drawRecord(ui, y) {
    const app = this.app;
    const W = ui.W;
    const Q = this.Q;
    const name = app.settings.trainee || 'Trainee';
    const lines = [
      `${t('Welder')}: ${name}${app.settings.traineeId ? ` (${app.settings.traineeId})` : ''}`,
      `${t('Test')}: ${this.test.id} · ${t(METHOD_LABELS[Q.method] || '')} · ${Q.date}`,
      `${t('Standard')}: ${STANDARDS[this.test.std].code}`,
    ];
    if (Q.designation) lines.push(`${t('Designation')}: ${Q.designation}`);
    if (Q.validity) {
      if (Q.validity.rows.length) lines.push(...Q.validity.rows.map((r) => `${r.method}: ${t('valid until')} ${r.until} — ${t(r.text)}`));
      lines.push(t(Q.validity.note));
    }
    for (const ln of lines) y = ui.wrap(ln, PAD, y + 26, W - 2 * PAD, { size: 19, maxLines: 3 }) - 6;
    y = ui.wrap(t('Layout of ISO 9606-1 Annex A, ASME Form QW-484A or API 1104 Figure 1. Simulator training record — not a welder qualification under any code.'), PAD, y + 20, W - 2 * PAD, { size: 18, color: COLORS.warn, maxLines: 2 });
    const by = Math.min(ui.H - 180, y + 16);
    ui.button('q-save', PAD, by, 360, 62, this.saved ? t('Record saved') : t('Save the training record'), () => this.saveRecord(), { size: 21, disabled: this.saved, style: this.saved ? undefined : 'primary' });
    if (!app.renderer.xr.isPresenting) {
      ui.button('q-dl', PAD + 380, by, 360, 62, t('Download the record (HTML)'), () => this.downloadRecord(), { size: 20 });
      ui.button('q-name', PAD + 760, by, W - 2 * PAD - 760, 62, t('Change the welder name'), () => {
        const v = typeof window !== 'undefined' && window.prompt ? window.prompt(t('Welder name for the training records'), name) : null;
        if (v != null && v.trim()) app.set('trainee', v.trim().slice(0, 60));
        app.main.invalidate();
      }, { size: 19 });
    }
  }

  drawRecords(ui) {
    const app = this.app;
    const W = ui.W;
    const list = this.records.slice().reverse();
    const y0 = 110;
    if (!list.length) ui.text(t('No training records on this headset yet.'), PAD, y0 + 40, { size: 24, color: COLORS.dim });
    const maxRows = Math.floor((ui.H - 230 - y0) / 78);
    const start = clamp(this.scroll, 0, Math.max(0, list.length - maxRows));
    ui.region('q-recscroll', 0, y0, W, maxRows * 78, null, { scroll: (d) => { this.scroll = clamp(this.scroll + d, 0, Math.max(0, list.length - maxRows)); } });
    const td = today();
    list.slice(start, start + maxRows).forEach((r, k) => {
      const y = y0 + k * 78;
      const st = recordStatus(r, td);
      ui.rect(PAD, y, W - 2 * PAD, 70, COLORS.bg2, 10, r.verdict === 'pass' ? '#1f4a33' : '#5a2320');
      ui.text(`${r.date} · ${r.testId} · ${t(r.methodLabel)}${r.demo ? ` · ${t('demo')}` : ''}`, PAD + 14, y + 28, { size: 19, weight: 600, maxW: W - 2 * PAD - 300 });
      ui.text(r.designation || t(r.title), PAD + 14, y + 56, { size: 16, color: COLORS.dim, maxW: W - 2 * PAD - 300 });
      ui.text(t(st.text, st.vars), W - PAD - 14, y + 42, { size: 16, color: st.ok ? COLORS.ok : COLORS.warn, align: 'end', maxW: 280 });
      if (!app.renderer.xr.isPresenting) ui.region(`q-rec-${k}`, PAD, y, W - 2 * PAD, 70, () => this.downloadRecord(r));
    });
    const by = ui.H - 100;
    ui.button('q-rec-back', PAD, by, 300, 62, t('Back'), () => { this.phase = 'list'; this.scroll = 0; app.main.invalidate(); }, { size: 22 });
    ui.button('q-rec-clear', PAD + 320, by, 360, 62, t('Delete all records'), () => {
      this.records = [];
      saveRecords(this.records);
      app.main.invalidate();
    }, { size: 21, disabled: !list.length });
    if (!app.renderer.xr.isPresenting && list.length) ui.text(t('Click a record to download it.'), PAD + 700, by + 40, { size: 18, color: COLORS.faint });
  }
}
