const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'agent-config.json');

class ConfigManager {
  constructor() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Create default config if it doesn't exist
    if (!fs.existsSync(CONFIG_FILE)) {
      const defaultConfig = {
        backendUrl: process.env.BACKEND_URL || 'http://localhost:8000',
        deviceId: process.env.DEVICE_ID || '',
        deviceToken: process.env.DEVICE_TOKEN || process.env.KIOSK_API_KEY || ''
      };
      this.saveConfig(defaultConfig);
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[ConfigManager] Error reading config file:', err);
    }
    return {};
  }

  saveConfig(newConfig) {
    try {
      const currentConfig = this.loadConfig();
      const updatedConfig = { ...currentConfig, ...newConfig };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2));
      return updatedConfig;
    } catch (err) {
      console.error('[ConfigManager] Error saving config file:', err);
      throw err;
    }
  }

  get backendUrl() {
    return this.loadConfig().backendUrl || process.env.BACKEND_URL || 'http://localhost:8000';
  }

  get deviceId() {
    return this.loadConfig().deviceId || process.env.DEVICE_ID || '';
  }

  get deviceToken() {
    return this.loadConfig().deviceToken || process.env.DEVICE_TOKEN || process.env.KIOSK_API_KEY || '';
  }
}

module.exports = new ConfigManager();
