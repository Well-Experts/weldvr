// Safety incidents: what can go wrong when a safety rule is broken, how the simulator shows it, and the
// incident report (cause, rule, typical effects and first aid), each line tied to its source.
// Effects are shown without gore: glare and after-image, a pain flash, haptics and the report.

import * as THREE from 'three';
import { d1At, uvDoseRate, contactBurn, BURN_ON_CONTACT_C, hoodCaptures } from './exposure.js';

const BURN_FIRST_AID = {
  text: 'Cool the burn under cool running water for 20 minutes, as soon as possible (within 3 hours). Remove clothing or jewellery near the burn unless it is stuck to it. Do not put creams, oils or butter on it. Cover it loosely with cling film; do not burst blisters. Get medical help for large, deep or electrical burns.',
  refs: [{ ref: 'NHS_BURNS' }, { ref: 'BRC_BURNS' }, { ref: 'HSE_INDG347' }],
};

export const INCIDENTS = {
  arcEye: {
    title: 'Arc flash to the eyes',
    severity: 'injury',
    effects: 'Arc eye (photokeratitis): pain, watering and red eyes, a feeling of sand in the eye, sensitivity to light. Symptoms may not be felt until several hours after exposure, typically 6–12 hours, and usually clear within 24–48 hours.',
    effectRefs: [{ ref: 'CCOHS_EYES' }, { ref: 'COLLOPT' }, { ref: 'HSE_HEALTH' }],
    firstAid: { text: 'Report it and get medical advice; a foreign body may also be in the eye. Care is for comfort: prescribed eye drops and pain relief, and no contact lenses until the eye has healed.', refs: [{ ref: 'TWI_ARCEYE' }, { ref: 'COLLOPT' }] },
    rule: { text: 'Helmet down, with the correct filter, before the arc is struck.', refs: [{ ref: 'OSHA252', at: '(b)(2)(i)(A)' }, { ref: 'Z49', at: '4.2.1.1' }] },
  },
  glare: {
    title: 'Dazzled by the arc',
    severity: 'warning',
    effects: 'Visible light from the arc is very bright and can overwhelm the eye: it is temporarily blinding and fatiguing.',
    effectRefs: [{ ref: 'CCOHS_EYES' }],
    rule: { text: 'Use a shade at or above the minimum for the process and current; check that an auto-darkening filter darkens before welding (blocked sensors or a flat battery can stop it switching).', refs: [{ ref: 'OSHA133', at: '(a)(5)' }, { ref: 'FS31' }] },
  },
  uvSkin: {
    title: 'UV burn to bare skin',
    severity: 'injury',
    effects: 'UV from the arc burns unprotected skin like sunburn: reddening (erythema). Long-term exposure can cause skin cancer.',
    effectRefs: [{ ref: 'CCOHS_EYES' }, { ref: 'HSE_HEALTH' }],
    firstAid: { text: 'Cool the skin with a cool shower, bath or damp towel; painkillers for pain; no ice; do not pop blisters. Get help if the skin is blistered or swollen. (NHS advice for sunburn.)', refs: [{ ref: 'NHS_BURNS' }] },
    rule: { text: 'Clothing must cover the skin against sparks, spatter and radiation; gloves on both hands.', refs: [{ ref: 'Z49', at: '4.3.1, 4.3.2' }] },
  },
  spatterBurn: {
    title: 'Spatter burn',
    severity: 'injury',
    effects: 'Flying sparks, hot metal, slag and spatter cause burns on uncovered skin.',
    effectRefs: [{ ref: 'FS7' }],
    firstAid: BURN_FIRST_AID,
    rule: { text: 'Flame-resistant gloves and clothing covering the arms; no cuffs or open pockets.', refs: [{ ref: 'Z49', at: '4.3.1, 4.3.2' }, { ref: 'FS7' }] },
  },
  meltBurn: {
    title: 'Synthetic clothing melted',
    severity: 'injury',
    effects: 'Synthetic fabric can burn vigorously, melt and produce bad skin burns.',
    effectRefs: [{ ref: 'CCOHS_PPE' }],
    firstAid: BURN_FIRST_AID,
    rule: { text: 'Materials that can melt must not be worn for welding; wear flame-resistant cotton, wool or leather.', refs: [{ ref: 'Z49', at: 'E4.3' }, { ref: 'FS33' }] },
  },
  contactBurn: {
    title: 'Contact burn from hot metal',
    severity: 'injury',
    effects: 'Metal at 70 °C or more burns skin faster than a person can pull away (reaction time 0.5–1 s). Below that, the burn depends on temperature and contact time.',
    effectRefs: [{ ref: 'EXPONENT' }, { ref: 'CENELEC29', at: '6.1.1, Table A.1' }, { ref: 'CMAJ_MH' }],
    firstAid: BURN_FIRST_AID,
    rule: { text: 'Wear gloves; let hot work pieces cool before touching them and mark them HOT for others.', refs: [{ ref: 'FS7' }, { ref: 'OSHA252', at: '(b)(4)(vii)' }] },
  },
  hotHandling: {
    title: 'Hot work piece handled',
    severity: 'warning',
    effects: 'The metal was hot enough to burn bare skin on contact. Touching hot work pieces and equipment can cause burns.',
    effectRefs: [{ ref: 'FS7' }, { ref: 'EXPONENT' }],
    rule: { text: 'Allow a cooling period before touching hot parts; mark hot work pieces.', refs: [{ ref: 'FS7' }, { ref: 'OSHA252', at: '(b)(4)(vii)' }] },
  },
  fume: {
    title: 'Welding fume not captured',
    severity: 'exposure',
    effects: 'Mild steel welding fume can cause lung cancer and possibly kidney cancer; general ventilation does not give the necessary control.',
    effectRefs: [{ ref: 'HSE_STSU1' }],
    rule: { text: 'Local exhaust ventilation for all indoor welding, whatever the duration; place a movable hood within one hood diameter of the welding point; respirator for any residual fume.', refs: [{ ref: 'HSE_STSU1' }, { ref: 'HSE_WL3' }, { ref: 'Z49', at: '4.5, 5.4' }] },
  },
  plume: {
    title: 'Head in the fume plume',
    severity: 'exposure',
    effects: 'Most of the fume rises as a visible plume directly from the weld; breathing it directly gives the highest exposure.',
    effectRefs: [{ ref: 'Z49', at: 'E5.3' }],
    rule: { text: 'Avoid breathing the fume directly: position the work, your head or the ventilation so the plume passes away from your face.', refs: [{ ref: 'Z49', at: '5.3' }, { ref: 'FS36' }] },
  },
  shadeLow: {
    title: 'Filter shade below the minimum',
    severity: 'violation',
    effects: 'Too light a filter lets too much light radiation through.',
    effectRefs: [{ ref: 'OSHA133', at: '(a)(5)' }],
    rule: { text: 'Select a shade at or above the minimum for the process and current; start too dark and go lighter to see the weld zone.', refs: [{ ref: 'OSHA133', at: '(a)(5)' }, { ref: 'Z49', at: 'Table 1' }] },
  },
  noGlasses: {
    title: 'No safety glasses under the helmet',
    severity: 'violation',
    effects: 'Slag and spatter can reach the eyes when the helmet is lifted, for example when chipping or brushing.',
    effectRefs: [{ ref: 'OSHA133', at: '(a)(1)' }, { ref: 'FS31' }],
    rule: { text: 'Spectacles with side shields must also be worn under the helmet.', refs: [{ ref: 'Z49', at: '4.2.1.1' }, { ref: 'FS31' }] },
  },
  defectivePPE: {
    title: 'Defective PPE in use',
    severity: 'violation',
    effects: 'Damaged or contaminated protective equipment may not give its protection: oil and grease reduce the protective qualities of clothing, and gloves must be dry and free of holes.',
    effectRefs: [{ ref: 'Z49', at: 'E4.3.1, 4.3.2' }, { ref: 'FS33' }],
    rule: { text: 'Protective equipment is maintained in a reliable condition; inspect it before use and take damaged items out of service.', refs: [{ ref: 'OSHA132', at: '(a)' }, { ref: 'Z49', at: '4.3.2' }] },
  },
  curtainOpen: {
    title: 'Arc struck with the booth curtain open',
    severity: 'violation',
    effects: 'People in the walkway can see the arc: its radiation can injure the eyes of passers-by.',
    effectRefs: [{ ref: 'FS31' }, { ref: 'CCOHS_EYES' }],
    rule: { text: 'Protect people near the welding area from the rays with screens or curtains, or have them wear eye protection.', refs: [{ ref: 'OSHA252', at: '(b)(2)(iii)' }, { ref: 'Z49', at: '4.1.3' }] },
  },
  electricShock: {
    title: 'Electric shock while changing the electrode',
    severity: 'injury',
    effects: 'Electric shock from welding equipment can result in death or severe burns, and a fall caused by the shock can injure. Damp or wet gloves and clothing have much lower electrical resistance.',
    effectRefs: [{ ref: 'FS5' }, { ref: 'HSE_SAFETY' }],
    firstAid: { text: 'Turn off the electric power. Free the person from live parts with dry non-conducting material such as dry wood. If they are not breathing, call emergency services and give CPR once contact with the current is broken. Treat an electrical burn as a thermal burn with clean, cold compresses, and get medical help.', refs: [{ ref: 'FS5' }, { ref: 'CCOHS_ELEC' }] },
    rule: { text: 'The electrode is live whenever the machine is on: do not replace it with a bare hand or a wet welding glove; wear dry, hole-free insulating gloves.', refs: [{ ref: 'CCOHS_ELEC' }, { ref: 'Z49', at: '4.3.2' }, { ref: 'FS5' }] },
  },
  // oxy-fuel cutting (AWS Fact Sheet No. 28 definitions; responses from the Victor instructions)
  backfire: {
    title: 'Backfire',
    severity: 'warning',
    effects: 'The flame went back into the torch for a moment with a popping sound. A backfire can lead to a flashback or a sustained backfire.',
    effectRefs: [{ ref: 'FS28' }, { ref: 'VICTOR3260', at: '4.02' }],
    rule: { text: "Don't allow the tip to touch the work: keep the inner cones above the plate, and keep the tip clean.", refs: [{ ref: 'FS28' }] },
  },
  sustainedBackfire: {
    title: 'Sustained backfire',
    severity: 'injury',
    effects: 'The flame keeps burning inside the torch body, heard as a pop followed by a squealing or hissing sound; it can burn through the torch body.',
    effectRefs: [{ ref: 'FS28' }],
    rule: { text: 'Turn off the torch oxygen valve immediately, then the fuel valve. Let the torch cool before relighting; if it happens again, have the torch repaired.', refs: [{ ref: 'VICTOR3260', at: '5.06' }] },
  },
  torchBurnt: {
    title: 'Torch burnt through',
    severity: 'injury',
    effects: 'A sustained backfire left burning can burn through the torch body.',
    effectRefs: [{ ref: 'FS28' }],
    rule: { text: 'Shut the oxygen off at once when a backfire keeps burning; do not use a damaged torch until a qualified technician has repaired it.', refs: [{ ref: 'VICTOR3260', at: '5.06' }] },
  },
  flashback: {
    title: 'Flashback',
    severity: 'injury',
    effects: 'The flame ran back through the torch into the hose; a flashback into the hose, regulator or cylinder can cause an explosion. It is generally caused by reverse flow of the gases, from wrong start-up or shut-down, cylinder pressure too low, or a check valve that does not work.',
    effectRefs: [{ ref: 'FS28' }],
    rule: { text: 'Follow the start-up and shut-down procedures; purge each hose before lighting; use check valves and flashback arrestors; keep enough gas in both cylinders.', refs: [{ ref: 'FS28' }, { ref: 'VICTOR3260', at: '5.04, 5.06' }] },
  },
  cutEyes: {
    title: 'Cutting without a filter lens',
    severity: 'violation',
    effects: 'The eyes took the light of the flame and the burning steel without a filter lens, and sparks fly from the cut. Filter lenses are required for protection from injurious light radiation.',
    effectRefs: [{ ref: 'OSHA133', at: '(a)(5)' }, { ref: 'HARRIS_TORCH', at: 'Important Safeguards 1' }],
    rule: { text: 'Always wear welding goggles to protect the eyes from sparks and light rays: a filter lens at or above the minimum shade for oxygen cutting (shade 3 under 25 mm, 4 from 25 to 150 mm).', refs: [{ ref: 'HARRIS_TORCH', at: 'Important Safeguards 1' }, { ref: 'OSHA133', at: '(a)(5)' }] },
  },
  fire: {
    title: 'Fire from sparks',
    severity: 'injury',
    effects: 'Sparks can travel up to 35 ft (10.7 m) from the work and start fires; smouldering may not show smoke or flame for some time.',
    effectRefs: [{ ref: 'FS6' }],
    rule: { text: 'Move combustibles at least 35 ft (10.7 m) away or protect them; keep an extinguisher ready; keep a fire watch after the work.', refs: [{ ref: 'OSHA252', at: '(a)(2)(ii), (a)(2)(iii), (a)(2)(vii)' }, { ref: 'Z49', at: '6.2.4' }] },
  },
};

// SMAW electrode change with the machine on: what lets the current through the hand that fits the
// electrode. prot: protection(worn). CCOHS: "Do not replace the welding electrode with a bare hand, or
// with a wet welding glove"; gloves dry and in good repair (Z49.1 4.3.2; AWS Fact Sheet No. 5:
// "dry, hole-free, insulating gloves"). Returns 'bare' | 'wet' | 'hole' or null (protected).
export function electrodeChangeShock(prot) {
  if (!prot.gloveItem) return 'bare';
  if (prot.handsWet) return 'wet';
  if (prot.handHole) return 'hole';
  return null;
}

// ---- per-frame monitor ----------------------------------------------------------------------------
const UV_LIMIT = 1; // fraction of the daily TLV (FS 26 distances)
const SPARK_HIT_R_HAND = 0.05; // m, simulator geometry of a hand (design value)
const SPARK_HIT_R_ARM = 0.045; // m, forearm radius (design value)
const FOREARM = [0.04, 0.27]; // m behind the grip along the controller's +z (design value)
const PLUME_R = 0.15; // m, simulator plume radius above the arc (design value)

export class SafetyMonitor {
  constructor() {
    this.reset();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.seg = [new THREE.Vector3(), new THREE.Vector3()];
  }

  reset() {
    this.uv = { eyes: 0, face: 0, left: 0, right: 0, leftArm: 0, rightArm: 0 };
    this.log = []; // incidents of this attempt
    this.fumeT = 0;
    this.plumeT = 0;
    this.arcT = 0;
    this.capturedT = 0;
    this.done = new Set(); // one-shot incidents
    this.lastHit = { left: -10, right: -10, leftArm: -10, rightArm: -10 };
    this.contact = { left: 0, right: 0 };
    this.time = 0;
    this.glare = 0; // 0..1 visual glare level this frame
  }

  add(type, data) {
    const inc = { type, t: this.time, ...data };
    this.log.push(inc);
    return inc;
  }

  // ctx: see app.safetyContext(). Returns new incidents this frame (for effects and cards).
  update(ctx) {
    const dt = ctx.dt;
    this.time += dt;
    const out = [];
    const arcOn = !!(ctx.arcOn && ctx.arcW);
    this.glare = 0;
    if (arcOn) {
      this.arcT += dt;
      const uv = d1At(ctx.process, ctx.current);
      // ---- eyes and face: UV dose when the helmet is not down in front of the face
      const toArc = this.v1.copy(ctx.arcW).sub(ctx.head.pos);
      const dist = toArc.length();
      const facing = toArc.normalize().dot(ctx.head.fwd); // cos of the angle between view and arc
      const lensDown = ctx.helmetWorn && ctx.helmetDown;
      if (uv && !lensDown && facing > 0) {
        const r = uvDoseRate(uv.d1, dist) * dt;
        this.uv.eyes += r;
        this.uv.face += r;
        this.glare = Math.max(this.glare, Math.min(1, 0.4 + facing * 0.6));
        if (this.uv.eyes >= UV_LIMIT && !this.done.has('arcEye')) {
          this.done.add('arcEye');
          out.push(this.add('arcEye', { dose: this.uv.eyes, dist, basis: uv.basis, exact: uv.exact, current: ctx.current }));
        }
      }
      // ADF with blocked sensors stays in its light state: the filter still blocks UV (AWS FS 31) but the
      // arc light dazzles
      if (lensDown && ctx.adfFail && facing > 0) {
        this.glare = Math.max(this.glare, 0.85);
        if (!this.done.has('glare')) {
          this.done.add('glare');
          out.push(this.add('glare', { cause: 'adf' }));
        }
      }
      if (lensDown && ctx.shadeBelowMin && !this.done.has('shadeLow')) {
        this.done.add('shadeLow');
        out.push(this.add('shadeLow', { shade: ctx.shade, min: ctx.shadeMin }));
      }
      if (!ctx.observer && !ctx.prot.glasses && !this.done.has('noGlasses')) {
        this.done.add('noGlasses');
        out.push(this.add('noGlasses', {}));
      }
      if (!ctx.observer && ctx.defects && ctx.defects.length && !this.done.has('defectivePPE')) {
        this.done.add('defectivePPE');
        out.push(this.add('defectivePPE', { items: ctx.defects }));
      }
      if (!ctx.observer && ctx.curtainOpen && this.arcT > 1 && !this.done.has('curtainOpen')) {
        this.done.add('curtainOpen');
        out.push(this.add('curtainOpen', {}));
      }
      // ---- skin: bare hands and arms
      for (const side of ['left', 'right']) {
        const h = ctx.hands[side];
        if (!h || !h.connected) continue;
        if (uv && !ctx.prot.hands) {
          this.uv[side] += uvDoseRate(uv.d1, h.pos.distanceTo(ctx.arcW)) * dt;
          if (this.uv[side] >= UV_LIMIT && !this.done.has(`uv-${side}`)) {
            this.done.add(`uv-${side}`);
            out.push(this.add('uvSkin', { where: side === 'left' ? 'left hand' : 'right hand', side, dose: this.uv[side] }));
          }
        }
        if (uv && !ctx.prot.armsCovered) {
          const mid = this.forearm(h, 0.5, this.v2);
          const k = `${side}Arm`;
          this.uv[k] += uvDoseRate(uv.d1, mid.distanceTo(ctx.arcW)) * dt;
          if (this.uv[k] >= UV_LIMIT && !this.done.has(`uv-${k}`)) {
            this.done.add(`uv-${k}`);
            out.push(this.add('uvSkin', { where: side === 'left' ? 'left forearm' : 'right forearm', side, dose: this.uv[k] }));
          }
        }
      }
      // ---- fume capture and plume (the welder's exposure: not counted while watching a demo)
      const captured = hoodCaptures(ctx.hood.mouth, ctx.hood.d, ctx.arcW, ctx.hood.on);
      if (captured) this.capturedT += dt;
      else if (ctx.indoor && !ctx.observer) {
        this.fumeT += dt;
        if (this.fumeT > 3 && !this.done.has('fume')) {
          this.done.add('fume');
          out.push(this.add('fume', { hoodDist: ctx.hood.mouth ? ctx.hood.mouth.distanceTo(ctx.arcW) : null, hoodD: ctx.hood.d, on: ctx.hood.on }));
        }
      }
      const mouth = this.v3.copy(ctx.head.pos).addScaledVector(ctx.head.fwd, 0.06);
      mouth.y -= 0.08;
      const above = mouth.y - ctx.arcW.y;
      const horiz = Math.hypot(mouth.x - ctx.arcW.x, mouth.z - ctx.arcW.z);
      if (!captured && !ctx.observer && above > 0.05 && above < 0.7 && horiz < PLUME_R) {
        this.plumeT += dt;
        if (this.plumeT > 2 && !this.done.has('plume')) {
          this.done.add('plume');
          out.push(this.add('plume', {}));
        }
      }
    }
    // ---- spatter hits on unprotected hands and arms
    if (ctx.sparks && ctx.sparks.n) this.sparkHits(ctx, out);
    // ---- contact with hot metal
    for (const side of ['left', 'right']) {
      const h = ctx.hands[side];
      const c = h && h.connected && ctx.contactAt ? ctx.contactAt(h.pos, side) : null;
      if (!c || c.T < 45) {
        this.contact[side] = 0;
        continue;
      }
      this.contact[side] += dt;
      const gloved = ctx.prot.hands && !ctx.prot.handsMelt;
      if (gloved) {
        if (c.T >= BURN_ON_CONTACT_C && !this.done.has(`hot-${side}`)) {
          this.done.add(`hot-${side}`);
          out.push(this.add('hotHandling', { side, T: c.T, what: c.what }));
        }
        continue;
      }
      const b = contactBurn(c.T, this.contact[side]);
      if (b && !this.done.has(`burn-${side}`)) {
        this.done.add(`burn-${side}`);
        out.push(this.add('contactBurn', { side, where: side === 'left' ? 'left hand' : 'right hand', T: c.T, seconds: this.contact[side], basis: b.basis, what: c.what }));
      }
    }
    return out;
  }

  // point along the forearm of a hand: f = 0 wrist end, 1 elbow end
  forearm(h, f, out) {
    const a = FOREARM[0] + f * (FOREARM[1] - FOREARM[0]);
    return out.set(0, 0, a).applyQuaternion(h.quat).add(h.pos);
  }

  sparkHits(ctx, out) {
    const S = ctx.sparks;
    const m = ctx.benchToWorld;
    const p = this.v1;
    for (const side of ['left', 'right']) {
      const h = ctx.hands[side];
      if (!h || !h.connected) continue;
      // a hole in the glove lets spatter reach the skin (gloves must be hole-free: Z49.1 4.3.2, FS 33)
      const handBare = !ctx.prot.hands || ctx.prot.handsMelt || ctx.prot.handHole;
      const armBare = !ctx.prot.armsCovered || ctx.prot.armsMelt;
      if (!handBare && !armBare) continue;
      const a = this.forearm(h, 0, this.seg[0]);
      const b = this.forearm(h, 1, this.seg[1]);
      for (let i = 0; i < S.n; i++) {
        if (S.life && S.life[i] <= 0) continue;
        if (S.T[i] < 600) continue; // only drops hot enough to glow (simulator rule)
        p.set(S.p[i * 3], S.p[i * 3 + 1], S.p[i * 3 + 2]).applyMatrix4(m);
        if (handBare && p.distanceTo(h.pos) < SPARK_HIT_R_HAND && this.time - this.lastHit[side] > 4) {
          this.lastHit[side] = this.time;
          S.life[i] = 0;
          const melt = ctx.prot.handsMelt;
          out.push(this.add(melt ? 'meltBurn' : 'spatterBurn', { side, where: side === 'left' ? 'left hand' : 'right hand', T: S.T[i], hole: !!ctx.prot.handHole && !melt && ctx.prot.hands }));
          break;
        }
        if (armBare && distToSegment(p, a, b) < SPARK_HIT_R_ARM && this.time - this.lastHit[`${side}Arm`] > 4) {
          this.lastHit[`${side}Arm`] = this.time;
          S.life[i] = 0;
          const melt = ctx.prot.armsMelt;
          out.push(this.add(melt ? 'meltBurn' : 'spatterBurn', { side, where: side === 'left' ? 'left forearm' : 'right forearm', T: S.T[i] }));
          break;
        }
      }
    }
  }

  summary() {
    return {
      uvEyes: this.uv.eyes,
      fumeT: this.fumeT,
      arcT: this.arcT,
      capturedShare: this.arcT > 0 ? this.capturedT / this.arcT : null,
      plumeT: this.plumeT,
      incidents: this.log.slice(),
    };
  }
}

function distToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const L = abx * abx + aby * aby + abz * abz;
  const f = L > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / L)) : 0;
  const dx = apx - f * abx, dy = apy - f * aby, dz = apz - f * abz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
