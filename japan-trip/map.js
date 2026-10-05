/* Illustrated day map — pure functions, shared by the page and the Node test.
 * Style: flat paper map with lettered circle pins (cf. the Avignon illustration), dotted forests,
 * blue rivers, double-line routes and a small legend/scale (cf. the state-forest brochure map).
 * The base layer is hand-drawn and approximate — it is an illustration, not a navigation map.
 * Every pin links to Google Maps through the option's `q`. Colours come from CSS variables. */
(function (root) {
  const RAD = Math.PI / 180, KM_LAT = 111.2;
  const W = 640, H = 440, PAD = 56, MIN_KM = 12, PIN_R = 12, NEAR = 0.0025;
  const E = typeof require === 'function' ? require('./engine.js') : root.Engine;
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  /* ---------- base layer ([lat, lng]) ---------- */
  // Sea = everything south/east of this coastline (Suruga Bay → Izu → Sagami Bay → Tokyo Bay → Boso).
  const COAST = [[34.68,137.70],[34.60,138.22],[34.87,138.32],[35.01,138.50],[35.10,138.68],[35.05,138.78],[34.85,138.75],[34.62,138.85],
    [34.68,138.95],[34.85,139.03],[34.97,139.10],[35.10,139.08],[35.25,139.15],[35.30,139.31],[35.31,139.40],[35.30,139.48],[35.31,139.55],
    [35.17,139.62],[35.14,139.62],[35.25,139.72],[35.38,139.63],[35.44,139.64],[35.52,139.72],[35.55,139.78],[35.62,139.78],[35.67,139.95],
    [35.60,140.10],[35.50,140.10],[35.38,139.93],[35.31,139.83],[35.15,139.82],[34.98,139.85],[34.90,139.89],[35.10,140.15],[35.30,140.35],
    [35.55,140.45],[35.73,140.85]];
  const SEA_CLOSE = [[35.73,142.5],[32.0,142.5],[32.0,136.0],[34.68,136.0]];
  const LAKES = [
    { c: [35.516,138.760], rx: 5.0, ry: 1.3, rot: 12, ph: 0.4 },   // Kawaguchi
    { c: [35.500,138.690], rx: 2.0, ry: 0.8, rot: 0,  ph: 1.2 },   // Sai
    { c: [35.462,138.590], rx: 2.2, ry: 1.3, rot: 0,  ph: 2.1 },   // Motosu
    { c: [35.412,138.862], rx: 2.6, ry: 1.1, rot: 10, ph: 0.9 },   // Yamanaka
    { c: [36.050,138.080], rx: 3.6, ry: 2.3, rot: 35, ph: 0.2 }    // Suwa
  ];
  const RIVERS = [
    [[35.80,139.00],[35.78,139.20],[35.72,139.35],[35.66,139.50],[35.58,139.65],[35.54,139.77]],           // Tama
    [[35.50,138.95],[35.45,139.15],[35.38,139.30],[35.32,139.37]],                                          // Sagami
    [[35.75,138.45],[35.55,138.45],[35.30,138.62],[35.13,138.62]],                                          // Fuji
    [[36.65,139.05],[36.40,139.07],[36.30,139.40],[36.15,139.65],[35.95,139.85],[35.85,140.10],[35.75,140.85]], // Tone
    [[36.00,138.95],[36.10,139.20],[35.90,139.50],[35.70,139.80]],                                          // Ara
    [[36.25,137.62],[36.22,137.75],[36.30,137.86],[36.45,137.88],[36.55,137.95],[36.62,138.17],[36.80,138.30]], // Azusa–Sai
    [[36.15,138.55],[36.30,138.45],[36.40,138.28],[36.60,138.18]],                                          // Chikuma
    [[36.03,138.12],[35.85,138.00],[35.60,137.90],[35.40,137.85]]                                           // Tenryu
  ];
  const FORESTS = [
    [[36.80,137.62],[36.80,137.80],[36.55,137.85],[36.35,137.80],[36.15,137.75],[35.95,137.65],[35.90,137.45],[36.15,137.45],[36.40,137.50],[36.60,137.55]],
    [[36.50,138.38],[36.50,138.65],[36.30,138.70],[36.10,138.55],[35.95,138.40],[36.05,138.25],[36.25,138.30]],
    [[36.00,138.80],[36.05,139.05],[35.85,139.15],[35.75,139.00],[35.70,138.85],[35.75,138.70],[35.90,138.65]],
    [[35.55,138.55],[35.55,138.66],[35.45,138.70],[35.35,138.75],[35.30,138.62],[35.40,138.55]],
    [[35.50,138.95],[35.50,139.15],[35.35,139.22],[35.20,139.08],[35.25,138.95]],
    [[35.00,138.80],[35.10,138.97],[34.80,139.05],[34.65,138.90],[34.75,138.80]],
    [[35.90,137.95],[35.90,138.15],[35.60,138.25],[35.30,138.20],[35.40,138.00],[35.65,137.90]],
    [[36.65,138.45],[36.70,138.75],[36.50,138.85],[36.45,138.60]],
    [[36.55,138.90],[36.55,139.15],[36.40,139.20],[36.35,138.95]]
  ];
  // [lat, lng, size px]
  const PEAKS = [[35.3606,138.7274,22],[36.406,138.523,14],[36.76,137.76,9],[36.60,137.74,9],[36.45,137.72,9],[36.34,137.65,10],[36.28,137.64,10],
    [36.23,137.59,9],[36.11,137.55,10],[35.89,137.48,10],[36.00,138.37,9],[35.97,138.32,8],[35.65,138.22,10],[35.55,138.20,9],[35.45,138.15,9],
    [35.95,138.90,8],[36.00,138.75,8],[35.45,139.00,8],[35.23,139.03,8],[36.55,139.18,8],[36.47,138.85,8]];
  const TREES = [[35.95,139.50],[36.05,139.30],[36.12,139.62],[35.72,139.20],[36.10,137.97],[36.02,137.93],[36.50,139.45],[35.85,139.40],
    [36.20,139.20],[36.50,139.60],[35.62,139.40],[36.35,139.30]];
  // k: sea | city | peak | lake
  const LABELS = [
    ['TOKYO BAY',[35.45,139.88],'sea'],['SAGAMI BAY',[35.08,139.40],'sea'],['SURUGA BAY',[34.85,138.55],'sea'],['PACIFIC OCEAN',[34.70,140.05],'sea'],
    ['TOKYO',[35.72,139.74],'city'],['YOKOHAMA',[35.46,139.57],'city'],['KOFU',[35.68,138.57],'city'],['MATSUMOTO',[36.28,137.98],'city'],
    ['NAGANO',[36.66,138.19],'city'],['KARUIZAWA',[36.40,138.62],'city'],['TAKASAKI',[36.33,139.02],'city'],['HAKUBA',[36.75,137.90],'city'],
    ['MT. FUJI',[35.30,138.73],'peak'],['MT. ASAMA',[36.46,138.52],'peak'],['NORTHERN ALPS',[36.50,137.60],'peak'],
    ['LAKE SUWA',[36.10,138.16],'lake'],['LAKE KAWAGUCHI',[35.56,138.82],'lake']
  ];

  /* ---------- helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = n => (Math.round(n * 10) / 10).toString();
  const near = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) < NEAR;
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /* ---------- stops: the lettered pins of a day ---------- */
  function stops(trip, day, sel) {
    const out = [];
    const push = (ll, item, hotel) => {
      const last = out[out.length - 1];
      if (last && last.lls.some(p => near(p, ll))) { last.items.push(item); last.lls.push(ll); if (hotel) last.hotel = true; return; }
      out.push({ ll, lls: [ll], hotel: !!hotel, items: [item] });
    };
    if (day.from && day.from.ll) push(day.from.ll, { slotId: null, time: null, name: day.from.n, q: day.from.n, kind: 'start' }, true);
    const slots = day.slots.slice().sort((a, b) => mins(a.time) - mins(b.time));
    slots.forEach(s => {
      E.selected(s, sel).forEach(o => {
        const ll = o.ll || s.ll;
        if (o.skip || !ll) return;
        push(ll, { slotId: s.id, time: s.time, name: o.pin || o.n, q: o.q || o.n, kind: s.kind }, s.kind === 'hotel');
      });
    });
    out.forEach((st, i) => { st.letter = LETTERS[i] || String(i + 1); });
    return out;
  }

  const DRIVE_KINDS = ['drive', 'nap'];
  function stopName(st) {
    const places = st.items.filter(i => !DRIVE_KINDS.includes(i.kind));
    const use = places.length ? places : st.items;
    return [...new Set(use.map(i => i.name.replace(/^.*→\s*/, '')))].join(' · ');
  }

  /* ---------- geometry ---------- */
  function makeView(sts) {
    const lats = sts.map(s => s.ll[0]), lngs = sts.map(s => s.ll[1]);
    const latC = (Math.min(...lats) + Math.max(...lats)) / 2, lngC = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const kmLng = 111.32 * Math.cos(latC * RAD);
    const xKm = Math.max(MIN_KM, (Math.max(...lngs) - Math.min(...lngs)) * kmLng);
    const yKm = Math.max(MIN_KM * H / W, (Math.max(...lats) - Math.min(...lats)) * KM_LAT);
    const s = Math.min((W - 2 * PAD) / xKm, (H - 2 * PAD) / yKm);
    const proj = ll => [W / 2 + (ll[1] - lngC) * kmLng * s, H / 2 - (ll[0] - latC) * KM_LAT * s];
    return { proj, s, kmLng, latC, lngC };
  }
  // Catmull-Rom → cubic Bézier through `p` (array of [x,y]); returns the "C …" segments after the first point.
  function curve(p, closed) {
    const n = p.length, g = i => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
    let d = '';
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
    }
    return d;
  }
  const smoothPath = (p, closed) => `M${f1(p[0][0])},${f1(p[0][1])}${curve(p, closed)}${closed ? 'Z' : ''}`;
  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if ((poly[i][0] > pt[0]) !== (poly[j][0] > pt[0]) && pt[1] < (poly[j][1] - poly[i][1]) * (pt[0] - poly[i][0]) / (poly[j][0] - poly[i][0]) + poly[i][1]) c = !c;
    return c;
  }
  const SEA_POLY = COAST.concat(SEA_CLOSE);

  function render(trip, day, sel) {
    const sts = stops(trip, day, sel);
    if (!sts.length) return { svg: '', stops: sts };
    const v = makeView(sts), P = v.proj;
    const pos = sts.map(s => P(s.ll));
    // keep pins apart without losing the true position of the route
    const pin = pos.map(p => p.slice());
    for (let it = 0; it < 24; it++) for (let i = 0; i < pin.length; i++) for (let j = i + 1; j < pin.length; j++) {
      let dx = pin[j][0] - pin[i][0], dy = pin[j][1] - pin[i][1], d = Math.hypot(dx, dy);
      const min = PIN_R * 2 + 4;
      if (d < min) { if (d < 0.01) { dx = 1; dy = (j - i) * 0.3; d = Math.hypot(dx, dy); } const k = (min - d) / 2 / d; pin[i][0] -= dx * k; pin[i][1] -= dy * k; pin[j][0] += dx * k; pin[j][1] += dy * k; }
    }
    const clearOfPins = (p, r) => pin.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > r);
    const inside = (p, m) => p[0] > m && p[0] < W - m && p[1] > m && p[1] < H - m;
    const zoom = Math.max(1, Math.min(1.8, v.s / 5));
    const g = [];

    // sea + land
    const coastPx = COAST.map(P), closePx = SEA_CLOSE.map(P);
    g.push(`<path class="m-sea" d="M${f1(coastPx[0][0])},${f1(coastPx[0][1])}${curve(coastPx, false)}${closePx.map(p => `L${f1(p[0])},${f1(p[1])}`).join('')}Z"/>`);
    // forests (two dot layers so the pattern does not read as a grid)
    FORESTS.forEach(poly => { const d = smoothPath(poly.map(P), true); g.push(`<path class="m-forest" d="${d}" fill="url(#mf1)"/><path class="m-forest" d="${d}" fill="url(#mf2)"/>`); });
    // rivers
    RIVERS.forEach(r => g.push(`<path class="m-river" d="${smoothPath(r.map(P), false)}"/>`));
    // lakes
    LAKES.forEach(l => {
      const pts = [];
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * 2 * Math.PI, wob = 1 + 0.14 * Math.sin(3 * a + l.ph), rr = l.rot * RAD;
        const ex = l.rx * wob * Math.cos(a), ey = l.ry * wob * Math.sin(a);
        const dx = ex * Math.cos(rr) - ey * Math.sin(rr), dy = ex * Math.sin(rr) + ey * Math.cos(rr);
        pts.push(P([l.c[0] + dy / KM_LAT, l.c[1] + dx / (111.32 * Math.cos(l.c[0] * RAD))]));
      }
      g.push(`<path class="m-lake" d="${smoothPath(pts, true)}"/>`);
    });
    // peaks
    PEAKS.forEach(([la, ln, sz]) => {
      const p = P([la, ln]), w = sz * Math.min(1.5, zoom), h = w * 1.25;
      if (!inside(p, -10) || !clearOfPins(p, 30)) return;
      g.push(`<path class="m-peak" d="M${f1(p[0] - w)},${f1(p[1] + h * 0.4)}L${f1(p[0])},${f1(p[1] - h * 0.6)}L${f1(p[0] + w)},${f1(p[1] + h * 0.4)}Z"/>` +
        `<path class="m-cap" d="M${f1(p[0] - w * 0.3)},${f1(p[1] - h * 0.2)}L${f1(p[0])},${f1(p[1] - h * 0.6)}L${f1(p[0] + w * 0.3)},${f1(p[1] - h * 0.2)}L${f1(p[0])},${f1(p[1] - h * 0.05)}Z"/>`);
    });
    // trees
    TREES.forEach(ll => {
      const p = P(ll);
      if (!inside(p, 8) || inPoly(ll, SEA_POLY) || !clearOfPins(p, 34)) return;
      g.push(`<g class="m-tree" transform="translate(${f1(p[0])},${f1(p[1])})"><path d="M0,3V10" class="m-trunk"/><ellipse cx="0" cy="-3" rx="5" ry="8" class="m-crown"/></g>`);
    });
    // place labels (skipped when they would sit on a pin)
    LABELS.forEach(([t, ll, k]) => {
      const p = P(ll);
      if (!inside(p, 30) || !clearOfPins(p, 46)) return;
      g.push(`<text class="m-lbl lk-${k}" x="${f1(p[0])}" y="${f1(p[1])}" text-anchor="middle">${esc(t)}</text>`);
    });
    // routes: double line when it is a real drive, dashed when it is a short hop
    const routeD = [];
    for (let i = 1; i < sts.length; i++) {
      const a = pos[i - 1], b = pos[i];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
      const long = Math.hypot(b[0] - a[0], b[1] - a[1]) > 36;
      if (!long) { routeD.push(`<path class="m-hop" d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}"/>`); continue; }
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const bend = 0.16 * len * (i % 2 ? 1 : -1), cx = mx - dy / len * bend, cy = my + dx / len * bend;
      const d = `M${f1(a[0])},${f1(a[1])}Q${f1(cx)},${f1(cy)} ${f1(b[0])},${f1(b[1])}`;
      routeD.push(`<path class="m-route" d="${d}"/><path class="m-route-in" d="${d}"/>`);
      const t = 0.55, qx = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], qy = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
      const tx = 2 * (1 - t) * (cx - a[0]) + 2 * t * (b[0] - cx), ty = 2 * (1 - t) * (cy - a[1]) + 2 * t * (b[1] - cy), ang = Math.atan2(ty, tx) / RAD;
      routeD.push(`<path class="m-arrow" transform="translate(${f1(qx)},${f1(qy)}) rotate(${f1(ang)})" d="M5,0L-4,-4.5L-4,4.5Z"/>`);
    }
    g.push(routeD.join(''));
    // pins
    sts.forEach((s, i) => {
      const [x, y] = pin[i], first = s.items.find(it => it.slotId) || s.items[0];
      const label = `${s.letter}: ${s.items.map(it => it.name).join(' · ')}`;
      g.push(`<g class="m-pin${s.hotel ? ' m-hotel' : ''}" transform="translate(${f1(x)},${f1(y)})" ${first.slotId ? `data-go="${esc(first.slotId)}" ` : ''}role="button" tabindex="0" aria-label="${esc(label)}">` +
        `<title>${esc(label)}</title><circle r="${PIN_R}" class="m-pin-bg"/><text class="m-pin-t" y="4" text-anchor="middle">${s.letter}</text></g>`);
    });
    // north arrow + scale bar
    g.push(`<g class="m-north" transform="translate(${W - 34},34)"><path d="M0,-14L7,6L0,2L-7,6Z" class="m-north-a"/><text y="22" text-anchor="middle" class="m-north-t">N</text></g>`);
    const nice = [1, 2, 5, 10, 20, 50, 100].filter(k => k * v.s <= 150).pop() || 1, bar = nice * v.s;
    g.push(`<g class="m-scale" transform="translate(24,${H - 24})"><path d="M0,-5V0H${f1(bar)}V-5"/><text x="0" y="-9">0</text><text x="${f1(bar)}" y="-9" text-anchor="end">${nice} km</text></g>`);

    const svg = `<svg class="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="แผนที่ประกอบ วันที่ ${day.n} — ภาพประกอบ ไม่ตรงมาตราส่วน">` +
      `<defs><pattern id="mf1" width="9" height="9" patternUnits="userSpaceOnUse"><ellipse cx="2" cy="2" rx="1.5" ry="1" transform="rotate(-30 2 2)"/><ellipse cx="6.5" cy="6" rx="1.4" ry="0.9" transform="rotate(25 6.5 6)"/></pattern>` +
      `<pattern id="mf2" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="translate(3 5)"><ellipse cx="3" cy="9" rx="1.4" ry="0.9" transform="rotate(10 3 9)"/><ellipse cx="10" cy="3" rx="1.5" ry="1" transform="rotate(-40 10 3)"/></pattern>` +
      `<clipPath id="mclip"><rect width="${W}" height="${H}" rx="14"/></clipPath></defs>` +
      `<g clip-path="url(#mclip)"><rect width="${W}" height="${H}" class="m-land"/>${g.join('')}</g></svg>`;
    return { svg, stops: sts };
  }

  const api = { stops, stopName, render, makeView, inPoly, SEA_POLY, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapView = api;
})(typeof window !== 'undefined' ? window : globalThis);
