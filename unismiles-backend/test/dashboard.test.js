const assert = require('node:assert');
const { test } = require('node:test');
const { buildDashboardQueries, SUCCESS_SESSION_PREDICATE } = require('../controllers/dashboardController');

// Regresi: Total Revenue dan Total Sessions pernah dihitung dari tabel
// berbeda dengan syarat berbeda, sehingga revenue menjumlahkan sesi yang
// tidak pernah selesai dan kedua kartu saling bertentangan.
test('revenue dan sessions memakai tabel serta predikat yang sama', () => {
  const { sessionQuery, revenueQuery } = buildDashboardQueries('session_code', 2, 'Owner');

  assert.ok(sessionQuery.includes('FROM sessions s'), 'sessions harus dari tabel sessions');
  assert.ok(revenueQuery.includes('FROM sessions s'), 'revenue harus dari tabel sessions');
  assert.ok(revenueQuery.includes(SUCCESS_SESSION_PREDICATE), 'revenue memakai predikat sukses bersama');
  assert.ok(sessionQuery.includes(SUCCESS_SESSION_PREDICATE), 'sessions memakai predikat sukses bersama');

  // Kedua hitungan hanya boleh mencakup transaksi yang benar-benar dibayar.
  assert.ok(!/FROM transactions/.test(revenueQuery), 'revenue tidak boleh menjumlahkan tabel transactions');
  assert.ok(revenueQuery.includes('payment_required_amount'), 'revenue memakai nominal yang dibayar');
});

test('scope user diterapkan ke kedua query, bukan hanya salah satu', () => {
  const { sessionQuery, revenueQuery, params } = buildDashboardQueries('session_code', 7, 'Owner');
  assert.deepStrictEqual(params, [7]);
  assert.ok(sessionQuery.includes('k.user_id = ?'), 'sessions harus dibatasi ke user');
  assert.ok(revenueQuery.includes('k.user_id = ?'), 'revenue harus dibatasi ke user');
});

test('Super Admin tidak dibatasi user', () => {
  const { sessionQuery, revenueQuery, params } = buildDashboardQueries('session_code', 7, 'Super Admin');
  assert.deepStrictEqual(params, []);
  assert.ok(!sessionQuery.includes('user_id = ?'));
  assert.ok(!revenueQuery.includes('user_id = ?'));
});

test('predikat sukses hanya status completed, sesuai label Sessions', () => {
  // getAdminSessions memetakan status 'completed' -> 'Success'. Sesi 'active'
  // yang pembayarannya terverifikasi tidak dihitung (sesi tidak pernah selesai).
  assert.strictEqual(SUCCESS_SESSION_PREDICATE, "s.status = 'completed'");
});

test('nama kolom sesi bisa diganti untuk dump SQL lama', () => {
  const { sessionQuery, revenueQuery } = buildDashboardQueries('id', 2, 'Owner');
  assert.ok(sessionQuery.includes('COUNT(s.id)'));
  assert.ok(!sessionQuery.includes('s.session_code'), 'revenue tidak bergantung nama kolom sesi');
  assert.ok(!revenueQuery.includes('s.session_code'));
});
