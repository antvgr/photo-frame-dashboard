// Music, full screen: opened by tapping the music card on the home screen.
// Shows the track, the rooms that are playing, progress, transport buttons and the volume.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function live() { return App.ha && App.ha.enabled && App.ha.connected; }
  // Position now: the last reported position plus the time elapsed while playing.
  function position() {
    var m = D.media;
    if (!m.playing || !m.positionAt) return m.position || 0;
    return Math.min(m.duration || Infinity, m.position + (Date.now() - m.positionAt) / 1000);
  }

  function body() {
    var m = D.media, pos = position(), dur = m.duration || 0;
    var art = m.art ? '<img src="' + App.esc(m.art) + '" alt="">' : '<span class="pl-note">' + App.icon('music', 110) + '</span>';
    var rooms = (m.rooms && m.rooms.length ? m.rooms : (m.room ? [m.room] : [])).map(function (r) {
      return '<span class="pl-room">' + App.icon('music', 16) + App.esc(r) + '</span>';
    }).join('');
    return '<div class="pl-top"><span class="pl-src">' + App.esc(m.source || 'Musique') + '</span>' +
      '<button class="pl-close" data-close>' + App.icon('x', 16) + 'Fermer</button></div>' +
      '<div class="pl-mid"><div class="pl-art">' + art + '</div><div class="pl-info">' +
      '<div><div class="pl-title">' + App.esc(m.title || 'Rien en lecture') + '</div><div class="pl-artist">' + App.esc(m.artist || '') + '</div>' +
      '<div class="pl-rooms">' + rooms + '</div></div>' +
      '<div><div class="pl-bar"><i style="width:' + (dur ? Math.min(100, pos / dur * 100) : 0) + '%"></i></div>' +
      '<div class="pl-times"><span>' + mmss(pos) + '</span><span>' + (dur ? '-' + mmss(dur - pos) : '') + '</span></div></div>' +
      '<div class="pl-ctl"><button data-act="prev" aria-label="Précédent">' + App.icon('left', 34) + '</button>' +
      '<button class="pl-play" data-act="toggle" aria-label="' + (m.playing ? 'Pause' : 'Lecture') + '">' + App.icon(m.playing ? 'pause' : 'play', 34) + '</button>' +
      '<button data-act="next" aria-label="Suivant">' + App.icon('right', 34) + '</button></div></div></div>' +
      '<div class="pl-vol"><span>' + App.icon('music', 24) + '</span><div class="pl-vbar" data-vol><i style="width:' + m.volume + '%"></i></div><b>' + m.volume + ' %</b></div>';
  }

  // ---- background colour taken from the album cover
  // The cover is drawn on a tiny canvas; the dominant vivid hue becomes the background (dark enough for white text).
  // If the cover cannot be read (no CORS headers from Home Assistant, no cover) the default plum background stays.
  var colorCache = {};
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function dominant(img) {
    var c = document.createElement('canvas'); c.width = c.height = 24;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
    var px = x.getImageData(0, 0, 24, 24).data, buckets = [], i, n = 0, avg = [0, 0, 0];
    for (i = 0; i < 12; i++) buckets.push({ w: 0, r: 0, g: 0, b: 0 });
    for (i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      var hsl = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      avg[0] += px[i]; avg[1] += px[i + 1]; avg[2] += px[i + 2]; n++;
      var w = hsl[1] * (1 - Math.abs(2 * hsl[2] - 1)) + .02, b = buckets[Math.min(11, Math.floor(hsl[0] / 30))];
      b.w += w; b.r += px[i] * w; b.g += px[i + 1] * w; b.b += px[i + 2] * w;
    }
    var best = buckets.sort(function (a, b) { return b.w - a.w; })[0];
    if (!n) return null;
    return best.w > .5 ? [best.r / best.w, best.g / best.w, best.b / best.w] : [avg[0] / n, avg[1] / n, avg[2] / n];
  }
  function bgFor(rgb) {
    var h = rgb2hsl(rgb[0], rgb[1], rgb[2]), hue = Math.round(h[0]), s = Math.round(Math.max(Math.min(h[1], .75), h[1] < .15 ? h[1] : .4) * 100);
    return { '--pl-1': 'hsl(' + hue + ',' + s + '%,30%)', '--pl-2': 'hsl(' + hue + ',' + Math.round(s * .8) + '%,15%)', '--pl-3': 'hsl(' + hue + ',' + Math.round(s * .5) + '%,8%)', '--pl-acc': 'hsl(' + hue + ',' + Math.min(70, s) + '%,76%)' };
  }
  function setBg(el, vars) {
    var keys = ['--pl-1', '--pl-2', '--pl-3', '--pl-acc'];
    keys.forEach(function (k) { if (vars) el.style.setProperty(k, vars[k]); else el.style.removeProperty(k); });
  }
  // Shared with the music card on the home screen: calls back with the colour variables (or null) for a cover URL.
  App.coverVars = function (url, cb) {
    if (!url) return cb(null);
    if (colorCache[url] !== undefined) return cb(colorCache[url]);
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var vars = null;
      try { var c = dominant(img); if (c) vars = bgFor(c); } catch (e) { vars = null; }
      colorCache[url] = vars;
      cb(vars);
    };
    img.onerror = function () { colorCache[url] = null; cb(null); };
    img.src = url;
  };
  App.coverSet = setBg;
  function applyBg() {
    var el = V.el && V.el.querySelector('.pl'), url = D.media.art || '';
    if (!el || V.artUrl === url) return;
    V.artUrl = url;
    App.coverVars(url, function (vars) { if (V.artUrl === url) setBg(el, vars); });
  }

  function paint() { if (V.el && App.current === 'player') { V.el.querySelector('.pl').innerHTML = body(); applyBg(); } }
  // progress only (every second while playing)
  function tickProgress() {
    if (!V.el || App.current !== 'player') return;
    var bar = V.el.querySelector('.pl-bar i'), t = V.el.querySelectorAll('.pl-times span');
    if (!bar || !t.length) return;
    var dur = D.media.duration || 0, pos = position();
    bar.style.width = (dur ? Math.min(100, pos / dur * 100) : 0) + '%';
    t[0].textContent = mmss(pos);
    if (dur) t[1].textContent = '-' + mmss(dur - pos);
  }

  function setVolume(e, bar) {
    var r = bar.getBoundingClientRect(), k = r.width / bar.offsetWidth || 1;
    var v = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100);
    D.media.volume = v;
    bar.querySelector('i').style.width = v + '%';
    bar.parentNode.querySelector('b').textContent = v + ' %';
    if (live()) App.ha.volume(v);
  }

  App.register('player', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="pl"></div>';
        el.addEventListener('click', function (e) {
          if (e.target.closest('[data-close]')) { App.go('home'); return; }
          var b = e.target.closest('[data-act]');
          if (!b || !live()) return;
          var h = App.ha;
          if (b.dataset.act === 'toggle') { D.media.playing = !D.media.playing; paint(); h.playPause(); }
          else if (b.dataset.act === 'next') h.mediaNext();
          else h.mediaPrev();
        });
        el.addEventListener('pointerdown', function (e) {
          var bar = e.target.closest('[data-vol]');
          if (!bar) return;
          setVolume(e, bar);
          function move(ev) { setVolume(ev, bar); }
          function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        });
      }
      paint2();
    }
  });
  function paint2() { V.el.querySelector('.pl').innerHTML = body(); applyBg(); }

  App.on('data', function () { if (App.current === 'player') paint(); });
  App.on('second', tickProgress);
})();
