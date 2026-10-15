// Panel content for safety: PPE check lists, incident lists and the Safety tab of the results.

import { COLORS } from './ui.js';
import { t } from './i18n.js';
import { INCIDENTS } from '../safety/incidents.js';
import { PPE_ITEMS } from '../safety/ppe.js';
import { shadeGuide, SHADE_REFS } from '../safety/shade.js';
import { cites, cite } from '../safety/refs.js';
import { PROCESSES } from '../sim/process.js';
import { sevLabel } from '../safety/system.js';

const PAD = 36;

// Suggested shade(s): "12" or "4 or 5" (oxyfuel rows give two)
export function fmtSug(s) {
  if (s == null) return '—';
  return Array.isArray(s) ? t('{a} or {b}', { a: s[0], b: s[1] }) : String(s);
}

const STATUS = {
  ok: { icon: '✓', color: COLORS.ok },
  missing: { icon: '✗', color: COLORS.bad, label: 'missing' },
  wrong: { icon: '✗', color: COLORS.bad, label: 'wrong item' },
  defect: { icon: '✗', color: COLORS.bad, label: 'defective' },
  na: { icon: '–', color: COLORS.faint },
};

export function ruleStatus(r) {
  const st = STATUS[r.result.status] || STATUS.na;
  if (r.result.status !== 'ok' && r.result.status !== 'na' && r.level === 'should') return { ...st, color: COLORS.warn, icon: '!' };
  return st;
}

// Job line: "GMAW (135) · about 180 A · PB"
export function jobLine(task) {
  if (!task) return '';
  const p = PROCESSES[task.process];
  const name = p ? t(p.label) : task.process;
  return `${name} · ${t('about')} ${task.current} A · ${task.position}${task.levOk === false ? ` · ${t('no fume extraction')}` : ''}`;
}

// PPE rules with their status. opts.notes: show the explanation under failed rules. Returns y below.
export function drawPPECheck(ui, chk, x, y, w, opts = {}) {
  const rowH = opts.rowH || 40;
  for (const r of chk.rules) {
    const st = ruleStatus(r);
    ui.text(st.icon, x, y + rowH * 0.7, { size: 28, weight: 700, color: st.color });
    const lvl = t(r.level === 'shall' ? 'shall' : 'should');
    const lw = ui.measure(lvl, 16, 700) + 16;
    ui.rect(x + w - lw, y + rowH * 0.18, lw, rowH * 0.62, r.level === 'shall' ? '#2a1a1a' : '#1d2630', 8, r.level === 'shall' ? '#6a3030' : COLORS.line, 1);
    ui.text(lvl, x + w - lw / 2, y + rowH * 0.6, { size: 16, weight: 700, color: r.level === 'shall' ? '#ff9c94' : COLORS.dim, align: 'center' });
    let label = t(r.text);
    if (r.id === 'shade' && r.guide) label += ` (${t('min')} ${r.guide.min}, ${t('suggested')} ${fmtSug(r.guide.suggested)})`;
    if (st.label) label += ` — ${t(st.label)}`;
    ui.text(label, x + 36, y + rowH * 0.68, { size: opts.size || 21, color: r.result.status === 'ok' || r.result.status === 'na' ? COLORS.text : st.color, maxW: w - 36 - lw - 10 });
    y += rowH;
    if (opts.notes && r.result.note && r.result.status !== 'ok') {
      y = ui.wrap(t(r.result.note, r.result.vars), x + 36, y + 2, w - 46, { size: 17, color: COLORS.dim, maxLines: 2 }) + 2;
    }
  }
  return y;
}

// Incidents of an attempt, newest last. Returns y below.
export function drawIncidents(ui, list, x, y, w, maxRows = 6) {
  if (!list.length) {
    ui.text(t('No incidents.'), x, y + 28, { size: 22, color: COLORS.ok });
    return y + 44;
  }
  const rows = list.slice(-maxRows);
  if (list.length > maxRows) {
    ui.text(t('{n} earlier incidents not shown', { n: list.length - maxRows }), x, y + 22, { size: 17, color: COLORS.faint });
    y += 28;
  }
  for (const inc of rows) {
    const def = INCIDENTS[inc.type];
    if (!def) continue;
    const col = def.severity === 'injury' ? COLORS.bad : def.severity === 'violation' ? COLORS.warn : COLORS.info;
    ui.rect(x, y + 4, 8, 32, col, 3);
    ui.text(`${t(def.title)}${inc.where ? ` (${t(inc.where)})` : ''}`, x + 20, y + 28, { size: 21, weight: 600, maxW: w - 150 });
    ui.text(`${Math.floor(inc.t / 60)}:${String(Math.floor(inc.t % 60)).padStart(2, '0')}`, x + w, y + 28, { size: 19, color: COLORS.faint, align: 'end' });
    y += 42;
  }
  return y;
}

export function countIncidents(list) {
  let injuries = 0, rules = 0, other = 0;
  for (const inc of list) {
    const def = INCIDENTS[inc.type];
    if (!def) continue;
    if (def.severity === 'injury') injuries++;
    else if (def.severity === 'violation') rules++;
    else other++;
  }
  return { injuries, rules, other };
}

// Safety tab of the results: PPE check against the job, exposure, incidents.
export function drawSafetyResults(ui, app, R, y) {
  const W = ui.W;
  const S = R.safety;
  if (!S) {
    ui.text(t('No safety record for this attempt.'), PAD, y + 40, { size: 24, color: COLORS.dim });
    return;
  }
  const log = R.log || {};
  const n = countIncidents(S.incidents);
  const helmetUp = log.helmetUpStarts || 0;
  const flashes = log.flashes || 0;
  const ppeFails = S.ppe.failsShall.length;
  const clean = n.injuries === 0 && n.rules === 0 && ppeFails === 0 && helmetUp === 0 && flashes === 0;
  ui.badge(PAD, y, clean ? t('No injuries, no rules broken') : t('{i} injuries · {r} rules broken · {p} PPE requirements not met', { i: n.injuries, r: n.rules + (helmetUp ? 1 : 0), p: ppeFails }), clean ? 'ok' : 'bad', 22);
  ui.text(`${t('Job')}: ${jobLine(S.task)}`, PAD, y + 70, { size: 21, color: COLORS.dim, maxW: W - 2 * PAD });
  const top = y + 92;
  const colW = (W - 2 * PAD - 40) / 2;
  // left: PPE
  ui.text(t('PPE for this job'), PAD, top + 28, { size: 24, weight: 700 });
  drawPPECheck(ui, S.ppe, PAD, top + 40, colW, { rowH: 38, size: 19 });
  // right: exposure and incidents
  const x2 = PAD + colW + 40;
  ui.text(t('Exposure'), x2, top + 28, { size: 24, weight: 700 });
  const ex = S.exposure;
  const lines = [];
  lines.push({ k: t('Arc struck with the helmet up'), v: String(helmetUp), ok: helmetUp === 0 });
  lines.push({ k: t('Arc seen without the helmet'), v: String(flashes), ok: flashes === 0 });
  lines.push({ k: t('UV dose to the eyes (share of the daily limit)'), v: `${Math.round(ex.uvEyes * 100)}%`, ok: ex.uvEyes < 1 });
  if (R.shade) lines.push({ k: R.shade.label, v: String(R.shade.value), ok: R.shade.ok });
  if (ex.capturedShare != null) lines.push({ k: t('Arc time with the fume captured by the hood'), v: `${Math.round(ex.capturedShare * 100)}%`, ok: ex.capturedShare > 0.95 });
  if (ex.plumeT > 0) lines.push({ k: t('Time with the head in the fume plume'), v: `${ex.plumeT.toFixed(0)} s`, ok: ex.plumeT < 2 });
  let yy = top + 40;
  for (const l of lines) {
    ui.text(l.k, x2, yy + 26, { size: 19, color: COLORS.text, maxW: colW - 110 });
    ui.text(l.v, x2 + colW, yy + 27, { size: 22, weight: 700, color: l.ok ? COLORS.ok : COLORS.bad, align: 'end' });
    yy += 36;
  }
  ui.text(t('Incidents'), x2, yy + 34, { size: 24, weight: 700 });
  drawIncidents(ui, S.incidents, x2, yy + 42, colW, 5);
  const refs = [...SHADE_REFS, { ref: 'Z49', at: '4.2, 4.3' }, { ref: 'FS26' }, { ref: 'HSE_WL3' }];
  ui.text(`${t('Sources')}: ${cites(refs)}`, PAD, ui.H - 150, { size: 16, color: COLORS.faint, maxW: W - 2 * PAD });
}

// Filter shade used against the guide for the process at the mean arc current.
export function shadeAssessment(app, process, meanI) {
  if (meanI == null || !process) return null;
  const shade = app.safety ? app.safety.shadeInUse() : app.settings.shade;
  if (shade == null) return { label: t('Filter shade: no welding helmet worn'), value: '–', ok: false };
  const g = shadeGuide(process, meanI);
  if (!g) return null;
  const below = shade < g.min;
  return {
    label: t('Filter shade at {i} A (minimum {m}, suggested {s})', { i: meanI.toFixed(0), m: g.min, s: fmtSug(g.suggested) }),
    value: shade,
    ok: !below,
    guide: g,
  };
}

// Names of worn items: "helmet: Auto-darkening welding helmet, ..."
export function wornList(worn) {
  return Object.keys(worn).map((slot) => t(PPE_ITEMS[worn[slot].id].name));
}

export { cite, sevLabel };
