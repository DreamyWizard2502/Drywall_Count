import { html } from '../lib.js';
import { update, errMap, showErrors, learn, choices, unlockStage, cancelStageEdit, openEdit, finishStageEdit } from '../state.js';
import {
  ask, toast, tripleVerify, navigate,
  ActionBar, ChoiceField, Stepper, FieldError, AreaChips, LockedBanner, SummaryList, BigChoice, YesNo,
} from '../ui.js';
import { STANDARD_CEILINGS, SCAFFOLD_OVER_FT } from '../choices.js';
import {
  newScaffold, newFeature, siteIssues, siteRows, tallAreas, fmtFt, SITE_CARDS, clone, nextStage,
} from '../model.js';
import { t, tv } from '../i18n.js';

function Card({ n, card, issues, children }) {
  const open = issues.filter((i) => i.card === card.key);
  return html`<section class=${`card qcard ${open.length ? '' : 'answered'}`} id=${`card-${card.key}`}>
    <div class="qcard-head">
      <span class="qnum">${open.length ? n : '✓'}</span>
      <h2>${t(card.title)}</h2>
    </div>
    ${children}
  </section>`;
}

function removeWithUndo(label, get, set) {
  return (id) => {
    const before = clone(get());
    update(() => set(get().filter((x) => x.id !== id)));
    toast(t('{thing} removed', { thing: label }), { undo: () => update(() => set(before)) });
  };
}

/* 1. ceiling height */
function CeilingCard({ c, errs }) {
  const ce = c.site.ceiling;
  const toggle = (id) => update(() => {
    if (ce.special[id] !== undefined) delete ce.special[id];
    else ce.special[id] = '';
  });
  return html`
    <div class="q">${t('What is the standard ceiling height?')}</div>
    <${BigChoice} cols=${4} value=${ce.standard} error=${errs['ceiling.standard']}
      options=${[...STANDARD_CEILINGS.map((v) => ({ value: v, label: fmtFt(v) })), { value: 'other', label: t('Other') }]}
      onChange=${(v) => update(() => (ce.standard = v))} />
    ${ce.standard === 'other' && html`<div class=${`field ${errs['ceiling.standardOther'] ? 'has-error' : ''}`}>
      <div class="inline-input">
        <input class="input" inputmode="decimal" placeholder=${t('Height, e.g. 12')} value=${ce.standardOther}
          onInput=${(e) => update(() => (ce.standardOther = e.target.value))} /><span>${t('ft')}</span>
      </div>
      <${FieldError} msg=${errs['ceiling.standardOther']} />
    </div>`}

    <div class="q">${t('Do any areas have a special ceiling height?')}</div>
    <div class="hint">${t('Like a tall foyer, a vaulted great room, or a two-story ceiling.')}</div>
    <${YesNo} value=${ce.hasSpecial} error=${errs['ceiling.hasSpecial']} onChange=${(v) => update(() => (ce.hasSpecial = v))} />
    ${ce.hasSpecial === true && html`<div class=${`field ${errs['ceiling.special'] ? 'has-error' : ''}`}>
      <div class="label">${t('Tap each area with a special height, then type the height:')}</div>
      <div class="area-rows">
        ${c.sections.map((s) => {
          const on = ce.special[s.id] !== undefined;
          const err = errs[`ceiling.special.${s.id}`];
          return html`<div class=${`area-row ${on ? 'on' : ''}`} key=${s.id}>
            <button type="button" class=${`chip ${on ? 'on' : ''}`} aria-pressed=${on} onClick=${() => toggle(s.id)}>${on ? '✓ ' : ''}${tv(s.name)}</button>
            ${on && html`<div class="inline-input">
              <input class=${`input ${err ? 'err' : ''}`} inputmode="decimal" placeholder=${t('Height')} value=${ce.special[s.id]}
                aria-label=${t('Ceiling height for {name}', { name: tv(s.name) })} onInput=${(e) => update(() => (ce.special[s.id] = e.target.value))} /><span>${t('ft')}</span>
            </div>`}
          </div>`;
        })}
      </div>
      <${FieldError} msg=${errs['ceiling.special'] || Object.entries(errs).find(([k]) => k.startsWith('ceiling.special.'))?.[1]} />
    </div>`}
  `;
}

/* 2. scaffolding */
function ScaffoldCard({ c, errs }) {
  const sf = c.site.scaffold;
  const tall = tallAreas(c);
  const tallIds = new Set(tall.map((a) => a.id));
  const setNeeded = async (v) => {
    if (v === false && tall.length) {
      const sure = await ask({
        icon: '⚠️',
        title: t('No scaffolding — are you sure?'),
        body: html`<p>${t('These have ceilings over {h}:', { h: fmtFt(SCAFFOLD_OVER_FT) })}</p>
          <${SummaryList} items=${tall.map((a) => `${tv(a.name)}: ${fmtFt(a.height)}`)} />`,
        buttons: [
          { label: t('Oops — we need scaffolding'), value: false, kind: 'primary' },
          { label: t('Yes, I’m sure. No scaffolding.'), value: true, kind: 'secondary' },
        ],
      });
      if (!sure) v = true;
    }
    update(() => {
      sf.needed = v;
      if (v && !sf.items.length) sf.items.push(newScaffold());
    });
  };
  const remove = removeWithUndo(t('Scaffold'), () => sf.items, (v) => (sf.items = v));
  return html`
    ${tall.length > 0
      ? html`<div class="banner banner-warn">⚠️ <b>${t('Tall ceilings:')}</b> ${tall.map((a) => `${tv(a.name)} (${fmtFt(a.height)})`).join(', ')}
          <br /><small>${t('Over {h} usually needs scaffolding.', { h: fmtFt(SCAFFOLD_OVER_FT) })}</small></div>`
      : html`<div class="hint">${t('Standard 8, 9 and 10 ft ceilings usually don’t need scaffolding.')}</div>`}
    <div class="q">${t('Will scaffolding be needed?')}</div>
    <${YesNo} value=${sf.needed} error=${errs['scaffold.needed']} onChange=${setNeeded} />
    ${sf.needed === true && html`
      ${sf.items.map((it, i) => html`<div class="subcard" key=${it.id}>
        <div class="line-head">
          <b>${sf.items.length > 1 ? t('Scaffold #{n}', { n: i + 1 }) : t('Scaffold')}</b>
          ${sf.items.length > 1 && html`<button type="button" class="link danger" onClick=${() => remove(it.id)}>${t('Remove')}</button>`}
        </div>
        <div class="label">${t('What kind?')}</div>
        <${BigChoice} cols=${1} value=${it.kind} error=${errs[`${it.id}:kind`]} onChange=${(v) => update(() => (it.kind = v))}
          options=${[
            { value: 'stack', label: t('🏗️ Stackable scaffolding'), sub: t('Counted in sections') },
            { value: 'pony', label: t('🪜 Pony scaffold'), sub: t('The short, skinny one') },
          ]} />
        ${it.kind && html`<${Stepper} label=${it.kind === 'stack' ? t('How many sections?') : t('How many pony scaffolds?')}
          value=${it.qty} error=${errs[`${it.id}:qty`]} onChange=${(v) => update(() => (it.qty = v))} />`}
        <div class="label">${t('Why? Which areas need it?')} <span class="req">${t('Required')}</span></div>
        <${AreaChips} c=${c} selected=${it.sectionIds} error=${errs[`${it.id}:areas`]}
          flag=${(s) => (tallIds.has(s.id) ? t('⬆ tall') : '')} onChange=${(v) => update(() => (it.sectionIds = v))} />
        <label class="label small" for=${`sr-${it.id}`}>${t('Anything else about why? (optional)')}</label>
        <input id=${`sr-${it.id}`} class="input" value=${it.reason} placeholder=${t('e.g. Over the stairs')}
          onInput=${(e) => update(() => (it.reason = e.target.value))} />
      </div>`)}
      <button type="button" class="btn btn-secondary" onClick=${() => update(() => sf.items.push(newScaffold()))}>${t('+ Add another kind of scaffold')}</button>
    `}
  `;
}

/* 3 + 4. power and water */
function WhoCard({ q, value, onHas, by, onBy, errHas, errBy, whoQ, options }) {
  return html`
    <div class="q">${q}</div>
    <${YesNo} value=${value} error=${errHas} onChange=${onHas} />
    ${value === false && html`<div class="q">${whoQ}</div>
      <${BigChoice} cols=${1} value=${by} error=${errBy} onChange=${onBy} options=${options} />`}
  `;
}

/* 5. special features */
function FeaturesCard({ c, errs }) {
  const fe = c.site.features;
  const remove = removeWithUndo(t('Special feature'), () => fe.items, (v) => (fe.items = v));
  return html`
    <div class="q">${t('Any special features?')}</div>
    <div class="hint">${t('Like a rotunda, a dome on the ceiling, or a curved wall in the foyer.')}</div>
    <${YesNo} value=${fe.has} error=${errs['features.has']} onChange=${(v) => update(() => {
      fe.has = v;
      if (v && !fe.items.length) fe.items.push(newFeature());
    })} />
    ${fe.has === true && html`
      ${fe.items.map((f, i) => html`<div class="subcard" key=${f.id}>
        <div class="line-head">
          <b>${fe.items.length > 1 ? t('Special feature #{n}', { n: i + 1 }) : t('Special feature')}</b>
          ${fe.items.length > 1 && html`<button type="button" class="link danger" onClick=${() => remove(f.id)}>${t('Remove')}</button>`}
        </div>
        <${ChoiceField} label=${t('What is it?')} value=${f.name} options=${choices('features')} error=${errs[`${f.id}:name`]}
          placeholder=${t('Type the feature')} onChange=${(v) => update(() => (f.name = v))} />
        <div class="label">${t('Where is it?')} <span class="req">${t('Required')}</span></div>
        <${AreaChips} c=${c} single=${true} selected=${f.sectionId} error=${errs[`${f.id}:area`]}
          onChange=${(v) => update(() => (f.sectionId = v))} />
        <label class="label small" for=${`fn-${f.id}`}>${t('Details (optional)')}</label>
        <input id=${`fn-${f.id}`} class="input" value=${f.note} placeholder=${t('e.g. 14 ft across')}
          onInput=${(e) => update(() => (f.note = e.target.value))} />
      </div>`)}
      <button type="button" class="btn btn-secondary" onClick=${() => update(() => fe.items.push(newFeature()))}>${t('+ Add another special feature')}</button>
    `}
  `;
}

/* 6. bullnose & windows */
function TrimCard({ c, errs }) {
  const st = c.site;
  return html`
    <div class="q">${t('Will bullnose corners be required?')}</div>
    <${YesNo} value=${st.bullnose.needed} error=${errs['bullnose.needed']} onChange=${(v) => update(() => (st.bullnose.needed = v))} />
    <div class="q">${t('Are they wrapping the windows in drywall?')}</div>
    <${YesNo} value=${st.windowWrap.needed} error=${errs['windowWrap.needed']} onChange=${(v) => update(() => (st.windowWrap.needed = v))} />
    ${st.windowWrap.needed === true && html`<${Stepper} label=${t('How many windows? (optional)')} unit=${t('windows')}
      value=${st.windowWrap.count} onChange=${(v) => update(() => (st.windowWrap.count = v))} />`}
  `;
}

/* 7. pre-rock */
function PrerockCard({ c, errs }) {
  const pr = c.site.prerock;
  return html`
    <div class="q">${t('Does any area need pre-rock?')}</div>
    <div class="hint">${t('Pre-rock = hanging drywall BEFORE the spray foam, so the foam has something to stick to. Like a soundproof room, a ceiling, or the garage.')}</div>
    <${YesNo} value=${pr.needed} error=${errs['prerock.needed']} onChange=${(v) => update(() => (pr.needed = v))} />
    ${pr.needed === true && html`
      <div class="label">${t('Which areas?')} <span class="req">${t('Required')}</span></div>
      <${AreaChips} c=${c} selected=${pr.sectionIds} error=${errs['prerock.areas']} onChange=${(v) => update(() => (pr.sectionIds = v))} />
      <label class="label small" for="pr-other">${t('Another area not on the list? (optional)')}</label>
      <input id="pr-other" class="input" value=${pr.other} placeholder=${t('e.g. Garage ceiling')}
        onInput=${(e) => update(() => (pr.other = e.target.value))} />
    `}
  `;
}

async function completeStage(c) {
  const issues = siteIssues(c);
  if (issues.length) {
    toast(issues[0].msg, { kind: 'bad' });
    return showErrors('site');
  }
  const ok = await tripleVerify({
    name: t('the job site check'),
    question: t('Are you sure the job site check is complete?'),
    summary: html`<${SummaryList} items=${siteRows(c).map((r) => `${r.label}: ${r.lines.join('; ')}`)} />`,
    getNote: () => c.site.note,
    setNote: (note) => update((c) => (c.site.note = note)),
  });
  if (!ok) return;
  update((c) => {
    c.stages.site = true;
    delete c.recheck.site;
  });
  finishStageEdit();
  c.site.features.items.forEach((f) => learn('features', f.name));
  navigate('review');
}

export function SiteStage({ c }) {
  const issues = siteIssues(c);
  const recheck = !!c.recheck.site; // an area it pointed at was deleted
  const errs = errMap('site', issues, recheck || (c.stages.site && issues.length > 0));
  const locked = c.stages.site && !issues.length;
  const editing = openEdit(c);
  const answered = SITE_CARDS.filter((k) => !issues.some((i) => i.card === k.key)).length;
  const st = c.site;
  const cards = {
    ceiling: html`<${CeilingCard} c=${c} errs=${errs} />`,
    scaffold: html`<${ScaffoldCard} c=${c} errs=${errs} />`,
    power: html`<${WhoCard} q=${t('Does the house have electricity?')} value=${st.power.has} by=${st.power.by}
      errHas=${errs['power.has']} errBy=${errs['power.by']} whoQ=${t('Who is supplying the power?')}
      onHas=${(v) => update(() => { st.power.has = v; if (v) st.power.by = null; })}
      onBy=${(v) => update(() => (st.power.by = v))}
      options=${[
        { value: 'generator', label: t('⛽ We’re bringing a generator') },
        { value: 'builder', label: t('🏗️ The builder is supplying power') },
      ]} />`,
    water: html`<${WhoCard} q=${t('Is there water on site for the finishers to mix mud?')} value=${st.water.has} by=${st.water.by}
      errHas=${errs['water.has']} errBy=${errs['water.by']} whoQ=${t('Who is bringing water?')}
      onHas=${(v) => update(() => { st.water.has = v; if (v) st.water.by = null; })}
      onBy=${(v) => update(() => (st.water.by = v))}
      options=${[
        { value: 'us', label: t('🚰 We’re bringing water') },
        { value: 'builder', label: t('🏗️ The builder is supplying water') },
      ]} />`,
    features: html`<${FeaturesCard} c=${c} errs=${errs} />`,
    trim: html`<${TrimCard} c=${c} errs=${errs} />`,
    prerock: html`<${PrerockCard} c=${c} errs=${errs} />`,
  };

  return html`
    <h1 class="stage-title">${t('Job Site Check')}</h1>
    <p class="stage-sub">${t('Answer every question. The ones still open have a number; answered ones get a ✓.')}</p>
    ${locked && html`<${LockedBanner} title=${t('The job site check')} onEdit=${() => unlockStage(c, 'site')} />`}
    ${recheck && html`<div class="banner banner-bad"><b>${t('Something changed in the drywall areas.')}</b>${t('Fix the questions marked in red, then complete this again.')}</div>`}
    <fieldset class="fs" disabled=${locked}>
      ${SITE_CARDS.map((card, i) => html`<${Card} key=${card.key} n=${i + 1} card=${card} issues=${issues}>${cards[card.key]}<//>`)}
    </fieldset>
    <${ActionBar} hint=${!locked && t('{done} of {total} answered', { done: answered, total: SITE_CARDS.length })}>
      ${locked
        ? html`<button type="button" class="btn btn-primary big" onClick=${() => navigate(nextStage(c, 'site'))}>${t('📄 Back to Count Sheet')}</button>`
        : html`<button type="button" class="btn btn-success big" onClick=${() => completeStage(c)}>${t('✅ Job site check is complete')}</button>
            ${editing && html`<button type="button" class="btn btn-link" onClick=${() => cancelStageEdit(c)}>${t('Cancel changes')}</button>`}`}
    <//>
  `;
}
