// Live data model. Empty at load: ha.js fills it from Home Assistant and views read it from here.
window.DATA = (function () {
  function hours(v) { var a = []; for (var i = 0; i < 24; i++) a.push(v); return a; }

  return {
    // people + calendar
    people: [],
    ALL: [],
    family: { id: 'family', name: 'Famille', color: '#111111', rgb: '17 17 17', ink: '#FFFFFF' },
    events: [],
    // home control
    rooms: [],
    devices: [],
    scenes: [],
    climate: { current: null, set: 21, mode: 'off', humidity: null, outside: null },
    climates: [], // radiator valves + air conditioner, filled by ha.js
    machines: [], // running / just finished machines (oven, washer, dishwasher, coffee), filled by ha.js
    media: { room: '', title: '', artist: '', playing: false, volume: 0, rooms: [], anyPlaying: false, source: '', duration: 0, position: 0, positionAt: 0 },
    // weather (index = hour of day)
    weather: { state: null, hi: 0, lo: 0, feels: 0, humidity: 0, wind: 0, t: hours(0), c: hours('cloud'), p: hours(0) },
    // glanceable extras shown on the home screen
    extra: {
      velib: { name: '', ebike: null, mech: null, docks: null },
      energy: { month: null, cost: null, sub: null, total: null, day: null },
      uv: null,
      alert: null,  // Météo-France warning: { level: 'Jaune'|'Orange'|'Rouge', items: [{ name, level }] }, null when green
      appliances: [], // [{ kind: 'run'|'alert', label, sub, pct, color }]
      sunElev: null, // sun elevation in degrees (negative = below the horizon), drives the clock card's sky colour
      night: null, // true once the sun is below the horizon (Home Assistant sun.sun)
      aqi: null,
      vacuum: null
    }
  };
})();
