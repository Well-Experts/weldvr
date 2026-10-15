# Pipe (open root, SMAW) flows on the built page.
#  Desktop: Practice set-up (size, position, progression, pipe WPS), a 5G uphill root and cap by the demo
#  welder with the electrode switched by the WPS between passes, grinding, results (ISO 5817 C and ISO 9606-1,
#  no AWS plate packs), the macro section at a clock position, a 1G weld rolled between runs with an identical
#  replay, and a pipe drill (B6-R5) meeting all its criteria through the real screens.
#  XR (IWER): touch-and-lift strike on a 5G pipe at 3 o'clock, welding up the joint with the electrode
#  pushed up the joint, the keyhole cue, lifting out to break the arc.
import asyncio, sys, os, http.server, threading, functools, time, json, math
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
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
  const r = p.regions.find(q => q.id === id); if (!r || r.disabled) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""
DEMO = "(() => { const a = window.__app; let t = 0; while (a.mode.phase === 'demo' && t < 3000) { a.simulate(5); t += 5; } return t; })()"
SETTINGS = "(() => { const s = window.__app.station.session.settings; return [s.electrode, s.dia, s.current, s.polarity]; })()"

async def desktop(b):
    page = await b.new_page(viewport={'width': 900, 'height': 560})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.goto('http://127.0.0.1:8139/index.html')
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    # ---- Practice set-up
    await click('main', 'home-practice')
    ok = await click('main', 'p-proc:111') and await click('main', 'p-type:pipe') and await click('main', 'p-size:NPS2-80') and await click('main', 'p-ppos:5G') and await click('main', 'p-prog:up')
    gm = await click('main', 'p-proc:135')
    pipe_gmaw = await page.evaluate("window.__app.main.regions.some(r => r.id === 'p-type:pipe')")
    await click('main', 'p-proc:111'); await click('main', 'p-type:pipe')
    check('Practice offers the open-root pipe for SMAW only, with size, position and progression', ok and gm and not pipe_gmaw)
    await page.evaluate("window.__app.placeMainInView && window.__app.placeMainInView()")
    await page.wait_for_timeout(300)
    await page.screenshot(path=f'{OUT}/pp1_setup.png', timeout=120000)
    await click('main', 'p-start')
    st = await page.evaluate("""(() => { const a = window.__app; const j = a.station.joint; const w = a.mode.wps();
        return { pipe: !!j.pipe, size: j.pipe.size, pos: j.position, aws: j.aws, L: j.L, passes: j.passPlan.length, wps: w.id, holder: a.gun === a.stinger,
          passWps: w.passes.map(p => [p.kind, p.electrode, p.dia, p.current]) }; })()""")
    s0 = await page.evaluate(SETTINGS)
    check('5G uphill pipe coupon with the C2.420 pipe WPS: E6010 3.2 mm root 85-95 A, E7018 2.5 mm cap 85-105 A', st['pipe'] and st['pos'] == 'PH' and st['passes'] == 2 and st['holder']
          and st['passWps'] == [['root', 'E6010', 3.2, [85, 95]], ['cap', 'E7018', 2.5, [85, 105]]] and s0 == ['E6010', 3.2, 90, 'DCEP'], json.dumps([st, s0]))
    # ---- root by the demo welder (both halves, feathered between them)
    await click('main', 'w-demo')
    await page.wait_for_timeout(2500)
    await page.screenshot(path=f'{OUT}/pp2_demo.png', timeout=120000)
    t = await page.evaluate(DEMO)
    root = await page.evaluate("""(() => { const a = window.__app; const st = a.station; const s = st.record.summary(); const rr = s.rootRows.filter(Boolean);
        const p = st.record.passes[0]; return { t: 0, rows: rr.length, burn: rr.filter(r => r.burn).length, lop: rr.filter(r => r.lop > 0).length, sig: p.starts.map(q => q.sigma),
          feathers: st.events.filter(e => e.type === 'feather').length, kh: st.techniqueSummary()[0].keyhole, speed: st.techniqueSummary()[0].speed }; })()""")
    check('demo root: both halves bottom to top (one each way), penetrated all round, feathered before the second half', root['rows'] == st['L'] and root['burn'] == 0 and root['lop'] == 0
          and 1 in root['sig'] and -1 in root['sig'] and root['feathers'] >= 2 and root['kh'] and root['kh']['tin'] / root['kh']['t'] > 0.7 and root['speed'] is None, json.dumps(root))
    await click('main', 'w-chip')
    await click('main', 'w-next')
    s1 = await page.evaluate(SETTINGS)
    check('next pass: the WPS electrode for the cap goes into the holder (E7018 2.5 mm, 95 A)', s1 == ['E7018', 2.5, 95, 'DCEP'], json.dumps(s1))
    await click('main', 'w-demo')
    await page.evaluate(DEMO)
    await click('main', 'w-chip')
    await click('main', 'w-finish')
    r = await page.evaluate("""(() => { const R = window.__app.mode.R; return { packs: R.evalFull.map(e => e.label), v: Object.fromEntries(R.evalFull.map(e => [e.label, e.res.verdict])),
        rej: R.evalFull.filter(e => e.res.verdict === 'reject').map(e => e.label + ': ' + e.res.findings.filter(f => f.verdict === 'reject').map(f => f.ref).join(',')) }; })()""")
    check('finished pipe: ISO 5817 C and ISO 9606-1 accept; AWS D1.1 plate packs not offered', r['v'].get('ISO 5817 C') == 'accept' and r['v'].get('ISO 9606-1') == 'accept'
          and not any(p.startswith('AWS') for p in r['packs']), json.dumps(r))
    await page.wait_for_timeout(500)
    await page.screenshot(path=f'{OUT}/pp3_results.png', timeout=120000)
    await click('main', 'r-section')
    sec = await page.evaluate("""(() => { const a = window.__app; const p = a.section; p.invalidate(); p.render(a.ui.rtl); return { x: a.sectionX, marker: a.cutMarker.visible }; })()""")
    await page.evaluate("window.__app.showSection(Math.round(window.__app.station.joint.L / 4))")
    await page.wait_for_timeout(600)
    await page.screenshot(path=f'{OUT}/pp4_section.png', timeout=120000)
    check('macro section through the pipe joint', sec['marker'] and sec['x'] is not None, json.dumps(sec))
    # ---- 1G: rolled between runs; identical replay
    await page.evaluate("window.__app.goHome()")
    await click('main', 'home-practice'); await click('main', 'p-proc:111'); await click('main', 'p-type:pipe'); await click('main', 'p-size:NPS2-80'); await click('main', 'p-ppos:1G')
    await click('main', 'p-start')
    roll_btn = await page.evaluate("window.__app.main.regions.some(r => r.id === 'w-roll')")
    await click('main', 'w-demo'); await page.evaluate(DEMO)
    await click('main', 'w-chip'); await click('main', 'w-next')
    await click('main', 'w-demo'); await page.evaluate(DEMO)
    await click('main', 'w-chip')
    r1 = await page.evaluate("""(() => { const a = window.__app; const st = a.station; const s = st.record.summary(); const rows = s.rows.filter(Boolean);
        return { rolls: st.events.filter(e => e.type === 'roll').length, n: rows.length, h: rows.reduce((x, q) => x + (q.h || 0), 0) / rows.length, roots: s.rootRows.filter(Boolean).reduce((x, q) => x + q.rootH, 0) }; })()""")
    await click('main', 'w-finish')
    v1 = await page.evaluate("window.__app.mode.R.evalFull.find(e => e.label === 'ISO 5817 C').res.verdict")
    check('1G: the pipe is rolled between the runs (roll button for the trainee); ISO 5817 C accept', roll_btn and r1['rolls'] >= 6 and r1['n'] == 189 and v1 == 'accept', json.dumps([r1, v1]))
    await click('main', 'r-replay')
    for _ in range(40):
        ph = await page.evaluate("(() => { window.__app.simulate(40); return window.__app.mode.phase; })()")
        if ph != 'replay': break
    r2 = await page.evaluate("""(() => { const a = window.__app; const st = a.station; const s = st.record.summary(); const rows = s.rows.filter(Boolean);
        return { phase: a.mode.phase, n: rows.length, h: rows.reduce((x, q) => x + (q.h || 0), 0) / rows.length, roots: s.rootRows.filter(Boolean).reduce((x, q) => x + q.rootH, 0) }; })()""")
    check('1G replay re-simulates the same weld (rolls, feathering and electrode changes replayed)', r2['phase'] == 'results' and r2['n'] == r1['n'] and abs(r2['h'] - r1['h']) < 1e-9 and abs(r2['roots'] - r1['roots']) < 1e-9, json.dumps(r2))
    # ---- trainee grinding: the starts and craters of a root ground to a feathered edge
    await page.evaluate("window.__app.goHome()")
    await click('main', 'home-practice'); await click('main', 'p-proc:111'); await click('main', 'p-type:pipe'); await click('main', 'p-size:NPS2-80'); await click('main', 'p-ppos:5G'); await click('main', 'p-prog:up')
    await click('main', 'p-start')
    await click('main', 'w-demo'); await page.evaluate(DEMO)
    g = await page.evaluate("""(() => { const a = window.__app; const st = a.station; const p = st.record.pass; const sum = () => p.area.reduce((x, v) => x + v, 0);
        const before = sum(); const e0 = st.events.filter(e => e.type === 'feather').length; const n = a.mode.grindEnds(); const ok = a.main.regions.some(r => r.id === 'w-grind');
        return { n, before, after: sum(), events: st.events.filter(e => e.type === 'feather').length - e0, button: ok }; })()""")
    check('grinding the starts and craters of the root feathers them (recorded for the replay)', g['n'] >= 1 and g['after'] < g['before'] and g['events'] == g['n'], json.dumps(g))
    # ---- pipe drill through the real screens
    await page.evaluate("window.__app.goHome()")
    await click('main', 'home-exercises')
    fam = await click('main', 'ex-family:pipe')
    ids = await page.evaluate("window.__app.main.regions.filter(r => r.id.startsWith('ex-B6')).map(r => r.id)")
    await click('main', 'ex-B6-R5')
    await page.wait_for_timeout(400)
    await page.screenshot(path=f'{OUT}/pp5_brief.png', timeout=120000)
    await click('main', 'x-start')
    await click('main', 'x-demo')
    await page.evaluate(DEMO)
    await click('main', 'x-finish')
    d = await page.evaluate("(() => { const R = window.__app.mode.R; return { met: R.drill.res.met, total: R.drill.res.total, items: R.drill.res.items.map(i => i.id + ':' + i.ok + ':' + i.measured) }; })()")
    check('pipe drills listed (6); B6-R5 demo root meets every criterion (code, keyhole, tie-ins, technique)', fam and len(ids) == 6 and d['met'] == d['total'] and d['total'] == 4, json.dumps([ids, d]))
    await page.wait_for_timeout(400)
    await page.screenshot(path=f'{OUT}/pp6_drill.png', timeout=120000)
    check('no page errors (desktop)', not errors, '; '.join(errors[:5]))
    await page.close()

async def xr(b):
    page = await b.new_page(viewport={'width': 900, 'height': 500})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.add_init_script(path=IWER)
    await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
    await page.goto('http://127.0.0.1:8139/index.html')
    await page.wait_for_timeout(2000)
    await page.evaluate("window.__app.enterXR('vr')")
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    await click('main', 'home-practice'); await click('main', 'p-proc:111'); await click('main', 'p-type:pipe'); await click('main', 'p-size:NPS6-80'); await click('main', 'p-ppos:5G'); await click('main', 'p-prog:up')
    await click('main', 'p-start')
    await page.evaluate("window.__app.helmet.setDown(true)")
    # robot: approach 3 o'clock, touch for two frames, lift to the arc length and weld up the joint (+x) with
    # the electrode pushed 7.5 deg up the joint, then lift out of the arc
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const j = a.station.joint;
        const w = a.station.windows(); let x = j.L / 4; let f = 0; let onF = 0; const arc = (w.stickOut[0] + w.stickOut[1]) / 2;
        a.onBeforeFrame = (dt) => { f++;
          let ct = 15;
          if (f > 8 && f <= 10) ct = -1.5; else if (f > 10) ct = arc;
          const on = a.station.lastState && a.station.lastState.arcOn;
          if (on) { x += w.speedTarget * dt; onF++; }
          if (onF > 30) ct = 45;
          const pose = a.gunPoseFor(x, 0, 90, -7.5, ct);
          R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          const ls = a.station.lastState;
          const pacer = !!(on && a.cues3d.pacer.visible) || !!(window.__robot && window.__robot.pacer);
          window.__robot = { x, f, onF, on: !!on, kh: ls && ls.keyhole, ta: ls && ls.tech ? ls.tech.travelAngle : null, sig: a.station.session.sigma, locked: a.station.session.sigmaLocked, pacer };
          if (onF > 30 && !on) a.onBeforeFrame = null;
        }; }""")
    await page.wait_for_timeout(3000)
    await page.screenshot(path=f'{OUT}/pp7_xr_arc.png', timeout=120000)
    for _ in range(240):
        done = await page.evaluate("window.__app.onBeforeFrame == null")
        if done: break
        await page.wait_for_timeout(1000)
    await page.wait_for_timeout(800)
    xs = await page.evaluate("""() => { const a = window.__app; const p = a.station.record.pass; let n = 0; for (const v of p.area) if (v > 0.05) n++;
        return { samples: n, starts: a.station.log.arcStarts, arcOn: !!(a.station.lastState && a.station.lastState.arcOn), robot: window.__robot, sigma: p.starts.map(s => s.sigma) }; }""")
    check("XR: strike on the pipe at 3 o'clock and weld up the joint; the run goes +x (up); lifting breaks the arc", xs['samples'] > 2 and xs['starts'] >= 1 and not xs['arcOn'] and xs['sigma'] and xs['sigma'][0] == 1, json.dumps(xs))
    kh = await page.evaluate("(() => { const t = window.__app.station.techniqueSummary()[0]; return { kh: t.keyhole, ta: t.travelAngle, speed: t.speed, pacer: window.__robot.pacer }; })()")
    check('XR: keyhole and the position-dependent electrode angle are measured on the root run', kh['kh'] is not None and kh['kh']['t'] > 0 and kh['ta'] is not None, json.dumps(kh))
    # open root: the travel speed is judged by the keyhole (C2.420), so no deposition-speed window, no pacer
    check('XR: on the open-root root run the speed is judged by the keyhole (no speed window, no pacer)', kh['speed'] is None and not kh['pacer'], json.dumps(kh))
    check('no page errors (XR)', not errors, '; '.join(errors[:5]))
    await page.close()

async def main():
    httpd = serve(8139)
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
