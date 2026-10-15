# XR flow under IWER (emulated Meta Quest 3 with Touch Plus controllers):
#  enter VR, click the menu with the off-hand ray, lower the helmet with B, weld with the gun.
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

async def main():
    httpd = serve(8130)
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 900, 'height': 500})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8130/index.html')
        await page.wait_for_timeout(2000)
        vr_enabled = await page.evaluate("!document.getElementById('enter-vr').disabled")
        log('Enter VR enabled:', vr_enabled)
        if not vr_enabled: fails.append('enter-vr disabled under IWER')
        await page.evaluate("window.__app.enterXR('vr')")
        await page.wait_for_timeout(1500)
        info = await page.evaluate("""() => { const a = window.__app; return { presenting: a.renderer.xr.isPresenting, ws: a.workstation.position.toArray().map(v => +v.toFixed(3)), left: a.input.hands.left.connected, right: a.input.hands.right.connected, fps: a.targetFps }; }""")
        log('session', info)
        if not info['presenting']: fails.append('not presenting')
        # look at the bench
        await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")  # pitch -30 deg
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/x1_home.png', timeout=120000); log('shot x1')
        # point the left controller at the Practice tile and pull the trigger
        target = await page.evaluate("window.__app.regionWorld('main', 'home-practice')")
        await page.evaluate("""(t) => { const L = window.__iwer.controllers.left; L.position.set(-0.2, 1.25, -0.25);
            const o = [-0.2, 1.25, -0.25]; const d = [t[0]-o[0], t[1]-o[1], t[2]-o[2]]; const n = Math.hypot(...d);
            const fx = d[0]/n, fy = d[1]/n, fz = d[2]/n;
            // quaternion rotating -Z to d
            const ax = [ -fy*(-1) * 0 + 0, 0, 0 ];
            const v = [0*fz - (-1)*fy, (-1)*fx - 0*fz, 0*fy - 0*fx]; // cross((0,0,-1), d)
            const w = 1 + (-fz); const qn = Math.hypot(v[0], v[1], v[2], w);
            L.quaternion.set(v[0]/qn, v[1]/qn, v[2]/qn, w/qn); }""", target)
        await page.wait_for_timeout(600)
        await page.evaluate("""() => new Promise(res => { const a = window.__app; const L = window.__iwer.controllers.left; let n = 0;
            L.updateButtonValue('trigger', 1);
            a.onBeforeFrame = () => { n++; if (n === 3) L.updateButtonValue('trigger', 0); if (n > 5) { a.onBeforeFrame = null; res(); } }; })""")
        await page.wait_for_timeout(300)
        mode = await page.evaluate("window.__app.mode.id + ':' + window.__app.mode.phase")
        log('after pointer click:', mode)
        if not mode.startswith('practice'): fails.append('pointer click did not open Practice: ' + mode)
        # start welding (API click), lower helmet with B on the gun hand
        await page.evaluate("() => { const a = window.__app; a.main.render(false); a.main.regions.find(r => r.id === 'p-start').onClick(); }")
        await page.wait_for_timeout(500)
        # the coupon set-up put the PPE on (helmet up); a quick downward head pitch (nod) lowers it
        await page.evaluate("window.__iwer.quaternion.set(0, 0, 0, 1)")
        await page.wait_for_timeout(1500)
        await page.evaluate("window.__iwer.quaternion.set(-0.2588, 0, 0, 0.9659)")
        await page.wait_for_timeout(1500)
        async def press_b():
            await page.evaluate("""() => new Promise(res => { const a = window.__app; const R = window.__iwer.controllers.right; let n = 0;
                R.updateButtonValue('b-button', 1);
                a.onBeforeFrame = () => { n++; if (n === 3) R.updateButtonValue('b-button', 0); if (n > 5) { a.onBeforeFrame = null; res(); } }; })""")
            await page.wait_for_timeout(200)
            return await page.evaluate("window.__app.helmet.down")
        h0 = await page.evaluate("window.__app.helmet.down")
        log('helmet after the quick downward head pitch (nod):', h0)
        if not h0: fails.append('nod did not lower the helmet')
        h1 = await press_b()
        h2 = await press_b()
        log('B toggles helmet:', h1, h2)
        if h1 or not h2: fails.append(f'B toggle sequence wrong: {h1} {h2}')
        await page.wait_for_timeout(600)
        # robot welder: drives the right controller along the joint each frame, trigger held
        await page.evaluate("""() => { const a = window.__app; const R = window.__iwer.controllers.right;
            const w = a.station.windows(); let s = 8; let t = 0;
            a.onBeforeFrame = (dt) => { t += dt; if (t > 0.4) s += w.speedTarget * dt;
              const pose = a.gunPoseFor(s, 0, 42, 5, 17);
              R.position.set(...pose.position); R.quaternion.set(...pose.quaternion);
              R.updateButtonValue('trigger', t > 0.2 && s < 60 ? 1 : 0);
              window.__robot = { s, t };
            }; }""")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/x2_weld.png', timeout=120000); log('shot x2')
        await page.wait_for_timeout(12000)
        st = await page.evaluate("""() => { const a = window.__app; const rec = a.station.record; const p = rec.passes[0]; let n = 0; for (const v of p.area) if (v > 0.05) n++;
            const ls = a.station.lastState; return { samples: n, robot: window.__robot, arcStarts: a.station.log.arcStarts, helmetUp: a.station.log.helmetUpStarts, arcOn: !!(ls && ls.arcOn), ctwd: ls && ls.tech.ctwd, wa: ls && ls.tech.workAngle, ta: ls && ls.tech.travelAngle, frames: a.station.frames.length / 12, perf: a.perf }; }""")
        log('weld state', json.dumps(st))
        if st['samples'] < 5: fails.append('no deposition from the XR gun')
        if st['helmetUp'] != 0: fails.append('arc struck with helmet up was logged')
        # look straight at the pool through the lens
        await page.evaluate("""() => { const a = window.__app; const ls = a.station.lastState; if (!ls || !ls.hit) return;
            const p = a.station.worldFromSim(ls.hit.x, ls.hit.u, ls.hit.v, a.v1.clone());
            const h = [0.05, 1.45, -0.12]; window.__iwer.position.set(...h);
            const d = [p.x - h[0], p.y - h[1], p.z - h[2]]; const n = Math.hypot(...d);
            const yaw = Math.atan2(-d[0], -d[2]), pitch = Math.asin(d[1] / n);
            const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
            window.__iwer.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx); }""")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/x3_weld_later.png', timeout=120000); log('shot x3')
        # helmet up while welding: the arc-flash warning must fire and be logged
        await press_b()
        await page.wait_for_timeout(2500)
        fl = await page.evaluate("window.__app.station.log.flashes")
        log('flash exposures with helmet up:', fl)
        if fl < 1: fails.append('arc flash not detected with the helmet up')
        await page.screenshot(path=f'{OUT}/x4_flash.png', timeout=120000); log('shot x4')
        await page.evaluate("window.__app.onBeforeFrame = null")
        for l in logs[-20:]: print(l)
        await b.close()
    httpd.shutdown()
    print('FAILURES:', fails if fails else 'none')

asyncio.run(main())
