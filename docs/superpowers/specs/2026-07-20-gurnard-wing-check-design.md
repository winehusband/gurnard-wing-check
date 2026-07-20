# Gurnard Wing Check — Design Spec

**Date:** 20 July 2026
**Status:** Approved design, pre-implementation
**Owner:** Hamish Nicklin

## Purpose

A single-spot decision app for wing foilers (and windsurfers) at Gurnard, Isle of Wight. Existing forecast apps (Windguru, Windfinder, Windy.app) show the raw numbers; this app answers the actual question: **"Given my skill level and this spot's tidal quirks, is it worth going out — and when?"**

The differentiator is encoded local knowledge: the Gurnard Bay ebb eddy, Gurnard Ledge, wind-against-tide chop in the western Solent, and direction quality relative to the beach. This is the knowledge the Gurnard WhatsApp group carries in its heads, written down as rules.

**Audience:** Hamish and the Gurnard wing foiling / windsurfing WhatsApp group. Shared as a URL dropped in the group chat. If it proves popular, multi-spot support may come later — explicitly out of scope for v1.

## Stack and precedent

Third sibling to `gurnard-beach-walk` and `iow-sea-swim`. Same pattern throughout:

- **Vanilla HTML/CSS/JS progressive web app** — no framework, no build step. `index.html`, `app.js`, `styles.css`, `manifest.json`, icons, `feedback.html`.
- **`wind-core.js`** — pure scoring module, no DOM, no fetch. All the maths and rules live here so they are unit-testable.
- **`spot.json`** — Gurnard's static configuration (coordinates, beach orientation, direction bands, tide station, thresholds). Single spot in v1, but keeping config out of code makes a future second spot cheap.
- **Supabase edge functions** in the existing project (`gsucaxeqzluzbmvonsmj`) for anything needing a key or CORS help.
- **Tests:** `node --test` for `wind-core.js`; Playwright for one happy-path e2e.
- **Hosting:** GitHub repo (`winehusband/gurnard-wing-check`) with the same static hosting approach as the sibling apps.
- **`CALIBRATION.md`** — real-session log used to tune the model (see Calibration).

## Data sources

| Source | What | How |
|---|---|---|
| Open-Meteo forecast API | Hourly wind speed, gusts, direction; sunrise/sunset — 7 days | Direct from client, free, no key |
| Admiralty tidal API | Tide events (HW/LW times and heights) for Cowes, station `0060` | **Reuse the existing `tide-proxy` edge function unchanged** — it already serves station 0060 |
| Bramblemet buoy (mid-Solent) | Live wind speed, gust, direction — ground truth | New small edge function `bramble-proxy` in the same Supabase project, caching ~5 min |

Failure handling: each source degrades independently. No Bramblemet → hide the live card. No tide data → score on wind alone and say so ("tide data unavailable — chop and eddy rules not applied"). No forecast → show an error state, never a stale silent page.

## Scoring model (`wind-core.js`)

For each hour of the next 7 days, produce a 0–5 score plus a list of human-readable reason strings. The reasons are first-class output, not debug info — every score can be tapped to show *why*.

### 1. Wind speed vs skill threshold

Three profiles (toggle in UI, saved to `localStorage`, default Intermediate):

| Profile | Min rideable | Ideal band | Upper comfort | Hard cap |
|---|---|---|---|---|
| Beginner | 12 kts | 15–20 kts | 25 kts | score 0 above 28 |
| Intermediate | 10 kts | 14–25 kts | 30 kts | score 0 above 35 |
| Advanced | 9 kts | 12–30 kts | 35 kts | score 0 above 40 |

Score ramps up from min to ideal, plateaus, then ramps down to the cap. All values are starting points to be tuned via calibration.

### 2. Gust spread penalty

Gustiness factor = gust / mean. Penalty starts at factor 1.4, scales up to a severe penalty at 1.8+. Steady 20 kts beats 18 gusting 30.

### 3. Direction quality (Gurnard-specific)

Initial bands, **to be sanity-checked with the WhatsApp group during calibration** (Gurnard's shoreline runs roughly SW–NE, facing NW across the western Solent):

| Wind from | Band | Treatment |
|---|---|---|
| 210–260° (SW–WSW) | Cross-shore | Prime — no penalty, "the good stuff" |
| 260–330° (W–NW) | Cross-on / onshore | Good, mild chop note |
| 330–050° (N–NE) | Onshore from the east | Rideable, choppy — small penalty |
| 130–210° (S–SSW) | Offshore | **Score capped at 2, safety warning, never a green window** |
| 050–130° (E–SE) | Cross-off / offshore-ish | Caution — capped at 3 with warning |

Offshore rules are safety-first by design: the app must never show a green window for offshore wind, regardless of speed, and always attaches "offshore — don't go out alone".

### 4. Tide layer

From tide-proxy events, compute per hour: state (ebb/flood), hours to next HW/LW, and springs/neaps coefficient from the tidal range.

- **Wind-against-tide chop penalty.** Off Gurnard the flood sets roughly ENE, the ebb roughly WSW. When the wind vector opposes the stream vector by more than ~120°, apply a chop penalty scaled by wind speed and the springs coefficient (springs = stronger stream = worse chop).
- **Ebb eddy note.** During the main ebb, an eddy/slack forms in Gurnard Bay. Surfaced as an informational bonus note ("ebb eddy in the bay — flatter water inshore"), not a score change in v1.
- **Gurnard Ledge warning.** Near low water on springs, attach "Gurnard Ledge shallow — watch your foil west of the bay".

### 5. Daylight

No green windows outside civil daylight. Scores fade to 0 at dusk.

### Output shape

`scoreHour(forecastHour, tideContext, profile, spotConfig) → { score: 0–5, reasons: string[], flags: { offshore, chop, eddy, ledge } }` — pure function, fully unit-tested against fixture days (steady SW flood afternoon = high; gusty SE morning = capped with warning; etc.).

## Live layer

A "right now" card: Bramblemet's current wind ("Live at Bramble: 16 kts gusting 21, SW") next to the forecast for the current hour. If live differs from forecast by more than ~30%, show a drift flag ("blowing harder than forecast — trust your eyes"). Bramble is mid-Solent so typically reads a little higher than the beach; noted in the UI copy.

## UI

Single page, mobile-first, matching the sibling apps' look and feel:

1. **Verdict card** — today's headline: "4/10 now — turning on around 3pm as the flood starts", plus the live Bramble reading.
2. **7-day strip** — hourly coloured windows (red/amber/green by score) per day, daylight hours only. Tap any hour for the reasons list.
3. **Skill toggle** — Beginner / Intermediate / Advanced segmented control, persisted in `localStorage`. No accounts.
4. **Footer** — safety disclaimer (below), feedback link, data source credits.

**Safety framing (non-negotiable):** persistent disclaimer — "This is a planning aid, not a safety forecast. Check conditions with your own eyes, tell someone you're going out, and never ride offshore winds alone."

## Out of scope for v1

- Multiple spots (config is spot-shaped, but UI and data are Gurnard-only)
- User accounts, kit/quiver profiles
- WhatsApp bot or notifications (natural v2: the bot posts the verdict card's summary each morning)
- Wave/swell data (the Solent is fetch-limited; chop is modelled via wind-against-tide instead)
- Session logging in-app (calibration is via `CALIBRATION.md` for now)

## Calibration

`CALIBRATION.md` in the repo, same method as gurnard-beach-walk: log real sessions (date, time, app score, actual experience, notes), then tune thresholds, direction bands, and chop penalties against reality. The WhatsApp group is the calibration panel — their "actually it was epic/awful" messages are the training data. Direction bands and tide-stream assumptions above are explicitly marked as first-guess values.

## Testing

- Unit tests (`node --test`): scoring curves per profile, gust penalty, direction bands including offshore caps, wind-against-tide geometry, daylight cut-off, degraded-data modes.
- Playwright e2e: page loads with mocked API responses, verdict renders, skill toggle changes scores, offshore hour shows warning.
