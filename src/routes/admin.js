const express = require('express');
const { pool, studentPool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// PUT /api/admin/profile  { name, phone_no, admin_id }
router.put('/profile', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone_no || '').trim();
  const adminId = String(req.body.admin_id || '').trim();

  if (name.length < 2 || name.length > 100) return res.status(400).json({ message: 'Enter a valid name.' });
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number.' });
  if (!/^[A-Za-z0-9-]{3,50}$/.test(adminId)) return res.status(400).json({ message: 'Enter a valid admin ID.' });

  try {
    await pool.query('UPDATE AdminUser SET name = ?, phone_no = ?, admin_id = ? WHERE admin_user_id = ?',
      [name, phone, adminId, req.admin.admin_user_id]);
    await pool.query('INSERT INTO AdminAuditLog (admin_user_id, action_type, details) VALUES (?, ?, ?)',
      [req.admin.admin_user_id, 'PROFILE_UPDATE', 'Admin details saved']);
    res.json({ message: 'Details saved.', profileComplete: true, admin: { name, phone_no: phone, admin_id: adminId } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This admin ID is already registered.' });
    console.error(e);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [[admin]] = await pool.query(
      'SELECT admin_user_id, name, email, phone_no, admin_id, last_login FROM AdminUser WHERE admin_user_id = ?',
      [req.admin.admin_user_id]);
    if (!admin) return res.status(404).json({ message: 'Admin not found.' });

    const [activity] = await pool.query(
      `SELECT action_type, details, timestamp FROM AdminAuditLog
       WHERE admin_user_id = ? ORDER BY timestamp DESC LIMIT 10`, [admin.admin_user_id]);

    // System overview: sirf tab jab STUDENT_DATABASE_URL set ho
    let overview = null;
    if (studentPool) {
      try {
        const [[u]] = await studentPool.query('SELECT COUNT(*) AS total FROM User');
        const [byStatus] = await studentPool.query(
          'SELECT submission_status AS status, COUNT(*) AS count FROM EWasteItem GROUP BY submission_status');
        const [[c]] = await studentPool.query(
          `SELECT COALESCE(SUM(CASE WHEN transaction_type='Credit' THEN amount END),0) AS credited,
                  COALESCE(SUM(CASE WHEN transaction_type='Debit' THEN amount END),0) AS debited
           FROM EcoCoinTransaction WHERE transaction_status = 'Completed'`);
        const [recent] = await studentPool.query(
          `SELECT i.item_id, u.name, i.category, i.submission_status, i.submission_date
           FROM EWasteItem i JOIN User u ON u.user_id = i.user_id
           ORDER BY i.submission_date DESC LIMIT 10`);
        overview = {
          totalUsers: u.total,
          totalSubmissions: byStatus.reduce((s, r) => s + r.count, 0),
          submissionsByStatus: byStatus,
          ecoCoins: { credited: c.credited, debited: c.debited },
          recentSubmissions: recent,
        };
      } catch (e) {
        console.error('Overview error:', e.message);
        overview = { error: 'Could not load student data.' };
      }
    }

    res.json({
      admin,
      profileComplete: Boolean(admin.name && admin.phone_no && admin.admin_id),
      overview,
      recentActivity: activity,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
