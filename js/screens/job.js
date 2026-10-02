import { html } from '../lib.js';
import { app, updateCount, setUi, errMap, showErrors, learn, choices } from '../state.js';
import { ask, tell, toast, navigate, ActionBar, FieldError } from '../ui.js';
import { jobIssues, nextStage, nextLabel, mapUrl, fmtDate, norm } from '../model.js';

const gpsText = (pin) => `GPS pin ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
const isGpsText = (t) => /^GPS pin /.test(t);

function getPosition() {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }),
  );
}

// Street address for a GPS point. Needs signal; returns null if it can't.
async function reverseGeocode(pin) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${pin.lat}&lon=${pin.lng}`;
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county;
    const iso = a['ISO3166-2-lvl4'];
    const state = iso && iso.startsWith('US-') ? iso.slice(3) : a.state;
    const text = [street, city, [state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return text ? { text, hasNumber: !!a.house_number } : null;
  } finally {
    clearTimeout(timer);
  }
}

async function dropPin(c) {
  if (!('geolocation' in navigator)) return tell('This phone can’t share its location', 'Just type the address in the box.');
  setUi({ pinBusy: true });
  let pos;
  try {
    pos = await getPosition();
  } catch (err) {
    setUi({ pinBusy: false });
    return tell(
      'Couldn’t find your location',
      err && err.code === 1
        ? html`<p>Location is turned off for this app.</p>
            <p>To turn it on: <b>Settings → Privacy & Security → Location Services → Safari Websites → While Using the App</b>.</p>
            <p>Or just type the address.</p>`
        : 'Step outside (away from metal roofs) and try again — or just type the address.',
      '📍',
    );
  }
  const pin = {
    lat: +pos.coords.latitude.toFixed(6),
    lng: +pos.coords.longitude.toFixed(6),
    acc: Math.round(pos.coords.accuracy || 0),
    at: Date.now(),
  };
  updateCount(c, (c) => (c.job.pin = pin));

  let found = null;
  if (navigator.onLine) found = await reverseGeocode(pin).catch(() => null);
  setUi({ pinBusy: false });

  if (!found) {
    if (!c.job.address.trim() || isGpsText(c.job.address)) updateCount(c, (c) => (c.job.address = gpsText(pin)));
    toast(navigator.onLine
      ? '📍 Pin saved. Couldn’t look up the street name — type it over the GPS numbers if you know it.'
      : '📍 Pin saved. No signal to look up the street name — type it over the GPS numbers if you know it.');
    return;
  }
  const typed = c.job.address.trim();
  if (!typed || isGpsText(typed)) updateCount(c, (c) => (c.job.address = found.text));
  else if (norm(typed) !== norm(found.text)) {
    const use = await ask({
      title: 'Use the address from the map?',
      body: html`<p>Map says:<br /><b>${found.text}</b></p><p>You typed:<br /><b>${typed}</b></p>`,
      buttons: [
        { label: 'Use the map address', value: true, kind: 'primary' },
        { label: 'Keep what I typed', value: false, kind: 'secondary' },
      ],
    });
    if (use) updateCount(c, (c) => (c.job.address = found.text));
  }
  toast(found.hasNumber
    ? '📍 Pin dropped and address filled in. Give it a quick check.'
    : '📍 Pin dropped. Add the house number — new houses often aren’t on the map yet.');
}

async function removePin(c) {
  const yes = await ask({
    title: 'Remove the map pin?',
    body: 'Mom will only get the typed address, not the exact spot.',
    buttons: [
      { label: 'No, keep the pin', value: false, kind: 'primary' },
      { label: 'Yes, remove it', value: true, kind: 'danger' },
    ],
  });
  if (yes) updateCount(c, (c) => (c.job.pin = null));
}

export function JobStage({ c }) {
  const issues = jobIssues(c);
  const errs = errMap('job', issues);
  const ready = !issues.length;
  const pin = c.job.pin;
  const busy = app.ui.pinBusy;
  const builders = choices('builders');
  const set = (k) => (e) => updateCount(c, (c) => (c.job[k] = e.target.value));

  const next = () => {
    if (!ready) return showErrors('job');
    learn('builders', c.job.builder);
    navigate(nextStage(c, 'job'));
  };

  return html`
    <h1 class="stage-title">Builder & Address</h1>

    <div class=${`card ${errs.builder ? 'has-error' : ''}`}>
      <label class="label" for="builder">Builder / Client</label>
      <input id="builder" class=${`input big ${errs.builder ? 'err' : ''}`} value=${c.job.builder} onInput=${set('builder')}
        placeholder="e.g. Bob the Builder" autocomplete="off" autocapitalize="words" enterkeyhint="next" />
      ${builders.length > 0 && html`<div class="label small">Recent builders</div>
        <div class="chips">${builders.map((b) => html`<button type="button" class=${`chip ${b === c.job.builder ? 'on' : ''}`}
          onClick=${() => updateCount(c, (c) => (c.job.builder = b))}>${b}</button>`)}</div>`}
      <${FieldError} msg=${errs.builder && 'Type the builder or client name'} />
    </div>

    <div class=${`card ${errs.address ? 'has-error' : ''}`}>
      <label class="label" for="address">Job Address</label>
      <button type="button" class="btn btn-pin" disabled=${busy} onClick=${() => dropPin(c)}>
        ${busy ? '⏳ Finding your location…' : pin ? '📍 Drop the pin again' : '📍 Drop pin at my location'}
      </button>
      <div class="hint">Stand at the house and tap. It fills in the address and saves the exact spot for the map.</div>
      <textarea id="address" class=${`input ${errs.address ? 'err' : ''}`} rows="2" value=${c.job.address} onInput=${set('address')}
        placeholder="Or type the address here" autocomplete="off" autocapitalize="words"></textarea>
      <${FieldError} msg=${errs.address && 'Drop the pin or type the address'} />
      ${pin
        ? html`<div class="pin-info">
            <div>📍 <b>Pin saved</b>${pin.acc ? ` (accurate to about ${Math.max(1, Math.round(pin.acc * 3.28))} ft)` : ''}</div>
            <div class="muted small">${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} · ${fmtDate(pin.at)}</div>
            <div class="pin-actions">
              <a class="link" href=${mapUrl(c)} target="_blank" rel="noopener">Check it on the map</a>
              <button type="button" class="link danger" onClick=${() => removePin(c)}>Remove pin</button>
            </div>
          </div>`
        : html`<div class="hint">💡 Drop the pin so Mom gets the exact spot on the map.</div>`}
    </div>

    <${ActionBar} hint=${!ready && `Fill in: ${issues.map((i) => i.msg).join(' and ')}`}>
      <button type="button" class=${`btn btn-primary big ${ready ? '' : 'is-disabled'}`} aria-disabled=${!ready} onClick=${next}>
        ${nextStage(c, 'job') === 'drywall' && !c.sections.length ? 'Next: Start Counting →' : nextLabel(c, 'job')}
      </button>
    <//>
  `;
}
