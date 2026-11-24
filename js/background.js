/* Tone switch controller: swaps between light (smoke glass + white text)
   and dark (frost glass + dark text over dimmed colour field). */
(function (root) {
  'use strict';

  const TONES = Object.freeze(['light', 'dark']);
  const STEP = Object.freeze({ ArrowRight: 1, ArrowLeft: -1 });

  function optionAfter(options, current, key) {
    if (!Array.isArray(options) || options.length === 0) return null;
    if (!Object.prototype.hasOwnProperty.call(STEP, key)) return null;
    const index = options.indexOf(current);
    if (index === -1) return options[0];
    return options[Math.min(options.length - 1, Math.max(0, index + STEP[key]))];
  }

  const toneAfter = (current, key) => optionAfter(TONES, current, key);

  function createBackground(options) {
    if (!options || !options.target || !options.tones) {
      throw new TypeError('createBackground needs "target" and "tones"');
    }
    const { target, tones } = options;
    const buttons = Array.from(tones.querySelectorAll('[data-bg-tone]'));
    if (buttons.length !== TONES.length) {
      throw new Error('Tone switch needs one button per tone');
    }
    const initialTone = TONES.includes(target.dataset.tone) ? target.dataset.tone : TONES[0];
    let state = Object.freeze({ tone: initialTone });

    function show(changes) {
      const next = Object.freeze(Object.assign({}, state, changes));
      if (!TONES.includes(next.tone)) return;
      state = next;
      target.dataset.tone = state.tone;
      buttons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.getAttribute('data-bg-tone') === state.tone));
      });
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => show({ tone: button.getAttribute('data-bg-tone') }));
    });
    tones.addEventListener('keydown', (event) => {
      const next = toneAfter(state.tone, event.key);
      if (next === null) return;
      event.preventDefault();
      show({ tone: next });
      const active = buttons.find((button) => button.getAttribute('data-bg-tone') === next);
      if (active) active.focus();
    });

    show({});
    return Object.freeze({ getState: () => state, show });
  }

  const api = Object.freeze({ TONES, optionAfter, toneAfter });
  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { background: api, createBackground }));
})(typeof self !== 'undefined' ? self : globalThis);
