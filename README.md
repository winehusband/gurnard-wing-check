# Gurnard Wing Check

Should you go out? Hourly wing-foiling windows (0–5) for Gurnard, Isle of Wight,
scored from Open-Meteo wind, Admiralty tide (Cowes 0060, via Supabase tide-proxy),
Bramblemet live wind, and hard-coded local knowledge: the Gurnard Bay ebb eddy,
Gurnard Ledge, wind-against-tide bonus, and offshore safety caps.

Wind-against-tide is scored as a bonus, not a penalty (Humphrey calibration, 20 Jul
2026) — water flowing into the wind raises apparent wind over the water. The
tidal stream is assumed to turn 1.25h before local HW at Gurnard, so stream state
is looked up ahead of the height/range calculation. The prime direction band is
SSW–WNW. Hours in a run of 3+ consecutive daylight hours at 15+ kn wind-against-tide
are marked as a "golden window" (gold ring on the hour strip, called out in the
verdict when one falls later today).

Skill toggle (Beginner / Intermediate / Advanced) shifts wind thresholds; saved in
localStorage. No accounts.

This is a planning aid, not a safety forecast. Offshore winds are never shown green.

- Spec: docs/superpowers/specs/2026-07-20-gurnard-wing-check-design.md
- Tuning log: CALIBRATION.md
- Tests: `npm test` (core), `npm run test:e2e` (Playwright)
- Siblings: gurnard-beach-walk, iow-sea-swim (same stack and conventions)
