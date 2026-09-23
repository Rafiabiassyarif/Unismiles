/**
 * Diagnosa Bluetooth untuk printer label NIIMBOT — DIJALANKAN DI MESIN KIOSK.
 *
 * KENAPA SKRIP INI ADA
 *
 * Jalur cetak lewat Bluetooth native tidak bisa diuji dari mesin pengembang
 * (Bluetooth-nya mati), jadi kegagalan pertama akan muncul di kiosk. Tanpa alat
 * diagnosa, yang terlihat hanya "printer tidak ditemukan" — padahal sebabnya bisa
 * empat hal berbeda yang penanganannya berbeda:
 *
 *   adapter mati            -> nyalakan Bluetooth
 *   izin OS belum diberikan -> izinkan di System Settings (macOS), SEKALI
 *   tidak ada adapter BLE   -> masalah perangkat keras/driver
 *   printer tidak menyala   -> nyalakan printernya
 *
 * Skrip ini memisahkan keempatnya, dan berhenti SEBELUM mencetak: mencetak
 * label saat diagnosa akan membuat kegagalan bercampur dengan hasil cetak.
 *
 * CARA PAKAI
 *
 *   cd kiosk-agent
 *   node scripts/ble-check.js                       # cari printer label
 *   node scripts/ble-check.js --nama "B1 Pro-..."   # cari printer tertentu
 *   node scripts/ble-check.js --alamat aa:bb:...    # cari lewat alamat
 *   node scripts/ble-check.js --detik 20            # pindai lebih lama
 *   node scripts/ble-check.js --sambung             # + sambung & periksa karakteristik
 *
 * Kode keluar: 0 berhasil · 2 Bluetooth tidak siap · 3 printer tidak ditemukan
 */
const { NiimbotNobleClient, NIIMBOT_SERVICE_UUID, tanpaDash } = require('../src/niimbotNobleClient');

/**
 * Keadaan adapter -> penjelasan DAN tindakan.
 *
 * Pesan "tidak ditemukan" untuk semua keadaan akan menyesatkan: pada macOS,
 * keadaan `poweredOff` paling sering berarti izin Bluetooth belum diberikan ke
 * proses yang menjalankan ini (Terminal/node), bukan Bluetooth-nya mati.
 */
function pesanUntukState(state) {
  switch (String(state)) {
    case 'poweredOn':
      return { lanjut: true, pesan: 'Adapter Bluetooth siap.' };
    case 'poweredOff':
      return {
        lanjut: false,
        pesan: 'Adapter Bluetooth MATI, atau izin Bluetooth belum diberikan ke proses ini.\n'
          + '    macOS : System Settings → Privacy & Security → Bluetooth → izinkan\n'
          + '            aplikasi yang menjalankan ini (Terminal / node), lalu jalankan ulang.\n'
          + '    Windows: nyalakan Bluetooth di Settings → Bluetooth & devices.',
      };
    case 'unauthorized':
      return {
        lanjut: false,
        pesan: 'Izin Bluetooth DITOLAK untuk proses ini.\n'
          + '    macOS: System Settings → Privacy & Security → Bluetooth → centang aplikasinya.',
      };
    case 'unsupported':
      return { lanjut: false, pesan: 'Mesin ini tidak punya adapter BLE (atau drivernya tidak terpasang).' };
    case 'resetting':
      return { lanjut: false, pesan: 'Adapter Bluetooth sedang reset. Coba lagi sebentar lagi.' };
    default:
      return {
        lanjut: false,
        pesan: `Keadaan adapter tidak terbaca ("${state}").\n`
          + '    Biasanya ini berarti izin Bluetooth belum diberikan: macOS hanya\n'
          + '    melaporkan keadaan setelah izinnya ada. Berikan izin lalu jalankan ulang.',
      };
  }
}

/**
 * Klasifikasi satu perangkat yang terlihat.
 *
 * Dipakai untuk memberi tahu operator printer MANA yang harus dipilih/diisi di
 * Admin. Menerima nama apa pun sebagai "kandidat" akan menyesatkan, jadi hanya
 * tiga penanda kuat yang dihitung: service NIIMBOT, awalan model, atau kecocokan
 * persis dengan kriteria yang diminta.
 */
function klasifikasiPerangkat(peripheral, kriteria = {}) {
  const nama = String(peripheral?.advertisement?.localName || '');
  const alamat = String(peripheral?.address || '');
  const services = (peripheral?.advertisement?.serviceUuids || []).map(tanpaDash);
  const punyaService = services.includes(tanpaDash(NIIMBOT_SERVICE_UUID));
  const awalanModel = /^(b1|d11|d110|b21|b18|d101)/i.test(nama);
  const cocokKriteria = Boolean(
    (kriteria.nama && nama === kriteria.nama)
    || (kriteria.alamat && alamat.toLowerCase() === String(kriteria.alamat).toLowerCase()));

  const printerLabel = punyaService || awalanModel || cocokKriteria;
  const alasan = [punyaService && 'service NIIMBOT', awalanModel && 'awalan model label', cocokKriteria && 'sama dengan kriteria']
    .filter(Boolean).join(' + ');
  return { nama, alamat, printerLabel, alasan };
}

/** Pilih perangkat terkuat sinyalnya di antara kandidat printer label. */
function pilihKandidat(daftar) {
  const kandidat = daftar.filter((d) => d.printerLabel);
  if (kandidat.length === 0) return null;
  return kandidat.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))[0];
}

function bacaArgumen(argv) {
  const opsi = { detik: 12, sambung: false, nama: null, alamat: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sambung') opsi.sambung = true;
    else if (a === '--detik') opsi.detik = Number(argv[++i]) || opsi.detik;
    else if (a === '--nama') opsi.nama = argv[++i] || null;
    else if (a === '--alamat') opsi.alamat = argv[++i] || null;
  }
  return opsi;
}

async function main() {
  const opsi = bacaArgumen(process.argv.slice(2));
  const noble = require('@stoprocent/noble');

  console.log('=== Diagnosa Bluetooth printer label (NIIMBOT) ===');
  console.log(`  platform : ${process.platform}`);
  console.log(`  kriteria : ${opsi.nama || opsi.alamat || '(cari otomatis)'}`);

  // Keadaan awal sering 'unknown': macOS/Windows hanya melaporkannya setelah
  // izin ada. Jadi ditunggu sebentar alih-alih langsung menyimpulkan.
  let state = noble.state;
  if (state === 'unknown') {
    state = await new Promise((resolve) => {
      const timer = setTimeout(() => { noble.removeListener('stateChange', on); resolve(noble.state); }, 8000);
      const on = (s) => { clearTimeout(timer); noble.removeListener('stateChange', on); resolve(s); };
      noble.on('stateChange', on);
    });
  }

  const diagnosa = pesanUntukState(state);
  console.log(`  keadaan  : ${state}`);
  console.log(`  ${diagnosa.pesan}`);
  if (!diagnosa.lanjut) {
    console.log('\n  KESIMPULAN: Bluetooth belum siap dipakai — perbaiki di atas, lalu jalankan ulang.');
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

  const daftar = Array.from(terlihat.values());
  console.log(`\n  ${daftar.length} perangkat terlihat:`);
  for (const d of daftar) {
    const tanda = d.printerLabel ? 'PRINTER?' : '        ';
    console.log(`    ${tanda} ${d.nama || '(tanpa nama)'}  ${d.alamat || '-'}  rssi=${d.rssi ?? '?'}`
      + (d.alasan ? `  ← ${d.alasan}` : ''));
  }

  const kandidat = pilihKandidat(daftar);
  if (!kandidat) {
    console.log('\n  KESIMPULAN: TIDAK ADA printer label terlihat.');
    console.log('    Periksa: (a) printer menyala, (b) jarak dekat, (c) tidak sedang');
    console.log('    tersambung ke HP/aplikasi lain — BLE hanya melayani satu koneksi pusat.');
    console.log('    Kalau namanya tidak berawalan model, isi nama/alamat persis di Admin.');
    process.exit(3);
  }

  // macOS tidak mengungkap alamat BLE (alamat acak per sesi), jadi tanda kurung
  // kosong akan terbaca seperti kesalahan. Diterangkan apa adanya.
  const alamatTampil = kandidat.alamat || 'tanpa alamat — macOS menyembunyikannya; pakai nama';
  console.log(`\n  kandidat terkuat: "${kandidat.nama}" (${alamatTampil}) rssi=${kandidat.rssi ?? '?'}`);
  console.log(`    isi ini di Admin → Printer: ${kandidat.nama}`);
  if (kandidat.alamat) console.log(`    atau alamat: ${kandidat.alamat}`);

  if (!opsi.sambung) {
    console.log('\n  (tidak menyambung. Tambahkan --sambung untuk memeriksa handshake BLE.)');
    console.log('  KESIMPULAN: printer label TERLIHAT. Radio bekerja.');
    process.exit(0);
  }

  // Sambungan BERSIFAT DIAGNOSA: hanya memastikan layanan & karakteristiknya
  // ada. TIDAK mengirim perintah cetak — kegagalan cetak harus dipisahkan dari
  // kegagalan sambungan.
  console.log('\n  menyambung untuk memeriksa layanan & karakteristik (TIDAK mencetak)...');
  const klien = new NiimbotNobleClient({ noble, nama: kandidat.nama, alamat: kandidat.alamat });
  try {
    const hasil = await klien.connect();
    const channel = klien.channel;
    console.log(`    tersambung  : ${hasil.deviceName}`);
    // Bentuk `properties` berbeda antar transport: noble memakai ARRAY
    // (["notify","writeWithoutResponse"]), Web Bluetooth memakai OBJEK
    // ({ notify: true, ... }). Dibaca keduanya, kalau tidak laporannya justru
    // menyatakan false untuk dua sifat yang menjadi alasan pemilihannya.
    const bisa = (nama) => {
      const p = channel?.properties;
      if (Array.isArray(p)) return p.includes(nama);
      return p?.[nama] === true;
    };
    console.log(`    karakteristik: ${channel?.uuid}`);
    console.log(`    notify      : ${bisa('notify')}`);
    console.log(`    tanpa respons: ${bisa('writeWithoutResponse')}`);
    console.log('\n  KESIMPULAN: sambungan OK dan karakteristik NIIMBOT ditemukan.');
    console.log('  Jalur Bluetooth native SIAP. Selanjutnya uji cetak dari aplikasi.');
    await klien.disconnect();
    process.exit(0);
  } catch (error) {
    console.log(`    GAGAL menyambung: ${error.message}`);
    console.log('\n  KESIMPULAN: printer terlihat tetapi tidak bisa dibuka.');
    console.log('    Paling sering: printer masih terpegang perangkat lain (HP/aplikasi'),
    console.log('    NIIMBOT), atau sedang tidur. Matikan sambungan itu lalu coba lagi.');
    process.exit(3);
  }
}

module.exports = { pesanUntukState, klasifikasiPerangkat, pilihKandidat, bacaArgumen };

if (require.main === module) {
  main().catch((error) => {
    console.error('Diagnosa gagal:', error.message);
    process.exit(1);
  });
}
