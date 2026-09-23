/**
 * Transport NIIMBOT lewat Bluetooth native (noble), bukan Web Bluetooth.
 *
 * KENAPA INI ADA
 *
 * Web Bluetooth menyimpan izin per-ORIGIN dan per-PROFIL BROWSER, dan izin itu
 * bisa hilang (data situs dibersihkan, profil berbeda, mode kiosk). Akibatnya
 * pemilih perangkat muncul lagi padahal printer sudah pernah dipasangkan — dan
 * TIDAK ADA kode di halaman web yang bisa memaksanya bertahan. Itu batas
 * platform, bukan bug aplikasi.
 *
 * Di proses Node batas itu tidak berlaku: Bluetooth diakses lewat adapter OS,
 * tidak ada origin, tidak ada izin halaman. Printer dikenali dari ALAMAT/nama
 * iklannya, sehingga "sekali dikonfigurasi, langsung menyambung" bisa dijamin.
 *
 * KENAPA MEWARISI NiimbotAbstractClient
 *
 * Kelas dasar itu sudah memuat protokol, heartbeat, mutex pengiriman paket, dan
 * penangkap paket. Menyalinnya ulang berarti dua tempat yang harus dijaga sama —
 * dan perubahan protokol di library akan diam-diam tidak terpakai. Jadi yang
 * ditulis di sini HANYA transport, persis seperti bluetooth_impl.js:
 *
 *   library (bluetooth_impl.js)          kelas ini
 *   navigator.bluetooth.requestDevice    noble: ditemukan dari daftar iklan
 *   device.gatt.connect()                peripheral.connectAsync()
 *   getPrimaryServices()/getChars        discoverAllServicesAndCharacteristicsAsync()
 *   channel.startNotifications()         characteristic.subscribeAsync()
 *   'characteristicvaluechanged'         characteristic.on('data')
 *   writeValueWithoutResponse            characteristic.writeAsync(buf, false)
 *
 * YANG BELUM TERBUKTI
 *
 * Jalan ini belum diuji dengan radio hidup (Bluetooth mesin pengembang mati saat
 * kode ditulis). Jalankan `scripts/ble-scan.js` di mesin kiosk untuk membuktikan
 * pencarian printer sebelum mempercayainya.
 */
const { randomUUID } = require('node:crypto');
const niimbluelib = require('@mmote/niimbluelib');

const { NiimbotAbstractClient, ConnectEvent, DisconnectEvent, RawPacketSentEvent } = niimbluelib;

/** Service NIIMBOT — sama dengan BleDefaultConfiguration.SERVICES di library. */
const NIIMBOT_SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';

/** noble mengembalikan UUID tanpa dasbor; bandingkan dalam bentuk yang sama. */
function tanpaDash(uuid) {
  return String(uuid || '').toLowerCase().replace(/-/g, '');
}

class NiimbotNobleClient extends NiimbotAbstractClient {
  /**
   * @param {object} opsi
   * @param {object} opsi.noble   modul noble (disuntikkan supaya bisa diuji tanpa radio)
   * @param {string} [opsi.alamat] alamat perangkat yang dituju
   * @param {string} [opsi.nama]   nama iklan (cadangan; macOS memberi alamat acak)
   * @param {number} [opsi.cariTimeoutMs]
   */
  constructor({ noble, alamat = null, nama = null, cariTimeoutMs = 15000 } = {}) {
    super();
    this.noble = noble;
    this.alamat = alamat;
    this.nama = nama;
    this.cariTimeoutMs = cariTimeoutMs;
    this.peripheral = null;
    this.channel = null;
    /** Hanya untuk log — noble tidak selalu memberi alamat yang stabil. */
    this.labelSementara = `ble-${randomUUID().slice(0, 8)}`;
  }

  /** Lihat AbstractClient: kontrol apakah heartbeat jalan otomatis. */
  setHeartbeatAutoStart(value) {
    this.heartbeatAutoStart = Boolean(value);
  }

  getType() {
    return 'noble';
  }

  isConnected() {
    return Boolean(this.peripheral && this.channel);
  }

  cocok(peripheral) {
    const alamat = String(peripheral?.address || '').toLowerCase();
    const nama = String(peripheral?.advertisement?.localName || '');
    if (this.alamat && alamat && alamat === String(this.alamat).toLowerCase()) return true;
    if (this.nama && nama && nama === this.nama) return true;
    return false;
  }

  /**
   * Cari printer yang dituju. TIDAK membuka dialog apa pun — inilah inti
   * perbedaannya dengan Web Bluetooth, dan satu-satunya alasan jalur ini ada.
   */
  async cariPerangkat() {
    if (!this.noble) throw new Error('Modul noble tidak diberikan ke transport');
    if (this.noble.state !== 'poweredOn') {
      const error = new Error(`Adapter Bluetooth tidak siap (state: ${this.noble.state}). `
        + 'Di macOS: izinkan akses Bluetooth untuk proses ini di System Settings → Privacy & Security → Bluetooth.');
      error.code = 'BLUETOOTH_UNAVAILABLE';
      throw error;
    }

    // noble menyimpan peripheral yang sudah pernah terlihat; memakainya
    // menghindari scan ulang saat printer sudah dikenal.
    const tersimpan = this.noble._peripherals
      ? Object.values(this.noble._peripherals).find((p) => this.cocok(p))
      : null;
    if (tersimpan) return tersimpan;

    return new Promise((resolve, reject) => {
      const selesai = (fn, nilai) => {
        clearTimeout(timer);
        this.noble.removeListener('discover', onDiscover);
        this.noble.stopScanning();
        fn(nilai);
      };
      const timer = setTimeout(() => {
        const error = new Error(`Printer tidak ditemukan dalam ${this.cariTimeoutMs} ms `
          + `(dicari: ${this.alamat || this.nama || 'tanpa kriteria'})`);
        error.code = 'PRINTER_NOT_FOUND';
        selesai(reject, error);
      }, this.cariTimeoutMs);
      const onDiscover = (peripheral) => {
        if (this.cocok(peripheral)) selesai(resolve, peripheral);
      };

      this.noble.on('discover', onDiscover);
      this.noble.startScanning([], true).catch((error) => {
        error.code = 'BLUETOOTH_UNAVAILABLE';
        selesai(reject, error);
      });
    });
  }

  /**
   * Karakteristik yang bisa notify DAN ditulis tanpa respons.
   *
   * Kriterianya disalin dari library: itulah satu-satunya karakteristik yang
   * dipakai NIIMBOT untuk mengangkut paket. Memilih yang lain akan menyambung
   * "berhasil" tetapi tidak ada paket yang mengalir.
   */
  async pilihKarakteristik(peripheral) {
    const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();
    const channel = characteristics.find((c) => c.properties?.notify && c.properties?.writeWithoutResponse);
    if (!channel) {
      const error = new Error('Karakteristik NIIMBOT tidak ditemukan (perlu notify + writeWithoutResponse)');
      error.code = 'CHARACTERISTIC_NOT_FOUND';
      throw error;
    }
    return channel;
  }

  async connect() {
    await this.disconnect();

    const peripheral = await this.cariPerangkat();
    this.peripheral = peripheral;
    this.alamat = peripheral.address || this.alamat;
    this.nama = peripheral.advertisement?.localName || this.nama;

    peripheral.once('disconnect', () => {
      this.peripheral = null;
      this.channel = null;
      // Sisa byte dari sesi mati tidak boleh menempel ke paket berikutnya:
      // gejalanya "Dropping invalid buffer" dan balasan yang ditunggu bisa ikut
      // terbuang. Kelas dasar membersihkan buffer saat event ini, jadi cukup
      // memancarkannya.
      this.emit('disconnect', new DisconnectEvent());
    });

    await peripheral.connectAsync();
    const channel = await this.pilihKarakteristik(peripheral);
    channel.on('data', (data) => this.processRawPacket(data));
    await channel.subscribeAsync();
    this.channel = channel;

    const hasil = {
      deviceName: this.nama || this.labelSementara,
      address: this.alamat,
      result: undefined,
    };
    // Pemanggil (adapter) yang memanggut negosiasi protokol, supaya kegagalan
    // protokol tidak tersamar sebagai kegagalan Bluetooth.
    this.emit('connect', new ConnectEvent(hasil));
    return hasil;
  }

  async disconnect() {
    if (this.peripheral) {
      try { await this.peripheral.disconnectAsync(); } catch { /* sudah terputus */ }
    }
    this.peripheral = null;
    this.channel = null;
  }

  async sendRaw(data, force) {
    const kirim = async () => {
      if (!this.channel) throw new Error('Channel is closed');
      await new Promise((resolve) => setTimeout(resolve, this.packetIntervalMs));
      // Argumen kedua noble adalah `withoutResponse`. NIIMBOT hanya menyediakan
      // writeWithoutResponse, jadi nilainya WAJIB true: dengan false, noble
      // menunggu balasan tulis yang tidak akan pernah datang dan pengiriman
      // menggantung sampai timeout.
      await this.channel.writeAsync(Buffer.from(data), true);
      this.emit('rawpacketsent', new RawPacketSentEvent(data));
    };
    // mutex diwarisi dari kelas dasar — sama seperti implementasi library, jadi
    // paket tidak saling menimpa saat cetak dan heartbeat berjalan bersamaan.
    return force ? kirim() : this.mutex.runExclusive(kirim);
  }
}

module.exports = { NiimbotNobleClient, NIIMBOT_SERVICE_UUID, tanpaDash };
