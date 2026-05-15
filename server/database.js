const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'studentstay.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // ---- Places ----
  db.run(`CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    city TEXT,
    gender TEXT,
    price INTEGER,
    total_spots INTEGER,
    free_spots INTEGER,
    female_occupied INTEGER DEFAULT 0,
    male_occupied INTEGER DEFAULT 0,
    female_free INTEGER DEFAULT 0,
    male_free INTEGER DEFAULT 0,
    wifi INTEGER,
    utilities INTEGER,
    lat REAL,
    lng REAL,
    images TEXT,
    virtual_tour TEXT,
    description TEXT,
    address TEXT,
    amenities TEXT,
    universities TEXT,
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    provider_id INTEGER,
    room_count INTEGER DEFAULT 1,
    metro_distance_min INTEGER DEFAULT 0,
    min_contract_months INTEGER DEFAULT 1
  )`);

  db.run("ALTER TABLE places ADD COLUMN provider_id INTEGER", () => {});
  db.run("ALTER TABLE places ADD COLUMN room_count INTEGER DEFAULT 1", () => {});
  db.run("ALTER TABLE places ADD COLUMN metro_distance_min INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE places ADD COLUMN min_contract_months INTEGER DEFAULT 1", () => {});

  // ---- Bookings ----
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    university TEXT,
    faculty TEXT,
    gender TEXT,
    move_in TEXT,
    duration TEXT,
    status TEXT DEFAULT 'Pending',
    place_id INTEGER,
    note TEXT,
    document_name TEXT,
    document_type TEXT,
    document_data TEXT,
    document_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(place_id) REFERENCES places(id)
  )`);

  [
    "ALTER TABLE bookings ADD COLUMN note TEXT",
    "ALTER TABLE bookings ADD COLUMN document_name TEXT",
    "ALTER TABLE bookings ADD COLUMN document_type TEXT",
    "ALTER TABLE bookings ADD COLUMN document_data TEXT",
    "ALTER TABLE bookings ADD COLUMN document_path TEXT",
    "ALTER TABLE bookings ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
  ].forEach((sql) => db.run(sql, () => {}));

  // ---- Property providers / owners ----
  db.run(`CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    provider_type TEXT DEFAULT 'owner',
    company_name TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    id_document_name TEXT,
    id_document_type TEXT,
    id_document_path TEXT,
    status TEXT DEFAULT 'Pending',
    admin_note TEXT,
    session_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run("ALTER TABLE providers ADD COLUMN provider_type TEXT DEFAULT 'owner'", () => {});

  db.run(`CREATE TABLE IF NOT EXISTS provider_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    status TEXT DEFAULT 'Pending',
    admin_note TEXT,
    published_place_id INTEGER,
    name TEXT NOT NULL,
    type TEXT,
    city TEXT,
    gender TEXT,
    price INTEGER,
    total_spots INTEGER,
    free_spots INTEGER,
    female_occupied INTEGER DEFAULT 0,
    male_occupied INTEGER DEFAULT 0,
    female_free INTEGER DEFAULT 0,
    male_free INTEGER DEFAULT 0,
    wifi INTEGER,
    utilities INTEGER,
    lat REAL,
    lng REAL,
    images TEXT,
    virtual_tour TEXT,
    description TEXT,
    address TEXT,
    amenities TEXT,
    universities TEXT,
    room_count INTEGER DEFAULT 1,
    metro_distance_min INTEGER DEFAULT 0,
    min_contract_months INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(provider_id) REFERENCES providers(id),
    FOREIGN KEY(published_place_id) REFERENCES places(id)
  )`);

  db.run("ALTER TABLE provider_listings ADD COLUMN room_count INTEGER DEFAULT 1", () => {});
  db.run("ALTER TABLE provider_listings ADD COLUMN metro_distance_min INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE provider_listings ADD COLUMN min_contract_months INTEGER DEFAULT 1", () => {});

  db.run("UPDATE places SET free_spots = COALESCE(female_free, 0) + COALESCE(male_free, 0)");

  // ---- Reviews ----
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    university TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(place_id) REFERENCES places(id)
  )`);

  // ---- Seed places ----
  db.get("SELECT count(*) as count FROM places", (err, row) => {
    if (err || !row) { console.error("DB seed check failed:", err); return; }
    if (row.count > 0) return;

    const places = [
      {
        name: "Campus House Bakı",
        type: "hostel", city: "baku", gender: "mixed",
        price: 350, total_spots: 12, free_spots: 4,
        female_occupied: 5, male_occupied: 3, female_free: 2, male_free: 2,
        wifi: 1, utilities: 1,
        lat: 40.4093, lng: 49.8671,
        images: JSON.stringify([
          "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
        ]),
        virtual_tour: "https://my.matterport.com/show/?m=zEWsxhZpGba",
        description: "Bakı şəhərinin mərkəzində, universitetlərə yaxın müasir yataqxana. Hər otaqda 2-4 yataq, ortaq mətbəx, iş zonası və 24/7 nəzarət.",
        address: "Nizami küç. 45, Bakı",
        amenities: JSON.stringify(["wifi", "kitchen", "laundry", "study_room", "security", "heating", "ac", "parking"]),
        universities: JSON.stringify([
          { code: "BDU", name: "Bakı Dövlət Universiteti", distance_min: 7 },
          { code: "ADA", name: "ADA Universiteti", distance_min: 12 },
          { code: "ASOA", name: "Azərbaycan Dövlət Neft və Sənaye Universiteti", distance_min: 9 },
        ]),
        rating: 4.5, review_count: 28
      },
      {
        name: "Gəncə Student Hostel",
        type: "hostel", city: "ganja", gender: "mixed",
        price: 210, total_spots: 20, free_spots: 1,
        female_occupied: 10, male_occupied: 9, female_free: 1, male_free: 0,
        wifi: 1, utilities: 0,
        lat: 40.6828, lng: 46.3606,
        images: JSON.stringify([
          "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
        ]),
        virtual_tour: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
        description: "Gəncə şəhərinin tələbə yataqxanası. Sərfəli qiymət, sadə şərait, universitetə yaxın yerləşmə.",
        address: "Atatürk pr. 102, Gəncə",
        amenities: JSON.stringify(["wifi", "kitchen", "laundry", "study_room", "heating"]),
        universities: JSON.stringify([
          { code: "GDU", name: "Gəncə Dövlət Universiteti", distance_min: 5 },
          { code: "AzTU", name: "Azərbaycan Texniki Universiteti (Gəncə filialı)", distance_min: 10 },
        ]),
        rating: 4.0, review_count: 15
      },
      {
        name: "Sumqayıt Studio",
        type: "apartment", city: "sumgayit", gender: "female",
        price: 450, total_spots: 4, free_spots: 2,
        female_occupied: 2, male_occupied: 0, female_free: 2, male_free: 0,
        wifi: 1, utilities: 1,
        lat: 40.5897, lng: 49.6689,
        images: JSON.stringify([
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
        ]),
        virtual_tour: "https://my.matterport.com/show/?m=tFkLgKEbcaA",
        description: "Sumqayıtda yalnız qızlar üçün rahat studio mənzil. Tam mebelli, kommunal daxil, yüksək sürətli internet.",
        address: "Sülh küç. 18, Sumqayıt",
        amenities: JSON.stringify(["wifi", "kitchen", "laundry", "ac", "heating", "security", "tv"]),
        universities: JSON.stringify([
          { code: "SDU", name: "Sumqayıt Dövlət Universiteti", distance_min: 8 },
        ]),
        rating: 4.8, review_count: 12
      },
      {
        name: "Baku Luxury Rooms",
        type: "hotel", city: "baku", gender: "male",
        price: 850, total_spots: 10, free_spots: 3,
        female_occupied: 0, male_occupied: 7, female_free: 0, male_free: 3,
        wifi: 1, utilities: 1,
        lat: 40.3777, lng: 49.8450,
        images: JSON.stringify([
          "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80",
        ]),
        virtual_tour: "https://my.matterport.com/show/?m=zEWsxhZpGba",
        description: "Premium-class otel otaqları yalnız oğlanlar üçün. Tam xidmət, gündəlik təmizlik, fitnes zalı.",
        address: "Neftçilər pr. 88, Bakı",
        amenities: JSON.stringify(["wifi", "ac", "heating", "gym", "tv", "security", "parking", "cleaning"]),
        universities: JSON.stringify([
          { code: "ASOA", name: "Azərbaycan Dövlət Neft və Sənaye Universiteti", distance_min: 6 },
          { code: "UNEC", name: "Azərbaycan Dövlət İqtisad Universiteti", distance_min: 11 },
        ]),
        rating: 4.7, review_count: 22
      },
      {
        name: "Elite Dormitory",
        type: "hostel", city: "baku", gender: "female",
        price: 300, total_spots: 30, free_spots: 15,
        female_occupied: 15, male_occupied: 0, female_free: 15, male_free: 0,
        wifi: 1, utilities: 0,
        lat: 40.3850, lng: 49.8200,
        images: JSON.stringify([
          "https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
        ]),
        virtual_tour: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
        description: "Yalnız qızlar üçün böyük yataqxana, dərslik zonası, ümumi mətbəx və camaşırxana.",
        address: "Tbilisi pr. 25, Bakı",
        amenities: JSON.stringify(["wifi", "kitchen", "laundry", "study_room", "security", "heating"]),
        universities: JSON.stringify([
          { code: "BDU", name: "Bakı Dövlət Universiteti", distance_min: 14 },
          { code: "AzMİU", name: "Azərbaycan Memarlıq və İnşaat Universiteti", distance_min: 8 },
        ]),
        rating: 4.2, review_count: 41
      },
    ];

    const stmt = db.prepare(`INSERT INTO places
      (name, type, city, gender, price, total_spots, free_spots,
       female_occupied, male_occupied, female_free, male_free,
       wifi, utilities, lat, lng, images, virtual_tour, description, address, amenities, universities,
       rating, review_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    places.forEach((p) => {
      stmt.run(p.name, p.type, p.city, p.gender, p.price, p.total_spots, p.free_spots,
        p.female_occupied, p.male_occupied, p.female_free, p.male_free,
        p.wifi, p.utilities, p.lat, p.lng, p.images, p.virtual_tour, p.description,
        p.address, p.amenities, p.universities, p.rating, p.review_count);
    });
    stmt.finalize();

    // ---- Seed reviews ----
    const reviews = [
      { place_id: 1, author_name: "Aysel M.", rating: 5, university: "BDU", comment: "Çox təmiz və universitetə yaxın. Admin çox dəstəkçidir, problemləri tez həll edirlər." },
      { place_id: 1, author_name: "Rüfət H.", rating: 4, university: "ASOA", comment: "Yaxşı yerləşmə və qiymət. Wi-Fi sürəti bəzən düşür amma ümumilikdə razıyam." },
      { place_id: 1, author_name: "Sevinc Q.", rating: 5, university: "BDU", comment: "İki ildir qalıram, hər şey əla! Otaqlar geniş, kommunal daxildir." },
      { place_id: 2, author_name: "Elnur Ə.", rating: 4, university: "GDU", comment: "Sərfəli qiymət, sadə şərait. Kommunal ayrı ödənilir." },
      { place_id: 2, author_name: "Nigar T.", rating: 4, university: "GDU", comment: "Universitetə 5 dəqiqəyə çatıram. Tələbələr üçün ideal." },
      { place_id: 3, author_name: "Lalə B.", rating: 5, university: "SDU", comment: "Çox rahat və təmiz studio. Yalnız qızlar olduğu üçün təhlükəsiz hiss edirəm." },
      { place_id: 3, author_name: "Aytac R.", rating: 5, university: "SDU", comment: "Mənzilin bütün avadanlıqları yenidir. Çox bəyəndim." },
      { place_id: 4, author_name: "Emil S.", rating: 5, university: "ASOA", comment: "Premium səviyyə xidmət. Fitnes zalı və gündəlik təmizlik fərq yaradır." },
      { place_id: 4, author_name: "Tural Q.", rating: 4, university: "UNEC", comment: "Qiymət bir az yüksəkdir amma keyfiyyət buna dəyər." },
      { place_id: 5, author_name: "Günel A.", rating: 4, university: "AzMİU", comment: "Böyük yataqxana, dostlarla tanış olmaq üçün əla. Mətbəx böyük və təmizdir." },
      { place_id: 5, author_name: "Səbinə M.", rating: 5, university: "BDU", comment: "Dərslik zonası çox sakitdir, imtahanlara hazırlaşmaq üçün ideal." },
    ];

    const rstmt = db.prepare(`INSERT INTO reviews (place_id, author_name, rating, comment, university) VALUES (?, ?, ?, ?, ?)`);
    reviews.forEach((r) => rstmt.run(r.place_id, r.author_name, r.rating, r.comment, r.university));
    rstmt.finalize();

    console.log("Database seeded: places, reviews.");
  });
});

module.exports = db;
