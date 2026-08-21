const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

const asPositiveAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** Harga diprioritaskan dari template, layout_config, lalu kiosk. */
const resolvePrice = ({ templatePrice, layoutConfig, kioskBasePrice }) => {
  const config = parseJson(layoutConfig, {});
  return asPositiveAmount(templatePrice)
    || asPositiveAmount(config.layout_price)
    || asPositiveAmount(kioskBasePrice)
    || 0;
};

module.exports = { parseJson, resolvePrice };
