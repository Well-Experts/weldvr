// GTAW filler rod held in the off hand, in the hand's target-ray space (-Z forward): the rod runs
// along the pointing direction, its tip `ahead` mm in front of the hand and the rest of the rod behind
// it (a 915 mm cut length, Lincoln ER70S-2; the welder slides the rod forward through the fingers as it
// melts). The tip glows while hot and darkens when it has oxidised outside the gas shield.

import * as THREE from 'three';

const TIP_LEN = 0.012; // m of rod end shown hot / oxidised (display)

export function buildFillerRod(opts = {}) {
  const g = new THREE.Group();
  g.name = 'fillerRod';
  const dia = opts.dia ?? 2.4;
  const r = dia / 2000;
  // display colour of a bright (copper-flashed) steel rod
  const mat = new THREE.MeshStandardMaterial({ color: 0xb98a66, roughness: 0.35, metalness: 0.9 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xb98a66, roughness: 0.4, metalness: 0.85, emissive: 0x000000 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), mat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), tipMat);
  tip.rotation.x = Math.PI / 2;
  g.add(tip);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), tipMat); // melted end
  g.add(ball);
  const api = {
    group: g,
    dia,
    total: 915,
    ahead: 220,
    tipLocal: new THREE.Vector3(0, 0, -0.22),
    // total rod length and the length in front of the hand (mm)
    setRod(totalMm, aheadMm) {
      this.total = Math.max(0, totalMm);
      this.ahead = Math.max(0, Math.min(aheadMm, this.total));
      const a = this.ahead / 1000;
      const back = Math.max(0, (this.total - this.ahead) / 1000);
      const tl = Math.min(TIP_LEN, a);
      // body: from the hot end back to the far end of the rod
      const len = Math.max(1e-4, a - tl + back);
      body.scale.set(r, len, r);
      body.position.set(0, 0, (-(a - tl) + back) / 2);
      tip.scale.set(r, Math.max(1e-4, tl), r);
      tip.position.set(0, 0, -a + tl / 2);
      ball.scale.setScalar(r * 1.15);
      ball.position.set(0, 0, -a);
      this.tipLocal.set(0, 0, -a);
      g.visible = this.total > 0;
    },
    // hot: 0..1 (glow), oxide: 0..1 (dark oxidised end)
    setTip(hot, oxide) {
      const h = Math.max(0, Math.min(1, hot));
      tipMat.emissive.setRGB(1.0 * h, 0.38 * h, 0.08 * h);
      tipMat.emissiveIntensity = h > 0 ? 1.6 : 0;
      tipMat.color.setHex(oxide > 0.5 ? 0x2f2a28 : 0xb98a66);
      tipMat.roughness = oxide > 0.5 ? 0.85 : 0.4;
    },
  };
  api.setRod(915, 220);
  api.setTip(0, 0);
  return api;
}
