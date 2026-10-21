// Ambient light: the kiosk app exposes the frame's light sensor as window.HomeHQ.lux().
// In "Auto" theme the dashboard goes dark when the room is dark (with hysteresis so it never flickers),
// and falls back to sunset (Home Assistant sun.sun) when no sensor is available.
(function () {
  'use strict';

  var KEY = 'hq-lux';
  var L = App.light = {
    lux: null,        // smoothed reading (null without sensor)
    raw: null,
    dark: null,       // null = no sensor, true / false once known
    DARK: 12,         // below this for HOLD_S seconds → dark
    LIGHT: 30,        // above this for HOLD_S seconds → light
    HOLD_S: 8
  };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) { L.DARK = saved.dark || L.DARK; L.LIGHT = saved.light || L.LIGHT; }
  } catch (e) {}
  App.setLightThresholds = function (dark, light) {
    L.DARK = dark; L.LIGHT = light;
    try { localStorage.setItem(KEY, JSON.stringify({ dark: dark, light: light })); } catch (e) {}
  };

  var buf = [], streak = 0;
  function tick() {
    var b = window.HomeHQ;
    if (!b || typeof b.lux !== 'function') return;
    var v = b.lux();
    if (typeof v !== 'number' || v < 0) return;
    L.raw = v;
    buf.push(v);
    if (buf.length > 5) buf.shift();
    // Median of the last readings: a single odd sample (e.g. the sensor warming up) is ignored.
    var sorted = buf.slice().sort(function (x, y) { return x - y; });
    var avg = sorted[Math.floor(sorted.length / 2)];
    L.lux = avg;
    if (buf.length < 5) return;

    var before = L.dark;
    if (L.dark == null) {
      L.dark = avg < (L.DARK + L.LIGHT) / 2;
    } else if (L.dark && avg > L.LIGHT) {
      streak++; if (streak >= L.HOLD_S) { L.dark = false; streak = 0; }
    } else if (!L.dark && avg < L.DARK) {
      streak++; if (streak >= L.HOLD_S) { L.dark = true; streak = 0; }
    } else {
      streak = 0;
    }
    if (L.dark !== before) App.applyTheme();
  }
  setInterval(tick, 1000);
})();
