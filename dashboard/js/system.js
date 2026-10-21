// Settings drawer: press and hold the clock in the sidebar.
// Language, Home Assistant connection status, display modes, reload.
(function () {
  'use strict';
  var $ = App.$;

  function haStatus() {
    var h = App.ha;
    if (!h || !h.enabled) return { text: h && h.error === 'auth' ? 'Jeton refusé' : 'Non configuré', tone: 'off' };
    return h.connected ? { text: 'Connecté', tone: 'ok' } : { text: 'Connexion…', tone: 'wait' };
  }

  function autoNote() {
    var L = App.light;
    var sunset = 'sombre la nuit (après le coucher du soleil)';
    if (L && L.lux != null) return 'Auto : ' + sunset + ' et quand la pièce est sombre (' + Math.round(L.lux) + ' lux, ' + (L.dark ? 'sombre' : 'claire') + ').';
    return 'Auto : ' + sunset + '.';
  }

  function html() {
    var st = haStatus(), h = App.ha || {};
    return '<div class="settings-panel">' +
      '<div class="settings-head"><div><div class="label">Cadre</div><h2 class="serif">Réglages</h2></div>' +
      '<button class="settings-x" data-settings-close aria-label="Fermer">' + App.icon('x', 28) + '</button></div>' +
      '<div class="settings-sec"><div class="label">' + T('Language') + '</div><div class="settings-grid">' +
      I18N.list().map(function (l) {
        return '<button data-lang="' + l.code + '" class="' + (l.code === I18N.lang ? 'is-on' : '') + '">' + App.esc(l.name) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="settings-sec"><div class="label">Home Assistant</div>' +
      '<div class="settings-status settings-status--' + st.tone + '"><i></i><b>' + st.text + '</b></div>' +
      (h.base ? '<p class="settings-note">' + App.esc(h.base) + '</p>' : '') +
      (!h.enabled ? '<p class="settings-note">Ouvrez la page avec <b>?ha_token=…</b> pour enregistrer le jeton.</p>' : '') + '</div>' +
      '<div class="settings-sec"><div class="label">Thème</div><div class="settings-grid settings-grid--3">' +
      [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (x) {
        return '<button data-theme="' + x[0] + '" class="' + (App.theme === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div><p class="settings-note">' + autoNote() + '</p></div>' +
      '<div class="settings-sec"><div class="label">Luminosité</div><div class="settings-grid">' +
      '<button data-bmode="auto" class="' + (App.bright.mode === 'auto' ? 'is-on' : '') + '">Auto</button>' +
      '<button data-bmode="manual" class="' + (App.bright.mode === 'manual' ? 'is-on' : '') + '">Manuel</button></div>' +
      (App.bright.mode === 'manual'
        ? '<div class="set-range"><span>Faible</span><input type="range" min="3" max="100" step="1" value="' + Math.round(App.bright.manual * 100) + '" data-bmanual><span>Max</span></div>'
        : '<div class="set-range"><span>Plus sombre</span><input type="range" min="40" max="160" step="5" value="' + Math.round(App.bright.adjust * 100) + '" data-badjust><span>Plus clair</span></div>' +
          '<p class="settings-note">' + (App.light && App.light.lux != null ? 'Capteur : ' + Math.round(App.light.lux) + ' lux → ' : '') + 'luminosité ' + Math.round(App.bright.target() * 100) + ' %. Si l’écran est trop lumineux, glissez vers « plus sombre ».</p>') + '</div>' +
      '<div class="settings-sec"><div class="label">Orientation de l’écran</div><div class="settings-grid settings-grid--3">' +
      [['landscape', 'Paysage'], ['portrait', 'Portrait'], ['auto', 'Auto']].map(function (x) {
        return '<button data-orient="' + x[0] + '" class="' + (currentOrient() === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>' + (window.HomeHQ && window.HomeHQ.setOrientation ? '' : '<p class="settings-note">Réglage disponible sur le cadre (application kiosque).</p>') + '</div>' +
      '<div class="settings-sec"><div class="label">Système</div><div class="settings-grid">' +
      '<button data-wifi>Wi-Fi</button><button data-android>Interface Android</button></div>' +
      (window.HomeHQ && window.HomeHQ.openWifi ? '' : '<p class="settings-note">Disponible sur le cadre (application kiosque).</p>') + '</div>' +
      '<div class="settings-sec"><div class="label">Affichage</div><div class="settings-grid">' +
      '<button data-mode="ambient">Mode veille</button><button data-reload>Recharger</button></div></div>' +
      '</div>';
  }

  function currentOrient() {
    try { if (window.HomeHQ && window.HomeHQ.orientation) return window.HomeHQ.orientation(); } catch (e) {}
    return App.orient || 'landscape';
  }

  App.openSettings = function () {
    var el = $('#settings');
    el.innerHTML = html();
    el.classList.add('is-open');
  };
  function close() { $('#settings').classList.remove('is-open'); }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b) { if (e.target === $('#settings')) close(); return; }
    if (b.hasAttribute('data-settings-close')) return close();
    if (b.dataset.lang) return I18N.setLang(b.dataset.lang);
    if (b.dataset.bmode) { App.bright.set({ mode: b.dataset.bmode }); return App.openSettings(); }
    if (b.hasAttribute('data-wifi')) {
      var ok = false;
      try { ok = !!(window.HomeHQ && window.HomeHQ.openWifi && window.HomeHQ.openWifi()); } catch (e2) {}
      if (!ok) App.toast('Réglages Wi-Fi indisponibles', { tone: 'error', icon: 'bolt' });
      return;
    }
    if (b.hasAttribute('data-android')) {
      try { if (window.HomeHQ && window.HomeHQ.exitToLauncher) window.HomeHQ.exitToLauncher(); } catch (e3) {}
      return;
    }
    if (b.dataset.orient) {
      try { if (window.HomeHQ && window.HomeHQ.setOrientation) window.HomeHQ.setOrientation(b.dataset.orient); } catch (e) {}
      return App.openSettings();
    }
    if (b.dataset.theme) { App.setTheme(b.dataset.theme); return App.openSettings(); }
    if (b.dataset.mode) { close(); return App.setMode(b.dataset.mode); }
    if (b.hasAttribute('data-reload')) location.reload();
  }

  // Someone passes the motion sensor / opens the door: leave the idle clock screen.
  App.on('presence', function () {
    App.resetIdle();
    if (App.mode !== 'day') { App.setMode('day'); App.go('home'); }
  });

  App.on('ready', function () {
    $('#settings').addEventListener('click', onClick);
    // brightness sliders: apply while dragging (no re-render, so the slider keeps the finger)
    $('#settings').addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-bmanual')) App.bright.set({ manual: t.value / 100 });
      else if (t.hasAttribute('data-badjust')) App.bright.set({ adjust: t.value / 100 });
    });
    App.hold($('#railClock'), 700, { done: App.openSettings });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); App.closeSheet(); }
    });
  });
})();
