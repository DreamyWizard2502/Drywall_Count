// App state + saving to the phone. Every change is saved automatically, so
// closing the app (or the phone dying) never loses a count.

import { html, render } from './lib.js';
import { newCount, normalizeCount, newSection, norm, clone, firstOpenStage } from './model.js';
import { SECTION_NAMES, DRYWALL_TYPES, SHEET_SIZES, SCREW_TYPES, SPECIAL_FEATURES } from './choices.js';

const KEY = {
  index: 'dc.index',
  count: (id) => `dc.count.${id}`,
  settings: 'dc.settings',
  learned: 'dc.learned',
  ui: 'dc.ui',
  installHint: 'dc.installHintClosed',
};

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export const app = {
  counts: {},
  settings: { recipient: 'Mom', counter: '', company: '', ...read(KEY.settings, {}) },
  learned: read(KEY.learned, {}),
  ui: {
    screen: 'home', // home | flow | send | past | settings
    countId: null,
    stage: 'job',
    showErrors: {}, // scope -> true once he tried to finish with something missing
    dialog: null,
    toast: null,
    viewer: false,
    snap: null, // {stage, data} saved when a finished stage is unlocked for edits
    pinBusy: false,
    online: navigator.onLine,
  },
};

/* ---------- loading ---------- */

export function loadAll() {
  for (const id of read(KEY.index, [])) {
    const c = read(KEY.count(id), null);
    if (c) app.counts[id] = normalizeCount(c);
  }
  // Reopen right where he was in a count (phones close apps in the background).
  const saved = read(KEY.ui, null);
  if (saved && app.counts[saved.countId] && ['flow', 'send'].includes(saved.screen)) {
    Object.assign(app.ui, { screen: saved.screen, countId: saved.countId, stage: saved.stage || 'job' });
  }
}

/* ---------- saving ---------- */

const dirty = new Set();
let saveTimer = null;
let saveFailed = false;

export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  let ok = true;
  for (const id of dirty) {
    if (app.counts[id]) ok = write(KEY.count(id), app.counts[id]) && ok;
    else localStorage.removeItem(KEY.count(id));
  }
  dirty.clear();
  ok = write(KEY.index, Object.keys(app.counts)) && ok;
  if (!ok && !saveFailed) {
    saveFailed = true;
    alert('Your phone storage is full, so the count could not be saved. Delete some old counts in Past Counts.');
  }
  if (ok) saveFailed = false;
}

function markDirty(id) {
  dirty.add(id);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

function persistUi() {
  const { screen, countId, stage } = app.ui;
  write(KEY.ui, { screen, countId, stage });
}

export function saveSettings() {
  write(KEY.settings, app.settings);
  rerender();
}

/* ---------- rendering ---------- */

let rootEl = null;
let RootComp = null;
let queued = false;

export function mount(el, Comp) {
  rootEl = el;
  RootComp = Comp;
  rerender();
}

export function rerender() {
  if (queued || !rootEl) return;
  queued = true;
  Promise.resolve().then(() => {
    queued = false;
    render(html`<${RootComp} />`, rootEl);
  });
}

/* ---------- mutations ---------- */

export const current = () => app.counts[app.ui.countId] || null;

// Change the current count. Everything goes through here so it gets saved.
export function update(fn) {
  const c = current();
  if (!c) return;
  fn(c);
  c.updatedAt = Date.now();
  markDirty(c.id);
  rerender();
}

export function updateCount(c, fn) {
  fn(c);
  c.updatedAt = Date.now();
  markDirty(c.id);
  rerender();
}

export function replaceCount(c) {
  app.counts[c.id] = c;
  markDirty(c.id);
  rerender();
}

export function createCount() {
  const c = newCount();
  app.counts[c.id] = c;
  markDirty(c.id);
  flush();
  return c;
}

export function deleteCount(id) {
  delete app.counts[id];
  markDirty(id);
  flush();
  if (app.ui.countId === id) app.ui.countId = null;
  persistUi();
  rerender();
}

export function setUi(patch) {
  Object.assign(app.ui, patch);
  rerender();
}

/* ---------- navigation ---------- */

export function go(screen, patch = {}) {
  Object.assign(app.ui, { screen, viewer: false, showErrors: {}, toast: null, ...patch });
  persistUi();
  flush();
  window.scrollTo(0, 0);
  rerender();
}

export function goStage(stage) {
  const c = current();
  if (stage === 'drywall' && c && !c.sections.length) {
    update((c) => c.sections.push(newSection()));
  }
  Object.assign(app.ui, { screen: 'flow', stage, showErrors: {}, viewer: false, toast: null });
  persistUi();
  window.scrollTo(0, 0);
  rerender();
}

export function openCount(c) {
  const stage = app.ui.countId === c.id ? app.ui.stage : firstOpenStage(c);
  go(c.status === 'complete' ? 'send' : 'flow', { countId: c.id, stage, snap: null });
}

/* ---------- unlocking a finished stage (screws / site) ---------- */

export function unlockStage(c, stage) {
  app.ui.snap = { countId: c.id, stage, data: clone(c[stage]) };
  update((c) => (c.stages[stage] = false));
}

// The stage he unlocked and hasn't finished yet (only for this count).
export function openEdit(c) {
  const snap = app.ui.snap;
  return snap && c && snap.countId === c.id && !c.stages[snap.stage] ? snap : null;
}

export function cancelStageEdit(c) {
  const snap = openEdit(c);
  if (!snap) return;
  app.ui.snap = null;
  updateCount(c, (c) => {
    c[snap.stage] = snap.data;
    c.stages[snap.stage] = true;
  });
}

export function finishStageEdit() {
  app.ui.snap = null;
}

/* ---------- errors only show after he tries to finish ---------- */

export function showErrors(scope) {
  app.ui.showErrors = { ...app.ui.showErrors, [scope]: true };
  rerender();
  setTimeout(() => {
    const el = document.querySelector('.has-error, .err');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
}

export function errMap(scope, issues, force = false) {
  if (!force && !app.ui.showErrors[scope]) return {};
  const m = {};
  for (const i of issues) if (!m[i.key]) m[i.key] = i.msg;
  return m;
}

/* ---------- remembered custom choices ---------- */

const BASE = {
  sectionNames: SECTION_NAMES,
  drywallTypes: DRYWALL_TYPES,
  sizes: SHEET_SIZES,
  screwTypes: SCREW_TYPES,
  features: SPECIAL_FEATURES,
  builders: [],
};

export function learn(cat, value) {
  const v = String(value ?? '').trim();
  if (!v || BASE[cat].some((b) => norm(b) === norm(v))) return;
  const list = (app.learned[cat] || []).filter((x) => norm(x) !== norm(v));
  list.unshift(v);
  app.learned[cat] = list.slice(0, cat === 'builders' ? 8 : 12);
  write(KEY.learned, app.learned);
}

export function forgetLearned() {
  app.learned = {};
  write(KEY.learned, app.learned);
  rerender();
}

export const choices = (cat) => [
  ...BASE[cat],
  ...(app.learned[cat] || []).filter((x) => !BASE[cat].some((b) => norm(b) === norm(x))),
];

/* ---------- misc ---------- */

export const installHintClosed = () => read(KEY.installHint, false);
export const closeInstallHint = () => {
  write(KEY.installHint, true);
  rerender();
};

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
window.addEventListener('online', () => setUi({ online: true }));
window.addEventListener('offline', () => setUi({ online: false }));
