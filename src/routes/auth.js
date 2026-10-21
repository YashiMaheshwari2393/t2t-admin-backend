const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: 'Too many attempts. Try again later.' },
});

const signToken = (a) =>
  jwt.sign({ admin_user_id: a.admin_user_id, role: 'Admin' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const profileComplete = (a) => Boolean(a.name && a.phone_no && a.admin_id);
const publicAdmin = (a) => ({
  admin_user_id: a.admin_user_id, email: a.email, name: a.name, phone_no: a.phone_no, admin_id: a.admin_id,
});

// POST /api/admin/auth/signup  { email, password, inviteCode }
router.post('/signup', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const invite = String(req.body.inviteCode || '');

  if (!process.env.ADMIN_INVITE_CODE || invite !== process.env.ADMIN_INVITE_CODE)
    return res.status(403).json({ message: 'Invalid admin invite code.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Valid email required.' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  try {
    const [exists] = await pool.query('SELECT admin_user_id FROM AdminUser WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ message: 'Email already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('INSERT INTO AdminUser (email, password) VALUES (?, ?)', [email, hash]);
    const admin = { admin_user_id: r.insertId, email, name: null, phone_no: null, admin_id: null };
    res.status(201).json({ token: signToken(admin), admin: publicAdmin(admin), profileComplete: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/admin/auth/login  { email, password }
router.post('/login', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ message: 'Email and password required.' });

  try {
    const [rows] = await pool.query('SELECT * FROM AdminUser WHERE email = ?', [email]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password)))
      return res.status(401).json({ message: 'Invalid email or password.' });

    await pool.query('UPDATE AdminUser SET last_login = NOW() WHERE admin_user_id = ?', [admin.admin_user_id]);
    await pool.query('INSERT INTO AdminAuditLog (admin_user_id, action_type, details) VALUES (?, ?, ?)',
      [admin.admin_user_id, 'LOGIN', 'Admin logged in']);

    res.json({ token: signToken(admin), admin: publicAdmin(admin), profileComplete: profileComplete(admin) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
