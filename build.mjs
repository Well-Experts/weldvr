// Bundle the app into self-contained HTML:
//   dist/index.html     standalone page for HTTPS hosting on the headset
//   dist/artifact.html  the same page as a fragment (title, style, body, script) for the Artifact viewer
// node build.mjs --pages (npm run pages) also writes docs/index.html, the copy GitHub Pages serves.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['chrome110'],
  write: false,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const src = readFileSync('index.html', 'utf8');
const html = src.replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
// fragment: from <!--PAGE--> to <!--/HEAD-->, then the body content
const head = src.slice(src.indexOf('<!--PAGE-->') + '<!--PAGE-->'.length, src.indexOf('<!--/HEAD-->'));
const body = src.slice(src.indexOf('<body>') + '<body>'.length, src.indexOf('</body>'));
const frag = (head + body).replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js}</script>`).trim() + '\n';
writeFileSync('dist/artifact.html', frag);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB, dist/artifact.html ${(frag.length / 1024).toFixed(0)} KB`);
if (process.argv.includes('--pages')) {
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/index.html', html);
  writeFileSync('docs/.nojekyll', ''); // serve the files as they are (no Jekyll processing)
  console.log('docs/index.html updated for GitHub Pages');
}
