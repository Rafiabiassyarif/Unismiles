/**
 * Client untuk payment-vision-node (OCR bukti bayar).
 *
 * PENTING soal alamat service.
 *
 * Setiap site KroomBox berjalan di jail-nya sendiri. Dari dalam backend,
 * hasil pengukuran nyata di server:
 *   127.0.0.1:5013          -> GAGAL (errno 111). Loopback terisolasi per-site,
 *                             jadi "localhost" TIDAK menunjuk ke vision service.
 *   payment-vision-node...  -> gagal dipanggil balik dari dalam (hairpin NAT).
 *   192.168.100.185:5013    -> OPEN. Ini satu-satunya jalur yang bekerja.
 *
 * Versi lama memakai `localhost:5001` sebagai cadangan, sehingga begitu
 * PAYMENT_VISION_SERVICE_URL hilang dari .env, setiap verifikasi pembayaran
 * berakhir INTERNAL_ERROR walaupun vision service sehat. Sekarang cadangannya
 * alamat LAN yang terbukti hidup, jadi kesalahan konfigurasi tidak lagi
 * mematikan pembayaran.
 */

const DEFAULT_VISION_URL = 'http://192.168.100.185:5013';

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
  return found || DEFAULT_VISION_URL;
}

function resolveVisionServiceUrl(getenv = process.env) {
  return pickVisionUrl([
    getenv.PAYMENT_VISION_SERVICE_URL,
    getenv.VISION_SERVICE_URL,
    getenv.PAYMENT_VISION_URL,
  ]);
}

const visionServiceToken = firstNonEmpty(
  process.env.PAYMENT_VISION_SERVICE_TOKEN,
  process.env.VISION_SERVICE_TOKEN,
  'local-secret',
);

const VisionClient = {
  /** Alamat service yang sedang dipakai (dipakai juga oleh health check). */
  get baseUrl() {
    return resolveVisionServiceUrl();
  },

  /**
   * Kirim frame bukti bayar ke vision service untuk dibaca.
   * @param {Buffer[]} frames - buffer gambar JPEG
   * @param {string} challengeId - penanda liveness
   * @param {number|string} expectedAmount - nominal tagihan sesi
   * @returns {Promise<object>} hasil OCR terstruktur
   */
  async processFrames(frames, challengeId, expectedAmount) {
    const baseUrl = resolveVisionServiceUrl();

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

    console.log(`[VisionClient] Sending ${frames.length} frames to ${baseUrl}/process`);

    let response;
    try {
      response = await fetch(`${baseUrl}/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${visionServiceToken}`
        },
        body: formData
      });
    } catch (error) {
      // Sebutkan alamatnya supaya penyebabnya langsung kelihatan di log; tanpa
      // ini kegagalan jaringan terbaca sebagai "fetch failed" tanpa konteks.
      throw new Error(`Vision service tidak dapat dihubungi di ${baseUrl}: ${error.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision service returned status ${response.status}: ${errorText}`);
    }

    return response.json();
  }
};

module.exports = VisionClient;
module.exports.resolveVisionServiceUrl = resolveVisionServiceUrl;
module.exports.pickVisionUrl = pickVisionUrl;
module.exports.normalizeUrl = normalizeUrl;
module.exports.DEFAULT_VISION_URL = DEFAULT_VISION_URL;
