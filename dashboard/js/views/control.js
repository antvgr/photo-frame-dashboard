// Home control: scenes, rooms (lights with their temperature), heating + air conditioning, vacuum, music.
// State comes from Home Assistant (ha.js); every action is sent back as a service call.
(function () {
  'use strict';
  var D = window.DATA;
  var V = { el: null, scene: null, busy: false, ctab: null };

  function dev(id) { return D.devices.filter(function (d) { return d.id === id; })[0]; }
  function live() { return !!(App.ha && App.ha.enabled && App.ha.connected); }
  function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
  function t1(x) { return x == null ? '–' : App.fmt.num(Math.round(x * 10) / 10); }

  // Optimistic update: flip the row immediately; Home Assistant's state_changed confirms (or corrects) it.
  App.setDevice = function (id, patch) {
    var d = dev(id);
    if (!d) return;
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    if (live()) {
      if (patch.on === false) App.ha.act('light', 'turn_off', id);
      else App.ha.act('light', 'turn_on', id, patch.level != null && patch.level < 100 ? { brightness_pct: patch.level } : {});
    }
    paintTile(id);
    paintPart('.hc-head', header());
  };

  // ------------------------------------------------------------ pieces
  var VAC = { cleaning: 'Nettoie', docked: 'À la base', returning: 'Retourne à la base', paused: 'En pause', idle: 'Au repos', error: 'Erreur' };

  function lightsOn() { return D.devices.filter(function (d) { return d.on && !d.group; }); }

  function header() {
    var n = lightsOn().length, c = D.climate.current;
    return App.topbar('Maison', plural(n, 'lumière allumée', 'lumières allumées') + (c != null ? ' · ' + t1(c) + '° à l’intérieur' : ''),
      '<button class="btn btn--solid sh-btn' + (n ? '' : ' is-off') + '" data-alloff>' + App.icon('bulb', 20) + 'Tout éteindre</button>');
  }

  function tile(d) {
    return '<div class="tile tile--light' + (d.on ? ' is-on' : '') + '" data-dev="' + d.id + '" style="--lvl:' + (d.on ? d.level : 0) + '%">' +
      '<span class="tile-fill"></span>' +
      '<span class="tile-icon">' + App.icon('bulb', 17) + '</span>' +
      '<span class="tile-name">' + App.esc(d.name) + '</span>' +
      '<span class="tile-state">' + (d.on ? (d.dimmable === false ? 'Allumée' : d.level + ' %') : 'Éteinte') + '</span></div>';
  }

  function scenes() {
    return D.scenes.map(function (s) {
      return '<button class="scene' + (V.scene === s.id ? ' is-on' : '') + '" data-scene="' + s.id + '">' + App.icon(s.icon, 18) + '<span>' + App.esc(s.name) + '</span></button>';
    }).join('');
  }

  function roomCount(room) {
    var on = D.devices.filter(function (d) { return d.room === room && d.on && !d.group; }).length;
    return on ? on + (on > 1 ? ' allumées' : ' allumée') : 'Tout est éteint';
  }
  function rooms() {
    if (!D.rooms.length) return '<p class="hc-empty">Aucune lumière disponible.</p>';
    return D.rooms.map(function (r) {
      var list = D.devices.filter(function (d) { return d.room === r.id && !d.group; });
      var on = list.some(function (d) { return d.on; });
      return '<section class="room"><div class="room-h"><div><h3>' + App.esc(r.name) + '</h3><span class="room-n' + (on ? ' is-on' : '') + '" data-room-count="' + r.id + '">' + roomCount(r.id) + '</span></div>' +
        '<div class="room-r">' + (r.temp != null ? '<span class="room-t">' + t1(r.temp) + '°</span>' : '') +
        '<button class="room-sw' + (on ? ' is-on' : '') + '" data-room="' + r.id + '" aria-label="Toute la pièce">' + App.icon('bulb', 20) + '</button></div></div>' +
        '<div class="tiles">' + list.map(tile).join('') + '</div></section>';
    }).join('');
  }

  // ---- heating / air conditioning: one tab per device
  var HVAC = { heat: 'Chauffe', auto: 'Auto', off: 'Éteint', cool: 'Froid', dry: 'Déshumid.', fan_only: 'Ventil.' };
  var AC_ORDER = ['cool', 'heat', 'dry', 'fan_only', 'auto', 'off'];
  var FAN = { silent: 'Silence', low: 'Faible', medium: 'Moyen', high: 'Fort', full: 'Max', auto: 'Auto' };
  function current() {
    var list = D.climates || [];
    return list.filter(function (c) { return c.id === V.ctab; })[0] || list[0] || null;
  }
  function climate() {
    var list = D.climates || [], c = current();
    if (!c) return '';
    var tabs = '<div class="ctabs">' + list.map(function (x) {
      return '<button class="ctab' + (x.id === c.id ? ' is-on' : '') + (x.available ? '' : ' is-na') + '" data-ctab="' + x.id + '"><small>' + App.esc(x.name) + '</small><b>' + (x.current != null ? t1(x.current) + '°' : '–') + '</b></button>';
    }).join('') + '</div>';
    var body;
    if (!c.available) {
      body = '<p class="hc-empty">' + App.esc(c.name) + ' : indisponible pour le moment.</p>';
    } else {
      var off = c.mode === 'off';
      var setRow = '<div class="th-main"><button class="th-btn" data-temp="-1" aria-label="Moins">' + App.icon('minus', 22) + '</button>' +
        '<div class="th-set"><b class="num">' + (c.set != null && !off ? t1(c.set) + '°' : '–') + '</b><small>Consigne · ' + App.esc(c.name) + '</small></div>' +
        '<button class="th-btn" data-temp="1" aria-label="Plus">' + App.icon('plus', 22) + '</button></div>';
      if (c.kind === 'ac') {
        var modes = AC_ORDER.filter(function (m) { return c.modes.indexOf(m) > -1; });
        var fans = ['silent', 'medium', 'high', 'auto'].filter(function (m) { return c.fanModes.indexOf(m) > -1; });
        if (!fans.length) fans = c.fanModes.slice(0, 4);
        body = setRow + '<div class="mode-grid">' + modes.map(function (m) {
          return '<button class="mode mode--' + m + (c.mode === m ? ' is-on' : '') + '" data-cmode="' + m + '">' + HVAC[m] + '</button>';
        }).join('') + '</div>' +
          (fans.length ? '<div class="fan-row"><span>Ventilation</span><div class="seg seg--small">' + fans.map(function (m) {
            return '<button class="' + (c.fan === m ? 'is-on' : '') + '" data-fan="' + m + '">' + (FAN[m] || m) + '</button>';
          }).join('') + '</div></div>' : '');
      } else {
        var w = D.weather.t[App.now().getHours()];
        var verb = off ? 'Éteint' : c.action === 'heating' ? 'Chauffe' : 'Au repos';
        body = setRow + '<div class="th-now"><span><b class="num">' + t1(c.current) + '°</b> mesuré</span><span class="th-verb th-verb--' + (c.action === 'heating' && !off ? 'heating' : 'idle') + '">' + verb + '</span>' +
          (w != null ? '<span><b class="num">' + Math.round(w) + '°</b> dehors</span>' : '') + '</div>' +
          '<div class="seg seg--dark">' + ['heat', 'auto', 'off'].filter(function (m) { return !c.modes.length || c.modes.indexOf(m) > -1; }).map(function (m) {
            return '<button class="' + (c.mode === m ? 'is-on' : '') + '" data-cmode="' + m + '">' + HVAC[m] + '</button>';
          }).join('') + '</div>';
      }
    }
    return '<div class="label">Chauffage et climatisation</div>' + tabs + '<div class="cbody">' + body + '</div>';
  }

  function vacuumCard() {
    var v = D.extra.vacuum;
    if (!v) return '';
    var busy = v.state === 'cleaning' || v.state === 'returning';
    return '<div class="vac-h"><span class="label">Aspirateur · ' + App.esc(v.name) + '</span><b class="vac-st' + (busy ? ' is-on' : '') + '">' + (VAC[v.state] || v.state) + '</b></div>' +
      '<div class="vac"><button class="btn' + (busy ? '' : ' btn--solid') + '" data-vac="' + (busy ? 'pause' : 'start') + '">' + (busy ? 'Pause' : 'Lancer') + '</button>' +
      '<button class="btn" data-vac="return_to_base">Retour base</button></div>';
  }

  // Music: only while a speaker plays. Tapping the card opens the full-screen player.
  function media() {
    var m = D.media;
    if (!m.anyPlaying) return '';
    var r = m.rooms || [];
    return (m.art ? '<img class="np-art" src="' + App.esc(m.art) + '" alt="">' : '<span class="np-art"></span>') +
      '<div class="np-text"><span class="np-rooms">' + App.esc(r.slice(0, 2).join(' · ') + (r.length > 2 ? ' +' + (r.length - 2) : '')) + '</span><b>' + App.esc(m.title || 'En lecture') + '</b><span>' + App.esc(m.artist || '') + '</span></div>' +
      '<button class="np-btn" data-play aria-label="Lecture / pause">' + App.icon(m.playing ? 'pause' : 'play', 18) + '</button>';
  }

  // Granular repaints: a full paint() rebuilds a lot of nodes, which is slow on the frame.
  function paintTile(id) {
    var d = dev(id);
    if (!d) return;
    var root = V.el && V.el.querySelector('.hc-rooms');
    var old = root && root.querySelector('[data-dev="' + id + '"]');
    if (old) {
      var tmp = document.createElement('div');
      tmp.innerHTML = tile(d);
      var nt = tmp.firstChild;
      old.parentNode.replaceChild(nt, old);
      bindTile(nt);
    }
    var c = V.el && V.el.querySelector('[data-room-count="' + d.room + '"]');
    var anyOn = D.devices.some(function (x) { return x.room === d.room && x.on && !x.group; });
    if (c) { c.textContent = roomCount(d.room); c.classList.toggle('is-on', anyOn); }
    var sw = V.el && V.el.querySelector('[data-room="' + d.room + '"]');
    if (sw) sw.classList.toggle('is-on', anyOn);
  }
  function paintPart(sel, html) { if (!V.el) return; V.cache = V.cache || {}; V.cache[sel] = html; V.el.querySelector(sel).innerHTML = html; }

  // Each block is rebuilt only when its HTML changed.
  function put(sel, html, after) {
    if (V.cache[sel] === html) return;
    V.cache[sel] = html;
    var node = V.el.querySelector(sel), st = node.scrollTop;
    node.innerHTML = html;
    node.scrollTop = st;
    if (after) after(node);
  }
  function paint() {
    if (!V.el) return;
    V.cache = V.cache || {};
    put('.hc-head', header());
    put('.hc-scenes', scenes());
    put('.hc-rooms', rooms(), bindTiles);
    put('.hc-climate', climate());
    put('.hc-cams', vacuumCard());
    var mu = media();
    put('.hc-media', mu);
    V.el.querySelector('.hc-media').style.display = mu ? '' : 'none';
    V.el.querySelector('.hc-right').classList.toggle('has-media', !!mu);
    V.el.querySelector('.hc-cams').style.display = D.extra.vacuum ? '' : 'none';
  }

  // ------------------------------------------------------------ light rows: tap toggles, horizontal drag sets the level
  function sliderTile(t, d) {
    var sx = null, startLvl, dragging = false, w;
    t.addEventListener('pointerdown', function (e) {
      sx = e.clientX; dragging = false; V.busy = true; w = t.getBoundingClientRect().width;
      startLvl = d.on ? d.level : 0;
      try { t.setPointerCapture(e.pointerId); } catch (err) {}
    });
    t.addEventListener('pointermove', function (e) {
      if (sx == null || d.dimmable === false) return;
      var dx = e.clientX - sx;
      if (!dragging && Math.abs(dx) > 10) { dragging = true; t.classList.add('is-drag'); }
      if (!dragging) return;
      var lvl = Math.max(0, Math.min(100, Math.round(startLvl + dx / w * 100)));
      t.style.setProperty('--lvl', lvl + '%');
      t.classList.toggle('is-on', lvl > 0);
      t.querySelector('.tile-state').textContent = lvl ? lvl + ' %' : 'Éteinte';
      t._lvl = lvl;
    });
    t.addEventListener('pointerup', function () {
      V.busy = false;
      if (sx == null) return;
      sx = null;
      t.classList.remove('is-drag');
      V.scene = null;
      if (dragging) App.setDevice(d.id, t._lvl ? { on: true, level: t._lvl } : { on: false });
      else App.setDevice(d.id, { on: !d.on, level: d.level || 100 });
    });
    t.addEventListener('pointercancel', function () { V.busy = false; sx = null; t.classList.remove('is-drag'); paintTile(d.id); });
  }
  function bindTiles(root) { App.$$('[data-dev]', root).forEach(bindTile); }
  function bindTile(t) { var d = dev(t.dataset.dev); if (d) sliderTile(t, d); }

  // Switch a whole room: its general light when it has one, else every light of the room.
  function toggleRoom(id) {
    var all = D.devices.filter(function (d) { return d.room === id; });
    var list = all.filter(function (d) { return !d.group; }), group = all.filter(function (d) { return d.group; })[0];
    if (!list.length) return;
    var on = !list.some(function (d) { return d.on; });
    all.forEach(function (d) { d.on = on; if (on && !d.level) d.level = 100; });
    V.scene = null;
    if (live()) {
      if (group) App.ha.act('light', on ? 'turn_on' : 'turn_off', group.id);
      else list.forEach(function (d) { App.ha.act('light', on ? 'turn_on' : 'turn_off', d.id); });
    }
    paint();
  }

  function allOff() {
    var on = lightsOn();
    if (!on.length) return;
    on.forEach(function (d) { d.on = false; if (live()) App.ha.act('light', 'turn_off', d.id); });
    V.scene = null;
    paint();
    App.toast(plural(on.length, 'lumière éteinte', 'lumières éteintes'), { icon: 'bulb' });
  }

  function climateChanged() { paintPart('.hc-climate', climate()); paintPart('.hc-head', header()); }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-alloff]'))) return allOff();
    if ((t = e.target.closest('[data-room]'))) return toggleRoom(t.dataset.room);
    if ((t = e.target.closest('[data-scene]'))) {
      var s = D.scenes.filter(function (x) { return x.id === t.dataset.scene; })[0];
      if (live()) App.ha.scene(s.entity);
      V.scene = s.id;
      paintPart('.hc-scenes', scenes());
      return App.toast('<b>' + App.esc(s.name) + '</b> activée', { icon: s.icon });
    }
    if ((t = e.target.closest('[data-ctab]'))) { V.ctab = t.dataset.ctab; return climateChanged(); }
    var c = current();
    if ((t = e.target.closest('[data-temp]')) && c) {
      var step = c.step || 0.5, dir = +t.dataset.temp > 0 ? 1 : -1, base = c.set != null ? c.set : (c.current != null ? Math.round(c.current * 2) / 2 : 21);
      c.set = Math.round(Math.max(c.min, Math.min(c.max, base + dir * step)) * 10) / 10;
      var wake = c.mode === 'off' ? (c.kind === 'ac' ? 'auto' : 'heat') : null;
      if (wake) c.mode = wake;
      if (live()) App.ha.setClimateOf(c.entity, c.set, wake);
      return climateChanged();
    }
    if ((t = e.target.closest('[data-cmode]')) && c) {
      c.mode = t.dataset.cmode;
      if (live()) App.ha.setClimateOf(c.entity, null, c.mode);
      return climateChanged();
    }
    if ((t = e.target.closest('[data-fan]')) && c) {
      c.fan = t.dataset.fan;
      if (live()) App.ha.setClimateOf(c.entity, null, null, c.fan);
      return climateChanged();
    }
    if ((t = e.target.closest('[data-vac]'))) { if (live()) App.ha.vacuum(t.dataset.vac); return; }
    if (e.target.closest('[data-play]')) {
      D.media.playing = !D.media.playing;
      if (live()) App.ha.playPause();
      return paintPart('.hc-media', media());
    }
    if (e.target.closest('.hc-media')) App.go('player');
  }

  // Home Assistant pushes new state while the page is open: repaint (not in the middle of a drag).
  App.on('data', function () { if (App.current === 'control' && V.el && !V.busy) paint(); });

  App.register('control', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        el.innerHTML = '<div class="hc">' +
          '<div class="hc-head"></div><div class="hc-scenes"></div>' +
          '<div class="hc-main"><div class="hc-rooms"></div>' +
          '<div class="hc-right"><div class="hc-climate card"></div><div class="hc-cams card"></div><div class="hc-media"></div></div></div>' +
          '</div>';
        el.addEventListener('click', onClick);
      }
      paint();
    }
  });
})();
