# Gurnard Wing Check — Calibration Log

Log real sessions here; tune spot.json bands and WindCore.PROFILES against them.
Direction bands and tide-stream bearings (floodSetsDeg 70 / ebbSetsDeg 250) are
FIRST GUESSES — Hamish to verify bands on the beach with a phone compass.

## Real-World Sessions

| Date | Time | Profile | App score | Actual (0-5) | Notes (wind felt, chop, tide state) |
|------|------|---------|-----------|--------------|-------------------------------------|
|      |      |         |           |              |                                     |

## Local Knowledge Received

### 20 Jul 2026 — Humphrey Carter (WhatsApp, via Hamish)

> [13:38] Basically for optimum wing foil at gurnard, the window of tide against wind for a minimum of three hours and I guess with +15 kn is acceptable.
> [13:40] Wind angle SSW-WNW will work from 1 - 1.5hrs before high water

Model implications (applied 20 Jul 2026):
1. **v1 had the tide-interaction sign WRONG for wing foiling.** Wind against tide was coded as a chop penalty (sailing instinct). For foilers it is the optimum — water flowing into the wind raises apparent wind over the water. Flipped to a bonus.
2. **Stream turns before the height curve.** "From 1–1.5 hrs before high water" + "SSW–WNW works" implies the ebb stream (setting ~250°) is already running ~1.25h before local HW — classic Solent stream/height decoupling. Added `streamLeadHours` to spot.json.
3. **SSW is rideable, not offshore.** v1 capped 200° (SSW) at 2 as offshore. Prime band widened to 200–290° (SSW–WNW); offshore cap now starts below 200°.
4. **"Golden window" concept:** ≥3 consecutive daylight hours of wind-against-tide at ≥15 kn. Now detected and surfaced in the verdict.

## Values Under Review

- Wind thresholds per profile (wind-core.js PROFILES)
- Direction band edges + penalties/caps (spot.json)
- Chop: opposition angle 120°, penalty 0.4–1.0 (wind-core.js chopPenalty)
- Springs range normalisation: 1.8m neaps → 3.6m springs (wind-core.js)
- Ledge warning: height < 1.2m and springsCoeff > 0.6
- Live wind source: Bramblemet CSV feed is dead (bramble-proxy 502s, live card hidden); candidate replacement = weatherfile.com stations via NCI Solent observations
