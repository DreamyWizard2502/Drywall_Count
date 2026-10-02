import { html } from '../lib.js';
import {
  app, go, createCount, openCount, installHintClosed, closeInstallHint, deleteCount, updateCount,
  saveSettings, forgetLearned, setLanguage, recipientName,
} from '../state.js';
import { ask, toast, BigChoice } from '../ui.js';
import { STAGES, stageDone, fmtDate } from '../model.js';
import { t, uiLang, LANGS } from '../i18n.js';

const sortedCounts = () => Object.values(app.counts).sort((a, b) => b.updatedAt - a.updatedAt);

/* ---------- language ---------- */

// First time the app opens: pick a language before anything else.
export function LanguagePicker() {
  return html`<main class="home lang-picker">
    <div class="home-top">
      <img class="home-logo" src="icons/icon-192.png" alt="" width="84" height="84" />
      <h1>Drywall Count</h1>
      <p class="lang-q">Choose your language<br />Elige tu idioma</p>
    </div>
    <button type="button" class="btn btn-lang" lang="en" onClick=${() => setLanguage('en', false)}>English</button>
    <button type="button" class="btn btn-lang" lang="es" onClick=${() => setLanguage('es', false)}>Español</button>
    <p class="muted center">You can change this any time with the 🌐 button.<br />Puedes cambiarlo cuando quieras con el botón 🌐.</p>
  </main>`;
}

// Both languages always visible; the one in use is filled in.
export function LangSwitch() {
  return html`<div class="lang-switch" role="group" aria-label="Language / Idioma">
    <span class="lang-globe" aria-hidden="true">🌐</span>
    ${Object.entries(LANGS).map(([code, name]) => html`<button type="button" lang=${code}
      class=${uiLang() === code ? 'on' : ''} aria-pressed=${uiLang() === code}
      onClick=${() => setLanguage(code)}>${name}</button>`)}
  </div>`;
}

// Small header button: shows the OTHER language, one tap switches.
export function LangButton() {
  const other = uiLang() === 'es' ? 'en' : 'es';
  return html`<button type="button" class="head-btn lang-btn" lang=${other} onClick=${() => setLanguage(other)}
    aria-label=${other === 'es' ? 'Cambiar a Español' : 'Switch to English'}>
    🌐<small>${other === 'es' ? 'Español' : 'English'}</small></button>`;
}

/* ---------- home ---------- */

function stepLabel(c) {
  const i = STAGES.findIndex((s) => !stageDone(c, s.key));
  const n = i < 0 ? STAGES.length - 1 : i;
  return t('Step {n} of {total}: {title}', { n: n + 1, total: STAGES.length, title: t(STAGES[n].title) });
}

async function startCount(draft) {
  if (draft) {
    const r = await ask({
      title: t('You have a count that isn’t finished'),
      body: html`<p><b>${draft.job.builder.trim() || t('(no builder yet)')}</b><br />${draft.job.address.trim()}</p>
        <p>${t('It stays saved in Past Counts either way.')}</p>`,
      buttons: [
        { label: t('Continue that count'), value: 'continue', kind: 'primary' },
        { label: t('Start a brand new count'), value: 'new', kind: 'secondary' },
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
    <${LangSwitch} />
    <div class="home-top">
      <img class="home-logo" src="icons/icon-192.png" alt="" width="84" height="84" />
      <h1>${t('Drywall Count')}</h1>
      ${!app.ui.online && html`<p class="offline-note">${t('No signal — that’s OK. Everything works and saves on this phone.')}</p>`}
    </div>

    ${unsent.map((c) => html`<div class="banner banner-warn" key=${c.id}>
      <div>⚠️ <b>${t('Not sent yet:')}</b> ${c.job.builder}<br /><small>${c.job.address}</small></div>
      <button type="button" class="btn btn-send" onClick=${() => openCount(c)}>${t('Send it now')}</button>
    </div>`)}

    ${draft && html`<button type="button" class="continue-card" onClick=${() => openCount(draft)}>
      <span class="continue-tag">${t('▶ CONTINUE COUNT')}</span>
      <b>${draft.job.builder.trim() || t('New count (no builder yet)')}</b>
      <span>${draft.job.address.trim()}</span>
      <small>${stepLabel(draft)} · ${t('saved {when}', { when: fmtDate(draft.updatedAt) })}</small>
    </button>`}

    <button type="button" class="btn btn-start" onClick=${() => startCount(draft)}>${t('START COUNT')}</button>

    <div class="home-links">
      <button type="button" class="btn btn-secondary" onClick=${() => go('past')}>${t('📁 Past Counts ({n})', { n: counts.length })}</button>
      <button type="button" class="btn btn-secondary" onClick=${() => go('settings')}>${t('⚙️ Settings')}</button>
    </div>

    ${isIos && !standalone && !installHintClosed() && html`<div class="install-hint">
      <b>${t('Put this app on your Home Screen')}</b> ${t('so it works with no signal:')}
      <ol><li>${t('Tap the Share button ⬆︎ at the bottom of Safari')}</li>
      <li>${t('Tap “Add to Home Screen”')}</li><li>${t('Open it from the new icon')}</li></ol>
      <button type="button" class="link" onClick=${closeInstallHint}>${t('Hide this')}</button>
    </div>`}
  </main>`;
}

export function SimpleHeader({ title }) {
  return html`<header class="simple-head">
    <button type="button" class="head-btn" onClick=${() => go('home')}>🏠<small>${t('Home')}</small></button>
    <h1>${title}</h1>
    <${LangButton} />
  </header>`;
}

function statusOf(c) {
  if (c.status !== 'complete') return { label: t('Not finished'), cls: 'st-draft' };
  if (!c.sentAt) return { label: t('Not sent'), cls: 'st-unsent' };
  return { label: t('Sent {when}', { when: fmtDate(c.sentAt, false) }), cls: 'st-sent' };
}

async function removeCount(c) {
  const yes = await ask({
    title: t('Delete this count forever?'),
    body: html`<p><b>${c.job.builder || t('(no builder)')}</b><br />${c.job.address}</p><p>${t('This can’t be undone.')}</p>`,
    buttons: [
      { label: t('No, keep it'), value: false, kind: 'primary' },
      { label: t('Yes, delete it forever'), value: true, kind: 'danger' },
    ],
  });
  if (!yes) return;
  deleteCount(c.id);
  toast(t('Count deleted'));
}

async function reopen(c) {
  const yes = await ask({
    title: t('Reopen this count to make changes?'),
    body: t('When you’re done you’ll complete it and send the new sheet again.'),
    buttons: [
      { label: t('Yes, reopen it'), value: true, kind: 'primary' },
      { label: t('No'), value: false, kind: 'secondary' },
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
  return html`<${SimpleHeader} title=${t('Past Counts')} />
  <main class="page">
    ${!counts.length && html`<p class="empty">${t('No counts yet. Tap Home, then START COUNT.')}</p>`}
    ${counts.map((c) => {
      const st = statusOf(c);
      return html`<div class="card past-item" key=${c.id}>
        <div class="past-top">
          <div class="past-main">
            <b>${c.job.builder.trim() || t('(no builder yet)')}</b>
            <span>${c.job.address.trim()}</span>
            <small>${t('Started {when}', { when: fmtDate(c.createdAt) })}</small>
          </div>
          <span class=${`status ${st.cls}`}>${st.label}</span>
        </div>
        <div class="past-actions">
          ${c.status === 'complete'
            ? html`<button type="button" class="btn btn-primary" onClick=${() => openCount(c)}>${t('📄 Open / Send')}</button>
                <button type="button" class="btn btn-secondary" onClick=${() => reopen(c)}>${t('✏️ Reopen to change')}</button>`
            : html`<button type="button" class="btn btn-primary" onClick=${() => openCount(c)}>${t('▶ Continue')}</button>`}
          <button type="button" class="btn btn-danger-outline" onClick=${() => removeCount(c)}>${t('🗑 Delete')}</button>
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
  return html`<${SimpleHeader} title=${t('Settings')} />
  <main class="page">
    <div class="card">
      <div class="label">${t('App language')}</div>
      <${LangSwitch} />
    </div>
    <div class="card">
      <div class="label">${t('Count sheet & text message language')}</div>
      <div class="hint">${t('The language {who} gets. Switching the app language does not change this.', { who: recipientName() })}</div>
      <${BigChoice} value=${s.sheetLang || 'en'} onChange=${(v) => { s.sheetLang = v; saveSettings(); }}
        options=${Object.entries(LANGS).map(([value, label]) => ({ value, label }))} />
    </div>
    <div class="card">
      <label class="label" for="set-recipient">${t('Who gets the counts?')}</label>
      <input id="set-recipient" class="input" value=${s.recipient} onInput=${set('recipient')} placeholder=${t('Mom')} autocapitalize="words" />
      <div class="hint">${t('Shown on the big blue button: “Send to {who}”.', { who: recipientName() })}</div>
    </div>
    <div class="card">
      <label class="label" for="set-counter">${t('Your name (optional)')}</label>
      <input id="set-counter" class="input" value=${s.counter} onInput=${set('counter')} placeholder=${t('e.g. Dad')} autocapitalize="words" />
      <div class="hint">${t('Printed on the count sheet as “Counted by”.')}</div>
    </div>
    <div class="card">
      <label class="label" for="set-company">${t('Company name (optional)')}</label>
      <input id="set-company" class="input" value=${s.company} onInput=${set('company')} placeholder=${t('e.g. Smith Drywall')} autocapitalize="words" />
      <div class="hint">${t('Printed at the top of the count sheet.')}</div>
    </div>
    <div class="card">
      <div class="label">${t('Typed-in choices')}</div>
      <div class="hint">${t('Anything you type that isn’t on a list is remembered as a quick-tap choice for next time.')}</div>
      <button type="button" class="btn btn-secondary" onClick=${async () => {
        const yes = await ask({
          title: t('Forget the remembered choices?'),
          body: t('The built-in choices stay. Saved counts are not touched.'),
          buttons: [{ label: t('Yes, forget them'), value: true, kind: 'danger' }, { label: t('No'), value: false, kind: 'secondary' }],
        });
        if (yes) { forgetLearned(); toast(t('Remembered choices cleared')); }
      }}>${t('Forget remembered choices')}</button>
    </div>
    <p class="muted center small">${t('Counts are saved on this phone only. Drywall Count works with no signal.')}</p>
  </main>`;
}
