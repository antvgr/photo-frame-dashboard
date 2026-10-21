// Machines (full screen): the oven, the washing machine, the dishwasher and the coffee machine while they run
// (and for a while after the end of a cycle). One machine = one big page; two or three = a split view;
// a touch on a card enlarges it (back button returns to the list). Opened from the pills of the home screen or of the standby screen.
(function () {
  'use strict';
  var D = window.DATA, V = { el: null, sel: 'all', cache: '' };

  function meta(id) { return window.MACHINE_META[id] || window.MACHINE_META.cafe; }
  function minutesLeft(m) {
    if (m.finish == null) return null;
    return Math.max(0, Math.round((m.finish - App.now().getTime()) / 60000));
  }
  function dur(min) {
    if (min >= 60) { var h = Math.floor(min / 60), r = min % 60; return { n: h + ' h' + (r ? ' ' + (r < 10 ? '0' : '') + r : ''), u: '' }; }
    return { n: String(min), u: 'min' };
  }

  // which illustration goes with the current step
  var STAGE = { 'Prélavage': 'pre', 'Lavage': 'wash', 'Rinçage': 'rinse', 'Essorage': 'spin', 'Séchage': 'dry', 'Préchauffage': 'pre', 'Cuisson': 'cook' };
  function stageOf(m) {
    if (m.status === 'done') return 'done';
    var now = m.steps.filter(function (s) { return s[1] === 'now'; })[0];
    return (now && STAGE[now[0]]) || (m.kind === 'coffee' ? 'brew' : 'wash');
  }

  // ------------------------------------------------------------ pieces
  function ring(m, mc) {
    var r = 104, c = 2 * Math.PI * r, pct = m.pct == null ? (m.status === 'done' ? 100 : 0) : m.pct;
    return '<div class="mc-ring"><svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="' + r + '" class="mc-r0"/>' +
      '<circle cx="110" cy="110" r="' + r + '" class="mc-r1" style="stroke:' + (m.status === 'done' ? '#4DE0A8' : mc.color) + ';stroke-dasharray:' + (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>' +
      '<div class="mc-art">' + window.machineStage(mc.art, stageOf(m), 'page' + m.id) + '</div>' +
      (m.status === 'done' ? '<span class="mc-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' : '') + '</div>';
  }
  function dot(st, color) {
    if (st === 'done') return '<span class="mc-dot is-done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
    if (st === 'now') return '<span class="mc-dot is-now"><i class="mc-pop" style="border-color:' + color + '"></i><i class="mc-pulse" style="background:' + color + '"></i></span>';
    return '<span class="mc-dot is-todo"><i></i></span>';
  }
  function stepsV(m, mc) {
    return '<div class="mc-stepsv">' + m.steps.map(function (s) { return '<div class="mc-step is-' + s[1] + '">' + dot(s[1], mc.color) + '<span>' + s[0] + (s[2] ? '<small>' + App.esc(s[2]) + '</small>' : '') + '</span></div>'; }).join('') + '</div>';
  }
  function stepsH(m, mc) {
    return '<div class="mc-stepsh">' + m.steps.map(function (s, i) {
      return '<div class="mc-step is-' + s[1] + '">' + (i ? '<u style="background:' + (s[1] === 'todo' ? '' : mc.color) + '"></u>' : '') + dot(s[1], mc.color) + '<span>' + s[0] + (s[2] ? '<small>' + App.esc(s[2]) + '</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function info(m, mc, mode) {
    var min = minutesLeft(m), big, unit = '', fin;
    if (m.status === 'done') {
      big = 'Terminé';
      var ago = Math.max(1, Math.round((App.now().getTime() - (m.doneAt || App.now().getTime())) / 60000));
      fin = (m.note ? m.note + ' · ' : '') + 'depuis ' + (ago >= 60 ? Math.floor(ago / 60) + ' h' : ago + ' min');
    } else if (m.kind === 'coffee') {
      big = m.cur; fin = m.pct != null ? m.pct + ' %' : 'en préparation';
    } else if (min != null) {
      var d = dur(min); big = d.n; unit = d.u;
      fin = 'fin ' + hhmm(new Date(m.finish)) + (m.pct != null ? ' · ' + m.pct + ' %' : '');
    } else if (m.kind === 'oven' && m.temp != null) {
      big = Math.round(m.temp) + '°'; fin = (m.set != null ? 'consigne ' + Math.round(m.set) + '°' : '') + (m.pct != null ? ' · ' + m.pct + ' %' : '');
    } else { big = m.cur || 'En cours'; fin = m.pct != null ? m.pct + ' %' : ''; }
    var small = m.status === 'done' || m.kind === 'coffee' || (min == null && m.kind !== 'oven');
    var portrait = App.orient === 'portrait';
    var steps = !m.steps.length ? '' : (mode === 'big' && !portrait ? stepsV(m, mc) : stepsH(m, mc));
    return '<div class="mc-info">' +
      (mode === 'big' ? '<div class="mc-lbl">' + (m.status === 'done' ? 'Cycle' : 'Temps restant') + '</div>' : '') +
      '<div class="mc-big' + (small ? ' is-small' : '') + '"><b>' + App.esc(big) + '</b>' + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      '<div class="mc-fin" style="color:' + (m.status === 'done' ? '#4DE0A8' : mc.color) + '">' + App.esc(fin) + '</div>' +
      steps + (m.chips.length ? '<div class="mc-chips">' + m.chips.map(function (c) { return '<span>' + App.esc(c) + '</span>'; }).join('') + '</div>' : '') + '</div>';
  }
  function hhmm(d) { return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }

  function card(m, mode) {
    var mc = meta(m.id);
    var head = mode === 'big' ? '' : '<div class="mc-head"><b>' + App.esc(m.name) + '</b><span style="color:' + (m.status === 'done' ? '#4DE0A8' : mc.color) + '">' + App.esc(m.cur) + '</span></div>';
    return '<div class="mc-card mc-card--' + mode + (m.status === 'done' ? ' is-done' : '') + '" ' + (mode === 'big' ? '' : 'data-open="' + m.id + '" ') +
      'style="--mc:' + mc.color + ';--mcbg:' + mc.bg + '">' + head + ring(m, mc) + info(m, mc, mode) + '</div>';
  }

  // ------------------------------------------------------------ page
  function build() {
    var list = D.machines || [];
    if (V.sel !== 'all' && !list.some(function (m) { return m.id === V.sel; })) V.sel = 'all';
    if (list.length === 1) V.sel = list[0].id;
    var running = list.filter(function (m) { return m.status === 'run'; }).length;
    var sub = !list.length ? 'Rien en marche' : running + ' en marche' + (list.length > running ? ' · ' + (list.length - running) + ' terminé' + (list.length - running > 1 ? 's' : '') : '') + (V.sel === 'all' && list.length > 1 ? ' · toucher pour agrandir' : '');
    var title = V.sel !== 'all' ? list.filter(function (m) { return m.id === V.sel; })[0].name : 'Électroménager';
    var body;
    if (!list.length) {
      body = '<div class="mc-empty"><b>Aucune machine en marche</b><span>Les cycles en cours et terminés apparaîtront ici.</span></div>';
    } else if (V.sel !== 'all') {
      body = '<div class="mc-body">' + card(list.filter(function (m) { return m.id === V.sel; })[0], 'big') + '</div>';
    } else {
      var shown = list.slice(0, 3), n = shown.length, portrait = App.orient === 'portrait';
      body = '<div class="mc-body mc-n' + n + '">' + shown.map(function (m) { return card(m, portrait ? 'row' : 'col'); }).join('') + '</div>';
    }
    var bar = App.topbar(App.esc(title), sub, '');
    if (V.sel !== 'all' && list.length > 1) bar = bar.replace('<button class="sh-back" data-back>', '<button class="sh-back" data-mlist>').replace('Accueil</button>', 'Électroménager</button>');
    return '<div class="mc">' + bar + body + '</div>';
  }

  function paint() {
    if (!V.el) return;
    var html = build();
    if (html === V.cache) return;
    V.cache = html;
    V.el.innerHTML = html;
  }

  App.openMachine = function (id) { V.sel = id || 'all'; V.cache = ''; App.go('machines', { rerender: true }); };

  App.register('machines', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.addEventListener('click', function (e) {
          var t = e.target.closest('[data-mlist]');
          if (t) { V.sel = 'all'; V.cache = ''; return paint(); }
          t = e.target.closest('[data-open]');
          if (t) { V.sel = t.dataset.open; V.cache = ''; paint(); }
        });
      }
      V.cache = '';
      paint();
    }
  });
  App.on('data', function () { if (App.current === 'machines') paint(); });
  App.on('minute', function () { if (App.current === 'machines') paint(); });
  App.on('orient', function () { V.cache = ''; if (App.current === 'machines') paint(); });
})();
