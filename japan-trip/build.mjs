// node build.mjs  → index.html (self-contained: trip.json + engine.js inlined into template.html)
// Runs from any directory; refuses to build if trip.json fails Engine.validate().
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const Engine = createRequire(import.meta.url)('./engine.js');

const tripObj = JSON.parse(read('trip.json'));
const problems = Engine.validate(tripObj);
if (problems.length) {
  console.error('trip.json ไม่ผ่านการตรวจ:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const tpl = read('template.html');
for (const k of ['{{TRIP}}', '{{ENGINE}}', '{{MAP}}', '{{STYLE}}', '{{VENDOR_CSS}}', '{{VENDOR_JS}}']) if (!tpl.includes(k)) throw new Error(`template.html ไม่มี ${k}`);

const trip = JSON.stringify(tripObj).replace(/<\//g, '<\\/');
const engine = read('engine.js').replace(/<\//g, '<\\/');
const map = read('map.js').replace(/<\//g, '<\\/');
const js = f => read(f).replace(/<\/(script)/gi, '<\\/$1');
const style = JSON.stringify(JSON.parse(read('map-style.json'))).replace(/<\//g, '<\\/');
const vendorJs = js('vendor/maplibre-gl.js') + '\n;\n' + js('vendor/pmtiles.js');
const html = tpl.replace('{{TRIP}}', () => trip).replace('{{ENGINE}}', () => engine).replace('{{MAP}}', () => map)
  .replace('{{STYLE}}', () => style).replace('{{VENDOR_CSS}}', () => read('vendor/maplibre-gl.css')).replace('{{VENDOR_JS}}', () => vendorJs);
fs.writeFileSync(path.join(dir, 'plan.html'), html);
console.log('plan.html', (html.length / 1024).toFixed(1) + ' KB');

// index.html — the one-day "lock screen" view and entry page (same data and engine; no map)
const ttpl = read('today.template.html');
for (const k of ['{{TRIP}}', '{{ENGINE}}', '{{MAP}}', '{{HANDFONT}}']) if (!ttpl.includes(k)) throw new Error(`today.template.html ไม่มี ${k}`);
const today = ttpl.replace('{{TRIP}}', () => trip).replace('{{ENGINE}}', () => engine).replace('{{MAP}}', () => map);
fs.writeFileSync(path.join(dir, 'index.html'), today.replace('{{HANDFONT}}', ''));
// today.html — kept so old links still work; forwards to the entry page with the same #dN
fs.writeFileSync(path.join(dir, 'today.html'), '<!doctype html><meta charset="utf-8"><title>Today · Japan 2569</title><meta http-equiv="refresh" content="0; url=index.html"><script>location.replace("index.html" + location.hash)</script><a href="index.html">Japan 2569</a>\n');

// today.local.html — same page with the private handwriting font embedded (fonts/ is gitignored: the font is
// licensed for educational use only, so it is never committed or published).
const hf = path.join(dir, 'fonts', '2006_iannnnnBKK.ttf');
if (fs.existsSync(hf)) {
  const face = "@font-face{font-family:'iannnnnBKK';src:url(data:font/ttf;base64," + fs.readFileSync(hf).toString('base64') + ") format('truetype');font-display:swap}";
  fs.writeFileSync(path.join(dir, 'today.local.html'), today.replace('{{HANDFONT}}', () => face));
  console.log('today.local.html (with handwriting font, not committed)');
}
console.log('index.html (today view)', (today.length / 1024).toFixed(1) + ' KB');
