(function () {
  var el = document.getElementById('pixel-office');
  if (!el) return;

  el.innerHTML =
    '<div class="po-wrap">' +
      '<div class="po-header"><span class="po-title">claude is working</span><span class="po-blink">▊</span></div>' +
      '<div class="po-log" id="po-log"></div>' +
    '</div>';

  var log = document.getElementById('po-log');
  var src = el.dataset.replaySrc || 'pixel-office/replay.json';
  var FALLBACK = [
    'Reading resources', 'Editing daily', 'Searching',
    'Browsing croquetqld.org', 'Running: python', 'Briefing team member',
    'Reading system', 'Editing projects', 'Searching', 'Reading inbox'
  ];

  function addLine(text) {
    var d = document.createElement('div');
    d.className = 'po-entry';
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 9) log.removeChild(log.firstChild);
  }

  function startLoop(labels) {
    var i = Math.floor(Math.random() * labels.length);
    function next() {
      addLine(labels[i % labels.length]);
      i++;
      setTimeout(next, 900 + Math.random() * 1400);
    }
    next();
  }

  fetch(src)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (replay) {
      var seen = {};
      var labels = [];
      (replay.events || []).forEach(function (e) {
        if (e.t === 'toolStart' && e.label && !seen[e.label]) {
          seen[e.label] = 1;
          labels.push(e.label);
        }
      });
      startLoop(labels.length > 5 ? labels : FALLBACK);
    })
    .catch(function () { startLoop(FALLBACK); });
})();
