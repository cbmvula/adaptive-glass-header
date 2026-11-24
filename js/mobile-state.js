/* Mobile header interaction rules as a pure reducer: (state, event) -> state.
   One continuous glass sheet; inside it at most one accordion section or one utility popover
   is open at a time so expanding rows never collide with utility lists. */
(function (root) {
  'use strict';

  const SECTIONS = Object.freeze(['products', 'catalogues', 'advice', 'services']);
  const POPOVERS = Object.freeze(['language', 'account']);
  const VIEWS = Object.freeze(['menu', 'search', 'cart']);
  const LANGUAGES = Object.freeze(['en', 'pl', 'de']);
  const LANGUAGE_CODES = Object.freeze({ en: 'EN', pl: 'PL', de: 'DE' });

  const LABELS = Object.freeze({
    en: Object.freeze({ products: 'Shop', catalogues: 'Catalogues', advice: 'Guides', services: 'Services' }),
    pl: Object.freeze({ products: 'Sklep', catalogues: 'Katalogi', advice: 'Porady', services: 'Usługi' }),
    de: Object.freeze({ products: 'Shop', catalogues: 'Kataloge', advice: 'Ratgeber', services: 'Service' }),
  });

  const ACCOUNT_OPTIONS = Object.freeze({
    signedOut: Object.freeze(['sign-in', 'register']),
    signedIn: Object.freeze(['account', 'orders', 'saved', 'sign-out']),
  });

  const INITIAL = Object.freeze({
    open: false,
    view: 'menu',
    section: null,
    popover: null,
    language: 'en',
    signedIn: false,
    motion: 'standard',
  });

  function initialState() {
    return INITIAL;
  }

  function withChanges(state, changes) {
    const next = Object.freeze(Object.assign({}, state, changes));
    const same = Object.keys(next).every((key) => next[key] === state[key]);
    return same ? state : next;
  }

  function motionFor(event) {
    return event && event.keyboard ? 'instant' : 'standard';
  }

  function closedSheet(state, event) {
    return withChanges(state, { open: false, section: null, popover: null, motion: motionFor(event) });
  }

  const HANDLERS = Object.freeze({
    TOGGLE_MENU(state, event) {
      return state.open ? closedSheet(state, event) : withChanges(state, { open: true, view: 'menu', motion: motionFor(event) });
    },
    OPEN_VIEW(state, event) {
      if (!VIEWS.includes(event.view)) return state;
      if (state.open && state.view === event.view) return closedSheet(state, event);
      return withChanges(state, { open: true, view: event.view, section: null, popover: null, motion: motionFor(event) });
    },
    CLOSE(state, event) {
      return state.open ? closedSheet(state, event) : state;
    },
    ESCAPE(state) {
      if (state.popover) return withChanges(state, { popover: null, motion: 'instant' });
      return state.open ? closedSheet(state, { keyboard: true }) : state;
    },
    TOGGLE_SECTION(state, event) {
      if (!state.open || state.view !== 'menu' || !SECTIONS.includes(event.section)) return state;
      return withChanges(state, { section: state.section === event.section ? null : event.section, popover: null, motion: 'standard' });
    },
    TOGGLE_POPOVER(state, event) {
      if (!state.open || state.view !== 'menu' || !POPOVERS.includes(event.popover)) return state;
      const popover = state.popover === event.popover ? null : event.popover;
      return withChanges(state, { popover, section: popover ? null : state.section, motion: 'standard' });
    },
    CLOSE_POPOVER(state) {
      return state.popover ? withChanges(state, { popover: null }) : state;
    },
    CHOOSE_LANGUAGE(state, event) {
      if (!LANGUAGES.includes(event.language)) return state;
      return withChanges(state, { language: event.language, popover: null });
    },
    SIGN_IN(state) {
      return withChanges(state, { signedIn: true, popover: null });
    },
    SIGN_OUT(state) {
      return withChanges(state, { signedIn: false, popover: null });
    },
  });

  function reduce(state, event) {
    if (!event || typeof event.type !== 'string') return state;
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, event.type)) return state;
    return HANDLERS[event.type](state, event);
  }

  function otherLanguages(state) {
    return LANGUAGES.filter((language) => language !== state.language);
  }

  function accountOptions(state) {
    return state.signedIn ? ACCOUNT_OPTIONS.signedIn : ACCOUNT_OPTIONS.signedOut;
  }

  function labelsFor(language) {
    return Object.prototype.hasOwnProperty.call(LABELS, language) ? LABELS[language] : LABELS.en;
  }

  const api = Object.freeze({
    SECTIONS, POPOVERS, VIEWS, LANGUAGES, LANGUAGE_CODES, ACCOUNT_OPTIONS,
    initialState, reduce, otherLanguages, accountOptions, labelsFor,
  });

  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { mobileState: api }));
})(typeof self !== 'undefined' ? self : globalThis);
