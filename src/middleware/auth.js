const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token missing. Please login.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'Admin') return res.status(403).json({ message: 'Admin access only.' });
    req.admin = payload; // { admin_user_id, role }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token. Please login again.' });
  }
}

module.exports = { requireAdmin };
