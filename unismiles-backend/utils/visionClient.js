/**
 * Client untuk payment-vision-node (OCR bukti bayar).
 *
 * PENTING soal alamat service.
 *
 * Setiap site KroomBox berjalan di jail-nya sendiri. Dari dalam backend,
 * hasil pengukuran nyata di server:
 *   127.0.0.1:PORT          -> GAGAL (errno 111). Loopback terisolasi per-site,
 *                             jadi "localhost" TIDAK menunjuk ke vision service.
 *   payment-vision-node...  -> gagal dipanggil balik dari dalam (hairpin NAT).
 *   192.168.100.185:PORT    -> OPEN. Ini satu-satunya jalur yang bekerja.
 *
 * Soal PORT: nomor port ditetapkan oleh platform saat deploy dan BISA BERUBAH
 * (pernah 5013, lalu 5025). Karena itu .env saja tidak cukup — kalau portnya
 * bergeser, verifikasi gagal dengan "fetch failed". Client ini mencoba beberapa
 * port kandidat dan mengingat yang berhasil, jadi satu deploy ulang tidak lagi
 * mematikan pembayaran.
 */

const VISION_HOST = process.env.PAYMENT_VISION_HOST || '192.168.100.185';

/**
 * Port kandidat, diurutkan.
 *
 * 5025 dan 5013 adalah dua nilai yang pernah dipakai produksi. 5018/5001/5002
 * disertakan karena pernah muncul di konfigurasi lama. Nilai di .env selalu
 * didahulukan, jadi kalau portnya diketahui pasti, tidak ada percobaan tambahan.
 */
const DEFAULT_VISION_PORTS = [5025, 5013, 5018, 5001, 5002];

/** Ambil variabel pertama yang benar-benar terisi. */
function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/**
 * Buang garis miring di akhir dan tolak alamat yang terbukti tidak bekerja.
 *
 * `localhost`/`127.0.0.1` ditolak karena loopback terisolasi per-site di server:
 * mengarahkannya ke sana menjamin verifikasi gagal total.
 */
function normalizeUrl(raw) {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  if (/^https?:\/\/localhost(?::\d+)?$/i.test(text)) return '';
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(text)) return '';
  return text;
}

/**
 * Pilih alamat vision service dari sekumpulan nilai kandidat.
 *
 * Fungsi murni supaya bisa diuji tanpa memuat ulang modul atau menyentuh
 * environment proses.
 */
function pickVisionUrl(candidates) {
  const found = normalizeUrl(firstNonEmpty(...(candidates || [])));
  return found || `http://${VISION_HOST}:${DEFAULT_VISION_PORTS[0]}`;
}

/**
 * Semua alamat yang layak dicoba, yang paling mungkin lebih dulu.
 *
 * Alamat dari .env selalu pertama; sisanya port kandidat di host yang sama.
 * Kalau .env memuat host lain, host itu juga dicoba dengan port kandidat, supaya
 * perpindahan host tidak langsung mematikan verifikasi.
 */
function resolveVisionCandidates(getenv = process.env) {
  const list = [];
  const push = (url) => {
    const clean = normalizeUrl(url);
    if (clean && !list.includes(clean)) list.push(clean);
  };

  push(pickVisionUrl([
    getenv.PAYMENT_VISION_SERVICE_URL,
    getenv.VISION_SERVICE_URL,
    getenv.PAYMENT_VISION_URL,
  ]));

  const configured = normalizeUrl(firstNonEmpty(
    getenv.PAYMENT_VISION_SERVICE_URL,
    getenv.VISION_SERVICE_URL,
    getenv.PAYMENT_VISION_URL,
  ));

  // Host dari .env kalau ada (agar tidak terkunci ke satu IP), kalau tidak pakai
  // host bawaan. Port selalu dicoba berurutan: port berubah saat deploy.
  const hostMatch = configured.match(/^https?:\/\/([^/:]+)/i);
  const host = hostMatch ? hostMatch[1] : VISION_HOST;
  for (const port of DEFAULT_VISION_PORTS) {
    push(`http://${host}:${port}`);
  }

  return list;
}

function resolveVisionServiceUrl(getenv = process.env) {
  return resolveVisionCandidates(getenv)[0];
}

const visionServiceToken = firstNonEmpty(
  process.env.PAYMENT_VISION_SERVICE_TOKEN,
  process.env.VISION_SERVICE_TOKEN,
  'local-secret',
);

/**
 * Alamat yang terakhir terbukti hidup.
 *
 * Sesudah satu alamat berhasil, alamat itu dicoba lebih dulu pada permintaan
 * berikutnya — supaya percobaan tambahan hanya terjadi sekali per deploy.
 */
let preferredUrl = null;

const VisionClient = {
  /** Alamat service yang sedang dipakai (dipakai juga oleh health check). */
  get baseUrl() {
    return preferredUrl || resolveVisionServiceUrl();
  },

  /**
   * Kirim frame bukti bayar ke vision service untuk dibaca.
   *
   * Mencoba tiap alamat kandidat sampai ada yang menjawab. Hanya kalau SEMUA
   * gagal, error dilempar — dan pesannya menyebut semua alamat yang dicoba,
   * supaya penyebabnya langsung kelihatan di log.
   *
   * @param {Buffer[]} frames - buffer gambar JPEG
   * @param {string} challengeId - penanda liveness
   * @param {number|string} expectedAmount - nominal tagihan sesi
   * @returns {Promise<object>} hasil OCR terstruktur
   */
  async processFrames(frames, challengeId, expectedAmount) {
    const candidates = preferredUrl
      ? [preferredUrl, ...resolveVisionCandidates().filter((u) => u !== preferredUrl)]
      : resolveVisionCandidates();

    const formData = new FormData();
    formData.append('challenge_id', challengeId);
    if (expectedAmount) {
      formData.append('expected_amount', String(expectedAmount));
    }

    frames.forEach((frame, idx) => {
      // Convert Node Buffer to standard Blob/File for FormData
      const blob = new Blob([frame], { type: 'image/jpeg' });
      formData.append('files', blob, `frame_${idx}.jpg`);
    });

    const failures = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const baseUrl = candidates[i];
      const isLast = i === candidates.length - 1;
      console.log(`[VisionClient] Sending ${frames.length} frames to ${baseUrl}/process`);

      try {
        const response = await fetch(`${baseUrl}/process`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${visionServiceToken}` },
          body: formData,
        });

        if (!response.ok) {
          // Service MENJAWAB (walau dengan error): alamatnya benar, jangan pindah
          // port — masalahnya di pemrosesan, bukan di alamat.
          const errorText = await response.text();
          throw new Error(`Vision service returned status ${response.status}: ${errorText}`);
        }

        preferredUrl = baseUrl;
        return await response.json();
      } catch (error) {
        // Jawaban HTTP yang bukan 2xx berarti alamatnya hidup: hentikan dan
        // laporkan error sebenarnya, jangan menutupinya dengan percobaan port lain.
        if (/returned status \d+/.test(error.message)) throw error;

        failures.push(`${baseUrl} (${error.message})`);
        if (isLast) {
          throw new Error(
            `Vision service tidak dapat dihubungi. Alamat yang dicoba: ${failures.join(', ')}`
          );
        }
        console.warn(`[VisionClient] ${baseUrl} gagal, mencoba alamat berikutnya.`);
      }
    }
  }
};

module.exports = VisionClient;
module.exports.resolveVisionServiceUrl = resolveVisionServiceUrl;
module.exports.resolveVisionCandidates = resolveVisionCandidates;
module.exports.pickVisionUrl = pickVisionUrl;
module.exports.normalizeUrl = normalizeUrl;
module.exports.DEFAULT_VISION_PORTS = DEFAULT_VISION_PORTS;
