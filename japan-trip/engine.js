/* Conflict engine — pure functions, shared by the page and the Node test. */
(function (root) {
  const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const hhmm = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const NAP_KINDS = ['meal', 'see', 'arch', 'cafe', 'shop', 'spa'];

  // Weekday always comes from the date, so a mistyped `dow` cannot silently disable closed-day checks.
  const dowOf = day => (day.date ? new Date(day.date + 'T00:00:00Z').getUTCDay() : day.dow);
  // 1st..5th occurrence of the weekday within the month (1–7 → 1, 8–14 → 2, …).
  const nthOf = day => Math.ceil(Number(day.date.slice(8, 10)) / 7);

  // Stored ids that no longer exist (trip.json edited after the user picked) fall back to the slot default.
  function selected(slot, sel) {
    const stored = sel && sel[slot.id];
    if (Array.isArray(stored)) {
      const ok = slot.opts.filter(o => stored.includes(o.id));
      if (ok.length || (slot.pick === 'any' && stored.length === 0)) return ok;
    }
    return slot.opts.filter(o => slot.def.includes(o.id));
  }
  function slotDur(slot, sel) {
    const s = selected(slot, sel);
    return slot.pick === 'one' ? (s[0] ? s[0].dur : 0) : s.reduce((a, o) => a + o.dur, 0);
  }

  function analyze(trip, day, sel) {
    const meta = trip.meta, issues = [];
    const add = (level, slot, msg) => issues.push({ level, slotId: slot ? slot.id : null, msg });
    const [napA, napB] = meta.nap.map(mins), [okA, okB] = meta.napStartOk.map(mins);
    const sunset = mins(day.sunset || meta.sunset || '17:00');
    const bufMin = meta.deadlineBuffer == null ? 15 : meta.deadlineBuffer;
    const napOverlapMin = meta.napBandOverlap == null ? 30 : meta.napBandOverlap;
    const dow = dowOf(day);
    const hasReturn = day.slots.some(s => s.kind === 'carreturn');
    const active = day.slots
      .map(s => ({ s, start: mins(s.time), dur: slotDur(s, sel), sel: selected(s, sel) }))
      .sort((a, b) => a.start - b.start);

    active.forEach((a, i) => {
      const { s, start, dur } = a;
      const end = start + dur;
      let off = 0;
      a.sel.forEach(o => {
        const label = o.n;
        const oStart = s.pick === 'any' ? start + off : start;
        const oEnd = oStart + o.dur;
        if (s.pick === 'any') off += o.dur;
        if (o.skip) {
          if (s.kind === 'refuel' && hasReturn) add('err', s, 'ข้ามการเติมน้ำมันไม่ได้ — ต้องเติมก่อนคืนรถ');
          return;
        }
        if (o.closedDow && o.closedDow.includes(dow))
          add('err', s, `${label}: ปิดวัน${DOW[dow]}`);
        if (o.closedNth && o.closedNth.some(([d, n]) => d === dow && n === nthOf(day)))
          add('err', s, `${label}: ปิดวัน${DOW[dow]}ที่ ${nthOf(day)} ของเดือน`);
        if (o.closedDates && o.closedDates.includes(day.date))
          add('err', s, `${label}: ปิดวันที่ ${day.date}`);
        if (o.last && oStart > mins(o.last))
          add('err', s, `${label}: เกินเวลาเข้าสุดท้าย ${o.last}`);
        if (o.close && oEnd > mins(o.close))
          add('warn', s, `${label}: จบ ${hhmm(oEnd)} เลยเวลาปิด ${o.close}`);
        if (o.queue) add('warn', s, `${label}: มักมีคิวยาว — ไปก่อนเวลาหรือจองคิว`);
        if (o.reserve) add('info', s, `${label}: ควรจอง/ยืนยันล่วงหน้า`);
        if (o.steep) add('warn', s, `${label}: มีบันไดชัน — ข้ามด้านใน เดินเฉพาะบริเวณราบ`);
        if (o.cold) add('info', s, `${label}: อากาศเย็น เตรียมเสื้อกันหนาว`);
        // Long drives: morning is accepted by the user; after the nap window the child is awake.
        if (s.kind === 'drive' && (o.km || 0) >= 40) {
          if (oStart < okA) add('info', s, `${label}: ขับไกล ${o.km} กม. ช่วงเช้า (ยอมรับแล้ว)`);
          else if (oStart > okB) add('warn', s, `${label}: ขับไกล ${o.km} กม. หลังช่วงนอน (เริ่ม ${hhmm(oStart)}) — เด็กตื่นอยู่ระหว่างทาง`);
        }
        if ((s.kind === 'drive' || s.kind === 'nap') && (o.km || 0) >= 10 && oEnd > sunset)
          add('warn', s, `${label}: ขับเลยตะวันตกดิน (~${hhmm(sunset)}) จบ ${hhmm(oEnd)}`);
        if (s.kind === 'rest' && !o.quiet && oStart >= napA && oStart < napB)
          add('warn', s, `${label}: แวะพักในช่วงเด็กนอน อาจปลุกเด็ก`);
        if (s.kind === 'nap' && (oStart < okA || oStart > okB))
          add('warn', s, `${label}: เริ่ม ${hhmm(oStart)} อยู่นอกช่วงนอน ${hhmm(okA)}–${hhmm(okB)}`);
        if (NAP_KINDS.includes(s.kind) && o.dur > 0) {
          const ov = Math.min(oEnd, napB) - Math.max(oStart, napA);
          if (ov >= napOverlapMin) add('warn', s, `${label}: ซ้อนช่วงเด็กนอน ${ov} นาที (${hhmm(oStart)}–${hhmm(oEnd)})`);
        }
      });

      if (s.deadline) {
        const dl = mins(s.deadline);
        if (end > dl) add('err', s, `จบ ${hhmm(end)} เลยเส้นตาย ${s.deadline}`);
        else if (dl - end < bufMin) add('warn', s, `จบ ${hhmm(end)} เหลือเวลาเผื่อแค่ ${dl - end} นาทีก่อนเส้นตาย ${s.deadline}`);
      }

      const next = active.slice(i + 1).find(n => n.dur > 0 || n.s.kind === 'flight');
      if (next && dur > 0) {
        const over = end - next.start;
        if (over > 10) add('err', s, `ชนกับ "${next.s.title}" (${next.s.time}) เกิน ${over} นาที — จบ ${hhmm(end)}`);
        else if (over > 0) add('warn', s, `ซ้อนกับ "${next.s.title}" ${over} นาที`);
      }
    });

    const order = { err: 0, warn: 1, info: 2 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    return issues;
  }

  // Structural check of trip.json — returns a list of problems (empty = OK).
  function validate(trip) {
    const p = [], ids = new Set();
    const m = trip.meta || {};
    ['nap', 'napStartOk'].forEach(k => { if (!Array.isArray(m[k]) || m[k].length !== 2 || !m[k].every(t => TIME.test(t))) p.push(`meta.${k} ต้องเป็น ["HH:MM","HH:MM"]`); });
    ['dayStart', 'dayEnd'].forEach(k => { if (!TIME.test(m[k] || '')) p.push(`meta.${k} ต้องเป็น HH:MM`); });
    (trip.days || []).forEach(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) { p.push(`${d.id}: date ไม่ถูกรูปแบบ`); return; }
      if (d.dow != null && d.dow !== dowOf(d)) p.push(`${d.id}: dow=${d.dow} ไม่ตรงกับ date ${d.date} (ควรเป็น ${dowOf(d)})`);
      let prev = -1;
      d.slots.forEach(s => {
        if (ids.has(s.id)) p.push(`${s.id}: id ซ้ำ`); ids.add(s.id);
        if (!TIME.test(s.time || '')) { p.push(`${s.id}: time ไม่ถูกรูปแบบ`); return; }
        if (mins(s.time) < prev) p.push(`${s.id}: เวลา ${s.time} ย้อนกลับเมื่อเทียบกับช่องก่อนหน้า`);
        prev = mins(s.time);
        if (!s.opts || !s.opts.length) p.push(`${s.id}: ไม่มี opts`);
        const oids = new Set();
        (s.opts || []).forEach(o => {
          if (oids.has(o.id)) p.push(`${s.id}/${o.id}: option id ซ้ำ`); oids.add(o.id);
          if (typeof o.dur !== 'number' || o.dur < 0) p.push(`${s.id}/${o.id}: dur ไม่ถูกต้อง`);
          if (o.skip && o.dur !== 0) p.push(`${s.id}/${o.id}: skip ต้องมี dur 0`);
          ['last', 'close'].forEach(k => { if (o[k] && !TIME.test(o[k])) p.push(`${s.id}/${o.id}: ${k} ต้องเป็น HH:MM`); });
          if (o.closedNth && !o.closedNth.every(x => Array.isArray(x) && x.length === 2)) p.push(`${s.id}/${o.id}: closedNth ต้องเป็น [[dow,nth],…]`);
        });
        (s.def || []).forEach(x => { if (!oids.has(x)) p.push(`${s.id}: def "${x}" ไม่มีใน opts`); });
        if (s.pick === 'one' && (s.def || []).length !== 1) p.push(`${s.id}: pick=one ต้องมี def 1 ตัว`);
        if (s.deadline && !TIME.test(s.deadline)) p.push(`${s.id}: deadline ต้องเป็น HH:MM`);
      });
    });
    return p;
  }

  const api = { mins, hhmm, selected, slotDur, analyze, validate, dowOf, nthOf, DOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
