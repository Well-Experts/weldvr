// Safety and PPE module: three drills on the workshop scene and the safety system (safety/system.js).
//   S1 Dress for the job: choose PPE at the rack for a described job, spot and bin defective items,
//      check it against the cited requirements, then weld a test run and live with the consequences.
//   S2 Booth inspection: find and name the unsafe conditions placed in the workshop (hazard hunt).
//   S3 Hot work permit and fire watch: make the area safe, sign the permit only when every item is
//      true, weld, then keep the fire watch for the time the chosen rule requires.
// Every requirement shown comes from safety/ppe.js, hazards.js or incidents.js with its source.

import * as THREE from 'three';
import { COLORS } from '../ui/ui.js';
import { t } from '../ui/i18n.js';
import { WeldingMode, PAD } from './welding.js';
import { PPE_ITEMS, DEFECTS, SLOTS } from '../safety/ppe.js';
import { HAZARDS, pickHazards } from '../safety/hazards.js';
import { PPE_JOBS, jobTask, jobJoint, SPOTS, scoreTags, FIRE_WATCH_RULES, PERMIT_ITEMS } from '../safety/drills.js';
import { INCIDENTS } from '../safety/incidents.js';
import { cites } from '../safety/refs.js';
import { fullRack, incidentDetail } from '../safety/system.js';
import { drawPPECheck, drawIncidents, jobLine, countIncidents } from '../ui/safetyScreens.js';
import { TagMarker, outlineBox, Smoulder, sweepingsPile, ragBin } from '../render/safetyProps.js';
import { makeJoint } from '../sim/joint.js';
import { rng } from '../sim/util.js';

const STORE = 'wellexperts.weldvr.safety';
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') || {};
  } catch {
    return {};
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress is kept for this session only */
  }
}

const WATCH_SPEED = 30; // fire-watch clock runs 30 times faster than real time (training aid)

// ===================================================================================================
export class SafetyMode extends WeldingMode {
  constructor(app) {
    super(app);
    this.id = 'safety';
    this.phase = 'idle'; // WeldingMode phase: 'idle' outside the test runs
    this.drill = null; // 'S1' | 'S2' | 'S3'
    this.step = 'list';
    this.progress = loadProgress();
    this.jobK = 0;
    this.rackZone = 'top';
    this.huntN = 5;
    this.watchRule = 'z49';
    this.markers = [];
    this.outlines = [];
    this.hoverBox = new THREE.Box3Helper(new THREE.Box3(), 0xf2b51c);
    this.hoverBox.material.depthTest = false;
    this.hoverBox.material.transparent = true;
    this.hoverBox.renderOrder = 9596;
    this.hoverBox.visible = false;
    this.ray = new THREE.Ray();
    this.inv = new THREE.Matrix4();
    this.allowDemo = false; // the drills are about the trainee's own weld
    this.box = new THREE.Box3();
    this.v1 = new THREE.Vector3();
  }

  title() {
    const d = { S1: t('Safety and PPE: dress for the job'), S2: t('Safety and PPE: booth inspection'), S3: t('Safety and PPE: hot work permit and fire watch') };
    return this.drill ? d[this.drill] : t('Safety and PPE');
  }

  hint() {
    const xr = this.app.renderer.xr.isPresenting;
    if (this.step === 'dress') return xr ? t('Squeeze to take an item (reach it, or point at it). Bring it to your head, chest or legs and let go to put it on; drop damaged items in the red bin.') : t('Desktop: use the lists to put items on or bin them; Look shows an item on the rack.');
    if (this.step === 'hunt' || this.step === 'permit' || this.step === 'watch') return xr ? t('Point at something with either hand and pull the trigger to tag it. B/Y on the other hand brings this panel.') : t('Desktop: drag to look around, click an object to tag it.');
    if (this.phase === 'weld') return t('Trigger: weld. B/Y: helmet.');
    return '';
  }

  enter() {
    const app = this.app;
    app.workshop.room.add(this.hoverBox);
    // hands free for dressing, inspecting and the fire watch; the welding runs take the gun (loadCoupon)
    app.setTool('none');
    // drill props: sweepings and a rag bin (fire watch), smouldering spot
    const ws = app.workshop;
    this.sweep = sweepingsPile();
    this.sweep.position.set(-1.45, 0, 0.35);
    this.sweep.visible = false;
    ws.room.add(this.sweep);
    this.bin = ragBin();
    this.bin.position.set(1.25, 0, 1.55);
    this.bin.visible = false;
    ws.room.add(this.bin);
    this.smoulder = new Smoulder();
    ws.room.add(this.smoulder.group);
  }

  exit() {
    const app = this.app;
    this.endDrill();
    this.hoverBox.parent?.remove(this.hoverBox);
    for (const o of [this.sweep, this.bin, this.smoulder && this.smoulder.group]) o?.parent?.remove(o);
    app.setTool('gun');
  }

  // Back to a neutral workshop: no hazards, normal rack, at the bench.
  endDrill() {
    const app = this.app;
    const sf = app.safety;
    sf.setHazards([]);
    sf.showHuntProps(false);
    sf.interact = true;
    sf.taskOverride = null;
    sf.setLevBroken(false);
    sf.setRack(fullRack());
    app.workshop.blanket.visible = false;
    app.workshop.state.covered = false;
    this.clearMarkers();
    if (this.smoulder) this.smoulder.set(0);
    if (this.sweep) this.sweep.visible = false;
    if (this.bin) this.bin.visible = false;
    this.hoverBox.visible = false;
    if (app.viewpoint && app.viewpoint !== 'bench') app.returnToBench();
    this.phase = 'idle';
    this.drill = null;
    this.step = 'list';
  }

  clearMarkers() {
    for (const m of this.markers) m.group.parent?.remove(m.group);
    for (const o of this.outlines) o.parent?.remove(o);
    this.markers = [];
    this.outlines = [];
  }

  go(vp) {
    this.app.goToViewpoint(vp);
    this.app.main.invalidate();
  }

  // ---- per frame -------------------------------------------------------------------------------------
  update(dt) {
    const app = this.app;
    if (this.phase === 'weld' || this.phase === 'demo' || this.phase === 'replay') {
      super.update(dt);
      // live incident list on the panel
      const n = app.safety.monitor.log.length;
      if (n !== this.lastIncN) {
        this.lastIncN = n;
        app.main.invalidate();
      }
      return;
    }
    // outside the welding runs both hands are free (point and grab with either hand)
    if (app.tool !== 'none') app.setTool('none');
    app.weldStep(dt, { lockTrigger: true });
    app.toolStep(dt);
    this.hoverBox.visible = false;
    if (this.step === 'hunt' || this.step === 'permit' || this.step === 'watch') this.pickUpdate();
    if (this.step === 'watch') this.watchUpdate(dt);
    if (this.smoulder) this.smoulder.update(dt, app.time);
    if (this.step === 'dress') {
      // refresh the lists when the trainee dresses at the rack
      const sig = JSON.stringify(app.safety.worn) + app.safety.rejected.length + app.settings.shade;
      if (sig !== this.dressSig) {
        this.dressSig = sig;
        app.main.invalidate();
      }
    }
  }

  // Scene picking: nearest spot box along a pointer.
  pickables() {
    const sf = this.app.safety;
    if (this.drill === 'S2') return SPOTS.map((s) => ({ id: s.id, box: sf.hazardBox(s.hazards[0], new THREE.Box3()) })).filter((p) => p.box);
    if (this.drill === 'S3') {
      const out = [];
      if (this.step === 'permit') {
        out.push({ id: 'entrance', box: sf.hazardBox('combustibles', new THREE.Box3()) });
        out.push({ id: 'extinguisher', box: sf.hazardBox('extinguisherMissing', new THREE.Box3()) });
        out.push({ id: 'curtain', box: sf.hazardBox('curtainOpen', new THREE.Box3()) });
      }
      const smouldering = this.step === 'watch' && this.smoulder.level > 0;
      if (smouldering) {
        const c = this.smoulder.group.position.clone();
        const sz = this.smoulder.level >= 2 ? 1.0 : 0.6;
        out.push({ id: 'smoulder', box: new THREE.Box3().setFromCenterAndSize(c.add(new THREE.Vector3(0, sz * 0.4, 0)), new THREE.Vector3(sz, sz, sz)) });
      }
      // other places the trainee may check during the fire watch (room frame)
      if (this.step === 'watch') {
        const places = { sweep: [this.sweep, [0.8, 0.3, 0.7]], bin: [this.bin, [0.5, 0.6, 0.5]], blanket: [this.app.workshop.blanket, [1.3, 1.1, 1.1]] };
        for (const id in places) {
          const [o, size] = places[id];
          if (!o.visible || (smouldering && this.watch.place === id)) continue;
          const c = o.position.clone();
          if (id !== 'blanket') c.y += size[1] / 2;
          out.push({ id, box: new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(...size)) });
        }
      }
      return out.filter((p) => p.box);
    }
    return [];
  }

  // Pick in the room frame: pointer rays are brought into the room (boxes are room-frame boxes).
  pickUpdate() {
    const app = this.app;
    if (this.step === 'tag') return;
    const items = this.pickables();
    const room = app.workshop.room;
    room.updateWorldMatrix(true, false);
    this.inv.copy(room.matrixWorld).invert();
    // every pointer is checked: the hover box follows the first one on a target, and the hand that
    // pulls its trigger picks (the other hand may point at something else at the same time)
    let hovered = false;
    for (const p of app.worldPointers) {
      this.ray.origin.copy(p.origin);
      this.ray.direction.copy(p.dir);
      this.ray.applyMatrix4(this.inv);
      // among the boxes the ray passes through, take the one whose centre is nearest the ray
      // (relative to its size): pointing at an object picks it even inside a larger box
      let best = null, bd = Infinity;
      const c = this.c || (this.c = new THREE.Vector3());
      const sz = this.sz || (this.sz = new THREE.Vector3());
      for (const it2 of items) {
        const hit = this.ray.intersectBox(it2.box, this.v1);
        if (!hit) continue;
        const d = hit.distanceTo(this.ray.origin);
        it2.box.getCenter(c);
        const off = this.ray.distanceToPoint(c) / Math.max(0.05, 0.5 * it2.box.getSize(sz).length());
        const key = off + 0.02 * d;
        if (key < bd) {
          bd = key;
          best = { ...it2, d };
        }
      }
      if (!best) continue;
      if (!hovered) {
        this.hoverBox.box.copy(best.box);
        this.hoverBox.visible = true;
        hovered = true;
      }
      app.worldHit[p.key] = best.d;
      if (p.press) {
        if (p.key !== 'mouse') {
          const side = p.key === 'dom' ? app.domSide : app.offSide;
          app.input.hands[side].consumed = true;
          app.input.pulse(side, 0.3, 25);
        }
        this.onPick(best.id, best.box);
        return;
      }
    }
  }

  onPick(id, box) {
    const app = this.app;
    this.pick = { id, box: box.clone() };
    const tg = this.tags && this.tags[id];
    this.draft = tg ? { choices: (tg.choices || []).slice(), none: !!tg.none } : { choices: [], none: false };
    this.prevStep = this.step;
    this.step = 'tag';
    app.placeMainInView(0.18, 0.18, 0.6);
    app.main.invalidate();
  }

  // ---- S1: dress for the job ----------------------------------------------------------------------------
  startDress(k) {
    const app = this.app;
    const sf = app.safety;
    const job = PPE_JOBS[k];
    this.jobK = k;
    this.job = job;
    this.task = jobTask(job);
    this.drill = 'S1';
    sf.taskOverride = this.task;
    // rack: normal stock plus this job's extra items, shuffled within each shelf
    const r = rng(Math.floor(Math.random() * 1e9));
    const items = fullRack(job.extra);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    sf.setRack(items);
    sf.dressStreet();
    sf.setLevBroken(false);
    sf.resetAttempt();
    this.R = null;
    this.result = null;
    this.step = 'dress';
    this.rackZone = 'top';
    this.go('rack');
    app.say(t('Dress for the job at the PPE station. Inspect each item before you put it on.'), 4);
  }

  checkDress() {
    const app = this.app;
    const sf = app.safety;
    const chk = sf.check(this.task);
    const defects = this.job.extra.filter((e) => e.defect);
    const worn = sf.wornDefects();
    const binned = sf.rejected.filter((r) => r.defect);
    const wrongBinned = sf.rejected.filter((r) => !r.defect);
    const pass = chk.ok && worn.length === 0;
    this.result = { chk, defects, worn, binned, wrongBinned, pass, should: chk.failsShould.length };
    const p = this.progress[this.job.id] || {};
    p.tries = (p.tries || 0) + 1;
    if (pass) p.passed = true;
    this.progress[this.job.id] = p;
    saveProgress(this.progress);
    this.step = 'checked';
    app.say(pass ? t('PPE check passed.') : t('PPE check: requirements not met.'), 2.5);
    app.main.invalidate();
  }

  startTryWeld() {
    const app = this.app;
    const job = this.job;
    const joint = jobJoint(job);
    this.step = 'try';
    if (app.viewpoint !== 'bench') app.returnToBench();
    // keep the trainee's PPE; place the hood and close the curtain
    this.weldSetup = () => ({ ppe: false, booth: true });
    this.allowDemo = false;
    this.loadCoupon({ joint, process: job.process, seed: Math.floor(Math.random() * 1e6) });
    app.say(t('Test run: weld about 10 cm with the PPE you chose, then press Finish.'), 4);
  }

  // WeldingMode calls this at the end of finish()
  onFinished() {
    if (this.drill === 'S1') {
      this.tryR = this.R;
      this.phase = 'idle';
      this.step = 'tryDone';
    } else if (this.drill === 'S3') {
      this.workR = this.R;
      this.phase = 'idle';
      this.startWatch();
    }
  }

  // ---- S2: booth inspection ---------------------------------------------------------------------------
  startHunt() {
    const app = this.app;
    const sf = app.safety;
    this.drill = 'S2';
    const r = rng(Math.floor(Math.random() * 1e9));
    this.present = pickHazards(this.huntN, r);
    sf.setRack(fullRack());
    sf.setHazards(this.present);
    sf.showHuntProps(true);
    sf.interact = false;
    this.tags = {};
    this.clearMarkers();
    this.huntT0 = app.time;
    this.step = 'hunt';
    this.go('walkway');
    app.say(t('Inspect the workshop before welding. Tag every unsafe condition you find.'), 4);
  }

  // Tag menu of the hunt: toggle a hazard name at the picked place, or mark it as nothing wrong.
  toggleTag(choice) {
    const p = this.pick;
    if (!p) return;
    const d = this.draft || (this.draft = { choices: [], none: false });
    if (choice === 'none') {
      d.choices = [];
      d.none = true;
    } else {
      d.none = false;
      const k = d.choices.indexOf(choice);
      if (k >= 0) d.choices.splice(k, 1);
      else d.choices.push(choice);
    }
    this.app.main.invalidate();
  }

  // Close the tag menu, keeping (ok) or discarding the draft.
  closeTag(ok) {
    const app = this.app;
    const p = this.pick;
    if (p && ok && this.draft) {
      const spot = SPOTS.find((s) => s.id === p.id);
      const old = this.markers.find((m) => m.spot === spot.id);
      if (old) {
        old.group.parent?.remove(old.group);
        this.markers.splice(this.markers.indexOf(old), 1);
      }
      const d = this.draft;
      if (d.choices.length || d.none) this.tags[spot.id] = { choices: d.choices.slice(), none: d.none && !d.choices.length, t: app.time - this.huntT0 };
      else delete this.tags[spot.id];
      if (d.choices.length) {
        const m = new TagMarker(this.markers.length + 1);
        m.spot = spot.id;
        m.group.position.set((p.box.min.x + p.box.max.x) / 2, p.box.max.y, (p.box.min.z + p.box.max.z) / 2);
        app.workshop.room.add(m.group);
        this.markers.push(m);
      }
    }
    this.draft = null;
    this.pick = null;
    this.step = this.prevStep || 'hunt';
    app.main.invalidate();
  }

  finishHunt() {
    const app = this.app;
    const sf = app.safety;
    this.huntResult = scoreTags(this.present, this.tags);
    this.huntResult.time = app.time - this.huntT0;
    // outlines: found green, missed or misnamed red
    for (const h of this.present) {
      const ok = this.huntResult.found.includes(h);
      const o = outlineBox(sf.hazardBox(h, new THREE.Box3()), ok ? 0x3fcf7f : 0xff5d52);
      app.workshop.room.add(o);
      this.outlines.push(o);
    }
    const p = this.progress.hunt || {};
    p.best = Math.max(p.best || 0, this.huntResult.score);
    this.progress.hunt = p;
    saveProgress(this.progress);
    this.step = 'huntDone';
    this.page = 0;
    app.main.invalidate();
  }

  // ---- S3: hot work permit and fire watch --------------------------------------------------------------
  startPermit() {
    const app = this.app;
    const sf = app.safety;
    const ws = app.workshop;
    this.drill = 'S3';
    const r = rng(Math.floor(Math.random() * 1e9));
    const ext = r() < 0.5 ? 'extinguisherMissing' : 'extinguisherBlocked';
    sf.setRack(fullRack());
    sf.setHazards(['combustibles', ext, 'curtainOpen']);
    sf.interact = true;
    ws.state.covered = false;
    ws.blanket.visible = false;
    this.sweep.visible = true;
    this.bin.visible = true;
    this.smoulder.set(0);
    this.permit = { signed: false, watchAgreed: false, refused: 0, actions: [] };
    this.watch = null;
    this.clearMarkers();
    this.step = 'permit';
    this.go('walkway');
    app.say(t('Make the area safe for hot work, then complete and sign the permit.'), 4);
  }

  permitState() {
    const app = this.app;
    const ws = app.workshop;
    const st = ws.state;
    return {
      combustibles: !st.combustibles || !!st.covered,
      extinguisher: !st.extinguisherMissing && !st.extinguisherBlocked && !st.extinguisherEmpty,
      curtain: ws.curtain.closed,
      watch: this.permit.watchAgreed,
    };
  }

  // Actions offered for a picked place during the permit and the fire watch.
  actionsFor(id) {
    const ws = this.app.workshop;
    const st = ws.state;
    if (this.step === 'permit' || this.prevStep === 'permit') {
      if (id === 'entrance') return st.combustibles ? [{ id: 'move', label: 'Move them out of the area (more than 35 ft / 10.7 m away)' }, { id: 'cover', label: 'Cover them with a fire-resistant blanket' }] : [];
      if (id === 'extinguisher') {
        const a = [];
        if (st.extinguisherMissing) a.push({ id: 'fetch', label: 'Fetch a charged extinguisher and put it in its bracket' });
        if (st.extinguisherBlocked) a.push({ id: 'clear', label: 'Clear the boxes away from the extinguisher' });
        return a;
      }
      if (id === 'curtain') return ws.curtain.closed ? [] : [{ id: 'close', label: 'Close the curtain' }];
    }
    if (this.prevStep === 'watch') {
      if (id === 'smoulder') return this.smoulder.level >= 2 ? [{ id: 'alarm', label: 'Raise the fire alarm and call for help' }, { id: 'ext', label: 'Fight it with the extinguisher' }] : [{ id: 'ext', label: 'Put it out with the extinguisher' }, { id: 'alarm', label: 'Raise the fire alarm' }];
      return [{ id: 'nothing', label: 'Checked: nothing burning here' }];
    }
    return [];
  }

  doAction(id, act) {
    const app = this.app;
    const ws = app.workshop;
    const sf = app.safety;
    if (this.prevStep === 'permit') {
      this.permit.actions.push(act);
      if (act === 'move') sf.applyHazard('combustibles', false);
      if (act === 'cover') {
        ws.state.covered = true;
        ws.blanket.visible = true;
      }
      if (act === 'fetch') sf.applyHazard('extinguisherMissing', false);
      if (act === 'clear') sf.applyHazard('extinguisherBlocked', false);
      if (act === 'close') ws.curtain.set(true);
    } else if (this.prevStep === 'watch') {
      const w = this.watch;
      if (id === 'smoulder') {
        const level = this.smoulder.level;
        w.found = { t: w.simT, level, act };
        if (act === 'alarm') w.alarm = true;
        this.smoulder.set(0);
        app.say(act === 'alarm' ? t('Alarm raised: the fire is put out.') : level >= 2 ? t('Fire put out with the extinguisher.') : t('Smouldering spot put out.'), 3);
      } else w.checks = (w.checks || 0) + 1;
    }
    this.pick = null;
    this.draft = null;
    this.step = this.prevStep;
    app.main.invalidate();
  }

  signPermit() {
    const app = this.app;
    const s = this.permitState();
    const open = PERMIT_ITEMS.filter((p) => !s[p.id]);
    if (open.length) {
      this.permit.refused++;
      app.say(t('The permit cannot be signed: "{x}" is not true yet.', { x: t(open[0].text) }), 4);
      return;
    }
    this.permit.signed = true;
    this.permit.signedT = app.time;
    // the hot work: a short weld at the bench with the standard kit
    if (app.viewpoint !== 'bench') app.returnToBench();
    this.weldSetup = () => ({ ppe: true, booth: false, hood: true });
    this.allowDemo = true; // on the desktop the hot work can be a demonstration weld
    const joint = makeJoint('fillet', 'PB');
    this.loadCoupon({ joint, process: '135', seed: Math.floor(Math.random() * 1e6) });
    this.step = 'work';
    app.say(t('Permit signed. Make the weld, then press Finish to start the fire watch.'), 4);
  }

  startWatch() {
    const app = this.app;
    const rule = FIRE_WATCH_RULES[this.watchRule];
    const r = rng(Math.floor(Math.random() * 1e9));
    const D = rule.minutes * 60;
    // where a spark smoulders: under the edge of the blanket if the combustibles were only covered,
    // else in the sweepings beside the booth or in the rag bin (sparks travel up to 35 ft: FS 6)
    const places = [];
    if (app.workshop.state.covered) places.push({ id: 'blanket', at: [-0.4, 0.0, 2.55] });
    places.push({ id: 'sweep', at: [-1.45, 0.02, 0.35] }, { id: 'bin', at: [1.25, 0.42, 1.55] });
    const place = places[Math.floor(r() * places.length)];
    this.smoulder.group.position.set(...place.at);
    this.smoulder.set(0);
    this.watch = { D, simT: 0, appear: D * (0.15 + 0.3 * r()), fireAt: 0, place: place.id, found: null, ended: false, checks: 0 };
    this.watch.fireAt = this.watch.appear + D * 0.35;
    this.step = 'watch';
    this.go('walkway');
    app.say(t('Fire watch: look for smoke and glowing material for at least {m} minutes (clock runs {k}× faster).', { m: rule.minutes, k: WATCH_SPEED }), 5);
  }

  watchUpdate(dt) {
    const w = this.watch;
    if (!w || w.ended) return;
    w.simT += dt * WATCH_SPEED;
    if (!w.found) {
      if (w.simT >= w.appear && this.smoulder.level === 0) this.smoulder.set(1);
      if (w.simT >= w.fireAt && this.smoulder.level === 1) {
        this.smoulder.set(2);
        w.fire = true;
        this.app.safety.monitor.add('fire', { where: null });
        this.app.say(t('Smoke and flames: the smouldering material has caught fire.'), 4);
      }
    }
    const sec = Math.floor(w.simT / 60);
    if (sec !== this.lastWatchMin) {
      this.lastWatchMin = sec;
      this.app.main.invalidate();
    }
  }

  endWatch() {
    const w = this.watch;
    const rule = FIRE_WATCH_RULES[this.watchRule];
    w.ended = true;
    w.endedAt = w.simT;
    w.early = w.simT < rule.minutes * 60;
    // an unfound smoulder keeps going after the watch: it becomes a fire
    if (!w.found) w.fireAfter = true;
    const ok = !w.early && w.found && !w.fire;
    const p = this.progress.permit || {};
    p.tries = (p.tries || 0) + 1;
    if (ok) p.passed = true;
    this.progress.permit = p;
    saveProgress(this.progress);
    this.step = 'permitDone';
    this.app.main.invalidate();
  }

  // ---- drawing ----------------------------------------------------------------------------------------
  draw(ui) {
    if (this.phase === 'weld' || this.phase === 'demo') return this.drawWeld(ui);
    switch (this.step) {
      case 'list': return this.drawList(ui);
      case 'jobs': return this.drawJobs(ui);
      case 'dress': return this.drawDress(ui);
      case 'checked': return this.drawChecked(ui);
      case 'tryDone': return this.drawTryDone(ui);
      case 'huntBrief': return this.drawHuntBrief(ui);
      case 'hunt': return this.drawHunt(ui);
      case 'tag': return this.drawTag(ui);
      case 'huntDone': return this.drawHuntDone(ui);
      case 'permitBrief': return this.drawPermitBrief(ui);
      case 'permit': return this.drawPermit(ui);
      case 'watch': return this.drawWatch(ui);
      case 'permitDone': return this.drawPermitDone(ui);
      default: return this.drawList(ui);
    }
  }

  navButtons(ui, y) {
    const vps = [['bench', 'Bench'], ['rack', 'PPE station'], ['walkway', 'Walkway'], ['gasStore', 'Gas store'], ['grinding', 'Grinding']];
    ui.text(t('Go to'), PAD, y + 36, { size: 21, color: COLORS.dim });
    const x0 = PAD + 110;
    const bw = (ui.W - x0 - PAD - 4 * 10) / 5;
    vps.forEach(([id, label], k) => ui.button(`vp-${id}`, x0 + k * (bw + 10), y, bw, 54, t(label), () => (id === 'bench' ? (this.app.returnToBench(), this.app.main.invalidate()) : this.go(id)), { size: 20, selected: this.app.viewpoint === id || (id === 'bench' && !this.app.viewpoint) }));
    return y + 66;
  }

  drawList(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 120;
    y = ui.wrap(t('Safe welding starts before the arc: the right PPE in good condition, a safe booth, and fire precautions. Each drill checks what you do against the cited requirement; mistakes have consequences in the simulation (glare, burns, fume exposure, fire).'), PAD, y, W - 2 * PAD, { size: 22, color: COLORS.dim });
    const tiles = [
      { id: 'S1', label: t('Dress for the job'), sub: t('PPE selection and inspection'), go: () => { this.step = 'jobs'; app.main.invalidate(); }, done: PPE_JOBS.filter((j) => this.progress[j.id] && this.progress[j.id].passed).length, total: PPE_JOBS.length },
      { id: 'S2', label: t('Booth inspection'), sub: t('Find the unsafe conditions'), go: () => { this.step = 'huntBrief'; this.drill = 'S2'; app.main.invalidate(); }, best: this.progress.hunt ? this.progress.hunt.best : null },
      { id: 'S3', label: t('Hot work permit'), sub: t('Fire precautions and fire watch'), go: () => { this.step = 'permitBrief'; this.drill = 'S3'; app.main.invalidate(); }, done: this.progress.permit && this.progress.permit.passed ? 1 : 0, total: 1 },
    ];
    const cw = (W - 2 * PAD - 2 * 24) / 3;
    y += 20;
    tiles.forEach((tile, k) => {
      const x = PAD + k * (cw + 24);
      ui.button(`s-${tile.id}`, x, y, cw, 190, tile.label, tile.go, { size: 32, sub: tile.sub, style: k === 0 ? 'primary' : undefined });
      const st = tile.best != null ? `${t('best')} ${Math.round(tile.best * 100)}%` : tile.total ? `${tile.done} / ${tile.total} ${t('passed')}` : '';
      if (st) ui.text(st, x + cw / 2, y + 226, { size: 20, color: COLORS.dim, align: 'center' });
    });
    y += 270;
    ui.text(t('Your set-up in the other modes'), PAD, y, { size: 24, weight: 700 });
    ui.segmented('s-setup', PAD, y + 20, 760, 60, [{ value: 'auto', label: t('Set up for me') }, { value: 'trainee', label: t('I set up the PPE and booth') }], app.settings.setup, (v) => app.set('setup', v), { size: 22 });
    y = ui.wrap(t('Set up for me: the standard PPE for the job is put on, the extraction hood is placed at the weld and the curtain closed. I set up: you dress at the rack and place the hood yourself; the results show what was missing.'), PAD, y + 112, W - 2 * PAD, { size: 19, color: COLORS.faint });
    ui.wrap(t('Requirements and limits come from OSHA 29 CFR 1910, ANSI Z49.1:2021, AWS safety and health fact sheets, HSE and CCOHS guidance (clause shown with each item). Training aid: it does not replace the site risk assessment or the employer’s procedures.'), PAD, y + 10, W - 2 * PAD, { size: 19, color: COLORS.faint });
  }

  drawJobs(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 120;
    ui.text(t('Choose a job'), PAD, y + 20, { size: 26, weight: 700 });
    y += 44;
    // card height so that every job fits above the Back button
    const rh = Math.min(158, Math.floor((ui.H - 160 - y) / PPE_JOBS.length));
    PPE_JOBS.forEach((job, k) => {
      const task = jobTask(job);
      const pr = this.progress[job.id];
      ui.rect(PAD, y, W - 2 * PAD, rh - 10, COLORS.bg2, 16, pr && pr.passed ? '#1f4a33' : COLORS.line);
      ui.text(`${k + 1}. ${t(job.title)}`, PAD + 20, y + 32, { size: 24, weight: 700, maxW: W - 2 * PAD - 300 });
      ui.wrap(t(job.brief), PAD + 20, y + 58, W - 2 * PAD - 320, { size: 18, color: COLORS.dim, maxLines: 2 });
      ui.text(jobLine(task), PAD + 20, y + rh - 22, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD - 320 });
      ui.button(`job-${job.id}`, W - PAD - 270, y + 24, 250, Math.min(70, rh - 50), t('Start'), () => this.startDress(k), { style: 'primary', size: 26 });
      if (pr) ui.text(pr.passed ? t('passed') : t('not passed yet'), W - PAD - 145, y + rh - 22, { size: 17, color: pr.passed ? COLORS.ok : COLORS.faint, align: 'center' });
      y += rh;
    });
    ui.button('jobs-back', PAD, ui.H - 140, 260, 64, t('Back'), () => { this.step = 'list'; this.drill = null; app.main.invalidate(); }, { size: 24 });
  }

  drawDress(ui) {
    const app = this.app;
    const sf = app.safety;
    const W = ui.W;
    const job = this.job;
    let y = 108;
    ui.text(t(job.title), PAD, y + 26, { size: 26, weight: 700, maxW: W - 2 * PAD });
    y = ui.wrap(t(job.brief), PAD, y + 58, W - 2 * PAD, { size: 19, color: COLORS.dim, maxLines: 2 });
    ui.text(`${t('Job')}: ${jobLine(this.task)}`, PAD, y + 6, { size: 19, color: COLORS.accent, maxW: W - 2 * PAD });
    y += 20;
    const colW = 520;
    // worn
    ui.text(t('Wearing'), PAD, y + 30, { size: 23, weight: 700 });
    let yy = y + 42;
    for (const slot of SLOTS) {
      const w = sf.worn[slot];
      if (!w) continue;
      const street = sf.isStreet(slot);
      ui.text(`${t(PPE_ITEMS[w.id].name)}${street ? ` (${t('own clothes')})` : ''}`, PAD, yy + 28, { size: 19, color: street ? COLORS.dim : COLORS.text, maxW: colW - 150 });
      if (!street) ui.button(`off-${slot}`, PAD + colW - 140, yy + 2, 130, 38, t('Take off'), () => { sf.takeOff(slot); app.main.invalidate(); }, { size: 17 });
      yy += 44;
    }
    // shade knob of the auto-darkening helmet
    const h = sf.item('helmet');
    if (h && h.adf) {
      ui.text(t('Dark shade knob'), PAD, yy + 34, { size: 19, color: COLORS.dim });
      ui.stepper('d-shade', PAD + 220, yy + 8, 260, 46, null, `${app.settings.shade}`, (d) => app.set('shade', Math.max(9, Math.min(13, app.settings.shade + d))));
      yy += 58;
    }
    // rack
    const x2 = PAD + colW + 30;
    const rw = W - PAD - x2;
    ui.text(t('On the rack'), x2, y + 30, { size: 23, weight: 700 });
    const zones = [{ value: 'top', label: t('Upper shelf') }, { value: 'hook', label: t('Hooks') }, { value: 'low', label: t('Lower shelf') }, { value: 'floor', label: t('Floor') }];
    ui.segmented('d-zone', x2, y + 44, rw, 46, zones, this.rackZone, (v) => { this.rackZone = v; app.main.invalidate(); }, { size: 17 });
    yy = y + 100;
    const desk = !app.renderer.xr.isPresenting;
    const ZONE = { top: ['helmet', 'eyes', 'cap', 'ears', 'resp'], hook: ['torso', 'apron', 'cape'], low: ['hands', 'legs'], floor: ['feet'] };
    for (const s of app.workshop.rackSlots) {
      if (!s.obj.visible || s.rejected || !ZONE[this.rackZone].includes(PPE_ITEMS[s.id].slot)) continue;
      ui.text(t(PPE_ITEMS[s.id].name), x2, yy + 26, { size: 18, maxW: rw - (desk ? 300 : 210) });
      let bx = x2 + rw - 100;
      ui.button(`bin-${s.k}`, bx, yy + 2, 100, 36, t('Bin'), () => { sf.toBin(s); app.main.invalidate(); }, { size: 16, style: 'bad' });
      bx -= 104;
      ui.button(`wear-${s.k}`, bx, yy + 2, 98, 36, t('Wear'), () => { sf.putOn(s); app.main.invalidate(); }, { size: 16 });
      if (desk) {
        bx -= 94;
        ui.button(`look-${s.k}`, bx, yy + 2, 88, 36, t('Look'), () => this.lookAt(s), { size: 16 });
      }
      yy += 42;
    }
    const by = ui.H - 160;
    ui.button('d-check', PAD, by, 360, 76, t('Check my PPE'), () => this.checkDress(), { style: 'primary', size: 26 });
    ui.button('d-rack', PAD + 380, by, 260, 76, t('Go to the rack'), () => this.go('rack'), { size: 22 });
    ui.button('d-quit', W - PAD - 220, by, 220, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
  }

  lookAt(s) {
    const app = this.app;
    const p = s.obj.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3(1, 0, 0).transformDirection(app.workshop.room.matrixWorld);
    app.focusDesktop(p, p.clone().addScaledVector(n, 0.55).add(new THREE.Vector3(0, 0.12, 0)));
  }

  drawChecked(ui) {
    const app = this.app;
    const W = ui.W;
    const R = this.result;
    let y = 110;
    ui.badge(PAD, y, R.pass ? t('PPE check passed') : t('PPE check not passed'), R.pass ? 'ok' : 'bad', 24);
    ui.text(`${t('Job')}: ${jobLine(this.task)}`, PAD, y + 72, { size: 20, color: COLORS.dim, maxW: W - 2 * PAD });
    y = drawPPECheck(ui, R.chk, PAD, y + 86, W - 2 * PAD, { rowH: 38, notes: true, size: 20 });
    // defective items
    y += 8;
    ui.text(t('Damaged items on the rack'), PAD, y + 26, { size: 22, weight: 700 });
    y += 34;
    for (const d of R.defects) {
      const worn = R.worn.some((w) => w.id === d.id && w.defect === d.defect);
      const binned = R.binned.some((b) => b.id === d.id && b.defect === d.defect);
      const col = worn ? COLORS.bad : binned ? COLORS.ok : COLORS.warn;
      const state = worn ? t('worn — must not be used') : binned ? t('put in the bin') : t('left on the rack');
      ui.text(`${worn ? '✗' : binned ? '✓' : '!'} ${t(PPE_ITEMS[d.id].name)}: ${t(DEFECTS[d.defect].label)} — ${state}`, PAD, y + 24, { size: 19, color: col, maxW: W - 2 * PAD });
      y += 32;
    }
    if (R.wrongBinned.length) {
      ui.text(`${t('Good items put in the bin')}: ${R.wrongBinned.map((r) => t(PPE_ITEMS[r.id].name)).join(', ')}`, PAD, y + 24, { size: 18, color: COLORS.warn, maxW: W - 2 * PAD });
      y += 32;
    }
    ui.text(`${t('Sources')}: ${cites([{ ref: 'OSHA132', at: '(a)' }, { ref: 'HSE_SAFETY' }])} — ${t('the welder checks the equipment daily and reports defects (HSE).')}`, PAD, y + 22, { size: 16, color: COLORS.faint, maxW: W - 2 * PAD });
    const by = ui.H - 160;
    const bw = (W - 2 * PAD - 3 * 16) / 4;
    ui.button('c-fix', PAD, by, bw, 76, t('Change my PPE'), () => { this.step = 'dress'; app.main.invalidate(); }, { size: 22 });
    const canTry = this.job.tryWeld && app.renderer.xr.isPresenting;
    ui.button('c-try', PAD + bw + 16, by, bw, 76, t('Weld a test run'), () => this.startTryWeld(), { size: 22, style: 'primary', disabled: !canTry });
    ui.button('c-next', PAD + 2 * (bw + 16), by, bw, 76, t('Next job'), () => this.startDress((this.jobK + 1) % PPE_JOBS.length), { size: 22 });
    ui.button('c-quit', PAD + 3 * (bw + 16), by, bw, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
    if (!this.job.tryWeld && this.job.note) ui.text(t(this.job.note), PAD, by - 14, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
    else if (!app.renderer.xr.isPresenting) ui.text(t('The test run needs the headset.'), PAD, by - 14, { size: 17, color: COLORS.faint });
  }

  drawWeld(ui) {
    const app = this.app;
    const W = ui.W;
    let y = this.drawWeldControls(ui, 120);
    const list = app.safety.monitor.log;
    ui.text(this.drill === 'S1' ? t('Consequences so far') : t('Incidents so far'), PAD, y + 20, { size: 23, weight: 700 });
    drawIncidents(ui, list, PAD, y + 30, W - 2 * PAD, 6);
  }

  drawTryDone(ui) {
    const app = this.app;
    const W = ui.W;
    const sf = app.safety;
    const list = sf.monitor.log;
    const n = countIncidents(list);
    let y = 110;
    ui.badge(PAD, y, n.injuries || n.rules ? t('{i} injuries · {r} rules broken', { i: n.injuries, r: n.rules }) : t('No injuries, no rules broken'), n.injuries || n.rules ? 'bad' : 'ok', 24);
    y += 64;
    if (!list.length) y = ui.wrap(t('Your PPE protected you during this run. Remember: the consequences of missing PPE build up with exposure time (UV dose, fume) and chance (spatter).'), PAD, y, W - 2 * PAD, { size: 21, color: COLORS.dim });
    for (const inc of list.slice(-6)) {
      const def = INCIDENTS[inc.type];
      const col = def.severity === 'injury' ? COLORS.bad : def.severity === 'violation' ? COLORS.warn : COLORS.info;
      ui.text(`${t(def.title)}${inc.where ? ` (${t(inc.where)})` : ''}`, PAD, y + 26, { size: 22, weight: 700, color: col, maxW: W - 2 * PAD });
      const d = incidentDetail(inc);
      y += 34;
      if (d) y = ui.wrap(d, PAD + 20, y, W - 2 * PAD - 20, { size: 18, color: COLORS.text, maxLines: 1 });
      y = ui.wrap(`${t('Rule')}: ${t(def.rule.text)} (${cites(def.rule.refs)})`, PAD + 20, y, W - 2 * PAD - 20, { size: 17, color: COLORS.dim, maxLines: 2 }) + 6;
    }
    const by = ui.H - 160;
    const bw = (W - 2 * PAD - 2 * 16) / 3;
    ui.button('t-again', PAD, by, bw, 76, t('Change my PPE'), () => { this.step = 'dress'; this.go('rack'); app.main.invalidate(); }, { size: 22 });
    ui.button('t-next', PAD + bw + 16, by, bw, 76, t('Next job'), () => this.startDress((this.jobK + 1) % PPE_JOBS.length), { size: 22, style: 'primary' });
    ui.button('t-quit', PAD + 2 * (bw + 16), by, bw, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
  }

  drawHuntBrief(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 120;
    y = ui.wrap(t('Before welding, inspect the booth and the workshop around it. Some unsafe conditions have been set up. Point at each one and name it. Look at the cylinders, cables, extinguisher, curtain and signs, extraction hood, floor, gas store, cutting cart and grinder.'), PAD, y, W - 2 * PAD, { size: 22 });
    y += 20;
    ui.text(t('Number of unsafe conditions'), PAD, y + 34, { size: 22, color: COLORS.dim });
    ui.segmented('h-n', PAD + 360, y, 420, 56, [3, 5, 7].map((v) => ({ value: v, label: String(v) })), this.huntN, (v) => { this.huntN = v; app.main.invalidate(); }, { size: 24 });
    y += 90;
    y = ui.wrap(t('Use the Go to buttons to move between the bench, the PPE station, the walkway, the gas store and the grinding station.'), PAD, y, W - 2 * PAD, { size: 20, color: COLORS.dim });
    ui.button('h-start', PAD, ui.H - 160, 360, 76, t('Start the inspection'), () => this.startHunt(), { style: 'primary', size: 26 });
    ui.button('h-back', PAD + 380, ui.H - 160, 220, 76, t('Back'), () => { this.step = 'list'; this.drill = null; app.main.invalidate(); }, { size: 22 });
  }

  drawHunt(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 120;
    const tagged = Object.values(this.tags).reduce((a, tg) => a + (tg.choices ? tg.choices.length : 0), 0);
    const el = app.time - this.huntT0;
    ui.text(t('{n} unsafe conditions to find · tagged {k}', { n: this.present.length, k: tagged }), PAD, y + 24, { size: 26, weight: 700 });
    ui.text(`${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, '0')}`, W - PAD, y + 24, { size: 26, color: COLORS.dim, align: 'end' });
    y += 50;
    y = this.navButtons(ui, y);
    y += 10;
    ui.text(t('Your tags'), PAD, y + 26, { size: 22, weight: 700 });
    y += 36;
    for (const id in this.tags) {
      const tg = this.tags[id];
      const spot = SPOTS.find((s) => s.id === id);
      const names = tg.choices && tg.choices.length ? tg.choices.map((h) => t(HAZARDS[h].title)).join(' · ') : t('nothing wrong');
      ui.text(`${t(spot.label)}: ${names}`, PAD, y + 24, { size: 19, color: tg.choices && tg.choices.length ? COLORS.accent : COLORS.dim, maxW: W - 2 * PAD });
      y += 30;
      if (y > ui.H - 200) break;
    }
    ui.button('h-finish', PAD, ui.H - 160, 360, 76, t('Finish the inspection'), () => this.finishHunt(), { style: 'primary', size: 24 });
    ui.button('h-quit', W - PAD - 220, ui.H - 160, 220, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
  }

  drawTag(ui) {
    const app = this.app;
    const W = ui.W;
    const p = this.pick;
    if (!p) return;
    let y = 120;
    if (this.drill === 'S2') {
      const spot = SPOTS.find((s) => s.id === p.id);
      ui.text(t(spot.label), PAD, y + 28, { size: 28, weight: 700, maxW: W - 2 * PAD });
      ui.text(t('What is wrong here? Choose all that apply.'), PAD, y + 70, { size: 22, color: COLORS.dim });
      y += 96;
      const d = this.draft || { choices: [], none: false };
      const opts = spot.hazards.map((h) => ({ id: h, label: t(HAZARDS[h].title), sel: d.choices.includes(h) })).concat([{ id: 'none', label: t('Nothing wrong here'), sel: d.none }]);
      opts.forEach((o) => {
        ui.button(`tag-${o.id}`, PAD, y, W - 2 * PAD, 74, `${o.sel ? '✓ ' : ''}${o.label}`, () => this.toggleTag(o.id), { size: 24, style: o.id === 'none' ? 'ghost' : undefined, selected: o.sel });
        y += 86;
      });
      ui.button('tag-done', W - PAD - 300, ui.H - 160, 300, 70, t('Done'), () => this.closeTag(true), { size: 24, style: 'primary', disabled: !d.choices.length && !d.none });
    } else {
      const names = { entrance: 'Walkway at the booth entrance', extinguisher: 'Fire extinguisher', curtain: 'Booth curtain', smoulder: 'Smoke rising here', sweep: 'Wood shavings beside the booth', bin: 'Rag bin', blanket: 'Covered combustibles' };
      ui.text(t(names[p.id] || p.id), PAD, y + 28, { size: 28, weight: 700, maxW: W - 2 * PAD });
      y += 60;
      const acts = this.actionsFor(p.id);
      if (!acts.length) ui.text(t('Nothing to do here.'), PAD, y + 30, { size: 22, color: COLORS.dim });
      acts.forEach((a) => {
        ui.button(`act-${a.id}`, PAD, y, W - 2 * PAD, 74, t(a.label), () => this.doAction(p.id, a.id), { size: 23 });
        y += 86;
      });
    }
    ui.button('tag-cancel', PAD, ui.H - 160, 260, 70, t('Cancel'), () => this.closeTag(false), { size: 22 });
  }

  drawHuntDone(ui) {
    const app = this.app;
    const W = ui.W;
    const R = this.huntResult;
    let y = 110;
    ui.badge(PAD, y, `${t('Score')} ${Math.round(R.score * 100)}% · ${t('found')} ${R.found.length} / ${this.present.length}`, R.score >= 0.99 ? 'ok' : R.score >= 0.6 ? 'warn' : 'bad', 24);
    ui.text(`${t('Time')}: ${Math.floor(R.time / 60)} min ${Math.round(R.time % 60)} s`, W - PAD, y + 30, { size: 20, color: COLORS.dim, align: 'end' });
    y += 62;
    const per = 4;
    const pages = Math.ceil(this.present.length / per);
    const list = this.present.slice(this.page * per, this.page * per + per);
    for (const h of list) {
      const H = HAZARDS[h];
      const st = R.found.includes(h) ? 'found' : R.misnamed.includes(h) ? 'misnamed' : 'missed';
      const col = st === 'found' ? COLORS.ok : st === 'misnamed' ? COLORS.warn : COLORS.bad;
      const lab = st === 'found' ? t('found') : st === 'misnamed' ? t('right place, wrong name') : t('missed');
      ui.text(`${st === 'found' ? '✓' : '✗'} ${t(H.title)} — ${lab}`, PAD, y + 26, { size: 22, weight: 700, color: col, maxW: W - 2 * PAD });
      y = ui.wrap(`${t(H.what)} ${t('Fix')}: ${t(H.fix)}`, PAD + 24, y + 34, W - 2 * PAD - 24, { size: 18, color: COLORS.text, maxLines: 2 });
      y = ui.wrap(`${t('Rule')}: ${t(H.rule)} (${cites(H.refs)})`, PAD + 24, y, W - 2 * PAD - 24, { size: 17, color: COLORS.dim, maxLines: 3 }) + 8;
    }
    if (R.falseAlarms.length && this.page === pages - 1) {
      ui.text(`${t('Tagged but not present')}: ${R.falseAlarms.map((h) => t(HAZARDS[h].title)).join(', ')}`, PAD, y + 24, { size: 19, color: COLORS.warn, maxW: W - 2 * PAD });
    }
    const by = ui.H - 160;
    if (pages > 1) ui.stepper('hd-page', PAD, by - 74, 280, 56, null, `${this.page + 1} / ${pages}`, (d) => { this.page = Math.max(0, Math.min(pages - 1, this.page + d)); app.main.invalidate(); });
    const bw = (W - 2 * PAD - 2 * 16) / 3;
    ui.button('hd-again', PAD, by, bw, 76, t('New inspection'), () => { this.endDrillKeep(); this.startHunt(); }, { size: 22, style: 'primary' });
    ui.button('hd-list', PAD + bw + 16, by, bw, 76, t('Safety drills'), () => this.endDrill(), { size: 22 });
    ui.button('hd-home', PAD + 2 * (bw + 16), by, bw, 76, t('Main menu'), () => app.goHome(), { size: 22 });
  }

  // reset the scene between two runs of the same drill
  endDrillKeep() {
    const sf = this.app.safety;
    sf.setHazards([]);
    this.clearMarkers();
  }

  drawPermitBrief(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 120;
    y = ui.wrap(t('A repair weld has to be made in the booth. Hot work needs a permit: check the area, put right what is wrong, then sign. The permit can only be signed when every item is true. After the work, keep the fire watch.'), PAD, y, W - 2 * PAD, { size: 22 });
    y += 24;
    ui.text(t('Fire watch rule to follow'), PAD, y + 30, { size: 22, color: COLORS.dim });
    ui.segmented('p-rule', PAD + 330, y, W - 2 * PAD - 330, 60, Object.keys(FIRE_WATCH_RULES).map((k) => ({ value: k, label: `${FIRE_WATCH_RULES[k].label}: ${FIRE_WATCH_RULES[k].minutes} min` })), this.watchRule, (v) => { this.watchRule = v; app.main.invalidate(); }, { size: 19 });
    y += 84;
    y = ui.wrap(t('OSHA 1910.252 requires a fire watch for at least half an hour after the work; ANSI Z49.1:2021 requires at least one hour (NFPA 51B adopted a one-hour fire watch in 2019). Follow the rule that applies at your site.'), PAD, y, W - 2 * PAD, { size: 18, color: COLORS.faint });
    ui.text(cites([...FIRE_WATCH_RULES.osha.refs, ...FIRE_WATCH_RULES.z49.refs, { ref: 'Z49', at: 'E6.2.4' }]), PAD, y + 22, { size: 16, color: COLORS.faint, maxW: W - 2 * PAD });
    ui.button('p-start', PAD, ui.H - 160, 360, 76, t('Start'), () => this.startPermit(), { style: 'primary', size: 26 });
    ui.button('p-back', PAD + 380, ui.H - 160, 220, 76, t('Back'), () => { this.step = 'list'; this.drill = null; app.main.invalidate(); }, { size: 22 });
  }

  drawPermit(ui) {
    const app = this.app;
    const W = ui.W;
    let y = 112;
    ui.text(t('Hot work permit'), PAD, y + 28, { size: 28, weight: 700 });
    ui.text(t('Booth 1 · repair weld · GMAW (135)'), W - PAD, y + 28, { size: 20, color: COLORS.dim, align: 'end' });
    y += 48;
    y = this.navButtons(ui, y);
    const s = this.permitState();
    for (const p of PERMIT_ITEMS) {
      const ok = s[p.id];
      ui.rect(PAD, y + 4, W - 2 * PAD, 84, COLORS.bg2, 12, ok ? '#1f4a33' : COLORS.line);
      ui.text(ok ? '✓' : '○', PAD + 18, y + 54, { size: 30, weight: 700, color: ok ? COLORS.ok : COLORS.faint });
      ui.text(t(p.text), PAD + 60, y + 40, { size: 20, maxW: W - 2 * PAD - 80 - (p.id === 'watch' ? 250 : 0) });
      ui.text(cites(p.refs), PAD + 60, y + 72, { size: 15, color: COLORS.faint, maxW: W - 2 * PAD - 80 - (p.id === 'watch' ? 250 : 0) });
      if (p.id === 'watch') ui.button('p-watch', W - PAD - 240, y + 16, 224, 60, this.permit.watchAgreed ? t('Assigned') : t('I will keep it'), () => { this.permit.watchAgreed = true; app.main.invalidate(); }, { size: 20, selected: this.permit.watchAgreed });
      y += 94;
    }
    ui.text(t('Point at things in the workshop to put them right.'), PAD, y + 26, { size: 19, color: COLORS.dim });
    ui.button('p-sign', PAD, ui.H - 160, 360, 76, t('Sign the permit'), () => this.signPermit(), { style: 'primary', size: 26 });
    ui.button('p-quit', W - PAD - 220, ui.H - 160, 220, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
  }

  drawWatch(ui) {
    const app = this.app;
    const W = ui.W;
    const w = this.watch;
    const rule = FIRE_WATCH_RULES[this.watchRule];
    let y = 112;
    const m = Math.floor(w.simT / 60);
    ui.text(t('Fire watch'), PAD, y + 28, { size: 28, weight: 700 });
    ui.text(t('{m} of at least {n} min', { m, n: rule.minutes }), W - PAD, y + 28, { size: 26, weight: 700, color: m >= rule.minutes ? COLORS.ok : COLORS.accent, align: 'end' });
    y += 48;
    ui.meter(PAD, y + 10, W - 2 * PAD, 22, w.simT / 60, 0, Math.max(rule.minutes * 1.5, 10), rule.minutes, Math.max(rule.minutes * 1.5, 10));
    y += 50;
    y = this.navButtons(ui, y);
    y = ui.wrap(t('Patrol the area the sparks could reach (up to 35 ft / 10.7 m): look for smoke or glowing material, including behind and below the booth walls. Point at a place to check it.'), PAD, y + 4, W - 2 * PAD, { size: 19, color: COLORS.dim });
    if (w.found) ui.text(t('Smouldering spot found at {m} min.', { m: Math.floor(w.found.t / 60) }), PAD, y + 30, { size: 22, color: COLORS.ok });
    ui.text(`${t('Rule')}: ${t('a fire watch is kept for at least {n} minutes after the work', { n: rule.minutes })} (${cites(rule.refs)})`, PAD, ui.H - 190, { size: 17, color: COLORS.faint, maxW: W - 2 * PAD });
    ui.button('w-end', PAD, ui.H - 160, 360, 76, t('End the fire watch'), () => this.endWatch(), { style: m >= rule.minutes ? 'primary' : undefined, size: 24 });
    ui.button('w-quit', W - PAD - 220, ui.H - 160, 220, 76, t('Quit drill'), () => this.endDrill(), { size: 22 });
  }

  drawPermitDone(ui) {
    const app = this.app;
    const W = ui.W;
    const w = this.watch;
    const rule = FIRE_WATCH_RULES[this.watchRule];
    const p = this.permit;
    let y = 110;
    const ok = !w.early && w.found && !w.fire;
    ui.badge(PAD, y, ok ? t('Hot work done safely') : t('Fire precautions not complete'), ok ? 'ok' : 'bad', 24);
    y += 70;
    const lines = [];
    lines.push({ ok: p.refused === 0, text: p.refused ? t('Tried to sign the permit {n} times before the area was safe.', { n: p.refused }) : t('Permit signed only when every item was true.') });
    if (p.actions.includes('cover')) lines.push({ ok: true, text: t('Combustibles covered with a fire-resistant blanket (relocation is preferred where practicable; a fire watch is then required).'), refs: [{ ref: 'OSHA252', at: '(a)(2)(vii), (a)(2)(iii)(A)' }] });
    if (p.actions.includes('move')) lines.push({ ok: true, text: t('Combustibles moved out of the area.'), refs: [{ ref: 'OSHA252', at: '(a)(2)(vii)' }] });
    lines.push({ ok: !w.early, text: w.early ? t('Fire watch ended after {m} min: the rule requires at least {n} min.', { m: Math.floor(w.endedAt / 60), n: rule.minutes }) : t('Fire watch kept for {m} min (at least {n} min required).', { m: Math.floor(w.endedAt / 60), n: rule.minutes }), refs: rule.refs });
    if (w.found) lines.push({ ok: !w.fire, text: w.fire ? t('The smouldering spot had already caught fire when it was found ({m} min).', { m: Math.floor(w.found.t / 60) }) : t('Smouldering spot found and put out at {m} min.', { m: Math.floor(w.found.t / 60) }) });
    else lines.push({ ok: false, text: w.simT < w.appear ? t('A spark was smouldering unseen; it started to smoke after the watch had ended and became a fire.') : t('The smouldering spot was not found; it became a fire.'), refs: [{ ref: 'FS6' }] });
    if (w.fire) lines.push({ ok: false, text: t('Fire: fire watchers try to put out a fire only when it is obviously within the capacity of the equipment, otherwise they sound the alarm.'), refs: [{ ref: 'OSHA252', at: '(a)(2)(iii)(B)' }] });
    for (const l of lines) {
      ui.text(l.ok ? '✓' : '✗', PAD, y + 26, { size: 26, weight: 700, color: l.ok ? COLORS.ok : COLORS.bad });
      y = ui.wrap(l.text, PAD + 40, y + 4, W - 2 * PAD - 40, { size: 20, color: COLORS.text, maxLines: 3 });
      if (l.refs) y = ui.wrap(cites(l.refs), PAD + 40, y, W - 2 * PAD - 40, { size: 16, color: COLORS.faint, maxLines: 1 });
      y += 10;
    }
    ui.wrap(t('Sparks can travel up to 35 ft (10.7 m) and pass through cracks and openings; smouldering may not show smoke or flame for some time. After welding, examine the area for evidence of fire.'), PAD, y + 10, W - 2 * PAD, { size: 18, color: COLORS.dim });
    const by = ui.H - 160;
    const bw = (W - 2 * PAD - 2 * 16) / 3;
    ui.button('pd-again', PAD, by, bw, 76, t('Run it again'), () => { this.endDrillKeep(); this.smoulder.set(0); this.startPermit(); }, { size: 22, style: 'primary' });
    ui.button('pd-list', PAD + bw + 16, by, bw, 76, t('Safety drills'), () => this.endDrill(), { size: 22 });
    ui.button('pd-home', PAD + 2 * (bw + 16), by, bw, 76, t('Main menu'), () => app.goHome(), { size: 22 });
  }
}
