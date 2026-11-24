/* Entry point for index.html. The header ships inert and is enabled once every controller starts. */
(function (root) {
  'use strict';

  const doc = root.document;
  const START_FAILURE = 'The interactive demo could not start. Reload the page to try again.';

  function requireElement(selector) {
    const element = doc.querySelector(selector);
    if (!element) throw new Error('Page markup is missing ' + selector);
    return element;
  }

  function guardImage(image) {
    const markMissing = () => {
      if (image.parentElement) image.parentElement.classList.add('is-missing');
    };
    image.addEventListener('error', markMissing, { once: true });
    if (image.complete && image.naturalWidth === 0) markMissing();
  }

  function init() {
    const demo = root.GlassHeaderDemo;
    if (!demo || !demo.createHeaderMenu || !demo.createStage || !demo.createBackground) {
      throw new Error('Demo scripts did not load');
    }
    const header = requireElement('.gh-header');
    const headerMenu = demo.createHeaderMenu({
      header,
      controls: requireElement('.gh-controls'),
      live: requireElement('#gh-live'),
    });
    demo.createStage({
      tokenTarget: doc.documentElement,
      blobs: Array.from(doc.querySelectorAll('.gh-blob')),
      floatLayer: requireElement('.gh-float'),
      header,
      colourInput: requireElement('#gh-colour'),
      speedInput: requireElement('#gh-speed'),
      note: requireElement('#gh-speed-note'),
      headerMenu,
    });
    demo.createBackground({
      target: doc.documentElement,
      tones: requireElement('[data-bg-tones]'),
    });
    header.querySelectorAll('.menu-pane img').forEach(guardImage);
    header.removeAttribute('inert');
  }

  function reportFailure(error) {
    root.console.error('Adaptive glass header failed to start:', error);
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
