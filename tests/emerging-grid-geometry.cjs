// Run with node tests/emerging-grid-geometry.cjs.
// Exercises the actual geometry functions without WebGL or CDN dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../works/emerging-grid-catenoid.html'), 'utf8');
const geometry = html.slice(html.indexOf('        const P = 20'), html.indexOf('        function neighbourCSR'));
const tube = html.slice(html.indexOf('        function tubeAt('), html.indexOf('        function drawPersp'));
const context = vm.createContext({ console, assert });
vm.runInContext(geometry + '\n' + tube, context);
vm.runInContext(`
initSeeds();
let checked = 0;
for (const [fl, ri] of [[.1, 0], [.3, 54], [.41, 50], [.45, 75]]) {
    S.flange = fl; S.rise = ri; S.version++;
    const C = getCrude();
    assert(C.tubes.length > 0);
    for (const L of C.LV) for (const c of L.cells) if (c?.hole) {
        assert.equal(c.hole.length, c.poly.length, 'crude corner count preserved');
        const offsets = [];
        for (let k = 0; k < c.poly.length; k++) {
            const j = (k + 1) % c.poly.length;
            const a = c.poly[k], b = c.poly[j], p = c.hole[k], q = c.hole[j];
            const ex = b.x - a.x, ez = b.z - a.z, length2 = ex * ex + ez * ez;
            assert((q.x - p.x) * ex + (q.z - p.z) * ez >= .25 * length2 - 1e-5, 'inset edge does not collapse or reverse');
            assert(Math.abs((q.x - p.x) * ez - (q.z - p.z) * ex) < 1e-5, 'inset edge remains parallel');
            offsets.push((ex * (p.z - a.z) - ez * (p.x - a.x)) / Math.sqrt(length2));
            for (const h of c.hole) assert(ex * (h.z - a.z) - ez * (h.x - a.x) >= -1e-5, 'hole stays within its cell');
            checked++;
        }
        assert(Math.max(...offsets) - Math.min(...offsets) < 1e-5, 'one inset distance around the ring');
    }
    for (const t of C.tubes) {
        assert.equal(t.mLo.length, t.mHi.length, 'paired rings have equal counts');
        for (const s of [0, 1/3, 2/3, 1]) for (const p of tubeAt(t, s))
            assert([p.x, p.y, p.z].every(Number.isFinite), 'tube ring is finite');
    }
    let m = { nV: C.pos.length / 3, pos: C.pos, faces: C.M.faces, tags: C.M.tags, pin: C.pin };
    for (let k = 0; k < 3; k++) m = catmullClark(m.nV, m.pos, m.faces, m.tags, m.pin);
    for (const x of m.pos) assert(Number.isFinite(x), 'subdivision remains finite');
    for (const face of m.faces) {
        assert.equal(new Set(face).size, face.length, 'no repeated vertex in subdivided face');
        for (const v of face) assert(v >= 0 && v < m.nV, 'valid face index');
    }
}
console.log('PASS: ' + checked + ' inset edges, four flange/slope settings, paired rings and three subdivision passes.');
`, context);
