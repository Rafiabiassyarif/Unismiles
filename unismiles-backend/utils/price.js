const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const asPositiveAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/**
 * Harga frame yang diset Admin menjadi sumber kebenaran untuk frame tersebut.
 * Harga kiosk dan layout hanya menjadi fallback untuk data lama tanpa harga frame.
 */
const resolvePrice = ({ templatePrice, layoutConfig, kioskBasePrice }) => {
  const config = parseJson(layoutConfig, {});
  return asPositiveAmount(templatePrice)
    || asPositiveAmount(kioskBasePrice)
    || asPositiveAmount(config.layout_price)
    || 0;
};

const UNIQUE_CODE_MIN = 1;
const UNIQUE_CODE_MAX = 99;

/**
 * Kode unik per transaksi: nominal Admin + kode unik (Rp1-Rp99).
 * Kode harus unik antar sesi yang masih menunggu pembayaran pada nominal dasar
 * yang sama, supaya bukti transfer bisa dicocokkan ke sesi yang benar.
 * ponytail: plafon 99 sesi pending per nominal dasar (rentang Rp1-Rp99 sesuai
 * label Admin). Sesi ke-100+ memakai nominal Admin apa adanya, jadi bisa sama.
 * Naikkan plafon hanya kalau antrian pending per nominal benar-benar > 99.
 */
const buildUniqueAmount = (baseAmount, takenAmounts = [], random = Math.random) => {
  const base = Math.floor(Number(baseAmount) || 0);
  if (base <= 100) return { total: base, base, uniqueCode: null };

  const taken = new Set((takenAmounts || []).map(v => Number(v)).filter(Number.isFinite));
  const span = UNIQUE_CODE_MAX - UNIQUE_CODE_MIN + 1;
  const start = Math.floor(random() * span) % span;

  for (let i = 0; i < span; i += 1) {
    const code = UNIQUE_CODE_MIN + ((start + i) % span);
    const total = Math.floor(base / 100) * 100 + code;
    if (!taken.has(total)) return { total, base, uniqueCode: code };
  }

  return { total: base, base, uniqueCode: null };
};

module.exports = { parseJson, resolvePrice, buildUniqueAmount };
