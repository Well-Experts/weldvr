# Desktop visual check: home, practice setup, demo weld in progress and finished, results, section.
import asyncio, sys, os, http.server, threading, functools, json
from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)

def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

import time
T0 = time.time()
def log(*a):
    print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)

async def shot(page, name):
    await page.screenshot(path=f'{OUT}/{name}.png', timeout=90000)
    log('shot', name)

async def click(page, panel, rid):
    pt = await page.evaluate(f"window.__app.testPoint('{panel}', '{rid}')")
    if not pt:
        print('NO REGION', panel, rid); return False
    await page.mouse.move(pt['x'], pt['y'])
    await page.wait_for_timeout(120)
    await page.mouse.click(pt['x'], pt['y'])
    await page.wait_for_timeout(250)
    return True

async def main():
    httpd = serve(8124)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 1000, 'height': 640})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8124/index.html')
        await page.wait_for_timeout(3000)
        await shot(page, '01_home')
        await click(page, 'main', 'home-practice')
        await page.wait_for_timeout(500)
        await shot(page, '02_setup')
        await click(page, 'main', 'p-start')
        await page.wait_for_timeout(500)
        await click(page, 'main', 'w-demo')
        await page.evaluate("window.__app.simulate(14)")
        await page.evaluate("window.__app.lookAtCoupon(0.32, 0.55, 0.5)")
        await page.wait_for_timeout(1200)
        await shot(page, '03_demo_mid')
        await page.evaluate("window.__app.simulate(60)")
        await page.wait_for_timeout(800)
        await shot(page, '04_demo_done')
        await page.evaluate("window.__app.lookAtCoupon(0.14, 0.35, 0.9)")
        await page.wait_for_timeout(800)
        await shot(page, '05_bead_close')
        await page.evaluate("window.__app.controls.target.set(-0.08, 1.0, -0.5); window.__app.camera.position.set(0.3, 1.5, 0.45); window.__app.controls.update()")
        await click(page, 'main', 'w-finish')
        await page.wait_for_timeout(600)
        await shot(page, '06_results')
        await click(page, 'main', 'r-section')
        await page.wait_for_timeout(600)
        await shot(page, '07_section')
        st = await page.evaluate("JSON.stringify({mode: window.__app.mode.phase, passes: window.__app.station.record.passes.length})")
        print(st)
        for l in logs: print(l)
        await b.close()
    httpd.shutdown()

asyncio.run(main())
