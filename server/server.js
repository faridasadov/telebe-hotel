const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { execFile } = require('child_process');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'scrypt:studentstayadmin2026:e2317b3a2defe0838e88b596d759eb64788da1dce757d46b4f282dbadada0a8812a7120b68a9f3560b91288c906d32b8c1145c54a486c9bddf7ef3cdc5498209';
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'farid';
const SUPERADMIN_PASSWORD_HASH = process.env.SUPERADMIN_PASSWORD_HASH || ADMIN_PASSWORD_HASH;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@studentstay.az';
const COOKIE_NAME = 'studentstay_admin';
const SUPER_COOKIE_NAME = 'studentstay_superadmin';
const PROVIDER_COOKIE_NAME = 'studentstay_provider';
const STUDENT_COOKIE_NAME = 'studentstay_student';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const LISTING_UPLOAD_DIR = path.join(UPLOAD_DIR, 'listings');
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_SESSION_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();
const publicPostAttempts = new Map();
const adminSessions = new Map();
const superAdminSessions = new Map();

const PUBLIC_POST_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_POST_MAX = 20;

function isPublicPostLimited(req) {
  const now = Date.now();
  const key = getRateKey(req);
  const entry = publicPostAttempts.get(key) || { count: 0, resetAt: now + PUBLIC_POST_WINDOW_MS };
  if (entry.resetAt <= now) {
    publicPostAttempts.set(key, { count: 1, resetAt: now + PUBLIC_POST_WINDOW_MS });
    return false;
  }
  if (entry.count >= PUBLIC_POST_MAX) return true;
  entry.count += 1;
  publicPostAttempts.set(key, entry);
  return false;
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LISTING_UPLOAD_DIR, { recursive: true });

const corsOrigin = process.env.CORS_ORIGIN || false;
app.use(cors({ origin: corsOrigin, credentials: Boolean(corsOrigin) }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (['/admin.html', '/assets/admin.js', '/assets/admin-panel.js'].includes(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
  next();
});
app.use(bodyParser.json({ limit: '12mb' }));
app.get('/admin-login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});
const NO_CACHE_FILES = new Set(['admin.html', 'admin-panel.js', 'admin.js', 'superadmin.html', 'superadmin.js', 'moderator.html', 'moderator.js']);
app.use(express.static(path.join(__dirname, '..'), {
  maxAge: '5m',
  setHeaders(res, filePath) {
    const base = require('path').basename(filePath);
    if (NO_CACHE_FILES.has(base)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  },
}));

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    return acc;
  }, {});
}

function createAdminSession(user, role = 'moderator', orgId = null, orgName = null) {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { user: user || ADMIN_USER, role, organization_id: orgId, organization_name: orgName, expiresAt: Date.now() + ADMIN_SESSION_MS });
  return token;
}

function createSuperAdminSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  superAdminSessions.set(token, { user: user || SUPERADMIN_USER, role: 'superadmin', expiresAt: Date.now() + ADMIN_SESSION_MS });
  return token;
}

function setAdminCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_MS / 1000)}`);
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function setSuperAdminCookie(res, token) {
  res.setHeader('Set-Cookie', `${SUPER_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_MS / 1000)}`);
}

function clearSuperAdminCookie(res) {
  res.setHeader('Set-Cookie', `${SUPER_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function setProviderCookie(res, token) {
  res.setHeader('Set-Cookie', `${PROVIDER_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
}

function clearProviderCookie(res) {
  res.setHeader('Set-Cookie', `${PROVIDER_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function setStudentCookie(res, token) {
  res.setHeader('Set-Cookie', `${STUDENT_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
}

function clearStudentCookie(res) {
  res.setHeader('Set-Cookie', `${STUDENT_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const cookieToken = parseCookies(req)[COOKIE_NAME] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken;
  const session = token ? adminSessions.get(token) : null;
  if (session && session.expiresAt > Date.now()) {
    session.expiresAt = Date.now() + ADMIN_SESSION_MS;
    req.admin = {
      user: session.user,
      role: session.role || 'moderator',
      organization_id: session.organization_id || null,
      organization_name: session.organization_name || null,
      token,
    };
    return next();
  }
  if (token) adminSessions.delete(token);
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireSuperAdmin(req, res, next) {
  if (!req.admin || req.admin.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin icazəsi lazımdır' });
  next();
}

function requireOrgAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Unauthorized' });
  if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Bu əməliyyat yalnız org admin üçündür' });
  if (!req.admin.organization_id) return res.status(403).json({ error: 'Orqanizasiya təyin edilməyib' });
  next();
}

function requireNotModerator(req, res, next) {
  if (req.admin && req.admin.role === 'moderator') {
    return res.status(403).json({ error: 'Bu əməliyyat moderator üçün məhdudlaşdırılıb' });
  }
  next();
}

function requireSuperAdminAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const cookieToken = parseCookies(req)[SUPER_COOKIE_NAME] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken;
  const session = token ? superAdminSessions.get(token) : null;
  if (session && session.expiresAt > Date.now()) {
    session.expiresAt = Date.now() + ADMIN_SESSION_MS;
    req.superadmin = { user: session.user, role: 'superadmin', token };
    return next();
  }
  if (token) superAdminSessions.delete(token);
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireProvider(req, res, next) {
  const token = parseCookies(req)[PROVIDER_COOKIE_NAME] || '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  db.get("SELECT id, full_name, provider_type, company_name, phone, email, status FROM providers WHERE session_token = ? AND status = 'Approved'", [token], (err, provider) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!provider) return res.status(401).json({ error: 'Unauthorized' });
    req.provider = provider;
    next();
  });
}

function requireStudent(req, res, next) {
  const token = parseCookies(req)[STUDENT_COOKIE_NAME] || '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  db.get("SELECT id, full_name, phone, email, university, status, admin_note FROM students WHERE session_token = ?", [token], (err, student) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!student) return res.status(401).json({ error: 'Unauthorized' });
    req.student = student;
    next();
  });
}

function verifyPassword(password, encodedHash, cb) {
  const [scheme, salt, expected] = String(encodedHash || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return cb(false);
  crypto.scrypt(String(password || ''), salt, 64, (err, key) => {
    if (err) return cb(false);
    const actual = Buffer.from(key.toString('hex'), 'hex');
    const target = Buffer.from(expected, 'hex');
    cb(actual.length === target.length && crypto.timingSafeEqual(actual, target));
  });
}

function hashPassword(password, cb) {
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(String(password || ''), salt, 64, (err, key) => {
    if (err) return cb(err);
    cb(null, `scrypt:${salt}:${key.toString('hex')}`);
  });
}

function getRateKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isLoginLimited(req) {
  const now = Date.now();
  const key = getRateKey(req);
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (entry.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(req) {
  const now = Date.now();
  const key = getRateKey(req);
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

function clearLoginFailures(req) {
  loginAttempts.delete(getRateKey(req));
}

function safeFileName(name) {
  const ext = path.extname(String(name || '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext || '.bin'}`;
}

function saveDocument(doc) {
  if (!doc || !doc.data) return {};
  const buffer = Buffer.from(String(doc.data), 'base64');
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    const err = new Error('Sənəd ölçüsü maksimum 8 MB ola bilər');
    err.statusCode = 400;
    throw err;
  }
  const storedName = safeFileName(doc.name);
  const relativePath = path.join('uploads', storedName);
  fs.writeFileSync(path.join(__dirname, relativePath), buffer, { mode: 0o600 });
  return {
    document_name: String(doc.name || storedName).slice(0, 180),
    document_type: String(doc.type || 'application/octet-stream').slice(0, 120),
    document_path: relativePath,
  };
}

function saveListingImage(image) {
  if (!image || !image.data) return null;
  const type = String(image.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    const err = new Error('Şəkil yalnız JPG, PNG və ya WEBP ola bilər');
    err.statusCode = 400;
    throw err;
  }
  const buffer = Buffer.from(String(image.data), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error('Hər şəkil maksimum 5 MB ola bilər');
    err.statusCode = 400;
    throw err;
  }
  const storedName = safeFileName(image.name);
  fs.writeFileSync(path.join(LISTING_UPLOAD_DIR, storedName), buffer, { mode: 0o644 });
  return `/server/uploads/listings/${storedName}`;
}

function mergeListingImages(payload) {
  const urls = toList(payload.images);
  const uploaded = Array.isArray(payload.image_uploads) ? payload.image_uploads.map(saveListingImage).filter(Boolean) : [];
  return [...urls, ...uploaded];
}

function logAudit(actor, action, entityType, entityId, details) {
  db.run(
    `INSERT INTO audit_logs (actor, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`,
    [actor || 'admin', action, entityType || '', entityId || null, details ? JSON.stringify(details) : ''],
    () => {}
  );
}

function getSettings(cb) {
  db.all("SELECT key, value FROM app_settings", [], (err, rows) => {
    if (err) return cb(err);
    const settings = {};
    (rows || []).forEach((row) => { settings[row.key] = row.value || ''; });
    cb(null, settings);
  });
}

function settingValue(settings, key, fallback) {
  const value = settings && Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : '';
  return value === '' || value === null || value === undefined ? fallback : value;
}

function bookingExpiryDays(settings) {
  const parsed = parseInt(settingValue(settings, 'booking_expiry_days', process.env.BOOKING_EXPIRY_DAYS || '3'), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(parsed, 14);
}

function expireOldBookings(cb = () => {}) {
  getSettings((settingsErr, settings) => {
    if (settingsErr) return cb(settingsErr);
    const days = bookingExpiryDays(settings);
    db.run(
      "UPDATE bookings SET expires_at = datetime(created_at, ?) WHERE status = 'Pending' AND expires_at IS NULL",
      [`+${days} days`],
      (backfillErr) => {
        if (backfillErr) return cb(backfillErr);
        db.run(
          "UPDATE bookings SET status = 'Expired', updated_at = CURRENT_TIMESTAMP WHERE status = 'Pending' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')",
          function (err) {
            if (!err && this.changes) logAudit('system', 'booking_expired', 'booking', null, { count: this.changes });
            cb(err);
          }
        );
      }
    );
  });
}

function sendMail(to, subject, message) {
  console.log(`${subject} | ${message.replace(/\n/g, ' | ')}`);
  if (!to) return;
  getSettings((settingsErr, settings) => {
    const host = settingValue(settings || {}, 'smtp_host', SMTP_HOST);
    const port = parseInt(settingValue(settings || {}, 'smtp_port', String(SMTP_PORT)), 10) || 587;
    const user = settingValue(settings || {}, 'smtp_user', SMTP_USER);
    const pass = settingValue(settings || {}, 'smtp_pass', SMTP_PASS);
    const from = settingValue(settings || {}, 'smtp_from', SMTP_FROM);
    if (!settingsErr && host) {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      transport.sendMail({ from, to, subject, text: message }).catch((err) => {
        console.error('SMTP mail failed:', err.message);
      });
      return;
    }
    if (!fs.existsSync('/usr/sbin/sendmail')) return;
    const body = `To: ${to}\nSubject: ${subject}\n\n${message}`;
    const child = execFile('/usr/sbin/sendmail', ['-t'], () => {});
    child.stdin.end(body);
  });
}

function notifyAdmin(subject, message) {
  getSettings((err, settings) => {
    const email = err ? ADMIN_NOTIFY_EMAIL : settingValue(settings, 'admin_notify_email', ADMIN_NOTIFY_EMAIL);
    if (email) sendMail(email, subject, message);
  });
}

function notifyNewBooking(booking) {
  const message = `New StudentStay booking\nTracking: ${booking.trackingCode || '-'}\nName: ${booking.fullName}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nUniversity: ${booking.university}\nPlace ID: ${booking.placeId || '-'}\n`;
  notifyAdmin('New StudentStay booking', message);
  sendMail(booking.email, 'StudentStay rezervasiya müraciəti qəbul edildi', `Müraciətiniz qəbul edildi.\nTracking ID: ${booking.trackingCode || '-'}\nStatusu saytda "Mənim rezervasiyamı yoxla" bölməsindən izləyə bilərsiniz.\nRazılaşma müddəti: ${booking.expiresAt || '-'} tarixinə qədər.`);
  if (!booking.placeId) return;
  db.get(`SELECT pr.email, pr.full_name, pl.name
          FROM places pl
          JOIN providers pr ON pr.id = pl.provider_id
          WHERE pl.id = ?`, [booking.placeId], (err, row) => {
    if (!err && row && row.email) {
      sendMail(row.email, 'StudentStay yeni rezervasiya sorğusu', `Salam ${row.full_name || ''},\n"${row.name}" elanı üçün rezervasiya istəyən var.\nAd: ${booking.fullName}\nTelefon: ${booking.phone}\nEmail: ${booking.email}\nTracking ID: ${booking.trackingCode || '-'}\nRazılaşma müddəti: ${booking.expiresAt || '-'}`);
    }
  });
}

function trackingCode() {
  return `SS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function removeStoredDocument(relativePath) {
  if (!relativePath) return;
  const fullPath = path.resolve(__dirname, relativePath);
  if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) return;
  fs.rm(fullPath, { force: true }, () => {});
}

function toList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  return String(value || '').split('\n').map((x) => x.trim()).filter(Boolean);
}

function parseUniversities(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split('\n').map((line) => {
    const [code, name, distance] = line.split('|').map((x) => (x || '').trim());
    if (!code) return null;
    return { code, name: name || code, distance_min: parseInt(distance, 10) || 0 };
  }).filter(Boolean);
}

function normalizePlacePayload(p) {
  const femaleFree = parseInt(p.female_free, 10) || 0;
  const maleFree = parseInt(p.male_free, 10) || 0;
  return {
    name: String(p.name || '').trim(),
    type: p.type || 'hostel',
    city: p.city || 'baku',
    gender: p.gender || 'mixed',
    price: parseInt(p.price, 10) || 0,
    total_spots: parseInt(p.total_spots, 10) || 0,
    free_spots: femaleFree + maleFree,
    female_occupied: parseInt(p.female_occupied, 10) || 0,
    male_occupied: parseInt(p.male_occupied, 10) || 0,
    female_free: femaleFree,
    male_free: maleFree,
    wifi: p.wifi ? 1 : 0,
    utilities: p.utilities ? 1 : 0,
    lat: Number.parseFloat(p.lat) || 40.4,
    lng: Number.parseFloat(p.lng) || 49.8,
    images: Array.isArray(p.images) ? p.images : toList(p.images),
    virtual_tour: String(p.virtual_tour || '').trim(),
    description: p.description || '',
    address: p.address || '',
    amenities: toList(p.amenities),
    universities: parseUniversities(p.universities),
    room_count: parseInt(p.room_count, 10) || 1,
    metro_distance_min: parseInt(p.metro_distance_min, 10) || 0,
    min_contract_months: parseInt(p.min_contract_months, 10) || 1,
  };
}

function insertPlace(p, providerId, cb) {
  const sql = `INSERT INTO places
    (name, type, city, gender, price, total_spots, free_spots, female_occupied, male_occupied, female_free, male_free, wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities, provider_id, room_count, metro_distance_min, min_contract_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng,
    JSON.stringify(p.images), p.virtual_tour, p.description, p.address,
    JSON.stringify(p.amenities), JSON.stringify(p.universities), providerId || null,
    p.room_count, p.metro_distance_min, p.min_contract_months
  ];
  db.run(sql, params, cb);
}

function updatePlaceRecord(id, p, cb) {
  const sql = `UPDATE places SET
    name=?, type=?, city=?, gender=?, price=?, total_spots=?, free_spots=?,
    female_occupied=?, male_occupied=?, female_free=?, male_free=?,
    wifi=?, utilities=?, lat=?, lng=?, images=?, virtual_tour=?, description=?, address=?, amenities=?, universities=?,
    room_count=?, metro_distance_min=?, min_contract_months=?
    WHERE id=?`;
  const params = [
    p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng, JSON.stringify(p.images), p.virtual_tour,
    p.description, p.address, JSON.stringify(p.amenities), JSON.stringify(p.universities),
    p.room_count, p.metro_distance_min, p.min_contract_months, id
  ];
  db.run(sql, params, cb);
}

function insertProviderListing(providerId, p, cb) {
  const sql = `INSERT INTO provider_listings
    (provider_id, name, type, city, gender, price, total_spots, free_spots, female_occupied, male_occupied, female_free, male_free, wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities, room_count, metro_distance_min, min_contract_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    providerId, p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng, JSON.stringify(p.images), p.virtual_tour,
    p.description, p.address, JSON.stringify(p.amenities), JSON.stringify(p.universities),
    p.room_count, p.metro_distance_min, p.min_contract_months
  ];
  db.run(sql, params, cb);
}

// Parse JSON columns into objects when returning rows
function expandPlace(row) {
  if (!row) return row;
  try { row.images = JSON.parse(row.images || "[]"); } catch { row.images = []; }
  try { row.amenities = JSON.parse(row.amenities || "[]"); } catch { row.amenities = []; }
  try { row.universities = JSON.parse(row.universities || "[]"); } catch { row.universities = []; }
  return row;
}

app.post('/api/admin/login', (req, res) => {
  if (isLoginLimited(req)) return res.status(429).json({ error: 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' });
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim();
  const finishLogin = (user, role, orgId = null, orgName = null) => {
    clearLoginFailures(req);
    const token = createAdminSession(user, role, orgId, orgName);
    setAdminCookie(res, token);
    logAudit(user, 'admin_login', 'admin', null, { ip: getRateKey(req), role });
    res.json({ user, role, organization_id: orgId, organization_name: orgName, expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000) });
  };
  db.get(`SELECT au.*, o.name as org_name, o.status as org_status FROM admin_users au LEFT JOIN organizations o ON o.id = au.organization_id WHERE au.username = ? AND au.active = 1`, [normalizedUsername], (err, adminUser) => {
    if (err) return res.status(500).json({ error: err.message });
    if (adminUser) {
      return verifyPassword(password, adminUser.password_hash, (ok) => {
        if (!ok) {
          recordLoginFailure(req);
          return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
        }
        if (adminUser.organization_id && adminUser.org_status && adminUser.org_status !== 'Active') {
          return res.status(403).json({ error: 'Orqanizasiya aktiv deyil. Superadmin ilə əlaqə saxlayın.' });
        }
        finishLogin(adminUser.username, adminUser.role || 'moderator', adminUser.organization_id || null, adminUser.org_name || null);
      });
    }
    if (normalizedUsername !== ADMIN_USER) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
    }
    verifyPassword(password, ADMIN_PASSWORD_HASH, (ok) => {
      if (!ok) {
        recordLoginFailure(req);
        return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
      }
      finishLogin(ADMIN_USER, 'moderator');
    });
  });
});

app.post('/api/superadmin/login', (req, res) => {
  if (isLoginLimited(req)) return res.status(429).json({ error: 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' });
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim();
  const finishLogin = (user) => {
    clearLoginFailures(req);
    const token = createSuperAdminSession(user);
    setSuperAdminCookie(res, token);
    logAudit(user, 'superadmin_login', 'superadmin', null, { ip: getRateKey(req) });
    res.json({ user, role: 'superadmin', expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000) });
  };
  db.get("SELECT * FROM admin_users WHERE username = ? AND role = 'superadmin' AND active = 1", [normalizedUsername], (err, adminUser) => {
    if (err) return res.status(500).json({ error: err.message });
    if (adminUser) {
      return verifyPassword(password, adminUser.password_hash, (ok) => {
        if (!ok && normalizedUsername === SUPERADMIN_USER) {
          return verifyPassword(password, SUPERADMIN_PASSWORD_HASH, (fallbackOk) => {
            if (!fallbackOk) {
              recordLoginFailure(req);
              return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
            }
            finishLogin(adminUser.username);
          });
        }
        if (!ok) {
          recordLoginFailure(req);
          return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
        }
        finishLogin(adminUser.username);
      });
    }
    if (normalizedUsername !== SUPERADMIN_USER) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
    }
    verifyPassword(password, SUPERADMIN_PASSWORD_HASH, (ok) => {
      if (!ok) {
        recordLoginFailure(req);
        return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
      }
      finishLogin(SUPERADMIN_USER);
    });
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  if (req.admin && req.admin.token) adminSessions.delete(req.admin.token);
  logAudit(req.admin && req.admin.user, 'admin_logout', 'admin', null, {});
  clearAdminCookie(res);
  res.json({ success: true });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({
    user: req.admin.user,
    role: req.admin.role,
    organization_id: req.admin.organization_id,
    organization_name: req.admin.organization_name,
    expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000),
  });
});

app.post('/api/superadmin/logout', requireSuperAdminAuth, (req, res) => {
  if (req.superadmin && req.superadmin.token) superAdminSessions.delete(req.superadmin.token);
  logAudit(req.superadmin && req.superadmin.user, 'superadmin_logout', 'superadmin', null, {});
  clearSuperAdminCookie(res);
  res.json({ success: true });
});

app.get('/api/superadmin/session', requireSuperAdminAuth, (req, res) => {
  res.json({ user: req.superadmin.user, role: 'superadmin', expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000) });
});

app.get('/api/admin/users', requireAdmin, requireSuperAdmin, (req, res) => {
  db.all("SELECT id, username, full_name, role, active, created_at, updated_at FROM admin_users ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/admin/users', requireAdmin, requireSuperAdmin, (req, res) => {
  const { username, fullName, role, password } = req.body || {};
  if (!username || !password || String(password).length < 8) return res.status(400).json({ error: 'Username və minimum 8 simvolluq parol zəruridir' });
  const safeRole = ['superadmin', 'moderator', 'support'].includes(role) ? role : 'moderator';
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: 'Şifrə hazırlanmadı' });
    db.run(
      "INSERT INTO admin_users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)",
      [String(username).trim(), String(fullName || '').trim(), safeRole, passwordHash],
      function (err) {
        if (err) {
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu admin artıq var' });
          return res.status(500).json({ error: err.message });
        }
        logAudit(req.admin.user, 'admin_user_created', 'admin_user', this.lastID, { username, role: safeRole });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.put('/api/admin/users/:id', requireAdmin, requireSuperAdmin, (req, res) => {
  const role = ['superadmin', 'moderator', 'support'].includes(req.body && req.body.role) ? req.body.role : 'moderator';
  const active = req.body && req.body.active === false ? 0 : 1;
  db.run("UPDATE admin_users SET role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [role, active, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'admin_user_updated', 'admin_user', req.params.id, { role, active });
    res.json({ success: true });
  });
});

app.get('/api/admin/settings', requireAdmin, requireSuperAdmin, (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      booking_expiry_days: settingValue(settings, 'booking_expiry_days', process.env.BOOKING_EXPIRY_DAYS || '3'),
      admin_notify_email: settingValue(settings, 'admin_notify_email', ADMIN_NOTIFY_EMAIL),
      smtp_host: settingValue(settings, 'smtp_host', SMTP_HOST),
      smtp_port: settingValue(settings, 'smtp_port', String(SMTP_PORT)),
      smtp_user: settingValue(settings, 'smtp_user', SMTP_USER),
      smtp_from: settingValue(settings, 'smtp_from', SMTP_FROM),
      smtp_pass_configured: Boolean(settingValue(settings, 'smtp_pass', SMTP_PASS)),
    });
  });
});

app.put('/api/admin/settings', requireAdmin, requireSuperAdmin, (req, res) => {
  const body = req.body || {};
  const updates = {
    booking_expiry_days: String(Math.min(Math.max(parseInt(body.booking_expiry_days, 10) || 3, 1), 14)),
    admin_notify_email: String(body.admin_notify_email || '').trim(),
    smtp_host: String(body.smtp_host || '').trim(),
    smtp_port: String(parseInt(body.smtp_port, 10) || 587),
    smtp_user: String(body.smtp_user || '').trim(),
    smtp_from: String(body.smtp_from || '').trim(),
  };
  if (Object.prototype.hasOwnProperty.call(body, 'smtp_pass') && String(body.smtp_pass || '').trim()) {
    updates.smtp_pass = String(body.smtp_pass).trim();
  }
  const entries = Object.entries(updates);
  db.serialize(() => {
    const stmt = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP");
    entries.forEach(([key, value]) => stmt.run(key, value));
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, 'settings_updated', 'app_settings', null, { keys: entries.map(([key]) => key) });
      res.json({ success: true });
    });
  });
});

app.get('/api/superadmin/users', requireSuperAdminAuth, (req, res) => {
  db.all("SELECT id, username, full_name, role, active, created_at, updated_at FROM admin_users ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/superadmin/users', requireSuperAdminAuth, (req, res) => {
  const { username, fullName, role, password } = req.body || {};
  if (!username || !password || String(password).length < 8) return res.status(400).json({ error: 'Username və minimum 8 simvolluq parol zəruridir' });
  const safeRole = ['superadmin', 'moderator', 'support'].includes(role) ? role : 'moderator';
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: 'Şifrə hazırlanmadı' });
    db.run(
      "INSERT INTO admin_users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)",
      [String(username).trim(), String(fullName || '').trim(), safeRole, passwordHash],
      function (err) {
        if (err) {
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu admin artıq var' });
          return res.status(500).json({ error: err.message });
        }
        logAudit(req.superadmin.user, 'admin_user_created', 'admin_user', this.lastID, { username, role: safeRole });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.put('/api/superadmin/users/:id', requireSuperAdminAuth, (req, res) => {
  const role = ['superadmin', 'moderator', 'support'].includes(req.body && req.body.role) ? req.body.role : 'moderator';
  const active = req.body && req.body.active === false ? 0 : 1;
  db.run("UPDATE admin_users SET role = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [role, active, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.superadmin.user, 'admin_user_updated', 'admin_user', req.params.id, { role, active });
    res.json({ success: true });
  });
});

app.get('/api/superadmin/settings', requireSuperAdminAuth, (req, res) => {
  getSettings((err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      booking_expiry_days: settingValue(settings, 'booking_expiry_days', process.env.BOOKING_EXPIRY_DAYS || '3'),
      admin_notify_email: settingValue(settings, 'admin_notify_email', ADMIN_NOTIFY_EMAIL),
      smtp_host: settingValue(settings, 'smtp_host', SMTP_HOST),
      smtp_port: settingValue(settings, 'smtp_port', String(SMTP_PORT)),
      smtp_user: settingValue(settings, 'smtp_user', SMTP_USER),
      smtp_from: settingValue(settings, 'smtp_from', SMTP_FROM),
      smtp_pass_configured: Boolean(settingValue(settings, 'smtp_pass', SMTP_PASS)),
    });
  });
});

app.put('/api/superadmin/settings', requireSuperAdminAuth, (req, res) => {
  const body = req.body || {};
  const updates = {
    booking_expiry_days: String(Math.min(Math.max(parseInt(body.booking_expiry_days, 10) || 3, 1), 14)),
    admin_notify_email: String(body.admin_notify_email || '').trim(),
    smtp_host: String(body.smtp_host || '').trim(),
    smtp_port: String(parseInt(body.smtp_port, 10) || 587),
    smtp_user: String(body.smtp_user || '').trim(),
    smtp_from: String(body.smtp_from || '').trim(),
  };
  if (Object.prototype.hasOwnProperty.call(body, 'smtp_pass') && String(body.smtp_pass || '').trim()) {
    updates.smtp_pass = String(body.smtp_pass).trim();
  }
  const entries = Object.entries(updates);
  db.serialize(() => {
    const stmt = db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP");
    entries.forEach(([key, value]) => stmt.run(key, value));
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, 'settings_updated', 'app_settings', null, { keys: entries.map(([key]) => key) });
      res.json({ success: true });
    });
  });
});

app.get('/api/superadmin/providers', requireSuperAdminAuth, (req, res) => {
  db.all("SELECT id, full_name, provider_type, company_name, phone, email, status, admin_note, created_at, updated_at FROM providers ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/superadmin/providers/:id/status', requireSuperAdminAuth, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.run(
    "UPDATE providers SET status = ?, admin_note = ?, session_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [status, note, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, `provider_${status.toLowerCase()}`, 'provider', req.params.id, { note });
      res.json({ success: true });
    }
  );
});

app.get('/api/superadmin/students', requireSuperAdminAuth, (req, res) => {
  db.all("SELECT id, full_name, phone, email, university, status, admin_note, document_name, created_at, updated_at FROM students ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/superadmin/students/:id/status', requireSuperAdminAuth, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.run(
    "UPDATE students SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [status, note, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, `student_${status.toLowerCase()}`, 'student', req.params.id, { note });
      res.json({ success: true });
    }
  );
});

// ---- Provider registration / login ----
app.post('/api/providers/register', (req, res) => {
  const { fullName, providerType, companyName, phone, email, password, document, city, voen } = req.body || {};
  if (!fullName || !phone || !email || !password || String(password).length < 8 || !document || !document.data) {
    return res.status(400).json({ error: 'Ad, telefon, e-poçt, minimum 8 simvolluq şifrə və şəxsiyyət sənədi zəruridir' });
  }
  const VALID_TYPES = ['owner', 'agency', 'university_dorm', 'hostel'];
  const safeType = VALID_TYPES.includes(providerType) ? providerType : 'owner';
  const needsVoen = ['agency', 'university_dorm', 'hostel'].includes(safeType);
  if (needsVoen && !String(voen || '').trim()) {
    return res.status(400).json({ error: 'Bu hesab tipi üçün VÖEN tələb olunur' });
  }
  let doc = {};
  try {
    doc = saveDocument(document);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: 'Şifrə hazırlanmadı' });
    db.run(
      `INSERT INTO providers (full_name, provider_type, company_name, phone, email, password_hash, id_document_name, id_document_type, id_document_path, city, voen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(fullName).trim(),
        safeType,
        String(companyName || '').trim(),
        String(phone).trim(),
        String(email).trim().toLowerCase(),
        passwordHash,
        doc.document_name || null,
        doc.document_type || null,
        doc.document_path || null,
        String(city || '').trim() || null,
        String(voen || '').trim() || null,
      ],
      function (err) {
        if (err) {
          removeStoredDocument(doc.document_path);
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu e-poçt artıq qeydiyyatdan keçib' });
          return res.status(500).json({ error: err.message });
        }
        notifyAdmin('StudentStay provider verification', `New provider registration\nName: ${fullName}\nEmail: ${email}\nPhone: ${phone}`);
        res.json({ id: this.lastID, status: 'Pending' });
      }
    );
  });
});

app.post('/api/providers/login', (req, res) => {
  const { email, password } = req.body || {};
  db.get("SELECT * FROM providers WHERE email = ?", [String(email || '').trim().toLowerCase()], (err, provider) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!provider) return res.status(401).json({ error: 'Yanlış e-poçt və ya şifrə' });
    if (provider.status !== 'Approved') return res.status(403).json({ error: 'Hesab admin təsdiqindən sonra aktiv olacaq' });
    verifyPassword(password, provider.password_hash, (ok) => {
      if (!ok) return res.status(401).json({ error: 'Yanlış e-poçt və ya şifrə' });
      const token = crypto.randomBytes(32).toString('hex');
      db.run("UPDATE providers SET session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [token, provider.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        setProviderCookie(res, token);
        res.json({ id: provider.id, name: provider.full_name, email: provider.email });
      });
    });
  });
});

app.post('/api/providers/logout', requireProvider, (req, res) => {
  db.run("UPDATE providers SET session_token = NULL WHERE id = ?", [req.provider.id], () => {});
  clearProviderCookie(res);
  res.json({ success: true });
});

app.get('/api/providers/session', requireProvider, (req, res) => {
  res.json({ provider: req.provider });
});

// ---- Student registration / login ----
app.post('/api/students/register', (req, res) => {
  const { fullName, phone, email, university, password, document } = req.body || {};
  if (!fullName || !email || !university || !password || String(password).length < 8 || !document || !document.data) {
    return res.status(400).json({ error: 'Ad, e-poçt, universitet, tələbə sənədi və minimum 8 simvolluq şifrə zəruridir' });
  }
  let doc = {};
  try {
    doc = saveDocument(document);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: 'Şifrə hazırlanmadı' });
    db.run(
      `INSERT INTO students (full_name, phone, email, university, password_hash, document_name, document_type, document_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(fullName).trim(),
        String(phone || '').trim(),
        String(email).trim().toLowerCase(),
        String(university).trim(),
        passwordHash,
        doc.document_name || null,
        doc.document_type || null,
        doc.document_path || null,
      ],
      function (err) {
        if (err) {
          removeStoredDocument(doc.document_path);
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu e-poçt artıq qeydiyyatdan keçib' });
          return res.status(500).json({ error: err.message });
        }
        logAudit(String(email).trim().toLowerCase(), 'student_registered', 'student', this.lastID, { university });
        notifyAdmin('StudentStay student verification', `New student registration\nName: ${fullName}\nEmail: ${email}\nUniversity: ${university}`);
        res.json({ id: this.lastID, status: 'Pending' });
      }
    );
  });
});

app.post('/api/students/login', (req, res) => {
  const { email, password } = req.body || {};
  db.get("SELECT * FROM students WHERE email = ?", [String(email || '').trim().toLowerCase()], (err, student) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!student) return res.status(401).json({ error: 'Yanlış e-poçt və ya şifrə' });
    verifyPassword(password, student.password_hash, (ok) => {
      if (!ok) return res.status(401).json({ error: 'Yanlış e-poçt və ya şifrə' });
      const token = crypto.randomBytes(32).toString('hex');
      db.run("UPDATE students SET session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [token, student.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        setStudentCookie(res, token);
        res.json({ id: student.id, name: student.full_name, email: student.email });
      });
    });
  });
});

// Forgot password — student
app.post('/api/students/forgot-password', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'E-poçt daxil edin' });
  db.get("SELECT id, full_name, email FROM students WHERE email = ?", [email], (err, student) => {
    if (err) return res.status(500).json({ error: err.message });
    // Always respond OK to prevent email enumeration
    if (!student) return res.json({ ok: true });
    const resetToken = crypto.randomBytes(24).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    db.run("UPDATE students SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
      [resetToken, expiry, student.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        const resetLink = `${req.headers.origin || 'http://localhost:4000'}/student.html?reset=${resetToken}`;
        sendMail(student.email, 'StudentStay — Şifrə sıfırlama',
          `Salam ${student.full_name || ''},\n\nŞifrənizi sıfırlamaq üçün bu linkə keçin:\n${resetLink}\n\nLink 1 saat ərzində etibarlıdır.\n\nBu sorğunu siz etməmisinizsə, bu məktubu nəzərə almayın.`);
        res.json({ ok: true });
      });
  });
});

// Reset password — student
app.post('/api/students/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 6)
    return res.status(400).json({ error: 'Token və ya şifrə düzgün deyil (min 6 simvol)' });
  db.get("SELECT id FROM students WHERE reset_token = ? AND reset_token_expires > ?",
    [String(token), new Date().toISOString()], (err, student) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!student) return res.status(400).json({ error: 'Token etibarsız və ya müddəti bitib' });
      hashPassword(String(password), (hashErr, hash) => {
        if (hashErr) return res.status(500).json({ error: hashErr.message });
        db.run("UPDATE students SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
          [hash, student.id], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ ok: true });
          });
      });
    });
});

// Forgot password — provider
app.post('/api/providers/forgot-password', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'E-poçt daxil edin' });
  db.get("SELECT id, full_name, email FROM providers WHERE email = ?", [email], (err, provider) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!provider) return res.json({ ok: true });
    const resetToken = crypto.randomBytes(24).toString('hex');
    const expiry = new Date(Date.now() + 3600000).toISOString();
    db.run("UPDATE providers SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
      [resetToken, expiry, provider.id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        const resetLink = `${req.headers.origin || 'http://localhost:4000'}/owner-login.html?reset=${resetToken}`;
        sendMail(provider.email, 'StudentStay — Şifrə sıfırlama',
          `Salam ${provider.full_name || ''},\n\nŞifrənizi sıfırlamaq üçün:\n${resetLink}\n\nLink 1 saat etibarlıdır.`);
        res.json({ ok: true });
      });
  });
});

// Reset password — provider
app.post('/api/providers/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 6)
    return res.status(400).json({ error: 'Token və ya şifrə düzgün deyil' });
  db.get("SELECT id FROM providers WHERE reset_token = ? AND reset_token_expires > ?",
    [String(token), new Date().toISOString()], (err, provider) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!provider) return res.status(400).json({ error: 'Token etibarsız' });
      hashPassword(String(password), (hashErr, hash) => {
        if (hashErr) return res.status(500).json({ error: hashErr.message });
        db.run("UPDATE providers SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
          [hash, provider.id], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            res.json({ ok: true });
          });
      });
    });
});

app.post('/api/students/logout', requireStudent, (req, res) => {
  db.run("UPDATE students SET session_token = NULL WHERE id = ?", [req.student.id], () => {});
  clearStudentCookie(res);
  res.json({ success: true });
});

app.delete('/api/students/account', requireStudent, (req, res) => {
  const studentId = req.student.id;
  const email = req.student.email;
  db.serialize(() => {
    db.run("UPDATE bookings SET status='Cancelled' WHERE lower(email)=lower(?) AND status='Pending'", [email]);
    db.run("UPDATE students SET session_token=NULL, status='Cancelled', email=?, password_hash='DELETED', reset_token=NULL WHERE id=?",
      [`deleted_${Date.now()}_${email}`, studentId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        clearStudentCookie(res);
        logAudit(email, 'student_account_deleted', 'student', studentId, {});
        res.json({ ok: true });
      });
  });
});

// Owner stats endpoint
app.get('/api/providers/stats', requireProvider, (req, res) => {
  db.all(`SELECT b.status, COUNT(*) as count FROM bookings b
          JOIN places p ON p.id = b.place_id
          WHERE p.provider_id = ?
          GROUP BY b.status`, [req.provider.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const stats = { Pending: 0, Approved: 0, Rejected: 0, Expired: 0, Cancelled: 0 };
    (rows || []).forEach(r => { if (stats[r.status] !== undefined) stats[r.status] = r.count; });
    db.all(`SELECT p.name, p.total_spots, p.free_spots, p.rating, p.review_count
            FROM places p WHERE p.provider_id = ?`, [req.provider.id], (err2, places) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const totalSpots = (places || []).reduce((a, p) => a + (p.total_spots || 0), 0);
      const freeSpots = (places || []).reduce((a, p) => a + (p.free_spots || 0), 0);
      const avgRating = places && places.length
        ? (places.reduce((a, p) => a + (p.rating || 0), 0) / places.length).toFixed(1) : 0;
      res.json({ bookings: stats, places: places || [], totalSpots, freeSpots, avgRating });
    });
  });
});

app.get('/api/students/session', requireStudent, (req, res) => {
  res.json({ student: req.student });
});

app.put('/api/students/profile', requireStudent, (req, res) => {
  const fullName = String((req.body && req.body.fullName) || '').trim();
  const phone = String((req.body && req.body.phone) || '').trim();
  const university = String((req.body && req.body.university) || '').trim();
  if (!fullName || !university) return res.status(400).json({ error: 'Ad və universitet zəruridir' });
  db.run(
    "UPDATE students SET full_name = ?, phone = ?, university = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [fullName, phone, university, req.student.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.student.email, 'student_profile_updated', 'student', req.student.id, {});
      res.json({ success: true });
    }
  );
});

app.post('/api/students/document', requireStudent, (req, res) => {
  let doc = {};
  try {
    doc = saveDocument(req.body && req.body.document);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
  if (!doc.document_path) return res.status(400).json({ error: 'Sənəd zəruridir' });
  db.get("SELECT document_path FROM students WHERE id = ?", [req.student.id], (selectErr, row) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    db.run(
      "UPDATE students SET document_name = ?, document_type = ?, document_path = ?, status = 'Pending', admin_note = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [doc.document_name, doc.document_type, doc.document_path, req.student.id],
      function (err) {
        if (err) {
          removeStoredDocument(doc.document_path);
          return res.status(500).json({ error: err.message });
        }
        removeStoredDocument(row && row.document_path);
        logAudit(req.student.email, 'student_document_updated', 'student', req.student.id, {});
        notifyAdmin('StudentStay student document update', `Student updated document\nEmail: ${req.student.email}`);
        res.json({ success: true, status: 'Pending' });
      }
    );
  });
});

app.get('/api/students/bookings', requireStudent, (req, res) => {
  expireOldBookings((expireErr) => {
    if (expireErr) return res.status(500).json({ error: expireErr.message });
    db.all(`SELECT b.id, b.tracking_code, b.full_name, b.email, b.university, b.faculty, b.gender,
            b.move_in, b.duration, b.status, b.note, b.admin_note, b.expires_at, b.created_at, b.updated_at,
            p.name as place_name,
            (SELECT MAX(created_at) FROM conversation_messages
             WHERE booking_id = b.id AND sender_type = 'provider') as last_provider_msg_at,
            (SELECT COUNT(*) FROM conversation_messages
             WHERE booking_id = b.id AND sender_type = 'provider') as provider_msg_count
            FROM bookings b
            LEFT JOIN places p ON p.id = b.place_id
            WHERE lower(b.email) = lower(?)
            ORDER BY b.created_at DESC`, [req.student.email], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.get('/api/bookings/status/:code/messages', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const email = String(req.query.email || '').trim().toLowerCase();
  db.get("SELECT id FROM bookings WHERE upper(tracking_code) = ? AND lower(email) = ?", [code, email], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.all("SELECT * FROM conversation_messages WHERE booking_id = ? ORDER BY created_at ASC", [booking.id], (msgErr, rows) => {
      if (msgErr) return res.status(500).json({ error: msgErr.message });
      res.json(rows || []);
    });
  });
});

app.post('/api/bookings/status/:code/messages', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const message = String((req.body && req.body.message) || '').trim().slice(0, 1000);
  if (!email || message.length < 2) return res.status(400).json({ error: 'E-poçt və mesaj zəruridir' });
  db.get("SELECT id, full_name, place_id FROM bookings WHERE upper(tracking_code) = ? AND lower(email) = ?", [code, email], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.run(
      "INSERT INTO conversation_messages (booking_id, sender_type, sender_name, message) VALUES (?, 'student', ?, ?)",
      [booking.id, booking.full_name, message],
      function (msgErr) {
        if (msgErr) return res.status(500).json({ error: msgErr.message });
        if (booking.place_id) {
          db.get(`SELECT pr.email, pr.full_name, pl.name
                  FROM places pl
                  JOIN providers pr ON pr.id = pl.provider_id
                  WHERE pl.id = ?`, [booking.place_id], (providerErr, row) => {
            if (!providerErr && row && row.email) {
              sendMail(row.email, 'StudentStay rezervasiya mesajı', `Salam ${row.full_name || ''},\n"${row.name}" üzrə tələbədən yeni mesaj:\n${message}`);
            }
          });
        }
        res.json({ id: this.lastID });
      }
    );
  });
});

app.put('/api/students/bookings/:id/cancel', requireStudent, (req, res) => {
  db.get("SELECT * FROM bookings WHERE id = ? AND lower(email) = lower(?)", [req.params.id, req.student.email], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    if (!['Pending', 'Rejected'].includes(booking.status)) return res.status(400).json({ error: 'Bu mərhələdə rezervasiyanı yalnız admin ləğv edə bilər' });
    db.run("UPDATE bookings SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [booking.id], function (updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      logAudit(req.student.email, 'booking_cancelled_by_student', 'booking', booking.id, {});
      res.json({ success: true });
    });
  });
});

app.get('/api/students/bookings/:id/messages', requireStudent, (req, res) => {
  db.get("SELECT id FROM bookings WHERE id = ? AND lower(email) = lower(?)", [req.params.id, req.student.email], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.all("SELECT * FROM conversation_messages WHERE booking_id = ? ORDER BY created_at ASC", [booking.id], (msgErr, rows) => {
      if (msgErr) return res.status(500).json({ error: msgErr.message });
      res.json(rows || []);
    });
  });
});

app.post('/api/students/bookings/:id/messages', requireStudent, (req, res) => {
  const message = String((req.body && req.body.message) || '').trim().slice(0, 1000);
  if (message.length < 2) return res.status(400).json({ error: 'Mesaj boş ola bilməz' });
  db.get("SELECT id FROM bookings WHERE id = ? AND lower(email) = lower(?)", [req.params.id, req.student.email], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.run(
      "INSERT INTO conversation_messages (booking_id, sender_type, sender_name, message) VALUES (?, 'student', ?, ?)",
      [booking.id, req.student.full_name, message],
      function (msgErr) {
        if (msgErr) return res.status(500).json({ error: msgErr.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.get('/api/bookings/status/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  expireOldBookings((expireErr) => {
    if (expireErr) return res.status(500).json({ error: expireErr.message });
    db.get(`SELECT b.tracking_code, b.full_name, b.email, b.university, b.faculty, b.gender,
            b.move_in, b.duration, b.status, b.admin_note, b.expires_at, b.created_at, b.updated_at,
            p.name as place_name
            FROM bookings b
            LEFT JOIN places p ON p.id = b.place_id
            WHERE upper(b.tracking_code) = ?`, [code], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Tracking ID tapılmadı' });
      res.json(row);
    });
  });
});

app.get('/api/providers/listings', requireProvider, (req, res) => {
  db.all("SELECT * FROM provider_listings WHERE provider_id = ? ORDER BY created_at DESC", [req.provider.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

app.get('/api/providers/places', requireProvider, (req, res) => {
  db.all("SELECT * FROM places WHERE provider_id = ? ORDER BY id DESC", [req.provider.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

app.post('/api/providers/listings', requireProvider, (req, res) => {
  const body = { ...(req.body || {}) };
  try {
    body.images = mergeListingImages(body);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
  const p = normalizePlacePayload(body);
  if (!p.name || !p.address || !p.price || !p.total_spots) {
    return res.status(400).json({ error: 'Ad, ünvan, qiymət və yataq sayı zəruridir' });
  }
  if (!p.images || p.images.length < 3) {
    return res.status(400).json({ error: 'Minimum 3 şəkil zəruridir' });
  }
  insertProviderListing(req.provider.id, p, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.provider.email, 'provider_listing_submitted', 'provider_listing', this.lastID, { provider_id: req.provider.id, name: p.name });
    notifyAdmin('StudentStay listing verification', `New listing submitted\nProvider: ${req.provider.email}\nListing: ${p.name}\nCity: ${p.city}`);
    res.json({ id: this.lastID, status: 'Pending' });
  });
});

app.post('/api/providers/places/:id/update-request', requireProvider, (req, res) => {
  db.get("SELECT * FROM places WHERE id = ? AND provider_id = ?", [req.params.id, req.provider.id], (err, place) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!place) return res.status(404).json({ error: 'Obyekt tapılmadı' });
    const base = expandPlace(place);
    const body = { ...base, ...(req.body || {}) };
    try {
      if (req.body && (req.body.images || req.body.image_uploads)) body.images = mergeListingImages(req.body);
    } catch (imageErr) {
      return res.status(imageErr.statusCode || 500).json({ error: imageErr.message });
    }
    const p = normalizePlacePayload(body);
    if (!p.name || !p.address || !p.price || !p.total_spots) {
      return res.status(400).json({ error: 'Ad, ünvan, qiymət və yataq sayı zəruridir' });
    }
    insertProviderListing(req.provider.id, p, function (insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      const requestId = this.lastID;
      db.run("UPDATE provider_listings SET published_place_id = ? WHERE id = ?", [place.id, requestId], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        logAudit(req.provider.email, 'provider_place_update_requested', 'place', place.id, { request_id: requestId });
        notifyAdmin('StudentStay place update request', `Provider requested place update\nProvider: ${req.provider.email}\nPlace: ${place.name}\nPlace ID: ${place.id}`);
        res.json({ id: requestId, status: 'Pending' });
      });
    });
  });
});

app.get('/api/providers/bookings', requireProvider, (req, res) => {
  expireOldBookings((expireErr) => {
    if (expireErr) return res.status(500).json({ error: expireErr.message });
    db.all(`SELECT b.id, b.tracking_code, b.full_name, b.phone, b.email, b.university, b.faculty,
            b.gender, b.move_in, b.duration, b.status, b.note, b.admin_note, b.expires_at, b.created_at, b.updated_at,
            p.name as place_name
            FROM bookings b
            JOIN places p ON p.id = b.place_id
            WHERE p.provider_id = ?
            ORDER BY b.created_at DESC`, [req.provider.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.put('/api/providers/bookings/:id/status', requireProvider, (req, res) => {
  const status = String((req.body && req.body.status) || '');
  if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Yalnız Approved və ya Rejected' });
  db.get(`SELECT b.id, b.email, b.full_name, p.name as place_name
          FROM bookings b JOIN places p ON p.id = b.place_id
          WHERE b.id = ? AND p.provider_id = ? AND b.status = 'Pending'`,
    [req.params.id, req.provider.id], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı və ya artıq emal edilib' });
    db.run("UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, booking.id], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      logAudit(req.provider.email, `booking_${status.toLowerCase()}_by_provider`, 'booking', booking.id, {});
      if (booking.email) {
        const msg = status === 'Approved'
          ? `Salam ${booking.full_name},\n"${booking.place_name}" üzrə rezervasiya müraciətiniz ev sahibi tərəfindən TƏSDİQLƏNDİ.`
          : `Salam ${booking.full_name},\n"${booking.place_name}" üzrə rezervasiya müraciətiniz ev sahibi tərəfindən rədd edildi.`;
        sendMail(booking.email, `StudentStay — rezervasiya ${status === 'Approved' ? 'təsdiqləndi' : 'rədd edildi'}`, msg);
      }
      res.json({ ok: true, status });
    });
  });
});

app.get('/api/providers/bookings/:id/messages', requireProvider, (req, res) => {
  db.get(`SELECT b.id
          FROM bookings b
          JOIN places p ON p.id = b.place_id
          WHERE b.id = ? AND p.provider_id = ?`, [req.params.id, req.provider.id], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.all("SELECT * FROM conversation_messages WHERE booking_id = ? ORDER BY created_at ASC", [booking.id], (msgErr, rows) => {
      if (msgErr) return res.status(500).json({ error: msgErr.message });
      res.json(rows || []);
    });
  });
});

app.post('/api/providers/bookings/:id/messages', requireProvider, (req, res) => {
  const message = String((req.body && req.body.message) || '').trim().slice(0, 1000);
  if (message.length < 2) return res.status(400).json({ error: 'Mesaj boş ola bilməz' });
  db.get(`SELECT b.id, b.email, b.full_name, p.name as place_name
          FROM bookings b
          JOIN places p ON p.id = b.place_id
          WHERE b.id = ? AND p.provider_id = ?`, [req.params.id, req.provider.id], (err, booking) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!booking) return res.status(404).json({ error: 'Rezervasiya tapılmadı' });
    db.run(
      "INSERT INTO conversation_messages (booking_id, sender_type, sender_name, message) VALUES (?, 'provider', ?, ?)",
      [booking.id, req.provider.company_name || req.provider.full_name, message],
      function (msgErr) {
        if (msgErr) return res.status(500).json({ error: msgErr.message });
        sendMail(booking.email, 'StudentStay ev sahibindən cavab', `${booking.place_name || 'Rezervasiya'} üzrə cavab:\n${message}`);
        res.json({ id: this.lastID });
      }
    );
  });
});

// ---- List places ----
app.get('/api/places', (req, res) => {
  const { city, type, gender, minPrice, maxPrice, wifi, utilities, university, rooms, maxMetro, ac, heating, minContract, q } = req.query;
  let query = "SELECT * FROM places WHERE 1=1";
  const params = [];

  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    query += " AND (name LIKE ? OR address LIKE ? OR description LIKE ?)";
    params.push(like, like, like);
  }
  if (city && city !== 'all') { query += " AND city = ?"; params.push(city); }
  if (type && type !== 'all') { query += " AND type = ?"; params.push(type); }
  if (gender && gender !== 'all') { query += " AND gender = ?"; params.push(gender); }
  if (minPrice) { query += " AND price >= ?"; params.push(parseInt(minPrice)); }
  if (maxPrice) { query += " AND price <= ?"; params.push(parseInt(maxPrice)); }
  if (wifi === 'true') query += " AND wifi = 1";
  if (utilities === 'true') query += " AND utilities = 1";
  if (rooms && rooms !== 'all') { query += " AND room_count >= ?"; params.push(parseInt(rooms, 10)); }
  if (maxMetro) { query += " AND metro_distance_min > 0 AND metro_distance_min <= ?"; params.push(parseInt(maxMetro, 10)); }
  if (minContract) { query += " AND min_contract_months <= ?"; params.push(parseInt(minContract, 10)); }
  if (ac === 'true') query += " AND amenities LIKE '%\"ac\"%'";
  if (heating === 'true') query += " AND amenities LIKE '%\"heating\"%'";
  if (university && university !== 'all') {
    query += " AND universities LIKE ?";
    params.push(`%"code":"${university}"%`);
  }

  // Rewrite base query to JOIN providers — eliminates N+1
  const joinedQuery = query.replace(
    /^SELECT \* FROM places/,
    'SELECT places.*, CASE WHEN prov.status = \'Approved\' THEN 1 ELSE 0 END AS verified_owner FROM places LEFT JOIN providers prov ON prov.id = places.provider_id'
  );
  db.all(joinedQuery, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

// ---- Single place + reviews ----
app.get('/api/places/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.get("SELECT * FROM places WHERE id = ?", [id], (err, place) => {
    if (err || !place) return res.status(404).json({ error: 'Not found' });
    db.all("SELECT * FROM reviews WHERE place_id = ? ORDER BY created_at DESC", [id], (err2, reviews) => {
      const out = expandPlace(place);
      out.reviews = reviews || [];
      res.json(out);
    });
  });
});

// ---- Post a review ----
app.post('/api/places/:id/reviews', (req, res) => {
  if (isPublicPostLimited(req)) return res.status(429).json({ error: 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' });
  const placeId = parseInt(req.params.id);
  const { author_name, comment, university } = req.body;
  const rating = parseInt(req.body.rating, 10);

  if (!author_name || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid review' });
  }

  const sql = `INSERT INTO reviews (place_id, author_name, rating, comment, university) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [placeId, author_name, rating, comment, university], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    // Recalculate aggregate
    db.get("SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE place_id = ?", [placeId], (e2, agg) => {
      if (agg) {
        db.run("UPDATE places SET rating = ?, review_count = ? WHERE id = ?",
          [Math.round(agg.avg * 10) / 10, agg.count, placeId]);
      }
      res.json({ id: this.lastID });
    });
  });
});

// ---- Submit booking ----
app.post('/api/bookings', (req, res) => {
  if (isPublicPostLimited(req)) return res.status(429).json({ error: 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' });
  const { fullName, phone, email, university, faculty, gender, moveIn, duration, placeId, note, document } = req.body;
  if (!fullName || !phone || !email || !university || !gender || !moveIn || !duration) {
    return res.status(400).json({ error: 'Zəruri sahələr doldurulmayıb' });
  }
  let doc = {};
  try {
    doc = saveDocument(document);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
  const code = trackingCode();
  getSettings((settingsErr, settings) => {
    if (settingsErr) {
      removeStoredDocument(doc.document_path);
      return res.status(500).json({ error: settingsErr.message });
    }
    const expiryDays = bookingExpiryDays(settings);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const sql = `INSERT INTO bookings
      (full_name, phone, email, university, faculty, gender, move_in, duration, tracking_code, place_id, note, document_name, document_type, document_path, expires_at, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT organization_id FROM places WHERE id=?))`;
    db.run(sql, [
      fullName, phone, email, university, faculty, gender, moveIn, duration, code, placeId || null, note || '',
      doc.document_name || null, doc.document_type || null, doc.document_path || null, expiresAt, placeId || null
    ], function (err) {
      if (err) {
        removeStoredDocument(doc.document_path);
        return res.status(500).json({ error: err.message });
      }
      logAudit(String(email).trim().toLowerCase(), 'booking_submitted', 'booking', this.lastID, { tracking_code: code, place_id: placeId || null, expires_at: expiresAt });
      notifyNewBooking({ fullName, phone, email, university, placeId, trackingCode: code, expiresAt });
      res.json({ message: "Success", id: this.lastID, trackingCode: code, expiresAt });
    });
  });
});

app.post('/api/reports', (req, res) => {
  if (isPublicPostLimited(req)) return res.status(429).json({ error: 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' });
  const { placeId, reporterName, reporterContact, reason } = req.body || {};
  if (!placeId || !reason || String(reason).trim().length < 8) {
    return res.status(400).json({ error: 'Elan və ən azı 8 simvolluq səbəb zəruridir' });
  }
  db.run(
    `INSERT INTO reports (place_id, reporter_name, reporter_contact, reason) VALUES (?, ?, ?, ?)`,
    [parseInt(placeId, 10), String(reporterName || '').slice(0, 120), String(reporterContact || '').slice(0, 160), String(reason).slice(0, 1000)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit('public', 'report_submitted', 'report', this.lastID, { place_id: placeId });
      notifyAdmin('StudentStay report', `Report submitted\nPlace ID: ${placeId}\nReason: ${reason}\nReporter: ${reporterName || '-'} ${reporterContact || ''}`);
      db.get(`SELECT pr.email, pr.full_name, pl.name
              FROM places pl
              JOIN providers pr ON pr.id = pl.provider_id
              WHERE pl.id = ?`, [parseInt(placeId, 10)], (providerErr, row) => {
        if (!providerErr && row && row.email) {
          sendMail(row.email, 'StudentStay elan reportu', `Salam ${row.full_name || ''},\n"${row.name}" elanı üzrə report daxil olub. Admin komandası yoxlayacaq.`);
        }
      });
      res.json({ id: this.lastID, status: 'Pending' });
    }
  );
});

function sendStats(res) {
  const stats = {};
  expireOldBookings((expireErr) => {
    if (expireErr) return res.status(500).json({ error: expireErr.message });
    db.get("SELECT count(*) as count FROM places", (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'DB error' });
    stats.totalPlaces = row.count;
    db.get("SELECT sum(total_spots) as total, sum(free_spots) as free FROM places", (err, row) => {
      if (err || !row) return res.status(500).json({ error: 'DB error' });
      stats.totalSpots = row.total || 0;
      stats.freeSpots = row.free || 0;
      db.get("SELECT count(*) as count FROM bookings WHERE status = 'Pending'", (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        stats.pendingBookings = row.count;
        res.json(stats);
      });
    });
  });
  });
}

// ---- Public/Admin stats ----
app.get('/api/stats', (req, res) => sendStats(res));
app.get('/api/admin/stats', requireAdmin, (req, res) => sendStats(res));

// ---- Admin extended stats (org-scoped when applicable) ----
app.get('/api/admin/stats-extended', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  expireOldBookings(() => {
    if (orgId) {
      db.get(`SELECT
        (SELECT count(*) FROM places WHERE organization_id = ?)                                                        AS totalPlaces,
        (SELECT sum(total_spots) FROM places WHERE organization_id = ?)                                               AS totalSpots,
        (SELECT sum(free_spots) FROM places WHERE organization_id = ?)                                                AS freeSpots,
        (SELECT count(*) FROM bookings b JOIN places p ON p.id=b.place_id WHERE p.organization_id=? AND b.status='Pending')  AS pendingBookings,
        (SELECT count(*) FROM bookings b JOIN places p ON p.id=b.place_id WHERE p.organization_id=?)                 AS totalBookings,
        (SELECT count(*) FROM bookings b JOIN places p ON p.id=b.place_id WHERE p.organization_id=? AND b.status='Approved') AS approvedBookings
      `, [orgId, orgId, orgId, orgId, orgId, orgId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
      });
    } else {
      db.get(`SELECT
        (SELECT count(*) FROM places)           AS totalPlaces,
        (SELECT sum(total_spots) FROM places)   AS totalSpots,
        (SELECT sum(free_spots) FROM places)    AS freeSpots,
        (SELECT count(*) FROM bookings WHERE status='Pending')  AS pendingBookings,
        (SELECT count(*) FROM bookings)         AS totalBookings,
        (SELECT count(*) FROM students)         AS totalStudents,
        (SELECT count(*) FROM students WHERE status='Approved') AS approvedStudents,
        (SELECT count(*) FROM providers)        AS totalProviders,
        (SELECT count(*) FROM providers WHERE status='Approved') AS approvedProviders,
        (SELECT count(*) FROM bookings WHERE status='Approved') AS approvedBookings
      `, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
      });
    }
  });
});

// ---- Admin users management (superadmin only) ----
app.get('/api/admin/admin-users', requireAdmin, requireSuperAdmin, (req, res) => {
  db.all("SELECT id, username, full_name, role, active, created_at FROM admin_users ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/admin/admin-users', requireAdmin, requireSuperAdmin, (req, res) => {
  const { username, fullName, role, password } = req.body || {};
  if (!username || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'İstifadəçi adı və minimum 8 simvolluq parol tələb olunur' });
  }
  const safeRole = ['superadmin','moderator','support'].includes(role) ? role : 'moderator';
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: hashErr.message });
    db.run(
      "INSERT INTO admin_users (username, full_name, role, password_hash, active) VALUES (?,?,?,?,1)",
      [String(username).trim(), String(fullName || '').trim(), safeRole, passwordHash],
      function(dbErr) {
        if (dbErr) return res.status(400).json({ error: dbErr.message });
        logAudit(req.admin.user, 'admin_user_created', 'admin_user', this.lastID, { username, role: safeRole });
        res.json({ id: this.lastID, username, role: safeRole });
      }
    );
  });
});

app.put('/api/admin/admin-users/:id/active', requireAdmin, requireSuperAdmin, (req, res) => {
  const active = req.body?.active ? 1 : 0;
  db.run("UPDATE admin_users SET active=? WHERE id=?", [active, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, active ? 'admin_user_activated' : 'admin_user_deactivated', 'admin_user', req.params.id, {});
    res.json({ success: true });
  });
});

app.delete('/api/admin/admin-users/:id', requireAdmin, requireSuperAdmin, (req, res) => {
  db.run("DELETE FROM admin_users WHERE id=?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'admin_user_deleted', 'admin_user', req.params.id, {});
    res.json({ success: true });
  });
});

// ---- Admin: Get places (org-scoped if org admin) ----
app.get('/api/admin/places', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const sql = orgId
    ? "SELECT * FROM places WHERE organization_id = ? ORDER BY id DESC"
    : "SELECT * FROM places ORDER BY id DESC";
  const params = orgId ? [orgId] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

// ---- Admin: Create place (org admin only) ----
app.post('/api/admin/places', requireAdmin, requireOrgAdmin, (req, res) => {
  const body = { ...(req.body || {}) };
  const p = normalizePlacePayload(body);
  if (!p.name || !p.address || !p.price || !p.total_spots) {
    return res.status(400).json({ error: 'Ad, ünvan, qiymət və yataq sayı zəruridir' });
  }
  const sql = `INSERT INTO places
    (name, type, city, gender, price, total_spots, free_spots, female_occupied, male_occupied, female_free, male_free, wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities, organization_id, room_count, metro_distance_min, min_contract_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng,
    JSON.stringify(p.images), p.virtual_tour, p.description, p.address,
    JSON.stringify(p.amenities), JSON.stringify(p.universities), req.admin.organization_id,
    p.room_count, p.metro_distance_min, p.min_contract_months,
  ];
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'place_created', 'place', this.lastID, { name: p.name, org_id: req.admin.organization_id });
    res.json({ success: true, id: this.lastID });
  });
});

// ---- Admin: Update place ----
app.put('/api/admin/places/:id', requireAdmin, requireNotModerator, (req, res) => {
  const id = req.params.id;
  const orgId = req.admin.organization_id;
  const p = normalizePlacePayload(req.body || {});
  if (!p.name) return res.status(400).json({ error: 'Ad zəruridir' });
  const doUpdate = () => {
    updatePlaceRecord(id, p, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, 'place_updated', 'place', id, { name: p.name });
      res.json({ success: true });
    });
  };
  if (orgId) {
    db.get("SELECT id FROM places WHERE id = ? AND organization_id = ?", [id, orgId], (err, row) => {
      if (!row) return res.status(403).json({ error: 'Bu obyekt sizin orqanizasiyanıza aid deyil' });
      doUpdate();
    });
  } else {
    doUpdate();
  }
});

// ---- Admin: Delete place ----
app.delete('/api/admin/places/:id', requireAdmin, requireNotModerator, (req, res) => {
  const id = req.params.id;
  const orgId = req.admin.organization_id;
  const doDelete = () => {
    db.run("DELETE FROM places WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, 'place_deleted', 'place', id, {});
      res.json({ success: true });
    });
  };
  if (orgId) {
    db.get("SELECT id FROM places WHERE id = ? AND organization_id = ?", [id, orgId], (err, row) => {
      if (!row) return res.status(403).json({ error: 'Bu obyekt sizin orqanizasiyanıza aid deyil' });
      doDelete();
    });
  } else {
    doDelete();
  }
});

// ---- Admin: Update occupancy only (moderators allowed) ----
app.put('/api/admin/places/:id/occupancy', requireAdmin, (req, res) => {
  const id = req.params.id;
  const orgId = req.admin.organization_id;
  const { female_occupied, female_free, male_occupied, male_free } = req.body || {};
  const fo = parseInt(female_occupied, 10) || 0;
  const ff = parseInt(female_free, 10) || 0;
  const mo = parseInt(male_occupied, 10) || 0;
  const mf = parseInt(male_free, 10) || 0;
  const doUpdate = () => {
    db.run(
      "UPDATE places SET female_occupied=?, female_free=?, male_occupied=?, male_free=?, free_spots=(? + ?), updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [fo, ff, mo, mf, ff, mf, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req.admin.user, 'occupancy_updated', 'place', id, { female_occupied: fo, female_free: ff, male_occupied: mo, male_free: mf });
        res.json({ success: true });
      }
    );
  };
  if (orgId) {
    db.get("SELECT id FROM places WHERE id = ? AND organization_id = ?", [id, orgId], (err, row) => {
      if (!row) return res.status(403).json({ error: 'Bu obyekt sizin orqanizasiyanıza aid deyil' });
      doUpdate();
    });
  } else {
    doUpdate();
  }
});

// ---- Admin: provider approvals ----
app.get('/api/admin/providers', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const where = orgId ? ' WHERE id IN (SELECT DISTINCT provider_id FROM places WHERE organization_id = ? AND provider_id IS NOT NULL)' : '';
  const params = orgId ? [orgId] : [];
  db.all(`SELECT id, full_name, provider_type, company_name, phone, email, status, admin_note, created_at, updated_at FROM providers${where} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/admin/providers/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  const orgId = req.admin.organization_id;
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (orgId) {
    db.get("SELECT id FROM places WHERE provider_id = ? AND organization_id = ? LIMIT 1", [req.params.id, orgId], (chkErr, row) => {
      if (chkErr) return res.status(500).json({ error: chkErr.message });
      if (!row) return res.status(403).json({ error: 'Forbidden' });
      doUpdate();
    });
  } else { doUpdate(); }
  function doUpdate() {
  db.get("SELECT email, full_name FROM providers WHERE id = ?", [req.params.id], (selectErr, provider) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    db.run(
      "UPDATE providers SET status = ?, admin_note = ?, session_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, note, req.params.id],
      function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, `provider_${status.toLowerCase()}`, 'provider', req.params.id, { note });
      if (provider && provider.email) {
        sendMail(provider.email, 'StudentStay hesab təsdiqi', `Salam ${provider.full_name || ''},\nHesab statusunuz: ${status}.\n${note ? `Qeyd: ${note}` : ''}`);
      }
      res.json({ success: true });
      }
    );
  });
  }
});

app.get('/api/admin/providers/:id/document', requireAdmin, (req, res) => {
  db.get("SELECT id_document_name, id_document_type, id_document_path FROM providers WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.id_document_path) return res.status(404).json({ error: 'Document not found' });
    const fullPath = path.resolve(__dirname, row.id_document_path);
    if (!fullPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Document not found' });
    fs.readFile(fullPath, (readErr, data) => {
      if (readErr) return res.status(500).json({ error: 'Sənəd oxuna bilmədi' });
      res.json({
        document_name: row.id_document_name,
        document_type: row.id_document_type,
        document_data: data.toString('base64'),
      });
    });
  });
});

app.get('/api/admin/students', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const where = orgId ? ' WHERE email IN (SELECT DISTINCT email FROM bookings WHERE organization_id = ?)' : '';
  const params = orgId ? [orgId] : [];
  db.all(`SELECT id, full_name, phone, email, university, status, admin_note, document_name, created_at, updated_at FROM students${where} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/admin/students/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.get("SELECT email, full_name FROM students WHERE id = ?", [req.params.id], (selectErr, student) => {
    if (selectErr) return res.status(500).json({ error: selectErr.message });
    db.run(
      "UPDATE students SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, note, req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req.admin.user, `student_${status.toLowerCase()}`, 'student', req.params.id, { note });
        if (student && student.email) {
          sendMail(student.email, 'StudentStay tələbə hesabı statusu', `Salam ${student.full_name || ''},\nHesab statusunuz: ${status}.\n${note ? `Qeyd: ${note}` : ''}`);
        }
        res.json({ success: true });
      }
    );
  });
});

app.get('/api/admin/students/:id/document', requireAdmin, (req, res) => {
  db.get("SELECT document_name, document_type, document_path FROM students WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.document_path) return res.status(404).json({ error: 'Document not found' });
    const fullPath = path.resolve(__dirname, row.document_path);
    if (!fullPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Document not found' });
    fs.readFile(fullPath, (readErr, data) => {
      if (readErr) return res.status(500).json({ error: 'Sənəd oxuna bilmədi' });
      res.json({
        document_name: row.document_name,
        document_type: row.document_type,
        document_data: data.toString('base64'),
      });
    });
  });
});

app.get('/api/admin/provider-listings', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const where = orgId ? ' WHERE l.provider_id IN (SELECT DISTINCT provider_id FROM places WHERE organization_id = ? AND provider_id IS NOT NULL)' : '';
  const params = orgId ? [orgId] : [];
  db.all(`SELECT l.*, p.full_name as provider_name, p.company_name as provider_company, p.email as provider_email, p.phone as provider_phone
          FROM provider_listings l
          JOIN providers p ON p.id = l.provider_id${where}
          ORDER BY l.created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

app.put('/api/admin/provider-listings/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.get("SELECT * FROM provider_listings WHERE id = ?", [req.params.id], (err, listing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const finish = (placeId) => {
      db.run(
        "UPDATE provider_listings SET status = ?, admin_note = ?, published_place_id = COALESCE(?, published_place_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, note, placeId || null, listing.id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          logAudit(req.admin.user, `provider_listing_${status.toLowerCase()}`, 'provider_listing', listing.id, { published_place_id: placeId || listing.published_place_id || null, note });
          db.get("SELECT email, full_name FROM providers WHERE id = ?", [listing.provider_id], (providerErr, provider) => {
            if (!providerErr && provider && provider.email) {
              sendMail(provider.email, 'StudentStay elan statusu', `Salam ${provider.full_name || ''},\nElanınızın statusu: ${status}.\n${note ? `Qeyd: ${note}` : ''}`);
            }
          });
          res.json({ success: true, published_place_id: placeId || listing.published_place_id || null });
        }
      );
    };
    if (status === 'Approved' && listing.published_place_id) {
      const p = normalizePlacePayload(expandPlace(listing));
      return updatePlaceRecord(listing.published_place_id, p, (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        finish(listing.published_place_id);
      });
    }
    if (status !== 'Approved') return finish(null);
    const p = normalizePlacePayload(expandPlace(listing));
    insertPlace(p, listing.provider_id, function (insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      finish(this.lastID);
    });
  });
});

// ---- Admin: Bookings (org-scoped) ----
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  expireOldBookings((expireErr) => {
    if (expireErr) return res.status(500).json({ error: expireErr.message });
    const where = orgId ? ' AND p.organization_id = ?' : '';
    const params = orgId ? [orgId] : [];
    db.all(`SELECT b.id, b.tracking_code, b.full_name, b.phone, b.email, b.university, b.faculty, b.gender,
            b.move_in, b.duration, b.status, b.place_id, b.organization_id, b.note, b.admin_note,
            b.document_name, b.document_type, b.expires_at, b.created_at, b.updated_at, p.name as place_name
            FROM bookings b
            LEFT JOIN places p ON b.place_id = p.id
            WHERE 1=1${where}
            ORDER BY b.created_at DESC`, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

app.get('/api/admin/verification-queue', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const result = { providers: [], listings: [], students: [] };
  const provWhere = orgId ? " AND id IN (SELECT DISTINCT provider_id FROM places WHERE organization_id = ? AND provider_id IS NOT NULL)" : '';
  const stuWhere  = orgId ? " AND email IN (SELECT DISTINCT email FROM bookings WHERE organization_id = ?)" : '';
  const lstWhere  = orgId ? " AND l.provider_id IN (SELECT DISTINCT provider_id FROM places WHERE organization_id = ? AND provider_id IS NOT NULL)" : '';
  const p1 = orgId ? [orgId] : [], p2 = orgId ? [orgId] : [], p3 = orgId ? [orgId] : [];
  db.all(`SELECT id, full_name, provider_type, company_name, phone, email, status, id_document_name, created_at FROM providers WHERE status = 'Pending'${provWhere} ORDER BY created_at DESC`, p1, (providerErr, providers) => {
    if (providerErr) return res.status(500).json({ error: providerErr.message });
    result.providers = providers || [];
    db.all(`SELECT id, full_name, phone, email, university, status, document_name, created_at FROM students WHERE status = 'Pending'${stuWhere} ORDER BY created_at DESC`, p2, (studentErr, students) => {
      if (studentErr) return res.status(500).json({ error: studentErr.message });
      result.students = students || [];
      db.all(`SELECT l.id, l.name, l.city, l.type, l.price, l.status, l.created_at,
              p.full_name as provider_name, p.email as provider_email, p.phone as provider_phone
              FROM provider_listings l
              JOIN providers p ON p.id = l.provider_id
              WHERE l.status = 'Pending'${lstWhere}
              ORDER BY l.created_at DESC`, p3, (listingErr, listings) => {
        if (listingErr) return res.status(500).json({ error: listingErr.message });
        result.listings = listings || [];
        res.json(result);
      });
    });
  });
});

app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const where = orgId ? ' WHERE p.organization_id = ?' : '';
  const params = orgId ? [orgId] : [];
  db.all(`SELECT r.*, p.name as place_name
          FROM reports r
          JOIN places p ON p.id = r.place_id${where}
          ORDER BY r.created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/admin/reports/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Reviewed', 'Resolved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.run(
    "UPDATE reports SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [status, note, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, `report_${status.toLowerCase()}`, 'report', req.params.id, { note });
      res.json({ success: true });
    }
  );
});

app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
  const orgId = req.admin.organization_id;
  const where = orgId
    ? ` WHERE actor IN (SELECT username FROM admin_users WHERE organization_id = ?)
        OR (entity_type = 'booking' AND entity_id IN (SELECT id FROM bookings WHERE organization_id = ?))
        OR (entity_type = 'place'   AND entity_id IN (SELECT id FROM places   WHERE organization_id = ?))`
    : '';
  const params = orgId ? [orgId, orgId, orgId] : [];
  db.all(`SELECT * FROM audit_logs${where} ORDER BY created_at DESC LIMIT 200`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/admin/bookings/:id/document', requireAdmin, (req, res) => {
  db.get("SELECT document_name, document_type, document_data, document_path FROM bookings WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || (!row.document_data && !row.document_path)) return res.status(404).json({ error: 'Document not found' });
    if (row.document_path) {
      const fullPath = path.resolve(__dirname, row.document_path);
      if (!fullPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Document not found' });
      }
      return fs.readFile(fullPath, (readErr, data) => {
        if (readErr) return res.status(500).json({ error: 'Sənəd oxuna bilmədi' });
        row.document_data = data.toString('base64');
        delete row.document_path;
        res.json(row);
      });
    }
    delete row.document_path;
    res.json(row);
  });
});

function applyPlaceDelta(placeId, gender, delta, cb) {
  if (!placeId) return cb();
  db.get("SELECT * FROM places WHERE id = ?", [placeId], (err, place) => {
    if (err || !place) return cb(err || new Error('Place not found'));
    const freeColumn = gender === 'female' ? 'female_free' : 'male_free';
    const occupiedColumn = gender === 'female' ? 'female_occupied' : 'male_occupied';
    const otherFreeColumn = gender === 'female' ? 'male_free' : 'female_free';
    const nextFree = (place[freeColumn] || 0) - delta;
    const nextOccupied = (place[occupiedColumn] || 0) + delta;
    const nextTotalFree = nextFree + (place[otherFreeColumn] || 0);
    if (nextFree < 0 || nextOccupied < 0) return cb(new Error('Bu cinsiyyət üçün boş yer yoxdur'));
    db.run(
      `UPDATE places SET ${freeColumn} = ?, ${occupiedColumn} = ?, free_spots = ? WHERE id = ?`,
      [nextFree, nextOccupied, nextTotalFree, placeId],
      cb
    );
  });
}

app.put('/api/admin/bookings/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.serialize(() => {
    db.run('BEGIN IMMEDIATE');
    db.get("SELECT * FROM bookings WHERE id = ?", [req.params.id], (err, booking) => {
      if (err || !booking) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found' });
      }
      const orgId = req.admin.organization_id;
      if (orgId && booking.organization_id && booking.organization_id !== orgId) {
        db.run('ROLLBACK');
        return res.status(403).json({ error: 'Bu rezervasiya sizin orqanizasiyanıza aid deyil' });
      }
      if (booking.status === status) {
        db.run('COMMIT');
        return res.json({ success: true });
      }

      let delta = 0;
      if (booking.status !== 'Approved' && status === 'Approved') delta = 1;
      if (booking.status === 'Approved' && status !== 'Approved') delta = -1;

      applyPlaceDelta(booking.place_id, booking.gender, delta, (placeErr) => {
        if (placeErr) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: placeErr.message });
        }
        db.run(
          "UPDATE bookings SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [status, note, booking.id],
          (updateErr) => {
            if (updateErr) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: updateErr.message });
            }
            db.run('COMMIT', (commitErr) => {
            if (commitErr) return res.status(500).json({ error: commitErr.message });
              logAudit(req.admin.user, `booking_${status.toLowerCase()}`, 'booking', booking.id, { place_id: booking.place_id, note });
              sendMail(booking.email, 'StudentStay rezervasiya statusu', `Rezervasiya müraciətinizin statusu: ${status}\nTracking ID: ${booking.tracking_code || '-'}\n${note ? `Admin qeydi: ${note}` : ''}`);
              res.json({ success: true });
            });
          }
        );
      });
    });
  });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.serialize(() => {
    db.run('BEGIN IMMEDIATE');
    db.get("SELECT * FROM bookings WHERE id = ?", [req.params.id], (err, booking) => {
      if (err || !booking) {
        db.run('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found' });
      }
      const orgId = req.admin.organization_id;
      if (orgId && booking.organization_id && booking.organization_id !== orgId) {
        db.run('ROLLBACK');
        return res.status(403).json({ error: 'Bu rezervasiya sizin orqanizasiyanıza aid deyil' });
      }
      const finishDelete = () => {
        db.run("DELETE FROM bookings WHERE id = ?", [booking.id], (deleteErr) => {
          if (deleteErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: deleteErr.message });
          }
          db.run('COMMIT', (commitErr) => {
            if (commitErr) return res.status(500).json({ error: commitErr.message });
            removeStoredDocument(booking.document_path);
            logAudit(req.admin.user, 'booking_deleted', 'booking', booking.id, {});
            res.json({ success: true });
          });
        });
      };
      if (booking.status !== 'Approved') return finishDelete();
      applyPlaceDelta(booking.place_id, booking.gender, -1, (placeErr) => {
        if (placeErr) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: placeErr.message });
        }
        finishDelete();
      });
    });
  });
});

// ---- Superadmin: Platform stats ----
app.get('/api/superadmin/platform-stats', requireSuperAdminAuth, (req, res) => {
  db.get(`SELECT
    (SELECT count(*) FROM organizations WHERE status='Active')                                        AS activeOrgs,
    (SELECT count(*) FROM organizations WHERE status='Suspended')                                     AS suspendedOrgs,
    (SELECT count(*) FROM organizations WHERE status='Pending')                                       AS pendingOrgs,
    (SELECT count(*) FROM organizations)                                                              AS totalOrgs,
    (SELECT count(*) FROM places)                                                                     AS totalPlaces,
    (SELECT sum(total_spots) FROM places)                                                             AS totalSpots,
    (SELECT sum(free_spots)  FROM places)                                                             AS freeSpots,
    (SELECT sum(total_spots - free_spots) FROM places)                                                AS occupiedSpots,
    (SELECT count(*) FROM students WHERE status='Approved')                                           AS approvedStudents,
    (SELECT count(*) FROM students)                                                                   AS totalStudents,
    (SELECT count(*) FROM students WHERE status='Pending')                                            AS pendingStudents,
    (SELECT count(*) FROM providers WHERE status='Pending')                                           AS pendingProviders,
    (SELECT count(*) FROM bookings WHERE status='Pending')                                            AS pendingBookings,
    (SELECT count(*) FROM bookings WHERE status='Approved')                                           AS approvedBookings,
    (SELECT count(*) FROM bookings WHERE status='Rejected')                                           AS rejectedBookings,
    (SELECT count(*) FROM bookings)                                                                   AS totalBookings,
    (SELECT count(*) FROM admin_users WHERE active=1 AND role='admin')                                AS activeAdmins,
    (SELECT count(*) FROM admin_users WHERE active=1 AND role='moderator')                            AS activeModerators
  `, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const r = row || {};
    r.occupancyPct = r.totalSpots > 0 ? Math.round((r.occupiedSpots / r.totalSpots) * 100) : 0;
    r.approvalRate  = r.totalBookings > 0 ? Math.round((r.approvedBookings / r.totalBookings) * 100) : 0;
    res.json(r);
  });
});

// ---- Superadmin: DB stats ----
app.get('/api/superadmin/db-stats', requireSuperAdminAuth, (req, res) => {
  const fs = require('fs');
  let fileSize = 0;
  try { fileSize = fs.statSync(dbPath).size; } catch {}
  const tables = ['organizations','admin_users','places','bookings','students','providers','audit_logs','reports'];
  const counts = {};
  let pending = tables.length;
  tables.forEach(t => {
    db.get(`SELECT count(*) as n FROM ${t}`, [], (e, row) => {
      counts[t] = row ? row.n : 0;
      if (--pending === 0) res.json({ fileSizeBytes: fileSize, fileSizeMB: (fileSize / 1048576).toFixed(2), tables: counts });
    });
  });
});

// ---- Superadmin: Quick org status toggle ----
app.put('/api/superadmin/organizations/:id/status', requireSuperAdminAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['Active', 'Suspended', 'Pending', 'Archived'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Yanlış status' });
  db.run("UPDATE organizations SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: 'Orqanizasiya tapılmadı' });
    logAudit(req.superadmin || 'superadmin', `org_status_${status.toLowerCase()}`, 'organization', req.params.id, { status });
    res.json({ success: true });
  });
});

// ---- Superadmin: Organizations ----
app.get('/api/superadmin/organizations', requireSuperAdminAuth, (req, res) => {
  db.all(`SELECT o.*,
    (SELECT count(*) FROM admin_users au WHERE au.organization_id=o.id AND au.role='admin' AND au.active=1) AS adminCount,
    (SELECT count(*) FROM admin_users au WHERE au.organization_id=o.id AND au.role='moderator' AND au.active=1) AS moderatorCount,
    (SELECT count(*) FROM places p WHERE p.organization_id=o.id) AS placeCount,
    (SELECT sum(p.total_spots) FROM places p WHERE p.organization_id=o.id) AS totalSpots,
    (SELECT sum(p.free_spots)  FROM places p WHERE p.organization_id=o.id) AS freeSpots,
    (SELECT count(*) FROM bookings b JOIN places p ON p.id=b.place_id WHERE p.organization_id=o.id AND b.status='Pending')  AS pendingBookings,
    (SELECT count(*) FROM bookings b JOIN places p ON p.id=b.place_id WHERE p.organization_id=o.id AND b.status='Approved') AS approvedBookings
    FROM organizations o ORDER BY o.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/superadmin/organizations', requireSuperAdminAuth, (req, res) => {
  const { name, type, contact_email, contact_phone } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Orqanizasiya adı zəruridir' });
  db.run(
    "INSERT INTO organizations (name, type, contact_email, contact_phone) VALUES (?, ?, ?, ?)",
    [String(name).trim(), type || 'hostel', String(contact_email || '').trim(), String(contact_phone || '').trim()],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, 'organization_created', 'organization', this.lastID, { name });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/superadmin/organizations/:id', requireSuperAdminAuth, (req, res) => {
  const { name, type, contact_email, contact_phone, status } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Ad zəruridir' });
  const safeStatus = ['Active', 'Suspended', 'Pending', 'Archived'].includes(status) ? status : 'Active';
  db.run(
    "UPDATE organizations SET name=?, type=?, contact_email=?, contact_phone=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [String(name).trim(), type || 'hostel', String(contact_email || '').trim(), String(contact_phone || '').trim(), safeStatus, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, 'organization_updated', 'organization', req.params.id, { name });
      res.json({ success: true });
    }
  );
});

// ---- Superadmin: Create org admin/moderator ----
app.post('/api/superadmin/org-admins', requireSuperAdminAuth, (req, res) => {
  const { organization_id, username, full_name, password, role } = req.body || {};
  if (!organization_id || !username || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'Orqanizasiya, istifadəçi adı və min 8 simvol parol zəruridir' });
  }
  const safeRole = ['admin', 'moderator'].includes(role) ? role : 'admin';
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: hashErr.message });
    db.run(
      "INSERT INTO admin_users (username, full_name, role, password_hash, organization_id, active) VALUES (?,?,?,?,?,1)",
      [String(username).trim(), String(full_name || '').trim(), safeRole, passwordHash, parseInt(organization_id, 10)],
      function(err) {
        if (err) {
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu istifadəçi adı artıq var' });
          return res.status(500).json({ error: err.message });
        }
        logAudit(req.superadmin.user, 'org_admin_created', 'admin_user', this.lastID, { org_id: organization_id, username, role: safeRole });
        res.json({ id: this.lastID });
      }
    );
  });
});

// List admins of a specific org
app.get('/api/superadmin/organizations/:id/admins', requireSuperAdminAuth, (req, res) => {
  db.all(
    "SELECT id, username, full_name, role, active, created_at FROM admin_users WHERE organization_id=? ORDER BY created_at DESC",
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.put('/api/superadmin/org-admins/:id/active', requireSuperAdminAuth, (req, res) => {
  const active = req.body?.active ? 1 : 0;
  db.run("UPDATE admin_users SET active=? WHERE id=?", [active, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.superadmin.user, active ? 'org_admin_activated' : 'org_admin_deactivated', 'admin_user', req.params.id, {});
    res.json({ success: true });
  });
});

app.delete('/api/superadmin/org-admins/:id', requireSuperAdminAuth, (req, res) => {
  db.run("DELETE FROM admin_users WHERE id=?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.superadmin.user, 'org_admin_deleted', 'admin_user', req.params.id, {});
    res.json({ success: true });
  });
});

// ── Superadmin: platform audit logs ──────────────────────────────────────────
app.get('/api/superadmin/audit-logs', requireSuperAdminAuth, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 200, 500);
  const offset = parseInt(req.query.offset) || 0;
  const orgId  = req.query.org_id ? parseInt(req.query.org_id) : null;
  const where  = orgId
    ? "WHERE (au.organization_id = ? OR (al.entity_type = 'organization' AND CAST(al.entity_id AS INTEGER) = ?))"
    : '';
  const auditParams = orgId ? [orgId, orgId, limit, offset] : [limit, offset];
  db.all(`
    SELECT al.id, al.actor, al.action, al.entity_type, al.entity_id, al.details AS meta, al.created_at,
           o.name AS org_name
    FROM audit_logs al
    LEFT JOIN admin_users au ON al.actor = au.username
    LEFT JOIN organizations o ON au.organization_id = o.id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `, auditParams, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ── Superadmin: org booking trend (last 7 days) ───────────────────────────────
app.get('/api/superadmin/organizations/:id/recent-bookings', requireSuperAdminAuth, (req, res) => {
  db.all(`
    SELECT date(created_at) AS day, COUNT(*) AS count
    FROM bookings
    WHERE organization_id = ? AND created_at >= date('now', '-6 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ── Superadmin: bulk org status ───────────────────────────────────────────────
app.put('/api/superadmin/org-bulk-status', requireSuperAdminAuth, (req, res) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !status)
    return res.status(400).json({ error: 'ids[] və status tələb olunur' });
  const allowed = ['Active', 'Suspended', 'Pending', 'Archived'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Yanlış status' });
  const ph = ids.map(() => '?').join(',');
  db.run(`UPDATE organizations SET status=? WHERE id IN (${ph})`,
    [status, ...ids.map(Number)],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.superadmin.user, `org_bulk_${status.toLowerCase()}`, 'organization', null, { ids, status });
      res.json({ updated: this.changes });
    }
  );
});

// ---- Admin: Org moderator management ----
app.get('/api/admin/org/moderators', requireAdmin, requireOrgAdmin, (req, res) => {
  db.all(
    "SELECT id, username, full_name, role, active, created_at FROM admin_users WHERE organization_id=? AND role='moderator' ORDER BY created_at DESC",
    [req.admin.organization_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.post('/api/admin/org/moderators', requireAdmin, requireOrgAdmin, (req, res) => {
  const { username, full_name, password } = req.body || {};
  if (!username || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'İstifadəçi adı və min 8 simvol parol zəruridir' });
  }
  hashPassword(password, (hashErr, passwordHash) => {
    if (hashErr) return res.status(500).json({ error: hashErr.message });
    db.run(
      "INSERT INTO admin_users (username, full_name, role, password_hash, organization_id, active) VALUES (?,?,'moderator',?,?,1)",
      [String(username).trim(), String(full_name || '').trim(), passwordHash, req.admin.organization_id],
      function(err) {
        if (err) {
          if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Bu istifadəçi adı artıq var' });
          return res.status(500).json({ error: err.message });
        }
        logAudit(req.admin.user, 'moderator_created', 'admin_user', this.lastID, { username, org_id: req.admin.organization_id });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.put('/api/admin/org/moderators/:id/active', requireAdmin, requireOrgAdmin, (req, res) => {
  const active = req.body?.active ? 1 : 0;
  db.run(
    "UPDATE admin_users SET active=? WHERE id=? AND organization_id=?",
    [active, req.params.id, req.admin.organization_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.admin.user, active ? 'moderator_activated' : 'moderator_deactivated', 'admin_user', req.params.id, {});
      res.json({ success: true });
    }
  );
});

app.delete('/api/admin/org/moderators/:id', requireAdmin, requireOrgAdmin, (req, res) => {
  db.run(
    "DELETE FROM admin_users WHERE id=? AND organization_id=? AND role='moderator'",
    [req.params.id, req.admin.organization_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Moderator tapılmadı' });
      logAudit(req.admin.user, 'moderator_deleted', 'admin_user', req.params.id, {});
      res.json({ success: true });
    }
  );
});

setInterval(() => expireOldBookings(), 60 * 60 * 1000);
expireOldBookings();

const server = app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));

server.on('error', (err) => {
  console.error(`Server failed to start on port ${PORT}:`, err.message);
  process.exit(1);
});
