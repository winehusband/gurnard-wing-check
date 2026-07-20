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

  function parseEventMs(dateTime) {
    if (!dateTime) return NaN;
    return /[Zz]$|[+-]\d{2}:\d{2}$/.test(dateTime)
      ? new Date(dateTime).getTime()
      : new Date(dateTime + 'Z').getTime();
  }

  // Cowes tidal range runs ~1.8m (dead neaps) to ~3.6m (big springs).
  const NEAP_RANGE = 1.8;
  const SPRING_RANGE = 3.6;

  function tideContext(events, when) {
    if (!Array.isArray(events)) return null;
    const ms = when.getTime();
    const parsed = events
      .map((e) => ({
        kind: /low/i.test(String(e.EventType)) ? 'low' : 'high',
        ms: parseEventMs(e.DateTime),
        height: Number(e.Height),
      }))
      .filter((e) => Number.isFinite(e.ms) && Number.isFinite(e.height))
      .sort((a, b) => a.ms - b.ms);

    let prev = null;
    let next = null;
    for (const e of parsed) {
      if (e.ms <= ms) prev = e;
      else { next = e; break; }
    }
    if (!prev || !next) return null;

    const frac = (ms - prev.ms) / (next.ms - prev.ms);
    // Sinusoidal interpolation — tides are not linear between events.
    const height = prev.height + (next.height - prev.height) * (1 - Math.cos(Math.PI * frac)) / 2;
    const range = Math.abs(next.height - prev.height);
    return {
      state: next.kind === 'high' ? 'flood' : 'ebb',
      height,
      range,
      springsCoeff: clamp((range - NEAP_RANGE) / (SPRING_RANGE - NEAP_RANGE), 0, 1),
      hoursToNext: (next.ms - ms) / 3600000,
      nextKind: next.kind,
    };
  }

  function chopPenalty(windFromDeg, windKts, tide, spot) {
    if (!tide || !Number.isFinite(windFromDeg)) return 0;
    const set = tide.state === 'flood' ? spot.floodSetsDeg : spot.ebbSetsDeg;
    const windToward = (windFromDeg + 180) % 360;
    if (angDiff(windToward, set) <= 120) return 0;
    return (0.4 + 0.6 * tide.springsCoeff) * clamp(windKts / 20, 0, 1);
  }

  return { PROFILES, clamp, speedScore, gustPenalty, angDiff, inBand, directionBand, parseEventMs, tideContext, chopPenalty };
});
