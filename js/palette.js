/* Colour slider logic: continuous cold -> balanced -> warm palette blended in OKLab,
   plus WCAG 2.1 contrast helpers used by automated tests to keep CSS tokens in sync.
   Pure functions only so the same module runs in the browser and in Node tests. */
(function (root) {
  'use strict';

  const SLIDER_MIN = 0;
  const SLIDER_MAX = 100;
  const SLIDER_DEFAULT = 50;
  const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

  const STOPS = Object.freeze({
    cold: Object.freeze({
      stageA: '#f1f3f6',
      stageB: '#d3d9e0',
      blobs: Object.freeze(['#a9c0e2', '#c3b6e3', '#b3c1cf', '#e8ecf2', '#b7bfe0']),
    }),
    balanced: Object.freeze({
      stageA: '#f3f3f4',
      stageB: '#d9dadd',
      blobs: Object.freeze(['#b9c8e2', '#e9c0c4', '#cdc3de', '#f1ebe2', '#edcdb8']),
    }),
    warm: Object.freeze({
      stageA: '#f6f3f0',
      stageB: '#e0d8d2',
      blobs: Object.freeze(['#f1c3a2', '#ebb2b6', '#ecd09a', '#f3eadc', '#efc0ae']),
    }),
  });

  /* Mirrors the CSS tokens in css/base.css; automated tests assert parity. */
  const SURFACE = Object.freeze({
    ink: '#22272b',
    muted: '#40464c',
    label: '#3d4349',
    pillBg: '#23282c',
    pillInk: '#f4f5f6',
    glassTint: '#f7f8f9',
    glassAlpha: 0.28,
    glassAlphaOpen: 0.36,
    glassBrightness: 2.6,
    smoke: Object.freeze({
      ink: '#ffffff',
      muted: '#eef0f2',
      label: '#f4f5f6',
      glassTint: '#54585e',
      glassAlpha: 0.18,
      glassAlphaOpen: 0.24,
      glassBrightness: 0.62,
    }),
    darkFieldBrightness: 0.3,
    stageInkOnDark: '#f4f5f6',
  });

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function sliderToPosition(value) {
    const number = Number(value);
    const safe = Number.isFinite(number) && value !== '' && value !== null ? number : SLIDER_DEFAULT;
    return clamp01((safe - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN));
  }

  function hexToRgb(hex) {
    if (typeof hex !== 'string' || !HEX_PATTERN.test(hex)) {
      throw new TypeError('Expected a #rrggbb colour, received: ' + String(hex));
    }
    const int = parseInt(hex.slice(1), 16);
    return Object.freeze({ r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 });
  }

  function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(value) {
    const c = clamp01(value);
    const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(clamp01(encoded) * 255);
  }

  function rgbToOklab(rgb) {
    const r = srgbToLinear(rgb.r);
    const g = srgbToLinear(rgb.g);
    const b = srgbToLinear(rgb.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
  }

  function oklabToRgb(lab) {
    const l = Math.pow(lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b, 3);
    const m = Math.pow(lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b, 3);
    const s = Math.pow(lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b, 3);
    return Object.freeze({
      r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    });
  }

  function mixHex(fromHex, toHex, amount) {
    const k = clamp01(amount);
    if (k === 0) return hexToRgb(fromHex);
    if (k === 1) return hexToRgb(toHex);
    const from = rgbToOklab(hexToRgb(fromHex));
    const to = rgbToOklab(hexToRgb(toHex));
    return oklabToRgb({
      L: from.L + (to.L - from.L) * k,
      a: from.a + (to.a - from.a) * k,
      b: from.b + (to.b - from.b) * k,
    });
  }

  function segmentFor(position) {
    return position <= 0.5
      ? { from: STOPS.cold, to: STOPS.balanced, amount: position * 2 }
      : { from: STOPS.balanced, to: STOPS.warm, amount: (position - 0.5) * 2 };
  }

  function paletteAt(position) {
    const t = clamp01(Number.isFinite(position) ? position : SLIDER_DEFAULT / SLIDER_MAX);
    const { from, to, amount } = segmentFor(t);
    return Object.freeze({
      stageA: mixHex(from.stageA, to.stageA, amount),
      stageB: mixHex(from.stageB, to.stageB, amount),
      blobs: Object.freeze(from.blobs.map((hex, index) => mixHex(hex, to.blobs[index], amount))),
    });
  }

  function toTriplet(rgb) {
    return rgb.r + ' ' + rgb.g + ' ' + rgb.b;
  }

  function colourValueText(value) {
    const percent = Math.round(sliderToPosition(value) * 100);
    if (percent <= 10) return 'Cold';
    if (percent <= 40) return 'Cool';
    if (percent < 60) return 'Balanced';
    if (percent < 90) return 'Warmer';
    return 'Warm';
  }

  function relativeLuminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }

  function contrastRatio(first, second) {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function compositeOver(foreground, background, alpha) {
    const a = clamp01(alpha);
    const blend = (top, bottom) => Math.round(top * a + bottom * (1 - a));
    return Object.freeze({
      r: blend(foreground.r, background.r),
      g: blend(foreground.g, background.g),
      b: blend(foreground.b, background.b),
    });
  }

  const api = Object.freeze({
    STOPS,
    SURFACE,
    SLIDER_DEFAULT,
    sliderToPosition,
    hexToRgb,
    mixHex,
    paletteAt,
    toTriplet,
    colourValueText,
    relativeLuminance,
    contrastRatio,
    compositeOver,
  });

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { palette: api }));
})(typeof self !== 'undefined' ? self : globalThis);
