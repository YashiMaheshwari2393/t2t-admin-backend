require('dotenv').config();
const express = require('express');
const cors = require('cors');

for (const k of ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_INVITE_CODE']) {
  if (!process.env[k]) { console.error(`${k} must be set in environment.`); process.exit(1); }
}
const { initDb } = require('./db');

const app = express();
const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json());

app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'T2T admin backend' }));
app.use('/api/admin/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

const PORT = process.env.PORT || 5000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`T2T admin backend running on port ${PORT}`)))
  .catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
