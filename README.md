# VR Welding Simulator — WebXR build for Meta Quest 3S

WELL EXPERTS · Phase 1 prototype · version 1.7.0 · 15 October 2026

This is a browser-based (WebXR) welding simulator that runs in the Meta Quest Browser on a Quest 3S.
It implements the first slice chosen from the scope document *VR Welding Simulator on Meta Quest 3S —
Standards Analysis & Scope (Rev 0)*: GMAW and FCAW on carbon-steel plate with live technique metrics,
live imperfections and code judging, plus the Inspector lab with virtual gauges.

**Release 1.1** adds a heat-flow model of the coupon that drives the weld pool, heat build-up,
interpass temperature, glow and heat tint; a physically based look for hot metal, the arc, spatter
and fume; the welding kit around the bench; and an **Exercises** mode with the scope's technique
drills (B1, B2, B3, B4, B7, B8) judged on objective criteria.

**Release 1.2** puts the bench in a training workshop (booth with curtain and low-reflectance walls,
extraction arm, PPE station, extinguisher, first aid, signs, gas store, cutting cart, grinding station,
a neighbouring booth) and adds the **Safety and PPE** module: dress for the job at the PPE rack
(spotting damaged items), a booth inspection (hazard hunt) and a hot work permit with a fire watch.
Unsafe behaviour has consequences in every mode: arc glare and after-image, UV dose to eyes and skin,
spatter and contact burns shown on the hands, fume exposure, incident cards with first aid and the
rule broken, each tied to its source (OSHA 29 CFR 1910, ANSI Z49.1:2021, AWS safety fact sheets, HSE,
CCOHS, NHS).

**Release 1.3** adds stick welding (SMAW, ISO 4063 process 111): an insulated electrode holder with
E6010, E6013 and E7018 electrodes in 2.5, 3.2 and 4.0 mm, a constant-current machine panel (current,
AC / DCEP / DCEN), touch-and-lift striking, sticking and freeing, burn-off to a stub, electrode changes,
an arc-length cue and an arc sound that changes with arc length, slag over the pool, a chipping hammer
and the wire brush for slag, and the electric shock you get when you change an electrode with a bare
hand, a wet glove or a holed glove. Currents, arc lengths, angles, burn-off and deposition come from
electrode data sheets and manufacturer guides (see *SMAW sources*).

**Release 1.4** adds TIG welding (GTAW, ISO 4063 process 141) on 3.2 mm (1/8 in) carbon-steel sheet: an air-cooled
torch with a #8 cup and a ground 2.4 mm tungsten (ceriated, lanthanated, thoriated or pure, each with
its AWS / ISO class and tip colour), the trigger as a fingertip amperage control, HF or lift-arc
starting, a filler rod (ER70S-2 or ER70S-6) held and fed by the other hand, argon pre-flow and post-flow,
and the consequences of the classic TIG mistakes: tungsten touching the work or dipped into the pool
(contaminated tungsten, tungsten inclusions, regrinding), the rod touching the tungsten, a hot rod end
pulled out of the gas (oxide, porosity), too much argon (turbulence, porosity), DCEP (the tungsten
melts, shallow fusion), a post-flow too short for the current (oxidised tungsten), and the radioactive
grinding dust of thoriated tungsten. Values come from tungsten, torch and filler manufacturers' guides
(see *GTAW sources*).

**Release 1.5** adds pipe welding with covered electrodes (SMAW): open-root single-V butt joints without a
backing ring on NPS 6 (DN 150) Sch 40 and Sch 80 and NPS 2 (DN 50) Sch 80 and XXS pipe, in the 1G (rolled),
2G, 5G and 6G test positions, uphill or downhill. The root run forms the inside bead through the gap (or
leaves the root unpenetrated, concave or burnt through), the electrode angle window follows the position
round the pipe, a keyhole cue guides the root (whose travel speed is judged by the keyhole), starts and
craters can be ground to a feathered edge before tying in, the 1G pipe is rolled between runs, and the macro
section shows the root side. The training WPS
takes its electrodes and currents from the Lincoln C2.420 pipe procedure table (E6010 root, E7018 fill and
cap); six pipe drills (scope B6) sit beside the plate drills (see *Pipe sources*).

**Release 1.6** adds oxy-fuel cutting (oxyacetylene, ISO 4063 process 81) on carbon-steel plate from
6.4 to 25.4 mm (1/4–1 in) at a cutting rack over a sand tray, with the oxygen and acetylene cylinders on
their cart. The whole outfit is operated as the manufacturer's instructions say (Victor 0056-3260 and
0056-0138, OSHA 1910.253): chaining, valve caps, cracking the valves, fitting the regulators with their
screws released, opening the cylinders (acetylene about 3/4 turn, never above 15 psig), the leak test,
working pressures from the Victor tip chart, purging each hose, lighting with a spark lighter, the flame
from smoky acetylene through the carburizing feather to neutral, the lever pressed and the flame
readjusted, and the shut-down in order. The cut starts when the edge reaches the kindling temperature
(Smith: bright red, about 816 °C) and the lever is pressed; travel speed, cone distance, torch angles,
oxygen pressure and preheat decide the cut face along the cut, judged by the Harris cut-quality
categories and the ISO 9013 perpendicularity ranges, until the strip drops into the tray. Backfire,
sustained backfire, flashback and the shut-down "pop" happen for their real causes (AWS Fact Sheet
No. 28), and cutting without a filter lens, sparks on a bare hand and a bare hand on the hot plate have
their consequences. Five cutting drills (set-up and shut-down, straight, bevel, thick plate, backfire
response) sit in the new cutting menu (see *Oxy-fuel cutting sources*).

**Release 1.7** adds **welder qualification** (the scope's mock tests, family E) to ISO 9606-1:2012
(BS EN ISO 9606-1:2017), ASME BPVC Section IX-2023 and API 1104 22nd edition, built from the licensed
copies WELL EXPERTS supplied. Fifteen tests (ISO: plate butt PF with 111 and 135, pipe H-L045 and PH with
111, fillet PB with 135 and 141; ASME: 6G and 5G pipe, 3G plate with SMAW and GMAW, 2F fillet with SMAW and
GTAW; API: 6G, 5G and rolled pipe) are welded on the test piece the code describes, and the code's test
conditions are checked (ISO 6.3: a stop and restart in the root and in the capping run; ASME Figure
QW-462.4(b): a restart near the centre of the fillet coupon). The weld is then examined as the code requires:
visual examination first, then radiography, transverse root, face or side bends, fracture and nick-break
tests or macro sections cut at the code's specimen locations, each simulated from the weld the trainee made
and judged to the code's acceptance clause. A test lab shows the radiograph on a film viewer, the bent
specimens, the fracture faces and the macro sections. A pass gives the ISO designation, the range of
qualification, the validity and the retest rule of the code; the training record, in the layout of ISO
9606-1 Annex A, Form QW-484A or API 1104 Figure 1, stays on the headset and can be downloaded, marked as a
simulator training record and not a qualification. The two AWS D1.1 tests stay visual only (no licensed
copy). See *Welder qualification sources*.

The scope recommends Unity for the production product. This build is a WebXR prototype: it runs today
on the headset without an app store, and its simulation core (`src/sim/`) doubles as a reference
implementation for the production engine.

> **Simulator training record — not a welder qualification under any code.**
> The weld model is uncalibrated and the rule packs are training packs (see *Model status* and
> *Rule packs* below). Every number that is not taken from a source is marked `seed` in the code.

---

## 1. Run it on the Quest 3S

The whole simulator is one file, `index.html` (about 1.8 MB; three.js and all textures are inside it).
WebXR only starts on a secure page, so the file must be opened from an **HTTPS** address or from
`localhost`.

| Route | Steps |
|---|---|
| GitHub Pages (git) | Push this repository to GitHub, then *Settings → Pages → Build and deployment → Source: Deploy from a branch*, branch `main`, folder `/docs`, *Save*. Open `https://<account>.github.io/<repository>/` on the Quest. `docs/index.html` is the published copy of the build (see below). |
| Netlify or any static host | Upload the folder that contains `index.html`. Open the HTTPS address on the Quest. |
| Company web server | Publish `index.html` on an HTTPS site you control. |
| USB to a PC (developer mode) | In the folder with `index.html` run `python -m http.server 8080`, connect the Quest by USB, run `adb reverse tcp:8080 tcp:8080`, then open `http://localhost:8080` in the Quest Browser. |

GitHub Pages notes (GitHub documentation): on GitHub Free, Pages works only from a public repository
(private repositories need GitHub Pro, Team or Enterprise); a Pages site is public on the internet even
when its repository is private; a push can take up to 10 minutes to appear on the site. To publish a
change: `npm install` (once), `npm run pages` (rebuilds `dist/` and refreshes `docs/index.html`), then
`git add -A`, `git commit -m "…"`, `git push`.

Then, in the Meta Quest Browser:

1. Open the address and press **Enter VR** (virtual welding booth) or **Enter MR** (your own room
   through passthrough).
2. The bench appears about 0.5 m in front of you with its top at 0.90 m. Change the height, recenter it,
   or align it to a real table in **Settings**.
3. Hold the right controller as the gun (left-handed users: *Settings → Gun hand → Left*).

The claude.ai artifact preview runs the same page on the desktop (demo welds, exercises, inspection,
results), but its frame may block WebXR; use one of the routes above for the headset.

## 2. Controls

| Input | Action |
|---|---|
| Gun hand trigger | Weld (arc strikes when the wire reaches the work) |
| Electrode holder (SMAW) | Touch the work with the electrode and lift it to strike (scratch or tap); lift away to break the arc; a quick twist frees a stuck electrode |
| Holder hand A / X (SMAW, arc off) | Take the stub out and fit a new electrode (dry, intact gloves!) |
| Holder hand thumbstick up/down (SMAW Practice, arc off) | Welding current in 5 A steps |
| TIG torch trigger (GTAW) | Torch switch and amperage control: press to start (pre-flow, then the HF arc with the tungsten 1.6–3.2 mm from the work, or touch and lift with *Lift-arc*); how far you pull sets the share of the preset current; release to stop (post-flow follows) |
| Rod hand (GTAW) | The filler rod points where the controller points: dab its tip into the front edge of the pool |
| Rod hand thumbstick forward / back (GTAW) | Slide the rod through the fingers (feed it out as it melts) |
| Torch hand A / X (GTAW, arc off) | Regrind the tungsten (contaminated or oxidised end removed, point reground) |
| Rod hand A / X (GTAW) | Take a new filler rod |
| Torch hand thumbstick up/down (GTAW Practice, arc off) | Preset current in 5 A steps |
| Cutting torch trigger (oxy-fuel cutting) | The cutting oxygen lever: press it slowly and fully once the edge is bright red |
| Cutting torch hand thumbstick, held (oxy-fuel cutting) | Up / down turns the preheat oxygen valve, left / right the fuel valve (faster the further it is pushed) |
| Cutting torch hand A / X (oxy-fuel cutting) | Spark lighter into the other hand (or away); that hand's trigger strikes it: hold it at the tip |
| Chipping hammer | Swing the chisel end down onto the bead: each blow knocks the slag off a short length |
| Gun hand B / Y | Lower or raise the helmet |
| Quick downward nod | Lower the helmet (can be switched off) |
| Gun hand thumbstick (Practice, arc off) | Wire feed up/down, voltage left/right |
| Gun hand trigger with the thermometer | Record the temperature where the probe touches the plate |
| Gun hand A / X (Inspector lab) | Switch fillet gauge / bridge gauge |
| Gun hand trigger (Inspector lab) | Record the gauge reading |
| Other hand ray + trigger | Use the panels (machine, gas, work area, menu) |
| Other hand B / Y | Bring the menu in front of you |
| Other hand squeeze near a coupon | Pick the coupon up and turn it (Inspector lab, results) |
| Either hand squeeze at a PPE item (or pointing at it) | Take it from the rack; let go at the head, chest or legs to put it on, over the red bin to reject it |
| Squeeze on the extraction hood (or pointing at it) | Move the hood; trigger while holding it switches the fan on or off |
| Squeeze at the middle of the booth curtain | Open or close the curtain |
| Point and trigger (Safety drills) | Tag a place in the hazard hunt; put things right for the hot work permit; check a place on the fire watch |
| Other hand A / X | Close an incident card |
| Other hand thumbstick | Scroll lists |
| Desktop | Drag to orbit, click panels, `H` toggles the helmet view |

Haptics: a pulse at arc start, a continuous buzz that follows the short-circuit rhythm and arc
stability, a strong pulse when the wire stubs into the work, and a tick when the brush scrubs slag.
SMAW: a buzz that grows with arc instability, a strong pulse and a steady buzz while the electrode is
stuck, a sharp knock for each hammer blow, and a jolt in both hands for an electric shock.
GTAW: a short burst at the HF start, a light buzz that grows when the arc is unstable, a strong pulse when
the tungsten touches the work or the pool or the rod touches it, and a tick in the rod hand while the rod
melts in the pool. Oxy-fuel cutting: a light buzz while the cut runs, stronger as the speed goes up, and a
strong pulse at a backfire.

## 3. What is in this build

**Safety and PPE (new).** Three drills in the workshop; the *Go to* buttons move the trainee between
the bench, the PPE station, the walkway, the gas store and the grinding station.

* *Dress for the job.* A job is described (MAG fillet weld in the booth; overhead flux-cored fillet;
  stick welding with E7018, where you change electrodes by hand; outdoor FCAW-S repair). The rack holds the normal stock plus damaged or unsuitable items: an
  auto-darkening helmet with spatter over its arc sensors, a fixed-shade helmet with a cracked filter
  plate, reading spectacles, a polyester fleece, an oily or frayed FR jacket, gauntlets with a hole or
  wet, nitrile gloves. The check lists each requirement as *shall* or *should* with its clause (helmet
  and filter shade by process and current, safety glasses with side shields, flame-resistant clothing
  covering the arms, dry hole-free FR gloves, cuffless trousers, leather boots, cape and ear plugs
  overhead, respirator where extraction cannot be used) and what happened to each damaged item. In the
  headset a test run follows with the chosen PPE, and its consequences are shown.
* *Booth inspection.* 3, 5 or 7 unsafe conditions are set from 19 (cylinder not chained, valve cap
  missing, combustibles within 35 ft, extinguisher missing / discharged / blocked, damaged lead, splice
  near the gun, curtain open, hood parked, water at the machine, clamp far from the weld, gun hung on
  the cylinder, oxygen stored with acetylene, acetylene lying down, oil on the oxygen regulator, grinder
  without guard, no signs, hot coupon not marked). The trainee points at a place and names what is
  wrong; the debrief gives the rule, the source and the fix.
* *Hot work permit and fire watch.* The permit can only be signed when each item is true in the scene
  (combustibles moved or covered, extinguisher charged and accessible, curtain closed, fire watch
  assigned). After the weld the fire watch runs (30 min under OSHA 1910.252, 1 h under ANSI Z49.1:2021;
  the clock runs 30× faster); a spark smoulders somewhere (under the blanket edge, in wood shavings
  beside the booth, in a rag bin) and becomes a fire if it is not found.

**Consequences in every mode (headset).** UV dose to the eyes and to bare hands and forearms from the
AWS Fact Sheet 26 viewing distances (inverse-square, cumulative); arc eye when the daily limit is
reached with the helmet up; dazzle when an auto-darkening filter does not switch; filter shade below the
OSHA minimum; spatter burns on bare skin, through a hole in a glove, and melting synthetics; contact
burns from the coupon's real temperature (CENELEC Guide 29 and Moritz–Henriques thresholds; 70 °C and
above burns on contact); fume not captured (hood more than one hood diameter from the arc, HSE WL3) and
the head in the plume; defective PPE in use; arc struck with the curtain open. Burns show on the hands;
cards appear when the arc stops, with effects, first aid and the rule. Settings choose whether the app
sets up the PPE and booth before each coupon or the trainee does.

**Stick welding, SMAW (111) (new).** Choose the electrode and size in Practice and in the drills:
E7018 (basic, low hydrogen, DCEP or AC), E6013 (rutile, AC preferred, DC either polarity) or E6010
(cellulosic, DCEP), 2.5, 3.2 or 4.0 mm.

* *Training WPS.* The current window of each size is the overlap of the cited data-sheet ranges, 15%
  lower out of position (Hobart data sheets); polarity is the first one the data sheets list; the
  arc-length window is about one electrode diameter (0.3–1 × d for E7018: "very short arc"); drag
  angle 10–30° (Lincoln C2.410). The machine panel is a constant-current source: you set the current and
  the polarity; the voltage follows the arc length while welding.
* *Striking and burning.* The electrode is live: touch the work and lift it within about half a second
  to strike; held down longer it sticks and must be twisted free (Hobart/Miller 155095F); lifted too far
  the arc goes out. The electrode burns off at the rate from the data-sheet fusion time and deposits at
  the data-sheet rate, both in proportion to the current; it burns down to a 2 in (50 mm) stub, the
  allowance the data sheets use. Fit a new one with A / X, restart ahead of the crater and move back
  into it (Lincoln C2.410).
* *Arc.* Too long an arc loses the coating's shielding (porosity) and, with low-hydrogen electrodes,
  is the first cue to correct; wrong polarity or damp electrodes make the arc unstable and spattery;
  current above the range adds undercut. The arc sound is a sharp crackle at the right arc length,
  coarse and uneven when it is too long, a soft buzz when it is too short (Hobart).
* *Slag.* Molten slag rides over the back of the pool and covers the bead. Chip it off with the hammer,
  then brush (Hobart/Miller 155095F: "Use a chipping hammer and wire brush to remove slag"); the brush
  alone does not lift SMAW slag. Slag left on a pass is trapped by the next one (slag inclusion, a
  smaller one where it was only chipped). Chipping with the helmet up and no safety glasses is
  recorded as a violation.
* *Electrode storage.* The gas panel becomes the electrode supply for SMAW: the condition of the
  electrodes and how each type is stored (holding oven for low-hydrogen, dry storage for rutile, room
  temperature for cellulosic). Damp low-hydrogen electrodes weaken the shielding and make the arc noisy
  (Lincoln MC22-140, TWI JK42); troubleshooting scenario C1-S starts with them.
* *Electric shock.* Changing the electrode with a bare hand, wet gloves or a holed glove while the
  machine is on gives an electric shock incident: CCOHS, "Do not replace the welding electrode with a
  bare hand, or with a wet welding glove"; the danger is the machine's no-load voltage; first aid from
  AWS Fact Sheet No. 5. The safety drills have a stick welding job (E7018) with wet and holed gauntlets
  and thin TIG gloves on the rack.

**TIG welding, GTAW (141) (new).** Practice on 3.2 mm (1/8 in) carbon-steel sheet: a fillet weld on a
T-joint (3.2 mm leg; PA, PB, PF, PG, PD) or a bead on plate. Choose the tungsten (EWCe-2 / WC20 grey, EWLa-1.5 / WL15
gold, EWLa-2 / WL20 blue, EWTh-2 / WT20 red, EWP / WP green) and the rod (ER70S-2 or ER70S-6); the torch
hand holds the torch, the other hand the rod.

* *Training WPS.* From the CK Worldwide Form 116 table for low-alloy steel, which covers mild and
  low-carbon steels, row 1/8 in (3.2 mm): 3/32 in (2.4 mm) tungsten, 3/32 in (2.4 mm) rod, argon 18 CFH
  (9 L/min), DCEN; fillet 200–250 A at 9 in/min (3.8 mm/s); butt 175–225 A at 11 in/min (4.7 mm/s),
  used for the bead on plate. The 3/32 in tungsten's typical DCEN range is 150–250 A with a #8 cup (CK
  Form 116). Argon window 10–25 CFH (4.7–11.8 L/min) and arc length 1/16–1/8 in (1.6–3.2 mm) from
  Miller OM-215994; torch pushed 10–20° (70–80° to the work); post-flow one second per 10 A and at least
  8 s (Miller), so 25 s at 250 A. The filler-melting seed is set so the model lays these joints at the
  CK travel speeds.
* *Machine.* A DC constant-current panel: preset current, DCEN / DCEP, HF or lift-arc start, post-flow
  time; the A display shows the current the amperage control is giving. The gas panel is the argon
  flowmeter.
* *Arc.* HF starts the arc without touching once the pre-flow has run (0.2 s, Miller) and the tungsten
  is within reach of the HF spark; with lift-arc you touch, then lift (dragging it like a match is a
  scratch start: Miller "Do NOT Strike Like A Match!"; TWI JK 6). Lifting the torch too far puts the arc
  out. A long arc wanders and loses shielding (ESAB); a torch tilted 45° or more loses gas coverage
  (Miller).
* *Filler.* While its tip is in the pool the rod melts at a rate in proportion to the current (a seed);
  that metal is what builds the weld: no rod, no weld metal. The melted length comes off the rod in your
  hand: slide it forward with the thumbstick, take a new one with A / X. A hot rod end taken out of the
  argon oxidises, and the oxide goes into the pool next time you dab (porosity; Miller and ESAB: keep the
  rod inside the gas).
* *Tungsten.* Touching the work or the pool with the tungsten, or touching the tungsten with the rod,
  contaminates it (ESAB, CK, Fronius): the arc becomes erratic and tungsten is left in the weld (shown
  as a tungsten inclusion in the results, not judged: the code limit was not checked in this build).
  Regrind it with A / X (Miller: "Remove 1/2 in. of contaminated tungsten and repoint tungsten"); for
  thoriated tungsten the app reminds you that its grinding dust is radioactive (AWS Fact Sheet No. 27).
  On DCEP most of the heat goes into the tungsten: it overheats, melts into the pool and the weld is
  shallow (CK, ESAB, DGP; Miller: "Tungsten melting into weld puddle"). Pure tungsten on DC gives a poor
  arc (DGP: for AC only).
* *Crater and post-flow.* Ease off the amperage control while still adding filler to fill the crater
  (Miller, TWI), then keep the torch over it until the post-flow stops; a post-flow shorter than about
  one second per 10 A, or moving the torch away during it, leaves the tungsten oxidised (blue-black).
* *Cues and demo.* Arc length, push angle, work angle, speed and aim, with messages for a contaminated
  or oxidised tungsten, a long arc, an oxidised rod end and no filler. The demo welder strikes with HF,
  dabs at a steady rhythm, ramps the current down at the end and holds the post-flow.
* *Safety.* GTAW UV dose (AWS Fact Sheet No. 26 rows for argon), the GTAW shade rows, and a TIG job at
  the PPE rack (J5) where thin TIG gloves are the right choice (AWS Fact Sheet No. 37).

**Pipe, open root, SMAW (new).** Choose *Pipe, open root* in Practice with SMAW (111).

* *Coupon.* Two pipes, each 125 mm long (ISO 9606-1 Figure 5: at least 125 mm), NPS 6 Sch 80
  (168.3 × 10.97 mm), NPS 6 Sch 40 (168.3 × 7.11 mm), NPS 2 Sch 80 (60.3 × 5.54 mm) or NPS 2 XXS
  (60.3 × 11.07 mm) (ASME B36.10 values), single-V groove with a 60° included angle, 2.4 mm (3/32 in) land
  and 3.2 mm (1/8 in) gap, no backing ring (Lincoln C2.420: bevel 30°, land 3/32–1/8 in, gap 3/32–1/8 in,
  "A 1/8" (3.2mm) gap must be maintained accurately all the way around the joint"). The joint is marked
  at 12, 3, 6 and 9 o'clock (ISO 9606-1 6.1: "for fixed pipe welds, the 12 o'clock welding position shall
  also be marked").
* *Positions* (ASME BPVC Section IX-2023 QW-122; ISO designations from ISO 6947:2019 Table B.1): 1G pipe
  rotated (PA), 2G axis vertical (PC), 5G axis horizontal, fixed, uphill (PH) or downhill (PJ), 6G axis at
  45°, fixed, uphill (H-L045) or downhill (J-L045). The pipe stands on a stand in front of the bench.
* *Training WPS.* From the C2.420 in-plant pipe procedure table (DC+): root 1/8 in (3.2 mm) E6010, 85–95 A
  with the pipe axis horizontal and 80–110 A with it vertical; fill and cap E7018 1/8 in 115–135 A, or
  3/32 in (2.5 mm) 85–105 A on NPS 2 pipe with its axis horizontal. The electrode changes with the pass
  (the next pass puts the WPS electrode in the holder). Downhill joints are root-pass coupons: the C2.420
  downhill procedure runs 5/32 in roots and 5/32–3/16 in fill and cap passes above the kit's electrodes,
  so the downhill root uses 1/8 in E6010 inside its data-sheet range (Hobart 610 80–120 A).
* *Root.* The root run's reach through the land decides the root (a keyhole index): too little and the
  bottom of the gap stays open (4021 incomplete root penetration), on target an inside bead forms
  (C2.420: "This inside bead should have an even surface and be at least 1/16" (1.6 mm)"), too much and
  it burns through (510). Gravity pulls the inside bead into the bore at the top of a fixed pipe (504
  excessive penetration) and back out overhead at 6 o'clock (515 root concavity, suck-back). An arc held
  to one side leaves the far land unfused (lack of root fusion, in the section).
* *Technique.* The electrode angle window follows the position the joint is in at the arc (ESAB): drag
  5–10° flat and horizontal, push 5–10° on the vertical uphill, drag 0–10° overhead; vertical down
  10–30° in the direction of travel (Lincoln C2.410). The live cues add the keyhole (closed, open,
  large, burning through) on the root run and the clock position of the arc; the pacer runs round the
  pipe in the direction of the run. Runs may go either way round: the direction of each run is taken
  from its motion.
* *Travel speed on the root.* On the open root the welder sets the travel speed by the keyhole, not by
  a deposition rate (C2.420, keyhole too small: "Slower travel speed"; too large: "Travel faster until
  the size of the keyhole decreases"). On the root run the keyhole cue takes the place of the speed
  cue, no pacer is shown, and the technique report judges the travel speed by the share of the root
  with the keyhole in its window; the fill and cap passes keep the speed window and the pacer.
* *Starts, stops and tie-ins.* *Grind starts and craters* feathers this pass's starts and craters
  (C2.420: "Fewer defects will be seen if restarts and stops (craters) are ground out, with the stops
  ground down to a feathered edge"). A run that ties in over metal already there is judged as a tie-in;
  its crater is filled by the metal it runs onto.
* *1G.* *Roll the pipe ¼ turn* turns the pipe so the next part of the joint is on top (QW-122: "rolled
  during welding so that the weld metal is deposited from above").
* *Demo.* The demo welder welds each pass as the drills describe: uphill from just past 6 o'clock to just
  past 12 o'clock one side at a time (C2.420: "The root pass is made from bottom to top, one side at a
  time"), the start and end of the first half ground before the second half, starts moved along from
  pass to pass (C2.420: "Never start a bead at the same point as the previous bead was started"); 2G in
  two halves the same way round; 1G in four quarters on top of the pipe. On the root it keeps the
  keyhole by its travel speed, a little smaller toward the top.
* *Results.* ISO 5817:2023 B, C and D, ISO 9606-1 and API 1104 (visual; 19th-edition values until the
  22nd-edition pack of the mock-test stage); the AWS D1.1 packs of this build are for plate and are not
  offered for pipe. The root side is judged for 504, 515, 510 and 4021. A root-pass coupon is judged on
  the root and the run (the cap checks do not apply). The macro section shows the root and the inside
  bead, and its position is given as a clock position.

**Oxy-fuel cutting, 81 (new).** *Oxy-fuel cutting* on the home screen: practice cuts, the cutting drills,
and the outfit set-up from capped cylinders.

* *Plates and tips.* 6.4, 9.5, 12.7, 19 and 25.4 mm (1/4, 3/8, 1/2, 3/4, 1 in) carbon-steel plate, 250 mm
  long, with a soapstone line 50 mm from the edge; square or 30° bevel; tip 00, 0, 1 or 2. The tip size,
  cutting oxygen and acetylene pressures and flows, travel speed and kerf of each plate are the rows of the
  Victor 0056-0138 Section 7 chart for oxy-acetylene tips (for example 1/2 in: tip 0, 30–35 psig and
  60–65 scfh oxygen, 3–5 psig and 9–16 scfh acetylene, 16–22 in/min, kerf 0.06 in), "measured at the
  regulator using 25' x 1/4" hose". The cutting bore passes oxygen in proportion to the absolute pressure
  (the chart's pressure and flow pairs agree with it within 3%), so a bigger tip or a higher pressure
  shows as more oxygen than the cut needs.
* *The outfit.* Cylinders chained on the cart, valve caps, cracking each valve standing to the side,
  regulators fitted with their adjusting screws released, the oxygen cylinder valve opened slowly then
  fully, acetylene about 3/4 turn and never more than 1 1/2 turns with the wrench left on, the 15 psig
  acetylene limit (OSHA 1910.253(a)(2)) and the 1/7-per-hour withdrawal limit (Victor 0056-3260 3.02), the
  leak test (20 psig oxygen, 10 psig fuel, cylinder valves closed, the gauges watched for five minutes;
  leak-detection solution and tightening), working pressures from the chart, each hose purged on its own
  (10 s per 25 ft of hose for tips up to size 3), the torch handle oxygen valve fully open for the cutting
  attachment. High- and low-pressure gauges follow the valves (the hose and regulator hold their pressure
  behind a closed cylinder valve until they are bled through the torch).
* *Lighting and the flame.* Fuel about 1/8 turn and the spark lighter (lit with oxygen open: a "pop");
  acetylene alone smokes until the fuel is opened to the tip's flow and leaves the tip if opened too far;
  preheat oxygen shortens the white acetylene feather until it just disappears into the inner cones
  (neutral, about 1:1); more oxygen makes the cones a lighter blue (oxidizing). Pressing the lever draws
  oxygen from the same line, so the flame turns carburizing until it is readjusted with the lever pressed
  (Victor 0056-0138 4.01 step 17). Each look of the flame is drawn as the sources describe it.
* *The cut.* Hold the inner cones 3–6 mm above the edge (Smith) until it is bright red, about 816 °C
  (Smith; Hobart 843 °C); oxygen on steel below that only cools it ("cold" message). Press the lever slowly
  and fully and move: the cut follows the jet, the kerf opens through the plate, sparks and slag stream
  out of the bottom of the kerf (leaning back with the drag) into the sand tray, the burning front and the
  fresh kerf edges glow and cool, and when the cut runs off the far edge the strip drops into the tray.
  Moving too fast loses the cut (release the lever, go back to the end of the kerf, preheat, restart: a
  gouge is left); moving too slowly lets the cut fuse together behind the jet (Victor: "Moving too slowly
  allows the cut to fuse together"); a start away from the edge pierces first, blowing slag up. The tip
  touching the work backfires; the cones buried in the kerf overheat the tip until it backfires.
* *Cut quality* (Harris *Machine Cutting Guide*): each millimetre of the cut takes a category from the
  conditions there — perfect, production, slightly too fast or slow, extremely fast or slow, tip too close
  or too high, too much cutting oxygen, preheat too hot, not severed (and dirty tip, in the model) — with the guide's own
  description, and the face gets the drag lines, top-edge rounding, slag on the bottom edge, pressure
  marks, grooves, bevel and kerf of that category. The perpendicularity u and its ISO 9013 range (1–5)
  come from the face angle, concavity and top edge (ISO 9013:2017 Table 4 formulas via Lincoln Electric,
  a secondary source; EN 1090-2 asks for range 4 for EXC3 and EXC4 and range 5 for EXC2).
* *Shut-down and hazards.* Preheat oxygen first, then the fuel (fuel first: "pop"); cylinder valves
  closed; oxygen bled through the lever and its screw released, then the fuel; gauges at zero. A tip
  touching the work or overheated backfires; a backfire on a hot tip with the gases flowing keeps burning
  inside the torch (sustained backfire: squeal and hiss) and burns through it after a few seconds unless
  the torch oxygen valve is closed first, then the fuel (Victor 0056-3260 5.06). The kit's torch handle has
  built-in check valves and flashback arrestors (as Victor "FC" handles); the model also has the reverse
  flow of a torch without check valves and the flashback when a hose holding the mixture is lit (AWS Fact
  Sheet No. 28), checked in the unit tests but not offered as a scenario in this build.
* *PPE and consequences.* The PPE check for gas cutting (filter goggles at or above the OSHA minimum shade
  for oxygen cutting — 3 under 25 mm, 4 from 25 to 150 mm — side protection, flame-resistant clothing,
  gauntlet gloves, trousers without cuffs, boots). In the headset: cutting or preheating without a filter
  lens is an incident (OSHA 1910.133(a)(5); Harris: "Always wear welding goggles to protect eyes from
  sparks and light rays"); a bare hand in the spark stream or touching the plate is burnt (the plate's
  temperature from the heat model, the same contact-burn thresholds as welding); backfires and sustained
  backfires are incidents with their rule. The goggles darken the view in the headset.
* *Drills* (scope C): C1 outfit set-up, lighting and shut-down (every step in the Victor order, no pop or
  backfire, neutral with the lever pressed, gauges at zero at the end); C2 straight cut on 12.7 mm; C3 30°
  bevel on 12.7 mm; C4 straight cut on 25 mm (tip 2); C5 sustained backfire response (oxygen first, within
  3 s, torch not burnt). Results: the drill criteria, the categories along the cut with the start and
  run-off marked, the ISO 9013 range, top edge, slag, line accuracy, kerf, starts and losses, gas used; the
  procedure step by step with its source and faults; the PPE check and the incidents of the attempt.
* *Sound.* The roar of the preheat flame (a soft rumble for acetylene alone), the rush of the cutting
  oxygen, the sputter of the cut ("The correct cutting speed is accompanied by a sputtering sound": Harris),
  gas escaping while purging or bleeding, the pop and the squeal of a sustained backfire, synthesised from
  the simulated state.

**Practice.** Processes 135 (GMAW, Ar + 18% CO2), 136 (FCAW-G), 114 (FCAW-S, DCEN), 111 (SMAW) and 141 (GTAW, 3.2 mm sheet). Fillet T-joints
in PA, PB, PF, PG, PD and single-V butt joints on backing in PA, PC, PF, PG, PE, 10 mm plate, 240 mm long
with 20 mm run-on and run-off zones (200 mm judged). A training WPS is shown for each choice (multi-run
welds carry a training interpass maximum of 250 °C, a seed). Live cues inside the helmet window (work
angle, travel angle, stick-out, travel speed, aim — the weave centre while weaving), a travel-speed
pacer, an aim line and a ghost torch at the start. Machine panel (wire feed, voltage, polarity, live A
and V), gas cylinder and flowmeter, work-area panel (fan, welding screen, joint cleaning). Multi-pass
butt welds with a wire brush for flux-cored slag. A demo pass shows the target technique.
**Heat panel:** a contact thermometer (probe in the gun hand; on the desktop, a position and a
*Measure* button), coupon cooling in real time or 10× / 30× faster while the arc is off (striking the
arc returns to real time), and a thermal-camera view of the coupon.

**Exercises (new).** The scope's technique drills as guided exercises. Each has a brief (objective,
training WPS, steps, the criteria it is judged on, sources), a pass-by-pass guide (lanes on the plate,
the next lane of a pad placed at the toe of the previous bead, cleaning prompts, the interpass check)
and a demonstration that follows the procedure (it cleans the previous run, waits for the interpass
temperature and measures it). Results open on an *Exercise* tab: every criterion with the measured
value, the target, and whether the target is a seed. Best results are stored on the headset.

| Drill | Coupon | Judged on |
|---|---|---|
| B1-S Stringer beads | Bead on plate, PA, three scribed lanes | width/height consistency, straightness, height band, undercut, pores, overlap/cold lap, end crater, arc strikes, spatter, technique |
| B1-P Pad of beads | Five overlapping beads, PA | consistency, pad flatness (valley depth), fusion between beads, slag between runs, undercut, pores, end crater, technique |
| B2 Weave beads with toe dwell | Bead on plate, PA, two lanes | weave width band, consistency, straightness, toe dwell share, undercut, pores, end crater, technique |
| B3 Fillet 2F / 3F / 4F | T-joint PB, PF (up), PD | ISO 5817:2023 level C visual verdict, technique |
| B4 Groove 1G / 2G / 3G / 4G | V-groove on backing PA, PC, PF (up), PE, four passes | passes, ISO 5817 C including internal (model), cleaning, interpass temperature, technique |
| B7 Starts, stops, tie-ins, crater fill | Bead on plate, PA, stop marks at 85 and 145 mm | stops at the marks, craters filled, tie-ins without gap or cold lap, consistency, straightness, undercut, arc strikes |
| B8 Multi-pass, cleaning, interpass | FCAW-G (136) groove on backing, PA | passes, cleaning, temperature measured before each run, interpass temperature, ISO 5817 C, technique |
| B6-R5 / B6-RD Open root, 5G uphill / downhill | NPS 2 Sch 80 pipe, root pass only, E6010 | ISO 5817 C on the root (504, 515, 510, 4021 and lack of root fusion), keyhole kept open (share of the root arc time), tie-ins, technique |
| B6-1G / 2G / 5G / 6G Pipe, root and cap | NPS 2 Sch 80 pipe, E6010 root and E7018 cap (5G and 6G uphill) | passes, ISO 5817 C including internal (model), keyhole, cleaning, interpass temperature, technique |

Processes per drill follow AWS SENSE Level I (GMAW-S and FCAW in all positions; spray transfer only
1F/2F and 1G). SMAW can be chosen for B1, B2, B3, B4, B7 and B8 with E7018 or E6013 (E6010 is used for
the pipe root passes); the steps and sources in the brief change to the stick-welding technique (arc
length, drag angle, electrode changes, chip and brush). The drill list has two tabs: plate and sheet,
and pipe (B6, SMAW only, the electrode of each pass set by the pipe WPS). B5 (GTAW open root) is not in
this build.

**Results.** Verdicts under ISO 5817:2023 B, C and D, ISO 9606-1, AWS D1.1 Table 8.1 (static), AWS D1.1
welder test (visual) and API 1104 (visual, training application to plate), in visual-examination mode or
with the internal imperfections the model knows (hidden for bead-on-plate drills, which are not welded
joints). Each finding shows the ISO 6520-1 reference or code clause, measured value, limit and position;
selecting it marks the spot on the coupon and cuts a macro section there. Technique per pass (share of
arc time inside each window, mean and spread, heat input to EN 1011-1), and per pass the interpass
temperature at its start, the plate temperature ahead of the arc, and a cooling-time estimate t8/5 from
the moving-source solutions (labelled as an estimate; it is not the EN 1011-2 method). Safety and
procedure: arc struck with the helmet up, arc-flash exposures, wire stubs, arc time with settings inside
the WPS, lens shade, highest interpass temperature at a run start, runs welded over slag, temperature
readings taken. Deterministic replay of the attempt (idle time, cleaning, waits and lanes included).

**Macro section.** An etched cross-section at any position, drawn from the same record as the bead:
fusion boundary, heat-affected zone, passes, lack of fusion, slag, pores, cracks, undercut and overlap,
with leg, throat and reinforcement dimensions; for drills, every bead crossing the section (pads show
each bead seated on the previous one).

**Troubleshoot.** A colleague's coupon is on the bench, welded with a fault in place. The trainee
inspects it (and cuts a section where the defect is internal), names the cause, corrects the equipment
or technique and welds a new test piece; the outcome checks that the imperfection has gone.

| ID | Injected cause | Imperfection taught |
|---|---|---|
| C1 | Gas cylinder empty | 2017 surface pores (2011 internal) |
| C2 | Fan draught at the arc | 2017 / 2011 |
| C3 | Oil on part of the joint | 2017 / 2011 over that length |
| C5 | Voltage too high, travel too fast | 5011 undercut |
| C6 | Travel too slow, voltage low | 506 overlap, convexity |
| C7 | Fill pass aimed at one wall, too fast | 401 side-wall lack of fusion (section) |
| C8 | Short-circuit settings far too low on 10 mm | 401 inter-run / root lack of fusion (section) |
| C12 | Flux-cored passes not cleaned | 301 slag inclusion (section) |
| C14 | Arc broken without crater fill | 2025 crater pipe, 104 crater crack |
| C15 | Very high current, deep narrow bead | 101 centreline crack |
| C17 | DCEN with solid wire | 602 spatter, unstable arc |
| C18 | Cap run far too slowly | 502 excess weld metal, 506 overlap |
| C20 | Arc struck on the plate | 601 arc strike |
| C1-S | SMAW: E7018 from an open box on the bench (moisture in the coating) | 2017 / 2011 porosity |
| C2-S | SMAW: arc held far too long with E7018 | 2017 porosity, 5011 undercut, spatter |
| C12-S | SMAW: passes not chipped and brushed | 301 slag inclusion (section) |
| C17-S | SMAW: E7018 on DCEN | 602 spatter, unstable arc |
| C1-T | GTAW: argon at 25 L/min (turbulence) | 2017 / 2011 porosity |
| C3-T | GTAW: hot rod end pulled out of the argon between dabs | 2017 / 2011 porosity |
| C17-T | GTAW: machine on DCEP (tungsten melting into the pool) | 401 lack of fusion (section), tungsten inclusions |

**Welder qualification.** Choose the standard, then the test. The brief gives the test piece of the
code (ISO 9606-1 6.2 and Figures 3–7; ASME QW-462.4(b) and QW-469; API 1104 6.2), the test conditions,
the material (SA-516 Grade 60, SA-106 Grade B or SA-36 with its P-Number and ISO/TR 15608 group from Table
QW/QB-422), the fillers with their F-Numbers, ISO groups and types and API groups, the training WPS and the
examination methods the code allows (ASME QW-304: no radiography for GMAW short-circuiting). The test weld
has no cues and the machine stays inside the WPS ranges; a checklist shows the conditions as they are met.
In the headset there is no demonstration pass; on the desktop the demonstration welder makes the required
stop and restart. When the test piece is submitted:

| Step | ISO 9606-1:2012 | ASME IX-2023 | API 1104 22nd ed. |
|---|---|---|---|
| Conditions | 6.3 stop and restart in root and cap (marked); clause 7 slag and spatter removed | QW-462.4(b) restart near the centre (fillet) | 6.1 one welder, WPS |
| Visual | 6.4, ISO 17637; clause 7 (ISO 5817 B; C for 501, 502, 503, 504, 5214); a failure ends the test | QW-302.4, QW-194 | 6.4 (cracks, burn-through, Table 8 undercut, 9.8.2 internal concavity) |
| Radiography | ISO 17636; clause 7; with 135 one root and one face fracture test too (Table 13 b) | QW-302.2, QW-191.1.2.2 (linear, rounded by count and area against Figure QW-191.1.2.2(b)(4)) | 6.6 and 9.3 (IP, IF, IFD, IC, BT, slag, porosity, cracks, undercut, accumulation) |
| Bend tests | 6.5.2.3: root and face bends over the examination length, former 4t, 180°; no discontinuity ≥ 3 mm, sum of 1–3 mm ≤ 10 mm | QW-452.1(a), QW-462, QW-463.2, QW-466.1; side bends for t ≥ 10 mm; > 1/8 in (3 mm) open rejects (QW-163) | Table 7 and Figure 12; 5.6.4.3 |
| Fracture / nick break / macro | 6.5.2.2, 6.5.3 (ISO 9017); Table 13 e macro at the stop and restart | QW-182 centre fracture with the root in tension, QW-184 end macro | 5.6.3 nick break; 5.6.3.3 acceptance |
| Range | Tables 3–12 and 5.2–5.9; designation (clause 11) | QW-350–QW-356, QW-402–QW-409, QW-423.1, QW-433, QW-452.1(b), QW-452.3, QW-461.9, Form QW-484A | 6.2.2 a–i, Tables 4 and 5 |
| Validity, retest | 9.1–9.3 (confirmation every 6 months; revalidation 9.3 a, b or c); clause 8 one retest | QW-322.1 (6 months without using the process); QW-321 immediate retest, two coupons | 6.8 (no period set); 6.7 second opportunity |

The examination screen has five tabs: the summary with the verdict and the deciding clause, the visual
findings, the tests (each specimen accept or reject), the range of qualification row by row with its
clause, and the record. The test lab beside the bench shows the radiograph (whole circumference of a pipe
or the plate with its run-on and run-off zones; lead location markers; a wire IQI; indications marked on
request), the bend specimens (the U bent round the former, the strain of the outer fibre and the convex
surface with any opened discontinuity), the fracture and nick-break faces (fibrous steel with pores, slag,
unfused faces and cracks where the weld has them) and the macro sections at their cut positions. Training
records (date, test, method, verdict, designation, range, validity, conditions, specimens, the welding
parameters of each pass) stay on the headset; on the desktop each can be downloaded as an HTML page. The
retest rule of each code is offered after a failure (ISO: one retest; ASME: two consecutive coupons;
API: a second opportunity). The two AWS D1.1 tests (fillet 2F 135, groove 3G 136) remain the visual-only
mock tests of earlier releases, from secondary sources.

**Inspector lab.** Six coupons with known imperfections judged to ISO 5817 (B, C, D), AWS D1.1 or
API 1104. Digital fillet gauge (leg, throat, convexity) and bridge gauge (undercut, reinforcement or
underfill, misalignment); findings by ISO 6520-1 number; accept or reject; scoring of detection, false
calls, sizing and the decision.

**Tracking lab.** Static test (gun at rest, 5 s) and motion test (15 s): jitter, tracking loss,
estimated-position frames, frame rate, against the proposed Phase 0 gate (≤ 0.5 mm jitter, no loss
> 100 ms, ≥ 72 FPS). Results stay on the headset.

**Settings.** English / Arabic (right-to-left), gun hand, frame rate (Auto starts at 90 Hz and drops to
72 Hz if frames run late), fixed foveation, dark lens shade DIN 9–13, helmet nod, haptics, volume, gun
neck angle 45° or 60°, PPE and booth set-up (by the app or by the trainee), bench height, recenter,
align to a real table, booth and virtual bench on or off.

## 4. Physics and graphics (release 1.1)

**Heat flow in the coupon.** Every plate is a grid of 2.5 mm cells, averaged through the thickness,
with EN 1993-1-2 carbon-steel properties (density 7850 kg/m³; temperature-dependent conductivity and
specific heat, including the peak at 735 °C), solved in enthalpy form. Surfaces lose heat by radiation
(emissivity 0.7, EN 1993-1-2) and free convection (10 W/m²K, a seed inside the published 2–25 W/m²K
range). The two plates of a T-joint and the backing bar of a butt joint are coupled. The arc puts
k × U × I into the plate under the pool. Cooling waits and accelerated time run on a 2:1 coarse grid
(detail finer than 5 mm decays within a fraction of a second once the arc has gone); a test checks that
waiting in short steps or in one step gives the same result and follows fine stepping within 3%.

**Weld pool.** Length and width come from the moving point-source (Rosenthal) solution with image
sources for the plate thickness, a solid angle of 2π on a plate surface and 3π in the root of a T-joint,
the liquidus from the steeluniversity equation (1515 °C for the example composition) and the plate
temperature ahead of the arc taken from the heat-flow model. A hotter coupon (preheat, heat build-up,
interpass) gives a longer, wider pool, which in turn widens and flattens the bead and deepens fusion;
spray transfer's larger, more fluid pool sags out of position (the cue says so: CWB Group, spray is
mainly for flat and horizontal welding).

**Starts and stops.** Cold starts fuse less (start temperature from the heat-flow model); restarts are
recognised from 10 mm behind to 25 mm ahead of the crater, and a restart struck ahead and backed into
the crater (The Fabricator: 1½ × weld size) ties in without cold lap. Craters are filled by backing up
over the end (1½ × weld size) or by a dwell.

**Interpass temperature.** At every run start the model records the temperature at the start point and
the highest temperature within 10 mm of the weld line. Drills compare it with the training WPS maximum
(250 °C, seed). The contact thermometer reads the model with a 1.5 s probe lag (seed).

**Hot metal.** The glow of the pool, the bead behind it and the plate is Planck radiation of a grey
body (emissivity 0.7) through the CIE 1931 colour-matching functions (analytic fit of Wyman, Sloan and
Shirley) into linear sRGB, in units of a white surface in the booth (about 148 cd/m², seed), then a
hue-preserving highlight compression for the display. Through the dark lens only the pool and the metal
just behind it stay visible, as on a real helmet. The bead cools with the plate under it.

**Heat tint.** Temper colours from the peak temperature, in the order NBS Letter Circular 630 gives for
steel heated in air (light straw … light blue), with blue anchored to its 260–370 °C bluing range; the
band temperatures in between are seeds. They show on bright (ground) metal and hardly on mill scale.
Oxide scale darkens metal that went above about 600–1000 °C (seed).

**Arc, transfer, spatter, fume.** The arc column follows the process and gas; short-circuit transfer
flickers as the arc goes out during each short (CWB Group: "typically up to 200 times per second"),
globular drops wander and fall (1.5 to 3 times the wire diameter), spray is a steady stream. Spatter
drops fly ballistically, cool by radiation and convection, and stick or bounce where they land. Fume
rises from the arc, lit by it, drifts in a draught and is pulled toward the extractor; flux-cored and
spray produce more than dip transfer (TWI); rates are seeds.

**Workshop kit.** Wire feeder with a turning spool, gun cable, work lead and clamp, gas hose (hanging
cables are simulated ropes), a more detailed gun (nozzle sooting, frozen wire ball). Static parts are
merged by material to keep draw calls low (desktop scene during welding: about 53 draw calls,
19 000 triangles).

## 5. Model status

**Uncalibrated engineering model.** Directions of effect follow published guidance; coefficients are
seed values to be replaced by the calibration welds described in the scope. Every seed is marked
`seed` in the source.

* Heat input: EN 1011-1 form, Q = k × U × I × 60 / (v × 1000) kJ/mm, k = 0.8 for 135, 136 and 114.
* Deposition: wire cross-section × wire feed speed × deposition efficiency (seed efficiencies).
* Current from wire feed speed: seed curve for 1.2 mm wire consistent with TWI ranges; longer
  contact-tip-to-work distance lowers current (EWI direction).
* Optimum voltage lines through the TWI short-circuit and spray points for 1.2 mm wire; transfer mode
  from current, voltage and gas.
* Penetration and bead shape: directions from Kobelco (current, voltage, speed) and ESAB (drag versus
  push); magnitudes are seeds. Bead width follows the pool width from the heat-flow and pool models.
* Bead on plate: each bead's toes sit on the surface it was laid on (plate or the previous bead) with a
  parabolic face over the chord, sized to the deposited area.
* Imperfection rules (all seeds): porosity from shielding loss and contamination; undercut from excess
  voltage, fast travel, high current, toe angle and weaving without a pause at the sides; overlap and
  cold lap from slow travel, cold arcs, cold starts and fluid pools out of position; lack of fusion from
  fusion depth, aim and bead width; slag from uncleaned flux-cored passes; unfilled craters and crater
  cracks; centreline cracks from a deep, narrow bead at high current; arc strikes; spatter.
* Technique windows: stick-out 15–20 mm (135, 136) and 20–25 mm (114) from ESAB and Weld Australia;
  work angle centred on 45° (T-joints) and 90° (butt joints and plates), travel angle 5–15°
  (Miller Electric); the ± tolerances, the aim window and the ±20% speed window are SME placeholders.
* Exercise pass marks (bead-size spread, straightness, height and width bands, pad flatness, toe dwell
  share, surface pores per bead, spatter, technique share, stop-mark tolerance) are seeds: the scope
  builds in no pass mark. The model keeps a small sporadic pore rate even with good shielding, so the
  pore mark allows one surface pore per bead; lost shielding gives far more.
* Cooling-time estimate t8/5: Rosenthal thick-plate (3-D) and thin-plate (2-D, n plate branches)
  solutions with EN 1993-1-2 mean properties between 500 and 800 °C, the larger applying. An
  engineering estimate, not the EN 1011-2 method.
* The helmet's displayed transmission is a compressed mapping that keeps the order of shades; a display
  cannot reproduce the arc's luminance. The filter-shade check uses the OSHA 1910.133(a)(5) minimum and
  the ANSI Z49.1:2021 Table 1 suggested shade for the process and the mean arc current.
* Safety model values that are design values of this build, not from a source: the hand counts as
  touching the coupon within 45 mm of the controller grip; a spatter drop hits a bare hand within 50 mm
  and a forearm within 45 mm (drops above 600 °C only); the fume plume is 0.15 m in radius above the arc;
  the extraction hood is 0.2 m in diameter; the fire-watch clock runs 30× faster; when the smoulder
  appears and when it turns into a fire are drawn at random within the watch.

* SMAW model. From sources: current windows, deposition rates and fusion times (ESAB OK 46.30 and
  OK 48.00), reference voltages, polarities, arc length about one electrode diameter, 15% less current
  out of position, the 2 in (50 mm) stub allowance, k = 0.8, drag angle 10–30°, weave at most 2½ × d.
  Seeds: 1 V per mm of arc length about the data-sheet voltage; the E7018 arc window 0.3–1 × d and the
  window of the others 1–2 × d (scaled from the 1/8–1/4 in printed for 1/8 in electrodes); the arc goes
  out beyond 2.6 × d; a touch longer than 0.45 s sticks and a tip speed above 250 mm/s frees it; burn-off
  in proportion to current (E6010 1.15 × the rutile rate: no fusion time is published); 25 mm gripped
  in the holder; spatter, wetting and penetration factors per coating; how much slag one hammer blow
  removes per coating; the crater-fill volume (pass section × 2 mm) taken up by metal laid while the arc
  is held still before a stop; the scripted welder's restart sweep at 6 × travel speed.

* Pipe model. From sources: pipe sizes, joint preparation, test positions, the electrodes and currents of
  the training WPS, the electrode angles by position, the inside-bead target (1/16 in), the run sequence
  and grinding of starts and stops. Seeds: the keyhole index (penetration reach through the land; 1 =
  just through it) and its nominal value; the inside-bead height as a function of the index and the
  gravity at the root; the burn-through index; 35% of the root left in the gap where its start or end is
  ground; the scripted welder's keyhole target (0.15 smaller where the joint faces up), its speed-ups
  over metal already in the groove (root at most 1.25 ×, cap at most 1.5 ×), and its weave and pause on
  the fill and cap passes; the keyhole cue window; the pass split of fill and cap areas; the pipe drill
  pass marks.
* The toe-dwell share is measured only while the electrode weaves (a crater pause or a back-up into the
  crater keeps the last value), and the undercut of a weave without a pause at the toes applies to the
  share of the metal laid that way (from release 1.5).

* GTAW model. From sources: tungsten classes and tip colours, the typical DCEN current range of each
  tungsten diameter, the training currents, rod, gas and travel speeds, argon flow window, arc-length
  window, push angle, rod angle, post-flow rule and pre-flow time, cup size, k = 0.6, DCEN for steel and
  the 70% / 30% heat split of DCEN and DCEP, the remedies quoted above. Seeds: arc voltage 8 V + 1.2 V per
  mm of arc; the HF spark bridges up to 6 mm and the arc goes out beyond 12 mm; the rod melts at
  0.41 mm³/s per ampere while its tip is in the pool (set so the 3.2 mm fillet comes out at the CK
  travel speed), with the rod in the pool 35% of the time; the rod tip stays hot for 2 s and the gas
  envelope is the cup radius + 2 mm around the line from the cup to the arc; stability factors for a
  long arc, pure tungsten on DC, DCEP, a contaminated tungsten and a current above the tungsten's range;
  on DCEP the heat into the work and the penetration both scale by 0.3 / 0.7; a tungsten drop into the
  pool for every 1.5 s the tungsten is overheated (DCEP above about 10% of its DCEN capacity, or 15%
  above its range);
  the crater counts as filled when the amperage control was eased to half or less with filler added in
  the last 1.5 s; the scripted welder dabs every 0.8 s and ramps down over 1.2 s; a fresh rod is held
  220 mm in front of the fingers.

* Oxy-fuel cutting model. From sources: the tip chart rows (tip, pressures, flows, speeds, kerf), the
  choked-flow check of the cutting bore against them, acetylene's 15 psig limit, 1/7-per-hour withdrawal
  limit and 250 psig cylinder pressure, the set-up, purge, leak-test, lighting and shut-down steps and
  their order, neutral at 1:1, the kindling cue (816 °C), the 3–6 mm cone distance, the Harris categories
  and their descriptions, the ISO 9013 u formulas (secondary source), the backfire and sustained-backfire
  responses, the OSHA shade minima for oxygen cutting. Seeds: regulator psig per turn and droop, torch
  needle valves fully open at 1.5 turns and their flow scales, the cylinder valve turns and the "slowly"
  rate (2 turns/s), cylinder contents for the gauges, the oxygen hose pressure loss with the lever pressed
  (15%), the trapped-pressure drain rates, the neutral band (0.95–1.15) and the flame-separation flow
  (1.25 × the tip's highest printed flow), the preheat heat (22% of acetylene's total heat at a neutral
  flame; less for other flames and higher tips), the surface excess under the flame (Gaussian spot of
  8 mm radius, gain 0.4 of the semi-infinite value, rise time 30 s × √(t / 12.7 mm), relaxing in 2.5 s,
  fading over 4 mm of depth), the inner cone length (2.5 mm), the speed bands of the categories (0.65,
  0.85, 1.05, 1.12, 1.3 × the middle of the chart speed), the drag, top-edge, slag, pressure-mark, groove,
  bevel and kerf functions, the loss of the cut above 1.4 × the top chart speed for 0.25 s (less with low
  oxygen, weak preheat, a high tip, a steep travel angle), fusing below 0.35 × the chart speed for 1 s, the
  pierce rate (2.5 mm/s), the heat of the burning front (6 W per mm of thickness per mm/s), the bevel speed
  factor (0.85), the tip heat that leads to a backfire with the cones within 1.5 mm of the work, 4 s of
  sustained backfire to burn through the torch, the glow of the burning front and kerf edges (1300 °C,
  cooling with a 3.5 s time constant: a display value), the drill pass marks (quality share, slag share,
  line tolerance, top edge, 3 s backfire response). Spark, slag-stream and fume counts are display values.

* Welder qualification (release 1.7). The codes give the test pieces, specimen locations and sizes, former
  diameters and acceptance limits; how a specimen shows the imperfections of the weld model is this build's
  simulation rule (`src/qual/specimens.js`): a bend opens the imperfections in the half of the specimen on the
  convex side, stretched by the outer-fibre strain e = ts / (d + ts) at the surface and falling to nothing at
  mid-thickness (the relation behind ISO 9606-1 6.5.2.3 and ASME QW-466.1 Note (1)); undercut and root
  concavity stay closed; a fracture or nick break exposes every imperfection inside the weld metal of the
  specimen; the radiograph is ideal (every imperfection at its projected size; film brightness exp(−0.1 × mm
  of steel), a display value). ASME rounded indications are compared with Figure QW-191.1.2.2(b)(4) by
  count and total area in the worst 6 in, measured from the printed figure. Where a test piece uses two
  covering types (E6010 root, E7018 fill and cap) the ISO designation writes them C/B: clause 11 lists the
  filler types as an item but sets no separator. The demonstration welder's stop
  and restart: SMAW, crater filled by backing up and the restart struck ahead and backed into the crater;
  GMAW, a crater pause and the restart in the still-hot crater; GTAW, the current ramped down with filler,
  post-flow, the arc restarted on the crater centre (2 mm behind the end), held 0.8 s until the pool matches
  the crater, filler from 2 mm past it (seeds). Model changes in 1.7: the end of a bead is the furthest point
  its run reached, however long a crater back-up took; a restart backed into a crater remelts it (crater
  pipe and crater crack gone) and its first metal fills a crater left unfilled; an arc held without filler
  (GTAW) lays no cold lap.

Use this build to evaluate training flow, interaction and tracking on the Quest 3S, not to predict the
quality of real welds or cuts, until the model is calibrated.

## 6. Rule packs

Training rule packs. Verify every value against licensed copies before any use beyond training.

| Pack | Source status |
|---|---|
| ISO 5817:2023 (B, C, D) | Checked against the ISO 5817:2023 text; Kiwa poster agrees except 504 level C. [Kiwa poster](https://production.episerver.kiwa.com/globalassets/sweden/svets/svetsaffisch_a3-eng-lathund-iso-5817-250415--digital.pdf) |
| ISO 9606-1 welder test | Clause 7 acceptance (level B; level C for 501, 502, 503, 504, 5214), checked against the licensed ISO 9606-1:2012 (BS EN ISO 9606-1:2017) text |
| AWS D1.1 Table 8.1, static | D1.1:2020 Table 8.1 values; short-weld rules per D1.1:2025 AMD1 and the Welding Journal (secondary). Confirm against licensed D1.1:2025 + AMD1. [AMD1](https://pubs.aws.org/Download_PDFS/D1.1-D1.1M-2025-AMD1_PV.pdf) |
| AWS D1.1 welder test, visual | D1.1:2020 clause 6.10.1 via secondary sources; D1.1:2025 clause 6.23 values unconfirmed. [Material Welding](https://materialwelding.com/welder-qualification-test-wqt-acceptance-criteria-as-per-aws-d1-1/) |
| API 1104 visual | 22nd edition (2021) 9.3.10, 9.7 Table 8 and 9.8.2, checked against the licensed copy. API 1104 covers pipeline girth welds; applied to plate here for training only |

## 7. Safety sources

Each requirement, limit and effect in the Safety module cites one of these (clause or table shown in
the app; `src/safety/refs.js`):

| Source | Used for |
|---|---|
| [OSHA 29 CFR 1910.252](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.252), [.253](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-Q/section-1910.253), [.254](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.254) | Fire prevention and fire watch (30 min), screens, helmets and filter plates, cylinders, cables, holders |
| [OSHA 1910.132](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.132), [.133](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.133), [.157](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.157), [.243](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-P/section-1910.243) | PPE condition, minimum filter shades, extinguishers, grinder guards |
| [ANSI Z49.1:2021](https://aws-p-001-delivery.sitecorecontenthub.cloud/api/public/content/f524cc78ee9c4e00a703bbe12b2f368b) (free from AWS) | Eye, face and body protection, suggested shades (Table 1), ventilation, respirators, fire watch (1 h), cylinders |
| AWS Safety and Health Fact Sheets 2, 5, 6, 7, 25, 26, 28, 30, 31, 33, 36, 37, 39 | Radiation, electrical hazards, fire, burns, UV viewing distances, oxyfuel backfire and flashback, cylinders, eye protection, PPE, ventilation, gloves, cables |
| Victor 0056-3260 and 0056-0138; Harris 9505643 | Oxy-fuel set-up, backfire response; goggles against sparks and light rays (see *Oxy-fuel cutting sources*) |
| [HSE STSU1-2019](https://www.hse.gov.uk/safetybulletins/mild-steel-welding-fume.htm), [HSE WL3](https://www.hse.gov.uk/pubns/guidance/wl3.pdf), HSE welding pages, [INDG347](https://www.hse.gov.uk/pubns/indg347.pdf) | Fume control (LEV for all indoor welding, hood within one diameter), welding risks, first aid |
| CCOHS OSH Answers (welding PPE, radiation, electrical, hot work) | Synthetic fabrics, cuffs, arc radiation effects |
| [NHS burns and scalds](https://www.nhs.uk/conditions/burns-and-scalds/treatment/), British Red Cross, College of Optometrists, TWI | First aid for burns, arc eye (photokeratitis) |
| CENELEC Guide 29 (EN ISO 13732-1 data), CMAJ 1997 (Moritz and Henriques), Exponent 2010 (ASTM C1055) | Contact burn thresholds |

## 8. SMAW sources

Numbers as printed in these documents (the source register with publication numbers and revision
dates is in `src/sim/smaw.js`):

| Topic | Source |
|---|---|
| E6010 ranges, optimum current, voltage, deposition, storage | Hobart 610 data sheet (rev. 180316); Lincoln Fleetweld 5P+ (DC+ ranges) |
| E6013 ranges, AC preferred, polarity, voltage, fusion time, deposition | Lincoln Fleetweld 37 (C2.10.19, 09/16); Hobart 447A (rev. 250725); ESAB OK 46.30 |
| E7018 ranges, "very short arc", storage, exposure, fusion time, deposition | Lincoln Excalibur 7018 MR (C2.10.10b, 06/15); Hobart 718; ESAB OK 48.00 |
| Storage and redrying | Lincoln MC22-140 *Storing and Redrying Electrodes* (12/22); Hobart *Oven Storage & Reconditioning* |
| Striking, sticking, arc length, weave width, slag removal, porosity causes | Hobart/Miller *Guidelines for SMAW* (Form 155095F, 2018); Hobart Brothers *Basic Stick Welding – Electrode Technique* |
| Drag angle 10–30°, low-hydrogen restarts, clean slag after each bead, stringers vs wide weaves | Lincoln *Stick Electrode Welding Guide* (C2.410, 12/04) |
| Constant-current (drooping) source, coating types and slag behaviour | TWI Job Knowledge 14 and 2 |
| Thermal efficiency k = 0.8 for 111 | TWI FAQ (heat input), Kiwa ISO 15614-1 guide, SSAB, Australian Welding Institute |
| Holder insulation | OSHA 29 CFR 1926.351(a)(2); AWS Fact Sheet No. 5 ("Use fully insulated electrode holders") |
| Electrode change shock, first aid | [CCOHS Welding – Electrical Safety](https://www.ccohs.ca/oshanswers/safety_haz/welding/electric.html) (revised 2024-12-17); AWS Fact Sheet No. 5; ANSI Z49.1:2021 4.3.2 |

## 9. GTAW sources

Numbers as printed in these documents (the source notes are in `src/sim/gtaw.js`):

| Topic | Source |
|---|---|
| Tungsten classes (AWS A5.12 / ISO 6848), tip colours, DC use; pure tungsten for AC only | CK Worldwide *Technical Guide*, Form 116 (May 2017; Feb 2019); Diamond Ground Products *Tungsten Electrode Guidebook*; Miller *All About Tungsten in TIG Welding* |
| Typical DCEN current by tungsten diameter with argon (1/16 in 70–150 A, 3/32 in 150–250 A, 1/8 in 250–400 A) and the cup listed with it | CK Worldwide *Technical Guide*, Form 116 (May 2017; Feb 2019) |
| Tip geometry and current (2.4 mm, 45°: 15–150 A); DCEP capacity about 10% | Diamond Ground Products Table 8 *Tungsten Electrode Tip Shapes and Current Ranges* (same values in CK Form 116); Miller/Hobart *TIG (GTAW) Welding Guidelines* OM-215994 rev F (2018) |
| Training WPS for 1/8 in mild and low-carbon steel: 3/32 in tungsten and rod, argon 18 CFH, fillet 200–250 A at 9 in/min, butt 175–225 A at 11 in/min | CK Worldwide Form 116, *Low Alloy Steel (DCSP)* table |
| Argon 10–25 CFH; higher flow adds turbulence | Miller OM-215994; Miller *Best Practices for Proper Shielding Gas* |
| Cup inside diameter at least 3 × the tungsten; extension; 3/32 in tungsten with a #8 cup | Miller OM-215994; Miller *Guide to TIG Welding Basics* |
| Arc length 1/16–1/8 in (DC); torch 70–80° to the work, not 45° or more; rod 10–20° to the surface, dabbed at the leading edge and kept in the gas | Miller OM-215994; Miller *Welding Tips*; TWI Standard Data Vol. 2; ESAB |
| Post-flow one second per 10 A, at least 8 s; pre-flow at least 0.2 s | Miller TIG articles (2026) |
| HF and lift-arc starts, "Do NOT Strike Like A Match!"; scratch starts and tungsten inclusions | Miller OM-215994; TWI Job Knowledge 6 |
| Contaminated tungsten (touching the pool, rod against the tungsten), erratic arc; "Remove 1/2 in. of contaminated tungsten and repoint tungsten"; "Tungsten melting into weld puddle" | ESAB; CK Form 116; Fronius; Miller OM-215994 |
| DCEN about 70% / DCEP about 30% of the heat into the work | CK Form 116; ESAB |
| Filler rods ER70S-2 and ER70S-6 (AWS A5.18), cut lengths 915 and 1000 mm | Lincoln ER70S-2 and ER70S-6 data sheets; ESAB |
| Thermal efficiency k = 0.6 for 141 | TWI FAQ (heat input); SSAB; Weld Australia |
| Thoriated tungsten: radioactive, grinding dust | AWS Safety and Health Fact Sheet No. 27 |
| Thin gloves for low-current GTAW | AWS Safety and Health Fact Sheet No. 37 |
| UV from a GTAW arc in argon | AWS Safety and Health Fact Sheet No. 26 |

## 10. Pipe sources

| Topic | Source |
|---|---|
| Joint preparation, root and inside bead, keyhole, tie-ins, grinding, run sequence, cap height and width, 2G cap undercut, procedure table | Lincoln Electric, *Welding Pressure Pipelines & Piping Systems: Procedures and Techniques*, C2.420 (10/02): in-plant procedures p. 36–39, cross-country root, hot pass and tie-in pp. 5–12 |
| Test positions and tolerances | ASME BPVC Section IX-2023, QW-120 and QW-122 (uploaded licensed copy) |
| Test piece length, 12 o'clock mark, acceptance (level B; level C for 501, 502, 503, 504, 5214), stop and restart, grinding | BS EN ISO 9606-1:2017 (ISO 9606-1:2012), Figure 5, clauses 6.1, 6.3 and 7 (uploaded licensed copy) |
| ISO position designations | ISO 6947:2019 Table B.1 (the designations ISO 9606-1:2012 Table 9 uses) |
| Pipe sizes | ASME B36.10 values as printed by InfraBuild (Oct 2022) and Tioga Pipe (12/2013) |
| Electrode angles by position | ESAB University, "The Art and Science of Stick Electrode Angle Control" (Sep 2025); Lincoln C2.410 (vertical down, whip) |
| E6010 current range for the downhill root | Hobart 610 data sheet (1/8 in 80–120 A); Lincoln Fleetweld 5P+ (DC+ 75–135 A) |
| Training coupons | Lincoln Electric school ASME pipe course; Hobart Institute 6-inch and 2-inch uphill courses; Lincoln VRTEX 360 coupons |

## 11. Oxy-fuel cutting sources

Numbers and quotes as printed in these documents (the source notes are in `src/sim/ofc.js` and
`src/sim/cut.js`; the safety register in `src/safety/refs.js`):

| Topic | Source |
|---|---|
| Tip chart (oxy-acetylene, types 1-101 and 3-101): tip size, cutting oxygen and acetylene pressures and flows, speed, kerf; set-up, lighting ("Open the fuel valve on the torch handle approximately 1/8 turn"), the lever pressed and the flame readjusted, the start at "a bright cherry red kindling temperature", shut-down order and the "pop" | Victor (Thermadyne) Form 0056-0138 Rev. C (2008-05-14), *Safety and Operating Instructions: Torch Handles, Cutting Attachments, and Heating Nozzles*, Sections 4.01, 4.02 and 7 |
| Acetylene table (15 psig, 1/7 of the contents per hour), cylinder valves (about 3/4 turn, no more than 1 1/2), regulator screws released, purge times, leak test (20 / 10 psig, five minutes), backfire and sustained-backfire response, flame description | Victor 0056-3260 Rev. AG (2017-01-18), *Cutting, Heating and Welding Guide: Set-up and Safe Operating Procedures* (readable to Section 7.01) |
| Inner cones 1/8–1/4 in (3–6 mm) from the steel; "bright red (approx. 1500F/816C)"; the acetylene feather and the neutral flame | Smith OM-262659J (2026-08), *Smith Oxy-Fuel Regulators and Torches* (Miller / ITW) |
| Neutral flame 1:1; "bright red (about 1550 F or 843 C)" | Hobart OM-251 341B (2013-12), *Medium-Duty Oxy-Acetylene Cutting and Welding Outfit* |
| Cut-quality categories and their descriptions; "The correct cutting speed is accompanied by a sputtering sound"; bevel cutting slower | Harris (Lincoln Electric) PN 9700208 (03/2017), *Machine Cutting Guide* |
| "Always wear welding goggles to protect eyes from sparks and light rays", "Watch for sparks in cuffs"; fuel opened "until flame stops excessive smoking and leaves the end of tip about 1/8"" | Harris 9505643 REV-G (2017-05-30), *Gas Welding, Cutting, Brazing, & Heating Torches* instruction manual |
| ISO 9013:2017 perpendicularity tolerance u, ranges 1–5; EN 1090-2:2018 execution classes | Lincoln Electric, *The PythonX Guide to Plasma Cutting in Codes and Standards* (secondary source; the ISO 9013 text was not available) |
| Oxygen-fuel gas welding and cutting rules: 15 psig acetylene, cylinder valves, regulators, oil and grease | OSHA 29 CFR 1910.253 (eCFR) |
| Filter shades for oxygen cutting (light 3, medium 4, heavy 5) | OSHA 29 CFR 1910.133(a)(5); AWS Fact Sheet No. 31 (11/2025) comfort shades 3–4, 4–5, 5–6 |
| Backfire, sustained backfire, flashback, their causes, check valves and flashback arrestors | AWS Safety and Health Fact Sheet No. 28 (10/2023), *Oxyfuel Safety: Check Valves and Flashback Arrestors* |
| Cylinders: storage, handling, acetylene use pressure | AWS Fact Sheet No. 30 (11/2025) |
| Acetylene cylinder pressure (250 psig at 70 °F) | 49 CFR 173.303 |
| PPE for welding and cutting | AWS Fact Sheet No. 33 (11/2025); ANSI Z49.1:2021 |

The outfit in this simulator is operated by the Victor instructions. The other manufacturers differ in
details, listed in the source notes: the bleed order after the cylinder valves are closed (Smith and
Hobart bleed the fuel first), how far the fuel valve is opened to light (Harris about 1/2 turn, Hobart
1/4), whether the acetylene cylinder valve is cracked (Smith: not), the purge times (Harris about 1 s per
10 ft of hose) and the words for the start cue (red, bright red, bright cherry red).

## 12. Welder qualification sources

Built from the licensed copies WELL EXPERTS supplied (clause, table and figure numbers as printed in them;
the notes are in `src/qual/`):

| Topic | Source |
|---|---|
| Test pieces (6.2, Figures 1–7), welding conditions (6.3), test methods (6.4, Table 13), specimens (6.5, Figure 8), acceptance (clause 7), retests (clause 8), validity (clause 9), certificate (clause 10, Annex A), designation (clause 11), ranges (Tables 1–12) | ISO 9606-1:2012 (BS EN ISO 9606-1:2017) |
| Imperfection limits for clause 7 | ISO 5817:2023 (the ISO 5817 rule pack) |
| Welder performance: QW-300 to QW-322 (tests, retests, expiration and renewal), QW-302 methods, QW-304 processes for radiography, QW-163, QW-181 to QW-184, QW-191, QW-194, QW-350 to QW-356, QW-402 to QW-409, QW-423.1, QW-432 and QW-433, QW-452.1, QW-452.3 to QW-452.5, QW-461.9, QW-462.3(a), Table QW/QB-422 (P-Numbers, groups, ISO 15608 groups, tensile strength) | ASME BPVC Section IX-2023 (extract to Figure QW-462.3(b)) |
| Figure QW-462.4(b) fillet coupon, QW-463.2 bend specimen locations, QW-466.1 test jig dimensions, Form QW-484A | ASME BPVC Section IX-2015 (scanned copy supplied with the 2023 extract) |
| Single qualification (6.1, 6.2 with the essential variables 6.2.2), visual (6.4), destructive testing (6.5, Table 7, Figure 12, 5.6.3 nick break, 5.6.4 bends), radiography (6.6, 9.3), retests (6.7), records (6.8, Figure 1), filler groups (Table 4), wall groups (Table 5), undercut (9.7, Table 8), internal concavity (9.8.2) | API Standard 1104, 22nd edition (July 2021) |
| Base metal elongation for the ISO former diameter | SSAB ASTM A516 Grade 60 data (21 % in 8 in, 25 % in 2 in); Totten Tubes ASTM A106 data (Grade B 30 % in 2 in, longitudinal) |
| Restarts of the demonstration welder | Lincoln C2.410 and The Fabricator (strike ahead, back into the crater); [LWTech pipe welding](https://openwa.pressbooks.pub/lwtechweldingpipe/?p=60) ("tracing around the crater to re-establish the weld pool"); [CWB](https://www.cwbgroup.org/node/56565) (GMAW tests: back-loop restarts, "the crater must be shallow and unfilled"); weldingtipsandtricks.com, [TIG restarts](https://www.weldingtipsandtricks.com/tig-restarts.html) and [bead restart](https://www.weldingtipsandtricks.com/bead-restart.html) |

AWS D1.1 has no licensed copy here: its two mock tests keep the visual criteria from secondary sources
(see *Rule packs*).

## 13. Sources for the physics, the look and the drills

| Topic | Source |
|---|---|
| Steel thermal properties (conductivity, specific heat) | EN 1993-1-2, formulas as reproduced by [Dlubal](https://www.dlubal.com/en-US/support-and-learning/support/knowledge-base/001496) |
| Emissivity 0.7 | EN 1993-1-2, as quoted in the [SUSCOS lecture "Thermal response" (UPT)](https://www.ct.upt.ro/suscos/files/2013-2015/2C10/L3%20-%20Thermal%20response.pdf) and by [Dlubal](https://www.dlubal.com/en/support-and-learning/support/knowledge-base/001840) |
| Liquidus temperature | steeluniversity equation (C < 0.5%) as reproduced by [ABM Proceedings](https://abmproceedings.com.br/en/article/download-pdf/determinao-de-temperatura-liquidus-de-aos) |
| Surface tension of iron | Sahoo, DebRoy and McNallan, *Metall. Trans. B*, 1988 (value 1.943 N/m used for the capillary length) |
| Colour of hot metal | Wyman, Sloan and Shirley, [Simple Analytic Approximations to the CIE XYZ Color Matching Functions](https://research.nvidia.com/labs/rtr/publication/wyman2013simple/), JCGT 2013 |
| Temper colours | [NBS Letter Circular 630, *Bluing of Iron and Steel*](https://nvlpubs.nist.gov/nistpubs/Legacy/LC/nbslettercircular630.pdf) |
| Transfer modes | CWB Group, [Part 1: short circuiting and globular](https://www.cwbgroup.org/node/61515) and [Part 2: spray and pulsed](https://www.cwbgroup.org/node/61905) |
| Fume by process and transfer mode | [TWI Job Knowledge 031](https://www.twi-global.com/technical-knowledge/job-knowledge/health-safety-and-accident-prevention-health-risks-from-fume-and-gases-during-welding-031) |
| Gun angles, weaving, overhead travel, undercut | Miller Electric, [MIG Welding: The Basics for Mild Steel](https://millerwelds.com/resources/article-library/mig-welding-the-basics-for-mild-steel) |
| Restart and crater fill (1½ × weld size) | The Fabricator, [Minimizing start/stop welding defects](https://www.thefabricator.com/thewelder/article/arcwelding/minimizing-start-stop-welding-defects) |
| Drill positions per process | AWS, [SENSE Level I achievement record](https://app.aws.org/education/sense/sense_achievement_l1.pdf) (Modules 5 GMAW and 6 FCAW) |
| Pad of beads: overlap, clean before the next run | iCEV, [Project – Pad of Beads](https://icevonline.com/hubfs/Project%20-%20Pad%20of%20Beads.pdf) (written for SMAW) |
| Checking interpass temperature | TWI, [What is a Tempilstik?](https://www.twi-global.com/technical-knowledge/faqs/faq-what-is-a-tempil-stick) (crayons used with contact thermometers or thermocouples) |

## 14. What was tested, and what still needs the headset

Automated here (headless Chromium with software rendering; the Quest was emulated with Meta's IWER 2.6.0
runtime, Quest 3 profile with Touch Plus controllers):

* 126 unit tests (`npm test`): process formulas, groove geometry, code limits, defect rules, determinism,
  every troubleshooting fault; heat flow (EN 1993-1-2 properties, energy balance within 1%, the
  plane-source solution within 6%, coarse-grid cooling against fine stepping, cooling cut into short
  steps), the pool model, interpass waiting, thermal coupling, crater fill and restarts; every drill
  with every allowed process met by a well-made weld, and each typical mistake (off the line, uneven
  speed, no crater fill, too hot and fast, no toe dwell, slag left, beads too far apart, too little
  shielding gas, cold restart, restart gap, no temperature reading, no interpass wait, no cleaning)
  failing the criterion written for it.
* Browser flows (`tests/e2e/flows.py`, `tests/e2e/exercises.py`): inspector scoring, troubleshoot fix,
  AWS mock test, four-pass butt weld with an identical replay, left-handed mirroring, Arabic screens, MR
  session; every drill run through the real screens with demo passes and meeting all its criteria,
  identical replays of B1-P and B8, the desktop thermometer, 30× cooling, the thermal view.
* XR flows under emulation (`xr_weld.py`, `xr_tools.py`, `xr_tracking.py`): entering VR, panel
  clicks with the ray, helmet by nod and B, welding with the tracked gun, arc-flash detection, wire
  brushing, the contact thermometer (reading and trigger), both gauges, Tracking lab statistics.

Safety and PPE (`tests/unit/safety.test.mjs`, `tests/unit/drills.test.mjs`, `tests/e2e/safety_flows.py`,
`tests/e2e/xr_safety.py`): the PPE rules for each job, the shade guide, the UV-dose, burn and fume rules,
hazard-hunt scoring, the permit items and the fire-watch rules; in the browser the three drills through
the real screens and scene clicks; in emulated XR taking items from the rack by reaching and by pointing,
binning a damaged glove, the PPE check, a test run with bare forearms (UV dose on the skin, the incident
card when the arc stops) and tagging a hazard with the controller ray.

Not verified (needs the Quest 3S): frame rate and thermals on the device with the heat-flow model and
the new effects, Touch Plus tracking quality, haptic feel, arc sound, text legibility, the brightness
of the arc, pool and glow through the lens, comfort, the passthrough look, and the Arabic text (a draft
for review by an Arabic-speaking welding specialist). For oxy-fuel cutting: the look of the flame, the
red spot at the edge, the burning front, the kerf glow and the spark stream through the goggles, the
torch sound, holding the torch steady at the cone distance with the controller, and the thumbstick
valve rates.

SMAW (`tests/unit/smaw.test.mjs`, `tests/e2e/smaw_flows.py`): the training WPS from the data sheets;
scripted runs with electrode changes, filled craters and restarts that back into the crater; chipping
before brushing; slag left between passes; the shock rule; every SMAW drill met by a well-made weld; in
the browser a four-pass SMAW butt weld with chipping between passes and an identical replay, the machine
panel, and in emulated XR a touch-and-lift strike, burn-off, lifting to break the arc, electrode changes
with dry and with wet gloves, and hammer blows.

Pipe (`tests/unit/pipe.test.mjs`, `tests/unit/exercises.test.mjs`, `tests/e2e/pipe_flows.py`): sizes,
positions and their ISO designations, the mapping round the pipe and back, gravity at the clock
positions, deposits and heat across the seam with the energy balance, the uphill root (one half each way,
penetrated all round, the inside bead growing from 6 to 12 o'clock), whole scripted welds in every position
on NPS 2 Sch 80 and the 5G, 6G and 2G on NPS 6 Sch 80 accepted to ISO 5817 C and ISO 9606-1, root faults
(too little current: 4021; the arc held to one side: a land unfused; too much current: 510 or 504 at the
top and suck-back overhead), the downhill runs, the 2G halves, a run struck past the bottom taking its
direction from the motion, every pipe drill met by the demo welder and the cold root failing the code and
keyhole criteria. In the browser the Practice pipe set-up (SMAW only), the pipe WPS, a 5G root and cap by
the demo welder with the electrode changed by the WPS, results without the plate packs, the macro
section, a 1G weld rolled between runs with an identical replay, grinding the root's starts and craters,
the pipe drill list and B6-R5 through the screens; in emulated XR a strike at 3 o'clock welding up the
joint with the electrode pushed up the joint, keyhole and electrode angle measured, the root's travel
speed judged by the keyhole (no speed window, no pacer). The pipe drills also run in
`tests/e2e/exercises.py`, as do B8 and B1-P with SMAW (the demo chips the slag before brushing it).

GTAW (`tests/unit/gtaw.test.mjs`, `tests/e2e/tig_flows.py`): the training WPS and the CK travel speeds; a scripted 3.2 mm fillet
(HF start, filler dabbed, current ramped down with filler, post-flow held) accepted to ISO 5817 C with a
clean tungsten; no weld metal without filler; porosity with 25 L/min of argon and none in the window;
DCEP melting the tungsten into the pool with lack of fusion; a short post-flow oxidising the tungsten
and regrinding it; tungsten dipped into the pool; the rod touching the tungsten; HF, HF touching the
work, lift-arc; pure tungsten on DC; the three GTAW troubleshooting faults. In the browser the Practice
choices, the TIG machine panel, a demo pass accepted with an identical replay, a troubleshooting coupon
and the TIG PPE job; in emulated XR an HF start with the analog trigger as amperage control, the rod in
the other hand melting in the pool, lifting to break the arc, a tungsten dipped into the pool, regrinding
and a new rod.

Oxy-fuel cutting (`tests/unit/ofc.test.mjs`, `tests/e2e/cut_flows.py`): the tip chart rows as printed and
the cutting bore against them; the flame from smoke to oxidizing; the whole procedure by the instructions
and its faults (screws in, acetylene over 1 1/2 turns or 15 psig, no purge, a quick opening, lighting with
the oxygen open, fuel closed first); the leak test with a leaking hose; the lever turning the flame
carburizing; cuts at the chart speed (severed, perfect, ISO 9013 range 1), too slow, too fast and lost, a
restart with its gouge, the tip too close (grooves, then a backfire) or too high, too much oxygen and the
wrong tip, a cold start, a bevel, fusing, reverse flow and flashback without check valves, determinism. In
the browser the cutting menu and set-up, the app lighting the torch, the demo cut to a dropped strip with
the spark and slag stream, the results tabs, the C1 drill done entirely on the panel from capped cylinders
to zero gauges, and the C5 backfire drill; in emulated XR the fuel valve opened with the held thumbstick,
the spark lighter struck at the tip, the flame set neutral with the stick, a preheat at the edge and a cut
with the trigger as the lever run off the far edge (strip dropped), then the incidents for cutting without
a filter lens, a bare hand in the spark stream and a bare hand on the hot plate.

Welder qualification (`tests/unit/qual.test.mjs`, `tests/e2e/qual_flows.py`): the code tables as printed
(ISO Tables 3, 6–11, ASME QW-433, QW-452.1(b), QW-452.3, QW-461.9, the QW-191 limits, API 6.2.2 d, Tables 5
and 7); the imperfection map of a sound pipe weld; sound scripted welds passing the ASME 6G side bends, the
API 6G nick breaks and root bends and the ISO H-L045 fracture tests; an unpenetrated root failing the root
bend and the nick break, side-wall lack of fusion opening a side bend; the ASME and ISO fillet tests; a TIG
stop and restart without a cold lap; a restart backed into an unfilled crater remelting it; the end of a
bead after a slow crater back-up; the demonstration restarts giving valid test pieces. In the browser the
test lists of the four standards, an ISO 5G pipe test welded by the demonstration welder with its stop and
restart, examined by visual testing and radiography, passed with its designation, range and validity, the
radiograph in the test lab, the record saved, listed and downloaded; an ASME TIG fillet with its centre
restart, fracture and macro specimens; a test piece without the stop and restart declared not valid (6.3);
a test piece welded too fast failing with the clause 8 retest offered and started; the qualification screens
in Arabic. Not verified: welding a whole qualification test in the headset (comfort, time, the checklist
while welding) and the legibility of the film and specimens in the lens.

## 15. Not in this build

GTAW drills (GTAW is in Practice, troubleshooting and two fillet qualification tests), GTAW on pipe and open roots (drill
B5 and the 141 variants), AC TIG and aluminium, pulsed TIG, a foot pedal, walking the cup, a fusion bead
for autogenous TIG (no filler: the model lays no weld metal), tungsten length and stick-out changes,
gas lenses, SMAW arc blow (the
sources describe it, DC only, worse near the ends of a joint and toward the work clamp, rarely serious
below about 250 A; not modelled), electrode storage and moisture pick-up as a trainee task (the model
has damp electrodes and the supply panel; there is no oven model in the booth yet), vertical-down SMAW
on plate, and on pipe the downhill hot, fill and cap passes (C2.420's cellulosic 5/32–3/16 in procedure
at currents above the kit's electrodes; downhill pipe is a root-pass coupon here), pipe with a backing
ring, misaligned or uneven gaps as a trainee fit-up task, a grinder held in the hand (grinding is a panel
action), the pipe's wall curvature in the macro section, preheating with a torch (scope A6 is covered only by interpass measurement), and in oxy-fuel cutting:
fuel gases other than acetylene, machine (track) cutting, curves, circles and holes (straight lines only,
a pierce only as a start away from the edge), gouging, plate over 25.4 mm, stainless steel and cast iron
(they do not cut with oxygen), a dirty tip or a torch without check valves as trainee scenarios (both are
in the model and its tests), hose and regulator inspection and cylinder transport as tasks, the knobs of
the regulators and cylinders turned by hand in the headset (they are on the panel), the strip handled by
hand after the drop (touching it is checked for burns),
the EN 1011-2 cooling-time and hydrogen-cracking methods; in welder qualification: the licensed AWS D1.1
criteria (its tests stay visual), ultrasonic testing in place of radiography, tensile tests, the job knowledge
test (ISO 9606-1 Annex B), the FW/BW combined test piece (Annex C), multi-process test pieces, branch joints,
machine welding operators (QW-361), API multiple qualification (6.3), the examiner's signature and a
certificate (the record is a training record), film exposure, density and IQI sensitivity classes
(ISO 17636-1); instructor station, reports and xAPI export, scenario editor, distortion (C21) and the
scope's other problem scenarios (C4, C9–C11, C13, C16, C19), physical prop registration beyond one-point
table alignment.

## 16. Project layout and build

```
index.html               page shell (title, styles); build inlines the bundle
build.mjs                esbuild bundle -> dist/index.html (standalone) and dist/artifact.html;
                         with --pages also docs/index.html (the copy GitHub Pages serves)
docs/index.html          published build for GitHub Pages (npm run pages); docs/.nojekyll
src/main.js              page overlay, WebXR support checks, start
src/app.js               renderer, XR session, input, panels, helmet, audio, frame loop
src/modes.js             Home, Practice, Exercises, Troubleshoot, Inspector lab, Tracking lab
src/modes/qualification.js  Welder qualification: test list, brief, test weld, examination, retest, records
src/modes/welding.js     shared welding flow of the welding modes
src/modes/safety.js      Safety and PPE drills
src/modes/cutting.js     Oxy-fuel cutting: practice, drills, outfit panel, cues, results
src/cutDrills.js         cutting drills (scope family C) and their criteria
src/safety/              PPE rules, shade tables, exposure and burn models, incidents, hazards, drills,
                         sources register, run-time safety system (dressing, hood, consequences)
src/exercises.js         technique drills (scope family B): catalogue, lanes, criteria, demo plans
src/scenarios.js         training WPS, troubleshooting faults, inspector coupons
src/qual/                welder qualification: standards, materials, fillers and tests (catalog.js), the
                         imperfection map of a weld (flaws.js), specimens (specimens.js), ISO 9606-1
                         (iso.js), ASME IX (asme.js) and API 1104 (api.js) rules, the test run (run.js),
                         training records (records.js)
src/sim/                 weld model: joint geometry, pipe joints and positions (pipe.js), process, SMAW
                         electrodes (smaw.js), GTAW tungsten, rods and arc (gtaw.js), material, heat
                         flow, weld pool, session, record, scripted torch, rule packs; oxy-fuel outfit and
                         tip chart (ofc.js), the cut and its quality (cut.js), scripted cutter (cutScript.js)
src/weld/                weld station (sim <-> rendering), demo and replay drivers; cutting station
                         (cutStation.js) and the demo cutter
src/render/              bead, coupon (plates and pipe), inside root bead (rootBead.js), pool, glow and
                         thermal texture, heat tint, marks, arc effects,
                         workshop kit, helmet, MIG gun (torch.js), SMAW electrode holder (stinger.js),
                         TIG torch (tigTorch.js), filler rod (fillerRod.js), cutting torch and spark
                         lighter (cutTorch.js), oxy-fuel flame (oxyFlame.js), cut plate, kerf and rack
                         (cutPlate.js), sparks and slag stream (cutFx.js), cylinders, regulators and hoses
                         (oxyOutfit.js),
                         cues, section, workshop, PPE models, hands,
                         safety signs, injury effects, drill props
src/inspect/             gauges, thermometer, brush, chipping hammer, imperfection inventory and scoring
src/ui/                  canvas panel system, screens, test lab (lab.js: film, specimens, macro), English/
                         Arabic text (ar_pipe.js: pipe, ar_ofc.js: cutting, ar_qual.js: qualification)
src/audio/               arc sound, oxy-fuel torch sound (oxyAudio.js)
tests/unit/              node --test suites
tests/e2e/               Playwright (Python) scripts; XR scripts use IWER
```

```
npm install
npm test                 # unit tests
node build.mjs           # dist/index.html
npm run pages            # dist/ and docs/index.html (GitHub Pages)
python3 tests/e2e/flows.py
python3 tests/e2e/exercises.py
python3 tests/e2e/xr_weld.py /tmp/shots
python3 tests/e2e/pipe_flows.py /tmp/shots
python3 tests/e2e/cut_flows.py /tmp/shots
python3 tests/e2e/qual_flows.py
```

Dependencies: three.js 0.186.1 (MIT), esbuild 0.28.2 and IWER 2.6.0 (MIT, test only).
