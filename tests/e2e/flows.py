# Functional flows on the built page (desktop + IWER): inspector scoring, troubleshoot fix,
# welder qualification (mock test) verdict, multi-pass butt with replay determinism, left-handed mirroring, MR session.
import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
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
  const r = p.regions.find(q => q.id === id); if (!r) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""

async def main():
    httpd = serve(8132)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 480, 'height': 300})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto('http://127.0.0.1:8132/index.html')
        await page.wait_for_timeout(1500)
        click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])

        # ---- Inspector lab: D-1 (undercut on part of the length, ISO 5817 C) ------------------
        await click('main', 'home-inspect'); await click('main', 'ic-D-1')
        truth = await page.evaluate("window.__app.mode.truth.items.map(i => [i.ref, Math.round(i.s0), Math.round(i.s1), i.size])")
        check('D-1 truth has undercut', any(t[0] == '5011' for t in truth), json.dumps(truth))
        uc = next(t for t in truth if t[0] == '5011')
        # scan the undercut zone with the bridge gauge every 5 mm at both toes, as an inspector would
        xs = list(range(uc[1] + 2, uc[2] - 1, 5))
        rd = []
        for x in xs:
            for u in (4, -4):
                r = await page.evaluate(f"(() => {{ const m = window.__app.mode; m.deskKind = 'bridge'; m.deskX = {x}; m.deskU = {u}; m.deskMeasure(); const r = m.readings[0]; return r ? [r.s, r.values.map(v => [v.label, v.value])] : null; }})()")
                if r: rd.append((x, u, r))
        check('bridge gauge readings recorded', len(rd) >= 2 * len(xs) - 2, f'{len(rd)} readings')
        # measure again where the undercut is deepest, so that reading is the latest, then add 5011 at it
        bx, bu, br = max(rd, key=lambda q: q[2][1][0][1])
        await page.evaluate(f"(() => {{ const m = window.__app.mode; m.deskX = {bx}; m.deskU = {bu}; m.deskMeasure(); }})()")
        await click('main', 'addf'); await click('main', 'ft-5011')
        await click('main', 'dec:reject'); await click('main', 'submit')
        sc = await page.evaluate("(() => { const r = window.__app.mode.result; return { phase: window.__app.mode.phase, det: r.detection, ok: r.decisionOk, fc: r.falseCalls, sizing: r.sizing, verdict: window.__app.mode.verdictRes.verdict }; })()")
        check('inspector scoring: reject decision correct', sc['ok'] and sc['verdict'] == 'reject' and sc['phase'] == 'score', json.dumps(sc))
        check('inspector scoring: undercut detected and sized', sc['det'] > 0 and sc['fc'] == 0 and sc['sizing'] == 1, json.dumps(sc))

        # ---- Troubleshoot C1: wrong answer, right answer, replace cylinder, re-weld, fixed ----------
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-trouble'); await click('main', 'ts-C1')
        await click('main', 'cause-volt'); await click('main', 'cause-gas')
        st = await page.evaluate("({ score: window.__app.mode.score, diag: window.__app.mode.diagnosed, empty: window.__app.station.equipment.cylinderEmpty })")
        check('C1 diagnosis scoring', st['score'] == 75 and st['diag'] and st['empty'], json.dumps(st))
        await click('main', 'ts-reweld')
        still = await page.evaluate("window.__app.station.equipment.cylinderEmpty")
        check('C1 fault persists on the new coupon until fixed', still is True)
        await click('gas', 'replace')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); window.__app.simulate(75); })()")
        await click('main', 'w-finish')
        oc = await page.evaluate("(() => { const m = window.__app.mode; return { phase: m.phase, fixed: m.outcome && m.outcome.fixed, eq: m.outcome && m.outcome.equipmentOk, present: m.outcome && m.outcome.present }; })()")
        check('C1 re-weld after fix: problem fixed', oc['phase'] == 'outcome' and oc['fixed'] and oc['eq'], json.dumps(oc))

        # ---- Troubleshoot C1 without fixing: porosity still present ----------------------------------
        await click('main', 'o-list'); await click('main', 'ts-C1'); await click('main', 'cause-gas'); await click('main', 'ts-reweld')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); window.__app.simulate(75); })()")
        await click('main', 'w-finish')
        oc2 = await page.evaluate("(() => { const m = window.__app.mode; return { fixed: m.outcome.fixed, eq: m.outcome.equipmentOk, present: m.outcome.present }; })()")
        check('C1 re-weld without fix: not fixed', (not oc2['fixed']) and (not oc2['eq']), json.dumps(oc2))

        # ---- Welder qualification (mock test): AWS D1.1 visual on a demo fillet ---------------------
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-test'); await click('main', 'q-std:aws'); await click('main', 'q-AWS-135-2F'); await click('main', 'q-start')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); window.__app.simulate(75); })()")
        await click('main', 'w-finish')
        tv = await page.evaluate("(() => { const m = window.__app.mode; return { phase: m.phase, verdict: m.Q && m.Q.verdict, exams: m.Q && m.Q.exams.map(e => e.id) }; })()")
        check('mock test (AWS D1.1 visual) examined', tv['phase'] == 'exam' and tv['verdict'] in ('pass', 'fail') and tv['exams'] == ['vt'], json.dumps(tv))

        # ---- Practice butt PA, 4 passes + replay determinism ---------------------------------------
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-practice'); await click('main', 'p-type:butt'); await click('main', 'p-pos:PA'); await click('main', 'p-start')
        for k in range(4):
            if k: await click('main', 'w-next')
            await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); window.__app.simulate(k_time); })()".replace('k_time', '95'))
        await click('main', 'w-finish')
        r1 = await page.evaluate("(() => { const m = window.__app.mode; const rows = m.R.sum.rows.filter(Boolean); return { n: rows.length, passes: m.R.sum.passes, h: rows.reduce((a, r) => a + (r.h || 0), 0) / rows.length, frames: window.__app.station.frames.length / 12 }; })()")
        check('butt 4 passes welded and evaluated', r1['passes'] == 4 and r1['n'] > 150, json.dumps(r1))
        await click('main', 'r-replay')
        await page.evaluate("window.__app.simulate(200)")
        r2 = await page.evaluate("(() => { const a = window.__app; const s = a.station.record.summary(); const rows = s.rows.filter(Boolean); return { phase: a.mode.phase, n: rows.length, passes: s.passes, h: rows.reduce((x, r) => x + (r.h || 0), 0) / rows.length }; })()")
        check('replay re-simulates the same weld', r2['phase'] == 'results' and r2['n'] == r1['n'] and r2['passes'] == 4 and abs(r2['h'] - r1['h']) < 1e-9, json.dumps(r2))

        # ---- Left-handed mirroring -------------------------------------------------------------------
        await page.evaluate("window.__app.set('hand', 'left')")
        await click('main', 'r-setup'); await click('main', 'p-type:fillet'); await click('main', 'p-pos:PB'); await click('main', 'p-start')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); window.__app.simulate(8); })()")
        lh = await page.evaluate("(() => { const a = window.__app; const st = a.station; const b = st.coupon.bead; let first = -1; for (let i = 0; i < b.n; i++) if (b.has[i]) { first = i; break; } return { mirror: st.mirror, first, x: b.x(first), L: st.joint.L }; })()")
        check('left-handed: weld starts at the right end (mirrored)', lh['mirror'] and lh['x'] > lh['L'] - 40, json.dumps(lh))
        await page.evaluate("window.__app.set('hand', 'right')")

        # ---- Arabic does not break drawing --------------------------------------------------------------
        await page.evaluate("window.__app.set('lang', 'ar')")
        await page.evaluate("window.__app.goHome()")
        for mid in ['home-practice', 'home-trouble', 'home-test', 'home-inspect', 'home-tracking', 'home-settings']:
            await page.evaluate("window.__app.goHome()")
            await click('main', mid)
        await page.evaluate("window.__app.set('lang', 'en')")
        check('no page errors so far', not errors, json.dumps(errors[:3]))
        await b.close()

        # ---- MR session under IWER --------------------------------------------------------------------
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 480, 'height': 300})
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8132/index.html')
        await page.wait_for_timeout(1500)
        ar_ok = await page.evaluate("!document.getElementById('enter-ar').disabled")
        if ar_ok:
            await page.evaluate("window.__app.enterXR('ar')")
            await page.wait_for_timeout(1500)
            mr = await page.evaluate("({ presenting: window.__app.renderer.xr.isPresenting, booth: window.__app.env.booth.visible, bg: window.__app.scene.background === null, mode: window.__app.xrMode })")
            check('MR session: passthrough background, booth hidden', mr['presenting'] and not mr['booth'] and mr['bg'], json.dumps(mr))
        else:
            check('MR session available under IWER', False)
        await b.close()
    httpd.shutdown()
    fails = [n for n, ok in results if not ok]
    print('SUMMARY:', f'{len(results) - len(fails)}/{len(results)} passed', 'FAILED: ' + ', '.join(fails) if fails else '')

asyncio.run(main())
