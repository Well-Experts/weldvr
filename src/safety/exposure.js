// Exposure models behind the safety consequences.
//
// Actinic UV (cornea and skin): AWS Safety & Health Fact Sheet No. 26 "Arc Viewing Distance" (11/2024),
// Table 1: distances at which actinic UV falls below the US daily TLV after 1 min, 10 min and 8 h of
// exposure (worst-case angle, arc gap and electrode; data of Lyon et al. 1976). The three distances of
// each row grow with the square root of the time (inverse-square law; checked in the unit tests), so the
// dose rate at distance d is (d1/d)^2 / 60 s of the daily limit, d1 = the 1-min distance. FS 26: the
// exposure is cumulative over the workday ("two 5-min exposures ... a single 10-min exposure").
//
// Contact burns from hot metal:
//   - CENELEC Guide 29 (2007, EN ISO 13732-1 data), Table A.1, burn threshold for uncoated metal
//     (boundary between no burn and a superficial partial-thickness burn): 51 C for 1 min, 48 C for
//     10 min, 43 C for 8 h. Values for contacts under 10 s are only given as graphs.
//   - Moritz and Henriques (1947), as tabulated in CMAJ 1997;156:841: time to a deep second-degree burn
//     in hot water, 44 C 6 h ... 70 C 1 s. Metal conducts heat into the skin at least as well.
//   - CENELEC Guide 29 6.1.1: 0.5 s to 1 s is the minimum contact (reaction) time of an adult; ASTM
//     C1055-03 (as cited by Exponent 2010): above 70 C the rate of injury from a high-capacity surface
//     exceeds the body reaction time. So bare-skin contact with metal at 70 C or more is a burn.
//
// Fume: HSE WL3 (04/2021): "Position movable hoods within one hood diameter of the welding point to
// collect fume effectively otherwise they will not capture the welding fume."

// ---- actinic UV --------------------------------------------------------------------------------
// [process, base metal, shielding gas, current (A) or [lo, hi], d 1 min, d 10 min, d 8 h] (m)
export const FS26 = [
  ['SMAW', 'mild steel', 'none', [100, 200], 3.2, 10, 71],
  ['GMAW', 'mild steel', 'CO2', 90, 0.95, 3.0, 21],
  ['GMAW', 'mild steel', 'CO2', 200, 2.2, 7.0, 48],
  ['GMAW', 'mild steel', 'CO2', 350, 4.0, 13, 87],
  ['GMAW', 'mild steel', 'CO2', 175, 1.1, 3.6, 25],
  ['GMAW', 'mild steel', 'CO2', 350, 2.3, 7.3, 51],
  ['GMAW', 'mild steel', '95% Ar + 5% O2', 150, 2.9, 9.3, 65],
  ['GMAW', 'mild steel', '95% Ar + 5% O2', 350, 6.7, 21, 150],
  ['GTAW', 'mild steel', 'Ar', 50, 0.32, 1.0, 6.9],
  ['GTAW', 'mild steel', 'Ar', 150, 0.90, 2.8, 20],
  ['GTAW', 'mild steel', 'Ar', 300, 1.7, 5.5, 38],
  ['GTAW', 'mild steel', 'He', 250, 3.0, 9.5, 66],
];

// The FS 26 rows used for a simulator process. Ar-rich mixtures (process 135/136 with Ar + 18% CO2)
// have no row of their own: the Ar-rich row (95% Ar + 5% O2) is used and the result says so.
// Self-shielded FCAW (114) has no row: the SMAW row (no shielding gas) is used and flagged.
export function uvRows(process) {
  if (process === '111') return { rows: FS26.filter((r) => r[0] === 'SMAW'), exact: true, basis: 'SMAW, mild steel, 100–200 A' };
  if (process === '141') return { rows: FS26.filter((r) => r[0] === 'GTAW' && r[2] === 'Ar'), exact: true, basis: 'GTAW, mild steel, argon' };
  if (process === '135' || process === '136') return { rows: FS26.filter((r) => r[0] === 'GMAW' && r[2] === '95% Ar + 5% O2'), exact: false, basis: 'GMAW, mild steel, 95% Ar + 5% O2 (nearest tabulated Ar-rich gas)' };
  if (process === '114') return { rows: FS26.filter((r) => r[0] === 'SMAW'), exact: false, basis: 'SMAW row used: FS 26 has no self-shielded FCAW row' };
  return null;
}

// 1-minute distance (m) at a current: log-linear interpolation between the rows of one gas; outside
// the tabulated currents the nearest row is used (no extrapolation).
export function d1At(process, current) {
  const u = uvRows(process);
  if (!u) return null;
  const pts = u.rows.map((r) => [Array.isArray(r[3]) ? (r[3][0] + r[3][1]) / 2 : r[3], r[4]]).sort((a, b) => a[0] - b[0]);
  if (pts.length === 1 || current <= pts[0][0]) return { d1: pts[0][1], ...u, clamped: pts.length > 1 && current < pts[0][0] };
  const last = pts[pts.length - 1];
  if (current >= last[0]) return { d1: last[1], ...u, clamped: current > last[0] };
  for (let k = 0; k < pts.length - 1; k++) {
    const [i0, a] = pts[k], [i1, b] = pts[k + 1];
    if (current === i0) return { d1: a, ...u, clamped: false };
    if (current === i1) return { d1: b, ...u, clamped: false };
    if (current > i0 && current < i1) {
      const f = (current - i0) / (i1 - i0);
      return { d1: Math.exp(Math.log(a) + f * (Math.log(b) - Math.log(a))), ...u, clamped: false };
    }
  }
  return { d1: last[1], ...u, clamped: true };
}

// Fraction of the daily actinic-UV limit received per second at distance d (m) from the arc.
export function uvDoseRate(d1, d) {
  const dd = Math.max(d, 0.05);
  return (d1 / dd) * (d1 / dd) / 60;
}

// ---- contact burns ------------------------------------------------------------------------------
// Moritz & Henriques via CMAJ 1997: [water temperature C, time to deep second-degree burn s]
// (ranges in the table are entered at their shorter end: 51 C "2-6 min", 55 C "20-30 s", 60 C "5-6 s").
export const MH = [
  [44, 6 * 3600], [49, 9 * 60], [51, 120], [52, 120], [55, 20], [60, 5], [66, 2], [70, 1],
];
// CENELEC Guide 29 Table A.1, uncoated metal burn thresholds: [contact time s, surface temperature C]
export const CEN_METAL = [[60, 51], [600, 48], [8 * 3600, 43]];
export const BURN_ON_CONTACT_C = 70;

// Time (s) to a deep second-degree burn at temperature T (log-time interpolation in the table).
export function deepBurnTime(T) {
  if (T >= BURN_ON_CONTACT_C) return 1;
  if (T < MH[0][0]) return Infinity;
  for (let k = 0; k < MH.length - 1; k++) {
    const [T0, t0] = MH[k], [T1, t1] = MH[k + 1];
    if (T === T0) return t0;
    if (T === T1) return t1;
    if (T > T0 && T < T1) {
      const f = (T - T0) / (T1 - T0);
      return Math.exp(Math.log(t0) + f * (Math.log(t1) - Math.log(t0)));
    }
  }
  return 1;
}

// Has a contact of `seconds` at metal temperature T reached the superficial burn threshold (CENELEC)?
export function superficialBurn(T, seconds) {
  for (const [t, Tth] of CEN_METAL) if (seconds >= t && T >= Tth) return true;
  return false;
}

// Burn assessment for bare skin on hot metal. Returns null when there is no burn.
export function contactBurn(T, seconds) {
  if (T >= BURN_ON_CONTACT_C) return { kind: 'burn', basis: 'onContact', T, seconds };
  const tb = deepBurnTime(T);
  if (seconds >= tb) return { kind: 'burn', basis: 'deep', T, seconds, tb };
  if (superficialBurn(T, seconds)) return { kind: 'burn', basis: 'superficial', T, seconds };
  return null;
}

// ---- fume capture -----------------------------------------------------------------------------
// A movable hood captures the fume when its mouth is within one hood diameter of the welding point.
export function hoodCaptures(hoodMouth, hoodDiameter, arc, extractorOn) {
  if (!extractorOn || !hoodMouth || !arc) return false;
  return hoodMouth.distanceTo(arc) <= hoodDiameter;
}
