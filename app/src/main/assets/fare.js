/* Fare rules. Pure functions, no DOM, so they can be tested with plain Node. */
(function (root) {
  'use strict';

  var DEFAULT_SETTINGS = {
    currency: '₹',
    day: { base: 50, includedKm: 2, perKm: 15, waitPerMin: 1.5 },
    night: { base: 65, includedKm: 2, perKm: 19, waitPerMin: 2 },
    nightStart: '22:00',
    nightEnd: '06:00',
    round: true
  };

  function toMinutes(hhmm) {
    var parts = String(hhmm).split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  /** True when the clock time of `date` falls inside the night window (which may cross midnight). */
  function isNight(date, nightStart, nightEnd) {
    var now = date.getHours() * 60 + date.getMinutes();
    var start = toMinutes(nightStart);
    var end = toMinutes(nightEnd);
    if (start === end) return false;
    if (start < end) return now >= start && now < end;
    return now >= start || now < end;
  }

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * trip: { km, waitMin, extras }   rates: { base, includedKm, perKm, waitPerMin }
   * Returns each part of the fare plus the total.
   */
  function calculate(trip, rates, round) {
    var km = num(trip.km);
    var waitMin = num(trip.waitMin);
    var extras = num(trip.extras);
    var included = num(rates.includedKm);
    var extraKm = Math.max(0, km - included);

    var base = num(rates.base);
    var distance = extraKm * num(rates.perKm);
    var waiting = waitMin * num(rates.waitPerMin);
    var total = base + distance + waiting + extras;
    total = round ? Math.round(total) : Math.round(total * 100) / 100;

    return {
      base: base,
      includedKm: Math.min(km, included),
      extraKm: extraKm,
      distance: distance,
      waiting: waiting,
      extras: extras,
      total: total
    };
  }

  var api = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    isNight: isNight,
    calculate: calculate,
    num: num
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fare = api;
})(this);
