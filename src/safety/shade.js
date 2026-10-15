// Filter shade numbers for welding and cutting.
//   Minimum protective shade: OSHA 29 CFR 1910.133(a)(5), table "Filter Lenses for Protection Against
//   Radiant Energy" (the same minimums appear in ANSI Z49.1:2021 Table 1).
//   Suggested (comfort) shade: ANSI Z49.1:2021 Table 1 "Guide for Shade Numbers" (from AWS F2.2).
// Footnote of both tables: start with a shade that is too dark to see the weld zone, then go lighter
// until the weld zone is seen well, without going below the minimum.

const ARC = {
  // Shielded metal arc welding: electrode size (1/32 in) and arc current
  SMAW: [
    { lo: 0, hi: 60, min: 7, sug: null, size: 'less than 3/32 in (2.4 mm)' },
    { lo: 60, hi: 160, min: 8, sug: 10, size: '3/32–5/32 in (2.4–4.0 mm)' },
    { lo: 160, hi: 250, min: 10, sug: 12, size: '5/32–1/4 in (4.0–6.4 mm)' },
    { lo: 250, hi: 550, min: 11, sug: 14, size: 'more than 1/4 in (6.4 mm)' },
  ],
  // Gas metal arc welding and flux cored arc welding
  GMAW: [
    { lo: 0, hi: 60, min: 7, sug: null, note: 'Z49.1 Table 1 note b' },
    { lo: 60, hi: 160, min: 10, sug: 11 },
    { lo: 160, hi: 250, min: 10, sug: 12 },
    { lo: 250, hi: 500, min: 10, sug: 14 },
  ],
  // Gas tungsten arc welding
  GTAW: [
    { lo: 0, hi: 50, min: 8, sug: 10 },
    { lo: 50, hi: 150, min: 8, sug: 12 },
    { lo: 150, hi: 500, min: 10, sug: 14 },
  ],
};

// Oxyfuel processes by plate thickness (mm). OSHA minimum; Z49.1 suggested (comfort) shades.
const GAS = {
  OC: [
    { lo: 0, hi: 25, min: 3, sug: [3, 4], label: 'light, under 1 in (25 mm)' },
    { lo: 25, hi: 150, min: 4, sug: [4, 5], label: 'medium, 1 to 6 in (25 to 150 mm)' },
    { lo: 150, hi: Infinity, min: 5, sug: [5, 6], label: 'heavy, over 6 in (150 mm)' },
  ],
  OFW: [
    { lo: 0, hi: 3.2, min: 4, sug: [4, 5], label: 'light, under 1/8 in (3.2 mm)' },
    { lo: 3.2, hi: 12.7, min: 5, sug: [5, 6], label: 'medium, 1/8 to 1/2 in (3.2 to 12.7 mm)' },
    { lo: 12.7, hi: Infinity, min: 6, sug: [6, 8], label: 'heavy, over 1/2 in (12.7 mm)' },
  ],
};

export const SHADE_REFS = [
  { ref: 'OSHA133', at: '(a)(5)' },
  { ref: 'Z49', at: 'Table 1' },
];

// ISO 4063 process number -> table family
export function shadeFamily(process) {
  if (process === '111') return 'SMAW';
  if (process === '141') return 'GTAW';
  if (process === '135' || process === '136' || process === '114' || process === '138') return 'GMAW';
  if (process === 'OC' || process === '81') return 'OC';
  if (process === 'OFW' || process === '311') return 'OFW';
  return null;
}

// Shade guide for a process at an arc current (A) or, for oxyfuel, a plate thickness (mm).
// A current exactly on a row boundary belongs to two rows in the tables; the darker row is used.
export function shadeGuide(process, value) {
  const fam = shadeFamily(process);
  if (!fam) return null;
  const rows = ARC[fam] || GAS[fam];
  if (!(value >= 0)) return null;
  let pick = null;
  for (const r of rows) if (value >= r.lo && value <= r.hi) pick = r; // last match = darker row on a boundary
  if (!pick) pick = rows[rows.length - 1];
  const boundary = rows.some((r) => r !== pick && (value === r.lo || value === r.hi));
  return {
    family: fam,
    min: pick.min,
    suggested: pick.sug,
    row: pick,
    boundary,
    refs: SHADE_REFS,
  };
}

// Is a shade acceptable? below: under the OSHA minimum (not allowed); comfort: at or darker than the
// Z49.1 suggested shade (CCOHS advises using the suggested rather than the minimum shade).
export function assessShade(shade, guide) {
  if (!guide || shade == null) return null;
  const sug = Array.isArray(guide.suggested) ? guide.suggested[0] : guide.suggested;
  const below = shade < guide.min;
  return {
    shade,
    min: guide.min,
    suggested: guide.suggested,
    below,
    belowSuggested: !below && sug != null && shade < sug,
    ok: !below,
  };
}

export function fmtSuggested(s) {
  if (s == null) return '—';
  return Array.isArray(s) ? `${s[0]} or ${s[1]}` : String(s);
}
