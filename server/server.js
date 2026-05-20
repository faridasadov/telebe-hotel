const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { execFile } = require('child_process');
const bodyParser = require('body-parser');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'scrypt:studentstayadmin2026:e2317b3a2defe0838e88b596d759eb64788da1dce757d46b4f282dbadada0a8812a7120b68a9f3560b91288c906d32b8c1145c54a486c9bddf7ef3cdc5498209';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';
const COOKIE_NAME = 'studentstay_admin';
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
const adminSessions = new Map();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LISTING_UPLOAD_DIR, { recursive: true });

app.use(cors());
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
app.use(express.static(path.join(__dirname, '..')));

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    return acc;
  }, {});
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { user: ADMIN_USER, expiresAt: Date.now() + ADMIN_SESSION_MS });
  return token;
}

function setAdminCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_MS / 1000)}`);
}

function clearAdminCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
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
    req.admin = { user: session.user, token };
    return next();
  }
  if (token) adminSessions.delete(token);
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

function sendMail(to, subject, message) {
  console.log(`${subject} | ${message.replace(/\n/g, ' | ')}`);
  if (!to || !fs.existsSync('/usr/sbin/sendmail')) return;
  const body = `To: ${to}\nSubject: ${subject}\n\n${message}`;
  const child = execFile('/usr/sbin/sendmail', ['-t'], () => {});
  child.stdin.end(body);
}

function notifyAdmin(subject, message) {
  if (!ADMIN_NOTIFY_EMAIL || !fs.existsSync('/usr/sbin/sendmail')) return;
  sendMail(ADMIN_NOTIFY_EMAIL, subject, message);
}

function notifyNewBooking(booking) {
  const message = `New StudentStay booking\nTracking: ${booking.trackingCode || '-'}\nName: ${booking.fullName}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nUniversity: ${booking.university}\nPlace ID: ${booking.placeId || '-'}\n`;
  notifyAdmin('New StudentStay booking', message);
  sendMail(booking.email, 'StudentStay rezervasiya müraciəti qəbul edildi', `Müraciətiniz qəbul edildi.\nTracking ID: ${booking.trackingCode || '-'}\nStatusu saytda "Mənim rezervasiyamı yoxla" bölməsindən izləyə bilərsiniz.`);
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
  if (username !== ADMIN_USER) {
    recordLoginFailure(req);
    return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
  }
  verifyPassword(password, ADMIN_PASSWORD_HASH, (ok) => {
    if (!ok) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə' });
    }
    clearLoginFailures(req);
    const token = createAdminSession();
    setAdminCookie(res, token);
    logAudit(ADMIN_USER, 'admin_login', 'admin', null, { ip: getRateKey(req) });
    res.json({ user: ADMIN_USER, expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000) });
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  if (req.admin && req.admin.token) adminSessions.delete(req.admin.token);
  logAudit(req.admin && req.admin.user, 'admin_logout', 'admin', null, {});
  clearAdminCookie(res);
  res.json({ success: true });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ user: ADMIN_USER, expiresInSeconds: Math.floor(ADMIN_SESSION_MS / 1000) });
});

// ---- Provider registration / login ----
app.post('/api/providers/register', (req, res) => {
  const { fullName, providerType, companyName, phone, email, password, document } = req.body || {};
  if (!fullName || !phone || !email || !password || String(password).length < 8 || !document || !document.data) {
    return res.status(400).json({ error: 'Ad, telefon, e-poçt, minimum 8 simvolluq şifrə və şəxsiyyət sənədi zəruridir' });
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
      `INSERT INTO providers (full_name, provider_type, company_name, phone, email, password_hash, id_document_name, id_document_type, id_document_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(fullName).trim(),
        ['owner', 'agency'].includes(providerType) ? providerType : 'owner',
        String(companyName || '').trim(),
        String(phone).trim(),
        String(email).trim().toLowerCase(),
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

app.post('/api/students/logout', requireStudent, (req, res) => {
  db.run("UPDATE students SET session_token = NULL WHERE id = ?", [req.student.id], () => {});
  clearStudentCookie(res);
  res.json({ success: true });
});

app.get('/api/students/session', requireStudent, (req, res) => {
  res.json({ student: req.student });
});

app.get('/api/students/bookings', requireStudent, (req, res) => {
  db.all(`SELECT b.id, b.tracking_code, b.full_name, b.email, b.university, b.faculty, b.gender,
          b.move_in, b.duration, b.status, b.note, b.admin_note, b.created_at, b.updated_at,
          p.name as place_name
          FROM bookings b
          LEFT JOIN places p ON p.id = b.place_id
          WHERE lower(b.email) = lower(?)
          ORDER BY b.created_at DESC`, [req.student.email], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/bookings/status/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  db.get(`SELECT b.tracking_code, b.full_name, b.email, b.university, b.faculty, b.gender,
          b.move_in, b.duration, b.status, b.admin_note, b.created_at, b.updated_at,
          p.name as place_name
          FROM bookings b
          LEFT JOIN places p ON p.id = b.place_id
          WHERE upper(b.tracking_code) = ?`, [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Tracking ID tapılmadı' });
    res.json(row);
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

// ---- List places ----
app.get('/api/places', (req, res) => {
  const { city, type, gender, minPrice, maxPrice, wifi, utilities, university, rooms, maxMetro, ac, heating, minContract } = req.query;
  let query = "SELECT * FROM places WHERE 1=1";
  const params = [];

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

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const ids = [...new Set((rows || []).map((row) => row.provider_id).filter(Boolean))];
    if (!ids.length) return res.json((rows || []).map(expandPlace));
    db.all(`SELECT id, status FROM providers WHERE id IN (${ids.map(() => '?').join(',')})`, ids, (providerErr, providers) => {
      if (providerErr) return res.status(500).json({ error: providerErr.message });
      const verified = new Set((providers || []).filter((p) => p.status === 'Approved').map((p) => p.id));
      res.json((rows || []).map((row) => {
        row.verified_owner = row.provider_id && verified.has(row.provider_id) ? 1 : 0;
        return expandPlace(row);
      }));
    });
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
  const placeId = parseInt(req.params.id);
  const { author_name, rating, comment, university } = req.body;

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
  const sql = `INSERT INTO bookings
    (full_name, phone, email, university, faculty, gender, move_in, duration, tracking_code, place_id, note, document_name, document_type, document_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [
    fullName, phone, email, university, faculty, gender, moveIn, duration, code, placeId || null, note || '',
    doc.document_name || null, doc.document_type || null, doc.document_path || null
  ], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(String(email).trim().toLowerCase(), 'booking_submitted', 'booking', this.lastID, { tracking_code: code, place_id: placeId || null });
    notifyNewBooking({ fullName, phone, email, university, placeId, trackingCode: code });
    res.json({ message: "Success", id: this.lastID, trackingCode: code });
  });
});

app.post('/api/reports', (req, res) => {
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
}

// ---- Public/Admin stats ----
app.get('/api/stats', (req, res) => sendStats(res));
app.get('/api/admin/stats', requireAdmin, (req, res) => sendStats(res));

// ---- Admin: Get all places (no filters) ----
app.get('/api/admin/places', requireAdmin, (req, res) => {
  db.all("SELECT * FROM places ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

// ---- Admin: Create place ----
app.post('/api/admin/places', requireAdmin, (req, res) => {
  const p = normalizePlacePayload(req.body || {});
  if (!p.name) return res.status(400).json({ error: 'Ad zəruridir' });
  insertPlace(p, null, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'place_created', 'place', this.lastID, { name: p.name });
    res.json({ id: this.lastID });
  });
});

// ---- Admin: Update place ----
app.put('/api/admin/places/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const p = normalizePlacePayload(req.body || {});
  if (!p.name) return res.status(400).json({ error: 'Ad zəruridir' });
  updatePlaceRecord(id, p, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'place_updated', 'place', id, { name: p.name });
    res.json({ success: true });
  });
});

// ---- Admin: Delete place ----
app.delete('/api/admin/places/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM places WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAudit(req.admin.user, 'place_deleted', 'place', req.params.id, {});
    res.json({ success: true });
  });
});

// ---- Admin: provider approvals ----
app.get('/api/admin/providers', requireAdmin, (req, res) => {
  db.all("SELECT id, full_name, provider_type, company_name, phone, email, status, admin_note, created_at, updated_at FROM providers ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/admin/providers/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
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
});

app.get('/api/admin/providers/:id/document', requireAdmin, (req, res) => {
  db.get("SELECT id_document_name, id_document_type, id_document_path FROM providers WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.id_document_path) return res.status(404).json({ error: 'Document not found' });
    const fullPath = path.resolve(__dirname, row.id_document_path);
    if (!fullPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Document not found' });
    res.json({
      document_name: row.id_document_name,
      document_type: row.id_document_type,
      document_data: fs.readFileSync(fullPath).toString('base64'),
    });
  });
});

app.get('/api/admin/students', requireAdmin, (req, res) => {
  db.all("SELECT id, full_name, phone, email, university, status, admin_note, document_name, created_at, updated_at FROM students ORDER BY created_at DESC", [], (err, rows) => {
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
    res.json({
      document_name: row.document_name,
      document_type: row.document_type,
      document_data: fs.readFileSync(fullPath).toString('base64'),
    });
  });
});

app.get('/api/admin/provider-listings', requireAdmin, (req, res) => {
  db.all(`SELECT l.*, p.full_name as provider_name, p.company_name as provider_company, p.email as provider_email, p.phone as provider_phone
          FROM provider_listings l
          JOIN providers p ON p.id = l.provider_id
          ORDER BY l.created_at DESC`, [], (err, rows) => {
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

// ---- Admin: Bookings ----
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  db.all(`SELECT b.id, b.tracking_code, b.full_name, b.phone, b.email, b.university, b.faculty, b.gender,
          b.move_in, b.duration, b.status, b.place_id, b.note, b.admin_note, b.document_name, b.document_type,
          b.created_at, b.updated_at, p.name as place_name
          FROM bookings b
          LEFT JOIN places p ON b.place_id = p.id
          ORDER BY b.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/verification-queue', requireAdmin, (req, res) => {
  const result = { providers: [], listings: [], students: [] };
  db.all("SELECT id, full_name, provider_type, company_name, phone, email, status, id_document_name, created_at FROM providers WHERE status = 'Pending' ORDER BY created_at DESC", [], (providerErr, providers) => {
    if (providerErr) return res.status(500).json({ error: providerErr.message });
    result.providers = providers || [];
    db.all("SELECT id, full_name, phone, email, university, status, document_name, created_at FROM students WHERE status = 'Pending' ORDER BY created_at DESC", [], (studentErr, students) => {
      if (studentErr) return res.status(500).json({ error: studentErr.message });
      result.students = students || [];
      db.all(`SELECT l.id, l.name, l.city, l.type, l.price, l.status, l.created_at,
              p.full_name as provider_name, p.email as provider_email, p.phone as provider_phone
              FROM provider_listings l
              JOIN providers p ON p.id = l.provider_id
              WHERE l.status = 'Pending'
              ORDER BY l.created_at DESC`, [], (listingErr, listings) => {
        if (listingErr) return res.status(500).json({ error: listingErr.message });
        result.listings = listings || [];
        res.json(result);
      });
    });
  });
});

app.get('/api/admin/reports', requireAdmin, (req, res) => {
  db.all(`SELECT r.*, p.name as place_name
          FROM reports r
          LEFT JOIN places p ON p.id = r.place_id
          ORDER BY r.created_at DESC`, [], (err, rows) => {
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
  db.all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200", [], (err, rows) => {
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
      row.document_data = fs.readFileSync(fullPath).toString('base64');
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

const server = app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));

server.on('error', (err) => {
  console.error(`Server failed to start on port ${PORT}:`, err.message);
  process.exit(1);
});
