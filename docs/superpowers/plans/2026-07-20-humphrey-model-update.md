# Humphrey Model Update — Implementation Plan

> **For agentic workers:** executed via subagent-driven development; two tasks, review after each. Source intel: CALIBRATION.md "Local Knowledge Received" (Humphrey Carter, 20 Jul 2026).

**Goal:** Flip the tide-interaction term from chop-penalty to apparent-wind bonus, model the Solent stream turning before the height curve, widen the prime direction band to SSW–WNW, and surface "golden windows" (≥3h wind-against-tide at ≥15 kn).

**Non-negotiable safety invariant (unchanged):** offshore bands can never render green. The new bonus is added AFTER the band cap, so the cap MUST be re-applied after the bonus (`score = Math.min(score, band.cap)` again). A unit test must prove bonus cannot breach an offshore cap.

## Global Constraints

- Repo: /Users/hamishnicklin/Desktop/gurnard-wing-check, branch main. Existing conventions bind (UMD, node --test, tunables in spot.json/PROFILES only, British English, no console.log).
- All new tunables live in spot.json: `streamLeadHours: 1.25`, `goldenWindow: { minKts: 15, minHours: 3 }`.
- Full gate before each commit: `npm run check && npm test` (Task A), plus `npm run test:e2e` (Task B).

---

### Task A: wind-core model changes + spot.json + unit tests

**Files:** Modify `wind-core.js`, `spot.json`, `tests/core.test.js`, `tests/spot.test.js`.

**spot.json changes:**
- Bands become (full 360° coverage, update the spot.test.js band-count/offshore-caps assertions to match):
  - `{ "name": "Prime SSW–WNW", "from": 200, "to": 290, "penalty": 0, "cap": 5, "offshore": false, "note": "Prime — SSW–WNW cross-shore, the good stuff" }`
  - `{ "name": "Cross-on WNW–NNW", "from": 290, "to": 330, "penalty": 0.3, "cap": 5, "offshore": false, "note": "Good — a little chop rolling in" }`
  - `{ "name": "Onshore N–NE", "from": 330, "to": 50, "penalty": 0.7, "cap": 4.5, "offshore": false, "note": "Rideable but choppy onshore" }`
  - `{ "name": "Cross-off E–SE", "from": 50, "to": 130, "penalty": 0.5, "cap": 3, "offshore": true, "note": "Cross-off — caution, drift risk, don't go alone" }`
  - `{ "name": "Offshore S", "from": 130, "to": 200, "penalty": 0, "cap": 2, "offshore": true, "note": "Offshore — never ride this alone" }`
- Add `"streamLeadHours": 1.25` and `"goldenWindow": { "minKts": 15, "minHours": 3 }`.

**wind-core.js changes:**
1. `tideContext(events, when, streamLeadHours)` — third optional param, default 0. Height, range, springsCoeff, hoursToNext, nextKind computed at `when` exactly as now. `state` (the STREAM state, used for stream set direction and the eddy flag) computed by running the same prev/next selection at `when + streamLeadHours * 3600000`; if that shifted lookup has no bracketing events, fall back to the unshifted state. Rationale in a 2-line comment: Solent streams turn ~1.25h before local HW at Gurnard (Humphrey calibration, 20 Jul 2026).
2. Delete `chopPenalty`. Add:
   - `windAgainstTide(windFromDeg, tide, spot) → boolean` — same geometry as before: stream set = floodSetsDeg (flood) / ebbSetsDeg (ebb); opposed when `angDiff((windFromDeg + 180) % 360, set) > 120`. False for null tide / non-finite windFromDeg.
   - `tideBonus(windFromDeg, windKts, tide, spot) → number` — 0 unless `windAgainstTide(...)`; else `(0.3 + 0.7 * tide.springsCoeff) * clamp(windKts / 15, 0, 1)` (max 1.0). Comment: water flowing into wind raises apparent wind; the local optimum (Humphrey).
3. `scoreHour`: replace the chop block. After the band block (penalty + first cap), compute `const bonus = tideBonus(...)`; if bonus > 0.15: `flags.windAgainstTide = true`, reason `'Wind against tide — apparent wind boost (expect some chop)'`, `score += bonus`, then **re-apply `if (band) score = Math.min(score, band.cap)`**. Flags object becomes `{ offshore, windAgainstTide, eddy, ledge }` (chop removed). Eddy/ledge/daylight blocks unchanged.
4. Add `goldenWindows(entries, opts)` — pure. `entries`: array of `{ meanKts, opposed, daylight }` in hourly order; `opts`: `{ minKts, minHours }`. Returns array of `{ startIdx, endIdx }` (inclusive) for each maximal run of consecutive entries with `opposed && daylight && meanKts >= minKts` whose length ≥ minHours. Export it.

**Test changes (tests/core.test.js):** delete the two chopPenalty tests; update scoreHour tests where flags.chop was asserted. Add:
- `windAgainstTide`: SW wind (225) on flood → false; on ebb → true; null tide → false.
- `tideBonus`: 0 on flood for SW; on ebb springs at 18 kts → 1.0 (clamped); scales down at neaps and light wind; 0 for null tide.
- `tideContext` stream lead: events HW 12:00 h4.0 / LW 18:00 h0.8 / HW 24:20 h4.1 (build with any dates); at 11:00 with lead 1.25 → `state === 'ebb'` (stream already turned) while at 11:00 with lead 0 → `'flood'`; height at 11:00 identical in both calls (height unaffected by lead).
- Band edges: `directionBand(205, bands).name === 'Prime SSW–WNW'`; `directionBand(195, bands).cap === 2`; `directionBand(230, ...)` prime; 360° single-coverage still holds (spot.test.js loop already proves; update its band-count to 5 — unchanged — and offshore caps still [2,3]).
- SAFETY: scoreHour with dir 170 (offshore), 18 kts steady, ebb springs tide (max bonus conditions) → score ≤ 2 and flags.offshore true. Same for dir 90 → ≤ 3.
- `goldenWindows`: 5-hour opposed run at 16 kts daylight → one window; run broken by one non-opposed hour into 2h+2h → no windows; 3h at 14 kts → no window; opts respected.
- scoreHour: SW 18 kts on ebb springs in daylight (prime band, bonus) → score 5 (bonus capped by band cap 5 from base 5) and flags.windAgainstTide true.

Commit: `feat: Humphrey model — wind-against-tide bonus, stream lead, SSW prime band, golden windows` + Co-Authored-By trailer.

---

### Task B: app.js + styles + e2e + docs

**Files:** Modify `app.js`, `styles.css`, `tests/e2e/wing-check.spec.js`, `README.md`, `index.html` (one line, see below).

**app.js:**
1. `buildScoredHours`: call `WindCore.tideContext(tideEvents, time, spot.streamLeadHours || 0)`. NaN-guard's zero result flags become `{ offshore: false, windAgainstTide: false, eddy: false, ledge: false }`.
2. After scoring, compute `const windows = WindCore.goldenWindows(hours.map(e => ({ meanKts: e.hour.meanKts, opposed: e.result.flags.windAgainstTide, daylight: e.hour.daylight })), spot.goldenWindow || { minKts: 15, minHours: 3 })`. Mark each entry in a window with `e.golden = true`.
3. `scoreClass`: append ` golden` → cell class when `entry.golden` (visual ring only; colour classes unchanged).
4. `renderVerdict`: if any golden window includes hours later today, append e.g. ` Golden window ${fmtTime(first.time)}–${fmtTime(last.time)}: wind against tide, ${spot.goldenWindow.minKts}+ kts.` (today = same calendar date as now; first window only).
5. Reasons modal needs no change (reasons come from core).

**styles.css** append: `.hour-cell.golden { outline: 2px solid #ffd700; outline-offset: -2px; }`

**index.html:** in the "Next 7 days" card, change the helper line to `<p class="day-label">Daylight hours only. Tap an hour for the why. Gold ring = wind-against-tide window.</p>`

**e2e (tests/e2e/wing-check.spec.js):** existing fixtures: dir 230 / 13 kts — now prime band AND opposed on the fixture's ebb, bonus ≈ +0.73, so beginner toggle test still sees a score change (9→8 out of 10 region); verify the four tests still pass unmodified first, adjust assertions only if a hard-coded text broke. Add one test: golden-window fixture — override Open-Meteo route with wind 16 kts / gusts 18 / dir 230 all day; tide fixture as-is (ebb "now"); assert at least one `.hour-cell.golden` exists and `#verdictText` contains /golden window/i. (Stream lead means "state" uses +1.25h — with LW ~4h away the shifted state is still ebb, opposed holds.)

**README.md:** update the scoring bullet list: wind-against-tide is a bonus (Humphrey calibration), stream lead 1.25h, golden windows ≥3h ≥15 kn, prime band SSW–WNW. One short paragraph, no essay.

Full gate: `npm run check && npm test && npm run test:e2e`. Commit: `feat: golden windows in UI; stream-lead wired; docs updated for Humphrey model` + trailer. Push.
