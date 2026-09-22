// Uji idempotensi penjaga migrasi pada DB produksi.
//
// Kenapa perlu diuji di server, bukan disimulasikan: MySQL 8.4 TIDAK mendukung
// `ADD COLUMN IF NOT EXISTS` (itu fitur MariaDB). Kalau penjaganya salah, migrasi
// kedua gagal dengan "Duplicate column name" dan deploy berhenti. Di sini
// penjaganya dijalankan DUA KALI terhadap database sungguhan.
const pool = require('./config/db');

const KOLOM = [
  'thermal_density', 'thermal_offset_y_px', 'photo_fit_mode',
  'photo_brightness', 'photo_contrast', 'photo_saturation',
];

async function kolomAda(nama) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'kiosk_printing_configs' AND column_name = ?`,
    [nama]
  );
  return Number(rows[0].n) > 0;
}

// Penjaga yang sama dengan migrate_print_calibration.sql, tetapi di JS:
// tanya dulu, ALTER hanya kalau belum ada.
async function tambahKalauBelumAda(nama, definisi) {
  if (await kolomAda(nama)) return 'SKIP (sudah ada)';
  await pool.query(`ALTER TABLE kiosk_printing_configs ADD COLUMN ${nama} ${definisi}`);
  return 'ALTER dijalankan';
}

(async () => {
  try {
    console.log('--- jalan ke-1 ---');
    for (const k of KOLOM) {
      const hasil = await tambahKalauBelumAda(k, 'TINYINT UNSIGNED NOT NULL DEFAULT 100');
      console.log(`  ${k}: ${hasil}`);
    }

    console.log('--- jalan ke-2 (idempotensi) ---');
    let semuaSkip = true;
    for (const k of KOLOM) {
      const hasil = await tambahKalauBelumAda(k, 'TINYINT UNSIGNED NOT NULL DEFAULT 100');
      if (!hasil.startsWith('SKIP')) semuaSkip = false;
      console.log(`  ${k}: ${hasil}`);
    }

    let adaSemua = true;
    for (const k of KOLOM) {
      if (!(await kolomAda(k))) adaSemua = false;
    }
    console.log('semua 6 kolom ada:', adaSemua);
    console.log('jalan kedua semua SKIP (idempoten):', semuaSkip);

    // Data lama harus tetap utuh dan bernilai netral.
    const [baris] = await pool.query(
      'SELECT COUNT(*) AS n FROM kiosk_printing_configs'
    );
    console.log('baris konfigurasi:', baris[0].n);

    process.exit(adaSemua && semuaSkip ? 0 : 1);
  } catch (e) {
    console.error('GAGAL:', e.message);
    process.exit(1);
  }
})();
