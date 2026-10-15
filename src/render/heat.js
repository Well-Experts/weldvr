// Plate material driven by the coupon heat-flow model (thermalTex.js): incandescent glow from the
// current temperature, permanent temper colours (heat tint) and oxide scale from the peak
// temperature, the ground (prepared) band beside the joint, and an optional thermal-camera view.
//
// Temper colours are a visual cue only (never used for a decision). Colour sequence as listed by
// NBS Letter Circular 630 for steel heated in air (light straw, straw, dark straw / light golden
// brown, brown or bronze, purple, dark blue, light blue), with the blue anchored to the
// 260-370 C range it gives for bluing. The band temperatures in between are SEED values: real
// tint depends on time at temperature and on the atmosphere.

import * as THREE from 'three';
import { GLSL_GLOW, GLSL_THERM } from './thermalTex.js';

export const GLSL_TEMPER = /* glsl */ `
vec3 temperTint(float Tp) {
  vec3 c = vec3(1.0);
  c = mix(c, vec3(0.93, 0.84, 0.62), smoothstep(190.0, 220.0, Tp));  // light straw
  c = mix(c, vec3(0.86, 0.70, 0.40), smoothstep(215.0, 240.0, Tp));  // straw
  c = mix(c, vec3(0.70, 0.48, 0.26), smoothstep(235.0, 255.0, Tp));  // dark straw / golden brown
  c = mix(c, vec3(0.58, 0.34, 0.20), smoothstep(250.0, 268.0, Tp));  // brown / bronze
  c = mix(c, vec3(0.45, 0.24, 0.45), smoothstep(262.0, 282.0, Tp));  // purple
  c = mix(c, vec3(0.20, 0.27, 0.62), smoothstep(278.0, 305.0, Tp));  // dark blue
  c = mix(c, vec3(0.40, 0.56, 0.78), smoothstep(320.0, 360.0, Tp));  // light blue
  c = mix(c, vec3(0.55, 0.57, 0.60), smoothstep(380.0, 470.0, Tp));  // grey (second-order colours fade)
  return c;
}`;

// Patch a MeshStandardMaterial with the thermal look. Geometry must be in joint-local millimetres
// (x along the physical plate, y = u, z = v).
export function heatTintMaterial(baseParams, view, joint) {
  const mat = new THREE.MeshStandardMaterial(baseParams);
  mat.userData.view = view;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, view.uniforms);
    shader.uniforms.fillet = { value: joint.type === 'fillet' ? 1 : 0 };
    shader.uniforms.halfTop = { value: joint.type === 'butt' ? joint.topWidth / 2 : 0 };
    shader.uniforms.plateJ = { value: joint.type === 'plate' ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJoint = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float fillet; uniform float halfTop; uniform float plateJ; uniform float thermView; varying vec3 vJoint;
${GLSL_GLOW}
${GLSL_THERM}
${GLSL_TEMPER}
float gHash(float n){ return fract(sin(n) * 43758.5453); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
// joint-local point (a pipe coupon is drawn in pipe-local mm: unwrapped here)
vec3 jp = jointCoord(vJoint);
// joint preparation: plate surfaces ground to bright metal next to the joint (not on drill plates)
float rJ = fillet > 0.5 ? abs(jp.y) * 1.41421 : abs(jp.y) - halfTop;
float wob = 2.5 * (0.5 + 0.5 * sin(jp.x * 0.31) * sin(jp.x * 0.097 + 1.7));
float ground = plateJ > 0.5 ? 0.0 : 1.0 - smoothstep(15.0, 21.0, rJ + wob);
float scratch = 0.88 + 0.12 * gHash(floor(jp.y * 9.0) + floor(jp.x * 0.08) * 17.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.45) * scratch, ground * 0.85);
vec2 thT = thermSample(jp);
float tempNow = thT.x;
float tempPeak = thT.y;
float tintAmt = smoothstep(190.0, 230.0, tempPeak);
// temper colours are thin-film interference colours on bright metal (the ground band); on mill
// scale they hardly show
diffuseColor.rgb *= mix(vec3(1.0), temperTint(tempPeak), tintAmt * mix(0.25, 0.8, ground));
float scaleAmt = smoothstep(600.0, 1000.0, tempPeak);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.16, 0.17), scaleAmt * 0.8);
if (thermView > 0.5) diffuseColor.rgb = thermalPalette(tempNow) * 0.35;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.42, ground);
roughnessFactor = mix(roughnessFactor, 0.62, tintAmt);
roughnessFactor = mix(roughnessFactor, 0.78, scaleAmt);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.75, ground);
metalnessFactor = mix(metalnessFactor, 0.3, tintAmt); // dull oxide films
metalnessFactor = mix(metalnessFactor, 0.12, scaleAmt); // oxide scale is not metallic
if (thermView > 0.5) metalnessFactor = 0.0;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += incandescence(tempNow);
if (thermView > 0.5) totalEmissiveRadiance += thermalPalette(tempNow) * 0.6;`);
  };
  return mat;
}
