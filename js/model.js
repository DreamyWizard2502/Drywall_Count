// Data model for one count, plus every validation rule. Screens never decide
// on their own whether something is "done" — they ask this file.

import { SCAFFOLD_OVER_FT } from './choices.js';

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export const STAGES = [
  { key: 'job', label: 'Job', title: 'Builder & Address' },
  { key: 'drywall', label: 'Drywall', title: 'Drywall Count' },
  { key: 'screws', label: 'Screws', title: 'Screws' },
  { key: 'site', label: 'Site', title: 'Job Site Check' },
  { key: 'review', label: 'Sheet', title: 'Count Sheet' },
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
export const sectionName = (c, id) => sectionById(c, id)?.name || '(deleted area)';
export const sectionTotal = (s) => s.lines.reduce((t, l) => t + num(l.qty), 0);
export const totalSheets = (c) => c.sections.reduce((t, s) => t + sectionTotal(s), 0);
export const isBlankSection = (s) =>
  !s.name.trim() && !s.note.trim() && s.lines.every((l) => !l.type && !l.size && !num(l.qty));

export function drywallTotals(c) {
  const map = new Map();
  for (const s of c.sections) {
    for (const l of s.lines) {
      if (!l.type.trim() || !l.size.trim() || num(l.qty) < 1) continue;
      const k = norm(l.type) + '|' + norm(l.size);
      const row = map.get(k) || { type: l.type.trim(), size: l.size.trim(), qty: 0 };
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

export const fmtFt = (h) => {
  const t = String(h ?? '').trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t} ft` : t;
};
// "18" -> 18, "12-20 vaulted" -> 20, "" -> null
export function parseFeet(str) {
  const nums = String(str ?? '').match(/\d+(\.\d+)?/g);
  return nums ? Math.max(...nums.map(Number)) : null;
}

export function standardCeiling(c) {
  const ce = c.site.ceiling;
  if (ce.standard === 'other') return ce.standardOther.trim() ? fmtFt(ce.standardOther) : null;
  return ce.standard ? fmtFt(ce.standard) : null;
}

// Areas whose ceiling height is set apart from the standard.
export function specialCeilings(c) {
  const ce = c.site.ceiling;
  if (ce.hasSpecial !== true) return [];
  return c.sections
    .filter((s) => ce.special[s.id] !== undefined)
    .map((s) => ({ id: s.id, name: s.name, height: ce.special[s.id], feet: parseFeet(ce.special[s.id]) }));
}

export function ceilingFor(c, sectionId) {
  const sp = specialCeilings(c).find((x) => x.id === sectionId);
  return sp ? fmtFt(sp.height) : null;
}

// Everything over 10 ft: these are what make scaffolding necessary.
export function tallAreas(c) {
  const out = [];
  const ce = c.site.ceiling;
  if (ce.standard === 'other' && parseFeet(ce.standardOther) > SCAFFOLD_OVER_FT) {
    out.push({ id: null, name: 'Whole house (standard)', height: ce.standardOther });
  }
  for (const sp of specialCeilings(c)) if (sp.feet > SCAFFOLD_OVER_FT) out.push(sp);
  return out;
}

// Where else in the count an area is referenced (shown before deleting it).
export function sectionRefs(c, id) {
  const refs = [];
  const st = c.site;
  if (st.ceiling.special[id] !== undefined) refs.push('Ceiling height');
  if (st.scaffold.items.some((i) => i.sectionIds.includes(id))) refs.push('Scaffolding');
  if (st.features.items.some((f) => f.sectionId === id)) refs.push('Special features');
  if (st.prerock.sectionIds.includes(id)) refs.push('Pre-rock');
  if (c.screws.items.some((i) => i.sectionIds.includes(id))) refs.push('Screws');
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
  if (!c.job.builder.trim()) out.push({ key: 'builder', msg: 'Builder / client name' });
  if (!c.job.address.trim()) out.push({ key: 'address', msg: 'Job address' });
  return out;
}

export function sectionIssues(c, s) {
  const out = [];
  const name = s.name.trim();
  if (!name) out.push({ key: `${s.id}:name`, msg: 'Name this area first' });
  else if (c.sections.some((o) => o.id !== s.id && norm(o.name) === norm(name))) {
    out.push({ key: `${s.id}:name`, msg: `You already have an area called "${name}". Give this one a different name, like "${name} 2".` });
  }
  if (!s.lines.length) out.push({ key: `${s.id}:lines`, msg: 'Add at least one drywall type' });
  const multi = s.lines.length > 1;
  const seen = new Set();
  s.lines.forEach((l, i) => {
    const n = multi ? ` (drywall #${i + 1})` : '';
    if (!l.type.trim()) out.push({ key: `${l.id}:type`, msg: `Pick the drywall type${n}` });
    if (!l.size.trim()) out.push({ key: `${l.id}:size`, msg: `Pick the sheet size${n}` });
    if (num(l.qty) < 1) out.push({ key: `${l.id}:qty`, msg: `Enter how many sheets${n}` });
    if (l.type.trim() && l.size.trim()) {
      const k = norm(l.type) + '|' + norm(l.size);
      if (seen.has(k)) out.push({ key: `${l.id}:type`, msg: `${l.type} ${l.size} is listed twice in this area. Put them together on one line.` });
      seen.add(k);
    }
  });
  return out;
}

export function drywallIssues(c) {
  const out = [];
  if (!c.sections.length) out.push({ key: 'sections', msg: 'Count at least one area' });
  const open = c.sections.find((s) => !s.done);
  if (open) out.push({ key: 'open', msg: `Finish "${open.name.trim() || 'the open area'}" first` });
  return out;
}

export function screwIssues(c) {
  const out = [];
  const sc = c.screws;
  if (!sc.supplier) out.push({ key: 'supplier', msg: 'Choose who is supplying the screws' });
  if (sc.supplier !== 'us') return out;
  if (!sc.items.length) out.push({ key: 'items', msg: 'Add the screw type' });
  const seen = new Set();
  sc.items.forEach((it, i) => {
    const n = sc.items.length > 1 ? ` (screw #${i + 1})` : '';
    if (!it.type.trim()) out.push({ key: `${it.id}:type`, msg: `Pick the screw type${n}` });
    else if (seen.has(norm(it.type))) out.push({ key: `${it.id}:type`, msg: `${it.type} is listed twice. Put the boxes together on one line.` });
    seen.add(norm(it.type));
    if (num(it.boxes) < 1) out.push({ key: `${it.id}:boxes`, msg: `Enter how many boxes${n}` });
    if (i > 0 && !it.reason.trim()) out.push({ key: `${it.id}:reason`, msg: `Say why screw #${i + 1} is needed` });
  });
  return out;
}

// One entry per question card on the Job Site screen, in screen order.
export function siteIssues(c) {
  const st = c.site;
  const out = [];
  const add = (card, key, msg) => out.push({ card, key, msg });

  const ce = st.ceiling;
  if (!ce.standard) add('ceiling', 'ceiling.standard', 'Pick the standard ceiling height');
  else if (ce.standard === 'other' && !parseFeet(ce.standardOther)) add('ceiling', 'ceiling.standardOther', 'Type the standard ceiling height');
  if (ce.hasSpecial === null) add('ceiling', 'ceiling.hasSpecial', 'Answer: any areas with a special ceiling height?');
  if (ce.hasSpecial === true) {
    const sp = specialCeilings(c);
    if (!sp.length) add('ceiling', 'ceiling.special', 'Tap the areas that have a special ceiling height');
    sp.forEach((x) => !x.feet && add('ceiling', `ceiling.special.${x.id}`, `Type the ceiling height for ${x.name}`));
  }

  const sf = st.scaffold;
  if (sf.needed === null) add('scaffold', 'scaffold.needed', 'Answer: will scaffolding be needed?');
  if (sf.needed === true) {
    if (!sf.items.length) add('scaffold', 'scaffold.items', 'Add the scaffolding');
    sf.items.forEach((it, i) => {
      const n = sf.items.length > 1 ? ` (scaffold #${i + 1})` : '';
      if (!it.kind) add('scaffold', `${it.id}:kind`, `Pick the type of scaffold${n}`);
      if (num(it.qty) < 1) add('scaffold', `${it.id}:qty`, `Enter how many${n}`);
      if (!it.sectionIds.length) add('scaffold', `${it.id}:areas`, `Tap which areas need the scaffold${n}`);
    });
  }

  if (st.power.has === null) add('power', 'power.has', 'Answer: does the house have electricity?');
  if (st.power.has === false && !st.power.by) add('power', 'power.by', 'Choose who is supplying power');

  if (st.water.has === null) add('water', 'water.has', 'Answer: is there water for the mud?');
  if (st.water.has === false && !st.water.by) add('water', 'water.by', 'Choose who is bringing water');

  const fe = st.features;
  if (fe.has === null) add('features', 'features.has', 'Answer: any special features?');
  if (fe.has === true) {
    if (!fe.items.length) add('features', 'features.items', 'Add the special feature');
    fe.items.forEach((f, i) => {
      const n = fe.items.length > 1 ? ` (feature #${i + 1})` : '';
      if (!f.name.trim()) add('features', `${f.id}:name`, `Say what the special feature is${n}`);
      if (!f.sectionId || !sectionById(c, f.sectionId)) add('features', `${f.id}:area`, `Tap which area the feature is in${n}`);
    });
  }

  if (st.bullnose.needed === null) add('trim', 'bullnose.needed', 'Answer: is bullnose required?');
  if (st.windowWrap.needed === null) add('trim', 'windowWrap.needed', 'Answer: are the windows being wrapped?');

  const pr = st.prerock;
  if (pr.needed === null) add('prerock', 'prerock.needed', 'Answer: is pre-rock needed?');
  if (pr.needed === true && !pr.sectionIds.length && !pr.other.trim()) add('prerock', 'prerock.areas', 'Tap which areas need pre-rock');
  return out;
}

export const SITE_CARDS = [
  { key: 'ceiling', title: 'Ceiling Height' },
  { key: 'scaffold', title: 'Scaffolding' },
  { key: 'power', title: 'Electricity' },
  { key: 'water', title: 'Water for Mud' },
  { key: 'features', title: 'Special Features' },
  { key: 'trim', title: 'Bullnose & Windows' },
  { key: 'prerock', title: 'Pre-Rock' },
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
  if (next === 'review') return '📄 Back to Count Sheet';
  return `Next: ${STAGES.find((s) => s.key === next).title} →`;
}

// Where to land if the requested stage isn't open yet.
export function firstOpenStage(c) {
  return STAGES.find((s) => s.key === 'review' || !stageDone(c, s.key)).key;
}

/* ---------- plain-language rows used by both the screens and the PDF ---------- */

export function lineText(l) {
  return `${l.type.trim()}  ${l.size.trim()}`;
}

export function screwRows(c) {
  const sc = c.screws;
  if (sc.supplier === 'builder') return { builder: true, rows: [] };
  if (sc.supplier !== 'us') return { missing: true, rows: [] };
  return {
    rows: sc.items.map((it, i) => ({
      boxes: num(it.boxes),
      type: it.type.trim(),
      reason: i > 0 ? it.reason.trim() : '',
      areas: it.sectionIds.map((id) => sectionName(c, id)),
    })),
  };
}

export const totalBoxes = (c) =>
  c.screws.supplier === 'us' ? c.screws.items.reduce((t, i) => t + num(i.boxes), 0) : 0;

export const SCAFFOLD_KINDS = {
  stack: { label: 'Stackable scaffolding', unit: 'section' },
  pony: { label: 'Pony scaffold', unit: 'pony scaffold' },
};

// [{label, lines[], attention, missing}]
export function siteRows(c) {
  const st = c.site;
  const names = (ids) => ids.map((id) => sectionName(c, id)).join(', ');
  const rows = [];
  const row = (label, lines, attention = false) => rows.push({ label, lines, attention, missing: !lines.length });

  const ce = st.ceiling;
  const std = standardCeiling(c);
  const ceil = [];
  if (std) ceil.push(`Standard: ${std}`);
  if (std && ce.hasSpecial === false) ceil.push('No special heights');
  for (const sp of specialCeilings(c)) ceil.push(`${sp.name}: ${fmtFt(sp.height) || '?'}`);
  row('Ceiling height', ceil, tallAreas(c).length > 0);

  const sf = st.scaffold;
  if (sf.needed === false) row('Scaffolding', ['NO']);
  else if (sf.needed === true) {
    row('Scaffolding', ['YES', ...sf.items.map((it) => {
      const k = SCAFFOLD_KINDS[it.kind];
      const q = num(it.qty);
      let t = k ? `${k.label}: ${plural(q, k.unit)}` : `${q} (type not picked)`;
      if (it.sectionIds.length) t += ` - ${names(it.sectionIds)}`;
      if (it.reason.trim()) t += ` (${it.reason.trim()})`;
      return t;
    })], true);
  } else row('Scaffolding', []);

  const pw = st.power;
  if (pw.has === true) row('Electricity', ['YES - power on site']);
  else if (pw.has === false) row('Electricity', [`NO - ${pw.by === 'generator' ? 'WE bring a generator' : pw.by === 'builder' ? 'BUILDER supplies power' : 'who supplies power not picked'}`], true);
  else row('Electricity', []);

  const wa = st.water;
  if (wa.has === true) row('Water for mud', ['YES - water on site']);
  else if (wa.has === false) row('Water for mud', [`NO - ${wa.by === 'us' ? 'WE bring water' : wa.by === 'builder' ? 'BUILDER supplies water' : 'who brings water not picked'}`], true);
  else row('Water for mud', []);

  const fe = st.features;
  if (fe.has === false) row('Special features', ['NONE']);
  else if (fe.has === true) {
    row('Special features', fe.items.map((f) => {
      let t = f.name.trim() || '(not named)';
      if (f.sectionId) t += ` - ${sectionName(c, f.sectionId)}`;
      if (f.note.trim()) t += ` (${f.note.trim()})`;
      return t;
    }), true);
  } else row('Special features', []);

  const bn = st.bullnose.needed;
  row('Bullnose', bn === null ? [] : [bn ? 'YES - bullnose corners' : 'NO'], bn === true);

  const ww = st.windowWrap;
  row('Window wrap', ww.needed === null ? [] : [ww.needed ? `YES - wrap windows in drywall${num(ww.count) ? ` (${plural(num(ww.count), 'window')})` : ''}` : 'NO'], ww.needed === true);

  const pr = st.prerock;
  if (pr.needed === false) row('Pre-rock', ['NO']);
  else if (pr.needed === true) {
    const where = [names(pr.sectionIds), pr.other.trim()].filter(Boolean).join(', ');
    row('Pre-rock', [`YES${where ? ' - ' + where : ''}`], true);
  } else row('Pre-rock', []);

  return rows;
}

export function fmtDate(ts, withTime = true) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!withTime) return date;
  return `${date} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
