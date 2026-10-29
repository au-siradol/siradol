// Exhaustive pre-optimization implementation: oracle for visible-line parity.
    function referenceFoldEdges(proj) {
        if (!proj.some(o=>o.c==='foldedge')) return [];
        const meshEdges = new Map(), silhouettes = [];
        for(const f of proj) if(f.t==='face' && f.c==='shellx' && f.e) {
            const P=f.P, area=P.reduce((a,p,i)=>a+p[0]*P[(i+1)%P.length][1]-p[1]*P[(i+1)%P.length][0],0);
            for(let i=0;i<P.length;i++){ const A=P[i],B=P[(i+1)%P.length], ka=A.map(x=>x.toFixed(7)).join(','),kb=B.map(x=>x.toFixed(7)).join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;
                if(!meshEdges.has(key))meshEdges.set(key,{P:[A,B],areas:[]});meshEdges.get(key).areas.push(area); }
        }
        for(const e of meshEdges.values()) if(e.areas.some(a=>a>1e-9)&&e.areas.some(a=>a< -1e-9)) silhouettes.push({c:'foldedge',t:'line',P:e.P});
        const triangles = [], output = [], cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const near = p => proj[0]?.Q ? -1 / p[2] : p[2];
        for (const f of proj) if(f.t==='face') for(let i=1;i+1<f.P.length;i++) {
            const T=[f.P[0],f.P[i],f.P[i+1]], area=cross(...T);
            if(Math.abs(area)<1e-10)continue;
            triangles.push({T,area,box:[Math.min(...T.map(p=>p[0])),Math.min(...T.map(p=>p[1])),Math.max(...T.map(p=>p[0])),Math.max(...T.map(p=>p[1]))]});
        }
        for(const o of [...proj,...silhouettes]) if(o.c==='foldedge') for(let i=1;i<o.P.length;i++) {
            const A=o.P[i-1],B=o.P[i], mix=t=>A.map((v,k)=>v+(B[k]-v)*t), intervals=[];
            for(const {T,area,box} of triangles) {
                if(Math.max(A[0],B[0])<box[0]||Math.min(A[0],B[0])>box[2]||Math.max(A[1],B[1])<box[1]||Math.min(A[1],B[1])>box[3])continue;
                let lo=0,hi=1;
                for(let k=0;k<3;k++) { const u=cross(T[k],T[(k+1)%3],A)/area, v=cross(T[k],T[(k+1)%3],B)/area, d=v-u;
                    if(Math.abs(d)<1e-12) {if(u< -1e-9){hi=-1;break;}} else if(d>0)lo=Math.max(lo,-u/d);else hi=Math.min(hi,-u/d); }
                if(hi<=lo)continue;
                const gap=t=>{const P=mix(t),u=cross(T[1],T[2],P)/area,v=cross(T[2],T[0],P)/area;
                    return u*near(T[0])+v*near(T[1])+(1-u-v)*near(T[2])-(near(A)+(near(B)-near(A))*t)-1e-6;};
                const g0=gap(lo),g1=gap(hi);if(g0<=0&&g1<=0)continue;
                if(g0<=0)lo=lo+(hi-lo)*(-g0)/(g1-g0);else if(g1<=0)hi=lo+(hi-lo)*(-g0)/(g1-g0);
                intervals.push([lo,hi]);
            }
            intervals.sort((a,b)=>a[0]-b[0]);let t=0;
            for(const [lo,hi]of intervals){if(lo>t+1e-7)output.push([mix(t),mix(lo)]);t=Math.max(t,hi);}
            if(t<1-1e-7)output.push([mix(t),B]);
        }
        return output;
    }
