/* Desktop header controller: turns pointer, click, and keyboard input into menu-state events,
   manages the sliding nav highlight, local search index filtering, and demo account view. */
(function (root) {
  'use strict';

  const HOVER_DELAY = 130;
  const LEAVE_GRACE = 220;
  const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
  const FOCUSABLE = 'a[href], button:not([disabled])';
  const SELECTABLE = 'a[href], [data-demo-select]';
  const SELECTED = 'data-selected';
  const MESSAGES = Object.freeze({ selected: 'Selected: ', cleared: 'Cleared: ' });

  function requireChild(parent, selector) {
    const found = parent.querySelector(selector);
    if (!found) {
      throw new Error('Header markup is missing ' + selector);
    }
    return found;
  }

  function labelOf(element) {
    const label = element.getAttribute('aria-label') || element.textContent || '';
    return label.replace(/\s+/g, ' ').trim();
  }

  function createHeaderMenu(options) {
    const demo = root.GlassHeaderDemo;
    const menuState = demo && demo.menuState;
    if (!menuState) {
      throw new Error('menu-state.js must load before header-menu.js');
    }
    if (!options || !options.header) {
      throw new TypeError('createHeaderMenu needs a header element');
    }

    const header = options.header;
    const controls = options.controls || null;
    const live = options.live || null;
    const doc = header.ownerDocument;
    const nav = requireChild(header, '.desktop-nav');
    const content = requireChild(header, '.header-content');
    const closeButton = requireChild(header, '.header-close');
    const searchForm = header.querySelector('[data-search-form]');
    const entries = Array.from(nav.querySelectorAll('.gh-menu-entry'));
    const triggers = entries.map((entry) => requireChild(entry, '.gh-menu-destination'));
    const iconTriggers = Array.from(header.querySelectorAll('.header-actions [data-section]'));
    const allTriggers = triggers.concat(iconTriggers);
    const panes = Array.from(header.querySelectorAll('.menu-pane'));
    const hoverMedia = root.matchMedia(HOVER_QUERY);
    const subscribers = new Set();

    let state = menuState.initialState();
    let hoverTimer = 0;
    let leaveTimer = 0;

    function clearTimers() {
      root.clearTimeout(hoverTimer);
      root.clearTimeout(leaveTimer);
    }

    function isHoverPointer(event) {
      return event.pointerType === 'mouse' && hoverMedia.matches;
    }

    function hasKeyboardFocusInside() {
      const active = doc.activeElement;
      return Boolean(active && header.contains(active) && active.matches(':focus-visible'));
    }

    /* ---------- Rendering ---------- */

    function placePill(section, snap) {
      const entry = entries.find((candidate) => candidate.dataset.menu === section);
      if (!entry) return;
      const left = entry.offsetLeft;
      const right = Math.max(0, nav.clientWidth - left - entry.offsetWidth);
      if (snap) nav.setAttribute('data-pill-snap', '');
      nav.style.setProperty('--gh-pill-l', left + 'px');
      nav.style.setProperty('--gh-pill-r', right + 'px');
      if (snap) {
        nav.getBoundingClientRect();
        nav.removeAttribute('data-pill-snap');
      }
    }

    function renderPill(highlight) {
      if (!highlight) {
        nav.classList.remove('has-active-pill');
        return;
      }
      placePill(highlight, !nav.classList.contains('has-active-pill'));
      nav.classList.add('has-active-pill');
    }

    function heightFor(pane) {
      const style = root.getComputedStyle(content);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return Math.ceil(content.offsetTop + padding + pane.offsetHeight);
    }

    function fitHeights(section) {
      const slot = header.closest('.gh-slot');
      const tallest = panes.reduce((most, pane) => Math.max(most, heightFor(pane)), 0);
      if (slot && tallest > 0) slot.style.setProperty('--gh-slot-height', tallest + 'px');
      const active = panes.find((pane) => pane.dataset.pane === section);
      if (active) header.style.setProperty('--gh-open-frame-height', heightFor(active) + 'px');
    }

    function render(previous, next) {
      const open = next.view === 'menu';
      const searchOpen = open && next.section === 'search';
      if (open) fitHeights(next.section);
      header.dataset.view = next.view;
      header.dataset.motion = next.motion;
      header.classList.toggle('is-open', open);
      content.toggleAttribute('inert', !open);
      if (searchForm) searchForm.toggleAttribute('inert', !searchOpen);
      allTriggers.forEach((trigger) => {
        trigger.setAttribute('aria-expanded', String(open && trigger.dataset.section === next.section));
      });
      header.dataset.section = open ? next.section : '';
      panes.forEach((pane) => {
        const active = open && pane.dataset.pane === next.section;
        pane.classList.toggle('is-active', active);
        pane.toggleAttribute('inert', !active);
      });
      if (previous.highlight !== next.highlight) renderPill(next.highlight);
    }

    function dispatch(event) {
      const next = menuState.reduce(state, event);
      if (next === state) return;
      const previous = state;
      state = next;
      render(previous, next);
      subscribers.forEach((notify) => notify(next));
    }

    /* ---------- Focus helpers ---------- */

    function focusTrigger(section) {
      const trigger = allTriggers.find((candidate) => candidate.dataset.section === section);
      if (trigger) trigger.focus({ preventScroll: true });
    }

    function focusFirstInPane(section) {
      const pane = panes.find((candidate) => candidate.dataset.pane === section);
      const first = pane ? pane.querySelector(FOCUSABLE) : null;
      if (first) first.focus({ preventScroll: true });
    }

    /* ---------- Navigation labels ---------- */

    function onTriggerKeydown(event, index) {
      const section = triggers[index].dataset.section;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        clearTimers();
        dispatch({ type: 'KEY_OPEN', section });
        focusFirstInPane(section);
        return;
      }
      const nextIndex = menuState.roveIndex(event.key, index, triggers.length);
      if (nextIndex === null) return;
      event.preventDefault();
      triggers[nextIndex].focus({ preventScroll: true });
      dispatch({ type: 'FOCUS_SECTION', section: triggers[nextIndex].dataset.section });
    }

    function bindEntry(entry, index) {
      const section = entry.dataset.menu;
      entry.addEventListener('pointerenter', (event) => {
        if (!isHoverPointer(event)) return;
        clearTimers();
        dispatch({ type: 'ENTRY_ENTER', section });
        if (state.view === 'closed') {
          hoverTimer = root.setTimeout(() => dispatch({ type: 'ENTRY_INTENT', section }), HOVER_DELAY);
        }
      });
      entry.addEventListener('pointerleave', () => root.clearTimeout(hoverTimer));
      triggers[index].addEventListener('click', (event) => {
        clearTimers();
        dispatch({ type: 'ACTIVATE', section, keyboard: event.detail === 0 });
      });
      triggers[index].addEventListener('keydown', (event) => onTriggerKeydown(event, index));
    }

    function bindHeader() {
      nav.addEventListener('pointerleave', (event) => {
        if (!isHoverPointer(event)) return;
        root.clearTimeout(hoverTimer);
        dispatch({ type: 'NAV_LEAVE' });
      });
      header.addEventListener('pointerenter', () => root.clearTimeout(leaveTimer));
      header.addEventListener('pointerleave', (event) => {
        if (!isHoverPointer(event)) return;
        clearTimers();
        if (state.view !== 'menu') return;
        leaveTimer = root.setTimeout(() => {
          dispatch({ type: 'HEADER_LEAVE_TIMEOUT', focusInside: hasKeyboardFocusInside() });
        }, LEAVE_GRACE);
      });
      closeButton.addEventListener('click', (event) => {
        const section = state.section;
        clearTimers();
        dispatch({ type: 'CLOSE', keyboard: event.detail === 0 });
        focusTrigger(section);
      });
    }

    function bindDocument() {
      doc.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || state.view !== 'menu') return;
        event.preventDefault();
        const section = state.section;
        const focusInside = header.contains(doc.activeElement);
        clearTimers();
        dispatch({ type: 'ESCAPE' });
        if (focusInside) focusTrigger(section);
      });
      doc.addEventListener('pointerdown', (event) => {
        if (state.view !== 'menu') return;
        const target = event.target;
        if (header.contains(target) || (controls && controls.contains(target))) return;
        clearTimers();
        dispatch({ type: 'OUTSIDE' });
      });
    }

    /* ---------- Demo link selection (local, zero navigation) ---------- */

    function clearSelection(scope) {
      scope.querySelectorAll('[' + SELECTED + ']').forEach((element) => {
        element.removeAttribute(SELECTED);
        if (element.hasAttribute('aria-pressed')) element.setAttribute('aria-pressed', 'false');
      });
    }

    function toggleSelection(target) {
      const scope = target.closest('.menu-pane, .header-actions');
      const wasSelected = target.getAttribute(SELECTED) === 'true';
      if (scope) clearSelection(scope);
      if (scope && !wasSelected) {
        target.setAttribute(SELECTED, 'true');
        if (target.hasAttribute('aria-pressed')) target.setAttribute('aria-pressed', 'true');
      }
      if (live) live.textContent = (wasSelected ? MESSAGES.cleared : MESSAGES.selected) + labelOf(target);
    }

    function selectableFrom(event) {
      const origin = event.target;
      const target = origin && typeof origin.closest === 'function' ? origin.closest(SELECTABLE) : null;
      return target && header.contains(target) ? target : null;
    }

    function bindSelection() {
      header.addEventListener('click', (event) => {
        const target = selectableFrom(event);
        if (!target) return;
        event.preventDefault();
        toggleSelection(target);
      });
      header.addEventListener('auxclick', (event) => {
        if (selectableFrom(event)) event.preventDefault();
      });
    }

    /* ---------- Local search pane ---------- */

    function bindSearch() {
      const searchIndex = demo && demo.searchIndex;
      const input = header.querySelector('[data-search-input]');
      if (!searchIndex || !input || !searchForm) return;
      const heading = requireChild(header, '[data-search-heading]');
      const popular = requireChild(header, '[data-search-popular]');
      const results = requireChild(header, '[data-search-results]');
      const status = requireChild(header, '[data-search-status]');
      const sectionLabels = { products: 'Shop', catalogues: 'Catalogues', advice: 'Guides', services: 'Services' };
      const links = Array.from(header.querySelectorAll('.menu-pane--products a[href], .menu-pane--catalogues a[href], .menu-pane--advice a[href], .menu-pane--services a[href]'));
      const index = searchIndex.buildIndex(links.map((link) => {
        const pane = link.closest('.menu-pane');
        const group = pane ? (sectionLabels[pane.dataset.pane] || '') : '';
        return { label: labelOf(link), href: link.getAttribute('href'), group };
      }));

      function renderHit(item) {
        const li = doc.createElement('li');
        const link = doc.createElement('a');
        link.className = 'gh-nav-link gh-search__hit';
        link.href = item.href;
        link.textContent = item.label;
        if (item.group) {
          const group = doc.createElement('span');
          group.className = 'gh-search__group';
          group.textContent = item.group;
          link.append(group);
        }
        li.append(link);
        return li;
      }

      function update() {
        const typed = searchIndex.tokens(input.value).length > 0;
        const hits = typed ? searchIndex.search(index, input.value, 7) : [];
        popular.hidden = typed;
        results.hidden = !typed;
        heading.textContent = typed ? 'Matching destinations' : 'Popular searches';
        results.replaceChildren(...hits.map(renderHit));
        status.textContent = !typed ? '' : hits.length === 0 ? 'No matching items in this demo.' : hits.length + ' results.';
      }

      input.addEventListener('input', update);
      searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        update();
      });
      header.querySelectorAll('[data-query]').forEach((button) => {
        button.addEventListener('click', () => {
          input.value = button.dataset.query || '';
          update();
          input.focus({ preventScroll: true });
        });
      });
      subscribers.add((next) => {
        if (next.view === 'menu' && next.section === 'search' && doc.activeElement !== input) {
          root.setTimeout(() => input.focus({ preventScroll: true }), 260);
        }
      });
      update();
    }

    /* ---------- Demo account toggle ---------- */

    function bindAccount() {
      const guest = header.querySelector('[data-account-view="guest"]');
      const member = header.querySelector('[data-account-view="member"]');
      if (!guest || !member) return;
      header.querySelectorAll('[data-account-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const signedIn = button.dataset.accountAction === 'sign-in';
          guest.hidden = signedIn;
          member.hidden = !signedIn;
          if (live) live.textContent = signedIn ? 'Demo mode: signed in without credentials.' : 'Demo mode: signed out.';
        });
      });
    }

    function remeasure() {
      fitHeights(state.section);
      if (state.highlight) placePill(state.highlight, true);
    }

    function bindIcon(trigger) {
      trigger.addEventListener('click', (event) => {
        clearTimers();
        dispatch({ type: 'ACTIVATE', section: trigger.dataset.section, keyboard: event.detail === 0 });
      });
    }

    entries.forEach(bindEntry);
    iconTriggers.forEach(bindIcon);
    bindHeader();
    bindDocument();
    bindSelection();
    bindSearch();
    bindAccount();
    root.addEventListener('resize', remeasure);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(remeasure);
    render(state, state);
    fitHeights(null);
    root.addEventListener('load', remeasure);

    return Object.freeze({
      getState: () => state,
      subscribe(notify) {
        subscribers.add(notify);
        return () => subscribers.delete(notify);
      },
      remeasure,
      activate(section) {
        clearTimers();
        dispatch({ type: 'ACTIVATE', section, keyboard: false });
      },
    });
  }

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { createHeaderMenu }));
})(typeof self !== 'undefined' ? self : globalThis);
