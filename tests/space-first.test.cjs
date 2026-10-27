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
for (const [id, expected] of [['t_int', 2], ['u_int', 5], ['k_bi', 7], ['p_can2', 7]]) {
  assert.equal(run(`result('${id}').interior`), expected, id);
  assert.equal(run(`result('${id}').columnFree`), false, id);
}
// i_int: flying masts on cables (Engel 1.2.3.2, p.95) — nothing stands in the space
assert.equal(run("result('i_int').columnFree"), true, 'i_int: flying masts, no interior supports');
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
assert.equal(run("slots.some(id=>['t_int','u_int'].includes(id))"), false);
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
// Lite reading: a material shows its span ranges but does not exclude; thrust in words names what takes it.
run("Object.assign(S,{L:24,W:48,H:6,mat:'prestressed',tm:{},env:null,lite:false})");
assert.equal(run("eligible(result('portal'))"), false, 'Full: a portal frame is not a prestressed system');
run("S.lite=true");
assert.equal(run("eligible(result('portal'))"), true, 'Lite: material does not exclude');
run("S.lite=false; S.mat='steel'");
assert.equal(run("thrustLevel(result('tarch')).by"), 'a tie');
assert.equal(run("thrustLevel(result('garch')).by"), 'the ground', 'a note naming the ground before an optional tie');
assert.equal(run("thrustLevel(result('beam'))"), null);
assert.ok(['small','medium','large'].includes(run("thrustLevel(result('vault')).word")));
console.log('PASS: Lite eligibility and thrust in words');
// Envelopes: the seating bowl and the raked auditorium; every system clears them, a sloping roof follows the rake.
for (const [kind, L, W, H] of [['arena', 60, 72, 9], ['theatre', 24, 30, 8], ['arena', 40, 50, 7], ['theatre', 30, 40, 10], ['lecture', 15, 18, 3.5], ['arena', 120, 140, 12]]) {
  run(`Object.assign(S,{L:${L},W:${W},H:${H},mat:'steel',tm:{},env:{kind:'${kind}'}})`);
  const bad = json(`SYS.flatMap(sys => { try { const r=evaluate(sys); return [r.H,r.top,r.eff,r.footW,r.warp].every(Number.isFinite) && r.H >= S.H - 1e-9 && r.warp >= 0 && scene3D(r).every(o=>o.pts.every(p=>p.every(Number.isFinite))) ? [] : [sys.id]; } catch(e) { return [sys.id+': '+e.message]; } })`);
  assert.deepEqual(bad, [], `${kind} ${L}×${W}×${H}`);
  assert.ok(run("envGeom().rows") > 3, `${kind} has rows`);
  // a flat-bottomed truss must clear the highest need along its whole length (front eave + rise at the back)
  assert.ok(run("(r => r.H + r.warp * S.W >= envGeom().needMax - 0.02)(result('truss'))"), `${kind}: truss clears the envelope`);
}
// a big bowl comes in tiers of at most 30 rows, each upper one over the one below and higher; a long auditorium gets cross-aisles
run("Object.assign(S,{L:120,W:140,H:12,env:{kind:'arena'}}); ENVC={key:'',g:null}");
assert.ok(run("envGeom().sight.tiers.every(t=>t.R.length<=30)"), 'no block over 30 rows');
assert.ok(run("envGeom().rows") === 30 && run("envGeom().Ztop") < 25, 'a big bowl stops at one 30-row block');
run("Object.assign(S,{L:60,W:72,H:9,env:{kind:'arena'}}); ENVC={key:'',g:null}");
assert.equal(run("envGeom().sight.tiers.length"), 1, 'a bowl that fits in one block has one tier');
run("Object.assign(S,{L:30,W:50,H:10,env:{kind:'theatre'}}); ENVC={key:'',g:null}");
assert.ok(run("envGeom().sight.aisles") >= 1, 'a theatre past 30 rows has a cross-aisle');
run("Object.assign(S,{L:15,W:18,H:3.5,env:{kind:'lecture'}}); ENVC={key:'',g:null}");
assert.ok(run("envGeom().need(7.5, 17.5) - envGeom().floor(7.5, 17.5)") >= 2.3 - 1e-9, 'lecture: 2.30 m over the back rows');
assert.equal(run("envGeom().stageHouse"), undefined, 'lecture: no stage house');
run("Object.assign(S,{L:24,W:30,H:8,env:{kind:'theatre'}})");
assert.ok(run("result('portal').warp") > 0, 'a portal frame roof follows the rake');
assert.equal(run("result('dome').warp"), 0, 'a dome does not slope');
assert.ok(run("Math.abs(result('portal').H - S.H) < 1e-6"), 'sloping roof keeps the front height asked for');
run("Object.assign(S,{L:24,W:48,H:6,env:null})");
assert.equal(run("result('truss').H"), 6, 'no envelope: unchanged');
console.log('PASS: seating bowl (one 30-row block), raked auditorium (with cross-aisles) and lecture theatre envelopes, eave heights, sloping roofs');
// Automatic material: each system in the material Engel's chart suits best at the span; it never excludes.
run("Object.assign(S,{L:24,W:48,H:6,mat:'auto',tm:{},env:null,lite:false})");
assert.equal(run("materialMatches(SYS.find(s=>s.id==='portal'))"), true);
assert.deepEqual(json("SYS.filter(sys => { const r=result(sys.id), sp=r.spanUsed||S.L, best=Math.min(...sys.mats.map(m=>({typ:0,pos:1,out:2})[status(sys,sp,m)])); return ({typ:0,pos:1,out:2})[r.st] !== best; }).map(s=>s.id)"), [], 'auto picks the best span status for the span each system uses');
for (const L of [12, 60, 100]) { run(`S.L=${L}; S.W=${2*L>200?L:2*L}`); assert.equal(run("SYS.every(sys => sys.mats.includes(matOf(sys)))"), true, `auto stays among a system's materials at ${L} m`); }
run("Object.assign(S,{L:24,W:48,mat:'steel'})");
console.log('PASS: automatic material per system');
