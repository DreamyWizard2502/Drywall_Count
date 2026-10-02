// English / Español.
//
// Screen text: t('English text') returns the Spanish from es.js when the app
// is in Spanish (English text is the key, so the code stays readable).
// Use {name} for values: t('Delete {name}?', { name }).
//
// Saved values (area names, drywall types...) are stored as typed or tapped.
// tv() shows a known hot-choice word in the current language ("Kitchen" <->
// "Cocina"), and tvIn(lang, ...) does the same for the count sheet, so Dad can
// work in Spanish and Mom still gets an English sheet.

import { ES } from './es.js';

export const LANGS = { en: 'English', es: 'Español' };

let ui = 'en';
export const uiLang = () => ui;
export function setUiLang(lang) {
  ui = lang === 'es' ? 'es' : 'en';
  document.documentElement.lang = ui;
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

// Marks text that is translated later (lists of titles etc.).
export const mark = (s) => s;

export const tr = (lang, key, vars) => fill((lang === 'es' && ES[key]) || key, vars);
export const t = (key, vars) => tr(ui, key, vars);

// Singular/plural: tn(3, '{n} sheet', '{n} sheets') -> "3 sheets" / "3 hojas"
export const trn = (lang, n, one, many, vars) => tr(lang, n === 1 ? one : many, { n, ...vars });
export const tn = (n, one, many, vars) => trn(ui, n, one, many, vars);

export const locale = (lang = ui) => (lang === 'es' ? 'es-US' : 'en-US');

/* ---------- hot-choice words in both languages: [English, Español] ---------- */

const TERMS = [
  // areas
  ['Garage', 'Garaje'], ['Kitchen', 'Cocina'], ['Living Room', 'Sala'], ['Family Room', 'Sala Familiar'],
  ['Dining Room', 'Comedor'], ['Great Room', 'Sala Grande'], ['Foyer', 'Recibidor'], ['Hallway', 'Pasillo'],
  ['Stairwell', 'Escalera'], ['Master Bedroom', 'Recámara Principal'], ['Master Bath', 'Baño Principal'],
  ['Master Closet', 'Clóset Principal'], ['Bedroom', 'Recámara'], ['Bathroom', 'Baño'], ['Half Bath', 'Medio Baño'],
  ['Closet', 'Clóset'], ['Laundry', 'Lavandería'], ['Pantry', 'Despensa'], ['Office', 'Oficina'],
  ['Bonus Room', 'Cuarto Extra'], ['Media Room', 'Cuarto de Cine'], ['Mudroom', 'Entrada Trasera'],
  ['Basement', 'Sótano'], ['Utility Room', 'Cuarto de Servicio'], ['Porch Ceiling', 'Techo del Porche'],
  // drywall
  ['1/2" Regular', '1/2" Normal'], ['1/2" Lightweight', '1/2" Ligero'], ['5/8" Type X (Fire)', '5/8" Tipo X (Fuego)'],
  ['1/2" Moisture Resistant', '1/2" Contra Humedad'], ['1/2" Mold Resistant', '1/2" Contra Moho'],
  ['5/8" Moisture/Mold Type X', '5/8" Tipo X Humedad/Moho'], ['1/2" Ceiling (Sag Resistant)', '1/2" Para Techo (No se Pandea)'],
  ['1/4" Flexible', '1/4" Flexible'], ['3/8" Regular', '3/8" Normal'], ['1/2" Cement Board', '1/2" Tablero de Cemento'],
  // screws
  ['1-1/4" Coarse Thread', '1-1/4" Rosca Gruesa'], ['1-5/8" Coarse Thread', '1-5/8" Rosca Gruesa'],
  ['2" Coarse Thread', '2" Rosca Gruesa'], ['1" Fine Thread', '1" Rosca Fina'],
  ['1-1/4" Fine Thread', '1-1/4" Rosca Fina'], ['1-5/8" Fine Thread', '1-5/8" Rosca Fina'],
  // special features
  ['Rotunda', 'Rotonda'], ['Dome Ceiling', 'Techo de Domo'], ['Curved Wall', 'Pared Curva'],
  ['Barrel Ceiling', 'Techo de Barril'], ['Vaulted Ceiling', 'Techo Abovedado'], ['Cathedral Ceiling', 'Techo de Catedral'],
  ['Tray Ceiling', 'Techo de Charola'], ['Coffered Ceiling', 'Techo Artesonado'], ['Arched Opening', 'Arco'],
  ['Niche', 'Nicho'], ['Soffit', 'Plafón (Soffit)'], ['Column Wrap', 'Forro de Columna'],
];

const key = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[“”″]/g, '"');
const byKey = new Map();
for (const pair of TERMS) {
  byKey.set(key(pair[0]), pair);
  byKey.set(key(pair[1]), pair);
}

// "Recámara 2" -> ["Recámara", " 2"]
function split(v) {
  const m = String(v ?? '').trim().match(/^(.*?)(\s+\d+)?$/);
  return [m[1], m[2] || ''];
}

// A saved value in the given language (unknown/typed values stay as typed).
export function tvIn(lang, v) {
  if (!v) return v ?? '';
  const [base, num] = split(v);
  const pair = byKey.get(key(base));
  return pair ? pair[lang === 'es' ? 1 : 0] + num : v;
}
export const tv = (v) => tvIn(ui, v);

// The same thing no matter which language it was entered in (for comparing).
export const canon = (v) => tvIn('en', String(v ?? '').trim());
