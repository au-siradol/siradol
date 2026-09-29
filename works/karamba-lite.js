// karamba-lite.js — a small structural solver for the studies on this site.
// Written because Karamba3D can't be installed here; component names follow
// Karamba's where there is an equivalent (see the Karamba3D 3.1 manual).
//
// Part 1: form-finding by dynamic relaxation (kinetic damping, Barnes).
//   The hanging-net model: pin-jointed bars (stiff, nearly inextensible, like
//   Otto's chain links) and constant-force members (cables), loaded by nodal
//   weights, hung from fixed nodes. Karamba's equivalent is "Analyze Large
//   Deformation"; unlike LaDeform, this returns the member forces, because at
//   convergence they are the equilibrium forces of the found shape.

export const BAR = 0, CABLE = 1;

// model = {
//   X: Float64Array(3n) positions (updated in place),
//   fixed: Uint8Array(n) 1 = held,
//   P: Float64Array(3n) nodal loads [kN],
//   ma, mb: Int32Array(m) member end nodes,
//   kind: Uint8Array(m) BAR | CABLE,
//   L0: Float64Array(m) rest length [m] (BAR),
//   EA: Float64Array(m) axial stiffness [kN] (BAR),
//   T0: Float64Array(m) constant force [kN] (CABLE)
//   tensionOnly: true → BARs go slack instead of taking compression (chain links)
// }
export function createDR(model) {
    const n = model.fixed.length, m = model.ma.length;
    const { X, fixed, P, ma, mb, kind, L0, EA, T0 } = model;
    const tensionOnly = !!model.tensionOnly;
    const V = new Float64Array(3 * n);
    const R = new Float64Array(3 * n);
    const M = new Float64Array(n);
    const T = new Float64Array(m);     // member tension [kN], + = tension
    let KEprev = 0, iter = 0;

    function forces() {
        R.set(P);
        for (let e = 0; e < m; e++) {
            const a = ma[e] * 3, b = mb[e] * 3;
            const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
            const L = Math.hypot(dx, dy, dz) || 1e-12;
            // a CABLE pulls with its set force, fading out over its last 5 cm so a
            // link shrinking to nothing can't flip direction and push
            let t = kind[e] === CABLE ? T0[e] * Math.min(1, L / 0.05) : EA[e] * (L - L0[e]) / L0[e];
            if (tensionOnly && t < 0 && kind[e] !== CABLE) t = 0;
            T[e] = t;
            const f = t / L;
            R[a] += f * dx; R[a + 1] += f * dy; R[a + 2] += f * dz;
            R[b] -= f * dx; R[b + 1] -= f * dy; R[b + 2] -= f * dz;
        }
    }
    // fictitious masses from the member stiffnesses (elastic + geometric),
    // doubled for stability at dt = 1
    function masses() {
        M.fill(0);
        for (let e = 0; e < m; e++) {
            const a = ma[e] * 3, b = mb[e] * 3;
            const L = Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]) || 1e-12;
            const k = (kind[e] === CABLE ? 0 : EA[e] / L0[e]) + Math.abs(T[e]) / L;
            M[ma[e]] += k; M[mb[e]] += k;
        }
        for (let i = 0; i < n; i++) M[i] = Math.max(M[i], 1e-9);
    }

    function maxResidual() {
        let r = 0;
        for (let i = 0; i < n; i++) {
            if (fixed[i]) continue;
            r = Math.max(r, Math.hypot(R[3 * i], R[3 * i + 1], R[3 * i + 2]));
        }
        return r;
    }

    forces(); masses();

    return {
        T, R,
        get iter() { return iter; },
        // run k iterations; returns the largest out-of-balance force on a free node
        step(k) {
            for (let s = 0; s < k; s++, iter++) {
                if (iter % 50 === 0) masses();
                let KE = 0;
                for (let i = 0; i < n; i++) {
                    if (fixed[i]) continue;
                    const mi = M[i];
                    for (let d = 0; d < 3; d++) {
                        const j = 3 * i + d;
                        V[j] += R[j] / mi;
                        KE += mi * V[j] * V[j];
                    }
                }
                if (KE < KEprev) {
                    // kinetic-energy peak passed: move back to (about) the peak and
                    // restart from rest. X is still x(t) here, so the peak position
                    // x(t+1) - 1.5 v + 0.5 R/M becomes x(t) - 0.5 v + 0.5 R/M.
                    for (let i = 0; i < n; i++) {
                        if (fixed[i]) continue;
                        const mi = M[i];
                        for (let d = 0; d < 3; d++) {
                            const j = 3 * i + d;
                            X[j] += -0.5 * V[j] + 0.5 * (R[j] / mi);
                            V[j] = 0;
                        }
                    }
                    KEprev = 0;
                    forces();
                    continue;
                }
                KEprev = KE;
                for (let i = 0; i < n; i++) {
                    if (fixed[i]) continue;
                    X[3 * i] += V[3 * i]; X[3 * i + 1] += V[3 * i + 1]; X[3 * i + 2] += V[3 * i + 2];
                }
                forces();
            }
            return maxResidual();
        },
        // reactions at held nodes = minus the unbalanced force there
        reactions() {
            const out = [];
            for (let i = 0; i < n; i++) if (fixed[i]) out.push({ i, x: -R[3 * i], y: -R[3 * i + 1], z: -R[3 * i + 2] });
            return out;
        }
    };
}

// ---------------------------------------------------------------------------
// Part 2: 3D frame analysis (6 DOF per node).
//   Karamba equivalents: Assemble Model → Analyze (first order), geometric
//   stiffness → Buckling Modes, Analyze Nonlinear (Newton-Raphson with
//   limit-load bracketing — the method Happold & Liddell used in 1975).
//   Beams are Euler-Bernoulli (Karamba uses Timoshenko; the shear slip of
//   double laths is handled by the caller through an effective EI). Large
//   rotations by a co-rotational element frame.
// ---------------------------------------------------------------------------

// frame = {
//   X: Float64Array(3n) node positions,
//   fix: Uint8Array(6n) 1 = restrained DOF (ux uy uz rx ry rz),
//   el: [{ a, b, E, G, A, Iy, Iz, J, up:[x,y,z], truss:bool, nGeo?: pretension [kN],
//          rel?: bending hinge at end a (1), b (2) or both (3), tensionOnly?: slack in compression }]
//        local z follows `up` (for laths: the shell normal), so Iy is the
//        out-of-plane bending stiffness and Iz the in-plane one
// }

const DOF = 6;

// Reverse Cuthill-McKee node order, to keep the skyline narrow
function rcmOrder(n, el) {
    const adj = Array.from({ length: n }, () => []);
    el.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
    const deg = adj.map(a => a.length);
    const seen = new Uint8Array(n), order = [];
    const byDeg = [...Array(n).keys()].sort((p, q) => deg[p] - deg[q]);
    for (const start of byDeg) {
        if (seen[start]) continue;
        const queue = [start]; seen[start] = 1;
        for (let h = 0; h < queue.length; h++) {
            const v = queue[h]; order.push(v);
            adj[v].filter(w => !seen[w]).sort((p, q) => deg[p] - deg[q]).forEach(w => { seen[w] = 1; queue.push(w); });
        }
    }
    return order.reverse();
}

// Skyline storage + LDL^T (Bathe's COLSOL), 1-based equation numbers
class Skyline {
    constructor(neq, colTop) {
        this.neq = neq;
        this.maxa = new Int32Array(neq + 2);
        this.maxa[1] = 1;
        for (let j = 1; j <= neq; j++) this.maxa[j + 1] = this.maxa[j] + (j - colTop[j]) + 1;
        this.a = new Float64Array(this.maxa[neq + 1] + 1);
        this.negPivots = 0;
    }
    clear() { this.a.fill(0); }
    add(i, j, v) {
        if (i > j) { const t = i; i = j; j = t; }
        this.a[this.maxa[j] + (j - i)] += v;
    }
    factor() {
        const a = this.a, maxa = this.maxa, nn = this.neq;
        this.negPivots = 0; this.negEq = [];
        for (let n = 1; n <= nn; n++) {
            const kn = maxa[n], kl = kn + 1, ku = maxa[n + 1] - 1, kh = ku - kl;
            if (kh > 0) {
                let k = n - kh, ic = 0, klt = ku;
                for (let j = 1; j <= kh; j++) {
                    ic++; klt--;
                    const ki = maxa[k], nd = maxa[k + 1] - ki - 1;
                    if (nd > 0) {
                        const kk = Math.min(ic, nd);
                        let c = 0;
                        for (let l = 1; l <= kk; l++) c += a[ki + l] * a[klt + l];
                        a[klt] -= c;
                    }
                    k++;
                }
            }
            if (kh >= 0) {
                let k = n, b = 0;
                for (let kk = kl; kk <= ku; kk++) {
                    k--;
                    const c = a[kk] / a[maxa[k]];
                    b += c * a[kk];
                    a[kk] = c;
                }
                a[kn] -= b;
            }
            // Sturm count: a clearly negative pivot means the tangent has lost stability. A pivot
            // at round-off level around zero (a whisper-stiff rotation) is not counted.
            if (!(a[kn] > -1e-8)) {
                if (this.negPivots < 20) this.negEq.push(n);
                this.negPivots++;
            }
            if (!(Math.abs(a[kn]) > 1e-12)) a[kn] = 1e-12;
        }
    }
    solve(v) { // v: Float64Array(neq+1), overwritten with the solution
        const a = this.a, maxa = this.maxa, nn = this.neq;
        for (let n = 1; n <= nn; n++) {
            const kl = maxa[n] + 1, ku = maxa[n + 1] - 1;
            if (ku >= kl) {
                let k = n, c = 0;
                for (let kk = kl; kk <= ku; kk++) { k--; c += a[kk] * v[k]; }
                v[n] -= c;
            }
        }
        for (let n = 1; n <= nn; n++) v[n] /= a[maxa[n]];
        for (let n = nn; n >= 2; n--) {
            const kl = maxa[n] + 1, ku = maxa[n + 1] - 1;
            if (ku >= kl) {
                let k = n;
                for (let kk = kl; kk <= ku; kk++) { k--; v[k] -= a[kk] * v[n]; }
            }
        }
        return v;
    }
    mul(x) { // y = K x for the (unfactored) symmetric matrix
        const y = new Float64Array(this.neq + 1), a = this.a, maxa = this.maxa;
        for (let j = 1; j <= this.neq; j++) {
            y[j] += a[maxa[j]] * x[j];
            const h = maxa[j + 1] - maxa[j] - 1;
            for (let t = 1; t <= h; t++) {
                const i = j - t, v = a[maxa[j] + t];
                y[i] += v * x[j]; y[j] += v * x[i];
            }
        }
        return y;
    }
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

// rotation matrix (row-major) from a rotation vector (Rodrigues)
function rotFromVec(t) {
    const th = Math.hypot(t[0], t[1], t[2]);
    if (th < 1e-14) return I3();
    const k = [t[0] / th, t[1] / th, t[2] / th], c = Math.cos(th), s = Math.sin(th), v = 1 - c;
    return [
        c + k[0] * k[0] * v, k[0] * k[1] * v - k[2] * s, k[0] * k[2] * v + k[1] * s,
        k[1] * k[0] * v + k[2] * s, c + k[1] * k[1] * v, k[1] * k[2] * v - k[0] * s,
        k[2] * k[0] * v - k[1] * s, k[2] * k[1] * v + k[0] * s, c + k[2] * k[2] * v
    ];
}
function matMul(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
}
const matVec = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];

// local 12x12 stiffness: elastic part (Euler-Bernoulli), geometric part for axial force N
// Eigenvalues and eigenvectors (columns) of the symmetric tridiagonal matrix with diagonal a and
// off-diagonal b, by cyclic Jacobi rotations; small (the Lanczos matrix), so a dense method will do.
function symTridiagEig(a, b) {
    const m = a.length, A = Array.from({ length: m }, (_, i) => { const r = new Float64Array(m); r[i] = a[i]; if (i) r[i - 1] = b[i - 1]; if (i < m - 1) r[i + 1] = b[i]; return r; });
    const V = Array.from({ length: m }, (_, i) => { const r = new Float64Array(m); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 60; sweep++) {
        let off = 0;
        for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p][q] * A[p][q];
        if (off < 1e-30) break;
        for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
            if (Math.abs(A[p][q]) < 1e-300) continue;
            const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
            const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < m; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
            for (let k = 0; k < m; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
            for (let k = 0; k < m; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
        }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
}

function localK(e, L, elastic, N) {
    const k = Array.from({ length: 12 }, () => new Float64Array(12));
    const set = (i, j, v) => { k[i][j] += v; if (i !== j) k[j][i] += v; };
    if (elastic) {
        const EA = e.E * e.A / L;
        set(0, 0, EA); set(0, 6, -EA); set(6, 6, EA);
        if (!e.truss) {
            const GJ = e.G * e.J / L;
            set(3, 3, GJ); set(3, 9, -GJ); set(9, 9, GJ);
            const z = e.E * e.Iz, y = e.E * e.Iy, L2 = L * L, L3 = L2 * L;
            // bending in the local x-y plane (v, rz)
            set(1, 1, 12 * z / L3); set(1, 5, 6 * z / L2); set(1, 7, -12 * z / L3); set(1, 11, 6 * z / L2);
            set(5, 5, 4 * z / L); set(5, 7, -6 * z / L2); set(5, 11, 2 * z / L);
            set(7, 7, 12 * z / L3); set(7, 11, -6 * z / L2); set(11, 11, 4 * z / L);
            // bending in the local x-z plane (w, ry)
            set(2, 2, 12 * y / L3); set(2, 4, -6 * y / L2); set(2, 8, -12 * y / L3); set(2, 10, -6 * y / L2);
            set(4, 4, 4 * y / L); set(4, 8, 6 * y / L2); set(4, 10, 2 * y / L);
            set(8, 8, 12 * y / L3); set(8, 10, 6 * y / L2); set(10, 10, 4 * y / L);
        }
    }
    if (N) {
        const c = N / L;
        if (e.truss) {
            // a cable or tie only stiffens sideways in tension; in compression (as the 1975 model
            // let its ties act) it adds no negative geometric stiffness of its own
            const ct = Math.max(c, 0);
            [1, 2].forEach(d => { set(d, d, ct); set(d, d + 6, -ct); set(d + 6, d + 6, ct); });
        } else {
            set(1, 1, 1.2 * c); set(1, 5, c * L / 10); set(1, 7, -1.2 * c); set(1, 11, c * L / 10);
            set(2, 2, 1.2 * c); set(2, 4, -c * L / 10); set(2, 8, -1.2 * c); set(2, 10, -c * L / 10);
            set(4, 4, c * 2 * L * L / 15); set(4, 8, c * L / 10); set(4, 10, -c * L * L / 30);
            set(5, 5, c * 2 * L * L / 15); set(5, 7, -c * L / 10); set(5, 11, -c * L * L / 30);
            set(7, 7, 1.2 * c); set(7, 11, -c * L / 10);
            set(8, 8, 1.2 * c); set(8, 10, c * L / 10);
            set(10, 10, c * 2 * L * L / 15); set(11, 11, c * 2 * L * L / 15);
        }
    }
    // A hinged end carries no bending: condense its bending rotations out of the
    // whole matrix (elastic + geometric together, so the two stay consistent).
    const rel = e.truss ? 0 : (e.rel || 0);
    const drop = [...(rel & 1 ? [4, 5] : []), ...(rel & 2 ? [10, 11] : [])];
    drop.forEach(d => {
        const kdd = k[d][d];
        if (Math.abs(kdd) > 1e-12) {
            for (let i = 0; i < 12; i++) {
                if (i === d || !k[i][d]) continue;
                const f = k[i][d] / kdd;
                for (let j = 0; j < 12; j++) if (j !== d) k[i][j] -= f * k[d][j];
            }
        }
        for (let i = 0; i < 12; i++) { k[i][d] = 0; k[d][i] = 0; }
    });
    return k;
}

export function createFrame(frame) {
    const n = frame.X.length / 3, el = frame.el, m = el.length;
    const X0 = Float64Array.from(frame.X);

    // equation numbers in RCM node order; restrained DOFs get 0
    const order = rcmOrder(n, el);
    const eq = new Int32Array(DOF * n);
    let neq = 0;
    order.forEach(v => { for (let d = 0; d < DOF; d++) eq[DOF * v + d] = frame.fix[DOF * v + d] ? 0 : ++neq; });
    const colTop = new Int32Array(neq + 1);
    for (let j = 1; j <= neq; j++) colTop[j] = j;
    const elIds = el.map(e => {
        const ids = [];
        for (let d = 0; d < DOF; d++) ids.push(eq[DOF * e.a + d]);
        for (let d = 0; d < DOF; d++) ids.push(eq[DOF * e.b + d]);
        const nz = ids.filter(i => i > 0);
        if (nz.length) {
            const lo = Math.min(...nz);
            nz.forEach(j => { if (lo < colTop[j]) colTop[j] = lo; });
        }
        return ids;
    });
    const K = new Skyline(neq, colTop);

    // initial element frames E0 = [t1 along, t2, t3 toward `up`]
    el.forEach(e => {
        const a = 3 * e.a, b = 3 * e.b;
        const d = [X0[b] - X0[a], X0[b + 1] - X0[a + 1], X0[b + 2] - X0[a + 2]];
        e.L0 = Math.hypot(d[0], d[1], d[2]);
        const t1 = unit(d);
        let up = e.up || [0, 1, 0];
        if (Math.abs(dot(t1, up)) > 0.99) up = Math.abs(t1[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const t2 = unit(cross(up, t1)), t3 = cross(t1, t2);
        e.E0 = [t1, t2, t3];
    });

    // state: node positions and node rotation matrices
    const X = Float64Array.from(X0);
    const Rn = Array.from({ length: n }, I3);
    const Nel = new Float64Array(m);   // axial force per element, + = tension
    const Mel = new Float64Array(m);   // largest out-of-plane end moment per element
    const Mzel = new Float64Array(m);  // largest in-plane end moment (about local z) per element

    // co-rotational kinematics: current element frame E and local end rotations
    function elState(e) {
        const a = 3 * e.a, b = 3 * e.b;
        const d = [X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]];
        const l = Math.hypot(d[0], d[1], d[2]);
        const e1 = [d[0] / l, d[1] / l, d[2] / l];
        const Ta = e.E0.map(t => matVec(Rn[e.a], t)), Tb = e.E0.map(t => matVec(Rn[e.b], t));
        const q = [(Ta[1][0] + Tb[1][0]) / 2, (Ta[1][1] + Tb[1][1]) / 2, (Ta[1][2] + Tb[1][2]) / 2];
        const e3 = unit(cross(e1, q)), e2 = cross(e3, e1);
        const E = [e1, e2, e3];
        // local rotation of an end triad: skew part of E^T T
        const th = T => {
            const M = (i, j) => dot(E[i], T[j]);
            return [0.5 * (M(2, 1) - M(1, 2)), 0.5 * (M(0, 2) - M(2, 0)), 0.5 * (M(1, 0) - M(0, 1))];
        };
        return { l, E, ta: th(Ta), tb: th(Tb) };
    }

    // local end forces from the co-rotational deformation
    function localForces(e, s) {
        const L = e.L0, N = e.E * e.A * (s.l - L) / L;
        const f = new Float64Array(12);
        f[0] = -N; f[6] = N;
        if (!e.truss) {
            const Tq = e.G * e.J / L * (s.tb[0] - s.ta[0]);
            const z = e.E * e.Iz / L, y = e.E * e.Iy / L;
            const rel = e.rel || 0;
            let Mza, Mzb, Mya, Myb;
            if (rel === 0) {
                Mza = z * (4 * s.ta[2] + 2 * s.tb[2]); Mzb = z * (2 * s.ta[2] + 4 * s.tb[2]);
                Mya = y * (4 * s.ta[1] + 2 * s.tb[1]); Myb = y * (2 * s.ta[1] + 4 * s.tb[1]);
            } else if (rel === 2) { // hinge at b
                Mza = 3 * z * s.ta[2]; Mzb = 0; Mya = 3 * y * s.ta[1]; Myb = 0;
            } else if (rel === 1) { // hinge at a
                Mza = 0; Mzb = 3 * z * s.tb[2]; Mya = 0; Myb = 3 * y * s.tb[1];
            } else { Mza = Mzb = Mya = Myb = 0; }
            f[3] = -Tq; f[9] = Tq;
            f[5] = Mza; f[11] = Mzb; f[1] = (Mza + Mzb) / s.l; f[7] = -f[1];
            f[4] = Mya; f[10] = Myb; f[2] = -(Mya + Myb) / s.l; f[8] = -f[2];
        }
        return { f, N };
    }

    // Assemble into skyline S: elastic and/or geometric stiffness (geometric
    // from the current axial forces, or from Nfix), and the internal forces.
    function assemble(S, { elastic = true, geometric = false, Nfix = null, fint = null, pre = true } = {}) {
        S.clear();
        if (fint) fint.fill(0);
        el.forEach((e, ei) => {
            const s = elState(e), ids = elIds[ei], E = s.E;
            const { f, N } = localForces(e, s);
            // a cable or tie pushed into compression goes slack: no force, no stiffness (nonlinear only)
            // (tension-only cables and ties are not switched off here: a slack cable would leave its
            // edge nodes loose and read as a false instability; see the truss geometric term instead)
            Nel[ei] = N;
            Mel[ei] = Math.max(Math.abs(f[4]), Math.abs(f[10]));
            Mzel[ei] = Math.max(Math.abs(f[5]), Math.abs(f[11]));
            // nGeo: a tension the member already carries (a pretensioned cable), which gives it
            // lateral stiffness N/L even in a first-order analysis (linearised about that state)
            // (first-order only: the nonlinear solve lets the cable tension build up from its own stretch,
            // so its tangent and internal forces stay consistent)
            const Ng = (geometric ? (Nfix ? Nfix[ei] : N) : 0) + (elastic && pre ? (e.nGeo || 0) : 0);
            const k = localK(e, e.L0, elastic, Ng);
            // global = E^T-blocks: k_g = T^T k T with T = blockdiag(rows e1,e2,e3)
            const kT = Array.from({ length: 12 }, () => new Float64Array(12));
            for (let i = 0; i < 12; i++) for (let blk = 0; blk < 4; blk++) for (let c = 0; c < 3; c++) {
                let v = 0;
                for (let r = 0; r < 3; r++) v += k[i][3 * blk + r] * E[r][c];
                kT[i][3 * blk + c] = v;
            }
            for (let I = 0; I < 12; I++) {
                const gi = ids[I]; if (!gi) continue;
                const bI = I / 3 | 0, cI = I % 3;
                for (let J = I; J < 12; J++) {
                    const gj = ids[J]; if (!gj) continue;
                    let v = 0;
                    for (let r = 0; r < 3; r++) v += E[r][cI] * kT[3 * bI + r][J];
                    S.add(gi, gj, v);
                }
            }
            if (fint) for (let blk = 0; blk < 4; blk++) for (let c = 0; c < 3; c++) {
                const g = ids[3 * blk + c];
                if (g) fint[g] += E[0][c] * f[3 * blk] + E[1][c] * f[3 * blk + 1] + E[2][c] * f[3 * blk + 2];
            }
        });
        // a whisper of rotational stiffness everywhere (0.01 kNm/rad: nothing next to a lath, enough that round-off cannot turn the pivot of an otherwise free rotation negative), so a node held only by
        // trusses (or a released joint) doesn't make the matrix singular
        if (elastic) for (let v = 0; v < n; v++) for (let d = 3; d < 6; d++) { const g = eq[DOF * v + d]; if (g) S.add(g, g, 1e-2); }
    }

    // internal force vector only (for a line search), without assembling stiffness
    function residualInto(fint) {
        fint.fill(0);
        el.forEach((e, ei) => {
            const st = elState(e), ids = elIds[ei], E = st.E;
            const { f, N } = localForces(e, st);

            for (let blk = 0; blk < 4; blk++) for (let c = 0; c < 3; c++) {
                const g = ids[3 * blk + c];
                if (g) fint[g] += E[0][c] * f[3 * blk] + E[1][c] * f[3 * blk + 1] + E[2][c] * f[3 * blk + 2];
            }
        });
    }

    function loadVector(P) { // P: Float64Array(6n) → 1-based by equation
        const r = new Float64Array(neq + 1);
        for (let i = 0; i < DOF * n; i++) if (eq[i]) r[eq[i]] += P[i];
        return r;
    }

    function applyIncrement(du) {
        for (let v = 0; v < n; v++) {
            const g = d => eq[DOF * v + d];
            for (let d = 0; d < 3; d++) if (g(d)) X[3 * v + d] += du[g(d)];
            const rv = [g(3) ? du[g(3)] : 0, g(4) ? du[g(4)] : 0, g(5) ? du[g(5)] : 0];
            if (rv[0] || rv[1] || rv[2]) Rn[v] = matMul(rotFromVec(rv), Rn[v]);
        }
    }

    function reset() {
        X.set(X0);
        for (let i = 0; i < n; i++) Rn[i] = I3();
    }

    const vnorm = v => { let s = 0; for (let i = 1; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); };

    return {
        neq, X, X0, N: Nel, M: Mel, Mz: Mzel,
        get negPivots() { return K.negPivots; },
        // where the tangent lost its positive pivots: [{ node, dof }] (dof 0-2 move, 3-5 turn)
        get negDofs() {
            const out = [];
            (K.negEq || []).forEach(q => { const i = eq.indexOf(q); if (i >= 0) out.push({ node: Math.floor(i / DOF), dof: i % DOF }); });
            return out;
        },
        reset,

        // First-order analysis (Karamba "Analyze"): one linear solve.
        linear(P) {
            reset();
            assemble(K, { elastic: true });
            K.factor();
            const stable = K.negPivots === 0;
            const u = K.solve(loadVector(P));
            applyIncrement(u);
            assemble(K, { elastic: true }); // element forces at the displaced state
            return { stable };
        },

        // First order for several load cases on one factorisation: each(k, { stable }) is called
        // with the element forces and displacements of case k in place.
        linearMany(Ps, each) {
            reset();
            assemble(K, { elastic: true });
            K.factor();
            const stable = K.negPivots === 0, factored = Float64Array.from(K.a);
            Ps.forEach((P, k) => {
                if (k) { reset(); K.a.set(factored); }
                applyIncrement(K.solve(loadVector(P)));
                assemble(K, { elastic: true }); // element forces at the displaced state (overwrites K)
                each(k, { stable });
            });
        },

        // linearMany, awaiting each(k) between cases so a page can show progress
        async linearManyAsync(Ps, each) {
            reset();
            assemble(K, { elastic: true });
            K.factor();
            const stable = K.negPivots === 0, factored = Float64Array.from(K.a);
            for (let k = 0; k < Ps.length; k++) {
                if (k) { reset(); K.a.set(factored); }
                applyIncrement(K.solve(loadVector(Ps[k])));
                assemble(K, { elastic: true });
                await each(k, { stable });
            }
        },

        // Linear buckling (Karamba "Buckling Modes"): smallest lambda with
        // (K + lambda K_G(N)) x = 0, N from the first-order solution under P.
        // Happold & Liddell rejected this as the collapse load for Mannheim:
        // it overestimates unless the load is funicular.
        buckling(P, iters = 80) {
            this.linear(P);
            const Nlin = Float64Array.from(Nel);
            reset();
            const KG = new Skyline(neq, colTop);
            assemble(KG, { elastic: false, geometric: true, Nfix: Nlin });
            assemble(K, { elastic: true });
            K.factor();
            if (K.negPivots) return { lambda: 0, mode: null };
            // Lanczos on A = K^-1 (-K_G), self-adjoint in the K inner product: its largest positive
            // eigenvalue mu gives lambda = 1/mu. Tension-dominated modes give negative mu and are
            // skipped. Plain power iteration converged far too slowly on a large shell (80 steps
            // read lambda 0.95 where 1500 gave 0.21).
            const dotv = (u, v) => { let t = 0; for (let i = 1; i <= neq; i++) t += u[i] * v[i]; return t; };
            const Q = [], KQ = [], alpha = [], beta = [];
            let Kr = new Float64Array(neq + 1);
            for (let i = 1; i <= neq; i++) Kr[i] = 0.5 + 0.5 * Math.sin(i * 12.9898);
            let r = K.solve(Float64Array.from(Kr));               // r = K^-1 b, so K r = b
            let bnorm = Math.sqrt(Math.max(dotv(r, Kr), 0));
            let mu = 0, s = null, last = Infinity;
            const maxSteps = Math.min(Math.max(iters, 40), 200, neq);
            for (let j = 0; j < maxSteps && bnorm > 1e-14; j++) {
                const q = r.map(v => v / bnorm), Kq = Kr.map(v => v / bnorm);
                Q.push(q); KQ.push(Kq); if (j) beta.push(bnorm);
                Kr = KG.mul(q); for (let i = 1; i <= neq; i++) Kr[i] = -Kr[i];   // K w = -K_G q
                r = K.solve(Float64Array.from(Kr));
                alpha.push(dotv(q, Kr));
                // full reorthogonalisation against every Lanczos vector, in the K inner product
                for (let pass = 0; pass < 2; pass++) for (let k = 0; k < Q.length; k++) {
                    const c = dotv(r, KQ[k]);
                    for (let i = 1; i <= neq; i++) { r[i] -= c * Q[k][i]; Kr[i] -= c * KQ[k][i]; }
                }
                bnorm = Math.sqrt(Math.max(dotv(r, Kr), 0));
                if ((j + 1) % 10 === 0 || j + 1 === maxSteps || bnorm <= 1e-14) {
                    const eig = symTridiagEig(alpha, beta);
                    let top = -1;
                    eig.values.forEach((v, k) => { if (v > 0 && (top < 0 || v > eig.values[top])) top = k; });
                    if (top < 0) { mu = 0; s = null; } else { mu = eig.values[top]; s = eig.vectors.map(row => row[top]); }
                    if (Math.abs(mu - last) <= 1e-7 * Math.abs(mu)) break;
                    last = mu;
                }
            }
            const x = new Float64Array(neq + 1);
            if (s) Q.forEach((q, k) => { for (let i = 1; i <= neq; i++) x[i] += s[k] * q[i]; });
            // mode shape as node displacements (translations only)
            const mode = new Float64Array(3 * n);
            for (let v = 0; v < n; v++) for (let d = 0; d < 3; d++) { const g = eq[DOF * v + d]; if (g) mode[3 * v + d] = x[g]; }
            reset();
            return { lambda: mu > 0 ? 1 / mu : Infinity, mode, steps: Q.length };
        },

        // Geometrically nonlinear Newton-Raphson at load factor lam, from the
        // current state.
        async solveAt(P, lam, maxIt = 40, tol = 1e-4, accept = tol) {
            const Pe = loadVector(P);
            // Normalize by the applied load at this increment, including small increments.
            const Pn = (vnorm(Pe) * Math.max(Math.abs(lam), 1e-12)) || 1;
            const fint = new Float64Array(neq + 1);
            // The co-rotational tangent is approximate (it leaves out the end-moment terms), so
            // Newton-Raphson can pass the answer and drift off. Keep the best stable iterate and
            // accept it only within the requested residual tolerance.
            let best = { rn: Infinity, snap: null }, rising = 0;
            const hist = [];
            for (let it = 0; it < maxIt; it++) {
                await new Promise(resolve => setTimeout(resolve, 0));
                assemble(K, { elastic: true, geometric: true, fint, pre: false });
                const r = new Float64Array(neq + 1);
                for (let i = 1; i <= neq; i++) r[i] = lam * Pe[i] - fint[i];
                const rn = vnorm(r);
                hist.push(+(rn / Pn).toExponential(2));
                K.factor();
                if (K.negPivots > 0) { this.lastHist = hist; return { ok: false, it, res: rn / Pn, stable: false, equilibrated: rn < tol * Pn }; }
                if (rn < tol * Pn) { this.lastHist = hist; return { ok: true, it, res: rn / Pn, stable: true }; }
                if (rn < best.rn) { best = { rn, snap: { X: Float64Array.from(X), R: Rn.map(q => q.slice()) } }; rising = 0; }
                else if (best.rn < 10 * accept * Pn && rn > 2 * best.rn && ++rising >= 3) break;   // was close, now drifting away
                const du = K.solve(r);
                let dmax = 0;
                for (let i = 1; i <= neq; i++) dmax = Math.max(dmax, Math.abs(du[i]));
                if (!isFinite(dmax) || dmax > 25) break;
                // line search: if the full step makes the residual worse, try a half and a quarter
                const pre = { X: Float64Array.from(X), R: Rn.map(q => q.slice()) };
                let alpha = 1;
                for (let ls = 0; ls < 3; ls++) {
                    if (ls) { X.set(pre.X); pre.R.forEach((q, i) => { Rn[i] = q.slice(); }); }
                    const step = alpha === 1 ? du : du.map(v => v * alpha);
                    applyIncrement(step);
                    if (ls === 2) break;
                    residualInto(fint);
                    let rn2 = 0;
                    for (let i = 1; i <= neq; i++) { const q = lam * Pe[i] - fint[i]; rn2 += q * q; }
                    if (Math.sqrt(rn2) < rn) break;
                    alpha /= 2;
                }
            }
            this.lastHist = hist;
            if (best.snap && best.rn < accept * Pn) {
                X.set(best.snap.X); best.snap.R.forEach((q, i) => { Rn[i] = q.slice(); });
                return { ok: true, it: maxIt, res: best.rn / Pn, stable: true, loose: true };
            }
            return { ok: false, it: maxIt, res: best.rn / Pn, stable: true };
        },

        // Every accepted increment must satisfy the same force-residual tolerance.
        stepTo(P, lam, iters = 40) { return this.solveAt(P, lam, iters); },

        snapshot() { return { X: Float64Array.from(X), R: Rn.map(r => r.slice()) }; },
        restore(s) {
            X.set(s.X); s.R.forEach((r, i) => { Rn[i] = r.slice(); });
            // Result colours and utilisation must belong to the restored geometry.
            el.forEach((e, i) => {
                const { f, N } = localForces(e, elState(e));
                Nel[i] = N; Mel[i] = Math.max(Math.abs(f[4]), Math.abs(f[10]));
                Mzel[i] = Math.max(Math.abs(f[5]), Math.abs(f[11]));
            });
        }
    };
}

// Verified equilibrium continuation. A failed Newton iterate is NOT a collapse
// bound: even a negative tangent at an unbalanced trial can be a numerical failure.
export async function collapseSearch(model, P, { lamMax = 30, step0 = 0.1, minStep = 0.003125, onStep } = {}) {
    model.reset();
    let lower = 0, upper = Infinity, step = step0, lastFail = null, attempted = null;
    let good = model.snapshot();
    while (lower < lamMax - 1e-9) {
        const trial = Math.min(lower + step, lamMax);
        model.restore(good);
        const r = await model.solveAt(P, trial);
        if (r.ok && r.stable && Number.isFinite(r.res) && r.res <= 1e-4) {
            lower = trial; good = model.snapshot();
            // Keep the smaller step after a failed trial; do not jump over it.
            if (onStep) await onStep(lower, upper);
        } else {
            lastFail = r; attempted = trial;
            if (r.equilibrated && !r.stable) upper = Math.min(upper, trial);
            model.restore(good);
            step /= 2;
            if (onStep) await onStep(lower, upper);
            if (step < minStep) break;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    model.restore(good);
    const reached = lower >= lamMax - 1e-9;
    return { lower, upper, reached, attempted, lastFail,
        reason: reached ? null : Number.isFinite(upper) ? 'unstable' : 'no convergence' };
}

export async function collapseIncremental(model, P, { lamMax = 3, dl = 0.1, refine = 5, onStep } = {}) {
    return collapseSearch(model, P, { lamMax, step0: dl, minStep: dl / 2 ** refine, onStep });
}
