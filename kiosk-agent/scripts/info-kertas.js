/**
 * MEMBACA GEOMETRI KERTAS YANG DIKETAHUI PRINTER — TIDAK MENCETAK.
 *
 * KENAPA SKRIP INI ADA
 *
 * Keluhan lapangan: satu perintah cetak mengeluarkan DUA frame label padahal
 * halaman kita hanya setinggi satu label (791 baris = 67 mm pada 300 dpi).
 * Aplikasi tidak pernah menanyakan berapa panjang kertas yang DIKETAHUI printer;
 * ia selalu mencetak kanvas penuh. Kalau printer menyimpan ukuran kertas yang
 * berbeda (diatur lewat aplikasi NIIMBOT, bukan lewat UniSmiles), kertas akan
 * dimajukan melewati ujung label di tengah halaman, lalu pageEnd memajukannya
 * sekali lagi — hasilnya dua frame.
 *
 * Skrip ini membuktikannya dengan angka dari printernya sendiri:
 *   - gapHeight    : tinggi celah antar label (mm)
 *   - totalHeight  : jarak dari satu celah ke celah berikutnya (mm)
 *   - paperHeight  : panjang label sebenarnya (totalHeight - gapHeight)
 *   - paperWidth   : lebar label, untuk memastikan 54 mm
 *   - tailLength   : "ekor" yang ikut dimajukan, kalau tipenya punya
 * Ditambah model, lebar kepala cetak, kelas resolusi, dan versi firmware.
 *
 * CARA PAKAI (tidak mencetak, tidak memakai tinta)
 *
 *   cd kiosk-agent
 *   node scripts/info-kertas.js                       # cari printer otomatis
 *   node scripts/info-kertas.js --nama "B1 Pro-..."   # printer tertentu
 *   node scripts/info-kertas.js --alamat aa:bb:...    # lewat alamat
 *   node scripts/info-kertas.js --detik 20            # pindai lebih lama
 *
 * Kode keluar: 0 berhasil · 2 Bluetooth tidak siap · 3 printer tidak ditemukan/gagal
 */
const { NiimbotNobleClient } = require('../src/niimbotNobleClient');
// Dipakai ulang, bukan disalin: klasifikasi perangkat dan bacaan argumen sudah
// teruji di ble-check.js — salinannya hanya akan menguji salinan itu sendiri.
const { pesanUntukState, klasifikasiPerangkat, pilihKandidat, bacaArgumen } = require('./ble-check');

const KANVAS_BARIS = 791;   // tinggi halaman yang dikirim aplikasi
const DPI = 300;

function tungguStateSiap(noble) {
  if (noble.state !== 'unknown') return Promise.resolve(noble.state);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { noble.removeListener('stateChange', on); resolve(noble.state); }, 8000);
    const on = (s) => { clearTimeout(timer); noble.removeListener('stateChange', on); resolve(s); };
    noble.on('stateChange', on);
  });
}

async function main() {
  const opsi = bacaArgumen(process.argv.slice(2));
  const noble = require('@stoprocent/noble');

  console.log('=== Info kertas printer label (TIDAK mencetak) ===');
  console.log(`  platform : ${process.platform}`);
  console.log(`  kriteria : ${opsi.nama || opsi.alamat || '(cari otomatis)'}`);

  const state = await tungguStateSiap(noble);
  const diagnosa = pesanUntukState(state);
  console.log(`  keadaan  : ${state}`);
  console.log(`  ${diagnosa.pesan}`);
  if (!diagnosa.lanjut) {
    console.log('\n  KESIMPULAN: Bluetooth belum siap. Perbaiki di atas lalu jalankan ulang.');
    process.exit(2);
  }

  console.log(`\n  memindai ${opsi.detik} detik...`);
  const terlihat = new Map();
  const onDiscover = (p) => {
    const kunci = p.address || p.advertisement?.localName;
    if (kunci) terlihat.set(kunci, { ...klasifikasiPerangkat(p, opsi), rssi: p.rssi, peripheral: p });
  };
  noble.on('discover', onDiscover);
  await noble.startScanningAsync([], true);
  await new Promise((r) => setTimeout(r, opsi.detik * 1000));
  noble.removeListener('discover', onDiscover);
  await noble.stopScanningAsync().catch(() => {});

  const kandidat = pilihKandidat(Array.from(terlihat.values()));
  if (!kandidat) {
    console.log('\n  KESIMPULAN: printer label tidak terlihat. Nyalakan printer & dekatkan,');
    console.log('    dan pastikan tidak sedang tersambung ke HP/aplikasi lain.');
    process.exit(3);
  }
  console.log(`  kandidat : "${kandidat.nama}" (${kandidat.alamat || 'tanpa alamat'}) rssi=${kandidat.rssi ?? '?'}`);

  const klien = new NiimbotNobleClient({ noble, nama: kandidat.nama, alamat: kandidat.alamat });
  try {
    const hasil = await klien.connect();
    console.log(`\n  tersambung: ${hasil.deviceName}`);

    // --- info perangkat & resolusi ---
    try {
      const p = await klien.fetchPrinterInfo();
      console.log('\n=== INFO PERANGKAT ===');
      console.log(`  model            : ${p.modelId ?? '(tidak dilaporkan)'}`);
      console.log(`  lebar kepala cetak: ${p.printheadWidth ?? '?'} px`);
      console.log(`  kelas resolusi   : ${p.resolutionClass ?? '?'}`);
      console.log(`  firmware         : ${p.softwareVersion ?? '?'} / hw ${p.hardwareVersion ?? '?'}`);
      console.log(`  baterai          : ${p.batteryPercents ?? '?'}%`);
    } catch (e) {
      console.log(`\n  (info perangkat tidak terbaca: ${e.message})`);
    }

    // --- geometry kertas menurut printer ---
    console.log('\n=== GEOMETRI KERTAS MENURUT PRINTER ===');
    const info = await klien.protocol.getPaperInfo();
    if (!info || info.valid !== true) {
      console.log('  printer TIDAK melaporkan geometry kertas yang sah.');
      console.log(`  data mentah: ${JSON.stringify(info)}`);
    } else {
      const baris = (mm) => Math.round((mm / 25.4) * DPI);
      const jenis = {
        0: 'Invalid', 1: 'WithGaps (kertas bergap)', 2: 'Black (tanda hitam)',
        3: 'Continuous (tanpa celah)', 4: 'Perforated (berlubang)',
        5: 'Transparent', 6: 'PvcTag', 10: 'BlackMarkGap',
      }[info.paperType] || `tidak dikenal (${info.paperType})`;
      console.log(`  JENIS KERTAS  : ${jenis}`);
      console.log(`  lebar label   : ${info.paperWidth} mm (${info.paperWidthPixel} px)`);
      console.log(`  panjang label : ${info.paperHeight} mm (${info.paperHeightPixel} px)`);
      console.log(`  celah (gap)   : ${info.gapHeight} mm (${info.gapHeightPixel} px)`);
      console.log(`  pitch 1 label : ${info.totalHeight} mm (${info.totalHeightPixel} px)`);
      console.log(`  ekor (tail)   : ${info.tailLength} mm (${info.tailLengthPixel} px)`);

      console.log('\n=== PERBANDINGAN DENGAN HALAMAN YANG DIKIRIM APLIKASI ===');
      console.log(`  halaman aplikasi : ${KANVAS_BARIS} baris = ${Math.round((KANVAS_BARIS / DPI) * 25.4 * 100) / 100} mm`);
      console.log(`  panjang label    : ${info.paperHeight} mm = ${baris(info.paperHeight)} baris`);
      const selisih = Math.round((KANVAS_BARIS / DPI) * 25.4 * 100) / 100 - info.paperHeight;
      console.log(`  SELISIH          : ${selisih} mm` + (selisih > 0.5
        ? '  -> halaman lebih PANJANG dari label; kertas akan melewati ujung label'
        : (selisih < -0.5 ? '  -> halaman lebih pendek dari label' : '  -> halaman = panjang label (cocok)')));
    }
  } catch (error) {
    console.log(`\n  GAGAL: ${error.message}`);
    console.log('    Paling sering: printer masih dipegang perangkat lain (HP/aplikasi NIIMBOT),');
    console.log('    atau sedang tidur. Putuskan sambungan itu lalu coba lagi.');
    process.exit(3);
  }

  await klien.disconnect();
  console.log('\n  KESIMPULAN: selesai — tidak ada perintah cetak yang dikirim.');
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n  GAGAL tak terduga: ${e.message}`);
    process.exit(1);
  });
}

module.exports = {};
