# XR flow of the Safety and PPE module under IWER (emulated Meta Quest 3):
#  - S1: teleport to the PPE station, take items from the rack with the controller (squeeze), put them
#    on at the head and chest, bin a defective item, check the PPE;
#  - test run with bare forearms (T-shirt): the consequence monitor reports UV and burns, the hands
#    show the marks, the incident card appears when the arc stops;
#  - S2: hazard tag by pointing the controller ray and pulling the trigger.
import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
T0 = time.time()
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

# JS helpers installed in the page
HELPERS = """
window.__t = {
  // press and release a controller button over a few frames
  press(side, btn, frames = 3) { return new Promise(res => { const a = window.__app; const C = window.__iwer.controllers[side]; let n = 0;
    C.updateButtonValue(btn, 1); const prev = a.onBeforeFrame;
    a.onBeforeFrame = (dt, f) => { if (prev) prev(dt, f); n++; if (n === frames) C.updateButtonValue(btn, 0); if (n > frames + 2) { a.onBeforeFrame = prev; res(); } }; }); },
  hold(side, btn, v) { window.__iwer.controllers[side].updateButtonValue(btn, v); },
  // controller pose: grip at a world point, pointing along dir
  pose(side, p, dir = [0, 0, -1]) { const C = window.__iwer.controllers[side]; C.position.set(p[0], p[1], p[2]);
    const n = Math.hypot(...dir); const d = dir.map(v => v / n);
    const v = [0 * d[2] - (-1) * d[1], (-1) * d[0] - 0 * d[2], 0]; const w = 1 - d[2]; const q = Math.hypot(v[0], v[1], v[2], w) || 1;
    C.quaternion.set(v[0] / q, v[1] / q, v[2] / q, w / q); },
  frames(n) { return new Promise(res => { const a = window.__app; let k = 0; const prev = a.onBeforeFrame; a.onBeforeFrame = (dt, f) => { if (prev) prev(dt, f); if (++k >= n) { a.onBeforeFrame = prev; res(); } }; }); },
  click(id) { const a = window.__app; a.main.invalidate(); a.main.render(false); const r = a.main.regions.find(q => q.id === id); if (!r) return 'NO ' + id; r.onClick(); return 'ok'; },
  // a hand position near the body from which the ray to a world point does not pass through a panel
  // (panels take the pointer first, as on the headset)
  clearSource(target, head) { const a = window.__app; const V = a.v1.constructor; const t = new V(...target);
    const offs = [[0, -0.3, 0], [-0.25, -0.3, 0], [0.25, -0.3, 0], [-0.25, -0.1, 0.1], [0.25, -0.1, 0.1], [0, 0.05, 0.1], [-0.35, -0.45, 0], [0.35, -0.45, 0]];
    for (const o of offs) { const s = new V(head[0] + o[0], head[1] + o[1], head[2] + o[2]); const d = t.clone().sub(s).normalize();
      if (!a.ui.pick(s, d)) return s.toArray(); }
    return [head[0], head[1] - 0.3, head[2]]; },
};
"""

async def main():
    httpd = serve(8134)
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 800, 'height': 450})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8134/index.html')
        await page.wait_for_timeout(2000)
        await page.evaluate(HELPERS)
        await page.evaluate("window.__app.enterXR('vr')")
        await page.wait_for_timeout(1500)
        log('presenting', await page.evaluate("window.__app.renderer.xr.isPresenting"))
        # ---- S1: dress at the rack
        for c in ['home-safety', 's-S1', 'job-J1']:
            r = await page.evaluate(f"window.__t.click('{c}')")
            if r != 'ok': fails.append(f'click {c}: {r}')
        await page.evaluate("window.__t.frames(4)")
        st = await page.evaluate("({ vp: window.__app.viewpoint, step: window.__app.mode.step })")
        log('after start', st)
        if st['vp'] != 'rack' or st['step'] != 'dress': fails.append(f'dress start {st}')
        await page.screenshot(path=f'{OUT}/xs1_rack.png', timeout=120000); log('shot xs1')
        # take items: direct grab (hand at the item) for gloves and helmet, pointing grab for the jacket
        async def grab_and_wear(item_id, zone, defect=None, far=False):
            pos = await page.evaluate(f"""(() => {{ const a = window.__app; const s = a.workshop.rackSlots.find(r => r.id === '{item_id}' && (r.defect || null) === {json.dumps(defect)} && r.obj.visible);
                if (!s) return null; const p = s.obj.getWorldPosition(a.v1.clone()); return [p.x, p.y, p.z]; }})()""")
            if not pos: fails.append(f'{item_id} not on the rack'); return
            head = await page.evaluate("window.__app.headPos.toArray()")
            if far:
                # stand back and point the ray at the middle of the item (from a hand position with a clear line)
                ctr = await page.evaluate(f"""(() => {{ const a = window.__app; const s = a.workshop.rackSlots.find(r => r.id === '{item_id}' && (r.defect || null) === {json.dumps(defect)} && r.obj.visible);
                    return a.safety.itemSphere(s, {{ center: a.v2.clone(), radius: 0 }}).center.toArray(); }})()""")
                src = await page.evaluate(f"window.__t.clearSource({json.dumps(ctr)}, {json.dumps(head)})")
                d = [ctr[0] - src[0], ctr[1] - src[1], ctr[2] - src[2]]
                await page.evaluate(f"window.__t.pose('right', {json.dumps(src)}, {json.dumps(d)})")
            else:
                await page.evaluate(f"window.__t.pose('right', {json.dumps(pos)})")
            await page.evaluate("window.__t.frames(3)")
            await page.evaluate("window.__t.hold('right', 'squeeze', 1)")
            await page.evaluate("window.__t.frames(3)")
            held = await page.evaluate("window.__app.safety.held.right && window.__app.safety.held.right.id")
            if held != item_id: fails.append(f'grab {item_id}: held {held}')
            # bring it to the head or chest and let go
            tgt = [head[0], head[1] - 0.02, head[2] - 0.1] if zone == 'head' else [head[0], head[1] - 0.42, head[2] - 0.12]
            await page.evaluate(f"window.__t.pose('right', {json.dumps(tgt)})")
            await page.evaluate("window.__t.frames(3)")
            await page.evaluate("window.__t.hold('right', 'squeeze', 0)")
            await page.evaluate("window.__t.frames(3)")
        await grab_and_wear('helmet_adf', 'head')
        await grab_and_wear('glasses', 'head')
        await grab_and_wear('gloves_gauntlet', 'chest')
        await grab_and_wear('jacket_fr', 'chest', far=True)
        worn = await page.evaluate("JSON.stringify(window.__app.safety.worn)")
        log('worn', worn)
        for need in ['helmet_adf', 'glasses', 'gloves_gauntlet', 'jacket_fr']:
            if need not in worn: fails.append(f'not worn: {need}')
        # bin the damaged glove: carry it to the bin
        pos = await page.evaluate("""(() => { const a = window.__app; const s = a.workshop.rackSlots.find(r => r.id === 'gloves_gauntlet' && r.defect === 'hole' && r.obj.visible); const p = s.obj.getWorldPosition(a.v1.clone()); return [p.x, p.y, p.z]; })()""")
        await page.evaluate(f"window.__t.pose('right', {json.dumps(pos)})")
        await page.evaluate("window.__t.frames(2)")
        await page.evaluate("window.__t.hold('right', 'squeeze', 1)")
        await page.evaluate("window.__t.frames(3)")
        binp = await page.evaluate("(() => { const p = window.__app.safety.bin.getWorldPosition(window.__app.v1.clone()); return [p.x, p.y + 0.5, p.z]; })()")
        await page.evaluate(f"window.__t.pose('right', {json.dumps(binp)})")
        await page.evaluate("window.__t.frames(3)")
        await page.evaluate("window.__t.hold('right', 'squeeze', 0)")
        await page.evaluate("window.__t.frames(3)")
        rej = await page.evaluate("JSON.stringify(window.__app.safety.rejected)")
        log('rejected', rej)
        if 'hole' not in rej: fails.append('damaged glove not binned')
        await page.screenshot(path=f'{OUT}/xs2_dressed.png', timeout=120000); log('shot xs2')
        await page.evaluate("window.__t.click('d-check')")
        res = await page.evaluate("JSON.stringify({ pass: window.__app.mode.result.pass, fails: window.__app.mode.result.chk.failsShall.map(r => r.id), should: window.__app.mode.result.chk.failsShould.map(r => r.id) })")
        log('check', res)
        # (trousers and boots not taken: only 'should' rules fail; shall rules pass)
        if '"fails":[]' not in res: fails.append(f'check fails: {res}')
        # ---- test run with bare forearms: take the jacket off (T-shirt underneath)
        await page.evaluate("window.__app.safety.takeOff('torso')")
        r = await page.evaluate("window.__t.click('c-try')")
        if r != 'ok': fails.append('c-try ' + r)
        await page.evaluate("window.__t.frames(4)")
        await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
        await page.evaluate("window.__t.press('right', 'b-button')")  # helmet down
        log('helmet', await page.evaluate("({ kind: window.__app.helmet.kind, down: window.__app.helmet.down })"))
        await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right; const L = window.__iwer.controllers.left;
            const w = a.station.windows(); let s = 8; let t = 0;
            a.onBeforeFrame = (dt) => { t += dt; if (t > 0.4) s += w.speedTarget * dt;
              const pose = a.gunPoseFor(s, 0, 42, 5, 17);
              R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
              // left hand resting on the bench near the coupon
              L.position.set(pose.position[0] - 0.25, pose.position[1] - 0.05, pose.position[2] + 0.05);
              R.updateButtonValue('trigger', t > 0.2 && s < 70 ? 1 : 0);
              window.__robot = { s, t }; }; }""")
        await page.wait_for_timeout(9000)
        await page.screenshot(path=f'{OUT}/xs3_tryweld.png', timeout=120000); log('shot xs3')
        # the emulated session runs at about one frame per second (dt clamped to 50 ms): hold the gun where
        # it is with the trigger pulled and run 12 s of arc time through the frame logic (welding, effects
        # state, consequence monitor) without rendering
        await page.evaluate("window.__app.onBeforeFrame = null")
        arc = await page.evaluate("!!(window.__app.station.lastState && window.__app.station.lastState.arcOn)")
        log('arc on before the accelerated run', arc)
        if not arc: fails.append('arc not burning in the test run')
        uv0 = await page.evaluate("JSON.stringify(window.__app.safety.monitor.uv)")
        await page.evaluate("window.__app.simulateFull(12)")
        await page.evaluate("window.__iwer.controllers.right.updateButtonValue('trigger', 0)")
        await page.evaluate("window.__t.frames(10)")
        inc = await page.evaluate("JSON.stringify(window.__app.safety.monitor.log.map(e => e.type + (e.where ? ':' + e.where : '')))")
        log('incidents', inc)
        uv = await page.evaluate("JSON.stringify(window.__app.safety.monitor.uv)")
        log('uv dose', uv0, '->', uv)
        uvd = json.loads(uv)
        if not (uvd.get('rightArm', 0) > 0 and uvd.get('leftArm', 0) > 0): fails.append(f'no UV dose on the bare forearms {uv}')
        if 'uvSkin' not in inc or 'forearm' not in inc: fails.append('no UV skin incident on a bare forearm')
        card = await page.evaluate("({ visible: window.__app.safety.card.mesh.visible, type: window.__app.safety.cardInc && window.__app.safety.cardInc.type })")
        log('card', card)
        if not card['visible']: fails.append('incident card not shown after the arc stopped')
        await page.evaluate("window.__t.press('right', 'b-button')")  # helmet up to read the card
        await page.evaluate("window.__t.frames(6)")
        await page.screenshot(path=f'{OUT}/xs4_card.png', timeout=120000); log('shot xs4')
        r = await page.evaluate("window.__t.click('w-finish')")
        await page.evaluate("window.__t.frames(4)")
        log('after finish', await page.evaluate("window.__app.mode.step"))
        await page.screenshot(path=f'{OUT}/xs5_trydone.png', timeout=120000); log('shot xs5')
        # ---- S2: point the ray at the extinguisher and pull the trigger
        await page.evaluate("window.__app.mode.endDrill()")
        await page.evaluate("window.__t.click('s-S2'); window.__app.mode.huntN = 3; window.__t.click('h-start')")
        await page.evaluate("window.__t.frames(4)")
        box = await page.evaluate("""(() => { const a = window.__app; const b = a.safety.hazardBox('extinguisherMissing'); const c = b.getCenter(b.min.clone()); c.applyMatrix4(a.workshop.room.matrixWorld); return [c.x, c.y, c.z]; })()""")
        head = await page.evaluate("window.__app.headPos.toArray()")
        src = await page.evaluate(f"window.__t.clearSource({json.dumps(box)}, {json.dumps(head)})")
        await page.evaluate(f"window.__t.pose('right', {json.dumps(src)}, [{box[0]-src[0]}, {box[1]-src[1]}, {box[2]-src[2]}])")
        await page.evaluate("window.__t.frames(3)")
        await page.evaluate("window.__t.press('right', 'trigger')")
        await page.evaluate("window.__t.frames(3)")
        st = await page.evaluate("({ step: window.__app.mode.step, pick: window.__app.mode.pick && window.__app.mode.pick.id })")
        log('ray pick', st)
        if st['pick'] != 'extinguisher': fails.append(f'ray pick {st}')
        await page.screenshot(path=f'{OUT}/xs6_hunt_tag.png', timeout=120000); log('shot xs6')
        log('perf', await page.evaluate("JSON.stringify(window.__app.perf)"))
        for l in logs[-20:]: print(l)
        await b.close()
    httpd.shutdown()
    print('FAILURES:', fails if fails else 'none')

asyncio.run(main())
