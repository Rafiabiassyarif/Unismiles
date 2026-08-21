require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'unismiles',
  });

  try {
    const [result] = await connection.execute(
      `UPDATE kiosk_printing_configs 
       SET printing_enabled = 1, adapter = 'windows', printer_name = 'AUTO' 
       WHERE printer_name IS NULL OR printer_name = '' OR adapter = 'disabled'`
    );
    console.log(`Successfully updated ${result.affectedRows} offline kiosks to use AUTO printer configuration.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await connection.end();
  }
}

run();
