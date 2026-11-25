(function () {
  'use strict';

  var SETTINGS_KEY = 'cabfare.settings.v1';
  var TRIPS_KEY = 'cabfare.trips.v1';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- storage ---------------- */

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('Could not save. Storage is full or unavailable.');
    }
  }

  function loadSettings() {
    var d = clone(Fare.DEFAULT_SETTINGS);
    var s = load(SETTINGS_KEY, null);
    if (!s) return d;
    ['day', 'night'].forEach(function (t) {
      Object.keys(d[t]).forEach(function (k) {
        if (s[t] && isFinite(parseFloat(s[t][k]))) d[t][k] = parseFloat(s[t][k]);
      });
    });
    if (/^\d\d:\d\d$/.test(s.nightStart)) d.nightStart = s.nightStart;
    if (/^\d\d:\d\d$/.test(s.nightEnd)) d.nightEnd = s.nightEnd;
    if (typeof s.currency === 'string') d.currency = s.currency;
    if (typeof s.round === 'boolean') d.round = s.round;
    return d;
  }

  var settings = loadSettings();
  var trips = load(TRIPS_KEY, []);
  if (!Array.isArray(trips)) trips = [];

  /* ---------------- formatting ---------------- */

  function money(n) {
    var opts = Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return settings.currency + n.toLocaleString(undefined, opts);
  }

  function trimNum(n) { return String(Math.round(n * 100) / 100); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeKey(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }

  function fmtDay(d) {
    var today = new Date();
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dateKey(d) === dateKey(today)) return 'Today';
    if (dateKey(d) === dateKey(yesterday)) return 'Yesterday';
    var opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---------------- fare screen ---------------- */

  var state = { tariff: 'auto', mode: 'calc', customTime: false };

  function tripDate() {
    if (state.customTime && $('inDate').value && $('inTime').value) {
      var d = new Date($('inDate').value + 'T' + $('inTime').value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function activeTariff(when) {
    if (state.tariff !== 'auto') return state.tariff;
    return Fare.isNight(when, settings.nightStart, settings.nightEnd) ? 'night' : 'day';
  }

  function currentFare() {
    var when = tripDate();
    var tariff = activeTariff(when);
    var result = { when: when, tariff: tariff, mode: state.mode };
    if (state.mode === 'manual') {
      var amount = Fare.num($('inManual').value);
      result.total = settings.round ? Math.round(amount) : Math.round(amount * 100) / 100;
      result.valid = result.total > 0;
    } else {
      result.km = Fare.num($('inKm').value);
      result.waitMin = Fare.num($('inWait').value);
      result.parts = Fare.calculate(
        { km: result.km, waitMin: result.waitMin, extras: $('inExtras').value },
        settings[tariff], settings.round);
      result.total = result.parts.total;
      result.valid = result.km > 0 || result.waitMin > 0;
    }
    return result;
  }

  function setSegment(container, value) {
    Array.prototype.forEach.call(container.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-value') === value ? 'true' : 'false');
    });
  }

  function line(label, amount) {
    var row = el('div');
    row.appendChild(el('span', null, label));
    row.appendChild(el('span', null, amount));
    return row;
  }

  function renderFare() {
    var f = currentFare();
    var night = f.tariff === 'night';
    var rates = settings[f.tariff];

    $('hero').classList.toggle('is-night', night);
    var chip = $('tariffChip');
    chip.textContent = '';
    chip.appendChild(icon(night ? 'i-moon' : 'i-sun'));
    chip.appendChild(document.createTextNode(
      (night ? 'Night fare' : 'Day fare') + (state.tariff === 'auto' ? ' · auto' : '')));

    $('heroClock').textContent = state.customTime ? fmtDate(f.when) + ', ' + fmtTime(f.when) : fmtTime(f.when);
    $('heroTotal').textContent = f.valid ? money(f.total) : settings.currency + '0';

    if (f.mode === 'manual') {
      $('heroSub').textContent = 'Fare typed by you';
    } else {
      $('heroSub').textContent = money(rates.base) + ' for first ' + trimNum(rates.includedKm) +
        ' km, then ' + money(rates.perKm) + '/km';
    }

    setSegment($('tariffSeg'), state.tariff);
    setSegment($('modeSeg'), state.mode);
    $('calcCard').hidden = state.mode !== 'calc';
    $('manualCard').hidden = state.mode !== 'manual';

    $('timeToggle').textContent = state.customTime ? 'Use current time' : 'Now · Change';
    $('timeEdit').hidden = !state.customTime;

    var bd = $('breakdown');
    bd.textContent = '';
    if (f.mode === 'calc' && f.valid) {
      var p = f.parts;
      bd.appendChild(line('Base fare (first ' + trimNum(rates.includedKm) + ' km)', money(p.base)));
      if (p.extraKm > 0) bd.appendChild(line(trimNum(p.extraKm) + ' km × ' + money(rates.perKm), money(round2(p.distance))));
      if (p.waiting > 0) bd.appendChild(line(trimNum(f.waitMin) + ' min waiting × ' + money(rates.waitPerMin), money(round2(p.waiting))));
      if (p.extras > 0) bd.appendChild(line('Toll, parking, other', money(round2(p.extras))));
    }

    var btn = $('addBtn');
    btn.disabled = !f.valid;
    btn.textContent = f.valid ? 'Add trip · ' + money(f.total) : 'Add trip';
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function resetForm() {
    ['inKm', 'inWait', 'inExtras', 'inManual', 'inNote'].forEach(function (id) { $(id).value = ''; });
    state.customTime = false;
    state.tariff = 'auto'; // a forced tariff applies to one trip, so it cannot go stale
    renderFare();
  }

  function addTrip() {
    var f = currentFare();
    if (!f.valid) return;
    var trip = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: f.when.getTime(),
      tariff: f.tariff,
      fare: f.total,
      note: $('inNote').value.trim()
    };
    if (f.mode === 'calc') {
      trip.km = f.km;
      trip.waitMin = f.waitMin;
      trip.extras = f.parts.extras;
    }
    trips.push(trip);
    save(TRIPS_KEY, trips);
    resetForm();
    renderTrips();
    toast('Added ' + money(trip.fare) + ' · ' + fmtDay(f.when) + ', ' + fmtTime(f.when), 'Undo', function () {
      removeTrip(trip.id);
    });
  }

  /* ---------------- trips screen ---------------- */

  function removeTrip(id) {
    trips = trips.filter(function (t) { return t.id !== id; });
    save(TRIPS_KEY, trips);
    renderTrips();
  }

  function sumSince(startMs) {
    var total = 0, count = 0;
    trips.forEach(function (t) {
      if (t.ts >= startMs) { total += t.fare; count++; }
    });
    return { total: round2(total), count: count };
  }

  function tile(label, data) {
    var t = el('div', 'tile');
    t.appendChild(el('div', 'tile-label', label));
    t.appendChild(el('div', 'tile-value', money(data.total)));
    t.appendChild(el('div', 'tile-count', data.count + (data.count === 1 ? ' trip' : ' trips')));
    return t;
  }

  function tripDetail(t) {
    var bits = [];
    if (t.km) bits.push(trimNum(t.km) + ' km');
    if (t.waitMin) bits.push(trimNum(t.waitMin) + ' min wait');
    if (t.note) bits.push(t.note);
    if (!bits.length) bits.push(t.tariff === 'night' ? 'Night fare' : 'Day fare');
    return bits.join(' · ');
  }

  function renderTrips() {
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7)); // Monday
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    var tiles = $('tiles');
    tiles.textContent = '';
    tiles.appendChild(tile('Today', sumSince(dayStart.getTime())));
    tiles.appendChild(tile('This week', sumSince(weekStart.getTime())));
    tiles.appendChild(tile('This month', sumSince(monthStart.getTime())));

    var todayCount = sumSince(dayStart.getTime()).count;
    $('navBadge').hidden = todayCount === 0;
    $('navBadge').textContent = todayCount;

    var list = $('tripList');
    list.textContent = '';
    $('clearBtn').hidden = trips.length === 0;
    $('shareBtn').hidden = trips.length === 0;

    if (!trips.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('strong', null, 'No trips yet'));
      empty.appendChild(document.createTextNode('Each trip you add is saved here with its date, time and fare.'));
      var go = el('button', null, 'Add a trip');
      go.type = 'button';
      go.addEventListener('click', function () { show('fare'); });
      empty.appendChild(document.createElement('br'));
      empty.appendChild(go);
      list.appendChild(empty);
      return;
    }

    var sorted = trips.slice().sort(function (a, b) { return b.ts - a.ts; });
    var groups = [];
    sorted.forEach(function (t) {
      var key = dateKey(new Date(t.ts));
      var last = groups[groups.length - 1];
      if (!last || last.key !== key) groups.push(last = { key: key, items: [], total: 0 });
      last.items.push(t);
      last.total += t.fare;
    });

    groups.forEach(function (g) {
      var head = el('div', 'day-head');
      head.appendChild(el('span', null, fmtDay(new Date(g.items[0].ts))));
      head.appendChild(el('span', null, money(round2(g.total))));
      list.appendChild(head);

      var card = el('div', 'card');
      g.items.forEach(function (t) {
        var when = new Date(t.ts);
        var row = el('div', 'trip');
        var mark = el('div', 'trip-mark' + (t.tariff === 'night' ? ' is-night' : ''));
        mark.appendChild(icon(t.tariff === 'night' ? 'i-moon' : 'i-sun'));
        mark.setAttribute('title', t.tariff === 'night' ? 'Night fare' : 'Day fare');
        row.appendChild(mark);

        var main = el('div', 'trip-main');
        main.appendChild(el('div', 'trip-time', fmtTime(when)));
        main.appendChild(el('div', 'trip-detail', tripDetail(t)));
        row.appendChild(main);

        row.appendChild(el('div', 'trip-fare', money(t.fare)));

        var del = el('button', 'trip-del');
        del.type = 'button';
        del.setAttribute('aria-label', 'Delete trip at ' + fmtTime(when) + ', ' + money(t.fare));
        del.appendChild(icon('i-trash'));
        del.addEventListener('click', function () {
          removeTrip(t.id);
          toast('Trip deleted', 'Undo', function () {
            trips.push(t);
            save(TRIPS_KEY, trips);
            renderTrips();
          });
        });
        row.appendChild(del);
        card.appendChild(row);
      });
      list.appendChild(card);
    });
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function shareTrips() {
    var rows = [['Date', 'Time', 'Tariff', 'Distance (km)', 'Waiting (min)', 'Extras', 'Fare', 'Note']];
    var total = 0;
    trips.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (t) {
      var d = new Date(t.ts);
      total += t.fare;
      rows.push([dateKey(d), timeKey(d), t.tariff, t.km || '', t.waitMin || '', t.extras || '', t.fare, t.note || '']);
    });
    rows.push(['Total', '', '', '', '', '', round2(total), '']);
    var text = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    var subject = 'Cab trips (' + trips.length + ')';

    if (window.AndroidBridge && AndroidBridge.share) {
      AndroidBridge.share(subject, text);
    } else if (navigator.share) {
      navigator.share({ title: subject, text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('Trips copied'); });
    }
  }

  /* ---------------- rates screen ---------------- */

  var RATE_FIELDS = [
    { key: 'base', label: 'Base fare', money: true },
    { key: 'includedKm', label: 'Distance included in base', unit: 'km' },
    { key: 'perKm', label: 'Per km after that', money: true },
    { key: 'waitPerMin', label: 'Waiting, per minute', money: true }
  ];

  function buildRates() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-rates]'), function (card) {
      var tariff = card.getAttribute('data-rates');
      card.textContent = '';
      RATE_FIELDS.forEach(function (f) {
        var row = el('label', 'row');
        row.appendChild(el('span', 'row-label', f.label));
        var wrap = el('span', 'input-wrap');
        if (f.money) wrap.appendChild(el('span', 'unit unit-pre cur', settings.currency));
        var input = el('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.min = '0';
        input.step = 'any';
        input.value = settings[tariff][f.key];
        input.addEventListener('change', function () {
          var v = parseFloat(input.value);
          if (!isFinite(v) || v < 0) v = Fare.DEFAULT_SETTINGS[tariff][f.key];
          settings[tariff][f.key] = v;
          input.value = v;
          save(SETTINGS_KEY, settings);
          renderFare();
        });
        wrap.appendChild(input);
        if (f.unit) wrap.appendChild(el('span', 'unit', f.unit));
        row.appendChild(wrap);
        card.appendChild(row);
      });
    });

    $('setNightStart').value = settings.nightStart;
    $('setNightEnd').value = settings.nightEnd;
    $('setCurrency').value = settings.currency;
    $('setRound').checked = settings.round;
    paintCurrency();
  }

  function paintCurrency() {
    Array.prototype.forEach.call(document.querySelectorAll('.cur'), function (n) {
      n.textContent = settings.currency;
    });
  }

  function settingsChanged() {
    save(SETTINGS_KEY, settings);
    paintCurrency();
    renderFare();
    renderTrips();
  }

  /* ---------------- toast and confirm ---------------- */

  var toastTimer = null;

  function toast(text, actionLabel, action) {
    $('toastText').textContent = text;
    var btn = $('toastAction');
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || '';
    btn.onclick = function () {
      hideToast();
      if (action) action();
    };
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
  }

  function confirmSheet(title, body, okLabel, onOk) {
    $('confirmTitle').textContent = title;
    $('confirmBody').textContent = body;
    $('confirmOk').textContent = okLabel;
    $('confirmOk').onclick = function () {
      $('confirm').hidden = true;
      onOk();
    };
    $('confirm').hidden = false;
    $('confirmCancel').focus();
  }

  /* ---------------- navigation ---------------- */

  var currentView = 'fare';

  function show(view) {
    currentView = view;
    ['fare', 'trips', 'rates'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    Array.prototype.forEach.call($('nav').querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-view') === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    hideToast();
    window.scrollTo(0, 0);
    if (view === 'trips') renderTrips();
    if (view === 'fare') renderFare();
  }

  // Called by the Android back button. Returns true when the app handled it.
  window.cabfareBack = function () {
    if (!$('confirm').hidden) { $('confirm').hidden = true; return true; }
    if (currentView !== 'fare') { show('fare'); return true; }
    return false;
  };

  /* ---------------- wiring ---------------- */

  $('tariffSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) { state.tariff = b.getAttribute('data-value'); renderFare(); }
  });

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) { state.mode = b.getAttribute('data-value'); renderFare(); }
  });

  ['inKm', 'inWait', 'inExtras', 'inManual', 'inDate', 'inTime'].forEach(function (id) {
    $(id).addEventListener('input', renderFare);
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-add-km]'), function (b) {
    b.addEventListener('click', function () {
      var next = Fare.num($('inKm').value) + parseFloat(b.getAttribute('data-add-km'));
      $('inKm').value = trimNum(next);
      renderFare();
    });
  });

  $('timeToggle').addEventListener('click', function () {
    state.customTime = !state.customTime;
    if (state.customTime) {
      var now = new Date();
      $('inDate').value = dateKey(now);
      $('inTime').value = timeKey(now);
    }
    renderFare();
  });

  $('addBtn').addEventListener('click', addTrip);
  $('shareBtn').addEventListener('click', shareTrips);

  $('clearBtn').addEventListener('click', function () {
    confirmSheet('Delete all trips?',
      'This removes all ' + trips.length + ' saved trips from this phone. It cannot be undone.',
      'Delete all', function () {
        trips = [];
        save(TRIPS_KEY, trips);
        renderTrips();
      });
  });

  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) show(b.getAttribute('data-view'));
  });

  $('setNightStart').addEventListener('change', function () {
    if (this.value) { settings.nightStart = this.value; settingsChanged(); }
  });
  $('setNightEnd').addEventListener('change', function () {
    if (this.value) { settings.nightEnd = this.value; settingsChanged(); }
  });
  $('setCurrency').addEventListener('input', function () {
    settings.currency = this.value.trim();
    settingsChanged();
  });
  $('setRound').addEventListener('change', function () {
    settings.round = this.checked;
    settingsChanged();
  });

  $('resetBtn').addEventListener('click', function () {
    confirmSheet('Reset rates?',
      'Day fare, night fare and night hours go back to the starting values. Your saved trips are kept.',
      'Reset', function () {
        settings = clone(Fare.DEFAULT_SETTINGS);
        save(SETTINGS_KEY, settings);
        buildRates();
        renderFare();
        renderTrips();
      });
  });

  $('confirmCancel').addEventListener('click', function () { $('confirm').hidden = true; });
  $('confirm').addEventListener('click', function (e) {
    if (e.target === this) this.hidden = true;
  });

  // Hide the bottom bars while the on-screen keyboard is open.
  var fullHeight = window.innerHeight;
  window.addEventListener('resize', function () {
    if (window.innerHeight > fullHeight) fullHeight = window.innerHeight;
    document.body.classList.toggle('kbd', window.innerHeight < fullHeight * 0.75);
  });

  // Keep the clock and the automatic day/night switch current.
  setInterval(function () { if (currentView === 'fare') renderFare(); }, 15000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { renderFare(); renderTrips(); }
  });

  buildRates();
  renderTrips();
  show('fare');
})();
