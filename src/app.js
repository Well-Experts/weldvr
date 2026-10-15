// Application shell: renderer, scene, XR session, input, panels, helmet, audio and the per-frame
// loop. Training logic lives in the modes (modes.js); welding physics in the sim/ folder.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildEnvironment } from './render/environment.js';
import { buildWorkshop } from './render/workshop.js';
import { SafetySystem } from './safety/system.js';
import { WeldFX } from './render/effects.js';
import { Helmet, NodDetector, arcVisibility } from './render/helmet.js';
import { buildGun, rayPoseForTip } from './render/torch.js';
import { buildStinger } from './render/stinger.js';
import { buildTigTorch } from './render/tigTorch.js';
import { buildFillerRod } from './render/fillerRod.js';
import { CueStrip, CoupledCues, makeGhost } from './render/cues.js';
import { XRInput } from './xr/input.js';
import { UIManager, Panel } from './ui/ui.js';
import { ArcAudio } from './audio/arcAudio.js';
import { WeldStation } from './weld/station.js';
import { setLang, isRTL, t } from './ui/i18n.js';
import { buildFilletGauge, buildBridgeGauge, buildBrush, buildChippingHammer, buildThermometer, Readout, measure } from './inspect/tools.js';
import { Kit } from './render/kit.js';
import { GLOW_EXPO } from './render/thermalTex.js';
import { surfaceHeight } from './sim/session.js';
import { pipePoint, pipeFrame } from './sim/pipe.js';
import { clamp } from './sim/util.js';
import * as screens from './ui/screens.js';
import { drawLab } from './ui/lab.js';
import { HomeMode } from './modes.js';
import { PlanDriver } from './weld/driver.js';
import { ELECTRODES } from './sim/smaw.js';
import { TUNGSTENS } from './sim/gtaw.js';
import { CutStation } from './weld/cutStation.js';
import { torchPose } from './sim/cutScript.js';
import { buildCutTorch, buildSparkLighter } from './render/cutTorch.js';
import { OxyFlame } from './render/oxyFlame.js';
import { OxyAudio } from './audio/oxyAudio.js';

const STORE = 'wellexperts.weldvr.settings.v1';
const DEFAULTS = {
  lang: 'en', hand: 'right', fps: 'auto', foveation: 'medium', shade: 11, nod: true, haptics: true,
  volume: 0.8, cues: true, benchHeight: 0.9, neck: 45, booth: true, bench: true,
  // booth set-up before a weld in the welding modes: 'auto' (standard PPE put on, extraction placed,
  // curtain closed) or 'trainee' (the trainee does it; the safety checks show what is missing)
  setup: 'auto',
  // welder name and identification on the qualification training records
  trainee: 'Trainee', traineeId: '',
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { ...DEFAULTS, ...s };
  } catch {
    return { ...DEFAULTS };
  }
}

const FOVEATION = { off: 0, low: 0.3, medium: 0.6, high: 1 };

// GTAW filler rod in the off hand (mm): length in front of the fingers for a fresh rod, the most and the
// least the trainee can slide it to, rod kept behind the fingers to hold it, feed speed of the thumbstick.
// Design values of the simulator.
const ROD_AHEAD = 220;
const ROD_AHEAD_MAX = 320;
const ROD_AHEAD_MIN = 40;
const ROD_GRIP = 40;
const ROD_FEED = 70; // mm/s at full thumbstick

export class App {
  constructor(container, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.settings = loadSettings();
    setLang(this.settings.lang);

    // ---- renderer ----------------------------------------------------------------------------
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.clientWidth, container.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.bg = new THREE.Color(0x0e1116);
    this.scene.background = this.bg;
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.02, 60);
    this.camera.position.set(0.42, 1.62, 0.62);
    this.scene.add(this.camera);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.time = 0;

    // ---- world -------------------------------------------------------------------------------
    this.workstation = new THREE.Group();
    this.workstation.name = 'workstation';
    this.scene.add(this.workstation);
    this.env = buildEnvironment(r, this.scene);
    this.workshop = buildWorkshop();
    this.scene.add(this.workshop.room);
    this.workstation.add(this.env.bench);
    this.placeWorkstation(new THREE.Vector3(0, 0, -0.5), 0);

    this.fx = new WeldFX();
    this.fx.extractor = null; // set every frame from the extraction hood (safety system)
    this.workstation.add(this.fx.group);
    this.kit = new Kit(this.env);
    this.kit.setFloor(this.settings.benchHeight);
    this.coolAccel = 1; // time acceleration while the arc is off (interpass cooling)
    this.coolPending = 0; // accelerated cooling time not yet applied (s)
    this.thermalView = false; // thermal-camera colours on the coupon (training aid)
    this.station = new WeldStation(this);
    this.cut = new CutStation(this); // oxy-fuel cutting bench (shown in the cutting mode)
    this.cues3d = new CoupledCues();

    // ---- helmet, cues, flash ----------------------------------------------------------------
    this.helmet = new Helmet();
    this.helmet.shade = this.settings.shade;
    this.camera.add(this.helmet.group);
    this.nod = new NodDetector();
    this.cueStrip = new CueStrip();
    this.camera.add(this.cueStrip.mesh);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.flash.position.set(0, 0, -0.09);
    this.flash.renderOrder = 10010;
    this.flash.visible = false;
    this.camera.add(this.flash);
    this.flashLevel = 0;
    this.toast = new Panel({ name: 'toast', width: 1024, height: 128, widthM: 0.11, draw: (ui) => screens.drawToast(ui, this) });
    this.toast.mesh.position.set(0, 0.03, -0.1);
    this.toast.mesh.renderOrder = 10020;
    this.toast.material.depthTest = false;
    this.toast.mesh.visible = false;
    this.camera.add(this.toast.mesh);
    this.toastMsg = null;
    this.toastT = 0;

    // ---- input & tools ---------------------------------------------------------------------
    this.input = new XRInput(r, this.scene);
    // hand tool of the loaded process: MIG/MAG gun, the SMAW electrode holder or the GTAW torch
    // (selectTorch); GTAW also puts a filler rod in the off hand
    this.migGun = buildGun({ neckAngle: this.settings.neck });
    this.stinger = buildStinger();
    this.tigTorch = buildTigTorch();
    // oxy-fuel cutting torch with its flame at the tip, and the spark lighter for the off hand
    this.cutTorch = buildCutTorch();
    this.oxyFlame = new OxyFlame();
    this.oxyFlame.group.position.copy(this.cutTorch.kin.T);
    this.oxyFlame.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.cutTorch.kin.D);
    this.cutTorch.group.add(this.oxyFlame.group);
    this.lighter = buildSparkLighter();
    this.lighter.group.visible = false;
    this.rod = buildFillerRod({ dia: 2.4 });
    this.rod.group.visible = false;
    this.rodHold = { ahead: ROD_AHEAD, lastLen: null };
    this.demoRod = buildFillerRod({ dia: 2.4 });
    this.demoRod.group.visible = false;
    this.scene.add(this.demoRod.group);
    this.rodSim = [0, 0, 0];
    this.tungGlow = 0;
    this.gun = this.migGun;
    this.ghost = makeGhost(this.gun.group);
    this.ghostKin = { D: this.gun.kin.D.clone(), T: this.gun.kin.T.clone() };
    this.scene.add(this.ghost);
    this.desktopGun = new THREE.Group();
    this.desktopGun.name = 'desktopGun';
    this.scene.add(this.desktopGun);
    this.tools = {
      fillet: buildFilletGauge(),
      bridge: buildBridgeGauge(),
      brush: buildBrush(),
      hammer: buildChippingHammer(),
      thermo: buildThermometer(),
    };
    this.thermoReading = null; // contact thermometer display value (C)
    this.toolHolder = new THREE.Group();
    this.toolHolder.scale.setScalar(0.001);
    this.toolHolder.rotation.x = -Math.PI / 4;
    for (const k in this.tools) {
      this.tools[k].visible = false;
      this.toolHolder.add(this.tools[k]);
    }
    this.snapGauge = new THREE.Group(); // gauge seated on the weld (in coupon mm)
    this.readout = new Readout();
    this.scene.add(this.readout.sprite);
    this.tool = 'gun';
    this.offHandModel = this.makeOffHand();
    this.pointerLines = { left: this.makePointerLine(), right: this.makePointerLine() };
    this.cursor = new THREE.Mesh(new THREE.CircleGeometry(0.006, 20), new THREE.MeshBasicMaterial({ color: 0xf2b51c, depthTest: false, transparent: true, toneMapped: false }));
    this.cursor.renderOrder = 9630;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.cursor2 = this.cursor.clone();
    this.scene.add(this.cursor2);
    this.lastMeasure = null;

    // ---- panels ------------------------------------------------------------------------------
    this.ui = new UIManager();
    this.ui.rtl = isRTL();
    this.ui.onClick = (key) => {
      const side = key === 'dom' ? this.domSide : key === 'off' ? this.offSide : null;
      if (side) this.input.pulse(side, 0.35, 25);
    };
    this.main = this.ui.add(new Panel({ name: 'main', width: 1280, height: 960, widthM: 0.62, draw: (ui) => this.drawMain(ui) }));
    this.workstation.add(this.main.mesh);
    this.machine = this.ui.add(new Panel({ name: 'machine', width: 640, height: 600, widthM: 0.2, draw: (ui) => screens.drawMachine(ui, this) }));
    this.env.machineFrontAnchor.add(this.machine.mesh);
    this.machine.mesh.position.set(0, 0.02, 0.008);
    this.gasPanel = this.ui.add(new Panel({ name: 'gas', width: 512, height: 420, widthM: 0.16, draw: (ui) => screens.drawGas(ui, this) }));
    this.workstation.add(this.gasPanel.mesh);
    this.sitePanel = this.ui.add(new Panel({ name: 'site', width: 512, height: 420, widthM: 0.16, draw: (ui) => screens.drawSite(ui, this) }));
    this.workstation.add(this.sitePanel.mesh);
    this.section = this.ui.add(new Panel({ name: 'section', width: 1024, height: 860, widthM: 0.4, draw: (ui) => screens.drawSection(ui, this) }));
    this.workstation.add(this.section.mesh);
    this.section.visible = false;
    this.sectionX = null;
    // test lab of the welder qualification: film, bend specimens, fracture faces, macro sections
    this.lab = this.ui.add(new Panel({ name: 'lab', width: 1024, height: 860, widthM: 0.42, draw: (ui) => drawLab(ui, this) }));
    this.workstation.add(this.lab.mesh);
    this.lab.visible = false;
    this.labView = null;
    this.cutMarker = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xff4b3a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    this.cutMarker.rotation.y = Math.PI / 2;
    this.cutMarker.visible = false;
    this.findingMarker = new THREE.Mesh(new THREE.TorusGeometry(5, 0.6, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd36a, depthTest: false, transparent: true, toneMapped: false }));
    this.findingMarker.renderOrder = 9650;
    this.findingMarker.visible = false;
    this.layoutPanels();

    // ---- desktop -------------------------------------------------------------------------------
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(-0.08, 1.0, -0.5);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 3;
    this.controls.minDistance = 0.15;
    this.controls.update();
    this.mouse = { ndc: new THREE.Vector2(), inside: false, click: false, scroll: 0, overUI: false, sceneClick: false, downAt: null };
    this.worldPointers = []; // pointers not on a panel: {key, origin, dir, press} (modes pick scene objects)
    this.worldHit = {}; // per pointer key: distance to a scene object it points at (line length)
    this.bindDesktop();
    window.addEventListener('resize', () => this.onResize());

    // ---- XR ----------------------------------------------------------------------------------
    this.xrMode = null; // 'vr' | 'ar' | null
    r.xr.addEventListener('sessionstart', () => this.onSessionStart());
    r.xr.addEventListener('sessionend', () => this.onSessionEnd());
    this.frameStats = { times: [], over: 0, n: 0, budget: 1 / 72, lastRateCheck: 0 };

    // scratch
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.q1 = new THREE.Quaternion();
    this.tipSim = [0, 0, 0];
    this.dirSim = [0, 0, -1];
    this.tipW = new THREE.Vector3();
    this.axisW = new THREE.Vector3();
    this.headPos = new THREE.Vector3();
    this.headQuat = new THREE.Quaternion();

    this.audio = null;
    this.listener = null;
    this.perf = { update: 0, fx: 0, ui: 0, render: 0, calls: 0, tris: 0 };
    this.mode = null;
    this.handBusy = { left: false, right: false };
    this.safety = new SafetySystem(this);
    this.setMode(new HomeMode(this));
    this.prewarm();
    r.setAnimationLoop((time, frame) => this.frame(time, frame));
  }

  // Compile every shader up front so the first arc start does not stall a frame.
  prewarm() {
    const hidden = [];
    const show = (o) => {
      if (o && !o.visible) {
        o.visible = true;
        hidden.push(o);
      }
    };
    const pool = this.station.coupon ? this.station.coupon.pool.mesh : null;
    for (const o of [pool, this.fx.arc, this.fx.drop, this.fx.core, this.fx.glare, this.helmet.shell, this.cueStrip.mesh, this.flash, this.ghost, this.toast.mesh, this.readout.sprite, this.cursor, this.findingMarker, this.cutMarker]) show(o);
    for (const k in this.tools) show(this.tools[k]);
    this.scene.add(this.toolHolder);
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      console.warn('prewarm', e);
    }
    this.scene.remove(this.toolHolder);
    for (const o of hidden) o.visible = false;
  }

  // ---- settings ------------------------------------------------------------------------------
  get domSide() {
    return this.settings.hand === 'left' ? 'left' : 'right';
  }

  get offSide() {
    return this.settings.hand === 'left' ? 'right' : 'left';
  }

  saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.settings));
    } catch {
      /* storage may be unavailable */
    }
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    if (key === 'lang') {
      setLang(value);
      this.ui.rtl = isRTL();
      this.ui.invalidateAll();
      this.toast.invalidate();
    }
    if (key === 'hand') {
      this.attachHands();
      this.layoutPanels();
      this.mode?.onHandChange?.();
    }
    if (key === 'shade') this.helmet.shade = value;
    if (key === 'haptics') this.input.hapticsOn = value;
    if (key === 'volume' && this.audio) this.audio.setVolume(value);
    if (key === 'foveation') this.renderer.xr.setFoveation(FOVEATION[value] ?? 0.6);
    if (key === 'fps') this.applyFrameRate();
    if (key === 'benchHeight') this.placeWorkstation(this.workstation.position.clone().setY(0), this.workstation.rotation.y);
    if (key === 'booth' || key === 'bench') this.applyVisibility();
    if (key === 'neck') this.rebuildGun();
    this.ui.invalidateAll();
  }

  // Lower or raise the helmet; only possible when a welding helmet is worn (PPE).
  toggleHelmet() {
    if (this.helmet.kind === 'none') {
      this.say(t('You are not wearing a welding helmet. Take one from the PPE rack.'));
      return;
    }
    this.helmet.toggle();
  }

  rebuildGun() {
    const active = this.gun === this.migGun;
    if (active && this.gun.group.parent) this.gun.group.parent.remove(this.gun.group);
    this.migGun = buildGun({ neckAngle: this.settings.neck });
    if (active) {
      this.gun = this.migGun;
      this.rebuildGhost();
      this.attachHands();
    }
  }

  rebuildGhost() {
    this.scene.remove(this.ghost);
    this.ghost = makeGhost(this.gun.group);
    // the ghost keeps the tool geometry of the moment it was made (electrode length)
    this.ghostKin = { D: this.gun.kin.D.clone(), T: this.gun.kin.T.clone() };
    this.scene.add(this.ghost);
  }

  // The hand tool for a process: the SMAW electrode holder for 111, the GTAW torch for 141, the MIG/MAG
  // gun otherwise.
  selectTorch(process) {
    const want = process === '81' ? this.cutTorch : process === '111' ? this.stinger : process === '141' ? this.tigTorch : this.migGun;
    if (want === this.gun) return;
    if (this.gun.group.parent) this.gun.group.parent.remove(this.gun.group);
    this.gun = want;
    this.rebuildGhost();
    this.attachHands();
    this.mode?.onTorchChange?.();
  }

  // SMAW: show the electrode in the holder as it is in the session (type, size, length left).
  syncElectrode(hot = false) {
    const st = this.station;
    if (this.gun !== this.stinger || !st.session) return;
    const s = st.session.settings;
    const E = st.electrode;
    if (this.stinger.type !== s.electrode || this.stinger.dia !== s.dia) this.stinger.setElectrode(s.electrode, s.dia);
    if (E) this.stinger.setStickOut(E.L, hot, E.stuck);
  }

  // SMAW: take the stub out of the holder and fit a new electrode. The holder and electrode are live
  // while the machine is on: CCOHS "When changing the welding electrode, there is a danger of shock
  // equal to the no-load voltage output of the welding machine" (the safety system checks the gloves).
  changeElectrode() {
    const st = this.station;
    if (!st.session || st.session.settings.process !== '111' || st.frozen) return false;
    if (st.lastState && st.lastState.arcOn) {
      this.say(t('Break the arc before you change the electrode.'));
      return false;
    }
    const e = st.newElectrode();
    if (!e) return false;
    this.syncElectrode(false);
    const shocked = this.safety.onElectrodeChange();
    if (!shocked) this.say(t('New electrode in the holder: {e} Ø {d} mm.', { e: e.type, d: e.dia }), 2.5);
    this.input.pulse(this.domSide, 0.35, 40);
    this.mode?.onElectrodeChange?.();
    this.ui.invalidateAll();
    return true;
  }

  // ---- GTAW: torch, tungsten and filler rod ---------------------------------------------------------
  // Tungsten as it is in the session (clean, contaminated, oxidised) and its glow after the arc.
  syncTig(dt) {
    const st = this.station;
    if (this.gun !== this.tigTorch || !st.session) return;
    const T = st.tig;
    const arcOn = !!(st.lastState && st.lastState.arcOn);
    // white hot while the arc burns, cooling in a few seconds under the post-flow (display)
    this.tungGlow = arcOn ? 1 : Math.max(0, this.tungGlow - dt / 2.5);
    this.tigTorch.setStickOut(5, this.tungGlow * this.tungGlow);
    this.tigTorch.setTungsten(T && T.contaminated ? 'contaminated' : T && T.oxidized ? 'oxidized' : 'clean');
  }

  // Off-hand filler rod: the melted length comes off its tip (the tip moves back toward the fingers);
  // the thumbstick of that hand slides the rod forward or back through the fingers.
  syncRod(dt) {
    const st = this.station;
    const T = st.tig;
    const tig = !!(T && this.gun === this.tigTorch);
    const off = this.input.hands[this.offSide];
    this.rod.group.visible = tig && this.tool === 'gun' && !this.grab && this.renderer.xr.isPresenting && !!off.connected;
    if (!tig) return;
    const H = this.rodHold;
    if (H.lastLen == null || T.rodLen > H.lastLen + 1) H.ahead = Math.min(ROD_AHEAD, T.rodLen - ROD_GRIP); // a new rod
    const used = H.lastLen == null ? 0 : Math.max(0, H.lastLen - T.rodLen);
    H.lastLen = T.rodLen;
    H.ahead = Math.max(0, H.ahead - used);
    if (this.rod.group.visible && !(this.uiHover && this.uiHover.off)) {
      const f = -off.stick.y; // thumbstick forward: slide the rod out
      if (f > 0.3) H.ahead = Math.min(ROD_AHEAD_MAX, Math.max(0, T.rodLen - ROD_GRIP), H.ahead + ROD_FEED * f * dt);
      else if (f < -0.3) H.ahead = Math.max(Math.min(ROD_AHEAD_MIN, H.ahead), H.ahead + ROD_FEED * f * dt);
    }
    this.rod.setRod(T.rodLen, H.ahead);
    this.rod.setTip(clamp(1 - T.rodHotT / 2, 0, 1), T.rodOxide);
  }

  // Filler-rod tip in sim coordinates, or null when the rod is not in the hand.
  rodTipSim() {
    if (!this.rod.group.visible || !this.rod.group.parent) return null;
    const off = this.input.hands[this.offSide];
    if (!off.tracked) return null;
    this.rod.group.updateWorldMatrix(true, false);
    const w = this.v3.copy(this.rod.tipLocal).applyMatrix4(this.rod.group.matrixWorld);
    this.station.simFromWorld(w, null, this.rodSim, null);
    return this.rodSim;
  }

  // Demonstration and replay: a rod drawn to the recorded tip, coming from ahead of the pool at 15
  // degrees to the work (TWI: filler rod 10-20 degrees to the surface).
  poseDemoRod(rod) {
    const st = this.station;
    const T = st.tig;
    if (!rod || !T || !st.coupon) {
      this.demoRod.group.visible = false;
      return;
    }
    const a = (15 * Math.PI) / 180;
    st.worldFromSim(rod[0], rod[1], rod[2], this.v1);
    st.dirWorldFromSim([Math.cos(a), 0, Math.sin(a)], this.v2); // from the tip back along the rod
    const ahead = 200;
    this.demoRod.setRod(Math.max(T.rodLen, ahead + 20), ahead);
    this.demoRod.setTip(clamp(1 - T.rodHotT / 2, 0, 1), T.rodOxide);
    this.demoRod.group.position.copy(this.v1).addScaledVector(this.v2, ahead / 1000);
    this.demoRod.group.quaternion.setFromUnitVectors(this.v3.set(0, 0, 1), this.v2);
    this.demoRod.group.visible = true;
  }

  // GTAW: regrind the tungsten after contamination (Miller OM-215994: "Remove 1/2 in. of contaminated
  // tungsten and repoint tungsten"). Thoriated tungsten is radioactive; its grinding dust is the hazard
  // (AWS Safety and Health Fact Sheet No. 27).
  regrindTungsten() {
    const st = this.station;
    if (!st.tig) return false;
    if (st.lastState && st.lastState.arcOn) {
      this.say(t('Stop the arc before you regrind the tungsten.'));
      return false;
    }
    if (!st.regrindTungsten()) return false;
    const s = st.session.settings;
    const tw = TUNGSTENS[s.tungsten];
    this.say(tw && tw.radioactive
      ? t('Tungsten reground. Thoriated tungsten is radioactive: grind it only on a dedicated grinder with local exhaust (AWS Fact Sheet 27), or use a ceriated or lanthanated tungsten.')
      : t('Tungsten reground: contaminated end removed and the point ground lengthwise.'), 4);
    this.input.pulse(this.domSide, 0.4, 40);
    this.ui.invalidateAll();
    return true;
  }

  // GTAW: a new filler rod in the off hand.
  newRod() {
    const st = this.station;
    if (!st.tig || !st.newRod()) return false;
    this.rodHold.lastLen = null;
    this.say(t('New filler rod: {f} Ø {d} mm.', { f: st.session.settings.filler, d: st.session.settings.rodDia }), 2.5);
    this.input.pulse(this.offSide, 0.35, 40);
    this.ui.invalidateAll();
    return true;
  }

  // GTAW: messages and haptics for the events of this frame (session.gtawIgnition / gtawFiller).
  tigFeedback(dt, state, live) {
    if (!this.tigSynced) {
      this.syncTig(dt);
      this.syncRod(dt);
    }
    if (!live) return;
    const ev = state && state.tig ? state.tig : [];
    const msg = {
      touch: 'Tungsten touched the work: it is contaminated. Stop and regrind it (A / X on the torch hand).',
      scratch: 'Scratch start: do not strike like a match. Touch, then lift (lift-arc), or use HF.',
      dip: 'Tungsten dipped into the pool: contaminated, and tungsten left in the weld. Stop and regrind it.',
      rodTouch: 'The filler rod touched the tungsten: it is contaminated. Stop and regrind it.',
      tungstenMelt: 'The tungsten is melting into the pool: too much current for this tungsten, or the wrong polarity (use DCEN).',
      rodOxidised: 'The hot end of the rod left the gas shield and oxidised. Keep the rod tip inside the argon.',
      postflowShort: 'Post-flow too short for this current: the tungsten oxidised (about 1 s per 10 A, at least 8 s).',
      postflowLeft: 'Torch moved away during the post-flow: the hot tungsten oxidised. Hold the torch over the crater until the gas stops.',
      rodShort: 'Rod too short to hold: take a new rod (A / X on the rod hand).',
      outLong: 'The arc went out: the torch was lifted too far from the work.',
    };
    for (const e of ev) {
      if (msg[e]) this.say(t(msg[e]), 3.5);
      if (e === 'touch' || e === 'dip' || e === 'rodTouch' || e === 'scratch' || e === 'tungstenMelt') this.input.pulse(this.domSide, 1.0, 120);
      if (e === 'rodTouch' || e === 'rodOxidised') this.input.pulse(this.offSide, 0.8, 80);
    }
    if (state && state.started) this.input.pulse(this.domSide, 0.6, 50); // HF start
    this.hapT = (this.hapT || 0) + dt;
    if (this.hapT > 0.05 && state && state.arcOn) {
      this.hapT = 0;
      const arc = state.arc;
      this.input.pulse(this.domSide, 0.06 + 0.3 * (arc ? 1 - arc.stability : 0), 55);
      if (this.station.tig && this.station.tig.fillerRate > 0) this.input.pulse(this.offSide, 0.15, 40); // rod melting in the pool
    }
  }

  // ---- layout --------------------------------------------------------------------------------
  placeWorkstation(floorPos, yaw) {
    this.workstation.position.set(floorPos.x, this.settings.benchHeight, floorPos.z);
    this.workstation.rotation.set(0, yaw, 0);
    this.workstation.updateMatrixWorld(true);
    if (this.workshop) {
      this.workshop.room.position.set(floorPos.x, 0, floorPos.z);
      this.workshop.room.rotation.set(0, yaw, 0);
      this.workshop.room.updateMatrixWorld(true);
    }
    // legs reach the floor
    const h = this.settings.benchHeight;
    this.env.bench.traverse((o) => {
      if (o.isMesh && o.geometry.parameters && o.geometry.parameters.height === 0.9 && o.geometry.parameters.width === 0.05) {
        o.scale.y = h / 0.9;
        o.position.y = -h / 2 - 0.02;
      }
    });
    this.env.cylinder.position.y = -h;
    this.env.fan.position.y = -h;
    if (this.kit) this.kit.setFloor(h);
  }

  // Put the bench in front of the user (head pose), at the configured height.
  recenter() {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    cam.getWorldPosition(this.v1);
    cam.getWorldDirection(this.v2);
    this.v2.y = 0;
    if (this.v2.lengthSq() < 1e-4) this.v2.set(0, 0, -1);
    this.v2.normalize();
    const pos = this.v1.clone().addScaledVector(this.v2, 0.52);
    const yaw = Math.atan2(-this.v2.x, -this.v2.z);
    this.placeWorkstation(pos, yaw);
    this.layoutPanels();
  }

  // Move to a standpoint of the workshop (render/workshop.js viewpoints). In the headset the world is
  // moved so that the standpoint is where the trainee stands, facing the way the trainee faces; on the
  // desktop the camera moves there.
  goToViewpoint(name) {
    const vp = this.workshop.viewpoints[name];
    if (!vp) return;
    this.viewpoint = name;
    if (this.renderer.xr.isPresenting) {
      const cam = this.renderer.xr.getCamera();
      cam.getWorldPosition(this.v1);
      cam.getWorldDirection(this.v2);
      this.v2.y = 0;
      if (this.v2.lengthSq() < 1e-4) this.v2.set(0, 0, -1);
      this.v2.normalize();
      const headYaw = Math.atan2(-this.v2.x, -this.v2.z);
      const yaw = headYaw - vp.yaw;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // room point (vp.x, vp.z) rotated by yaw must land under the head
      const px = this.v1.x - (c * vp.x + s * vp.z);
      const pz = this.v1.z - (-s * vp.x + c * vp.z);
      this.placeWorkstation(new THREE.Vector3(px, 0, pz), yaw);
      // bring the main panel along, to the right of the view
      this.placeMainInView(...(vp.panel || []));
    } else {
      // desktop: stand a little behind the standpoint so more of the scene is in view
      const room = this.workshop.room;
      room.updateWorldMatrix(true, false);
      const fwd = new THREE.Vector3(-Math.sin(vp.yaw), -0.22, -Math.cos(vp.yaw)).transformDirection(room.matrixWorld);
      const eye = new THREE.Vector3(vp.x, 1.66, vp.z).applyMatrix4(room.matrixWorld).addScaledVector(fwd.clone().setY(0).normalize(), -0.45);
      this.focusDesktop(eye.clone().addScaledVector(fwd, 1.2), eye);
      const pn = vp.panel || [0.32, 0.22, 0.62];
      this.placeMainInView(pn[0] - 0.04, pn[1] - 0.1, pn[2] + 0.45, true);
    }
    this.layoutPanelsForViewpoint?.(name);
  }

  // Put the main panel in front of the trainee, a little to the right and below the line of sight
  // (desktop: further away so that it fits beside the scene).
  placeMainInView(right = 0.32, down = 0.22, dist = 0.62, exact = false) {
    const xr = this.renderer.xr.isPresenting;
    const cam = xr ? this.renderer.xr.getCamera() : this.camera;
    if (!xr) this.camera.updateMatrixWorld();
    if (!xr && !exact) {
      right = 0.4;
      down = 0.12;
      dist = 1.0;
    }
    const head = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const r = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const p = head.clone().addScaledVector(fwd, dist).addScaledVector(r, right);
    p.y -= down;
    this.pullInFront(head, p, r, this.main.widthM);
    this.workstation.worldToLocal(p);
    this.main.mesh.position.copy(p);
    this.main.mesh.lookAt(head);
  }

  // A panel placed at world point p must not end up inside or behind a wall or a booth screen: if the
  // line from the head to the panel centre or its side edges meets an opaque surface of the workshop,
  // the panel is brought nearer (at least 0.3 m from the head).
  pullInFront(head, p, side, width = 0.6) {
    if (!this.workshop) return p;
    const rc = this.rcFit || (this.rcFit = new THREE.Raycaster());
    rc.camera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera; // sprites need it
    const room = this.workshop.room;
    room.updateWorldMatrix(true, true);
    const visible = (o) => {
      for (let q = o; q && q !== room; q = q.parent) if (!q.visible) return false;
      return true;
    };
    const dist = p.distanceTo(head);
    let free = dist;
    const tgt = this.fitT || (this.fitT = new THREE.Vector3());
    const d = this.fitD || (this.fitD = new THREE.Vector3());
    for (const k of [0, -0.5, 0.5]) {
      tgt.copy(p).addScaledVector(side, k * width);
      d.copy(tgt).sub(head);
      const len = d.length();
      if (len < 1e-3) continue;
      rc.set(head, d.normalize());
      rc.far = len + 0.05;
      const hit = rc.intersectObject(room, true).find((h) => h.object.isMesh && visible(h.object) && !(h.object.material && h.object.material.transparent));
      if (hit) free = Math.min(free, (hit.distance / len) * dist);
    }
    if (free < dist - 0.02) {
      const k = Math.max(0.3, free - 0.1) / dist;
      p.sub(head).multiplyScalar(k).add(head);
    }
    return p;
  }

  // Desktop camera: look at a world point from a world position.
  focusDesktop(target, from) {
    if (this.renderer.xr.isPresenting) return;
    this.controls.target.copy(target);
    this.camera.position.copy(from);
    this.controls.update();
    this.camera.updateMatrixWorld();
  }

  // Back at the bench: the welding position in front of the bench.
  returnToBench() {
    this.viewpoint = 'bench';
    if (this.renderer.xr.isPresenting) {
      this.recenter();
    } else {
      this.controls.target.set(-0.08, 1.0, -0.5);
      this.camera.position.set(0.42, 1.62, 0.62);
      this.placeWorkstation(new THREE.Vector3(0, 0, -0.5), 0);
      this.controls.update();
    }
    this.layoutPanels();
  }

  // Align the bench top to a real table: the off-hand controller rests flat on the table.
  alignToTable() {
    const h = this.input.hands[this.offSide];
    if (!h.connected || !h.grip) {
      this.say(t('Hold the other controller flat on the table first.'));
      return;
    }
    h.grip.getWorldPosition(this.v1);
    const top = this.v1.y - 0.035; // grip centre sits about 3.5 cm above a table it rests on (seed)
    this.settings.benchHeight = clamp(top, 0.55, 1.25);
    this.saveSettings();
    this.recenterAt(this.v1);
    this.say(t('Bench aligned to the table.'));
  }

  recenterAt(point) {
    const cam = this.renderer.xr.getCamera();
    cam.getWorldPosition(this.v2);
    const dir = this.v3.copy(point).sub(this.v2).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    this.placeWorkstation(new THREE.Vector3(point.x, 0, point.z), yaw);
    this.layoutPanels();
  }

  layoutPanels() {
    const sx = this.settings.hand === 'left' ? -1 : 1;
    const eye = new THREE.Vector3(0, 0.72, 0.55);
    const place = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      const target = eye.clone();
      mesh.up.set(0, 1, 0);
      mesh.lookAt(this.workstation.localToWorld(target));
      // lookAt above uses world space; keep the result in workstation space
    };
    this.workstation.updateMatrixWorld(true);
    place(this.main.mesh, -0.6 * sx, 0.4, -0.02);
    place(this.section.mesh, 0.5 * sx, 0.5, -0.12);
    place(this.lab.mesh, 0.5 * sx, 0.52, -0.12);
    place(this.gasPanel.mesh, 0.78 * sx, 0.62, -0.06);
    place(this.sitePanel.mesh, -0.7 * sx, 0.1, 0.14);
    // mirror equipment for left-handed users (machine and cylinder on the gun side)
    this.env.machine.position.x = 0.44 * sx;
    this.env.machine.rotation.y = -0.35 * sx;
    this.env.cylinder.position.x = 0.85 * sx;
    this.env.fan.position.x = -0.95 * sx;
    if (this.kit) this.kit.layout(sx);
  }

  applyVisibility() {
    const ar = this.xrMode === 'ar';
    this.env.booth.visible = !ar && this.settings.booth !== false;
    this.workshop.room.visible = !ar && this.settings.booth !== false;
    for (const p of this.env.tableParts) p.visible = this.settings.bench !== false;
    this.env.bench.children.forEach((o) => {
      if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 0.05) o.visible = this.settings.bench !== false;
    });
  }

  makeOffHand() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 8, 28), mat);
    ring.rotation.x = Math.PI / 2 - 0.5;
    ring.position.set(0, 0.005, 0.012);
    g.add(ring);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.1, 14), mat);
    grip.rotation.x = -Math.PI / 4;
    grip.position.set(0, -0.025, 0.05);
    g.add(grip);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 20), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.4 }));
    face.rotation.x = Math.PI / 2 - 0.5;
    face.position.set(0, 0.012, 0.02);
    g.add(face);
    return g;
  }

  makePointerLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2b51c, transparent: true, opacity: 0.8, toneMapped: false }));
    line.visible = false;
    line.renderOrder = 9620; // after the lens (readable), before the helmet shell (hidden outside the window)
    this.scene.add(line);
    return line;
  }

  attachHands() {
    const dom = this.input.hands[this.domSide];
    const off = this.input.hands[this.offSide];
    this.gun.group.parent?.remove(this.gun.group);
    this.toolHolder.parent?.remove(this.toolHolder);
    this.offHandModel.parent?.remove(this.offHandModel);
    this.rod.group.parent?.remove(this.rod.group);
    if (this.renderer.xr.isPresenting) {
      if (dom.ray) {
        dom.ray.add(this.gun.group);
        dom.ray.add(this.toolHolder);
      }
      // GTAW filler rod along the off hand's pointing direction; the spark lighter (gas cutting)
      if (off.ray) off.ray.add(this.rod.group);
      if (off.ray) off.ray.add(this.lighter.group);
      // hands (bare or gloved, with sleeves) are attached to the grips by the safety system
    } else {
      this.desktopGun.add(this.gun.group);
    }
    this.applyTool();
  }

  setTool(tool) {
    this.tool = tool;
    this.applyTool();
    this.ui.invalidateAll();
  }

  applyTool() {
    this.gun.group.visible = this.tool === 'gun';
    for (const k in this.tools) this.tools[k].visible = this.tool === k;
    this.readout.sprite.visible = false;
    this.snapGauge.visible = false;
  }

  // ---- modes & screens --------------------------------------------------------------------------
  setMode(mode) {
    if (this.mode && this.mode.exit) this.mode.exit();
    if (this.lab) this.showLab(false);
    this.coolAccel = 1;
    this.flushCooling();
    this.mode = mode;
    if (mode.enter) mode.enter();
    this.ui.invalidateAll();
  }

  goHome() {
    this.setMode(new HomeMode(this));
  }

  // Apply the accumulated accelerated-cooling time (chunks of about a second keep the replay
  // event list short; the coupon model does not depend on how the time is cut up).
  flushCooling() {
    if (this.coolPending > 0 && this.station.session && !this.station.session.arcOn) this.station.coolFor(this.coolPending);
    this.coolPending = 0;
  }

  onCouponLoaded() {
    this.coolAccel = 1;
    this.coolPending = 0;
    const s = this.station.session ? this.station.session.settings : null;
    this.selectTorch(s ? s.process : '135');
    if (this.gun === this.stinger) {
      this.syncElectrode(false);
      this.rebuildGhost(); // the ghost holder shows a fresh electrode
    }
    this.restDesktopGun();
    this.markFinding(null);
    this.applyThermalView();
    this.thermoReading = null;
  }

  setThermalView(on) {
    this.thermalView = !!on;
    this.applyThermalView();
    this.ui.invalidateAll();
  }

  applyThermalView() {
    const c = this.station.coupon;
    if (c) c.view.uniforms.thermView.value = this.thermalView ? 1 : 0;
  }

  // Desktop: park the gun just above the start of the joint.
  restDesktopGun() {
    if (this.renderer.xr.isPresenting || !this.station.coupon) return;
    const d = new PlanDriver(this.station, {});
    const pose = d.pose(14, 0, 70);
    this.poseDesktopGun(pose.tip, pose.dir);
  }

  drawMain(ui) {
    screens.drawFrame(ui, this, () => this.mode.draw(ui));
  }

  say(msg, seconds = 3.5) {
    this.toastMsg = msg;
    this.toastT = seconds;
    this.toast.invalidate();
    if (this.hooks.onStatus) this.hooks.onStatus(msg);
  }

  // Test lab panel (welder qualification); it takes the macro section's place beside the bench.
  showLab(on) {
    this.lab.visible = !!on;
    if (on && this.sectionX != null) this.showSection(null);
    this.lab.invalidate();
  }

  showSection(x) {
    this.sectionX = x;
    this.section.visible = x != null;
    if (x != null && this.lab && this.lab.visible) this.lab.visible = false;
    this.section.invalidate();
    const c = this.station.coupon;
    if (!c) return;
    if (this.cutMarker.parent !== c.group) c.group.add(this.cutMarker);
    this.cutMarker.visible = x != null;
    if (x != null) {
      const j = c.joint;
      if (j.pipe) {
        // pipe: the cut plane across the joint at x (normal along the joint there)
        const P = pipePoint(j, x, 0, -j.t / 2);
        const f = pipeFrame(j, x);
        this.cutMarker.position.set(P[0], P[1], P[2]);
        this.cutMarker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.v), new THREE.Vector3(...f.u), new THREE.Vector3(...f.t)));
        return;
      }
      const px = this.station.mirror ? j.L - x : x;
      this.cutMarker.rotation.set(0, Math.PI / 2, 0);
      this.cutMarker.position.set(px, 0, j.type === 'fillet' ? 10 : -2);
    }
  }

  markFinding(s) {
    const c = this.station.coupon;
    if (!c) return;
    if (this.findingMarker.parent !== c.group) c.group.add(this.findingMarker);
    if (s == null) {
      this.findingMarker.visible = false;
      return;
    }
    const j = c.joint;
    const x = s;
    const v = surfaceHeight(this.station.record, Math.floor(x), 0);
    if (j.pipe) {
      const P = pipePoint(j, x, 0, v + 2);
      const f = pipeFrame(j, x);
      this.findingMarker.position.set(P[0], P[1], P[2]);
      this.findingMarker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.t), new THREE.Vector3(-f.u[0], -f.u[1], -f.u[2]), new THREE.Vector3(...f.v)));
      this.findingMarker.visible = true;
      return;
    }
    const px = this.station.mirror ? j.L - x : x;
    this.findingMarker.quaternion.identity();
    this.findingMarker.position.set(px, 0, v + 2);
    this.findingMarker.visible = true;
  }

  // ---- automated-test helpers ------------------------------------------------------------------
  // Screen position (CSS px) of a UI region, for clicking panels like a user would.
  testPoint(panelName, id) {
    const p = this.ui.panels.find((q) => q.name === panelName);
    if (!p) return null;
    p.render(this.ui.rtl);
    const r = p.regions.find((q) => q.id === id);
    if (!r) return null;
    const u = (r.x + r.w / 2) / p.canvas.width;
    const v = 1 - (r.y + r.h / 2) / p.canvas.height;
    const local = new THREE.Vector3((u - 0.5) * p.widthM, (v - 0.5) * p.heightM, 0);
    p.mesh.updateWorldMatrix(true, false);
    p.mesh.localToWorld(local);
    this.camera.updateMatrixWorld();
    local.project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((local.x + 1) / 2) * rect.width, y: rect.top + ((1 - local.y) / 2) * rect.height };
  }

  // World position of a UI region centre (for pointing a controller at it in tests).
  regionWorld(panelName, id) {
    const p = this.ui.panels.find((q) => q.name === panelName);
    if (!p) return null;
    p.render(this.ui.rtl);
    const r = p.regions.find((q) => q.id === id);
    if (!r) return null;
    const u = (r.x + r.w / 2) / p.canvas.width;
    const v = 1 - (r.y + r.h / 2) / p.canvas.height;
    const local = new THREE.Vector3((u - 0.5) * p.widthM, (v - 0.5) * p.heightM, 0);
    p.mesh.updateWorldMatrix(true, false);
    return p.mesh.localToWorld(local).toArray();
  }

  // Target-ray pose that puts the gun's contact tip at sim position (x, u, v) with given angles.
  gunPoseFor(x, aim, workAngle, travelAngle, ctwd) {
    const st = this.station;
    const d = new PlanDriver(st, { workAngle, travelAngle, ctwd });
    const pose = d.pose(x, aim, 0);
    const tipW = st.worldFromSim(pose.tip[0], pose.tip[1], pose.tip[2], new THREE.Vector3());
    const dirW = st.dirWorldFromSim(pose.dir, new THREE.Vector3());
    const rp = rayPoseForTip(this.gun.kin, tipW, dirW, new THREE.Vector3(0, 1, 0));
    return { position: rp.position.toArray(), quaternion: rp.quaternion.toArray() };
  }

  // Controller pose that holds the cutting torch with the jet on plate point (x, u), the inner cones `cone` mm
  // above it, tilted `bevel` deg across the cut and `travel` deg along it (automated tests).
  cutPoseFor(x, u = 0, cone = 3, bevel = 0, travel = 0) {
    const cs = this.cut;
    const p = torchPose(cs.session, x, u, cone, bevel, travel);
    const tipW = cs.worldFromSim(p.tip[0], p.tip[1], p.tip[2], new THREE.Vector3());
    const dirW = cs.dirWorldFromSim(p.dir, new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(this.workstation.matrixWorld);
    const rp = rayPoseForTip(this.cutTorch.kin, tipW, dirW, fwd);
    return { position: rp.position.toArray(), quaternion: rp.quaternion.toArray() };
  }

  // Target-ray pose of the off hand that puts the GTAW filler-rod tip at sim position (x, u, v), the rod
  // coming from ahead of the pool at `angle` degrees to the work (automated tests).
  rodPoseFor(x, u, v, angle = 15) {
    const st = this.station;
    const a = (angle * Math.PI) / 180;
    const tipW = st.worldFromSim(x, u, v, new THREE.Vector3());
    const backW = st.dirWorldFromSim([Math.cos(a), 0, Math.sin(a)], new THREE.Vector3()).normalize();
    const pos = tipW.clone().addScaledVector(backW, this.rodHold.ahead / 1000);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), backW.clone().negate());
    return { position: pos.toArray(), quaternion: q.toArray() };
  }

  // Advance the training logic by `seconds` of simulated time without rendering.
  // Screen position (CSS px) of a point in the workshop room frame (automated tests).
  testRoomPoint(x, y, z) {
    const room = this.workshop.room;
    room.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).applyMatrix4(room.matrixWorld).project(this.camera);
    if (v.z > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  simulate(seconds, dt = 1 / 72) {
    const n = Math.round(seconds / dt);
    for (let k = 0; k < n; k++) {
      this.time += dt;
      this.station.refreshMatrices();
      this.mode.update?.(dt);
    }
  }

  // As simulate(), with the effects state, the consequence monitor and the helmet run as in a frame
  // (automated tests: exposure over seconds of arc time with the controllers held where they are).
  simulateFull(seconds, dt = 1 / 72) {
    const n = Math.round(seconds / dt);
    const presenting = this.renderer.xr.isPresenting;
    for (let k = 0; k < n; k++) {
      this.time += dt;
      this.station.refreshMatrices();
      this.mode.update?.(dt);
      const fxs = this.station.fx(presenting ? this.helmet.isDown : true, this.fxTip, this.fxAxis);
      this.safety.update(dt, fxs);
      this.helmet.update(dt, fxs.arcOn);
    }
  }

  // Look at the coupon from a given offset (desktop screenshots).
  lookAtCoupon(dist = 0.35, elev = 0.5, azim = 0.6) {
    const st = this.station;
    if (!st.coupon) return;
    const c = st.worldFromSim(st.joint.L / 2, 0, 0, new THREE.Vector3());
    this.controls.target.copy(c);
    this.camera.position.set(c.x + dist * Math.sin(azim) * Math.cos(elev), c.y + dist * Math.sin(elev), c.z + dist * Math.cos(azim) * Math.cos(elev));
    this.controls.update();
  }

  // ---- audio ---------------------------------------------------------------------------------
  ensureAudio() {
    if (this.audio) {
      this.audio.resume();
      return;
    }
    try {
      this.listener = new THREE.AudioListener();
      this.camera.add(this.listener);
      this.audio = new ArcAudio(this.listener);
      this.audio.setVolume(this.settings.volume);
      this.workstation.add(this.audio.object);
      this.audio.resume();
      this.oxyAudio = new OxyAudio(this.listener);
      this.oxyAudio.setVolume(this.settings.volume);
      this.workstation.add(this.oxyAudio.object);
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  // ---- XR session ------------------------------------------------------------------------------
  async enterXR(mode) {
    this.ensureAudio();
    if (!navigator.xr) throw new Error('WebXR not available');
    const type = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    const init = { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'layers'] };
    const session = await navigator.xr.requestSession(type, init);
    this.xrMode = mode;
    this.renderer.xr.setFoveation(FOVEATION[this.settings.foveation] ?? 0.6);
    await this.renderer.xr.setSession(session);
  }

  onSessionStart() {
    const session = this.renderer.xr.getSession();
    if (this.xrMode === 'ar') {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
    }
    this.applyVisibility();
    this.controls.enabled = false;
    this.attachHands();
    this.applyFrameRate();
    session.addEventListener('inputsourceschange', () => this.attachHands());
    this.frameStats = { times: [], over: 0, n: 0, budget: 1 / 72, lastRateCheck: this.time };
    setTimeout(() => this.recenter(), 400);
    this.mode?.onSessionStart?.();
    this.hooks.onSession?.(true);
  }

  onSessionEnd() {
    this.xrMode = null;
    this.scene.background = this.bg;
    this.renderer.setClearColor(0x000000, 1);
    this.applyVisibility();
    this.controls.enabled = true;
    this.camera.position.set(0.42, 1.62, 0.62);
    this.camera.quaternion.identity();
    this.placeWorkstation(new THREE.Vector3(0, 0, -0.5), 0);
    this.layoutPanels();
    this.controls.update();
    this.attachHands();
    this.helmet.setDown(false);
    this.hooks.onSession?.(false);
  }

  applyFrameRate() {
    const session = this.renderer.xr.getSession();
    if (!session || !session.updateTargetFrameRate || !session.supportedFrameRates) return;
    const rates = [...session.supportedFrameRates];
    let want = this.settings.fps === 'auto' ? 90 : Number(this.settings.fps);
    if (!rates.includes(want)) want = rates.includes(72) ? 72 : rates[0];
    session.updateTargetFrameRate(want).catch(() => {});
    this.targetFps = want;
  }

  // Auto frame rate: if more than 10% of frames run long at 90 Hz, drop to 72 Hz.
  watchFrameRate(dt) {
    const fs = this.frameStats;
    fs.n++;
    const budget = 1 / (this.targetFps || 72);
    if (dt > budget * 1.45) fs.over++;
    if (this.time - fs.lastRateCheck > 4) {
      if (this.settings.fps === 'auto' && this.targetFps > 72 && fs.n > 100 && fs.over / fs.n > 0.1) {
        const session = this.renderer.xr.getSession();
        session?.updateTargetFrameRate?.(72).catch(() => {});
        this.targetFps = 72;
        this.say(t('Frame rate lowered to 72 Hz to keep tracking smooth.'));
      }
      fs.n = 0;
      fs.over = 0;
      fs.lastRateCheck = this.time;
    }
  }

  // ---- desktop -------------------------------------------------------------------------------------
  bindDesktop() {
    const el = this.renderer.domElement;
    const setNdc = (e) => {
      const rect = el.getBoundingClientRect();
      this.mouse.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.mouse.inside = true;
    };
    el.addEventListener('pointermove', (e) => setNdc(e));
    el.addEventListener('pointerleave', () => (this.mouse.inside = false));
    el.addEventListener('pointerdown', (e) => {
      setNdc(e);
      this.ensureAudio();
      // decide at the event whether the press is on a panel (the hover state of the last frame can be
      // stale when frames are slow)
      if (!this.renderer.xr.isPresenting) {
        const rc = this.rcDown || (this.rcDown = new THREE.Raycaster());
        this.camera.updateMatrixWorld();
        rc.setFromCamera(this.mouse.ndc, this.camera);
        this.mouse.overUI = !!this.ui.pick(rc.ray.origin, rc.ray.direction);
      }
      if (this.mouse.overUI) {
        this.mouse.click = true;
        e.stopImmediatePropagation();
      } else this.mouse.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    }, { capture: true });
    el.addEventListener('pointerup', (e) => {
      const d = this.mouse.downAt;
      this.mouse.downAt = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.t < 500) this.mouse.sceneClick = true;
    });
    el.addEventListener('wheel', (e) => {
      if (this.mouse.overUI) {
        this.mouse.scroll += Math.sign(e.deltaY);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, { capture: true, passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') this.toggleHelmet();
    });
  }

  onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---- per-frame -------------------------------------------------------------------------------------
  frame(time, xrFrame) {
    this.timer.update(time);
    const dtRaw = this.timer.getDelta();
    const dt = Math.min(dtRaw, 0.05);
    this.time += dt;
    const xr = this.renderer.xr;
    const presenting = xr.isPresenting;
    if (presenting) {
      xr.updateCamera(this.camera);
      this.watchFrameRate(dtRaw);
    } else this.controls.update();
    this.camera.getWorldPosition(this.headPos);
    this.camera.getWorldQuaternion(this.headQuat);
    if (this.onBeforeFrame) this.onBeforeFrame(dt, xrFrame);
    this.input.update(xrFrame, presenting ? xr.getReferenceSpace() : null);
    this.trackSample = { dt: dtRaw, hands: this.input.hands };
    this.station.refreshMatrices();

    // UI pointers
    const pointers = [];
    const dom = this.input.hands[this.domSide];
    const off = this.input.hands[this.offSide];
    if (presenting) {
      if (off.connected && off.ray && off.ray.visible) {
        const o = off.ray.getWorldPosition(new THREE.Vector3());
        const d = new THREE.Vector3(0, 0, -1).transformDirection(off.ray.matrixWorld);
        const sc = this.input.stickStep(this.offSide, 'y');
        pointers.push({ key: 'off', origin: o, dir: d, press: off.down.trigger, scroll: sc ? -sc : 0 });
      }
      // dominant hand points with the gun axis when it is well away from the work
      const far = !this.station.lastState || !this.station.lastState.hit || this.station.lastState.tech.ctwd > 60;
      if (dom.connected && dom.ray && dom.ray.visible && far && !(this.station.lastState && this.station.lastState.arcOn)) {
        let o, d;
        if (this.tool === 'gun') {
          this.gun.group.updateWorldMatrix(true, false);
          o = this.gun.group.localToWorld(this.gun.tipLocal.clone());
          d = this.gun.axisLocal.clone().transformDirection(this.gun.group.matrixWorld);
        } else {
          o = dom.ray.getWorldPosition(new THREE.Vector3());
          d = new THREE.Vector3(0, 0, -1).transformDirection(dom.ray.matrixWorld);
        }
        pointers.push({ key: 'dom', origin: o, dir: d, press: dom.down.trigger && !dom.consumed });
      }
    } else if (this.mouse.inside) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(this.mouse.ndc, this.camera);
      pointers.push({ key: 'mouse', origin: rc.ray.origin.clone(), dir: rc.ray.direction.clone(), press: this.mouse.click, scroll: this.mouse.scroll });
    }
    this.mouse.click = false;
    this.mouse.scroll = 0;
    const hits = this.ui.update(pointers);
    this.mouse.overUI = !!hits.mouse;
    if (!presenting) this.controls.enabled = !this.mouse.overUI;
    this.uiHover = { dom: !!hits.dom, off: !!hits.off };
    if (hits.dom && dom.down.trigger) dom.consumed = true;
    if (hits.dom && dom.pressed.trigger) dom.consumed = true;
    // pointers that are not on a panel can pick scene objects (hazard hunt, permit checks)
    this.worldPointers = pointers.filter((p) => !hits[p.key]).map((p) => (p.key === 'mouse' ? { ...p, press: this.mouse.sceneClick } : p));
    this.mouse.sceneClick = false;
    this.drawPointers(pointers, hits);
    this.worldHit = {};

    // helmet controls
    if (presenting) {
      if (dom.down.b) this.toggleHelmet();
      if (off.down.b) this.summonMenu();
      if (this.settings.nod && !this.helmet.down && this.nod.update(dt, this.headQuat) && this.helmet.kind !== 'none') this.helmet.setDown(true);
    }

    // mode logic (welding, tools, flows)
    const tU = performance.now();
    this.mode.update?.(dt);
    const tF = performance.now();
    // gun out of tracking while in use: tell the trainee once per episode
    this.trackLostT = this.trackingWarn ? (this.trackLostT || 0) + dt : 0;
    if (this.trackLostT > 0.3 && !this.trackLostSaid) {
      this.trackLostSaid = true;
      this.say(t('Gun tracking lost. Keep the controller where the headset cameras can see it.'));
    }
    if (this.trackLostT === 0) this.trackLostSaid = false;

    // effects
    // on the desktop the viewer is an observer: soft glare, no flash
    const throughLens = presenting ? this.helmet.isDown : true;
    const fxs = this.station.fx(throughLens, this.fxTip, this.fxAxis);
    fxs.arcLight = presenting || this.helmet.isDown ? 0.19 : 0.05;
    const lensOn = this.helmet.isDown;
    // how much of the view is behind the filter while the helmet swings down (0 up .. 1 down)
    const lensAmt = Math.min(1, Math.max(0, (this.helmet.anim - 0.3) / 0.6));
    const T = this.helmet.transmission;
    const vis = lensOn && this.helmet.dark ? Math.min(1.6, arcVisibility(this.helmet.darkShade)) : 1;
    fxs.arcVis = vis;
    fxs.smokeVis = 1 + (Math.min(1, T * 3) - 1) * lensAmt;
    // hot spatter stays visible as streaks through a dark lens (display mapping, seed)
    fxs.sparkGain = 1 + (0.35 / Math.max(T, 1e-3) - 1) * lensAmt;
    const eq = this.station.equipment;
    this.fx.wind = eq && eq.fan && !eq.screen ? this.windVec || (this.windVec = new THREE.Vector3(0.5 * (this.settings.hand === 'left' ? -1 : 1), 0, 0)) : null;
    this.fx.update(dt, fxs);
    this.safety.update(dt, fxs);
    const arcOn = fxs.arcOn;
    this.helmet.xr = presenting;
    this.helmet.update(dt, arcOn);
    // gun cable (or SMAW electrode lead) and wire spool
    let cableEnd = null;
    if (this.tool === 'gun' && this.gun !== this.cutTorch && this.gun.group.parent && this.gun.group.visible && (presenting || this.desktopGun.visible)) {
      cableEnd = this.gun.cableEnd.getWorldPosition(this.v3);
    }
    const ss = this.station.session ? this.station.session.settings : null;
    if (ss) this.kit.setCircuit(ss.process, ss.polarity);
    const feeding = !!(this.weldTrigger && arcOn && ss && ss.process !== '111' && ss.process !== '141');
    this.kit.update(dt, cableEnd, feeding, ss ? ss.wfs : 0);
    // interpass cooling: coupon time runs faster while the arc is off (training aid). Striking
    // the arc returns to real time; demos and replays always keep their recorded timing.
    if (this.coolAccel > 1) {
      if (arcOn || !this.station.session || this.station.frozen || !this.mode.allowCoolAccel?.()) {
        if (arcOn) {
          this.coolAccel = 1;
          this.main.invalidate();
        }
        this.flushCooling();
      } else {
        this.coolPending += dt * (this.coolAccel - 1);
        if (this.coolPending >= 1) this.flushCooling();
      }
    } else if (this.coolPending > 0) this.flushCooling();
    // the filter attenuates scene radiance before tone mapping (see helmet.js)
    this.renderer.toneMappingExposure = 1.05 * (1 + (this.helmet.transmission - 1) * lensAmt);
    GLOW_EXPO.value = this.renderer.toneMappingExposure;
    const panelDim = 1 + (Math.min(1, this.helmet.transmission * 2.2) - 1) * lensAmt;
    if (panelDim !== this.lastPanelDim) {
      this.lastPanelDim = panelDim;
      for (const p of this.ui.panels) p.material.color.setScalar(panelDim);
    }
    if (presenting) this.updateFlash(dt, arcOn);
    else this.flash.visible = false;
    if (this.audio) {
      if (fxs.pool) this.audio.object.position.copy(fxs.pool);
      const st = this.station.lastState;
      const smawArc = !!(ss && ss.process === '111');
      // GTAW: the argon flows with the torch switch and through the post-flow
      const tigGas = !!(ss && ss.process === '141' && this.station.tig && this.station.tig.postflow);
      this.audio.update({ trigger: (this.weldTrigger || tigGas) && !smawArc, arcOn, arc: st ? st.arc : null, wfs: ss && !smawArc ? ss.wfs || 0 : 0, gasFlow: ss && !smawArc && !this.station.equipment.cylinderEmpty ? ss.gasFlow : 0 });
    }
    // oxy-fuel cutting bench: plate, sparks, outfit gauges and hoses, the torch sound
    if (this.cut.root.visible && this.cut.session) {
      this.cut.visuals(dt);
      const torchOn = this.gun === this.cutTorch && this.cutTorch.group.parent && this.cutTorch.group.visible && (presenting || this.desktopGun.visible);
      this.cut.outfitVisuals(dt, torchOn ? this.cutTorch.cableEnd.getWorldPosition(this.v3) : null);
      if (this.oxyAudio) {
        const o = this.cut.outfit;
        const cst = this.cut.state;
        if (torchOn) {
          this.cutTorch.group.updateWorldMatrix(true, false);
          this.oxyAudio.object.position.copy(this.cutTorch.tipLocal).applyMatrix4(this.cutTorch.group.matrixWorld);
          this.workstation.worldToLocal(this.oxyAudio.object.position);
        }
        this.oxyAudio.update({ lit: o.lit, type: o.flame.type, size: o.flame.size, fuelQ: o.flow.fuel, o2Q: o.flow.preO2 + o.flow.cutO2, lever: o.lever, cutting: !!(cst && cst.cutting), rate: cst ? Math.min(1.5, Math.abs(cst.speed) / Math.max(cst.vNom, 1e-3)) : 0, sustained: o.backfireT > 0, events: this.cutEvents || [] });
      }
    } else if (this.oxyAudio) this.oxyAudio.update({ lit: false, lever: 0, events: [] });
    this.cutEvents = [];

    // toast (head-locked in XR; the page shows it on the desktop)
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toast.mesh.visible = presenting;
      if (this.toastT <= 0) this.toast.mesh.visible = false;
    }
    const tR = performance.now();
    this.station.flush();
    this.ui.render();
    if (this.toast.mesh.visible) this.toast.render(isRTL());
    const tR2 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const tE = performance.now();
    const pf = this.perf;
    const k = 0.05;
    pf.update += (tF - tU - pf.update) * k;
    pf.fx += (tR - tF - pf.fx) * k;
    pf.ui += (tR2 - tR - pf.ui) * k;
    pf.render += (tE - tR2 - pf.render) * k;
    pf.calls = this.renderer.info.render.calls;
    pf.tris = this.renderer.info.render.triangles;
  }

  drawPointers(pointers, hits) {
    for (const side of ['left', 'right']) this.pointerLines[side].visible = false;
    this.cursor.visible = false;
    this.cursor2.visible = false;
    let ci = 0;
    for (const p of pointers) {
      if (p.key === 'mouse') continue;
      const hit = hits[p.key];
      const side = p.key === 'dom' ? this.domSide : this.offSide;
      const line = this.pointerLines[side];
      const wh = this.worldHit[p.key];
      if (p.key === 'dom' && !hit && wh == null) continue;
      line.visible = true;
      const len = hit ? hit.distance : wh != null ? wh : 0.6;
      line.position.copy(p.origin);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p.dir);
      line.scale.set(1, 1, len);
      line.material.opacity = hit || wh != null ? 0.9 : 0.25;
      if (hit) {
        const c = ci++ === 0 ? this.cursor : this.cursor2;
        c.visible = true;
        c.position.copy(hit.point).addScaledVector(p.dir, -0.002);
        c.quaternion.copy(hit.panel.mesh.getWorldQuaternion(this.q1));
      }
    }
  }

  // Bring the main panel in front of the user (off-hand B/Y).
  summonMenu() {
    const cam = this.renderer.xr.getCamera();
    cam.getWorldPosition(this.v1);
    cam.getWorldDirection(this.v2);
    this.v2.y = Math.min(this.v2.y, -0.15);
    this.v2.normalize();
    const p = this.v1.clone().addScaledVector(this.v2, 0.55);
    this.pullInFront(this.v1.clone(), p, new THREE.Vector3(-this.v2.z, 0, this.v2.x).normalize(), this.main.widthM);
    this.workstation.worldToLocal(p);
    this.main.mesh.position.copy(p);
    this.main.mesh.lookAt(this.v1);
  }

  updateFlash(dt, arcOn) {
    // arc seen without the helmet down: flash and count an exposure
    if (arcOn && !this.helmet.isDown && this.fx.glare.visible) {
      const toArc = this.v1.copy(this.fx.glare.getWorldPosition(this.v3)).sub(this.headPos).normalize();
      const fwd = this.v2.set(0, 0, -1).applyQuaternion(this.headQuat);
      const ang = Math.acos(clamp(toArc.dot(fwd), -1, 1));
      if (ang < 1.1) {
        if (!this.flashing) {
          this.flashing = true;
          this.station.log.flashes++;
          this.say(t('Arc flash! Lower your helmet before you strike the arc.'));
          this.input.pulse(this.domSide, 0.8, 120);
        }
        this.flashLevel = Math.min(0.85, this.flashLevel + dt * 6);
      }
    } else this.flashing = false;
    this.flashLevel = Math.max(0, this.flashLevel - dt * 1.5);
    this.flash.visible = this.flashLevel > 0.01;
    this.flash.material.opacity = this.flashLevel;
  }

  // ---- shared welding step used by the welding modes ---------------------------------------------
  // Reads the torch from the dominant controller (XR) or from a driver (desktop/demo/replay).
  weldStep(dt, opts = {}) {
    const st = this.station;
    const presenting = this.renderer.xr.isPresenting;
    const dom = this.input.hands[this.domSide];
    this.fxTip = null;
    this.fxAxis = null;
    this.weldTrigger = false;
    this.weldObserver = !!opts.driver; // a demo or replay welds: the trainee only watches
    this.tigSynced = false;
    if (!st.session || st.frozen) {
      this.rod.group.visible = false;
      this.demoRod.group.visible = false;
      return null;
    }
    const smaw = st.session.settings.process === '111';
    const tig = st.session.settings.process === '141';
    // SMAW: the electrode tip moves back as the electrode burns; set its length before posing
    if (smaw) this.syncElectrode(!!(st.lastState && st.lastState.arcOn));
    if (!tig || !opts.driver) this.demoRod.group.visible = false;
    let state = null;
    if (opts.driver) {
      const cmd = opts.driver.next(dt);
      if (cmd) {
        if (cmd.events) for (const ev of cmd.events) this.applyReplayEvent(ev);
        // a scripted welder may have fitted a new electrode in this step
        if (smaw) this.syncElectrode(!!(st.lastState && st.lastState.arcOn));
        if (cmd.tip) {
          this.poseDesktopGun(cmd.tip, cmd.dir);
          state = st.step(cmd.dt ?? dt, cmd.tip, cmd.dir, cmd.trigger, { helmetDown: true, record: !!opts.record, wps: opts.wps, rod: cmd.rod || null });
          this.weldTrigger = tig ? cmd.trigger > 0.04 : cmd.trigger;
          if (tig) {
            this.poseDemoRod(cmd.rod || null);
            this.gun.setTrigger(cmd.trigger || 0);
          }
        } else st.step(cmd.dt ?? dt, null, null, false, { record: !!opts.record });
      } else st.step(dt, null, null, false, { record: !!opts.record });
    } else if (presenting && this.tool === 'gun' && dom.connected && dom.tracked && tig) {
      // GTAW: the torch switch is an amperage control (the analog trigger sets the share of the preset
      // current; Miller OM-215994: "A foot pedal or torch-mounted amperage control will be used for
      // starting, modulating and stopping the flow of current"); the filler rod is in the other hand
      this.emulatedT = dom.emulated ? (this.emulatedT || 0) + dt : 0;
      this.syncTig(dt);
      this.syncRod(dt);
      this.tigSynced = true;
      this.gun.group.updateWorldMatrix(true, false);
      this.tipW.copy(this.gun.tipLocal).applyMatrix4(this.gun.group.matrixWorld);
      this.axisW.copy(this.gun.axisLocal).transformDirection(this.gun.group.matrixWorld);
      st.simFromWorld(this.tipW, this.axisW, this.tipSim, this.dirSim);
      const allowed = !dom.consumed && !this.uiHover.dom && !opts.lockTrigger;
      const pedal = allowed ? clamp(dom.trigger, 0, 1) : 0;
      this.weldTrigger = pedal > 0.04;
      const rod = this.rodTipSim();
      state = st.step(dt, this.tipSim, this.dirSim, pedal, { helmetDown: this.helmet.isDown, wps: opts.wps, record: !!opts.record, rod });
      this.fxTip = this.tipW;
      this.fxAxis = this.axisW;
      this.gun.setTrigger(pedal);
      // A / X: regrind the tungsten (torch hand), a new filler rod (rod hand)
      const off = this.input.hands[this.offSide];
      if (dom.down.a && !opts.lockTrigger) this.regrindTungsten();
      if (off.down.a && !opts.lockTrigger) this.newRod();
    } else if (presenting && this.tool === 'gun' && dom.connected && dom.tracked) {
      // emulatedPosition (orientation-only tracking) is reported but does not stop the weld;
      // the Tracking lab measures how often it happens on the device
      this.emulatedT = dom.emulated ? (this.emulatedT || 0) + dt : 0;
      this.gun.group.updateWorldMatrix(true, false);
      this.tipW.copy(this.gun.tipLocal).applyMatrix4(this.gun.group.matrixWorld);
      this.axisW.copy(this.gun.axisLocal).transformDirection(this.gun.group.matrixWorld);
      st.simFromWorld(this.tipW, this.axisW, this.tipSim, this.dirSim);
      const trig = dom.pressed.trigger && !dom.consumed && !this.uiHover.dom && !opts.lockTrigger;
      this.weldTrigger = trig;
      state = st.step(dt, this.tipSim, this.dirSim, trig, { helmetDown: this.helmet.isDown, wps: opts.wps, record: !!opts.record });
      this.fxTip = this.tipW;
      this.fxAxis = this.axisW;
      if (dom.trigger > 0 && dom.trigger < 1) this.gun.setTrigger(dom.trigger);
      else this.gun.setTrigger(dom.pressed.trigger ? 1 : 0);
      // SMAW: A / X on the holder hand fits a new electrode (arc off)
      if (smaw && dom.down.a && !opts.lockTrigger) this.changeElectrode();
    } else {
      st.step(dt, null, null, false, { record: !!opts.record });
      this.trackingWarn = presenting && dom.connected && !dom.tracked && this.tool === 'gun';
    }
    if (opts.driver && state) {
      this.fxTip = this.tipW;
      this.fxAxis = this.axisW;
    }
    if (smaw) {
      this.smawFeedback(dt, state, presenting && !opts.driver);
      if (this.demoTool) this.demoTool.setStickOut(st.electrode ? st.electrode.L : 300, !!(state && state.arcOn), !!(st.electrode && st.electrode.stuck));
      return state;
    }
    if (tig) {
      this.tigFeedback(dt, state, presenting && !opts.driver);
      if (this.demoTool && this.demoTool.setTungsten) {
        const T = st.tig;
        this.demoTool.setStickOut(5, state && state.arcOn ? 1 : 0);
        this.demoTool.setTungsten(T && T.contaminated ? 'contaminated' : T && T.oxidized ? 'oxidized' : 'clean');
      }
      return state;
    }
    this.rod.group.visible = false;
    // wire stick-out and haptics
    if (state) {
      const arc = state.arc;
      const so = arc ? arc.stickOut : Math.min(this.lastStickOut || 15, state.tech.ctwd);
      if (arc) this.lastStickOut = arc.stickOut;
      this.gun.setStickOut(Math.max(1, Math.min(so, state.tech.ctwd)), !!arc);
      if (presenting) {
        if (state.started) this.input.pulse(this.domSide, 0.75, 45);
        if (state.stub) {
          this.input.pulse(this.domSide, 1.0, 120);
          this.say(t('Wire stubbed into the work. Release the trigger and pull back to the right stick-out.'));
        }
        if (state.arcOn) {
          this.hapT = (this.hapT || 0) + dt;
          if (this.hapT > 0.045) {
            this.hapT = 0;
            const instab = 1 - arc.stability;
            const base = arc.mode === 'short' ? 0.16 : arc.mode === 'globular' ? 0.22 : 0.08;
            this.input.pulse(this.domSide, base + 0.35 * instab + (state.tech.ctwd < 3.2 ? 0.4 : 0), 55);
          }
        }
      }
    }
    return state;
  }

  // ---- oxy-fuel cutting step used by the cutting mode ----------------------------------------------------
  // The torch from the dominant controller (XR: the analog trigger is the cutting oxygen lever) or from a driver
  // (demo); returns the cutting session state.
  cutStep(dt, opts = {}) {
    const cs = this.cut;
    if (!cs.session) return null;
    const presenting = this.renderer.xr.isPresenting;
    const dom = this.input.hands[this.domSide];
    let state = null;
    let lever = 0;
    if (opts.driver) {
      const cmd = opts.driver.next(dt);
      if (cmd && cmd.tip) {
        this.poseDesktopCut(cmd.tip, cmd.dir);
        lever = cmd.lever || 0;
        state = cs.step(dt, cmd.tip, cmd.dir, lever, { record: !!opts.record });
      } else state = cs.step(dt, null, null, 0, { record: !!opts.record });
      if (cmd && cmd.done) opts.onDone?.();
    } else if (presenting && this.tool === 'gun' && this.gun === this.cutTorch && dom.connected && dom.tracked) {
      this.cutTorch.group.updateWorldMatrix(true, false);
      this.tipW.copy(this.cutTorch.tipLocal).applyMatrix4(this.cutTorch.group.matrixWorld);
      this.axisW.copy(this.cutTorch.axisLocal).transformDirection(this.cutTorch.group.matrixWorld);
      cs.simFromWorld(this.tipW, this.axisW, this.tipSim, this.dirSim);
      const allowed = !dom.consumed && !this.uiHover.dom && !opts.lockTrigger;
      lever = allowed ? clamp(dom.trigger, 0, 1) : 0;
      state = cs.step(dt, this.tipSim, this.dirSim, lever, { record: !!opts.record });
      // haptics: the jet in the cut, a backfire
      this.hapT = (this.hapT || 0) + dt;
      if (state && state.events.includes('backfire')) this.input.pulse(this.domSide, 1.0, 140);
      else if (state && state.cutting && this.hapT > 0.06) {
        this.hapT = 0;
        this.input.pulse(this.domSide, 0.1 + 0.15 * Math.min(1, state.rho || 0), 50);
      }
    } else {
      // no torch at the work: the lever as the panel holds it (desktop)
      state = cs.step(dt, null, null, opts.lever ?? 0, { record: !!opts.record });
      this.trackingWarn = presenting && dom.connected && !dom.tracked && this.tool === 'gun';
    }
    if (state && state.events.length) this.cutEvents = (this.cutEvents || []).concat(state.events);
    const o = cs.outfit;
    this.cutTorch.setLever(o.lever);
    this.cutTorch.setValves(o.valve);
    this.cutTorch.setTipHeat(o.tipHeat);
    const gapM = state && state.J && state.J.onPlate && state.J.s > 0 ? state.J.s / 1000 : null;
    this.oxyFlame.update(dt, { lit: o.lit, ...o.flame }, o.lever, !!(state && state.cutting), gapM);
    return state;
  }

  // Desktop: pose the cutting torch for a tip / jet direction in plate millimetres, the body pointing away
  // from the welder.
  poseDesktopCut(tip, dir) {
    const cs = this.cut;
    cs.worldFromSim(tip[0], tip[1], tip[2], this.tipW);
    cs.dirWorldFromSim(dir, this.axisW);
    const fwd = this.v3.set(0, 0, -1).transformDirection(this.workstation.matrixWorld);
    const pose = rayPoseForTip(this.cutTorch.kin, this.tipW, this.axisW, fwd);
    this.desktopGun.position.copy(pose.position);
    this.desktopGun.quaternion.copy(pose.quaternion);
    this.desktopGun.updateMatrixWorld(true);
  }

  // SMAW: electrode length and glow, haptics and messages for strikes, sticking and arc outages.
  // Hobart/Miller 155095F: "If arc goes out, electrode was lifted too high. If electrode sticks to
  // workpiece, use a quick twist to free it."
  smawFeedback(dt, state, live) {
    const st = this.station;
    const E = st.electrode;
    this.syncElectrode(!!(state && state.arcOn));
    if (!live || !E) return;
    if (state && state.started) this.input.pulse(this.domSide, 0.75, 45);
    if (state && state.stuck) {
      this.input.pulse(this.domSide, 1.0, 160);
      this.say(t('Electrode stuck to the work. Free it with a quick twist of the holder.'));
    }
    if (state && state.freed) this.say(t('Electrode free.'), 1.5);
    if (state && state.outLong) this.say(t('The arc went out: the electrode was lifted too high. Hold the arc length about one electrode diameter.'));
    if (state && state.used) this.say(t('Electrode burnt down to the stub. Fit a new electrode: A / X on the holder hand.'));
    this.hapT = (this.hapT || 0) + dt;
    if (this.hapT > 0.045) {
      this.hapT = 0;
      if (E.stuck) this.input.pulse(this.domSide, 0.55, 50); // short-circuit current through the stuck electrode
      else if (state && state.arcOn) {
        const arc = state.arc;
        const instab = arc ? 1 - arc.stability : 0;
        this.input.pulse(this.domSide, 0.12 + 0.35 * instab, 55);
      }
    }
  }

  poseDesktopGun(tip, dir) {
    const st = this.station;
    st.worldFromSim(tip[0], tip[1], tip[2], this.tipW);
    st.dirWorldFromSim(dir, this.axisW);
    const pose = rayPoseForTip(this.gun.kin, this.tipW, this.axisW, this.v3.set(0, 1, 0));
    this.desktopGun.position.copy(pose.position);
    this.desktopGun.quaternion.copy(pose.quaternion);
    this.desktopGun.updateMatrixWorld(true);
  }

  applyReplayEvent(ev) {
    const st = this.station;
    if (ev.type === 'newPass') {
      st.record.newPass();
      if (ev.data != null) st.record.pass.lane = ev.data;
      st.session.reset();
    } else if (ev.type === 'clean') st.cleanAll(false);
    else if (ev.type === 'brush') st.brush(ev.data[0], ev.data[1], ev.data[2] ?? null, false);
    else if (ev.type === 'chip') st.chip(ev.data[0], ev.data[1], ev.data[2] ?? null, false);
    else if (ev.type === 'cool') st.session.cool(ev.data);
    else if (ev.type === 'settings') Object.assign(st.session.settings, ev.data);
    else if (ev.type === 'equipment') st.setEquipment(ev.data, false);
    else if (ev.type === 'electrode') {
      st.session.newElectrode();
      this.syncElectrode(false);
    } else if (ev.type === 'regrind') st.session.regrindTungsten();
    else if (ev.type === 'rod') st.session.newRod();
    else if (ev.type === 'roll') st.setRoll(ev.data, false);
    else if (ev.type === 'feather') st.feather(ev.data[0], ev.data[1], { beyond: ev.data[2], pass: ev.data[3] ?? undefined }, false);
  }

  // Tools other than the gun: brush cleaning and gauge readings.
  toolStep(dt) {
    const dom = this.input.hands[this.domSide];
    const st = this.station;
    this.readout.sprite.visible = false;
    if (!st.coupon || !this.renderer.xr.isPresenting || !dom.connected || this.tool === 'gun' || !this.tools[this.tool]) {
      this.lastMeasure = null;
      return null;
    }
    const tool = this.tools[this.tool];
    if (this.tool === 'thermo') {
      // contact thermometer: reads the plate where the probe touches it (first-order probe lag)
      tool.updateWorldMatrix(true, false);
      const tipW = tool.localToWorld(tool.userData.tip.clone());
      st.simFromWorld(tipW, null, this.tipSim, null);
      const [x, u, v] = this.tipSim;
      let contact = false, Ttrue = 20;
      if (x >= 0 && x <= st.joint.L && st.record) {
        const surf = surfaceHeight(st.record, Math.floor(x), u);
        if (surf > -100 && v - surf < 2.5 && v - surf > -6) {
          contact = true;
          Ttrue = st.temperatureAt(x, u, v);
        }
      }
      const tau = contact ? 1.5 : 6; // s, probe response. seed
      if (this.thermoReading == null) this.thermoReading = 20;
      this.thermoReading += ((contact ? Ttrue : 20) - this.thermoReading) * (1 - Math.exp(-dt / tau));
      tool.userData.setReading(this.thermoReading, contact);
      const dom2 = this.input.hands[this.domSide];
      if (contact && dom2.down.trigger && !dom2.consumed && !this.uiHover.dom) {
        st.recordReading(x, this.thermoReading);
        this.input.pulse(this.domSide, 0.5, 30);
        this.say(`${t('Temperature recorded')}: ${Math.round(this.thermoReading)} °C`);
        this.mode.onReading?.(x, this.thermoReading);
      }
      return { kind: 'thermo', contact, T: this.thermoReading };
    }
    if (this.tool === 'brush') {
      tool.updateWorldMatrix(true, false);
      const head = tool.localToWorld(tool.userData.head.clone());
      st.simFromWorld(head, null, this.tipSim, null);
      const x = this.tipSim[0];
      const prev = this.brushPrev;
      this.brushPrev = this.tipSim.slice();
      const plate = st.joint.type === 'plate';
      if (x >= 0 && x <= st.joint.L && st.record) {
        const surf = surfaceHeight(st.record, Math.floor(x), this.tipSim[1]);
        const gap = this.tipSim[2] - surf;
        if (gap < 6 && gap > -8 && (plate || Math.abs(this.tipSim[1]) < 16) && prev) {
          const mv = Math.hypot(this.tipSim[0] - prev[0], this.tipSim[1] - prev[1]);
          if (mv / Math.max(dt, 1e-3) > 40) {
            const n = st.brush(Math.floor(x) - 6, Math.floor(x) + 6, plate ? this.tipSim[1] : null);
            this.input.pulse(this.domSide, 0.3, 30);
            if (n > 0 && this.audio) this.audio.brush();
            this.safety.onSlagWork();
            // SMAW slag is chipped off first (Hobart/Miller 155095F: chipping hammer and wire brush)
            if (st.record.lastBrushBlocked > 0 && this.time - (this.chipHintT ?? -99) > 4) {
              this.chipHintT = this.time;
              this.say(t('This slag needs the chipping hammer first, then the wire brush.'));
            }
          }
        }
      }
      return null;
    }
    if (this.tool === 'hammer') {
      // a blow: the chisel edge reaches the bead surface moving toward it faster than 0.3 m/s (design
      // value); each blow knocks the slag off a length set by how easily the slag detaches (seed)
      tool.updateWorldMatrix(true, false);
      const edge = tool.localToWorld(tool.userData.tip.clone());
      st.simFromWorld(edge, null, this.tipSim, null);
      const [x, u, v] = this.tipSim;
      const j = st.joint;
      const plate = j.type === 'plate';
      this.hammerCool = Math.max(0, (this.hammerCool || 0) - dt);
      let gap = null;
      if (x >= 0 && x <= j.L && st.record && (plate || Math.abs(u) < 16)) gap = v - surfaceHeight(st.record, Math.floor(x), u);
      const prevGap = this.hammerGap;
      this.hammerGap = gap;
      if (gap != null && prevGap != null && gap < 3 && gap > -10 && this.hammerCool <= 0) {
        const approach = (prevGap - gap) / Math.max(dt, 1e-3);
        if (approach > 300) {
          this.hammerCool = 0.12;
          const s = st.session.settings;
          const k = s.process === '111' ? ELECTRODES[s.electrode].slagRemoval : 1;
          const h = Math.max(3, Math.round(10 * k));
          const n = st.chip(Math.floor(x) - h, Math.floor(x) + h, plate ? u : null);
          this.input.pulse(this.domSide, 0.9, 35);
          if (this.audio) this.audio.chip(n > 0);
          if (n > 0) this.fx.chips?.(edge, this.workstation);
          this.safety.onSlagWork();
        }
      }
      return null;
    }
    // gauges
    tool.updateWorldMatrix(true, false);
    const tipW = tool.localToWorld(tool.userData.tip.clone());
    st.simFromWorld(tipW, null, this.tipSim, null);
    const m = measure(this.tool, st.record, this.tipSim);
    this.lastMeasure = m;
    if (m && m.values.length) {
      const lines = [`x = ${m.sEval.toFixed(0)} mm`];
      for (const v of m.values.slice(0, 2)) lines.push(`${t(v.label)}: ${v.value.toFixed(1)} ${v.unit}`);
      this.readout.set(lines);
      this.readout.sprite.visible = true;
      this.readout.sprite.position.copy(tipW).add(this.v1.set(0, 0.05, 0));
    } else if (m && m.wrongGauge) {
      this.readout.set([t('Use the bridge gauge on butt welds')]);
      this.readout.sprite.visible = true;
      this.readout.sprite.position.copy(tipW).add(this.v1.set(0, 0.05, 0));
    }
    return m;
  }

  // Grab the coupon with the off hand (squeeze) to look at it from any side.
  grabStep(dt) {
    const off = this.input.hands[this.offSide];
    const st = this.station;
    if (!st.coupon || !off.connected || !off.grip) return;
    if (this.handBusy[this.offSide] && !this.grab) return;
    const pivot = st.pivot;
    if (off.down.squeeze && !this.grab) {
      const c = st.coupon.group.getWorldPosition(this.v1);
      // coupon centre (joint mid-length)
      st.worldFromSim(st.joint.L / 2, 0, 0, this.v2);
      const g = off.grip.getWorldPosition(this.v3);
      if (g.distanceTo(this.v2) < 0.22 || g.distanceTo(c) < 0.22) {
        off.grip.updateWorldMatrix(true, false);
        pivot.updateWorldMatrix(true, false);
        this.grab = { offset: new THREE.Matrix4().copy(off.grip.matrixWorld).invert().multiply(pivot.matrixWorld) };
        this.input.pulse(this.offSide, 0.5, 40);
      }
    }
    if (this.grab) {
      if (!off.pressed.squeeze) {
        this.grab = null;
        this.returnPivot = true;
      } else {
        off.grip.updateWorldMatrix(true, false);
        const mw = new THREE.Matrix4().copy(off.grip.matrixWorld).multiply(this.grab.offset);
        const local = new THREE.Matrix4().copy(this.workstation.matrixWorld).invert().multiply(mw);
        local.decompose(pivot.position, pivot.quaternion, this.v3);
      }
    } else if (this.returnPivot) {
      pivot.position.lerp(this.v1.set(0, 0, 0), Math.min(1, dt * 6));
      pivot.quaternion.slerp(this.q1.identity(), Math.min(1, dt * 6));
      if (pivot.position.lengthSq() < 1e-8) {
        pivot.position.set(0, 0, 0);
        pivot.quaternion.identity();
        this.returnPivot = false;
      }
    }
  }
}
