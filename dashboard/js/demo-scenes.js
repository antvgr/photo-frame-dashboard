// Demonstration scenes (only without a Home Assistant token, e.g. in the design showcase):
//   ?m=linge:wash,four:cook,vaisselle:done   machines to show (stage = pre|wash|rinse|spin|dry|cook|brew|heat|done)
//   &view=machines|home|ambient|calendar|control|player   &sel=linge (one machine enlarged)
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  if (!qs.get('m') && !qs.get('view')) return;
  App.on('ready', function () {
    if (App.ha && App.ha.enabled) return;
    var D = window.DATA, now = Date.now();
    var IDX = { pre: 0, wash: 1, rinse: 2, spin: 3, dry: 3, cook: 1, brew: 0, heat: 0 };
    function mk(id, stage) {
      var done = stage === 'done', i = IDX[stage] || 0, labels, m;
      function steps(l, det) { return l.map(function (n, k) { return [n, done || k < i ? 'done' : k === i ? 'now' : 'todo', (det && det[n]) || '']; }); }
      if (id === 'linge') {
        labels = ['Prélavage', 'Lavage', 'Rinçage', 'Essorage'];
        m = { id: id, kind: 'washer', name: 'Lave-linge', steps: steps(labels, { Lavage: 'Eau 30°', 'Rinçage': '3 rinçages', Essorage: '1200 tr/min' }), cur: labels[i], pct: [8, 30, 62, 88][i], min: [58, 42, 24, 9][i], chips: ['Programme Coton'], note: 'à étendre' };
      } else if (id === 'vaisselle') {
        labels = ['Prélavage', 'Lavage', 'Rinçage', 'Séchage'];
        m = { id: id, kind: 'dish', name: 'Lave-vaisselle', steps: steps(labels), cur: labels[i], pct: [10, 38, 70, 90][i], min: [110, 80, 40, 18][i], chips: ['Programme Eco', 'Sel : OK', 'Rinçage : OK', 'Porte fermée'], note: 'à vider' };
      } else if (id === 'four') {
        labels = ['Préchauffage', 'Cuisson', 'Terminé'];
        m = { id: id, kind: 'oven', name: 'Four', steps: steps(labels), cur: labels[i], pct: [30, 55, 100][i], min: [12, 35, 0][i], temp: [120, 180, 180][i], set: 180, chips: ['Consigne 180°', 'Chaleur tournante', 'Porte fermée'] };
      } else {
        m = { id: 'cafe', kind: 'coffee', name: 'Machine à café', steps: [], cur: 'Espresso', pct: 60, min: 1, chips: ['Bac : OK', 'Grains : OK'] };
      }
      m.status = done ? 'done' : 'run';
      m.doneAt = done ? now - 12 * 60000 : null;
      m.finish = done || id === 'cafe' ? null : Math.round((now + m.min * 60000) / 60000) * 60000;
      if (done) { m.cur = 'Terminé'; m.pct = 100; }
      return m;
    }
    // fictional household for the showcase (no real data)
    function at(dayOff, h, m) { var d = new Date(); d.setDate(d.getDate() + dayOff); d.setHours(h, m || 0, 0, 0); return d; }
    D.people = [
      { id: 'hugo', name: 'Hugo', color: '#FF7A1A', rgb: '255 122 26', ink: '#111111', home: true, photo: '', status: 'Maison' },
      { id: 'theo', name: 'Théo', color: '#2D5BFF', rgb: '45 91 255', ink: '#FFFFFF', home: false, photo: '', status: 'Travail' }
    ];
    D.ALL = ['hugo', 'theo'];
    D.events = [
      { id: 'd1', start: at(0, 9, 30), end: at(0, 10, 30), allDay: false, title: 'Point équipe', people: ['theo'], loc: '', notes: '' },
      { id: 'd2', start: at(0, 19, 0), end: at(0, 21, 0), allDay: false, title: 'Dîner chez Maxime', people: ['hugo', 'theo'], loc: 'Paris 11e', notes: '' },
      { id: 'd3', start: at(1, 8, 45), end: at(1, 9, 30), allDay: false, title: 'Dentiste', people: ['hugo'], loc: '', notes: '' },
      { id: 'd4', start: at(2, 18, 30), end: at(2, 20, 0), allDay: false, title: 'Yoga', people: ['hugo'], loc: '', notes: '' },
      { id: 'd5', start: at(3, 0, 0), end: at(4, 0, 0), allDay: true, title: 'Week-end à la mer', people: ['hugo', 'theo'], loc: '', notes: '' }
    ];
    var hr = new Date().getHours(), tt = [], cc = [], pp = [];
    for (var h = 0; h < 24; h++) { tt.push(Math.round(12 + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI))); cc.push(h < 7 || h > 20 ? 'moon' : (h > 15 && h < 19 ? 'rain' : 'cloud')); pp.push(h > 15 && h < 19 ? 60 : 5); }
    D.weather = { state: 'partlycloudy', hi: 18, lo: 9, feels: 15, humidity: 58, wind: 14, t: tt, c: cc, p: pp };
    D.rooms = [{ id: 'salon', name: 'Salon', temp: 21.4 }, { id: 'cuisine', name: 'Cuisine', temp: 20.8 }, { id: 'chambre', name: 'Chambre', temp: 19.6 }, { id: 'bureau', name: 'Bureau', temp: 21.1 }];
    D.devices = [
      { id: 'l1', room: 'salon', type: 'light', group: true, name: 'Salon', on: true, level: 60, dimmable: true },
      { id: 'l2', room: 'salon', type: 'light', group: false, name: 'Lampadaire', on: true, level: 60, dimmable: true },
      { id: 'l3', room: 'cuisine', type: 'light', group: true, name: 'Cuisine', on: false, level: 100, dimmable: true },
      { id: 'l4', room: 'bureau', type: 'light', group: true, name: 'Bureau', on: true, level: 80, dimmable: true }
    ];
    D.scenes = [];
    D.climate = { current: 21.4, set: 21.5, mode: 'heat', humidity: null, outside: 12.6, entity: 'c1', modes: ['heat', 'auto', 'off'], step: 0.5, min: 4, max: 35 };
    D.climates = [
      { id: 'salon', name: 'Salon', entity: 'c1', kind: 'trv', available: true, mode: 'heat', action: 'heating', current: 21.4, set: 22, min: 4, max: 35, step: 0.5, modes: ['off', 'auto', 'heat'], fan: null, fanModes: [] },
      { id: 'chambre', name: 'Chambre', entity: 'c2', kind: 'trv', available: true, mode: 'heat', action: 'idle', current: 19.6, set: 19, min: 4, max: 35, step: 0.5, modes: ['off', 'auto', 'heat'], fan: null, fanModes: [] }
    ];
    D.media = { room: 'Salon', title: 'Party', artist: 'Troye Sivan', playing: true, volume: 14, rooms: ['Salon', 'Cuisine'], anyPlaying: true, source: '', duration: 195, position: 62, positionAt: Date.now(), entity: 'm1', art: '' };
    D.extra.velib = { name: 'Station', ebike: 4, mech: 7, docks: 12 };
    D.extra.energy = { month: 96.4, cost: 22.1, sub: 15.08, total: 37.18, day: 3.2 };
    D.extra.uv = 2; D.extra.aqi = 1; D.extra.sunElev = 28; D.extra.night = false; D.extra.vacuum = { state: 'docked', name: 'Aspirateur' };
    D.machines = (qs.get('m') || '').split(',').filter(Boolean).map(function (p) { var a = p.split(':'); return mk(a[0], a[1] || 'wash'); });
    App.emit('data');
    var view = qs.get('view') || 'home';
    if (view === 'ambient') { App.setMode('ambient'); return; }
    if (view === 'machines') App.openMachine(qs.get('sel') || 'all'); else App.go(view);
  });
})();
