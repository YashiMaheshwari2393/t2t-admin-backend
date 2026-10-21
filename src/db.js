const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

function parse(urlStr) {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace('/', ''),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

const adminCfg = parse(process.env.DATABASE_URL);
const pool = mysql.createPool({ ...adminCfg, waitForConnections: true, connectionLimit: 10, decimalNumbers: true });

// OPTIONAL: student database (read-only use) for the overview section
const studentPool = process.env.STUDENT_DATABASE_URL
  ? mysql.createPool({ ...parse(process.env.STUDENT_DATABASE_URL), waitForConnections: true, connectionLimit: 3, decimalNumbers: true })
  : null;

async function initDb() {
  // Admin database na bana ho to banane ki koshish (permission na ho to ignore)
  try {
    const { database, ...noDb } = adminCfg;
    const c = await mysql.createConnection(noDb);
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await c.end();
  } catch (e) {
    console.warn('Could not auto-create database (create it manually):', e.message);
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
}

module.exports = { pool, studentPool, initDb };
