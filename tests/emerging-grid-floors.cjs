const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../works/emerging-grid-catenoid.html'), 'utf8');
const zones = html.slice(html.indexOf('        function floorZones'), html.indexOf('        const rasterCache'));
const build = html.slice(html.indexOf('        function buildFloor'), html.indexOf("        let floorsKey"));
const at = html.slice(html.indexOf('        const zoneOfCell'), html.indexOf('        // the slab edge follows'));
const ctx=vm.createContext({assert,console});
vm.runInContext(`
const FNX=2,FNZ=2,FR=1,W=2,D=2,MIN_ZONE=1,SLAB=.4;
let VOIDS=[];
const lerp=(a,b,t)=>a+(b-a)*t,clamp01=x=>Math.max(0,Math.min(1,x));
`+zones+at+build+`
const r={lab:Int32Array.from([0,0,0,0]),sizes:[4],dist:Float32Array.from([1,1,1,1])};
r.zones=floorZones(r,Int16Array.from([2,-1,-1,2]));
assert.notEqual(r.zones[0],r.zones[3], 'disconnected patches are separate openings');
assert.equal(r.zones[1],-2,'programme boundary band is retained');
const f={id:1,y:2};
VOIDS=[{fid:1,x:.5,z:.5}];
let opened=buildFloor(f,r);
VOIDS=[];
let restored=buildFloor(f,r);
function topArea(mesh){
 let area=0;
 for(let i=0;i<mesh.tris.length;i+=9){
  const t=mesh.tris.slice(i,i+9);
  if(t[1]===2 && t[4]===2 && t[7]===2)area+=Math.abs((t[3]-t[0])*(t[8]-t[2])-(t[6]-t[0])*(t[5]-t[2]))/2;
 }
 return area;
}
assert(topArea(opened)<topArea(restored),'opening removes slab area');
VOIDS=[{fid:2,x:.5,z:.5}];
assert.equal(topArea(buildFloor(f,r)),topArea(restored),'other floors are unaffected');
// Test the ambiguous marching-square cell with opposite solid corners.
// The central 1x1 cell must have two separate 1/8-area triangles.
r.zones=Int32Array.from([0,-1,-1,1]);
const mesh=buildFloor(f,r);
let centreArea=0;
for(let i=0;i<mesh.tris.length;i+=9){
 const t=mesh.tris.slice(i,i+9);
 if(t[1]!==2||t[4]!==2||t[7]!==2)continue;
 if([t[0],t[3],t[6],t[2],t[5],t[8]].every(x=>x>=.5&&x<=1.5))
 centreArea+=Math.abs((t[3]-t[0])*(t[8]-t[2])-(t[6]-t[0])*(t[5]-t[2]))/2;
}
assert.equal(centreArea,.25,'no artificial diagonal bridge across an opening');
assert(topArea(buildFloor(f,r,0))<topArea(mesh),'preview contains only the targeted zone');
console.log('PASS: connected zones, open/restore, floor isolation, preview and diagonal boundaries.');
`,ctx);
