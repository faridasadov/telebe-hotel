// =========================================
// StudentStay — Application
// =========================================
const API_URL = window.STUDENTSTAY_API_URL || (window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api");
const STORE = { lang: "lang", theme: "theme" };
const SUPPORTED_LANGS = ["az", "ru", "en"];

// ---------- i18n ----------
const getLang = () => {
  const lang = localStorage.getItem(STORE.lang) || "az";
  return SUPPORTED_LANGS.includes(lang) ? lang : "az";
};

function t(key, vars) {
  const dict = window.I18N[getLang()] || window.I18N.az;
  let str = dict[key] ?? window.I18N.az[key] ?? key;
  if (vars) Object.keys(vars).forEach((k) => (str = str.replace(`{${k}}`, vars[k])));
  return str;
}

function applyLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = "az";
  localStorage.setItem(STORE.lang, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const value = t(key);
    if (el.tagName === "META") el.setAttribute("content", value);
    else if (el.tagName === "TITLE") el.textContent = value;
    else if (key === "hero.title") el.innerHTML = value;
    else el.textContent = value;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  renderPlaces();
}

// ---------- Theme ----------
const getTheme = () => localStorage.getItem(STORE.theme) || "light";
function applyTheme(theme) {
  localStorage.setItem(STORE.theme, theme);
  document.documentElement.setAttribute("data-theme", theme);
  if (map) setTimeout(() => map.invalidateSize(), 50);
}

// ---------- Helpers ----------
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const cityLocal = {
  az: { baku: "Bakı", ganja: "Gəncə", sumgayit: "Sumqayıt" },
  ru: { baku: "Баку", ganja: "Гянджа", sumgayit: "Сумгайыт" },
  en: { baku: "Baku", ganja: "Ganja", sumgayit: "Sumgayit" },
};
const cityName = (c) => (cityLocal[getLang()] && cityLocal[getLang()][c]) || c;
const typeName = (x) => t({ hostel: "opt.hostel", apartment: "opt.apartment", hotel: "opt.hotel" }[x] || "opt.all");
const genderName = (g) => t({ female: "opt.femaleOnly", male: "opt.maleOnly", mixed: "opt.mixed" }[g] || "opt.all");

const STATIC_PLACES = [
  {
    id: 1,
    name: "Campus House Bakı (Demo)",
    type: "hostel",
    city: "baku",
    gender: "mixed",
    price: 350,
    total_spots: 12,
    free_spots: 4,
    female_occupied: 5,
    male_occupied: 3,
    female_free: 2,
    male_free: 2,
    wifi: 1,
    utilities: 1,
    room_count: 2,
    metro_distance_min: 8,
    min_contract_months: 3,
    verified_owner: 1,
    address: "Bakı, Elmlər Akademiyası metrosu yaxınlığı",
    lat: 40.3777,
    lng: 49.8123,
    description: "Universitetlərə yaxın, sürətli internet və oxu otağı olan tələbə yaşayışı.",
    amenities: ["wifi", "kitchen", "laundry", "study_room", "security"],
    images: ["https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80"],
    rating: 4.5,
    review_count: 28,
    reviews: [
      { id: 1, author_name: "Aysel", university: "BDU", rating: 5, comment: "Sakit mühit və universitetə yaxın məsafə çox rahatdır." },
    ],
    universities: [{ code: "BDU", name: "Bakı Dövlət Universiteti", distance_min: 7 }],
  },
  {
    id: 2,
    name: "Gəncə Student Hostel (Demo)",
    type: "hostel",
    city: "ganja",
    gender: "mixed",
    price: 210,
    total_spots: 20,
    free_spots: 1,
    female_occupied: 10,
    male_occupied: 9,
    female_free: 1,
    male_free: 0,
    wifi: 1,
    utilities: 0,
    room_count: 4,
    metro_distance_min: 12,
    min_contract_months: 1,
    verified_owner: 1,
    address: "Gəncə, universitet zonasına yaxın",
    lat: 40.6828,
    lng: 46.3606,
    description: "Tələbələr üçün büdcəyə uyğun, təhlükəsiz və təmiz yataqxana seçimi.",
    amenities: ["wifi", "kitchen", "security"],
    images: ["https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80"],
    rating: 4.0,
    review_count: 15,
    reviews: [
      { id: 2, author_name: "Murad", university: "GDU", rating: 4, comment: "Qiymətinə görə yaxşıdır, mərkəzə çıxış rahatdır." },
    ],
    universities: [{ code: "GDU", name: "Gəncə Dövlət Universiteti", distance_min: 5 }],
  },
];

function getStatus(p) {
  if (p.free_spots <= 0) return { cls: "status-full", label: t("card.status.full") };
  if (p.free_spots <= 2) return { cls: "status-wait", label: t("card.status.wait") };
  return { cls: "status-open", label: t("card.status.open") };
}

// SVG icons
const ICON = {
  star: (filled) => `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 9a16 16 0 0 1 20 0"/><circle cx="12" cy="20" r="1"/></svg>`,
  kitchen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>`,
  laundry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="14" r="5"/><path d="M7 6h.01M11 6h.01"/></svg>`,
  study_room: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  security: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  heating: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8M5 8l7 7 7-7M4 18h16"/></svg>`,
  ac: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20M5 6l7 6-7 6M19 6l-7 6 7 6"/></svg>`,
  parking: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>`,
  gym: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M3 9l3-3 3 3M15 21l3-3 3 3M9 3l3 3M21 15l-3 3"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  cleaning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22H6a2 2 0 0 1-2-2v-3l2-8h12l2 8v3a2 2 0 0 1-2 2zM8 22v-4M16 22v-4"/></svg>`,
  walk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M14 12l-3 4 3 6M9 9l4 3M4 22l3-8 2-2"/></svg>`,
};

// ---------- Translation (Google Translate — free, no API key needed) ----------
const translationCache = new Map();

async function translateText(text, targetLang, sourceLang = "az") {
  if (!text || sourceLang === targetLang) return text;
  // Google uses zh-CN for Simplified Chinese
  const target = targetLang === "zh" ? "zh-CN" : targetLang;
  const cacheKey = `${sourceLang}|${target}|${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url);
    if (!r.ok) return text;
    const data = await r.json();
    // Response is nested arrays: [[["translated","original",...],...],...]
    const translated = data[0].map((chunk) => chunk[0]).join("").trim();
    if (translated) {
      translationCache.set(cacheKey, translated);
      return translated;
    }
  } catch (e) {
    console.error("Google Translate failed:", e);
  }
  return text;
}

function starRow(rating, count, big = false) {
  const filled = Math.round(rating);
  const stars = Array.from({ length: 5 }, (_, i) => ICON.star(i < filled)).join("");
  return `<div class="rating-row">
    <span class="stars ${big ? 'stars-lg' : ''}">${stars}</span>
    <strong>${rating.toFixed(1)}</strong>
    ${count ? `<span>(${count} ${t("card.reviews")})</span>` : ""}
  </div>`;
}

// ---------- DOM ----------
const placeGrid = document.querySelector("#placeGrid");
const resultCount = document.querySelector("#resultCount");
const priceFilter = document.querySelector("#priceFilter");
const priceValue = document.querySelector("#priceValue");
const filters = {
  city: document.querySelector("#cityFilter"),
  type: document.querySelector("#typeFilter"),
  gender: document.querySelector("#genderFilter"),
  university: document.querySelector("#universityFilter"),
  price: priceFilter,
  wifi: document.querySelector("#wifiFilter"),
  utilities: document.querySelector("#utilityFilter"),
  rooms: document.querySelector("#roomFilter"),
  metro: document.querySelector("#metroFilter"),
  contract: document.querySelector("#contractFilter"),
  ac: document.querySelector("#acFilter"),
  heating: document.querySelector("#heatingFilter"),
  sort: document.querySelector("#sortFilter"),
};

// ---------- Card ----------
function placeCard(place) {
  const v = place.free_spots;
  const occupied = place.total_spots - v;
  const percent = place.total_spots > 0 ? Math.round((occupied / place.total_spots) * 100) : 0;
  const status = getStatus(place);
  const cover = (place.images && place.images[0]) || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=900&q=80";
  const nearest = place.universities && place.universities[0];

  return `
    <article class="place-card">
      <div class="place-image" data-open-place="${place.id}">
        <img src="${escHtml(cover)}" alt="${escHtml(place.name)}" loading="lazy">
        <span class="price-tag">${escHtml(String(place.price))} AZN</span>
      </div>
      <div class="place-body">
        <div class="place-title">
          <div>
            <h3 data-open-place="${place.id}">${escHtml(place.name)}</h3>
            <small>${escHtml(cityName(place.city))}</small>
          </div>
          <span class="status ${status.cls}">${status.label}</span>
        </div>

        ${place.rating > 0 ? starRow(place.rating, place.review_count) : ""}

        <div class="tags">
          <span class="tag">${escHtml(typeName(place.type))}</span>
          <span class="tag">${escHtml(genderName(place.gender))}</span>
          ${place.verified_owner ? `<span class="tag verified-owner">Verified Owner</span>` : ""}
          <span class="tag">${place.utilities ? t("card.tag.utilOn") : t("card.tag.utilOff")}</span>
          <span class="tag">${place.wifi ? t("card.tag.wifiOn") : t("card.tag.wifiOff")}</span>
        </div>

        <div class="occupancy">
          <div><span>${t("card.beds")}</span><strong>${place.total_spots}</strong></div>
          <div><span>${t("card.vacant")}</span><strong>${place.free_spots}</strong></div>
          <div><span>${t("card.occupied")}</span><strong>${occupied}</strong></div>
          <div><span>${t("card.occupancy")}</span><strong>${percent}%</strong></div>
          <div><span>${t("card.rooms")}</span><strong>${place.room_count || 1}</strong></div>
          <div><span>${t("card.metro")}</span><strong>${place.metro_distance_min || "—"}</strong></div>
        </div>
        <div class="meter"><span style="width: ${percent}%"></span></div>

        <div class="gender-breakdown">
          <span>${t("card.gender.occupied", { f: place.female_occupied, m: place.male_occupied })}</span>
          <strong class="vacancy-info">${
            place.female_free > 0 && place.male_free > 0 
              ? t("card.gender.free.both", { f: place.female_free, m: place.male_free })
              : place.female_free > 0 
                ? t("card.gender.free.f", { n: place.female_free })
                : place.male_free > 0 
                  ? t("card.gender.free.m", { n: place.male_free })
                  : ""
          }</strong>
        </div>

        ${nearest ? `<div class="card-meta">
          <span class="uni-badge">${ICON.pin}<span>${escHtml(nearest.code)} · ${nearest.distance_min} ${t("modal.minWalk")}</span></span>
        </div>` : ""}

        <a class="btn btn-primary" href="#" data-open-place="${place.id}">${t("card.apply")} →</a>
      </div>
    </article>
  `;
}

// ---------- Data ----------
async function fetchPlaces() {
  const params = new URLSearchParams({
    city: filters.city.value,
    type: filters.type.value,
    gender: filters.gender.value,
    university: filters.university ? filters.university.value : "all",
    maxPrice: filters.price.value,
    wifi: filters.wifi.checked,
    utilities: filters.utilities.checked,
    rooms: filters.rooms ? filters.rooms.value : "all",
    maxMetro: filters.metro ? filters.metro.value : "",
    minContract: filters.contract ? filters.contract.value : "",
    ac: filters.ac ? filters.ac.checked : false,
    heating: filters.heating ? filters.heating.checked : false,
  });

  try {
    const r = await fetch(`${API_URL}/places?${params}`);
    if (!r.ok) throw new Error("server");
    let data = await r.json();
    if (filters.sort.value === "price") data.sort((a, b) => a.price - b.price);
    else if (filters.sort.value === "vacancy") data.sort((a, b) => b.free_spots - a.free_spots);
    return data;
  } catch (e) {
    console.warn("Backend not found, using static fallback.");
    return STATIC_PLACES;
  }
}

async function renderPlaces() {
  if (!placeGrid) return;
  priceValue.textContent = filters.price.value;
  const data = await fetchPlaces();

  if (data === null) {
    placeGrid.innerHTML = `<div class="empty-state"><h3>${t("card.offline.title")}</h3><p>${t("card.offline.body")}</p></div>`;
    resultCount.textContent = "—";
    return;
  }

  resultCount.textContent = t("results.count", { n: data.length });
  placeGrid.innerHTML = data.length
    ? data.map(placeCard).join("")
    : `<div class="empty-state"><h3>${t("card.empty.title")}</h3><p>${t("card.empty.body")}</p></div>`;

  updateMapMarkers(data);
}

// ---------- Click delegation ----------
document.addEventListener("click", (e) => {
  // Open property detail
  const opener = e.target.closest("[data-open-place]");
  if (opener) {
    e.preventDefault();
    openPlaceModal(opener.dataset.openPlace);
    return;
  }
  // Close modal
  if (e.target.closest("[data-close]")) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if (e.key === "ArrowLeft") galleryStep(-1);
  if (e.key === "ArrowRight") galleryStep(1);
});

// ---------- Modal ----------
const modal = document.querySelector("#placeModal");
const modalBody = document.querySelector("#modalBody");
let currentPlace = null;
let galleryIndex = 0;

async function openPlaceModal(id) {
  try {
    const r = await fetch(`${API_URL}/places/${id}`);
    currentPlace = r.ok ? await r.json() : STATIC_PLACES.find((p) => String(p.id) === String(id));
    if (!currentPlace) return;
    galleryIndex = 0;
    renderModal();
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  } catch (e) {
    currentPlace = STATIC_PLACES.find((p) => String(p.id) === String(id));
    if (!currentPlace) {
      console.error(e);
      return;
    }
    galleryIndex = 0;
    renderModal();
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
}

function closeModal() {
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentPlace = null;
}

function renderModal() {
  if (!currentPlace) return;
  const p = currentPlace;
  const images = (p.images && p.images.length) ? p.images : [];
  const reviews = p.reviews || [];

  const galleryHtml = images.length ? `
    <div class="gallery">
      <div class="gallery-main">
        <img id="galMainImg" src="${escHtml(images[galleryIndex])}" alt="${escHtml(p.name)}">
        ${images.length > 1 ? `
          <button class="gallery-arrow prev" data-gallery="-1" aria-label="Previous">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="gallery-arrow next" data-gallery="1" aria-label="Next">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        ` : ""}
        <span class="gallery-counter">${galleryIndex + 1} / ${images.length}</span>
      </div>
      ${images.length > 1 ? `
        <div class="gallery-thumbs">
          ${images.map((img, i) => `
            <button class="gallery-thumb ${i === galleryIndex ? 'active' : ''}" data-gallery-thumb="${i}">
              <img src="${escHtml(img)}" alt="">
            </button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  ` : "";

  const amenitiesHtml = (p.amenities && p.amenities.length) ? `
    <div class="modal-section">
      <h3 class="modal-h3">${t("modal.amenities")}</h3>
      <div class="amenities-grid">
        ${p.amenities.map((a) => `
          <div class="amenity">${ICON[a] || ICON.wifi}<span>${t("amenities." + a)}</span></div>
        `).join("")}
      </div>
    </div>
  ` : "";

  const uniHtml = (p.universities && p.universities.length) ? `
    <div class="modal-section">
      <h3 class="modal-h3">${t("modal.universities")}</h3>
      <div class="uni-list">
        ${p.universities.map((u) => `
          <div class="uni-item">
            <div>
              <div class="uni-name">${escHtml(u.code)}</div>
              <small style="color: var(--text-muted)">${escHtml(u.name)}</small>
            </div>
            <span class="uni-distance">${ICON.walk}${u.distance_min} ${t("modal.minWalk")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  const vtourHtml = p.virtual_tour ? `
    <div class="modal-section">
      <h3 class="modal-h3">${t("modal.virtualTour")}</h3>
      <div class="vtour-wrap">
        <iframe src="${escHtml(p.virtual_tour)}" allowfullscreen allow="xr-spatial-tracking" loading="lazy"></iframe>
      </div>
    </div>
  ` : "";

  const reviewsHtml = `
    <div class="modal-section">
      <h3 class="modal-h3">${t("reviews.title")}</h3>
      ${reviews.length ? `
        <div class="reviews-summary">
          <div>
            <div class="big-rating">${p.rating.toFixed(1)}</div>
            ${starRow(p.rating, 0, true)}
            <div class="meta">${t("reviews.based", { n: p.review_count })}</div>
          </div>
        </div>
        <div class="reviews-list">
          ${reviews.map((r) => `
            <div class="review" data-review-id="${r.id}">
              <div class="review-head">
                <div class="review-author">${escHtml(r.author_name)}<small>${escHtml(r.university || "")}</small></div>
                ${starRow(r.rating, 0)}
              </div>
              ${r.comment ? `
                <p class="review-comment" data-original="${escHtml(r.comment)}">${escHtml(r.comment)}</p>
                ${getLang() !== "az" ? `<button class="btn-translate" data-translate-review="${r.id}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>
                  <span>${t("reviews.translate")}</span>
                </button>` : ""}
              ` : ""}
            </div>
          `).join("")}
        </div>
      ` : `<p style="color: var(--text-muted)">${t("reviews.noReviews")}</p>`}

      <form class="review-form" id="reviewForm">
        <h4 style="margin: 0; font-size: var(--fs-md)">${t("reviews.writeReview")}</h4>
        <label class="field">
          <span>${t("reviews.yourName")}</span>
          <input name="author_name" required>
        </label>
        <label class="field">
          <span>${t("reviews.yourUniversity")}</span>
          <input name="university">
        </label>
        <div class="field">
          <span>${t("reviews.yourRating")}</span>
          <div class="rating-input" id="ratingInput">
            ${[1,2,3,4,5].map((n) => `<button type="button" data-rate="${n}">${ICON.star(true)}</button>`).join("")}
            <input type="hidden" name="rating" value="0">
          </div>
        </div>
        <label class="field">
          <span>${t("reviews.yourComment")}</span>
          <textarea name="comment" rows="3"></textarea>
        </label>
        <button type="submit" class="btn btn-primary">${t("reviews.submit")}</button>
      </form>
    </div>
  `;

  modalBody.innerHTML = `
    ${galleryHtml}
    <div class="modal-header">
      <div>
        <h2 id="modalTitle">${escHtml(p.name)}</h2>
        <small>${ICON.pin}<span>${escHtml(p.address || cityName(p.city))}</span></small>
        <div class="gender-breakdown" style="margin-top: var(--sp-2); border: 1px solid var(--border)">
          <span>${t("card.gender.occupied", { f: p.female_occupied, m: p.male_occupied })}</span>
          <strong class="vacancy-info">${
            p.female_free > 0 && p.male_free > 0 
              ? t("card.gender.free.both", { f: p.female_free, m: p.male_free })
              : p.female_free > 0 
                ? t("card.gender.free.f", { n: p.female_free })
                : p.male_free > 0 
                  ? t("card.gender.free.m", { n: p.male_free })
                  : ""
          }</strong>
        </div>
      </div>
      <div class="modal-price">
        <strong>${escHtml(String(p.price))} AZN</strong>
        <span>${t("modal.perMonth")}</span>
      </div>
    </div>

    ${p.description ? `
      <div class="modal-section">
        <h3 class="modal-h3">${t("modal.about")}</h3>
        <p class="modal-description">${escHtml(p.description)}</p>
      </div>
    ` : ""}

    ${amenitiesHtml}
    ${uniHtml}
    ${vtourHtml}
    ${reviewsHtml}

    <div class="modal-cta-bar">
      <div class="price">
        <strong>${escHtml(String(p.price))} AZN</strong>
        <span>${t("modal.perMonth")}</span>
      </div>
      <a class="btn btn-primary btn-lg" href="#booking" id="modalBook">${t("modal.bookNow")} →</a>
    </div>
  `;

  // Gallery controls
  modalBody.querySelectorAll("[data-gallery]").forEach((b) => {
    b.addEventListener("click", () => galleryStep(parseInt(b.dataset.gallery)));
  });
  modalBody.querySelectorAll("[data-gallery-thumb]").forEach((b) => {
    b.addEventListener("click", () => { galleryIndex = parseInt(b.dataset.galleryThumb); renderModal(); });
  });

  // Rating input
  const rinput = modalBody.querySelector("#ratingInput");
  if (rinput) {
    rinput.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = parseInt(btn.dataset.rate);
        rinput.querySelector("input[name=rating]").value = n;
        rinput.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i < n));
      });
    });
  }

  // Review form submit
  const rform = modalBody.querySelector("#reviewForm");
  if (rform) {
    rform.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(rform);
      const payload = Object.fromEntries(fd.entries());
      payload.rating = parseInt(payload.rating);
      if (!payload.rating) { alert(t("reviews.yourRating")); return; }
      const r = await fetch(`${API_URL}/places/${p.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        alert(t("reviews.success"));
        openPlaceModal(p.id); // reload modal
      }
    });
  }

  // Translate review buttons
  modalBody.querySelectorAll("[data-translate-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reviewEl = btn.closest(".review");
      const commentEl = reviewEl.querySelector(".review-comment");
      const labelSpan = btn.querySelector("span");
      const original = commentEl.dataset.original;
      const isTranslated = btn.dataset.state === "translated";

      if (isTranslated) {
        commentEl.textContent = original;
        labelSpan.textContent = t("reviews.translate");
        btn.dataset.state = "";
        return;
      }

      labelSpan.textContent = t("reviews.translating");
      btn.disabled = true;
      const translated = await translateText(original, getLang(), "az");
      commentEl.textContent = translated;
      labelSpan.textContent = t("reviews.original");
      btn.dataset.state = "translated";
      btn.disabled = false;
    });
  });

  // Book button → scroll to booking + selection
  const bookBtn = modalBody.querySelector("#modalBook");
  if (bookBtn) {
    bookBtn.addEventListener("click", () => {
      setPlaceSelection(String(p.id), p.name);
      closeModal();
    });
  }
}

function galleryStep(dir) {
  if (!currentPlace || !currentPlace.images || !currentPlace.images.length) return;
  const len = currentPlace.images.length;
  galleryIndex = (galleryIndex + dir + len) % len;
  renderModal();
}

function setPlaceSelection(id, name) {
  const ta = document.querySelector("textarea[name='note']");
  if (ta) ta.value = `${t("opt.select")}: ${name} (ID: ${id})\n`;
  window.selectedPlaceId = id;
}

// ---------- Filter bindings ----------
Object.values(filters).forEach((el) => {
  if (!el) return;
  el.addEventListener("input", renderPlaces);
  el.addEventListener("change", renderPlaces);
});

document.querySelector("#resetFilters")?.addEventListener("click", () => {
  filters.city.value = "all";
  filters.type.value = "all";
  filters.gender.value = "all";
  if (filters.university) filters.university.value = "all";
  filters.price.value = "900";
  filters.wifi.checked = false;
  filters.utilities.checked = false;
  if (filters.rooms) filters.rooms.value = "all";
  if (filters.metro) filters.metro.value = "";
  if (filters.contract) filters.contract.value = "";
  if (filters.ac) filters.ac.checked = false;
  if (filters.heating) filters.heating.checked = false;
  filters.sort.value = "recommended";
  renderPlaces();
});

document.querySelector("#heroSearch")?.addEventListener("click", () => {
  filters.city.value = document.querySelector("#heroCity").value;
  filters.gender.value = document.querySelector("#heroGender").value;
  renderPlaces();
  document.querySelector("#places").scrollIntoView({ behavior: "smooth" });
});

// ---------- Booking form ----------
function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      data: String(reader.result).split(",")[1] || "",
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.querySelector("#bookingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());
  const file = fd.get("document");
  data.document = await fileToPayload(file && file.size ? file : null);
  data.placeId = window.selectedPlaceId || null;
  const note = document.querySelector("#formNote");

  try {
    const r = await fetch(`${API_URL}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (r.ok) {
      note.textContent = t("form.success");
      note.style.color = "var(--success)";
      e.target.reset();
    } else {
      note.textContent = t("form.error");
      note.style.color = "var(--danger)";
    }
  } catch {
    note.textContent = t("form.error");
    note.style.color = "var(--danger)";
  }
});

// ---------- Map ----------
let map = null;
let mapMarkers = [];

function initMap() {
  const el = document.querySelector("#mapCanvas");
  if (!el || map) return;
  map = L.map(el, { zoomControl: true }).setView([40.4093, 49.8671], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const status = document.querySelector("#mapStatus");
  if (status) status.textContent = "Bakı · Gəncə · Sumqayıt";
}

function updateMapMarkers(places) {
  if (!map) initMap();
  if (!map) return;
  mapMarkers.forEach((m) => map.removeLayer(m));
  mapMarkers = [];
  if (!places || places.length === 0) return;

  const bounds = L.latLngBounds();
  let has = false;
  places.forEach((p) => {
    if (p.lat && p.lng) {
      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:180px">
          <b>${escHtml(p.name)}</b><br>
          ${escHtml(String(p.price))} AZN · ${escHtml(cityName(p.city))}<br>
          <a href="#" onclick="event.preventDefault(); openPlaceModal(${p.id})" style="color:#0d9488;font-weight:700">${t("card.apply")} →</a>
        </div>`;
      const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(popup);
      marker.on("click", () => setPlaceSelection(String(p.id), p.name));
      mapMarkers.push(marker);
      bounds.extend([p.lat, p.lng]);
      has = true;
    }
  });
  if (has) map.fitBounds(bounds, { padding: [40, 40] });
}

// Expose for popup
window.openPlaceModal = openPlaceModal;

// ---------- Controls ----------
document.querySelector("#langSwitcher")?.addEventListener("change", (e) => applyLang(e.target.value));
document.querySelector("#themeToggle")?.addEventListener("click", () => applyTheme(getTheme() === "light" ? "dark" : "light"));

// ---------- Locked credit ----------
function lockDesignerCredit() {
  const credit = document.querySelector(".designer-credit");
  if (!credit) return;
  const text = "Designed by Farid Asadov.";
  credit.textContent = text;
  const observer = new MutationObserver(() => {
    if (credit.textContent !== text) credit.textContent = text;
  });
  observer.observe(credit, { childList: true, characterData: true, subtree: true });
}

// ---------- Stats ----------
async function updateStats() {
  try {
    const r = await fetch(`${API_URL}/admin/stats`);
    const stats = await r.json();
    const containers = document.querySelectorAll(".stat strong");
    if (containers.length >= 2) {
      containers[0].textContent = `${stats.totalPlaces}+`;
      containers[1].textContent = stats.totalSpots;
    }
  } catch (e) {}
}

// ---------- Init ----------
(function init() {
  const lang = getLang();
  if (document.querySelector("#langSwitcher")) {
    document.querySelector("#langSwitcher").value = lang;
  }
  applyTheme(getTheme());
  applyLang(lang); 
  lockDesignerCredit();
  updateStats();
})();
