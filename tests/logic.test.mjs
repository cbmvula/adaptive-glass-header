/* Unit tests for pure logic: OKLab palette interpolation, WCAG contrast floors,
   CSS token parity, motion drift bounds, and desktop menu-state reducer.
   Run: node --test "tests/*.test.mjs" */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');

function loadLogic() {
  const sandbox = {};
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  ['js/palette.js', 'js/motion.js', 'js/menu-state.js', 'js/background.js'].forEach((file) => {
    vm.runInContext(read(file), sandbox, { filename: pathToFileURL(path.join(ROOT, file)).href });
  });
  return sandbox.GlassHeaderDemo;
}

const { palette, motion, menuState, background } = loadLogic();
const plain = (value) => JSON.parse(JSON.stringify(value));
const hex = (value) => plain(palette.hexToRgb(value));
const steps = (count) => Array.from({ length: count + 1 }, (_, index) => index / count);

describe('palette', () => {
  test('cold, balanced, and warm stops are reproduced exactly at 0, 0.5, and 1', () => {
    [[0, 'cold'], [0.5, 'balanced'], [1, 'warm']].forEach(([position, name]) => {
      const result = plain(palette.paletteAt(position));
      const stop = palette.STOPS[name];
      assert.deepEqual(result.blobs, Array.from(stop.blobs, hex), name + ' blobs');
      assert.deepEqual(result.stageA, hex(stop.stageA), name + ' stage top');
      assert.deepEqual(result.stageB, hex(stop.stageB), name + ' stage bottom');
    });
  });

  test('OKLab blend stays smooth across every slider step', () => {
    const colours = steps(100).map((t) => plain(palette.paletteAt(t)));
    const largestStep = colours.slice(1).reduce((worst, current, index) => {
      const previous = colours[index];
      const deltas = current.blobs.flatMap((rgb, blob) => ['r', 'g', 'b'].map((c) => Math.abs(rgb[c] - previous.blobs[blob][c])));
      return Math.max(worst, ...deltas);
    }, 0);
    assert.ok(largestStep <= 4, 'largest per-step channel change was ' + largestStep);
  });

  test('out-of-range and invalid inputs clamp or fall back safely', () => {
    assert.deepEqual(plain(palette.paletteAt(-3)), plain(palette.paletteAt(0)));
    assert.deepEqual(plain(palette.paletteAt(9)), plain(palette.paletteAt(1)));
    assert.deepEqual(plain(palette.paletteAt(Number.NaN)), plain(palette.paletteAt(0.5)));
    assert.equal(palette.sliderToPosition('abc'), 0.5);
    assert.equal(palette.sliderToPosition(''), 0.5);
    assert.equal(palette.sliderToPosition(null), 0.5);
    assert.equal(palette.sliderToPosition('150'), 1);
    assert.equal(palette.sliderToPosition('-20'), 0);
    assert.equal(palette.sliderToPosition('25'), 0.25);
  });

  test('hexToRgb rejects invalid strings', () => {
    ['#fff', 'red', '', null, 12, '#12345g'].forEach((bad) => {
      assert.throws(() => palette.hexToRgb(bad), /Expected a #rrggbb colour/);
    });
    assert.deepEqual(hex('#0a10ff'), { r: 10, g: 16, b: 255 });
  });

  test('results are frozen and format cleanly as CSS triplets', () => {
    const result = palette.paletteAt(0.3);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.blobs) && Object.isFrozen(result.blobs[0]));
    assert.match(palette.toTriplet(result.blobs[0]), /^\d{1,3} \d{1,3} \d{1,3}$/);
    assert.equal(palette.colourValueText('0'), 'Cold');
    assert.equal(palette.colourValueText('30'), 'Cool');
    assert.equal(palette.colourValueText('50'), 'Balanced');
    assert.equal(palette.colourValueText('75'), 'Warmer');
    assert.equal(palette.colourValueText('100'), 'Warm');
  });
});

describe('contrast across every slider stop', () => {
  const { SURFACE } = palette;
  const { smoke } = SURFACE;
  const lightField = steps(20).flatMap((t) => {
    const colours = plain(palette.paletteAt(t));
    return [...colours.blobs, colours.stageA, colours.stageB];
  });
  const scaled = (rgb, factor) => ({ r: Math.min(255, rgb.r * factor), g: Math.min(255, rgb.g * factor), b: Math.min(255, rgb.b * factor) });
  const darkField = lightField.map((bg) => scaled(bg, SURFACE.darkFieldBrightness));
  const lowest = (text, backdrops, surfaceFor) => Math.min(...backdrops.map((bg) => palette.contrastRatio(hex(text), surfaceFor(bg))));
  const sheet = (glass, alpha) => (bg) => palette.compositeOver(hex(glass.glassTint), scaled(bg, glass.glassBrightness), alpha);

  test('stage captions stay at or above 4.5:1 on both light and dark backdrops', () => {
    assert.ok(lowest(SURFACE.ink, lightField, (bg) => bg) >= 4.5);
    assert.ok(lowest(SURFACE.stageInkOnDark, darkField, (bg) => bg) >= 4.5);
  });

  test('smoke sheet over light field maintains documented contrast floors', () => {
    [smoke.glassAlpha, smoke.glassAlphaOpen].forEach((alpha) => {
      assert.ok(lowest(smoke.ink, lightField, sheet(smoke, alpha)) >= 3.3);
      assert.ok(lowest(smoke.label, lightField, sheet(smoke, alpha)) >= 3);
      assert.ok(lowest(smoke.muted, lightField, sheet(smoke, alpha)) >= 2.9);
    });
  });

  test('frost sheet over dark field holds strong contrast for ink, labels, and muted text', () => {
    [SURFACE.glassAlpha, SURFACE.glassAlphaOpen].forEach((alpha) => {
      assert.ok(lowest(SURFACE.ink, darkField, sheet(SURFACE, alpha)) >= 6.5);
      assert.ok(lowest(SURFACE.label, darkField, sheet(SURFACE, alpha)) >= 4.5);
      assert.ok(lowest(SURFACE.muted, darkField, sheet(SURFACE, alpha)) >= 4.3);
    });
  });

  test('solid pill buttons maintain AAA contrast (>= 7:1)', () => {
    assert.ok(palette.contrastRatio(hex(SURFACE.pillInk), hex(SURFACE.pillBg)) >= 7);
  });
});

describe('CSS token parity', () => {
  const css = read('css/base.css');
  const token = (name) => {
    const match = css.match(new RegExp(name + ':\\s*([^;]+);'));
    assert.ok(match, 'token ' + name + ' missing from css/base.css');
    return match[1].trim();
  };

  test('default diffusion tokens match the balanced OKLab stop', () => {
    const balanced = palette.paletteAt(0.5);
    balanced.blobs.forEach((rgb, index) => {
      assert.equal(token('--gh-blob-' + (index + 1)), palette.toTriplet(rgb));
    });
    assert.equal(token('--gh-stage-a'), palette.toTriplet(balanced.stageA));
    assert.equal(token('--gh-stage-b'), palette.toTriplet(balanced.stageB));
  });

  test('frost and smoke tokens in css/base.css match palette.SURFACE constants', () => {
    const { SURFACE } = palette;
    const { smoke } = SURFACE;
    assert.equal(token('--gh-header-ink'), SURFACE.ink);
    assert.equal(token('--gh-header-muted'), SURFACE.muted);
    assert.equal(token('--gh-header-label'), SURFACE.label);
    assert.equal(token('--gh-glass-tint'), palette.toTriplet(palette.hexToRgb(SURFACE.glassTint)));
    assert.equal(Number(token('--gh-glass-alpha')), SURFACE.glassAlpha);
    assert.equal(Number(token('--gh-glass-alpha-open')), SURFACE.glassAlphaOpen);

    const block = css.match(/:root\[data-tone="light"\] \{([^}]+)\}/);
    assert.ok(block, 'light-tone smoke block missing from css/base.css');
    const smokeToken = (name) => block[1].match(new RegExp(name + ':\\s*([^;]+);'))[1].trim();
    assert.equal(smokeToken('--gh-header-ink'), smoke.ink);
    assert.equal(smokeToken('--gh-header-muted'), smoke.muted);
    assert.equal(smokeToken('--gh-header-label'), smoke.label);
    assert.equal(smokeToken('--gh-glass-tint'), palette.toTriplet(palette.hexToRgb(smoke.glassTint)));
    assert.equal(Number(smokeToken('--gh-glass-alpha')), smoke.glassAlpha);
    assert.equal(Number(smokeToken('--gh-glass-alpha-open')), smoke.glassAlphaOpen);
  });
});

describe('motion and tone helpers', () => {
  test('speed curve is monotonic and exactly 0 at Still', () => {
    assert.equal(motion.speedRate('0'), 0);
    assert.equal(motion.speedRate('50'), 1);
    assert.equal(motion.speedRate('100'), motion.SPEED_MAX_RATE);
    const rates = Array.from({ length: 101 }, (_, value) => motion.speedRate(String(value)));
    rates.slice(1).forEach((rate, index) => assert.ok(rate > rates[index]));
    assert.equal(motion.speedValueText('0'), 'Still');
    assert.equal(motion.speedValueText('25'), 'Very slow');
    assert.equal(motion.speedValueText('50'), 'Slow');
    assert.equal(motion.speedValueText('90'), 'Faster');
  });

  test('blob drift stays bounded and continuous', () => {
    const frame = (1 / 60) * motion.SPEED_MAX_RATE;
    motion.BLOBS.forEach((blob, index) => {
      for (let phase = 0; phase < 600; phase += 5.7) {
        const a = motion.driftAt(phase, index);
        const b = motion.driftAt(phase + frame, index);
        assert.ok(Math.abs(a.x) <= blob.ax + blob.bx + 1e-9);
        assert.ok(Math.abs(a.y) <= blob.ay + blob.by + 1e-9);
        assert.ok(Math.abs(a.scale - 1) <= blob.sa + 1e-9);
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 0.3);
      }
    });
    assert.throws(() => motion.driftAt(0, 9), /No drift path/);
    assert.match(motion.formatDrift(motion.driftAt(12.5, 2)), /^translate3d\(-?[\d.]+vw, -?[\d.]+vh, 0\) scale\([\d.]+\)$/);
  });

  test('stepToward converges, fitScale shrinks cleanly, and toneAfter clamps at ends', () => {
    const settled = Array.from({ length: 400 }).reduce((value) => motion.stepToward(value, 0, 0.016, 0.14), motion.SPEED_MAX_RATE);
    assert.equal(settled, 0);
    assert.equal(motion.fitScale(1600, 1182), 1);
    assert.equal(motion.fitScale(591, 1182), 0.5);
    assert.equal(background.toneAfter('light', 'ArrowRight'), 'dark');
    assert.equal(background.toneAfter('dark', 'ArrowRight'), 'dark');
    assert.equal(background.toneAfter('dark', 'ArrowLeft'), 'light');
    assert.equal(background.toneAfter('light', 'Escape'), null);
  });
});

describe('desktop menu state reducer', () => {
  const run = (events, from = menuState.initialState()) => events.reduce(menuState.reduce, from);

  test('starts closed and immutable', () => {
    const s = menuState.initialState();
    assert.deepEqual(plain(s), { view: 'closed', section: null, highlight: null, pinned: false, viaHover: false, motion: 'standard' });
    assert.ok(Object.isFrozen(s));
  });

  test('hover intent opens transiently and closes after leave grace unless focused inside', () => {
    const hovered = run([{ type: 'ENTRY_ENTER', section: 'products' }]);
    assert.deepEqual([hovered.view, hovered.highlight], ['closed', 'products']);
    const opened = run([{ type: 'ENTRY_INTENT', section: 'products' }], hovered);
    assert.deepEqual([opened.view, opened.section, opened.pinned, opened.viaHover], ['menu', 'products', false, true]);
    assert.equal(run([{ type: 'HEADER_LEAVE_TIMEOUT', focusInside: true }], opened), opened);
    assert.equal(run([{ type: 'HEADER_LEAVE_TIMEOUT', focusInside: false }], opened).view, 'closed');
  });

  test('activating a hovered section pins it; activating a pinned section again closes it', () => {
    const hoverOpen = run([{ type: 'ENTRY_ENTER', section: 'catalogues' }, { type: 'ENTRY_INTENT', section: 'catalogues' }]);
    const pinned = run([{ type: 'ACTIVATE', section: 'catalogues', keyboard: false }], hoverOpen);
    assert.deepEqual([pinned.view, pinned.pinned, pinned.viaHover], ['menu', true, false]);
    assert.equal(run([{ type: 'HEADER_LEAVE_TIMEOUT', focusInside: false }], pinned), pinned);
    const closed = run([{ type: 'ACTIVATE', section: 'catalogues', keyboard: false }], pinned);
    assert.equal(closed.view, 'closed');
  });

  test('icon panes open by click, ignore accidental label hover, and search stays open on re-click', () => {
    const search = run([{ type: 'ACTIVATE', section: 'search', keyboard: false }]);
    assert.deepEqual([search.view, search.section, search.highlight], ['menu', 'search', null]);
    assert.equal(run([{ type: 'ENTRY_ENTER', section: 'products' }], search), search);
    assert.equal(run([{ type: 'ACTIVATE', section: 'search', keyboard: false }], search), search);
    const esc = run([{ type: 'ESCAPE' }], search);
    assert.deepEqual([esc.view, esc.motion], ['closed', 'instant']);
  });

  test('keyboard open and roving index behave deterministically', () => {
    const open = run([{ type: 'KEY_OPEN', section: 'advice' }]);
    assert.deepEqual([open.view, open.section, open.motion], ['menu', 'advice', 'instant']);
    const next = run([{ type: 'FOCUS_SECTION', section: 'services' }], open);
    assert.equal(next.section, 'services');
    assert.equal(menuState.roveIndex('ArrowRight', 3, 4), 0);
    assert.equal(menuState.roveIndex('ArrowLeft', 0, 4), 3);
    assert.equal(menuState.roveIndex('Home', 2, 4), 0);
    assert.equal(menuState.roveIndex('End', 1, 4), 3);
    assert.equal(menuState.roveIndex('Tab', 1, 4), null);
  });

  test('unknown events and invalid sections are no-ops', () => {
    const s = menuState.initialState();
    [null, {}, { type: 'UNKNOWN' }, { type: 'ACTIVATE', section: 'bogus' }].forEach((ev) => {
      assert.equal(menuState.reduce(s, ev), s);
    });
  });
});
