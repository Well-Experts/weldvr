# Oxy-fuel cutting (81) flows on the built page.
#  Desktop: the cutting menu and practice set-up (plates from the Victor tip chart), a ready outfit lit by
#  the app, the demo cut (drop cut, Harris categories, ISO 9013 range), the results tabs, the C1 drill done
#  entirely on the panel (capped cylinders to a neutral flame and back to zero gauges, Victor order), and
#  the C5 backfire drill (torch oxygen valve first).
#  XR (IWER): the torch in the torch hand, the fuel valve opened with the held thumbstick, the spark lighter
#  (A on the torch hand, struck with the other hand's trigger at the tip), the flame set neutral with the
#  stick, a preheat at the plate edge to the kindling temperature, the lever (trigger) pressed and the cut
#  run off the far edge; then the consequences: no filter lens while cutting, a bare hand in the spark
#  stream, a bare hand on the hot plate.
import asyncio, sys, os, http.server, threading, functools, time, json
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
# click a region n times (or until it is gone / disabled); returns the clicks made
CLICKN = """(args) => { const [id, n] = args; const a = window.__app; const p = a.main; let k = 0;
  for (; k < n; k++) { p.invalidate(); p.render(a.ui.rtl); const r = p.regions.find(q => q.id === id); if (!r || r.disabled) break; r.onClick(); a.simulate(1 / 24, 1 / 24); }
  p.invalidate(); p.render(a.ui.rtl); return k; }"""
# click a region until a condition on the outfit holds (o = outfit)
CLICKUNTIL = """(args) => { const [id, cond, max] = args; const a = window.__app; const p = a.main; const f = new Function('o', 'a', 'return ' + cond); let k = 0;
  for (; k < max; k++) { if (f(a.cut.outfit, a)) break; p.invalidate(); p.render(a.ui.rtl); const r = p.regions.find(q => q.id === id); if (!r || r.disabled) break; r.onClick(); a.simulate(0.1, 1 / 24); }
  return { k, ok: f(a.cut.outfit, a) }; }"""
FRAMES = "(n) => new Promise(res => { const a = window.__app; let k = 0; const prev = a.onBeforeFrame; a.onBeforeFrame = (dt, f) => { if (prev) prev(dt, f); if (++k >= n) { a.onBeforeFrame = prev; res(); } }; })"

async def desktop(b):
    page = await b.new_page(viewport={'width': 640, 'height': 400})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.goto('http://127.0.0.1:8148/index.html')
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    clickn = lambda rid, n: page.evaluate(CLICKN, [rid, n])
    until = lambda rid, cond, mx=200: page.evaluate(CLICKUNTIL, [rid, cond, mx])
    sim = lambda s: page.evaluate(f"window.__app.simulate({s}, 1 / 24)")
    ok = await click('main', 'home-cutting')
    regs = await page.evaluate("(() => { const p = window.__app.main; p.invalidate(); p.render(false); return p.regions.map(r => r.id); })()")
    check('home tile opens the oxy-fuel cutting menu (practice, drills, outfit set-up)', ok and all(r in regs for r in ['c-practice', 'c-drills', 'c-outfit']), json.dumps(regs))
    await click('main', 'c-practice')
    regs = await page.evaluate("(() => { const p = window.__app.main; p.invalidate(); p.render(false); return p.regions.map(r => r.id); })()")
    check('practice set-up: plates from the tip chart, square or 30 deg bevel, tips 00-2', all(r in regs for r in ['cp-plate:P6', 'cp-plate:P12', 'cp-plate:P25', 'cp-bevel:30', 'cp-tip:00', 'cp-tip:2']), json.dumps(regs))
    await click('main', 'cp-start')
    info = await page.evaluate("""(() => { const a = window.__app; const o = a.cut.outfit; const c = a.cut.coupon;
        return { torch: a.gun === a.cutTorch, vis: a.cut.root.visible, t: c.t, L: c.L, tip: o.tip, regs: o.cyl.oxygen.regOn && o.cyl.fuel.regOn, Po: o.deliverySet('oxygen'), Pf: o.deliverySet('fuel'), lit: o.lit, proc: a.safety.task().process }; })()""")
    check('1/2 in plate on the cutting rack, tip 0, the outfit ready at the chart pressures (32.5 / 4 psig)', info['torch'] and info['vis'] and abs(info['t'] - 12.7) < 0.01 and info['tip'] == '0' and info['regs'] and abs(info['Po'] - 32.5) < 0.01 and abs(info['Pf'] - 4) < 0.01 and not info['lit'] and info['proc'] == '81', json.dumps(info))
    await click('main', 'ct-light')
    await sim(0.5)
    fl = await page.evaluate("(() => { const o = window.__app.cut.outfit; return { lit: o.lit, type: o.flame.type, ratio: o.flame.ratio, light: !!o.done.light, smoke: !!o.done.smoke, neutral: !!o.done.neutral }; })()")
    check('"Light for me": lit, smoke cleared, neutral with the lever pressed (Victor 0056-0138 4.01 steps 14-17)', fl['lit'] and fl['light'] and fl['smoke'] and fl['neutral'] and fl['type'] in ('neutral', 'oxidizing'), json.dumps(fl))
    await click('main', 'cw-demo')
    # half way along (simulated), then a few rendered frames for the effects, then on to the end
    await page.evaluate("(() => { const a = window.__app; let t = 0; while (a.mode.phase === 'demo' && t < 200 && !(a.cut.state && a.cut.state.cutting && a.cut.state.J.x > 120)) { a.simulate(0.25, 1 / 24); t += 0.25; } })()")
    await page.evaluate(FRAMES, 8)
    sp = await page.evaluate("(() => { const a = window.__app; return { live: Array.from(a.cut.fx.sp.life).filter(v => v > 0).length, sheet: a.cut.fx.sheets[0].visible, through: !!(a.cut.state && a.cut.state.through) }; })()")
    d = await page.evaluate("""() => { const a = window.__app; let t = 0, drop = false;
        while (a.mode.phase === 'demo' && t < 200) { a.simulate(0.25, 1 / 24); t += 0.25; drop = drop || !!a.cut.plate.drop; }
        const L = a.cut.log; return { t, phase: a.mode.phase, drop: drop || !!a.cut.plate.drop, severed: L.severed, starts: L.starts, losses: L.losses }; }""")
    d['sparks'] = sp
    check('demo cut: preheat at the edge, through cut, sparks and slag stream out of the bottom, the strip drops', d['phase'] == 'work' and sp['through'] and sp['live'] > 10 and sp['sheet'] and d['severed'] and d['drop'] and d['starts'] == 1 and d['losses'] == 0, json.dumps(d))
    await click('main', 'cw-finish')
    q = await page.evaluate("""(() => { const m = window.__app.mode; const S = m.R.S; return { phase: m.phase, tab: m.tab, severed: S.severed, ok: S.okShare, range: S.range, cats: S.cats, drossAdh: S.drossAdhShare, kerf: S.kerf, trim: S.trim }; })()""")
    check('results: drop cut, perfect / production cut along the length, ISO 9013 range 1-2, no slag stuck', q['phase'] == 'results' and q['severed'] and q['ok'] > 0.95 and q['range'] in (1, 2) and q['drossAdh'] == 0 and abs(q['kerf'] - 1.52) < 0.2, json.dumps(q))
    for tab in ['procedure', 'safety', 'quality']:
        okt = await click('main', f'cr-tab:{tab}')
        if not okt: check(f'results tab {tab}', False)
    ppe = await page.evaluate("(() => { const R = window.__app.mode.R; return { rules: R.ppe.rules.map(r => r.id + ':' + r.result.status), inc: R.incidents.length }; })()")
    check('results: PPE for gas cutting checked (filter goggles, FR clothing, gloves, cuffless trousers, boots)', any(r.startswith('shade:') for r in ppe['rules']) and len(ppe['rules']) >= 5, json.dumps(ppe))
    # ---- C1: the outfit from capped cylinders to a neutral flame and back, on the panel ----
    await click('main', 'cr-home'); await click('main', 'c-drills'); await click('main', 'cx-C1'); await click('main', 'cb-start')
    st = await page.evaluate("(() => { const o = window.__app.cut.outfit; return { cap: o.cyl.oxygen.cap && o.cyl.fuel.cap, reg: o.cyl.oxygen.regOn, open: o.cyl.oxygen.open }; })()")
    check('C1 starts from capped cylinders, no regulators', st['cap'] and not st['reg'] and st['open'] == 0, json.dumps(st))
    for r in ['co-cap:oxygen', 'co-cap:fuel', 'co-crack:oxygen', 'co-crack:fuel', 'co-reg:oxygen', 'co-reg:fuel']:
        if not await click('main', r): check(f'C1 click {r}', False)
    await clickn('co-cyl:oxygen:+', 12)
    await clickn('co-cyl:fuel:+', 3)
    # leak test: 20 psig oxygen, 10 psig fuel, cylinder valves closed, the gauges watched for five minutes
    await clickn('co-scr:oxygen:+', 20)
    await clickn('co-scr:fuel:+', 20)
    await sim(1)
    await clickn('co-cyl:oxygen:-', 12)
    await clickn('co-cyl:fuel:-', 3)
    await click('main', 'co-watch')
    lk = await page.evaluate("(() => { const o = window.__app.cut.outfit; return { leak: o.done.leak, Po: o.delivery('oxygen'), Pf: o.delivery('fuel') }; })()")
    check('C1 leak test on the panel: gauges steady for five minutes', bool(lk['leak']) and lk['leak']['ok'], json.dumps(lk))
    await clickn('co-cyl:oxygen:+', 12)
    await clickn('co-cyl:fuel:+', 3)
    await clickn('co-scr:oxygen:+', 12)   # 32 psig
    await clickn('co-scr:fuel:-', 12)     # 4 psig
    # purge each hose on its own (Victor 0056-3260 5.06: 10 s per 25 ft)
    await clickn('ct-v:oxygen:+', 6)
    await clickn('ct-v:preheat:+', 25)
    await sim(11)
    await clickn('ct-v:preheat:-', 25)
    await clickn('ct-v:fuel:+', 8)
    await sim(11)
    await clickn('ct-v:fuel:-', 8)
    await click('main', 'ct-lever'); await sim(0.5); await click('main', 'ct-lever')
    # light: fuel about 1/8 turn, spark lighter; fuel until the smoke stops; preheat oxygen to neutral, lever pressed
    await clickn('ct-v:fuel:+', 2)
    await click('main', 'ct-spark')
    r1 = await until('ct-v:fuel:+', 'o.flame.smoke <= 0 && o.flow.fuel >= 12.5', 40)
    r2 = await until('ct-v:preheat:+', "o.flame.type === 'neutral'", 120)
    await click('main', 'ct-lever')
    await sim(0.3)
    r3 = await until('ct-v:preheat:+', "o.flame.type === 'neutral' && o.flow.preO2 >= o.flow.fuel", 120)
    await sim(1.5)
    await click('main', 'ct-lever')
    lit = await page.evaluate("(() => { const o = window.__app.cut.outfit; return { lit: o.lit, light: o.done.light, smoke: o.done.smoke, neutral: o.done.neutral, type: o.flame.type }; })()")
    check('C1 lit on the panel: 1/8 turn and the spark lighter, smoke cleared, neutral with the lever pressed', lit['lit'] and lit['light']['ok'] and lit['smoke']['ok'] and lit['neutral']['ok'], json.dumps([lit, r1, r2, r3]))
    # shut down: preheat oxygen, then fuel; cylinders closed; oxygen bled, its screw released; fuel bled, its screw released
    await clickn('ct-v:preheat:-', 200)
    await clickn('ct-v:fuel:-', 40)
    await clickn('co-cyl:oxygen:-', 12)
    await clickn('co-cyl:fuel:-', 3)
    await click('main', 'ct-lever'); await sim(3); await click('main', 'ct-lever')
    await clickn('co-scr:oxygen:-', 40)
    await clickn('ct-v:oxygen:-', 6)
    await clickn('ct-v:fuel:+', 8); await sim(3)
    await clickn('co-scr:fuel:-', 20)
    await clickn('ct-v:fuel:-', 8)
    await sim(2)
    await click('main', 'cw-finish')
    dr = await page.evaluate("(() => { const R = window.__app.mode.R; return { all: R.drill.all, items: R.drill.items.map(i => i.id + ':' + i.ok + ':' + JSON.stringify(i.measured)), faults: R.faults.map(f => f.note) }; })()")
    check('C1 drill on the panel: every step in the Victor order, no pop, neutral flame, gauges at zero', dr['all'], json.dumps(dr))
    # ---- C5: sustained backfire, torch oxygen valve first ----
    await click('main', 'cr-menu'); await click('main', 'cx-C5'); await click('main', 'cb-start')
    await sim(3)
    bf = await page.evaluate("(() => { const a = window.__app; const o = a.cut.outfit; return { burning: o.backfireT > 0, t0: a.mode.backfire.t0 }; })()")
    await clickn('ct-v:oxygen:-', 6)
    await clickn('ct-v:fuel:-', 40)
    await sim(1)
    await click('main', 'cw-finish')
    dr5 = await page.evaluate("(() => { const R = window.__app.mode.R; return { all: R.drill.all, items: R.drill.items.map(i => i.id + ':' + i.ok + ':' + JSON.stringify(i.measured)) }; })()")
    check('C5 backfire drill: sustained backfire, torch oxygen valve closed first and in time, torch not burnt', bf['burning'] and dr5['all'], json.dumps([bf, dr5]))
    check('no page errors (desktop)', not errors, '; '.join(errors[:5]))
    await page.close()

async def xr(b):
    page = await b.new_page(viewport={'width': 400, 'height': 240})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    await page.add_init_script(path=IWER)
    await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
    await page.goto('http://127.0.0.1:8148/index.html')
    await page.wait_for_timeout(2000)
    await page.evaluate("window.__app.enterXR('vr')")
    await page.wait_for_timeout(1500)
    click = lambda panel, rid: page.evaluate(CLICK, [panel, rid])
    await click('main', 'home-cutting')
    await page.evaluate("(() => { const a = window.__app; a.mode.drill = null; a.mode.start({ plate: 'P6', bevel: 0, outfit: { ready: true }, L: 100 }); a.safety.quickDress(); })()")
    await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
    await page.evaluate(FRAMES, 3)
    vis = await page.evaluate("(() => { const a = window.__app; return { torch: a.gun === a.cutTorch, parent: !!a.cutTorch.group.parent, L: a.cut.coupon.L, kit: a.safety.worn.eyes && a.safety.worn.eyes.id, helmet: a.helmet.kind }; })()")
    check('XR: cutting torch in the torch hand, filter goggles worn', vis['torch'] and vis['parent'] and vis['L'] == 100 and vis['kit'] == 'goggles_gas' and vis['helmet'] == 'goggles', json.dumps(vis))
    # lighting robot: torch held 60 mm over the start; stick right until the fuel is at 1/8 turn; A for the
    # lighter; the lighter mouth brought to the tip; its trigger struck; stick right to the chart flow, stick up
    # to a neutral flame
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const L = window.__iwer.controllers.left; const o = a.cut.outfit;
        const V = a.v1.constructor; let f = 0, ph = 0, pf = 0; window.__light = { ph };
        a.onBeforeFrame = () => { f++; pf++;
          const pose = a.cutPoseFor(2, 0, 60); R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          if (ph === 0) { R.updateAxes('thumbstick', 0.9, 0); if (o.valve.fuel >= 0.125) { R.updateAxes('thumbstick', 0, 0); ph = 1; pf = 0; } }
          else if (ph === 1) { R.updateButtonValue('a-button', pf < 3 ? 1 : 0); if (pf > 5) { ph = 2; pf = 0; } }
          else if (ph === 2) {
            // bring the lighter mouth to the torch tip (rigid offset: one correction per frame)
            a.cutTorch.group.updateWorldMatrix(true, false);
            const tip = a.cutTorch.tipLocal.clone().applyMatrix4(a.cutTorch.group.matrixWorld);
            const m = a.lighter.mouth.getWorldPosition(new V());
            if (pf === 1) L.position.set(tip.x - 0.15, tip.y - 0.05, tip.z + 0.1);
            else L.position.set(L.position.x + tip.x - m.x, L.position.y + tip.y - m.y, L.position.z + tip.z - m.z);
            window.__light.gap = m.distanceTo(tip);
            if (pf > 6) { L.updateButtonValue('trigger', 1); }
            if (o.lit || pf > 40) { L.updateButtonValue('trigger', 0); ph = 3; pf = 0; }
          }
          else if (ph === 3) { R.updateAxes('thumbstick', 0.9, 0); if (o.flame.smoke <= 0 && o.flow.fuel >= 9 || pf > 400) { R.updateAxes('thumbstick', 0, 0); ph = 4; pf = 0; } }
          else if (ph === 4) { R.updateAxes('thumbstick', 0, o.flame.type === 'neutral' ? 0 : -0.6); if (o.flame.type === 'neutral' || pf > 600) { R.updateAxes('thumbstick', 0, 0); ph = 5; } }
          else { a.onBeforeFrame = null; }
          window.__light = { ...window.__light, ph, f, lit: o.lit, fuel: o.valve.fuel, pre: o.valve.preheat, type: o.flame.type, lighter: a.lighter.group.visible };
        }; }""")
    for _ in range(240):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(500)
    lt = await page.evaluate("(() => { const o = window.__app.cut.outfit; return { ...window.__light, light: o.done.light, ratio: o.flame.ratio, flowF: o.flow.fuel }; })()")
    check('XR: fuel opened with the held stick, the spark lighter struck at the tip lights the torch, stick to a neutral flame', lt['lit'] and lt['light'] and lt['light']['ok'] and lt['type'] == 'neutral' and lt['lighter'], json.dumps(lt))
    await page.evaluate("(() => { const a = window.__app; a.mode.toggleLighter(); })()")
    # cutting robot: preheat at the edge until bright red, press the lever (trigger) over 0.4 s, travel at the
    # chart speed to the far edge, release; the off hand stays away
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const L = window.__iwer.controllers.left; const cs = a.cut;
        const v = cs.session.vNom; let x = 1, ph = 0, t = 0, lv = 0;
        L.position.set(-0.6, 0.9, -0.2);
        a.onBeforeFrame = (dt) => { t += dt;
          if (ph === 0) { if (cs.surfaceT(x, 0) >= 836) { ph = 1; t = 0; } }
          else if (ph === 1) { lv = Math.min(1, t / 0.4); if (lv >= 1) { ph = 2; t = 0; } }
          else if (ph === 2) { x += v * dt; if (x > cs.coupon.L + 3) { ph = 3; t = 0; lv = 0; } }
          else if (ph === 3 && t > 0.5) { a.onBeforeFrame = null; }
          const pose = a.cutPoseFor(x, 0, ph === 3 ? 3 + 100 * t : 3); R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          R.updateButtonValue('trigger', lv);
          window.__cut = { ph, x, lv, cutting: !!(cs.state && cs.state.cutting) };
        }; }""")
    for _ in range(300):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(1000)
    await page.evaluate(FRAMES, 4)
    ct = await page.evaluate("(() => { const a = window.__app; const L = a.cut.log; const S = a.cut.summary(); return { robot: window.__cut, severed: L.severed, starts: L.starts, losses: L.losses, drop: !!a.cut.plate.drop, ok: S.okShare, cats: S.cats, inc: a.safety.monitor.log.map(i => i.type) }; })()")
    check('XR: preheat to the kindling temperature, lever on the trigger, the cut run off the far edge, the strip drops', ct['severed'] and ct['drop'] and ct['starts'] == 1 and ct['losses'] == 0 and ct['ok'] > 0.8, json.dumps(ct))
    check('XR: properly dressed, no incident during the cut', len(ct['inc']) == 0, json.dumps(ct['inc']))
    await page.screenshot(path=f'{OUT}/cut_xr.png', timeout=150000)
    # bare hand on the hot plate next to the kerf
    await page.evaluate("window.__app.safety.takeOff('hands')")
    # (the grip, which the contact is measured from, sits off the controller origin: the hand is steered so
    # that the grip lands on the target, 20 mm above the plate surface 8 mm from the kerf)
    await page.evaluate("""() => { const a = window.__app; const L = window.__iwer.controllers.left; const V = a.v1.constructor; let f = 0;
        const p = a.cut.worldFromSim(95, 8, 20, new V()); L.position.set(p.x, p.y, p.z); const g = new V();
        a.onBeforeFrame = () => { f++; a.input.hands.left.grip.getWorldPosition(g); L.position.set(L.position.x + p.x - g.x, L.position.y + p.y - g.y, L.position.z + p.z - g.z);
          if (f > 40 || a.safety.monitor.log.some(i => i.type === 'contactBurn')) { L.position.set(-0.6, 0.9, -0.2); a.onBeforeFrame = null; } }; }""")
    for _ in range(60):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(500)
    cb = await page.evaluate("(() => { const a = window.__app; const i = a.safety.monitor.log.find(q => q.type === 'contactBurn'); return { inc: i ? { what: i.what, T: Math.round(i.T), where: i.where } : null, T: Math.round(a.cut.surfaceT(95, 8)) }; })()")
    check('XR: a bare hand on the cut plate near the kerf is burnt (contact burn)', cb['inc'] is not None and cb['inc']['what'] == 'plate', json.dumps(cb))
    # no filter lens while cutting, a bare hand in the spark stream under the kerf
    await page.evaluate("(() => { const a = window.__app; a.mode.start({ plate: 'P6', bevel: 0, outfit: { ready: true }, L: 100, lit: true }); a.safety.quickDress(); a.safety.takeOff('eyes'); a.safety.takeOff('hands'); })()")
    await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const L = window.__iwer.controllers.left; const cs = a.cut; const V = a.v1.constructor;
        const v = cs.session.vNom; let x = 1, ph = 0, t = 0, lv = 0; const tmp = new V(); const g = new V();
        a.onBeforeFrame = (dt) => { t += dt;
          if (ph === 0) { if (cs.surfaceT(x, 0) >= 836) { ph = 1; t = 0; } }
          else if (ph === 1) { lv = Math.min(1, t / 0.4); if (lv >= 1) { ph = 2; t = 0; } }
          else if (ph === 2) { x += v * dt; if (x > 60 || a.safety.monitor.log.some(i => i.type === 'spatterBurn')) { ph = 3; t = 0; lv = 0; } }
          else if (ph === 3 && t > 0.3) { L.position.set(-0.6, 0.9, -0.2); a.onBeforeFrame = null; }
          const pose = a.cutPoseFor(x, 0, ph === 3 ? 3 + 100 * t : 3); R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
          R.updateButtonValue('trigger', lv);
          // the off hand (its grip) under the plate, in the stream 6 cm below the kerf exit
          if (ph === 2) { cs.worldFromSim(x - 2, 0, -cs.coupon.t - 60, tmp); a.input.hands.left.grip.getWorldPosition(g); L.position.set(L.position.x + tmp.x - g.x, L.position.y + tmp.y - g.y, L.position.z + tmp.z - g.z); }
          window.__cut2 = { ph, x, lv };
        }; }""")
    for _ in range(200):
        if await page.evaluate("window.__app.onBeforeFrame == null"): break
        await page.wait_for_timeout(1000)
    inc = await page.evaluate("(() => window.__app.safety.monitor.log.map(i => ({ type: i.type, where: i.where || null, shade: i.shade ?? null })))()")
    types = [i['type'] for i in inc]
    check('XR: cutting with no filter lens is an incident (OSHA 1910.133(a)(5); Harris: goggles against sparks and light rays)', 'cutEyes' in types, json.dumps(inc))
    check('XR: a bare hand in the spark stream under the kerf is burnt (spatter burn)', 'spatterBurn' in types, json.dumps(inc))
    await page.evaluate(FRAMES, 2)
    await page.evaluate("(() => { const a = window.__app; a.mode.finish(); a.mode.tab = 'safety'; a.main.invalidate(); a.main.render(false); })()")
    sr = await page.evaluate("(() => { const R = window.__app.mode.R; return { inc: R.incidents.map(i => i.type), shade: R.ppe.rules.find(r => r.id === 'shade').result.status }; })()")
    check('XR: the incidents and the missing filter lens are in the results', 'cutEyes' in sr['inc'] and sr['shade'] != 'ok', json.dumps(sr))
    check('no page errors (XR)', not errors, '; '.join(errors[:5]))
    await page.close()

async def main():
    httpd = serve(8148)
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
