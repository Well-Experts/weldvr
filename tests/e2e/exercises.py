# Exercises mode on the built page (desktop): every drill run with demo passes through the real UI
# flow (brief, start, next bead/pass, demo with cleaning and interpass check, finish), then the
# drill criteria; plus the thermometer, accelerated cooling and the thermal-camera view.
import asyncio, os, http.server, threading, functools, time, json, sys
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

# run the demo of the current pass to the end (simulated time, no rendering)
DEMO = """() => { const a = window.__app; const m = a.mode; m.startDemo(); let t = 0;
  while (m.phase === 'demo' && t < 400) { a.simulate(5); t += 5; } return { phase: m.phase, t }; }"""

ONLY = [a for a in sys.argv[1:] if not a.startswith('/')]  # optional list of drill ids (a path argument is an output folder)

async def main():
    httpd = serve(8133)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 480, 'height': 300})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto('http://127.0.0.1:8133/index.html')
        await page.wait_for_timeout(1500)
        click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])

        ids = await page.evaluate("(() => { window.__app.goHome(); return true; })()")
        ok = await click('main', 'home-exercises')
        lst = await page.evaluate("window.__app.mode.id + ':' + window.__app.mode.phase")
        check('Exercises tile opens the drill list', ok and lst == 'exercises:list', lst)
        drills = await page.evaluate("(() => { const m = window.__app.mode; return m.constructor.name && window.__app.mode.progress ? true : false; })()")
        # 'id@process' runs the drill with that process (default: the drill's first process); the SMAW runs
        # check the demo's chipping and brushing between runs
        all_ids = ['B1-S', 'B1-P', 'B2', 'B3-2F', 'B3-3F', 'B3-4F', 'B4-1G', 'B4-2G', 'B4-3G', 'B4-4G', 'B7', 'B8', 'B8@111', 'B1-P@111', 'B6-R5', 'B6-RD', 'B6-1G', 'B6-2G', 'B6-5G', 'B6-6G']
        for item in (ONLY or all_ids):
            ex_id, _, proc_sel = item.partition('@')
            await page.evaluate("window.__app.goHome()")
            await click('main', 'home-exercises')
            if ex_id.startswith('B6'): await click('main', 'ex-family:pipe')  # pipe drills are on their own tab
            ok1 = await click('main', f'ex-{ex_id}')
            if proc_sel: ok1 = ok1 and await click('main', f'x-proc:{proc_sel}')
            ok2 = await click('main', 'x-start')
            info = await page.evaluate("(() => { const m = window.__app.mode; return { phase: m.phase, passes: m.ex.passes, proc: window.__app.station.session.settings.process, lane: window.__app.station.record.pass.lane ?? null, type: window.__app.station.joint.type }; })()")
            if not (ok1 and ok2 and info['phase'] == 'weld'):
                check(f'{ex_id}: brief and start', False, json.dumps(info))
                continue
            t_start = time.time()
            for k in range(info['passes']):
                if k:
                    nxt = await click('main', 'x-next')
                    if not nxt:
                        check(f'{ex_id}: next pass button enabled after pass {k}', False)
                        break
                d = await page.evaluate(DEMO)
                if d['phase'] != 'weld':
                    check(f'{ex_id}: demo pass {k + 1} finished', False, json.dumps(d))
                    break
            # FCAW: chip the last run before inspection (desktop instant cleaning)
            await click('main', 'x-chip')
            fin = await click('main', 'x-finish')
            res = await page.evaluate("""(() => { const m = window.__app.mode; if (!m.R || !m.R.drill) return null; const r = m.R.drill.res;
              return { met: r.met, total: r.total, tab: m.R.tab, noCode: !!m.R.noCode, failed: r.items.filter(i => !i.ok).map(i => i.id + '=' + i.measured),
                       heat: m.R.heat.map(h => h.t85 ? +h.t85.t85.toFixed(1) : null), ip: m.R.heat.map(h => h.interpass ? Math.round(h.interpass.max) : null), readings: window.__app.station.readings.length }; })()""")
            check(f'{ex_id} ({info["proc"]}): demo weld meets every drill criterion', bool(fin and res and res['met'] == res['total']), json.dumps(res) + f' {time.time() - t_start:.0f}s')
            # replay of drills with lanes, cleaning, interpass waits and readings re-simulates the same weld
            if ex_id in ('B1-P', 'B8'):
                SIG = "(() => { const rec = window.__app.station.record; let a = 0, h = 0, n = 0; for (let k = 0; k < rec.passes.length; k++) for (let i = 0; i < rec.joint.n; i++) { const p = rec.passes[k]; if (p.area[i] > 0.05) { a += p.area[i]; const s = rec.sample(k, i); h += (s.h || 0) + (s.wb || 0); n++; } } return { a: +a.toFixed(6), h: +h.toFixed(6), n, passes: rec.passes.length, t: +rec.time.toFixed(3) }; })()"
                s1 = await page.evaluate(SIG)
                await click('main', 'r-replay')
                await page.evaluate("(() => { const a = window.__app; let t = 0; while (a.mode.phase === 'replay' && t < 2000) { a.simulate(10); t += 10; } })()")
                s2 = await page.evaluate(SIG)
                check(f'{item}: replay re-simulates the same weld', s1['a'] == s2['a'] and s1['h'] == s2['h'] and s1['n'] == s2['n'], json.dumps({'live': s1, 'replay': s2}))
            # results screen draws in every tab
            for tab in ['drill', 'code', 'tech', 'safety']:
                await page.evaluate(f"(() => {{ const m = window.__app.mode; m.R.tab = '{tab}'; window.__app.main.invalidate(); window.__app.main.render(false); }})()")
            # macro section of the coupon
            await page.evaluate("(() => { const a = window.__app; a.showSection(a.station.joint.tab + a.station.joint.evalL / 2); a.section.render(false); })()")
            sec = await page.evaluate("(() => { const a = window.__app; return a.section.visible; })()")
            if not sec:
                check(f'{ex_id}: macro section', False)
            await page.evaluate("window.__app.showSection(null)")

        # ---- heat tools on B8: thermometer reading, accelerated cooling, thermal view -------------
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-exercises'); await click('main', 'ex-B8'); await click('main', 'x-proc:136'); await click('main', 'x-start')
        await page.evaluate(DEMO)
        await click('main', 'x-chip')
        r0 = await page.evaluate("(() => { const a = window.__app; const st = a.station; const m = a.mode; m.measX = st.joint.L - 30; m.deskTemperature(); const r = st.readings[st.readings.length - 1]; return { T: r.T, n: st.readings.length, t: st.record.time }; })()")
        check('desktop thermometer records a hot reading after the root', r0['T'] > 100, json.dumps(r0))
        # x30 cooling: the frame loop applies it; run frames in the page
        await click('main', 'h-cool:30')
        acc = await page.evaluate("window.__app.coolAccel")
        # drive 40 frames of 50 ms through the app's frame loop (the headless page renders slowly)
        await page.evaluate("(() => { const a = window.__app; a.renderer.setAnimationLoop(null); let t = performance.now(); a.timer.update(t); for (let k = 0; k < 40; k++) { t += 50; a.frame(t, null); } a.renderer.setAnimationLoop((tt, f) => a.frame(tt, f)); })()")
        r1 = await page.evaluate("(() => { const a = window.__app; const st = a.station; const m = a.mode; m.deskTemperature(); const r = st.readings[st.readings.length - 1]; return { T: r.T, t: st.record.time, accel: a.coolAccel, cools: st.events.filter(e => e.type === 'cool').length }; })()")
        check('cooling x30 advances coupon time and cools the joint', acc == 30 and r1['t'] - r0['t'] > 25 and r1['T'] < r0['T'] - 20 and r1['cools'] > 0, json.dumps({ 'before': r0, 'after': r1 }))
        await click('main', 'h-view:true')
        tv = await page.evaluate("(() => { const a = window.__app; return { on: a.thermalView, u: a.station.coupon.view.uniforms.thermView.value }; })()")
        check('thermal camera view toggles the coupon shader uniform', tv['on'] and tv['u'] == 1, json.dumps(tv))
        await click('main', 'h-view:false')
        await click('main', 'h-cool:1')

        # ---- progress is kept for the list --------------------------------------------------------
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-exercises')
        pr = await page.evaluate("(() => { const m = window.__app.mode; return Object.keys(m.progress).length; })()")
        check('best results are stored for the drill list', pr >= 1, str(pr))

        # ---- Arabic draws every exercise screen -----------------------------------------------------
        await page.evaluate("window.__app.set('lang', 'ar')")
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-exercises'); await click('main', 'ex-B7'); await click('main', 'x-start')
        await page.evaluate("(() => { window.__app.main.invalidate(); window.__app.main.render(true); })()")
        await page.evaluate("window.__app.set('lang', 'en')")
        check('no page errors', not errors, json.dumps(errors[:3]))
        await b.close()
    httpd.shutdown()
    fails = [n for n, ok in results if not ok]
    print('SUMMARY:', f'{len(results) - len(fails)}/{len(results)} passed', 'FAILED: ' + ', '.join(fails) if fails else '')

asyncio.run(main())
