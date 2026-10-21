// Home Assistant bridge: connects over WebSocket, mirrors the entities listed in CFG into
// window.DATA (in place, so views keep working), and sends commands back as service calls.
// Without a token the dashboard stays in demo mode (mock data from data.js).
//
// The token is never in the bundle. Give it once with  ?ha_token=...  (optionally &ha_url=...);
// it is stored in this browser's localStorage and removed from the address bar.
(function () {
  'use strict';
  var D = window.DATA;

  var CFG = window.HQ_CONFIG;

  // Screenshot mode: open the page with  ?anon  to hide the second person (photo, name, agendas, city) and the Vélib' station name.
  var ANON = /[?&]anon(&|=|$)/.test(location.search);
  if (ANON) {
    CFG.people = CFG.people.filter(function (p) { return (CFG.anonHide || []).indexOf(p.id) < 0; });
    CFG.velib.name = '';
  }

  // ------------------------------------------------------------------ connection settings
  var qs = new URLSearchParams(location.search);
  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  if (qs.get('ha_token')) {
    store('ha_token', qs.get('ha_token'));
    if (qs.get('ha_url')) store('ha_url', qs.get('ha_url'));
    qs.delete('ha_token'); qs.delete('ha_url');
    history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash);
  }
  var token = load('ha_token');
  var baseUrl = (load('ha_url') || (location.port === '8123' ? location.origin : CFG.defaultUrl)).replace(/\/$/, '');

  // Only these entities matter. Home Assistant has hundreds of chatty sensors; ignoring the rest keeps the display calm.
  var WATCH = {};
  (function () {
    function w(id) { if (id) WATCH[id] = 1; }
    CFG.people.forEach(function (p) { w(p.entity); p.calendars.forEach(w); });
    [CFG.weather, CFG.outdoor, CFG.uv, CFG.aqi, CFG.climate, CFG.vacuum, CFG.sun, CFG.alert].forEach(w);
    CFG.indoor.forEach(w); CFG.wake.forEach(w); CFG.media.forEach(w); CFG.pollen.forEach(function (p) { w(p.entity); });
    CFG.climates.forEach(function (c) { w(c.entity); });
    CFG.rooms.forEach(function (r) { w(r.temp); });
    CFG.machines.forEach(function (m) { Object.keys(m.e).forEach(function (k) { w(m.e[k]); }); });
    Object.keys(CFG.alerts).forEach(function (k) { w(CFG.alerts[k]); });
    [CFG.velib.ebike, CFG.velib.mech, CFG.velib.docks, CFG.energy.month, CFG.energy.cost, CFG.energy.day, CFG.energy.sub].forEach(w);
    CFG.rooms.forEach(function (r) { r.lights.forEach(w); });
    CFG.scenes.forEach(function (s) { w(s.entity); });
  })();

  // The companion app's "Geocoded Location" sensor carries the city (attribute Locality) of a phone.
  function isGeo(id) { return id.indexOf('sensor.') === 0 && id.indexOf('geocoded_location') > -1; }

  var H = App.ha = { enabled: !!token, connected: false, states: {}, cfg: CFG, base: baseUrl };
  if (!token) return;

  // ------------------------------------------------------------------ websocket
  var ws = null, seq = 0, pending = {}, retry = 0, syncTimer = null;

  function send(msg) {
    return new Promise(function (resolve, reject) {
      if (!ws || ws.readyState !== 1) return reject(new Error('offline'));
      msg.id = ++seq;
      pending[msg.id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify(msg));
    });
  }

  // A connection that died silently (Wi-Fi or WebView asleep) never fires onclose: ping, and reconnect when nobody answers.
  var lastPong = Date.now();
  function heartbeat() {
    if (!ws || ws.readyState !== 1 || !H.connected) return;
    if (Date.now() - lastPong > 45000) { try { ws.close(); } catch (x) {} return; }
    try { ws.send(JSON.stringify({ id: ++seq, type: 'ping' })); } catch (x) {}
  }
  setInterval(heartbeat, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastPong = Math.min(lastPong, Date.now() - 20000); heartbeat(); } });

  function connect() {
    ws = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/api/websocket');
    ws.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.type === 'auth_required') return ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      if (m.type === 'auth_invalid') { H.error = 'auth'; store('ha_token', null); H.enabled = false; return ws.close(); }
      if (m.type === 'pong') { lastPong = Date.now(); return; }
      if (m.type === 'auth_ok') { lastPong = Date.now(); return onOpen(); }
      if (m.type === 'result' && pending[m.id]) {
        var p = pending[m.id]; delete pending[m.id];
        return m.success ? p.resolve(m.result) : p.reject(m.error);
      }
      if (m.type === 'event' && m.event && m.event.event_type === 'state_changed') {
        var d = m.event.data, old = H.states[d.entity_id];
        if (!WATCH[d.entity_id] && !isGeo(d.entity_id)) return;
        if (d.new_state) H.states[d.entity_id] = d.new_state; else delete H.states[d.entity_id];
        onChange(d.entity_id, old, d.new_state);
        queueSync();
      }
    };
    ws.onclose = function () {
      H.connected = false;
      pending = {};
      if (!H.enabled) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, retry * 3000);
    };
  }

  function onOpen() {
    retry = 0;
    send({ type: 'get_states' }).then(function (list) {
      H.states = {};
      list.forEach(function (s) { H.states[s.entity_id] = s; });
      H.connected = true;
      sync();
      send({ type: 'subscribe_events', event_type: 'state_changed' });
      refreshCalendars();
      refreshForecast();
      loadCycles();
    });
  }

  // Service call; resolves with the response when the service returns one.
  H.call = function (domain, service, data, target, wantResponse) {
    var msg = { type: 'call_service', domain: domain, service: service, service_data: data || {} };
    if (target) msg.target = target;
    if (wantResponse) msg.return_response = true;
    return send(msg);
  };
  function act(domain, service, entity, data) {
    return H.call(domain, service, data, { entity_id: entity }).catch(function () {
      App.toast('Home Assistant n’a pas répondu', { tone: 'error', icon: 'bolt' });
    });
  }
  H.act = act;

  // ------------------------------------------------------------------ helpers
  function st(id) { return H.states[id]; }
  function num(id) {
    var s = st(id);
    if (!s) return null;
    var v = parseFloat(s.state);
    return isNaN(v) ? null : v;
  }
  // Outside temperature now: the outdoor sensor, else the weather entity.
  function outdoorNow() {
    var t = num(CFG.outdoor), w = st(CFG.weather);
    if (t != null) return t;
    return w && w.attributes.temperature != null ? w.attributes.temperature : null;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  // Reactions to a single state change: arrivals, motion at the door, weather updates.
  var lastArrival = {}, forecastTimer = null, calTimer = null;
  function onChange(id, old, now) {
    if (!now) return;
    var person = CFG.people.filter(function (p) { return p.entity === id; })[0];
    if (person && old && old.state === 'not_home' && now.state === 'home') {
      var t = Date.now();
      if (!lastArrival[person.id] || t - lastArrival[person.id] > 10 * 60 * 1000) { lastArrival[person.id] = t; App.emit('arrival', person.id); }
    }
    if (CFG.wake.indexOf(id) > -1 && now.state === 'on' && (!old || old.state !== 'on')) App.emit('presence', id);
    if (id === CFG.weather) { clearTimeout(forecastTimer); forecastTimer = setTimeout(refreshForecast, 5000); }
    // an event just started or ended in an agenda: reload the agendas shortly
    if (CFG.people.some(function (p) { return p.calendars.indexOf(id) > -1; })) { clearTimeout(calTimer); calTimer = setTimeout(refreshCalendars, 3000); }
  }
  function queueSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 400); }

  // ------------------------------------------------------------------ mapping
  // City of a person who is away: the geocoded-location sensor of one of their devices (entity id contains their id).
  // Fallback: OpenStreetMap (Nominatim) reverse geocoding of the person's GPS position, used only when no
  // geocoded-location sensor gives a city. Cached, throttled to 1 request per 1.1 s, refreshed when the person
  // moved ~2 km or after 30 minutes. Needs the /nominatim relay of the dashboard server; without it the status stays "Absent".
  var osm = { cache: {}, queue: [], busy: false, lastAt: 0 };
  function osmCity(p, s) {
    var a = (s && s.attributes) || {};
    if (a.latitude == null || a.longitude == null) return null;
    var c = osm.cache[p.id], now = Date.now();
    var moved = c && (Math.abs(c.lat - a.latitude) > 0.02 || Math.abs(c.lon - a.longitude) > 0.02);
    var stale = c && now - c.t > 30 * 60 * 1000;
    if ((!c || moved || stale) && !(c && c.pending) && !(c && c.failedAt && now - c.failedAt < 5 * 60 * 1000)) {
      osm.cache[p.id] = { lat: a.latitude, lon: a.longitude, city: moved || !c ? null : c.city, t: c ? c.t : 0, pending: true };
      osm.queue.push({ p: p, lat: a.latitude, lon: a.longitude });
      pumpOsm();
    }
    return osm.cache[p.id] ? osm.cache[p.id].city : null;
  }
  function pumpOsm() {
    if (osm.busy || !osm.queue.length) return;
    var wait = Math.max(0, osm.lastAt + 1100 - Date.now());
    osm.busy = true;
    setTimeout(function () {
      var job = osm.queue.shift();
      osm.lastAt = Date.now();
      var url = '/nominatim/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=fr,en&namedetails=1&lat=' + job.lat.toFixed(4) + '&lon=' + job.lon.toFixed(4);
      fetch(url).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(function (j) {
        var ad = (j && j.address) || {};
        var city = ad.city || ad.town || ad.village || ad.municipality || ad.county || ad.state || null;
        // A name in another alphabet (Arabic, Cyrillic…) when OSM has no French name: use the French, else English, name of the place.
        if (city && /[^\u0000-ɏ -⁯]/.test(city)) {
          var nd = j.namedetails || {};
          city = nd['name:fr'] || nd['name:en'] || nd.int_name || city;
        }
        osm.cache[job.p.id] = { lat: job.lat, lon: job.lon, city: city, t: Date.now(), pending: false, failedAt: city ? 0 : Date.now() };
      }).catch(function () {
        var c = osm.cache[job.p.id] || {};
        osm.cache[job.p.id] = { lat: job.lat, lon: job.lon, city: c.city || null, t: c.t || 0, pending: false, failedAt: Date.now() };
      }).then(function () { osm.busy = false; sync(); pumpOsm(); });
    }, wait);
  }

  function cityOf(p) {
    var fromSensor = cityFromSensor(p);
    if (fromSensor) return fromSensor;
    return osmCity(p, H.states[p.entity]);
  }

  function cityFromSensor(p) {
    var ids = Object.keys(H.states);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!isGeo(id) || id.indexOf(p.id) < 0) continue;
      var s = H.states[id];
      if (!s || s.state === 'unavailable' || s.state === 'unknown') continue;
      var a = s.attributes || {};
      var city = a.Locality || a['Sub Administrative Area'] || a['Administrative Area'];
      if (city && city !== 'N/A') return city;
    }
    return null;
  }

  function syncPeople() {
    D.people.length = 0; D.ALL.length = 0;
    CFG.people.forEach(function (p) {
      var s = st(p.entity), state = s ? s.state : 'unknown';
      var home = state === 'home';
      var pic = s && s.attributes.entity_picture;
      var status = home ? 'Maison' : state === 'not_home' ? (cityOf(p) || 'Absent') : state === 'unknown' ? '' : state;
      D.people.push({ id: p.id, name: p.name, color: p.color, rgb: p.rgb, ink: p.ink, home: home,
        photo: pic ? (pic.indexOf('http') === 0 ? pic : baseUrl + pic) : null,
        status: status });
      D.ALL.push(p.id);
    });
  }

  function syncLights() {
    D.rooms.length = 0; D.devices.length = 0;
    CFG.rooms.forEach(function (r) {
      D.rooms.push({ id: r.id, name: r.name, temp: r.temp ? num(r.temp) : null });
      r.lights.forEach(function (id) {
        var s = st(id);
        if (!s || s.state === 'unavailable') return;
        var b = s.attributes.brightness;
        D.devices.push({ id: id, room: r.id, type: 'light', group: id === r.group, name: ANON ? (s.attributes.friendly_name || id).replace(new RegExp('\\s*' + (CFG.anonStrip || '$^') + '\\b', 'i'), '') : (s.attributes.friendly_name || id),
          on: s.state === 'on', level: b ? Math.max(1, Math.round(b / 2.55)) : 100, dimmable: b != null || (s.attributes.supported_color_modes || []).some(function (m) { return m !== 'onoff'; }) });
      });
    });
    D.rooms = D.rooms.filter(function (r) { return D.devices.some(function (d) { return d.room === r.id; }); });
  }

  function syncScenes() {
    D.scenes.length = 0;
    CFG.scenes.forEach(function (s) {
      D.scenes.push({ id: s.entity, entity: s.entity, name: s.name, icon: s.icon, set: {} });
    });
  }

  function syncClimate() {
    var s = st(CFG.climate), a = s ? s.attributes : {};
    var temps = CFG.indoor.map(num).filter(function (x) { return x != null; });
    var avg = temps.length ? round1(temps.reduce(function (x, y) { return x + y; }, 0) / temps.length) : (a.current_temperature || null);
    var w = st(CFG.weather);
    D.climate.entity = CFG.climate;
    D.climate.current = avg;
    D.climate.set = a.temperature != null ? a.temperature : 21;
    D.climate.mode = s ? (s.state === 'off' ? 'off' : s.state) : 'off';
    D.climate.modes = ['heat', 'auto', 'off'];
    D.climate.step = a.target_temp_step || 0.5;
    D.climate.min = a.min_temp || 7;
    D.climate.max = a.max_temp || 28;
    D.climate.humidity = null;
    D.climate.outside = outdoorNow();
  }

  var ACMODES = ['cool', 'heat', 'dry', 'fan_only', 'auto', 'off'];
  function syncClimates() {
    D.climates = CFG.climates.map(function (c) {
      var s = st(c.entity), a = s ? s.attributes : {}, state = s ? s.state : 'unavailable';
      return { id: c.id, name: c.name, entity: c.entity, kind: c.kind, available: !!s && state !== 'unavailable' && state !== 'unknown',
        mode: state, action: a.hvac_action || null, current: a.current_temperature != null ? a.current_temperature : null,
        set: a.temperature != null ? a.temperature : null, min: a.min_temp || (c.kind === 'ac' ? 16 : 7), max: a.max_temp || (c.kind === 'ac' ? 30 : 28),
        step: a.target_temp_step || 0.5, modes: (a.hvac_modes || []).slice(), fan: a.fan_mode || null, fanModes: (a.fan_modes || []).slice() };
    });
  }

  // ------------------------------------------------------------------ machines
  // D.machines: the machines that are running ("run") or just finished ("done", kept for 3 h or until the door opens).
  function hhmm(d) { return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  var FIN = {}, wasRun = {};
  try { FIN = JSON.parse(load('hq-fin') || '{}'); } catch (e) { FIN = {}; }
  function saveFin() { store('hq-fin', JSON.stringify(FIN)); }
  function sv(id) { var x = id ? st(id) : null; return x && x.state !== 'unavailable' && x.state !== 'unknown' ? x.state : null; }
  function ts(id) { var v = sv(id); var t = v ? Date.parse(v) : NaN; return isNaN(t) ? null : t; }
  function pretty(x) { x = String(x || '').replace(/_/g, ' ').trim(); return x ? x.charAt(0).toUpperCase() + x.slice(1) : ''; }

  var DISH_PROG = { favorite_001: 'Favori', dishcare_dishwasher_program_auto2: 'Auto', dishcare_dishwasher_program_eco50: 'Eco 50°', dishcare_dishwasher_program_intensiv70: 'Intensif 70°',
    dishcare_dishwasher_program_machinecare: 'Entretien', dishcare_dishwasher_program_prerinse: 'Prélavage', dishcare_dishwasher_program_quick45: 'Rapide 45°', dishcare_dishwasher_program_quick65: 'Rapide 65°' };
  var COFFEE = { espresso: 'Espresso', coffee: 'Café', cappuccino: 'Cappuccino', espressodoppio: 'Double espresso', espressomacchiato: 'Espresso macchiato', hotwater: 'Eau chaude',
    lattemacchiato: 'Latte macchiato', milkfroth: 'Mousse de lait', ristretto: 'Ristretto', americano: 'Américano', cafeconleche: 'Café con leche', doppio: 'Doppio', flatwhite: 'Flat white',
    garoto: 'Garoto', redeye: 'Red eye', verlaengerter: 'Café allongé', wienermelange: 'Mélange viennois' };

  function isRunning(m) {
    var e = m.e, s0 = sv(e.state);
    if (m.kind === 'washer') return sv(e.running) === 'on' || s0 === 'active' || s0 === 'pause';
    if (m.kind === 'oven') return s0 === 'active' || s0 === 'pause';
    if (m.kind === 'dish') return ['run', 'delayedstart', 'pause', 'actionrequired'].indexOf(s0) > -1;
    if (m.kind === 'coffee') return s0 === 'run' || s0 === 'pause';
    return false;
  }
  // steps: [[label, 'done'|'now'|'todo']]
  function steps(labels, idx, allDone, details) { return labels.map(function (l, i) { return [l, allDone || i < idx ? 'done' : i === idx ? 'now' : 'todo', details && details[l] || '']; }); }
  // The washing machine reports its programme as a hex code; the integration's own translations (the ones the
  // Home Assistant interface shows) give the name: asked once per connection, French first, then English.
  var WASH_CYCLES = {};
  // the table (there is one per machine family) that knows every option of this machine's cycle selector
  function cycleName(eid) {
    var code = sv(eid);
    var s0 = st(eid), opts = (s0 && s0.attributes.options) || [], best = null, bn = -1;
    Object.keys(WASH_CYCLES).forEach(function (tb) {
      var n = opts.filter(function (o) { return WASH_CYCLES[tb][o]; }).length;
      if (n > bn) { bn = n; best = tb; }
    });
    return best && code ? WASH_CYCLES[best][code] || '' : '';
  }
  function loadCycles() {
    ['en', 'fr'].reduce(function (p, lang) {
      return p.then(function () {
        return send({ type: 'frontend/get_translations', language: lang, category: 'entity', integration: 'localthings' }).then(function (r) {
          var res = (r && r.resources) || {};
          Object.keys(res).forEach(function (k) {
            var m = /\.entity\.select\.washer_cycle_table_\w+\.state\.([^.]+)$/.exec(k);
            if (m) { var tb = k.split('.')[4]; (WASH_CYCLES[tb] = WASH_CYCLES[tb] || {})[m[1]] = res[k]; }
          });
        });
      }).catch(function () {});
    }, Promise.resolve()).then(function () { queueSync(); });
  }

  function describe(m, run, doneAt, now) {
    var e = m.e, o = { id: m.id, kind: m.kind, name: m.name, status: run ? 'run' : 'done', doneAt: doneAt || null, steps: [], cur: '', sub: '', pct: null, finish: null, min: null, chips: [] };
    var pct = num(e.pct);
    if (m.kind === 'washer') {
      var pre = sv(e.prewash) === 'on', labels = (pre ? ['Prélavage'] : []).concat(['Lavage', 'Rinçage', 'Essorage']);
      var ph = sv(e.phase), map = { prewash: 'Prélavage', weightsensing: 'Lavage', delaywash: 'Lavage', wash: 'Lavage', rinse: 'Rinçage', predrain: 'Essorage', spin: 'Essorage' };
      var idx = labels.indexOf(map[ph]); if (idx < 0) idx = 0;
      var sp0 = sv(e.spin), ri0 = sv(e.rinses), tp0 = sv(e.temp), det = {};
      if (tp0) det['Lavage'] = tp0 === '0' || tp0 === 'cold' ? 'Eau froide' : 'Eau ' + tp0 + '°';
      if (ri0) det['Rinçage'] = ri0 + (ri0 === '1' ? ' rinçage' : ' rinçages');
      if (sp0) det['Essorage'] = sp0 === '0' || sp0 === 'no_spin' ? 'Sans essorage' : sp0 + ' tr/min';
      o.steps = steps(labels, idx, !run, det); o.cur = run ? labels[idx] : 'Terminé';
      o.pct = run ? (pct != null ? Math.round(pct) : null) : 100;
      var cyc = sv(e.cycle), cyn = cycleName(e.cycle); if (cyn) { o.sub = cyn; o.chips.unshift('Programme ' + cyn); }
      var rem = num(e.remaining), fin = ts(e.finish);
      o.finish = fin || (rem != null ? Math.round((now + rem * 60000) / 60000) * 60000 : null);
      if (!run) o.note = 'à étendre';
    } else if (m.kind === 'dish') {
      var labels2 = ['Prélavage', 'Lavage', 'Rinçage', 'Séchage'], ph2 = sv(e.phase), map2 = { prerinse: 'Prélavage', mainwash: 'Lavage', finalrinse: 'Rinçage', drying: 'Séchage' };
      var idx2 = labels2.indexOf(map2[ph2]); if (idx2 < 0) idx2 = run ? 1 : 0;
      o.steps = steps(labels2, idx2, !run); o.cur = run ? labels2[idx2] : 'Terminé';
      o.pct = run ? (pct != null ? Math.round(pct) : null) : 100;
      var rh = num(e.remaining); o.finish = rh != null && run ? Math.round((now + rh * 3600e3) / 60000) * 60000 : null;
      var pg = sv(e.program); if (pg) { o.sub = DISH_PROG[pg] || pretty(pg.replace(/^dishcare_dishwasher_program_/, '')); o.chips.push('Programme ' + o.sub); }
      var salt = sv(e.salt), rinse = sv(e.rinse);
      o.chips.push(salt === 'full' ? 'Sel : OK' : 'Sel : bas'); o.chips.push(rinse === 'full' ? 'Rinçage : OK' : 'Rinçage : bas');
      o.chips.push(sv(e.door) === 'on' ? 'Porte ouverte' : 'Porte fermée');
      if (!run) o.note = 'à vider';
    } else if (m.kind === 'oven') {
      var temp = num(e.temp), set = num(e.setpoint), pre2 = run && temp != null && set != null && temp < set - 5;
      o.steps = steps(['Préchauffage', 'Cuisson', 'Terminé'], pre2 ? 0 : 1, !run); o.cur = run ? (pre2 ? 'Préchauffage' : 'Cuisson') : 'Terminé';
      o.pct = run ? (pct != null ? Math.round(pct) : null) : 100; o.finish = run ? ts(e.finish) : null;
      o.temp = temp; o.set = set;
      if (set != null) o.chips.push('Consigne ' + Math.round(set) + '°');
      var md = sv(e.mode); if (md && md !== 'no_operation') o.chips.push(pretty(md));
      o.chips.push(sv(e.door) === 'on' ? 'Porte ouverte' : 'Porte fermée');
    } else if (m.kind === 'coffee') {
      var pg2 = sv(e.program), key = pg2 ? pg2.split('_').pop() : '';
      o.cur = COFFEE[key] || (pg2 ? pretty(key) : 'Boisson'); o.pct = run ? (pct != null ? Math.round(pct) : null) : 100;
      o.chips.push(sv(e.tray) === 'full' ? 'Bac plein' : 'Bac : OK'); o.chips.push(sv(e.beans) === 'on' ? 'Grains vides' : 'Grains : OK');
    }
    return o;
  }

  function syncMachines() {
    var now = Date.now(), out = [];
    CFG.machines.forEach(function (m) {
      var run = isRunning(m), id = m.id;
      if (run) { delete FIN[id]; }
      else if (wasRun[id] && !FIN[id]) { FIN[id] = now; }
      wasRun[id] = run;
      // a finished machine that Home Assistant itself reports as finished (e.g. after a reload of the dashboard)
      if (!run && !FIN[id]) {
        var s0 = sv(m.e.state), phase = m.kind === 'washer' ? sv(m.e.phase) : null, x = st(m.e.state), xp = m.e.phase ? st(m.e.phase) : null;
        if ((m.kind === 'dish' && s0 === 'finished' && x) || (m.kind === 'washer' && phase === 'finish' && xp)) FIN[id] = Date.parse((m.kind === 'washer' ? xp : x).last_changed) || now;
      }
      // door opened after the end of the cycle, or 3 hours later: it is over
      if (FIN[id]) {
        var d = m.e.door ? st(m.e.door) : null;
        if (now - FIN[id] > 3 * 3600e3 || (d && d.state === 'on' && Date.parse(d.last_changed) > FIN[id])) delete FIN[id];
      }
      if (run) out.push(describe(m, true, null, now));
      else if (FIN[id] && m.kind !== 'coffee') out.push(describe(m, false, FIN[id], now));
    });
    saveFin();
    D.machines = out;
  }

  // Things that need attention (amber pills)
  function syncAppliances() {
    var A = CFG.alerts, out = [];
    function low(id, name) {
      var s = st(id);
      if (s && s.state === 'empty') out.push({ id: id, kind: 'alert', label: 'Lave-vaisselle', sub: name + ' vide' });
      else if (s && s.state === 'nearly_empty') out.push({ id: id, kind: 'alert', label: 'Lave-vaisselle', sub: name + ' bas' });
    }
    low(A.dishSalt, 'sel'); low(A.dishRinse, 'rinçage');
    var tray = st(A.coffeeTray);
    if (tray && tray.state === 'full') out.push({ id: 'coffee-tray', kind: 'alert', label: 'Café', sub: 'vider le bac' });
    var beans = st(A.coffeeBeans);
    if (beans && beans.state === 'on') out.push({ id: 'coffee-beans', kind: 'alert', label: 'Café', sub: 'grains vides' });
    D.extra.appliances = out;
  }
  // remaining times move with the clock: refresh the machines every minute
  App.on('minute', function () { if (H.connected) { var before = JSON.stringify(D.machines); syncMachines(); if (JSON.stringify(D.machines) !== before) { lastSig = ''; sync(); } } });

  function syncMedia() {
    var list = CFG.media.map(st).filter(Boolean);
    // A soundbar playing the sound of the TV (Sonos Arc on its HDMI / optical input) is not music: ignore it.
    function isTv(x) {
      var a = x.attributes || {};
      return String(a.source || '').toLowerCase() === 'tv' || String(a.media_content_id || '').indexOf('htastream') > -1;
    }
    var playing = list.filter(function (x) { return x.state === 'playing' && !isTv(x); });
    // Rooms that play = every playing speaker plus the members of its Sonos group (a grouped speaker is listed in
    // group_members even when its own state is not "playing").
    var ids = [];
    playing.forEach(function (x) {
      [x.entity_id].concat(x.attributes.group_members || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    });
    D.media.rooms = ids.map(function (id) {
      var m = st(id);
      return CFG.mediaRooms[id] || (m && m.attributes.friendly_name) || id;
    });
    D.media.anyPlaying = playing.length > 0;
    var s = playing[0] || list.filter(function (x) { return x.state !== 'unavailable'; })[0];
    if (!s) return;
    var a = s.attributes;
    D.media.source = a.app_name || a.source || '';
    D.media.duration = a.media_duration || 0;
    D.media.position = a.media_position || 0;
    D.media.positionAt = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : 0;
    D.media.entity = s.entity_id;
    D.media.room = a.friendly_name;
    D.media.title = a.media_title || '';
    D.media.artist = a.media_artist || '';
    D.media.playing = s.state === 'playing' && !isTv(s);
    D.media.volume = Math.round((a.volume_level || 0) * 100);
    // served by the dashboard's own /ha relay (same origin) unless the dashboard itself is served by Home Assistant
    D.media.art = a.entity_picture ? (a.entity_picture.indexOf('http') === 0 ? a.entity_picture : (location.port === '8123' ? '' : '/ha') + a.entity_picture) : null;
  }

  function syncExtra() {
    var x = D.extra = D.extra || {};
    x.velib = { name: CFG.velib.name, ebike: num(CFG.velib.ebike), mech: num(CFG.velib.mech), docks: num(CFG.velib.docks) };
    // bill of the month so far = consumption cost + the monthly subscription
    var cost = num(CFG.energy.cost), sub = num(CFG.energy.sub);
    x.energy = { month: num(CFG.energy.month), cost: cost, sub: sub, total: cost == null ? null : Math.round((cost + (sub || 0)) * 100) / 100, day: num(CFG.energy.day) };
    x.uv = num(CFG.uv);
    var sun = st(CFG.sun);
    var al = st(CFG.alert), RANK = { Jaune: 1, Orange: 2, Rouge: 3 };
    x.alert = null;
    if (al && RANK[al.state]) {
      var items = Object.keys(al.attributes || {}).filter(function (k) { return RANK[al.attributes[k]]; })
        .map(function (k) { return { name: k, level: al.attributes[k] }; })
        .sort(function (p, q) { return RANK[q.level] - RANK[p.level]; });
      x.alert = { level: al.state, items: items };
    }
    x.night = sun ? sun.state === 'below_horizon' : null;
    x.sunElev = sun && sun.attributes.elevation != null ? Math.round(sun.attributes.elevation * 2) / 2 : null;
    x.aqi = num(CFG.aqi);
    x.pollen = CFG.pollen.map(function (p) {
      var s = st(p.entity), v = s ? String(s.state).toLowerCase() : '';
      if (!v || v === 'unavailable' || v === 'unknown' || v === 'none' || v === '0' || v === 'aucun') return null;
      return { name: p.name, level: s.state };
    }).filter(Boolean);
    var v = st(CFG.vacuum);
    x.vacuum = v ? { state: v.state, name: v.attributes.friendly_name } : null;
  }

  var COND = { sunny: 'sun', 'clear-night': 'moon', partlycloudy: 'partly', cloudy: 'cloud', fog: 'cloud', windy: 'cloud', 'windy-variant': 'cloud',
    exceptional: 'cloud', rainy: 'rain', pouring: 'rain', lightning: 'rain', 'lightning-rainy': 'rain', snowy: 'rain', 'snowy-rainy': 'rain', hail: 'rain' };
  function cond(c) { return COND[c] || 'cloud'; }

  // Hourly forecast → the 24 hour-of-day slots the views index into.
  function applyForecast(list) {
    var W = D.weather, now = new Date();
    var w = st(CFG.weather);
    for (var h = 0; h < 24; h++) { W.t[h] = null; W.c[h] = 'cloud'; W.p[h] = 0; }
    list.forEach(function (f) {
      var d = new Date(f.datetime);
      if (d < new Date(now.getTime() - 3600e3) || d > new Date(now.getTime() + 24 * 3600e3)) return;
      var h = d.getHours();
      W.t[h] = Math.round(f.temperature);
      W.c[h] = cond(f.condition);
      // Météo-France has no probability: derive it from the forecast condition / amount.
      W.p[h] = f.precipitation_probability != null ? f.precipitation_probability
        : (/rain|pouring|lightning|hail|snow/.test(f.condition || '') || f.precipitation >= 0.2) ? 80 : 0;
    });
    var last = w ? Math.round(w.attributes.temperature) : 15;
    for (var i = 0; i < 24; i++) { if (W.t[i] == null) W.t[i] = last; else last = W.t[i]; }
    var h0 = now.getHours();
    if (w) { W.t[h0] = Math.round(outdoorNow()); W.c[h0] = cond(w.state); }
    if (!W.daily) { W.hi = Math.max.apply(null, W.t); W.lo = Math.min.apply(null, W.t); }
    if (w) { W.humidity = w.attributes.humidity; W.wind = Math.round(w.attributes.wind_speed || 0); }
    App.emit('data');
  }

  // Today's high / low from the daily forecast.
  function refreshDaily() {
    H.call('weather', 'get_forecasts', { type: 'daily' }, { entity_id: CFG.weather }, true).then(function (r) {
      var res = r && r.response && r.response[CFG.weather];
      var list = (res && res.forecast) || [];
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var f = list.filter(function (x) { var d = new Date(x.datetime); d.setHours(0, 0, 0, 0); return +d === +today; })[0];
      if (!f || f.temperature == null) return;
      var W = D.weather;
      W.daily = true;
      W.hi = Math.round(f.temperature);
      W.lo = Math.round(f.templow != null ? f.templow : Math.min.apply(null, W.t));
      App.emit('data');
    }).catch(function () {});
  }

  function refreshForecast() {
    refreshDaily();
    H.call('weather', 'get_forecasts', { type: 'hourly' }, { entity_id: CFG.weather }, true).then(function (r) {
      var res = r && r.response && r.response[CFG.weather];
      if (res && res.forecast) applyForecast(res.forecast);
    }).catch(function () {});
  }

  function parseWhen(s) {
    if (s.length <= 10) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    return new Date(s);
  }
  // A person can have several agendas (e.g. work + personal): all are merged, identical entries are shown once.
  function refreshCalendars() {
    var start = new Date(); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    var end = new Date(start); end.setDate(end.getDate() + 60);
    var all = [], seen = {}, n = 0, jobs = [];
    CFG.people.forEach(function (p) { p.calendars.forEach(function (cal) { jobs.push({ p: p, cal: cal }); }); });
    Promise.all(jobs.map(function (j) {
      return H.call('calendar', 'get_events', { start_date_time: start.toISOString(), end_date_time: end.toISOString() }, { entity_id: j.cal }, true)
        .then(function (r) {
          var cal = r && r.response && r.response[j.cal];
          ((cal && cal.events) || []).forEach(function (e) {
            var key = j.p.id + '|' + (e.summary || '') + '|' + e.start + '|' + e.end;
            if (seen[key]) return;
            seen[key] = true;
            all.push({ id: 'e' + (++n), start: parseWhen(e.start), end: parseWhen(e.end), allDay: e.start.length <= 10, title: e.summary || '(sans titre)',
              people: [j.p.id], loc: e.location || '', notes: e.description || '' });
          });
        }).catch(function () {});
    })).then(function () {
      // stable order whatever agenda answered first: by start, then by person
      var order = CFG.people.map(function (p) { return p.id; });
      all.sort(function (x, y) { return (x.start - y.start) || (order.indexOf(x.people[0]) - order.indexOf(y.people[0])); });
      D.events.length = 0;
      all.forEach(function (e) { D.events.push(e); });
      App.emit('data');
    });
  }
  setInterval(function () { if (H.connected) { refreshCalendars(); refreshForecast(); } }, 10 * 60 * 1000);

  // The current hour always reflects the live weather entity; the forecast fills the other hours.
  function syncWeatherNow() {
    var w = st(CFG.weather);
    if (!w || w.attributes.temperature == null) return;
    var W = D.weather, h = new Date().getHours();
    W.t[h] = Math.round(outdoorNow());
    W.c[h] = cond(w.state);
    W.state = w.state; // raw Home Assistant condition, used for the animated main icon
    W.humidity = w.attributes.humidity;
    W.wind = Math.round(w.attributes.wind_speed || 0);
    if (!W.daily) { W.hi = Math.max.apply(null, W.t); W.lo = Math.min.apply(null, W.t); }
    if (w.attributes.apparent_temperature != null) W.feels = Math.round(w.attributes.apparent_temperature);
  }

  var lastSig = '';
  function signature() {
    var W = D.weather;
    return JSON.stringify([D.people, D.rooms, D.devices, D.scenes, D.climate, D.climates, D.media, D.extra, D.machines, W.state, W.hi, W.lo, W.t, W.c, W.p]);
  }
  function sync() {
    syncWeatherNow();
    syncPeople(); syncLights(); syncScenes(); syncClimate(); syncClimates(); syncMedia(); syncExtra(); syncAppliances(); syncMachines();
    var sig = signature();
    if (sig === lastSig) return;
    lastSig = sig;
    App.emit('data');
  }

  // ------------------------------------------------------------------ commands from the views
  // Views update the UI optimistically; these mirror the change to Home Assistant.
  H.scene = function (entity) { return act('scene', 'turn_on', entity); };
  H.setClimate = function (temp, mode) {
    var e = CFG.climate;
    if (mode) act('climate', 'set_hvac_mode', e, { hvac_mode: mode });
    if (temp != null) act('climate', 'set_temperature', e, { temperature: temp });
  };
  // Set a heating / cooling device: temperature, hvac mode and/or fan mode.
  H.setClimateOf = function (entity, temp, mode, fan) {
    if (mode) act('climate', 'set_hvac_mode', entity, { hvac_mode: mode });
    if (temp != null) act('climate', 'set_temperature', entity, { temperature: temp });
    if (fan) act('climate', 'set_fan_mode', entity, { fan_mode: fan });
  };
  H.playPause = function () { if (D.media.entity) act('media_player', 'media_play_pause', D.media.entity); };
  H.mediaNext = function () { if (D.media.entity) act('media_player', 'media_next_track', D.media.entity); };
  H.mediaPrev = function () { if (D.media.entity) act('media_player', 'media_previous_track', D.media.entity); };
  H.volume = function (v) { if (D.media.entity) act('media_player', 'volume_set', D.media.entity, { volume_level: v / 100 }); };
  H.vacuum = function (service) { act('vacuum', service, CFG.vacuum); };

  connect();
})();
