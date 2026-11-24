/* Speed slider math and incommensurate drift paths for the colour field.
   Motion is a function of integrated phase so changing speed never jumps or restarts. */
(function (root) {
  'use strict';

  const SLIDER_MAX = 100;
  const SLIDER_DEFAULT = 50;
  const SPEED_MAX_RATE = 4;
  const SPEED_CURVE = 2;
  const FLOAT_FREQUENCY = 0.7;
  const SNAP_EPSILON = 0.0001;

  const BLOBS = Object.freeze([
    Object.freeze({ ax: 17, ay: 11, fx: 0.110, fy: 0.083, px: 0.0, py: 1.3, bx: 5, by: 4, gx: 0.237, gy: 0.191, sa: 0.07, sf: 0.071, sp: 0.4 }),
    Object.freeze({ ax: 15, ay: 12, fx: 0.091, fy: 0.127, px: 2.1, py: 0.6, bx: 6, by: 3, gx: 0.213, gy: 0.169, sa: 0.06, sf: 0.083, sp: 1.9 }),
    Object.freeze({ ax: 19, ay: 10, fx: 0.073, fy: 0.101, px: 4.0, py: 2.7, bx: 4, by: 5, gx: 0.181, gy: 0.223, sa: 0.08, sf: 0.059, sp: 3.1 }),
    Object.freeze({ ax: 12, ay: 9, fx: 0.139, fy: 0.067, px: 1.1, py: 3.9, bx: 5, by: 3, gx: 0.199, gy: 0.151, sa: 0.05, sf: 0.097, sp: 5.2 }),
    Object.freeze({ ax: 14, ay: 13, fx: 0.097, fy: 0.113, px: 5.3, py: 0.2, bx: 4, by: 4, gx: 0.229, gy: 0.173, sa: 0.07, sf: 0.067, sp: 2.4 }),
  ]);

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function sliderToUnit(value) {
    const number = Number(value);
    const safe = Number.isFinite(number) && value !== '' && value !== null ? number : SLIDER_DEFAULT;
    return clamp01(safe / SLIDER_MAX);
  }

  function speedRate(value) {
    return SPEED_MAX_RATE * Math.pow(sliderToUnit(value), SPEED_CURVE);
  }

  function speedValueText(value) {
    const percent = Math.round(sliderToUnit(value) * 100);
    if (percent === 0) return 'Still';
    if (percent <= 33) return 'Very slow';
    if (percent <= 66) return 'Slow';
    return 'Faster';
  }

  function driftAt(phase, index) {
    const blob = BLOBS[index];
    if (!blob) {
      throw new RangeError('No drift path for blob index ' + String(index));
    }
    const p = Number.isFinite(phase) ? phase : 0;
    return Object.freeze({
      x: blob.ax * Math.sin(blob.fx * p + blob.px) + blob.bx * Math.sin(blob.gx * p + blob.py),
      y: blob.ay * Math.cos(blob.fy * p + blob.py) + blob.by * Math.sin(blob.gy * p + blob.px),
      scale: 1 + blob.sa * Math.sin(blob.sf * p + blob.sp),
    });
  }

  function formatDrift(drift) {
    return 'translate3d(' + drift.x.toFixed(3) + 'vw, ' + drift.y.toFixed(3) + 'vh, 0) scale(' + drift.scale.toFixed(4) + ')';
  }

  function floatAt(phase) {
    return Math.sin(FLOAT_FREQUENCY * (Number.isFinite(phase) ? phase : 0));
  }

  function fitScale(viewportWidth, designWidth) {
    if (!(viewportWidth > 0) || !(designWidth > 0)) return 1;
    return Math.min(1, viewportWidth / designWidth);
  }

  function stepToward(current, target, deltaSeconds, tau) {
    if (!(deltaSeconds > 0)) return current;
    if (!(tau > 0)) return target;
    const next = current + (target - current) * (1 - Math.exp(-deltaSeconds / tau));
    return Math.abs(target - next) < SNAP_EPSILON ? target : next;
  }

  const api = Object.freeze({
    BLOBS,
    SPEED_MAX_RATE,
    speedRate,
    speedValueText,
    driftAt,
    formatDrift,
    floatAt,
    fitScale,
    stepToward,
  });

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { motion: api }));
})(typeof self !== 'undefined' ? self : globalThis);
