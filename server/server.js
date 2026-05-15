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
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'scrypt:f6782a61b40063c89855e432ab914e1b:bd8efb304ac2b5a44c48af21e456bac82fe974d0f0e1dd9116a6614be7110f26f1612ad04444d20ecccbd728a46ca713893c9646eb13133026491edb505122f0';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || '';
const COOKIE_NAME = 'studentstay_admin';
const PROVIDER_COOKIE_NAME = 'studentstay_provider';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(bodyParser.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..')));

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    acc[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    return acc;
  }, {});
}

function setAdminCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(ADMIN_TOKEN)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
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

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const cookieToken = parseCookies(req)[COOKIE_NAME] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken;
  if (token && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireProvider(req, res, next) {
  const token = parseCookies(req)[PROVIDER_COOKIE_NAME] || '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  db.get("SELECT id, full_name, company_name, phone, email, status FROM providers WHERE session_token = ? AND status = 'Approved'", [token], (err, provider) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!provider) return res.status(401).json({ error: 'Unauthorized' });
    req.provider = provider;
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

function notifyNewBooking(booking) {
  const message = `New StudentStay booking\nName: ${booking.fullName}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nUniversity: ${booking.university}\nPlace ID: ${booking.placeId || '-'}\n`;
  console.log(message.replace(/\n/g, ' | '));
  if (!ADMIN_NOTIFY_EMAIL || !fs.existsSync('/usr/sbin/sendmail')) return;
  const body = `To: ${ADMIN_NOTIFY_EMAIL}\nSubject: New StudentStay booking\n\n${message}`;
  const child = execFile('/usr/sbin/sendmail', ['-t'], () => {});
  child.stdin.end(body);
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
    images: toList(p.images),
    virtual_tour: String(p.virtual_tour || '').trim(),
    description: p.description || '',
    address: p.address || '',
    amenities: toList(p.amenities),
    universities: parseUniversities(p.universities),
  };
}

function insertPlace(p, providerId, cb) {
  const sql = `INSERT INTO places
    (name, type, city, gender, price, total_spots, free_spots, female_occupied, male_occupied, female_free, male_free, wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities, provider_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng,
    JSON.stringify(p.images), p.virtual_tour, p.description, p.address,
    JSON.stringify(p.amenities), JSON.stringify(p.universities), providerId || null
  ];
  db.run(sql, params, cb);
}

function insertProviderListing(providerId, p, cb) {
  const sql = `INSERT INTO provider_listings
    (provider_id, name, type, city, gender, price, total_spots, free_spots, female_occupied, male_occupied, female_free, male_free, wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    providerId, p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng, JSON.stringify(p.images), p.virtual_tour,
    p.description, p.address, JSON.stringify(p.amenities), JSON.stringify(p.universities)
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
    setAdminCookie(res);
    res.json({ user: ADMIN_USER });
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  clearAdminCookie(res);
  res.json({ success: true });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ user: ADMIN_USER });
});

// ---- Provider registration / login ----
app.post('/api/providers/register', (req, res) => {
  const { fullName, companyName, phone, email, password, document } = req.body || {};
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
      `INSERT INTO providers (full_name, company_name, phone, email, password_hash, id_document_name, id_document_type, id_document_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(fullName).trim(),
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

app.get('/api/providers/listings', requireProvider, (req, res) => {
  db.all("SELECT * FROM provider_listings WHERE provider_id = ? ORDER BY created_at DESC", [req.provider.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(expandPlace));
  });
});

app.post('/api/providers/listings', requireProvider, (req, res) => {
  const p = normalizePlacePayload(req.body || {});
  if (!p.name || !p.address || !p.price || !p.total_spots) {
    return res.status(400).json({ error: 'Ad, ünvan, qiymət və yataq sayı zəruridir' });
  }
  insertProviderListing(req.provider.id, p, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, status: 'Pending' });
  });
});

// ---- List places ----
app.get('/api/places', (req, res) => {
  const { city, type, gender, maxPrice, wifi, utilities, university } = req.query;
  let query = "SELECT * FROM places WHERE 1=1";
  const params = [];

  if (city && city !== 'all') { query += " AND city = ?"; params.push(city); }
  if (type && type !== 'all') { query += " AND type = ?"; params.push(type); }
  if (gender && gender !== 'all') { query += " AND gender = ?"; params.push(gender); }
  if (maxPrice) { query += " AND price <= ?"; params.push(parseInt(maxPrice)); }
  if (wifi === 'true') query += " AND wifi = 1";
  if (utilities === 'true') query += " AND utilities = 1";
  if (university && university !== 'all') {
    query += " AND universities LIKE ?";
    params.push(`%"code":"${university}"%`);
  }

  db.all(query, params, (err, rows) => {
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
  const sql = `INSERT INTO bookings
    (full_name, phone, email, university, faculty, gender, move_in, duration, place_id, note, document_name, document_type, document_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [
    fullName, phone, email, university, faculty, gender, moveIn, duration, placeId || null, note || '',
    doc.document_name || null, doc.document_type || null, doc.document_path || null
  ], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    notifyNewBooking({ fullName, phone, email, university, placeId });
    res.json({ message: "Success", id: this.lastID });
  });
});

// ---- Admin stats ----
app.get('/api/admin/stats', (req, res) => {
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
});

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
    res.json({ id: this.lastID });
  });
});

// ---- Admin: Update place ----
app.put('/api/admin/places/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const p = normalizePlacePayload(req.body || {});
  if (!p.name) return res.status(400).json({ error: 'Ad zəruridir' });
  const sql = `UPDATE places SET 
    name=?, type=?, city=?, gender=?, price=?, total_spots=?, free_spots=?, 
    female_occupied=?, male_occupied=?, female_free=?, male_free=?, 
    wifi=?, utilities=?, lat=?, lng=?, images=?, virtual_tour=?, description=?, address=?, amenities=?, universities=?
    WHERE id=?`;
  
  const params = [
    p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
    p.female_occupied, p.male_occupied, p.female_free, p.male_free,
    p.wifi, p.utilities, p.lat, p.lng, JSON.stringify(p.images), p.virtual_tour,
    p.description, p.address, JSON.stringify(p.amenities), JSON.stringify(p.universities), id
  ];

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ---- Admin: Delete place ----
app.delete('/api/admin/places/:id', requireAdmin, (req, res) => {
  db.run("DELETE FROM places WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ---- Admin: provider approvals ----
app.get('/api/admin/providers', requireAdmin, (req, res) => {
  db.all("SELECT id, full_name, company_name, phone, email, status, admin_note, created_at, updated_at FROM providers ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/admin/providers/:id/status', requireAdmin, (req, res) => {
  const status = req.body && req.body.status;
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  if (!['Pending', 'Approved', 'Rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.run(
    "UPDATE providers SET status = ?, admin_note = ?, session_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [status, note, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
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
          res.json({ success: true, published_place_id: placeId || listing.published_place_id || null });
        }
      );
    };
    if (status !== 'Approved' || listing.published_place_id) return finish(null);
    const p = normalizePlacePayload(expandPlace(listing));
    insertPlace(p, listing.provider_id, function (insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      finish(this.lastID);
    });
  });
});

// ---- Admin: Bookings ----
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  db.all(`SELECT b.id, b.full_name, b.phone, b.email, b.university, b.faculty, b.gender,
          b.move_in, b.duration, b.status, b.place_id, b.note, b.document_name, b.document_type,
          b.created_at, b.updated_at, p.name as place_name
          FROM bookings b
          LEFT JOIN places p ON b.place_id = p.id
          ORDER BY b.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
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
          "UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [status, booking.id],
          (updateErr) => {
            if (updateErr) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: updateErr.message });
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) return res.status(500).json({ error: commitErr.message });
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
