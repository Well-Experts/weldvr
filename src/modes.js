// Training modes: Home, Practice, Exercises, Troubleshoot, Inspector lab, Tracking lab,
// Settings and About (the shared welding flow is in modes/welding.js, Safety and PPE in modes/safety.js,
// oxy-fuel cutting in modes/cutting.js, welder qualification in modes/qualification.js). Each mode draws the main panel and runs its own per-frame logic.

import * as THREE from 'three';
import { COLORS } from './ui/ui.js';
import { t, num } from './ui/i18n.js';
import * as screens from './ui/screens.js';
import { PROCESS_LIST, POSITION_LIST, TROUBLESHOOT, INSPECT_COUPONS, SMAW_CHOICES, GTAW_CHOICES, gtawJoint, wpsFor, jointFor, jointLabel, jointKind } from './scenarios.js';
import { PIPE_SIZES, PIPE_POSITIONS } from './sim/pipe.js';
import { TUNGSTENS } from './sim/gtaw.js';
import { makeJoint, POSITIONS } from './sim/joint.js';
import { PROCESSES } from './sim/process.js';
import { evaluate, PACKS } from './sim/rules/packs.js';
import { inventory, scoreInspection, FINDING_TYPES } from './inspect/inventory.js';
import { measure } from './inspect/tools.js';
import { clamp } from './sim/util.js';
import { EXERCISES, CRITERIA, exerciseJoint, laneFor, evaluateExercise, demoPlan, isPipeDrill } from './exercises.js';
import { WeldingMode, PAD, polarityLabel } from './modes/welding.js';
import { SafetyMode } from './modes/safety.js';
import { CuttingMode } from './modes/cutting.js';
import { QualificationMode } from './modes/qualification.js';

// ===================================================================================================
export class HomeMode {
  constructor(app) {
    this.id = 'home';
    this.app = app;
    this.isHome = true;
  }

  enter() {
    const app = this.app;
    if (!app.station.coupon) {
      const joint = makeJoint('fillet', 'PB');
      const wps = wpsFor('135', joint);
      app.station.load({ joint, settings: { ...wps.settings }, seed: 11, mirror: app.settings.hand === 'left' });
    }
    app.showSection(null);
    app.markFinding(null);
    app.setTool('gun');
  }

  title() {
    return t('VR Welding Simulator');
  }

  hint() {
    return this.app.renderer.xr.isPresenting
      ? t('Point with your other hand and pull the trigger to choose. B/Y on the gun hand lowers the helmet.')
      : t('Desktop preview: drag to look around, click the panel. Put on the Quest and press Enter VR to weld.');
  }

  update(dt) {
    this.app.weldStep(dt, {});
  }

  draw(ui) {
    const app = this.app;
    const tiles = [
      { id: 'safety', label: t('Safety and PPE'), sub: t('PPE, booth inspection, hot work'), go: () => app.setMode(new SafetyMode(app)) },
      { id: 'practice', label: t('Practice'), sub: t('Weld with live cues'), go: () => app.setMode(new PracticeMode(app)) },
      { id: 'exercises', label: t('Exercises'), sub: t('Technique drills with criteria'), go: () => app.setMode(new ExercisesMode(app)) },
      { id: 'cutting', label: t('Oxy-fuel cutting'), sub: t('Outfit set-up, cuts, drills'), go: () => app.setMode(new CuttingMode(app)) },
      { id: 'trouble', label: t('Troubleshoot'), sub: t('Find the cause, fix it, re-weld'), go: () => app.setMode(new TroubleshootMode(app)) },
      { id: 'test', label: t('Welder qualification'), sub: t('ISO 9606-1, ASME IX, API 1104 tests'), go: () => app.setMode(new QualificationMode(app)) },
      { id: 'inspect', label: t('Inspector lab'), sub: t('Gauges, findings, accept or reject'), go: () => app.setMode(new InspectMode(app)) },
      { id: 'tracking', label: t('Tracking lab'), sub: t('Controller jitter and frame rate'), go: () => app.setMode(new TrackingMode(app)) },
    ];
    const cw = (ui.W - 2 * PAD - 2 * 24) / 3;
    tiles.forEach((tile, k) => {
      const col = k % 3, row = Math.floor(k / 3);
      ui.button(`home-${tile.id}`, PAD + col * (cw + 24), 112 + row * 162, cw, 146, tile.label, tile.go, { size: 34, sub: tile.sub, style: k === 0 || k === 1 ? 'primary' : undefined });
    });
    ui.button('home-settings', PAD, 616, 300, 64, t('Settings'), () => app.setMode(new SettingsMode(app)), { size: 24 });
    ui.button('home-about', PAD + 324, 616, 300, 64, t('About this build'), () => app.setMode(new AboutMode(app)), { size: 24 });
    let y = 730;
    y = ui.wrap(t('Model status: uncalibrated engineering model with seed values. Rule packs are training packs; verify against licensed copies of the codes.'), PAD, y, ui.W - 2 * PAD, { size: 22, color: COLORS.warn });
    ui.wrap(t('Simulator training record — not a welder qualification under any code.'), PAD, y + 10, ui.W - 2 * PAD, { size: 22, color: COLORS.dim });
  }
}

// ===================================================================================================
export class PracticeMode extends WeldingMode {
  constructor(app) {
    super(app);
    this.id = 'practice';
    this.sel = { process: '135', type: 'fillet', position: 'PB', electrode: 'E7018', dia: 3.2, tungsten: 'EWCe-2', filler: 'ER70S-2', pipeSize: 'NPS2-80', pipePos: '5G', progression: 'up' };
    this.cuesOn = app.settings.cues;
  }

  title() {
    return this.phase === 'setup' ? t('Practice: choose a coupon') : this.phase === 'results' || this.phase === 'replay' ? t('Practice: results') : t('Practice');
  }

  smaw() {
    const st = this.app.station;
    return this.phase === 'setup' ? this.sel.process === '111' : !!(st.session && st.session.settings.process === '111');
  }

  tig() {
    const st = this.app.station;
    return this.phase === 'setup' ? this.sel.process === '141' : !!(st.session && st.session.settings.process === '141');
  }

  hint() {
    if (this.phase !== 'weld') return '';
    if (this.app.tool === 'hammer') return t('Strike the slag with the chisel end of the hammer, along the whole bead. Safety glasses on.');
    if (this.app.tool === 'brush') return t('Brush along the bead to take the slag off. The panel shows how much is still covered.');
    if (this.smaw()) return t('Touch the electrode on the joint and lift it to strike. B/Y: helmet. A/X: new electrode. Thumbstick up/down: current.');
    if (this.tig()) return t('Trigger: switch and current. Rod hand: stick feeds, A/X new rod. Torch hand: A/X regrind, B/Y helmet.');
    return t('Trigger: weld. B/Y: helmet. Thumbstick on the gun: wire feed (up/down) and voltage (left/right).');
  }

  enter() {
    this.app.setTool('gun');
  }

  update(dt) {
    super.update(dt);
    // quick machine adjustments from the gun thumbstick (arc off only)
    const app = this.app;
    if (this.phase === 'weld' && app.renderer.xr.isPresenting && !(app.station.lastState && app.station.lastState.arcOn)) {
      const dy = app.input.stickStep(app.domSide, 'y');
      const dx = app.input.stickStep(app.domSide, 'x');
      const s = app.station.session.settings;
      if (s.process === '111' || s.process === '141') {
        // constant-current source: the thumbstick sets the current in 5 A steps
        if (dy) app.station.setSettings({ current: clamp(s.current + dy * 5, 30, 250) });
      } else {
        if (dy) app.station.setSettings({ wfs: clamp(Math.round((s.wfs + dy * 0.1) * 10) / 10, 2, 14) });
        if (dx) app.station.setSettings({ voltage: clamp(Math.round((s.voltage + dx * 0.1) * 10) / 10, 14, 36) });
      }
      if (dx || dy) {
        app.machine.invalidate();
        app.main.invalidate();
      }
    }
  }

  draw(ui) {
    const app = this.app;
    if (this.phase === 'setup') return this.drawSetup(ui);
    if (this.phase === 'results' || this.phase === 'replay') {
      return this.drawResultsScreen(ui, [
        { id: 'r-again', label: t('Weld again'), go: () => this.restart(), style: 'primary' },
        { id: 'r-setup', label: t('Change coupon'), go: () => { this.phase = 'setup'; app.main.invalidate(); } },
      ]);
    }
    let y = this.drawWeldControls(ui, 140);
    y = this.drawHeatBox(ui, y - 6, this.cfgWps ? this.cfgWps.interpassMax : null);
    ui.segmented('cues', PAD, y, 420, 56, [{ value: true, label: t('Cues on') }, { value: false, label: t('Cues off') }], this.cuesOn, (v) => {
      this.cuesOn = v;
      app.set('cues', v);
    }, { size: 22 });
    y += 76;
    // SMAW technique: Hobart/Miller 155095F (strike, arc length, slag), Lincoln C2.410 (drag angle,
    // low-hydrogen restarts), Kobelco (crater fill)
    // GTAW technique: Miller OM-215994 and Miller TIG articles (arc length, torch angle, crater fill,
    // post-flow), TWI (filler rod angle), ESAB (rod inside the gas envelope)
    const tips = this.tig()
      ? [
        t('Hold the tungsten 1.6–3.2 mm from the work and push the torch 10–20° (70–80° to the work). Never touch the work or the pool with the tungsten.'),
        t('Dab the rod into the front edge of the pool at 10–20° to the work and pull it back a little; keep the hot rod end inside the argon and away from the tungsten.'),
        t('At the end, ease off the amperage control while adding filler to fill the crater, then hold the torch over it until the post-flow stops.'),
      ]
      : this.smaw() && app.station.joint && app.station.joint.pipe
      ? [
        // Lincoln C2.420 (root from the bottom to the top one side at a time, keyhole, feathered stops,
        // cap height), ESAB (electrode angles by position)
        t('Root: keep a small keyhole open at the root the whole way; if it closes the root is not penetrating. The cue strip shows it.'),
        t('Change the electrode angle with the position: push 5–10° up the joint on the sides, drag slightly at the top and overhead (the travel-angle window follows the arc round the pipe).'),
        t('Grind the start and the crater of each run to a feathered edge before you tie in to them; start each pass away from where the last one started.'),
      ]
      : this.smaw()
      ? [
        t('Lower the helmet. Strike on the run-on tab like a match, or tap straight down, and lift at once to the arc length.'),
        t('Hold the arc length about one electrode diameter (very short with E7018) and a 10–30° drag angle; feed the holder down as the electrode burns.'),
        t('Restart ahead of the crater and move back into it. Fill the crater at the end, then chip and brush the slag off.'),
      ]
      : [
        t('Lower the helmet, place the wire at the start of the joint on the run-on tab, then pull the trigger.'),
        t('Watch the pool, not the gun. Keep the stick-out steady and move at the pacer speed.'),
        t('At the end, pause for a moment to fill the crater, then release the trigger.'),
      ];
    for (const tip of tips) if (y < ui.H - 150) y = ui.wrap(`• ${tip}`, PAD, y + 8, ui.W - 2 * PAD, { size: 22, color: COLORS.text, maxLines: 2 });
    if (!app.renderer.xr.isPresenting && y < ui.H - 110) ui.wrap(t('On the desktop you can watch a demo pass; welding needs the headset and controllers.'), PAD, y + 20, ui.W - 2 * PAD, { size: 22, color: COLORS.info, maxLines: 1 });
  }

  drawSetup(ui) {
    const app = this.app;
    const sel = this.sel;
    let y = 120;
    ui.text(t('Process'), PAD, y + 36, { size: 24, color: COLORS.dim });
    ui.segmented('p-proc', 260, y, ui.W - 260 - PAD, 64, PROCESS_LIST.map((p) => ({ value: p.id, label: p.short })), sel.process, (v) => {
      sel.process = v;
      app.main.invalidate();
    }, { size: 24 });
    y += 90;
    ui.text(t('Joint'), PAD, y + 36, { size: 24, color: COLORS.dim });
    const tigSel = sel.process === '141';
    // GTAW coupons are 3.2 mm (1/8 in) sheet: a fillet weld on a T-joint or a bead on plate
    const types = tigSel
      ? [{ value: 'fillet', label: t('Fillet (T-joint), 3.2 mm sheet') }, { value: 'plate', label: t('Bead on plate, 3.2 mm sheet') }]
      : [{ value: 'fillet', label: t('Fillet (T-joint)') }, { value: 'butt', label: t('Butt, V-groove on backing') }, ...(sel.process === '111' ? [{ value: 'pipe', label: t('Pipe, open root') }] : [])];
    if (!types.some((o) => o.value === sel.type)) sel.type = 'fillet';
    ui.segmented('p-type', 260, y, ui.W - 260 - PAD, 64, types, sel.type, (v) => {
      sel.type = v;
      const list = v === 'plate' ? ['PA'] : v === 'pipe' ? [] : POSITION_LIST[v];
      if (v !== 'pipe' && !list.includes(sel.position)) sel.position = v === 'fillet' ? 'PB' : 'PA';
      app.main.invalidate();
    }, { size: 22 });
    y += 90;
    if (sel.type === 'pipe') return this.drawPipeSetup(ui, y);
    ui.text(t('Position'), PAD, y + 36, { size: 24, color: COLORS.dim });
    const posList = sel.type === 'plate' ? ['PA'] : POSITION_LIST[sel.type];
    if (!posList.includes(sel.position)) sel.position = posList[0];
    ui.segmented('p-pos', 260, y, ui.W - 260 - PAD, 84, posList.map((p) => ({ value: p, label: p, sub: POSITIONS[sel.type][p].aws })), sel.position, (v) => {
      sel.position = v;
      app.main.invalidate();
    }, { size: 28 });
    y += 110;
    const smaw = sel.process === '111';
    if (tigSel) {
      // tungsten type (AWS A5.12 class, tip colour) and filler rod; 2.4 mm tungsten and rod (training WPS)
      ui.text(t('Tungsten'), PAD, y + 36, { size: 24, color: COLORS.dim });
      ui.segmented('p-tung', 260, y, ui.W - 260 - PAD, 64, GTAW_CHOICES.tungstens.map((k) => ({ value: k, label: k })), sel.tungsten, (v) => {
        sel.tungsten = v;
        app.main.invalidate();
      }, { size: 21 });
      y += 76;
      ui.text(t('Filler rod'), PAD, y + 36, { size: 24, color: COLORS.dim });
      ui.segmented('p-fill', 260, y, 520, 60, GTAW_CHOICES.fillers.map((k) => ({ value: k, label: k })), sel.filler, (v) => {
        sel.filler = v;
        app.main.invalidate();
      }, { size: 22 });
      const tw = TUNGSTENS[sel.tungsten];
      ui.text(`${tw.iso} · ${t(tw.label)} · ${t(tw.colorName)}`, 800, y + 38, { size: 20, color: tw.dc && !tw.radioactive ? COLORS.dim : COLORS.warn, maxW: ui.W - 800 - PAD });
      y += 76;
    }
    if (smaw) {
      ui.text(t('Electrode'), PAD, y + 36, { size: 24, color: COLORS.dim });
      ui.segmented('p-elec', 260, y, 560, 64, SMAW_CHOICES.electrodes.map((e) => ({ value: e, label: e })), sel.electrode, (v) => {
        sel.electrode = v;
        app.main.invalidate();
      }, { size: 24 });
      ui.segmented('p-dia', 840, y, ui.W - 840 - PAD, 64, SMAW_CHOICES.diameters.map((d) => ({ value: d, label: `Ø ${d}` })), sel.dia, (v) => {
        sel.dia = v;
        app.main.invalidate();
      }, { size: 24 });
      y += 84;
    }
    const joint = tigSel ? gtawJoint(sel.type, sel.position) : makeJoint(sel.type, sel.position);
    const wps = wpsFor(sel.process, joint, smaw ? { electrode: sel.electrode, dia: sel.dia } : tigSel ? { tungsten: sel.tungsten, filler: sel.filler } : {});
    const s = wps.settings;
    ui.rect(PAD, y, ui.W - 2 * PAD, 230, COLORS.bg2, 16, COLORS.line);
    ui.text(`${t('Training WPS')} ${wps.id}`, PAD + 20, y + 42, { size: 26, weight: 700, color: COLORS.accent, maxW: ui.W - 2 * PAD - 40 });
    if (tigSel) {
      ui.text(`${t(PROCESSES[s.process].label)} · ${s.tungsten} Ø ${s.tdia} mm · ${s.filler} Ø ${s.rodDia} mm · ${polarityLabel(s.polarity)} · ${t('Argon')} ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]} L/min`, PAD + 20, y + 82, { size: 21, maxW: ui.W - 2 * PAD - 40 });
      ui.text(`${t('Current')} ${wps.ranges.current[0]}–${wps.ranges.current[1]} A · ${t('Arc length')} ${wps.stickOut[0]}–${wps.stickOut[1]} mm · ${t('Push angle')} 10–20° · ${t('Post-flow')} ≥ ${wps.ranges.postflowMin} s`, PAD + 20, y + 118, { size: 21, maxW: ui.W - 2 * PAD - 40 });
    } else if (smaw) {
      ui.text(`${t(PROCESSES[s.process].label)} · ${s.electrode} Ø ${s.dia} mm (${t(wps.electrode.label)}) · ${polarityLabel(s.polarity)}`, PAD + 20, y + 82, { size: 22, maxW: ui.W - 2 * PAD - 40 });
      ui.text(`${t('Current')} ${wps.ranges.current[0]}–${wps.ranges.current[1]} A · ${t('Arc length')} ${wps.stickOut[0]}–${wps.stickOut[1]} mm · ${t('Drag angle')} ${wps.travelAngle[0]}–${wps.travelAngle[1]}°`, PAD + 20, y + 118, { size: 22, maxW: ui.W - 2 * PAD - 40 });
    } else {
      ui.text(`${t(PROCESSES[s.process].label)} · Ø ${s.wire} mm · ${s.polarity}${PROCESSES[s.process].gasRequired ? ` · Ar + 18% CO2 ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]} L/min` : ''}`, PAD + 20, y + 82, { size: 22, maxW: ui.W - 2 * PAD - 40 });
      ui.text(`${t('Wire feed')} ${wps.ranges.wfs[0].toFixed(1)}–${wps.ranges.wfs[1].toFixed(1)} m/min · ${t('Voltage')} ${wps.ranges.voltage[0].toFixed(1)}–${wps.ranges.voltage[1].toFixed(1)} V · ${t('Stick-out')} ${wps.stickOut[0]}–${wps.stickOut[1]} mm`, PAD + 20, y + 118, { size: 22, maxW: ui.W - 2 * PAD - 40 });
    }
    ui.text(`${t('Passes')}: ${wps.passes.map((p) => `${t(p.kind)} ${p.speed[0].toFixed(1)}–${p.speed[1].toFixed(1)} mm/s`).join(' · ')}${wps.interpassMax ? ` · ${t('interpass max')} ${wps.interpassMax} °C` : ''}`, PAD + 20, y + 154, { size: 20, color: COLORS.dim, maxW: ui.W - 2 * PAD - 40 });
    ui.text(t(wps.note), PAD + 20, y + 196, { size: 18, color: COLORS.faint, maxW: ui.W - 2 * PAD - 40 });
    y += 260;
    ui.button('p-start', PAD, y, 420, 84, t('Start welding'), () => {
      this.loadCoupon({ joint, process: sel.process, seed: Math.floor(Math.random() * 1e6), lane: joint.type === 'plate' ? joint.lanes[0] : null, ...(smaw ? { electrode: sel.electrode, dia: sel.dia } : tigSel ? { tungsten: sel.tungsten, filler: sel.filler } : {}) });
    }, { style: 'primary', size: 30 });
    ui.segmented('p-cues', 480, y + 12, 420, 60, [{ value: true, label: t('Cues on') }, { value: false, label: t('Cues off') }], this.cuesOn, (v) => {
      this.cuesOn = v;
      app.set('cues', v);
    }, { size: 22 });
  }

  // Pipe coupon (SMAW, open root): size, test position, progression, and the pipe WPS pass by pass.
  drawPipeSetup(ui, y) {
    const app = this.app;
    const sel = this.sel;
    const W = ui.W;
    ui.text(t('Pipe'), PAD, y + 36, { size: 24, color: COLORS.dim });
    ui.segmented('p-size', 260, y, W - 260 - PAD, 64, Object.values(PIPE_SIZES).map((p) => ({ value: p.id, label: `NPS ${p.nps} ${p.sch === 'XXS' ? 'XXS' : `Sch ${p.sch}`}`, sub: `Ø ${p.D} × ${p.t} mm` })), sel.pipeSize, (v) => {
      sel.pipeSize = v;
      app.main.invalidate();
    }, { size: 22 });
    y += 84;
    ui.text(t('Position'), PAD, y + 36, { size: 24, color: COLORS.dim });
    const posW = 560;
    ui.segmented('p-ppos', 260, y, posW, 76, Object.keys(PIPE_POSITIONS).map((k) => {
      const p = PIPE_POSITIONS[k];
      return { value: k, label: k, sub: typeof p.iso === 'string' ? p.iso : p.iso[sel.progression] };
    }), sel.pipePos, (v) => {
      sel.pipePos = v;
      app.main.invalidate();
    }, { size: 26 });
    const progs = PIPE_POSITIONS[sel.pipePos].progressions;
    if (progs[0]) {
      ui.segmented('p-prog', 260 + posW + 20, y, W - (260 + posW + 20) - PAD, 76, [{ value: 'up', label: t('Uphill'), sub: t('root to cap') }, { value: 'down', label: t('Downhill'), sub: t('root pass') }], sel.progression, (v) => {
        sel.progression = v;
        app.main.invalidate();
      }, { size: 24 });
    }
    y += 98;
    const prog = progs[0] ? sel.progression : null;
    const joint = jointFor(['pipe', sel.pipePos, { size: sel.pipeSize, progression: prog || undefined, rootOnly: prog === 'down' }]);
    const wps = wpsFor('111', joint);
    const H = 92 + wps.passes.length * 34;
    ui.rect(PAD, y, W - 2 * PAD, H, COLORS.bg2, 16, COLORS.line);
    ui.text(`${t('Training WPS')} ${wps.id}`, PAD + 20, y + 40, { size: 24, weight: 700, color: COLORS.accent, maxW: W - 2 * PAD - 40 });
    ui.text(`${t(jointLabel(joint))} · ${t('single-V, 60°, land')} ${joint.rootFace} mm · ${t('gap')} ${joint.rootGap} mm · ${t('no backing')} · DCEP (+)`, PAD + 20, y + 74, { size: 19, color: COLORS.dim, maxW: W - 2 * PAD - 40 });
    wps.passes.forEach((p, k) => {
      ui.text(`${k + 1}. ${t(p.kind)}: ${p.electrode} Ø ${p.dia} mm · ${p.current[0]}–${p.current[1]} A · ${t('arc length')} ${p.arc[0]}–${p.arc[1]} mm · ${p.speed[0].toFixed(1)}–${p.speed[1].toFixed(1)} mm/s`, PAD + 36, y + 106 + k * 34, { size: 20, maxW: W - 2 * PAD - 60 });
    });
    y += H + 10;
    y = ui.wrap(t(wps.note), PAD, y + 12, W - 2 * PAD, { size: 17, color: COLORS.faint, maxLines: 2 });
    const by = Math.min(ui.H - 100, y + 10);
    ui.button('p-start', PAD, by, 420, 84, t('Start welding'), () => {
      this.loadCoupon({ joint, process: '111', seed: Math.floor(Math.random() * 1e6) });
    }, { style: 'primary', size: 30 });
    ui.segmented('p-cues', 480, by + 12, 420, 60, [{ value: true, label: t('Cues on') }, { value: false, label: t('Cues off') }], this.cuesOn, (v) => {
      this.cuesOn = v;
      app.set('cues', v);
    }, { size: 22 });
  }
}

// ===================================================================================================
// Exercises: the technique drills of the scope (family B) as guided exercises. Each has a brief, a
// pass-by-pass guide (lanes, cleaning, interpass check) and objective criteria. Pass marks are
// seed values for the welding SME to set; the results say so.
const EX_STORE = 'wellexperts.weldvr.exercises';

function loadExProgress() {
  try {
    return JSON.parse(localStorage.getItem(EX_STORE) || '{}') || {};
  } catch {
    return {};
  }
}

function saveExProgress(p) {
  try {
    localStorage.setItem(EX_STORE, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress is kept for this session only */
  }
}

export class ExercisesMode extends WeldingMode {
  constructor(app) {
    super(app);
    this.id = 'exercises';
    this.phase = 'list';
    this.cuesOn = app.settings.cues;
    this.process = '135';
    this.smawSel = { electrode: 'E7018', dia: 3.2 };
    this.progress = loadExProgress();
    this.family = 'plate'; // drill list: plate and sheet, or pipe (scope B6)
  }

  title() {
    if (this.phase === 'list') return t('Exercises: choose a drill');
    return `${this.ex.id} · ${t(this.phase === 'brief' ? this.ex.title : this.ex.short)}`;
  }

  hint() {
    if (this.phase !== 'weld') return '';
    if (this.app.tool === 'thermo') return t('Touch the plate next to the weld with the probe tip and hold it still; the trigger records the reading.');
    if (this.app.tool === 'brush') return t('Brush along the bead to take the slag off. The panel shows how much is still covered.');
    if (this.app.tool === 'hammer') return t('Strike the slag with the chisel end of the hammer, along the whole bead. Safety glasses on.');
    const st = this.app.station;
    if (st.session && st.session.settings.process === '111') return t('Touch the electrode on the joint and lift it to strike. B/Y: helmet. A/X: new electrode. Follow the blue line.');
    return t('Trigger: weld. B/Y: helmet. Follow the blue line and keep up with the pacer.');
  }

  enter() {
    this.app.setTool('gun');
  }

  exit() {
    this.app.coolAccel = 1;
    this.app.setTool('gun');
  }

  brief(ex) {
    this.ex = ex;
    this.family = isPipeDrill(ex) ? 'pipe' : 'plate';
    if (!ex.processes.includes(this.process)) this.process = ex.processes[0];
    this.phase = 'brief';
    this.app.main.invalidate();
  }

  start() {
    const ex = this.ex;
    const joint = exerciseJoint(ex);
    this.loadCoupon({ joint, process: this.process, seed: Math.floor(Math.random() * 1e6), lane: joint.type === 'plate' ? joint.lanes[0] : null, ...(this.process === '111' ? this.smawSel : {}) });
  }

  // Interpass limit of this drill (its own, or the training WPS value for multi-run welds).
  interpassLimit() {
    return this.ex.interpass ?? (this.cfgWps ? this.cfgWps.interpassMax : null) ?? null;
  }

  demoPlanFor() {
    const st = this.app.station;
    const j = st.joint;
    const k = st.record.passes.length - 1;
    const plan = demoPlan(this.ex, j, k, st.session.settings.process, st.session.settings);
    if (j.type === 'plate') plan.aim = this.laneNow();
    return plan;
  }

  // The demonstration follows the procedure: clean the previous run, wait for the interpass
  // temperature and measure it, then weld.
  startDemo() {
    const app = this.app;
    const st = app.station;
    const j = st.joint;
    const rec = st.record;
    const k = rec.passes.length - 1;
    const notes = [];
    if (k > 0) {
      const prev = rec.passes[k - 1];
      if (prev.slagProcess && rec.cleanFraction(k - 1) < 0.95) {
        // SMAW slag is chipped off before it can be brushed (record.chip / brush)
        const lane = j.type === 'plate' ? prev.lane ?? 0 : null;
        if (prev.chipFirst) st.chip(0, j.n - 1, lane);
        st.brush(0, j.n - 1, lane);
        notes.push(t('previous run cleaned'));
      }
      const lim = this.interpassLimit();
      if (lim) {
        const lane = this.laneNow();
        let waited = 0;
        while (waited < 1800 && st.thermal.maxNear(j.tab, j.L - j.tab, 10, lane) > lim) {
          st.coolFor(10);
          waited += 10;
        }
        // reading at the hottest point of the weld line
        let xm = j.L / 2, Tm = -Infinity;
        for (let x = j.tab; x <= j.L - j.tab; x += 5) {
          const T = st.temperatureAt(x, lane, st.surfaceAt(x, lane));
          if (T > Tm) {
            Tm = T;
            xm = x;
          }
        }
        st.recordReading(xm, Tm);
        notes.push(waited ? t('waited {s} s, measured {T} °C', { s: waited, T: Math.round(Tm) }) : t('measured {T} °C', { T: Math.round(Tm) }));
      }
    }
    super.startDemo();
    if (notes.length) app.say(`${t('Demo')}: ${notes.join(', ')}`, 5);
  }

  nextPass() {
    const app = this.app;
    const st = app.station;
    const pi = this.passInfo();
    if (pi.slag && st.record.cleanFraction() < 0.95) app.say(st.session.settings.process === '111' ? t('Chip and brush the slag off this pass first.') : t('Clean the slag off this pass first (wire brush).'));
    const k = st.record.passes.length;
    const lane = st.joint.type === 'plate' ? laneFor(this.ex, st.joint, st.record, k) : null;
    st.newPass(lane);
    this.applyPassSettings();
    this.setCues();
    app.setTool('gun');
    app.main.invalidate();
  }

  onFinished() {
    const st = this.app.station;
    const res = evaluateExercise(this.ex, { rec: st.record, sum: this.R.sum, tech: this.R.tech, readings: st.readings });
    this.R.drill = { ex: this.ex, res, process: st.session.settings.process };
    this.R.tab = 'drill';
    this.R.noCode = st.joint.type === 'plate';
    const prev = this.progress[this.ex.id];
    const score = res.met / Math.max(1, res.total);
    const entry = { met: res.met, total: res.total, process: this.R.drill.process, date: new Date().toISOString().slice(0, 10) };
    this.progress[this.ex.id] = { last: entry, best: !prev || !prev.best || score >= prev.best.met / Math.max(1, prev.best.total) ? entry : prev.best };
    saveExProgress(this.progress);
  }

  draw(ui) {
    if (this.phase === 'list') return this.drawList(ui);
    if (this.phase === 'brief') return this.drawBrief(ui);
    if (this.phase === 'results' || this.phase === 'replay') {
      const app = this.app;
      const idx = EXERCISES.indexOf(this.ex);
      // criteria badge at the right end of the tab row (the tabs are drawn narrower to leave room for it)
      const res = this.R.drill.res;
      const txt = `${res.met} / ${res.total} ${t('criteria')}`;
      const bs = 24;
      const bwid = ui.measure(txt, bs, 700) + bs * 1.1;
      this.drawResultsScreen(ui, [
        { id: 'r-again', label: t('Try again'), go: () => this.start(), style: 'primary' },
        { id: 'r-next', label: t('Next exercise'), go: () => this.brief(EXERCISES[(idx + 1) % EXERCISES.length]) },
      ], { reserve: bwid + 16 });
      ui.badge(ui.W - PAD - bwid, 104 + (58 - bs * 1.55) / 2, txt, res.all ? 'ok' : 'warn', bs);
      void app;
      return;
    }
    return this.drawWeld(ui);
  }

  drawList(ui) {
    const W = ui.W;
    const cw = (W - 2 * PAD - 2 * 16) / 3;
    const rh = 150;
    ui.segmented('ex-family', PAD, 104, 700, 56, [{ value: 'plate', label: t('Plate and sheet') }, { value: 'pipe', label: t('Pipe, open root (B6)') }], this.family, (v) => {
      this.family = v;
      this.app.main.invalidate();
    }, { size: 22 });
    const list = EXERCISES.filter((ex) => (this.family === 'pipe') === isPipeDrill(ex));
    list.forEach((ex, k) => {
      const col = k % 3, row = Math.floor(k / 3);
      const x = PAD + col * (cw + 16), y = 180 + row * rh;
      ui.button(`ex-${ex.id}`, x, y, cw, rh - 14, `${ex.id} · ${t(ex.short)}`, () => this.brief(ex), { size: 26, sub: t(ex.sub) });
      const pr = this.progress[ex.id];
      if (pr && pr.best) {
        const all = pr.best.met === pr.best.total;
        ui.text(`${all ? '✓ ' : ''}${pr.best.met}/${pr.best.total}`, x + cw - 14, y + 30, { size: 19, weight: 700, color: all ? COLORS.ok : COLORS.warn, align: 'end' });
      }
    });
    let y = 180 + Math.ceil(list.length / 3) * rh + 20;
    y = ui.wrap(this.family === 'pipe'
      ? t('Pipe drills (scope B6): the open root uphill and downhill, then root and cap in the 1G, 2G, 5G and 6G test positions, with the pipe WPS electrode for each pass (E6010 root, E7018 cap).')
      : t('Drills from the technique catalogue of the scope (family B): stringer and weave beads, pads, fillet and groove welds in all positions, starts and stops, multi-pass welds with cleaning and interpass control.'), PAD, y, W - 2 * PAD, { size: 21, color: COLORS.dim });
    ui.wrap(t('Each drill is judged on objective criteria. Pass marks are seed values for your welding SME to set; best results are stored on this headset only.'), PAD, y + 6, W - 2 * PAD, { size: 21, color: COLORS.warn });
  }

  drawBrief(ui) {
    const app = this.app;
    const ex = this.ex;
    const W = ui.W;
    let y = 112;
    ui.text(t(ex.sub), PAD, y + 26, { size: 23, color: COLORS.dim, maxW: W - 2 * PAD });
    y = ui.wrap(t(ex.objective), PAD, y + 66, W - 2 * PAD, { size: 24, weight: 600 });
    // process
    ui.text(t('Process'), PAD, y + 40, { size: 22, color: COLORS.dim });
    const procs = PROCESS_LIST.filter((p) => ex.processes.includes(p.id));
    ui.segmented('x-proc', 220, y + 4, Math.min(W - 220 - PAD, procs.length * 300), 56, procs.map((p) => ({ value: p.id, label: p.short })), this.process, (v) => {
      this.process = v;
      app.main.invalidate();
    }, { size: 22 });
    y += 76;
    const smaw = this.process === '111';
    if (isPipeDrill(ex)) return this.drawPipeBrief(ui, ex, y);
    if (smaw) {
      // covered electrodes for the drills (E6010 is kept for the pipe root passes)
      const els = ex.electrodes || ['E7018', 'E6013'];
      if (!els.includes(this.smawSel.electrode)) this.smawSel.electrode = els[0];
      ui.text(t('Electrode'), PAD, y + 36, { size: 22, color: COLORS.dim });
      ui.segmented('x-elec', 220, y, 420, 56, els.map((e) => ({ value: e, label: e })), this.smawSel.electrode, (v) => {
        this.smawSel.electrode = v;
        app.main.invalidate();
      }, { size: 22 });
      ui.segmented('x-dia', 660, y, W - 660 - PAD, 56, SMAW_CHOICES.diameters.map((d) => ({ value: d, label: `Ø ${d}` })), this.smawSel.dia, (v) => {
        this.smawSel.dia = v;
        app.main.invalidate();
      }, { size: 22 });
      y += 72;
    }
    // training WPS
    const joint = exerciseJoint(ex);
    const wps = wpsFor(this.process, joint, smaw ? this.smawSel : {});
    const s = wps.settings;
    ui.rect(PAD, y, W - 2 * PAD, 128, COLORS.bg2, 14, COLORS.line);
    if (smaw) {
      ui.text(`${t('Training WPS')} ${wps.id} · ${s.electrode} Ø ${s.dia} mm · ${polarityLabel(s.polarity)}`, PAD + 18, y + 36, { size: 21, weight: 700, color: COLORS.accent, maxW: W - 2 * PAD - 36 });
      ui.text(`${t('Current')} ${wps.ranges.current[0]}–${wps.ranges.current[1]} A · ${t('Arc length')} ${wps.stickOut[0]}–${wps.stickOut[1]} mm · ${t('Drag angle')} ${wps.travelAngle[0]}–${wps.travelAngle[1]}°`, PAD + 18, y + 72, { size: 20, maxW: W - 2 * PAD - 36 });
    } else {
      ui.text(`${t('Training WPS')} ${wps.id} · ${t(PROCESSES[s.process].label)} · Ø ${s.wire} mm · ${s.polarity}`, PAD + 18, y + 36, { size: 21, weight: 700, color: COLORS.accent, maxW: W - 2 * PAD - 36 });
      ui.text(`${t('Wire feed')} ${wps.ranges.wfs[0].toFixed(1)}–${wps.ranges.wfs[1].toFixed(1)} m/min · ${t('Voltage')} ${wps.ranges.voltage[0].toFixed(1)}–${wps.ranges.voltage[1].toFixed(1)} V${wps.ranges.gasFlow ? ` · ${t('Gas')} ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]} L/min` : ''} · ${t('Stick-out')} ${wps.stickOut[0]}–${wps.stickOut[1]} mm`, PAD + 18, y + 72, { size: 20, maxW: W - 2 * PAD - 36 });
    }
    const ipMax = ex.interpass ?? wps.interpassMax;
    ui.text(`${t('Passes')}: ${ex.passes} · ${t('target speed')} ${wps.passes[0].target.toFixed(1)} mm/s${ipMax ? ` · ${t('interpass max')} ${ipMax} °C` : ''}`, PAD + 18, y + 106, { size: 20, color: COLORS.dim, maxW: W - 2 * PAD - 36 });
    y += 146;
    // steps (process-specific for SMAW)
    const sp = smaw && ex.smaw ? ex.smaw : ex;
    sp.steps.forEach((step, k) => {
      y = ui.wrap(`${k + 1}. ${t(step)}`, PAD, y + 22, W - 2 * PAD, { size: 21 }) - 14;
    });
    y += 20;
    const crit = ex.criteria.map((c) => t(CRITERIA[c] || c)).join(' · ');
    y = ui.wrap(`${t('Judged on')}: ${crit}`, PAD, y + 22, W - 2 * PAD, { size: 20, color: COLORS.info });
    y = ui.wrap(`${t('Sources')}: ${sp.refs.join('; ')}`, PAD, y + 4, W - 2 * PAD, { size: 18, color: COLORS.faint });
    const by = Math.min(ui.H - 160, y + 10);
    ui.button('x-start', PAD, by, 420, 80, t('Start the exercise'), () => this.start(), { style: 'primary', size: 28 });
    ui.button('x-back', PAD + 440, by, 300, 80, t('Back'), () => {
      this.phase = 'list';
      app.main.invalidate();
    }, { size: 26 });
  }

  // Brief of a pipe drill: the pipe WPS pass by pass in place of the electrode choice.
  drawPipeBrief(ui, ex, y) {
    const app = this.app;
    const W = ui.W;
    const joint = exerciseJoint(ex);
    const wps = wpsFor('111', joint);
    const H = 86 + wps.passes.length * 32;
    ui.rect(PAD, y, W - 2 * PAD, H, COLORS.bg2, 14, COLORS.line);
    ui.text(`${t('Training WPS')} ${wps.id} · ${t(jointLabel(joint))}`, PAD + 18, y + 36, { size: 21, weight: 700, color: COLORS.accent, maxW: W - 2 * PAD - 36 });
    ui.text(`${t('single-V, 60°, land')} ${joint.rootFace} mm · ${t('gap')} ${joint.rootGap} mm · ${t('no backing')} · DCEP (+) · ${t('interpass max')} ${wps.interpassMax} °C`, PAD + 18, y + 68, { size: 19, color: COLORS.dim, maxW: W - 2 * PAD - 36 });
    wps.passes.forEach((p, k) => {
      ui.text(`${k + 1}. ${t(p.kind)}: ${p.electrode} Ø ${p.dia} mm · ${p.current[0]}–${p.current[1]} A · ${t('target speed')} ${p.target.toFixed(1)} mm/s`, PAD + 34, y + 98 + k * 32, { size: 19, maxW: W - 2 * PAD - 60 });
    });
    y += H + 8;
    ex.steps.forEach((step, k) => {
      y = ui.wrap(`${k + 1}. ${t(step)}`, PAD, y + 22, W - 2 * PAD, { size: 20 }) - 14;
    });
    y += 16;
    const crit = ex.criteria.map((c) => t(CRITERIA[c] || c)).join(' · ');
    y = ui.wrap(`${t('Judged on')}: ${crit}`, PAD, y + 22, W - 2 * PAD, { size: 19, color: COLORS.info });
    y = ui.wrap(`${t('Sources')}: ${ex.refs.join('; ')}`, PAD, y + 4, W - 2 * PAD, { size: 17, color: COLORS.faint });
    const by = Math.min(ui.H - 100, y + 10);
    ui.button('x-start', PAD, by, 420, 80, t('Start the exercise'), () => this.start(), { style: 'primary', size: 28 });
    ui.button('x-back', PAD + 440, by, 300, 80, t('Back'), () => {
      this.phase = 'list';
      app.main.invalidate();
    }, { size: 26 });
  }

  drawWeld(ui) {
    const app = this.app;
    const st = app.station;
    const ex = this.ex;
    const j = st.joint;
    const W = ui.W;
    const rec = st.record;
    const k = rec.passes.length - 1;
    const pi = this.passInfo();
    const s = st.session.settings;
    const w = st.windows();
    const arcOn = !!(st.lastState && st.lastState.arcOn);
    const demo = this.phase === 'demo';
    // what to weld now
    let what;
    if (j.type === 'plate') {
      const lane = this.laneNow();
      what = ex.laneMode === 'pad' && k > 0
        ? `${t('Bead')} ${k + 1} / ${ex.passes} · ${t('overlap the previous bead by half')}`
        : `${t('Bead')} ${k + 1} / ${ex.passes} · ${t('line at')} ${lane >= 0 ? '+' : ''}${lane.toFixed(0)} mm`;
    } else if (j.type === 'butt') what = `${t('Pass')} ${k + 1} / ${ex.passes} · ${t(pi.kind)}`;
    else what = `${t(POSITIONS[j.type][j.position].label)} · ${t('leg')} ${j.leg} mm`;
    ui.text(what, PAD, 140, { size: 26, weight: 600, maxW: W - 2 * PAD - 380 });
    ui.segmented('cues', W - PAD - 360, 104, 360, 52, [{ value: true, label: t('Cues on') }, { value: false, label: t('Cues off') }], this.cuesOn, (v) => {
      this.cuesOn = v;
      app.set('cues', v);
    }, { size: 21 });
    ui.text(`${t('target speed')} ${w.speedTarget.toFixed(1)} mm/s · ${t('stick-out')} ${w.stickOut[0]}–${w.stickOut[1]} mm · ${t('work angle')} ${w.workAngle[0]}–${w.workAngle[1]}° · ${t('travel angle')} ${w.travelAngle[0]}…${w.travelAngle[1]}°`, PAD, 180, { size: 21, color: COLORS.dim, maxW: W - 2 * PAD });
    ui.text(`${t('Machine')}: ${s.wfs.toFixed(1)} m/min · ${s.voltage.toFixed(1)} V · ${s.polarity}${PROCESSES[s.process].gasRequired ? ` · ${s.gasFlow} L/min` : ''}`, PAD, 212, { size: 21, color: this.inWps(s) ? COLORS.dim : COLORS.warn, maxW: W - 2 * PAD });
    // actions
    const by = 232;
    const bw = (W - 2 * PAD - 3 * 16) / 4;
    const lastPass = k + 1 >= ex.passes;
    ui.button('x-finish', PAD, by, bw, 76, t('Finish and evaluate'), () => this.finish(), { style: lastPass && pi.deposited ? 'primary' : undefined, size: 24, disabled: arcOn || demo });
    ui.button('x-next', PAD + bw + 16, by, bw, 76, j.type === 'plate' ? t('Next bead') : t('Start next pass'), () => this.nextPass(), { style: !lastPass && pi.deposited ? 'primary' : undefined, size: 24, disabled: lastPass || !pi.deposited || arcOn || demo });
    if (app.renderer.xr.isPresenting) {
      ui.button('x-brush', PAD + 2 * (bw + 16), by, bw, 76, app.tool === 'brush' ? t('Back to the gun') : t('Wire brush'), () => app.setTool(app.tool === 'brush' ? 'gun' : 'brush'), { size: 24, selected: app.tool === 'brush' });
    } else {
      ui.button('x-chip', PAD + 2 * (bw + 16), by, bw, 76, t('Chip and brush (instant)'), () => {
        st.cleanAll();
        app.main.invalidate();
      }, { size: 21, disabled: !(pi.slag && pi.deposited) });
    }
    ui.button('x-demo', PAD + 3 * (bw + 16), by, bw, 76, t('Watch a demo pass'), () => this.startDemo(), { size: 24, disabled: demo || pi.deposited });
    let y = by + 104;
    if (j.pipe) y = this.drawPipeRow(ui, by + 88, arcOn) + 20;
    if (pi.slag && pi.deposited) {
      const f = rec.cleanFraction();
      ui.text(`${t('Slag on this pass')}: ${(100 * (1 - f)).toFixed(0)}% ${t('of the length still covered')}`, PAD, y, { size: 22, color: f < 0.95 ? COLORS.warn : COLORS.ok });
    } else if (k > 0 && rec.passes[k - 1].slagProcess && !pi.deposited) {
      const f = rec.cleanFraction(k - 1);
      ui.text(`${t('Previous run')}: ${f >= 0.95 ? t('clean') : `${(100 * (1 - f)).toFixed(0)}% ${t('still covered with slag')}`}`, PAD, y, { size: 22, color: f >= 0.95 ? COLORS.ok : COLORS.warn });
    }
    y = this.drawHeatBox(ui, y + 18, this.interpassLimit());
    // the drill steps
    ui.text(t('What to do'), PAD, y + 22, { size: 22, weight: 700 });
    y += 30;
    ex.steps.forEach((step, n) => {
      if (y < ui.H - 110) y = ui.wrap(`${n + 1}. ${t(step)}`, PAD, y + 20, W - 2 * PAD, { size: 20, color: COLORS.text, maxLines: 2 }) - 14;
    });
  }
}

// ===================================================================================================
export class TroubleshootMode extends WeldingMode {
  constructor(app) {
    super(app);
    this.id = 'troubleshoot';
    this.phase = 'list';
    this.cuesOn = false;
    this.allowDemo = false;
    this.listScroll = 0;
  }

  title() {
    if (this.phase === 'list') return t('Troubleshoot: choose a problem');
    return `${this.sc.id} · ${t(this.sc.title)}`;
  }

  hint() {
    if (this.phase === 'inspect') return t('Squeeze the other hand near the coupon to pick it up. Cut a macro section if the surface looks fine.');
    return '';
  }

  wps() {
    return this.cfgWps || null;
  }

  begin(sc) {
    const app = this.app;
    this.sc = sc;
    this.score = 100;
    this.hints = 0;
    this.wrong = [];
    this.diagnosed = false;
    const joint = jointFor(sc.joint);
    this.cfgWps = wpsFor(sc.process, joint, sc.smaw || sc.gtaw || {});
    this.faultSettings = { ...this.cfgWps.settings, ...(sc.fault.settings || {}) };
    this.equipment = { cylinderEmpty: false, fan: false, screen: false, oily: null, ...(sc.fault.equipment || {}) };
    app.station.load({ joint, settings: { ...this.faultSettings }, equipment: { ...this.equipment }, seed: sc.seed, mirror: app.settings.hand === 'left', prebuilt: sc.preweld, frozen: true });
    app.env.fan.visible = !!this.equipment.fan;
    app.env.screen.visible = false;
    this.phase = 'inspect';
    app.setTool('gun');
    for (const p of [app.machine, app.gasPanel, app.sitePanel, app.main]) p.invalidate();
  }

  onFix() {
    this.app.main.invalidate();
  }

  reweld() {
    const app = this.app;
    // the equipment and machine stay as found (with whatever the trainee corrected so far)
    const eq = { ...app.station.equipment };
    const settings = { ...app.station.session.settings };
    const joint = jointFor(this.sc.joint);
    if (this.sc.fault.equipment && this.sc.fault.equipment.oily && eq.oily) eq.oily = this.sc.fault.equipment.oily;
    this.loadCoupon({ joint, process: this.sc.process, settings, equipment: eq, seed: this.sc.seed + 1000, ...(this.sc.smaw || this.sc.gtaw || {}) });
  }

  onFinished() {
    const sc = this.sc;
    const sum = this.R.sum;
    const mode = sc.internal ? 'full' : 'visual';
    const iso = evaluate(sum, 'iso5817-2023', 'C', { mode });
    const aws = evaluate(sum, 'aws-d11-static', null, { mode: 'visual' });
    const refs = new Set([...iso.findings, ...aws.findings].filter((f) => f.verdict === 'reject').map((f) => f.ref));
    let present = sc.targets.filter((r) => refs.has(r));
    if (sc.targets.includes('602')) {
      const per100 = (sum.spatter.length / sum.joint.L) * 100;
      if (per100 > 40) present.push('602');
    }
    present = [...new Set(present)];
    const state = { equipment: this.app.station.equipment, settings: this.app.station.session.settings, wps: this.cfgWps };
    this.outcome = { fixed: present.length === 0, present, equipmentOk: sc.check(state), iso };
    this.phase = 'outcome';
  }

  draw(ui) {
    const app = this.app;
    const W = ui.W;
    if (this.phase === 'list') {
      const list = TROUBLESHOOT;
      const cw = (W - 2 * PAD - 2 * 16) / 3;
      const rows = Math.ceil(list.length / 3);
      const rh = 132;
      const maxRows = 5;
      const start = clamp(this.listScroll, 0, Math.max(0, rows - maxRows));
      ui.region('ts-scroll', 0, 110, W, maxRows * rh + 20, null, { scroll: (d) => (this.listScroll = clamp(this.listScroll + d, 0, Math.max(0, rows - maxRows))) });
      list.forEach((sc, k) => {
        const col = k % 3, row = Math.floor(k / 3) - start;
        if (row < 0 || row >= maxRows) return;
        ui.button(`ts-${sc.id}`, PAD + col * (cw + 16), 120 + row * rh, cw, rh - 16, `${sc.id} · ${t(sc.title)}`, () => this.begin(sc), { size: 24, sub: `ISO 6520-1: ${sc.iso}` });
      });
      if (rows > maxRows) ui.text(t('Scroll with the thumbstick for more'), PAD, 120 + maxRows * rh + 10, { size: 20, color: COLORS.faint });
      return;
    }
    const sc = this.sc;
    if (this.phase === 'inspect' || this.phase === 'diagnose') {
      let y = 140;
      y = ui.wrap(t('A colleague welded this test piece with the bench as you find it. Inspect the weld, find the cause, put it right and weld a new test piece.'), PAD, y, W - 2 * PAD, { size: 24 });
      y += 10;
      ui.button('ts-section', PAD, y, 360, 66, t('Cut a macro section'), () => app.showSection(app.station.joint.tab + app.station.joint.evalL / 2), { size: 24 });
      ui.button('ts-hint', PAD + 380, y, 300, 66, t('Hint (−15 points)'), () => {
        if (!this.hintShown) {
          this.hints++;
          this.score -= 15;
        }
        this.hintShown = true;
        app.main.invalidate();
      }, { size: 24, disabled: this.hintShown });
      if (this.hintShown) ui.wrap(t(sc.hint), PAD + 700, y + 26, W - PAD - 700 - PAD, { size: 21, color: COLORS.info });
      y += 96;
      ui.text(t('What caused the imperfections?'), PAD, y + 20, { size: 26, weight: 700 });
      y += 40;
      sc.causes.forEach((c, k) => {
        const wrong = this.wrong.includes(c.id);
        ui.button(`cause-${c.id}`, PAD, y + k * 84, W - 2 * PAD, 72, t(c.text), () => {
          if (this.diagnosed) return;
          if (c.correct) {
            this.diagnosed = true;
            app.say(t('Correct. Now put it right and weld a new test piece.'));
          } else if (!wrong) {
            this.wrong.push(c.id);
            this.score -= 25;
            app.say(t('Not the cause. Look again.'));
          }
          app.main.invalidate();
        }, { size: 23, style: this.diagnosed && c.correct ? 'ok' : wrong ? 'bad' : undefined, disabled: this.diagnosed && !c.correct });
      });
      y += sc.causes.length * 84 + 10;
      if (this.diagnosed) {
        y = ui.wrap(`${t('Fix')}: ${t(sc.fixes)}`, PAD, y + 10, W - 2 * PAD, { size: 23, color: COLORS.ok });
        ui.button('ts-reweld', PAD, y + 10, 460, 72, t('Weld a new test piece'), () => this.reweld(), { style: 'primary', size: 26 });
      }
      return;
    }
    if (this.phase === 'weld' || this.phase === 'demo') {
      let y = this.drawWeldControls(ui, 140);
      ui.wrap(`${t('Fix')}: ${t(sc.fixes)}`, PAD, y + 10, W - 2 * PAD, { size: 22, color: COLORS.info });
      return;
    }
    if (this.phase === 'outcome' || this.phase === 'results' || this.phase === 'replay') {
      if (this.phase === 'outcome' || this.showOutcome !== false) {
        const o = this.outcome;
        if (o && this.phase === 'outcome') {
          let y = 150;
          ui.badge(PAD, y - 34, o.fixed ? t('PROBLEM FIXED') : t('NOT FIXED YET'), o.fixed ? 'ok' : 'bad', 30);
          y += 40;
          ui.text(`${t('Diagnosis score')}: ${Math.max(0, this.score)} / 100 (${t('hints')}: ${this.hints}, ${t('wrong answers')}: ${this.wrong.length})`, PAD, y + 20, { size: 24 });
          y += 50;
          if (o.fixed) ui.wrap(t('The imperfection this fault causes is gone from your weld.'), PAD, y + 10, W - 2 * PAD, { size: 24, color: COLORS.ok });
          else ui.wrap(`${t('Still present')}: ${o.present.join(', ')}. ${t(sc.fixes)}`, PAD, y + 10, W - 2 * PAD, { size: 24, color: COLORS.bad });
          y += 70;
          if (!o.equipmentOk) ui.wrap(t('The equipment or machine fault is still there. Check the settings against the WPS.'), PAD, y, W - 2 * PAD, { size: 22, color: COLORS.warn });
          y += 50;
          ui.text(`ISO 5817 C${sc.internal ? ` (${t('incl. internal')})` : ''}: ${o.iso.verdict === 'accept' ? t('ACCEPT') : t('REJECT')}`, PAD, y + 20, { size: 24, weight: 700, color: o.iso.verdict === 'accept' ? COLORS.ok : COLORS.bad });
          const bw = (W - 2 * PAD - 3 * 16) / 4;
          const by = ui.H - 160;
          ui.button('o-details', PAD, by, bw, 70, t('Full results'), () => { this.phase = 'results'; app.main.invalidate(); }, { size: 22 });
          ui.button('o-retry', PAD + bw + 16, by, bw, 70, t('Weld again'), () => this.reweld(), { size: 22 });
          ui.button('o-list', PAD + 2 * (bw + 16), by, bw, 70, t('Other problems'), () => { this.phase = 'list'; app.main.invalidate(); }, { size: 22 });
          const idx = TROUBLESHOOT.indexOf(sc);
          ui.button('o-next', PAD + 3 * (bw + 16), by, bw, 70, t('Next problem'), () => this.begin(TROUBLESHOOT[(idx + 1) % TROUBLESHOOT.length]), { size: 22, style: 'primary' });
          return;
        }
      }
      this.drawResultsScreen(ui, [
        { id: 'r-outcome', label: t('Back to outcome'), go: () => { this.phase = 'outcome'; app.main.invalidate(); } },
        { id: 'r-list', label: t('Other problems'), go: () => { this.phase = 'list'; app.main.invalidate(); } },
      ]);
    }
  }
}

// ===================================================================================================
export class InspectMode {
  constructor(app) {
    this.id = 'inspect';
    this.app = app;
    this.phase = 'list';
  }

  title() {
    if (this.phase === 'list') return t('Inspector lab: choose a coupon');
    return `${this.c.id} · ${t(this.c.title)}`;
  }

  hint() {
    if (this.phase === 'inspect') return t('Gauge hand: touch the weld to read it, trigger records the reading, A/X switches gauge. Other hand: squeeze to pick up the coupon.');
    return '';
  }

  enter() {}

  exit() {
    this.app.setTool('gun');
    this.app.markFinding(null);
  }

  begin(c) {
    const app = this.app;
    this.c = c;
    this.level = c.level;
    const joint = jointFor(c.joint);
    const wps = wpsFor(c.process, joint);
    app.station.load({ joint, settings: { ...wps.settings, ...(c.settings || {}) }, seed: c.seed, mirror: app.settings.hand === 'left', prebuilt: c.passes, frozen: true });
    app.env.fan.visible = false;
    this.truth = inventory(app.station.record);
    this.readings = [];
    this.findings = [];
    this.decision = null;
    this.picker = false;
    this.phase = 'inspect';
    this.deskX = Math.round(joint.evalL / 2);
    this.deskKind = joint.type === 'fillet' ? 'fillet' : 'bridge';
    this.deskU = 0;
    app.setTool(joint.type === 'fillet' ? 'fillet' : 'bridge');
    app.showSection(null);
    for (const p of [app.machine, app.gasPanel, app.sitePanel, app.main]) p.invalidate();
  }

  update(dt) {
    const app = this.app;
    app.weldStep(dt, {});
    const m = app.toolStep(dt);
    app.grabStep(dt);
    const dom = app.input.hands[app.domSide];
    if (this.phase === 'inspect' && app.renderer.xr.isPresenting) {
      if (dom.down.a) app.setTool(app.tool === 'fillet' ? 'bridge' : 'fillet');
      if (m && m.values.length && dom.down.trigger && !dom.consumed && !app.uiHover.dom) this.record(m);
      if (m && m.values.length) {
        const key = `${m.i}:${m.values.map((v) => v.value).join(',')}`;
        if (key !== this.lastKey) {
          this.lastKey = key;
          this.live = m;
          app.main.invalidate();
        }
      }
    }
  }

  record(m) {
    if (!m || !m.values.length) return;
    this.readings.unshift({ s: Math.round(m.sEval), kind: m.kind, values: m.values });
    this.readings = this.readings.slice(0, 8);
    this.app.input.pulse(this.app.domSide, 0.5, 30);
    this.app.say(`${t('Reading recorded')}: x = ${Math.round(m.sEval)} mm`);
    this.app.main.invalidate();
  }

  deskMeasure() {
    const app = this.app;
    const j = app.station.joint;
    const x = this.deskX + j.tab + 0.5;
    const u = this.deskU;
    const v = app.station.surfaceAt(x, u) + 1;
    const m = measure(this.deskKind, app.station.record, [x, u, v]);
    this.live = m;
    if (m) this.record(m);
  }

  draw(ui) {
    const app = this.app;
    const W = ui.W;
    if (this.phase === 'list') {
      INSPECT_COUPONS.forEach((c, k) => {
        const col = k % 2, row = Math.floor(k / 2);
        const cw = (W - 2 * PAD - 16) / 2;
        const pack = PACKS.find((p) => p.id === c.pack);
        ui.button(`ic-${c.id}`, PAD + col * (cw + 16), 130 + row * 150, cw, 134, `${c.id} · ${t(c.title)}`, () => this.begin(c), { size: 26, sub: `${pack.title}${c.level ? ` ${c.level}` : ''}` });
      });
      ui.wrap(t('Each coupon was welded by the simulator with known imperfections. Find them, measure them, then accept or reject the weld to the stated code.'), PAD, 600, W - 2 * PAD, { size: 22, color: COLORS.dim });
      return;
    }
    if (this.phase === 'score') return this.drawScore(ui);
    const c = this.c;
    const pack = PACKS.find((p) => p.id === c.pack);
    let y = 128;
    y = ui.wrap(t(c.brief), PAD, y + 8, W - 2 * PAD, { size: 23 });
    if (c.pack === 'iso5817-2023') {
      ui.text(t('Quality level'), PAD, y + 34, { size: 22, color: COLORS.dim });
      ui.segmented('lvl', 240, y, 360, 54, ['B', 'C', 'D'].map((l) => ({ value: l, label: l })), this.level, (v) => {
        this.level = v;
        app.main.invalidate();
      }, { size: 24 });
      y += 66;
    }
    // tool and live reading
    ui.segmented('tool', PAD, y + 4, 520, 56, [{ value: 'fillet', label: t('Fillet gauge') }, { value: 'bridge', label: t('Bridge gauge') }], app.tool, (v) => {
      app.setTool(v);
      this.deskKind = v;
    }, { size: 22 });
    ui.button('sect', W - PAD - 300, y + 4, 300, 56, t('Macro section'), () => app.showSection(app.station.joint.tab + (this.readings[0] ? this.readings[0].s : app.station.joint.evalL / 2)), { size: 22 });
    y += 76;
    const m = this.live;
    ui.rect(PAD, y, W - 2 * PAD, 96, '#0b1016', 14, COLORS.line);
    if (m && m.values.length) {
      ui.text(`x = ${Math.round(m.sEval)} mm`, PAD + 20, y + 40, { size: 26, weight: 700, color: COLORS.accent });
      ui.text(m.values.map((v) => `${t(v.label)} ${v.value.toFixed(1)} ${v.unit}`).join(' · '), PAD + 20, y + 78, { size: 22, maxW: W - 2 * PAD - 40 });
    } else ui.text(app.renderer.xr.isPresenting ? t('Touch the weld with the gauge to read it.') : t('Desktop: choose a position and press Measure.'), PAD + 20, y + 58, { size: 22, color: COLORS.dim });
    y += 108;
    if (!app.renderer.xr.isPresenting) {
      ui.stepper('dx', PAD, y, 360, 60, null, `x ${this.deskX} mm`, (d) => {
        this.deskX = clamp(this.deskX + d * 5, 0, app.station.joint.evalL);
        app.main.invalidate();
      });
      ui.segmented('du', PAD + 380, y, 360, 60, [{ value: 4, label: t('Toe +') }, { value: 0, label: t('Centre') }, { value: -4, label: t('Toe −') }], this.deskU, (v) => {
        this.deskU = v;
        app.main.invalidate();
      }, { size: 22 });
      ui.button('dmeas', PAD + 760, y, 200, 60, t('Measure'), () => this.deskMeasure(), { size: 24 });
      y += 76;
    }
    // readings
    ui.text(t('Readings'), PAD, y + 26, { size: 22, weight: 700 });
    this.readings.slice(0, 3).forEach((r, k) => {
      ui.text(`x ${r.s} mm: ${r.values.map((v) => `${t(v.label)} ${v.value.toFixed(1)}`).join(', ')}`, PAD + 140, y + 26 + k * 30, { size: 19, color: COLORS.dim, maxW: W - PAD - 160 });
    });
    y += 110;
    // findings
    ui.text(`${t('Findings')} (${this.findings.length})`, PAD, y + 26, { size: 24, weight: 700 });
    ui.button('addf', W - PAD - 340, y - 6, 340, 56, this.picker ? t('Cancel') : t('Add finding at last reading'), () => {
      this.picker = !this.picker;
      app.main.invalidate();
    }, { size: 21, disabled: !this.readings.length });
    y += 44;
    if (this.picker) {
      const r = this.readings[0];
      const cw = (W - 2 * PAD - 3 * 10) / 4;
      FINDING_TYPES.forEach((ft, k) => {
        const col = k % 4, row = Math.floor(k / 4);
        ui.button(`ft-${ft.ref}`, PAD + col * (cw + 10), y + row * 64, cw, 56, `${ft.ref} ${t(ft.name)}`, () => {
          const size = this.sizeFor(ft.ref, r);
          this.findings.push({ ref: ft.ref, name: ft.name, s: r.s, size });
          this.picker = false;
          app.markFinding(r.s + app.station.joint.tab);
          app.main.invalidate();
        }, { size: 17 });
      });
      return;
    }
    this.findings.slice(-4).forEach((f, k) => {
      const idx = this.findings.length - Math.min(4, this.findings.length) + k;
      ui.rect(PAD, y + k * 52, W - 2 * PAD - 120, 46, COLORS.bg2, 10);
      ui.text(`${f.ref} ${t(f.name)} · x ${f.s} mm${f.size != null ? ` · ${f.size.toFixed(1)} mm` : ''}`, PAD + 14, y + k * 52 + 32, { size: 20, maxW: W - 2 * PAD - 150 });
      ui.button(`del${idx}`, W - PAD - 110, y + k * 52, 110, 46, t('Delete'), () => {
        this.findings.splice(idx, 1);
        app.main.invalidate();
      }, { size: 18 });
    });
    // decision
    const dy = ui.H - 160;
    ui.text(`${t('Decision to')} ${pack.title}${this.level ? ` ${this.level}` : ''}`, PAD, dy + 36, { size: 22, color: COLORS.dim, maxW: 420 });
    ui.segmented('dec', 470, dy, 380, 60, [{ value: 'accept', label: t('Accept') }, { value: 'reject', label: t('Reject') }], this.decision, (v) => {
      this.decision = v;
      app.main.invalidate();
    }, { size: 24 });
    ui.button('submit', W - PAD - 340, dy, 340, 60, t('Submit inspection'), () => this.submit(), { style: 'primary', size: 24, disabled: !this.decision });
  }

  sizeFor(ref, r) {
    const pick = (keys) => {
      for (const k of keys) {
        const v = r.values.find((x) => x.key === k);
        if (v) return v.value;
      }
      return null;
    };
    if (ref === '5011' || ref === '5012') return pick(['undercut']);
    if (ref === '502') return pick(['reinf']);
    if (ref === '503') return pick(['convexity']);
    if (ref === '5213' || ref === '5214') return pick(['throat']);
    if (ref === '511') return pick(['reinf']);
    return null;
  }

  submit() {
    const app = this.app;
    const sum = this.truth.sum;
    const verdictRes = evaluate(sum, this.c.pack, this.level, { mode: 'visual' });
    this.result = scoreInspection(this.findings, this.decision, this.truth, verdictRes.verdict);
    this.verdictRes = verdictRes;
    this.phase = 'score';
    app.main.invalidate();
  }

  drawScore(ui) {
    const app = this.app;
    const W = ui.W;
    const r = this.result;
    const v = this.verdictRes;
    let y = 130;
    ui.badge(PAD, y, r.decisionOk ? t('DECISION CORRECT') : t('DECISION WRONG'), r.decisionOk ? 'ok' : 'bad', 28);
    ui.text(`${t('Code verdict')}: ${v.verdict === 'accept' ? t('ACCEPT') : t('REJECT')} (${v.name})`, PAD + 420, y + 34, { size: 24, weight: 700 });
    y += 80;
    ui.text(`${t('Detection')}: ${(r.detection * 100).toFixed(0)}%  ·  ${t('False calls')}: ${r.falseCalls}  ·  ${t('Sizing within tolerance')}: ${r.sizing == null ? '–' : (r.sizing * 100).toFixed(0) + '%'}`, PAD, y + 20, { size: 24 });
    y += 50;
    ui.text(t('Imperfections on this coupon'), PAD, y + 26, { size: 24, weight: 700 });
    y += 40;
    const truth = this.truth.items;
    const found = new Set(r.results.filter((x) => x.match).map((x) => x.match));
    truth.slice(0, 7).forEach((it, k) => {
      const ok = found.has(it);
      ui.rect(PAD, y + k * 54, W - 2 * PAD, 48, COLORS.bg2, 10, ok ? '#1f4a33' : '#5a2320');
      ui.text(`${it.ref} ${t(it.name)} · ${Math.round(it.s0)}–${Math.round(it.s1)} mm${it.size != null ? ` · ${it.size.toFixed(1)} ${it.unit}` : ''}`, PAD + 14, y + k * 54 + 33, { size: 20, maxW: W - 2 * PAD - 220 });
      ui.text(ok ? t('found') : t('missed'), W - PAD - 20, y + k * 54 + 33, { size: 20, weight: 700, color: ok ? COLORS.ok : COLORS.bad, align: 'end' });
    });
    if (!truth.length) ui.text(t('No visible imperfections above the detection thresholds.'), PAD, y + 30, { size: 22, color: COLORS.dim });
    y += Math.min(7, truth.length) * 54 + 16;
    const rej = v.findings.filter((f) => f.verdict === 'reject');
    if (rej.length) ui.text(`${t('Deciding clause')}: ${rej[0].clause} — ${t(rej[0].name)} (${t('measured')} ${typeof rej[0].measured === 'number' ? rej[0].measured.toFixed(2) : rej[0].measured} ${rej[0].unit}, ${t('limit')} ${rej[0].limitText})`, PAD, y + 20, { size: 19, color: COLORS.dim, maxW: W - 2 * PAD });
    const by = ui.H - 150;
    const bw = (W - 2 * PAD - 2 * 16) / 3;
    ui.button('s-retry', PAD, by, bw, 66, t('Inspect again'), () => this.begin(this.c), { size: 22 });
    const idx = INSPECT_COUPONS.indexOf(this.c);
    ui.button('s-next', PAD + bw + 16, by, bw, 66, t('Next coupon'), () => this.begin(INSPECT_COUPONS[(idx + 1) % INSPECT_COUPONS.length]), { size: 22, style: 'primary' });
    ui.button('s-list', PAD + 2 * (bw + 16), by, bw, 66, t('All coupons'), () => { this.phase = 'list'; app.main.invalidate(); }, { size: 22 });
  }
}

// ===================================================================================================
// Tracking lab: static jitter, tracking loss and frame timing, against the proposed Phase 0 gate.
export class TrackingMode {
  constructor(app) {
    this.id = 'tracking';
    this.app = app;
    this.phase = 'intro';
    this.results = this.load();
  }

  title() {
    return t('Tracking lab');
  }

  hint() {
    return t('Proposed thresholds from the scope (to be confirmed by your welding SME before testing).');
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem('wellexperts.weldvr.tracking') || '[]');
    } catch {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem('wellexperts.weldvr.tracking', JSON.stringify(this.results.slice(-20)));
    } catch {
      /* ignore */
    }
  }

  start(kind) {
    this.phase = kind;
    this.t = -3; // countdown
    this.samples = [];
    this.loss = { frames: 0, events: [], cur: 0, emulated: 0, noPose: 0 };
    this.frames = [];
    this.app.setTool('gun');
    this.app.main.invalidate();
  }

  update(dt) {
    const app = this.app;
    app.weldStep(dt, { lockTrigger: true });
    if (this.phase !== 'static' && this.phase !== 'motion') return;
    const prev = Math.ceil(-this.t);
    this.t += dt;
    if (Math.ceil(-this.t) !== prev) app.main.invalidate();
    if (this.t < 0) return;
    const dom = app.input.hands[app.domSide];
    const fdt = app.trackSample ? app.trackSample.dt : dt;
    this.frames.push(fdt);
    // A frame counts as lost when there is no pose, or when the runtime reports the position as
    // estimated (emulatedPosition, orientation-only tracking). Both are reported separately too.
    const lost = !(dom.connected && dom.tracked) || dom.emulated;
    if (dom.connected && dom.tracked) {
      app.gun.group.updateWorldMatrix(true, false);
      const p = app.gun.tipLocal.clone().applyMatrix4(app.gun.group.matrixWorld);
      const a = app.gun.axisLocal.clone().transformDirection(app.gun.group.matrixWorld);
      this.samples.push([p.x, p.y, p.z, a.x, a.y, a.z]);
      if (dom.emulated) this.loss.emulated++;
    } else this.loss.noPose++;
    if (lost) {
      this.loss.frames++;
      this.loss.cur += fdt;
    } else if (this.loss.cur > 0) {
      this.loss.events.push(this.loss.cur);
      this.loss.cur = 0;
    }
    const dur = this.phase === 'static' ? 5 : 15;
    if (this.t >= dur) this.finish();
  }

  finish() {
    if (this.loss.cur > 0) this.loss.events.push(this.loss.cur);
    const S = this.samples;
    const res = { kind: this.phase, date: new Date().toISOString(), n: S.length };
    if (S.length > 10) {
      const mean = [0, 0, 0, 0, 0, 0];
      for (const s of S) for (let k = 0; k < 6; k++) mean[k] += s[k] / S.length;
      let pe = 0, ae = 0;
      const ml = Math.hypot(mean[3], mean[4], mean[5]);
      for (const s of S) {
        pe += (s[0] - mean[0]) ** 2 + (s[1] - mean[1]) ** 2 + (s[2] - mean[2]) ** 2;
        const dot = (s[3] * mean[3] + s[4] * mean[4] + s[5] * mean[5]) / ml;
        ae += Math.acos(clamp(dot, -1, 1)) ** 2;
      }
      res.posRMSmm = Math.sqrt(pe / S.length) * 1000;
      res.angRMSdeg = (Math.sqrt(ae / S.length) * 180) / Math.PI;
    }
    const F = this.frames;
    const total = F.reduce((a, b) => a + b, 0);
    res.fps = F.length / Math.max(total, 1e-6);
    const budget = 1 / (this.app.targetFps || 72);
    res.overBudget = F.filter((x) => x > budget * 1.5).length / Math.max(1, F.length);
    res.worstFrameMs = Math.max(0, ...F) * 1000;
    res.lossEvents = this.loss.events.length;
    res.longestLossMs = Math.max(0, ...this.loss.events) * 1000;
    res.emulatedShare = this.loss.emulated / Math.max(1, F.length);
    res.noPoseFrames = this.loss.noPose;
    res.targetFps = this.app.targetFps || null;
    this.results.push(res);
    this.save();
    this.last = res;
    this.phase = 'report';
    this.app.main.invalidate();
  }

  draw(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 130;
    if (this.phase === 'intro' || this.phase === 'report') {
      y = ui.wrap(t('Static test: rest the gun on the bench (or a fixture) and do not touch it for 5 seconds. Motion test: make welding-like passes along the coupon for 15 seconds in the position you want to check.'), PAD, y, W - 2 * PAD, { size: 23 });
      ui.button('tr-static', PAD, y + 10, 400, 76, t('Start static test'), () => this.start('static'), { style: 'primary', size: 26, disabled: !app.renderer.xr.isPresenting });
      ui.button('tr-motion', PAD + 420, y + 10, 400, 76, t('Start motion test'), () => this.start('motion'), { size: 26, disabled: !app.renderer.xr.isPresenting });
      y += 120;
      const rows = [
        [t('Position jitter at rest (RMS)'), '≤ 0.5 mm', (r) => (r.posRMSmm != null ? `${r.posRMSmm.toFixed(2)} mm` : '–'), (r) => r.kind === 'static' && r.posRMSmm != null && r.posRMSmm <= 0.5],
        [t('Angle jitter at rest (RMS)'), t('report'), (r) => (r.angRMSdeg != null ? `${r.angRMSdeg.toFixed(2)}°` : '–'), () => true],
        [t('Longest tracking loss'), '≤ 100 ms', (r) => `${r.longestLossMs.toFixed(0)} ms (${r.lossEvents})`, (r) => r.longestLossMs <= 100],
        [t('Frames with estimated position'), t('report'), (r) => (r.emulatedShare != null ? `${(r.emulatedShare * 100).toFixed(1)}% · ${t('no pose')} ${r.noPoseFrames}` : '–'), () => true],
        [t('Frame rate'), '≥ 72 FPS', (r) => `${r.fps.toFixed(1)} FPS · ${(r.overBudget * 100).toFixed(1)}% ${t('late frames')}`, (r) => r.fps >= 71],
      ];
      const r = this.last || this.results[this.results.length - 1];
      ui.text(r ? `${t('Last result')} (${t(r.kind === 'static' ? 'static' : 'motion')}, ${r.date.slice(0, 16).replace('T', ' ')})` : t('No results yet.'), PAD, y + 20, { size: 24, weight: 700 });
      y += 40;
      rows.forEach((row, k) => {
        const yy = y + k * 76;
        const ok = r ? row[3](r) : null;
        ui.rect(PAD, yy, W - 2 * PAD, 64, COLORS.bg2, 12, ok == null ? COLORS.line : ok ? '#1f4a33' : '#5a2320');
        ui.text(row[0], PAD + 18, yy + 41, { size: 22, maxW: 480 });
        ui.text(`${t('gate')} ${row[1]}`, PAD + 520, yy + 41, { size: 20, color: COLORS.dim });
        ui.text(r ? row[2](r) : '–', W - PAD - 18, yy + 41, { size: 22, weight: 700, align: 'end' });
      });
      y += rows.length * 76 + 10;
      ui.wrap(t('Angle error and position error against a physical coupon need a reference jig and are measured in Phase 0. Results are stored on this headset only.'), PAD, y, W - 2 * PAD, { size: 19, color: COLORS.faint });
      if (!app.renderer.xr.isPresenting) ui.wrap(t('Enter VR to run the tests.'), PAD, y + 60, W - 2 * PAD, { size: 22, color: COLORS.info });
      return;
    }
    const left = this.t < 0 ? Math.ceil(-this.t) : null;
    ui.text(left ? `${t('Starting in')} ${left}…` : `${t('Recording')} ${this.t.toFixed(1)} s`, PAD, y + 60, { size: 48, weight: 700, color: left ? COLORS.warn : COLORS.ok });
    ui.wrap(this.phase === 'static' ? t('Keep the gun completely still.') : t('Make welding-like passes along the coupon.'), PAD, y + 120, W - 2 * PAD, { size: 26 });
  }
}

// ===================================================================================================
export class SettingsMode {
  constructor(app) {
    this.id = 'settings';
    this.app = app;
  }

  title() {
    return t('Settings');
  }

  update(dt) {
    this.app.weldStep(dt, {});
  }

  draw(ui) {
    screens.drawSettings(ui, this.app, 110);
  }
}

export class AboutMode {
  constructor(app) {
    this.id = 'about';
    this.app = app;
  }

  title() {
    return t('About');
  }

  update(dt) {
    this.app.weldStep(dt, {});
  }

  draw(ui) {
    screens.drawAbout(ui, this.app, 100);
  }
}

export { num, THREE };
