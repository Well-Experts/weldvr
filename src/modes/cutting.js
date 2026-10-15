// Oxy-fuel cutting mode: the outfit set-up and shut-down, practice cuts on plate and the cutting drills (scope
// C), with the outfit controls on the panel (and the torch valves on the torch-hand thumbstick in XR), live cues,
// a demo cut, and the results: cut quality along the cut (Harris cut-quality categories, ISO 9013 range),
// the procedure step by step (Victor instructions, OSHA 1910.253) and the PPE for gas cutting.

import { COLORS } from '../ui/ui.js';
import { t } from '../ui/i18n.js';
import { PAD } from './welding.js';
import { CUT_PLATES, CUT_PLATE_LIST, chartRow, STEPS, mid, IPM_MMS, PSI_KPA, SCFH_LMIN, FULL_OPEN, REG, CYL_FULL_OPEN, LEAK_TEST, TIP_CHART } from '../sim/ofc.js';
import { CUT_CATEGORIES, CATEGORY_ORDER, chartSpeedRange, KINDLING_C, CONE_WINDOW, ISO9013_U } from '../sim/cut.js';
import { CutDriver } from '../weld/cutStation.js';
import { lightTorch } from '../sim/cutScript.js';
import { CUT_DRILLS, CUT_CRITERIA, evaluateCutDrill } from '../cutDrills.js';
import { clamp } from '../sim/util.js';
import { INCIDENTS } from '../safety/incidents.js';
import { incidentDetail } from '../safety/system.js';

const CAT_COLORS = {
  perfect: '#3fcf7f', production: '#7fd36b', slightlyFast: '#c6d35a', slightlySlow: '#c6d35a', extremelyFast: '#ff9a3c', extremelySlow: '#ff9a3c',
  tooClose: '#ff6a52', tooHigh: '#ff6a52', tooMuchO2: '#ff6a52', preheatHot: '#ff6a52', dirtyTip: '#ff6a52', notSevered: '#c42b2b',
};

export function psiText(p) {
  return `${p.toFixed(p < 20 ? 1 : 0)} psig (${Math.round(p * PSI_KPA)} kPa)`;
}

export class CuttingMode {
  constructor(app) {
    this.app = app;
    this.id = 'cutting';
    this.phase = 'menu';
    this.sel = { plate: 'P12', bevel: 0, tip: null };
    this.cuesOn = app.settings.cues;
    this.drill = null;
    this.R = null;
    this.driver = null;
    this.tab = 'quality';
    this.lighterOn = false;
    this.backfire = null;
    this.msg = '';
    this.msgT = 0;
  }

  title() {
    if (this.phase === 'menu') return t('Oxy-fuel cutting');
    if (this.phase === 'setup') return t('Cutting practice: choose the plate');
    if (this.phase === 'drills') return t('Cutting drills');
    if (this.phase === 'brief') return `${this.drill.id} · ${t(this.drill.title)}`;
    if (this.phase === 'results') return this.drill ? `${this.drill.id} · ${t('results')}` : t('Cutting practice: results');
    return this.drill ? `${this.drill.id} · ${t(this.drill.short)}` : t('Oxy-fuel cutting');
  }

  hint() {
    if (this.phase !== 'work') return '';
    if (this.app.renderer.xr.isPresenting) return t('Trigger: cutting oxygen lever. Hold the torch-hand stick: up/down preheat oxygen, left/right fuel. A/X: spark lighter in the other hand; its trigger strikes it.');
    return t('Desktop: set the outfit on this panel and watch the demo cut. Put on the headset to cut.');
  }

  enter() {
    const app = this.app;
    app.station.dispose();
    app.selectTorch('81');
    app.setTool('gun');
    app.safety.taskOverride = { process: '81', thickness: 12.7, position: 'PA', levOk: true };
  }

  exit() {
    const app = this.app;
    app.cut.dispose();
    app.lighter.group.visible = false;
    app.cueStrip.mesh.visible = false;
    app.safety.taskOverride = null;
    app.selectTorch('135');
  }

  // ---- starting a job -----------------------------------------------------------------------------------
  start(cfg) {
    const app = this.app;
    this.cfg = cfg;
    app.cut.load({ plate: cfg.plate, bevel: cfg.bevel || 0, tip: cfg.tip || null, outfit: cfg.outfit || { ready: true }, seed: cfg.seed ?? 7, mirror: app.settings.hand === 'left', dirtyTip: !!cfg.dirtyTip, L: cfg.L });
    const row = chartRow(cfg.plate);
    app.safety.taskOverride = { process: '81', thickness: row.tIn * 25.4, position: 'PA', levOk: true };
    if (app.settings.setup === 'auto') app.safety.quickDress();
    app.selectTorch('81');
    app.setTool('gun');
    this.phase = 'work';
    this.R = null;
    this.driver = null;
    this.backfire = null;
    this.t0 = app.time;
    app.safety.resetAttempt();
    this.eyeT = 0;
    this.restTorch();
    if (cfg.lit) lightTorch(app.cut.outfit, row);
    if (cfg.backfire) this.backfire = { armAt: 2.5, t0: null, tO2: null, tFuel: null };
    app.main.invalidate();
  }

  // desktop: the torch parked above the start of the line
  restTorch() {
    const app = this.app;
    if (app.renderer.xr.isPresenting || !app.cut.session) return;
    const d = new CutDriver(app.cut, { light: false });
    const p = d.pose(2, 0, 70);
    app.poseDesktopCut(p.tip, p.dir);
    app.desktopGun.visible = true;
  }

  startDemo() {
    const app = this.app;
    if (!app.cut.session) return;
    this.driver = new CutDriver(app.cut, { speed: 1, cone: 3 });
    this.phase = 'demo';
    app.main.invalidate();
  }

  say(m, s = 3.5) {
    if (m === this.msg && this.msgT > 0) return;
    this.msg = m;
    this.msgT = s;
    this.app.say(m, s);
  }

  // ---- per frame ------------------------------------------------------------------------------------------
  update(dt) {
    const app = this.app;
    this.msgT = Math.max(0, this.msgT - dt);
    if (this.phase === 'demo') {
      const st = app.cutStep(dt, { driver: this.driver, record: true, onDone: () => {
        this.driver = null;
        this.phase = 'work';
        app.main.invalidate();
      } });
      this.events(st);
      return;
    }
    if (this.phase !== 'work') {
      app.cutStep(dt, {});
      app.cueStrip.mesh.visible = false;
      return;
    }
    const presenting = app.renderer.xr.isPresenting;
    // torch-hand thumbstick: preheat oxygen (up/down) and fuel (left/right) valves, turned while the stick is
    // held (faster the further it is pushed; up to 0.3 and 0.6 turns/s); A/X: the spark lighter
    if (presenting) {
      const o = app.cut.outfit;
      const h = app.input.hands[app.domSide];
      const ax = (v) => {
        const a = Math.abs(v);
        return a < 0.2 ? 0 : Math.sign(v) * ((a - 0.2) / 0.8) ** 2;
      };
      const sy = ax(-h.stick.y), sx = ax(h.stick.x);
      if (sy && Math.abs(sy) >= Math.abs(sx)) o.setValve('preheat', clamp(o.valve.preheat + sy * 0.3 * dt, 0, 3));
      else if (sx) o.setValve('fuel', clamp(o.valve.fuel + sx * 0.6 * dt, 0, 3));
      if (h.down.a) this.toggleLighter();
      this.lighterStep();
    }
    const st = app.cutStep(dt, { record: true, lever: presenting ? undefined : this.leverHeld ? 1 : 0 });
    this.events(st);
    this.cues(dt, st);
    this.backfireDrill(dt);
    this.eyeCheck(dt, st);
    this.mainT = (this.mainT || 0) + dt;
    if (this.mainT > 0.25) {
      this.mainT = 0;
      app.main.invalidate();
    }
  }

  toggleLighter() {
    this.lighterOn = !this.lighterOn;
    this.app.lighter.group.visible = this.lighterOn;
  }

  // XR: the off-hand trigger strikes the lighter; a flame lights when the lighter is at the tip
  lighterStep() {
    const app = this.app;
    if (!this.lighterOn) return;
    const off = app.input.hands[app.offSide];
    if (!off.down.trigger || app.uiHover.off) return;
    const m = app.lighter.mouth.getWorldPosition(app.v1);
    app.cutTorch.group.updateWorldMatrix(true, false);
    const tip = app.v2.copy(app.cutTorch.tipLocal).applyMatrix4(app.cutTorch.group.matrixWorld);
    app.cutEvents = (app.cutEvents || []).concat(['spark']);
    if (m.distanceTo(tip) < 0.05) {
      const lit = app.cut.outfit.spark();
      if (lit) this.say(t('Lit. Open the fuel until the flame stops smoking.'), 3);
    }
  }

  events(st) {
    if (!st) return;
    const app = this.app;
    for (const e of st.events) {
      if (e === 'cold') this.say(t('The oxygen only cools the steel: preheat until the spot is bright red, then press the lever.'));
      else if (e === 'lost') this.say(t('Cut lost: release the lever, go back to the end of the kerf, preheat it to bright red and press the lever again.'), 5);
      else if (e === 'fused') this.say(t('Moving too slowly lets the cut fuse together behind the jet.'), 4);
      else if (e === 'backfire') {
        this.say(t('Backfire: the flame went back into the tip with a pop. Do not let the tip touch the work.'), 4);
        app.safety.cutIncident?.('backfire');
      } else if (e === 'sustained') {
        this.say(t('Sustained backfire (squealing): turn off the torch OXYGEN valve now, then the fuel valve.'), 6);
        app.safety.cutIncident?.('sustainedBackfire');
      } else if (e === 'torchBurnt') app.safety.cutIncident?.('torchBurnt');
      else if (e === 'flashback') {
        this.say(t('Flashback: the flame ran back into the hose.'), 6);
        app.safety.cutIncident?.('flashback');
      } else if (e === 'flashbackStopped') this.say(t('Flashback stopped by the flashback arrestor on the torch.'), 5);
      else if (e === 'pop') this.say(t('Pop: close the preheat oxygen first, then the fuel (and never light with the oxygen open).'), 4);
      else if (e === 'severed') this.say(t('Drop cut: the strip is off. Let it cool before you handle it.'), 4);
      else if (e === 'blownOff') this.say(t('Too much fuel: the flame leaves the tip. Close the fuel valve a little.'), 3);
    }
  }

  // XR cue strip: cone distance, speed, face angle, spot temperature
  cues(dt, st) {
    const app = this.app;
    const show = this.cuesOn && st && st.J && st.J.onPlate && app.renderer.xr.isPresenting;
    app.cueStrip.mesh.visible = !!show;
    if (!show) return;
    this.cueT = (this.cueT || 0) + dt;
    if (this.cueT < 0.066) return;
    this.cueT = 0;
    const c = app.cut.coupon;
    const sp = chartSpeedRange(c);
    const items = [
      { label: t('Cone gap'), value: st.cone, unit: 'mm', lo: CONE_WINDOW[0], hi: CONE_WINDOW[1], min: 0, max: 15, fmt: (v) => v.toFixed(1) },
      { label: c.bevel ? t('Bevel') : t('Square'), value: st.J.bevelAct, unit: '°', lo: (c.bevel || 0) - 2.5, hi: (c.bevel || 0) + 2.5, min: (c.bevel || 0) - 15, max: (c.bevel || 0) + 15, fmt: (v) => v.toFixed(0) },
      st.cutting
        ? { label: t('Speed'), value: st.speed, unit: 'mm/s', lo: sp[0], hi: sp[1], min: 0, max: sp[1] * 2, fmt: (v) => v.toFixed(1) }
        : { label: t('Spot'), value: st.T, unit: '°C', lo: KINDLING_C, hi: 1300, min: 20, max: 1500, fmt: (v) => v.toFixed(0) },
    ];
    let msg = '';
    const o = app.cut.outfit;
    if (!o.lit) msg = t('Light the torch: fuel valve about 1/8 turn, then the spark lighter.');
    else if (o.flame.type === 'fuel') msg = t('Open the preheat oxygen until the feather just disappears into the inner cones.');
    else if (o.flame.type === 'carburizing') msg = t('Feather showing: a little more preheat oxygen for a neutral flame.');
    else if (st.cone != null && st.cone < 1) msg = t('Lift the tip: the inner cones are in the work.');
    else if (st.cone != null && st.cone > 8) msg = t('Lower the tip: inner cones 3–6 mm above the plate.');
    else if (!st.cutting && st.T != null && st.T < KINDLING_C) msg = t('Preheat: hold the cones on the edge until it is bright red.');
    else if (!st.cutting && st.T != null) msg = t('Bright red: press the lever slowly and fully, then move.');
    else if (st.cutting && st.rho > 1.15) msg = t('Slow down: the sparks lean back and slag stays on the bottom.');
    else if (st.cutting && st.rho < 0.8) msg = t('Faster: the top edge is melting.');
    app.cueStrip.draw(items, msg, app.ui.rtl);
  }

  // XR: the flame at the work (preheating or cutting) with no filter lens, or one below the minimum shade for
  // oxygen cutting (OSHA 1910.133(a)(5)): an incident once per attempt after a second of it
  eyeCheck(dt, st) {
    const app = this.app;
    const safety = app.safety;
    if (!app.renderer.xr.isPresenting || !st || !st.J || !st.J.onPlate || !app.cut.outfit.lit || !(st.cutting || st.Pheat > 0)) {
      this.eyeT = 0;
      return;
    }
    if (safety.monitor.done.has('cutEyes')) return;
    this.eyeChkT = (this.eyeChkT || 0) - dt;
    if (this.eyeChkT <= 0) {
      this.eyeChkT = 0.5;
      const rule = safety.check().rules.find((r) => r.id === 'shade');
      this.eyeBad = rule && rule.result.status !== 'ok' && rule.result.status !== 'na' ? { shade: rule.result.shade ?? null, min: rule.guide ? rule.guide.min : null } : null;
    }
    this.eyeT = this.eyeBad ? (this.eyeT || 0) + dt : 0;
    if (this.eyeT > 1) {
      safety.monitor.done.add('cutEyes');
      safety.cutIncident('cutEyes', this.eyeBad);
    }
  }

  // C5: a sustained backfire is set off; the response is timed
  backfireDrill(dt) {
    const b = this.backfire;
    if (!b) return;
    const app = this.app;
    const o = app.cut.outfit;
    const now = app.time - this.t0;
    if (b.t0 == null && now >= b.armAt && o.lit) {
      o.backfire({ sustain: true });
      b.t0 = now;
      app.cutEvents = (app.cutEvents || []).concat(['backfire', 'sustained']);
      this.say(t('Sustained backfire (squealing): turn off the torch OXYGEN valve now, then the fuel valve.'), 6);
    }
    if (b.t0 != null) {
      if (b.tO2 == null && o.flow.preO2 + o.flow.cutO2 < 0.5) b.tO2 = now;
      if (b.tFuel == null && o.valve.fuel < 0.02) b.tFuel = now;
    }
  }

  // ---- finishing ------------------------------------------------------------------------------------------
  finish() {
    const app = this.app;
    const cs = app.cut;
    if (!cs.session) return;
    const S = this.drill && this.drill.cut === false ? null : cs.summary();
    const o = cs.outfit;
    const ppe = app.safety.check();
    this.R = {
      S, proc: o.procedure(), log: { ...cs.log }, used: { ...o.used }, ppe, faults: o.faults.slice(), incidents: app.safety.monitor.log.slice(),
      preheat: cs.session.record.starts.length ? cs.session.record.starts[0].t : null, drill: null, burnt: cs.burnt,
    };
    if (this.drill) this.R.drill = evaluateCutDrill(this.drill, { outfit: o, log: cs.log, S, backfire: this.backfire, burnt: cs.burnt });
    this.tab = this.drill ? 'drill' : S ? 'quality' : 'procedure';
    this.phase = 'results';
    app.cueStrip.mesh.visible = false;
    app.main.invalidate();
  }

  // ---- drawing ----------------------------------------------------------------------------------------------
  draw(ui) {
    if (this.phase === 'menu') return this.drawMenu(ui);
    if (this.phase === 'setup') return this.drawSetup(ui);
    if (this.phase === 'drills') return this.drawDrills(ui);
    if (this.phase === 'brief') return this.drawBrief(ui);
    if (this.phase === 'results') return this.drawResults(ui);
    return this.drawWork(ui);
  }

  drawMenu(ui) {
    const W = ui.W;
    const tiles = [
      { id: 'c-practice', label: t('Practice a cut'), sub: t('Plate, tip and cut chosen by you; the outfit set up'), go: () => (this.phase = 'setup') },
      { id: 'c-drills', label: t('Cutting drills'), sub: t('Set-up, straight, bevel and thick-plate cuts, backfire'), go: () => (this.phase = 'drills') },
      { id: 'c-outfit', label: t('Set up the outfit'), sub: t('From capped cylinders to a neutral flame and back'), go: () => this.brief(CUT_DRILLS[0]) },
    ];
    const cw = (W - 2 * PAD - 2 * 24) / 3;
    tiles.forEach((tl, k) => ui.button(tl.id, PAD + k * (cw + 24), 120, cw, 150, tl.label, () => {
      tl.go();
      this.app.main.invalidate();
    }, { size: 30, sub: tl.sub, style: k === 0 ? 'primary' : undefined }));
    let y = 330;
    y = ui.wrap(t('Oxyacetylene cutting of carbon steel plate with a hand cutting torch. The outfit is operated by the Victor instructions for the torch and cutting attachment (Form 0056-0138) and the Victor set-up guide (0056-3260), with the OSHA 1910.253 rules; the tip, pressures, speeds and kerf come from the Victor tip chart for oxy-acetylene tips.'), PAD, y, W - 2 * PAD, { size: 22, color: COLORS.dim });
    y = ui.wrap(t('Cut quality is judged by the categories of the Harris machine cutting guide (perfect, production, too fast, too slow, tip too high or too close, too much oxygen, preheat too hot) and by the ISO 9013 perpendicularity ranges.'), PAD, y + 10, W - 2 * PAD, { size: 22, color: COLORS.dim });
    y = ui.wrap(t('PPE for gas cutting: goggles with a filter lens (OSHA 1910.133: oxygen cutting under 25 mm, shade 3 minimum), flame-resistant clothing, gauntlet gloves, trousers without cuffs, leather boots.'), PAD, y + 10, W - 2 * PAD, { size: 22, color: COLORS.dim });
    ui.wrap(t('Simulator training record — not a qualification under any code.'), PAD, y + 16, W - 2 * PAD, { size: 22, color: COLORS.faint });
  }

  drawSetup(ui) {
    const W = ui.W;
    let y = 120;
    ui.text(t('Plate'), PAD, y + 36, { size: 24, weight: 600 });
    ui.segmented('cp-plate', 220, y, W - 220 - PAD, 56, CUT_PLATE_LIST.map((id) => ({ value: id, label: t(CUT_PLATES[id].short) })), this.sel.plate, (v) => {
      this.sel.plate = v;
      this.sel.tip = null;
      this.app.main.invalidate();
    }, { size: 19 });
    y += 76;
    ui.text(t('Cut'), PAD, y + 36, { size: 24, weight: 600 });
    ui.segmented('cp-bevel', 220, y, 520, 56, [{ value: 0, label: t('Square') }, { value: 30, label: t('Bevel 30°') }], this.sel.bevel, (v) => {
      this.sel.bevel = v;
      this.app.main.invalidate();
    }, { size: 22 });
    y += 76;
    const row = chartRow(this.sel.plate);
    const tips = ['00', '0', '1', '2'];
    ui.text(t('Tip'), PAD, y + 36, { size: 24, weight: 600 });
    ui.segmented('cp-tip', 220, y, 520, 56, tips.map((tp) => ({ value: tp, label: tp === row.tip ? `${tp} (${t('chart')})` : tp })), this.sel.tip || row.tip, (v) => {
      this.sel.tip = v;
      this.app.main.invalidate();
    }, { size: 22 });
    y += 92;
    // the chart row for the plate (Victor 0056-0138 Section 7)
    ui.rect(PAD, y, W - 2 * PAD, 230, COLORS.bg2, 12, COLORS.line);
    ui.text(`${t('Tip chart')} (Victor 0056-0138, ${t('oxy-acetylene')}) · ${row.label} ${t('plate')}`, PAD + 20, y + 38, { size: 24, weight: 700 });
    const lines = [
      `${t('Tip size')}: ${row.tip}`,
      `${t('Cutting oxygen')}: ${row.cutP[0]}–${row.cutP[1]} psig (${Math.round(row.cutP[0] * PSI_KPA)}–${Math.round(row.cutP[1] * PSI_KPA)} kPa), ${row.cutQ[0]}–${row.cutQ[1]} scfh`,
      `${t('Acetylene')}: ${row.fuelP[0]}–${row.fuelP[1]} psig (${Math.round(row.fuelP[0] * PSI_KPA)}–${Math.round(row.fuelP[1] * PSI_KPA)} kPa), ${row.fuelQ[0]}–${row.fuelQ[1]} scfh`,
      `${t('Speed')}: ${row.speed[0]}–${row.speed[1]} in/min (${(row.speed[0] * IPM_MMS).toFixed(1)}–${(row.speed[1] * IPM_MMS).toFixed(1)} mm/s) · ${t('kerf')} ${row.kerf} in (${(row.kerf * 25.4).toFixed(1)} mm)`,
      t('Pressures at the regulator with 25 ft x 1/4 in hose. Preheat oxygen: with a two-hose torch it comes from the cutting oxygen line.'),
    ];
    lines.forEach((l, k) => ui.text(l, PAD + 20, y + 78 + k * 34, { size: k === 4 ? 18 : 21, color: k === 4 ? COLORS.faint : COLORS.text, maxW: W - 2 * PAD - 40 }));
    y += 250;
    ui.segmented('cues', PAD, y, 360, 52, [{ value: true, label: t('Cues on') }, { value: false, label: t('Cues off') }], this.cuesOn, (v) => {
      this.cuesOn = v;
      this.app.set('cues', v);
    }, { size: 21 });
    ui.button('cp-back', PAD, ui.H - 160, 240, 70, t('Back'), () => {
      this.phase = 'menu';
      this.app.main.invalidate();
    }, { size: 24 });
    ui.button('cp-start', W - PAD - 360, ui.H - 160, 360, 70, t('Load the plate'), () => {
      this.drill = null;
      this.start({ plate: this.sel.plate, bevel: this.sel.bevel, tip: this.sel.tip || row.tip, outfit: { ready: true } });
    }, { size: 26, style: 'primary' });
  }

  drawDrills(ui) {
    const W = ui.W;
    let y = 120;
    for (const ex of CUT_DRILLS) {
      ui.button(`cx-${ex.id}`, PAD, y, W - 2 * PAD, 92, `${ex.id} · ${t(ex.title)}`, () => this.brief(ex), { size: 26, sub: t(ex.sub) });
      y += 108;
    }
    ui.button('cx-back', PAD, ui.H - 160, 240, 70, t('Back'), () => {
      this.phase = 'menu';
      this.app.main.invalidate();
    }, { size: 24 });
  }

  brief(ex) {
    this.drill = ex;
    this.phase = 'brief';
    this.app.main.invalidate();
  }

  drawBrief(ui) {
    const W = ui.W;
    const ex = this.drill;
    let y = 120;
    y = ui.wrap(t(ex.objective), PAD, y + 20, W - 2 * PAD, { size: 26, weight: 600 });
    y += 10;
    ex.steps.forEach((s, k) => {
      y = ui.wrap(`${k + 1}. ${t(s)}`, PAD, y + 8, W - 2 * PAD, { size: 22, color: COLORS.dim });
    });
    // (wrap and text take the baseline of the line)
    y += 24;
    ui.text(t('Criteria'), PAD, y, { size: 24, weight: 700 });
    y += 36;
    for (const c of ex.criteria) y = ui.wrap(`• ${t(CUT_CRITERIA[c])}`, PAD, y, W - 2 * PAD, { size: 21 }) + 4;
    ui.button('cb-back', PAD, ui.H - 160, 240, 70, t('Back'), () => {
      this.phase = 'drills';
      this.app.main.invalidate();
    }, { size: 24 });
    ui.button('cb-start', W - PAD - 360, ui.H - 160, 360, 70, t('Start'), () => this.start({ plate: ex.plate, bevel: ex.bevel || 0, outfit: ex.outfit, lit: !!ex.backfire, backfire: !!ex.backfire }), { size: 26, style: 'primary' });
  }

  // the job: outfit controls, flame, steps, actions
  //   left: the two cylinders with their regulators and the leak test; right: the torch valves, the lighter
  //   and the lever; under both: the procedure in two columns; at the bottom: the actions
  drawWork(ui) {
    const app = this.app;
    const W = ui.W;
    const cs = app.cut;
    if (!cs.session) return;
    const o = cs.outfit;
    const row = o.row;
    const demo = this.phase === 'demo';
    const xr = app.renderer.xr.isPresenting;
    const st = cs.state;
    let y = 104;
    ui.text(`${row.label} ${t('plate')} · ${t('tip')} ${o.tip}${cs.coupon.bevel ? ` · ${t('bevel')} ${cs.coupon.bevel}°` : ''} · ${t('chart')}: O₂ ${row.cutP[0]}–${row.cutP[1]} psig, C₂H₂ ${row.fuelP[0]}–${row.fuelP[1]} psig, ${row.speed[0]}–${row.speed[1]} in/min`, PAD, y + 20, { size: 20, color: COLORS.dim, maxW: W - 2 * PAD });
    y += 36;
    const colW = (W - 2 * PAD - 24) / 2;
    const xL = PAD, xR = PAD + colW + 24;
    // ---- cylinders and regulators (left) ----
    const GH = 178;
    let yl = y;
    for (const gas of ['oxygen', 'fuel']) {
      const c = o.cyl[gas];
      const name = gas === 'oxygen' ? t('Oxygen') : t('Acetylene');
      ui.rect(xL, yl, colW, GH, COLORS.bg2, 12, COLORS.line);
      ui.text(name, xL + 16, yl + 30, { size: 23, weight: 700 });
      ui.text(`${t('inlet')} ${Math.round(o.inlet(gas))} psig · ${t('delivery')} ${psiText(o.delivery(gas))}`, xL + 150, yl + 30, { size: 18, color: gas === 'fuel' && o.delivery(gas) > 15 ? COLORS.bad : COLORS.dim, maxW: colW - 160 });
      // discrete actions
      const bw = (colW - 32 - 3 * 8) / 4;
      const by = yl + 44;
      ui.button(`co-chain:${gas}`, xL + 16, by, bw, 42, c.secured ? t('Chained') : t('Chain it'), () => {
        o.chain(gas, !c.secured);
        app.main.invalidate();
      }, { size: 17, selected: c.secured, disabled: demo });
      ui.button(`co-cap:${gas}`, xL + 16 + (bw + 8), by, bw, 42, c.cap ? t('Remove cap') : t('Cap off'), () => {
        o.removeCap(gas);
        app.main.invalidate();
      }, { size: 17, disabled: !c.cap || demo });
      ui.button(`co-crack:${gas}`, xL + 16 + 2 * (bw + 8), by, bw, 42, c.cracked ? t('Cracked') : t('Crack valve'), () => {
        o.crack(gas, {});
        app.main.invalidate();
      }, { size: 17, disabled: c.cap || c.regOn || demo, selected: c.cracked });
      ui.button(`co-reg:${gas}`, xL + 16 + 3 * (bw + 8), by, bw, 42, c.regOn ? t('Regulator on') : t('Fit regulator'), () => {
        o.attachRegulator(gas);
        app.main.invalidate();
      }, { size: 17, disabled: c.cap || c.regOn || demo, selected: c.regOn });
      // cylinder valve and regulator screw
      const sw = (colW - 32 - 12) / 2;
      ui.stepper(`co-cyl:${gas}`, xL + 16, by + 54, sw, 68, t('cylinder valve'), `${c.open.toFixed(2)} ${t('turns')}`, (d) => {
        o.setCylinder(gas, clamp(c.open + d * 0.25, 0, CYL_FULL_OPEN[gas] + (gas === 'fuel' ? 1 : 0.5)), { dt: 0.5 });
        app.main.invalidate();
      }, { disabled: c.cap || demo, warn: gas === 'fuel' && c.open > 1.5, bw: 54, lsize: 15, vsize: 23 });
      const step = gas === 'oxygen' ? 1 / REG.oxygen.psiPerTurn : 0.5 / REG.fuel.psiPerTurn;
      ui.stepper(`co-scr:${gas}`, xL + 28 + sw, by + 54, sw, 68, t('regulator screw'), `${(o.reg[gas].turns * REG[gas].psiPerTurn).toFixed(1)} psig`, (d) => {
        o.setRegulator(gas, Math.max(0, o.reg[gas].turns + d * step));
        app.main.invalidate();
      }, { disabled: !c.regOn || demo, warn: gas === 'fuel' && o.reg.fuel.turns * REG.fuel.psiPerTurn > 15, bw: 54, lsize: 15, vsize: 23 });
      yl += GH + 10;
    }
    // leak test
    const lw = (colW - 2 * 8) / 3;
    ui.button('co-watch', xL, yl, lw, 50, t('Watch gauges 5 min'), () => {
      const r = o.watchGauges();
      this.say(r.conditions ? (r.tight ? t('Gauges steady for five minutes: leak tight.') : t('A gauge dropped: there is a leak. Find it with leak-detection solution.')) : t('Leak test: 20 psig oxygen, 10 psig fuel, torch valves and cylinder valves closed.'), 5);
      app.main.invalidate();
    }, { size: 17, disabled: demo });
    ui.button('co-sol', xL + lw + 8, yl, lw, 50, t('Leak solution'), () => {
      const at = o.leakSolution();
      this.say(at ? t('Bubbles at the {w} connection.', { w: t(at) }) : t('No bubbles.'), 4);
    }, { size: 17, disabled: demo });
    ui.button('co-tight', xL + 2 * (lw + 8), yl, lw, 50, t('Tighten'), () => {
      const at = o.leak && !o.leak.fixed ? o.leak.at : null;
      if (at && o.tighten(at)) this.say(t('Connection tightened. Test again.'), 3);
    }, { size: 17, disabled: demo });
    const yEnd = yl + 50;
    // ---- torch (right) ----
    const yr = y;
    ui.rect(xR, yr, colW, yEnd - yr, COLORS.bg2, 12, COLORS.line);
    ui.text(t('Torch'), xR + 16, yr + 30, { size: 23, weight: 700 });
    const fl = o.flame;
    const flText = !o.lit ? (o.backfireT > 0 ? t('burning inside the torch!') : t('not lit')) : fl.type === 'fuel' ? (fl.smoke > 0 ? t('acetylene only, smoking') : fl.separated ? t('acetylene only, off the tip') : t('acetylene only')) : t(fl.type);
    ui.text(`${t('Flame')}: ${flText}${o.lit && fl.type !== 'fuel' ? ` · O₂/C₂H₂ ${fl.ratio.toFixed(2)}` : ''}`, xR + 120, yr + 30, { size: 18, color: o.backfireT > 0 ? COLORS.bad : fl.type === 'neutral' ? COLORS.ok : COLORS.warn, maxW: colW - 130 });
    // torch valves: the label over each, the turns open in the box
    const tw = (colW - 32 - 2 * 10) / 3;
    const valves = [
      ['oxygen', t('handle oxygen valve'), 0.25],
      ['fuel', t('fuel valve'), 0.0625],
      ['preheat', t('preheat oxygen valve'), 0.02],
    ];
    valves.forEach(([n, lab, stp], k) => {
      const vx = xR + 16 + k * (tw + 10);
      ui.text(lab, vx + tw / 2, yr + 64, { size: 15, color: COLORS.dim, align: 'center', maxW: tw });
      ui.stepper(`ct-v:${n}`, vx, yr + 72, tw, 58, null, `${o.valve[n].toFixed(2)}`, (d) => {
        o.setValve(n, clamp(o.valve[n] + d * stp, 0, 3));
        app.main.invalidate();
      }, { disabled: demo, bw: 46, vsize: 24 });
    });
    ui.text(t('turns open'), xR + colW - 16, yr + 30, { size: 14, color: COLORS.faint, align: 'end' });
    const f = o.flow;
    ui.text(`C₂H₂ ${f.fuel.toFixed(1)} scfh (${(f.fuel * SCFH_LMIN).toFixed(1)} L/min) · ${t('preheat')} O₂ ${f.preO2.toFixed(1)} scfh · ${t('cutting')} O₂ ${f.cutO2.toFixed(0)} scfh`, xR + 16, yr + 156, { size: 16, color: COLORS.dim, maxW: colW - 32 });
    const aw = (colW - 32 - 2 * 10) / 3;
    const ay = yr + 172;
    ui.button('ct-spark', xR + 16, ay, aw, 52, t('Spark lighter'), () => {
      app.cutEvents = (app.cutEvents || []).concat(['spark']);
      if (o.spark()) this.say(t('Lit. Open the fuel until the flame stops smoking.'), 3);
      else if (!o.lit) this.say(o.flows().fuel > 0.3 ? t('No flame: too much fuel for the tip, or no gas.') : t('No flame: open the fuel valve about 1/8 turn first.'), 3);
      app.main.invalidate();
    }, { size: 18, disabled: demo || o.lit });
    ui.button('ct-lever', xR + 16 + aw + 10, ay, aw, 52, o.lever > 0.5 ? t('Release lever') : t('Press lever'), () => {
      this.leverHeld = !(o.lever > 0.5);
      o.setLever(this.leverHeld ? 1 : 0);
      app.main.invalidate();
    }, { size: 18, disabled: demo || xr, selected: o.lever > 0.5 });
    ui.button('ct-light', xR + 16 + 2 * (aw + 10), ay, aw, 52, t('Light for me'), () => {
      lightTorch(o, row);
      app.main.invalidate();
    }, { size: 18, disabled: demo || o.lit || !o.cyl.oxygen.regOn || !o.cyl.fuel.regOn || o.cyl.oxygen.open <= 0 || o.cyl.fuel.open <= 0 });
    let ys = ay + 64;
    if (xr) {
      ui.button('ct-lighter', xR + 16, ys, colW - 32, 48, this.lighterOn ? t('Put the lighter away') : t('Spark lighter in the other hand'), () => this.toggleLighter(), { size: 18, selected: this.lighterOn });
      ys += 60;
    }
    // what the plate shows at the jet
    const T = st && st.T != null ? Math.round(st.T) : null;
    const status = st && st.cutting ? `${t('cutting')} · ${st.speed.toFixed(1)} mm/s` : T != null ? `${t('spot')} ${T} °C${T >= KINDLING_C ? ` (${t('bright red')})` : ''}` : '';
    if (status) ui.text(status, xR + 16, Math.min(ys + 26, yEnd - 14), { size: 20, weight: 600, color: st && st.cutting ? COLORS.ok : T != null && T >= KINDLING_C ? COLORS.warn : COLORS.dim });
    // ---- procedure (two columns, under both) ----
    let yp = yEnd + 16;
    ui.text(t('Procedure'), PAD, yp + 20, { size: 21, weight: 700 });
    ui.text(t('✓ done right · ✗ fault · ○ to do · · set up by the app'), W - PAD, yp + 20, { size: 15, color: COLORS.faint, align: 'end' });
    yp += 30;
    const pr = o.procedure();
    const half = Math.ceil(pr.length / 2);
    const rowH = Math.min(24, (ui.H - 160 - yp) / half);
    pr.forEach((s, k) => {
      const col = k < half ? 0 : 1;
      const yy = yp + (k % half) * rowH;
      const bad = s.faults.length > 0 || (s.done && !s.ok);
      const mark = bad ? '✗' : s.done ? (s.byApp ? '·' : '✓') : '○';
      const color = bad ? COLORS.bad : s.done ? (s.byApp ? COLORS.faint : COLORS.ok) : COLORS.dim;
      ui.text(`${mark} ${k + 1}. ${t(s.short || s.text)}`, (col ? xR : xL), yy + 17, { size: 16, color, maxW: colW });
    });
    // actions
    const by = ui.H - 150;
    const bw2 = (W - 2 * PAD - 3 * 16) / 4;
    ui.button('cw-demo', PAD, by, bw2, 70, t('Watch a demo cut'), () => this.startDemo(), { size: 22, disabled: demo || !(o.cyl.oxygen.open > 0 && o.cyl.fuel.open > 0 && o.cyl.oxygen.regOn && o.cyl.fuel.regOn) || (this.drill && this.drill.cut === false) });
    ui.button('cw-finish', PAD + bw2 + 16, by, bw2, 70, t('Finish and evaluate'), () => this.finish(), { size: 22, style: 'primary', disabled: demo });
    ui.button('cw-reset', PAD + 2 * (bw2 + 16), by, bw2, 70, t('New plate'), () => this.start(this.cfg), { size: 22, disabled: demo });
    ui.button('cw-back', PAD + 3 * (bw2 + 16), by, bw2, 70, t('Back'), () => {
      app.cut.dispose();
      this.phase = this.drill ? 'drills' : 'setup';
      app.main.invalidate();
    }, { size: 22, disabled: demo });
  }

  drawResults(ui) {
    const app = this.app;
    const W = ui.W;
    const R = this.R;
    const tabs = [];
    if (R.drill) tabs.push({ value: 'drill', label: t('Drill') });
    if (R.S) tabs.push({ value: 'quality', label: t('Cut quality') });
    tabs.push({ value: 'procedure', label: t('Procedure') }, { value: 'safety', label: t('Safety') });
    if (!tabs.some((x) => x.value === this.tab)) this.tab = tabs[0].value;
    ui.segmented('cr-tab', PAD, 104, W - 2 * PAD, 58, tabs, this.tab, (v) => {
      this.tab = v;
      app.main.invalidate();
    }, { size: 24 });
    const y = 186;
    if (this.tab === 'drill') this.drawDrillTab(ui, y);
    else if (this.tab === 'quality') this.drawQualityTab(ui, y);
    else if (this.tab === 'procedure') this.drawProcedureTab(ui, y);
    else this.drawSafetyTab(ui, y);
    const by = ui.H - 150;
    const bw = (W - 2 * PAD - 2 * 16) / 3;
    ui.button('cr-again', PAD, by, bw, 70, t('Try again'), () => this.start(this.cfg), { size: 24, style: 'primary' });
    ui.button('cr-menu', PAD + bw + 16, by, bw, 70, this.drill ? t('Drill list') : t('Choose another plate'), () => {
      app.cut.dispose();
      this.phase = this.drill ? 'drills' : 'setup';
      app.main.invalidate();
    }, { size: 24 });
    ui.button('cr-home', PAD + 2 * (bw + 16), by, bw, 70, t('Cutting menu'), () => {
      app.cut.dispose();
      this.phase = 'menu';
      this.drill = null;
      app.main.invalidate();
    }, { size: 24 });
  }

  drawDrillTab(ui, y) {
    const W = ui.W;
    const d = this.R.drill;
    const fmt = (x) => (x && typeof x === 'object' ? t(x.k, x.v) : t(String(x)));
    ui.badge(PAD, y, d.all ? t('ALL CRITERIA MET') : `${d.met} / ${d.total} ${t('criteria met')}`, d.all ? 'ok' : 'warn', 24);
    let yy = y + 60;
    for (const it of d.items) {
      ui.rect(PAD, yy, W - 2 * PAD, 64, COLORS.bg2, 10, it.ok ? '#1f4a33' : '#5a2320');
      ui.text(t(it.label), PAD + 16, yy + 28, { size: 21, weight: 600, maxW: 720 });
      ui.text(`${t('target')} ${fmt(it.target)}${it.basis === 'seed' ? ` · ${t('seed')}` : it.basis === 'secondary' ? ` · ${t('ISO 9013 via a secondary source')}` : ''}`, PAD + 16, yy + 54, { size: 16, color: COLORS.dim, maxW: 720 });
      ui.text(fmt(it.measured), W - PAD - 150, yy + 40, { size: 21, weight: 700, color: it.ok ? COLORS.ok : COLORS.bad, align: 'end', maxW: 360 });
      ui.text(it.ok ? t('met') : t('not met'), W - PAD - 16, yy + 40, { size: 19, weight: 700, color: it.ok ? COLORS.ok : COLORS.bad, align: 'end' });
      yy += 72;
    }
  }

  drawQualityTab(ui, y) {
    const W = ui.W;
    const R = this.R;
    const S = R.S;
    const rec = this.app.cut.session.record;
    // categories along the cut
    const x0 = PAD, x1 = W - PAD, bh = 34;
    ui.text(t('Along the cut (start → far edge)'), PAD, y + 20, { size: 21, weight: 600 });
    const by = y + 32;
    const trim = S.trim ?? 0;
    for (let i = 0; i < rec.n; i++) {
      const k = rec.cat[i] >= 0 ? CATEGORY_ORDER[rec.cat[i]] : 'notSevered';
      const xa = x0 + ((x1 - x0) * i) / rec.n, xb = x0 + ((x1 - x0) * (i + 1)) / rec.n;
      // the start and the run-off are not judged (grey, with the colour as a thin line)
      const judged = i >= trim && i < rec.n - trim;
      ui.rect(xa, by, xb - xa + 0.6, bh, judged ? CAT_COLORS[k] || '#888' : '#3a4250', 0);
      if (!judged) ui.rect(xa, by + bh - 5, xb - xa + 0.6, 5, CAT_COLORS[k] || '#888', 0);
    }
    if (trim) ui.text(t('Grey: {n} mm at the start and at the run-off, not judged', { n: trim }), W - PAD, y + 20, { size: 16, color: COLORS.faint, align: 'end' });
    // legend of the categories present with the guide's description
    let yy = by + bh + 24;
    const present = CATEGORY_ORDER.filter((k) => S.cats[k]);
    for (const k of present) {
      const pc = (100 * S.cats[k]) / S.len;
      const share = pc > 0 && pc < 1 ? '<1' : String(Math.round(pc));
      ui.rect(PAD, yy - 16, 18, 18, CAT_COLORS[k], 4);
      ui.text(`${t(CUT_CATEGORIES[k].label)} ${share}%`, PAD + 28, yy, { size: 20, weight: 600 });
      yy = ui.wrap(t(CUT_CATEGORIES[k].text), PAD + 300, yy, W - 2 * PAD - 300, { size: 17, color: COLORS.dim }) + 4;
    }
    yy += 6;
    const items = [
      [t('Drop cut (strip severed)'), S.severed ? t('yes') : `${t('no')} (${S.gaps.length} ${t('gap(s)')})`, S.severed],
      [t('Perpendicularity u (95% of the length), ISO 9013'), S.u95 != null ? `${S.u95.toFixed(2)} mm · ${t('range')} ${S.range ?? '> 5'} (a = ${S.a.toFixed(1)} mm)` : '–', S.range != null && S.range <= 4],
      [t('Top edge rounding (largest)'), `${S.topMax.toFixed(1)} mm`, S.topMax <= 1],
      [t('Slag stuck on the bottom edge'), `${Math.round(S.drossAdhShare * 100)}% ${t('of the length')}`, S.drossAdhShare <= 0.1],
      [t('Off the line by more than 1.5 mm'), `${Math.round(S.devShare * 100)}% (${t('max')} ${S.devMax.toFixed(1)} mm)`, S.devShare <= 0.1],
      [t('Kerf width (mean)'), S.kerf != null ? `${S.kerf.toFixed(2)} mm` : '–', true],
      [t('Starts, restarts, lost cuts'), `${S.starts} · ${S.restarts} · ${S.losses}`, S.losses === 0],
      [t('Gas used'), `O₂ ${(R.used.oxygen * 28.317).toFixed(0)} L · C₂H₂ ${(R.used.fuel * 28.317).toFixed(1)} L`, true],
    ];
    for (const [l, v, ok] of items) {
      if (yy > ui.H - 190) break;
      ui.text(l, PAD, yy + 18, { size: 19, color: COLORS.dim, maxW: 700 });
      ui.text(v, W - PAD, yy + 18, { size: 19, weight: 700, color: ok ? COLORS.ok : COLORS.warn, align: 'end', maxW: 480 });
      yy += 30;
    }
    void ISO9013_U;
  }

  drawProcedureTab(ui, y) {
    const W = ui.W;
    const R = this.R;
    let yy = y;
    for (const s of R.proc) {
      const bad = s.faults.length > 0 || (s.done && !s.ok);
      const col = bad ? COLORS.bad : s.done ? (s.byApp ? COLORS.faint : COLORS.ok) : COLORS.dim;
      const mark = bad ? '✗' : s.done ? (s.byApp ? '·' : '✓') : '○';
      ui.text(`${mark} ${t(s.text)}`, PAD, yy + 20, { size: 19, color: col, maxW: W - 2 * PAD - 300 });
      ui.text(s.byApp ? t('set up by the app') : s.ref, W - PAD, yy + 20, { size: 15, color: COLORS.faint, align: 'end', maxW: 290 });
      yy += 28;
      for (const f of s.faults) {
        yy = ui.wrap(`   – ${t(f)}`, PAD + 20, yy + 16, W - 2 * PAD - 20, { size: 16, color: COLORS.bad }) - 8;
      }
    }
    const L = R.log;
    ui.text(`${t('Pops')} ${L.pops} · ${t('backfires')} ${L.backfires} · ${t('sustained')} ${L.sustained} · ${t('flashbacks')} ${L.flashbacks}`, PAD, yy + 26, { size: 19, color: L.pops + L.backfires + L.flashbacks ? COLORS.warn : COLORS.dim });
  }

  drawSafetyTab(ui, y) {
    const W = ui.W;
    const chk = this.R.ppe;
    let yy = y;
    for (const r of chk.rules) {
      const st = r.result.status;
      const ok = st === 'ok' || st === 'na';
      ui.text(`${ok ? '✓' : '✗'} ${t(r.text)}`, PAD, yy + 20, { size: 19, color: ok ? COLORS.ok : r.level === 'shall' ? COLORS.bad : COLORS.warn, maxW: W - 2 * PAD });
      yy += 28;
      if (r.result.note) yy = ui.wrap(`   ${t(r.result.note, r.result.vars || {})}`, PAD + 20, yy + 14, W - 2 * PAD - 20, { size: 16, color: COLORS.dim }) - 6;
    }
    // incidents of this attempt (burns, eyes, backfires): what happened and the rule
    const inc = this.R.incidents || [];
    yy += 10;
    ui.text(`${t('Incidents')}: ${inc.length ? inc.length : t('none')}`, PAD, yy + 22, { size: 21, weight: 700, color: inc.length ? COLORS.bad : COLORS.ok });
    yy += 30;
    for (const i of inc) {
      if (yy > ui.H - 200) break;
      const def = INCIDENTS[i.type];
      if (!def) continue;
      ui.text(`• ${t(def.title)}${i.where ? ` (${t(i.where)})` : ''}`, PAD, yy + 20, { size: 19, weight: 600, color: def.severity === 'injury' ? COLORS.bad : COLORS.warn, maxW: W - 2 * PAD });
      yy += 26;
      const det = incidentDetail(i);
      if (det) yy = ui.wrap(det, PAD + 22, yy + 14, W - 2 * PAD - 22, { size: 16, color: COLORS.dim }) - 6;
      yy = ui.wrap(`${t('Rule')}: ${t(def.rule.text)}`, PAD + 22, yy + 14, W - 2 * PAD - 22, { size: 16, color: COLORS.faint }) - 2;
    }
  }
}

export { STEPS, mid, FULL_OPEN, LEAK_TEST, TIP_CHART };
