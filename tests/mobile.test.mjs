/* Tests for mobile-state reducer, diacritic-folded local search index, and mobile.html structure.
   Run: node --test "tests/*.test.mjs" */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

function loadLogic() {
  const sandbox = {};
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  ['js/mobile-state.js', 'js/search-index.js'].forEach((file) => {
    vm.runInContext(read(file), sandbox, { filename: pathToFileURL(path.join(ROOT, file)).href });
  });
  return sandbox.GlassHeaderDemo;
}

const { mobileState, searchIndex } = loadLogic();
const plain = (value) => JSON.parse(JSON.stringify(value));
const run = (events, from = mobileState.initialState()) => events.reduce(mobileState.reduce, from);
const open = (extra = []) => run([{ type: 'TOGGLE_MENU' }, ...extra]);

describe('mobile state reducer', () => {
  test('starts closed, English, signed out', () => {
    assert.deepEqual(plain(mobileState.initialState()), {
      open: false, view: 'menu', section: null, popover: null, language: 'en', signedIn: false, motion: 'standard',
    });
  });

  test('menu toggle opens and closes cleanly, resetting inner section and popover', () => {
    const section = open([{ type: 'TOGGLE_SECTION', section: 'advice' }]);
    assert.equal(section.section, 'advice');
    assert.equal(run([{ type: 'TOGGLE_MENU' }], section).section, null);
    const pop = open([{ type: 'TOGGLE_POPOVER', popover: 'language' }]);
    const shut = run([{ type: 'TOGGLE_MENU' }], pop);
    assert.deepEqual([shut.open, shut.section, shut.popover], [false, null, null]);
    assert.equal(run([{ type: 'TOGGLE_MENU', keyboard: true }]).motion, 'instant');
  });

  test('one accordion section open at a time', () => {
    const one = open([{ type: 'TOGGLE_SECTION', section: 'products' }]);
    assert.equal(run([{ type: 'TOGGLE_SECTION', section: 'services' }], one).section, 'services');
    assert.equal(run([{ type: 'TOGGLE_SECTION', section: 'products' }], one).section, null);
    assert.equal(run([{ type: 'TOGGLE_SECTION', section: 'invalid' }], one), one);
    assert.equal(run([{ type: 'TOGGLE_SECTION', section: 'products' }]).section, null);
  });

  test('utility popovers and accordion sections are mutually exclusive', () => {
    const section = open([{ type: 'TOGGLE_SECTION', section: 'services' }]);
    const account = run([{ type: 'TOGGLE_POPOVER', popover: 'account' }], section);
    assert.deepEqual([account.popover, account.section], ['account', null]);
    const back = run([{ type: 'TOGGLE_SECTION', section: 'catalogues' }], account);
    assert.deepEqual([back.popover, back.section], [null, 'catalogues']);
  });

  test('Escape closes popover first, then sheet', () => {
    const state = open([{ type: 'TOGGLE_POPOVER', popover: 'account' }]);
    const first = run([{ type: 'ESCAPE' }], state);
    assert.deepEqual([first.open, first.popover], [true, null]);
    assert.equal(run([{ type: 'ESCAPE' }], first).open, false);
  });

  test('language switching updates remaining choices and labels', () => {
    const state = open([{ type: 'TOGGLE_POPOVER', popover: 'language' }]);
    assert.deepEqual(plain(mobileState.otherLanguages(state)), ['pl', 'de']);
    const polish = run([{ type: 'CHOOSE_LANGUAGE', language: 'pl' }], state);
    assert.deepEqual([polish.language, polish.popover], ['pl', null]);
    assert.equal(mobileState.labelsFor('pl').catalogues, 'Katalogi');
    assert.equal(mobileState.labelsFor('de').advice, 'Ratgeber');
    assert.equal(mobileState.labelsFor('xx').products, 'Shop');
  });

  test('search and cart views toggle independently and suppress accordion events', () => {
    const search = run([{ type: 'OPEN_VIEW', view: 'search' }]);
    assert.deepEqual([search.open, search.view], [true, 'search']);
    assert.equal(run([{ type: 'OPEN_VIEW', view: 'cart' }], search).view, 'cart');
    assert.equal(run([{ type: 'OPEN_VIEW', view: 'search' }], search).open, false);
    assert.equal(run([{ type: 'TOGGLE_SECTION', section: 'products' }], search), search);
  });
});

describe('local search index', () => {
  const index = searchIndex.buildIndex([
    { label: 'Concealed frames', href: '#shop/concealed', group: 'Shop' },
    { label: 'Glass loft doors', href: '#shop/glass', group: 'Shop' },
    { label: 'Glass  loft doors', href: '#duplicate', group: 'Shop' },
    { label: 'Łączniki i zawiasy', href: '#shop/hinges', group: 'Shop' },
    { label: 'Mitre joinery', href: '#guides/mitre', group: 'Guides' },
    null,
  ]);

  test('deduplicates labels and skips malformed entries', () => {
    assert.equal(index.length, 4);
    assert.equal(searchIndex.buildIndex('bad').length, 0);
  });

  test('matches case- and diacritic-insensitively including Polish ł', () => {
    assert.deepEqual(plain(searchIndex.search(index, 'LACZNIKI')).map((i) => i.label), ['Łączniki i zawiasy']);
    assert.deepEqual(plain(searchIndex.search(index, 'glass loft')).map((i) => i.label), ['Glass loft doors']);
  });

  test('caps query length and respects result limits', () => {
    assert.equal(searchIndex.search(index, '   ').length, 0);
    assert.equal(searchIndex.search(index, 'a', 1).length, 1);
    assert.equal(searchIndex.tokens('x'.repeat(200)).join('').length, searchIndex.MAX_QUERY);
  });
});

describe('mobile.html structure', () => {
  const markup = read('mobile.html').replace(/<!--[\s\S]*?-->/g, '');
  const attributes = (name) => Array.from(markup.matchAll(new RegExp('\\s' + name + '="([^"]*)"', 'g')), (match) => match[1]);

  test('ships inert, enforces strict CSP, and loads only local files', () => {
    assert.match(markup, /<header class="ghm-header"[^>]*\sinert>/);
    const policy = markup.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(policy);
    ["default-src 'none'", "connect-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'"]
      .forEach((directive) => assert.ok(policy[1].includes(directive), directive));
    [...attributes('src'), ...attributes('href')].filter((url) => !url.startsWith('#')).forEach((url) => {
      assert.doesNotMatch(url, /^(https?:)?\/\//, url);
      assert.ok(existsSync(path.join(ROOT, url.split('?')[0])), 'missing ' + url);
    });
    assert.doesNotMatch(markup, /\sstyle="|\son[a-z]+="/);
  });

  test('four accordion sections with four swipeable cards each plus search and cart views', () => {
    const items = Array.from(markup.matchAll(/<button class="ghm-item__toggle"[^>]*data-section="([a-z]+)"[^>]*aria-expanded="false"/g), (m) => m[1]);
    assert.deepEqual(items, ['products', 'catalogues', 'advice', 'services']);
    items.forEach((section) => {
      const panel = markup.match(new RegExp('<div class="ghm-item__panel" id="ghm-panel-' + section + '"[\\s\\S]*?</ul>'));
      assert.ok(panel, section);
      assert.equal((panel[0].match(/class="ghm-card"/g) || []).length, 4, section);
    });
    assert.match(markup, /data-open-view="search"/);
    assert.match(markup, /data-open-view="cart"/);
  });
});
