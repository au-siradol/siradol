# Handoff — Japan 2569 trip page

Read this first when continuing in a new session. `SPEC.md` has the data model and engine rules; this file has the working state, the user's decisions and what is still open.

## The project
- Live page: https://au-siradol.github.io/siradol/japan-trip/ (GitHub Pages from `main`).
- Work branch: `claude/japan-trip-constraints-review-6dtxf9`. After each change: commit on the branch, push it, then fast-forward `main` (`git push origin HEAD:main`).
- Trip: 15–23 Oct 2026. **8 people: 7 adults (2 elderly) + 1 child, 4 years old.** One Nissan Serena (8 seats) from Haneda.
- Talk to the user in Thai. The user is an architect and lecturer, so architecture stops matter.

## How to change things
1. Edit `trip.json` only (never `index.html` by hand). Each option sits on one line: `{ "id": "a", "n": …, "note": …, "dur": …, "q": … }`.
2. `node build.mjs` — validates and writes `index.html`.
3. `node test.mjs` — 39 tests must pass. When a default choice adds a warning on purpose, update the known list in the test "default warnings are exactly the known, accepted ones".
4. Check the day with `node -e "const E=require('./engine.js'),t=require('./trip.json');console.log(E.analyze(t,t.days[N],{}))"` (also `E.lateDay(day)` for Plan B).
5. Commit messages: no model names. End with the Co-Authored-By / Claude-Session lines the session gives.

## Rules the user set
- Every place link opens **just that place** in Google Maps (`MV.searchUrl(o.q||o.n)`), never directions.
- Flags: `kids` 🧒🏻, `thai` 🇹🇭 ไทยนิยม, `queue`, `reserve`, `steep`, `arch`, `avoid` (red "don't go" text), `closedDow`.
- A place closed on its day is **removed**, not just flagged (test "every closed-weekday option is open on its scheduled day").
- Notes for meals carry "8 คน: …" (seating for the group) and parking.
- Hotels: TOKI (D2), The Celecton Matsumoto (D3–D5), Hotel Cypress Karuizawa (D6–D7). Do not swap Hakuba to D6 (user said no).
- The handwriting font `fonts/2006_iannnnnBKK.ttf` is gitignored and must stay unpublished; keep the credit line.
- No paid map APIs. Pages are public.
- Plan B (start 30–45 min late) lives in `days[].late`; tapping the start ring switches Plan A / Plan B.
- Literature passages: `lit` on slots or options (long version only); source list in `scenery-list.csv` (untracked).

## State by day (defaults)
- **D2** Haneda → Ebina SA → Ashigara SA → nap drive → Yamanaka viewpoints → café → TOKI.
- **D3** Oishi Park → Nenba-hama (Saiko) → lunch Houtou Fudou Kita Honten → nap drive via Misaka → Suwako SA (or Fujimori, or no stop) → Matsumoto (MPAC, castle) → dinner Miyota.
- **D4** Hakuba (Snow Peak, Iwatake gondola, City Bakery) → Chihiro Art Museum → Matsumoto, dinner Gyu-Kaku. Options added: hotel breakfast, Michi-no-eki Hakuba lunch, Daio Wasabi Farm, AEON Mall, Bikkuri Donkey.
- **D5** Kamikochi (Sawando parking, jumbo taxi), lunch Gosenjaku Kitchen, dinner Ikekuni.
- **D6** Kagetsu breakfast → Kusama museum → Karaage Center → nap drive → Shiraito Falls → Stone Church → Cypress.
- **D7** Kumoba Pond, Kyu-Karuizawa Ginza, lunch Kawakamian, Prince Outlet, food court dinner.
- **D8** Takasaki (Gunma MoMA) → Tokorozawa (Kadokawa) → refuel → car return 17:10.

## Open items
- Karuizawa architecture: D7 09:40 defaults to the Hiroshi Senju Museum (closed Tue, so D7 only); options include Kumoba, St. Paul's (Raymond), Wakita (Yoshimura), Raymond Summer House/Peynet in Taliesin, Former Mikasa Hotel (reopened Oct 2025), Mampei Hotel and Union Church + Shaw Chapel. D6 adds Karuizawa Kogen Church beside the Stone Church. Kogen Church and Union Church opening details were not re-checked.
- Check before the trip:
  - **Places:**
    - Marumo weekday opening time (D5 07:30 breakfast).
    - Zen soba Hakuba lunch hours.
    - Kura no Mukou Sunday hours.
    - Celecton breakfast included or not.
  - **Car:**
    - Confirm the rental is the 8-seat Serena.
    - Child seat on a window seat.
    - Luggage space is tight with all 3 rows used.
    - The Serena is ~1.87 m tall, so no mechanical car parks.
  - **Book tables for 8:** Miyota, Ikekuni, Pyrenees, Shoya no Ie, Sanrokuen.
- Restaurants not found online (left in, marked): Kamameshi Oki, Miyoshi Soba, Tomato & Onion (D5 dinner).
- Shared page for the group-of-8 restaurant review: https://claude.ai/artifact/L3t8ab992j1ZkxYVzHXKsf (private until shared).
- Google Sheet "update" tab matches the web as of 6 Oct 2026 (all four must-see additions included). Re-sync after any later web change.
