const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..')));

// Parse JSON columns into objects when returning rows
function expandPlace(row) {
  if (!row) return row;
  try { row.images = JSON.parse(row.images || "[]"); } catch { row.images = []; }
  try { row.amenities = JSON.parse(row.amenities || "[]"); } catch { row.amenities = []; }
  try { row.universities = JSON.parse(row.universities || "[]"); } catch { row.universities = []; }
  return row;
}

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
  const { fullName, phone, email, university, faculty, gender, moveIn, duration, placeId } = req.body;
  if (!fullName || !phone || !email || !university || !gender || !moveIn || !duration) {
    return res.status(400).json({ error: 'Zəruri sahələr doldurulmayıb' });
  }
  const sql = `INSERT INTO bookings (full_name, phone, email, university, faculty, gender, move_in, duration, place_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [fullName, phone, email, university, faculty, gender, moveIn, duration, placeId || null], function (err) {
    if (err) return res.status(500).json({ error: err.message });
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

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
