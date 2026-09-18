/**
 * Kebijakan pengembalian otomatis ke signage.
 *
 * Dipisah dari PhotoBooth.tsx supaya bisa diuji tanpa browser: keputusan
 * "boleh redirect sekarang?" adalah bagian berisiko, karena redirect di tengah
 * alur membuang sesi yang sudah dibayar.
 */

/** Tujuan tombol Back (halaman pertama) dan Home (halaman akhir). */
export const SIGNAGE_URL = 'https://signage.jagoai.dev/';

/** Lama menganggur sebelum kembali sendiri ke signage. */
export const IDLE_REDIRECT_MS = 60_000;

/**
 * Layar tunggu: pengunjung hanya memilih, tidak ada data yang bisa hilang.
 *
 * Layar lain sengaja TIDAK ada di sini. Di CAPTURE/PAYMENT_SCAN pengunjung
 * sedang berpose atau memindai QR tanpa menyentuh layar; di PAYMENT_CHECKING,
 * EDIT, dan RESULT ada sesi berbayar yang sedang diproses. Redirect otomatis di
 * sana akan membuang pekerjaan pengunjung.
 */
export const IDLE_SAFE_STEPS = ['LANDING', 'PACKAGE', 'LAYOUT'] as const;

/**
 * Event yang dihitung sebagai pengunjung masih aktif. Gerakan tangan di depan
 * kamera (gesture) sengaja tidak dihitung: orang yang lewat akan terus menahan
 * timer sehingga photobooth tidak pernah kembali ke signage.
 */
export const USER_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

export interface IdleContext {
  step: string;
  isCalibrating: boolean;
  /** Operator sedang di menu admin atau kiosk dalam maintenance mode. */
  idlePaused: boolean;
}

/** Apakah timer idle boleh berjalan di kondisi ini. */
export function shouldArmIdleTimer({ step, isCalibrating, idlePaused }: IdleContext): boolean {
  if (idlePaused || isCalibrating) return false;
  return (IDLE_SAFE_STEPS as readonly string[]).includes(step);
}
