# Portal Frame Array — working notes

Study `01` · `works/portal-frame-array.html` · interpretation of **Alvar Aalto, Riola church**
(Santa Maria Assunta, Riola di Vergato, 1966–78).

_Last updated: 2026-09-03 (Stage 1 + Stage 2 of the datum-wall / lofted-roof rebuild landed)_

---

## Current state of the file

### Renderer
- **Three.js r128** (UMD from cdnjs), WebGL z-buffer. Replaced the old canvas-2D painter that
  could not tile polygons without hairline seams or do reliable hidden-surface.
- `OrthographicCamera` + custom orbit: drag = rotate (`orbitAz` / `orbitEl`, elevation clamp
  −22°…82°), wheel = zoom (`camZoom` 0.3…6), double-click = reset to az 45° / el 26°.
- Ribs: `ExtrudeGeometry` of a closed offset-outline `THREE.Shape` (`ribbonShape`, centre-line
  ± `secH/2` via `offsetPt`), straight extrude by `secB`, `DoubleSide`, per-frame scaled by
  `frameScale(f)`, placed at `z = f * spacing`.
- Lights: hemisphere + ambient + key `DirectionalLight` (PCFSoftShadowMap, radius 4) + unshadowed
  fill. Tuned low-contrast: key 0.48, concrete `0xc6c2b8`, ground `0xa3a19a`.
- Section A–A drawn on a small inset `<canvas id="secCanvas">`.

### Geometry — Stage 1 (datum wall + rake)
- `buildFramePath(spanE, hLowE, hHigh, apexOffset, crownRisePct, rHaunch, rCrown, rakeLow,
  rakeHigh)` → `{path, apexH, eaveLow, eaveHigh, crown}`.
- **HIGH wall is the datum at x = 0**; LOW wall at x = +spanE.  The caller shrinks `spanE` and
  `hLowE` per bay (`bayShrink(f, n, taperPct, dir)`), high wall unchanged → wedge plan with the
  **high wall as the straight side**.
- Legs can **rake** (lean toward mid-span) by `rakeLow` / `rakeHigh` × wall height (sliders
  "Low/High wall rake", default 0).  A gap guard scales the rake back before the leaned eaves
  can cross the crown (tested clean to rake 55/35, span 12, radii 0).
- Rib-thickness offset (`ribbonShape`, ±half) is clamped near a strongly-raked tight knee so the
  offset can't fold (`half = min(secH/2, 0.8·max(rHaunch,rCrown,0.35))` when max rake > 0.15).
  This was the deformation the first rake attempt hit ("ปรับไปถึงจุดหนึ่งมันผิดรูป").
- Coarse polyline → `densify()` straight runs → ONE centripetal `CatmullRomCurve3`.
- Frame Profile defaults unchanged: span 25, low 4, high 10, crown offset 35 %, crown rise 10 %,
  haunch 1.5, crown 2.5, **rake 0/0** (so the default look is identical to before).

### Structural check
- `applied = gravMoment*0.5 + latMoment` vs `capacity`; status line shows Mu · Mn.
- Concrete: `capacity = secB * secH² * 500`.
- Steel I-beam: `steelCapacity()` — approx plastic section modulus
  `Zpl = b·tf·(h−tf) + tw·hw²/4` (`tf ≈ 0.10h`, `tw ≈ 0.06h`) × `Fy = 245 000 kN/m²`.
- For steel, `rHaunch` / `rCrown` are forced to 0 (sharp portal).

### Roof Layer — Stage 2 (`#roofLayer`: none / shells / full — OFF by default)
Everything below is **ONE piece each**, not per-bay:
- **wall → shell**: a single `ExtrudeGeometry` of the raked high-leg centre-line
  (`[base, highEave, wallTop]`, `ribbonShape ±0.26`), extruded straight the whole nave length +
  end pad.  `wallTop = offsetPt(topA, hClip, gap+0.05)` so it tucks up under the shell's high
  edge → clean junction.
- **roof shell**: `loftClosed` of the whole rib top (`ribTopResampled`, N = 96, crown pinned to
  the midpoint index so the two ends stay in correspondence) from the entrance rib to the
  chancel rib.  Clipped `hClip = 4` points in on the high side.  The roof's fall down the nave
  comes ENTIRELY from where the (shrinking) rib tops sit — **no roof-fall control**.
- **3 scoops**: fill the descending half (crown → low eave) in thirds; each is a
  `scoopWaveLoop` — blade underside on the shell, top rising to a tall upstand crest at the
  uphill (high) edge, dropping over the first 1/5 to a blade thickness, then tapering to a thin
  structural edge (`tMin`).  Lofted entrance → chancel.
- **3 clerestory panes** (`full` only): `paneLoop` rising vertically from each scoop's upstand
  crest, heights `glazBase · [1, 0.78, 0.58]` (shorter down the slope), lofted.
- `loftClosed` builds **indexed** geometry (shared verts) so `computeVertexNormals` shades the
  cross-section smoothly instead of faceting.

### Stage 2, third round — SVG shapes as templates (2026-09-03)
"Why doesn't it look like `riola-parts.html`?" → because the study rebuilt the scoops
parametrically (blobby) instead of using the drawn shapes.  Now:
- **Rib**: still parametric (tied to the SAFE/FAIL check).
- **wall→shell + roof-shell membrane**: still parametric (`ribbonShape` / `shellLoop` from the
  rib top) — the SVG wall template warped badly (nearest-foot instability), so it stays param.
- **3 scoops + 3 clerestory panes**: the *verbatim* `Untitled-1.svg` paths, sampled and
  **warped** onto the parametric rib top by `warpTemplate` — a point's x-fraction along the
  hand-traced SVG extrados (`SVG_ROOF`, 8 pts) picks the arc-param on the world roof; its
  height above that extrados becomes a vertical rise (× arc-length scale).  Stable, carries the
  drawn "breaking-wave" profile, follows the sliders + taper.
- Helpers added: `svgSample`, `polyLen`, `svgRoofPoly` (returns the hand-traced `SVG_ROOF`),
  `svgRoofYAt`, `atParam`, `warpTemplate`.
- `SVG_ROOF` was hand-traced because extracting the extrados from the closed `SVG_RIB` outline
  kept picking the wrong run.

Sixth round — one shared transform + rules:
- **All SVG roof elements go through ONE transform per rib** (`mkT`): decompose each point into
  (along, perp) vs the SVG roof chord, rescale ALONG by the roof-span ratio and PERP by the
  rib-height ratio (`apexH / 356`), re-compose in the world roof frame pinned at the high eave.
  → the scoops span the whole roof, keep heights proportional to the rib, and **all the drawn
  relationships hold** (scoop tail lands on the next glazing, etc.) because it's one transform.
- **Glazing is always world-vertical** — placed base + vertical rise (`hh` = transformed
  distance between the SVG glazing endpoints).
- **wall→shell is parametric** again: a straight band kept parallel to and hugging the rib's
  high leg (inner edge at `secH/2`), rising to scoop 1's glazing-base height.
- **scoop 3** = the SVG WAVE only (trimmed `d`); its structural leg is a separate **vertical
  post** from the wave's downhill tip straight down to the ground.
- `SVG_HIGH_EAVE` / `SVG_LOW_EAVE` are the roof-chord anchors; `SVG_RIB_H = 356` (SVG units).

Fifth round:
- **Glazing is always vertical** — the pane's base is placed with the scoop's transform, then
  it rises straight up in world +y (`hh = (yBot−yTop)·scale`).  The scoop follows.
- **wall→shell** placed by a 2-point map: SVG rib high foot (`SVG_HIGH_FOOT`) → parametric rib
  high base (0,0), and SVG rib high eave (`SVG_ROOF[0]`) → parametric `eaveHigh`.  So the SVG
  Layer-2 band lands in the same relation to the rib as in riola-parts — thin, up the leg, over
  the crown, tail rising toward scoop 1 (~3 m above the crown).  (The earlier hard-coded
  direction vector mis-rotated it and the tail flew off.)
- **scoop 3 leg** — the points past the SVG wave (`pts[i].y > 255`) are snapped to a single x
  (the wave/leg junction's placed x) → a vertical leg down to the ground (`clampY` keeps y ≥ 0).

Fourth round — match `riola-parts.html`:
- Scoops / wall / glazing are no longer *warped* point-by-point (that flattened them).  They
  are now **rigidly placed** (`placeTemplate`): flip y, uniform-scale by
  `0.032·(apexH/11)` m per SVG unit, rotate so the SVG roof direction lands on the local world
  roof slope, translate onto the roof at the template's along-roof position.  Keeps the drawn
  proportions exactly → same shape as riola-parts.  Still lofted entrance→chancel.
- **Roof-shell membrane removed** (riola-parts has none).
- **wall→shell** = the SVG Layer-2 band, foot pinned to the rib high base, rotated to the raked
  high-leg direction, straight-extruded.  It rises to ~3.5 m above the crown (riola-parts ≈ 3 m)
  — the earlier "thin band ending below the crown" was too short.
- **scoop 3** keeps its full SVG path (no y-filter) — its leg drops to the ground just outboard
  of the low wall (`clampY` keeps it ≥ 0).
- Default `apex` 68 (crown near the high wall — the SVG templates assume this).
- "Large end" select removed; **Nave taper** is signed −45…+45 (− → entrance, 0 → none,
  + → chancel).

Two bugs found after "ไฟล์พังกว่าเดิม":
- **Default `apex` (crown offset) was 35 %** → crown near the LOW wall, but the SVG roof
  templates assume the crown near the HIGH wall.  The x-fraction → arc-param mapping then
  straddled the crown and the scoops landed in the wall zone.  Default `apex` → **68** (range
  20–85, step 1); note updated ("Riola ≈ 70").
- **Template scale was the roof arc-length ratio (~0.066)** → ~2× too big → scoops / glazing
  blew up to 5–7 m.  Now `perpScale = 0.032 · (apexH / 11)` (≈ 0.03 m per SVG unit at an 11 m
  rib, matching riola-parts).

Still to polish: scoop wave reads a bit flat/angular vs the drawing; scoop 1 laps into the
wall→shell zone; scoops overshoot the low wall slightly; wall→shell crest a bit lumpy.

### Stage 2 fix pass (2026-09-03, second round)
Five things the user flagged as wrong ("scoop กระจก wall to shell ผนังเตี้ยผิด"), all fixed:
1. **Crown offset was measured from the wrong wall.**  Slider label says "% from the low wall";
   code measured from the high eave → scoops piled onto the short slope.  Now
   `crown.x = lowEave.x + apexOffset·(highEave.x − lowEave.x)`.
2. **Scoops now go on the LONGER roof half** (arc-length compare of the two sides of the
   pinned-midpoint crown), with a `crownAtStart` flag threaded through `scoopWaveLoop` /
   `paneLoop` so the crest + glazing sit on the crown-side edge either way.
3. **wall→shell is now ONE solid** whose centre-line is `[groundBase, …the no-scoop half of
   the rib top, …4 pts past the crown]` → it runs ground → raked leg → haunch → roof and
   overlaps the roof shell at the crown (no notch).
4. **Roof shell low edge**: inner offset tapers `gap → 0` over the last 5 points so it seats
   onto the low-wall head instead of floating.
5. Glazing pane thickness 0.06 → 0.09; heights `glazBase·[1, 0.78, 0.58]` indexed by distance
   from the crown.

### Still soft
- Scoop wave shoulder (crest → blade) is a bit blobby; the 3 scoop segments show a small step
  at their joins (that step is the intended staircase, but it reads rough).
- Glazing panes sit slightly proud of the scoop crests.
- Roof surface has mild lumpiness near the crown from the loft.

### Theme / a11y
- `:root` custom-property tokens mirroring `index.html` + `@media (prefers-color-scheme: dark)`.
  `applyPalette()` picks Three.js scene colours + `drawSection` text colours; re-runs on
  `matchMedia` change. NOT verifiable in the static file-preview pane (always light).
- Every `.field` `<label>` has `for=` matching its control id.

---

## Riola section drawing (`~/Desktop/Untitled-1.svg`) — agreed reading (now built, Stage 1+2)

Measured from the actual path coordinates.

| element | reading |
|---|---|
| **red outline** | the asymmetric concrete portal **rib** in section. Steep **tall raked leg** on the high side (~24° off vertical), near-vertical shorter leg on the low side (~6°), **smooth continuous wall→roof curve** (not a sharp knee), crown ~31 % from the high wall, long shallow roof on the low side. Band depth roughly constant. |
| **solid black band, left half** | the **high wall that rises up and continues into the vault shell** — i.e. wall and first shell are one element on the high/north side. |
| **3 black "breaking-wave" shapes** on the rib extrados | the **vault-shell scoops**, stepping DOWN from the crown along the long slope. Each = a short structural **upstand** at its uphill (crown-side) edge + a curved **blade** that arcs over and **tapers toward the downhill edge** — per concrete-shell logic, taper to a realistic minimum edge (~50–60 mm), NOT a knife edge. |
| **3 blue vertical lines** | the **glazed clerestory faces**, rising from each scoop's uphill edge, facing back over the high side, **decreasing in height down the slope** (≈ 1 : 0.8 : 0.65). |

User confirmations so far: 3 scoops over the full span · steps run transversely across each rib ·
glazed faces toward the high/crown side · scoops run continuously the full nave length on every
rib · densify-before-spline is the chosen fix for the sharp-portal case · downhill blade edge per
structural/material logic (min concrete edge, not a knife) · **build the red rib first**.

---

## Model decisions (from the long "คุยกัน" thread, all resolved)

- **High wall = datum**: same position / height / rake / haunch in every bay.  `span` moves the
  low wall; `taper` shrinks the low wall + crown per bay.  This is what makes wall→shell a
  single straight piece.
- **First rake attempt failed** because at a certain rake the offset outline folded — now fixed
  with the gap guard + the `half` clamp (see Stage 1 above).  Rake sliders default 0.
- **Traced target values** for a Riola-looking rib (dial these into the sliders): span ~18,
  low wall ~7, high wall ~11, high rake ~45 %, low rake ~8 %, crown offset ~68 %, crown rise
  ~2 %, haunch ~3.5, crown radius ~4.  (Not baked in as defaults — user reverted that once.)
- **Roof + 3 scoops + glazing = ONE lofted piece** (Q2 ข = loft to match the tapering ribs),
  covering the **whole rib top** (Q3 ข), with the 3-scoop staircase **in the cross-section**
  AND the fall along the nave (Q4 ก).  Fall is **not a control** — it follows the rib tops.

---

## Backlog / next

1. Stage 2 polish: roof piece overshoots the chancel rib; scoop wave shoulder is soft; small
   step where the 3 scoop segments join.
2. Dark-mode colours for `scoopMat` / `wallMat` (not yet in `applyPalette`).
3. Older: I-beam capacity is still a simplified section; dark mode needs a real-browser check.
