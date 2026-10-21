// Arrival welcome: when a person goes from "away" to "home" (Home Assistant person entity),
// show their photo, a greeting and their next appointment for a few seconds.
(function () {
  'use strict';
  var D = window.DATA;
  var SHOW_MS = 12000, timer = null;

  function nextEventOf(id) {
    var now = App.now();
    var list = App.events().filter(function (e) { return e.people.indexOf(id) > -1 && e.end > now; });
    list.sort(function (a, b) { return a.start - b.start; });
    return list[0] || null;
  }

  function greeting() {
    var h = App.now().getHours();
    return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  }

  function nextLine(id) {
    var e = nextEventOf(id);
    if (!e) return 'Rien de prévu pour le moment.';
    var when = e.allDay ? App.fmt.rel(e.start).toLowerCase() : App.fmt.rel(e.start).toLowerCase() + ' à ' + App.fmt.time(e.start, false);
    return 'Prochain rendez-vous : <b>' + App.esc(e.title) + '</b> · ' + when;
  }

  App.welcome = function (id) {
    var p = App.person(id);
    if (!p || p.id === 'family') return;
    clearTimeout(timer);
    if (App.mode !== 'day') { App.setMode('day'); App.go('home'); }
    App.resetIdle();
    App.sheet('<div class="welcome" style="' + App.pstyle(p) + '">' +
      App.avatar(p, 168) +
      '<div class="welcome-text"><div class="label">Arrivée à la maison</div>' +
      '<h2 class="serif welcome-h">' + greeting() + ' <i>' + App.esc(p.name) + '</i></h2>' +
      '<p class="welcome-p">' + nextLine(id) + '</p></div></div>', { cls: 'sheet--welcome' });
    timer = setTimeout(function () { App.closeSheet(); }, SHOW_MS);
  };

  App.on('arrival', function (id) { App.welcome(id); });
})();
