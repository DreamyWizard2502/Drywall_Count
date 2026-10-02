// Shared building blocks: pop-up questions, the triple verification,
// big tap-friendly inputs.

import { html, useState, useEffect, useRef } from './lib.js';
import { app, rerender, current, goStage, openEdit, cancelStageEdit } from './state.js';
import { STAGES, num, norm } from './model.js';

/* ---------- pop-up questions ---------- */

let dialogSeq = 0;

// buttons: [{label, value, kind: 'primary'|'success'|'secondary'|'danger'|'send'}]
export function ask({ title, body = null, icon = null, buttons, input = null }) {
  return new Promise((resolve) => {
    app.ui.toast = null; // an old message must not sit on top of the question
    app.ui.dialog = { id: ++dialogSeq, title, body, icon, buttons, input, text: input?.value || '', resolve };
    rerender();
  });
}

export async function askText({ title, body = null, value = '', placeholder = '', okLabel = 'Save', cancelLabel = 'Cancel' }) {
  const r = await ask({
    title,
    body,
    input: { value, placeholder },
    buttons: [
      { label: okLabel, value: 'ok', kind: 'primary' },
      { label: cancelLabel, value: null, kind: 'secondary' },
    ],
  });
  return r === null ? null : r.text;
}

export const tell = (title, body, icon = null) =>
  ask({ title, body, icon, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });

function closeDialog(value) {
  const d = app.ui.dialog;
  if (!d) return;
  app.ui.dialog = null;
  rerender();
  d.resolve(d.input && value !== null ? { value, text: d.text } : value);
}

export function DialogHost() {
  const d = app.ui.dialog;
  // Buttons ignore taps for a moment after a question pops up, so a double
  // tap can't blow through all three verification questions by accident.
  const [armed, setArmed] = useState(false);
  const inputRef = useRef();
  useEffect(() => {
    document.body.classList.toggle('no-scroll', !!d);
    if (!d) return;
    setArmed(false);
    const t = setTimeout(() => setArmed(true), 450);
    if (d.input && inputRef.current) setTimeout(() => inputRef.current && inputRef.current.focus(), 80);
    return () => clearTimeout(t);
  }, [d && d.id]);
  if (!d) return null;
  return html`<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
    <div class="dialog">
      ${d.icon && html`<div class="dialog-icon">${d.icon}</div>`}
      <h2 id="dlg-title">${d.title}</h2>
      ${d.body && html`<div class="dialog-body">${d.body}</div>`}
      ${d.input && html`<textarea ref=${inputRef} class="input" rows="4" placeholder=${d.input.placeholder}
        value=${d.text} onInput=${(e) => (d.text = e.target.value)}></textarea>`}
      <div class="dialog-btns">
        ${d.buttons.map((b) => html`<button type="button" class=${`btn btn-${b.kind || 'secondary'}`}
          aria-disabled=${!armed} onClick=${() => armed && closeDialog(b.value)}>${b.label}</button>`)}
      </div>
    </div>
  </div>`;
}

/* ---------- toast (with optional Undo) ---------- */

let toastSeq = 0;
export function toast(msg, { undo = null, kind = '' } = {}) {
  const id = ++toastSeq;
  app.ui.toast = { id, msg, undo, kind };
  rerender();
  setTimeout(() => {
    if (app.ui.toast && app.ui.toast.id === id) {
      app.ui.toast = null;
      rerender();
    }
  }, undo ? 8000 : 4000);
}

export function ToastHost() {
  const t = app.ui.toast;
  if (!t) return null;
  return html`<div class=${`toast ${t.kind}`} role="status">
    <span>${t.msg}</span>
    ${t.undo && html`<button type="button" class="toast-undo" onClick=${() => {
      app.ui.toast = null;
      t.undo();
      rerender();
    }}>Undo</button>`}
  </div>`;
}

/* ---------- triple verification ---------- */

// 1) Are you sure?  2) Any notes?  3) Complete! [OK] / [Wait, change something]
// Resolves true only if he gets all the way through and taps OK.
export async function tripleVerify({ name, question, summary, getNote, setNote }) {
  const sure = await ask({
    title: question || `Are you sure you want to complete ${name}?`,
    body: summary,
    buttons: [
      { label: 'Yes, it’s complete', value: true, kind: 'success' },
      { label: 'No, go back', value: false, kind: 'secondary' },
    ],
  });
  if (!sure) return false;

  const existing = getNote();
  const wantsNote = await ask({
    title: `Do you have any notes for ${name}?`,
    body: existing ? html`<p class="note-box">📝 ${existing}</p>` : null,
    buttons: existing
      ? [
          { label: 'No, the note is good', value: false, kind: 'primary' },
          { label: 'Yes, change the note', value: true, kind: 'secondary' },
        ]
      : [
          { label: 'No notes', value: false, kind: 'primary' },
          { label: 'Yes, add a note', value: true, kind: 'secondary' },
        ],
  });
  if (wantsNote) {
    const text = await askText({ title: `Notes for ${name}`, value: existing, placeholder: 'Type your note…', okLabel: 'Save note' });
    if (text !== null) setNote(text.trim());
  }

  return ask({
    icon: '✅',
    title: `${cap(name)} complete`,
    buttons: [
      { label: 'OK', value: true, kind: 'primary' },
      { label: 'Wait, I need to change something', value: false, kind: 'secondary' },
    ],
  });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- moving between stages ---------- */

// If he unlocked a finished stage and is leaving it half-edited, make him
// either finish it or undo — never leave it silently broken.
export async function navigate(stage) {
  const c = current();
  const snap = openEdit(c);
  if (snap && snap.stage !== stage) {
    const title = STAGES.find((s) => s.key === snap.stage).title;
    const choice = await ask({
      title: `You started changing ${title}`,
      body: 'Finish your changes (tap the green Complete button), or undo them.',
      buttons: [
        { label: `Go back to ${title}`, value: 'back', kind: 'primary' },
        { label: 'Undo my changes', value: 'undo', kind: 'secondary' },
      ],
    });
    if (choice === 'back') return;
    cancelStageEdit(c);
  }
  goStage(stage);
}

/* ---------- inputs ---------- */

export function FieldError({ msg }) {
  return msg ? html`<div class="error" role="alert">⚠️ ${msg}</div>` : null;
}

// Hot-choice chips plus "type your own".
export function ChoiceField({ label, value, options, onChange, error, placeholder = 'Type it here', typeLabel = 'Type my own' }) {
  const isCustom = !!value && !options.some((o) => o === value);
  const [typing, setTyping] = useState(isCustom);
  const showInput = typing || isCustom;
  const inputRef = useRef();
  return html`<div class=${`field ${error ? 'has-error' : ''}`}>
    ${label && html`<div class="label">${label}</div>`}
    <div class="chips">
      ${options.map((o) => html`<button type="button" class=${`chip ${o === value ? 'on' : ''}`}
        aria-pressed=${o === value} onClick=${() => { setTyping(false); onChange(o); }}>${o}</button>`)}
      <button type="button" class=${`chip chip-type ${showInput ? 'on' : ''}`} onClick=${() => {
        setTyping(true);
        if (!isCustom) onChange('');
        setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
      }}>✏️ ${typeLabel}</button>
    </div>
    ${showInput && html`<input ref=${inputRef} class="input" value=${isCustom ? value : ''} placeholder=${placeholder}
      autocomplete="off" autocapitalize="words" enterkeyhint="done" onInput=${(e) => onChange(e.target.value)} />`}
    <${FieldError} msg=${error} />
  </div>`;
}

export function Stepper({ value, onChange, error, label, unit }) {
  const n = num(value);
  return html`<div class=${`field ${error ? 'has-error' : ''}`}>
    ${label && html`<div class="label">${label}</div>`}
    <div class="stepper">
      <button type="button" class="step-btn" aria-label="One less" onClick=${() => onChange(Math.max(0, n - 1) || '')}>−</button>
      <input class="step-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="0" value=${value}
        aria-label=${label || 'How many'} enterkeyhint="done"
        onFocus=${(e) => e.target.select()}
        onInput=${(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
          if (digits !== e.target.value) e.target.value = digits;
          onChange(digits === '' ? '' : parseInt(digits, 10));
        }} />
      <button type="button" class="step-btn" aria-label="One more" onClick=${() => onChange(n + 1)}>+</button>
      ${unit && html`<span class="step-unit">${unit}</span>`}
    </div>
    <${FieldError} msg=${error} />
  </div>`;
}

// Big side-by-side answer buttons. options: [{value, label, sub?, kind?}]
export function BigChoice({ value, options, onChange, error, cols = 2 }) {
  return html`<div class=${`field ${error ? 'has-error' : ''}`}>
    <div class=${`big-choice cols-${cols}`}>
      ${options.map((o) => html`<button type="button" class=${`choice ${o.value === value ? 'on' : ''} ${o.kind || ''}`}
        aria-pressed=${o.value === value} onClick=${() => onChange(o.value)}>
        <span class="choice-label">${o.label}</span>
        ${o.sub && html`<small>${o.sub}</small>`}
      </button>`)}
    </div>
    <${FieldError} msg=${error} />
  </div>`;
}

export function YesNo({ value, onChange, error, yes = 'Yes', no = 'No' }) {
  return html`<${BigChoice} value=${value} onChange=${onChange} error=${error}
    options=${[{ value: false, label: no }, { value: true, label: yes }]} />`;
}

// Pick areas of the house (pulled from the drywall sections).
export function AreaChips({ c, selected, onChange, single = false, error, flag = () => '' }) {
  const sel = single ? (selected ? [selected] : []) : selected;
  const toggle = (id) => {
    if (single) onChange(id === selected ? null : id);
    else onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  return html`<div class=${`field ${error ? 'has-error' : ''}`}>
    <div class="chips">
      ${c.sections.map((s) => html`<button type="button" class=${`chip ${sel.includes(s.id) ? 'on' : ''}`}
        aria-pressed=${sel.includes(s.id)} onClick=${() => toggle(s.id)}>
        ${sel.includes(s.id) ? '✓ ' : ''}${s.name || '(unnamed)'}${flag(s) && html` <span class="chip-flag">${flag(s)}</span>`}
      </button>`)}
    </div>
    <${FieldError} msg=${error} />
  </div>`;
}

export function ActionBar({ children, hint }) {
  return html`<div class="action-bar"><div class="action-inner">
    ${hint && html`<div class="action-hint">${hint}</div>`}
    ${children}
  </div></div>`;
}

export function LockedBanner({ title, onEdit }) {
  return html`<div class="locked-banner">
    <div><b>✅ ${title} is complete.</b><br /><span>It’s locked so nothing changes by accident.</span></div>
    <button type="button" class="btn btn-secondary" onClick=${onEdit}>✏️ Change something here</button>
  </div>`;
}

export function SummaryList({ items }) {
  return html`<ul class="summary-list">${items.map((t) => html`<li>${t}</li>`)}</ul>`;
}

// Next number for a repeated name: "Bedroom" -> "Bedroom 2" -> "Bedroom 3"
export function uniqueName(c, base, exceptId = null) {
  const taken = new Set(c.sections.filter((s) => s.id !== exceptId).map((s) => norm(s.name)));
  if (!taken.has(norm(base))) return base;
  let i = 2;
  while (taken.has(norm(`${base} ${i}`))) i++;
  return `${base} ${i}`;
}
