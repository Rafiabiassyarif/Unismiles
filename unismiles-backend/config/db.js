const mysql = require('mysql2/promise');

const dbPort = Number(process.env.DB_PORT) || 3306;

console.log(`[Database] Connecting to MySQL at ${process.env.DB_HOST}:${dbPort}, database '${process.env.DB_NAME}'`);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: dbPort,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 60000,
});

module.exports = pool;

