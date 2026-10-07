// Regression + behaviour tests for the catalog page (index.html).
// These execute the real inline script from index.html inside jsdom —
// nothing here re-implements the page's logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

/**
 * Boot index.html with a stubbed manifest fetch.
 * @param {object} opts
 * @param {unknown} [opts.manifest]  payload `fetch('manifest.json')` resolves to
 * @param {boolean} [opts.failFetch] make the fetch reject (offline / file:// case)
 * @param {string}  [opts.url]       page URL, used for ?q=&c=&s= deep-link tests
 */
async function loadPage(opts = {}) {
  const payload = 'manifest' in opts ? opts.manifest : manifest;
  const virtualConsole = new VirtualConsole();           // keep jsdom noise out of test output
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'http://localhost/index.html',
    virtualConsole,
    beforeParse(window) {
      window.fetch = opts.failFetch
        ? () => Promise.reject(new Error('Failed to fetch'))
        : () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
      if (!window.matchMedia) {
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      }
    }
  });
  await tick();
  return dom;
}

const cards = w => [...w.document.querySelectorAll('.card')];
const titles = w => cards(w).map(c => c.querySelector('h3').textContent.trim());
const type = async (w, el, value) => {
  el.value = value;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  await tick();
};

/* ── 1. The stale "55+ tools shipped" claim is gone ─────────────── */

test('no hardcoded tool-count marketing claims remain', () => {
  assert.ok(!/55\+/.test(html), 'the "55+ tools shipped" claim is still in index.html');
  assert.ok(!/\d+\+\s*tools?\s*(shipped|available)/i.test(html), 'a hardcoded "N+ tools" claim remains');
  assert.ok(!/hero-eyebrow">[^<]*\d/.test(html), 'the hero eyebrow still contains a hardcoded number');
});

test('every number shown on the page is derived from manifest.json', async () => {
  const { window } = await loadPage();
  assert.equal(window.document.getElementById('count').textContent, `${manifest.length} tools`);

  // the two hero counters animate (count-up), so let the animation land first
  await tick(900);
  assert.equal(window.document.getElementById('stat-total').textContent, String(manifest.length));

  const cats = new Set(manifest.flatMap(t => (Array.isArray(t.category) ? t.category : [t.category])));
  assert.equal(window.document.getElementById('stat-cats').textContent, String(cats.size));
  assert.equal(window.document.querySelectorAll('.card').length, manifest.length);
});

/* ── 2. Rendering ──────────────────────────────────────────────── */

test('renders one card per manifest entry, linking to a real file', async () => {
  const { window } = await loadPage();
  assert.equal(cards(window).length, manifest.length);

  for (const card of cards(window)) {
    const href = card.getAttribute('href');
    assert.match(href, /^tools\/[\w.-]+\.html$/, `unexpected href: ${href}`);
    assert.ok(
      manifest.some(t => t.file === href),
      `${href} is not in manifest.json`
    );
    assert.ok(card.querySelector('.card-icon').textContent.trim().length > 0, 'card has no icon');
  }
});

test('tools open in the same tab (no target=_blank) so Back restores catalog state', async () => {
  const { window } = await loadPage();
  for (const card of cards(window)) assert.equal(card.getAttribute('target'), null);
});

test('every card links to a file that exists in the repo', async () => {
  const { window } = await loadPage();
  for (const card of cards(window)) {
    const rel = card.getAttribute('href');
    assert.doesNotThrow(() => readFileSync(join(root, rel)), `${rel} is missing from the repo`);
  }
});

/* ── 3. Search ─────────────────────────────────────────────────── */

test('search narrows the grid and highlights matched characters', async () => {
  const { window } = await loadPage();
  await type(window, window.document.getElementById('search'), 'pivot');

  const found = titles(window);
  assert.ok(found.length >= 1, 'search returned nothing');
  assert.ok(found.includes('Pivot Table'), `expected Pivot Table in ${found}`);
  assert.ok(window.document.querySelector('.card h3 mark'), 'matched characters are not highlighted');
  assert.match(window.document.getElementById('status').textContent, /Showing \d+ of \d+ tools/);
});

test('fuzzy subsequence search finds tools that substring matching would miss', async () => {
  const { window } = await loadPage();
  await type(window, window.document.getElementById('search'), 'pwd');   // p-a-s-s-w-o-r-d
  assert.ok(titles(window).includes('Password Generator'), `got: ${titles(window)}`);
});

test('an unmatched search shows a recoverable empty state', async () => {
  const { window } = await loadPage();
  await type(window, window.document.getElementById('search'), 'zzzzqqq');

  assert.equal(cards(window).length, 0);
  assert.match(window.document.querySelector('.state h3').textContent, /No tools match/);

  window.document.querySelector('[data-action="clear"]').click();
  await tick();
  assert.equal(cards(window).length, manifest.length, 'clearing filters did not restore the full list');
  assert.equal(window.document.getElementById('search').value, '');
});

/* ── 4. Category filters ───────────────────────────────────────── */

test('category pills filter the grid and expose aria-pressed', async () => {
  const { window } = await loadPage();
  const doc = window.document;
  const security = doc.querySelector('.pill[data-cat="Security"]');
  assert.ok(security, 'no Security pill rendered');

  security.click();
  await tick();

  assert.equal(security.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(titles(window), ['Password Generator']);
  assert.match(doc.getElementById('status').textContent, /Security/);
  assert.equal(doc.querySelectorAll('.card').length, manifest.filter(t => t.category.includes('Security')).length);
});

test('pills carry per-category counts', async () => {
  const { window } = await loadPage();
  const pill = window.document.querySelector('.pill[data-cat="Security"] .pill-count');
  assert.equal(pill.textContent, String(manifest.filter(t => t.category.includes('Security')).length));
  assert.equal(window.document.querySelector('.pill[data-cat="all"] .pill-count').textContent, String(manifest.length));
});

/* ── 5. Sorting ────────────────────────────────────────────────── */

test('sorting A–Z and Z–A reorders the grid', async () => {
  const { window } = await loadPage();
  const sort = window.document.getElementById('sort');

  sort.value = 'az';
  sort.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  const az = titles(window);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b)));

  sort.value = 'za';
  sort.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  const za = titles(window);
  assert.deepEqual(za, [...za].sort((a, b) => b.localeCompare(a)));
});

/* ── 6. Deep links / URL state ─────────────────────────────────── */

test('a ?c= deep link opens the page pre-filtered', async () => {
  const { window } = await loadPage({ url: 'http://localhost/index.html?c=Security' });
  assert.deepEqual(titles(window), ['Password Generator']);
  assert.equal(window.document.querySelector('.pill[data-cat="Security"]').classList.contains('active'), true);
});

test('searching writes shareable ?q= state into the URL', async () => {
  const { window } = await loadPage();
  await type(window, window.document.getElementById('search'), 'color');
  assert.match(window.location.search, /q=color/);
});

/* ── 7. Injection hardening ────────────────────────────────────── */

test('hostile manifest values cannot inject markup or javascript: URLs', async () => {
  const evil = [{
    title: 'Evil <img src=x onerror=alert(1)>',
    description: '"><script>window.__pwned=1</script>',
    icon: '<svg onload=alert(2)>',
    file: 'javascript:alert(3)',
    category: ['<b>Pwn</b>']
  }];
  const { window } = await loadPage({ manifest: evil });

  assert.equal(window.__pwned, undefined, 'injected script executed');
  const card = window.document.querySelector('.card');
  const icon = card.querySelector('.card-icon');

  // .card legitimately contains an <svg> (the arrow), so scope the checks to injected positions
  assert.equal(icon.childElementCount, 0, 'the icon string was parsed as markup');
  assert.equal(icon.textContent, '<svg onload=alert(2)>');
  assert.equal(card.querySelector('h3').childElementCount, 0, 'the title was parsed as markup');
  assert.match(card.querySelector('h3').textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(card.querySelector('.card-tags').childElementCount, 1, 'category markup was parsed');
  assert.equal(card.querySelector('.card-tag').textContent, '<b>Pwn</b>');
  assert.equal(card.getAttribute('href'), '#', 'a javascript: URL was allowed through as a link target');
});

/* ── 8. Failure path ───────────────────────────────────────────── */

test('a failed manifest fetch shows an honest error — never fabricated tools', async () => {
  const { window } = await loadPage({ failFetch: true });

  assert.equal(cards(window).length, 0, 'the page invented tools that are not in this repo');
  assert.match(window.document.querySelector('.state h3').textContent, /Could not load/);
  assert.equal(window.document.getElementById('count').textContent, 'Unavailable');
  assert.ok(window.document.querySelector('[data-action="retry"]'), 'no retry control');
});

test('a malformed manifest is rejected instead of half-rendered', async () => {
  const { window } = await loadPage({ manifest: { not: 'a list' } });
  assert.equal(cards(window).length, 0);
  assert.match(window.document.querySelector('.state h3').textContent, /Could not load/);
});

test('a string category (not an array) still filters', async () => {
  const { window } = await loadPage({
    manifest: [
      { title: 'Flat Category', description: 'd', icon: '🧪', file: 'tools/tasks.html', category: 'Solo' },
      { title: 'Array Category', description: 'd', icon: '🧪', file: 'tools/scratchpad.html', category: ['Solo'] }
    ]
  });
  assert.equal(cards(window).length, 2);
  window.document.querySelector('.pill[data-cat="Solo"]').click();
  await tick();
  assert.equal(cards(window).length, 2);
});

/* ── 9. Command palette ────────────────────────────────────────── */

test('Ctrl+K opens the palette, lists tools, Esc closes it', async () => {
  const { window } = await loadPage();
  const doc = window.document;
  const palette = doc.getElementById('palette');
  assert.equal(palette.classList.contains('open'), false);

  const ctrlK = new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
  doc.dispatchEvent(ctrlK);
  await tick();
  assert.equal(palette.classList.contains('open'), true, 'Ctrl+K did not open the palette');
  assert.ok(doc.querySelectorAll('.palette-item').length >= manifest.length, 'tools missing from the palette');

  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(palette.classList.contains('open'), false, 'Esc did not close the palette');
});

test('palette fuzzy search ranks the intended tool first and Enter activates it', async () => {
  const { window } = await loadPage();
  const doc = window.document;
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  await tick();

  const input = doc.getElementById('palette-input');
  input.value = 'pvt';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick();

  const first = doc.querySelector('.palette-item .pi-title');
  assert.match(first.textContent, /Pivot Table/, `top hit for "pvt" was ${first.textContent}`);
  assert.equal(doc.querySelector('.palette-item').getAttribute('aria-selected'), 'true');

  // Arrow keys move the selection without the mouse
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(doc.querySelectorAll('.palette-item')[1].getAttribute('aria-selected'), 'true');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(doc.querySelectorAll('.palette-item')[0].getAttribute('aria-selected'), 'true');

  // jsdom cannot observe real navigation (window.location is non-configurable), so
  // assert the activation side effects the page performs on the selected item:
  // it closes the palette and records the tool it is about to open.
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick(250);

  assert.equal(doc.getElementById('palette').classList.contains('open'), false, 'Enter did not close the palette');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('ub.recent.v1')),
    ['tools/pivot-table.html'], 'Enter activated the wrong item');
  const target = manifest.find(t => t.file === 'tools/pivot-table.html');
  assert.ok(doc.querySelector(`.recent-chip[href="${target.file}"]`).textContent.trim().endsWith(target.title),
    "recent chip is mislabelled");
});

/* ── 10. Recently opened ───────────────────────────────────────── */

test('opening a card records it in the "recently opened" rail', async () => {
  const { window } = await loadPage();
  const doc = window.document;
  assert.equal(doc.getElementById('recent').hidden, true);

  cards(window)[0].click();
  await tick();

  assert.equal(doc.getElementById('recent').hidden, false);
  assert.equal(doc.querySelectorAll('.recent-chip').length, 1);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('ub.recent.v1')), [manifest[0].file]);
});

/* ── 11. Theme ─────────────────────────────────────────────────── */

test('the theme toggle flips data-theme and persists the choice', async () => {
  const { window } = await loadPage();
  const doc = window.document;
  const before = doc.documentElement.getAttribute('data-theme');

  doc.getElementById('theme-toggle').click();
  await tick();

  const after = doc.documentElement.getAttribute('data-theme');
  assert.notEqual(before, after);
  assert.equal(window.localStorage.getItem('ub.theme'), after);
  assert.ok(['dark', 'light'].includes(after));
});

/* ── 12. Layout regression: the old double flex:1 card bug ─────── */

test('card title no longer flexes against its description (old gap bug)', () => {
  const h3 = html.match(/\.card h3\{([^}]*)\}/);
  const p = html.match(/\.card p\{([^}]*)\}/);
  assert.ok(h3 && p, 'card title/description rules not found');
  assert.ok(!/flex\s*:\s*1/.test(h3[1]), '.card h3 still has flex:1 — it fights .card p for space');
  assert.ok(/flex\s*:\s*1/.test(p[1]), '.card p should keep flex:1 so tags sit at the bottom');
});

test('the grid never overflows a 320px viewport', () => {
  assert.match(html, /minmax\(min\(300px,100%\),1fr\)/, 'grid columns can exceed a narrow viewport');
});

test('animations are disabled for prefers-reduced-motion', () => {
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(html, /animation-duration:\.001ms/);
});

/* ── 13. The two search implementations must not drift ─────────── */

test('index.html and tools/command-palette.html use the same fuzzy scorer', () => {
  const grab = src => {
    const m = src.match(/function fuzzy\(query, ?text\)\{[\s\S]*?\n  \}/);
    assert.ok(m, 'fuzzy() not found');
    return m[0].replace(/\s+/g, ' ').trim();
  };
  const site = grab(html);
  const palette = grab(readFileSync(join(root, 'tools', 'command-palette.html'), 'utf8'));
  assert.equal(site, palette, 'the site search and the command palette rank differently');
});

test('every tool file in tools/ is listed in manifest.json', () => {
  const onDisk = readdirSync(join(root, 'tools')).filter(f => f.endsWith('.html'));
  const listed = new Set(manifest.map(t => basename(t.file)));
  const unlisted = onDisk.filter(f => !listed.has(f));
  assert.deepEqual(unlisted, [], 'tools on disk are invisible to the catalog');
});
