// node test.mjs — exits non-zero on any failure.
import fs from 'fs';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const E = req('./engine.js');
const M = req('./map.js');
const trip = JSON.parse(fs.readFileSync(new URL('./trip.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); }
};

// ---------- fixtures ----------
const meta = { nap: ['13:00', '14:30'], napStartOk: ['12:45', '14:15'], dayStart: '07:00', dayEnd: '22:00', sunset: '17:00' };
const opt = (id, o = {}) => ({ id, n: id, dur: 30, ...o });
const slot = (id, time, kind, opts, extra = {}) => ({ id, time, kind, title: id, pick: 'one', def: [opts[0].id], opts, ...extra });
// 2026-10-19 is a Monday, 2026-10-21 is the 3rd Wednesday, 2026-10-14 the 2nd Wednesday.
const run = (slots, date = '2026-10-19', sel = {}, dayExtra = {}) => {
  const day = { id: 'x', date, slots, ...dayExtra };
  return E.analyze({ meta }, day, sel);
};
const has = (is, level, re) => is.some(i => i.level === level && re.test(i.msg));

console.log('engine rules');
test('weekday comes from date, not from a mistyped dow', () => {
  const is = run([slot('a', '10:00', 'see', [opt('m', { closedDow: [1] })])], '2026-10-19', {}, { dow: 3 });
  assert.ok(has(is, 'err', /ปิดวันจ/));
});
test('validate() catches a dow that does not match the date', () => {
  const t = JSON.parse(JSON.stringify(trip)); t.days[0].dow = 2;
  assert.ok(E.validate(t).some(p => /dow/.test(p)));
});
test('closedNth: 2nd Wednesday closed, 3rd Wednesday open', () => {
  const s = [slot('a', '10:00', 'arch', [opt('m', { closedNth: [[3, 2], [3, 4]] })])];
  assert.ok(has(run(s, '2026-10-14'), 'err', /ที่ 2 ของเดือน/));
  assert.equal(run(s, '2026-10-21').filter(i => i.level === 'err').length, 0);
});
test('closedDates', () => {
  assert.ok(has(run([slot('a', '10:00', 'see', [opt('m', { closedDates: ['2026-10-19'] })])]), 'err', /ปิดวันที่/));
});
test('last entry → err, closing time → warn', () => {
  assert.ok(has(run([slot('a', '16:45', 'see', [opt('m', { last: '16:30' })])]), 'err', /เข้าสุดท้าย/));
  assert.ok(has(run([slot('a', '16:45', 'see', [opt('m', { close: '17:00', dur: 30 })])]), 'warn', /เลยเวลาปิด/));
});
test('queue / steep → warn; reserve / cold → info', () => {
  const is = run([slot('a', '10:00', 'see', [opt('m', { queue: true, steep: true, reserve: true, cold: true })])]);
  assert.ok(has(is, 'warn', /คิว/) && has(is, 'warn', /บันไดชัน/) && has(is, 'info', /ควรจอง/) && has(is, 'info', /เย็น/));
});
test('long drive: morning = info, after nap window = warn, in nap window = silent', () => {
  const d = t => run([slot('a', t, 'drive', [opt('m', { km: 90, dur: 60 })])]);
  assert.ok(has(d('09:00'), 'info', /ช่วงเช้า/));
  assert.ok(has(d('15:00'), 'warn', /หลังช่วงนอน/));
  assert.equal(d('13:00').length, 0);
});
test('driving past sunset → warn (short hops ignored)', () => {
  assert.ok(has(run([slot('a', '16:30', 'drive', [opt('m', { km: 30, dur: 40 })])]), 'warn', /ตะวันตกดิน/));
  assert.equal(run([slot('a', '19:30', 'drive', [opt('m', { km: 1, dur: 5 })])]).length, 0);
});
test('per-day sunset override', () => {
  const s = [slot('a', '16:30', 'drive', [opt('m', { km: 30, dur: 40 })])];
  assert.equal(has(run(s, '2026-10-19', {}, { sunset: '17:30' }), 'warn', /ตะวันตกดิน/), false);
});
test('rest inside nap band: warn unless quiet', () => {
  assert.ok(has(run([slot('a', '13:30', 'rest', [opt('m')])]), 'warn', /ปลุกเด็ก/));
  assert.equal(run([slot('a', '13:30', 'rest', [opt('m', { quiet: true })])]).length, 0);
});
test('nap slot starting outside 12:45–14:15 → warn', () => {
  assert.ok(has(run([slot('a', '12:30', 'nap', [opt('m', { dur: 60 })])]), 'warn', /นอกช่วงนอน/));
  assert.equal(run([slot('a', '13:00', 'nap', [opt('m', { dur: 60 })])]).length, 0);
});
test('meal overlapping the nap band by ≥30 min → warn; 15 min is tolerated', () => {
  assert.ok(has(run([slot('a', '13:00', 'meal', [opt('m', { dur: 60 })])]), 'warn', /ซ้อนช่วงเด็กนอน 60/));
  assert.equal(run([slot('a', '12:15', 'meal', [opt('m', { dur: 60 })])]).length, 0);
});
test('deadline: over → err, <15 min buffer → warn, ≥15 → ok', () => {
  const r = (t, dur) => run([slot('a', t, 'carreturn', [opt('m', { dur })], { deadline: '18:00' })]);
  assert.ok(has(r('17:55', 10), 'err', /เส้นตาย/));
  assert.ok(has(r('17:50', 10), 'warn', /เหลือเวลาเผื่อแค่ 0 นาที/));
  assert.equal(r('17:10', 10).length, 0);
});
test('skipping refuel on a car-return day → err', () => {
  const s = [slot('a', '17:00', 'refuel', [opt('r', { skip: true, dur: 0 })]), slot('b', '17:30', 'carreturn', [opt('c')])];
  assert.ok(has(run(s), 'err', /ข้ามการเติมน้ำมัน/));
});
test('overlap with next slot: >10 min err, ≤10 min warn', () => {
  const o = gap => run([slot('a', '10:00', 'see', [opt('m', { dur: 60 })]), slot('b', gap, 'meal', [opt('n')])]);
  assert.ok(has(o('10:40'), 'err', /ชนกับ/));
  assert.ok(has(o('10:55'), 'warn', /ซ้อนกับ/));
  assert.equal(o('11:00').filter(i => i.level !== 'info').length, 0);
});
test('"any" slot lays options end to end', () => {
  const mk = d => [slot('a', '15:30', 'see', [opt('x', { dur: d }), opt('y', { dur: 30, last: '16:00' })], { pick: 'any', def: ['x', 'y'] })];
  assert.equal(has(run(mk(30)), 'err', /เข้าสุดท้าย/), false); // y starts 16:00 = last entry → ok
  assert.ok(has(run(mk(45)), 'err', /เข้าสุดท้าย/));          // y starts 16:15 → too late
});

console.log('selection state');
test('stale stored ids fall back to the default', () => {
  const s = slot('a', '10:00', 'see', [opt('x'), opt('y')], { def: ['y'] });
  assert.deepEqual(E.selected(s, { a: ['gone'] }).map(o => o.id), ['y']);
  assert.equal(E.slotDur(s, { a: ['gone'] }), 30);
});
test('"any" slot: deliberately empty selection stays empty', () => {
  const s = slot('a', '10:00', 'see', [opt('x'), opt('y')], { pick: 'any', def: ['x'] });
  assert.deepEqual(E.selected(s, { a: [] }), []);
});
test('valid stored ids win over the default', () => {
  const s = slot('a', '10:00', 'see', [opt('x'), opt('y')], { def: ['x'] });
  assert.deepEqual(E.selected(s, { a: ['y'] }).map(o => o.id), ['y']);
});

console.log('trip.json (real data)');
test('passes structural validation', () => assert.deepEqual(E.validate(trip), []));
test('9 days, 15–23 Oct 2026', () => {
  assert.equal(trip.days.length, 9);
  assert.equal(trip.days[0].date, '2026-10-15'); assert.equal(trip.days[8].date, '2026-10-23');
});
test('default plan has no errors on any day', () => {
  for (const d of trip.days) assert.deepEqual(E.analyze(trip, d, {}).filter(i => i.level === 'err').map(i => i.msg), [], 'D' + d.n);
});
test('default warnings are exactly the known, accepted ones', () => {
  const got = trip.days.flatMap(d => E.analyze(trip, d, {}).filter(i => i.level === 'warn').map(i => `D${d.n}:${i.slotId}`));
  assert.deepEqual(got, ['D3:d3s9', 'D4:d4s8', 'D8:d8s8']); // castle stairs; two afternoon drives with the child awake
});
test('D8: ≥30 min buffer before the 18:00 car return', () => {
  const d = trip.days[7], s = d.slots.find(x => x.kind === 'carreturn');
  assert.ok(E.mins(s.deadline) - (E.mins(s.time) + E.slotDur(s, {})) >= 30);
});
test('D8: skipping the mandatory refuel is an error', () => {
  assert.ok(E.analyze(trip, trip.days[7], { d8s9: ['b'] }).some(i => i.level === 'err' && /เติมน้ำมัน/.test(i.msg)));
});
test('D3: picking Alps Park collides with the café (user must choose)', () => {
  assert.ok(E.analyze(trip, trip.days[2], { d3s9: ['b'] }).some(i => i.level === 'err' && /ชนกับ/.test(i.msg)));
});
test('D4: Chihiro (Sun 18 Oct) is open; same museum on 14 or 28 Oct would not be', () => {
  const o = trip.days[3].slots.find(s => s.id === 'd4s6').opts.find(x => x.id === 'a');
  assert.ok(o.closedNth.length);
  for (const date of ['2026-10-14', '2026-10-28']) {
    const d = { ...trip.days[3], date };
    assert.ok(E.analyze(trip, d, {}).some(i => i.level === 'err' && /ของเดือน/.test(i.msg)), date);
  }
});
test('every closed-weekday option is open on its scheduled day', () => {
  // Senju (Tue) D7 Wed · Kadokawa (Tue) D8 Thu · Matsumoto City Museum (Mon) D6 Tue · Gunma MoMA (Mon) D8 Thu
  for (const d of trip.days) for (const s of d.slots) for (const o of s.opts)
    if (o.closedDow) assert.ok(!o.closedDow.includes(E.dowOf(d)), `${d.id} ${o.n}`);
});
test('child-nap band 13:00–14:30 has a car/quiet slot on every driving day (D2–D8)', () => {
  for (const d of trip.days.slice(1, 8)) {
    const cover = d.slots.filter(s => ['nap', 'rest'].includes(s.kind)).reduce((a, s) => {
      const st = E.mins(s.time), en = st + E.slotDur(s, {});
      return a + Math.max(0, Math.min(en, 14 * 60 + 30) - Math.max(st, 13 * 60));
    }, 0);
    assert.ok(cover >= 45, `D${d.n}: only ${cover} min of nap cover`);
  }
});

console.log('map');
test('stops: consecutive pins at the same place merge; letters run A, B, C…', () => {
  const day = { id: 'x', n: 1, date: '2026-10-19', from: { n: 'H', ll: [35.0, 139.0] }, slots: [
    slot('a', '09:00', 'drive', [opt('d', { n: 'X → Y', dur: 30 })], { ll: [35.5, 139.5] }),
    slot('b', '09:30', 'see', [opt('s', { n: 'Sight', ll: [35.5005, 139.5005] })]),
    slot('c', '12:00', 'meal', [opt('m')]),                                   // no ll → no pin
    slot('d', '15:00', 'hotel', [opt('h', { n: 'Hotel' })], { ll: [35.9, 139.9] })] };
  const st = M.stops({ meta }, day, {});
  assert.deepEqual(st.map(s => s.letter), ['A', 'B', 'C']);
  assert.equal(st[1].items.length, 2);
  assert.equal(M.stopName(st[1]), 'Sight');         // the place beats the "X → Y" drive text
  assert.ok(st[0].hotel && st[2].hotel);
});
test('stops: unselected "any" options produce no pin', () => {
  const d = trip.days[3]; // D4
  assert.equal(M.stops(trip, d, { d4s3: ['a'] }).length, M.stops(trip, d, {}).length - 1);
});
test('stops: pin display-name override', () => {
  const o = trip.days[4].slots.find(s => s.id === 'd5s7').opts[0];
  assert.equal(o.pin, 'The Celecton Matsumoto');
  assert.equal(M.stopName(M.stops(trip, trip.days[4], {}).pop()), 'The Celecton Matsumoto');
});
test('every day renders a finite SVG with one pin per stop and a Maps query per stop', () => {
  for (const d of trip.days) {
    const r = M.render(trip, d, {});
    assert.ok(r.svg.startsWith('<svg') && !/NaN|undefined|Infinity/.test(r.svg), 'D' + d.n);
    assert.equal((r.svg.match(/class="m-pin( m-hotel)?"/g) || []).length, r.stops.length, 'D' + d.n);
    r.stops.forEach(s => assert.ok(s.items[0].q, 'D' + d.n + ' ' + s.letter));
  }
});
test('every stop falls inside the canvas margins', () => {
  for (const d of trip.days) {
    const st = M.stops(trip, d, {}), v = M.makeView(st);
    st.forEach(s => {
      const [x, y] = v.proj(s.ll);
      assert.ok(x >= 55 && x <= M.W - 55 && y >= 55 && y <= M.H - 55, `D${d.n} ${s.letter} at ${x | 0},${y | 0}`);
    });
  }
});
test('selecting every option on every day still renders', () => {
  for (const d of trip.days) {
    const all = Object.fromEntries(d.slots.map(s => [s.id, s.opts.map(o => o.id)]));
    assert.ok(M.render(trip, d, all).svg.length > 1000);
  }
});
test('validate() rejects a coordinate outside Japan (lat/lng swapped)', () => {
  const t = JSON.parse(JSON.stringify(trip)); t.days[1].slots[2].ll = [139.4, 35.4];
  assert.ok(E.validate(t).some(p => /ll/.test(p)));
});
test('sea polygon: Tokyo Bay is water; Matsumoto and Ebina are land', () => {
  assert.equal(M.inPoly([35.45, 139.85], M.SEA_POLY), true);
  assert.equal(M.inPoly([36.24, 137.97], M.SEA_POLY), false);
  assert.equal(M.inPoly([35.44, 139.39], M.SEA_POLY), false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
