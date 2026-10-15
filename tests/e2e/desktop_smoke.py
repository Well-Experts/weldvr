# Desktop smoke test: load the built page, collect console errors, screenshot the home view.
import asyncio, sys, os, http.server, threading, functools
from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)

def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

async def main():
    httpd = serve(8123)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await b.new_page(viewport={'width': 1400, 'height': 900})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8123/index.html')
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f'{OUT}/home.png', timeout=120000)
        for l in logs: print(l)
        await b.close()
    httpd.shutdown()

asyncio.run(main())
