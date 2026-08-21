const pool = require('../config/db');

const auditLogModel = {
  async create({ userId = null, action, resourceType, resourceId, metadata = {} }) {
    const safeMetadata = { ...metadata };
    delete safeMetadata.api_key;
    delete safeMetadata.deviceToken;
    delete safeMetadata.device_token;
    delete safeMetadata.token;
    delete safeMetadata.secret;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, action, resourceType, String(resourceId), JSON.stringify(safeMetadata)]
    );
  },
};

module.exports = auditLogModel;
