import { html, useEffect, useRef } from '../lib.js';
import { app, update, replaceCount, errMap, showErrors, learn, choices } from '../state.js';
import {
  ask, askText, toast, tripleVerify, navigate, uniqueName,
  ActionBar, ChoiceField, Stepper, FieldError, SummaryList,
} from '../ui.js';
import {
  newSection, newLine, sectionIssues, drywallIssues, drywallTotals, totalSheets, sectionTotal,
  isBlankSection, removeSection, sectionRefs, nextStage, nextLabel, clone, num,
} from '../model.js';
import { t, tn, tv } from '../i18n.js';

const sheets = (n) => tn(n, '{n} sheet', '{n} sheets');
const areaName = (s) => tv(s.name.trim());

const scrollToEl = (sel) =>
  setTimeout(() => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);

const lineSummary = (s) =>
  s.lines.map((l) => `${num(l.qty)} × ${tv(l.type.trim())} — ${l.size.trim()}`);

function openSection(c) {
  return c.sections.find((s) => !s.done);
}

function addSection(c) {
  update((c) => c.sections.push(newSection()));
  const id = c.sections[c.sections.length - 1].id;
  scrollToEl(`#sec-${id}`);
}

// Only one area can be open at a time.
function blockedByOpen(c, exceptId) {
  const open = openSection(c);
  if (!open || open.id === exceptId) return false;
  if (isBlankSection(open)) {
    update((c) => removeSection(c, open.id));
    return false;
  }
  toast(t('Finish “{name}” first (or delete it).', { name: areaName(open) || t('the open area') }));
  scrollToEl(`#sec-${open.id}`);
  return true;
}

function editSection(c, s) {
  if (blockedByOpen(c, s.id)) return;
  update(() => {
    s.snap = clone({ name: s.name, lines: s.lines, note: s.note });
    s.done = false;
  });
  scrollToEl(`#sec-${s.id}`);
}

function cancelEdit(s) {
  update(() => {
    Object.assign(s, s.snap);
    delete s.snap;
    s.done = true;
  });
}

async function editNote(s) {
  const text = await askText({
    title: t('Note for {name}', { name: areaName(s) || t('this area') }),
    value: s.note,
    placeholder: t('e.g. Ceiling is 5/8 because of the garage'),
    okLabel: t('Save note'),
  });
  if (text !== null) update(() => (s.note = text.trim()));
}

async function deleteSection(c, s) {
  const refs = sectionRefs(c, s.id);
  const name = areaName(s) || t('this area');
  const yes = await ask({
    title: t('Delete {name}?', { name }),
    body: html`<p>${t('This takes {sheets} off the count.', { sheets: sheets(sectionTotal(s)) })}</p>
      ${refs.length > 0 && html`<p>${t('{name} is also used in:', { name })} <b>${refs.join(', ')}</b>. ${t('It will be taken out of there too.')}</p>`}`,
    buttons: [
      { label: t('No, keep it'), value: false, kind: 'primary' },
      { label: t('Yes, delete it'), value: true, kind: 'danger' },
    ],
  });
  if (!yes) return;
  const before = clone(app.counts[c.id]);
  update((c) => removeSection(c, s.id));
  toast(t('{name} deleted', { name }), { undo: () => replaceCount(before) });
}

async function completeSection(c, s) {
  const issues = sectionIssues(c, s);
  if (issues.length) {
    toast(issues[0].msg, { kind: 'bad' });
    return showErrors(`sec-${s.id}`);
  }
  const ok = await tripleVerify({
    name: areaName(s),
    summary: html`<${SummaryList} items=${lineSummary(s)} /><p class="muted">${t('{sheets} total', { sheets: sheets(sectionTotal(s)) })}</p>`,
    getNote: () => s.note,
    setNote: (note) => update(() => (s.note = note)),
  });
  if (!ok) return; // "No" or "Wait, I need to change something": keep editing
  update(() => {
    s.done = true;
    delete s.snap;
  });
  learn('sectionNames', s.name.replace(/\s+\d+$/, ''));
  s.lines.forEach((l) => {
    learn('drywallTypes', l.type);
    learn('sizes', l.size);
  });
  scrollToEl('#after-sections');
}

async function completeStage(c) {
  const totals = drywallTotals(c);
  const ok = await tripleVerify({
    name: t('the drywall count'),
    question: t('Is ALL the drywall counted? Every area of the house?'),
    summary: html`<${SummaryList} items=${totals.map((r) => `${r.qty} × ${tv(r.type)} — ${r.size}`)} />
      <p><b>${sheets(totalSheets(c))}</b> ${t('in')} ${tn(c.sections.length, '{n} area', '{n} areas')}</p>`,
    getNote: () => c.drywallNote,
    setNote: (note) => update((c) => (c.drywallNote = note)),
  });
  if (!ok) return;
  update((c) => (c.stages.drywall = true));
  navigate(nextStage(c, 'drywall'));
}

/* ---------- an area being counted ---------- */

function EditSection({ c, s, index }) {
  const errs = errMap(`sec-${s.id}`, sectionIssues(c, s));
  const named = s.name.trim().length > 0;
  const nameRef = useRef();
  useEffect(() => {
    if (!named && nameRef.current && index > 0) nameRef.current.focus();
  }, []);
  const setName = (v) => update(() => (s.name = v));
  const nameChoices = choices('sectionNames');

  return html`<section class="card section editing" id=${`sec-${s.id}`}>
    <div class="section-head">
      <span class="section-num">${t('Area {n}', { n: index + 1 })}</span>
      <span class="badge badge-live">● ${t('Counting')}</span>
    </div>

    <div class=${`field ${errs[`${s.id}:name`] ? 'has-error' : ''}`}>
      <label class="label" for=${`name-${s.id}`}>${named ? t('Area name') : t('First, name this area')}</label>
      <div class="input-wrap">
        <input ref=${nameRef} id=${`name-${s.id}`} class="input big" value=${s.name} placeholder=${t('Type it or tap below')}
          autocomplete="off" autocapitalize="words" enterkeyhint="done" onInput=${(e) => setName(e.target.value)} />
        ${named && html`<button type="button" class="input-clear" aria-label=${t('Clear name')} onClick=${() => setName('')}>✕</button>`}
      </div>
      <${FieldError} msg=${errs[`${s.id}:name`]} />
    </div>

    ${!named && html`
      <div class="chips">${nameChoices.map((n) => html`<button type="button" class="chip"
        onClick=${() => setName(uniqueName(c, tv(n), s.id))}>${tv(n)}</button>`)}</div>
      <div class="locked-note">🔒 ${t('Name this area to start counting')}</div>`}

    ${named && html`
      ${s.lines.map((l, i) => html`<${LineEditor} key=${l.id} s=${s} l=${l} i=${i} errs=${errs} />`)}
      <button type="button" class="btn btn-secondary" onClick=${() => update(() => s.lines.push(newLine()))}>
        ${t('+ Add another drywall type')}
      </button>
      ${s.note
        ? html`<div class="note-box">📝 ${s.note} <button type="button" class="link" onClick=${() => editNote(s)}>${t('Change note')}</button></div>`
        : html`<button type="button" class="btn btn-secondary" onClick=${() => editNote(s)}>${t('📝 Add a note for this area')}</button>`}
      <button type="button" class="btn btn-success big" onClick=${() => completeSection(c, s)}>${t('✅ Complete {name}', { name: areaName(s) })}</button>
    `}

    <div class="section-foot">
      ${s.snap
        ? html`<button type="button" class="link" onClick=${() => cancelEdit(s)}>${t('Cancel changes')}</button>`
        : html`<button type="button" class="link danger" onClick=${() => deleteSection(c, s)}>${t('Delete this area')}</button>`}
    </div>
  </section>`;
}

function LineEditor({ s, l, i, errs }) {
  const multi = s.lines.length > 1;
  const remove = () => {
    const before = clone(s.lines);
    update(() => (s.lines = s.lines.filter((x) => x.id !== l.id)));
    toast(t('Drywall type removed'), { undo: () => update(() => (s.lines = before)) });
  };
  return html`<div class="line">
    <div class="line-head">
      <b>${multi ? t('Drywall #{n}', { n: i + 1 }) : t('Drywall')}</b>
      ${multi && html`<button type="button" class="link danger" onClick=${remove}>${t('Remove')}</button>`}
    </div>
    <${ChoiceField} label=${t('Type')} value=${l.type} options=${choices('drywallTypes')} error=${errs[`${l.id}:type`]}
      placeholder=${t('e.g. 5/8" Abuse Resistant')} onChange=${(v) => update(() => (l.type = v))} />
    <${ChoiceField} label=${t('Sheet size')} value=${l.size} options=${choices('sizes')} error=${errs[`${l.id}:size`]}
      placeholder=${t('e.g. 4x16')} typeLabel=${t('Other size')} onChange=${(v) => update(() => (l.size = v))} />
    <${Stepper} label=${t('How many sheets?')} value=${l.qty} unit=${t('sheets')} error=${errs[`${l.id}:qty`]}
      onChange=${(v) => update(() => (l.qty = v))} />
  </div>`;
}

/* ---------- a finished area ---------- */

function DoneSection({ c, s, index }) {
  return html`<section class="card section done" id=${`sec-${s.id}`}>
    <div class="section-top">
      <div class="section-title">
        <span class="section-num">${t('Area {n}', { n: index + 1 })}</span>
        <h3>✅ ${areaName(s)}</h3>
      </div>
      <div class="icon-btns">
        <button type="button" class="icon-btn" onClick=${() => editSection(c, s)}><span>✏️</span><small>${t('Edit')}</small></button>
        <button type="button" class="icon-btn" onClick=${() => editNote(s)}><span>📝</span><small>${t('Note')}</small></button>
        <button type="button" class="icon-btn danger" onClick=${() => deleteSection(c, s)}><span>🗑</span><small>${t('Delete')}</small></button>
      </div>
    </div>
    <ul class="sum-lines">
      ${s.lines.map((l) => html`<li><b>${num(l.qty)}</b> × ${tv(l.type)} <span class="muted">— ${l.size}</span></li>`)}
    </ul>
    ${s.note && html`<div class="note-box">📝 ${s.note}</div>`}
    <div class="section-total">${sheets(sectionTotal(s))}</div>
  </section>`;
}

function Totals({ c }) {
  const totals = drywallTotals(c);
  if (!totals.length) return null;
  return html`<div class="card totals">
    <div class="label">${t('Running total')}</div>
    <table>
      ${totals.map((r) => html`<tr><td class="qty">${r.qty}</td><td>${tv(r.type)}</td><td class="muted">${r.size}</td></tr>`)}
      <tr class="total-row"><td class="qty">${totalSheets(c)}</td><td colspan="2">${t('sheets total')}</td></tr>
    </table>
  </div>`;
}

export function DrywallStage({ c }) {
  const open = openSection(c);
  const issues = drywallIssues(c);
  const verified = c.stages.drywall;
  const finished = c.sections.filter((s) => s.done).length;

  // The big bottom button is always the next thing to do.
  let button;
  if (open && !open.name.trim()) {
    button = html`<button type="button" class="btn btn-primary big is-disabled" aria-disabled="true"
      onClick=${() => { toast(t('Name the area first'), { kind: 'bad' }); scrollToEl(`#sec-${open.id}`); }}>
      ${t('Name the area first')}</button>`;
  } else if (open) {
    button = html`<button type="button" class="btn btn-success big" onClick=${() => completeSection(c, open)}>
      ${t('✅ Complete {name}', { name: areaName(open) })}</button>`;
  } else if (!c.sections.length) {
    button = html`<button type="button" class="btn btn-primary big" onClick=${() => addSection(c)}>${t('+ Add an area')}</button>`;
  } else if (verified && !issues.length) {
    button = html`<button type="button" class="btn btn-primary big" onClick=${() => navigate(nextStage(c, 'drywall'))}>
      ${nextLabel(c, 'drywall')}</button>`;
  } else {
    button = html`<button type="button" class="btn btn-success big" onClick=${() => completeStage(c)}>${t('✅ All the drywall is counted')}</button>`;
  }

  return html`
    <h1 class="stage-title">${t('Drywall Count')}</h1>
    <p class="stage-sub">${t('Go area by area. Name it, then count the sheets.')}</p>
    ${c.sections.map((s, i) => s.done
      ? html`<${DoneSection} key=${s.id} c=${c} s=${s} index=${i} />`
      : html`<${EditSection} key=${s.id} c=${c} s=${s} index=${i} />`)}
    <div id="after-sections">
      ${!open && html`<button type="button" class="btn btn-add" onClick=${() => addSection(c)}>${t('+ Add another area')}</button>`}
    </div>
    <${Totals} c=${c} />
    <${ActionBar} hint=${t('{sheets} in {areas}', { sheets: sheets(totalSheets(c)), areas: tn(finished, '{n} finished area', '{n} finished areas') })}>
      ${button}
    <//>
  `;
}
