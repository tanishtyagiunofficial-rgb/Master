// Run with: node tests/fare.test.js
const assert = require('assert');
const Fare = require('../app/src/main/assets/fare.js');

const day = { base: 50, includedKm: 2, perKm: 15, waitPerMin: 1.5 };
const night = { base: 65, includedKm: 2, perKm: 19, waitPerMin: 2 };
const at = (h, m) => new Date(2026, 0, 15, h, m);

// Night window crossing midnight (22:00 to 06:00)
assert.strictEqual(Fare.isNight(at(21, 59), '22:00', '06:00'), false);
assert.strictEqual(Fare.isNight(at(22, 0), '22:00', '06:00'), true);
assert.strictEqual(Fare.isNight(at(0, 30), '22:00', '06:00'), true);
assert.strictEqual(Fare.isNight(at(5, 59), '22:00', '06:00'), true);
assert.strictEqual(Fare.isNight(at(6, 0), '22:00', '06:00'), false);
assert.strictEqual(Fare.isNight(at(14, 0), '22:00', '06:00'), false);

// Night window inside one day, and an empty window
assert.strictEqual(Fare.isNight(at(2, 0), '01:00', '05:00'), true);
assert.strictEqual(Fare.isNight(at(6, 0), '01:00', '05:00'), false);
assert.strictEqual(Fare.isNight(at(3, 0), '00:00', '00:00'), false);

// Inside the included distance: base fare only
assert.strictEqual(Fare.calculate({ km: 1.5 }, day, true).total, 50);
assert.strictEqual(Fare.calculate({ km: 2 }, day, true).total, 50);

// 10 km by day: 50 + 8 x 15 = 170; by night: 65 + 8 x 19 = 217
assert.strictEqual(Fare.calculate({ km: 10 }, day, true).total, 170);
assert.strictEqual(Fare.calculate({ km: 10 }, night, true).total, 217);

// Waiting and extras: 50 + 8 x 15 + 10 x 1.5 + 40 = 225
const full = Fare.calculate({ km: 10, waitMin: 10, extras: 40 }, day, true);
assert.strictEqual(full.total, 225);
assert.strictEqual(full.distance, 120);
assert.strictEqual(full.waiting, 15);
assert.strictEqual(full.extras, 40);

// Rounding on and off: 50 + 0.5 x 15 + 3 x 1.5 = 62; 50 + 0.3 x 15 = 54.5
assert.strictEqual(Fare.calculate({ km: 2.5, waitMin: 3 }, day, true).total, 62);
assert.strictEqual(Fare.calculate({ km: 2.3 }, day, false).total, 54.5);
assert.strictEqual(Fare.calculate({ km: 2.3 }, day, true).total, 55);

// Bad input counts as zero
assert.strictEqual(Fare.calculate({ km: 'abc', waitMin: -5, extras: '' }, day, true).total, 50);

console.log('fare rules: all checks passed');
