# SMAW (111) flows on the built page.
#  Desktop: Practice set-up with the electrode choice, a 4-pass butt weld by the scripted welder
#  (electrode changes, chip-and-brush between passes), results, replay determinism, panels.
#  XR (IWER): touch-and-lift strike with the electrode holder, burn-off, electrode change with the
#  A button (dry gloves: no shock; wet gloves: electric shock incident), chipping hammer blows.
import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
T0 = time.time()
results = []
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def check(name, ok, info=''):
    results.append((name, ok))
    log('PASS' if ok else 'FAIL', name, info)
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

CLICK = """(args) => { const [panel, id] = args; const a = window.__app; const p = a.ui.panels.find(q => q.name === panel); p.invalidate(); p.render(a.ui.rtl);
  const r = p.regions.find(q => q.id === id); if (!r) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""

async def desktop(b):
    page = await b.new_page(viewport={'width': 900, 'height': 560})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.goto('http://127.0.0.1:8138/index.html')
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    await click('main', 'home-practice')
    ok = await click('main', 'p-proc:111')
    ok = ok and await click('main', 'p-elec:E7018') and await click('main', 'p-dia:3.2')
    check('practice offers SMAW with electrode and diameter', ok)
    await click('main', 'p-type:butt'); await click('main', 'p-pos:PA')
    await page.screenshot(path=f'{OUT}/m1_setup.png', timeout=120000)
    await click('main', 'p-start')
    st = await page.evaluate("""() => { const a = window.__app; const s = a.station.session.settings; const w = a.mode.wps();
        return { holder: a.gun === a.stinger, proc: s.process, el: s.electrode, dia: s.dia, I: s.current, pol: s.polarity, range: w.ranges.current, L: a.station.electrode.L, inWps: a.mode.inWps(s) }; }""")
    check('SMAW coupon loaded with the electrode holder and the WPS current', st['holder'] and st['proc'] == '111' and st['range'] == [100, 140] and st['inWps'], json.dumps(st))
    # machine panel: current stepper and polarity
    await click('machine', 'current:+')
    i2 = await page.evaluate("window.__app.station.session.settings.current")
    await click('machine', 'pol:AC')
    pol = await page.evaluate("[window.__app.station.session.settings.polarity, window.__app.mode.inWps(window.__app.station.session.settings)]")
    check('machine panel sets current (5 A steps) and polarity; AC is outside this WPS', i2 == st['I'] + 5 and pol[0] == 'AC' and pol[1] is False, f'{i2} {pol}')
    await click('machine', 'pol:DCEP'); await click('machine', 'current:-')
    # 4 passes by the scripted welder, chip and brush between passes
    for k in range(4):
        if k:
            await click('main', 'w-chip')
            await click('main', 'w-next')
        await page.evaluate("(() => { const m = window.__app.mode; m.startDemo(); })()")
        if k == 0:
            await page.wait_for_timeout(2500)
            await page.screenshot(path=f'{OUT}/m2_demo.png', timeout=120000)
        await page.evaluate("window.__app.simulate(230)")
    ev = await page.evaluate("(() => { const st = window.__app.station; return { changes: st.events.filter(e => e.type === 'electrode').length, cleans: st.events.filter(e => e.type === 'clean').length, starts: st.record.passes.map(p => p.starts.length) }; })()")
    check('electrode changes recorded during the passes', ev['changes'] >= 4 and ev['cleans'] == 3, json.dumps(ev))
    await click('main', 'w-finish')
    r1 = await page.evaluate("(() => { const m = window.__app.mode; const rows = m.R.sum.rows.filter(Boolean); return { phase: m.phase, n: rows.length, passes: m.R.sum.passes, h: rows.reduce((a, r) => a + (r.h || 0), 0) / rows.length, slag: m.R.sum.internal.filter(f => f.type === 'slag').length, strikes: m.R.sum.arcStrikes.length }; })()")
    check('4-pass SMAW butt evaluated: no slag between cleaned passes, no arc strikes', r1['passes'] == 4 and r1['n'] > 150 and r1['slag'] == 0 and r1['strikes'] == 0, json.dumps(r1))
    await page.wait_for_timeout(600)
    await page.screenshot(path=f'{OUT}/m3_results.png', timeout=120000)
    await click('main', 'r-replay')
    await page.evaluate("window.__app.simulate(520)")
    r2 = await page.evaluate("(() => { const a = window.__app; const s = a.station.record.summary(); const rows = s.rows.filter(Boolean); return { phase: a.mode.phase, n: rows.length, passes: s.passes, h: rows.reduce((x, r) => x + (r.h || 0), 0) / rows.length }; })()")
    check('SMAW replay re-simulates the same weld (electrode changes replayed)', r2['phase'] == 'results' and r2['n'] == r1['n'] and r2['passes'] == 4 and abs(r2['h'] - r1['h']) < 1e-9, json.dumps(r2))
    # macro section through the 4 passes
    await click('main', 'r-section')
    await page.wait_for_timeout(800)
    await page.screenshot(path=f'{OUT}/m4_section.png', timeout=120000)
    # Exercises: SMAW electrode choice in a brief
    await page.evaluate("window.__app.goHome()")
    await click('main', 'home-exercises'); await click('main', 'ex-B3-2F')
    okx = await click('main', 'x-proc:111') and await click('main', 'x-elec:E6013')
    w = await page.evaluate("window.__app.mode.smawSel")
    check('exercise brief offers SMAW electrodes', okx and w['electrode'] == 'E6013', json.dumps(w))
    await page.wait_for_timeout(500)
    await page.screenshot(path=f'{OUT}/m5_brief.png', timeout=120000)
    check('no page errors (desktop)', not errors, '; '.join(errors[:5]))
    await page.close()

async def xr(b):
    page = await b.new_page(viewport={'width': 900, 'height': 500})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.add_init_script(path=IWER)
    await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
    await page.goto('http://127.0.0.1:8138/index.html')
    await page.wait_for_timeout(2000)
    await page.evaluate("window.__app.enterXR('vr')")
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    await click('main', 'home-practice'); await click('main', 'p-proc:111'); await click('main', 'p-type:fillet'); await click('main', 'p-pos:PB')
    await click('main', 'p-start')
    await page.evaluate("window.__app.helmet.setDown(true)")
    await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
    # robot (frame-based: the emulated session runs at about one frame per second here): approach,
    # touch for two frames, lift to the arc length and travel for 30 frames, then lift out of the arc
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right;
        const w = a.station.windows(); let s = 10; let f = 0; let onF = 0; const arc = (w.stickOut[0] + w.stickOut[1]) / 2;
        a.onBeforeFrame = (dt) => { f++;
          let ct = 15;
          if (f > 8 && f <= 10) ct = -1.5; else if (f > 10) ct = arc;
          const on = a.station.lastState && a.station.lastState.arcOn;
          if (on) { s += w.speedTarget * dt; onF++; }
          if (onF > 30) ct = 45;
          const pose = a.gunPoseFor(s, 0, 42, 20, ct);
          R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          window.__robot = { s, f, onF, on: !!on };
          if (onF > 30 && !on) a.onBeforeFrame = null;
        }; }""")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f'{OUT}/m6_xr_arc.png', timeout=120000)
    for _ in range(240):
        done = await page.evaluate("window.__app.onBeforeFrame == null")
        if done: break
        await page.wait_for_timeout(1000)
    await page.wait_for_timeout(800)
    xs = await page.evaluate("""() => { const a = window.__app; const p = a.station.record.pass; let n = 0; for (const v of p.area) if (v > 0.05) n++;
        const E = a.station.electrode; return { samples: n, starts: a.station.log.arcStarts, sticks: a.station.log.sticks || 0, L: E.L, arcOn: !!(a.station.lastState && a.station.lastState.arcOn), robot: window.__robot, tip: a.stinger.tipLocal.toArray().map(v => +v.toFixed(4)) }; }""")
    check('XR touch-and-lift strike welds with the holder; the electrode burns down; lifting breaks the arc', xs['samples'] > 2 and xs['starts'] >= 1 and xs['L'] < 325 and not xs['arcOn'], json.dumps(xs))
    # electrode change with dry gauntlets: no shock
    async def press_a():
        await page.evaluate("""() => new Promise(res => { const a = window.__app; const R = window.__iwer.controllers.right; let n = 0;
            R.updateButtonValue('a-button', 1);
            a.onBeforeFrame = () => { n++; if (n === 3) R.updateButtonValue('a-button', 0); if (n > 5) { a.onBeforeFrame = null; res(); } }; })""")
        await page.wait_for_timeout(200)
    L0 = xs['L']
    await press_a()
    ch = await page.evaluate("(() => { const a = window.__app; return { L: a.station.electrode.L, shocks: a.safety.monitor.log.filter(i => i.type === 'electricShock').length, gloves: a.safety.worn.hands }; })()")
    check('A button fits a new electrode; dry gloves: no shock', ch['L'] > L0 and ch['shocks'] == 0, json.dumps(ch))
    # wet gloves: shock on the next change
    await page.evaluate("window.__app.safety.wear('hands', { id: 'gloves_gauntlet', defect: 'wet' })")
    await press_a()
    sh = await page.evaluate("(() => { const a = window.__app; const inc = a.safety.monitor.log.filter(i => i.type === 'electricShock'); return { shocks: inc.length, cause: inc[0] && inc[0].cause }; })()")
    check('changing the electrode with wet gloves gives the electric shock incident', sh['shocks'] == 1 and sh['cause'] == 'wet', json.dumps(sh))
    await page.wait_for_timeout(1500)
    await page.screenshot(path=f'{OUT}/m7_shock.png', timeout=120000)
    await page.evaluate("window.__app.safety.wear('hands', { id: 'gloves_gauntlet', defect: null })")
    # chipping hammer: blows on the bead knock slag off. Calibrate the chisel edge against the
    # controller first (fixed orientation), then alternate up / down poses frame by frame.
    await page.evaluate("window.__app.setTool('hammer')")
    await page.evaluate("""() => { const R = window.__iwer.controllers.right; R.position.set(0.1, 1.2, -0.4); R.quaternion.set(-0.3827, 0, 0, 0.9239); }""")
    await page.wait_for_timeout(4000)
    blows = await page.evaluate("""() => new Promise(res => { const a = window.__app; const R = window.__iwer.controllers.right; const st = a.station;
        const tool = a.tools.hammer; tool.updateWorldMatrix(true, false);
        const e = tool.localToWorld(tool.userData.tip.clone());
        const d = [e.x - R.position.x, e.y - R.position.y, e.z - R.position.z];
        const p0 = st.record.pass; let i0 = -1, i1 = -1; for (let i = 0; i < p0.area.length; i++) if (p0.area[i] > 0.05) { if (i0 < 0) i0 = i; i1 = i; }
        let f = 0; const before = st.record.chipFraction();
        a.onBeforeFrame = () => { f++;
          const x = i0 + 1 + (Math.floor(f / 2) % Math.max(1, i1 - i0 - 1)); const down = f % 2 === 1;
          const surf = st.surfaceAt(x, 0); const p = st.worldFromSim(x, 0, down ? surf - 2 : surf + 30, a.v1.clone());
          R.position.set(p.x - d[0], p.y - d[1], p.z - d[2]);
          if (f > 40) { a.onBeforeFrame = null; res({ before, after: st.record.chipFraction(), d }); } }; })""")
    log('hammer', json.dumps(blows))
    blows = blows['after']
    check('chipping hammer blows chip the slag off part of the bead', blows > 0.05, f'chipped {blows:.2f}')
    await page.wait_for_timeout(800)
    await page.screenshot(path=f'{OUT}/m8_hammer.png', timeout=120000)
    check('no page errors (XR)', not errors, '; '.join(errors[:5]))
    await page.close()

async def main():
    httpd = serve(8138)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        part = sys.argv[2] if len(sys.argv) > 2 else 'all'
        if part in ('all', 'desktop'): await desktop(b)
        if part in ('all', 'xr'): await xr(b)
        await b.close()
    httpd.shutdown()
    fails = [n for n, ok in results if not ok]
    print('FAILURES:', fails if fails else 'none')

asyncio.run(main())
