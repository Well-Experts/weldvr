// Source register for the safety module. Every requirement, limit and effect the simulator applies
// points to one of these entries plus a clause or table. Texts in the app paraphrase the source; the
// clause reference lets an instructor check the original. Free, official sources only (the paid
// standards the client holds are used by the certification module).
//
// Dates are the edition or revision shown on the source when it was read (2026-10-14).

export const REFS = {
  OSHA132: { label: 'OSHA 29 CFR 1910.132', title: 'Personal protective equipment: general requirements', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.132' },
  OSHA133: { label: 'OSHA 29 CFR 1910.133', title: 'Eye and face protection', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.133' },
  OSHA157: { label: 'OSHA 29 CFR 1910.157', title: 'Portable fire extinguishers', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.157' },
  OSHA215: { label: 'OSHA 29 CFR 1910.215', title: 'Abrasive wheel machinery', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.215' },
  OSHA243: { label: 'OSHA 29 CFR 1910.243', title: 'Guarding of portable powered tools', url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-P/section-1910.243' },
  OSHA252: { label: 'OSHA 29 CFR 1910.252', title: 'Welding, cutting and brazing: general requirements', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.252' },
  OSHA253: { label: 'OSHA 29 CFR 1910.253', title: 'Oxygen-fuel gas welding and cutting', url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-Q/section-1910.253' },
  OSHA254: { label: 'OSHA 29 CFR 1910.254', title: 'Arc welding and cutting', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.254' },
  OSHA350: { label: 'OSHA 29 CFR 1926.350', title: 'Gas welding and cutting (construction)', url: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1926/subpart-J/section-1926.350' },
  OSHA351: { label: 'OSHA 29 CFR 1926.351', title: 'Arc welding and cutting (construction)', url: 'https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.351' },
  Z49: { label: 'ANSI Z49.1:2021', title: 'Safety in Welding, Cutting, and Allied Processes (free from AWS)', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/f524cc78ee9c4e00a703bbe12b2f368b', date: 'approved 2021-07-02' },
  FS2: { label: 'AWS Fact Sheet No. 2', title: 'Radiation', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.2', date: '11/2025' },
  FS5: { label: 'AWS Fact Sheet No. 5', title: 'Electrical Hazards', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.5', date: '04/2022' },
  FS6: { label: 'AWS Fact Sheet No. 6', title: 'Fire and Explosion Prevention', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.6', date: '11/2024' },
  FS7: { label: 'AWS Fact Sheet No. 7', title: 'Burn Protection', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.7', date: '11/2024' },
  FS25: { label: 'AWS Fact Sheet No. 25', title: 'Metal Fume Fever', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.25', date: '11/2025' },
  FS26: { label: 'AWS Fact Sheet No. 26', title: 'Arc Viewing Distance', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.26', date: '11/2024' },
  FS28: { label: 'AWS Fact Sheet No. 28', title: 'Oxyfuel Safety: Check Valves and Flashback Arrestors', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.28', date: '10/2023' },
  FS30: { label: 'AWS Fact Sheet No. 30', title: 'Cylinders: Safe Storage, Handling, and Use', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.30', date: '11/2025' },
  VICTOR3260: { label: 'Victor 0056-3260', title: 'Cutting, Heating and Welding Guide: Set-up and Safe Operating Procedures (Oxy-Fuel Equipment)', url: 'https://www.hawthornecat.com/wp-content/uploads/2022/12/Victor-Oxy-Fuel-Equipment.pdf', date: 'Rev. AG, 2017-01-18' },
  VICTOR0138: { label: 'Victor 0056-0138', title: 'Safety and Operating Instructions: Torch Handles, Cutting Attachments, and Heating Nozzles', url: 'https://xrefs4.plumbersstock.com/TurboTorch/7404a75b16634f3dbb26e2b86f9df2f6.pdf', date: 'Rev. C, 2008-05-14' },
  HARRIS_MCG: { label: 'Harris PN 9700208', title: 'Machine Cutting Guide', url: 'https://ch-delivery.lincolnelectric.com/api/public/content/148be29b4a2c4c2c8a1da012b6e2cd8f?v=b0da1ed0', date: '03/2017' },
  HARRIS_TORCH: { label: 'Harris 9505643', title: 'Gas Welding, Cutting, Brazing, & Heating Torches: instruction manual', url: 'https://ch-delivery.lincolnelectric.com/api/public/content/5e04e52faf734a3880acd5958aee3224', date: 'REV-G, 2017-05-30' },
  FS31: { label: 'AWS Fact Sheet No. 31', title: 'Eye and Face Protection for Welding and Cutting Operations', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.31', date: '11/2025' },
  FS33: { label: 'AWS Fact Sheet No. 33', title: 'Personal Protective Equipment (PPE) for Welding and Cutting', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.33', date: '11/2025' },
  FS36: { label: 'AWS Fact Sheet No. 36', title: 'Ventilation for Welding and Cutting', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.36', date: '11/2025' },
  FS37: { label: 'AWS Fact Sheet No. 37', title: 'Selecting Gloves for Welding and Cutting', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.37', date: '11/2025' },
  FS39: { label: 'AWS Fact Sheet No. 39', title: 'Welding Cables', url: 'https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/Fact-Sheet-No.39', date: '11/2025' },
  HSE_STSU1: { label: 'HSE STSU1-2019', title: 'Change in enforcement expectations for mild steel welding fume', url: 'https://www.hse.gov.uk/safetybulletins/mild-steel-welding-fume.htm', date: '02/2019' },
  HSE_WL3: { label: 'HSE WL3', title: 'COSHH essentials for welding: welding fume control', url: 'https://www.hse.gov.uk/pubns/guidance/wl3.pdf', date: '04/2021' },
  HSE_CONTROLS: { label: 'HSE', title: 'Controlling the risks from welding', url: 'https://www.hse.gov.uk/welding/welding-controls.htm' },
  HSE_HEALTH: { label: 'HSE', title: 'Health risks from welding', url: 'https://www.hse.gov.uk/welding/health-risks-welding.htm' },
  HSE_SAFETY: { label: 'HSE', title: 'Safety risks from welding', url: 'https://www.hse.gov.uk/welding/other-welding-risks.htm' },
  HSE_INDG347: { label: 'HSE INDG347', title: 'Basic advice on first aid at work', url: 'https://www.hse.gov.uk/pubns/indg347.pdf' },
  CCOHS_PPE: { label: 'CCOHS OSH Answers', title: 'Welding - Personal Protective Equipment and Clothing', url: 'https://www.ccohs.ca/oshanswers/safety_haz/welding/ppe.html' },
  CCOHS_EYES: { label: 'CCOHS OSH Answers', title: 'Welding - Radiation and the Effects on Eyes and Skin', url: 'https://www.ccohs.ca/oshanswers/safety_haz/welding/eyes.html', date: 'revised 2025-10-15' },
  CCOHS_ELEC: { label: 'CCOHS OSH Answers', title: 'Welding - Electrical Safety', url: 'https://www.ccohs.ca/oshanswers/safety_haz/welding/electric.html', date: 'revised 2024-12-17' },
  CCOHS_HOT: { label: 'CCOHS OSH Answers', title: 'Welding - Hot Work', url: 'https://www.ccohs.ca/oshanswers/safety_haz/welding/hotwork.html' },
  COLLOPT: { label: 'College of Optometrists (UK)', title: 'Clinical Management Guideline: Photokeratitis (UV burn, arc eye)', url: 'https://www.college-optometrists.org/Clinical-guidance/Clinical-Management-Guidelines/Photokeratitis_Ultraviolet_UV_Burn_ArcEye_SnowBlin', date: 'v15, 12/2025' },
  TWI_ARCEYE: { label: 'TWI FAQ', title: 'What is arc eye?', url: 'https://www.twi-global.com/technical-knowledge/faqs/faq-what-is-arc-eye' },
  NHS_BURNS: { label: 'NHS', title: 'Burns and scalds: treatment', url: 'https://www.nhs.uk/conditions/burns-and-scalds/treatment/', date: 'reviewed 2026-03-31' },
  BRC_BURNS: { label: 'British Red Cross', title: 'First aid for burns', url: 'https://www.redcross.org.uk/first-aid/learn-first-aid/burns' },
  CMAJ_MH: { label: 'CMAJ 1997;156(6):841', title: 'Hot-water burns: time to deep second-degree burn by temperature (Moritz and Henriques, 1947)', url: 'https://www.cmaj.ca/content/cmaj/156/6/841.full.pdf' },
  CENELEC29: { label: 'CENELEC Guide 29 (2007)', title: 'Temperatures of hot surfaces likely to be touched (EN ISO 13732-1 thresholds)', url: 'https://boss.cenelec.eu/media/Guides/CLC/29_cenelecguide29.pdf' },
  EXPONENT: { label: 'Exponent (2010), citing ASTM C1055-03', title: 'Accessible hot surfaces and burn hazards', url: 'https://ewh.ieee.org/r4/chicago/pstc/content/Accessible-hot-surfaces-and-burn-hazards.pdf' },
  WIKI7010: { label: 'ISO 7010 sign codes (Wikipedia list, secondary)', title: 'ISO 7010 graphical symbols: safety signs', url: 'https://en.wikipedia.org/wiki/ISO_7010' },
};

// A citation: { ref: 'OSHA252', at: '(a)(2)(iii)(B)' } -> "OSHA 29 CFR 1910.252 (a)(2)(iii)(B)"
export function cite(c) {
  if (!c) return '';
  const r = REFS[c.ref];
  if (!r) return c.ref;
  return c.at ? `${r.label} ${c.at}` : r.label;
}

export function cites(list) {
  return (list || []).map(cite).join('; ');
}
