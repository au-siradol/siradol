// Run: deno run -A tests/space-first-depth.test.cjs
// Span/depth ratios follow the Metric Handbook, 3rd ed., ch. 36 (middle of each table range).
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../works/space-first.html'), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1], ctx);
const run = c => vm.runInContext(c, ctx);
const expect = { 'beam steel': 22, 'beam timber': 17.5, 'beam concrete': 18, 'frame steel': 37.5, 'frame timber': 40, 'frame concrete': 26,
  'truss steel': 12, 'truss timber': 9, 'ptruss steel': 7.5, 'ptruss timber': 6, 'vier steel': 8, 'space steel': 22.5, 'waffle concrete': 22.5, 'skew concrete': 30, 'cbeam concrete': 22 };
for (const [k, v] of Object.entries(expect)) { const [key, m] = k.split(' '); assert.equal(run(`mhR('${key}', '${m}')`), v, k); }
for (const [key, rows] of Object.entries(JSON.parse(run('JSON.stringify(MH)')))) for (const [m, r] of Object.entries(rows)) {
  assert.ok(r[0] <= r[1] && /^[IVXL]+$/.test(r[2]) && /^36-\d+$/.test(r[3]), `${key} ${m}: table reference`);
}
console.log(`PASS: ${Object.keys(expect).length} Metric Handbook span/depth ratios, each with its table and page`);
// geometry follows the ratio: a steel beam on a 24 m span is 24/22 deep, a steel portal rafter 24/37.5
run("Object.assign(S,{L:24,W:48,H:6,mat:'steel',env:null,tm:{}}); var b=evaluate(SYS.find(s=>s.id==='beam'));");
assert.ok(Math.abs(run('b.zone') - 24 / 22) < 0.05, 'beam depth L/22');
for (const id of ['beam', 'portal', 'truss', 'ptruss', 'f_3h', 'f_fix', 'vier', 'space', 'grid', 'g_diag', 'gg_skew', 'cb_h'])
  for (const m of ['steel', 'timber', 'concrete']) {
    const ok = run(`(()=>{ const s=SYS.find(x=>x.id==='${id}'); if(!s||!s.mats.includes('${m}')) return true; S.mat='${m}'; const r=evaluate(s); return [r.zone,r.top].every(Number.isFinite) && r.zone>0; })()`);
    assert.ok(ok, `${id} ${m}: finite depth`);
  }
console.log('PASS: beam depth follows L/22; matched systems build with finite depth in every material');
