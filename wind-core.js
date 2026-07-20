(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WindCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Wind thresholds in knots per skill profile. First-guess values from the
  // spec — tune via CALIBRATION.md, keep them here and nowhere else.
  const PROFILES = {
    beginner:     { min: 12, idealLo: 15, idealHi: 20, upper: 25, cap: 28, label: 'Beginner' },
    intermediate: { min: 10, idealLo: 14, idealHi: 25, upper: 30, cap: 35, label: 'Intermediate' },
    advanced:     { min: 9,  idealLo: 12, idealHi: 30, upper: 35, cap: 40, label: 'Advanced' },
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function speedScore(kts, profile) {
    const p = profile;
    if (!Number.isFinite(kts) || kts < p.min || kts >= p.cap) return 0;
    if (kts < p.idealLo) return 2 + 3 * (kts - p.min) / (p.idealLo - p.min);
    if (kts <= p.idealHi) return 5;
    if (kts <= p.upper) return 5 - 2 * (kts - p.idealHi) / (p.upper - p.idealHi);
    return 3 - 3 * (kts - p.upper) / (p.cap - p.upper);
  }

  return { PROFILES, clamp, speedScore };
});
