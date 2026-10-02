import { html } from '../lib.js';
import { update, errMap, showErrors, learn, choices, unlockStage, cancelStageEdit, openEdit, finishStageEdit } from '../state.js';
import {
  ask, toast, tripleVerify, navigate,
  ActionBar, ChoiceField, Stepper, FieldError, AreaChips, LockedBanner, SummaryList,
} from '../ui.js';
import { newScrew, screwIssues, screwRows, nextStage, nextLabel, clone, plural } from '../model.js';

async function setSupplier(c, who) {
  const sc = c.screws;
  if (who === sc.supplier) return;
  if (who === 'builder') {
    const yes = await ask({
      icon: '🏗️',
      title: 'Is the builder supplying ALL the screws?',
      body: html`<p>No screws will be on this order.</p><p><b>“SCREWS SUPPLIED BY BUILDER”</b> will be printed on the count sheet.</p>`,
      buttons: [
        { label: 'Yes, the builder is supplying them', value: true, kind: 'primary' },
        { label: 'No, we’re bringing screws', value: false, kind: 'secondary' },
      ],
    });
    if (!yes) {
      if (!sc.supplier) setSupplier(c, 'us');
      return;
    }
    update((c) => (c.screws.supplier = 'builder'));
    return;
  }
  update((c) => {
    c.screws.supplier = 'us';
    if (!c.screws.items.length) c.screws.items.push(newScrew());
  });
}

async function completeStage(c) {
  const issues = screwIssues(c);
  if (issues.length) {
    toast(issues[0].msg, { kind: 'bad' });
    return showErrors('screws');
  }
  const r = screwRows(c);
  const summary = r.builder
    ? html`<p class="big-warn">🏗️ The BUILDER is supplying the screws.</p>`
    : html`<${SummaryList} items=${r.rows.map((x) => `${plural(x.boxes, 'box', 'boxes')} of ${x.type}${x.reason ? ` — ${x.reason}` : ''}`)} />`;
  const ok = await tripleVerify({
    name: 'the screws',
    question: 'Are you sure the screws are complete?',
    summary,
    getNote: () => c.screws.note,
    setNote: (t) => update((c) => (c.screws.note = t)),
  });
  if (!ok) return;
  update((c) => {
    c.stages.screws = true;
    delete c.recheck.screws;
  });
  finishStageEdit();
  if (c.screws.supplier === 'us') c.screws.items.forEach((i) => learn('screwTypes', i.type));
  navigate(nextStage(c, 'screws'));
}

function ScrewItem({ c, it, i, errs }) {
  const items = c.screws.items;
  const remove = () => {
    const before = clone(items);
    update((c) => (c.screws.items = c.screws.items.filter((x) => x.id !== it.id)));
    toast('Screw type removed', { undo: () => update((c) => (c.screws.items = before)) });
  };
  return html`<div class="card">
    <div class="line-head">
      <b>${items.length > 1 ? `Screw type #${i + 1}` : 'Screws'}</b>
      ${i > 0 && html`<button type="button" class="link danger" onClick=${remove}>Remove</button>`}
    </div>
    <${ChoiceField} label="Screw type" value=${it.type} options=${choices('screwTypes')} error=${errs[`${it.id}:type`]}
      placeholder='e.g. 1-1/4" Self-Drilling' onChange=${(v) => update(() => (it.type = v))} />
    <${Stepper} label="How many boxes?" value=${it.boxes} unit="boxes" error=${errs[`${it.id}:boxes`]}
      onChange=${(v) => update(() => (it.boxes = v))} />
    ${i > 0 && html`<div class=${`why-box ${errs[`${it.id}:reason`] ? 'has-error' : ''}`}>
      <label class="label" for=${`why-${it.id}`}>Why is this different screw needed? <span class="req">Required</span></label>
      <textarea id=${`why-${it.id}`} class="input" rows="2" value=${it.reason} placeholder="e.g. Metal studs in the garage"
        onInput=${(e) => update(() => (it.reason = e.target.value))}></textarea>
      <${FieldError} msg=${errs[`${it.id}:reason`]} />
      <div class="label small">Which areas is it for? (optional)</div>
      <${AreaChips} c=${c} selected=${it.sectionIds} onChange=${(v) => update(() => (it.sectionIds = v))} />
    </div>`}
  </div>`;
}

export function ScrewsStage({ c }) {
  const sc = c.screws;
  const issues = screwIssues(c);
  const errs = errMap('screws', issues, !!c.recheck.screws || (c.stages.screws && issues.length > 0));
  const locked = c.stages.screws && !issues.length;
  const editing = openEdit(c);

  return html`
    <h1 class="stage-title">Screws</h1>
    ${locked && html`<${LockedBanner} title="Screws" onEdit=${() => unlockStage(c, 'screws')} />`}
    <fieldset class="fs" disabled=${locked}>
      <div class=${`card ${errs.supplier ? 'has-error' : ''}`}>
        <div class="q">Who is supplying the screws?</div>
        <div class="big-choice cols-1">
          <button type="button" class=${`choice ${sc.supplier === 'us' ? 'on' : ''}`} aria-pressed=${sc.supplier === 'us'}
            onClick=${() => setSupplier(c, 'us')}>
            <span class="choice-label">🔩 We are bringing the screws</span>
            <small>Pick the screw type and how many boxes</small>
          </button>
          <button type="button" class=${`choice warn ${sc.supplier === 'builder' ? 'on' : ''}`} aria-pressed=${sc.supplier === 'builder'}
            onClick=${() => setSupplier(c, 'builder')}>
            <span class="choice-label">🏗️ The BUILDER is supplying the screws</span>
            <small>No screws on this order</small>
          </button>
        </div>
        <${FieldError} msg=${errs.supplier} />
      </div>

      ${sc.supplier === 'builder' && html`<div class="banner banner-builder">
        <b>🏗️ BUILDER IS SUPPLYING THE SCREWS</b>
        <span>No screws will be ordered. This is printed in red on the count sheet.</span>
      </div>`}

      ${sc.supplier === 'us' && html`
        ${sc.items.map((it, i) => html`<${ScrewItem} key=${it.id} c=${c} it=${it} i=${i} errs=${errs} />`)}
        <button type="button" class="btn btn-secondary" onClick=${() => update((c) => c.screws.items.push(newScrew()))}>
          + Add a different screw type
        </button>
        <div class="hint center">Only add another type if part of the job needs a different screw (like metal studs).</div>
      `}
    </fieldset>

    <${ActionBar}>
      ${locked
        ? html`<button type="button" class="btn btn-primary big" onClick=${() => navigate(nextStage(c, 'screws'))}>
            ${nextLabel(c, 'screws')}</button>`
        : html`<button type="button" class="btn btn-success big" onClick=${() => completeStage(c)}>✅ Screws are complete</button>
            ${editing && html`<button type="button" class="btn btn-link" onClick=${() => cancelStageEdit(c)}>Cancel changes</button>`}`}
    <//>
  `;
}
