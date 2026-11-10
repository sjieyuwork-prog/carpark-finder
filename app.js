const form = document.querySelector('#search');
const input = document.querySelector('#postal');
const statusEl = document.querySelector('#status');
const resultsEl = document.querySelector('#results');
const cardTemplate = document.querySelector('#card-template');

// The search API runs on Vercel. GitHub Pages serves only this page, so a copy
// hosted there calls the Vercel deployment instead of its own site.
const API_BASE = location.hostname.endsWith('.github.io') ? 'https://carpark-finder-lemon.vercel.app' : '';

// Wording for the `situation` the API reports (see lib/rank.js).
const SITUATIONS = {
  'widened-empty': 'Nothing within 500 m, so this list goes up to 1 km.',
  'widened-full': 'Carparks within 500 m are full, so this list goes up to 1 km.',
  'all-full': 'Every nearby carpark with live data is full right now.',
  'street-only': 'No carparks within 1 km. Street-side parking is the only option nearby.',
  none: 'No carparks or lots found within 1 km.',
};

let inFlight = null; // AbortController of the search being shown next

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(input.value.trim());
});
// Keep the box to 6 digits. A paste like "Singapore 520201" or "S520201"
// keeps its last stand-alone 6-digit number (so a phone number can't win);
// anything else keeps its first 6 digits.
input.addEventListener('input', () => {
  const runs = input.value.match(/(?<!\d)\d{6}(?!\d)/g);
  input.value = runs ? runs.at(-1) : input.value.replace(/\D/g, '').slice(0, 6);
});

// ?postal=520201 lets a search be bookmarked or sent to someone.
const initial = new URLSearchParams(location.search).get('postal');
if (initial) {
  input.value = initial;
  search(initial);
}

async function search(postal) {
  // A newer search always wins: cancel the one still loading.
  inFlight?.abort();
  const controller = (inFlight = new AbortController());
  resultsEl.replaceChildren();
  if (!/^\d{6}$/.test(postal)) {
    inFlight = null;
    form.removeAttribute('aria-busy');
    return showStatus('Enter a 6-digit postal code.', 'error');
  }

  history.replaceState(null, '', `?postal=${postal}`);
  showStatus('Finding carparks…');
  form.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(`${API_BASE}/api/search?postal=${postal}`, { signal: controller.signal });
    const data = await res.json();
    if (!res.ok) return showStatus(data.error, 'error');
    render(data);
  } catch (err) {
    if (err.name === 'AbortError') return;
    showStatus("Couldn't load carparks. Check your connection and try again.", 'error');
  } finally {
    if (inFlight === controller) {
      inFlight = null;
      form.removeAttribute('aria-busy');
    }
  }
}

function render(data) {
  showStatus(`Near ${data.origin.address}`);
  const nodes = [];
  if (data.situation) {
    const streetNote = data.situation === 'all-full' && data.streetSide.length ? ' Street-side parking is listed below.' : '';
    nodes.push(notice(SITUATIONS[data.situation] + streetNote));
  }
  if (!data.liveLotsOk) nodes.push(notice('Live lot counts are unavailable right now.'));
  if (data.distanceKind === 'straight') {
    nodes.push(notice('Walking routes are unavailable, so distances are straight-line and real walks will be longer.'));
  }
  if (data.carparks.length) {
    nodes.push(list(data.carparks.map((c) => card(c, data.distanceKind))));
  }
  if (data.streetSide.length) {
    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = 'Street-side parking (last resort)';
    nodes.push(heading, list(data.streetSide.map((c) => card(c, data.distanceKind))));
  }
  resultsEl.replaceChildren(...nodes);
}

function card(c, distanceKind) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  const set = (selector, text) => {
    const el = node.querySelector(selector);
    el.textContent = text ?? '';
    el.hidden = !text;
  };
  node.classList.add(`is-${c.category}`);
  if (c.freeLots === 0) node.classList.add('is-full');

  set('.badge', c.typeLabel);
  set('.distance', distanceKind === 'walk' ? `${c.distanceM} m walk` : `~${c.distanceM} m away`);
  set('.name', c.name);
  set('.postal', c.postal ? `Singapore ${c.postal}` : null);
  set('.lots', lotsText(c));
  set('.hours', c.shortTermHours ? `Visitor parking ${c.shortTermHours} only` : null);

  const destination = `${c.lat},${c.lng}`;
  node.querySelector('.gmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  node.querySelector('.waze').href = `https://waze.com/ul?ll=${destination}&navigate=yes`;
  return node;
}

function lotsText(c) {
  if (c.freeLots == null) return 'No live data';
  const updated = c.updatedAt ? ` · updated ${timeOfDay(c.updatedAt)}` : '';
  return c.freeLots === 0 ? `Full right now${updated}` : `${c.freeLots} lots free${updated}`;
}

const timeOfDay = (iso) =>
  new Date(iso).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });

function list(items) {
  const ol = document.createElement('ol');
  ol.className = 'cards';
  for (const item of items) {
    const li = document.createElement('li');
    li.append(item);
    ol.append(li);
  }
  return ol;
}

function notice(text) {
  const p = document.createElement('p');
  p.className = 'notice';
  p.textContent = text;
  return p;
}

function showStatus(text, kind = 'info') {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}
