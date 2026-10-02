// End-to-end test: walks a whole count on a simulated iPhone.
//   node tests/e2e.mjs            (needs Playwright + Chromium)
// Screenshots and the sent PDF land in tests/out/.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

// Every app file must be in the offline list, or the app breaks with no signal.
const swList = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
for (const f of [...walk('js'), ...walk('css'), ...walk('vendor').filter((f) => !f.endsWith('.md')), 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']) {
  assert.ok(swList.includes(`'${f}'`), `sw.js is missing ${f}`);
}

// Every piece of screen text must have a Spanish translation.
const { missingSpanish } = await import('./i18n-keys.mjs');
const { missing } = await missingSpanish();
assert.deepEqual(missing, [], 'text without a Spanish translation (add it to js/es.js)');

const browser = await chromium.launch();

// A fresh simulated iPhone (empty storage), standing at the job site.
async function newPhone() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    geolocation: { latitude: 30.267153, longitude: -97.743057, accuracy: 6 },
    permissions: ['geolocation'],
  });
  await context.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ address: { house_number: '123', road: 'Sesame Street', city: 'Austin', state: 'Texas', 'ISO3166-2-lvl4': 'US-TX', postcode: '78701' } }),
  }));
  // Stand-in for the iPhone share sheet: remember what would have been sent.
  await context.addInitScript(() => {
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = async (data) => {
      const files = await Promise.all((data.files || []).map(async (f) => {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return { name: f.name, type: f.type, b64: btoa(bin) };
      }));
      window.__shared = window.__shared || [];
      window.__shared.push({ text: data.text, files });
    };
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { context, page: p };
}

const errors = [];
let { context, page } = await newPhone();
// On any failure, save what the screen looked like.
process.on('uncaughtException', async (e) => {
  console.error(e);
  await page.screenshot({ path: path.join(OUT, 'FAILED.png') }).catch(() => {});
  process.exit(1);
});
process.on('unhandledRejection', (e) => process.emit('uncaughtException', e));

let shot = 0;
const snap = async (name) => {
  await page.waitForTimeout(250); // let pop-ups finish sliding in
  await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`) });
};
const btn = (name) => page.getByRole('button', { name });
const tap = async (name) => btn(name).first().click();
// Dialog buttons ignore taps for a moment (anti double-tap), so wait for them.
const answer = async (name) => {
  const b = page.locator('.dialog').getByRole('button', { name });
  await b.waitFor();
  await page.waitForSelector('.dialog .btn[aria-disabled="false"]');
  await b.click();
  await page.waitForTimeout(30);
};
const dialogTitle = () => page.locator('.dialog h2').textContent();
const area = (n) => page.locator('section.section').nth(n);

await page.goto(BASE);
// First launch asks for the language.
await page.waitForSelector('.btn-lang');
await snap('language-picker');
await page.getByRole('button', { name: 'English', exact: true }).click();
await page.waitForSelector('.btn-start');
await snap('home');

/* ---- start ---- */
await tap('START COUNT');
await page.waitForSelector('#builder');
const next = btn(/Next: Start Counting/);
assert.equal(await next.getAttribute('aria-disabled'), 'true', 'Next must be locked until builder + address are filled');
await next.click({ force: true }); // a real finger can still tap a greyed-out button
assert.ok(await page.locator('#builder').isVisible(), 'locked Next does not move on');
assert.ok(await page.locator('.error').count() >= 2, 'tapping locked Next shows what is missing');
await page.fill('#builder', 'Bob the Builder');
assert.equal(await next.getAttribute('aria-disabled'), 'true', 'still locked with no address');
await tap(/Drop pin at my location/);
await page.waitForFunction(() => document.querySelector('#address').value.includes('Sesame'));
assert.equal(await page.inputValue('#address'), '123 Sesame Street, Austin, TX 78701');
assert.equal(await next.getAttribute('aria-disabled'), 'false');
await snap('job-filled');
await next.click();

/* ---- drywall: area 1 (Kitchen), with an error first and a note ---- */
await page.waitForSelector('.section.editing');
assert.equal(await page.locator('.line').count(), 0, 'cannot count before naming the area');
assert.ok(await page.getByText('Name this area to start counting').isVisible());
await snap('area-unnamed');
await area(0).getByRole('button', { name: 'Kitchen', exact: true }).click();
assert.equal(await page.locator('.line').count(), 1);
await area(0).getByRole('button', { name: '1/2" Regular', exact: true }).click();
await area(0).getByRole('button', { name: 'One more' }).click();
await area(0).getByRole('button', { name: /Complete Kitchen/ }).click();
assert.ok(await page.locator('.has-error').count() > 0, 'missing sheet size is flagged');
assert.equal(await page.locator('.dialog').count(), 0, 'no verification while something is missing');
await area(0).getByRole('button', { name: '4x12', exact: true }).click();
await area(0).locator('.step-input').fill('30');
await tap('+ Add another drywall type');
const line2 = area(0).locator('.line').nth(1);
await line2.getByRole('button', { name: '5/8" Type X (Fire)', exact: true }).click();
await line2.getByRole('button', { name: '4x12', exact: true }).click();
await line2.locator('.step-input').fill('4');
await snap('area-kitchen-editing');
await area(0).getByRole('button', { name: /Complete Kitchen/ }).click();
assert.match(await dialogTitle(), /Are you sure you want to complete Kitchen/);
await snap('verify-1');
await answer('Yes, it’s complete');
assert.match(await dialogTitle(), /notes for Kitchen/);
await answer('Yes, add a note');
await page.fill('.dialog textarea', 'Ceiling over the island is 5/8');
await answer('Save note');
assert.match(await dialogTitle(), /Kitchen complete/);
await snap('verify-3');
// "Wait, I need to change something" keeps it open...
await answer('Wait, I need to change something');
assert.equal(await page.locator('.section.editing').count(), 1, 'Wait keeps the area open');
// ...then go through again.
await area(0).getByRole('button', { name: /Complete Kitchen/ }).click();
await answer('Yes, it’s complete');
await answer('No, the note is good');
await answer('OK');
assert.equal(await page.locator('.section.done').count(), 1);
assert.ok(await btn('+ Add another area').isVisible(), 'add-another appears after completing');

/* ---- area 2 (Garage), area 3 (Foyer), area 4 typed by hand ---- */
async function countArea(i, name, type, size, qty, viaChip = true) {
  await tap('+ Add another area');
  if (viaChip) await area(i).getByRole('button', { name, exact: true }).click();
  else await area(i).locator('input.input.big').fill(name);
  await area(i).getByRole('button', { name: type, exact: true }).click();
  await area(i).getByRole('button', { name: size, exact: true }).click();
  await area(i).locator('.step-input').fill(String(qty));
  await area(i).getByRole('button', { name: new RegExp(`Complete ${name}`) }).click();
  await answer('Yes, it’s complete');
  await answer('No notes');
  await answer('OK');
}
await countArea(1, 'Garage', '5/8" Type X (Fire)', '4x12', 20);
await countArea(2, 'Foyer', '1/2" Regular', '4x12', 18);
// a typed name with smart quotes (what an iPhone keyboard produces)
await countArea(3, 'Mike’s “Man Cave”', '1/2" Regular', '4x8', 12, false);

// Duplicate name gets numbered automatically.
await tap('+ Add another area');
await area(4).getByRole('button', { name: 'Kitchen', exact: true }).click();
assert.equal(await area(4).locator('input.input.big').inputValue(), 'Kitchen 2');
await area(4).getByRole('button', { name: 'Delete this area' }).click();
await answer('Yes, delete it');
assert.equal(await page.locator('section.section').count(), 4);

// Edit a finished area through its corner buttons, then cancel.
await area(1).getByRole('button', { name: /Edit/ }).click();
assert.equal(await page.locator('.section.editing').count(), 1);
await area(1).locator('.step-input').fill('99');
await area(1).getByRole('button', { name: 'Cancel changes' }).click();
assert.match(await area(1).textContent(), /20 sheets/);

await snap('areas-done');
await tap('✅ All the drywall is counted');
assert.match(await dialogTitle(), /Is ALL the drywall counted/);
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');

/* ---- screws ---- */
await page.waitForSelector('text=Who is supplying the screws?');
await tap('✅ Screws are complete');
assert.ok(await page.locator('.has-error').count() > 0);
await tap(/We are bringing the screws/);
await page.getByRole('button', { name: '1-1/4" Coarse Thread', exact: true }).click();
await page.locator('.step-input').first().fill('6');
await tap('+ Add a different screw type');
const screw2 = page.locator('.card').filter({ hasText: 'Screw type #2' });
await screw2.getByRole('button', { name: '1" Fine Thread', exact: true }).click();
await screw2.locator('.step-input').fill('2');
await tap('✅ Screws are complete');
assert.ok(await page.getByText('Say why screw #2 is needed').first().isVisible(), 'second screw type needs a reason');
await screw2.locator('textarea').fill('Metal studs in the garage');
await screw2.getByRole('button', { name: 'Garage' }).click();
await snap('screws');
await tap('✅ Screws are complete');
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');

/* ---- job site ---- */
await page.waitForSelector('text=Job Site Check');
const card = (k) => page.locator(`#card-${k}`);
await card('ceiling').getByRole('button', { name: '9 ft' }).click();
await card('ceiling').getByRole('button', { name: 'Yes', exact: true }).click();
await card('ceiling').getByRole('button', { name: 'Foyer' }).click();
await card('ceiling').locator('input').fill('18');
assert.ok(await card('scaffold').getByText('Tall ceilings').isVisible());
await card('scaffold').getByRole('button', { name: 'No', exact: true }).click();
assert.match(await dialogTitle(), /No scaffolding/);
await answer('Oops — we need scaffolding');
await card('scaffold').getByRole('button', { name: /Stackable scaffolding/ }).click();
await card('scaffold').locator('.step-input').fill('6');
await card('scaffold').getByRole('button', { name: /Foyer/ }).click();
await card('power').getByRole('button', { name: 'No', exact: true }).click();
await card('power').getByRole('button', { name: /bringing a generator/ }).click();
await card('water').getByRole('button', { name: 'Yes', exact: true }).click();
await card('features').getByRole('button', { name: 'Yes', exact: true }).click();
await card('features').getByRole('button', { name: 'Rotunda', exact: true }).click();
await card('features').getByRole('button', { name: 'Foyer' }).click();
await card('trim').getByRole('button', { name: 'Yes', exact: true }).first().click();
await card('trim').getByRole('button', { name: 'Yes', exact: true }).nth(1).click();
await card('trim').locator('.step-input').fill('14');
await snap('site-partial');
await tap('✅ Job site check is complete');
assert.ok(await card('prerock').locator('.error').count() > 0, 'unanswered pre-rock is flagged');
await card('prerock').getByRole('button', { name: 'Yes', exact: true }).click();
await card('prerock').getByRole('button', { name: 'Garage' }).click();
assert.equal(await page.locator('.qcard.answered').count(), 7);
await tap('✅ Job site check is complete');
await answer('Yes, it’s complete');
await answer('Yes, add a note');
await page.fill('.dialog textarea', 'Gate code 4321');
await answer('Save note');
await answer('OK');

/* ---- review ---- */
await page.waitForSelector('canvas.sheet-canvas');
await page.waitForTimeout(150);
await snap('review');
await page.locator('canvas.sheet-canvas').click();
await page.waitForSelector('.viewer');
await snap('viewer');
await tap('✕ Close');

// Go back and change only the screws; only that stage is re-verified.
await tap('✏️ Go back and change something');
await answer('Screws');
assert.ok(await page.getByText('Screws is complete').isVisible(), 'finished stage is locked');
await tap('✏️ Change something here');
await page.locator('.step-input').first().fill('7');
await snap('screws-editing');
await tap('✅ Screws are complete');
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');
await page.waitForSelector('text=Count Sheet');
assert.ok(await btn('✅ Complete Count').isVisible(), 'returns straight to the sheet');

// Deleting an area that the site check points at re-opens just the site check.
await tap('✏️ Go back and change something');
await answer('Drywall Count');
await tap('+ Add another area');
await area(4).getByRole('button', { name: 'Office', exact: true }).click();
await area(4).getByRole('button', { name: '1/2" Regular', exact: true }).click();
await area(4).getByRole('button', { name: '4x8', exact: true }).click();
await area(4).getByRole('button', { name: 'One more' }).click();
await tap('✅ Complete Office');
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');
assert.ok(await btn('📄 Back to Count Sheet').isVisible(), 'only the new area needed verifying');
await page.locator('.steps').getByRole('button', { name: /Site/ }).click();
await tap('✏️ Change something here');
await card('prerock').getByRole('button', { name: /Garage/ }).click(); // off
await card('prerock').getByRole('button', { name: /Office/ }).click(); // on
await tap('✅ Job site check is complete');
await answer('Yes, it’s complete');
await answer('No, the note is good');
await answer('OK');
await page.locator('.steps').getByRole('button', { name: /Drywall/ }).click();
await area(4).getByRole('button', { name: /Delete/ }).click();
assert.match(await page.locator('.dialog').textContent(), /also used in: Pre-rock/);
await answer('Yes, delete it');
assert.ok(await page.locator('.steps .step').nth(4).isDisabled(), 'sheet is locked while the site check is broken');
await tap('Next: Job Site Check →');
assert.ok(await page.getByText('Something changed in the drywall areas').isVisible());
assert.ok(await card('prerock').locator('.error').isVisible(), 'the broken answer is marked');
await snap('site-broken');
await card('prerock').getByRole('button', { name: /Garage/ }).click();
await tap('✅ Job site check is complete');
await answer('Yes, it’s complete');
await answer('No, the note is good');
await answer('OK');
await page.waitForSelector('text=Count Sheet');

// Survives the app being closed and reopened.
await page.reload();
await page.waitForSelector('canvas.sheet-canvas');

await tap('✅ Complete Count');
await answer('Yes, complete the count');
await page.waitForSelector('.btn-send');
await snap('send');
await tap(/Send to Mom/);
await page.waitForSelector('.banner-ok');
const shared = await page.evaluate(() => window.__shared);
assert.equal(shared.length, 1);
const { text, files } = shared[0];
assert.match(text, /drywall count for Bob the Builder at 123 Sesame Street/);
assert.match(text, /https:\/\/maps\.google\.com\/\?q=30\.267153,-97\.743057/);
assert.equal(files[0].type, 'application/pdf');
assert.equal(files[0].name, 'Drywall Count - Bob the Builder - 123 Sesame Street.pdf');
const pdfPath = path.join(OUT, 'sent.pdf');
fs.writeFileSync(pdfPath, Buffer.from(files[0].b64, 'base64'));
await snap('sent');
console.log('Shared text:\n' + text);

await tap('Done — back to Home');
await tap(/Past Counts/);
assert.ok(await page.getByText(/^Sent /).isVisible());
await snap('past');

/* ---- big house still fits on one page ---- */
const big = await page.evaluate(async () => {
  const m = await import('./js/model.js');
  const { buildSheet, sheetToPdf } = await import('./js/sheet.js');
  const c = m.newCount();
  c.job.builder = 'Huge Custom Homes LLC';
  c.job.address = '9999 Very Long Ranch Road, Dripping Springs, TX 78620';
  const types = ['1/2" Regular', '5/8" Type X (Fire)', '1/2" Moisture Resistant'];
  for (let i = 0; i < 45; i++) {
    const s = m.newSection(`Room ${i + 1}`);
    s.lines = types.slice(0, 1 + (i % 3)).map((t, j) => ({ id: m.uid(), type: t, size: j ? '4x8' : '4x12', qty: 5 + i }));
    if (i % 4 === 0) s.note = 'Watch the soffit along the back wall, it steps down twice';
    s.done = true;
    c.sections.push(s);
  }
  c.screws.supplier = 'builder';
  const sheet = buildSheet(c, { recipient: 'Mom', counter: '', company: '' });
  const pdf = sheetToPdf(sheet);
  return { pages: pdf.getNumberOfPages(), bottom: sheet.bottom, scale: sheet.scale, cols: sheet.cols, b64: btoa(pdf.output()) };
});
assert.equal(big.pages, 1);
assert.ok(big.bottom <= 792 - 30 - 18, `big house overflowed: ${big.bottom}`);
fs.writeFileSync(path.join(OUT, 'big-house.pdf'), Buffer.from(big.b64, 'base64'));
console.log(`Big house: 45 areas fit at ${Math.round(big.scale * 100)}% text size, ${big.cols} columns`);

/* ---- works with no signal ---- */
await page.goto(BASE);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller);
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.btn-start');
assert.ok(await page.locator('.offline-note').isVisible(), 'offline message shows');
await snap('offline-home');

/* ---- second count, fully offline: GPS with no signal, builder supplies screws ---- */
await tap('START COUNT');
await page.waitForSelector('#builder');
await page.fill('#builder', 'Acme Homes');
await tap(/Drop pin at my location/);
await page.waitForFunction(() => document.querySelector('#address').value.startsWith('GPS pin'));
assert.equal(await page.inputValue('#address'), 'GPS pin 30.26715, -97.74306');
await tap(/Next: Start Counting/);
await area(0).getByRole('button', { name: 'Bedroom', exact: true }).click();
await area(0).getByRole('button', { name: '1/2" Regular', exact: true }).click();
await area(0).getByRole('button', { name: '4x12', exact: true }).click();
await area(0).getByRole('button', { name: 'One more' }).click();
await tap('✅ Complete Bedroom'); // the big bottom button
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');
await tap('✅ All the drywall is counted');
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');
await tap(/BUILDER is supplying the screws/);
assert.match(await dialogTitle(), /builder supplying ALL the screws/);
await answer('Yes, the builder is supplying them');
assert.ok(await page.locator('.banner-builder').isVisible(), 'builder banner shows');
await snap('screws-builder');
await tap('✅ Screws are complete');
await answer('Yes, it’s complete');
await answer('No notes');
await answer('OK');
await page.waitForSelector('#card-ceiling');

// Unlock screws, then try to leave half-edited: must finish or undo.
await page.locator('.steps').getByRole('button', { name: /Screws/ }).click();
await tap('✏️ Change something here');
await page.locator('.steps').getByRole('button', { name: /Drywall/ }).click();
assert.match(await dialogTitle(), /You started changing Screws/);
await answer('Undo my changes');
assert.ok(await page.getByText('Drywall Count', { exact: true }).isVisible());
assert.equal(await page.locator('.steps .step.done').count(), 3, 'screws are back to done after undo');
const offlineSheet = await page.evaluate(async () => {
  const { buildSheet } = await import('./js/sheet.js');
  const { app } = await import('./js/state.js');
  const c = app.counts[app.ui.countId];
  return buildSheet(c, app.settings).ops.filter((o) => o.t === 'text').map((o) => o.s).join(' | ');
});
assert.match(offlineSheet, /SUPPLIED BY BUILDER/);
assert.match(offlineSheet, /Map pin: 30\.26715, -97\.74306/);
await context.setOffline(false);

/* ---- Dad works in Spanish; Mom still gets English ---- */
({ context, page } = await newPhone());
await page.goto(BASE);
await page.getByRole('button', { name: 'Español', exact: true }).click();
await page.waitForSelector('.btn-start');
assert.equal(await page.locator('.btn-start').textContent(), 'EMPEZAR CONTEO');
assert.equal(await page.locator('html').getAttribute('lang'), 'es');
await snap('es-home');
await tap('EMPEZAR CONTEO');
await page.fill('#builder', 'Constructora García');
await tap(/Poner pin donde estoy/);
await page.waitForFunction(() => document.querySelector('#address').value.includes('Sesame'));
await tap(/Siguiente: Empezar a Contar/);
await area(0).getByRole('button', { name: 'Cocina', exact: true }).click();
assert.equal(await area(0).locator('input.input.big').inputValue(), 'Cocina');
await area(0).getByRole('button', { name: '1/2" Normal', exact: true }).click();
await area(0).getByRole('button', { name: '4x12', exact: true }).click();
await area(0).locator('.step-input').fill('25');
await snap('es-area');
await tap('✅ Terminar Cocina');
assert.equal(await dialogTitle(), '¿Seguro que quieres terminar Cocina?');
await snap('es-verify');
await answer('Sí, ya está terminado');
assert.equal(await dialogTitle(), '¿Tienes alguna nota para Cocina?');
await answer('No, sin notas');
assert.equal(await dialogTitle(), 'Listo: Cocina');
await answer('OK');

await tap('+ Agregar otra área');
await area(1).getByRole('button', { name: 'Recámara', exact: true }).click();
await area(1).getByRole('button', { name: '5/8" Tipo X (Fuego)', exact: true }).click();
await area(1).getByRole('button', { name: '4x8', exact: true }).click();
await area(1).locator('.step-input').fill('8');

// One tap to English in the middle of an area: nothing is lost.
await page.locator('.flow-head').getByRole('button', { name: 'Switch to English' }).click();
assert.ok(await page.getByRole('heading', { name: 'Drywall Count' }).isVisible());
assert.equal(await area(1).locator('.step-input').inputValue(), '8');
assert.match(await area(0).locator('h3').textContent(), /Kitchen/);
assert.equal(await area(1).getByRole('button', { name: '5/8" Type X (Fire)', exact: true }).getAttribute('aria-pressed'), 'true');
await snap('es-now-english');
await page.locator('.flow-head').getByRole('button', { name: 'Cambiar a Español' }).click();
assert.ok(await page.getByRole('heading', { name: 'Conteo de Drywall' }).isVisible());

await tap('✅ Terminar Recámara');
await answer('Sí, ya está terminado');
await answer('No, sin notas');
await answer('OK');
await tap('✅ Ya está contado todo el drywall');
assert.equal(await dialogTitle(), '¿Ya está contado TODO el drywall? ¿Todas las áreas de la casa?');
await answer('Sí, ya está terminado');
await answer('No, sin notas');
await answer('OK');

await tap(/El CONSTRUCTOR pone los tornillos/);
await answer('Sí, el constructor los pone');
await tap('✅ Ya están los tornillos');
await answer('Sí, ya está terminado');
await answer('No, sin notas');
await answer('OK');

await page.waitForSelector('#card-ceiling');
await card('ceiling').getByRole('button', { name: '9 pies' }).click();
await card('ceiling').getByRole('button', { name: 'No', exact: true }).click();
await card('scaffold').getByRole('button', { name: 'No', exact: true }).click();
await card('power').getByRole('button', { name: 'No', exact: true }).click();
await card('power').getByRole('button', { name: /Nosotros llevamos generador/ }).click();
await card('water').getByRole('button', { name: 'Sí', exact: true }).click();
await card('features').getByRole('button', { name: 'Sí', exact: true }).click();
await card('features').getByRole('button', { name: 'Rotonda', exact: true }).click();
await card('features').getByRole('button', { name: 'Recámara' }).click();
await card('trim').getByRole('button', { name: 'No', exact: true }).first().click();
await card('trim').getByRole('button', { name: 'No', exact: true }).nth(1).click();
await card('prerock').getByRole('button', { name: 'No', exact: true }).click();
await snap('es-site');
await tap('✅ Ya está la revisión del sitio');
await answer('Sí, ya está terminado');
await answer('Sí, agregar una nota');
await page.fill('.dialog textarea', 'El código de la puerta es 4321');
await answer('Guardar nota');
await answer('OK');

await page.waitForSelector('canvas.sheet-canvas');
assert.ok(await page.getByText('(La hoja está en inglés.)').isVisible());
await snap('es-review');
await tap('✅ Terminar Conteo');
await answer('Sí, terminar el conteo');
await page.waitForSelector('.btn-send');
await snap('es-send');
await tap(/Enviar a Mamá/);
await page.waitForSelector('.banner-ok');
const sharedEs = (await page.evaluate(() => window.__shared))[0];
assert.match(sharedEs.text, /^This is the drywall count for Constructora García at 123 Sesame Street/);
assert.equal(sharedEs.files[0].name, 'Drywall Count - Constructora García - 123 Sesame Street.pdf');
const esPdf = path.join(OUT, 'es-sent.pdf');
fs.writeFileSync(esPdf, Buffer.from(sharedEs.files[0].b64, 'base64'));
const { execFileSync } = await import('node:child_process');
const pdfText = execFileSync('pdftotext', ['-layout', esPdf, '-']).toString();
for (const word of ['Kitchen', 'Bedroom', '1/2" Regular', '5/8" Type X (Fire)', 'Rotunda - Bedroom', 'WE bring a generator', 'SUPPLIED BY BUILDER', 'Constructora García']) {
  assert.ok(pdfText.includes(word), `English sheet should say "${word}"`);
}
for (const word of ['Cocina', 'Recámara', 'Fuego']) assert.ok(!pdfText.includes(word), `English sheet should not say "${word}"`);

// If Settings asks for a Spanish sheet, the same count comes out in Spanish (accents and all).
const spanishSheet = await page.evaluate(async () => {
  const { buildSheet, sheetToPdf, shareText } = await import('./js/sheet.js');
  const { app } = await import('./js/state.js');
  const c = app.counts[app.ui.countId];
  const settings = { ...app.settings, sheetLang: 'es' };
  return { b64: btoa(sheetToPdf(buildSheet(c, settings)).output()), text: shareText(c, settings) };
});
fs.writeFileSync(path.join(OUT, 'es-sheet-in-spanish.pdf'), Buffer.from(spanishSheet.b64, 'base64'));
const esText = execFileSync('pdftotext', ['-layout', path.join(OUT, 'es-sheet-in-spanish.pdf'), '-']).toString();
for (const word of ['CONTEO DE DRYWALL', 'Cocina', 'Recámara', 'MATERIAL PARA PEDIR', 'NOSOTROS llevamos generador', 'LOS PONE EL CONSTRUCTOR']) {
  assert.ok(esText.includes(word), `Spanish sheet should say "${word}"`);
}
assert.match(spanishSheet.text, /^Este es el conteo de drywall de Constructora García/);

assert.deepEqual(errors, [], 'no errors in the browser console');
await browser.close();
server.close();
console.log(`\nAll checks passed. Screenshots + PDFs in ${path.relative(process.cwd(), OUT)}/`);
