// Home: a bento grid that never scrolls. Clock + who is where, weather, the next 24 h of both agendas,
// Vélib', air quality, the house, music (only while a speaker plays) and a strip with "Tout éteindre".
// Press and hold the clock for the settings; tap a card to open its full screen.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function money(x) { return App.fmt.num((Math.round(x * 100) / 100).toFixed(2)); }
  function fmt1(x) { return x == null ? '–' : App.fmt.num(Math.round(x * 10) / 10); }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }

  // ------------------------------------------------------------ clock + people
  function greeting(h) { return h < 5 ? 'Bonne nuit.' : h < 12 ? 'Bonjour.' : h < 18 ? 'Bon après-midi.' : 'Bonsoir.'; }
  function clock() {
    var n = App.now();
    return '<div class="h-date">' + App.fmt.day(n) + ' ' + App.fmt.monthDay(n) + '</div>' +
      '<div class="h-time">' + App.fmt.time(n, false) + '<small>' + App.fmt.ampm(n) + '</small></div>' +
      '<div class="h-greet">' + greeting(n.getHours()) + '</div>';
  }
  function pills() {
    return D.people.map(function (p) {
      return '<div class="h-pill" style="' + App.pstyle(p) + '">' + App.avatar(p, 48, p.home ? '' : 'avatar--away') +
        '<span><b>' + App.esc(p.name) + '</b><small><i></i>' + App.esc(p.status || (p.home ? 'Maison' : 'Absent')) + '</small></span></div>';
    }).join('');
  }

  // The clock card is a sky: light blue at midday, golden at sunrise / sunset, dark at night, following the sun's elevation.
  // [elevation, top colour, bottom colour]
  var SKY = [
    [-18, [34, 30, 58], [26, 22, 32]],
    [-6, [59, 46, 85], [106, 60, 79]],
    [0, [224, 135, 90], [242, 178, 107]],
    [10, [127, 179, 230], [245, 217, 168]],
    [30, [110, 177, 240], [207, 230, 250]],
    [60, [90, 166, 238], [191, 224, 250]]
  ];
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  function rgbs(c) { return 'rgb(' + c.join(',') + ')'; }
  function lum(c) { return .3 * c[0] + .59 * c[1] + .11 * c[2]; }
  // Weather: [how much the sky is greyed, brightness]. Clouds and rain grey it out and darken it.
  var SKY_WX = {
    sunny: [0, 1], 'clear-night': [0, 1], partlycloudy: [.3, .98], cloudy: [.6, .92], fog: [.7, 1], windy: [.15, 1], 'windy-variant': [.3, .96], exceptional: [.5, .9],
    rainy: [.75, .78], pouring: [.85, .66], lightning: [.85, .62], 'lightning-rainy': [.85, .6], hail: [.8, .7], snowy: [.7, 1.04], 'snowy-rainy': [.75, .86]
  };
  function weathered(c, wx) {
    var g = lum(c), m = mix(c, [g, g, g], wx[0]);
    return m.map(function (v) { return Math.max(0, Math.min(255, Math.round(v * wx[1]))); });
  }
  function sky() {
    var el = D.extra.sunElev;
    if (el == null) el = D.extra.night === false ? 40 : -20;
    var i = 0;
    while (i < SKY.length - 2 && el > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1], t = Math.max(0, Math.min(1, (el - a[0]) / (b[0] - a[0])));
    var node = V.el && V.el.querySelector('.h-hero');
    if (!node) return;
    var wx = SKY_WX[D.weather.state] || [0, 1];
    var top = weathered(mix(a[1], b[1], t), wx), bottom = weathered(mix(a[2], b[2], t), wx);
    node.style.setProperty('--hg1', rgbs(top));
    node.style.setProperty('--hg2', rgbs(bottom));
    // dark text once the sky is bright
    node.style.setProperty('--hink', (lum(top) + lum(bottom)) / 2 > 135 ? '#14202E' : '#F4F4F2');
  }

  // ------------------------------------------------------------ weather
  // The main icon is an animated <img> (cheap); while the screen is touched it is swapped for its still version.
  function mainIcon(w) {
    var src = App.meteocon(D.weather.state);
    if (!src) return App.icon(w.cond, 60);
    return '<img class="hw-img" data-meteo="' + src + '" src="' + App.meteoSrc(src) + '" alt="" width="104" height="104">';
  }
  var HOUR_ICON = { sun: 'clear-day', moon: 'clear-night', partly: 'partly-cloudy-day', cloud: 'overcast', rain: 'rain' };
  var HOUR_NIGHT = { 'clear-day': 'clear-night', 'partly-cloudy-day': 'partly-cloudy-night' };
  function hourIcon(c, h) {
    var name = HOUR_ICON[c] || 'overcast';
    if ((h >= 21 || h < 7) && HOUR_NIGHT[name]) name = HOUR_NIGHT[name];
    return '<img class="hw-hi" src="meteocons/static/' + name + '.svg" alt="" width="40" height="40">';
  }

  // Météo-France warning (yellow / orange / red). Icons: Meteocons, same library as the main weather icon.
  var CODE = { jaune: 'yellow', orange: 'orange', rouge: 'red' };
  function meteoImg(name, cls) {
    var src = 'meteocons/' + name + '.svg';
    return '<img class="' + cls + '" data-meteo="' + src + '" src="' + App.meteoSrc(src) + '" alt="">';
  }
  function alertBlock() {
    var a = D.extra.alert;
    if (!a) return '';
    var level = a.level.toLowerCase();
    var names = a.items.slice(0, 2).map(function (i) { return App.esc(i.name); }).join(' · ') + (a.items.length > 2 ? ' +' + (a.items.length - 2) : '');
    return '<span class="hw-alert hw-alert--' + level + '">' + meteoImg('code-' + (CODE[level] || 'orange'), 'hw-al-i') +
      '<span><b>Alerte ' + level + '</b>' + (names ? ' · ' + names : '') + '</span></span>';
  }

  function weather() {
    var w = App.weatherNow(), ready = D.weather.state != null || !(App.ha && App.ha.enabled);
    var hours = App.hourly(5);
    return '<div class="hw-top"><div class="hw-left">' +
      '<div class="hw-row"><span class="hw-temp">' + (ready ? w.temp + '°' : '–') + '</span>' + mainIcon(w) + '</div>' +
      '<div class="hw-sum"><b>' + w.summary + '</b> · ' + w.lo + '° / ' + w.hi + '°</div></div>' + alertBlock() + '</div>' +
      '<div class="hw-hours">' + hours.map(function (h) {
        return '<div class="hw-h' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="hw-hl">' + h.label + '</span>' + hourIcon(h.c, h.h) +
          '<b>' + (ready ? h.t + '°' : '–') + '</b><small>' + (h.p >= 20 ? h.p + ' %' : '') + '</small></div>';
      }).join('') + '</div>';
  }

  // ------------------------------------------------------------ agenda: the next 24 h, one lane per person
  function agenda() {
    var now = App.now(), start = new Date(now); start.setMinutes(0, 0, 0);
    var span = 24 * 3600e3, list = App.upcoming(24);
    function pct(t) { return Math.max(0, Math.min(1, (t - start) / span)) * 100; }
    function bar(e, top, height, bg, ink) {
      var l = pct(e.start), r = pct(e.end), w = Math.min(Math.max(r - l, 1.5), 100 - l);
      return '<div class="ag-bar" data-ev="' + e.id + '" style="left:' + l + '%;width:' + w + '%;top:' + top + 'px;height:' + height + 'px;background:' + bg + ';color:' + ink + '">' +
        '<b>' + App.esc(e.title) + '</b><small>' + App.fmt.range(e.start, e.end) + '</small></div>';
    }
    var ids = D.people.map(function (p) { return p.id; }), bars = '', laneBg = '';
    ids.forEach(function (id, i) {
      var mine = list.filter(function (e) { return e.people.indexOf(id) > -1 && e.people.length < 2; });
      laneBg += '<div class="ag-lane" style="top:' + (i * 44) + 'px">' + (list.some(function (e) { return e.people.indexOf(id) > -1; }) ? '' : '<span>Rien de prévu</span>') + '</div>';
      mine.forEach(function (e) { var p = App.person(id); bars += bar(e, i * 44, 36, p.color, p.ink); });
    });
    list.filter(function (e) { return e.people.length > 1; }).forEach(function (e) {
      var cols = e.people.map(function (id) { return App.person(id).color; });
      var bg = 'linear-gradient(180deg,' + cols.map(function (c, i) { return c + ' ' + Math.round(i * 100 / cols.length) + '%,' + c + ' ' + Math.round((i + 1) * 100 / cols.length) + '%'; }).join(',') + ')';
      bars += bar(e, 0, (ids.length - 1) * 44 + 36, bg, '#111');
    });
    var grid = '';
    for (var k = 1; k < 8; k++) grid += '<i style="left:' + (k * 12.5) + '%"></i>';
    var axis = '';
    for (var j = 0; j <= 8; j++) axis += '<span>' + ((start.getHours() + j * 3) % 24) + 'h</span>';
    return '<div class="ag-head"><span class="label">Prochaines 24 h</span></div>' +
      '<div class="ag-body"><div class="ag-names">' + D.people.map(function (p) { return '<span style="' + App.pstyle(p) + '"><i></i>' + App.esc(p.name) + '</span>'; }).join('') + '</div>' +
      '<div class="ag-plot" style="height:' + ((ids.length - 1) * 44 + 36) + 'px">' + grid + laneBg + bars + '<u class="ag-now" style="left:' + pct(now) + '%"></u></div></div>' +
      '<div class="ag-axis"><span class="ag-pad"></span><div>' + axis + '</div></div>';
  }

  // ------------------------------------------------------------ Vélib', air, house, music, strip
  // Vélib' colours: electric = blue, mechanical = green.
  var VELIB_MECH = '122 181 29', VELIB_ELEC = '31 166 224';
  function velib() {
    var v = D.extra.velib;
    function n(x) { return x == null ? '–' : x; }
    return '<div class="label">Vélib’' + (v.name ? ' · ' + App.esc(v.name) : '') + '</div>' +
      '<div class="vl-row">' +
      '<div class="vl" style="--vl:' + VELIB_ELEC + '"><span>Électriques</span><b>' + n(v.ebike) + '</b></div>' +
      '<div class="vl" style="--vl:' + VELIB_MECH + '"><span>Mécaniques</span><b>' + n(v.mech) + '</b></div></div>';
  }

  function air() {
    var x = D.extra, a = x.aqi;
    var label = a == null ? '–' : a <= 50 ? 'Bon' : a <= 100 ? 'Moyen' : a <= 150 ? 'Dégradé' : a <= 200 ? 'Mauvais' : 'Très mauvais';
    var pos = a == null ? 0 : Math.min(a, 200) / 2;
    var pollen = x.pollen && x.pollen.length ? '<div class="air-pollen">Pollens · <b>' + x.pollen.map(function (p) { return App.esc(p.name + ' ' + p.level); }).join(' · ') + '</b></div>' : '';
    return '<div class="label">Qualité de l’air</div>' +
      '<div class="air-main"><b>' + label + '</b>' + (x.uv != null ? '<span>UV ' + fmt1(x.uv) + '</span>' : '') + '</div>' +
      '<div><div class="air-scale"><i style="left:' + pos + '%"></i></div>' + pollen + '</div>';
  }

  var VAC = { cleaning: 'Aspirateur en cours', returning: 'Aspirateur retourne à la base' };
  var ACMODE = { cool: 'Froid', heat: 'Chaud', dry: 'Déshumid.', fan_only: 'Ventil.', auto: 'Auto' };
  function house() {
    var lights = D.devices.filter(function (d) { return d.type === 'light' && d.on && !d.group; }).length;
    var vac = D.extra.vacuum;
    var heat = (D.climates || []).filter(function (c) { return c.kind === 'trv' && c.action === 'heating'; }).map(function (c) { return c.name; });
    var ac = (D.climates || []).filter(function (c) { return c.kind === 'ac' && c.available && c.mode !== 'off'; })[0];
    return '<div class="hs-head"><span class="label">Maison</span><span class="hs-go">Domotique ' + App.icon('right', 14) + '</span></div>' +
      '<div class="hs-body"><div><div class="hs-temp">' + fmt1(D.climate.current) + '°</div><div class="hs-sub">moyenne intérieure</div></div>' +
      '<div class="hs-chips"><span class="hs-chip hs-chip--l' + (lights ? '' : ' is-off') + '">' + (lights ? plural(lights, 'lumière allumée', 'lumières allumées') : 'Lumières éteintes') + '</span>' +
      (heat.length ? '<span class="hs-chip hs-chip--h">Chauffe · ' + App.esc(heat.join(', ')) + '</span>' : '') +
      (ac ? '<span class="hs-chip hs-chip--c">Clim allumée · ' + (ACMODE[ac.mode] || ac.mode) + '</span>' : '') +
      (vac && VAC[vac.state] ? '<span class="hs-chip hs-chip--v">' + VAC[vac.state] + '</span>' : '') + '</div></div>';
  }

  // Percentage of the current track already played.
  function musicPct() {
    var m = D.media, dur = m.duration || 0;
    if (!dur) return 0;
    var pos = m.playing && m.positionAt ? Math.min(dur, m.position + (Date.now() - m.positionAt) / 1000) : (m.position || 0);
    return Math.max(0, Math.min(100, Math.round(pos / dur * 1000) / 10));
  }
  function musicProgress() {
    if (App.current !== 'home' || !V.el || !D.media.anyPlaying) return;
    var fg = V.el.querySelector('.mu-fg');
    if (fg) fg.setAttribute('stroke-dasharray', musicPct() + ' 100');
  }

  function music() {
    var m = D.media;
    if (!m.anyPlaying) return '';
    var r = m.rooms, rooms = r.slice(0, 2).join(' · ') + (r.length > 2 ? ' +' + (r.length - 2) : '');
    // the outline of the card is the progress of the track (updated every second, see musicProgress)
    return '<svg class="mu-ring" aria-hidden="true"><rect class="mu-bg" x="2" y="2" rx="24" ry="24"/><rect class="mu-fg" x="2" y="2" rx="24" ry="24" pathLength="100" stroke-dasharray="' + musicPct() + ' 100"/></svg>' +
      '<div class="mu-rooms">' + App.esc(rooms) + '</div>' +
      '<div class="mu-now">' + (m.art ? '<img class="mu-art" src="' + App.esc(m.art) + '" alt="">' : '<span class="mu-art mu-art--none">' + App.icon('music', 26) + '</span>') +
      '<div class="mu-text"><div class="mu-title">' + App.esc(m.title || 'En lecture') + '</div><div class="mu-artist">' + App.esc(m.artist || '') + '</div></div></div>' +
      '<div class="mu-ctl"><button data-mact="prev" aria-label="Précédent">' + App.icon('left', 22) + '</button>' +
      '<button class="mu-play" data-mact="toggle" aria-label="Pause">' + App.icon('pause', 20) + '</button>' +
      '<button data-mact="next" aria-label="Suivant">' + App.icon('right', 22) + '</button></div>';
  }

  function lightsOn() { return D.devices.filter(function (d) { return d.type === 'light' && d.on && !d.group; }); }
  // Appliances: the outline of a running programme's pill is its progress bar; alerts are plain amber pills.
  var AP_ICON = { four: 'fire', linge: 'shirt', vaisselle: 'utensils', cafe: 'coffee', 'coffee-tray': 'coffee', 'coffee-beans': 'coffee' };
  var AP_NAME = { four: 'Four', linge: 'Lave-linge', vaisselle: 'Lave-vaisselle', cafe: 'Café' };
  function apList() {
    var out = (D.machines || []).map(function (m) {
      var mc = window.MACHINE_META[m.id], min = m.finish == null ? null : Math.max(0, Math.round((m.finish - App.now().getTime()) / 60000));
      var sub = m.status === 'done' ? 'terminé' + (m.note ? ' · ' + m.note : '') : (min != null ? (min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60 < 10 ? '0' : '') + min % 60 : min + ' min') : m.cur);
      return { id: m.id, machine: true, done: m.status === 'done', label: AP_NAME[m.id] || m.name, sub: sub, pct: m.pct, color: mc.color };
    });
    return out.concat(D.extra.appliances || []);
  }
  function appliances() {
    var list = apList(), shown = list.slice(0, 3), more = list.length - shown.length;
    return shown.map(function (a) {
      var icon = App.icon(AP_ICON[a.id] || 'warn', 18);
      var txt = '<b>' + App.esc(a.label) + '</b><small>' + App.esc(a.sub) + '</small>';
      if (a.kind === 'alert') return '<span class="ap ap--alert">' + App.icon('warn', 18) + txt + '</span>';
      if (a.done) return '<button class="ap ap--done" data-machine="' + a.id + '">' + App.icon('check', 18) + '<span class="ap-t">' + txt + '</span></button>';
      var ring = '<svg class="ap-ring" aria-hidden="true"><rect class="ap-bg" x="1" y="1" rx="22" ry="22"/>' +
        (a.pct != null ? '<rect class="ap-fg" x="1" y="1" rx="22" ry="22" pathLength="100" stroke-dasharray="' + a.pct + ' 100" style="stroke:' + a.color + '"/>' : '') + '</svg>';
      return '<button class="ap ap--run" data-machine="' + a.id + '" style="color:' + a.color + '">' + ring + icon + '<span class="ap-t">' + txt + '</span></button>';
    }).join('') + (more > 0 ? '<span class="ap ap--more">+' + more + '</span>' : '');
  }
  function foot() {
    var e = D.extra.energy, n = lightsOn().length;
    return '<div class="ft-aps">' + appliances() + '</div><div class="ft-bar">' +
      '<span class="ft-energy">Électricité · <b>' + fmt1(e.month) + ' kWh</b> ce mois · ' + (e.total == null ? '–' : '<b>' + money(e.total) + ' €</b>') + (e.sub ? ' <small>abonnement inclus</small>' : '') + '</span>' +
      '<button class="ft-off' + (n ? '' : ' is-off') + '" data-alloff>' + App.icon('bulb', 20) + 'Tout éteindre' + (n ? '<small>· ' + plural(n, 'lumière', 'lumières') + '</small>' : '') + '</button></div>';
  }

  // Each block is rebuilt only when its HTML actually changed (keeps animations and scrolling untouched).
  function put(sel, html) {
    if (V.cache[sel] === html) return;
    V.cache[sel] = html;
    V.el.querySelector(sel).innerHTML = html;
  }
  function paint() {
    V.cache = V.cache || {};
    sky();
    put('.h-pills', pills());
    put('.h-clock', clock());
    put('.h-weather', weather());
    put('.h-agenda', agenda());
    put('.h-velib', velib());
    put('.h-air', air());
    put('.h-house', house());
    var mu = music();
    put('.h-music', mu);
    V.el.firstChild.classList.toggle('has-music', !!mu);
    coverTint();
    put('.h-foot', foot());
  }

  // The music card takes the colours of the album cover (same extraction as the full-screen player).
  function coverTint() {
    var card = V.el.querySelector('.h-music'), url = D.media.anyPlaying ? (D.media.art || '') : '';
    if (V.tintUrl === url || !App.coverVars) return;
    V.tintUrl = url;
    App.coverVars(url, function (vars) { if (V.tintUrl === url) App.coverSet(card, vars); });
  }

  function allOff() {
    var on = lightsOn();
    if (!on.length) return;
    on.forEach(function (d) { d.on = false; if (App.ha && App.ha.enabled && App.ha.connected) App.ha.act('light', 'turn_off', d.id); });
    paint();
    App.toast(plural(on.length, 'lumière éteinte', 'lumières éteintes'), { icon: 'bulb' });
  }
  function mediaAct(a) {
    var h = App.ha;
    if (!h || !h.enabled || !h.connected) return;
    if (a === 'toggle') h.playPause(); else if (a === 'next') h.mediaNext(); else if (a === 'prev') h.mediaPrev();
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-hero"><div class="h-pills"></div><div class="h-clockbox"><div class="h-clock"></div></div></div>' +
          '<div class="h-weather card"></div>' +
          '<div class="h-agenda card" data-go="calendar"></div>' +
          '<div class="h-velib card"></div>' +
          '<div class="h-air card"></div>' +
          '<div class="h-house card" data-go="control"></div>' +
          '<div class="h-music card" data-go="player"></div>' +
          '<div class="h-foot card"></div>' +
          '</div>';
        // press and hold the clock: settings
        App.hold(el.querySelector('.h-clockbox'), 700, { done: App.openSettings });
        el.addEventListener('click', function (e) {
          var m = e.target.closest('[data-mact]');
          if (m) { mediaAct(m.dataset.mact); return; }
          if (e.target.closest('[data-alloff]')) { allOff(); return; }
          var mach = e.target.closest('[data-machine]');
          if (mach) { App.openMachine(mach.dataset.machine); return; }
          var ev = e.target.closest('[data-ev]');
          if (ev) { var evt = App.findEvent(ev.dataset.ev); if (evt && App.eventSheet) App.eventSheet(evt); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      paint();
    },
  });
  // Every minute: the clock and the agenda (moving "now" marker). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.cache = V.cache || {};
    sky();
    put('.h-clock', clock());
    put('.h-agenda', agenda());
    if (n.getMinutes() === 0) put('.h-weather', weather());
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
  App.on('second', musicProgress);
})();
