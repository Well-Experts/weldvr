# XR tools under IWER: wire brush cleans flux-cored slag; inspector gauges read the weld.
import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
T0 = time.time()
res = []
def check(name, ok, info=''):
    res.append((name, ok)); print(f"[{time.time()-T0:6.1f}s] {'PASS' if ok else 'FAIL'} {name} {info}", flush=True)
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
CLICK = """(args) => { const [panel, id] = args; const a = window.__app; const p = a.ui.panels.find(q => q.name === panel); p.invalidate(); p.render(a.ui.rtl);
  const r = p.regions.find(q => q.id === id); if (!r) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""
# place the right controller so that a point given in tool-holder space lands on a world point
PLACE = """(args) => { const [wx, wy, wz, pitch, localTip] = args; const a = window.__app; const R = window.__iwer.controllers.right;
  const V = a.v1.constructor, Q = a.q1.constructor;
  const q = new Q().setFromAxisAngle(new V(1, 0, 0), pitch);
  a.toolHolder.updateMatrix();
  const h = new V(...localTip).applyMatrix4(a.toolHolder.matrix);
  const p = new V(wx, wy, wz).sub(h.applyQuaternion(q));
  R.position.set(p.x, p.y, p.z); R.quaternion.set(q.x, q.y, q.z, q.w); return [p.x, p.y, p.z]; }"""
async def frames(page, n):
    await page.evaluate("(n) => new Promise(res => { const a = window.__app; let k = 0; const prev = a.onBeforeFrame; a.onBeforeFrame = (dt) => { if (prev) prev(dt); if (++k >= n) { a.onBeforeFrame = prev; res(); } }; })", n)
async def main():
    httpd = serve(8133)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 420, 'height': 260})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8133/index.html')
        await page.wait_for_timeout(1500)
        await page.evaluate("window.__app.enterXR('vr')")
        await page.wait_for_timeout(1500)
        click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
        # FCAW-G fillet: demo pass (scripted torch) leaves slag; then brush it with the dominant hand
        await click('main', 'home-practice'); await click('main', 'p-proc:136'); await click('main', 'p-start')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); m.driver.plan.s1 = 80; window.__app.simulate(25); })()")
        f0 = await page.evaluate("window.__app.station.record.cleanFraction()")
        check('FCAW pass leaves slag', f0 < 0.05, f'clean fraction {f0:.2f}')
        await click('main', 'w-brush')
        tool = await page.evaluate("window.__app.tool")
        check('wire brush selected', tool == 'brush')
        # sweep the brush head along the bead surface from x=6 to x=80 mm
        head = await page.evaluate("window.__app.tools.brush.userData.head.toArray()")
        for k in range(26):
            x = 6 + k * 3
            w = await page.evaluate("(x) => { const a = window.__app; const st = a.station; const v = st.surfaceAt(x, 0); const p = st.worldFromSim(x, 0, v + 1.0, a.v2.clone()); return p.toArray(); }", x)
            await page.evaluate(PLACE, [w[0], w[1], w[2], -1.0, head])
            await frames(page, 2)
        f1 = await page.evaluate("window.__app.station.record.cleanFraction()")
        check('brushing removes slag', f1 > 0.6, f'clean fraction {f1:.2f}')
        # Exercises B8 in VR: contact thermometer on the coupon after the root pass
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-exercises'); await click('main', 'ex-B8'); await click('main', 'x-start')
        await page.evaluate("(() => { const a = window.__app; const m = a.mode; m.startDemo(); let t = 0; while (m.phase === 'demo' && t < 300) { a.simulate(5); t += 5; } })()")
        await click('main', 'h-thermo')
        tool = await page.evaluate("window.__app.tool")
        tipL = await page.evaluate("window.__app.tools.thermo.userData.tip.toArray()")
        w = await page.evaluate("(() => { const a = window.__app; const st = a.station; const x = st.joint.L - 40; const v = st.surfaceAt(x, 12); return st.worldFromSim(x, 12, v + 0.5, a.v2.clone()).toArray(); })()")
        await page.evaluate(PLACE, [w[0], w[1], w[2], -1.2, tipL])
        await frames(page, 12)
        th = await page.evaluate("(() => { const a = window.__app; const st = a.station; const x = st.joint.L - 40; return { reading: a.thermoReading, model: st.temperatureAt(x, 12, st.surfaceAt(x, 12)) }; })()")
        check('thermometer probe on the plate reads toward the plate temperature', tool == 'thermo' and th['reading'] is not None and th['reading'] > 40 and th['model'] > th['reading'] - 5, json.dumps(th))
        n0 = await page.evaluate("window.__app.station.readings.length")
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('trigger', 1)")
        await frames(page, 3)
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('trigger', 0)")
        await frames(page, 2)
        n1 = await page.evaluate("window.__app.station.readings.length")
        check('thermometer trigger records the reading', n1 == n0 + 1, f'{n0} -> {n1}')
        # Inspector lab: fillet gauge on D-1, bridge gauge on the undercut zone
        await page.evaluate("window.__app.goHome()")
        await click('main', 'home-inspect'); await click('main', 'ic-D-1')
        tip = [0, 0, 0]
        w = await page.evaluate("(() => { const a = window.__app; const st = a.station; const x = st.joint.tab + 100; const v = st.surfaceAt(x, 4); return st.worldFromSim(x, 4, v + 0.5, a.v2.clone()).toArray(); })()")
        await page.evaluate("window.__app.setTool('fillet')")
        await page.evaluate(PLACE, [w[0], w[1], w[2], -1.2, tip])
        await frames(page, 3)
        m = await page.evaluate("(() => { const m = window.__app.lastMeasure; return m && { kind: m.kind, s: Math.round(m.sEval), values: m.values.map(v => [v.key, v.value]) }; })()")
        check('fillet gauge reads leg and throat on the weld', bool(m) and m['kind'] == 'fillet' and len(m['values']) == 3, json.dumps(m))
        # trigger on the gauge hand records a reading
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('trigger', 1)")
        await frames(page, 3)
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('trigger', 0)")
        await frames(page, 2)
        n = await page.evaluate("window.__app.mode.readings.length")
        check('gauge-hand trigger records a reading', n >= 1, f'{n} readings')
        # A button switches to the bridge gauge
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('a-button', 1)")
        await frames(page, 3)
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('a-button', 0)")
        await frames(page, 3)
        m2 = await page.evaluate("(() => { const m = window.__app.lastMeasure; return { tool: window.__app.tool, kind: m && m.kind, values: m && m.values.map(v => [v.key, v.value]) }; })()")
        check('A switches to the bridge gauge, which reads undercut', m2['tool'] == 'bridge' and m2['kind'] == 'bridge' and m2['values'] and m2['values'][0][0] == 'undercut', json.dumps(m2))
        check('no page errors', not errors, json.dumps(errors[:3]))
        await b.close()
    httpd.shutdown()
    fails = [n for n, ok in res if not ok]
    print('SUMMARY:', f'{len(res) - len(fails)}/{len(res)} passed', ('FAILED: ' + ', '.join(fails)) if fails else '')
asyncio.run(main())
