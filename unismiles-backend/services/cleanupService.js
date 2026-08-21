const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const cleanupService = {
  start() {
    // Run every day at 02:00 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('[Cleanup] Starting auto-delete cleanup job...');
      try {
        await this.runCleanup();
      } catch (err) {
        console.error('[Cleanup] Error during cleanup job:', err);
      }
    });
    console.log('[Cleanup] Auto-delete cron job scheduled (runs daily at 02:00 AM)');
  },

  async runCleanup() {
    try {
      // 1. Get retention setting
      const [settings] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'session_retention_months'"
      );
      
      if (!settings || settings.length === 0) {
        console.log('[Cleanup] No retention setting found. Skipping.');
        return;
      }

      const retentionMonths = parseInt(settings[0].setting_value, 10);
      if (isNaN(retentionMonths) || retentionMonths <= 0) {
        console.log('[Cleanup] Retention set to 0 (Never Delete). Skipping.');
        return;
      }

      // 2. Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
      
      console.log(`[Cleanup] Retention is ${retentionMonths} months. Deleting sessions older than ${cutoffDate.toISOString()}`);

      // 3. Find old sessions
      const [oldSessions] = await pool.query(
        'SELECT * FROM sessions WHERE started_at < ?',
        [cutoffDate]
      );

      if (oldSessions.length === 0) {
        console.log('[Cleanup] No old sessions found to delete.');
        return;
      }

      let deletedCount = 0;

      // 4. Delete each session and its photos
      for (const session of oldSessions) {
        const sessionId = session.session_code || session.id;

        const [photos] = await pool.query(
          'SELECT id, url FROM photos WHERE session_id = ? OR session_id = ?',
          [sessionId, sessionId.toString()]
        );

        for (const photo of photos) {
          if (photo.url) {
            const filename = photo.url.replace('/uploads/', '');
            const filePath = path.join(__dirname, '..', 'uploads', filename);
            if (fs.existsSync(filePath)) {
              try { fs.unlinkSync(filePath); } catch (e) {}
            }
          }
        }

        // Delete photos from DB
        await pool.query('DELETE FROM photos WHERE session_id = ? OR session_id = ?', [sessionId, sessionId.toString()]);
        
        // Delete session from DB
        if (session.session_code) {
          await pool.query('DELETE FROM sessions WHERE session_code = ?', [session.session_code]);
        } else {
          await pool.query('DELETE FROM sessions WHERE id = ?', [session.id]);
        }
        
        deletedCount++;
      }

      console.log(`[Cleanup] Successfully deleted ${deletedCount} old sessions and their photos.`);
    } catch (err) {
      console.error('[Cleanup] Exception in runCleanup:', err);
      throw err;
    }
  }
};

module.exports = cleanupService;
