/* Mobile header controller: turns taps, drag-swipes, and keys into mobile-state events
   and renders the continuous pill-to-sheet glass menu. */
(function (root) {
  'use strict';

  const LANGUAGE_NAMES = Object.freeze({ en: 'English', pl: 'Polish', de: 'German' });
  const MESSAGES = Object.freeze({
    link: 'Demo link. Navigation is disabled in this standalone reference.',
    signedIn: 'Demo mode: signed in without credentials.',
    signedOut: 'Demo mode: signed out.',
  });
  const DRAG_THRESHOLD = 6;
  const REVEAL_MARGIN = 12;
  const REVEAL_FOLLOW_MS = 900;

  function requireChild(parent, selector) {
    const found = parent.querySelector(selector);
    if (!found) throw new Error('Mobile header markup is missing ' + selector);
    return found;
  }

  function createMobileHeader(options) {
    const demo = root.GlassHeaderDemo;
    const logic = demo && demo.mobileState;
    if (!logic) throw new Error('mobile-state.js must load before mobile-header.js');
    if (!options || !options.header) throw new TypeError('createMobileHeader needs a header element');

    const header = options.header;
    const live = options.live || null;
    const doc = header.ownerDocument;
    const burger = requireChild(header, '.ghm-burger');
    const sheet = requireChild(header, '.ghm-sheet');
    const currentCode = requireChild(header, '[data-lang-current]');
    const items = Array.from(header.querySelectorAll('.ghm-item'));
    const pops = Array.from(header.querySelectorAll('.ghm-pop'));
    const views = Array.from(header.querySelectorAll('.ghm-view'));
    const viewButtons = Array.from(header.querySelectorAll('[data-open-view]'));
    const subscribers = new Set();
    let state = logic.initialState();

    function say(message) {
      if (live) live.textContent = message;
    }

    function revealSection(item) {
      const nav = item.closest('.ghm-nav');
      if (!nav) return;
      const panel = requireChild(item, '.ghm-item__panel');
      const inner = requireChild(item, '.ghm-item__inner');
      const finalBottom = panel.getBoundingClientRect().top + inner.scrollHeight;
      const overflow = finalBottom + REVEAL_MARGIN - nav.getBoundingClientRect().bottom;
      if (overflow <= 0) return;
      const target = nav.scrollTop + overflow;
      const started = root.performance.now();
      function follow(now) {
        if (state.section !== item.dataset.section) return;
        nav.scrollTop = Math.min(target, nav.scrollHeight - nav.clientHeight);
        if (nav.scrollTop < target - 1 && now - started < REVEAL_FOLLOW_MS) root.requestAnimationFrame(follow);
      }
      root.requestAnimationFrame(follow);
    }

    function renderItems() {
      items.forEach((item) => {
        const open = state.section === item.dataset.section;
        if (open && !item.classList.contains('is-open')) {
          requireChild(item, '.ghm-cards').scrollLeft = 0;
          root.requestAnimationFrame(() => revealSection(item));
        }
        item.classList.toggle('is-open', open);
        requireChild(item, '.ghm-item__toggle').setAttribute('aria-expanded', String(open));
        requireChild(item, '.ghm-item__panel').toggleAttribute('inert', !open);
      });
      header.classList.toggle('has-section', Boolean(state.section));
    }

    function renderPopovers() {
      pops.forEach((pop) => {
        const open = state.popover === pop.dataset.pop;
        pop.classList.toggle('is-open', open);
        requireChild(pop, '[data-popover-toggle]').setAttribute('aria-expanded', String(open));
        requireChild(pop, '[data-popover]').toggleAttribute('inert', !open);
      });
    }

    function renderLanguage() {
      const labels = logic.labelsFor(state.language);
      header.setAttribute('lang', state.language);
      currentCode.textContent = logic.LANGUAGE_CODES[state.language];
      requireChild(header, '[data-popover-toggle="language"]').setAttribute('aria-label', 'Language: ' + LANGUAGE_NAMES[state.language]);
      header.querySelectorAll('[data-language]').forEach((button) => {
        button.parentElement.hidden = button.dataset.language === state.language;
      });
      header.querySelectorAll('[data-label]').forEach((label) => {
        label.textContent = labels[label.dataset.label];
      });
    }

    function renderAccount() {
      const signed = state.signedIn ? 'signed-in' : 'signed-out';
      header.dataset.account = signed;
      header.querySelectorAll('[data-when]').forEach((row) => {
        row.hidden = row.dataset.when !== signed;
      });
    }

    function render() {
      header.dataset.motion = state.motion;
      if (state.open && !header.classList.contains('is-open')) {
        const nav = header.querySelector('.ghm-nav');
        if (nav) nav.scrollTop = 0;
      }
      header.classList.toggle('is-open', state.open);
      burger.setAttribute('aria-expanded', String(state.open));
      burger.setAttribute('aria-label', state.open ? 'Close menu' : 'Open menu');
      sheet.toggleAttribute('inert', !state.open);
      header.dataset.view = state.view;
      views.forEach((view) => view.toggleAttribute('inert', !state.open || view.dataset.view !== state.view));
      viewButtons.forEach((button) => button.setAttribute('aria-expanded', String(state.open && state.view === button.dataset.openView)));
      renderItems();
      renderPopovers();
      renderLanguage();
      renderAccount();
    }

    function dispatch(event) {
      const next = logic.reduce(state, event);
      if (next === state) return;
      state = next;
      render();
      subscribers.forEach((notify) => notify(state));
    }

    function onAccountChoice(choice) {
      if (choice === 'sign-in' || choice === 'register') {
        dispatch({ type: 'SIGN_IN' });
        say(MESSAGES.signedIn);
        return;
      }
      if (choice === 'sign-out') {
        dispatch({ type: 'SIGN_OUT' });
        say(MESSAGES.signedOut);
        return;
      }
      dispatch({ type: 'CLOSE_POPOVER' });
      say(MESSAGES.link);
    }

    function bindControls() {
      burger.addEventListener('click', (event) => dispatch({ type: 'TOGGLE_MENU', keyboard: event.detail === 0 }));
      header.querySelectorAll('.ghm-item__toggle').forEach((toggle) => {
        toggle.addEventListener('click', () => dispatch({ type: 'TOGGLE_SECTION', section: toggle.dataset.section }));
      });
      header.querySelectorAll('[data-popover-toggle]').forEach((toggle) => {
        toggle.addEventListener('click', () => dispatch({ type: 'TOGGLE_POPOVER', popover: toggle.dataset.popoverToggle }));
      });
      header.querySelectorAll('[data-language]').forEach((button) => {
        button.addEventListener('click', () => {
          dispatch({ type: 'CHOOSE_LANGUAGE', language: button.dataset.language });
          requireChild(header, '[data-popover-toggle="language"]').focus({ preventScroll: true });
        });
      });
      header.querySelectorAll('[data-account]').forEach((button) => {
        button.addEventListener('click', () => onAccountChoice(button.dataset.account));
      });
      viewButtons.forEach((button) => {
        button.addEventListener('click', (event) => dispatch({ type: 'OPEN_VIEW', view: button.dataset.openView, keyboard: event.detail === 0 }));
      });
    }

    function bindDocument() {
      doc.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || (!state.open && !state.popover)) return;
        event.preventDefault();
        const hadPopover = state.popover;
        dispatch({ type: 'ESCAPE' });
        const target = hadPopover ? header.querySelector('[data-popover-toggle="' + hadPopover + '"]') : burger;
        if (target) target.focus({ preventScroll: true });
      });
      doc.addEventListener('pointerdown', (event) => {
        if (!state.popover) return;
        const pop = event.target && typeof event.target.closest === 'function' ? event.target.closest('.ghm-pop') : null;
        if (!pop || pop.dataset.pop !== state.popover) dispatch({ type: 'CLOSE_POPOVER' });
      });
    }

    function bindLinks() {
      header.addEventListener('click', (event) => {
        const link = event.target && typeof event.target.closest === 'function' ? event.target.closest('a[href]') : null;
        if (!link || !header.contains(link)) return;
        event.preventDefault();
        if (link.dataset.dragged === 'true') {
          delete link.dataset.dragged;
          return;
        }
        say(MESSAGES.link);
      });
    }

    function bindDragScroll(row) {
      let startX = 0;
      let startScroll = 0;
      let dragging = false;
      let moved = false;
      row.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        dragging = true;
        moved = false;
        startX = event.clientX;
        startScroll = row.scrollLeft;
      });
      row.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const distance = event.clientX - startX;
        if (!moved && Math.abs(distance) < DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          row.classList.add('is-dragging');
          row.setPointerCapture(event.pointerId);
        }
        row.scrollLeft = startScroll - distance;
      });
      const stop = (event) => {
        if (!dragging) return;
        dragging = false;
        row.classList.remove('is-dragging');
        if (moved) {
          const card = event.target && typeof event.target.closest === 'function' ? event.target.closest('a[href]') : null;
          if (card) card.dataset.dragged = 'true';
        }
      };
      row.addEventListener('pointerup', stop);
      row.addEventListener('pointercancel', stop);
      row.addEventListener('dragstart', (event) => event.preventDefault());
    }

    function bindSearch() {
      const searchIndex = demo && demo.searchIndex;
      const input = header.querySelector('[data-search-input]');
      if (!searchIndex || !input) return;
      const form = requireChild(header, '[data-search-form]');
      const heading = requireChild(header, '[data-search-heading]');
      const popular = requireChild(header, '[data-search-popular]');
      const results = requireChild(header, '[data-search-results]');
      const status = requireChild(header, '[data-search-status]');
      const index = searchIndex.buildIndex(Array.from(header.querySelectorAll('.ghm-card, [data-search-popular] a')).map((link) => {
        const item = link.closest('.ghm-item');
        const toggle = item ? item.querySelector('[data-label]') : null;
        return { label: (link.querySelector('span') || link).textContent, href: link.getAttribute('href'), group: toggle ? toggle.textContent : '' };
      }));

      function hit(item) {
        const li = doc.createElement('li');
        const link = doc.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        if (item.group) {
          const group = doc.createElement('span');
          group.className = 'ghm-links__group';
          group.textContent = item.group;
          link.append(group);
        }
        li.append(link);
        return li;
      }

      function show() {
        const typed = searchIndex.tokens(input.value).length > 0;
        const hits = typed ? searchIndex.search(index, input.value, 6) : [];
        popular.hidden = typed;
        results.hidden = !typed;
        heading.textContent = typed ? 'Results' : 'Popular searches';
        results.replaceChildren(...hits.map(hit));
        status.textContent = !typed ? '' : hits.length === 0 ? 'No results for this query.' : hits.length + ' results.';
      }

      input.addEventListener('input', show);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        input.blur();
      });
      subscribers.add((next) => {
        if (next.open && next.view === 'search' && doc.activeElement !== input) {
          root.setTimeout(() => input.focus({ preventScroll: true }), 380);
        }
      });
      show();
    }

    bindControls();
    bindSearch();
    bindDocument();
    bindLinks();
    header.querySelectorAll('.ghm-cards').forEach(bindDragScroll);
    render();

    return Object.freeze({
      getState: () => state,
      subscribe(notify) {
        subscribers.add(notify);
        return () => subscribers.delete(notify);
      },
      dispatch,
    });
  }

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { createMobileHeader }));
})(self);
