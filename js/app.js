import { html } from './lib.js';
import { app, mount, loadAll, current, go, setUi, flush } from './state.js';
import { DialogHost, ToastHost, navigate, toast } from './ui.js';
import { STAGES, stageDone, reachable, firstOpenStage } from './model.js';
import { Home, Past, Settings } from './screens/home.js';
import { JobStage } from './screens/job.js';
import { DrywallStage } from './screens/drywall.js';
import { ScrewsStage } from './screens/screws.js';
import { SiteStage } from './screens/site.js';
import { ReviewStage, SheetViewer } from './screens/review.js';
import { SendScreen } from './screens/send.js';

const STAGE_SCREENS = { job: JobStage, drywall: DrywallStage, screws: ScrewsStage, site: SiteStage, review: ReviewStage };

function FlowHeader({ c, stage }) {
  return html`<header class="flow-head">
    <div class="head-row">
      <button type="button" class="head-btn" onClick=${() => {
        flush();
        go('home');
        toast('Saved. Tap “Continue count” to pick up where you left off.');
      }}>🏠<small>Home</small></button>
      <div class="head-title">
        <b>${c.job.builder.trim() || 'New Count'}</b>
        <span>${c.job.address.trim()}</span>
      </div>
      <button type="button" class="head-btn" onClick=${() => setUi({ viewer: true })}>📄<small>Sheet</small></button>
    </div>
    <nav class="steps" aria-label="Steps">
      ${STAGES.map((st, i) => {
        const done = st.key !== 'review' && stageDone(c, st.key);
        const can = reachable(c, st.key);
        return html`<button type="button" class=${`step ${st.key === stage ? 'cur' : ''} ${done ? 'done' : ''}`}
          disabled=${!can} aria-current=${st.key === stage ? 'step' : null} onClick=${() => st.key !== stage && navigate(st.key)}>
          <span class="step-dot">${done ? '✓' : i + 1}</span>
          <span class="step-label">${st.label}</span>
        </button>`;
      })}
    </nav>
    ${!app.ui.online && html`<div class="offline-pill">No signal — that’s OK. Everything saves on this phone.</div>`}
  </header>`;
}

function Flow() {
  const c = current();
  if (!c) {
    setTimeout(() => go('home'));
    return null;
  }
  if (c.status === 'complete') {
    setTimeout(() => go('send'));
    return null;
  }
  // Never show a stage he hasn't unlocked yet.
  if (!STAGE_SCREENS[app.ui.stage] || !reachable(c, app.ui.stage)) app.ui.stage = firstOpenStage(c);
  const stage = app.ui.stage;
  const Screen = STAGE_SCREENS[stage];
  return html`<${FlowHeader} c=${c} stage=${stage} />
    <main class="page has-action-bar"><${Screen} key=${c.id + stage} c=${c} /></main>`;
}

function Root() {
  const s = app.ui.screen;
  const screen =
    s === 'flow' ? html`<${Flow} />`
    : s === 'send' ? html`<${SendScreen} />`
    : s === 'past' ? html`<${Past} />`
    : s === 'settings' ? html`<${Settings} />`
    : html`<${Home} />`;
  return html`${screen}<${SheetViewer} /><${DialogHost} /><${ToastHost} />`;
}

loadAll();
mount(document.getElementById('app'), Root);

// Ask the phone not to clear our saved counts when space is low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
