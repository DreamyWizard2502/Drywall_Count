// Finds every piece of screen text in the app: anything passed to
// t / tr / tn / trn / mark (and the sheet's local L / N helpers).
//   node tests/i18n-keys.mjs           -> lists text with no Spanish yet
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARG = String.raw`(?:[\w.]+(?:\([\w.]*\))?\s*,\s*)`;
const STR = String.raw`'((?:[^'\\]|\\.)*)'`;
const CALL = new RegExp(String.raw`\b(?:t|tr|tn|trn|mark|L|N)\(\s*${ARG}{0,2}${STR}(?:\s*,\s*${STR})?`, 'g');

export function extractKeys() {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (rel.endsWith('.js') && !rel.endsWith('/es.js')) files.push(rel);
    }
  };
  walk('js');
  const keys = new Map();
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(CALL)) {
      for (const k of [m[1], m[2]]) if (k !== undefined) keys.set(k.replace(/\\'/g, "'"), f);
    }
  }
  return keys;
}

export async function missingSpanish() {
  // es.js has no browser-only code, so it can be imported directly.
  const { ES } = await import(pathToFileURL(path.join(ROOT, 'js/es.js')).href);
  const keys = extractKeys();
  const missing = [...keys.keys()].filter((k) => !(k in ES));
  const unused = Object.keys(ES).filter((k) => !keys.has(k));
  return { keys, missing, unused };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { keys, missing, unused } = await missingSpanish();
  console.log(`${keys.size} pieces of text, ${missing.length} without Spanish, ${unused.length} unused translations`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(missing, null, 1));
  else missing.forEach((k) => console.log('  missing:', JSON.stringify(k)));
  unused.forEach((k) => console.log('  unused:', JSON.stringify(k)));
}
