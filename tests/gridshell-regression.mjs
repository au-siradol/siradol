import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
// Data URL keeps this static site's browser ES module independent of package.json.
const solver = await readFile(new URL('../works/karamba-lite.js', import.meta.url), 'utf8');
const {createFrame, collapseIncremental} = await import('data:text/javascript;base64,' + Buffer.from(solver).toString('base64'));
// Axial cantilever: u = PL/EA, no geometric approximation in the expected answer.
const X = new Float64Array([0,0,0,2,0,0]);
const frame = createFrame({X,fix:new Uint8Array([1,1,1,1,1,1,0,1,1,1,1,1]),el:[{a:0,b:1,E:2e8,G:8e7,A:.01,Iy:1e-5,Iz:1e-5,J:1e-5,up:[0,1,0]}]});
const P = new Float64Array(12); P[6] = 100;
const r = await frame.solveAt(P,1);
assert.ok(r.ok && r.res <= 1e-4);
assert.ok(Math.abs(frame.X[3]-2-100*2/(2e8*.01)) < 1e-9);
const continuation = await collapseIncremental(frame,P,{lamMax:.4,dl:.1});
assert.ok(continuation.reached && continuation.lower === .4);
assert.ok(Math.abs(frame.X[3]-2-.4*100*2/(2e8*.01)) < 1e-9);
// Eight-element fixed-free column: Pcr = pi² EI / (4 L²).
{
 const n=8,L=2,E=2e8,I=1e-5,X=new Float64Array((n+1)*3),fix=new Uint8Array((n+1)*6),el=[];
 fix.fill(1,0,6);
 for(let i=0;i<=n;i++){X[3*i]=L*i/n;if(i)el.push({a:i-1,b:i,E,G:8e7,A:.01,Iy:I,Iz:I,J:I,up:[0,1,0]})}
 const column=createFrame({X,fix,el}),load=new Float64Array((n+1)*6);
 load[6*n]=-(Math.PI**2)*E*I/(4*L*L);
 const limit=await collapseIncremental(column,load,{lamMax:1.2,dl:.1,refine:5});
 assert.equal(limit.reason,'unstable');assert.ok(limit.lastFail.equilibrated);
 assert.ok(limit.lower>.99&&limit.lower<=1.01&&limit.upper>1&&limit.upper<1.01);
}
// Numerical failure (including negative tangent at an unbalanced trial) is not collapse.
for (const stable of [true,false]) {
 let position=0;
 const mock={reset(){position=0},snapshot(){return position},restore(s){position=s},async solveAt(_,load){position=load;return load<=.2?{ok:true,stable:true,res:1e-6}:{ok:false,stable,res:.1,equilibrated:false}}};
 const r=await collapseIncremental(mock,P,{lamMax:1,dl:.1,refine:3});
 assert.ok(r.lower<=.2+1e-9);assert.equal(r.upper,Infinity);assert.equal(r.reason,'no convergence');assert.equal(position,r.lower);
}
// Tidy preserves valid footprints, support transitions and arch endpoints.
const html = await readFile(new URL('../works/gridshell-formfinding.html', import.meta.url),'utf8');
const source=html.slice(html.indexOf('        function validOutline('),html.indexOf('        function runSketchPipeline('));
const ctx=vm.createContext({COLUMN_SPACING:6});vm.runInContext(source + ";globalThis.outlineArea = outlineArea;",ctx);
const point=(x,z,t='beam',h=3,r=0)=>({x,z,t,h,r});
const shapes=[
 [point(0,0),point(30,0),point(30,20),point(0,20)],
 [point(0,0),point(30,0),point(30,4),point(4,4),point(4,30),point(0,30)],
 [point(0,0,'arch',3,4),point(30,0),point(30,20,'wall'),point(0,20,'wall')]
];
for(const shape of shapes){const before=JSON.stringify(shape);const result=ctx.tidyOutline(shape);assert.ok(ctx.validOutline(result));assert.equal(JSON.stringify(shape),before);const ratio=ctx.outlineArea(result)/ctx.outlineArea(shape);assert.ok(ratio>=.8&&ratio<=1.2)}
const arch=ctx.tidyOutline(shapes[2]);assert.ok(arch.some(p=>p.x===0&&p.z===0&&p.t==='arch'&&p.r===4));assert.ok(arch.some(p=>p.x===30&&p.z===0&&p.t==='beam'));
const crossed=[point(0,0),point(20,20),point(0,20),point(20,0)];assert.equal(ctx.validOutline(crossed),false);assert.equal(ctx.tidyOutline(crossed),crossed);
const duplicate=[point(0,0),point(10,0),point(10,0),point(0,10)];assert.equal(ctx.validOutline(duplicate),false);
console.log('PASS: axial and Euler-column benchmarks, residual-gated continuation, failure classification/rollback, outline topology and support preservation');
