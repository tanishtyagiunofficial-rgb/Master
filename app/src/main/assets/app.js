(function () {
  'use strict';

  var SETTINGS_KEY = 'cabfare.settings.v1';
  var TRIPS_KEY = 'cabfare.trips.v1';
  var THEME_KEY = 'cabfare.theme';

  var $ = function (id) { return document.getElementById(id); };
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    d.budget = 0;
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
    if (isFinite(parseFloat(s.budget)) && parseFloat(s.budget) > 0) d.budget = parseFloat(s.budget);
    return d;
  }

  var settings = loadSettings();
  var trips = load(TRIPS_KEY, []);
  if (!Array.isArray(trips)) trips = [];

  /* ---------------- formatting ---------------- */

  function round2(n) { return Math.round(n * 100) / 100; }

  function money(n) {
    var opts = Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return settings.currency + n.toLocaleString(undefined, opts);
  }

  // Short amount for a calendar cell: 385, 1.2k, 14k
  function compact(n) {
    if (n < 1000) return String(Math.round(n));
    if (n < 10000) return (Math.round(n / 100) / 10) + 'k';
    return Math.round(n / 1000) + 'k';
  }

  function applyRounding(n) { return settings.round ? Math.round(n) : round2(n); }

  function trimNum(n) { return String(round2(n)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function timeKey(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fromKey(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return dateKey(new Date()); }

  function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtTimeSec(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }); }
  function fmtDate(d) { return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtMonth(y, m) { return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }

  function fmtDay(d) {
    var today = new Date();
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dateKey(d) === dateKey(today)) return 'Today';
    if (dateKey(d) === dateKey(yesterday)) return 'Yesterday';
    var opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

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

  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // restart the CSS animation
    node.classList.add(cls);
  }

  /** Counts a money figure up or down to its new value. */
  function countTo(node, target) {
    var from = typeof node._value === 'number' ? node._value : 0;
    node._value = target;
    cancelAnimationFrame(node._raf);
    if (reducedMotion || from === target) { node.textContent = money(target); return; }
    var start = null;
    var whole = Number.isInteger(target) && Number.isInteger(from);
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / 450);
      var eased = 1 - Math.pow(1 - t, 3);
      var v = from + (target - from) * eased;
      node.textContent = money(t === 1 ? target : (whole ? Math.round(v) : round2(v)));
      if (t < 1) node._raf = requestAnimationFrame(frame);
    }
    node._raf = requestAnimationFrame(frame);
  }

  /* ---------------- effects ---------------- */

  function buzz() {
    try { if (window.AndroidBridge && AndroidBridge.haptic) AndroidBridge.haptic(); } catch (e) {}
  }

  var CONFETTI = ['#FFB703', '#FF9E1B', '#FFD34D', '#3D5FA8', '#6F93E0', '#1E9E5A', '#FFFFFF'];

  /** A short burst of confetti out of `origin` (an element), for a saved fare. */
  function confetti(origin) {
    if (reducedMotion) return;
    var r = origin ? origin.getBoundingClientRect() : null;
    var box = el('div', 'confetti');
    box.style.left = (r && r.width ? r.left + r.width / 2 : window.innerWidth / 2) + 'px';
    box.style.top = (r && r.width ? r.top + r.height / 2 : window.innerHeight * 0.6) + 'px';
    for (var i = 0; i < 30; i++) {
      var bit = el('i');
      var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      var dist = 70 + Math.random() * 130;
      bit.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
      bit.style.setProperty('--dy', Math.round(Math.sin(angle) * dist) + 'px');
      bit.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 720) + 'deg');
      bit.style.background = CONFETTI[i % CONFETTI.length];
      bit.style.animationDelay = Math.round(Math.random() * 90) + 'ms';
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1400);
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* ---------------- theme ---------------- */

  var themePref = 'auto';
  try { themePref = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
  if (['auto', 'light', 'dark'].indexOf(themePref) < 0) themePref = 'auto';
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function systemDark() {
    if (window.AndroidBridge && AndroidBridge.systemDark) return !!AndroidBridge.systemDark();
    return !!(darkQuery && darkQuery.matches);
  }

  function isDark() { return themePref === 'dark' || (themePref === 'auto' && systemDark()); }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark() ? 'dark' : 'light');
    $('themePill').setAttribute('aria-checked', isDark() ? 'true' : 'false');
    setSegment($('themeSeg'), themePref);
  }

  /** Switches theme; the new one opens in a circle from `origin` where the WebView supports it. */
  function setTheme(pref, origin) {
    var was = isDark();
    themePref = pref;
    try { localStorage.setItem(THEME_KEY, pref); } catch (e) {}
    if (was === isDark() || reducedMotion || !document.startViewTransition || !origin) { applyTheme(); return; }
    var r = origin.getBoundingClientRect();
    var root = document.documentElement;
    root.style.setProperty('--rx', Math.round(r.left + r.width / 2) + 'px');
    root.style.setProperty('--ry', Math.round(r.top + r.height / 2) + 'px');
    document.startViewTransition(applyTheme);
  }

  /* ---------------- trip data ---------------- */

  function saveTrips() { save(TRIPS_KEY, trips); }

  function tariffAt(when) {
    return Fare.isNight(when, settings.nightStart, settings.nightEnd) ? 'night' : 'day';
  }

  function isFuture(when) { return when.getTime() > Date.now() + 60000; }

  function monthTrips(y, m) {
    var start = new Date(y, m, 1).getTime();
    var end = new Date(y, m + 1, 1).getTime();
    return trips.filter(function (t) { return t.ts >= start && t.ts < end; });
  }

  function sumOf(list) {
    var total = 0;
    list.forEach(function (t) { total += t.fare; });
    return round2(total);
  }

  function sumSince(startMs) {
    var list = trips.filter(function (t) { return t.ts >= startMs; });
    return { total: sumOf(list), count: list.length };
  }

  /** Totals per calendar date: { 'YYYY-MM-DD': { total, count, day, night } } */
  function byDate(list) {
    var map = {};
    list.forEach(function (t) {
      var key = dateKey(new Date(t.ts));
      var d = map[key] || (map[key] = { total: 0, count: 0, day: 0, night: 0 });
      d.total += t.fare;
      d.count++;
      d[t.tariff === 'night' ? 'night' : 'day']++;
    });
    return map;
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- fare screen ---------------- */

  var state = { tariff: 'auto', mode: 'calc', customTime: false };
  var addDoneTimer = null;

  function tripDate() {
    if (state.customTime && $('inDate').value && $('inTime').value) {
      var d = new Date($('inDate').value + 'T' + $('inTime').value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function currentFare() {
    var when = tripDate();
    var tariff = state.tariff !== 'auto' ? state.tariff : tariffAt(when);
    var result = { when: when, tariff: tariff, mode: state.mode };
    if (state.mode === 'manual') {
      result.total = applyRounding(Fare.num($('inManual').value));
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
    each(container.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-value') === value ? 'true' : 'false');
    });
  }

  function line(label, amount) {
    var row = el('div');
    row.appendChild(el('span', null, label));
    row.appendChild(el('span', null, amount));
    return row;
  }

  var lastBreakdown = '';

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

    var now = new Date();
    var pill = $('heroMonth');
    pill.textContent = 'This month ' + money(sumOf(monthTrips(now.getFullYear(), now.getMonth())));
    pill.appendChild(icon('i-chev-r'));

    $('heroLabel').textContent = 'Fare at ' + (state.customTime ? fmtDate(f.when) + ', ' : '') + fmtTime(f.when);
    countTo($('heroTotal'), f.valid ? f.total : 0);

    $('heroSub').textContent = f.mode === 'manual'
      ? 'Fare typed by you'
      : money(rates.base) + ' for first ' + trimNum(rates.includedKm) + ' km, then ' + money(rates.perKm) + '/km';

    setSegment($('tariffSeg'), state.tariff);
    setSegment($('modeSeg'), state.mode);
    $('calcCard').hidden = state.mode !== 'calc';
    $('manualCard').hidden = state.mode !== 'manual';

    $('timeToggle').textContent = state.customTime ? 'Use current time' : 'Now · Change';
    $('timeEdit').hidden = !state.customTime;
    $('inDate').max = todayKey();

    // Rebuild the breakdown only when it changes, so its entry animation does not replay on every tick.
    var rows = [];
    if (f.mode === 'calc' && f.valid) {
      var p = f.parts;
      rows.push(['Base fare (first ' + trimNum(rates.includedKm) + ' km)', money(p.base)]);
      if (p.extraKm > 0) rows.push([trimNum(p.extraKm) + ' km × ' + money(rates.perKm), money(round2(p.distance))]);
      if (p.waiting > 0) rows.push([trimNum(f.waitMin) + ' min waiting × ' + money(rates.waitPerMin), money(round2(p.waiting))]);
      if (p.extras > 0) rows.push(['Toll, parking, other', money(round2(p.extras))]);
    }
    var signature = JSON.stringify(rows);
    if (signature !== lastBreakdown) {
      lastBreakdown = signature;
      var bd = $('breakdown');
      bd.textContent = '';
      rows.forEach(function (r) { bd.appendChild(line(r[0], r[1])); });
    }

    if (!addDoneTimer) {
      var btn = $('addBtn');
      btn.disabled = !f.valid;
      $('addBtnText').textContent = f.valid ? 'Add trip · ' + money(f.total) : 'Add trip';
    }
  }

  function resetForm() {
    ['inKm', 'inWait', 'inExtras', 'inManual', 'inNote'].forEach(function (id) { $(id).value = ''; });
    state.customTime = false;
    state.tariff = 'auto'; // a forced tariff applies to one trip, so it cannot go stale
  }

  function flashAdded() {
    var btn = $('addBtn');
    btn.disabled = true;
    replay(btn, 'is-done');
    $('addBtnText').textContent = 'Added';
    btn.insertBefore(icon('i-check'), btn.firstChild);
    clearTimeout(addDoneTimer);
    addDoneTimer = setTimeout(function () {
      addDoneTimer = null;
      btn.classList.remove('is-done');
      var check = btn.querySelector('svg');
      if (check) btn.removeChild(check);
      renderFare();
    }, 1100);
  }

  function addTrip() {
    var f = currentFare();
    if (!f.valid) return;
    if (isFuture(f.when)) {
      toast('That date and time is in the future. Pick today or an earlier date.');
      return;
    }
    var trip = { id: newId(), ts: f.when.getTime(), tariff: f.tariff, fare: f.total, note: $('inNote').value.trim() };
    if (f.mode === 'calc') {
      trip.km = f.km;
      trip.waitMin = f.waitMin;
      trip.extras = f.parts.extras;
    }
    trips.push(trip);
    saveTrips();
    resetForm();
    flashAdded();
    refresh();
    announceAdded(trip, $('addBtn'));
  }

  function announceAdded(trip, origin) {
    var when = new Date(trip.ts);
    replay($('navBadge'), 'bump');
    confetti(origin);
    buzz();
    toast('Added ' + money(trip.fare) + ' · ' + fmtDay(when) + ', ' + fmtTime(when), 'Undo', function () {
      removeTrip(trip.id);
    });
  }

  /* ---------------- shared trip row ---------------- */

  function removeTrip(id) {
    trips = trips.filter(function (t) { return t.id !== id; });
    saveTrips();
    refresh();
  }

  function tripDetail(t) {
    var bits = [];
    if (t.km) bits.push(trimNum(t.km) + ' km');
    if (t.waitMin) bits.push(trimNum(t.waitMin) + ' min wait');
    if (t.note) bits.push(t.note);
    if (!bits.length) bits.push(t.tariff === 'night' ? 'Night fare' : 'Day fare');
    return bits.join(' · ');
  }

  function tripRow(t, index) {
    var when = new Date(t.ts);
    var night = t.tariff === 'night';
    var row = el('div', 'trip');
    row.style.animationDelay = Math.min(index, 8) * 35 + 'ms';

    var mark = el('div', 'trip-mark' + (night ? ' is-night' : ''));
    mark.appendChild(icon(night ? 'i-moon' : 'i-sun'));
    mark.setAttribute('title', night ? 'Night fare' : 'Day fare');
    row.appendChild(mark);

    var main = el('button', 'trip-main');
    main.type = 'button';
    main.setAttribute('aria-label', 'Edit trip at ' + fmtTime(when) + ', ' + money(t.fare));
    main.appendChild(el('div', 'trip-time', fmtTime(when)));
    main.appendChild(el('div', 'trip-detail', tripDetail(t)));
    row.appendChild(main);
    row.appendChild(el('div', 'trip-fare', money(t.fare)));

    var del = el('button', 'icon-btn trip-del');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete trip at ' + fmtTime(when) + ', ' + money(t.fare));
    del.appendChild(icon('i-trash'));
    row.addEventListener('click', function (e) {
      if (!e.target.closest('.trip-del')) openAdd('edit', t);
    });
    del.addEventListener('click', function () {
      removeTrip(t.id);
      toast('Trip deleted', 'Undo', function () {
        trips.push(t);
        saveTrips();
        refresh();
      });
    });
    row.appendChild(del);
    return row;
  }

  /* ---------------- calendar screen ---------------- */

  var today0 = new Date();
  var cal = { y: today0.getFullYear(), m: today0.getMonth(), selected: todayKey() };

  function renderCalendar(direction, justAddedKey) {
    var now = new Date();
    var tKey = dateKey(now);
    var list = monthTrips(cal.y, cal.m);
    var days = byDate(list);
    var isCurrentMonth = cal.y === now.getFullYear() && cal.m === now.getMonth();

    var title = $('calTitle');
    title.textContent = '';
    title.appendChild(el('strong', null, fmtMonth(cal.y, cal.m)));
    title.appendChild(el('span', null, list.length
      ? money(sumOf(list)) + ' · ' + plural(list.length, 'trip') + ' ›'
      : 'No fares yet'));
    title.setAttribute('aria-label', fmtMonth(cal.y, cal.m) + ', show month total');
    $('calNext').disabled = isCurrentMonth;

    var grid = $('calGrid');
    grid.textContent = '';
    var lead = (new Date(cal.y, cal.m, 1).getDay() + 6) % 7; // Monday first
    var count = new Date(cal.y, cal.m + 1, 0).getDate();
    for (var i = 0; i < lead; i++) grid.appendChild(el('span'));

    for (var day = 1; day <= count; day++) {
      (function (day) {
        var key = cal.y + '-' + pad(cal.m + 1) + '-' + pad(day);
        var info = days[key];
        var future = key > tKey;
        var cell = el('button', 'cell');
        cell.type = 'button';
        if (info) cell.classList.add('has-fare');
        if (key === tKey) cell.classList.add('is-today');
        if (key === cal.selected) cell.classList.add('is-selected');
        if (future) { cell.classList.add('is-future'); cell.disabled = true; }
        if (key === justAddedKey) cell.classList.add('just-added');

        cell.appendChild(el('span', 'cell-num', day));
        cell.appendChild(el('span', 'cell-amt', info ? compact(info.total) : ''));
        var dots = el('span', 'cell-dots');
        if (info && info.day) dots.appendChild(el('i', 'dot dot-day'));
        if (info && info.night) dots.appendChild(el('i', 'dot dot-night'));
        cell.appendChild(dots);

        var label = fromKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        cell.setAttribute('aria-label', label + (info ? ', ' + money(round2(info.total)) + ', ' + plural(info.count, 'trip') : ', no fares'));
        if (key === cal.selected) cell.setAttribute('aria-pressed', 'true');
        cell.addEventListener('click', function () {
          cal.selected = key;
          renderCalendar();
        });
        grid.appendChild(cell);
      })(day);
    }

    if (direction) replay(grid, direction > 0 ? 'slide-next' : 'slide-prev');
    else grid.classList.remove('slide-next', 'slide-prev');

    renderDayPanel(days);
  }

  function renderDayPanel(days) {
    var panel = $('dayPanel');
    panel.textContent = '';
    var inView = cal.selected.slice(0, 7) === cal.y + '-' + pad(cal.m + 1);
    if (!inView) return;

    var date = fromKey(cal.selected);
    var info = days[cal.selected];
    var head = el('div', 'day-title');
    head.appendChild(el('strong', null, fmtDay(date) === 'Today' || fmtDay(date) === 'Yesterday'
      ? fmtDay(date) + ', ' + date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : fmtDay(date)));
    head.appendChild(el('span', null, info ? money(round2(info.total)) + ' · ' + plural(info.count, 'trip') : 'No fares'));
    panel.appendChild(head);

    var card = el('div', 'card');
    var list = trips.filter(function (t) { return dateKey(new Date(t.ts)) === cal.selected; })
      .sort(function (a, b) { return a.ts - b.ts; });
    if (list.length) list.forEach(function (t, i) { card.appendChild(tripRow(t, i)); });
    else card.appendChild(el('div', 'day-none', 'Nothing saved on this date.'));
    panel.appendChild(card);

    var add = el('button', 'secondary');
    add.type = 'button';
    add.id = 'dayAdd';
    add.appendChild(icon('i-plus'));
    add.appendChild(el('span', null, 'Add fare on ' + date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
    add.addEventListener('click', function () { openAdd('date', cal.selected); });
    panel.appendChild(add);
    replay(panel, 'day-panel');
  }

  function moveMonth(step) {
    var now = new Date();
    var next = new Date(cal.y, cal.m + step, 1);
    if (next.getTime() > new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return;
    cal.y = next.getFullYear();
    cal.m = next.getMonth();
    // Keep a sensible date selected in the month now on screen.
    var isCurrent = cal.y === now.getFullYear() && cal.m === now.getMonth();
    cal.selected = isCurrent ? dateKey(now) : cal.y + '-' + pad(cal.m + 1) + '-01';
    renderCalendar(step);
  }

  function goToday() {
    var now = new Date();
    var step = (now.getFullYear() - cal.y) * 12 + (now.getMonth() - cal.m);
    cal.y = now.getFullYear();
    cal.m = now.getMonth();
    cal.selected = dateKey(now);
    renderCalendar(step);
  }

  /* ---------------- add fare sheet ---------------- */

  var add = { mode: 'now', tariff: 'auto', timer: null, editId: null };

  function addWhen() {
    if (add.mode === 'now') return new Date();
    var d = new Date($('addDate').value + 'T' + ($('addTime').value || '12:00'));
    return isNaN(d.getTime()) ? null : d;
  }

  function renderAdd() {
    var when = addWhen();
    var stamp = $('addStamp');
    stamp.textContent = '';
    if (add.mode === 'now') {
      stamp.appendChild(el('i', 'live'));
      stamp.appendChild(document.createTextNode(fmtDate(when) + ' · ' + fmtTimeSec(when)));
    } else if (when) {
      stamp.appendChild(document.createTextNode(
        when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
    }
    setSegment($('addTariffSeg'), add.tariff);
    var autoBtn = $('addTariffSeg').querySelector('[data-value="auto"]');
    autoBtn.textContent = when ? 'Auto · ' + (tariffAt(when) === 'night' ? 'Night' : 'Day') : 'Auto';

    var amount = applyRounding(Fare.num($('addAmount').value));
    $('addSave').disabled = !(amount > 0);
    $('addSave').textContent = amount > 0
      ? (add.mode === 'edit' ? 'Save changes · ' : 'Save ') + money(amount)
      : 'Save fare';
  }

  function openAdd(mode, key) {
    add.mode = mode;
    add.tariff = 'auto';
    $('addAmount').value = '';
    $('addNote').value = '';
    $('addError').hidden = true;
    $('addTitle').textContent = mode === 'now' ? 'Add fare now' : (mode === 'edit' ? 'Edit fare' : 'Add fare');
    $('addWhen').hidden = mode === 'now';
    add.editId = null;
    var now = new Date();
    $('addDate').max = dateKey(now);
    if (mode === 'date') {
      $('addDate').value = key;
      $('addTime').value = key === dateKey(now) ? timeKey(now) : '12:00';
    } else if (mode === 'edit') {
      var trip = key; // the trip being edited
      var at = new Date(trip.ts);
      add.editId = trip.id;
      add.tariff = trip.tariff === 'night' ? 'night' : 'day';
      $('addAmount').value = trip.fare;
      $('addNote').value = trip.note || '';
      $('addDate').value = dateKey(at);
      $('addTime').value = timeKey(at);
    }
    renderAdd();
    openLayer('addSheet');
    clearInterval(add.timer);
    if (mode === 'now') add.timer = setInterval(renderAdd, 1000);
    if (mode !== 'edit') setTimeout(function () { $('addAmount').focus(); }, 60);
  }

  function saveAdd() {
    var amount = applyRounding(Fare.num($('addAmount').value));
    var when = addWhen(); // in "now" mode this is the instant Save is tapped
    var error = '';
    if (!(amount > 0)) error = 'Enter the fare amount.';
    else if (!when) error = 'Pick a date and time.';
    else if (isFuture(when)) error = 'That date and time is in the future. Pick today or an earlier date.';
    if (error) {
      $('addError').textContent = error;
      $('addError').hidden = false;
      return;
    }
    var fields = {
      ts: when.getTime(),
      tariff: add.tariff !== 'auto' ? add.tariff : tariffAt(when),
      fare: amount,
      note: $('addNote').value.trim()
    };
    var trip = null;
    if (add.mode === 'edit') {
      trips.forEach(function (t) { if (t.id === add.editId) trip = t; });
      if (trip) Object.keys(fields).forEach(function (k) { trip[k] = fields[k]; });
      saveTrips();
      closeLayer('addSheet');
      refresh();
      toast('Fare updated');
      return;
    }
    trip = fields;
    trip.id = newId();
    trips.push(trip);
    saveTrips();
    closeLayer('addSheet');

    cal.y = when.getFullYear();
    cal.m = when.getMonth();
    cal.selected = dateKey(when);
    refresh(cal.selected);
    announceAdded(trip, $('fabNow'));
  }

  /* ---------------- month total popup ---------------- */

  function openMonth(y, m) {
    var list = monthTrips(y, m);
    var total = sumOf(list);
    var days = byDate(list);
    var count = new Date(y, m + 1, 0).getDate();
    var now = new Date();
    var isCurrent = y === now.getFullYear() && m === now.getMonth();

    $('popTitle').textContent = fmtMonth(y, m);
    $('popTotal')._value = 0;
    $('popTotal').textContent = money(0);
    $('popSub').textContent = list.length
      ? plural(list.length, 'trip') + ' on ' + plural(Object.keys(days).length, 'day')
      : (isCurrent ? 'Add your first fare to start the month' : 'Nothing saved');
    $('popBody').hidden = !list.length;
    $('popEmpty').hidden = !!list.length;
    openLayer('monthPop');
    setTimeout(function () { countTo($('popTotal'), total); }, 120);
    if (!list.length) return;

    // Day / night split
    var dayList = list.filter(function (t) { return t.tariff !== 'night'; });
    var nightList = list.filter(function (t) { return t.tariff === 'night'; });
    var dayTotal = sumOf(dayList), nightTotal = sumOf(nightList);
    var split = $('popSplit');
    split.textContent = '';
    var segDay = el('i', 'seg-day'), segNight = el('i', 'seg-night');
    segDay.style.flexGrow = segNight.style.flexGrow = 0;
    if (dayTotal > 0) split.appendChild(segDay);
    if (nightTotal > 0) split.appendChild(segNight);
    setTimeout(function () {
      segDay.style.flexGrow = dayTotal;
      segNight.style.flexGrow = nightTotal;
    }, reducedMotion ? 0 : 160);

    var legend = $('popLegend');
    legend.textContent = '';
    [['dot-day', 'Day', dayTotal, dayList.length], ['dot-night', 'Night', nightTotal, nightList.length]].forEach(function (s) {
      var item = el('span');
      item.appendChild(el('i', 'dot ' + s[0]));
      item.appendChild(document.createTextNode(s[1] + ' ' + money(s[2]) + ' '));
      item.appendChild(el('em', null, '· ' + plural(s[3], 'trip')));
      legend.appendChild(item);
    });

    // Fare by date
    var max = 0, bestKey = null;
    Object.keys(days).forEach(function (k) {
      if (days[k].total > max) { max = days[k].total; bestKey = k; }
    });
    var chart = $('popChart');
    chart.textContent = '';
    var tip = $('popTip');

    function showTip(key, button) {
      each(chart.querySelectorAll('button'), function (b) { b.classList.remove('is-active'); });
      if (button) button.classList.add('is-active');
      var info = days[key];
      tip.textContent = '';
      tip.appendChild(el('strong', null, fmtDate(fromKey(key)) + '  '));
      tip.appendChild(document.createTextNode(info ? money(round2(info.total)) + ' ' : 'No fares'));
      if (info) tip.appendChild(el('em', null, '· ' + plural(info.count, 'trip')));
    }

    var bestButton = null;
    for (var day = 1; day <= count; day++) {
      (function (day) {
        var key = y + '-' + pad(m + 1) + '-' + pad(day);
        var info = days[key];
        var col = el('button');
        col.type = 'button';
        col.setAttribute('aria-label', fmtDate(fromKey(key)) + ', ' + (info ? money(round2(info.total)) : 'no fares'));
        if (info) {
          var fill = el('i', 'bar-fill');
          fill.style.height = Math.max(4, Math.round(info.total / max * 100)) + '%';
          fill.style.animationDelay = (160 + day * 14) + 'ms';
          col.appendChild(fill);
        }
        col.addEventListener('click', function () { showTip(key, col); });
        col.addEventListener('mouseenter', function () { showTip(key, col); });
        if (key === bestKey) bestButton = col;
        chart.appendChild(col);
      })(day);
    }
    var axis = $('popAxis');
    axis.textContent = '';
    for (var d = 1; d <= count; d++) axis.appendChild(el('span', null, d % 7 === 1 ? d : ''));
    showTip(bestKey, bestButton);

    var stats = $('popStats');
    stats.textContent = '';
    [
      ['Trips', String(list.length)],
      ['Average fare', money(applyRounding(total / list.length))],
      ['Best day', money(round2(max))]
    ].forEach(function (s) {
      var box = el('div', 'stat');
      box.appendChild(el('div', 'stat-label', s[0]));
      box.appendChild(el('div', 'stat-value', s[1]));
      stats.appendChild(box);
    });
  }

  /* ---------------- trips screen ---------------- */

  var tripFilter = 'all';

  function tile(label, data, onTap) {
    var t = el(onTap ? 'button' : 'div', 'tile');
    if (onTap) { t.type = 'button'; t.addEventListener('click', onTap); }
    t.appendChild(el('div', 'tile-label', label));
    t.appendChild(el('div', 'tile-value', money(data.total)));
    t.appendChild(el('div', 'tile-count', onTap ? 'See details ›' : plural(data.count, 'trip')));
    return t;
  }

  function renderTrips() {
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7)); // Monday
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    var tiles = $('tiles');
    tiles.textContent = '';
    var todaySum = sumSince(dayStart.getTime());
    tiles.appendChild(tile('Today', todaySum));
    tiles.appendChild(tile('This week', sumSince(weekStart.getTime())));
    tiles.appendChild(tile('This month', sumSince(monthStart.getTime()), function () {
      openMonth(now.getFullYear(), now.getMonth());
    }));

    $('navBadge').hidden = todaySum.count === 0;
    $('navBadge').textContent = todaySum.count;

    var list = $('tripList');
    list.textContent = '';
    $('clearBtn').hidden = trips.length === 0;
    $('shareBtn').hidden = trips.length === 0;
    $('filters').hidden = trips.length === 0;

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

    var query = $('tripSearch').value.trim().toLowerCase();
    setSegment($('filterSeg'), tripFilter);
    var sorted = trips.filter(function (t) {
      if (tripFilter !== 'all' && (t.tariff === 'night' ? 'night' : 'day') !== tripFilter) return false;
      return !query || (t.note || '').toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) { return b.ts - a.ts; });
    if (!sorted.length) {
      var none = el('div', 'empty');
      none.appendChild(el('strong', null, 'No trips match'));
      none.appendChild(document.createTextNode('Try a different search or show all trips.'));
      list.appendChild(none);
      return;
    }
    var groups = [];
    sorted.forEach(function (t) {
      var key = dateKey(new Date(t.ts));
      var last = groups[groups.length - 1];
      if (!last || last.key !== key) groups.push(last = { key: key, items: [], total: 0 });
      last.items.push(t);
      last.total += t.fare;
    });

    var index = 0;
    groups.forEach(function (g) {
      var head = el('div', 'day-head');
      head.appendChild(el('span', null, fmtDay(new Date(g.items[0].ts))));
      head.appendChild(el('span', null, money(round2(g.total))));
      list.appendChild(head);
      var card = el('div', 'card');
      g.items.forEach(function (t) { card.appendChild(tripRow(t, index++)); });
      list.appendChild(card);
    });
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function shareTrips() {
    var rows = [['Date', 'Time', 'Tariff', 'Distance (km)', 'Waiting (min)', 'Extras', 'Fare', 'Note']];
    trips.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (t) {
      var d = new Date(t.ts);
      rows.push([dateKey(d), timeKey(d), t.tariff, t.km || '', t.waitMin || '', t.extras || '', t.fare, t.note || '']);
    });
    rows.push(['Total', '', '', '', '', '', sumOf(trips), '']);
    var text = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    var subject = 'FarePulse trips (' + trips.length + ')';

    if (window.AndroidBridge && AndroidBridge.share) {
      AndroidBridge.share(subject, text);
    } else if (navigator.share) {
      navigator.share({ title: subject, text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('Trips copied'); });
    }
  }

  /* ---------------- insights screen ---------------- */

  function tipLine(node, strong, text, muted) {
    node.textContent = '';
    node.appendChild(el('strong', null, strong + '  '));
    node.appendChild(document.createTextNode(text + ' '));
    if (muted) node.appendChild(el('em', null, muted));
  }

  /** A ring drawn as SVG arcs. parts: [{ value, cls }] out of `whole`. Returns the arcs so they can be animated in. */
  function drawRing(host, radius, width, parts, whole, trackCls) {
    var size = (radius + width) * 2, c = size / 2, len = 2 * Math.PI * radius;
    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: c, cy: c, r: radius, 'stroke-width': width, 'class': trackCls }));
    var gap = parts.filter(function (p) { return p.value > 0; }).length > 1 ? 2 : 0;
    var offset = 0, arcs = [];
    parts.forEach(function (p) {
      if (!(p.value > 0)) return;
      var span = p.value / whole * len;
      var arc = svgEl('circle', { cx: c, cy: c, r: radius, 'stroke-width': width, 'class': p.cls,
        'stroke-dasharray': '0 ' + len, 'stroke-dashoffset': -offset });
      arc._dash = Math.max(0.5, span - gap) + ' ' + len;
      offset += span;
      svg.appendChild(arc);
      arcs.push(arc);
    });
    host.textContent = '';
    host.appendChild(svg);
    setTimeout(function () {
      arcs.forEach(function (a) { a.setAttribute('stroke-dasharray', a._dash); });
    }, reducedMotion ? 0 : 80);
  }

  function renderBudget(total, now) {
    var budget = settings.budget || 0;
    var card = $('budgetCard');
    var ring = $('budgetRing');
    var over = budget > 0 && total > budget;
    card.classList.toggle('is-over', over);
    drawRing(ring, 38, 8, budget > 0 ? [{ value: Math.min(total, budget), cls: 'ring-arc' }] : [], budget || 1, 'ring-track');
    ring.appendChild(el('div', 'ring-label', budget > 0 ? Math.round(total / budget * 100) + '%' : '–'));

    if (!budget) {
      $('budgetTitle').textContent = money(total) + ' this month';
      $('budgetSub').textContent = 'Set a budget to see how much is left.';
      $('budgetBtn').textContent = 'Set budget';
      return;
    }
    var daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    $('budgetTitle').textContent = money(total) + ' of ' + money(budget);
    $('budgetSub').textContent = over
      ? 'Over budget by ' + money(round2(total - budget))
      : money(round2(budget - total)) + ' left, about ' + money(applyRounding((budget - total) / daysLeft)) +
        ' a day for ' + plural(daysLeft, 'day');
    $('budgetBtn').textContent = 'Change budget';
  }

  function renderDonut(list, total, now) {
    var dayList = list.filter(function (t) { return t.tariff !== 'night'; });
    var nightList = list.filter(function (t) { return t.tariff === 'night'; });
    var dayTotal = sumOf(dayList), nightTotal = sumOf(nightList);
    $('donutKicker').textContent = 'Day and night, ' + now.toLocaleDateString(undefined, { month: 'long' });

    var donut = $('donut');
    drawRing(donut, 48, 14, [{ value: dayTotal, cls: 'donut-seg seg-day' }, { value: nightTotal, cls: 'donut-seg seg-night' }],
      total || 1, 'ring-track');
    var center = el('div', 'donut-center');
    center.appendChild(el('small', null, 'Total'));
    var figure = el('strong');
    center.appendChild(figure);
    center.appendChild(el('small', null, plural(list.length, 'trip')));
    donut.appendChild(center);
    countTo(figure, total);

    var legend = $('donutLegend');
    legend.textContent = '';
    [['dot-day', 'Day', dayTotal, dayList.length], ['dot-night', 'Night', nightTotal, nightList.length]].forEach(function (s) {
      var item = el('div', 'dl-item');
      item.appendChild(el('i', 'dot ' + s[0]));
      item.appendChild(el('span', 'dl-name', s[1]));
      item.appendChild(el('span', 'dl-val', money(s[2])));
      item.appendChild(el('span', 'dl-sub', (total > 0 ? Math.round(s[2] / total * 100) : 0) + '% · ' + plural(s[3], 'trip')));
      legend.appendChild(item);
    });
  }

  function renderWeek(now) {
    var days = [];
    for (var back = 6; back >= 0; back--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      days.push({ date: d, key: dateKey(d), day: 0, night: 0, count: 0 });
    }
    var index = {};
    days.forEach(function (d) { index[d.key] = d; });
    trips.forEach(function (t) {
      var d = index[dateKey(new Date(t.ts))];
      if (!d) return;
      d[t.tariff === 'night' ? 'night' : 'day'] += t.fare;
      d.count++;
    });
    var max = 0;
    days.forEach(function (d) { max = Math.max(max, d.day + d.night); });

    var chart = $('weekChart');
    chart.textContent = '';
    var axis = chart.nextElementSibling && chart.nextElementSibling.className === 'week-axis'
      ? chart.nextElementSibling : null;
    if (!axis) {
      axis = el('div', 'week-axis');
      chart.parentNode.insertBefore(axis, chart.nextSibling);
    }
    axis.textContent = '';

    function pick(d, button) {
      each(chart.querySelectorAll('button'), function (b) { b.classList.remove('is-active'); });
      button.classList.add('is-active');
      var total = round2(d.day + d.night);
      if (!d.count) { tipLine($('weekTip'), fmtDay(d.date), 'No fares'); return; }
      var bits = [];
      if (d.day) bits.push('Day ' + money(round2(d.day)));
      if (d.night) bits.push('Night ' + money(round2(d.night)));
      tipLine($('weekTip'), fmtDay(d.date), money(total), '· ' + bits.join(' · '));
    }

    var first = null;
    days.forEach(function (d, i) {
      var col = el('button');
      col.type = 'button';
      var total = d.day + d.night;
      col.setAttribute('aria-label', fmtDate(d.date) + ', ' + (d.count ? money(round2(total)) : 'no fares'));
      if (total > 0) {
        var stack = el('div', 'week-stack');
        stack.style.height = Math.max(5, total / max * 92) + '%';
        stack.style.animationDelay = (120 + i * 60) + 'ms';
        if (d.night) { var n = el('i', 'seg-night'); n.style.flexGrow = d.night; stack.appendChild(n); }
        if (d.day) { var s = el('i', 'seg-day'); s.style.flexGrow = d.day; stack.appendChild(s); }
        col.appendChild(stack);
      }
      col.addEventListener('click', function () { pick(d, col); });
      chart.appendChild(col);
      var label = el('span', i === 6 ? 'is-today' : null, d.date.toLocaleDateString(undefined, { weekday: 'short' }));
      axis.appendChild(label);
      if (i === 6) first = [d, col];
    });
    pick(first[0], first[1]);
  }

  function renderTrend(now) {
    var months = [];
    for (var back = 5; back >= 0; back--) {
      var d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      var list = monthTrips(d.getFullYear(), d.getMonth());
      months.push({ date: d, total: sumOf(list), count: list.length });
    }
    var max = 0;
    months.forEach(function (m) { max = Math.max(max, m.total); });
    max = max || 1;

    var host = $('trendChart');
    var W = host.clientWidth || 300, H = 120, top = 12, bottom = H - 8;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Total fare for each of the last 6 months' });
    [top, (top + bottom) / 2, bottom].forEach(function (y) {
      svg.appendChild(svgEl('line', { x1: 0, x2: W, y1: y, y2: y, 'class': 'trend-grid' }));
    });
    var pts = months.map(function (m, i) {
      return { x: (i + 0.5) / 6 * W, y: bottom - m.total / max * (bottom - top), m: m };
    });
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    svg.appendChild(svgEl('path', { d: path + ' L' + pts[5].x.toFixed(1) + ' ' + bottom + ' L' + pts[0].x.toFixed(1) + ' ' + bottom + ' Z', 'class': 'trend-area' }));
    svg.appendChild(svgEl('path', { d: path, 'class': 'trend-line', pathLength: 1 }));

    var dots = [];
    function pick(i) {
      dots.forEach(function (dot, n) { dot.setAttribute('class', 'trend-dot' + (n === i ? ' is-active' : '')); });
      var m = months[i];
      tipLine($('trendTip'), fmtMonth(m.date.getFullYear(), m.date.getMonth()),
        m.count ? money(m.total) : 'No fares', m.count ? '· ' + plural(m.count, 'trip') : '');
    }
    pts.forEach(function (p, i) {
      var dot = svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5, 'class': 'trend-dot' });
      dot.style.animationDelay = (300 + i * 110) + 'ms';
      svg.appendChild(dot);
      dots.push(dot);
    });
    pts.forEach(function (p, i) {
      var hit = svgEl('rect', { x: (p.x - W / 12).toFixed(1), y: 0, width: (W / 6).toFixed(1), height: H, 'class': 'trend-hit' });
      hit.addEventListener('click', function () { pick(i); });
      svg.appendChild(hit);
    });
    host.textContent = '';
    host.appendChild(svg);

    var axis = $('trendAxis');
    axis.textContent = '';
    months.forEach(function (m) {
      axis.appendChild(el('span', null, m.date.toLocaleDateString(undefined, { month: 'short' })));
    });
    pick(5);
  }

  function renderHighlights(now, monthTotal) {
    // Days in a row with at least one fare, ending today (or yesterday if today has none yet).
    var have = {};
    trips.forEach(function (t) { have[dateKey(new Date(t.ts))] = true; });
    var cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!have[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    var streak = 0;
    while (have[dateKey(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }

    var byWeekday = [0, 0, 0, 0, 0, 0, 0], biggest = trips[0];
    trips.forEach(function (t) {
      byWeekday[new Date(t.ts).getDay()] += t.fare;
      if (t.fare > biggest.fare) biggest = t;
    });
    var busiest = byWeekday.indexOf(Math.max.apply(null, byWeekday));
    var weekdayName = new Date(2024, 0, 7 + busiest).toLocaleDateString(undefined, { weekday: 'long' }); // 7 Jan 2024 is a Sunday

    // This month so far against the same days of last month.
    var lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    var lastEnd = Math.min(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate() + 1).getTime(),
      new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    var lastTotal = sumOf(trips.filter(function (t) { return t.ts >= lastStart && t.ts < lastEnd; }));
    var change = lastTotal > 0 ? Math.round((monthTotal - lastTotal) / lastTotal * 100) : null;

    var all = sumOf(trips);
    var items = [
      ['Logging streak', plural(streak, 'day'), streak ? 'in a row with a fare' : 'Add a fare today to start one'],
      ['Against last month', change === null ? '–' : (change > 0 ? '+' : '') + change + '%',
        change === null ? 'Nothing saved by this date last month' : 'vs ' + money(lastTotal) + ' by this date'],
      ['Average fare', money(applyRounding(all / trips.length)), 'across ' + plural(trips.length, 'trip')],
      ['Biggest fare', money(biggest.fare), fmtDay(new Date(biggest.ts))],
      ['Busiest weekday', weekdayName, money(round2(byWeekday[busiest])) + ' in total'],
      ['All time', money(all), plural(Object.keys(have).length, 'day') + ' with fares']
    ];
    var grid = $('highlights');
    grid.textContent = '';
    items.forEach(function (it, i) {
      var box = el('div', 'hl');
      box.style.animationDelay = (200 + i * 50) + 'ms';
      box.appendChild(el('div', 'hl-label', it[0]));
      box.appendChild(el('div', 'hl-value', it[1]));
      box.appendChild(el('div', 'hl-sub', it[2]));
      grid.appendChild(box);
    });
  }

  function renderInsights() {
    var has = trips.length > 0;
    $('insEmpty').hidden = has;
    $('insBody').hidden = !has;
    if (!has) return;
    var now = new Date();
    var list = monthTrips(now.getFullYear(), now.getMonth());
    var total = sumOf(list);
    renderBudget(total, now);
    renderDonut(list, total, now);
    renderWeek(now);
    renderTrend(now);
    renderHighlights(now, total);
  }

  /* ---------------- rates screen ---------------- */

  var RATE_FIELDS = [
    { key: 'base', label: 'Base fare', money: true },
    { key: 'includedKm', label: 'Distance included in base', unit: 'km' },
    { key: 'perKm', label: 'Per km after that', money: true },
    { key: 'waitPerMin', label: 'Waiting, per minute', money: true }
  ];

  function buildRates() {
    each(document.querySelectorAll('[data-rates]'), function (card) {
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
    $('setBudget').value = settings.budget || '';
    paintCurrency();
  }

  function paintCurrency() {
    each(document.querySelectorAll('.cur'), function (n) { n.textContent = settings.currency; });
  }

  function settingsChanged() {
    save(SETTINGS_KEY, settings);
    paintCurrency();
    refresh();
  }

  /* ---------------- toast, layers, confirm ---------------- */

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
    $('toast').hidden = true;
    void $('toast').offsetWidth;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
  }

  var LAYERS = ['confirm', 'addSheet', 'monthPop'];

  function openLayer(id) {
    var node = $(id);
    clearTimeout(node._closeTimer);
    node.classList.remove('closing');
    node.hidden = false;
    hideToast();
  }

  function closeLayer(id) {
    var node = $(id);
    if (node.hidden) return;
    if (id === 'addSheet') clearInterval(add.timer);
    if (reducedMotion) { node.hidden = true; return; }
    node.classList.add('closing');
    node._closeTimer = setTimeout(function () {
      node.hidden = true;
      node.classList.remove('closing');
    }, 180);
  }

  function confirmSheet(title, body, okLabel, onOk) {
    $('confirmTitle').textContent = title;
    $('confirmBody').textContent = body;
    $('confirmOk').textContent = okLabel;
    $('confirmOk').onclick = function () {
      closeLayer('confirm');
      onOk();
    };
    openLayer('confirm');
    $('confirmCancel').focus();
  }

  /* ---------------- navigation ---------------- */

  var VIEWS = ['fare', 'calendar', 'trips', 'insights', 'rates'];
  var currentView = 'fare';
  var beforeRates = 'fare';

  /** Redraws whatever depends on the saved trips or settings. */
  function refresh(justAddedKey) {
    renderTrips();
    renderFare();
    if (currentView === 'calendar') renderCalendar(0, justAddedKey);
    if (currentView === 'insights') renderInsights();
  }

  function show(view) {
    if (view === 'rates' && currentView !== 'rates') beforeRates = currentView;
    currentView = view;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== view; });
    each($('nav').querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-view') === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    hideToast();
    window.scrollTo(0, 0);
    if (view === 'trips') renderTrips();
    if (view === 'fare') renderFare();
    if (view === 'calendar') renderCalendar();
    if (view === 'insights') renderInsights();
  }

  // Called by the Android shell when the phone switches between light and dark.
  window.cabfareTheme = function () { applyTheme(); };

  // Called by the Android back button. Returns true when the app handled it.
  window.cabfareBack = function () {
    for (var i = 0; i < LAYERS.length; i++) {
      if (!$(LAYERS[i]).hidden) { closeLayer(LAYERS[i]); return true; }
    }
    if (currentView === 'rates') { show(beforeRates); return true; }
    if (currentView !== 'fare') { show('fare'); return true; }
    return false;
  };

  /* ---------------- wiring ---------------- */

  function onSegment(id, handler) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) handler(b.getAttribute('data-value'));
    });
  }

  onSegment('tariffSeg', function (v) { state.tariff = v; renderFare(); });
  onSegment('modeSeg', function (v) { state.mode = v; renderFare(); });
  onSegment('addTariffSeg', function (v) { add.tariff = v; renderAdd(); });

  ['inKm', 'inWait', 'inExtras', 'inManual', 'inDate', 'inTime'].forEach(function (id) {
    $(id).addEventListener('input', renderFare);
  });

  each(document.querySelectorAll('[data-add-km]'), function (b) {
    b.addEventListener('click', function () {
      $('inKm').value = trimNum(Fare.num($('inKm').value) + parseFloat(b.getAttribute('data-add-km')));
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
  $('heroMonth').addEventListener('click', function () {
    var now = new Date();
    openMonth(now.getFullYear(), now.getMonth());
  });

  // calendar
  $('calPrev').addEventListener('click', function () { moveMonth(-1); });
  $('calNext').addEventListener('click', function () { moveMonth(1); });
  $('calToday').addEventListener('click', goToday);
  $('calTitle').addEventListener('click', function () { openMonth(cal.y, cal.m); });
  $('fabNow').addEventListener('click', function () { buzz(); openAdd('now'); });

  var swipeX = null, swipeY = null;
  $('calGrid').addEventListener('touchstart', function (e) {
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  }, { passive: true });
  $('calGrid').addEventListener('touchend', function (e) {
    if (swipeX === null) return;
    var dx = e.changedTouches[0].clientX - swipeX;
    var dy = e.changedTouches[0].clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moveMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  // add fare sheet
  ['addAmount', 'addDate', 'addTime'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      $('addError').hidden = true;
      renderAdd();
    });
  });
  $('addSave').addEventListener('click', saveAdd);
  $('addAmount').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveAdd();
  });

  // any layer: close button, or a tap on the dimmed background
  LAYERS.forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (e.target === this || e.target.closest('[data-close]')) closeLayer(id);
    });
  });
  $('confirmCancel').addEventListener('click', function () { closeLayer('confirm'); });

  $('clearBtn').addEventListener('click', function () {
    confirmSheet('Delete all trips?',
      'This removes all ' + trips.length + ' saved trips from this phone. It cannot be undone.',
      'Delete all', function () {
        trips = [];
        saveTrips();
        refresh();
      });
  });

  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
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

  $('setBudget').addEventListener('change', function () {
    var v = parseFloat(this.value);
    settings.budget = isFinite(v) && v > 0 ? v : 0;
    this.value = settings.budget || '';
    settingsChanged();
  });

  // theme
  $('themePill').addEventListener('click', function () {
    buzz();
    setTheme(isDark() ? 'light' : 'dark', this);
  });
  onSegment('themeSeg', function (v) { setTheme(v, $('themeSeg')); });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

  // rates and settings open from the gear on every screen
  each(document.querySelectorAll('[data-open-rates]'), function (b) {
    b.addEventListener('click', function () { show('rates'); });
  });
  $('ratesDone').addEventListener('click', function () { show(beforeRates); });
  $('budgetBtn').addEventListener('click', function () {
    show('rates');
    var input = $('setBudget');
    input.scrollIntoView({ block: 'center' });
    input.focus();
  });

  // trips search and filter
  onSegment('filterSeg', function (v) { tripFilter = v; renderTrips(); });
  $('tripSearch').addEventListener('input', renderTrips);

  // a few more stars for the night sky
  (function () {
    var sky = document.querySelector('.stars');
    var spots = [[6, 8], [20, 14], [10, 22], [36, 36], [4, 50], [18, 66], [48, 76], [28, 90], [62, 40], [8, 72], [50, 24], [14, 96]];
    spots.forEach(function (p, i) {
      var star = el('i', 'extra');
      star.style.top = p[0] + '%';
      star.style.left = p[1] + '%';
      star.style.animationDelay = (i * 0.37 % 3) + 's';
      sky.appendChild(star);
    });
  })();

  $('resetBtn').addEventListener('click', function () {
    confirmSheet('Reset rates?',
      'Day fare, night fare and night hours go back to the starting values. Your saved trips are kept.',
      'Reset', function () {
        var budget = settings.budget;
        settings = clone(Fare.DEFAULT_SETTINGS);
        settings.budget = budget;
        save(SETTINGS_KEY, settings);
        buildRates();
        refresh();
      });
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
    if (!document.hidden) { applyTheme(); refresh(); }
  });

  applyTheme();
  buildRates();
  renderTrips();
  show('fare');
})();
