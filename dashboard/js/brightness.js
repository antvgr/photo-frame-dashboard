// Screen brightness. Android's own automatic brightness is a bit too strong on this frame, so the dashboard drives the
// backlight itself (window brightness of the kiosk app): "Auto" follows the light sensor through its own, darker curve
// (adjustable), "Manuel" is a fixed level. Without the kiosk app (desktop browser) nothing happens.
(function () {
  'use strict';
  var KEY = 'hq-bright';
  var B = App.bright = { mode: 'auto', manual: 0.5, adjust: 1, level: null };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { B.mode = s.mode || B.mode; B.manual = s.manual != null ? s.manual : B.manual; B.adjust = s.adjust != null ? s.adjust : B.adjust; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ mode: B.mode, manual: B.manual, adjust: B.adjust })); } catch (e) {} }

  // lux -> brightness (0..1), interpolated on a log scale between these points (the sensor sits behind the glass: readings are low)
  var CURVE = [[0, .03], [3, .06], [10, .10], [30, .16], [100, .28], [300, .46], [1000, .70], [3000, 1]];
  function curve(lux) {
    if (lux <= CURVE[0][0]) return CURVE[0][1];
    for (var i = 1; i < CURVE.length; i++) {
      if (lux <= CURVE[i][0]) {
        var a = CURVE[i - 1], b = CURVE[i];
        var t = (Math.log(lux + 1) - Math.log(a[0] + 1)) / (Math.log(b[0] + 1) - Math.log(a[0] + 1));
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return 1;
  }
  // target brightness now
  B.target = function () {
    if (B.mode === 'manual') return Math.max(0.03, Math.min(1, B.manual));
    var lux = App.light && App.light.lux;
    var base = lux == null ? 0.3 : curve(lux);
    return Math.max(0.03, Math.min(1, base * B.adjust));
  };

  function push(v) {
    var h = window.HomeHQ;
    if (h && typeof h.setBrightness === 'function') { try { h.setBrightness(v); } catch (e) {} }
  }
  B.set = function (patch) {
    Object.keys(patch).forEach(function (k) { B[k] = patch[k]; });
    save();
    B.apply(true);
  };
  // Ease towards the target (no jumps when a cloud passes); manual changes apply at once.
  B.apply = function (now) {
    var t = B.target();
    if (B.level == null || now) B.level = t;
    else B.level += (t - B.level) * 0.2;
    if (Math.abs(B.level - t) < 0.004) B.level = t;
    if (B.last == null || Math.abs(B.level - B.last) >= 0.005) { B.last = B.level; push(B.level); }
  };
  setInterval(function () { B.apply(false); }, 1000);
  App.on('ready', function () { B.apply(true); });
})();
