const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../works/space-first.html'),'utf8');
const c=vm.createContext({console}),run=s=>vm.runInContext(s,c),json=s=>JSON.parse(run(`JSON.stringify(${s})`));
run(html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1]);
run("Object.assign(S,{L:24,W:48,H:6,mat:'auto',env:null});const result=id=>evaluate(SYS.find(s=>s.id===id));");
// Shell-unit centre rather than a repeated-unit seam, and the actual support-row X.
run("var r=result('ls_arch');");
assert.ok(run("r.pieces.ys.some(y=>Math.abs(y-cutPlane(r,'A'))<1e-7)"));
assert.ok(run("r.plan.supportPoints.some(p=>Math.abs(p[0]-cutPlane(r,'B'))<1e-7)"));
for(const axis of ['A','B']) {
  const cut=json(`sectionSegments(r,'${axis}')`);assert.ok(cut.length>10,'detailed shell cut');
  assert.equal(new Set(cut.map(p=>JSON.stringify(p))).size,cut.length,'duplicate edges removed');
  assert.equal(run(`sectionBeyond(r,'${axis}').projected.every(o=>o.pts.every(p=>sectionLocation(r,'${axis}').dir*(p[${axis==='A'?1:0}]-cutPlane(r,'${axis}'))>=-1e-6))`),true,'near half removed');
  const svg=run(`cutSVG(r,'${axis}')`);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.match(svg,/section-beyond/);assert.match(svg,/section-cut/);
}
assert.match(run('planSVG(r)'),/section-marks/);
assert.equal(run("cutPlane(result('ptruss'),'A')"),24,'truss cut intersects a frame');
// A cut is not a projected elevation: members wholly beyond the cut are thin context only.
run(`var synthetic={sys:{id:'test'},plan:{},_sc:[
 {t:'line',c:'member',pts:[[0,30,0],[0,30,10]]},
 {t:'line',c:'member',pts:[[1,10,0],[1,10,10]]},
 {t:'line',c:'member',pts:[[2,24,0],[2,24,10]]}
]};`);
assert.deepEqual(json("sectionSegments(synthetic,'A')"),[[[2,0],[2,10]]]);
assert.deepEqual(json("sectionBeyond(synthetic,'A').projected.map(o=>o.pts[0][0])"),[0,2]);
// The thin layer remains hidden-line, with opaque faces and no tessellation strokes.
run(`var blocked={sys:{id:'test'},plan:{},_sc:[
 {t:'face',c:'solid',pts:[[0,25,0],[10,25,0],[10,25,10],[0,25,10]],e:[true,true,true,true]},
 {t:'line',c:'foldedge',pts:[[2,30,5],[8,30,5]]},
 {t:'line',c:'foldedge',pts:[[2,24.5,6],[8,24.5,6]]}
]};`);
assert.equal(run("visibleFoldEdges(sectionBeyond(blocked,'A').projected).length"),1,'hidden rear edge omitted');
assert.match(run("sectionBeyond(blocked,'A').body"),/stroke="none"/,'mesh fills must not acquire strokes');
// All nine references retain their true panel count and their modeled support positions
// through the worker payload. No invented posts and no eligibility change.
const expected={hpr_2:[2,2],hpr_3:[3,3],hpr_tri:[3,3],hpr_hex:[6,6],hpr_5a:[5,4],hpr_5b:[5,6],hpr_8:[8,4],hpr_16:[16,4],hpr_12:[12,5]};
for(const [id,[panels,supports]]of Object.entries(expected)) {
 run(`r=result('${id}')`);
 assert.equal(run('r.referenceStudy.quads.length'),panels,id);assert.equal(run('r.referenceStudy.supports.length'),supports,id);
 assert.equal(run('r.surf.posts.length'),0);assert.equal(run('eligible(r)'),false);
 assert.deepEqual(json('screeningSummary(r).referenceStudy'),json('r.referenceStudy'));
 const svg=run('referencePlanSVG(r.referenceStudy)');assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.equal((svg.match(/class="support-point"/g)||[]).length,supports);
}
const ui=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
assert.doesNotMatch(ui,/HYPAR_GROUPS|hyparOpen|data-hypar-group/,'reference cards must not be hidden in collapsed groups');
console.log('PASS: cut locations, clipped context, occlusion, no artificial seams, all nine reference plans shown without collapsing');
