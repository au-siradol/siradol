// Run: node tests/space-first.test.cjs (no dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../works/space-first.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach(s => new vm.Script(s));
const ctx = vm.createContext({ console });
const run = s => vm.runInContext(s, ctx);
const json = s => JSON.parse(run(`JSON.stringify(${s})`));
run(scripts[0]);
run(`const result = id => evaluate(SYS.find(s => s.id === id));`);
for (const [id, expected] of [['t_int', 2], ['u_int', 5], ['i_int', 8], ['k_bi', 7], ['p_can2', 7]]) {
  assert.equal(run(`result('${id}').interior`), expected, id);
  assert.equal(run(`result('${id}').columnFree`), false, id);
}
assert.equal(run("result('portal').columnFree"), true);
assert.equal(run("result('t_bound').columnFree"), true);
// Boundary columns do not become interior columns on short plans.
run('S.L = 3; S.W = 3;');
assert.equal(run("result('t_bound').interior"), 0);
run('S.L = 24; S.W = 48;');
for (const [span, expected] of [[10,'typ'],[40,'typ'],[50,'pos'],[50.01,'out'],[60,'out'],[69.99,'out'],[70,'pos'],[89,'pos'],[90,'typ'],[220,'typ'],[300,'pos'],[301,'out']]) {
  assert.equal(run(`status(SYS.find(s=>s.id==='pneu'), ${span}, 'membrane')`), expected, `air span ${span}`);
}
assert.deepEqual(json("rangesOf(SP.airHall.membrane)"), [[10,50],[70,300]]);
run("S.mat='concrete'");
assert.equal(run("eligible(result('cb_h'))"), false, 'RC must not borrow prestressed range');
assert.equal(run("eligible(result('portal'))"), true);
run("S.mat='prestressed'");
assert.equal(run("eligible(result('cb_h'))"), true);
assert.equal(run("eligible(result('portal'))"), false);
assert.match(run("materialLabel(result('cb_h').sys,'concrete')"), /prestressed/);
run("S.mat='membrane'");
assert.equal(run("eligible(result('t_int'))"), false);
assert.equal(run("eligible(result('t_bound'))"), true);
// All builders must remain finite with the new material selectors and at input extremes.
for (const [L,W,H] of [[3,3,2.5],[24,48,6],[200,200,30]]) {
  for (const mat of ['steel','timber','concrete','prestressed','cable','membrane','masonry']) {
    run(`Object.assign(S, ${JSON.stringify({L,W,H,mat})});`);
    const failures = json(`SYS.flatMap(sys => { try { const r=evaluate(sys); return [r.zone,r.top,r.footW,r.eff,r.load.q,r.interior].every(Number.isFinite) ? [] : [sys.id]; } catch(e) { return [sys.id+': '+e.message]; } })`);
    assert.deepEqual(failures, [], `${L} × ${W}, ${mat}`);
  }
}
// Run the actual ranking and suggestion functions with rendering stubbed out.
const ui = scripts[1];
const between = (start,end) => ui.slice(ui.indexOf(start),ui.indexOf(end,ui.indexOf(start)));
run(between('    const AXO =', '    const SORTROW ='));
run('const CEIL = new Map(), CEILM = ["calm","busy"]; let resKey="test"; const resAll=()=>RES; const setFold=()=>{}; const render=()=>{};');
run('const RANKST={typ:0,pos:1,out:2};');
run(between('    const MEASURE =', '    // timber:'));
run(between('    const sortByMetric =', '    function rankingExplanation'));
run(between('    function suggest()', '    function drawModal()'));
run("Object.assign(S,{L:24,W:48,H:6,mat:'membrane'}); RES=SYS.map(evaluate); suggest();");
assert.ok(run('slots.length > 0'));
assert.equal(run('slots.every(id=>eligible(result(id)))'), true);
assert.equal(run("slots.some(id=>['t_int','u_int','i_int'].includes(id))"), false);
run("Object.assign(S,{mat:'prestressed'}); RES=SYS.map(evaluate); suggest();");
assert.equal(run('slots.length'), 3, 'do not fill up with other materials');
run("S.L=100; S.W=100; RES=SYS.map(evaluate); const retained=slots.join(); suggest();");
assert.equal(run('slots.join()===retained'), true);
assert.match(run('suggestionNotice'), /No modeled option/);
// Exact expected weighted rank, including average ties and excluded alternatives.
run(`Object.assign(S,{L:24,W:48,mat:'steel'});
const base=result('portal');
const mock=(id,name,zone,q,free=true)=>({...base,sys:{...base.sys,id,name},zone,load:{...base.load,q},columnFree:free});
RES=[mock('a','Alpha',10,1),mock('b','Beta',10,2),mock('c','Charlie',30,3),mock('x','Excluded',0,0,false)];
metric='zone';crit2='q';crit3='';resKey='score';`);
assert.deepEqual(json('critW()'), [0.625,0.37499999999999994]);
const scores = json('RES.map(r=>MIX.show(r))');
assert.ok(Math.abs(scores[0]-84.375)<1e-8);
assert.ok(Math.abs(scores[1]-65.625)<1e-8);
assert.equal(scores[2],0);
assert.equal(scores[3],null);
run("metric='span';crit2='';RES=[mock('b','Beta',1,1),mock('a','Alpha',100,1)];");
assert.deepEqual(json('sortByMetric(RES).map(r=>r.sys.id)'), ['a','b'], 'no hidden depth tie-break');
console.log('PASS: support screening, disjoint spans, material products, 2,877 builder cases, suggestions and weighted ranks');
// Geometry consistency: shared folds, radial vault thickness and cuts of real faces.
run("Object.assign(S,{L:24,W:48,H:6,mat:'concrete',tm:{}})");
assert.equal(run("result('folded').plan.b"),3);
assert.equal(run("result('folded').plan.n"),16);
assert.equal(run("result('folded').cols"),18);
for(const mat of ['concrete','timber']) for(const W of [24,48,51]) {
 run(`Object.assign(S,{mat:'${mat}',W:${W}})`);
 assert.ok(run("Math.abs(result('folded').plan.b*result('folded').plan.n-S.W)<1e-9"));
 assert.equal(run("result('folded').cols===result('folded').plan.n+2"),true);
}
run("Object.assign(S,{L:24,W:48,H:6,mat:'masonry'})");
assert.ok(run("result('vault').V.outer.every((p,i)=>Math.abs(Math.hypot(p[0]-12,p[1]-6)-12-result('vault').t)<1e-8)"));
run("S.tm={vault:'adjacent'}");
assert.ok(run("result('vault').footW>3*S.L"));
assert.match(run("planSVG(result('vault'))"), /A<\/text>/);
run("S.tm={}");
for(const id of ['vault','garch','arch3','folded','fb_barrel','fp_tri','fl_arch']) for(const axis of ['A','B']) {
 const segments=json(`sectionSegments(result('${id}'),'${axis}')`);
 assert.ok(segments.length>0, `${id} ${axis} cut exists`);
 assert.ok(segments.flat(2).every(Number.isFinite));
 assert.doesNotMatch(run(`cutSVG(result('${id}'),'${axis}')`), /NaN|Infinity|undefined/);
}
// A faceted dome cut must contain sloping straight segments from its faces.
assert.ok(run("sectionSegments(result('fp_tri'),'A').some(([a,b])=>Math.abs(a[0]-b[0])>0.1 && Math.abs(a[1]-b[1])>0.1)"));
console.log('PASS: shared fold geometry, radial vault thickness, adjacent footprint, A–A/B–B cuts');
// Support components must meet the actual bearing nodes, not only appear in notes.
run("Object.assign(S,{L:24,W:48,H:6,mat:'concrete',tm:{}})");
assert.equal(run("result('fl_beam').surf.faces3.filter(f=>f.c==='solid').length"),run("result('fl_beam').cols"));
assert.equal(run("result('fl_beam').surf.posts.every(p=>result('fl_beam').surf.faces3.some(f=>f.c==='solid' && f.pts.some(q=>q.every((v,i)=>Math.abs(v-p[i])<1e-9))))"),true);
assert.equal(run("result('fi_3').surf.lines3.some(l=>l.c==='tie' && l.pts.length===7 && l.pts[0].every((v,i)=>v===l.pts[6][i]))"),true);
for(const id of ['tarch','folded']) {
 assert.equal(run(`scene3D(result('${id}')).filter(o=>o.c==='tie' && o.pts.some(p=>p[2]===0) && o.pts.some(p=>p[2]===S.H)).length`),8);
 assert.match(run(`supportScheme(result('${id}'))[2]`), /Proposed/);
}
for(const mat of ['concrete','timber']) {
 run(`S.mat='${mat}'`);
 assert.equal(run("result('folded').plan.c"),run("colW(S.mat,S.H)"));
}
console.log('PASS: V-beam diaphragm bearings, closed perimeter tie, proposed side bracing, shared column dimensions');
