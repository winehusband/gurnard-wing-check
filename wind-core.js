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

  function bracketEvents(parsed, ms) {
    let prev = null;
    let next = null;
    for (const e of parsed) {
      if (e.ms <= ms) prev = e;
      else { next = e; break; }
    }
    return { prev, next };
  }

  // streamLeadHours: Solent streams turn ~1.25h before local HW at Gurnard
  // (Humphrey calibration, 20 Jul 2026) — the stream STATE is looked up ahead
  // of `when`, while height/range/springsCoeff stay anchored to `when` itself.
  function tideContext(events, when, streamLeadHours) {
    if (!Array.isArray(events)) return null;
    const lead = streamLeadHours || 0;
    const ms = when.getTime();
    const parsed = events
      .map((e) => ({
        kind: /low/i.test(String(e.EventType)) ? 'low' : 'high',
        ms: parseEventMs(e.DateTime),
        height: Number(e.Height),
      }))
      .filter((e) => Number.isFinite(e.ms) && Number.isFinite(e.height))
      .sort((a, b) => a.ms - b.ms);

    const { prev, next } = bracketEvents(parsed, ms);
    if (!prev || !next) return null;

    const frac = (ms - prev.ms) / (next.ms - prev.ms);
    // Sinusoidal interpolation — tides are not linear between events.
    const height = prev.height + (next.height - prev.height) * (1 - Math.cos(Math.PI * frac)) / 2;
    const range = Math.abs(next.height - prev.height);

    let state = next.kind === 'high' ? 'flood' : 'ebb';
    if (lead) {
      const shifted = bracketEvents(parsed, ms + lead * 3600000);
      if (shifted.prev && shifted.next) {
        state = shifted.next.kind === 'high' ? 'flood' : 'ebb';
      }
    }

    return {
      state,
      height,
      range,
      springsCoeff: clamp((range - NEAP_RANGE) / (SPRING_RANGE - NEAP_RANGE), 0, 1),
      hoursToNext: (next.ms - ms) / 3600000,
      nextKind: next.kind,
    };
  }

  // Same geometry as the old chop model, but the interaction it detects is
  // now scored as a bonus, not a penalty — see tideBonus below.
  function windAgainstTide(windFromDeg, tide, spot) {
    if (!tide || !Number.isFinite(windFromDeg)) return false;
    const set = tide.state === 'flood' ? spot.floodSetsDeg : spot.ebbSetsDeg;
    const windToward = (windFromDeg + 180) % 360;
    return angDiff(windToward, set) > 120;
  }

  // Water flowing into the wind raises apparent wind over the water — the
  // local optimum for wing foiling, not a penalty (Humphrey calibration, 20 Jul 2026).
  function tideBonus(windFromDeg, windKts, tide, spot) {
    if (!windAgainstTide(windFromDeg, tide, spot)) return 0;
    return (0.3 + 0.7 * tide.springsCoeff) * clamp(windKts / 15, 0, 1);
  }

  // Below this height on a big spring ebb, Gurnard Ledge is a foil-eater.
  const LEDGE_HEIGHT_M = 1.2;
  const LEDGE_SPRINGS_COEFF = 0.6;

  function scoreHour(hour, tide, profileKey, spot) {
    const profile = PROFILES[profileKey] || PROFILES.intermediate;
    const reasons = [];
    const flags = { offshore: false, windAgainstTide: false, eddy: false, ledge: false };

    let score = speedScore(hour.meanKts, profile);
    if (score === 0 && Number.isFinite(hour.meanKts)) {
      reasons.push(hour.meanKts < profile.min
        ? `Too light for ${profile.label.toLowerCase()} (${Math.round(hour.meanKts)} kts)`
        : `Too strong for ${profile.label.toLowerCase()} (${Math.round(hour.meanKts)} kts)`);
    }

    const gp = gustPenalty(hour.meanKts, hour.gustKts);
    if (gp > 0.3) reasons.push(`Gusty — ${Math.round(hour.meanKts)} kts gusting ${Math.round(hour.gustKts)}`);
    score -= gp;

    const band = directionBand(hour.dirDeg, spot.bands);
    if (band) {
      score -= band.penalty || 0;
      if (band.offshore) flags.offshore = true;
      if (band.note) reasons.push(band.note);
      score = Math.min(score, band.cap);
    }

    const bonus = tideBonus(hour.dirDeg, hour.meanKts, tide, spot);
    if (bonus > 0.15) {
      flags.windAgainstTide = true;
      reasons.push('Wind against tide — apparent wind boost (expect some chop)');
      score += bonus;
      // Safety invariant: the bonus must never let an offshore band exceed
      // its cap — re-apply the band cap after adding the bonus.
      if (band) score = Math.min(score, band.cap);
    }

    if (tide && tide.state === 'ebb') {
      flags.eddy = true;
      reasons.push('Ebb eddy in the bay — flatter water inshore');
    }
    if (tide && tide.height < LEDGE_HEIGHT_M && tide.springsCoeff > LEDGE_SPRINGS_COEFF) {
      flags.ledge = true;
      reasons.push('Gurnard Ledge shallow — watch your foil west of the bay');
    }

    if (!hour.daylight) {
      score = 0;
      reasons.push('After dark');
    }

    return { score: clamp(score, 0, 5), reasons, flags };
  }

  // Pure — finds maximal runs of consecutive hourly entries that are all
  // opposed (wind-against-tide) in daylight at or above minKts, and returns
  // the ones at least minHours long. entries are in hourly order.
  function goldenWindows(entries, opts) {
    const minKts = opts.minKts;
    const minHours = opts.minHours;
    const windows = [];
    let start = null;
    for (let i = 0; i <= entries.length; i++) {
      const e = entries[i];
      const qualifies = !!e && e.opposed && e.daylight &&
        Number.isFinite(e.meanKts) && e.meanKts >= minKts;
      if (qualifies) {
        if (start === null) start = i;
      } else if (start !== null) {
        const endIdx = i - 1;
        if (endIdx - start + 1 >= minHours) windows.push({ startIdx: start, endIdx });
        start = null;
      }
    }
    return windows;
  }

  return {
    PROFILES, clamp, speedScore, gustPenalty, angDiff, inBand, directionBand,
    parseEventMs, tideContext, windAgainstTide, tideBonus, scoreHour, goldenWindows,
  };
});
