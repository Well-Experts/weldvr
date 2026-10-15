# GTAW (141) flows on the built page.
#  Desktop: Practice set-up with tungsten and filler choices, a 3.2 mm fillet welded by the scripted TIG
#  welder (HF start, filler dabbing, current ramp-down, post-flow held), results, replay determinism, the
#  TIG machine panel, a GTAW troubleshooting fault, the TIG PPE job.
#  XR (IWER): HF start with the analog trigger (amperage control), filler rod in the off hand melting in
#  the pool, the arc going out when the torch is lifted, tungsten dipped into the pool (contaminated,
#  tungsten inclusion), regrind with A, a new rod with A on the rod hand.
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
  const r = p.regions.find(q => q.id === id); if (!r || r.disabled) return false; r.onClick(); p.invalidate(); p.render(a.ui.rtl); return true; }"""
FRAMES = "(n) => new Promise(res => { const a = window.__app; let k = 0; const prev = a.onBeforeFrame; a.onBeforeFrame = (dt, f) => { if (prev) prev(dt, f); if (++k >= n) { a.onBeforeFrame = prev; res(); } }; })"

async def desktop(b):
    page = await b.new_page(viewport={'width': 640, 'height': 400})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.goto('http://127.0.0.1:8139/index.html')
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    await click('main', 'home-practice')
    await click('main', 'p-proc:141')
    regs = await page.evaluate("(() => { const p = window.__app.main; p.invalidate(); p.render(false); return p.regions.map(r => r.id); })()")
    check('practice offers GTAW with tungsten types, filler rods and 3 mm sheet coupons', all(r in regs for r in ['p-tung:EWCe-2', 'p-tung:EWP', 'p-fill:ER70S-2', 'p-type:plate']) and 'p-type:butt' not in regs)
    await click('main', 'p-type:fillet'); await click('main', 'p-pos:PB'); await click('main', 'p-start')
    info = await page.evaluate("""(() => { const a = window.__app; const s = a.station.session.settings; const w = a.mode.cfgWps;
        return { torch: a.gun === a.tigTorch, proc: s.process, I: s.current, pol: s.polarity, tung: s.tungsten, gas: s.gasFlow, pf: s.postflow, t: a.station.joint.t, range: w.ranges.current, inWps: a.mode.inWps(s) }; })()""")
    check('GTAW coupon loaded with the TIG torch and the training WPS', info['torch'] and info['proc'] == '141' and info['pol'] == 'DCEN' and info['t'] == 3.2 and info['inWps'], json.dumps(info))
    # machine panel: current steps, polarity, start mode, post-flow
    mregs = await page.evaluate("(() => { const p = window.__app.machine; p.invalidate(); p.render(false); return p.regions.map(r => r.id); })()")
    await click('machine', 'pol:DCEP')
    pol = await page.evaluate("window.__app.station.session.settings.polarity")
    out = await page.evaluate("window.__app.mode.inWps(window.__app.station.session.settings)")
    await click('machine', 'pol:DCEN')
    check('TIG machine panel: current, polarity, HF / lift-arc, post-flow; DCEP is outside the WPS', all(r in mregs for r in ['current:+', 'pol:DCEN', 'start:lift', 'postflow:+']) and pol == 'DCEP' and not out, json.dumps(mregs))
    # demo pass by the scripted TIG welder
    d = await page.evaluate("""() => { const a = window.__app; const m = a.mode; m.startDemo(); let t = 0; let rodSeen = false, maxFill = 0;
        while (m.phase === 'demo' && t < 400) { a.simulate(1); t += 1; rodSeen = rodSeen || a.demoRod.group.visible; maxFill = Math.max(maxFill, a.station.tig.fillerRate); }
        const T = a.station.tig; return { phase: m.phase, t, rodSeen, maxFill, rodLen: T.rodLen, cont: T.contaminated, ox: T.oxidized }; }""")
    check('demo TIG pass: filler dabbed from the rod, tungsten stays clean, post-flow held', d['phase'] == 'weld' and d['rodSeen'] and d['maxFill'] > 0 and d['rodLen'] < 915 and not d['cont'] and not d['ox'], json.dumps(d))
    await click('main', 'w-finish')
    res = await page.evaluate("""(() => { const m = window.__app.mode; const R = m.R; const full = R.evalFull.find(e => e.id === 'iso5817-2023' && e.level === 'C');
        let n = 0; for (const v of window.__app.station.record.pass.area) if (v > 0.05) n++; return { phase: m.phase, verdict: full.res.verdict, fails: full.res.findings.filter(f => f.verdict === 'reject').map(f => f.ref), n }; })()""")
    check('TIG fillet evaluated: ISO 5817 C accepted', res['phase'] == 'results' and res['verdict'] == 'accept' and res['n'] > 200, json.dumps(res))
    for tab in ['code', 'tech', 'safety']:
        await page.evaluate(f"(() => {{ const m = window.__app.mode; m.R.tab = '{tab}'; window.__app.main.invalidate(); window.__app.main.render(false); }})()")
    SIG = "(() => { const rec = window.__app.station.record; let a = 0, n = 0; for (const p of rec.passes) for (let i = 0; i < rec.joint.n; i++) if (p.area[i] > 0.05) { a += p.area[i]; n++; } return { a: +a.toFixed(5), n }; })()"
    s1 = await page.evaluate(SIG)
    await click('main', 'r-replay')
    await page.evaluate("(() => { const a = window.__app; let t = 0; while (a.mode.phase === 'replay' && t < 2000) { a.simulate(10); t += 10; } })()")
    s2 = await page.evaluate(SIG)
    check('TIG replay re-simulates the same weld (rod tip replayed)', s1 == s2 and s1['n'] > 200, json.dumps([s1, s2]))
    # troubleshooting: too much argon
    await page.evaluate("window.__app.goHome()")
    await click('main', 'home-trouble')
    # the GTAW faults are at the end of the list: scroll down
    regs = await page.evaluate("(() => { window.__app.mode.listScroll = 99; const p = window.__app.main; p.invalidate(); p.render(false); return p.regions.map(r => r.id); })()")
    tid = next((r for r in regs if r.endswith('C1-T')), None)
    ok = tid is not None and await click('main', tid)
    st = await page.evaluate("(() => { const a = window.__app; const m = a.mode; return { phase: m.phase, id: m.sc && m.sc.id, flow: a.station.session.settings.gasFlow, torch: a.gun === a.tigTorch, pores: a.station.record.summary().pores.length }; })()")
    check('GTAW troubleshooting fault: too much argon (25 L/min) on a pre-welded coupon with porosity', bool(ok) and st['id'] == 'C1-T' and st['flow'] == 25 and st['torch'] and st['pores'] > 0, json.dumps(st))
    # PPE job for TIG
    job = await page.evaluate("(() => { const a = window.__app; a.goHome(); const c = (id) => { a.main.invalidate(); a.main.render(false); const r = a.main.regions.find(q => q.id === id); if (r) r.onClick(); return !!r; }; c('home-safety'); c('s-S1'); const ok = c('job-J5'); return { ok, step: a.mode.step, job: a.mode.job && a.mode.job.id, proc: a.mode.job && a.mode.job.process }; })()")
    check('PPE job for TIG welding on the rack (J5)', job['ok'] and job['job'] == 'J5' and job['proc'] == '141', json.dumps(job))
    check('no page errors (desktop)', not errors, '; '.join(errors[:5]))
    await page.close()

async def xr(b):
    page = await b.new_page(viewport={'width': 400, 'height': 240})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    await page.add_init_script(path=IWER)
    await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
    await page.goto('http://127.0.0.1:8139/index.html')
    await page.wait_for_timeout(2000)
    await page.evaluate("window.__app.enterXR('vr')")
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    for r in ['home-practice', 'p-proc:141', 'p-type:fillet', 'p-pos:PB', 'p-start']: await click('main', r)
    await page.evaluate("window.__app.helmet.setDown(true)")
    await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
    await page.evaluate(FRAMES, 3)
    vis = await page.evaluate("(() => { const a = window.__app; return { torch: a.gun === a.tigTorch, rod: a.rod.group.visible, rodParent: !!a.rod.group.parent }; })()")
    check('XR: TIG torch in the torch hand, filler rod in the other hand', vis['torch'] and vis['rod'] and vis['rodParent'], json.dumps(vis))
    # robot (frame-based): torch at the arc length with a 15 deg push, amperage control at 80%; the rod
    # tip dabs into the leading edge of the pool on alternate frames once the arc burns
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const L = window.__iwer.controllers.left;
        const st = a.station; const w = st.windows(); let s = 12; let f = 0; let onF = 0;
        a.onBeforeFrame = (dt) => { f++;
          const on = st.lastState && st.lastState.arcOn;
          if (on) { s += w.speedTarget * dt; onF++; }
          const lift = onF > 24 ? 40 : 0;
          const pose = a.gunPoseFor(s, 0, 45, -15, 2.4 + lift);
          R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          R.updateButtonValue('trigger', f > 2 && onF <= 24 ? 0.8 : 0);
          const pool = st.session.pool; const lead = on ? (pool.Lf || 1) : 2;
          const x = s + lead + (f % 2 ? 0.5 : 4); const v = st.surfaceAt(x, 0);
          const rp = a.rodPoseFor(x, 0, f % 2 && on ? v - 0.5 : v + 3.5);
          L.position.set(...rp.position); L.quaternion.set(...rp.quaternion);
          const I = st.lastState && st.lastState.arc ? st.lastState.arc.I : null;
          window.__robot = { s, f, onF, on: !!on, I, Imax: Math.max(I || 0, (window.__robot && window.__robot.Imax) || 0) };
          if (onF > 24 && !on && f > onF + 6) a.onBeforeFrame = null;
        }; }""")
    for _ in range(240):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(1000)
    await page.wait_for_timeout(800)
    xs = await page.evaluate("""() => { const a = window.__app; const st = a.station; const T = st.tig; let n = 0; for (const v of st.record.pass.area) if (v > 0.05) n++;
        return { samples: n, starts: st.log.arcStarts, rodLen: T.rodLen, arcOn: !!(st.lastState && st.lastState.arcOn), cont: T.contaminated, pf: !!T.postflow, robot: window.__robot }; }""")
    check('XR: HF start with the amperage control, the rod melts in the pool, lifting the torch breaks the arc', xs['samples'] > 2 and xs['starts'] >= 1 and xs['rodLen'] < 915 and not xs['arcOn'] and not xs['cont'], json.dumps(xs))
    check('XR: the analog trigger is the amperage control (80% of the 225 A preset)', abs(xs['robot']['Imax'] - 180) < 1, json.dumps(xs['robot']))
    # dip the tungsten into the pool: strike again, then push the tip into the work
    # (frame-based: the push starts after the arc has burned 3 frames and lasts 6 frames, however many frames
    # the strike takes under emulation; then the trigger is released and the torch lifted)
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const st = a.station; let f = 0; let onF = 0; let p = 0; let fOff = null; const s0 = window.__robot.s + 6;
        a.onBeforeFrame = () => { f++; const on = st.lastState && st.lastState.arcOn; if (on) onF++;
          const push = onF >= 3; if (push) p++;
          const pose = a.gunPoseFor(s0, 0, 45, -15, push ? -0.6 : 2.4); R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          const trig = p <= 6 && f < 90;
          R.updateButtonValue('trigger', trig ? 1 : 0);
          if (!trig && fOff == null) fOff = f;
          if (fOff != null && f > fOff + 2) { const p2 = a.gunPoseFor(s0, 0, 45, -15, 40); R.position.set(...p2.position); R.quaternion.set(...p2.quaternion); }
          if (fOff != null && f > fOff + 4) a.onBeforeFrame = null; }; }""")
    for _ in range(120):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(1000)
    dp = await page.evaluate("(() => { const a = window.__app; const T = a.station.tig; return { cont: T.contaminated, tung: (a.station.record.tungsten || []).length, dips: a.station.log.dip || 0, touch: a.station.log.touch || 0, toast: a.toastMsg }; })()")
    check('XR: tungsten dipped into the pool is contaminated and leaves tungsten in the weld', dp['cont'] and dp['tung'] >= 1 and (dp['dips'] >= 1 or dp['touch'] >= 1), json.dumps(dp))
    # regrind (A on the torch hand), new rod (A on the rod hand)
    async def press(side, btn=None):
        # face buttons: A on the right controller, X on the left (Quest Touch; IWER meta config)
        btn = btn or ('a-button' if side == 'right' else 'x-button')
        await page.evaluate("""([side, btn]) => new Promise(res => { const a = window.__app; const C = window.__iwer.controllers[side]; let n = 0; C.updateButtonValue(btn, 1);
            const prev = a.onBeforeFrame; a.onBeforeFrame = () => { n++; if (n === 3) C.updateButtonValue(btn, 0); if (n > 5) { a.onBeforeFrame = prev; res(); } }; })""", [side, btn])
    await press('right')
    rg = await page.evaluate("(() => { const T = window.__app.station.tig; return { cont: T.contaminated, regrinds: T.regrinds, state: window.__app.tigTorch.state }; })()")
    check('XR: A on the torch hand regrinds the tungsten', not rg['cont'] and rg['regrinds'] >= 1 and rg['state'] == 'clean', json.dumps(rg))
    await press('left')
    nr = await page.evaluate("(() => { const a = window.__app; return { rodLen: a.station.tig.rodLen, ahead: a.rodHold.ahead, total: a.rod.total }; })()")
    check('XR: A on the rod hand takes a new filler rod', nr['rodLen'] == 915 and nr['total'] == 915, json.dumps(nr))
    await page.screenshot(path=f'{OUT}/tig_xr.png', timeout=150000)
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
