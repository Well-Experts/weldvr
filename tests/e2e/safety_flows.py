# Desktop walk-through of the Safety and PPE drills: dress for the job (panel), booth inspection
# (scene clicks on hazards), hot work permit and fire watch. Screenshots and console errors.
import asyncio, sys, os, http.server, threading, functools, json, time
from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a):
    print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)

def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

async def shot(page, name):
    await page.screenshot(path=f'{OUT}/{name}.png', timeout=120000)
    log('shot', name)

STATE = "(() => { const a = window.__app; const m = a.mode; return [m.id, m.step, m.phase, a.main.regions.map(r => r.id).join(',')].join('|'); })()"

async def click(page, panel, rid):
    pt = await page.evaluate(f"window.__app.testPoint('{panel}', '{rid}')")
    if not pt:
        log('NO REGION', panel, rid); return False
    before = await page.evaluate(STATE)
    await page.mouse.move(pt['x'], pt['y'])
    await page.wait_for_timeout(150)
    await page.mouse.click(pt['x'], pt['y'])
    # wait until the click has been handled (the panel shows something else), up to 15 s
    try:
        await page.wait_for_function(f"(() => {{ const a = window.__app; a.main.render(false); return {STATE} !== {json.dumps(before)}; }})()", timeout=15000, polling=200)
    except Exception:
        log('no change after click', rid)
    return True

async def click_room(page, x, y, z):
    pt = await page.evaluate(f"window.__app.testRoomPoint({x}, {y}, {z})")
    if not pt:
        log('NOT ON SCREEN', x, y, z); return False
    before = await page.evaluate("window.__app.mode.step")
    await page.mouse.move(pt['x'], pt['y'])
    await page.wait_for_timeout(100)
    await page.mouse.down(); await page.mouse.up()
    try:
        await page.wait_for_function(f"window.__app.mode.step !== {json.dumps(before)}", timeout=15000, polling=200)
    except Exception:
        log('scene click: step unchanged', x, y, z)
    return True

async def focus_hazard(page, hid, vp='walkway'):
    await page.evaluate(f"""(() => {{ const a = window.__app; a.goToViewpoint('{vp}'); const r = a.workshop.room; r.updateWorldMatrix(true,false);
      const b = a.safety.hazardBox('{hid}'); const c = b.getCenter(b.min.clone()); const V = c.constructor;
      const vpt = a.workshop.viewpoints['{vp}']; const eye = new V(vpt.x, 1.7, vpt.z);
      const dir = c.clone().sub(eye); dir.y = 0; dir.normalize(); const from = c.clone().addScaledVector(dir, -1.6); from.y = c.y + 0.7;
      a.focusDesktop(c.clone().applyMatrix4(r.matrixWorld), from.applyMatrix4(r.matrixWorld)); a.placeMainInView(); }})()""")

async def click_hazard(page, hid):
    c = await page.evaluate(f"(() => {{ const b = window.__app.safety.hazardBox('{hid}'); const c = b.getCenter(b.min.clone()); return [c.x, c.y, c.z]; }})()")
    return await click_room(page, *c)

async def main():
    httpd = serve(8125)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 900, 'height': 560})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error',) else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8125/index.html')
        await page.wait_for_timeout(3000)
        await shot(page, 's01_home')
        await click(page, 'main', 'home-safety')
        await shot(page, 's02_list')
        # ---- S1
        await click(page, 'main', 's-S1')
        await shot(page, 's03_jobs')
        await click(page, 'main', 'job-J1')
        await page.wait_for_timeout(400)
        await shot(page, 's04_dress_rack')
        # put on the good items through the panel (as on the desktop), bin the damaged ones
        res = await page.evaluate("""() => { const a = window.__app; const sf = a.safety; const want = ['helmet_adf','glasses','jacket_fr','gloves_gauntlet','trousers','boots'];
          const out = []; for (const id of want) { const s = a.workshop.rackSlots.find(r => r.id === id && !r.defect && r.obj.visible); if (s) { sf.putOn(s); out.push(id); } }
          for (const s of a.workshop.rackSlots.filter(r => r.defect && r.obj.visible)) sf.toBin(s);
          a.set('shade', 12); a.main.invalidate(); return out; }""")
        log('worn', res)
        await shot(page, 's05_dressed')
        await click(page, 'main', 'd-check')
        await shot(page, 's06_checked')
        st = await page.evaluate("JSON.stringify({pass: window.__app.mode.result.pass, fails: window.__app.mode.result.chk.failsShall.map(r => r.id)})")
        log('check', st)
        await click(page, 'main', 'c-quit')
        if await page.evaluate("window.__app.mode.step") != 'list':
            log('WARN c-quit click missed; calling endDrill()')
            await page.evaluate("window.__app.mode.endDrill()")
        # ---- S2
        await click(page, 'main', 's-S2')
        await click(page, 'main', 'h-start')
        await page.wait_for_timeout(500)
        await shot(page, 's07_hunt_walkway')
        if await page.evaluate("window.__app.mode.step") != 'hunt':
            log('WARN hunt not started by clicks; starting directly')
            await page.evaluate("window.__app.mode.startHunt()")
        present = await page.evaluate("window.__app.mode.present")
        log('present', present)
        # tag the first two hazards visible from a suitable standpoint
        spots = {'cylinderLoose':'bench','holderOnCylinder':'bench','cableDamaged':'bench','cableSplice':'bench','clampFar':'bench','hoodFar':'bench','wetFloor':'bench','hotUnmarked':'bench','cylinderNoCap':'bench',
                 'combustibles':'walkway','curtainOpen':'walkway','signsMissing':'walkway','extinguisherMissing':'bench','extinguisherEmpty':'bench','extinguisherBlocked':'bench',
                 'oxyFuelTogether':'gasStore','acetyleneLying':'gasStore','oilyRegulator':'walkway','grinderGuard':'grinding'}
        for h in present[:3]:
            vp = spots[h]
            # look at the hazard from 1.6 m away, 0.6 m above it (room frame)
            await page.evaluate(f"""(() => {{ const a = window.__app; a.goToViewpoint('{vp}'); const r = a.workshop.room; r.updateWorldMatrix(true,false);
              const b = a.safety.hazardBox('{h}'); const c = b.getCenter(b.min.clone()); const V = c.constructor;
              const vpt = a.workshop.viewpoints['{vp}']; const eye = new V(vpt.x, 1.7, vpt.z);
              const dir = c.clone().sub(eye); dir.y = 0; dir.normalize(); const from = c.clone().addScaledVector(dir, -1.6); from.y = c.y + 0.7;
              a.focusDesktop(c.clone().applyMatrix4(r.matrixWorld), from.applyMatrix4(r.matrixWorld)); a.placeMainInView(); }})()""")
            await page.wait_for_timeout(300)
            ok = await click_hazard(page, h)
            step = await page.evaluate("window.__app.mode.step")
            log('tag', h, ok, step)
            if step == 'tag':
                await click(page, 'main', f'tag-{h}')
                await shot(page, f's08_tag_{h}')
                await click(page, 'main', 'tag-done')
        await click(page, 'main', 'h-finish')
        await page.evaluate("window.__app.goToViewpoint('walkway')")
        await shot(page, 's09_hunt_done')
        log('hunt', await page.evaluate("JSON.stringify(window.__app.mode.huntResult)"))
        await click(page, 'main', 'hd-list')
        # ---- S3
        await click(page, 'main', 's-S3')
        await click(page, 'main', 'p-start')
        await page.wait_for_timeout(400)
        await shot(page, 's10_permit')
        await click(page, 'main', 'p-sign')  # refused: not safe yet
        await focus_hazard(page, 'combustibles')
        await click_hazard(page, 'combustibles'); await click(page, 'main', 'act-cover')
        await focus_hazard(page, 'extinguisherMissing')
        await click_hazard(page, 'extinguisherMissing')
        acts = await page.evaluate("window.__app.mode.actionsFor('extinguisher').map(a => a.id)")
        log('ext actions', acts, await page.evaluate("window.__app.mode.step"))
        if acts: await click(page, 'main', f'act-{acts[0]}')
        await focus_hazard(page, 'curtainOpen')
        await click_hazard(page, 'curtainOpen'); await click(page, 'main', 'act-close')
        await click(page, 'main', 'p-watch')
        await shot(page, 's11_permit_ready')
        log('permit', await page.evaluate("JSON.stringify(window.__app.mode.permitState())"))
        await click(page, 'main', 'p-sign')
        await page.wait_for_timeout(400)
        await click(page, 'main', 'w-demo')
        await page.evaluate("window.__app.simulate(70)")
        await click(page, 'main', 'w-finish')
        await page.wait_for_timeout(400)
        log('step', await page.evaluate("window.__app.mode.step"))
        # the spark starts to smoulder at a random time during the watch: keep watching until smoke shows
        await page.evaluate("(() => { const a = window.__app; let t = 0; do { a.simulate(5); t += 5; } while (a.mode.smoulder.level === 0 && t < 150); })()")
        w = await page.evaluate("JSON.stringify(window.__app.mode.watch)")
        log('watch', w)
        await page.evaluate("window.__app.goToViewpoint(window.__app.mode.watch.place === 'sweep' ? 'grinding' : 'walkway')")
        await page.wait_for_timeout(300)
        await shot(page, 's12_watch')
        pos = await page.evaluate("window.__app.mode.smoulder.group.position.toArray()")
        # look at the smouldering spot from 1.6 m away (as the fire watcher walking up to it)
        await page.evaluate(f"""(() => {{ const a = window.__app; const r = a.workshop.room; r.updateWorldMatrix(true,false);
          const V = a.v1.constructor; const c = new V({pos[0]}, {pos[1]} + 0.2, {pos[2]});
          const from = c.clone().add(new V(0.9, 1.0, -1.1)); a.main.mesh.visible = false;
          a.focusDesktop(c.clone().applyMatrix4(r.matrixWorld), from.applyMatrix4(r.matrixWorld)); }})()""")
        await page.wait_for_timeout(400)
        await click_room(page, pos[0], pos[1] + 0.2, pos[2])
        # stand up and look ahead again before bringing the panel (it is placed at eye level, in front)
        await page.evaluate("""(() => { const a = window.__app; const c = a.camera; const V = a.v1.constructor;
          const p = c.getWorldPosition(new V()); const d = c.getWorldDirection(new V()); d.y = 0; d.normalize();
          a.focusDesktop(p.clone().addScaledVector(d, 1.5), p); a.main.mesh.visible = true; a.placeMainInView(); })()""")
        acts = await page.evaluate("window.__app.mode.step === 'tag' ? window.__app.mode.actionsFor('smoulder').map(a => a.id) : []")
        log('smoulder actions', acts)
        if acts: await click(page, 'main', 'act-ext')
        await page.evaluate("window.__app.simulate(80)")
        await click(page, 'main', 'w-end')
        await shot(page, 's13_permit_done')
        for l in logs: print(l)
        await b.close()
    httpd.shutdown()

asyncio.run(main())
