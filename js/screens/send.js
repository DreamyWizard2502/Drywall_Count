import { html, useMemo } from '../lib.js';
import { app, go, current, updateCount, setUi, recipientName } from '../state.js';
import { toast, tell } from '../ui.js';
import { fmtDate, totalSheets } from '../model.js';
import { makePdfFile, shareText } from '../sheet.js';
import { t, tn } from '../i18n.js';
import { LangSwitch } from './home.js';

const canShareFile = (file) => {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
};

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// The share sheet has to open straight from the tap, so the PDF is made
// ahead of time (when this screen opens), never after the tap.
async function send(c, file, text) {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text });
    } catch (e) {
      if (e && e.name === 'AbortError') return toast(t('Not sent yet. Tap the blue button to try again.'));
      return fallback(c, file, text);
    }
    updateCount(c, (c) => (c.sentAt = Date.now()));
    return;
  }
  fallback(c, file, text);
}

// Phones/browsers that can't attach files: save the PDF, then open Messages with the text.
async function fallback(c, file, text) {
  download(file);
  await tell(
    t('Attach the PDF yourself'),
    html`<p>${t('This phone can’t attach the PDF automatically. It was saved as:')} <b>${file.name}</b></p>
      <p>${t('Messages will open with the text filled in. Tap ⊕ / the photo button to attach the PDF from Files.')}</p>`,
  );
  updateCount(c, (c) => (c.sentAt = Date.now()));
  window.location.href = `sms:&body=${encodeURIComponent(text)}`;
}

async function saveCopy(file) {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      /* closed the share sheet */
    }
  } else download(file);
}

export function SendScreen() {
  const c = current();
  if (!c) {
    setTimeout(() => go('home'));
    return null;
  }
  return html`<${Send} c=${c} key=${c.id} />`;
}

function Send({ c }) {
  const who = recipientName();
  const file = useMemo(() => makePdfFile(c, app.settings), [c.id, c.completedAt, c.updatedAt, JSON.stringify(app.settings)]);
  const text = shareText(c, app.settings);
  const sent = !!c.sentAt;

  return html`<main class="page send-page">
    <${LangSwitch} />
    <div class="done-hero">
      <div class="done-check">✅</div>
      <h1>${t('Count complete')}</h1>
      <p><b>${c.job.builder}</b><br />${c.job.address}</p>
      <p class="muted">${tn(totalSheets(c), '{n} sheet', '{n} sheets')} · ${tn(c.sections.length, '{n} area', '{n} areas')}</p>
      <p class="saved">${t('💾 Saved on this phone')}</p>
    </div>

    <div class="card msg-preview">
      <div class="label">${t('The text to {who} will have:', { who })}</div>
      <div class="attach">📄 ${file.name}</div>
      <div class="bubble">${text}</div>
    </div>

    <button type="button" class="btn btn-send" onClick=${() => send(c, file, text)}>
      📤 ${sent ? t('Send to {who} again', { who }) : t('Send to {who}', { who })}
    </button>
    ${!sent && html`<ol class="steps-help">
      <li>${t('Tap the blue “Send to {who}” button', { who })}</li>
      <li>${t('Tap “{who}” (or “Messages”) in the box that pops up', { who })}</li>
      <li>${t('Tap the blue arrow ↑ to send')}</li>
    </ol>`}

    ${sent && html`<div class="banner banner-ok"><b>${t('✓ Sent')}</b> ${fmtDate(c.sentAt)}</div>
      <button type="button" class="btn btn-primary big" onClick=${() => go('home')}>${t('Done — back to Home')}</button>`}

    <div class="send-links">
      <button type="button" class="btn btn-secondary" onClick=${() => setUi({ viewer: true })}>${t('📄 Look at the count sheet')}</button>
      <button type="button" class="btn btn-secondary" onClick=${() => saveCopy(file)}>${t('💾 Save a copy to Files')}</button>
    </div>
  </main>`;
}
