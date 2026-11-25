(function () {
  'use strict';

  var SETTINGS_KEY = 'cabfare.settings.v1';
  var TRIPS_KEY = 'cabfare.trips.v1';

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
    announceAdded(trip);
  }

  function announceAdded(trip) {
    var when = new Date(trip.ts);
    replay($('navBadge'), 'bump');
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

    var main = el('div', 'trip-main');
    main.appendChild(el('div', 'trip-time', fmtTime(when)));
    main.appendChild(el('div', 'trip-detail', tripDetail(t)));
    row.appendChild(main);
    row.appendChild(el('div', 'trip-fare', money(t.fare)));

    var del = el('button', 'icon-btn trip-del');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete trip at ' + fmtTime(when) + ', ' + money(t.fare));
    del.appendChild(icon('i-trash'));
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

  var add = { mode: 'now', tariff: 'auto', timer: null };

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
    $('addSave').textContent = amount > 0 ? 'Save ' + money(amount) : 'Save fare';
  }

  function openAdd(mode, key) {
    add.mode = mode;
    add.tariff = 'auto';
    $('addAmount').value = '';
    $('addNote').value = '';
    $('addError').hidden = true;
    $('addTitle').textContent = mode === 'now' ? 'Add fare now' : 'Add fare';
    $('addWhen').hidden = mode === 'now';
    if (mode === 'date') {
      var now = new Date();
      $('addDate').max = dateKey(now);
      $('addDate').value = key;
      $('addTime').value = key === dateKey(now) ? timeKey(now) : '12:00';
    }
    renderAdd();
    openLayer('addSheet');
    clearInterval(add.timer);
    if (mode === 'now') add.timer = setInterval(renderAdd, 1000);
    setTimeout(function () { $('addAmount').focus(); }, 60);
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
    var trip = {
      id: newId(),
      ts: when.getTime(),
      tariff: add.tariff !== 'auto' ? add.tariff : tariffAt(when),
      fare: amount,
      note: $('addNote').value.trim()
    };
    trips.push(trip);
    saveTrips();
    closeLayer('addSheet');

    cal.y = when.getFullYear();
    cal.m = when.getMonth();
    cal.selected = dateKey(when);
    refresh(cal.selected);
    announceAdded(trip);
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

  var VIEWS = ['fare', 'calendar', 'trips', 'rates'];
  var currentView = 'fare';

  /** Redraws whatever depends on the saved trips or settings. */
  function refresh(justAddedKey) {
    renderTrips();
    renderFare();
    if (currentView === 'calendar') renderCalendar(0, justAddedKey);
  }

  function show(view) {
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
  }

  // Called by the Android back button. Returns true when the app handled it.
  window.cabfareBack = function () {
    for (var i = 0; i < LAYERS.length; i++) {
      if (!$(LAYERS[i]).hidden) { closeLayer(LAYERS[i]); return true; }
    }
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
  $('fabNow').addEventListener('click', function () { openAdd('now'); });

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
    if (!document.hidden) refresh();
  });

  buildRates();
  renderTrips();
  show('fare');
})();
