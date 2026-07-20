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

  function gustPenalty(meanKts, gustKts) {
    if (!Number.isFinite(meanKts) || !Number.isFinite(gustKts) || meanKts <= 0) return 0;
    const factor = gustKts / meanKts;
    if (factor <= 1.4) return 0;
    return clamp(2 * (factor - 1.4) / 0.4, 0, 2);
  }

  function angDiff(a, b) {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  function inBand(deg, band) {
    const d = ((deg % 360) + 360) % 360;
    return band.from <= band.to
      ? d >= band.from && d < band.to
      : d >= band.from || d < band.to;
  }

  function directionBand(deg, bands) {
    if (!Number.isFinite(deg) || !Array.isArray(bands)) return null;
    return bands.find((b) => inBand(deg, b)) || null;
  }

  return { PROFILES, clamp, speedScore, gustPenalty, angDiff, inBand, directionBand };
});
