const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const dump = fs.readFileSync(path.join(__dirname, '..', 'unismiles.sql'), 'utf8');

/**
 * Tabel yang kode-nya melakukan INSERT tanpa menyertakan kunci utama, sehingga
 * database WAJIB mengisinya sendiri (auto-increment).
 *
 * `sessions`, `print_jobs`, dan `payment_verification_attempts` sengaja TIDAK
 * masuk daftar ini: kunci utamanya diisi sendiri oleh aplikasi
 * (session_code / job_id UUID / attempt id UUID), jadi bukan auto-increment.
 */
const TABLES_NEEDING_AUTO_INCREMENT = [
  'admin_assets',
  'audit_logs',
  'frame_templates',
  'kiosk_printing_configs',
  'photos',
  'print_logs',
  'transactions',
  'users',
];

/** Definisi kolom `id` sebuah tabel dari dump SQL. */
function idColumnOf(table) {
  const tableMatch = dump.match(new RegExp(`CREATE TABLE IF NOT EXISTS \`${table}\` \\(([\\s\\S]*?)\\n\\) ENGINE`, 'i'));
  if (!tableMatch) return null;
  const body = tableMatch[1];

  const line = body.split('\n').find(l => /^\s*`id`\s/i.test(l));
  if (!line) return null;

  return {
    definition: line.trim(),
    hasAutoIncrement: /AUTO_INCREMENT/i.test(line),
    isPrimaryKey: /PRIMARY KEY/i.test(line) || /PRIMARY KEY \(`id`\)/i.test(body),
  };
}

/**
 * Bug nyata di produksi: `admin_assets.id` tidak punya AUTO_INCREMENT dan bukan
 * PRIMARY KEY, sehingga setiap INSERT ditolak MySQL dengan
 *   Field 'id' doesn't have a default value
 * dan upload gambar di Frame Editor gagal. Dump SQL proyek sendiri sudah benar,
 * jadi cacatnya di database live — karena itu perlu dicek.
 */
test('tabel yang INSERT tanpa id punya id AUTO_INCREMENT + PRIMARY KEY', () => {
  const problems = [];
  for (const table of TABLES_NEEDING_AUTO_INCREMENT) {
    const id = idColumnOf(table);
    if (!id) { problems.push(`${table}: definisi id tidak ditemukan`); continue; }
    if (!id.hasAutoIncrement) problems.push(`${table}.id tidak AUTO_INCREMENT -> INSERT tanpa id akan gagal`);
    if (!id.isPrimaryKey) problems.push(`${table}.id bukan PRIMARY KEY`);
  }
  assert.deepStrictEqual(problems, [], `cacat skema:\n  ${problems.join('\n  ')}`);
});

test('tabel dengan kunci utama dari aplikasi tidak dipaksa auto-increment', () => {
  // sessions pakai session_code sebagai id; print_jobs pakai job_id UUID.
  const sessionsId = idColumnOf('sessions');
  assert.ok(sessionsId, 'sessions harus punya kolom id');
  assert.ok(!sessionsId.hasAutoIncrement,
    'sessions.id adalah kode sesi (mis. #US-117001), bukan angka berurut');
  assert.match(sessionsId.definition, /VARCHAR/i, 'sessions.id harus berupa teks');
});

test('migrasi perbaikan tersedia dan menyentuh tabel yang rusak', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'migrate_id_autoincrement.sql'), 'utf8'
  );
  for (const table of ['admin_assets', 'audit_logs', 'activity_logs']) {
    assert.match(migration, new RegExp(`ALTER TABLE \`${table}\``), `${table} harus diperbaiki`);
  }
  assert.match(migration, /AUTO_INCREMENT/, 'migrasi harus menambahkan AUTO_INCREMENT');
  assert.match(migration, /PRIMARY KEY/, 'migrasi harus menambahkan PRIMARY KEY');
});

test('controller aset tidak mengirim id saat INSERT', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'assetController.js'), 'utf8'
  );
  const insert = controller.match(/INSERT INTO admin_assets \(([^)]+)\)/);
  assert.ok(insert, 'harus ada INSERT ke admin_assets');
  assert.ok(!/\bid\b/.test(insert[1]), 'id tidak boleh dikirim — biarkan database menentukan');
  assert.match(controller, /result\.insertId/, 'controller harus memakai insertId hasil INSERT');
});
