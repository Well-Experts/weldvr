# Dump panel canvases to PNG after running setup JS (fast visual checks of UI drawing).
import asyncio, sys, os, http.server, threading, functools, json, base64
from playwright.async_api import async_playwright
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'dist')
def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
async def main():
    httpd = serve(8129)
    out = sys.argv[1]
    steps = json.loads(sys.argv[2])
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await b.new_page(viewport={'width': 640, 'height': 400})
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        await page.goto('http://127.0.0.1:8129/index.html')
        await page.wait_for_timeout(1500)
        for st in steps:
            if st.get('js'):
                r = await page.evaluate(st['js'])
                if r is not None: print('js ->', json.dumps(r)[:1500])
            if st.get('dump'):
                for name in st['dump']:
                    data = await page.evaluate('''(name) => { const a = window.__app; const p = name === 'toast' ? a.toast : a.ui.panels.find(q => q.name === name); p.invalidate(); p.render(a.ui.rtl); return p.canvas.toDataURL('image/png'); }''', name)
                    fn = f"{out}/{st.get('prefix','p')}_{name}.png"
                    open(fn, 'wb').write(base64.b64decode(data.split(',')[1]))
                    print('dumped', fn)
        for l in logs[-20:]: print(l)
        await b.close()
    httpd.shutdown()
asyncio.run(main())
