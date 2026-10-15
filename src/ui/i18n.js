// English / Arabic interface text. English strings are the keys; missing Arabic entries fall back
// to English. Arabic text is a draft for review by an Arabic-speaking welding SME (see README).
// Code references (ISO 6520-1 numbers, clause numbers, units) are never translated.

import { AR } from './ar.js';

let lang = 'en';
const listeners = [];

export function setLang(l) {
  lang = l === 'ar' ? 'ar' : 'en';
  for (const f of listeners) f(lang);
}

export function getLang() {
  return lang;
}

export function isRTL() {
  return lang === 'ar';
}

export function onLang(f) {
  listeners.push(f);
}

// t('Hello {name}', {name: 'x'})
export function t(s, vars) {
  let out = lang === 'ar' && AR[s] ? AR[s] : s;
  if (vars) for (const k in vars) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

// Numbers stay in Western digits in both languages (as printed in the codes).
export function num(x, d = 1) {
  if (x == null || !Number.isFinite(x)) return '–';
  return x.toFixed(d);
}
