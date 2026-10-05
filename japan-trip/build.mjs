// node build.mjs  → index.html (self-contained: trip.json + engine.js + map.js inlined into today.template.html)
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

const trip = JSON.stringify(tripObj).replace(/<\//g, '<\\/');
const engine = read('engine.js').replace(/<\//g, '<\\/');
const map = read('map.js').replace(/<\//g, '<\\/');

// index.html — the one-day "lock screen" view and entry page (same data and engine; no map)
const ttpl = read('today.template.html');
for (const k of ['{{TRIP}}', '{{ENGINE}}', '{{MAP}}', '{{HANDFONT}}', '{{HANDCREDIT}}']) if (!ttpl.includes(k)) throw new Error(`today.template.html ไม่มี ${k}`);
const today = ttpl.replace('{{TRIP}}', () => trip).replace('{{ENGINE}}', () => engine).replace('{{MAP}}', () => map);
// Red handwriting font: 2006_iannnnnBKK by iannnnn (f0nt.com), licence "For educations used only".
// Embedded in the page for display only — the .ttf itself stays out of the repo (fonts/ is gitignored),
// it is not modified or subset, and the last line of the page credits the designer.
const hf = path.join(dir, 'fonts', '2006_iannnnnBKK.ttf');
const hasHand = fs.existsSync(hf);
const face = hasHand ? "@font-face{font-family:'iannnnnBKK';src:url(data:font/ttf;base64," + fs.readFileSync(hf).toString('base64') + ") format('truetype');font-display:swap}" : '';
const credit = hasHand ? '<p class="credit">ตัวอักษรลายมือ: 2006_iannnnnBKK โดย iannnnn (Prachya Singhto) — ใช้เพื่อการศึกษา</p>' : '';
if (!hasHand) console.warn('fonts/2006_iannnnnBKK.ttf not found — index.html falls back to Mali for the red notes');
const todayOut = today.replace('{{HANDFONT}}', () => face).replace('{{HANDCREDIT}}', () => credit);
fs.writeFileSync(path.join(dir, 'index.html'), todayOut);
// today.html — kept so old links still work; forwards to the entry page with the same #dN
fs.writeFileSync(path.join(dir, 'today.html'), '<!doctype html><meta charset="utf-8"><title>Today · Japan 2569</title><meta http-equiv="refresh" content="0; url=index.html"><script>location.replace("index.html" + location.hash)</script><a href="index.html">Japan 2569</a>\n');
console.log('index.html (today view)', (todayOut.length / 1024).toFixed(1) + ' KB');
