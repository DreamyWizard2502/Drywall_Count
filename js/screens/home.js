import { html } from '../lib.js';
import {
  app, go, createCount, openCount, installHintClosed, closeInstallHint, deleteCount, updateCount,
  saveSettings, forgetLearned,
} from '../state.js';
import { ask, toast } from '../ui.js';
import { STAGES, stageDone, fmtDate } from '../model.js';

const sortedCounts = () => Object.values(app.counts).sort((a, b) => b.updatedAt - a.updatedAt);

function stepLabel(c) {
  const i = STAGES.findIndex((s) => !stageDone(c, s.key));
  const st = STAGES[i < 0 ? STAGES.length - 1 : i];
  return `Step ${(i < 0 ? STAGES.length - 1 : i) + 1} of ${STAGES.length}: ${st.title}`;
}

async function startCount(draft) {
  if (draft) {
    const r = await ask({
      title: 'You have a count that isn’t finished',
      body: html`<p><b>${draft.job.builder.trim() || '(no builder yet)'}</b><br />${draft.job.address.trim()}</p>
        <p>It stays saved in Past Counts either way.</p>`,
      buttons: [
        { label: 'Continue that count', value: 'continue', kind: 'primary' },
        { label: 'Start a brand new count', value: 'new', kind: 'secondary' },
      ],
    });
    if (r === 'continue') return openCount(draft);
    if (r !== 'new') return;
  }
  const c = createCount();
  go('flow', { countId: c.id, stage: 'job', snap: null });
}

export function Home() {
  const counts = sortedCounts();
  const draft = counts.find((c) => c.status !== 'complete');
  const unsent = counts.filter((c) => c.status === 'complete' && !c.sentAt);
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  return html`<main class="home">
    <div class="home-top">
      <img class="home-logo" src="icons/icon-192.png" alt="" width="84" height="84" />
      <h1>Drywall Count</h1>
      ${!app.ui.online && html`<p class="offline-note">No signal — that’s OK. Everything works and saves on this phone.</p>`}
    </div>

    ${unsent.map((c) => html`<div class="banner banner-warn" key=${c.id}>
      <div>⚠️ <b>Not sent yet:</b> ${c.job.builder}<br /><small>${c.job.address}</small></div>
      <button type="button" class="btn btn-send" onClick=${() => openCount(c)}>Send it now</button>
    </div>`)}

    ${draft && html`<button type="button" class="continue-card" onClick=${() => openCount(draft)}>
      <span class="continue-tag">▶ CONTINUE COUNT</span>
      <b>${draft.job.builder.trim() || 'New count (no builder yet)'}</b>
      <span>${draft.job.address.trim()}</span>
      <small>${stepLabel(draft)} · saved ${fmtDate(draft.updatedAt)}</small>
    </button>`}

    <button type="button" class="btn btn-start" onClick=${() => startCount(draft)}>START COUNT</button>

    <div class="home-links">
      <button type="button" class="btn btn-secondary" onClick=${() => go('past')}>📁 Past Counts (${counts.length})</button>
      <button type="button" class="btn btn-secondary" onClick=${() => go('settings')}>⚙️ Settings</button>
    </div>

    ${isIos && !standalone && !installHintClosed() && html`<div class="install-hint">
      <b>Put this app on your Home Screen</b> so it works with no signal:
      <ol><li>Tap the Share button <span class="share-glyph">⬆︎</span> at the bottom of Safari</li>
      <li>Tap <b>Add to Home Screen</b></li><li>Open it from the new icon</li></ol>
      <button type="button" class="link" onClick=${closeInstallHint}>Hide this</button>
    </div>`}
  </main>`;
}

function SimpleHeader({ title }) {
  return html`<header class="simple-head">
    <button type="button" class="head-btn" onClick=${() => go('home')}>🏠<small>Home</small></button>
    <h1>${title}</h1>
  </header>`;
}

function statusOf(c) {
  if (c.status !== 'complete') return { label: 'Not finished', cls: 'st-draft' };
  if (!c.sentAt) return { label: 'Not sent', cls: 'st-unsent' };
  return { label: `Sent ${fmtDate(c.sentAt, false)}`, cls: 'st-sent' };
}

async function removeCount(c) {
  const yes = await ask({
    title: 'Delete this count forever?',
    body: html`<p><b>${c.job.builder || '(no builder)'}</b><br />${c.job.address}</p><p>This can’t be undone.</p>`,
    buttons: [
      { label: 'No, keep it', value: false, kind: 'primary' },
      { label: 'Yes, delete it forever', value: true, kind: 'danger' },
    ],
  });
  if (!yes) return;
  deleteCount(c.id);
  toast('Count deleted');
}

async function reopen(c) {
  const yes = await ask({
    title: 'Reopen this count to make changes?',
    body: 'When you’re done you’ll complete it and send the new sheet again.',
    buttons: [
      { label: 'Yes, reopen it', value: true, kind: 'primary' },
      { label: 'No', value: false, kind: 'secondary' },
    ],
  });
  if (!yes) return;
  updateCount(c, (c) => {
    c.status = 'draft';
    c.completedAt = null;
    c.sentAt = null;
  });
  go('flow', { countId: c.id, stage: 'review', snap: null });
}

export function Past() {
  const counts = sortedCounts();
  return html`<${SimpleHeader} title="Past Counts" />
  <main class="page">
    ${!counts.length && html`<p class="empty">No counts yet. Tap Home, then START COUNT.</p>`}
    ${counts.map((c) => {
      const st = statusOf(c);
      return html`<div class="card past-item" key=${c.id}>
        <div class="past-top">
          <div class="past-main">
            <b>${c.job.builder.trim() || '(no builder yet)'}</b>
            <span>${c.job.address.trim()}</span>
            <small>Started ${fmtDate(c.createdAt)}</small>
          </div>
          <span class=${`status ${st.cls}`}>${st.label}</span>
        </div>
        <div class="past-actions">
          ${c.status === 'complete'
            ? html`<button type="button" class="btn btn-primary" onClick=${() => openCount(c)}>📄 Open / Send</button>
                <button type="button" class="btn btn-secondary" onClick=${() => reopen(c)}>✏️ Reopen to change</button>`
            : html`<button type="button" class="btn btn-primary" onClick=${() => openCount(c)}>▶ Continue</button>`}
          <button type="button" class="btn btn-danger-outline" onClick=${() => removeCount(c)}>🗑 Delete</button>
        </div>
      </div>`;
    })}
  </main>`;
}

export function Settings() {
  const s = app.settings;
  const set = (k) => (e) => {
    s[k] = e.target.value;
    saveSettings();
  };
  return html`<${SimpleHeader} title="Settings" />
  <main class="page">
    <div class="card">
      <label class="label" for="set-recipient">Who gets the counts?</label>
      <input id="set-recipient" class="input" value=${s.recipient} onInput=${set('recipient')} placeholder="Mom" autocapitalize="words" />
      <div class="hint">Shown on the big blue button: “Send to ${s.recipient.trim() || 'Mom'}”.</div>
    </div>
    <div class="card">
      <label class="label" for="set-counter">Your name (optional)</label>
      <input id="set-counter" class="input" value=${s.counter} onInput=${set('counter')} placeholder="e.g. Dad" autocapitalize="words" />
      <div class="hint">Printed on the count sheet as “Counted by”.</div>
    </div>
    <div class="card">
      <label class="label" for="set-company">Company name (optional)</label>
      <input id="set-company" class="input" value=${s.company} onInput=${set('company')} placeholder="e.g. Smith Drywall" autocapitalize="words" />
      <div class="hint">Printed at the top of the count sheet.</div>
    </div>
    <div class="card">
      <div class="label">Typed-in choices</div>
      <div class="hint">Anything you type that isn’t on a list is remembered as a quick-tap choice for next time.</div>
      <button type="button" class="btn btn-secondary" onClick=${async () => {
        const yes = await ask({ title: 'Forget the remembered choices?', body: 'The built-in choices stay. Saved counts are not touched.', buttons: [{ label: 'Yes, forget them', value: true, kind: 'danger' }, { label: 'No', value: false, kind: 'secondary' }] });
        if (yes) { forgetLearned(); toast('Remembered choices cleared'); }
      }}>Forget remembered choices</button>
    </div>
    <p class="muted center small">Counts are saved on this phone only. Drywall Count works with no signal.</p>
  </main>`;
}
