// Entry point: page overlay (Enter VR / Enter MR), WebXR support checks, app start.

import { App } from './app.js';
import { t, onLang } from './ui/i18n.js';

const VERSION = '1.7.0';

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) e.appendChild(c);
  return e;
}

// How to open the simulator on the headset (shown from the page bar).
function buildHelp() {
  const code = (txt) => el('code', { text: txt });
  const li = (...parts) => el('li', {}, parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
  const box = el('div', { class: 'help', id: 'help', role: 'region', 'aria-label': 'Run on Meta Quest 3S' }, [
    el('h2', { text: 'Run it on your Meta Quest 3S' }),
    el('ol', {}, [
      li('Put the standalone ', code('index.html'), ' on any HTTPS address: GitHub Pages, Netlify or your own web server. WebXR only starts on HTTPS pages or on localhost.'),
      li('Or from a PC, with the Quest on USB in developer mode: serve the folder (', code('python -m http.server 8080'), '), run ', code('adb reverse tcp:8080 tcp:8080'), ' and open ', code('http://localhost:8080'), ' in the headset.'),
      li('Open the address in the Meta Quest Browser and press Enter VR for the virtual booth, or Enter MR to weld in your own room with passthrough.'),
    ]),
    el('dl', {}, [
      el('dt', { text: 'Gun hand' }), el('dd', { text: 'Trigger welds. B or Y lowers and raises the helmet; a quick nod also lowers it.' }),
      el('dt', { text: 'Other hand' }), el('dd', { text: 'Point and pull the trigger to use the panels. B or Y brings the menu in front of you. Squeeze near a coupon to pick it up.' }),
      el('dt', { text: 'Cutting torch' }), el('dd', { text: 'Trigger is the cutting oxygen lever. Hold the thumbstick up or down for the preheat oxygen, left or right for the fuel. A or X puts the spark lighter in the other hand; its trigger strikes it at the tip.' }),
      el('dt', { text: 'Desktop' }), el('dd', { text: 'Drag to look around, click the panels, press H to try the helmet view.' }),
    ]),
    el('p', { text: 'Inside an embedded preview the browser may block VR. The desktop view still runs demo welds, inspection and the code results.' }),
  ]);
  return box;
}

function start() {
  const root = document.getElementById('app');
  const status = el('div', { class: 'status', id: 'status' });
  const btnVR = el('button', { class: 'xr primary', id: 'enter-vr', disabled: '' });
  const btnAR = el('button', { class: 'xr', id: 'enter-ar', disabled: '' });
  const note = el('div', { class: 'note', id: 'xr-note' });
  const btnHelp = el('button', { class: 'xr', id: 'help-btn', 'aria-expanded': 'false', 'aria-controls': 'help' });
  const bar = el('div', { class: 'bar' }, [
    el('div', { class: 'brand' }, [el('span', { class: 'we', text: 'WELL EXPERTS' }), el('span', { class: 'title', id: 'page-title' })]),
    el('div', { class: 'actions' }, [btnVR, btnAR, btnHelp]),
  ]);
  const help = buildHelp();
  help.hidden = true;
  // keep the note and the help sheet just below the bar, however the bar wraps
  const place = () => {
    const b = bar.getBoundingClientRect().bottom;
    note.style.top = `${Math.round(b + 4)}px`;
    help.style.top = `${Math.round(b + 8)}px`;
    help.style.maxHeight = `calc(100% - ${Math.round(b + 24)}px)`;
  };
  window.addEventListener('resize', place);
  btnHelp.addEventListener('click', () => {
    help.hidden = !help.hidden;
    btnHelp.setAttribute('aria-expanded', String(!help.hidden));
    place();
  });
  document.body.appendChild(bar);
  document.body.appendChild(note);
  document.body.appendChild(help);
  document.body.appendChild(status);

  const app = new App(root, {
    onStatus: (msg) => {
      status.textContent = msg;
      status.classList.add('show');
      clearTimeout(status._t);
      status._t = setTimeout(() => status.classList.remove('show'), 3500);
    },
    onSession: (on) => {
      document.body.classList.toggle('in-xr', on);
    },
  });
  window.__app = app; // for automated tests

  const label = () => {
    document.getElementById('page-title').textContent = t('VR Welding Simulator');
    btnVR.textContent = t('Enter VR');
    btnAR.textContent = t('Enter MR (passthrough)');
    btnHelp.textContent = t('Run on Quest');
  };
  label();
  onLang(() => {
    label();
    place();
  });
  requestAnimationFrame(place);

  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  async function check() {
    if (!window.isSecureContext) {
      note.textContent = t('WebXR needs HTTPS (or localhost). Open this file from an HTTPS address on the headset.');
      return;
    }
    if (!navigator.xr) {
      note.textContent = t('This browser has no WebXR. On Meta Quest 3S, open the page in the Meta Quest Browser.');
      return;
    }
    let vr = false, ar = false, err = null;
    try {
      vr = await navigator.xr.isSessionSupported('immersive-vr');
      ar = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (e) {
      err = e;
    }
    if (vr) btnVR.removeAttribute('disabled');
    if (ar) btnAR.removeAttribute('disabled');
    if (!vr && !ar) {
      note.textContent = err || inFrame
        ? t('VR is not available inside this embedded page. Open the standalone file over HTTPS in the Meta Quest Browser.')
        : t('No VR headset found. Desktop preview only: drag to look around and use the panel.');
    } else note.textContent = '';
  }
  check();
  if (navigator.xr && navigator.xr.addEventListener) navigator.xr.addEventListener('devicechange', check);

  const go = async (mode) => {
    try {
      await app.enterXR(mode);
    } catch (e) {
      note.textContent = `${t('Could not start the XR session')}: ${e && e.message ? e.message : e}`;
    }
  };
  btnVR.addEventListener('click', () => go('vr'));
  btnAR.addEventListener('click', () => go('ar'));
  document.documentElement.setAttribute('data-version', VERSION);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
