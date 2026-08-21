const SystemSetting = require('../models/systemSettingModel');

const parseValue = (value, type) => {
  switch (type) {
    case 'integer':
      return parseInt(value, 10);
    case 'decimal':
      return parseFloat(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    default:
      return value;
  }
};

const getPublicConfig = async (req, res) => {
  try {
    const settings = await SystemSetting.getPublicSettings();

    const config = {};
    for (const row of settings) {
      config[row.setting_key] = parseValue(row.setting_value, row.value_type);
    }

    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAdminSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.getAllSettings();
    const config = {};
    for (const row of settings) {
      config[row.setting_key] = parseValue(row.setting_value, row.value_type);
    }
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await SystemSetting.updateSetting(key, value.toString());
    }
    return res.status(200).json({ success: true, message: 'Settings updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPublicConfig, getAdminSettings, updateSettings };
