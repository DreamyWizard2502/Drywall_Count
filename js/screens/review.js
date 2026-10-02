import { html, useMemo, useState, useEffect, useRef } from '../lib.js';
import { app, update, go, setUi, learn, current, recipientName } from '../state.js';
import { ask, navigate, ActionBar } from '../ui.js';
import { STAGES, WORK_STAGES, stageDone, stageIssues, allDone } from '../model.js';
import { buildSheet, drawSheet } from '../sheet.js';
import { t, uiLang } from '../i18n.js';

// When he works in one language and the sheet is in the other, say so.
function sheetLangNote() {
  const sl = app.settings.sheetLang || 'en';
  if (sl === uiLang()) return '';
  return sl === 'en' ? t('(The sheet is in English.)') : t('(The sheet is in Spanish.)');
}

export function useSheet(c) {
  return useMemo(() => buildSheet(c, app.settings), [c, c.updatedAt, c.status, JSON.stringify(app.settings)]);
}

export function SheetCanvas({ sheet, k = 2.2, onClick }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) drawSheet(ref.current, sheet, k);
  }, [sheet, k]);
  return html`<canvas ref=${ref} class=${`sheet-canvas ${onClick ? 'tappable' : ''}`} role="img"
    aria-label="Count sheet" onClick=${onClick}></canvas>`;
}

// Full-screen, read-only look at the sheet. Available from every screen.
export function SheetViewer() {
  const c = current();
  if (!app.ui.viewer || !c) return null;
  return html`<${Viewer} c=${c} />`;
}

function Viewer({ c }) {
  const sheet = useSheet(c);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);
  return html`<div class="viewer" role="dialog" aria-label="Count sheet">
    <div class="viewer-bar">
      <button type="button" class="btn btn-secondary" onClick=${() => setUi({ viewer: false })}>${t('✕ Close')}</button>
      <span class="viewer-title">${t('Count Sheet')}</span>
      <div class="zoom">
        <button type="button" aria-label=${t('Zoom out')} disabled=${zoom <= 1} onClick=${() => setZoom(Math.max(1, zoom - 0.75))}>−</button>
        <button type="button" aria-label=${t('Zoom in')} disabled=${zoom >= 3} onClick=${() => setZoom(Math.min(3, zoom + 0.75))}>+</button>
      </div>
    </div>
    <div class="viewer-body">
      <div class="viewer-page" style=${`width:${zoom * 100}%`}><${SheetCanvas} sheet=${sheet} k=${3.4} /></div>
      <p class="viewer-note">${t('This sheet fills itself in as you go. You can’t type on it — to change something, close this and use the screens.')}</p>
    </div>
  </div>`;
}

async function chooseStage(c) {
  const pick = await ask({
    title: t('What do you need to change?'),
    buttons: [
      ...WORK_STAGES.map((k) => ({ label: t(STAGES.find((s) => s.key === k).title), value: k, kind: 'secondary' })),
      { label: t('Never mind'), value: null, kind: 'link' },
    ],
  });
  if (pick) navigate(pick);
}

async function completeCount(c) {
  const yes = await ask({
    icon: '📄',
    title: t('Complete this count?'),
    body: t('Make sure everything on the sheet is right. Next, you’ll send it to {who}.', { who: recipientName() }),
    buttons: [
      { label: t('Yes, complete the count'), value: true, kind: 'success' },
      { label: t('Not yet'), value: false, kind: 'secondary' },
    ],
  });
  if (!yes) return;
  update((c) => {
    c.status = 'complete';
    c.completedAt = Date.now();
  });
  learn('builders', c.job.builder);
  go('send', { countId: c.id });
}

export function ReviewStage({ c }) {
  const sheet = useSheet(c);
  const ok = allDone(c);
  const broken = WORK_STAGES.filter((k) => !stageDone(c, k));
  return html`
    <h1 class="stage-title">${t('Count Sheet')}</h1>
    <p class="stage-sub">${t('This is exactly what {who} will get. Tap it to zoom in.', { who: recipientName() })}
      ${sheetLangNote()}</p>
    ${!ok && html`<div class="banner banner-bad">
      <b>${t('Something needs fixing before you can finish:')}</b>
      ${broken.map((k) => html`<button type="button" class="btn btn-secondary" onClick=${() => navigate(k)}>
        ${t('Fix {title}', { title: t(STAGES.find((s) => s.key === k).title) })}${stageIssues(c, k)[0] ? `: ${stageIssues(c, k)[0].msg}` : ''}</button>`)}
    </div>`}
    <div class="sheet-wrap"><${SheetCanvas} sheet=${sheet} onClick=${() => setUi({ viewer: true })} /></div>
    <button type="button" class="btn btn-secondary big" onClick=${() => chooseStage(c)}>${t('✏️ Go back and change something')}</button>
    <${ActionBar}>
      <button type="button" class=${`btn btn-success big ${ok ? '' : 'is-disabled'}`} aria-disabled=${!ok}
        onClick=${() => ok && completeCount(c)}>${t('✅ Complete Count')}</button>
    <//>
  `;
}
