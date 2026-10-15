// Welder qualification (stage 6): the standards, test-piece materials, consumable groupings and the
// qualification tests the simulator can weld.
//
// Standards (licensed copies supplied by WELL EXPERTS; clause numbers as printed in them):
//   ISO 9606-1:2012 (BS EN ISO 9606-1:2017), Qualification testing of welders, fusion welding, steels.
//   ASME BPVC Section IX-2023 (Article III welder performance, QW-100 tests, QW-400 data, QW-450/460 tables
//     and figures). Figures not in the 2023 extract supplied (QW-462.4(b), QW-463.2, QW-466.1, QW-469,
//     Form QW-484A) are read from the scanned ASME BPVC.IX-2015 supplied with it.
//   API Standard 1104, 22nd edition (July 2021), Welding of Pipelines and Related Facilities, Section 6
//     (welder qualification), 5.6 (test methods and requirements) and Section 9 (acceptance standards).
//   AWS D1.1 has no licensed copy here: its mock tests stay visual only, from secondary sources.
//
// Base metals: ASME IX-2023 Table QW/QB-422 gives the P-Number, group, ISO 15608 group and minimum
// specified tensile strength of each specification used below. Elongation (for the bend-test former): ASTM
// A516 Grade 60 minimum 25 % in 2 in and 21 % in 8 in (SSAB A516 Grade 60 data page); ASTM A106 Grade B
// minimum 30 % in 2 in, longitudinal strip (Totten Tubes A106 page; transverse bend specimens of a girth
// weld lie along the pipe, i.e. longitudinal).
//
// Consumable groupings: ASME IX-2023 Table QW-432 (F-Numbers: SFA-5.1 EXX10 F-No. 3, EXX13 F-No. 2, EXX18
// F-No. 4; SFA-5.18 F-No. 6), ISO 9606-1 Tables 2, 4 and 5 (FM1 non-alloy and fine grain steels; covering
// types C 10/11, B 15/16/18/28/45/48, rutile group 03/13/14/19/20/24/27; solid wire or rod S), API 1104
// Table 4 (WF-1 EXX10/EXX11 cellulosic, WF-2 EXX15/16/18 low hydrogen, WF-4 GMAW or GTAW ERXXS-X).
//
// The training WPS of each test (currents, electrodes, rods, gases, travel) is the simulator's training WPS
// (scenarios.js), not a qualified procedure.

export const STANDARDS = {
  iso: {
    id: 'iso', short: 'ISO 9606-1', code: 'ISO 9606-1:2012 (BS EN ISO 9606-1:2017)',
    title: 'Qualification testing of welders, fusion welding, steels',
  },
  asme: {
    id: 'asme', short: 'ASME IX', code: 'ASME BPVC Section IX-2023',
    title: 'Welding, brazing and fusing qualifications, Article III welder performance',
  },
  api: {
    id: 'api', short: 'API 1104', code: 'API Std 1104, 22nd edition (2021)',
    title: 'Welding of pipelines and related facilities, Section 6 qualification of welders',
  },
  aws: {
    id: 'aws', short: 'AWS D1.1', code: 'AWS D1.1 (secondary sources, no licensed copy)',
    title: 'Structural welding code, steel: welder test, visual examination only',
  },
};

// Test-piece materials (ASME IX-2023 Table QW/QB-422 rows).
export const MATERIALS = {
  'SA-516-60': {
    id: 'SA-516-60', spec: 'SA-516', grade: '60', uns: 'K02100', label: 'SA-516 Grade 60 plate',
    pNo: 1, group: 1, iso15608: '1.1', smtsMPa: 415, smtsKsi: 60, form: 'plate',
    elong: 21, // % in 8 in (ASTM A516; 25 % in 2 in)
  },
  'SA-106-B': {
    id: 'SA-106-B', spec: 'SA-106', grade: 'B', uns: 'K03006', label: 'SA-106 Grade B seamless pipe',
    pNo: 1, group: 1, iso15608: '11.1', smtsMPa: 415, smtsKsi: 60, smysMPa: 240, form: 'pipe',
    elong: 30, // % in 2 in, longitudinal strip (ASTM A106)
  },
  'SA-36': {
    id: 'SA-36', spec: 'SA-36', grade: '', uns: '', label: 'SA-36 plate',
    pNo: 1, group: 1, iso15608: '11.1', smtsMPa: 400, smtsKsi: 58, form: 'plate',
    elong: null, // fillet tests only (no bend test)
  },
};

// Filler metals of the training WPS and their groupings in the three standards.
export const FILLERS = {
  E6010: {
    id: 'E6010', aws: 'AWS A5.1 E6010', sfa: 'SFA-5.1', fNo: 3, fm: 'FM1', isoType: 'C', isoDesig: 'cellulosic (10)',
    api: 'WF-1', form: 'flux coated', label: 'E6010 cellulosic',
  },
  E6013: {
    id: 'E6013', aws: 'AWS A5.1 E6013', sfa: 'SFA-5.1', fNo: 2, fm: 'FM1', isoType: 'R', isoDesig: 'rutile (13)',
    api: null, form: 'flux coated', label: 'E6013 rutile',
  },
  E7018: {
    id: 'E7018', aws: 'AWS A5.1 E7018 H4R', sfa: 'SFA-5.1', fNo: 4, fm: 'FM1', isoType: 'B', isoDesig: 'basic (18)',
    api: 'WF-2', form: 'flux coated', label: 'E7018 basic, low hydrogen',
  },
  'ER70S-6': {
    id: 'ER70S-6', aws: 'AWS A5.18 ER70S-6', sfa: 'SFA-5.18', fNo: 6, fm: 'FM1', isoType: 'S', isoDesig: 'solid wire (S)',
    api: 'WF-4', form: 'solid', label: 'ER70S-6 solid wire, 1.2 mm',
  },
  'ER70S-2': {
    id: 'ER70S-2', aws: 'AWS A5.18 ER70S-2', sfa: 'SFA-5.18', fNo: 6, fm: 'FM1', isoType: 'S', isoDesig: 'solid rod (S)',
    api: 'WF-4', form: 'solid', label: 'ER70S-2 solid rod, 2.4 mm',
  },
};

// Qualification test pieces in mm. Plates: ISO 9606-1 6.2 and Figures 3, 4, 7 and 10 (plates at least
// 125 mm wide, test piece at least 200 mm long, examination length 150 mm with 25 mm discarded at each end;
// fillet web at least 125 mm). ASME QW-462.4(b) (fillet coupon at least 6 in long, web 3 in, base 4 in)
// and API pipe nipples are inside the same pieces. Pipes: ISO 9606-1 Figure 5 (each pipe at least 125 mm).
const PLATE = { length: 150, tab: 25, plateW: 125 };
const FILLET = { length: 150, tab: 25, webH: 125 };

// Examination methods offered after the visual examination (ids are used by run.js).
//   rt        radiography of the examination length (ideal simulated film)
//   bend      transverse face and root bends (or side bends where the code asks for them)
//   bendFR    ASME QW-452.1(a) Note (3): face and root bends in place of side bends
//   fracture  fracture tests (ISO 9017 per ISO 9606-1 6.5.2.2 / 6.5.3)
//   macro     macroscopic examination (ISO 9606-1 Table 13 e)
//   fillet    ASME QW-181.2: one fracture (QW-182) and one macro (QW-184)
//   destructive  API 1104 Table 7 nick-break and bend specimens
//   rtDestructive API 6.7: both radiography and destructive tests
export const QUAL_TESTS = [
  // ---- ISO 9606-1 ----------------------------------------------------------------------------------
  {
    id: 'ISO-111-P-BW-PF', std: 'iso', process: '111', smaw: { electrode: 'E7018', dia: 3.2 },
    title: 'Plate butt weld on backing, vertical up (PF), covered electrode',
    joint: ['butt', 'PF', PLATE], material: 'SA-516-60', fillers: ['E7018'],
    methods: ['rt', 'bend', 'fracture'],
  },
  {
    id: 'ISO-135-P-BW-PF', std: 'iso', process: '135',
    title: 'Plate butt weld on backing, vertical up (PF), MAG solid wire',
    joint: ['butt', 'PF', PLATE], material: 'SA-516-60', fillers: ['ER70S-6'],
    methods: ['rt', 'bend', 'fracture'],
  },
  {
    id: 'ISO-111-T-BW-HL045', std: 'iso', process: '111',
    title: 'Pipe butt weld, fixed at 45°, upward (H-L045), NPS 6 Sch 80',
    joint: ['pipe', '6G', { size: 'NPS6-80', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['rt', 'fracture'],
  },
  {
    id: 'ISO-111-T-BW-PH', std: 'iso', process: '111',
    title: 'Pipe butt weld, axis horizontal, upward (PH), NPS 2 Sch 80',
    joint: ['pipe', '5G', { size: 'NPS2-80', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['rt', 'fracture'],
  },
  {
    id: 'ISO-135-P-FW-PB', std: 'iso', process: '135',
    title: 'Fillet weld on plate (PB), MAG solid wire, single run',
    joint: ['fillet', 'PB', FILLET], material: 'SA-516-60', fillers: ['ER70S-6'],
    methods: ['fracture', 'macro'],
  },
  {
    id: 'ISO-141-P-FW-PB', std: 'iso', process: '141', gtaw: { tungsten: 'EWCe-2', filler: 'ER70S-2' },
    title: 'Fillet weld on 3.2 mm plate (PB), TIG, single run',
    joint: ['fillet', 'PB', { ...FILLET, thickness: 3.2, leg: 3.2 }], material: 'SA-36', fillers: ['ER70S-2'],
    methods: ['fracture', 'macro'],
  },
  // ---- ASME IX-2023 --------------------------------------------------------------------------------
  {
    id: 'ASME-SMAW-6G', std: 'asme', process: '111',
    title: '6G pipe groove, uphill, NPS 6 Sch 80, SMAW (F-No. 3 root, F-No. 4 fill and cap)',
    joint: ['pipe', '6G', { size: 'NPS6-80', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['bend', 'bendFR', 'rt'],
  },
  {
    id: 'ASME-SMAW-5G', std: 'asme', process: '111',
    title: '5G pipe groove, uphill, NPS 2 Sch 80, SMAW (F-No. 3 root, F-No. 4 cap)',
    joint: ['pipe', '5G', { size: 'NPS2-80', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['bend', 'rt'],
  },
  {
    id: 'ASME-SMAW-3G', std: 'asme', process: '111', smaw: { electrode: 'E7018', dia: 3.2 },
    title: '3G plate groove with backing, uphill, SMAW E7018 (F-No. 4)',
    joint: ['butt', 'PF', PLATE], material: 'SA-516-60', fillers: ['E7018'],
    methods: ['bend', 'bendFR', 'rt'],
  },
  {
    id: 'ASME-GMAW-3G', std: 'asme', process: '135',
    title: '3G plate groove with backing, uphill, GMAW solid wire (F-No. 6)',
    joint: ['butt', 'PF', PLATE], material: 'SA-516-60', fillers: ['ER70S-6'],
    methods: ['bend', 'bendFR', 'rt'],
  },
  {
    id: 'ASME-SMAW-2F', std: 'asme', process: '111', smaw: { electrode: 'E7018', dia: 3.2 },
    title: '2F tee fillet on plate, SMAW E7018 (F-No. 4)',
    joint: ['fillet', 'PB', FILLET], material: 'SA-516-60', fillers: ['E7018'],
    methods: ['fillet'],
  },
  {
    id: 'ASME-GTAW-2F', std: 'asme', process: '141', gtaw: { tungsten: 'EWCe-2', filler: 'ER70S-2' },
    title: '2F tee fillet on 1/8 in plate, GTAW (F-No. 6)',
    joint: ['fillet', 'PB', { ...FILLET, thickness: 3.2, leg: 3.2 }], material: 'SA-36', fillers: ['ER70S-2'],
    methods: ['fillet'],
  },
  // ---- API 1104, 22nd edition: single qualification (6.2) ------------------------------------------
  {
    id: 'API-SMAW-6G', std: 'api', process: '111',
    title: 'Butt weld, pipe fixed at 45°, uphill, NPS 6 Sch 40, SMAW (WF-1 root, WF-2 fill and cap)',
    joint: ['pipe', '6G', { size: 'NPS6-40', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['destructive', 'rt', 'rtDestructive'],
  },
  {
    id: 'API-SMAW-5G', std: 'api', process: '111',
    title: 'Butt weld, pipe fixed horizontal, uphill, NPS 2 Sch 80, SMAW (WF-1 root, WF-2 cap)',
    joint: ['pipe', '5G', { size: 'NPS2-80', progression: 'up' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['destructive', 'rt', 'rtDestructive'],
  },
  {
    id: 'API-SMAW-1G', std: 'api', process: '111',
    title: 'Butt weld, pipe rolled, NPS 6 Sch 80, SMAW (WF-1 root, WF-2 fill and cap)',
    joint: ['pipe', '1G', { size: 'NPS6-80' }], material: 'SA-106-B', fillers: ['E6010', 'E7018'],
    methods: ['destructive', 'rt', 'rtDestructive'],
  },
  // ---- AWS D1.1: no licensed copy; visual only (previous mock tests) ----------------------------------
  {
    id: 'AWS-135-2F', std: 'aws', process: '135', pack: 'aws-d11-wq',
    title: 'Fillet test, 2F, MAG (visual only)',
    joint: ['fillet', 'PB', {}], material: null, fillers: ['ER70S-6'],
    methods: ['visual'],
    note: 'AWS D1.1 welder tests also require macroetch or fracture tests. No licensed AWS D1.1 copy is loaded, so only the visual criteria from secondary sources are applied.',
  },
  {
    id: 'AWS-136-3G', std: 'aws', process: '136', pack: 'aws-d11-wq',
    title: 'Groove test with backing, 3G, FCAW-G (visual only)',
    joint: ['butt', 'PF', {}], material: null, fillers: [],
    methods: ['visual'],
    note: 'AWS D1.1 groove tests also require bend tests or radiography. No licensed AWS D1.1 copy is loaded, so only the visual criteria from secondary sources are applied.',
  },
];

export const METHOD_LABELS = {
  rt: 'Radiography',
  bend: 'Bend tests',
  bendFR: 'Face and root bends',
  fracture: 'Fracture tests',
  macro: 'Macro examination',
  fillet: 'Fracture and macro',
  destructive: 'Nick-break and bend tests',
  rtDestructive: 'Radiography and destructive tests',
  visual: 'Visual only',
};

export function testById(id) {
  return QUAL_TESTS.find((t) => t.id === id) || null;
}

export function testsFor(std) {
  return QUAL_TESTS.filter((t) => t.std === std);
}

// Text with {name} placeholders filled in (condition details and brief lines are templates: the interface
// translates the template first, records keep the English).
export function fill(s, vars) {
  let o = String(s ?? '');
  if (vars) for (const k in vars) o = o.split(`{${k}}`).join(String(vars[k]));
  return o;
}
