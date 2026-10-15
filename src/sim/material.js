// Carbon-steel thermal properties used by the coupon heat-flow model and the weld-pool model.
//
// Sources (confirmed):
//  - EN 1993-1-2 cl. 3.2.2 unit mass 7850 kg/m3, independent of temperature; cl. 3.4.1.2 specific
//    heat and cl. 3.4.1.3 thermal conductivity of carbon steel (formulas as reproduced by Dlubal's
//    EN 1993-1-2 formula pages). The standard covers 20-1200 C; above 1200 C the 1200 C values are
//    held constant here (extrapolation, labelled).
//  - Surface emissivity of carbon steel 0.7 (EN 1993-1-2, as quoted in the SUSCOS "Thermal
//    response" lecture, UPT).
//  - Free convection to gases: 2-25 W/m2K (Incropera et al., Fundamentals of Heat and Mass
//    Transfer, 6th ed., table of typical values). The value used is a SEED inside that range.
//  - Liquidus: steeluniversity equation for C < 0.5 % as reproduced by ABM proceedings,
//    T_liq = 1537 - 73.1C - 4Mn - 14Si - 45S - 30P (...). The example composition below is an
//    illustration, not the composition of a particular coupon steel.
//  - Surface tension of pure iron at its melting point 1.943 N/m, dgamma/dT = -4.3e-4 N/m.K
//    (Sahoo, DebRoy and McNallan, Metall. Trans. B, 1988). Sulphur and oxygen lower it.

export const RHO = 7850; // kg/m3
export const EMISSIVITY = 0.7;
export const H_CONV = 10; // W/m2K, seed inside the published 2-25 W/m2K free-convection range
export const SIGMA_SB = 5.670374419e-8; // W/m2K4
export const T_AMBIENT = 20; // C

// Example liquidus for C 0.15, Mn 1.4, Si 0.3, S 0.01, P 0.015 (wt %): 1515 C.
export function liquidus({ C = 0.15, Mn = 1.4, Si = 0.3, S = 0.01, P = 0.015, Cr = 0, Al = 0, Ni = 0, V = 0, Mo = 0 } = {}) {
  return 1537 - 73.1 * C - 4 * Mn - 14 * Si - 45 * S - 30 * P - 1.5 * Cr - 2.5 * Al - 3.5 * Ni - 4 * V - 5 * Mo;
}
export const T_LIQ = Math.round(liquidus());

export const SURFACE_TENSION_FE = 1.943; // N/m at the melting point of pure iron
export const RHO_LIQUID_EST = 7000; // kg/m3, seed estimate for liquid steel (not from a confirmed source)
export const G = 9.81;
// Capillary length sqrt(gamma / (rho g)) in mm: pools wider than this are shaped mostly by gravity.
export const CAPILLARY_MM = Math.sqrt(SURFACE_TENSION_FE / (RHO_LIQUID_EST * G)) * 1000;

// EN 1993-1-2 thermal conductivity (W/m.K)
export function conductivity(T) {
  if (T < 800) return 54 - 3.33e-2 * Math.max(T, 20);
  return 27.3; // 800-1200 C; held constant above 1200 C (extrapolation)
}

// EN 1993-1-2 specific heat (J/kg.K)
export function specificHeat(T) {
  const t = Math.max(T, 20);
  if (t < 600) return 425 + 7.73e-1 * t - 1.69e-3 * t * t + 2.22e-6 * t * t * t;
  if (t < 735) return 666 + 13002 / (738 - t);
  if (t < 900) return 545 + 17820 / (t - 731);
  return 650; // 900-1200 C; held constant above 1200 C (extrapolation)
}

// Properties used for the melt isotherm (weld-pool model): the 800-1200 C values.
export const K_HOT = 27.3; // W/m.K
export const C_HOT = 650; // J/kg.K
export const ALPHA_HOT = K_HOT / (RHO * C_HOT); // m2/s (5.35e-6)

// Volumetric enthalpy table H(T) = integral of rho c dT from 0 C, and its inverse.
const TMAX = 2200;
const H_OF_T = new Float64Array(TMAX + 1);
(() => {
  let H = 0;
  H_OF_T[0] = 0;
  for (let T = 1; T <= TMAX; T++) {
    // trapezoid on 1 C steps; the 735 C peak of the EN 1993-1-2 curve is finite (5000 J/kg.K)
    H += RHO * 0.5 * (specificHeat(T - 1) + specificHeat(T));
    H_OF_T[T] = H;
  }
})();

const NINV = 8192;
const H_MAX = H_OF_T[TMAX];
const T_OF_H = new Float32Array(NINV + 1);
(() => {
  let T = 0;
  for (let k = 0; k <= NINV; k++) {
    const H = (H_MAX * k) / NINV;
    while (T < TMAX && H_OF_T[T + 1] < H) T++;
    const h0 = H_OF_T[T], h1 = H_OF_T[Math.min(TMAX, T + 1)];
    T_OF_H[k] = T + (h1 > h0 ? (H - h0) / (h1 - h0) : 0);
  }
})();

export function enthalpy(T) {
  if (T <= 0) return RHO * specificHeat(20) * T;
  if (T >= TMAX) return H_OF_T[TMAX] + RHO * C_HOT * (T - TMAX);
  const i = Math.floor(T);
  const f = T - i;
  return H_OF_T[i] + (H_OF_T[i + 1] - H_OF_T[i]) * f;
}

export function temperatureOf(H) {
  if (H <= 0) return H / (RHO * specificHeat(20));
  if (H >= H_MAX) return TMAX + (H - H_MAX) / (RHO * C_HOT);
  const x = (H / H_MAX) * NINV;
  const k = Math.floor(x);
  const f = x - k;
  return T_OF_H[k] + (T_OF_H[k + 1] - T_OF_H[k]) * f;
}

// Conductivity lookup table (1 C steps) for the solver's inner loop.
export const K_TABLE = new Float32Array(TMAX + 1);
for (let T = 0; T <= TMAX; T++) K_TABLE[T] = conductivity(T);
export const K_TMAX = TMAX;

// Surface heat loss from one face (W/m2) at temperature T (C): convection + radiation.
export function surfaceLoss(T, Tamb = T_AMBIENT) {
  const a = T + 273.15, b = Tamb + 273.15;
  return H_CONV * (T - Tamb) + EMISSIVITY * SIGMA_SB * (a * a * a * a - b * b * b * b);
}
