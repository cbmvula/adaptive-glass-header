/* Entry point for mobile.html. The header ships inert and is enabled once every controller starts. */
(function (root) {
  'use strict';

  const doc = root.document;
  const START_FAILURE = 'The interactive demo could not start. Reload the page to try again.';

  function requireElement(selector) {
    const element = doc.querySelector(selector);
    if (!element) throw new Error('Page markup is missing ' + selector);
    return element;
  }

  function init() {
    const demo = root.GlassHeaderDemo;
    if (!demo || !demo.createMobileHeader || !demo.createStage || !demo.createBackground) {
      throw new Error('Demo scripts did not load');
    }
    const header = requireElement('.ghm-header');
    const mobile = demo.createMobileHeader({ header, live: requireElement('#gh-live') });
    demo.createStage({
      tokenTarget: doc.documentElement,
      blobs: Array.from(doc.querySelectorAll('.gh-blob')),
      floatLayer: requireElement('.gh-float'),
      header,
      colourInput: requireElement('#gh-colour'),
      speedInput: requireElement('#gh-speed'),
      note: requireElement('#gh-speed-note'),
      headerMenu: {
        getState: () => ({ view: mobile.getState().open ? 'menu' : 'closed' }),
        subscribe: mobile.subscribe,
      },
    });
    demo.createBackground({
      target: doc.documentElement,
      tones: requireElement('[data-bg-tones]'),
    });
    header.removeAttribute('inert');
  }

  function reportFailure(error) {
    root.console.error('Adaptive mobile header failed to start:', error);
    const note = doc.querySelector('#gh-speed-note');
    if (!note) return;
    note.textContent = START_FAILURE;
    note.hidden = false;
  }

  function run() {
    try {
      init();
    } catch (error) {
      reportFailure(error);
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})(self);
