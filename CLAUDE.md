# Gurnard Wing Check

Single-spot wing-foiling conditions app for Gurnard, IoW. Sibling of
~/Desktop/gurnard-beach-walk and ~/Desktop/iow-sea-swim — follow their patterns.

Rules:
- All scoring logic in wind-core.js (pure, UMD, unit-tested). app.js = fetch + render only.
- Tunable numbers live in spot.json or WindCore.PROFILES only. Log real sessions in CALIBRATION.md.
- Offshore bands are safety-capped; never weaken this without an explicit instruction.
- npm test && npm run check before every commit.

## Automatic Adversarial Code Review

After completing ANY coding task (building features, fixing bugs, refactoring),
you MUST run the adversarial review loop before reporting the task as done.

### The Loop

1. Finish implementing the task
2. Run: `bash scripts/codex-review.sh`
3. Read Codex's review output carefully
4. If verdict is FAIL:
   - Fix every CRITICAL and HIGH issue Codex raised
   - Run `bash scripts/codex-review.sh` again
   - Repeat until verdict is PASS
5. If verdict is PASS:
   - Report to the user: "Task complete. Passed adversarial review after N rounds."
   - Include a brief summary of what Codex caught and what you fixed

### Rules

- A task is NOT complete until Codex gives a PASS verdict
- Maximum 5 review rounds - if still failing after 5, stop and report unresolved issues
- Do NOT skip the review loop for "small changes" - run it every time
- Do NOT argue with Codex's findings - just fix them
- MEDIUM and LOW issues: fix if quick, otherwise note them but don't block on them
