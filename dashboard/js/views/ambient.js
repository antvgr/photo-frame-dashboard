// Ambient (standby) screen: almost black, the time very large, one line below with the outside weather
// and the next event of each person (only events in the next 24 h; an event shared by both is shown once).
(function () {
  'use strict';
  var D = window.DATA, $ = App.$;
  var shiftTimer = null;

  function pad2(x) { return (x < 10 ? '0' : '') + x; }
  function nextPerPerson() {
    var now = App.now(), covered = [], out = [];
    App.upcoming(24).filter(function (e) { return e.start > now; }).forEach(function (e) {
      if (out.length >= 2 || e.people.every(function (id) { return covered.indexOf(id) > -1; })) return;
      out.push(e); covered = covered.concat(e.people);
    });
    return out;
  }
  function when(e) {
    var n = App.now(), t = App.fmt.time(e.start, false);
    return App.sameDay(e.start, n) ? t : App.fmt.rel(e.start) + ' ' + t;
  }

  var AMB_NAME = { four: 'Four', linge: 'Lave-linge', vaisselle: 'Lave-vaisselle', cafe: 'Café' };
  function machinePills() {
    return (D.machines || []).slice(0, 3).map(function (m) {
      var mc = window.MACHINE_META[m.id], done = m.status === 'done', min = m.finish == null ? null : Math.max(0, Math.round((m.finish - App.now().getTime()) / 60000));
      var fin = done ? 'terminé' : (min != null ? m.cur + ' · fin dans ' + (min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60 < 10 ? '0' : '') + min % 60 : min + ' min') : m.cur);
      return '<span class="amb-m' + (done ? ' is-done' : '') + '" data-machine="' + m.id + '" style="--mc:' + (done ? '#4DE0A8' : mc.color) + '"><i>' + window.MACHINE_MINI[mc.art] + '</i><b>' + App.esc(AMB_NAME[m.id] || m.name) + '</b><small>' + App.esc(fin) + '</small></span>';
    }).join('');
  }
  function ambientInfo() {
    var n = App.now(), w = App.weatherNow(), src = App.meteocon(D.weather.state);
    var icon = src ? '<img src="' + src.replace('meteocons/', 'meteocons/static/') + '" alt="" width="52" height="52">' : App.icon(w.cond, 44);
    var evs = nextPerPerson().map(function (e) {
      return '<span class="amb-ev">' + App.dots(e.people.map(function (id) { return id; }), 10) + App.esc(when(e)) + '<small>' + App.esc(e.title) + '</small></span>';
    }).join('<span class="amb-sep"></span>');
    return '<div class="amb-clock"><div class="amb-date">' + App.fmt.day(n) + ' ' + App.fmt.monthDay(n) + '</div>' +
      '<div class="amb-time"><span>' + pad2(n.getHours()) + '</span><span>' + pad2(n.getMinutes()) + '</span></div></div>' +
      '<div class="amb-row"><span class="amb-wx">' + icon + '<b>' + w.temp + '°</b></span>' +
      (evs ? '<span class="amb-sep"></span>' + evs : '') + '</div>' +
      (D.machines && D.machines.length ? '<div class="amb-ms">' + machinePills() + '</div>' : '');
  }
  function paint() {
    if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = ambientInfo();
  }

  // Nudge static content a few px every minute so nothing sits still for hours (image retention)
  function pixelShift() {
    var x = Math.round(Math.random() * 8 - 4), y = Math.round(Math.random() * 8 - 4);
    App.$$('.amb-info').forEach(function (el) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; });
  }

  App.on('ready', function () {
    $('#ambient').innerHTML = '<div class="amb-info"></div>';
    $('#ambient').addEventListener('click', function (e) {
      var mp = e.target.closest('[data-machine]');
      App.setMode('day'); App.go('home');
      if (mp) App.openMachine(mp.dataset.machine);
    });
  });

  App.on('mode', function (m) {
    clearInterval(shiftTimer);
    if (m === 'ambient') { paint(); shiftTimer = setInterval(pixelShift, 60000); }
    App.resetIdle();
  });
  App.on('minute', paint);
  App.on('data', paint);
})();
