#!/usr/bin/env python3
"""Build a self-contained snapshot of the dashboard: one HTML file with the
data, styles and app logic inlined. Opens in any browser with no server.
Output: Snapshots/trading-journey-<sourceThrough>.html"""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
def read(name):
    return open(os.path.join(HERE, name), encoding='utf-8-sig').read()
data = json.loads(read('dashboard-data.json'))
html, css, js = read('index.html'), read('styles.css'), read('app.js')
js = js.replace("await fetch('dashboard-data.json').then(r=>{if(!r.ok)throw Error(r.statusText);return r.json()})",
                'window.__DATA__')
assert 'window.__DATA__' in js, 'fetch replacement failed - app.js changed?'
payload = json.dumps(data).replace('</', '<\\/')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
# Inline scripts ignore `defer`, so wait for window load (ensures the Chart.js
# CDN script has executed) before running the app code.
wrapped = "window.addEventListener('load',function(){\n" + js + "\n});"
html = html.replace('<script src="app.js" defer></script>',
                    '<script>window.__DATA__=' + payload + ';</script>\n<script>\n' + wrapped + '\n</script>')
out_dir = os.path.join(HERE, 'Snapshots')
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f"trading-journey-{data['sourceThrough']}.html")
open(out, 'w', encoding='utf-8').write(html)
# Also publish as advisor.html in the repo root — a single self-contained file
# the advisor's script downloads and opens directly (no local server needed).
open(os.path.join(HERE, 'advisor.html'), 'w', encoding='utf-8').write(html)
print('Snapshot written:', out, '+ advisor.html')
