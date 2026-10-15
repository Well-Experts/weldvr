import asyncio, sys, os, http.server, threading, functools, time, json
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
async def main():
    httpd = serve(8128)
    out = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': int(sys.argv[3]) if len(sys.argv) > 3 else 900, 'height': int(sys.argv[4]) if len(sys.argv) > 4 else 560})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8128/index.html')
        await page.wait_for_timeout(2500)
        steps = json.loads(sys.argv[2])
        for k, st in enumerate(steps):
            if st.get('js'):
                r = await page.evaluate(st['js'])
                if r is not None: print('js ->', json.dumps(r)[:2000])
            if st.get('wait'): await page.wait_for_timeout(st['wait'])
            if st.get('shot'):
                await page.screenshot(path=f"{out}/{st['shot']}.png", timeout=120000)
                print('shot', st['shot'], flush=True)
        for l in logs[-25:]: print(l)
        await b.close()
    httpd.shutdown()
asyncio.run(main())
