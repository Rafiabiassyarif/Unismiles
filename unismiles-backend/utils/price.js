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

module.exports = { parseJson, resolvePrice };
