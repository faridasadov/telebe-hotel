const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'studentstay.db'));

const imgs = {
  hostel1: [
    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1200&q=80",
  ],
  hostel2: [
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
  ],
  apt1: [
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  ],
  apt2: [
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1555636222-cae831e670b3?auto=format&fit=crop&w=1200&q=80",
  ],
  hotel1: [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80",
  ],
};

const newPlaces = [
  {
    name: "Sabunçu Student House", type: "hostel", city: "baku", gender: "mixed",
    price: 280, total_spots: 16, free_spots: 6, female_occupied: 5, male_occupied: 5, female_free: 3, male_free: 3,
    wifi: 1, utilities: 0, lat: 40.4456, lng: 49.9028,
    images: imgs.hostel1, address: "Sabunçu r-nu, Bakı", amenities: ["wifi","kitchen","laundry","heating"],
    universities: [{"code":"ADPU","name":"Azərbaycan Dövlət Pedaqoji Universiteti","distance_min":12}],
    description: "Sabunçu rayonunda tələbələr üçün əlverişli qiymətli yataqxana.", rating: 3.9, review_count: 8,
  },
  {
    name: "Nərimanov Apart", type: "apartment", city: "baku", gender: "female",
    price: 520, total_spots: 6, free_spots: 2, female_occupied: 4, male_occupied: 0, female_free: 2, male_free: 0,
    wifi: 1, utilities: 1, lat: 40.4071, lng: 49.8398,
    images: imgs.apt1, address: "Nərimanov r-nu, Bakı", amenities: ["wifi","kitchen","ac","heating","security"],
    universities: [{"code":"BDU","name":"Bakı Dövlət Universiteti","distance_min":8},{"code":"AzTU","name":"Azərbaycan Texniki Universiteti","distance_min":5}],
    description: "Yalnız qızlar üçün tam mebelli mənzil, bütün kommunallar daxil.", rating: 4.6, review_count: 14,
  },
  {
    name: "Xətai Hostel", type: "hostel", city: "baku", gender: "male",
    price: 240, total_spots: 24, free_spots: 8, female_occupied: 0, male_occupied: 16, female_free: 0, male_free: 8,
    wifi: 1, utilities: 0, lat: 40.3869, lng: 49.8743,
    images: imgs.hostel2, address: "Xətai r-nu, Bakı", amenities: ["wifi","kitchen","laundry","study_room","security"],
    universities: [{"code":"ASOA","name":"Azərbaycan Dövlət Neft və Sənaye Universiteti","distance_min":10}],
    description: "Oğlanlar üçün böyük yataqxana, iş zonası və çamaşırxana.", rating: 4.0, review_count: 19,
  },
  {
    name: "Bakı Tələbə Evi", type: "hostel", city: "baku", gender: "mixed",
    price: 310, total_spots: 20, free_spots: 7, female_occupied: 7, male_occupied: 6, female_free: 4, male_free: 3,
    wifi: 1, utilities: 1, lat: 40.4112, lng: 49.8671,
    images: imgs.hostel1, address: "Yasamal r-nu, Bakı", amenities: ["wifi","kitchen","study_room","heating","security"],
    universities: [{"code":"BDU","name":"Bakı Dövlət Universiteti","distance_min":5},{"code":"UNEC","name":"Azərbaycan Dövlət İqtisad Universiteti","distance_min":9}],
    description: "Universitetə yaxın, rahat yaşayış şəraiti.", rating: 4.3, review_count: 31,
  },
  {
    name: "Biləcəri Apart Hostel", type: "hostel", city: "baku", gender: "mixed",
    price: 195, total_spots: 30, free_spots: 12, female_occupied: 10, male_occupied: 8, female_free: 6, male_free: 6,
    wifi: 1, utilities: 0, lat: 40.4389, lng: 49.8012,
    images: imgs.hostel2, address: "Biləcəri, Bakı", amenities: ["wifi","kitchen","laundry"],
    universities: [{"code":"AMEA","name":"Azərbaycan MEA","distance_min":18}],
    description: "Ən sərfəli qiymətli tələbə yataqxanası.", rating: 3.7, review_count: 22,
  },
  {
    name: "Lux Student Flat", type: "apartment", city: "baku", gender: "mixed",
    price: 720, total_spots: 4, free_spots: 1, female_occupied: 2, male_occupied: 1, female_free: 1, male_free: 0,
    wifi: 1, utilities: 1, lat: 40.3993, lng: 49.8621,
    images: imgs.apt2, address: "Neftçilər pr., Bakı", amenities: ["wifi","ac","heating","security","parking","cleaning"],
    universities: [{"code":"ADA","name":"ADA Universiteti","distance_min":7}],
    description: "ADA Universitetinə yaxın premium mənzil, tam şərait.", rating: 4.9, review_count: 6,
  },
  {
    name: "Binəqədi Student Home", type: "hostel", city: "baku", gender: "male",
    price: 175, total_spots: 18, free_spots: 5, female_occupied: 0, male_occupied: 13, female_free: 0, male_free: 5,
    wifi: 1, utilities: 0, lat: 40.4721, lng: 49.8145,
    images: imgs.hostel1, address: "Binəqədi r-nu, Bakı", amenities: ["wifi","kitchen","heating"],
    universities: [{"code":"AzTU","name":"Azərbaycan Texniki Universiteti","distance_min":20}],
    description: "Büdcəyə uyğun oğlanlar yataqxanası.", rating: 3.5, review_count: 11,
  },
  {
    name: "Gəncə Apart 2", type: "apartment", city: "ganja", gender: "female",
    price: 290, total_spots: 8, free_spots: 3, female_occupied: 5, male_occupied: 0, female_free: 3, male_free: 0,
    wifi: 1, utilities: 1, lat: 40.6911, lng: 46.3541,
    images: imgs.apt1, address: "Cavid pr., Gəncə", amenities: ["wifi","kitchen","ac","heating"],
    universities: [{"code":"GDU","name":"Gəncə Dövlət Universiteti","distance_min":6}],
    description: "Gəncədə qızlar üçün rahat mənzil, kommunallar daxil.", rating: 4.2, review_count: 9,
  },
  {
    name: "Gəncə Merkez Hostel", type: "hostel", city: "ganja", gender: "mixed",
    price: 185, total_spots: 22, free_spots: 9, female_occupied: 7, male_occupied: 6, female_free: 5, male_free: 4,
    wifi: 1, utilities: 0, lat: 40.6783, lng: 46.3612,
    images: imgs.hostel2, address: "İnqilab küç., Gəncə", amenities: ["wifi","kitchen","laundry","study_room"],
    universities: [{"code":"GDU","name":"Gəncə Dövlət Universiteti","distance_min":9}],
    description: "Gəncənin mərkəzində qarışıq tələbə yataqxanası.", rating: 4.1, review_count: 17,
  },
  {
    name: "Gəncə VIP Apart", type: "apartment", city: "ganja", gender: "male",
    price: 380, total_spots: 6, free_spots: 2, female_occupied: 0, male_occupied: 4, female_free: 0, male_free: 2,
    wifi: 1, utilities: 1, lat: 40.6845, lng: 46.3589,
    images: imgs.apt2, address: "Hüseinbəyov küç., Gəncə", amenities: ["wifi","kitchen","ac","heating","security"],
    universities: [{"code":"GDU","name":"Gəncə Dövlət Universiteti","distance_min":4}],
    description: "Oğlanlar üçün müasir VIP mənzil.", rating: 4.4, review_count: 5,
  },
  {
    name: "Sumqayıt Hostel Plus", type: "hostel", city: "sumgayit", gender: "mixed",
    price: 220, total_spots: 14, free_spots: 4, female_occupied: 5, male_occupied: 5, female_free: 2, male_free: 2,
    wifi: 1, utilities: 0, lat: 40.5812, lng: 49.6701,
    images: imgs.hostel1, address: "Mikrayonlar, Sumqayıt", amenities: ["wifi","kitchen","laundry","heating"],
    universities: [{"code":"SDU","name":"Sumqayıt Dövlət Universiteti","distance_min":10}],
    description: "Sumqayıtda sərfəli qiymətli tələbə yataqxanası.", rating: 3.8, review_count: 13,
  },
  {
    name: "Sumqayıt Apart Premium", type: "apartment", city: "sumgayit", gender: "female",
    price: 480, total_spots: 4, free_spots: 1, female_occupied: 3, male_occupied: 0, female_free: 1, male_free: 0,
    wifi: 1, utilities: 1, lat: 40.5923, lng: 49.6645,
    images: imgs.apt2, address: "Cəfər Cabbarlı küç., Sumqayıt", amenities: ["wifi","ac","heating","security","tv"],
    universities: [{"code":"SDU","name":"Sumqayıt Dövlət Universiteti","distance_min":5}],
    description: "Qızlar üçün premium apart, bütün şəraitlər var.", rating: 4.7, review_count: 4,
  },
  {
    name: "BDU Qonşuluğu Apart", type: "apartment", city: "baku", gender: "mixed",
    price: 560, total_spots: 5, free_spots: 2, female_occupied: 2, male_occupied: 1, female_free: 1, male_free: 1,
    wifi: 1, utilities: 1, lat: 40.4089, lng: 49.8556,
    images: imgs.apt1, address: "Zahid Xəlilov küç., Bakı", amenities: ["wifi","kitchen","ac","heating","security"],
    universities: [{"code":"BDU","name":"Bakı Dövlət Universiteti","distance_min":3}],
    description: "BDU-ya 3 dəqiqəlik mənzil, tam komfort.", rating: 4.8, review_count: 21,
  },
  {
    name: "ADA Kampus Apart", type: "apartment", city: "baku", gender: "mixed",
    price: 640, total_spots: 4, free_spots: 1, female_occupied: 2, male_occupied: 1, female_free: 1, male_free: 0,
    wifi: 1, utilities: 1, lat: 40.3887, lng: 49.8423,
    images: imgs.hotel1, address: "Ahmadbəyli küç., Bakı", amenities: ["wifi","ac","heating","security","parking","gym"],
    universities: [{"code":"ADA","name":"ADA Universiteti","distance_min":4}],
    description: "ADA tələbələri üçün premium mənzil kompleksi.", rating: 4.9, review_count: 16,
  },
  {
    name: "Sulutepe Mini Hostel", type: "hostel", city: "baku", gender: "male",
    price: 155, total_spots: 10, free_spots: 4, female_occupied: 0, male_occupied: 6, female_free: 0, male_free: 4,
    wifi: 1, utilities: 0, lat: 40.4534, lng: 49.8901,
    images: imgs.hostel2, address: "Sulutəpə, Bakı", amenities: ["wifi","kitchen"],
    universities: [{"code":"ADPU","name":"Azərbaycan Dövlət Pedaqoji Universiteti","distance_min":15}],
    description: "Ən ucuz qiymətli oğlan yataqxanası.", rating: 3.3, review_count: 7,
  },
];

const sql = `INSERT INTO places
  (name, type, city, gender, price, total_spots, free_spots,
   female_occupied, male_occupied, female_free, male_free,
   wifi, utilities, lat, lng, images, description, address,
   amenities, universities, rating, review_count, room_count, metro_distance_min, min_contract_months)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1)`;

db.serialize(() => {
  const stmt = db.prepare(sql);
  newPlaces.forEach(p => {
    stmt.run(
      p.name, p.type, p.city, p.gender, p.price,
      p.total_spots, p.free_spots,
      p.female_occupied, p.male_occupied, p.female_free, p.male_free,
      p.wifi, p.utilities, p.lat, p.lng,
      JSON.stringify(p.images),
      p.description, p.address,
      JSON.stringify(p.amenities),
      JSON.stringify(p.universities),
      p.rating, p.review_count,
      (err) => { if (err) console.error(err.message); }
    );
  });
  stmt.finalize(() => {
    db.get("SELECT COUNT(*) as n FROM places", (e, r) => {
      console.log(`✓ Cəmi elan: ${r.n}`);
      db.close();
    });
  });
});
