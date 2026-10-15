# Tracking lab under IWER: static test produces jitter, loss and frame statistics.
import asyncio, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
IWER = os.path.join(os.path.dirname(__file__), '..', '..', 'node_modules', 'iwer', 'build', 'iwer.min.js')
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
async def main():
    httpd = serve(8134)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 320, 'height': 200})
        await page.add_init_script(path=IWER)
        await page.add_init_script(script="window.__iwer = new IWER.XRDevice(IWER.metaQuest3); window.__iwer.installRuntime({ forceInstall: true }); window.__iwer.position.set(0, 1.6, 0);")
        await page.goto('http://127.0.0.1:8134/index.html')
        await page.wait_for_timeout(1500)
        await page.evaluate("window.__app.enterXR('vr')")
        await page.wait_for_timeout(1200)
        await page.evaluate("(() => { const a = window.__app; a.main.render(false); a.main.regions.find(r => r.id === 'home-tracking').onClick(); a.main.render(false); a.main.regions.find(r => r.id === 'tr-static').onClick(); })()")
        # add 0.3 mm of synthetic jitter to the controller so the statistic is not trivially zero
        await page.evaluate("""(() => { const a = window.__app; const R = window.__iwer.controllers.right; R.position.set(0.2, 1.1, -0.3); let k = 0;
            a.onBeforeFrame = () => { k++; R.position.set(0.2 + 0.0003 * Math.sin(k * 1.7), 1.1 + 0.0003 * Math.cos(k * 2.3), -0.3); }; })()""")
        t0 = time.time()
        while time.time() - t0 < 150:
            ph = await page.evaluate("window.__app.mode.phase")
            if ph == 'report': break
            await page.wait_for_timeout(1000)
        r = await page.evaluate("window.__app.mode.last")
        print(json.dumps(r, indent=1))
        ok = r and r['kind'] == 'static' and r.get('posRMSmm') is not None and 0.1 < r['posRMSmm'] < 0.6 and r['n'] > 20
        print('PASS' if ok else 'FAIL', 'tracking lab static test')
        await b.close()
    httpd.shutdown()
asyncio.run(main())
