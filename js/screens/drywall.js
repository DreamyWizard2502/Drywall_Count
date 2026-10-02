import { html, useEffect, useRef } from '../lib.js';
import { app, update, replaceCount, errMap, showErrors, learn, choices } from '../state.js';
import {
  ask, askText, toast, tripleVerify, navigate, uniqueName,
  ActionBar, ChoiceField, Stepper, FieldError, SummaryList,
} from '../ui.js';
import {
  newSection, newLine, sectionIssues, drywallIssues, drywallTotals, totalSheets, sectionTotal,
  isBlankSection, removeSection, sectionRefs, nextStage, nextLabel, clone, plural, num,
} from '../model.js';

const scrollToEl = (sel) =>
  setTimeout(() => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);

const lineSummary = (s) =>
  s.lines.map((l) => `${num(l.qty)} × ${l.type.trim()} — ${l.size.trim()}`);

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
  toast(`Finish “${open.name.trim() || 'the open area'}” first (or delete it).`);
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
    title: `Note for ${s.name.trim() || 'this area'}`,
    value: s.note,
    placeholder: 'e.g. Ceiling is 5/8 because of the garage',
    okLabel: 'Save note',
  });
  if (text !== null) update(() => (s.note = text.trim()));
}

async function deleteSection(c, s) {
  const refs = sectionRefs(c, s.id);
  const name = s.name.trim() || 'this area';
  const yes = await ask({
    title: `Delete ${name}?`,
    body: html`<p>This takes ${plural(sectionTotal(s), 'sheet')} off the count.</p>
      ${refs.length > 0 && html`<p>${name} is also used in: <b>${refs.join(', ')}</b>. It will be taken out of there too.</p>`}`,
    buttons: [
      { label: 'No, keep it', value: false, kind: 'primary' },
      { label: 'Yes, delete it', value: true, kind: 'danger' },
    ],
  });
  if (!yes) return;
  const before = clone(app.counts[c.id]);
  update((c) => removeSection(c, s.id));
  toast(`${name} deleted`, { undo: () => replaceCount(before) });
}

async function completeSection(c, s) {
  const issues = sectionIssues(c, s);
  if (issues.length) {
    toast(issues[0].msg, { kind: 'bad' });
    return showErrors(`sec-${s.id}`);
  }
  const ok = await tripleVerify({
    name: s.name.trim(),
    summary: html`<${SummaryList} items=${lineSummary(s)} /><p class="muted">${plural(sectionTotal(s), 'sheet')} total</p>`,
    getNote: () => s.note,
    setNote: (t) => update(() => (s.note = t)),
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
    name: 'the drywall count',
    question: 'Is ALL the drywall counted? Every area of the house?',
    summary: html`<${SummaryList} items=${totals.map((t) => `${t.qty} × ${t.type} — ${t.size}`)} />
      <p><b>${plural(totalSheets(c), 'sheet')}</b> in ${plural(c.sections.length, 'area')}</p>`,
    getNote: () => c.drywallNote,
    setNote: (t) => update((c) => (c.drywallNote = t)),
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
      <span class="section-num">Area ${index + 1}</span>
      <span class="badge badge-live">● Counting</span>
    </div>

    <div class=${`field ${errs[`${s.id}:name`] ? 'has-error' : ''}`}>
      <label class="label" for=${`name-${s.id}`}>${named ? 'Area name' : 'First, name this area'}</label>
      <div class="input-wrap">
        <input ref=${nameRef} id=${`name-${s.id}`} class="input big" value=${s.name} placeholder="Type it or tap below"
          autocomplete="off" autocapitalize="words" enterkeyhint="done" onInput=${(e) => setName(e.target.value)} />
        ${named && html`<button type="button" class="input-clear" aria-label="Clear name" onClick=${() => setName('')}>✕</button>`}
      </div>
      <${FieldError} msg=${errs[`${s.id}:name`]} />
    </div>

    ${!named && html`
      <div class="chips">${nameChoices.map((n) => html`<button type="button" class="chip"
        onClick=${() => setName(uniqueName(c, n, s.id))}>${n}</button>`)}</div>
      <div class="locked-note">🔒 Name this area to start counting</div>`}

    ${named && html`
      ${s.lines.map((l, i) => html`<${LineEditor} key=${l.id} s=${s} l=${l} i=${i} errs=${errs} />`)}
      <button type="button" class="btn btn-secondary" onClick=${() => update(() => s.lines.push(newLine()))}>
        + Add another drywall type
      </button>
      ${s.note
        ? html`<div class="note-box">📝 ${s.note} <button type="button" class="link" onClick=${() => editNote(s)}>Change note</button></div>`
        : html`<button type="button" class="btn btn-secondary" onClick=${() => editNote(s)}>📝 Add a note for this area</button>`}
      <button type="button" class="btn btn-success big" onClick=${() => completeSection(c, s)}>✅ Complete ${s.name.trim()}</button>
    `}

    <div class="section-foot">
      ${s.snap
        ? html`<button type="button" class="link" onClick=${() => cancelEdit(s)}>Cancel changes</button>`
        : html`<button type="button" class="link danger" onClick=${() => deleteSection(c, s)}>Delete this area</button>`}
    </div>
  </section>`;
}

function LineEditor({ s, l, i, errs }) {
  const multi = s.lines.length > 1;
  const remove = () => {
    const before = clone(s.lines);
    update(() => (s.lines = s.lines.filter((x) => x.id !== l.id)));
    toast('Drywall type removed', { undo: () => update(() => (s.lines = before)) });
  };
  return html`<div class="line">
    <div class="line-head">
      <b>${multi ? `Drywall #${i + 1}` : 'Drywall'}</b>
      ${multi && html`<button type="button" class="link danger" onClick=${remove}>Remove</button>`}
    </div>
    <${ChoiceField} label="Type" value=${l.type} options=${choices('drywallTypes')} error=${errs[`${l.id}:type`]}
      placeholder='e.g. 5/8" Abuse Resistant' onChange=${(v) => update(() => (l.type = v))} />
    <${ChoiceField} label="Sheet size" value=${l.size} options=${choices('sizes')} error=${errs[`${l.id}:size`]}
      placeholder="e.g. 4x16" typeLabel="Other size" onChange=${(v) => update(() => (l.size = v))} />
    <${Stepper} label="How many sheets?" value=${l.qty} unit="sheets" error=${errs[`${l.id}:qty`]}
      onChange=${(v) => update(() => (l.qty = v))} />
  </div>`;
}

/* ---------- a finished area ---------- */

function DoneSection({ c, s, index }) {
  return html`<section class="card section done" id=${`sec-${s.id}`}>
    <div class="section-top">
      <div class="section-title">
        <span class="section-num">Area ${index + 1}</span>
        <h3>✅ ${s.name}</h3>
      </div>
      <div class="icon-btns">
        <button type="button" class="icon-btn" onClick=${() => editSection(c, s)}><span>✏️</span><small>Edit</small></button>
        <button type="button" class="icon-btn" onClick=${() => editNote(s)}><span>📝</span><small>Note</small></button>
        <button type="button" class="icon-btn danger" onClick=${() => deleteSection(c, s)}><span>🗑</span><small>Delete</small></button>
      </div>
    </div>
    <ul class="sum-lines">
      ${s.lines.map((l) => html`<li><b>${num(l.qty)}</b> × ${l.type} <span class="muted">— ${l.size}</span></li>`)}
    </ul>
    ${s.note && html`<div class="note-box">📝 ${s.note}</div>`}
    <div class="section-total">${plural(sectionTotal(s), 'sheet')}</div>
  </section>`;
}

function Totals({ c }) {
  const totals = drywallTotals(c);
  if (!totals.length) return null;
  return html`<div class="card totals">
    <div class="label">Running total</div>
    <table>
      ${totals.map((t) => html`<tr><td class="qty">${t.qty}</td><td>${t.type}</td><td class="muted">${t.size}</td></tr>`)}
      <tr class="total-row"><td class="qty">${totalSheets(c)}</td><td colspan="2">sheets total</td></tr>
    </table>
  </div>`;
}

export function DrywallStage({ c }) {
  const open = openSection(c);
  const issues = drywallIssues(c);
  const verified = c.stages.drywall;

  // The big bottom button is always the next thing to do.
  let button;
  if (open && !open.name.trim()) {
    button = html`<button type="button" class="btn btn-primary big is-disabled" aria-disabled="true"
      onClick=${() => { toast('Name the area first', { kind: 'bad' }); scrollToEl(`#sec-${open.id}`); }}>
      Name the area first</button>`;
  } else if (open) {
    button = html`<button type="button" class="btn btn-success big" onClick=${() => completeSection(c, open)}>
      ✅ Complete ${open.name.trim()}</button>`;
  } else if (!c.sections.length) {
    button = html`<button type="button" class="btn btn-primary big" onClick=${() => addSection(c)}>+ Add an area</button>`;
  } else if (verified && !issues.length) {
    button = html`<button type="button" class="btn btn-primary big" onClick=${() => navigate(nextStage(c, 'drywall'))}>
      ${nextLabel(c, 'drywall')}</button>`;
  } else {
    button = html`<button type="button" class="btn btn-success big" onClick=${() => completeStage(c)}>✅ All the drywall is counted</button>`;
  }

  return html`
    <h1 class="stage-title">Drywall Count</h1>
    <p class="stage-sub">Go area by area. Name it, then count the sheets.</p>
    ${c.sections.map((s, i) => s.done
      ? html`<${DoneSection} key=${s.id} c=${c} s=${s} index=${i} />`
      : html`<${EditSection} key=${s.id} c=${c} s=${s} index=${i} />`)}
    <div id="after-sections">
      ${!open && html`<button type="button" class="btn btn-add" onClick=${() => addSection(c)}>+ Add another area</button>`}
    </div>
    <${Totals} c=${c} />
    <${ActionBar} hint=${`${plural(totalSheets(c), 'sheet')} in ${plural(c.sections.filter((s) => s.done).length, 'finished area')}`}>
      ${button}
    <//>
  `;
}
