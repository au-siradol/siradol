// Run: node tests/folded-cylinder.test.cjs
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../works/space-first.html'), 'utf8');
const ctx = vm.createContext({console});
vm.runInContext(html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1], ctx);
const run = code => vm.runInContext(code, ctx);
// The perpendicular distance to each segment's axis and its transverse ordinate
// must satisfy the circle equation on BOTH sides of every shared fold.
function check(c) {
  for (const rings of c.rings) {
    const yc = (rings[0][0][1] + rings[0].at(-1)[1]) / 2;
    for (let k = 0; k < c.normals.length; k++) {
      const [nx,nz] = c.normals[k], [ax,az] = c.path[k];
      for (const ring of [rings[k], rings[k+1]]) for (const [x,y,z] of ring) {
        const d = nx*(x-ax)+nz*(z-az);
        assert.ok(Math.abs((d/c.signs[k])**2+(y-yc)**2-c.radius**2) < 1e-7, 'vertex leaves its cylindrical surface');
      }
    }
  }
}
// Every vertex of a cylinder piece lies on one of the pieces' elliptic cylinders.
function checkPieces(m, faces) {
  const on = ([x,y,z]) => m.pieces.some(p => m.ys.some(yc => { const eta=(y-yc)/m.radius; if (Math.abs(eta)>1+1e-9) return false;
    const d=[p.c1[0]-p.c0[0],p.c1[1]-p.c0[1]], l=Math.hypot(...d), q=[x-p.c0[0],z-p.c0[1]], e=q[0]*p.m[0]+q[1]*p.m[1], side=Math.abs((q[0]*d[1]-q[1]*d[0])/l);
    return Math.abs(side-Math.abs(e))<1e-6 && Math.abs(e-p.k*m.radius*(1-Math.sqrt(Math.max(0,1-eta*eta))))<1e-6; }));
  for (const f of faces) if (f.c==='shellx') for (const v of f.pts) assert.ok(on(v), 'vertex leaves its elliptic cylinder');
}
for (const [L,W,H] of [[3,3,2.5],[24,24,6],[24,48,6],[90,120,18],[200,200,30]]) {
  run(`Object.assign(S,{L:${L},W:${W},H:${H},mat:'concrete',env:null,lite:false});`);
  for (const [id,mode] of [['ls_frame','two'],['ls_arch','top'],['ls_gird','central'],['barrel','short']]) {
    run(`S.tm={'${id}':'${mode}'}; var rr=evaluate(SYS.find(s=>s.id==='${id}'));`);
    const r=JSON.parse(run('JSON.stringify(rr)'));
    if (r.cylinder) check(r.cylinder); if (r.pieces) checkPieces(r.pieces, r.surf.faces3.filter(f=>f.piece));
    if (id!=='barrel') assert.ok(r.cylinder || r.pieces, 'every linear shell is built from cylinders');
    if (r.supportCylinder) check(r.supportCylinder);
    assert.ok([r.zone,r.top,r.eff].every(Number.isFinite));
    for (const f of r.surf.faces3) for(const p of f.pts) assert.ok(p.every(Number.isFinite));
    if(id==='ls_arch') assert.equal(r.thrust,null,'no assumed pinned-base thrust');
    if(id==='barrel') { assert.ok(r.thrust>0,'short barrel arches across the span'); assert.ok(r.surf.posts.length>=4); }
    if(id==='ls_gird' && W>=24) assert.equal(r.columnFree,false,'central support must fail column-free screening');
  }
}
console.log('PASS: 20 linear shell and short barrel cases; circular and elliptic sections, shared intersections, finite geometry and support screening');
// Explicit page 243–244 modes: no shell vertex may pass below the floor,
// and A-frame feet must stand outside the requested clear-space rectangle.
for (const [L,W,H] of [[12,24,4],[24,24,6],[48,72,9]]) {
  run(`Object.assign(S,{L:${L},W:${W},H:${H},mat:'concrete',env:null});`);
  for (const [id,mode] of [['ls_frame','a'],['ls_arch','two'],['ls_arch','top'],['ls_gird','central']]) {
    run(`S.tm={'${id}':'${mode}'}; var rr=evaluate(SYS.find(s=>s.id==='${id}'));`);
    const r=JSON.parse(run('JSON.stringify(rr)'));
    if(r.cylinder) check(r.cylinder); if(r.supportCylinder)check(r.supportCylinder);
    if(r.pieces) checkPieces(r.pieces, r.surf.faces3.filter(f=>f.piece));
    const minZ=Math.min(...r.surf.faces3.flatMap(f=>f.pts.map(p=>p[2])));
    assert.ok(minZ>=-1e-7,`${id} ${mode}: below-floor geometry ${minZ}`);
    if(id==='ls_frame') { const xs=r.plan.supportPoints.map(p=>p[0]); assert.ok(Math.min(...xs)<0 && Math.max(...xs)>L,'A-frame feet outside the clear span'); }
    if(id==='ls_arch'&&mode==='top') assert.equal((r.surf.posts||[]).length,0,'the legs are shell, not posts');
    if(id==='ls_gird') assert.equal(r.surf.posts.length,0,'folded support surfaces must not add posts');
  }
}
console.log('PASS: 12 page 243–244 mode cases; floor clearance, A-frame foot positions and shell legs without posts');
run("Object.assign(S,{L:24,W:24,H:6,mat:'concrete',env:null,tm:{ls_frame:'a'}}); var ar=evaluate(SYS.find(s=>s.id==='ls_frame'));");
const ar=JSON.parse(run('JSON.stringify(ar)')), yc=ar.pieces.ys[0], mid=ar.surf.faces3.flatMap(f=>f.pts).filter(p=>Math.abs(p[0]-12)<1e-6);
assert.ok(mid.some(p=>Math.abs(p[1]-yc)<1e-6) && mid.some(p=>Math.abs(Math.abs(p[1]-yc)-ar.pieces.radius)<1e-6),'crown folds meet on the mid-span plane, rim to centre');
console.log('PASS: A-frame legs meet at the crown in a lens');
// Every system has an Engel page (or null: no full drawing in its chapter), and moded entries name every mode.
const ui = html.slice(html.indexOf('const PAGE = {'), html.indexOf('const pageOf'));
const PAGE = new Function(ui.replace('const PAGE =', 'return') )();
const ids = JSON.parse(run('JSON.stringify(SYS.map(s=>s.id))'));
for (const id of ids) assert.ok(id in PAGE, `${id}: no PAGE entry`);
for (const [id, v] of Object.entries(PAGE)) { assert.ok(ids.includes(id), `${id}: not a system`); if (v && typeof v === 'object') for (const m of Object.values(v)) assert.match(m, /^pp?\.\d/); else if (v) assert.match(v, /^pp?\.\d/); }
console.log(`PASS: Engel page for all ${ids.length} systems (${Object.values(PAGE).filter(v=>v===null).length} with no full drawing)`);
