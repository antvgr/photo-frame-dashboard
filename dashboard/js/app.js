// Core shell: router, demo clock, idle/ambient, toasts, sheets, helpers.
(function () {
  'use strict';
  var D = window.DATA;
  var App = window.App = { state: D, views: {}, current: null, mode: 'day' };
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ------------------------------------------------------------ events
  var handlers = {};
  App.on = function (e, fn) { (handlers[e] = handlers[e] || []).push(fn); };
  App.emit = function (e, a) {
    if (e === 'data') window.__dataEvents = (window.__dataEvents || 0) + 1;
    (handlers[e] || []).forEach(function (fn) { fn(a); });
  };

  // ------------------------------------------------------------ time (demo clock)
  App.now = function () { return new Date(); };
  App.dayStart = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  App.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  App.sameDay = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  App.isNight = function () { var h = App.now().getHours(); return h >= 22 || h < 6; };

  var M = I18N.meta;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  App.fmt = {
    time: function (d, ampm) {
      var h = d.getHours(), m = d.getMinutes();
      if (M.clock24) return pad(h) + ':' + pad(m);
      var s = (h % 12 || 12) + ':' + pad(m);
      return ampm === false ? s : s + ' ' + (h >= 12 ? 'PM' : 'AM');
    },
    // "4 PM", "3:45 PM" (24-hour locales: "16 h", "15 h 45")
    hour: function (d) {
      var h = d.getHours(), m = d.getMinutes();
      if (M.clock24) return h + ' h' + (m ? ' ' + pad(m) : '');
      return (h % 12 || 12) + (m ? ':' + pad(m) : '') + ' ' + (h >= 12 ? 'PM' : 'AM');
    },
    // Hour-of-day label for the hourly forecast: "3p" / "15 h"
    hourShort: function (x) { return M.clock24 ? x + ' h' : (x % 12 || 12) + (x >= 12 ? 'p' : 'a'); },
    ampm: function (d) { return M.clock24 ? '' : d.getHours() >= 12 ? 'PM' : 'AM'; },
    range: function (a, b) {
      var same = M.clock24 || App.fmt.ampm(a) === App.fmt.ampm(b);
      return (same ? App.fmt.time(a, false) : App.fmt.time(a)) + ' – ' + App.fmt.time(b);
    },
    day: function (d) { return M.days[d.getDay()]; },
    dayShort: function (d) { return M.daysShort[d.getDay()]; },
    month: function (d) { return M.months[d.getMonth()]; },
    monthShort: function (d) { return M.monthsShort[d.getMonth()]; },
    // "Oct 12" / "12 oct."
    monthDay: function (d) { return M.dayFirst ? d.getDate() + ' ' + App.fmt.month(d) : App.fmt.month(d) + ' ' + d.getDate(); },
    monthDayShort: function (d) { return M.dayFirst ? d.getDate() + ' ' + App.fmt.monthShort(d) : App.fmt.monthShort(d) + ' ' + d.getDate(); },
    // "October 12, 2025" / "12 octobre 2025"
    fullDate: function (d) { return M.dayFirst ? App.fmt.monthDay(d) + ' ' + d.getFullYear() : App.fmt.monthDay(d) + ', ' + d.getFullYear(); },
    // Decimal separator: 20.5 → "20,5" in French
    num: function (x) { return String(x).replace('.', M.decimal); },
    mins: function (m) {
      m = Math.max(0, Math.round(m));
      if (m < 60) return T('{n} min', { n: m });
      var h = Math.floor(m / 60), r = m % 60;
      return r ? T('{h} hr {m} min', { h: h, m: r }) : T('{h} hr', { h: h });
    },
    rel: function (d) {
      var t = App.dayStart(App.now()), x = App.dayStart(d), diff = Math.round((x - t) / 864e5);
      if (diff === 0) return T('Today');
      if (diff === 1) return T('Tomorrow');
      if (diff === -1) return T('Yesterday');
      return M.days[d.getDay()];
    }
  };
  App.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ------------------------------------------------------------ icons + people
  // Font Awesome Free icons (see icons.js): drawn in a square box, centred, with a little padding.
  App.icon = function (name, size, cls) {
    size = size || 24;
    var ic = window.ICONS[name];
    if (!ic) return '';
    var side = Math.max(ic.w, ic.h) * 1.12;
    return '<svg class="i ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="' + ((ic.w - side) / 2) + ' ' + ((ic.h - side) / 2) + ' ' + side + ' ' + side + '" fill="currentColor" aria-hidden="true"><path d="' + ic.d + '"/></svg>';
  };
  App.person = function (id) {
    if (id === 'family' || id === 'any') return D.family;
    for (var i = 0; i < D.people.length; i++) if (D.people[i].id === id) return D.people[i];
    return D.family;
  };
  App.pstyle = function (p) {
    if (typeof p === 'string') p = App.person(p);
    return '--c:' + p.color + ';--c-rgb:' + p.rgb + ';--c-ink:' + p.ink;
  };
  // Round avatar: the Home Assistant photo when there is one (no initial, no colour disc behind it),
  // otherwise the initial on the person's colour. A photo that fails to load falls back to the initial.
  App.avatarFail = function (img) {
    var span = img.parentNode;
    span.classList.remove('avatar--photo');
    span.textContent = img.dataset.initial;
  };
  App.avatar = function (p, size, cls) {
    if (typeof p === 'string') p = App.person(p);
    size = size || 48;
    var initial = p.id === 'family' ? '★' : p.name[0];
    var dim = ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.46) + 'px';
    if (p.photo) {
      return '<span class="avatar avatar--photo ' + (cls || '') + '" style="' + App.pstyle(p) + dim + '"><img src="' + App.esc(p.photo) + '" alt="" data-initial="' + App.esc(initial) + '" onerror="App.avatarFail(this)"></span>';
    }
    return '<span class="avatar ' + (cls || '') + '" style="' + App.pstyle(p) + dim + '">' + initial + '</span>';
  };
  App.dots = function (ids, size) {
    return '<span class="dots">' + ids.map(function (id) { return '<i style="' + App.pstyle(id) + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '"></i>'; }).join('') + '</span>';
  };

  // Header of the secondary screens (agenda, domotique): back to the home screen, title, extra controls on the right.
  App.topbar = function (title, sub, right) {
    return '<header class="sh"><button class="sh-back" data-back>' + App.icon('left', 16) + 'Accueil</button>' +
      '<div class="sh-title"><b>' + title + '</b><small>' + sub + '</small></div><span class="sh-sp"></span>' + (right || '') + '</header>';
  };

  // ------------------------------------------------------------ calendar helpers
  App.events = function () {
    return D.events.slice();
  };
  App.isFamily = function (e) { return D.people.length > 1 && e.people.length >= D.people.length; };
  App.evColor = function (e) { return App.isFamily(e) ? D.family : App.person(e.people[0]); };
  App.timedOn = function (day, pid) {
    var s = App.dayStart(day), e = App.addDays(s, 1);
    return App.events().filter(function (ev) {
      return !ev.allDay && ev.start < e && ev.end > s && (!pid || ev.people.indexOf(pid) > -1);
    }).sort(function (a, b) { return a.start - b.start || b.end - a.end; });
  };
  App.allDayOn = function (day, pid) {
    var s = App.dayStart(day), e = App.addDays(s, 1);
    return App.events().filter(function (ev) {
      return ev.allDay && ev.start < e && ev.end > s && (!pid || ev.people.indexOf(pid) > -1);
    });
  };
  App.leaveBy = function (e) { return e.travel ? new Date(+e.start - e.travel * 60000) : e.start; };
  // The next thing someone needs to act on: earliest upcoming "leave by" today.
  // The next thing to act on. Up to two events when they start (almost) together for different people:
  //  - the SAME event in both agendas (same title, same start) is merged into one event for both people;
  //  - two different events within SIMULTANEOUS_MIN minutes of each other give two entries (one per person).
  var SIMULTANEOUS_MIN = 15;
  function sameEvent(x, y) {
    return x.title.trim().toLowerCase() === y.title.trim().toLowerCase() && Math.abs(x.start - y.start) < 60000;
  }
  App.nextEvents = function () {
    var now = App.now();
    var list = App.timedOn(now).filter(function (e) { return e.start > now; });
    list.sort(function (x, y) { return App.leaveBy(x) - App.leaveBy(y); });
    if (!list.length) return [];
    var t0 = App.leaveBy(list[0]), merged = [];
    list.forEach(function (e) {
      if (Math.abs(App.leaveBy(e) - t0) > SIMULTANEOUS_MIN * 60000) return;
      var twin = merged.filter(function (m) { return sameEvent(m, e); })[0];
      if (twin) { e.people.forEach(function (id) { if (twin.people.indexOf(id) < 0) twin.people.push(id); }); return; }
      merged.push(Object.assign({}, e, { people: e.people.slice() }));
    });
    // one card per person: skip an event whose people are already covered by an earlier card
    var out = [], covered = [];
    merged.forEach(function (e) {
      if (out.length >= 2) return;
      if (e.people.some(function (id) { return covered.indexOf(id) > -1; })) return;
      out.push(e); covered = covered.concat(e.people);
    });
    return out;
  };
  App.nextEvent = function () { return App.nextEvents()[0] || null; };
  // Timed events that overlap the next `hours` hours, earliest first. The same event in both agendas (same title and
  // start) is merged into a single entry for both people.
  App.upcoming = function (hours) {
    var now = App.now(), end = new Date(+now + hours * 3600e3), out = [];
    App.events().filter(function (e) { return !e.allDay && e.end > now && e.start < end; })
      .sort(function (x, y) { return x.start - y.start; })
      .forEach(function (e) {
        var twin = out.filter(function (m) { return sameEvent(m, e); })[0];
        if (twin) { e.people.forEach(function (id) { if (twin.people.indexOf(id) < 0) twin.people.push(id); }); return; }
        out.push(Object.assign({}, e, { people: e.people.slice() }));
      });
    return out;
  };
  App.findEvent = function (id) {
    return App.events().filter(function (e) { return e.id === id; })[0];
  };

  // ------------------------------------------------------------ chores + weather helpers
  App.weatherNow = function () {
    var W = D.weather, h = App.now().getHours();
    var rainAt = -1;
    for (var i = h; i < 24; i++) if (W.p[i] >= 50) { rainAt = i; break; }
    var summary, advice;
    if (rainAt === h) {
      var stop = h; while (stop < 24 && W.p[stop] >= 50) stop++;
      summary = T('Rain until {t}', { t: App.fmt.hour(new Date(2000, 0, 1, stop)) });
      advice = T('Umbrella weather');
    } else if (rainAt > -1) {
      summary = T('Rain from {t}', { t: App.fmt.hour(new Date(2000, 0, 1, rainAt)) });
      advice = T('Grab a rain jacket');
    } else {
      summary = W.t[h] < 12 ? T('Clear and cool') : T('Dry all day');
      advice = W.t[h] < 12 ? T('Jacket weather') : T('Light layers');
    }
    var labels = { sun: T('Sunny'), moon: T('Clear'), partly: T('Partly cloudy'), cloud: T('Overcast'), rain: T('Rain') };
    return { temp: W.t[h], cond: W.c[h], label: labels[W.c[h]], hi: W.hi, lo: W.lo, summary: summary, advice: advice, hour: h };
  };
  // Animated Meteocons (https://github.com/basmilius/meteocons, MIT) for a Home Assistant weather condition.
  var METEOCONS = {
    sunny: ['clear-day', 'clear-night'], 'clear-night': ['clear-night', 'clear-night'],
    partlycloudy: ['partly-cloudy-day', 'partly-cloudy-night'], cloudy: ['overcast', 'overcast'],
    fog: ['fog-day', 'fog-night'], rainy: ['rain', 'rain'], pouring: ['extreme-rain', 'extreme-rain'],
    lightning: ['thunderstorms-day', 'thunderstorms-night'], 'lightning-rainy': ['thunderstorms-day-rain', 'thunderstorms-night-rain'],
    snowy: ['snow', 'snow'], 'snowy-rainy': ['sleet', 'sleet'], hail: ['hail', 'hail'],
    windy: ['wind', 'wind'], 'windy-variant': ['wind', 'wind'], exceptional: ['not-available', 'not-available']
  };
  App.meteocon = function (state) {
    var m = METEOCONS[state];
    if (!m) return null;
    var n = D.extra && D.extra.night;
    var night = n == null ? App.isNight() : n;
    return 'meteocons/' + m[night ? 1 : 0] + '.svg';
  };
  // Animated file, or its still twin (meteocons/static/…) while animations are paused.
  App.meteoSrc = function (src) { return App.animPaused ? src.replace('meteocons/', 'meteocons/static/') : src; };
  App.hourly = function (count) {
    var W = D.weather, h = App.now().getHours(), out = [];
    for (var i = 0; i < count; i++) {
      var x = (h + i) % 24;
      out.push({ h: x, t: W.t[x], c: W.c[x], p: W.p[x], label: i === 0 ? T('Now') : App.fmt.hourShort(x) });
    }
    return out;
  };

  // ------------------------------------------------------------ router
  App.register = function (name, view) { App.views[name] = view; };
  // Views are built once and kept laid out (hidden with content-visibility), so switching tabs
  // only has to paint. A view is rebuilt when its data changed ('data'/'time' events) or, for
  // time-sensitive views (minutely: true), when the minute has rolled over since it was built.
  function minuteKey() { return Math.floor(App.now().getTime() / 60000); }
  function build(name, opts) {
    var view = App.views[name];
    window.__builds = (window.__builds || 0) + 1;
    view.show($('#view-' + name), opts || {});
    view._built = true; view._dirty = false; view._min = minuteKey();
  }
  App.go = function (name, opts) {
    opts = opts || {};
    if (!App.views[name]) name = 'home';
    if (App.current && App.current !== name && App.views[App.current].hide) App.views[App.current].hide();
    App.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.dataset.view === name); });
    App.$$('.rail-item').forEach(function (b) { b.classList.toggle('is-active', b.dataset.go === name); });
    App.current = name;
    $('#stage').dataset.view = name;
    var view = App.views[name];
    if (!view._built || view._dirty || opts.rerender || (view.minutely && view._min !== minuteKey())) build(name, opts);
    else if (view.resume) view.resume($('#view-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  };
  // Build a hidden view and lay it out now (cached by content-visibility; no paint happens).
  function prebuild(name) {
    var el = $('#view-' + name), view = App.views[name];
    build(name);
    if (view.hide) view.hide();
    el.classList.add('is-warming');
    el.offsetHeight;
    el.classList.remove('is-warming');
  }
  // Pre-build (startup) and re-build (after data changes) hidden views in the background, one per
  // slot, so navigating to them never pays the rebuild cost.
  var refreshTimer = null;
  function refreshStale(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function next() {
      var name = Object.keys(App.views).filter(function (k) {
        var v = App.views[k];
        return k !== App.current && (!v._built || v._dirty);
      })[0];
      if (!name) return;
      prebuild(name);
      refreshTimer = setTimeout(next, 400);
    }, delay);
  }
  function markStale() {
    Object.keys(App.views).forEach(function (k) { if (k !== App.current) App.views[k]._dirty = true; });
    refreshStale(1500);
  }
  App.on('data', markStale);
  App.on('time', markStale);
  App.rerender = function () {
    if (App.current) App.views[App.current].show($('#view-' + App.current), { rerender: true });
  };

  // ------------------------------------------------------------ toasts (single, with undo)
  var toastTimer;
  App.toast = function (html, opts) {
    opts = opts || {};
    var box = $('#toasts');
    box.innerHTML = '';
    clearTimeout(toastTimer);
    var ms = opts.ms || 5000;
    var t = document.createElement('div');
    t.className = 'toast' + (opts.tone ? ' toast--' + opts.tone : '');
    t.style.setProperty('--ms', ms + 'ms');
    t.innerHTML = (opts.icon ? App.icon(opts.icon, 26) : '') + '<span class="toast-msg">' + html + '</span>' +
      (opts.undo ? '<button class="toast-undo">' + App.icon('undo', 22) + T('Undo') + '</button>' : '');
    box.appendChild(t);
    t.classList.add('is-in');
    function kill() { t.remove(); }
    toastTimer = setTimeout(kill, ms);
    if (opts.undo) t.querySelector('.toast-undo').addEventListener('click', function () { clearTimeout(toastTimer); opts.undo(); kill(); });
  };

  // ------------------------------------------------------------ sheets (modal cards)
  App.sheet = function (html, opts) {
    opts = opts || {};
    var layer = $('#sheetLayer');
    layer.innerHTML = '<div class="sheet-scrim"></div><div class="sheet ' + (opts.cls || '') + '">' +
      '<button class="sheet-x" data-close aria-label="' + T('Close') + '">' + App.icon('x', 28) + '</button>' + html + '</div>';
    layer.classList.add('is-open');
    function close() {
      if (!layer.classList.contains('is-open')) return;
      layer.classList.remove('is-open');
      if (opts.onClose) opts.onClose();
      layer.innerHTML = '';
    }
    App.closeSheet = close;
    layer.querySelector('.sheet-scrim').addEventListener('click', close);
    App.$$('[data-close]', layer).forEach(function (b) { b.addEventListener('click', close); });
    if (opts.onMount) opts.onMount(layer.querySelector('.sheet'), close);
    return close;
  };
  App.closeSheet = function () {};

  // Stage-local coordinates for an element's center (stage may be scaled on desktop)
  App.centerOf = function (el) {
    var stage = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = stage.width / ($('#stage').offsetWidth || 1280);
    return { x: (r.left + r.width / 2 - stage.left) / k, y: (r.top + r.height / 2 - stage.top) / k };
  };

  // ------------------------------------------------------------ press-and-hold
  App.hold = function (el, ms, cb) {
    var t = null;
    el.style.setProperty('--hold', ms + 'ms');
    el.addEventListener('pointerdown', function () {
      if (cb.enabled && !cb.enabled()) return;
      el.classList.add('is-holding');
      t = setTimeout(function () { t = null; el.classList.remove('is-holding'); cb.done(); }, ms);
    });
    function cancel(e) {
      if (!t) return;
      clearTimeout(t); t = null;
      el.classList.remove('is-holding');
      if (cb.cancel && e.type === 'pointerup') cb.cancel();
    }
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
  };

  // ------------------------------------------------------------ modes: day / ambient / night
  App.setMode = function (m) {
    var stage = $('#stage');
    App.mode = m;
    stage.dataset.mode = m;
    App.emit('mode', m);
  };

  // ------------------------------------------------------------ theme: auto (dark after sunset) / light / dark
  var THEME_KEY = 'hq-theme';
  App.theme = 'auto';
  try { App.theme = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
  App.isDark = function () {
    if (App.theme === 'dark') return true;
    if (App.theme === 'light') return false;
    // Auto: dark at night (sun below the horizon) OR whenever the room itself is dark.
    var n = D.extra && D.extra.night;
    var night = n == null ? App.isNight() : n;
    return night || (App.light && App.light.dark === true);
  };
  App.applyTheme = function () {
    var dark = App.isDark();
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0E0E0F' : '#F2EEE6');
  };
  App.setTheme = function (t) {
    App.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    App.applyTheme();
  };
  App.on('minute', App.applyTheme);
  App.on('data', App.applyTheme);

  // ------------------------------------------------------------ idle
  App.idle = { home: 60, ambient: 120 };
  var idleSec = 0;
  function onIdleTick() {
    idleSec++;
    if (App.mode !== 'day') return;
    if (idleSec === App.idle.home && App.current !== 'home') { App.closeSheet(); App.go('home'); }
    if (idleSec >= App.idle.ambient) {
      App.closeSheet();
      App.go('home');
      App.setMode('ambient');
    }
  }
  App.resetIdle = function () { idleSec = 0; };

  // ------------------------------------------------------------ stage scaling (desktop preview only)
  // The frame can hang in landscape (1280×800) or portrait (800×1280): the stage takes the shape of the screen
  // and the layouts follow (data-orient on the stage, see the portrait blocks of the stylesheets).
  App.orient = 'landscape';
  function fit() {
    var stage = $('#stage'), portrait = window.innerHeight > window.innerWidth;
    var w = portrait ? 800 : 1280, h = portrait ? 1280 : 800;
    stage.style.setProperty('--sw', w + 'px');
    stage.style.setProperty('--sh', h + 'px');
    var o = portrait ? 'portrait' : 'landscape';
    if (stage.dataset.orient !== o) { stage.dataset.orient = o; App.orient = o; App.emit('orient', o); }
    var s = Math.min(window.innerWidth / w, window.innerHeight / h);
    stage.style.transform = Math.abs(s - 1) < 0.01 ? '' : 'scale(' + s + ')';
  }

  // ------------------------------------------------------------ clock tick
  var lastMin = -1;
  function tick() {
    var n = App.now();
    App.emit('second', n);
    if (n.getMinutes() !== lastMin) {
      lastMin = n.getMinutes();
      $('#railClock').innerHTML = '<b>' + App.fmt.time(n, false) + '</b><span>' + App.fmt.ampm(n) + '</span>';
      App.emit('minute', n);
    }
    onIdleTick();
  }

  // ------------------------------------------------------------ boot
  App.start = function () {
    fit();
    App.$$('[data-ico]').forEach(function (el) { el.innerHTML = App.icon(el.dataset.ico, 26); });
    App.applyTheme();
    window.addEventListener('resize', fit);
    // Switch tabs the instant a finger lands (pointerdown), not on release. Keyboard "clicks"
    // (detail === 0) still work.
    $('#rail').addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.button === 0) App.go(b.dataset.go);
    });
    $('#rail').addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b && e.detail === 0) App.go(b.dataset.go);
    });
    document.addEventListener('pointerdown', App.resetIdle, true);
    document.addEventListener('click', function (e) { if (e.target.closest('[data-back]')) App.go('home'); });
    // Animated icons pause while the screen is touched (and for 2.5 s after) so gestures stay smooth.
    var animTimer = null;
    function animate(on) {
      App.animPaused = !on;
      var st = document.getElementById('stage') || document.querySelector('.stage'); if (st) st.classList.toggle('anim-off', !on);
      App.$$('img[data-meteo]').forEach(function (im) { var s = App.meteoSrc(im.dataset.meteo); if (im.getAttribute('src') !== s) im.setAttribute('src', s); });
    }
    document.addEventListener('pointerdown', function () {
      if (!App.animPaused) animate(false);
      clearTimeout(animTimer);
      animTimer = setTimeout(function () { animate(true); }, 2500);
    }, true);
    window.addEventListener('hashchange', function () { App.go(location.hash.slice(1)); });
    App.go(location.hash.slice(1) || 'home');
    tick();
    setInterval(tick, 1000);
    App.emit('ready');
    refreshStale(1500);
  };
  document.addEventListener('DOMContentLoaded', function () { App.start(); });
})();
