// Training records of the welder qualification: the record kept on this headset (localStorage) and a
// printable HTML copy laid out after ISO 9606-1 Annex A, ASME IX Form QW-484A (Nonmandatory Appendix B) or
// API 1104 Figure 1 and 6.8. Every record is marked as a simulator training record: it is not a welder
// qualification under any code (no examiner, no witnessed test, no real specimens).

import { STANDARDS, METHOD_LABELS, fill } from './catalog.js';

const KEY = 'wellexperts.weldvr.qualrecords.v1';
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);

export function loadRecords() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function saveRecords(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-60)));
    return true;
  } catch {
    return false;
  }
}

// Per-pass welding parameters for the record (API 1104 Figure 1 asks for them): mean current, arc voltage
// and travel speed over the pass, heat input from the station's technique summary, interpass temperature
// at the start of the pass.
export function passParams(rec, wps, tech) {
  const j = rec.joint;
  const out = [];
  for (const p of rec.passes) {
    let n = 0, I = 0, U = 0, v = 0;
    for (let i = 0; i < j.n; i++) {
      if (!(p.area[i] > 0.05)) continue;
      const s = rec.sample(p.index, i);
      if (!s) continue;
      I += s.I;
      U += s.U;
      v += s.speed;
      n++;
    }
    if (!n) continue;
    const pw = wps && wps.pipe ? wps.passes[Math.min(p.index, wps.passes.length - 1)] : null;
    out.push({
      k: p.index,
      kind: j.passPlan[Math.min(p.index, j.passPlan.length - 1)].kind,
      filler: pw ? `${pw.electrode} Ø ${pw.dia} mm` : wps && wps.electrode ? `${wps.electrode.type} Ø ${wps.electrode.dia} mm` : wps && wps.filler ? `${wps.filler.type} Ø ${wps.filler.dia} mm` : wps ? `Ø ${wps.settings.wire} mm` : '',
      I: I / n, U: U / n, speed: (v / n) * 60, // mm/min
      Q: tech && tech[p.index] ? tech[p.index].heatInput : null, // kJ/mm
      interpass: p.interpass ? p.interpass.atStart : null,
    });
  }
  return out;
}

// Build the record object from a qualification result.
export function makeRecord(res, opts) {
  const f = res.facts;
  const exams = res.exams.map((e) => ({
    id: e.id, title: e.title, clause: e.clause, verdict: e.verdict,
    specimens: (e.specimens || []).map((s) => ({ id: s.id, label: s.label, where: s.where, verdict: s.verdict })),
    findings: (e.findings || []).filter((x) => !x.ok).slice(0, 6).map((x) => ({ clause: x.clause, name: x.name, measured: r1(x.measured), unit: x.unit || '', limit: x.limit })),
  }));
  const dec = res.deciding;
  return {
    v: 1, id: `Q-${opts.stamp || Date.now()}`, date: res.date, std: res.test.std, stdCode: STANDARDS[res.test.std].code,
    testId: res.test.id, title: res.test.title, method: res.method, methodLabel: METHOD_LABELS[res.method] || res.method,
    verdict: res.verdict, demo: !!res.demo, attempt: opts.attempt || 1,
    welder: { name: opts.name || 'Trainee', id: opts.welderId || '' },
    wps: opts.wps ? opts.wps.id : '', process: res.test.process,
    material: f.material ? f.material.label : '', pNo: f.material ? f.material.pNo : null, iso15608: f.material ? f.material.iso15608 : null,
    t: r1(f.t), D: f.D ? r1(f.D) : null, position: f.position, aws: f.aws, progression: f.progression,
    designation: res.designation || null,
    range: (res.range || []).map((r) => ({ label: r.label, test: String(r1(r.test)), range: r.range, clause: r.clause })),
    conditions: res.conditions.map((c) => ({ text: c.text, ok: c.ok, clause: c.clause, detail: fill(c.detail, c.vars) })),
    exams,
    deciding: dec ? (dec.condition ? { clause: dec.condition.clause, name: dec.condition.text, measured: fill(dec.condition.detail, dec.condition.vars), limit: '' } : { clause: dec.finding.clause, name: dec.finding.name, measured: r1(dec.finding.measured), unit: dec.finding.unit || '', limit: dec.finding.limit, specimen: dec.specimen ? dec.specimen.label : null }) : null,
    validity: res.validity || null,
    retest: res.retest,
    passes: opts.passes || [],
  };
}

// Status of a stored record today (ISO 9.2 confirmation, ASME QW-322.1 continuity, API: none set).
export function recordStatus(r, today) {
  if (r.verdict !== 'pass') return { text: r.verdict === 'invalid' ? 'not valid (test conditions)' : 'failed', ok: false };
  if (!r.validity || !r.validity.confirm) return { text: 'passed; API 1104 sets no expiry (6.8)', ok: true };
  const due = r.validity.confirm;
  if (today > due) return { text: r.std === 'iso' ? 'confirmation was due {d} (9.2)' : 'lapsed {d} unless the process was used (QW-322.1)', vars: { d: due }, ok: false };
  return { text: r.std === 'iso' ? 'confirm by {d} (9.2)' : 'use the process by {d} (QW-322.1)', vars: { d: due }, ok: true };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Printable record (HTML document).
export function recordHTML(r) {
  const head = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.testId)} training record</title><style>
body{font:13px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:24px;max-width:900px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
.banner{border:3px solid #b00;color:#b00;font-weight:700;padding:8px 10px;margin:8px 0 14px;text-align:center}
table{border-collapse:collapse;width:100%;margin:4px 0}td,th{border:1px solid #777;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#eee}.ok{color:#085}.bad{color:#b00}.small{font-size:11px;color:#444}
</style></head><body>`;
  const banner = `<div class="banner">SIMULATOR TRAINING RECORD — NOT A WELDER QUALIFICATION CERTIFICATE UNDER ${esc(r.stdCode)}<br><span class="small">Welded and tested in the WELL EXPERTS VR welding simulator: no examiner, no witnessed test, no real specimens.${r.demo ? ' The weld was a demonstration weld, not the trainee\'s own.' : ''}</span></div>`;
  const verdict = `<p><b>Result:</b> <span class="${r.verdict === 'pass' ? 'ok' : 'bad'}">${r.verdict === 'pass' ? 'PASSED (simulated tests)' : r.verdict === 'invalid' ? 'NOT VALID (test conditions not met)' : 'FAILED'}</span>${r.deciding ? ` — deciding: ${esc(r.deciding.clause)} ${esc(r.deciding.name)} ${esc(r.deciding.measured)} ${esc(r.deciding.unit || '')} (${esc(r.deciding.limit)})${r.deciding.specimen ? `, ${esc(r.deciding.specimen)}` : ''}` : ''}</p>`;
  const rangeTable = r.range.length ? `<table><tr><th>${r.std === 'asme' ? 'Welding variables (QW-350)' : 'Essential variable'}</th><th>${r.std === 'asme' ? 'Actual values' : 'Test piece'}</th><th>${r.std === 'asme' ? 'Range qualified' : 'Range of qualification'}</th><th>Clause</th></tr>${r.range.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.test)}</td><td>${esc(x.range)}</td><td>${esc(x.clause)}</td></tr>`).join('')}</table>` : '<p>No range of qualification: the test was not passed.</p>';
  const examsTable = `<table><tr><th>Examination / test</th><th>Clause</th><th>Result</th><th>Specimens</th></tr>${r.exams.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.clause)}</td><td class="${e.verdict === 'accept' ? 'ok' : 'bad'}">${e.verdict === 'accept' ? 'acceptable' : 'not acceptable'}</td><td>${e.specimens.map((s) => `${esc(s.label)} (${esc(s.where)}): ${s.verdict === 'accept' ? 'acceptable' : 'not acceptable'}`).join('<br>')}</td></tr>`).join('')}</table>`;
  const cond = r.conditions.length ? `<table><tr><th>Test condition</th><th>Clause</th><th>Found</th></tr>${r.conditions.map((c) => `<tr><td>${esc(c.text)}</td><td>${esc(c.clause)}</td><td class="${c.ok ? 'ok' : 'bad'}">${esc(c.detail)}</td></tr>`).join('')}</table>` : '';
  let body = '';
  if (r.std === 'iso') {
    body += `<h1>Welder's qualification test record (layout of ISO 9606-1 Annex A)</h1>${banner}`;
    body += `<table><tr><th>Designation</th><td colspan="3">${esc(r.designation || '—')}</td></tr><tr><th>WPS reference</th><td>${esc(r.wps)}</td><th>Examiner or examining body</th><td>none (simulator)</td></tr><tr><th>Welder's name</th><td>${esc(r.welder.name)}</td><th>Identification</th><td>${esc(r.welder.id)}</td></tr><tr><th>Code / testing standard</th><td>${esc(r.stdCode)}</td><th>Job knowledge</th><td>Not tested</td></tr><tr><th>Date of welding</th><td>${esc(r.date)}</td><th>Test</th><td>${esc(r.testId)} · ${esc(r.methodLabel)}</td></tr></table>`;
    body += verdict + cond + `<h2>Test piece and range of qualification</h2>${rangeTable}<h2>Type of test</h2>${examsTable}<p>Supplementary fillet weld test: not tested. Notch tensile test: not tested.</p>`;
    if (r.validity) body += `<h2>Validity (clause 9)</h2><table><tr><th>Revalidation</th><th>Valid until</th><th></th></tr>${r.validity.rows.map((x) => `<tr><td>${esc(x.method)}</td><td>${esc(x.until)}</td><td>${esc(x.text)}</td></tr>`).join('')}</table><p class="small">${esc(r.validity.note)} Confirmation of the validity every 6 months: next by ${esc(r.validity.confirm)}.</p>`;
  } else if (r.std === 'asme') {
    body += `<h1>Welder performance qualification record (layout of Form QW-484A, ASME IX Nonmandatory Appendix B)</h1>${banner}`;
    body += `<table><tr><th>Welder's name</th><td>${esc(r.welder.name)}</td><th>Identification no.</th><td>${esc(r.welder.id)}</td></tr><tr><th>Identification of WPS followed</th><td>${esc(r.wps)}</td><th>Test coupon / production weld</th><td>Test coupon (simulated)</td></tr><tr><th>Base metal specification</th><td>${esc(r.material)} (P-No. ${esc(r.pNo)})</td><th>Thickness</th><td>${esc(r.t)} mm${r.D ? `, O.D. ${esc(r.D)} mm` : ''}</td></tr><tr><th>Test</th><td colspan="3">${esc(r.testId)} · ${esc(r.methodLabel)} · ${esc(r.date)}</td></tr></table>`;
    body += verdict + cond + `<h2>Testing variables and qualification limits</h2>${rangeTable}<h2>Results</h2>${examsTable}`;
    body += `<p>Film or specimens evaluated by: the simulator. Mechanical tests conducted by: the simulator. Welding supervised by: —</p><p class="small">The certification statement of Form QW-484A is not given: this record does not certify a test made under Section IX.</p>`;
    if (r.validity) body += `<p class="small">${esc(r.validity.note)} ${r.validity.rows.map((x) => `${esc(x.method)}: ${esc(x.text)} (next use of the process by ${esc(x.until)}).`).join(' ')}</p>`;
  } else if (r.std === 'api') {
    body += `<h1>Qualification weld report, welder test (layout of API 1104 Figure 1; record per 6.8)</h1>${banner}`;
    body += `<table><tr><th>Date</th><td>${esc(r.date)}</td><th>Test no.</th><td>${esc(r.id)}</td><th>Test type</th><td>Welder</td></tr><tr><th>Welder</th><td colspan="5">${esc(r.welder.name)} (${esc(r.welder.id)})</td></tr><tr><th>Material grade</th><td colspan="2">${esc(r.material)}</td><th>Outside diameter / wall</th><td colspan="2">${esc(r.D)} mm / ${esc(r.t)} mm</td></tr><tr><th>Joint type</th><td colspan="2">butt, single V, no backing</th><th>Roll or fixed position</th><td colspan="2">${esc(r.aws)}${r.progression ? `, ${r.progression === 'up' ? 'uphill' : 'downhill'}` : ''}</td></tr></table>`;
    if (r.passes.length) body += `<h2>Recorded welding parameters</h2><table><tr><th>Pass</th><th>Process and direction</th><th>Filler classification and diameter</th><th>Interpass temperature</th><th>Voltage</th><th>Amperage</th><th>Travel speed</th><th>Heat input</th></tr>${r.passes.map((p) => `<tr><td>${esc(p.k + 1)} ${esc(p.kind)}</td><td>SMAW ${r.progression === 'up' ? 'uphill' : r.progression === 'down' ? 'downhill' : ''}</td><td>${esc(p.filler)}</td><td>${p.interpass != null ? `${Math.round(p.interpass)} °C` : '—'}</td><td>${r1(p.U)} V</td><td>${Math.round(p.I)} A</td><td>${Math.round(p.speed)} mm/min</td><td>${p.Q != null ? `${r1(p.Q)} kJ/mm` : '—'}</td></tr>`).join('')}</table>`;
    body += verdict + cond + `<h2>Test results</h2>${examsTable}<h2>Essential variables qualified (6.2.2)</h2>${rangeTable}`;
    body += `<p class="small">Tested by: the simulator. Supervised by: —. API 1104 sets no expiry period for a welder qualification; requalification if a question arises about the welder's competence (6.8).</p>`;
  } else {
    body += `<h1>Mock welder test record (AWS D1.1, visual only)</h1>${banner}${verdict}${examsTable}`;
  }
  body += `<h2>Retest</h2><p>${esc(r.retest)}</p><p class="small">Attempt ${esc(r.attempt)}. Record ${esc(r.id)}.</p>`;
  return `${head}${body}</body></html>`;
}

// Offer a file to the viewer: the artifact viewer's downloads capability where the page runs inside it,
// else a browser download.
export async function offerFile(filename, data) {
  // claude.ai artifact: the page's downloads capability asks the viewer to confirm the save
  const c = typeof window !== 'undefined' ? window.claude : null;
  if (c && typeof c.use === 'function') {
    let dl = null;
    try {
      dl = await c.use('downloads');
    } catch {
      dl = null;
    }
    if (dl) {
      try {
        await dl.save({ filename, data });
        return 'saved';
      } catch (e) {
        const code = e && e.code;
        return code === 'declined' || code === 'rate_limited' ? code : 'unavailable';
      }
    }
  }
  // standalone page: an ordinary browser download
  try {
    const blob = new Blob([data], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  } catch {
    return 'unavailable';
  }
}
