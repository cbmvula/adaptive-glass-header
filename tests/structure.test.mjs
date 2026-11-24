/* Static architecture, security, accessibility, motion, and brand-hygiene checks.
   Run: node --test "tests/*.test.mjs" */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const html = read('index.html');
const markup = html.replace(/<!--[\s\S]*?-->/g, '');
const cssFiles = readdirSync(path.join(ROOT, 'css')).filter((name) => name.endsWith('.css'));
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter((name) => name.endsWith('.js'));
const attributes = (name) => Array.from(markup.matchAll(new RegExp('\\s' + name + '="([^"]*)"', 'g')), (match) => match[1]);
const isLocal = (url) => !/^(https?:|tel:|mailto:|#|data:)/.test(url);
const filePath = (url) => url.split('?')[0];
const SECTIONS = ['products', 'catalogues', 'advice', 'services'];
const LABELS = ['Shop', 'Catalogues', 'Guides', 'Services'];

function walkTextFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTextFiles(full, out);
    } else if (/\.(html|css|js|mjs|svg|md|txt|json)$/i.test(entry)) {
      out.push(path.relative(ROOT, full));
    }
  }
  return out;
}

describe('desktop header markup', () => {
  test('four navigation buttons, matching hidden highlight ghosts, and 7 panes inside one header', () => {
    const triggers = Array.from(markup.matchAll(/<button class="gh-menu-destination"([^>]*)>([^<]*)<\/button>/g));
    assert.deepEqual(triggers.map((m) => m[2]), LABELS);
    triggers.forEach((m, i) => {
      assert.match(m[1], new RegExp('data-section="' + SECTIONS[i] + '"'));
      assert.match(m[1], new RegExp('aria-controls="menu-' + SECTIONS[i] + '"'));
      assert.match(m[1], /aria-expanded="false"/);
    });
    const pill = markup.match(/<div class="desktop-nav-pill" aria-hidden="true">([\s\S]*?)<\/div>/);
    assert.ok(pill);
    assert.deepEqual(Array.from(pill[1].matchAll(/<span class="gh-menu-ghost">([^<]*)<\/span>/g), (m) => m[1]), LABELS);
    assert.equal((markup.match(/<header\b/g) || []).length, 1);
    assert.equal((markup.match(/class="menu-pane /g) || []).length, 7);
    assert.match(markup, /<header class="gh-header"[^>]*\sinert>/);
  });

  test('every local file referenced by HTML and CSS exists and zero remote URLs are loaded', () => {
    const refs = [...attributes('src'), ...attributes('href')].filter(isLocal);
    assert.ok(refs.length >= 25);
    refs.forEach((ref) => assert.ok(existsSync(path.join(ROOT, filePath(ref))), 'missing ' + ref));
    assert.deepEqual(attributes('src').filter((src) => /^https?:/.test(src)), []);
    cssFiles.forEach((file) => {
      const content = read('css/' + file);
      assert.doesNotMatch(content, /url\("?https?:/, file);
      const urls = Array.from(content.matchAll(/url\("?([^")]+)"?\)/g), (m) => m[1]);
      urls.filter(isLocal).forEach((url) => {
        assert.ok(existsSync(path.join(ROOT, 'css', url)), file + ' references missing ' + url);
      });
    });
  });

  test('strict CSP, zero inline code/styles, zero network or storage APIs', () => {
    const policy = markup.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(policy);
    ["default-src 'none'", "connect-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self';"]
      .forEach((d) => assert.ok(policy[1].includes(d), d));
    assert.doesNotMatch(markup, /\sstyle="|\son[a-z]+="/);
    assert.doesNotMatch(markup, /<script(?![^>]*\ssrc=)[^>]*>/);
    jsFiles.forEach((file) => {
      const src = read('js/' + file);
      assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie/, file);
      assert.doesNotMatch(src, /console\.(log|debug|info)/, file);
      assert.doesNotMatch(src, /\beval\(|new Function\(|innerHTML/, file);
    });
  });
});

describe('motion and accessibility rules in CSS', () => {
  const allCss = cssFiles.map((file) => read('css/' + file)).join('\n');

  test('no transition: all and no animation libraries', () => {
    assert.doesNotMatch(allCss, /transition(-property)?:\s*all\b/);
    assert.doesNotMatch(html, /gsap|framer|anime\.min|motion\.dev/i);
  });

  test('reduced motion, reduced transparency, instant keyboard motion, and fine-pointer hover gating exist', () => {
    assert.match(allCss, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(allCss, /@media \(prefers-reduced-transparency: reduce\)/);
    assert.match(allCss, /\[data-motion="instant"\]/);
    const outsideHoverMedia = allCss.replace(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\n\}/g, '');
    assert.doesNotMatch(outsideHoverMedia, /:hover/);
  });

  test('core geometry tokens are preserved', () => {
    ['--gh-bar: 80px', '--gh-open-frame-height: 388px', '--gh-frame-edge: 24px', 'container: ghm-nav / size', '100cqh']
      .forEach((token) => assert.ok(allCss.includes(token), 'missing ' + token));
  });
});

describe('brand-neutral open-source hygiene', () => {
  const FORBIDDEN = [
    /\bstudiodrzwi\b/i,
    /studio\s+drzwi/i,
    /bia[lł]obrzegi/i,
    /ko[sś]cielna\s+14/i,
    /508\s*905\s*069/,
    /\bwindoor\b/i,
    /\bwik[eę]d\b/i,
    /\bgerda\b/i,
    /\bpol-skone\b/i,
    /\bbara[nń]ski\b/i,
    /\balu-loft\b/i,
    /\bmetal-bud\b/i,
    /\bsdhh\b/i,
    /\bsdhx\b/i,
  ];

  test('no client domains, showroom addresses, phone numbers, or manufacturer trademarks appear anywhere in code or assets', () => {
    const files = walkTextFiles(ROOT).filter((f) => f !== 'tests/structure.test.mjs');
    assert.ok(files.length >= 20);
    files.forEach((file) => {
      const text = read(file);
      FORBIDDEN.forEach((pattern) => {
        assert.doesNotMatch(text, pattern, file + ' matched forbidden client identifier ' + pattern);
      });
    });
  });
});
