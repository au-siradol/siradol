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
for (const k of ['{{TRIP}}', '{{ENGINE}}', '{{MAP}}']) if (!tpl.includes(k)) throw new Error(`template.html ไม่มี ${k}`);

const trip = JSON.stringify(tripObj).replace(/<\//g, '<\\/');
const engine = read('engine.js').replace(/<\//g, '<\\/');
const map = read('map.js').replace(/<\//g, '<\\/');
const html = tpl.replace('{{TRIP}}', () => trip).replace('{{ENGINE}}', () => engine).replace('{{MAP}}', () => map);
fs.writeFileSync(path.join(dir, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
