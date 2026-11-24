/* Stage controller: colour/speed sliders, drifting OKLab colour field, and subtle header float.
   Honours prefers-reduced-motion: stops drift and float while keeping colour adjustment active. */
(function (root) {
  'use strict';

  const FLOAT_PIXELS = 3;
  const RATE_TAU = 0.14;
  const FLOAT_TAU = 0.25;
  const MAX_FRAME_SECONDS = 0.064;
  const FLOAT_MAX_RATE = 1;
  const DESIGN_MIN_WIDTH = 1182;
  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  const REQUIRED = Object.freeze(['tokenTarget', 'floatLayer', 'header', 'colourInput', 'speedInput', 'note', 'headerMenu']);

  function validate(options, motion) {
    if (!options) throw new TypeError('createStage needs an options object');
    REQUIRED.forEach((key) => {
      if (!options[key]) throw new TypeError('createStage is missing "' + key + '"');
    });
    if (!Array.isArray(options.blobs) || options.blobs.length !== motion.BLOBS.length) {
      throw new TypeError('createStage needs exactly ' + motion.BLOBS.length + ' blob elements');
    }
  }

  function createStage(options) {
    const demo = root.GlassHeaderDemo;
    const palette = demo && demo.palette;
    const motion = demo && demo.motion;
    if (!palette || !motion) {
      throw new Error('palette.js and motion.js must load before stage.js');
    }
    validate(options, motion);

    const { tokenTarget, blobs, floatLayer, header, colourInput, speedInput, note, headerMenu } = options;
    const doc = header.ownerDocument;
    const reduced = root.matchMedia(REDUCED_QUERY);

    let phase = 0;
    let floatPhase = 0;
    let rate = 0;
    let targetRate = 0;
    let floatAmount = 0;
    let floatTarget = 1;
    let pointerInside = false;
    let lastTime = 0;
    let frame = 0;
    let running = false;

    function paint() {
      blobs.forEach((blob, index) => {
        blob.style.transform = motion.formatDrift(motion.driftAt(phase, index));
      });
      const offset = reduced.matches ? 0 : motion.floatAt(floatPhase) * floatAmount * FLOAT_PIXELS;
      floatLayer.style.transform = 'translate3d(0, ' + offset.toFixed(2) + 'px, 0)';
    }

    function isAtRest() {
      return targetRate === 0 && rate === 0 && floatAmount === floatTarget;
    }

    function tick(time) {
      const delta = lastTime ? Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS) : 0;
      lastTime = time;
      rate = motion.stepToward(rate, targetRate, delta, RATE_TAU);
      floatAmount = motion.stepToward(floatAmount, floatTarget, delta, FLOAT_TAU);
      phase += delta * rate;
      floatPhase += delta * Math.min(rate, FLOAT_MAX_RATE);
      paint();
      if (isAtRest()) {
        running = false;
        frame = 0;
        return;
      }
      frame = root.requestAnimationFrame(tick);
    }

    function start() {
      if (running || reduced.matches || doc.hidden) return;
      running = true;
      lastTime = 0;
      frame = root.requestAnimationFrame(tick);
    }

    function stop() {
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0;
      running = false;
    }

    function applyFit() {
      const scale = motion.fitScale(doc.documentElement.clientWidth, DESIGN_MIN_WIDTH);
      tokenTarget.style.setProperty('--gh-fit', scale.toFixed(4));
    }

    function applyColour() {
      const colours = palette.paletteAt(palette.sliderToPosition(colourInput.value));
      const style = tokenTarget.style;
      style.setProperty('--gh-stage-a', palette.toTriplet(colours.stageA));
      style.setProperty('--gh-stage-b', palette.toTriplet(colours.stageB));
      colours.blobs.forEach((rgb, index) => {
        style.setProperty('--gh-blob-' + (index + 1), palette.toTriplet(rgb));
      });
      colourInput.setAttribute('aria-valuetext', palette.colourValueText(colourInput.value));
    }

    function applySpeed() {
      targetRate = motion.speedRate(speedInput.value);
      speedInput.setAttribute('aria-valuetext', motion.speedValueText(speedInput.value));
      start();
    }

    function updateFloatTarget() {
      const active = doc.activeElement;
      const keyboardFocus = Boolean(active && header.contains(active) && active.matches(':focus-visible'));
      const engaged = headerMenu.getState().view === 'menu' || pointerInside || keyboardFocus;
      floatTarget = engaged ? 0 : 1;
      start();
    }

    function applyMotionPreference() {
      const isReduced = reduced.matches;
      speedInput.disabled = isReduced;
      note.hidden = !isReduced;
      if (isReduced) {
        speedInput.setAttribute('aria-describedby', note.id);
        stop();
        rate = 0;
        paint();
        return;
      }
      speedInput.removeAttribute('aria-describedby');
      applySpeed();
    }

    root.addEventListener('resize', applyFit);
    colourInput.addEventListener('input', applyColour);
    speedInput.addEventListener('input', applySpeed);
    header.addEventListener('pointerenter', () => {
      pointerInside = true;
      updateFloatTarget();
    });
    header.addEventListener('pointerleave', () => {
      pointerInside = false;
      updateFloatTarget();
    });
    header.addEventListener('focusin', updateFloatTarget);
    header.addEventListener('focusout', updateFloatTarget);
    headerMenu.subscribe(updateFloatTarget);
    reduced.addEventListener('change', applyMotionPreference);
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) stop();
      else start();
    });

    applyFit();
    applyColour();
    paint();
    applyMotionPreference();

    return Object.freeze({
      getRate: () => rate,
      isRunning: () => running,
    });
  }

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { createStage }));
})(typeof self !== 'undefined' ? self : globalThis);
