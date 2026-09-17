const assert = require('node:assert');
const { test } = require('node:test');
const { resolvePrice, buildUniqueAmount } = require('../utils/price');

test('harga frame Admin menang atas harga kiosk', () => {
  assert.strictEqual(resolvePrice({ templatePrice: 10000, kioskBasePrice: 15000 }), 10000);
});

test('harga kiosk dipakai hanya saat frame belum punya harga', () => {
  assert.strictEqual(resolvePrice({ templatePrice: 0, kioskBasePrice: 15000 }), 15000);
  assert.strictEqual(resolvePrice({ templatePrice: null, kioskBasePrice: null, layoutConfig: { layout_price: 12000 } }), 12000);
});

test('kode unik ditambahkan di atas nominal Admin', () => {
  const { total, base, uniqueCode } = buildUniqueAmount(10000, [], () => 0);
  assert.strictEqual(base, 10000);
  assert.strictEqual(total, 10001);
  assert.strictEqual(uniqueCode, 1);
});

test('kode unik tidak bentrok dengan nominal yang masih pending', () => {
  const taken = [10001, 10002, 10003];
  for (let i = 0; i < 50; i += 1) {
    const { total, uniqueCode } = buildUniqueAmount(10000, taken);
    assert.ok(!taken.includes(total), `bentrok pada ${total}`);
    assert.ok(uniqueCode >= 1 && uniqueCode <= 99);
  }
});

test('nominal <= 100 tidak diberi kode unik', () => {
  assert.deepStrictEqual(buildUniqueAmount(100, []), { total: 100, base: 100, uniqueCode: null });
});

test('kode unik habis: jatuh ke nominal Admin, bukan angka acak', () => {
  const all = Array.from({ length: 99 }, (_, i) => 10001 + i);
  const { total, uniqueCode } = buildUniqueAmount(10000, all);
  assert.strictEqual(total, 10000);
  assert.strictEqual(uniqueCode, null);
});
