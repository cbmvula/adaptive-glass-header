/* Desktop header interaction rules as a pure reducer: (state, event) -> state.
   Hover opens a navigation section transiently; click or keyboard pins it open until dismissed.
   States are immutable and no-op events return the previous state by reference. */
(function (root) {
  'use strict';

  const SECTIONS = Object.freeze(['products', 'catalogues', 'advice', 'services']);
  const ICON_SECTIONS = Object.freeze(['search', 'account', 'cart']);
  const PANES = Object.freeze(SECTIONS.concat(ICON_SECTIONS));
  const SECTION_EVENTS = Object.freeze(['ENTRY_ENTER', 'ENTRY_INTENT', 'ACTIVATE', 'KEY_OPEN', 'FOCUS_SECTION']);

  const CLOSED = Object.freeze({
    view: 'closed',
    section: null,
    highlight: null,
    pinned: false,
    viaHover: false,
    motion: 'standard',
  });

  function initialState() {
    return CLOSED;
  }

  function isSection(value) {
    return PANES.includes(value);
  }

  function highlightFor(section) {
    return SECTIONS.includes(section) ? section : null;
  }

  function closed(motion) {
    return motion === CLOSED.motion ? CLOSED : Object.freeze(Object.assign({}, CLOSED, { motion }));
  }

  function opened(section, pinned, motion, viaHover) {
    return Object.freeze({ view: 'menu', section, highlight: highlightFor(section), pinned, viaHover: Boolean(viaHover), motion });
  }

  function isSame(a, b) {
    return a.view === b.view && a.section === b.section && a.highlight === b.highlight
      && a.pinned === b.pinned && a.viaHover === b.viaHover && a.motion === b.motion;
  }

  const HANDLERS = Object.freeze({
    ENTRY_ENTER(state, event) {
      if (!SECTIONS.includes(event.section)) return state;
      if (state.view === 'menu' && ICON_SECTIONS.includes(state.section)) return state;
      if (state.view === 'menu') {
        const moved = state.section !== event.section;
        return opened(event.section, state.pinned, 'standard', moved || state.viaHover);
      }
      return Object.freeze(Object.assign({}, CLOSED, { highlight: event.section }));
    },
    ENTRY_INTENT(state, event) {
      if (!SECTIONS.includes(event.section)) return state;
      if (state.view !== 'closed' || state.highlight !== event.section) return state;
      return opened(event.section, false, 'standard', true);
    },
    NAV_LEAVE(state) {
      return state.view === 'closed' ? closed('standard') : state;
    },
    ACTIVATE(state, event) {
      const motion = event.keyboard ? 'instant' : 'standard';
      const isCurrent = state.view === 'menu' && state.section === event.section;
      if (isCurrent && event.section === 'search') return state;
      if (isCurrent && state.pinned && !state.viaHover) return closed(motion);
      return opened(event.section, true, motion);
    },
    KEY_OPEN(state, event) {
      return opened(event.section, true, 'instant');
    },
    FOCUS_SECTION(state, event) {
      if (!SECTIONS.includes(event.section)) return state;
      return state.view === 'menu' ? opened(event.section, true, 'instant') : state;
    },
    HEADER_LEAVE_TIMEOUT(state, event) {
      if (state.view !== 'menu' || state.pinned || event.focusInside) return state;
      return closed('standard');
    },
    ESCAPE() {
      return closed('instant');
    },
    OUTSIDE(state) {
      return state.view === 'menu' ? closed('standard') : state;
    },
    CLOSE(state, event) {
      return state.view === 'menu' ? closed(event.keyboard ? 'instant' : 'standard') : state;
    },
  });

  function reduce(state, event) {
    if (!event || typeof event.type !== 'string') return state;
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, event.type)) return state;
    if (SECTION_EVENTS.includes(event.type) && !isSection(event.section)) return state;
    const next = HANDLERS[event.type](state, event);
    return isSame(state, next) ? state : next;
  }

  function roveIndex(key, index, count) {
    if (!(count > 0)) return null;
    if (key === 'ArrowRight') return (index + 1) % count;
    if (key === 'ArrowLeft') return (index - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return null;
  }

  const api = Object.freeze({ SECTIONS, ICON_SECTIONS, PANES, initialState, reduce, roveIndex });
  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { menuState: api }));
})(typeof self !== 'undefined' ? self : globalThis);
