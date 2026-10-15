// Panel content: frame/header, machine, gas cylinder, site equipment, macro section, results,
// settings and about screens. Modes call these from their draw functions.

import { COLORS } from './ui.js';
import { t, isRTL, num } from './i18n.js';
import { PACKS, evaluate, PROVENANCE } from '../sim/rules/packs.js';
import { drawSection as paintSection } from '../render/section.js';
import { inRange } from '../scenarios.js';
import { PROCESSES, GASES, SETTING_LIMITS, arcState, nominalCTWD } from '../sim/process.js';
import { ELECTRODES } from '../sim/smaw.js';
import { TUNGSTENS, FILLERS, postflowFor } from '../sim/gtaw.js';
import { clamp } from '../sim/util.js';
import { wrapIndex, clockAt } from '../sim/pipe.js';
import { drawSafetyResults, shadeAssessment as shadeAssess } from './safetyScreens.js';

export const W = 1280;
const PAD = 36;

// ---- frame -----------------------------------------------------------------------------------------
export function drawFrame(ui, app, body) {
  const W = ui.W, H = ui.H;
  ui.background();
  ui.rect(0, 0, W, 92, COLORS.bg2, 0);
  ui.rect(0, 90, W, 3, COLORS.accent, 0);
  ui.text('WELL EXPERTS', PAD, 36, { size: 22, weight: 700, color: COLORS.accent });
  ui.text(app.mode.title ? app.mode.title() : '', PAD, 76, { size: 34, weight: 700, maxW: W - 520 });
  ui.button('lang', W - 330, 20, 150, 54, isRTL() ? 'English' : 'العربية', () => app.set('lang', isRTL() ? 'en' : 'ar'), { size: 26 });
  if (!app.mode.isHome) ui.button('home', W - 168, 20, 136, 54, t('Menu'), () => app.goHome(), { size: 26 });
  body();
  const hint = app.mode.hint ? app.mode.hint() : '';
  if (hint) {
    ui.line(PAD, H - 64, W - PAD, H - 64, COLORS.line, 2);
    ui.text(hint, PAD, H - 26, { size: 22, color: COLORS.dim, maxW: W - 2 * PAD });
  }
}

export function drawToast(ui, app) {
  if (!app.toastMsg) return;
  ui.rect(4, 4, ui.W - 8, ui.H - 8, 'rgba(12,16,22,0.9)', 28, COLORS.accent, 3);
  ui.wrap(app.toastMsg, 28, 54, ui.W - 56, { size: 32, weight: 600, maxLines: 2, lineHeight: 42 });
}

// ---- machine panel (on the power source) -------------------------------------------------------------
export function drawMachine(ui, app) {
  const st = app.station;
  ui.background('rgba(16,20,26,0.96)', 22);
  if (!st.session) {
    ui.text(t('Power source'), 24, 52, { size: 30, weight: 700 });
    return;
  }
  const s = st.session.settings;
  const p = PROCESSES[s.process];
  const wps = app.mode.wps ? app.mode.wps() : null;
  const locked = app.mode.settingsLocked ? app.mode.settingsLocked() : false;
  if (s.process === '111') return drawMachineSMAW(ui, app, s, wps, locked);
  if (s.process === '141') return drawMachineTIG(ui, app, s, wps, locked);
  ui.text(t(p.label), 24, 46, { size: 26, weight: 700, maxW: 600 });
  ui.text(`Ø ${s.wire} mm · ${GASES[s.gas] ? t(GASES[s.gas].label) : s.gas}`, 24, 80, { size: 22, color: COLORS.dim });
  // live readouts
  const ls = st.lastState;
  const arc = ls && ls.arc;
  const est = arc || arcState(s, nominalCTWD(s.process, s), 5, { gasAvailable: true });
  ui.rect(24, 98, 290, 108, '#0b0f0c', 12, '#203a28');
  ui.rect(326, 98, 290, 108, '#0b0f0c', 12, '#203a28');
  ui.text(arc ? num(arc.I, 0) : num(est.I, 0), 300, 178, { size: 64, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('A', 36, 132, { size: 22, color: COLORS.dim });
  ui.text(num(arc ? arc.U : s.voltage, 1), 602, 178, { size: 64, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('V', 338, 132, { size: 22, color: COLORS.dim });
  ui.text(arc ? t(modeName(arc.mode)) : t('estimate at nominal stick-out'), 24, 236, { size: 22, color: COLORS.dim });
  // settings
  const warnW = wps && !inRange(s.wfs, wps.ranges.wfs);
  const warnV = wps && !inRange(s.voltage, wps.ranges.voltage);
  const step = (k, d, lim) => {
    let v = Math.round((s[k] + d * lim[2]) * 10) / 10;
    v = clamp(v, lim[0], lim[1]);
    if (locked && wps) v = clamp(v, wps.ranges[k][0], wps.ranges[k][1]);
    app.station.setSettings({ [k]: v });
    app.machine.invalidate();
    app.main.invalidate();
  };
  ui.stepper('wfs', 24, 256, 592, 92, `${t('Wire feed speed')} (m/min)${wps ? `  WPS ${wps.ranges.wfs[0].toFixed(1)}–${wps.ranges.wfs[1].toFixed(1)}` : ''}`, s.wfs.toFixed(1), (d) => step('wfs', d, SETTING_LIMITS.wfs), { warn: warnW });
  ui.stepper('volt', 24, 358, 592, 92, `${t('Voltage')} (V)${wps ? `  WPS ${wps.ranges.voltage[0].toFixed(1)}–${wps.ranges.voltage[1].toFixed(1)}` : ''}`, s.voltage.toFixed(1), (d) => step('voltage', d, SETTING_LIMITS.voltage), { warn: warnV });
  ui.text(t('Polarity'), 24, 494, { size: 22, color: COLORS.dim });
  ui.segmented('pol', 150, 462, 466, 54, [{ value: 'DCEP', label: 'DCEP (+)' }, { value: 'DCEN', label: 'DCEN (−)' }], s.polarity, (v) => {
    if (locked) return;
    app.station.setSettings({ polarity: v });
    app.machine.invalidate();
  }, { size: 24 });
  if (locked) ui.text(t('Test: settings limited to the WPS ranges'), 24, 560, { size: 20, color: COLORS.warn });
  else if (warnW || warnV) ui.text(t('Outside the WPS range'), 24, 560, { size: 22, color: COLORS.warn, weight: 600 });
  else if (wps) ui.text(t('Inside the WPS range'), 24, 560, { size: 22, color: COLORS.ok });
}

// SMAW: a constant-current ("drooping") power source (TWI Job Knowledge 14): the trainee sets the
// current and the polarity; the arc voltage follows the arc length.
function drawMachineSMAW(ui, app, s, wps, locked) {
  const st = app.station;
  const e = ELECTRODES[s.electrode];
  ui.text(t('MMA power source, constant current'), 24, 46, { size: 26, weight: 700, maxW: 600 });
  ui.text(`${s.electrode} Ø ${s.dia} mm · ${t(e.label)}`, 24, 80, { size: 22, color: COLORS.dim, maxW: 592 });
  const ls = st.lastState;
  const arc = ls && ls.arcOn ? ls.arc : null;
  ui.rect(24, 98, 290, 108, '#0b0f0c', 12, '#203a28');
  ui.rect(326, 98, 290, 108, '#0b0f0c', 12, '#203a28');
  ui.text(num(arc ? arc.I : s.current, 0), 300, 178, { size: 64, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('A', 36, 132, { size: 22, color: COLORS.dim });
  ui.text(arc ? num(arc.U, 1) : '– –', 602, 178, { size: 64, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('V', 338, 132, { size: 22, color: COLORS.dim });
  ui.text(arc ? t('Arc burning: the voltage follows the arc length') : t('Preset current (arc off)'), 24, 236, { size: 22, color: COLORS.dim, maxW: 592 });
  const cr = wps && wps.ranges.current;
  const warnI = cr && !inRange(s.current, cr);
  ui.stepper('current', 24, 256, 592, 92, `${t('Welding current')} (A)${cr ? `  WPS ${cr[0]}–${cr[1]}` : ''}`, `${s.current}`, (d) => {
    const lim = SETTING_LIMITS.current;
    let v = clamp(s.current + d * lim[2], lim[0], lim[1]);
    if (locked && cr) v = clamp(v, cr[0], cr[1]);
    st.setSettings({ current: v });
    app.machine.invalidate();
    app.main.invalidate();
  }, { warn: warnI });
  ui.text(t('Polarity'), 24, 400, { size: 22, color: COLORS.dim });
  ui.segmented('pol', 150, 368, 466, 54, [{ value: 'AC', label: 'AC' }, { value: 'DCEP', label: 'DCEP (+)' }, { value: 'DCEN', label: 'DCEN (−)' }], s.polarity, (v) => {
    if (locked) return;
    st.setSettings({ polarity: v });
    app.machine.invalidate();
    app.main.invalidate();
  }, { size: 22 });
  ui.text(`${t('Electrode data sheet')}: ${e.polarities.join(' / ')}`, 24, 456, { size: 20, color: e.polarities.includes(s.polarity) ? COLORS.dim : COLORS.warn, maxW: 592 });
  const warnP = wps && s.polarity !== wps.ranges.polarity;
  if (locked) ui.text(t('Test: settings limited to the WPS ranges'), 24, 560, { size: 20, color: COLORS.warn });
  else if (warnI || warnP) ui.text(t('Outside the WPS range'), 24, 560, { size: 22, color: COLORS.warn, weight: 600 });
  else if (wps) ui.text(t('Inside the WPS range'), 24, 560, { size: 22, color: COLORS.ok });
}

// GTAW: a DC constant-current source with HF or lift-arc starting and a post-flow timer; the torch's
// fingertip amperage control sets the share of the preset current (Miller OM-215994).
function drawMachineTIG(ui, app, s, wps, locked) {
  const st = app.station;
  const tw = TUNGSTENS[s.tungsten] || TUNGSTENS['EWCe-2'];
  ui.text(t('TIG power source, DC constant current'), 24, 46, { size: 26, weight: 700, maxW: 600 });
  ui.text(`${s.tungsten} Ø ${s.tdia} mm (${tw.iso}, ${t(tw.colorName)}) · ${s.filler} Ø ${s.rodDia} mm`, 24, 80, { size: 21, color: tw.dc ? COLORS.dim : COLORS.warn, maxW: 592 });
  const ls = st.lastState;
  const arc = ls && ls.arcOn ? ls.arc : null;
  const T = st.tig;
  ui.rect(24, 96, 290, 100, '#0b0f0c', 12, '#203a28');
  ui.rect(326, 96, 290, 100, '#0b0f0c', 12, '#203a28');
  ui.text(num(arc ? arc.I : s.current, 0), 300, 170, { size: 60, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('A', 36, 128, { size: 22, color: COLORS.dim });
  ui.text(arc ? num(arc.U, 1) : '– –', 602, 170, { size: 60, weight: 700, color: arc ? '#7dff9a' : '#3f7a52', align: 'end' });
  ui.text('V', 338, 128, { size: 22, color: COLORS.dim });
  const pf = T && T.postflow && !arc ? Math.max(0, T.postflow.D - T.postflow.t) : null;
  ui.text(arc ? t('Arc burning: amperage control at {p}%', { p: Math.round(100 * (T ? T.pedal : 1)) }) : pf != null && pf > 0 ? t('Post-flow: {s} s', { s: Math.ceil(pf) }) : t('Preset current (arc off)'), 24, 226, { size: 21, color: COLORS.dim, maxW: 592 });
  const cr = wps && wps.ranges.current;
  const warnI = cr && !inRange(s.current, cr);
  ui.stepper('current', 24, 242, 592, 80, `${t('Welding current')} (A)${cr ? `  WPS ${cr[0]}–${cr[1]}` : ''}`, `${s.current}`, (d) => {
    const lim = SETTING_LIMITS.current;
    let v = clamp(s.current + d * lim[2], lim[0], lim[1]);
    if (locked && cr) v = clamp(v, cr[0], cr[1]);
    st.setSettings({ current: v });
    app.machine.invalidate();
    app.main.invalidate();
  }, { warn: warnI });
  ui.text(t('Polarity'), 24, 366, { size: 21, color: COLORS.dim });
  ui.segmented('pol', 170, 336, 446, 48, [{ value: 'DCEN', label: 'DCEN (−)' }, { value: 'DCEP', label: 'DCEP (+)' }], s.polarity, (v) => {
    if (locked) return;
    st.setSettings({ polarity: v });
    app.machine.invalidate();
    app.main.invalidate();
  }, { size: 21 });
  ui.text(t('Arc start'), 24, 424, { size: 21, color: COLORS.dim });
  ui.segmented('start', 170, 394, 446, 48, [{ value: 'HF', label: t('HF (no touch)') }, { value: 'lift', label: t('Lift-arc') }], s.startMode, (v) => {
    if (locked || (ls && ls.arcOn)) return;
    st.setSettings({ startMode: v });
    app.machine.invalidate();
  }, { size: 21 });
  const need = postflowFor(s.current);
  const warnP = (s.postflow ?? 0) < need;
  ui.stepper('postflow', 24, 452, 592, 74, `${t('Post-flow')} (s)  ${t('at least')} ${Math.ceil(need)}`, `${s.postflow ?? 0}`, (d) => {
    st.setSettings({ postflow: clamp((s.postflow ?? 0) + d, 0, 30) });
    app.machine.invalidate();
    app.main.invalidate();
  }, { warn: warnP });
  const warnPol = wps && s.polarity !== wps.ranges.polarity;
  if (locked) ui.text(t('Test: settings limited to the WPS ranges'), 24, 566, { size: 20, color: COLORS.warn });
  else if (warnI || warnPol || warnP) ui.text(t('Outside the WPS range'), 24, 566, { size: 22, color: COLORS.warn, weight: 600 });
  else if (wps) ui.text(t('Inside the WPS range'), 24, 566, { size: 22, color: COLORS.ok });
}

export function modeName(m) {
  return { short: 'Short-circuit transfer', globular: 'Globular transfer', spray: 'Spray / continuous transfer', smaw: 'Covered electrode arc' }[m] || m;
}

// ---- gas cylinder / flowmeter ----------------------------------------------------------------------
export function drawGas(ui, app) {
  const st = app.station;
  ui.background('rgba(16,20,26,0.96)', 20);
  if (!st.session) return;
  const s = st.session.settings;
  const p = PROCESSES[s.process];
  if (s.process === '111') return drawElectrodeSupply(ui, app, s);
  ui.text(t('Shielding gas'), 22, 44, { size: 28, weight: 700 });
  if (!p.gasRequired) {
    const msg = s.process === '111'
      ? 'Covered electrode: the coating melts to form the gas and slag that shield the arc and the pool. No shielding gas is used; the cylinder valve is closed.'
      : 'Self-shielded wire: no shielding gas needed. The cylinder valve is closed.';
    ui.wrap(t(msg), 22, 92, 468, { size: 22, color: COLORS.dim });
    return;
  }
  const empty = st.equipment.cylinderEmpty;
  ui.text(GASES[s.gas] ? t(GASES[s.gas].label) : s.gas, 22, 80, { size: 22, color: COLORS.dim });
  ui.text(t('Cylinder contents'), 22, 124, { size: 22, color: COLORS.dim });
  ui.badge(260, 98, empty ? t('EMPTY') : t('OK'), empty ? 'bad' : 'ok', 22);
  const wps = app.mode.wps ? app.mode.wps() : null;
  const warn = wps && wps.ranges.gasFlow && !inRange(s.gasFlow, wps.ranges.gasFlow);
  ui.stepper('flow', 22, 150, 468, 96, `${t('Flow')} (L/min)${wps && wps.ranges.gasFlow ? `  WPS ${wps.ranges.gasFlow[0]}–${wps.ranges.gasFlow[1]}` : ''}`, `${s.gasFlow.toFixed(0)}`, (d) => {
    st.setSettings({ gasFlow: clamp(s.gasFlow + d, 0, 30) });
    app.gasPanel.invalidate();
  }, { warn });
  if (empty) {
    ui.button('replace', 22, 268, 468, 70, t('Replace cylinder'), () => {
      st.setEquipment({ cylinderEmpty: false });
      app.say(t('Cylinder replaced. Check the flow before you weld.'));
      app.gasPanel.invalidate();
      app.mode.onFix?.('cylinder');
    }, { style: 'primary' });
  } else if (s.process === '141') ui.wrap(t('Argon flows from the pre-flow when the torch switch is pressed, during the weld and through the post-flow after the arc.'), 22, 262, 468, { size: 20, color: COLORS.dim });
  else ui.wrap(t('Gas flows while the trigger is held.'), 22, 300, 468, { size: 22, color: COLORS.dim });
}

// ---- SMAW electrode supply (on the gas panel: SMAW uses no shielding gas) ----------------------------------
// Storage by coating type: basic (E7018) in a holding oven at 120-150 C (Lincoln MC22-140; exposure limit
// 9 h for E7018 H4R, Hobart 718); rutile (E6013) dry at 20-40 C below 50% RH or a holding oven at 38-49 C
// (Hobart 447A); cellulosic (E6010) at room temperature, not re-baked (Lincoln MC22-140, Hobart 610).
const STORAGE_TEXT = {
  oven: 'Low-hydrogen: keep in a holding oven at 120–150 °C (Lincoln MC22-140); exposure limit 9 h for E7018 H4R (Hobart 718).',
  warm: 'Rutile: store dry at 20–40 °C below 50% relative humidity, or in a holding oven at 38–49 °C (Hobart 447A).',
  room: 'Cellulosic: store at room temperature; do not re-bake (Lincoln MC22-140, Hobart 610).',
};
const CONDITION_TEXT = {
  dry: 'Dry, stored as specified',
  exposed: 'Exposed: open box on the bench',
  wet: 'Wet electrodes',
};

function drawElectrodeSupply(ui, app, s) {
  const st = app.station;
  const e = ELECTRODES[s.electrode];
  const cond = s.condition || 'dry';
  ui.text(t('Electrodes'), 22, 44, { size: 28, weight: 700 });
  ui.text(`${s.electrode} Ø ${s.dia} mm · ${t(e.label)}`, 22, 80, { size: 21, color: COLORS.dim, maxW: 468 });
  ui.badge(22, 98, t(CONDITION_TEXT[cond]), cond === 'dry' ? 'ok' : 'bad', 20);
  let y = ui.wrap(t(STORAGE_TEXT[e.storage] || ''), 22, 168, 468, { size: 19, color: COLORS.dim });
  if (cond !== 'dry') {
    const label = e.storage === 'room' ? 'Replace them with electrodes stored as the data sheet says' : 'Take electrodes from the holding oven';
    ui.button('el-dry', 22, y + 8, 468, 70, t(label), () => {
      if (st.lastState && st.lastState.arcOn) return;
      st.setSettings({ condition: 'dry' });
      app.changeElectrode();
      app.gasPanel.invalidate();
      app.mode.onFix?.('electrodes');
    }, { style: 'primary', size: 20 });
  } else ui.wrap(t('Covered electrode: the coating melts to form the gas and slag that shield the arc and the pool. No shielding gas is used.'), 22, y + 10, 468, { size: 18, color: COLORS.faint });
}

// ---- site equipment (fan, screen, joint cleaning) ---------------------------------------------------------
export function drawSite(ui, app) {
  const st = app.station;
  ui.background('rgba(16,20,26,0.96)', 20);
  ui.text(t('Work area'), 22, 44, { size: 28, weight: 700 });
  if (!st.session) return;
  const eq = st.equipment;
  ui.text(t('Fan'), 22, 104, { size: 24, color: COLORS.dim });
  ui.segmented('fan', 200, 70, 290, 54, [{ value: true, label: t('On') }, { value: false, label: t('Off') }], !!eq.fan, (v) => {
    st.setEquipment({ fan: v });
    app.env.fan.visible = v;
    app.sitePanel.invalidate();
    app.mode.onFix?.('fan');
  }, { size: 24 });
  ui.text(t('Welding screen'), 22, 178, { size: 24, color: COLORS.dim });
  ui.segmented('screen', 200, 144, 290, 54, [{ value: true, label: t('Up') }, { value: false, label: t('Down') }], !!eq.screen, (v) => {
    st.setEquipment({ screen: v });
    app.env.screen.visible = v;
    app.sitePanel.invalidate();
    app.mode.onFix?.('screen');
  }, { size: 24 });
  if (eq.oily) {
    ui.button('degrease', 22, 230, 468, 70, t('Degrease and grind the joint'), () => {
      st.setEquipment({ oily: null });
      app.say(t('Joint cleaned to bright metal.'));
      app.sitePanel.invalidate();
      app.mode.onFix?.('oil');
    }, { style: 'primary' });
  } else ui.wrap(t('Joint surfaces: clean'), 22, 268, 468, { size: 22, color: COLORS.dim });
  ui.text(eq.fan && !eq.screen ? t('Draught at the arc: about 3 m/s (model value)') : t('No draught at the arc'), 22, 360, { size: 20, color: eq.fan && !eq.screen ? COLORS.warn : COLORS.dim });
}

// ---- macro section panel ---------------------------------------------------------------------------
export function drawSection(ui, app) {
  const st = app.station;
  ui.background('rgba(8,10,12,0.97)', 22);
  if (!st.record || app.sectionX == null) return;
  const j = st.joint;
  const x = j.pipe ? wrapIndex(j, Math.round(app.sectionX)) : clamp(Math.round(app.sectionX), 0, j.n - 1);
  ui.text(t('Macro section'), 26, 50, { size: 30, weight: 700 });
  // pipe: position round the joint as a clock position (fixed pipe) or mm from the 0 mark (2G)
  const at = j.pipe && j.pipe.axis !== 'vertical' ? `${t('at')} ${clockText(clockAt(j, x + 0.5))} ${t("o'clock")} (${x} mm)` : `${t('at')} ${x - j.tab} mm`;
  ui.text(at, 300, 50, { size: 26, color: COLORS.accent, weight: 600 });
  ui.button('sec-close', ui.W - 110, 14, 86, 52, '✕', () => app.showSection(null), { size: 28 });
  const vals = paintSection(ui.ctx, st.record, x, 20, 76, ui.W - 40, 560);
  let yy = 680;
  vals.forEach((v, k) => {
    const col = k % 2, row = Math.floor(k / 2);
    const val = v.value == null ? t(v.unit || '–') : `${v.value.toFixed(v.unit ? 1 : 0)} ${v.unit === 'ok' ? '' : v.unit}`;
    ui.text(`${t(v.label)}: ${v.unit === 'ok' ? t('fused') : val}`, 26 + col * 500, yy + row * 34, { size: 22, color: COLORS.text });
  });
  const step = (d) => {
    app.showSection(j.pipe ? wrapIndex(j, x + d) : clamp(x + d, 0, j.n - 1));
  };
  const by = ui.H - 70;
  ui.button('s-10', 26, by, 150, 56, '−10 mm', () => step(-10), { size: 24 });
  ui.button('s-1', 186, by, 120, 56, '−1', () => step(-1), { size: 24 });
  ui.button('s+1', 316, by, 120, 56, '+1', () => step(1), { size: 24 });
  ui.button('s+10', 446, by, 150, 56, '+10 mm', () => step(10), { size: 24 });
  ui.text(t('Etched section from the simulated weld record'), 620, by + 36, { size: 18, color: COLORS.faint, maxW: 380 });
}

// Clock position as h:mm (12 o'clock at the top of a fixed pipe).
export function clockText(h) {
  let hh = Math.floor(h + 1e-6);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh = (hh % 12) + 1; mm = 0; }
  return `${hh === 0 ? 12 : hh}:${String(mm).padStart(2, '0')}`;
}

// ---- results ------------------------------------------------------------------------------------------
const PACK_CHOICES = [
  { id: 'iso5817-2023', level: 'B', label: 'ISO 5817 B' },
  { id: 'iso5817-2023', level: 'C', label: 'ISO 5817 C' },
  { id: 'iso5817-2023', level: 'D', label: 'ISO 5817 D' },
  { id: 'iso9606-1', level: null, label: 'ISO 9606-1' },
  { id: 'aws-d11-static', level: null, label: 'AWS D1.1 T8.1' },
  { id: 'aws-d11-wq', level: null, label: 'AWS welder test' },
  { id: 'api1104', level: null, label: 'API 1104' },
];

// Pipe (open root): the AWS D1.1 packs of this build are for plate (nontubular) joints and are not offered.
export function packChoices(joint) {
  return joint && joint.pipe ? PACK_CHOICES.filter((c) => !c.id.startsWith('aws-')) : PACK_CHOICES;
}

export function evaluateAll(sum, mode) {
  return packChoices(sum.joint).map((c) => ({ ...c, res: evaluate(sum, c.id, c.level, { mode }) }));
}

function fmtVal(v) {
  if (v == null) return '–';
  if (typeof v === 'number') return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v < 10 ? 2 : 1);
  return String(v);
}

// state: { tab, pack (index), full (bool), scroll, sum, tech, log, extra }
export function drawResults(ui, app, R, y0 = 104, opts = {}) {
  const W = ui.W;
  const tabs = [];
  if (R.drill) tabs.push({ value: 'drill', label: t('Exercise') });
  // a bead on plate is not a welded joint: the joint acceptance codes do not apply to it
  if (!R.noCode) tabs.push({ value: 'code', label: t('Code verdicts') });
  tabs.push({ value: 'tech', label: t('Technique') }, { value: 'procedure', label: t('Procedure') }, { value: 'safety', label: t('Safety') });
  if (!tabs.some((tb) => tb.value === R.tab)) R.tab = tabs[0].value;
  // opts.reserve: width kept free at the right end of the tab row (the drill's criteria badge)
  ui.segmented('rtab', PAD, y0, W - 2 * PAD - (opts.reserve || 0), 58, tabs, R.tab, (v) => {
    R.tab = v;
    R.scroll = 0;
    app.main.invalidate();
  }, { size: 24 });
  const y = y0 + 78;
  if (R.tab === 'drill') drawDrillTab(ui, app, R, y);
  else if (R.tab === 'code') drawCodeTab(ui, app, R, y);
  else if (R.tab === 'tech') drawTechTab(ui, app, R, y);
  else if (R.tab === 'procedure') drawProcedureTab(ui, app, R, y);
  else drawSafetyResults(ui, app, R, y);
}

// Exercise criteria: measured value, target and whether it was met.
function drawDrillTab(ui, app, R, y) {
  const W = ui.W;
  const d = R.drill;
  const res = d.res;
  const n = res.items.length;
  const rowH = n > 8 ? 56 : 64;
  const listY = y + 58;
  ui.badge(PAD, y, res.all ? t('ALL CRITERIA MET') : `${res.met} / ${res.total} ${t('criteria met')}`, res.all ? 'ok' : 'warn', 24);
  ui.text(`${d.ex.id} · ${d.process}`, W - PAD, y + 28, { size: 20, color: COLORS.dim, align: 'end' });
  res.items.forEach((it, k) => {
    const yy = listY + k * rowH;
    ui.rect(PAD, yy, W - 2 * PAD, rowH - 8, COLORS.bg2, 10, it.ok ? '#1f4a33' : '#5a2320');
    ui.text(t(it.label), PAD + 16, yy + (rowH - 8) * 0.44, { size: 21, weight: 600, maxW: 700 });
    const tgt = `${t('target')} ${it.target}${it.note ? ` · ${t(it.note)}` : ''}`;
    ui.text(tgt, PAD + 16, yy + (rowH - 8) * 0.86, { size: 17, color: COLORS.dim, maxW: 700 });
    ui.text(String(it.measured), W - PAD - 150, yy + (rowH - 8) * 0.62, { size: 21, weight: 700, color: it.ok ? COLORS.ok : COLORS.bad, align: 'end', maxW: 380 });
    ui.text(it.ok ? t('met') : t('not met'), W - PAD - 16, yy + (rowH - 8) * 0.62, { size: 19, weight: 700, color: it.ok ? COLORS.ok : COLORS.bad, align: 'end' });
  });
  ui.text(t('Pass marks marked seed are starting values for your welding SME to set (the scope builds in no pass mark).'), PAD, ui.H - 132, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
}

function drawCodeTab(ui, app, R, y) {
  const W = ui.W;
  const ev = R.full ? R.evalFull : R.evalVisual;
  // pack chips with verdicts
  const cw = (W - 2 * PAD - 6 * 8) / 7;
  ev.forEach((e, k) => {
    const ok = e.res.verdict === 'accept';
    ui.button(`pack${k}`, PAD + k * (cw + 8), y, cw, 82, e.label, () => {
      R.pack = k;
      R.scroll = 0;
      app.main.invalidate();
    }, { size: 21, selected: R.pack === k, sub: ok ? t('ACCEPT') : t('REJECT'), style: ok ? 'ok' : 'bad' });
  });
  const e = ev[R.pack];
  const res = e.res;
  const y2 = y + 104;
  ui.segmented('vmode', PAD, y2, 520, 50, [{ value: false, label: t('Visual examination') }, { value: true, label: t('Plus internal (model)') }], R.full, (v) => {
    R.full = v;
    app.main.invalidate();
  }, { size: 22 });
  ui.badge(PAD + 540, y2 + 6, res.verdict === 'accept' ? t('ACCEPT') : t('REJECT'), res.verdict === 'accept' ? 'ok' : 'bad', 24);
  // findings list
  const rows = res.findings.slice().sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === 'reject' ? -1 : 1));
  const listY = y2 + 70;
  const rowH = 74;
  const maxRows = Math.floor((ui.H - 230 - listY) / rowH);
  const start = clamp(R.scroll, 0, Math.max(0, rows.length - maxRows));
  R.scroll = start;
  ui.region('flist', PAD, listY, W - 2 * PAD, maxRows * rowH, null, { scroll: (d) => (R.scroll = clamp(R.scroll + d, 0, Math.max(0, rows.length - maxRows))) });
  if (!rows.length) ui.text(t('No imperfections beyond this code’s limits were found by the model.'), PAD, listY + 40, { size: 24, color: COLORS.dim });
  rows.slice(start, start + maxRows).forEach((f, k) => {
    const yy = listY + k * rowH;
    const hover = ui.region(`f${start + k}`, PAD, yy, W - 2 * PAD, rowH - 8, () => {
      const s = f.s0 != null ? (f.s0 + (f.s1 ?? f.s0)) / 2 : null;
      if (s != null) {
        const sim = s + app.station.joint.tab;
        app.markFinding(sim);
        app.showSection(sim);
      }
    });
    ui.rect(PAD, yy, W - 2 * PAD, rowH - 8, hover ? '#243243' : COLORS.bg2, 12, f.verdict === 'reject' ? '#5a2320' : '#1f4a33');
    ui.text(f.ref, PAD + 16, yy + 40, { size: 26, weight: 700, color: COLORS.accent });
    ui.text(t(f.name), PAD + 130, yy + 30, { size: 24, weight: 600, maxW: 560 });
    ui.text(`${t('measured')} ${fmtVal(f.measured)} ${f.unit || ''} · ${t('limit')} ${f.limitText}`, PAD + 130, yy + 58, { size: 19, color: COLORS.dim, maxW: 760 });
    const loc = f.s0 != null ? `${Math.round(f.s0)}${f.s1 != null && f.s1 - f.s0 > 1 ? `–${Math.round(f.s1)}` : ''} mm` : '';
    ui.text(loc, W - PAD - 190, yy + 40, { size: 22, color: COLORS.dim, align: 'end' });
    ui.badge(W - PAD - 170, yy + 16, f.verdict === 'accept' ? t('OK') : t('REJECT'), f.verdict === 'accept' ? 'ok' : 'bad', 20);
  });
  if (rows.length > maxRows) ui.text(`${start + 1}–${Math.min(rows.length, start + maxRows)} / ${rows.length}  (${t('scroll with the thumbstick')})`, PAD, listY + maxRows * rowH + 18, { size: 18, color: COLORS.faint });
  // info and provenance (above the button row)
  const info = (res.info || []).map((i) => `${i.ref} ${t(i.name)}: ${i.text}`).concat((res.notEvaluated || []).map((s) => `${t('Not evaluated')}: ${s}`));
  if (R.decidingNote) ui.text(R.decidingNote, PAD, ui.H - 186, { size: 19, color: COLORS.bad, maxW: W - 2 * PAD });
  else if (info.length) ui.text(info[0], PAD, ui.H - 186, { size: 18, color: COLORS.info, maxW: W - 2 * PAD });
  ui.text(`${t('Rule pack')}: ${res.name} — ${res.provenance ? res.provenance.status : ''}`, PAD, ui.H - 156, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
  ui.text(t('Training rule pack: verify every value against your licensed copy of the code.'), PAD, ui.H - 132, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
}

const METRIC_LABEL = {
  workAngle: ['Work angle', '°'], travelAngle: ['Travel angle (drag +)', '°'], stickOut: ['Stick-out', 'mm'], speed: ['Travel speed', 'mm/s'], aim: ['Aim offset', 'mm'],
};

function drawTechTab(ui, app, R, y) {
  const W = ui.W;
  const tech = R.tech || [];
  if (!tech.length || !tech.some((p) => p.arcTime > 0)) {
    ui.text(t('No arc time recorded inside the evaluation length.'), PAD, y + 40, { size: 24, color: COLORS.dim });
    return;
  }
  const passes = tech.map((p, k) => ({ ...p, k })).filter((p) => p.arcTime > 0);
  const k = clamp(R.passSel ?? passes.length - 1, 0, passes.length - 1);
  if (passes.length > 1) {
    ui.segmented('psel', PAD, y, Math.min(W - 2 * PAD, passes.length * 150), 50, passes.map((p, q) => ({ value: q, label: `${t('Pass')} ${p.k + 1}` })), k, (v) => {
      R.passSel = v;
      app.main.invalidate();
    }, { size: 22 });
  }
  const p = passes[k];
  const yy = y + (passes.length > 1 ? 74 : 10);
  const proc = app.station.session ? app.station.session.settings.process : '135';
  const kEff = PROCESSES[proc] ? PROCESSES[proc].k : 0.8;
  ui.text(`${t('Arc time')}: ${p.arcTime.toFixed(1)} s · ${t('Mean heat input')}: ${p.heatInput != null ? p.heatInput.toFixed(2) : '–'} kJ/mm (EN 1011-1, k = ${kEff})`, PAD, yy + 26, { size: 22, color: COLORS.dim, maxW: W - 2 * PAD });
  const h = R.heat ? R.heat[p.k] : null;
  if (h) {
    const parts = [];
    if (h.interpass && p.k > 0) parts.push(`${t('Interpass at the start')}: ${Math.round(h.interpass.max)} °C`);
    parts.push(`${t('Plate ahead of the arc')}: ${Math.round(h.T0)} °C`);
    if (h.t85) parts.push(`t8/5 ≈ ${h.t85.t85.toFixed(1)} s ${t('at')} ${Math.round(h.Ts)} °C (${t('Rosenthal estimate, not the EN 1011-2 method')})`);
    ui.text(parts.join(' · '), PAD, yy + 56, { size: 20, color: COLORS.info, maxW: W - 2 * PAD });
  }
  const win = R.windows ? R.windows[p.k] || R.windows[0] : null;
  let row = 0;
  for (const key of ['workAngle', 'travelAngle', 'stickOut', 'speed', 'aim']) {
    const m = p[key];
    const ry = yy + 74 + row * 92;
    row++;
    // SMAW and GTAW: the stick-out metric is the arc length
    const [label, unit] = key === 'stickOut' && (proc === '111' || proc === '141') ? ['Arc length', 'mm'] : METRIC_LABEL[key];
    ui.text(t(label), PAD, ry + 30, { size: 24, weight: 600 });
    if (!m && key === 'speed' && p.keyhole) {
      // open-root root run: the travel speed is judged by the keyhole it keeps (station.speedByKeyhole)
      const kp = (100 * p.keyhole.tin) / Math.max(p.keyhole.t, 1e-9);
      ui.text(`${kp.toFixed(0)}% ${t('keyhole in window')}`, PAD + 330, ry + 30, { size: 24, weight: 700, color: kp >= 80 ? COLORS.ok : kp >= 50 ? COLORS.warn : COLORS.bad });
      ui.wrap(t('On the open root the travel speed is set by the keyhole: slower when it closes, faster when it grows (Lincoln C2.420).'), PAD, ry + 62, W - 2 * PAD, { size: 19, color: COLORS.faint });
      continue;
    }
    if (!m) continue;
    const pct = m.inWindow * 100;
    ui.text(`${pct.toFixed(0)}% ${t('in window')}`, PAD + 330, ry + 30, { size: 24, weight: 700, color: pct >= 80 ? COLORS.ok : pct >= 50 ? COLORS.warn : COLORS.bad });
    ui.text(`${t('mean')} ${m.mean.toFixed(1)} ${unit} · ${t('sd')} ${m.sd.toFixed(1)}`, PAD + 560, ry + 30, { size: 22, color: COLORS.dim });
    const w = win ? win[key] : null;
    if (w) {
      const lo = w[0], hi = w[1];
      const span = Math.max(1, hi - lo);
      ui.meter(PAD, ry + 50, W - 2 * PAD - 220, 20, m.mean, lo - span * 1.5, hi + span * 1.5, lo, hi);
      ui.text(`${t('window')} ${lo.toFixed(key === 'speed' ? 1 : 0)}–${hi.toFixed(key === 'speed' ? 1 : 0)} ${unit}`, W - PAD, ry + 66, { size: 19, color: COLORS.faint, align: 'end' });
    }
  }
  ui.text(t('Windows are seed values from published guidance or SME placeholders (see About).'), PAD, ui.H - 132, { size: 18, color: COLORS.faint, maxW: W - 2 * PAD });
}

function drawProcedureTab(ui, app, R, y) {
  const W = ui.W;
  const log = R.log || {};
  const items = [
    { label: 'Arc starts', value: log.arcStarts ?? 0, ok: true },
    { label: 'Wire stubbed into the work', value: log.stubs ?? 0, ok: !(log.stubs > 0) },
  ];
  if (R.wpsInside != null) items.push({ label: 'Arc time with settings inside the WPS', value: `${(R.wpsInside * 100).toFixed(0)}%`, ok: R.wpsInside > 0.98 });
  const pr = R.procedure;
  if (pr && pr.multi) {
    const lim = app.mode.wps && app.mode.wps() ? app.mode.wps().interpassMax : null;
    if (pr.interpassMax != null) items.push({ label: lim ? t('Highest interpass temperature at a run start (model; training WPS max {T} °C)', { T: lim }) : 'Highest interpass temperature at a run start (model)', value: `${Math.round(pr.interpassMax)} °C`, ok: !lim || pr.interpassMax <= lim + 0.5 });
    if (pr.slag) items.push({ label: 'Runs welded over slag that was not cleaned off', value: pr.overSlag, ok: pr.overSlag === 0 });
    items.push({ label: 'Temperature readings taken', value: pr.readings, ok: true });
  }
  const rowH = items.length > 7 ? 68 : 82;
  items.forEach((it, k) => {
    const yy = y + k * rowH;
    ui.rect(PAD, yy, W - 2 * PAD, rowH - 12, COLORS.bg2, 12, it.ok ? '#1f4a33' : '#5a2320');
    ui.text(t(it.label), PAD + 20, yy + (rowH - 12) * 0.63, { size: rowH > 70 ? 24 : 22, maxW: W - 400 });
    ui.text(String(it.value), W - PAD - 20, yy + (rowH - 12) * 0.66, { size: rowH > 70 ? 30 : 27, weight: 700, color: it.ok ? COLORS.ok : COLORS.bad, align: 'end' });
  });
  ui.wrap(t('Simulator training record — not a welder qualification under any code.'), PAD, ui.H - 132, W - 2 * PAD, { size: 20, color: COLORS.faint });
}

// Filter shade used against OSHA 1910.133(a)(5) minimum and the ANSI Z49.1:2021 Table 1 suggested shade.
export function shadeAssessment(app, meanI) {
  const st = app.station;
  return shadeAssess(app, st.session ? st.session.settings.process : null, meanI);
}

// ---- settings -------------------------------------------------------------------------------------------
export function drawSettings(ui, app, y = 110) {
  const s = app.settings;
  const W = ui.W;
  const row = (k, label, draw) => {
    const yy = y + k * 78;
    ui.text(t(label), PAD, yy + 38, { size: 22, color: COLORS.dim, maxW: 280 });
    draw(320, yy);
  };
  row(0, 'Language', (x, yy) => ui.segmented('s-lang', x, yy, 470, 56, [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }], s.lang, (v) => app.set('lang', v)));
  row(1, 'Gun hand', (x, yy) => ui.segmented('s-hand', x, yy, 470, 56, [{ value: 'right', label: t('Right') }, { value: 'left', label: t('Left') }], s.hand, (v) => app.set('hand', v)));
  row(2, 'Frame rate', (x, yy) => ui.segmented('s-fps', x, yy, 470, 56, [{ value: 'auto', label: t('Auto') }, { value: '72', label: '72 Hz' }, { value: '90', label: '90 Hz' }, { value: '120', label: '120 Hz' }], s.fps, (v) => app.set('fps', v)));
  row(3, 'Foveation', (x, yy) => ui.segmented('s-fov', x, yy, 470, 56, ['off', 'low', 'medium', 'high'].map((v) => ({ value: v, label: t(v[0].toUpperCase() + v.slice(1)) })), s.foveation, (v) => app.set('foveation', v)));
  row(4, 'Lens shade (dark)', (x, yy) => ui.stepper('s-shade', x, yy, 300, 56, null, `DIN ${s.shade}`, (d) => app.set('shade', clamp(s.shade + d, 9, 13))));
  row(5, 'Helmet nod to lower', (x, yy) => ui.segmented('s-nod', x, yy, 300, 56, [{ value: true, label: t('On') }, { value: false, label: t('Off') }], s.nod, (v) => app.set('nod', v)));
  row(6, 'Haptics', (x, yy) => ui.segmented('s-hap', x, yy, 300, 56, [{ value: true, label: t('On') }, { value: false, label: t('Off') }], s.haptics, (v) => app.set('haptics', v)));
  row(7, 'Sound volume', (x, yy) => ui.stepper('s-vol', x, yy, 300, 56, null, `${Math.round(s.volume * 100)}%`, (d) => app.set('volume', clamp(Math.round((s.volume + d * 0.1) * 10) / 10, 0, 1))));
  row(8, 'Gun neck angle', (x, yy) => ui.segmented('s-neck', x, yy, 300, 56, [{ value: 45, label: '45°' }, { value: 60, label: '60°' }], s.neck, (v) => app.set('neck', v)));
  row(9, 'PPE and booth set-up', (x, yy) => ui.segmented('s-setup', x, yy, 470, 56, [{ value: 'auto', label: t('Set up for me') }, { value: 'trainee', label: t('I set up') }], s.setup, (v) => app.set('setup', v), { size: 21 }));
  // bench column
  const bx = 836;
  ui.text(t('Bench'), bx, y + 38, { size: 24, color: COLORS.dim });
  ui.stepper('s-bh', bx, y + 56, 400, 70, t('Height (m)'), s.benchHeight.toFixed(2), (d) => app.set('benchHeight', clamp(Math.round((s.benchHeight + d * 0.02) * 100) / 100, 0.55, 1.25)));
  ui.button('s-recenter', bx, y + 140, 400, 60, t('Recenter bench in front of me'), () => app.recenter(), { size: 22, disabled: !app.renderer.xr.isPresenting });
  ui.button('s-align', bx, y + 212, 400, 60, t('Align bench to a real table'), () => app.alignToTable(), { size: 22, disabled: !app.renderer.xr.isPresenting });
  ui.wrap(t('Rest the other controller flat on your table, then press Align.'), bx, y + 304, 400, { size: 18, color: COLORS.faint });
  ui.segmented('s-booth', bx, y + 360, 400, 56, [{ value: true, label: t('Booth on') }, { value: false, label: t('Booth off') }], s.booth, (v) => app.set('booth', v), { size: 22 });
  ui.segmented('s-bench', bx, y + 428, 400, 56, [{ value: true, label: t('Virtual bench') }, { value: false, label: t('Real table') }], s.bench, (v) => app.set('bench', v), { size: 22 });
  void W;
}

// ---- about --------------------------------------------------------------------------------------------------
export function drawAbout(ui, app, y = 110) {
  const W = ui.W;
  let yy = y + 20;
  const para = (s, o = {}) => {
    yy = ui.wrap(s, PAD, yy + 10, W - 2 * PAD, { size: 22, color: COLORS.text, ...o }) + 6;
  };
  ui.text(t('About this build'), PAD, yy + 12, { size: 30, weight: 700 });
  yy += 30;
  para(t('Phase 1 prototype, release 1.7: GMAW (135), FCAW (136, 114), SMAW (111) and GTAW (141) on carbon steel: bead-on-plate drills, fillet and butt joints in PA–PG positions, open-root pipe in 1G, 2G, 5G and 6G (SMAW), oxy-fuel cutting (81) of plate, live imperfections and code judging, technique exercises, welder qualification tests to ISO 9606-1, ASME IX and API 1104, and the Inspector and Tracking labs.'));
  para(t('Release 1.2 adds the training workshop and the Safety and PPE module: PPE selection and inspection, booth inspection, hot work permit and fire watch, and consequences of unsafe behaviour (glare, UV dose, burns, fume exposure) with the rule and its source.'));
  para(t('Release 1.3 adds stick welding (SMAW, 111): electrode holder with E6010, E6013 and E7018 electrodes, a constant-current machine, touch-and-lift striking, sticking, burn-off and electrode changes, chipping hammer and wire brush for slag, and the electric shock risk of changing electrodes with wet or damaged gloves. Electrode data from manufacturer data sheets.'));
  para(t('Release 1.4 adds TIG welding (GTAW, 141) on 3.2 mm sheet: a torch with a fingertip amperage control on the trigger, HF or lift-arc starts, a filler rod fed by the other hand, argon pre- and post-flow, and the consequences of tungsten contamination, a short post-flow, too much argon and the wrong polarity.'));
  para(t('Release 1.5 adds pipe welding with covered electrodes: open-root butt joints on NPS 6 and NPS 2 pipe in the 1G, 2G, 5G and 6G test positions, the root and its inside bead, a keyhole cue, electrode angles that follow the position round the pipe, grinding of starts and craters, a pipe WPS from the Lincoln C2.420 procedure table (E6010 root, E7018 fill and cap) and six pipe drills.'));
  para(t('Release 1.6 adds oxy-fuel cutting (oxyacetylene, 81) of carbon-steel plate from 6.4 to 25.4 mm: the outfit set up, lit and shut down by the Victor instructions and OSHA 1910.253, pressures and speeds from the Victor tip chart, the start at the kindling temperature, cut quality by the Harris categories and the ISO 9013 ranges, backfire and sustained backfire, burns and eye protection, and five cutting drills.'));
  para(t('Release 1.7 adds welder qualification to ISO 9606-1:2012, ASME IX-2023 and API 1104 22nd edition (licensed copies): fifteen tests on plate and pipe welded on the test piece of the code under its conditions (stop and restart), then the visual examination and the radiography, bend, fracture, nick-break or macro tests the code asks for, simulated from the weld you made and judged clause by clause, with a test lab, the range of qualification, the validity and retest rules, and training records.'));
  para(t('Weld model: uncalibrated engineering model. A heat-flow model of the coupon (EN 1993-1-2 steel properties) sizes the weld pool with the moving point-source solution and drives preheat, heat build-up, interpass temperature, glow and heat tint. Directions of effect follow published guidance (TWI, EWI, Kobelco, EN 1011-1); coefficients are seed values to be replaced by calibration welds.'), { color: COLORS.warn });
  para(t('Rule packs (training only — verify against licensed copies):'), { weight: 600 });
  for (const p of PACKS) {
    const pv = PROVENANCE[p.id];
    para(`• ${p.title}: ${pv.status}`, { size: 18, color: COLORS.dim });
  }
  para(t('Simulator training record — not a welder qualification under any code.'), { color: COLORS.accent });
  para(t('Arabic interface text is a draft for review by an Arabic-speaking welding specialist.'), { size: 18, color: COLORS.faint });
  para('three.js r186 (MIT licence).', { size: 18, color: COLORS.faint });
}
