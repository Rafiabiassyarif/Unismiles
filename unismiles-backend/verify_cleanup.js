require('dotenv').config();
const pool = require('./config/db');
const cleanupService = require('./services/cleanupService');
const fs = require('fs');
const path = require('path');

async function verify() {
  try {
    // 1. Set retention to 1 month
    await pool.query("UPDATE system_settings SET setting_value = '1' WHERE setting_key = 'session_retention_months'");
    console.log("Set retention to 1 month.");

    // 2. Insert dummy old session (2 months ago)
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 2);
    
    // Check if session_code is required in db
    await pool.query("INSERT IGNORE INTO sessions (session_code, kiosk_id, frame_template_id, status, started_at, created_at) VALUES ('DUMMY_OLD_SESSION', 1, 1, 'Success', ?, ?)", [oldDate, oldDate]);
    console.log("Inserted old session.");

    // 3. Insert dummy photo file
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    const dummyPhotoPath = path.join(uploadsDir, 'dummy_old_photo.jpg');
    fs.writeFileSync(dummyPhotoPath, 'fake photo content');
    
    // 4. Insert dummy photo into DB
    await pool.query("INSERT IGNORE INTO photos (session_id, url) VALUES ('DUMMY_OLD_SESSION', '/uploads/dummy_old_photo.jpg')");
    console.log("Inserted old photo record & file.");

    // 5. Run cleanup
    console.log("Running cleanup...");
    await cleanupService.runCleanup();

    // 6. Verify it was deleted
    const [sessions] = await pool.query("SELECT * FROM sessions WHERE session_code = 'DUMMY_OLD_SESSION'");
    const [photos] = await pool.query("SELECT * FROM photos WHERE session_id = 'DUMMY_OLD_SESSION'");
    const fileExists = fs.existsSync(dummyPhotoPath);

    console.log(`Session still exists? ${sessions.length > 0}`);
    console.log(`Photo DB record still exists? ${photos.length > 0}`);
    console.log(`Photo file still exists? ${fileExists}`);

    if (sessions.length === 0 && photos.length === 0 && !fileExists) {
      console.log("SUCCESS! Cleanup worked perfectly.");
    } else {
      console.log("FAILED to clean up properly.");
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

verify();
