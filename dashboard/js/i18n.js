// Internationalisation. English strings are the keys: T('Leave in {t}', { t: '12 min' }).
// A locale (js/locales/<code>.js) registers { name, meta, strings } with I18N.register();
// a missing key falls back to the English text, so a partial translation never breaks the UI.
// Changing language reloads the page (the kiosk is a single page, and mock data is localised at load).
(function () {
  'use strict';
  var KEY = 'hq-lang';
  var EN_META = {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dowLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],
    clock24: false,
    dayFirst: false,
    decimal: '.'
  };
  var locales = { en: { name: 'English', meta: EN_META, strings: {} } };

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function pick() {
    var saved = read();
    if (saved && locales[saved]) return saved;
    var nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return locales[nav] ? nav : 'en';
  }

  var I18N = window.I18N = {
    lang: 'en',
    locales: locales,
    register: function (code, def) { locales[code] = def; },
    // Called once every locale file has registered (see main.js).
    init: function () {
      I18N.lang = pick();
      document.documentElement.lang = I18N.lang;
      I18N.meta = locales[I18N.lang].meta;
      var strings = locales[I18N.lang].strings;
      window.T = I18N.t = function (key, vars) {
        // 'key|one' is the singular form (used when vars.n === 1); 'key|context' disambiguates a short label.
        var has = function (k) { return Object.prototype.hasOwnProperty.call(strings, k); };
        var s = vars && vars.n === 1 && has(key + '|one') ? strings[key + '|one'] : has(key) ? strings[key] : key.replace(/\|\w+$/, '');
        if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
        return s;
      };
      // Static markup in index.html: data-i18n (text) and data-i18n-aria (aria-label); the page title goes through T() too
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = I18N.t(el.getAttribute('data-i18n')); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) { el.setAttribute('aria-label', I18N.t(el.getAttribute('data-i18n-aria'))); });
      document.title = I18N.t(document.title);
    },
    setLang: function (code) {
      if (!locales[code] || code === I18N.lang) return;
      try { localStorage.setItem(KEY, code); } catch (e) {}
      location.reload();
    },
    list: function () { return Object.keys(locales).map(function (c) { return { code: c, name: locales[c].name }; }); }
  };
})();
