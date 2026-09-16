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
 * Harga kiosk yang diset Admin adalah sumber kebenaran untuk photobooth.
 * Harga frame/layout hanya menjadi fallback untuk kiosk lama yang belum memiliki
 * base_price yang valid.
 */
const resolvePrice = ({ templatePrice, layoutConfig, kioskBasePrice }) => {
  const config = parseJson(layoutConfig, {});
  return asPositiveAmount(kioskBasePrice)
    || asPositiveAmount(templatePrice)
    || asPositiveAmount(config.layout_price)
    || 0;
};

module.exports = { parseJson, resolvePrice };
