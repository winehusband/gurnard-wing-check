# Gurnard Wing Check — Calibration Log

Log real sessions here; tune spot.json bands and WindCore.PROFILES against them.
Direction bands and tide-stream bearings (floodSetsDeg 70 / ebbSetsDeg 250) are
FIRST GUESSES — Hamish to verify bands on the beach with a phone compass.

## Real-World Sessions

| Date | Time | Profile | App score | Actual (0-5) | Notes (wind felt, chop, tide state) |
|------|------|---------|-----------|--------------|-------------------------------------|
|      |      |         |           |              |                                     |

## Values Under Review

- Wind thresholds per profile (wind-core.js PROFILES)
- Direction band edges + penalties/caps (spot.json)
- Chop: opposition angle 120°, penalty 0.4–1.0 (wind-core.js chopPenalty)
- Springs range normalisation: 1.8m neaps → 3.6m springs (wind-core.js)
- Ledge warning: height < 1.2m and springsCoeff > 0.6
- Live wind source: Bramblemet CSV feed is dead (bramble-proxy 502s, live card hidden); candidate replacement = weatherfile.com stations via NCI Solent observations
