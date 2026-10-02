// Data model for one count, plus every validation rule. Screens never decide
// on their own whether something is "done" — they ask this file.

import { SCAFFOLD_OVER_FT } from './choices.js';
import { t, tr, trn, mark, tv, tvIn, canon, uiLang, locale } from './i18n.js';

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const STAGES = [
  { key: 'job', label: mark('Job'), title: mark('Builder & Address') },
  { key: 'drywall', label: mark('Drywall'), title: mark('Drywall Count') },
  { key: 'screws', label: mark('Screws'), title: mark('Screws') },
  { key: 'site', label: mark('Site'), title: mark('Job Site Check') },
  { key: 'review', label: mark('Sheet'), title: mark('Count Sheet') },
];
export const WORK_STAGES = ['job', 'drywall', 'screws', 'site'];

export const newLine = () => ({ id: uid(), type: '', size: '', qty: '' });
export const newSection = (name = '') => ({ id: uid(), name, lines: [newLine()], note: '', done: false });
export const newScrew = () => ({ id: uid(), type: '', boxes: '', reason: '', sectionIds: [] });
export const newScaffold = () => ({ id: uid(), kind: null, qty: '', sectionIds: [], reason: '' });
export const newFeature = () => ({ id: uid(), name: '', sectionId: null, note: '' });

export function newCount() {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    status: 'draft', // 'draft' | 'complete'
    completedAt: null,
    sentAt: null,
    // Set to true only by the triple verification at the end of each stage.
    stages: { drywall: false, screws: false, site: false },
    // Stages re-opened because a deleted area broke one of their answers.
    recheck: {},
    job: { builder: '', address: '', pin: null },
    sections: [],
    drywallNote: '',
    screws: { supplier: null, items: [], note: '' }, // supplier: 'us' | 'builder'
    site: {
      ceiling: { standard: null, standardOther: '', hasSpecial: null, special: {} }, // special: {sectionId: '18'}
      scaffold: { needed: null, items: [] },
      power: { has: null, by: null }, // by: 'generator' | 'builder'
      water: { has: null, by: null }, // by: 'us' | 'builder'
      features: { has: null, items: [] },
      bullnose: { needed: null },
      windowWrap: { needed: null, count: '' },
      prerock: { needed: null, sectionIds: [], other: '' },
      note: '',
    },
  };
}

// Fill in any fields missing from counts saved by an older version of the app.
export function normalizeCount(c) {
  const fill = (target, base) => {
    for (const k of Object.keys(base)) {
      if (target[k] === undefined) target[k] = clone(base[k]);
      else if (isObj(base[k]) && isObj(target[k])) fill(target[k], base[k]);
    }
  };
  fill(c, newCount());
  return c;
}
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* ---------- small helpers ---------- */

export const sectionById = (c, id) => c.sections.find((s) => s.id === id);
export const sectionName = (c, id, lang = uiLang()) => tvIn(lang, sectionById(c, id)?.name) || tr(lang, '(deleted area)');
export const sectionTotal = (s) => s.lines.reduce((sum, l) => sum + num(l.qty), 0);
export const totalSheets = (c) => c.sections.reduce((sum, s) => sum + sectionTotal(s), 0);
export const isBlankSection = (s) =>
  !s.name.trim() && !s.note.trim() && s.lines.every((l) => !l.type && !l.size && !num(l.qty));

export function drywallTotals(c) {
  const map = new Map();
  for (const s of c.sections) {
    for (const l of s.lines) {
      if (!l.type.trim() || !l.size.trim() || num(l.qty) < 1) continue;
      const k = norm(canon(l.type)) + '|' + norm(l.size);
      const row = map.get(k) || { type: canon(l.type), size: l.size.trim(), qty: 0 };
      row.qty += num(l.qty);
      map.set(k, row);
    }
  }
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.size.localeCompare(b.size));
}

export function mapUrl(c) {
  const p = c.job.pin;
  if (p) return `https://maps.google.com/?q=${p.lat},${p.lng}`;
  const a = c.job.address.trim();
  return a ? `https://maps.google.com/?q=${encodeURIComponent(a)}` : '';
}

export const fmtFt = (h, lang = uiLang()) => {
  const v = String(h ?? '').trim();
  return /^\d+(\.\d+)?$/.test(v) ? tr(lang, '{n} ft', { n: v }) : v;
};
// "18" -> 18, "12-20 vaulted" -> 20, "" -> null
export function parseFeet(str) {
  const nums = String(str ?? '').match(/\d+(\.\d+)?/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

export function standardCeiling(c, lang = uiLang()) {
  const ce = c.site.ceiling;
  if (ce.standard === 'other') return ce.standardOther.trim() ? fmtFt(ce.standardOther, lang) : null;
  return ce.standard ? fmtFt(ce.standard, lang) : null;
}

// Areas whose ceiling height is set apart from the standard.
export function specialCeilings(c) {
  const ce = c.site.ceiling;
  if (ce.hasSpecial !== true) return [];
  return c.sections
    .filter((s) => ce.special[s.id] !== undefined)
    .map((s) => ({ id: s.id, name: s.name, height: ce.special[s.id], feet: parseFeet(ce.special[s.id]) }));
}

export function ceilingFor(c, sectionId, lang = uiLang()) {
  const sp = specialCeilings(c).find((x) => x.id === sectionId);
  return sp ? fmtFt(sp.height, lang) : null;
}

// Everything over 10 ft: these are what make scaffolding necessary.
export function tallAreas(c) {
  const out = [];
  const ce = c.site.ceiling;
  if (ce.standard === 'other' && parseFeet(ce.standardOther) > SCAFFOLD_OVER_FT) {
    out.push({ id: null, name: t('Whole house (standard)'), height: ce.standardOther });
  }
  for (const sp of specialCeilings(c)) if (sp.feet > SCAFFOLD_OVER_FT) out.push(sp);
  return out;
}

// Where else in the count an area is referenced (shown before deleting it).
export function sectionRefs(c, id) {
  const refs = [];
  const st = c.site;
  if (st.ceiling.special[id] !== undefined) refs.push(t('Ceiling height'));
  if (st.scaffold.items.some((i) => i.sectionIds.includes(id))) refs.push(t('Scaffolding'));
  if (st.features.items.some((f) => f.sectionId === id)) refs.push(t('Special features'));
  if (st.prerock.sectionIds.includes(id)) refs.push(t('Pre-rock'));
  if (c.screws.items.some((i) => i.sectionIds.includes(id))) refs.push(t('Screws'));
  return refs;
}

export function removeSection(c, id) {
  c.sections = c.sections.filter((s) => s.id !== id);
  const st = c.site;
  delete st.ceiling.special[id];
  st.scaffold.items.forEach((i) => (i.sectionIds = i.sectionIds.filter((x) => x !== id)));
  st.features.items.forEach((f) => f.sectionId === id && (f.sectionId = null));
  st.prerock.sectionIds = st.prerock.sectionIds.filter((x) => x !== id);
  c.screws.items.forEach((i) => (i.sectionIds = i.sectionIds.filter((x) => x !== id)));
  for (const k of ['screws', 'site']) {
    if (c.stages[k] && stageIssues(c, k).length) {
      c.stages[k] = false;
      c.recheck[k] = true;
    }
  }
}

/* ---------- validation: each returns [{key, msg}] ---------- */

export function jobIssues(c) {
  const out = [];
  if (!c.job.builder.trim()) out.push({ key: 'builder', msg: t('Builder / client name') });
  if (!c.job.address.trim()) out.push({ key: 'address', msg: t('Job address') });
  return out;
}

export function sectionIssues(c, s) {
  const out = [];
  const name = s.name.trim();
  if (!name) out.push({ key: `${s.id}:name`, msg: t('Name this area first') });
  else if (c.sections.some((o) => o.id !== s.id && norm(canon(o.name)) === norm(canon(name)))) {
    out.push({ key: `${s.id}:name`, msg: t('You already have an area called “{name}”. Give this one a different name, like “{name} 2”.', { name }) });
  }
  if (!s.lines.length) out.push({ key: `${s.id}:lines`, msg: t('Add at least one drywall type') });
  const multi = s.lines.length > 1;
  const seen = new Set();
  s.lines.forEach((l, i) => {
    const n = multi ? t(' (drywall #{n})', { n: i + 1 }) : '';
    if (!l.type.trim()) out.push({ key: `${l.id}:type`, msg: t('Pick the drywall type') + n });
    if (!l.size.trim()) out.push({ key: `${l.id}:size`, msg: t('Pick the sheet size') + n });
    if (num(l.qty) < 1) out.push({ key: `${l.id}:qty`, msg: t('Enter how many sheets') + n });
    if (l.type.trim() && l.size.trim()) {
      const k = norm(canon(l.type)) + '|' + norm(l.size);
      if (seen.has(k)) out.push({ key: `${l.id}:type`, msg: t('{type} {size} is listed twice in this area. Put them together on one line.', { type: tv(l.type), size: l.size }) });
      seen.add(k);
    }
  });
  return out;
}

export function drywallIssues(c) {
  const out = [];
  if (!c.sections.length) out.push({ key: 'sections', msg: t('Count at least one area') });
  const open = c.sections.find((s) => !s.done);
  if (open) out.push({ key: 'open', msg: t('Finish “{name}” first', { name: tv(open.name.trim()) || t('the open area') }) });
  return out;
}

export function screwIssues(c) {
  const out = [];
  const sc = c.screws;
  if (!sc.supplier) out.push({ key: 'supplier', msg: t('Choose who is supplying the screws') });
  if (sc.supplier !== 'us') return out;
  if (!sc.items.length) out.push({ key: 'items', msg: t('Add the screw type') });
  const seen = new Set();
  sc.items.forEach((it, i) => {
    const n = sc.items.length > 1 ? t(' (screw #{n})', { n: i + 1 }) : '';
    const k = norm(canon(it.type));
    if (!it.type.trim()) out.push({ key: `${it.id}:type`, msg: t('Pick the screw type') + n });
    else if (seen.has(k)) out.push({ key: `${it.id}:type`, msg: t('{type} is listed twice. Put the boxes together on one line.', { type: tv(it.type) }) });
    seen.add(k);
    if (num(it.boxes) < 1) out.push({ key: `${it.id}:boxes`, msg: t('Enter how many boxes') + n });
    if (i > 0 && !it.reason.trim()) out.push({ key: `${it.id}:reason`, msg: t('Say why screw #{n} is needed', { n: i + 1 }) });
  });
  return out;
}

// One entry per question card on the Job Site screen, in screen order.
export function siteIssues(c) {
  const st = c.site;
  const out = [];
  const add = (card, key, msg) => out.push({ card, key, msg });

  const ce = st.ceiling;
  if (!ce.standard) add('ceiling', 'ceiling.standard', t('Pick the standard ceiling height'));
  else if (ce.standard === 'other' && !parseFeet(ce.standardOther)) add('ceiling', 'ceiling.standardOther', t('Type the standard ceiling height'));
  if (ce.hasSpecial === null) add('ceiling', 'ceiling.hasSpecial', t('Answer: any areas with a special ceiling height?'));
  if (ce.hasSpecial === true) {
    const sp = specialCeilings(c);
    if (!sp.length) add('ceiling', 'ceiling.special', t('Tap the areas that have a special ceiling height'));
    sp.forEach((x) => !x.feet && add('ceiling', `ceiling.special.${x.id}`, t('Type the ceiling height for {name}', { name: tv(x.name) })));
  }

  const sf = st.scaffold;
  if (sf.needed === null) add('scaffold', 'scaffold.needed', t('Answer: will scaffolding be needed?'));
  if (sf.needed === true) {
    if (!sf.items.length) add('scaffold', 'scaffold.items', t('Add the scaffolding'));
    sf.items.forEach((it, i) => {
      const n = sf.items.length > 1 ? t(' (scaffold #{n})', { n: i + 1 }) : '';
      if (!it.kind) add('scaffold', `${it.id}:kind`, t('Pick the type of scaffold') + n);
      if (num(it.qty) < 1) add('scaffold', `${it.id}:qty`, t('Enter how many') + n);
      if (!it.sectionIds.length) add('scaffold', `${it.id}:areas`, t('Tap which areas need the scaffold') + n);
    });
  }

  if (st.power.has === null) add('power', 'power.has', t('Answer: does the house have electricity?'));
  if (st.power.has === false && !st.power.by) add('power', 'power.by', t('Choose who is supplying power'));

  if (st.water.has === null) add('water', 'water.has', t('Answer: is there water for the mud?'));
  if (st.water.has === false && !st.water.by) add('water', 'water.by', t('Choose who is bringing water'));

  const fe = st.features;
  if (fe.has === null) add('features', 'features.has', t('Answer: any special features?'));
  if (fe.has === true) {
    if (!fe.items.length) add('features', 'features.items', t('Add the special feature'));
    fe.items.forEach((f, i) => {
      const n = fe.items.length > 1 ? t(' (feature #{n})', { n: i + 1 }) : '';
      if (!f.name.trim()) add('features', `${f.id}:name`, t('Say what the special feature is') + n);
      if (!f.sectionId || !sectionById(c, f.sectionId)) add('features', `${f.id}:area`, t('Tap which area the feature is in') + n);
    });
  }

  if (st.bullnose.needed === null) add('trim', 'bullnose.needed', t('Answer: is bullnose required?'));
  if (st.windowWrap.needed === null) add('trim', 'windowWrap.needed', t('Answer: are the windows being wrapped?'));

  const pr = st.prerock;
  if (pr.needed === null) add('prerock', 'prerock.needed', t('Answer: is pre-rock needed?'));
  if (pr.needed === true && !pr.sectionIds.length && !pr.other.trim()) add('prerock', 'prerock.areas', t('Tap which areas need pre-rock'));
  return out;
}

export const SITE_CARDS = [
  { key: 'ceiling', title: mark('Ceiling Height') },
  { key: 'scaffold', title: mark('Scaffolding') },
  { key: 'power', title: mark('Electricity') },
  { key: 'water', title: mark('Water for Mud') },
  { key: 'features', title: mark('Special Features') },
  { key: 'trim', title: mark('Bullnose & Windows') },
  { key: 'prerock', title: mark('Pre-Rock') },
];

export function stageIssues(c, key) {
  if (key === 'job') return jobIssues(c);
  if (key === 'drywall') return drywallIssues(c);
  if (key === 'screws') return screwIssues(c);
  if (key === 'site') return siteIssues(c);
  return [];
}

// A stage is done when it passed its triple verification AND is still valid
// (e.g. deleting an area can break a scaffolding answer that pointed at it).
export function stageDone(c, key) {
  if (key === 'job') return jobIssues(c).length === 0;
  if (key === 'review') return allDone(c);
  return c.stages[key] === true && stageIssues(c, key).length === 0;
}
export const allDone = (c) => WORK_STAGES.every((k) => stageDone(c, k));

export function reachable(c, key) {
  const i = STAGES.findIndex((s) => s.key === key);
  return STAGES.slice(0, i).every((s) => stageDone(c, s.key));
}

// The next stage that still needs doing (skips ones already finished).
export function nextStage(c, key) {
  const i = STAGES.findIndex((s) => s.key === key);
  return STAGES.slice(i + 1).find((s) => s.key === 'review' || !stageDone(c, s.key)).key;
}

// Label for the button that moves on from `key`.
export function nextLabel(c, key) {
  const next = nextStage(c, key);
  if (next === 'review') return t('📄 Back to Count Sheet');
  return t('Next: {title} →', { title: t(STAGES.find((s) => s.key === next).title) });
}

// Where to land if the requested stage isn't open yet.
export function firstOpenStage(c) {
  return STAGES.find((s) => s.key === 'review' || !stageDone(c, s.key)).key;
}

/* ---------- plain-language rows used by both the screens and the PDF ---------- */

export function screwRows(c, lang = uiLang()) {
  const sc = c.screws;
  if (sc.supplier === 'builder') return { builder: true, rows: [] };
  if (sc.supplier !== 'us') return { missing: true, rows: [] };
  return {
    rows: sc.items.map((it, i) => ({
      boxes: num(it.boxes),
      type: tvIn(lang, it.type.trim()),
      reason: i > 0 ? it.reason.trim() : '',
      areas: it.sectionIds.map((id) => sectionName(c, id, lang)),
    })),
  };
}

export const totalBoxes = (c) =>
  c.screws.supplier === 'us' ? c.screws.items.reduce((sum, i) => sum + num(i.boxes), 0) : 0;

export const SCAFFOLD_KINDS = {
  stack: { label: mark('Stackable scaffolding'), one: mark('{n} section'), many: mark('{n} sections') },
  pony: { label: mark('Pony scaffold'), one: mark('{n} pony scaffold'), many: mark('{n} pony scaffolds') },
};

// [{label, lines[], attention, missing}] in the given language
export function siteRows(c, lang = uiLang()) {
  const st = c.site;
  const L = (k, v) => tr(lang, k, v);
  const names = (ids) => ids.map((id) => sectionName(c, id, lang)).join(', ');
  const rows = [];
  const row = (label, lines, attention = false) => rows.push({ label: L(label), lines, attention, missing: !lines.length });

  const ce = st.ceiling;
  const std = standardCeiling(c, lang);
  const ceil = [];
  if (std) ceil.push(L('Standard: {h}', { h: std }));
  if (std && ce.hasSpecial === false) ceil.push(L('No special heights'));
  for (const sp of specialCeilings(c)) ceil.push(`${tvIn(lang, sp.name)}: ${fmtFt(sp.height, lang) || '?'}`);
  row(mark('Ceiling height'), ceil, tallAreas(c).length > 0);

  const sf = st.scaffold;
  if (sf.needed === false) row(mark('Scaffolding'), [L('NO')]);
  else if (sf.needed === true) {
    row(mark('Scaffolding'), [L('YES'), ...sf.items.map((it) => {
      const k = SCAFFOLD_KINDS[it.kind];
      const q = num(it.qty);
      let line = k ? `${L(k.label)}: ${trn(lang, q, k.one, k.many)}` : L('{n} (type not picked)', { n: q });
      if (it.sectionIds.length) line += ` - ${names(it.sectionIds)}`;
      if (it.reason.trim()) line += ` (${it.reason.trim()})`;
      return line;
    })], true);
  } else row(mark('Scaffolding'), []);

  const pw = st.power;
  const pwBy = { generator: mark('NO - WE bring a generator'), builder: mark('NO - BUILDER supplies power') };
  if (pw.has === true) row(mark('Electricity'), [L('YES - power on site')]);
  else if (pw.has === false) row(mark('Electricity'), [pwBy[pw.by] ? L(pwBy[pw.by]) : L('NO - who supplies power not picked')], true);
  else row(mark('Electricity'), []);

  const wa = st.water;
  const waBy = { us: mark('NO - WE bring water'), builder: mark('NO - BUILDER supplies water') };
  if (wa.has === true) row(mark('Water for mud'), [L('YES - water on site')]);
  else if (wa.has === false) row(mark('Water for mud'), [waBy[wa.by] ? L(waBy[wa.by]) : L('NO - who brings water not picked')], true);
  else row(mark('Water for mud'), []);

  const fe = st.features;
  if (fe.has === false) row(mark('Special features'), [L('NONE')]);
  else if (fe.has === true) {
    row(mark('Special features'), fe.items.map((f) => {
      let line = tvIn(lang, f.name.trim()) || L('(not named)');
      if (f.sectionId) line += ` - ${sectionName(c, f.sectionId, lang)}`;
      if (f.note.trim()) line += ` (${f.note.trim()})`;
      return line;
    }), true);
  } else row(mark('Special features'), []);

  const bn = st.bullnose.needed;
  row(mark('Bullnose'), bn === null ? [] : [bn ? L('YES - bullnose corners') : L('NO')], bn === true);

  const ww = st.windowWrap;
  const wn = num(ww.count);
  const wrap = wn ? trn(lang, wn, 'YES - wrap windows in drywall ({n} window)', 'YES - wrap windows in drywall ({n} windows)') : L('YES - wrap windows in drywall');
  row(mark('Window wrap'), ww.needed === null ? [] : [ww.needed ? wrap : L('NO')], ww.needed === true);

  const pr = st.prerock;
  if (pr.needed === false) row(mark('Pre-rock'), [L('NO')]);
  else if (pr.needed === true) {
    const where = [names(pr.sectionIds), pr.other.trim()].filter(Boolean).join(', ');
    row(mark('Pre-rock'), [where ? L('YES - {where}', { where }) : L('YES')], true);
  } else row(mark('Pre-rock'), []);

  return rows;
}

export function fmtDate(ts, withTime = true, lang = uiLang()) {
  const d = new Date(ts);
  const date = d.toLocaleDateString(locale(lang), { month: 'short', day: 'numeric', year: 'numeric' });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' })}`;
}
