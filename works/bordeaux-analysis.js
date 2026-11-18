/*
 * Educational elastic grillage, kN and metres. Assumed effective sections, not as-built.
 * Three DOFs/node: vertical displacement, dw/dx, dw/dz.
 * Timoshenko bending includes shear flexibility; Saint-Venant torsion couples the grid.
 * Unilateral bearing springs and a pretensioned, tension-only vertical tie use an active-set solve.
 * Global actions are recovered from K u = f. No opening-scale or RC failure analysis.
 */
window.BordeauxAnalysis = (() => {
    const xs = [5.0544, 8.3, 11.5657, 15.3, 19.3, 23, 26.395, 29.5903];
    const zs = [-24.5872, -20.075, -14.0673];
    const nodes = xs.flatMap(x => zs.map(z => ({ x, z })));
    const elements = [];
    const concrete = { E: 30e6, G: 12.5e6, I: 0.33 * 3.2 ** 3 / 12, A: 0.33 * 3.2, J: 3.2 * 0.33 ** 3 / 3, depth: 3.2 };
    const diaphragm = { E: 30e6, G: 12.5e6, I: 3 * 0.2 ** 3 / 12, A: 3 * 0.2, J: 3 * 0.2 ** 3 / 3, depth: 0.2 };
    const steel = { E: 200e6, G: 77e6, I: 0.018, A: 0.08, J: 0.0001, depth: 1.2 };
    // The walls and the two 0.20 m slabs close the box into a tube. A grillage has no
    // in-plane slab shear, so give its members the cellular-deck torsion constant
    // (Hambly, Bridge Deck Behaviour): c = 2 h'^2 t1 t2 / (t1 + t2) per metre width,
    // carried by both the longitudinal and the transverse members. h' = 3.0 m between
    // slab mid-planes. Both directions together give 2c ≈ 3.6 m^4/m, close to Bredt
    // for the whole box (4 A0^2 / Σ s/t ≈ 32 m^4 over 10.5 m).
    const BOX_C = 2 * 3.0 ** 2 * 0.2 * 0.2 / (0.2 + 0.2);
    const BOX_G = 12.5e6;
    function addElement(a, b, section, axis, wall = false, boxWidth = 0) {
        const length = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
        const phi = 12 * section.E * section.I / ((5 / 6) * section.G * section.A * length ** 2);
        const c = section.E * section.I / (length ** 3 * (1 + phi));
        const L = length;
        const stiffness = [
            [12, 6*L, -12, 6*L],
            [6*L, (4+phi)*L*L, -6*L, (2-phi)*L*L],
            [-12, -6*L, 12, -6*L],
            [6*L, (2-phi)*L*L, -6*L, (4+phi)*L*L]
        ].map(row => row.map(v => v*c));
        const slope = axis === 'x' ? 1 : 2;
        const GJ = section.G * section.J + BOX_G * BOX_C * boxWidth;
        elements.push({ a, b, length, section, axis, wall, stiffness, GJ,
            dofs: [a*3, a*3+slope, b*3, b*3+slope], twist: [a*3+3-slope, b*3+3-slope] });
    }
    // tributary width of each longitudinal line, and tributary length of each transverse station
    const zWidth = zs.map((z, j) => ((zs[j+1] ?? z) - (zs[j-1] ?? z)) / 2);
    const xLength = xs.map((x, i) => ((xs[i+1] ?? x) - (xs[i-1] ?? x)) / 2);
    for (let i = 0; i < xs.length - 1; i++) {
        for (let j = 0; j < zs.length; j++) addElement(i*3+j, (i+1)*3+j, j === 1 ? diaphragm : concrete, 'x', j !== 1, zWidth[j]);
    }
    for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < 2; j++) addElement(i*3+j, i*3+j+1, i === 2 ? steel : (i === 0 ? concrete : diaphragm), 'z', i === 0, xLength[i]);
    }
    function extraNode(x, z) { nodes.push({x,z}); return nodes.length - 1; }
    const tie = extraNode(xs[2], -28.08);
    addElement(tie, 6, steel, 'z');
    const north = extraNode(xs[6], -23.0622);
    const south = extraNode(xs[6], -11.3501);
    // L-shaped brace: steel, not a concrete wall section
    addElement(18, north, steel, 'z');
    addElement(north, 19, steel, 'z');
    addElement(20, south, steel, 'z');
    const cylinder = extraNode(11.3059, zs[1]);
    addElement(cylinder, 7, steel, 'x');
    const supports = [
        { name: 'cylinder', node: cylinder, k: 1e6 },
        { name: 'north', node: north, k: 1e6 },
        { name: 'south', node: south, k: 1e6 },
        { name: 'tie', node: tie, k: 200e6 * 0.0028 / 10.44, cable: true }
    ];
    const size = nodes.length * 3;
    const base = Array.from({length:size}, () => new Float64Array(size));
    for (const e of elements) {
        e.dofs.forEach((a,i) => e.dofs.forEach((b,j) => base[a][b] += e.stiffness[i][j]));
        const [a,b] = e.twist, k = e.GJ / e.length;
        base[a][a] += k; base[b][b] += k; base[a][b] -= k; base[b][a] -= k;
    }
    function factor(matrix) {
        const L = matrix.map(row => Float64Array.from(row));
        for (let i=0;i<size;i++) {
            for (let j=0;j<=i;j++) {
                let v = L[i][j];
                for (let k=0;k<j;k++) v -= L[i][k]*L[j][k];
                if (i===j && v < 1e-7) return null;
                L[i][j] = i===j ? Math.sqrt(v) : v/L[j][j];
            }
        }
        return L;
    }
    const factors = new Map();
    function displacement(active, forces) {
        const key = active.join(',');
        if (!factors.has(key)) {
            const K = base.map(row => Float64Array.from(row));
            supports.forEach((s,i) => { if (active[i]) K[s.node*3][s.node*3] += s.k; });
            factors.set(key, factor(K));
        }
        const L = factors.get(key);
        if (!L) return null;
        const u = Float64Array.from(forces);
        for (let i=0;i<size;i++) {
            for (let j=0;j<i;j++) u[i] -= L[i][j]*u[j];
            u[i] /= L[i][i];
        }
        for (let i=size-1;i>=0;i--) {
            for (let j=i+1;j<size;j++) u[i] -= L[j][i]*u[j];
            u[i] /= L[i][i];
        }
        return u;
    }
    function bracket(array, value) {
        const i = Math.max(0, Math.min(array.length-2, array.findIndex(v => v >= value)-1));
        const index = value >= array[array.length-1] ? array.length-2 : i;
        return [index, (value-array[index])/(array[index+1]-array[index])];
    }
    function distribute(vector, x,z, force) {
        const [i,tx] = bracket(xs,x), [j,tz] = bracket(zs,z);
        for (let a=0;a<2;a++) for(let b=0;b<2;b++) {
            vector[((i+a)*3+j+b)*3] += force*(a?tx:1-tx)*(b?tz:1-tz);
        }
    }
    const dead = new Float64Array(size);
    // Two long walls + west wall + assumed hidden 0.20 m floor and roof diaphragms.
    const area = (xs.at(-1)-xs[0])*(zs.at(-1)-zs[0]);
    for (let i=0;i<xs.length-1;i++) {
        const dx=xs[i+1]-xs[i], x=(xs[i]+xs[i+1])/2;
        for (const z of [zs[0],zs.at(-1)]) distribute(dead,x,z,-25*0.33*3.2*dx);
        distribute(dead,x,(zs[0]+zs.at(-1))/2,-25*0.4*dx*(zs.at(-1)-zs[0]));
    }
    distribute(dead,xs[0],(zs[0]+zs.at(-1))/2,-25*0.376*3.2*(zs.at(-1)-zs[0]));
    const deadWeight = -dead.reduce((sum,v) => sum+v,0);
    // Pretensioned tie. The design value is the tie force on a Normal day (self-weight
    // only); the lock-off force jacked in is larger, because the beam end and the box
    // deflect down as the cable is stressed. Tension T = lockOff + k·u (u up), so the
    // tie goes slack only if the beam end drops by lockOff / k.
    const PRETENSION = 500;
    const tieSupport = supports[3];
    const allActive = [true,true,true,true];
    const unitPull = new Float64Array(size); unitPull[tie*3] = -1;
    const u0 = displacement(allActive, dead), u1 = displacement(allActive, unitPull);
    const lockOff = (PRETENSION - tieSupport.k*u0[tie*3]) / (1 + tieSupport.k*u1[tie*3]);
    let referenceStress = 0;
    function solve(loads = [], cut = false) {
        const forces = Float64Array.from(dead);
        loads.forEach(p => distribute(forces,p.x,p.z,-p.force));
        let active = [true,true,true,!cut], u, reactions;
        const seen = new Set();
        for (let iteration=0;iteration<16;iteration++) {
            const key=active.join(',');
            if (seen.has(key)) return {stable:false, reason:'Support contact did not converge'};
            seen.add(key);
            const applied=Float64Array.from(forces);
            if (active[3]) applied[tie*3] -= lockOff;      // the stressed tie pulls the beam end down
            u=displacement(active,applied);
            if (!u) return {stable:false, reason:'No stable supported equilibrium'};
            reactions=supports.map((s,i) => active[i] ? -s.k*u[s.node*3] - (s.cable ? lockOff : 0) : 0);
            const next=supports.map((s,i) => {
                if(s.cable && cut) return false;
                const v=u[s.node*3];
                if (s.cable) { const T = lockOff + s.k*v; return T>1e-6 || (active[i] && T>=-1e-6); }
                return v< -1e-10 || (active[i] && v<=1e-10);
            });
            if(next.every((v,i)=>v===active[i])) break;
            active=next;
        }
        let vertical=0, mx=0, mz=0;
        nodes.forEach((n,i)=>{const f=forces[i*3];vertical+=f;mx+=f*n.x;mz+=f*n.z;});
        supports.forEach((s,i)=>{const n=nodes[s.node],r=reactions[i];vertical+=r;mx+=r*n.x;mz+=r*n.z;});
        const total=deadWeight+loads.reduce((a,p)=>a+p.force,0);
        const residual=Math.max(Math.abs(vertical)/total,Math.abs(mx)/(total*30),Math.abs(mz)/(total*30));
        const actions=elements.map(e=>e.stiffness.map(row=>row.reduce((v,k,j)=>v+k*u[e.dofs[j]],0)));
        let scale=1e-9;
        elements.forEach((e,i)=>{if(e.wall) scale=Math.max(scale,...[actions[i][1],actions[i][3]].map(m=>Math.abs(m)*1.6/e.section.I));});
        if (!referenceStress) referenceStress = scale;
        scale = referenceStress;
        function sample(x,y,z) {
            const axis=x<5.1?'z':'x';
            const candidates=elements.map((e,i)=>({e,i})).filter(({e})=>e.wall&&e.axis===axis);
            const chosen=candidates.reduce((best,v)=>{
                const a=nodes[v.e.a],b=nodes[v.e.b];
                const t=Math.max(0,Math.min(1,axis==='x'?(x-a.x)/(b.x-a.x):(z-a.z)/(b.z-a.z)));
                const dist=(x-a.x-t*(b.x-a.x))**2+(z-a.z-t*(b.z-a.z))**2;
                return dist<best.dist?{...v,dist,t}:best;
            },{dist:Infinity});
            const e=chosen.e,f=actions[chosen.i], t=chosen.t;
            const moment=-f[1]*(1-t)+f[3]*t;
            const normal=-moment*(y-4.05)/e.section.I;
            const shear=f[0]*1.5/e.section.A*Math.max(0,1-((y-4.05)/1.6)**2);
            const radius=Math.hypot(normal/2,shear);
            const s1=(normal/2+radius)/scale,s3=(normal/2-radius)/scale;
            return {s1,s3,theta:0.5*Math.atan2(2*shear,normal),gov:Math.abs(s3)>Math.abs(s1)?s3:s1};
        }
        function deflection(x,z) {
            const [i,tx]=bracket(xs,x),[j,tz]=bracket(zs,z);
            let value=0;
            for(let a=0;a<2;a++)for(let b=0;b<2;b++)value+=u[((i+a)*3+j+b)*3]*(a?tx:1-tx)*(b?tz:1-tz);
            return value;
        }
        // The I-beam's cantilever beyond the north wall (node 6 -> tie node) is its own
        // element, not part of the box grid: draw it with that element's cubic shape.
        function beamDeflection(z) {
            const za=nodes[tie].z, zb=nodes[6].z, L=zb-za;
            const wa=u[tie*3], ta=u[tie*3+2], wb=u[6*3], tb=u[6*3+2];
            if (z < za) return wa + ta*(z-za);            // the few cm of beam past the tie
            const t=Math.min(1,(z-za)/L);
            return (1-3*t*t+2*t**3)*wa + L*(t-2*t*t+t**3)*ta + (3*t*t-2*t**3)*wb + L*(t**3-t*t)*tb;
        }
        // settlement of each bearing spring (-R/k), for drawing the structure as if it sat
        // on rigid supports. A bearing that has lifted off carries no force and reports 0,
        // so a real lift-off still shows.
        const bearings=supports.map((s,i)=>({s,i})).filter(({s})=>!s.cable)
            .map(({s,i})=>({x:nodes[s.node].x,z:nodes[s.node].z,w:-reactions[i]/s.k}));
        return {stable:residual<1e-7,residual,reactions:Object.fromEntries(supports.map((s,i)=>[s.name,reactions[i]])),u,actions,sample,deflection,beamDeflection,bearings,total};
    }
    return {solve,deadWeight,area,nodes,elements,supports,pretension:PRETENSION,lockOff,
        beamTipZ:nodes[tie].z, northWallZ:zs[0]};
})();
