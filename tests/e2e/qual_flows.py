# Welder qualification flows on the built page (desktop): the test list per standard; an ISO 9606-1 pipe test
# piece welded by demonstration passes with the stop and restart of 6.3, examined (visual, radiography), its
# radiograph in the test lab, the training record saved, listed and downloaded; an ASME IX TIG fillet coupon
# (restart near the centre, QW-182 fracture and QW-184 macro); a test piece without the required restart is
# not valid; a failed ISO test offers the clause 8 retest; Arabic draws every qualification screen.
import asyncio, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
T0 = time.time()
results = []
def check(name, ok, info=''):
    results.append((name, ok))
    print(f"[{time.time()-T0:6.1f}s] {'PASS' if ok else 'FAIL'} {name} {info}", flush=True)
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

CLICK = """(args) => { const [panel, id] = args; const a = window.__app; const p = a.ui.panels.find(q => q.name === panel); p.invalidate(); p.render(a.ui.rtl);
  const r = p.regions.find(q => q.id === id); if (!r || r.disabled) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""
RENDER = """(name) => { const a = window.__app; const p = a.ui.panels.find(q => q.name === name); p.invalidate(); p.render(a.ui.rtl); return p.regions.map(r => r.id); }"""
# every pass by the demonstration welder, slag removed after each run
WELDALL = """() => { const a = window.__app; const m = a.mode; const st = a.station; const n = st.joint.passPlan.length; const out = [];
  for (let k = 0; k < n; k++) {
    if (k) { const p = a.main; p.invalidate(); p.render(false); const r = p.regions.find(q => q.id === 'w-next'); if (r && !r.disabled) r.onClick(); }
    m.startDemo(); let t = 0; while (m.phase === 'demo' && t < 900) { a.simulate(0.5, 1 / 24); t += 0.5; }
    if (st.record.pass.slagProcess) st.cleanAll();
    out.push(t);
  }
  return out; }"""
RESULT = """(() => { const m = window.__app.mode; const Q = m.Q; if (!Q) return { phase: m.phase };
  return { phase: m.phase, verdict: Q.verdict, deciding: Q.deciding && (Q.deciding.finding || Q.deciding.condition), exams: Q.exams.map(e => [e.id, e.verdict, (e.specimens || []).length]),
    cond: Q.conditions.map(c => [c.id, c.ok, c.detail]), designation: Q.designation || null, range: (Q.range || []).length, validity: Q.validity ? Q.validity.rows.length : null, attempt: m.attempt }; })()"""

async def main():
    httpd = serve(8141)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 480, 'height': 300}, accept_downloads=True)
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto('http://127.0.0.1:8141/index.html')
        await page.wait_for_timeout(1500)
        click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
        render = lambda name: page.evaluate(RENDER, name)
        await page.evaluate("localStorage.removeItem('wellexperts.weldvr.qualrecords.v1')")

        # ---- the test list per standard -----------------------------------------------------------------
        await click('main', 'home-test')
        counts = {}
        for std in ['iso', 'asme', 'api', 'aws']:
            await click('main', f'q-std:{std}')
            ids = await render('main')
            counts[std] = len([i for i in ids if i.startswith('q-') and i.split('-')[1].upper() == std.upper()])
        check('qualification list: tests for ISO 9606-1, ASME IX, API 1104 and AWS D1.1', counts['iso'] >= 6 and counts['asme'] >= 6 and counts['api'] >= 3 and counts['aws'] >= 2, json.dumps(counts))

        # ---- ISO 9606-1 pipe 5G (PH): demo passes with the stop/restart of 6.3, radiography ----------------
        await click('main', 'q-std:iso'); await click('main', 'q-ISO-111-T-BW-PH')
        ids = await render('main')
        check('ISO brief offers radiography and fracture tests', 'q-method:rt' in ids and 'q-method:fracture' in ids, json.dumps([i for i in ids if i.startswith('q-method')]))
        await click('main', 'q-method:rt')
        await page.evaluate("window.__weldSeed = 101")
        await click('main', 'q-start')
        live = await page.evaluate("(() => { const m = window.__app.mode; return { phase: m.phase, cond: m.liveConditions().map(c => c.ok) }; })()")
        check('test weld screen with the 6.3 conditions open', live['phase'] == 'weld' and live['cond'][:2] == [False, False], json.dumps(live))
        await page.evaluate(WELDALL)
        live2 = await page.evaluate("window.__app.mode.liveConditions().map(c => c.ok)")
        check('demonstration passes make the stop and restart in the root and capping runs', live2[:2] == [True, True], json.dumps(live2))
        await click('main', 'w-finish')
        r = await page.evaluate(RESULT)
        check('ISO 5G test piece examined: conditions met, visual and radiography', r['phase'] == 'exam' and r['cond'][0][1] and [e[0] for e in r['exams']] == ['vt', 'rt'], json.dumps(r))
        if r.get('verdict') == 'pass':
            check('pass: designation, range (Tables 3-11) and validity (9.3 a, b, c)', r['designation'].startswith('ISO 9606-1 111 T BW') and r['range'] >= 8 and r['validity'] == 3, json.dumps(r))
        else:
            check('ISO 5G verdict names the deciding finding', r['deciding'] is not None, json.dumps(r))
        lab = await page.evaluate("(() => { const a = window.__app; return { visible: a.lab.visible, film: !!(a.labView && a.labView.result) }; })()")
        await render('lab')
        check('test lab shows the radiograph', lab['visible'] and lab['film'], json.dumps(lab))
        for tab in ['summary', 'visual', 'tests', 'range', 'record']:
            await click('main', f'q-tab:{tab}')
        await page.evaluate("(() => { const a = window.__app; a.labView.overlay = true; })()"); await render('lab')
        await click('main', 'q-save')
        recs = await page.evaluate("JSON.parse(localStorage.getItem('wellexperts.weldvr.qualrecords.v1') || '[]').map(r => [r.testId, r.verdict, r.demo, r.welder.id])")
        check('training record saved on the device', len(recs) == 1 and recs[0][0] == 'ISO-111-T-BW-PH' and recs[0][2] is True and recs[0][3].startswith('T-'), json.dumps(recs))
        async with page.expect_download() as dl:
            await click('main', 'q-dl')
        d = await dl.value
        path = await d.path()
        html = open(path, encoding='utf-8').read()
        check('record downloads as HTML in the ISO 9606-1 Annex A layout with the not-a-certificate banner', 'SIMULATOR TRAINING RECORD' in html and 'ISO 9606-1' in html and d.suggested_filename.endswith('.html'), d.suggested_filename)
        await click('main', 'q-list'); await click('main', 'q-records')
        ids = await render('main')
        check('training records list', 'q-rec-0' in ids and 'q-rec-back' in ids, json.dumps(ids[:8]))
        await click('main', 'q-rec-back')

        # ---- ASME IX GTAW 2F: restart near the centre, QW-182 fracture and QW-184 macro --------------------
        await click('main', 'q-std:asme'); await click('main', 'q-ASME-GTAW-2F')
        await page.evaluate("window.__weldSeed = 202")
        await click('main', 'q-start')
        await page.evaluate(WELDALL)
        await click('main', 'w-finish')
        r = await page.evaluate(RESULT)
        fx = next((e for e in r.get('exams', []) if e[0] == 'fillet'), None)
        check('ASME TIG fillet: restart in the centre section, fracture and macro specimens', r['cond'][0][1] and (r['verdict'] == 'fail' and r['exams'][0][1] == 'reject' or (fx is not None and fx[2] == 2)), json.dumps(r))

        # ---- ISO fillet without a stop and restart: not valid (6.3) ------------------------------------------
        await click('main', 'q-list'); await click('main', 'q-std:iso'); await click('main', 'q-ISO-135-P-FW-PB')
        await page.evaluate("window.__weldSeed = 303")
        await click('main', 'q-start')
        # the plain demonstration plan (no planned stop) of the practice modes
        await page.evaluate("(() => { const m = window.__app.mode; const base = Object.getPrototypeOf(Object.getPrototypeOf(m)).demoPlanFor; m.demoPlanFor = function () { return base.call(this); }; })()")
        await page.evaluate(WELDALL)
        await click('main', 'w-finish')
        r = await page.evaluate(RESULT)
        check('no stop and restart: test piece not valid (6.3), nothing tested', r['verdict'] == 'invalid' and r['deciding']['clause'] == '6.3' and r['exams'] == [], json.dumps(r))
        await render('lab')

        # ---- ISO fillet welded too fast: fails, clause 8 retest ----------------------------------------------
        await click('main', 'q-new')
        await page.evaluate("window.__weldSeed = 404")
        await page.evaluate("(() => { const m = window.__app.mode; delete m.demoPlanFor; const own = Object.getPrototypeOf(m).demoPlanFor; m.demoPlanFor = function () { return { ...own.call(this), speedFactor: 1.9 }; }; })()")
        await page.evaluate(WELDALL)
        await click('main', 'w-finish')
        r = await page.evaluate(RESULT)
        rs = await page.evaluate("(() => { const s = window.__app.mode.retestState(); return s && { can: s.can, label: s.label }; })()")
        check('fast travel fails the test with the deciding clause', r['verdict'] == 'fail' and r['deciding'] is not None, json.dumps(r))
        check('clause 8: one retest offered', rs is not None and rs['can'] and 'clause 8' in rs['label'], json.dumps(rs))
        ok = await click('main', 'q-retest')
        st = await page.evaluate("(() => { const m = window.__app.mode; return { phase: m.phase, attempt: m.attempt }; })()")
        check('retest starts a new test piece (attempt 2)', ok and st['phase'] == 'weld' and st['attempt'] == 2, json.dumps(st))

        # ---- Arabic: every qualification screen draws -------------------------------------------------------
        await page.evaluate("window.__app.set('lang', 'ar')")
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-test')
        for std in ['iso', 'asme', 'api', 'aws']:
            await click('main', f'q-std:{std}')
        await click('main', 'q-std:api'); await click('main', 'q-API-SMAW-6G'); await render('main')
        await click('main', 'q-back'); await click('main', 'q-records'); await render('main')
        rtl = await page.evaluate("window.__app.ui.rtl")
        await page.evaluate("window.__app.set('lang', 'en')")
        check('Arabic: qualification screens draw right-to-left', rtl is True)
        check('no page errors', not errors, json.dumps(errors[:3]))
        await b.close()
    httpd.shutdown()
    failed = [n for n, ok in results if not ok]
    print('FAILURES:', failed if failed else 'none')

asyncio.run(main())
