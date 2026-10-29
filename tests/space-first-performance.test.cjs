// node tests/space-first-performance.test.cjs — no external dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Worker: NodeWorker } = require('node:worker_threads');
const html = fs.readFileSync(path.join(__dirname, '../works/space-first.html'), 'utf8');
const engine = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ui = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const ctx = vm.createContext({ console, performance });
const run = code => vm.runInContext(code, ctx);
run(engine);
run(fs.readFileSync(path.join(__dirname, 'fixtures/fold-edges-reference.js'), 'utf8'));
const plain = x => JSON.parse(JSON.stringify(x));

// Orthographic, reverse/top views and perspective: identical visible pieces,
// without relying on SVG screenshots or weakening the occlusion checks.
for (const [id, mode, view] of [
  ['ls_frame','two','axo'], ['ls_gird','central','reverse'],
  ['ls_frame','a','top'], ['ls_frame','two','eye'], ['ls_arch','top','axo']
]) {
  run(`Object.assign(S,{L:24,W:48,H:6,mat:'auto',lite:true,tm:{'${id}':'${mode}'}});
       var r=evaluate(SYS.find(s=>s.id==='${id}'));
       var p=${view === 'eye' ? "eyeScene(scene3D(r),{...eyeAt(r,scene3D(r)),yaw:0,pitch:0.3,ay:0.7})" : `projectScene(scene3D(r),projector(${view === 'reverse' ? '210,28' : view === 'top' ? '0,90' : '30,28'}))`};`);
  let t = performance.now(); const expected = run('JSON.stringify(referenceFoldEdges(p))'), before = performance.now()-t;
  t = performance.now(); const actual = run('JSON.stringify(visibleFoldEdges(p))'), after = performance.now()-t;
  assert.equal(actual, expected, `${id}/${mode}/${view}: visible-line parity`);
  console.log(`PASS: ${id}/${mode}/${view}: ${before.toFixed(0)} → ${after.toFixed(0)} ms, identical lines`);
}
for (const p of [[], [{t:'line',c:'foldedge',P:[[0,0,0],[1,1,0]]}], [
  {t:'face',c:'shellx',P:[[0,0,1],[1,0,1],[0,1,1]]},
  {t:'line',c:'foldedge',P:[[-1,0.2,0],[2,0.2,0]]},
  {t:'line',c:'foldedge',P:[[-1,0.2,2],[2,0.2,2]]},
  {t:'line',c:'foldedge',P:[[-1,0.2,1],[2,0.2,1]]}
]]) {
  ctx.sample=p;
  assert.equal(run('JSON.stringify(visibleFoldEdges(sample))'),run('JSON.stringify(referenceFoldEdges(sample))'));
}

// Browser Worker adapter backed by real worker_threads. Test the production
// scheduler and worker source, not a duplicate implementation of their protocol.
const urls = new Map(), workers = []; let serial = 0;
class BlobSource { constructor(parts) { this.code = parts.join(''); } }
class BrowserWorker {
  constructor(url) {
    this.worker = new NodeWorker(`const {parentPort}=require('node:worker_threads');
      const vm=require('node:vm');const self={};
      const c=vm.createContext({self,postMessage:m=>parentPort.postMessage(m),console});
      vm.runInContext(${JSON.stringify(urls.get(url))},c);
      parentPort.on('message',data=>self.onmessage({data}));`, {eval:true});
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',error=>this.onerror?.(error)); workers.push(this);
  }
  postMessage(m) { this.job=m.job; this.worker.postMessage(m); }
  terminate() { this.terminated=true; return this.worker.terminate(); }
}
const c = vm.createContext({console, performance, setTimeout, clearTimeout, Blob:BlobSource, Worker:BrowserWorker,
  URL:{createObjectURL:b=>{const u='blob:'+serial++;urls.set(u,b.code);return u;},revokeObjectURL:u=>urls.delete(u)},
  document:{getElementById:()=>({textContent:engine})}});
const evalUI = code => vm.runInContext(code,c);
evalUI(engine);
evalUI(`let suggestionNotice='',afterCeil=null,drawJob=0,renders=0;
  const DRAW=new Map(),asked=new Set(),CEIL=new Map(),askedC=new Set();
  const render=()=>{renders++}; const originalEvaluate=evaluate; let evaluations=0;
  evaluate=sys=>{evaluations++;return originalEvaluate(sys)};`);
const start=ui.indexOf('    // Screening runs separately'),end=ui.indexOf('    const matOk =',start);
assert.ok(start>=0&&end>start);
evalUI(ui.slice(start,end));
// Reuse the real requirement predicates with all switches on to exercise the
// plan, thrust, material and support metadata sent by the worker.
const a=ui.indexOf('    const codeIs ='),b=ui.indexOf('    const engelOrder =',a);
run(ui.slice(a,b)); evalUI(ui.slice(a,b));
const allReq={noCols:true,ground:true,noThrust:true,daylight:true,rigging:true,extend:true,low:true};
async function ready() {
  const deadline=Date.now()+30000;
  while(evalUI('screenPending')) { assert.ok(Date.now()<deadline,'screening timeout');await new Promise(r=>setTimeout(r,10)); }
  assert.equal(evalUI('screenError'),'');
}
async function compare(state) {
  const input={lite:true,mat:'auto',L:24,W:48,H:6,tm:{},env:null,req:allReq,...state};
  evalUI(`Object.assign(S,${JSON.stringify(input)}); compute();`);
  assert.equal(evalUI('evaluations'),0,'screening must not build models on the UI thread');
  await ready();
  run(`Object.assign(S,${JSON.stringify(input)});var expected=SYS.map(evaluate);`);
  assert.deepEqual(plain(evalUI('resAll().map(r=>[r.sys.id,projFails(r),eligible(r),thrustLevel(r),r.zone,r.top,r.eff,r.load.q,r.cols,r.Hraise,r.warp])')),
    plain(run('expected.map(r=>[r.sys.id,projFails(r),eligible(r),thrustLevel(r),r.zone,r.top,r.eff,r.load.q,r.cols,r.Hraise,r.warp])')));
  assert.equal(evalUI('evaluations'),0);
  assert.equal(evalUI('resAll().length'),run('SYS.length'));
}
(async()=>{
  try {
    await compare({});
    await compare({L:20,W:36,H:9,env:{kind:'theatre'}});
    await compare({L:36,W:48,H:9,lite:false,mat:'timber',tm:{ls_arch:'two'}});
    const old=workers.at(-1),oldJob=old.job;
    evalUI('S.L=28;compute();'); const cancelled=workers.at(-1);
    evalUI('S.L=32;compute();');
    assert.equal(cancelled.terminated,true,'superseded screening worker stopped');
    old.onmessage({data:{job:oldJob,results:[]}});
    assert.equal(evalUI('screenPending'),true,'ignore old result');
    assert.equal(evalUI('resAll().length'),0,'do not display stale results');
    await ready();
    const count=evalUI('renders');evalUI('compute();');assert.equal(evalUI('renders'),count,'same space reuses summaries');
    assert.equal(evalUI('evaluations'),0);
    evalUI("modelById('truss');modelById('truss')");assert.equal(evalUI('evaluations'),1,'selected geometry built once');
    // Unavailable and failed workers both yield and recover with the same metrics.
    c.Worker=class {constructor(){throw Error('Workers unavailable')}};
    evalUI('evaluations=0;S.L=24;S.W=48;S.env=null;compute();');
    assert.equal(evalUI('evaluations'),0,'fallback yields before starting');
    await ready();assert.equal(evalUI('evaluations'),run('SYS.length'));
    c.Worker=class {postMessage(){setTimeout(()=>this.onerror(Error('worker startup')),0)}terminate(){}};
    evalUI('S.L=25;compute();'); await ready();
    assert.equal(urls.size,0,'worker Blob URLs revoked');
    console.log('PASS: all 164 screening results match, no UI-thread builds, stale jobs cancelled, lazy geometry, both fallbacks');
  } finally { for(const w of workers) await w.terminate(); }
})().catch(e=>{console.error(e);process.exitCode=1});
