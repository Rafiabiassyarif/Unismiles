const pool = require('../config/db');

// The SQL dump used by the project calls this column `name`, while some
// environments were created from an earlier schema that called it
// `full_name`. Resolve the actual column once and alias it to the API's
// stable `full_name` property.
let nameColumnPromise;

async function getNameColumn() {
  if (!nameColumnPromise) {
    nameColumnPromise = pool.query(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME IN ('name', 'full_name')
        ORDER BY FIELD(COLUMN_NAME, 'name', 'full_name')
        LIMIT 1`
    ).then(([rows]) => {
      if (!rows[0]) {
        throw new Error("The users table must contain either a 'name' or 'full_name' column");
      }
      return rows[0].COLUMN_NAME;
    });
  }

  return nameColumnPromise;
}

function quoteIdentifier(identifier) {
  // Only values returned from the allow-listed information_schema query reach
  // this function, but keep the escaping explicit for clarity and safety.
  return `\`${identifier.replace(/`/g, '``')}\``;
}

const User = {
  async findByEmail(email) {
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [rows] = await pool.query(
      `SELECT id, ${nameColumn} AS full_name, email, password_hash, role, partner_name, status, created_at, updated_at
         FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [rows] = await pool.query(
      `SELECT id, ${nameColumn} AS full_name, email, password_hash, role, partner_name, status, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async getUserById(id) {
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [rows] = await pool.query(
      `SELECT id, ${nameColumn} AS full_name, email, role, partner_name, status, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async getAllUsers() {
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [rows] = await pool.query(
      `SELECT id, ${nameColumn} AS full_name, email, role, partner_name, status, created_at, updated_at
         FROM users ORDER BY created_at DESC`
    );
    return rows;
  },

  async create(userData) {
    const { full_name, name, email, password_hash, role, partner_name } = userData;
    const nameToUse = full_name || name;
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [result] = await pool.query(
      `INSERT INTO users (${nameColumn}, email, password_hash, role, partner_name) VALUES (?, ?, ?, ?, ?)`,
      [nameToUse, email, password_hash, role, partner_name || null]
    );
    return result;
  },

  async updateUser(id, userData) {
    const { full_name, name, email, role, partner_name } = userData;
    const nameToUse = full_name || name;
    const nameColumn = quoteIdentifier(await getNameColumn());
    const [result] = await pool.query(
      `UPDATE users SET ${nameColumn} = ?, email = ?, role = ?, partner_name = ? WHERE id = ?`,
      [nameToUse, email, role, partner_name || null, id]
    );
    return result;
  },

  async deleteUser(id) {
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
    return result;
  }
};

// Aliases for compatibility
User.findUserByEmail = User.findByEmail;
User.getNameColumn = getNameColumn;

module.exports = User;
