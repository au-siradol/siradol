/* Day route helpers — pure functions, shared by the page and the Node test.
 * stops(): the lettered places of a day (merged when they are the same spot).
 * placeEmbed / routeEmbed: keyless Google Maps iframe URLs.  dirUrl / searchUrl: official Maps URLs (open the app).
 * Places are sent to Google by NAME (the option's `q`), so Google resolves the real location;
 * `ll` is only used here to decide which neighbouring items are the same stop. */
(function (root) {
  const E = typeof require === 'function' ? require('./engine.js') : root.Engine;
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const NEAR = 0.0025, MAX_WAYPOINTS = 8;
  const near = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) < NEAR;
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const enc = encodeURIComponent;

  function stops(trip, day, sel) {
    const out = [];
    const push = (ll, item, hotel) => {
      const last = out[out.length - 1];
      if (last && last.lls.some(p => near(p, ll))) { last.items.push(item); last.lls.push(ll); if (hotel) last.hotel = true; return; }
      out.push({ ll, lls: [ll], hotel: !!hotel, items: [item] });
    };
    if (day.from && day.from.ll) push(day.from.ll, { slotId: null, time: null, name: day.from.n, q: day.from.n, kind: 'start' }, true);
    day.slots.slice().sort((a, b) => mins(a.time) - mins(b.time)).forEach(s => {
      E.selected(s, sel).forEach(o => {
        const ll = o.ll || s.ll;
        if (o.skip || !ll) return;
        push(ll, { slotId: s.id, time: s.time, name: o.pin || o.n, q: o.q || o.n, kind: s.kind }, s.kind === 'hotel');
      });
    });
    out.forEach((st, i) => { st.letter = LETTERS[i] || String(i + 1); });
    return out;
  }

  // Display name of a stop: places win over drive descriptions ("A → B" becomes "B").
  function stopName(st) {
    const places = st.items.filter(i => i.kind !== 'drive' && i.kind !== 'nap');
    const use = places.length ? places : st.items;
    return [...new Set(use.map(i => i.name.replace(/^.*→\s*/, '')))].join(' · ');
  }

  // The text sent to Google for a stop: the first real place query.
  const query = st => (st.items.find(i => i.q) || st.items[0]).q;
  // Collapse consecutive duplicates (a hotel and the car pick-up at the same address, etc.).
  const queries = sts => sts.map(query).filter((q, i, a) => i === 0 || q !== a[i - 1]);

  const searchUrl = q => 'https://www.google.com/maps/search/?api=1&query=' + enc(q);
  const placeEmbed = q => 'https://maps.google.com/maps?q=' + enc(q) + '&z=15&hl=th&output=embed';
  function routeEmbed(sts) {
    const q = queries(sts);
    if (q.length < 2) return placeEmbed(q[0] || '');
    return 'https://maps.google.com/maps?saddr=' + enc(q[0]) + '&daddr=' + q.slice(1).map(enc).join('+to:') + '&dirflg=d&hl=th&output=embed';
  }
  function dirUrl(sts) {
    const q = queries(sts);
    if (q.length < 2) return searchUrl(q[0] || '');
    const mid = q.slice(1, -1).slice(0, MAX_WAYPOINTS);
    return 'https://www.google.com/maps/dir/?api=1&origin=' + enc(q[0]) + '&destination=' + enc(q[q.length - 1]) +
      (mid.length ? '&waypoints=' + mid.map(enc).join('%7C') : '') + '&travelmode=driving';
  }

  const api = { stops, stopName, query, queries, searchUrl, placeEmbed, routeEmbed, dirUrl, MAX_WAYPOINTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapView = api;
})(typeof window !== 'undefined' ? window : globalThis);
