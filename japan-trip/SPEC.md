# Japan 2569 — Interactive Itinerary

Goal: self-contained itinerary page built from `trip.json`.
Family: 2 elderly adults + 1 child (4 y). Nissan Serena from Haneda, 15–23 Oct 2026.

## Files
- `trip.json` — single source of truth (9 days → slots → options). Edit this, not the HTML.
- `engine.js` — pure conflict checker `Engine.analyze(trip, day, sel)` and structural checker `Engine.validate(trip)`.
- `map.js` — illustrated day map: `MapView.stops()` (lettered pins) and `MapView.render()` (SVG). Pure functions, also run in Node.
- `template.html` — UI: card-stack deck (progress ring, NN / 09 counter, prev/next, day tabs), map + legend column, 07:00–22:00 strip with nap band, issue list, option cards, copy-plan, 2-tap reset, theme toggle.
- `build.mjs` — `node build.mjs` validates trip.json, then inlines trip.json + engine.js + map.js into `index.html`. Works from any directory; writes next to itself.
- `test.mjs` — `node test.mjs`: 37 assertions (one per rule + real-data checks + map). Exits non-zero on failure.
- `index.html` — build output (committed so it can be opened directly).

## Data model
- Meta: `title, subtitle, party, nap ["13:00","14:30"], napStartOk ["12:45","14:15"], dayStart, dayEnd, sunset "17:00", deadlineBuffer 15, napBandOverlap 30, version, rules[]`.
  `version` is part of the localStorage key — bump it when option ids change.
- Day: `id, n, dow, date, label, route, night, from?{n, ll}, weather[{t, s:"info"|"warn"}], slots[], sunset?`
  `from` = where the day starts (first pin, drawn as a hotel ring).
  The weekday is **derived from `date`**; `dow` is only a cross-check (`validate()` flags a mismatch).
- Slot: `id, time "HH:MM", kind, title, pick "one"|"any", def[optIds], opts[], deadline?, ll?`
  `ll [lat,lng]` on a slot = default pin for all its options (a drive slot = its destination).
  - Same-time rows in the original sheet are **options of one slot** (user's intent), not conflicts.
  - Slots must be in chronological order within a day (`validate()` checks).
- Option: `id, n, note, dur(min), q (Google Maps search text), km, queue, reserve, steep, cold, arch, kids, closedDow[], closedNth[[dow,nth],…], closedDates[], last, close, skip, quiet, fuel, ll, pin`
  `ll` overrides the slot pin; `pin` overrides the name shown in the map legend. Options/slots without `ll` (most meals/cafés) get no pin.
  - `closedNth`: `[[3,2],[3,4]]` = 2nd and 4th Wednesday (dow 0=Sun).
- Kinds: arrival, hotel, meal, drive, nap, rest, see, arch, cafe, shop, refuel, car, carreturn, flight, spa, transit.
- Map link: `https://www.google.com/maps/search/?api=1&query=<encoded q>`
- UI state: `sel[slotId] = [optIds]` in localStorage `japan2569.sel.<version>` (try/catch). Stored ids that no longer exist fall back to `def`.

## Map (map.js)
- One SVG per day, auto-fitted to that day's pins (min window 12 km). Consecutive pins within ~275 m merge into one lettered pin; the legend lists the places and times.
- Style: flat paper map, lettered navy circle pins (hotel = ring), double-line drives, dashed short hops, dotted forests, blue rivers/lakes, peaks, trees, N arrow, scale bar. Colours are CSS variables (light + dark).
- **The base layer (coast, forests, rivers, peaks) is hand-drawn and approximate. Pin coordinates are from memory, accurate to roughly a few hundred metres to ~1 km.** It is an illustration; each legend row links to Google Maps for the real location.
- Pins are focusable and jump to their slot; legend rows do the same.

## Design
- Layout: after the card-stack deck in the reference (outlined rounded cards stacked offset down-left, `02 / 09` counter with a progress ring, circular prev/next buttons, `> READY TO EXECUTE _` prompt, graph-paper background).
- Fonts: Latin = Geist Mono (Google Fonts, stand-in chosen to match the reference — swap `--font` if it is another mono); Thai = Sukhumvit Set via `local()` (it must be installed on the device; IBM Plex Sans Thai is the web fallback). To guarantee Sukhumvit everywhere, supply the font files and add them as `@font-face` (check the licence).

## Conflict rules (engine.js)
| level | rule |
|---|---|
| err | selected slot end overlaps next slot start by >10 min; closed weekday / nth weekday / date; start after `last` entry; end after slot `deadline`; refuel skipped on a day that has `carreturn` |
| warn | overlap ≤10 min; end after `close`; queue; steep stairs; `nap` slot starting outside 12:45–14:15; `rest` stop inside 13:00–14:30 (unless `quiet`); drive ≥40 km starting after 14:15 (child awake); drive/nap ≥10 km ending after sunset (default 17:00); meal/see/arch/cafe/shop/spa overlapping the nap band by ≥30 min; `deadline` buffer <15 min |
| info | reserve; cold; drive ≥40 km starting before 12:45 ("morning accepted by user") |

## User decisions applied
1. Stay at **Hotel Cypress Karuizawa** (D6, D7; D8 breakfast) — no Hotel Indigo anywhere.
2. Long drives in the **morning** are accepted (info). Afternoon long drives with the child awake are shown as warn.
3. Refuel: D5 08:15 (before Kamikochi), D7 19:25 (optional), D8 16:45 (**mandatory**, car return 17:10, deadline 18:00).
4. Multi-activity same-time rows = choices.
5. Foliage/weather notes: Kamikochi cold (taxi nap option A recommended), Karuizawa/Kawaguchiko peak later than normal in 2026.
- Child is 4 y (sheet said 3 y).

## Review fixes (v2)
- Engine: stale selections fall back to default; weekday from date; `closedNth`/`closedDates`; daylight rule; deadline buffer; nap-band overlap rule; long-drive rule no longer says "accepted" for afternoon/evening; `validate()`.
- Page: doctype + charset + viewport; tab-scroll position kept; 2-tap reset; status dots carry ✕ / ! / ✓; darker accent for contrast; strip clipped to the bar with 3-hour ticks; screen-reader summary instead of re-announcing the day; tab keyboard navigation.
- Plan: D1 arrival 90 min → hotel 19:30 → dinner 20:00 (architecture stop defaults to skip); D2 lunch 12:30 then nap 13:15, sights after the child wakes; D4 lunch 12:15, nap 13:15 + parked at Chihiro, back before dusk; D5 real breakfast, lunch 12:00, nap 13:00; D7 lunch 12:15 / nap 13:15 / dinner 18:00; D8 leave Tokorozawa 15:30 (cafe default skip) → car return 17:10 (≈40 min buffer).

## Verified facts used (re-check before the trip)
Haneda→Kawaguchiko 113–123 km 1h39–1h53 · Kawaguchiko→Matsumoto 135–142 km 1h46–2h06 · Matsumoto→Karuizawa 78–90 km 1h19–1h31 · Tokorozawa→Haneda 48 km ~51 min (rush ~75) ·
Chihiro Art Museum 10–17 (last 16:30), closed 2nd/4th Wed (14 and 28 Oct; 18 Oct is a Sunday) · Hiroshi Senju Museum closed Tue · Kadokawa Culture Museum closed Tue · Matsumoto City Museum of Art closed Mon · Matsumoto Castle last entry 16:30 · Hakuba Iwatake gondola to 15 Nov · Kamikochi: no private cars, park at Sawando.

## Not yet verified (marked in the data)
- Prince Outlet food-court closing time (`close: "19:00"` on D6/D7 dinner options is an estimate).
- Sunset ≈ 17:00 is approximate; Kamikochi valley loses sun earlier. Last Kamikochi bus/taxi times.
- Map pin coordinates (see Map) and the Pinterest layout reference (pin could not be opened — only the attached screenshot was used).
- Houtou Fudou / Sushiro queue and reservation rules; child-seat availability with the rental company.

## Ideas for next steps
- Replace the illustrated base layer with real tiles (Leaflet/OSM) or a Google Maps embed (needs network access).
- Export selected plan to `.ics` / Google Calendar.
- Drive-time lookup from a routing API instead of hand-entered `dur`.
- Per-day packing/weather checklist; Thai/English toggle.
