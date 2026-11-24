/* Local client-side search index over the destinations present in the header.
   Diacritic- and case-insensitive (including Polish ł/Ł); zero network calls. */
(function (root) {
  'use strict';

  const MAX_QUERY = 80;
  const DEFAULT_LIMIT = 6;

  function fold(text) {
    return String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .toLowerCase();
  }

  function tokens(query) {
    if (typeof query !== 'string') return [];
    return fold(query.slice(0, MAX_QUERY)).split(/[^a-z0-9]+/).filter(Boolean);
  }

  function buildIndex(items) {
    if (!Array.isArray(items)) return Object.freeze([]);
    const seen = new Set();
    const index = [];
    items.forEach((item) => {
      if (!item || typeof item.label !== 'string' || typeof item.href !== 'string') return;
      const label = item.label.replace(/\s+/g, ' ').trim();
      const key = fold(label);
      if (!label || seen.has(key)) return;
      seen.add(key);
      index.push(Object.freeze({ label, href: item.href, group: String(item.group || ''), key }));
    });
    return Object.freeze(index);
  }

  function search(index, query, limit) {
    const words = tokens(query);
    if (words.length === 0 || !Array.isArray(index)) return Object.freeze([]);
    const max = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
    const hits = index.filter((item) => words.every((word) => item.key.includes(word)));
    const rank = (item) => (item.key.startsWith(words[0]) || item.key.includes(' ' + words[0]) ? 0 : 1);
    const ordered = hits.map((item, order) => ({ item, order })).sort((a, b) => rank(a.item) - rank(b.item) || a.order - b.order);
    return Object.freeze(ordered.slice(0, max).map((entry) => entry.item));
  }

  const api = Object.freeze({ MAX_QUERY, fold, tokens, buildIndex, search });
  root.GlassHeaderDemo = Object.freeze(Object.assign({}, root.GlassHeaderDemo, { searchIndex: api }));
})(typeof self !== 'undefined' ? self : globalThis);
