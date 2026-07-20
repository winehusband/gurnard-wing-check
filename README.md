# Gurnard Wing Check

Should you go out? Hourly wing-foiling windows (0–5) for Gurnard, Isle of Wight,
scored from Open-Meteo wind, Admiralty tide (Cowes 0060, via Supabase tide-proxy),
Bramblemet live wind, and hard-coded local knowledge: the Gurnard Bay ebb eddy,
Gurnard Ledge, wind-against-tide chop, and offshore safety caps.

Skill toggle (Beginner / Intermediate / Advanced) shifts wind thresholds; saved in
localStorage. No accounts.

This is a planning aid, not a safety forecast. Offshore winds are never shown green.

- Spec: docs/superpowers/specs/2026-07-20-gurnard-wing-check-design.md
- Tuning log: CALIBRATION.md
- Tests: `npm test` (core), `npm run test:e2e` (Playwright)
- Siblings: gurnard-beach-walk, iow-sea-swim (same stack and conventions)
