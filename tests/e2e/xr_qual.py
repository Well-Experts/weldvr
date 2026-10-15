# Welder qualification in emulated XR (IWER, Meta Quest 3 with Touch Plus controllers): the ISO 9606-1 MAG
# fillet test piece welded with the tracked gun by a scripted hand (no demonstration pass in the headset): a
# short run inside the examination length with a stop and a restart in the crater (6.3, recognised live), then
# submitted and examined (the part-welded test piece fails the visual examination), the record saved on the
# headset and no download offered. Emulated XR renders slowly, so the run is short and the XR framebuffer is
# scaled down.
import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

CLICK = """(args) => { const [panel, id] = args; const a = window.__app; const p = a.ui.panels.find(q => q.name === panel); p.invalidate(); p.render(a.ui.rtl);
  const r = p.regions.find(q => q.id === id); if (!r || r.disabled) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""

async def main():
    httpd = serve(8144)
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 900, 'height': 500})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8144/index.html')
        await page.wait_for_timeout(2000)
        await page.evaluate("window.__app.renderer.xr.setFramebufferScaleFactor(0.25)")
        await page.evaluate("window.__app.enterXR('vr')")
        await page.wait_for_timeout(1500)
        pres = await page.evaluate("window.__app.renderer.xr.isPresenting")
        log('presenting', pres)
        if not pres: fails.append('not presenting')
        click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
        await click('main', 'home-test'); await click('main', 'q-std:iso'); await click('main', 'q-ISO-135-P-FW-PB')
        await page.evaluate("window.__weldSeed = 77")
        await click('main', 'q-start')
        await page.wait_for_timeout(500)
        ids = await page.evaluate("(() => { const a = window.__app; a.main.invalidate(); a.main.render(a.ui.rtl); return a.main.regions.map(r => r.id); })()")
        log('weld screen regions', [i for i in ids if i.startswith('w-')])
        if 'w-demo' in ids: fails.append('demonstration pass offered in the headset')
        # helmet down (B on the gun hand), then the scripted hand welds along the joint
        await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
        await page.wait_for_timeout(800)
        down = await page.evaluate("window.__app.helmet.down")
        if not down:
            await page.evaluate("""() => new Promise(res => { const a = window.__app; const R = window.__iwer.controllers.right; let n = 0;
                R.updateButtonValue('b-button', 1);
                a.onBeforeFrame = () => { n++; if (n === 3) R.updateButtonValue('b-button', 0); if (n > 5) { a.onBeforeFrame = null; res(); } }; })""")
            await page.wait_for_timeout(300)
        log('helmet down', await page.evaluate("window.__app.helmet.down"))
        # from 30 mm to the stop at 38 mm (crater pause 0.7 s, trigger released 1 s), restart in the crater, on to
        # 46 mm with a crater pause at the end
        await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const j = a.station.joint;
            const w = a.station.windows(); let s = 30, t = 0, phase = 'start', pt = 0;
            a.onBeforeFrame = (dt) => { t += dt; pt += dt; let trig = 1;
              if (phase === 'start') { if (pt > 0.4) { phase = 'weld'; pt = 0; } }
              else if (phase === 'weld') { s += w.speedTarget * dt; if (s >= 38 && !window.__stopped) { phase = 'crater'; pt = 0; window.__stopped = true; } else if (s >= 46) { phase = 'end'; pt = 0; } }
              else if (phase === 'crater') { if (pt > 0.7) { phase = 'off'; pt = 0; } }
              else if (phase === 'off') { trig = 0; if (pt > 1.0) { phase = 'weld'; pt = 0; } }
              else if (phase === 'end') { if (pt > 0.7) { phase = 'done'; } }
              if (phase === 'done') trig = 0;
              const pose = a.gunPoseFor(s, 0, 42, 5, 17);
              R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
              R.updateButtonValue('trigger', trig);
              window.__robot = { s: +s.toFixed(1), phase, t: +t.toFixed(1) };
            }; }""")
        for k in range(600):
            await page.wait_for_timeout(1000)
            r = await page.evaluate("window.__robot")
            if r and r['phase'] == 'done': break
        log('robot', r)
        await page.wait_for_timeout(500)
        await page.evaluate("window.__app.onBeforeFrame = null")
        live = await page.evaluate("window.__app.mode.liveConditions().map(c => [c.text, c.ok])")
        log('live conditions', live)
        if not live[0][1]: fails.append('the stop and restart in the run was not recognised')
        await page.screenshot(path=f'{OUT}/xq1_weld.png', timeout=120000)
        await click('main', 'w-finish')
        await page.wait_for_timeout(800)
        r = await page.evaluate("""(() => { const a = window.__app; const m = a.mode; const Q = m.Q; return { phase: m.phase, verdict: Q && Q.verdict,
            deciding: Q && Q.deciding && (Q.deciding.finding || Q.deciding.condition), exams: Q && Q.exams.map(e => [e.id, e.verdict, (e.specimens || []).length]),
            cond: Q && Q.conditions.map(c => [c.id, c.ok]), lab: a.lab.visible, demo: Q && Q.demo }; })()""")
        log('result', json.dumps(r))
        if r['phase'] != 'exam' or r['verdict'] not in ('pass', 'fail') or not r['cond'][0][1]: fails.append('no examination result with the 6.3 condition met: ' + json.dumps(r))
        if r['demo']: fails.append('the record says a demonstration pass was used')
        # helmet up (B) and look at the panels and the test lab
        await page.evaluate("""() => new Promise(res => { const a = window.__app; const R = window.__iwer.controllers.right; let n = 0;
            R.updateButtonValue('b-button', 1);
            a.onBeforeFrame = () => { n++; if (n === 3) R.updateButtonValue('b-button', 0); if (n > 5) { a.onBeforeFrame = null; res(); } }; })""")
        await page.evaluate("window.__iwer.quaternion.set(-0.1305, 0, 0, 0.9914)")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/xq2_exam.png', timeout=120000)
        if r['exams'] and len(r['exams']) > 1 and not r['lab']: fails.append('test lab not shown after the tests')
        await click('main', 'q-tab:record'); await click('main', 'q-save')
        n = await page.evaluate("JSON.parse(localStorage.getItem('wellexperts.weldvr.qualrecords.v1') || '[]').length")
        log('records', n)
        if n < 1: fails.append('record not saved in XR')
        ids = await page.evaluate("(() => { const a = window.__app; a.main.invalidate(); a.main.render(a.ui.rtl); return a.main.regions.map(r => r.id); })()")
        if 'q-dl' in ids: fails.append('download offered in the headset')
        if errors: fails.append('page errors: ' + json.dumps(errors[:3]))
        await b.close()
    httpd.shutdown()
    print('FAILURES:', fails if fails else 'none')

asyncio.run(main())
