// =========================================
// StudentStay — Application
// =========================================
const API_URL = window.STUDENTSTAY_API_URL || (window.location.protocol === "file:" ? "http://localhost:4000/api" : "/api");
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
const minPriceFilter = document.querySelector("#minPriceFilter");
const minPriceValue = document.querySelector("#minPriceValue");
const priceFilter = document.querySelector("#priceFilter");
const priceValue = document.querySelector("#priceValue");
const filters = {
  city: document.querySelector("#cityFilter"),
  type: document.querySelector("#typeFilter"),
  gender: document.querySelector("#genderFilter"),
  university: document.querySelector("#universityFilter"),
  minPrice: minPriceFilter,
  price: priceFilter,
  wifi: document.querySelector("#wifiFilter"),
  utilities: document.querySelector("#utilityFilter"),
  rooms: document.querySelector("#roomFilter"),
  metro: document.querySelector("#metroFilter"),
  contract: document.querySelector("#contractFilter"),
  ac: document.querySelector("#acFilter"),
  heating: document.querySelector("#heatingFilter"),
  favorites: document.querySelector("#favoritesFilter"),
  sort: document.querySelector("#sortFilter"),
};

// ---------- Filter badge & chips ----------
const FILTER_LABELS = {
  city: { baku: "Bakı", ganja: "Gəncə", sumgayit: "Sumqayıt" },
  type: { hostel: "Yataqxana", apartment: "Kirayə ev", hotel: "Hotel" },
  gender: { female: "Qız üçün", male: "Oğlan üçün", mixed: "Qarışıq" },
};

function countActiveFilters() {
  let n = 0;
  if (filters.city?.value !== "all") n++;
  if (filters.type?.value !== "all") n++;
  if (filters.gender?.value !== "all") n++;
  if (filters.university?.value !== "all") n++;
  if (filters.minPrice && parseInt(filters.minPrice.value) > 150) n++;
  if (filters.price && parseInt(filters.price.value) < 900) n++;
  if (filters.wifi?.checked) n++;
  if (filters.utilities?.checked) n++;
  if (filters.ac?.checked) n++;
  if (filters.heating?.checked) n++;
  if (filters.favorites?.checked) n++;
  if (filters.rooms?.value !== "all") n++;
  if (filters.metro?.value) n++;
  if (filters.contract?.value) n++;
  return n;
}

function updateFilterBadge() {
  const badge = document.getElementById("filterBadge");
  const resetBtn = document.getElementById("resetFilters");
  const n = countActiveFilters();
  if (badge) {
    badge.textContent = n;
    badge.style.display = n > 0 ? "" : "none";
  }
  if (resetBtn) resetBtn.style.display = n > 0 ? "" : "none";
}

function renderActiveChips() {
  const container = document.getElementById("activeFilterChips");
  if (!container) return;
  const chips = [];

  const push = (label, resetFn) => chips.push({ label, resetFn });

  if (filters.city?.value !== "all") push(FILTER_LABELS.city[filters.city.value] || filters.city.value, () => { filters.city.value = "all"; });
  if (filters.type?.value !== "all") push(FILTER_LABELS.type[filters.type.value] || filters.type.value, () => { filters.type.value = "all"; });
  if (filters.gender?.value !== "all") push(FILTER_LABELS.gender[filters.gender.value] || filters.gender.value, () => { filters.gender.value = "all"; });
  if (filters.university?.value !== "all") push(filters.university.value, () => { filters.university.value = "all"; });
  if (filters.minPrice && parseInt(filters.minPrice.value) > 150) push(`≥${filters.minPrice.value} AZN`, () => { filters.minPrice.value = "150"; });
  if (filters.price && parseInt(filters.price.value) < 900) push(`≤${filters.price.value} AZN`, () => { filters.price.value = "900"; });
  if (filters.wifi?.checked) push("Wi-Fi", () => { filters.wifi.checked = false; });
  if (filters.utilities?.checked) push("Kommunal", () => { filters.utilities.checked = false; });
  if (filters.ac?.checked) push("Kondisioner", () => { filters.ac.checked = false; });
  if (filters.heating?.checked) push("İstilik", () => { filters.heating.checked = false; });
  if (filters.favorites?.checked) push("♥ Favorilərim", () => { filters.favorites.checked = false; });
  if (filters.rooms?.value !== "all") push(`${filters.rooms.value}+ otaq`, () => { filters.rooms.value = "all"; });
  if (filters.metro?.value) push(`≤${filters.metro.value} dəq`, () => { filters.metro.value = ""; });
  if (filters.contract?.value) push(`${filters.contract.value} ay+`, () => { filters.contract.value = ""; });

  container.style.display = chips.length ? "" : "none";
  container.innerHTML = chips.map((c, i) =>
    `<button class="filter-chip" data-chip-idx="${i}" type="button">${escHtml(c.label)}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`
  ).join("");

  container.querySelectorAll("[data-chip-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      chips[parseInt(btn.dataset.chipIdx)].resetFn();
      renderPlaces();
    });
  });
}

function updateRangeTrack() {
  if (minPriceFilter && priceFilter) {
    const min = parseInt(minPriceFilter.value);
    const max = parseInt(priceFilter.value);
    const total = 900 - 150;
    const minPct = ((min - 150) / total * 100).toFixed(1);
    const maxPct = ((max - 150) / total * 100).toFixed(1);
    minPriceFilter.style.setProperty("--pct", minPct + "%");
    priceFilter.style.setProperty("--pct", maxPct + "%");
  }
}

// ---------- Image helpers ----------
function thumbUrl(url, w = 500) {
  if (!url) return `https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=${w}&q=70`;
  try {
    const u = new URL(url);
    u.searchParams.set("w", String(w));
    u.searchParams.set("q", "70");
    u.searchParams.set("auto", "format");
    return u.toString();
  } catch { return url; }
}

// ---------- Card ----------
function placeCard(place) {
  const v = place.free_spots;
  const occupied = place.total_spots - v;
  const percent = place.total_spots > 0 ? Math.round((occupied / place.total_spots) * 100) : 0;
  const isFull = v <= 0;
  const status = getStatus(place);
  const cover = thumbUrl(place.images && place.images[0]);
  const nearest = place.universities && place.universities[0];
  const isFav = getFavs().has(place.id);

  return `
    <article class="place-card${isFull ? " place-card-full" : ""}">
      <div class="place-image" data-open-place="${place.id}">
        <img src="${escHtml(cover)}" alt="${escHtml(place.name)}" loading="lazy">
        <span class="price-tag">${escHtml(String(place.price))} AZN</span>
        <button class="fav-btn${isFav ? " fav-active" : ""}" type="button" data-fav="${place.id}" title="${isFav ? "Sevimlilərdan çıxar" : "Sevimlilərə əlavə et"}" aria-label="Sevimli">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        ${isFull ? `<div class="full-overlay">Tam dolu</div>` : ""}
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
          ${place.verified_owner ? `<span class="tag verified-owner">${t("card.tag.verified")}</span>` : ""}
          <span class="tag">${place.utilities ? t("card.tag.utilOn") : t("card.tag.utilOff")}</span>
          <span class="tag">${place.wifi ? t("card.tag.wifiOn") : t("card.tag.wifiOff")}</span>
        </div>

        <div class="occupancy">
          <div><span>${t("card.beds")}</span><strong>${place.total_spots}</strong></div>
          <div><span>${t("card.vacant")}</span><strong>${place.free_spots}</strong></div>
          <div><span>${t("card.occupancy")}</span><strong>${percent}%</strong></div>
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

        <div class="card-actions">
          ${isFull
            ? `<button class="btn btn-primary" type="button" data-open-place="${place.id}" style="background:var(--text-muted)">Gözləmə siyahısı →</button>`
            : `<a class="btn btn-primary" href="student.html" data-book-place="${place.id}">${t("card.apply")} →</a>`}
          <div class="card-actions-row">
            <button class="btn btn-sm" type="button" data-report-place="${place.id}">${t("card.report")}</button>
            ${place.lat && place.lng
              ? `<a class="btn btn-sm btn-map-link" href="https://www.google.com/maps?q=${place.lat},${place.lng}" target="_blank" rel="noopener" title="Google Maps-də aç">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  Xəritədə gör
                </a>`
              : `<a class="btn btn-sm btn-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((place.name || '') + ' ' + (place.address || cityName(place.city)) + ' Azərbaycan')}" target="_blank" rel="noopener" title="Google Maps-də axtar">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  Xəritədə gör
                </a>`}
          </div>
        </div>
      </div>
    </article>
  `;
}

// ---------- Favourites ----------
const FAVS_KEY = "ss_favs";
function getFavs() { try { return new Set(JSON.parse(localStorage.getItem(FAVS_KEY)) || []); } catch { return new Set(); } }
function saveFavs(set) { localStorage.setItem(FAVS_KEY, JSON.stringify([...set])); }
function toggleFav(id) {
  const favs = getFavs();
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  saveFavs(favs);
  document.querySelectorAll(`[data-fav="${id}"]`).forEach(btn => {
    btn.classList.toggle("fav-active", favs.has(id));
    btn.title = favs.has(id) ? "Sevimlilərdan çıxar" : "Sevimlilərə əlavə et";
  });
}

// ---------- Data ----------
async function fetchPlaces() {
  const searchEl = document.getElementById("placeSearch");

  // Guard: ensure min <= max for price range
  if (filters.minPrice && filters.price) {
    const minV = parseInt(filters.minPrice.value);
    const maxV = parseInt(filters.price.value);
    if (minV > maxV) filters.price.value = String(minV);
    if (maxV < minV) filters.minPrice.value = String(maxV);
  }

  const params = new URLSearchParams({
    city: filters.city.value,
    type: filters.type.value,
    gender: filters.gender.value,
    university: filters.university ? filters.university.value : "all",
    minPrice: filters.minPrice ? filters.minPrice.value : "150",
    maxPrice: filters.price.value,
    wifi: filters.wifi.checked,
    utilities: filters.utilities.checked,
    rooms: filters.rooms ? filters.rooms.value : "all",
    maxMetro: filters.metro ? filters.metro.value : "",
    minContract: filters.contract ? filters.contract.value : "",
    ac: filters.ac ? filters.ac.checked : false,
    heating: filters.heating ? filters.heating.checked : false,
    q: searchEl ? searchEl.value.trim() : "",
  });

  try {
    const r = await fetch(`${API_URL}/places?${params}`);
    if (!r.ok) throw new Error("server");
    let data = await r.json();
    if (filters.sort.value === "price") data.sort((a, b) => a.price - b.price);
    else if (filters.sort.value === "vacancy") data.sort((a, b) => b.free_spots - a.free_spots);
    else if (filters.sort.value === "rating") data.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    // Favorites filter (client-side)
    if (filters.favorites?.checked) {
      const favs = getFavs();
      data = data.filter(p => favs.has(p.id));
    }
    return data;
  } catch (e) {
    console.warn("Backend not found, using static fallback.");
    let data = STATIC_PLACES;
    if (filters.favorites?.checked) {
      const favs = getFavs();
      data = data.filter(p => favs.has(p.id));
    }
    return data;
  }
}

const PAGE_SIZE = 6;
let _allPlaces = [];
let _currentPage = 1;

function totalPages() { return Math.ceil(_allPlaces.length / PAGE_SIZE); }

function renderPagination() {
  const existing = document.getElementById("placePagination");
  if (existing) existing.remove();
  if (_allPlaces.length <= PAGE_SIZE) return;

  const total = totalPages();
  const cur = _currentPage;

  // build page numbers with ellipsis
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= cur - 1 && i <= cur + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  const wrap = document.createElement("div");
  wrap.id = "placePagination";
  wrap.style.cssText = "grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:6px;padding:16px 0 4px;flex-wrap:wrap";

  const mkBtn = (label, page, active, disabled) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = disabled;
    b.style.cssText = `min-width:38px;height:38px;padding:0 10px;border-radius:var(--r-md);font-size:14px;font-weight:700;border:1.5px solid ${active ? "var(--brand)" : "var(--border)"};background:${active ? "var(--brand)" : "var(--bg-card)"};color:${active ? "#fff" : "var(--text)"};cursor:${disabled ? "default" : "pointer"};opacity:${disabled ? ".4" : "1"};transition:all .15s`;
    if (!disabled && page !== null) {
      b.addEventListener("click", () => {
        _currentPage = page;
        placeGrid.innerHTML = _allPlaces.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(placeCard).join("");
        renderPagination();
        document.getElementById("places")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    return b;
  };

  wrap.appendChild(mkBtn("‹", cur - 1, false, cur === 1));
  pages.forEach(p => {
    if (p === "…") {
      const span = document.createElement("span");
      span.textContent = "…";
      span.style.cssText = "padding:0 4px;color:var(--text-muted);font-weight:700";
      wrap.appendChild(span);
    } else {
      wrap.appendChild(mkBtn(p, p, p === cur, false));
    }
  });
  wrap.appendChild(mkBtn("›", cur + 1, false, cur === total));

  placeGrid.appendChild(wrap);
}

async function renderPlaces() {
  if (!placeGrid) return;
  if (minPriceValue && filters.minPrice) minPriceValue.textContent = filters.minPrice.value;
  if (priceValue && filters.price) priceValue.textContent = filters.price.value;
  updateRangeTrack();
  updateFilterBadge();
  renderActiveChips();

  const data = await fetchPlaces();

  if (data === null) {
    placeGrid.innerHTML = `<div class="empty-state"><h3>${t("card.offline.title")}</h3><p>${t("card.offline.body")}</p></div>`;
    if (resultCount) resultCount.textContent = "—";
    return;
  }

  _allPlaces = data;
  // Re-apply near-me sort if user location is set
  if (_userLat != null) {
    _allPlaces.sort((a, b) => {
      const dA = a.lat && a.lng ? haversineKm(_userLat, _userLng, a.lat, a.lng) : 9999;
      const dB = b.lat && b.lng ? haversineKm(_userLat, _userLng, b.lat, b.lng) : 9999;
      return dA - dB;
    });
  }
  _currentPage = 1;

  if (resultCount) resultCount.textContent = t("results.count", { n: data.length });

  const preview = document.getElementById("filterResultCount");
  if (preview) preview.textContent = `${data.length} obyekt tapıldı`;

  placeGrid.innerHTML = data.length
    ? data.slice(0, PAGE_SIZE).map(placeCard).join("")
    : `<div class="empty-state"><h3>${t("card.empty.title")}</h3><p>${t("card.empty.body")}</p></div>`;

  if (data.length) renderPagination();
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
  if (e.target.closest("[data-report-place]")) {
    e.preventDefault();
    openReportModal(e.target.closest("[data-report-place]").dataset.reportPlace);
  }
  // Favourite toggle
  const favBtn = e.target.closest("[data-fav]");
  if (favBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleFav(parseInt(favBtn.dataset.fav));
  }
  // Book now from card/modal → go to student.html with placeId in sessionStorage
  const bookLink = e.target.closest("[data-book-place]");
  if (bookLink) {
    sessionStorage.setItem("ss_book_place_id", bookLink.dataset.bookPlace);
    const name = bookLink.dataset.bookName || "";
    if (name) sessionStorage.setItem("ss_book_place_name", name);
  }
});

document.querySelector("#mobileMenuBtn")?.addEventListener("click", () => {
  const nav = document.querySelector("#mobileNav");
  const btn = document.querySelector("#mobileMenuBtn");
  const open = !nav.classList.contains("open");
  nav.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
});

document.querySelector("#mobileNav")?.addEventListener("click", (e) => {
  if (!e.target.closest("a")) return;
  document.querySelector("#mobileNav").classList.remove("open");
  document.querySelector("#mobileMenuBtn")?.setAttribute("aria-expanded", "false");
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
            <span class="uni-distance">${ICON.walk}${u.distance_min} ${t("modal.minWalk")}${p.lat && p.lng && u.lat && u.lng ? ` · ${haversineKm(p.lat, p.lng, u.lat, u.lng).toFixed(1)} km` : ""}</span>
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
        <small class="modal-address-row">
          ${ICON.pin}
          <span>${escHtml(p.address || cityName(p.city))}</span>
          ${p.lat && p.lng
            ? `<a class="modal-map-link" href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener" aria-label="Google Maps-də aç">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                Xəritədə gör
              </a>`
            : `<a class="modal-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.address || cityName(p.city)) + ' Azərbaycan')}" target="_blank" rel="noopener" aria-label="Google Maps-də axtar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                Xəritədə gör
              </a>`}
        </small>
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

    ${p.lat && p.lng ? `
      <div class="modal-section modal-minimap">
        <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener" class="modal-minimap-link" aria-label="Google Maps-də aç">
          <img
            src="https://maps.googleapis.com/maps/api/staticmap?center=${p.lat},${p.lng}&zoom=15&size=600x200&maptype=roadmap&markers=color:red%7C${p.lat},${p.lng}&scale=2"
            onerror="this.parentElement.innerHTML='<div class=modal-minimap-fallback><svg width=20 height=20 viewBox=&quot;0 0 24 24&quot; fill=none stroke=currentColor stroke-width=2><path d=&quot;M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z&quot;/><circle cx=12 cy=9 r=2.5/></svg><span>${escHtml(p.address || cityName(p.city))}</span><span class=modal-minimap-cta>Google Maps-də aç ↗</span></div>'"
            alt="Yerləşmə xəritəsi"
            class="modal-minimap-img">
          <span class="modal-minimap-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            Google Maps-də aç
          </span>
        </a>
      </div>
    ` : ""}

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
      <button class="btn btn-sm" type="button" data-report-place="${p.id}">${t("card.report")}</button>
      <button class="btn btn-sm" type="button" id="modalShare" title="Paylaş" style="gap:6px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Paylaş
      </button>
      <a class="btn btn-primary btn-lg" href="student.html" id="modalBook" data-book-place="${p.id}" data-book-name="${escHtml(p.name)}">${t("modal.bookNow")} →</a>
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

  // Share button
  const shareBtn = modalBody.querySelector("#modalShare");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareUrl = `${location.origin}${location.pathname}?place=${p.id}`;
      const shareText = `${p.name} — ${p.price} AZN/ay | StudentStay`;
      if (navigator.share) {
        navigator.share({ title: p.name, text: shareText, url: shareUrl }).catch(() => {});
      } else {
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`;
        const menu = document.createElement("div");
        menu.style.cssText = "position:fixed;bottom:100px;right:24px;z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);padding:12px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:8px;min-width:200px";
        menu.innerHTML = `
          <button onclick="navigator.clipboard.writeText('${shareUrl}');this.textContent='✓ Kopyalandı!'" style="text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:var(--r-sm);font-size:14px;font-weight:600;color:var(--text)">🔗 Linki kopyala</button>
          <a href="${waUrl}" target="_blank" style="display:block;padding:8px 12px;border-radius:var(--r-sm);font-size:14px;font-weight:600;color:#25D366;text-decoration:none">📱 WhatsApp ilə paylaş</a>
        `;
        document.body.appendChild(menu);
        setTimeout(() => menu.remove(), 5000);
        document.addEventListener("click", () => menu.remove(), { once: true });
      }
    });
  }
}

const reportModal = document.querySelector("#reportModal");
const reportForm = document.querySelector("#reportForm");

function openReportModal(placeId) {
  if (!reportModal || !reportForm) return;
  reportForm.elements.placeId.value = placeId;
  qsReport("#reportNote").textContent = "";
  reportModal.setAttribute("aria-hidden", "false");
}

function closeReportModal() {
  if (!reportModal) return;
  reportModal.setAttribute("aria-hidden", "true");
}

function qsReport(selector) {
  return reportModal ? reportModal.querySelector(selector) : null;
}

document.querySelectorAll("[data-report-close]").forEach((el) => {
  el.addEventListener("click", closeReportModal);
});

reportForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qsReport("#reportNote");
  const payload = Object.fromEntries(new FormData(reportForm).entries());
  try {
    const r = await fetch(`${API_URL}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || t("report.error"));
    note.textContent = t("report.success");
    note.style.color = "var(--success)";
    reportForm.reset();
    setTimeout(closeReportModal, 900);
  } catch (err) {
    note.textContent = err.message;
    note.style.color = "var(--danger)";
  }
});

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

document.querySelector("#placeSearch")?.addEventListener("input", () => {
  _currentPage = 1;
  renderPlaces();
});

document.querySelector("#resetFilters")?.addEventListener("click", () => {
  if (filters.city) filters.city.value = "all";
  if (filters.type) filters.type.value = "all";
  if (filters.gender) filters.gender.value = "all";
  if (filters.university) filters.university.value = "all";
  if (filters.minPrice) filters.minPrice.value = "150";
  if (filters.price) filters.price.value = "900";
  if (filters.wifi) filters.wifi.checked = false;
  if (filters.utilities) filters.utilities.checked = false;
  if (filters.rooms) filters.rooms.value = "all";
  if (filters.metro) filters.metro.value = "";
  if (filters.contract) filters.contract.value = "";
  if (filters.ac) filters.ac.checked = false;
  if (filters.heating) filters.heating.checked = false;
  if (filters.favorites) filters.favorites.checked = false;
  if (filters.sort) filters.sort.value = "recommended";
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
      const payload = await r.json().catch(() => ({}));
      note.textContent = `${t("form.success")} Tracking ID: ${payload.trackingCode || payload.id || ""}${payload.expiresAt ? ` · Razılaşma müddəti: ${new Date(payload.expiresAt).toLocaleString()}` : ""}`;
      note.style.color = "var(--success)";
      e.target.reset();
    } else {
      const errData = await r.json().catch(() => ({}));
      note.textContent = errData.error || t("form.error");
      note.style.color = "var(--danger)";
    }
  } catch {
    note.textContent = t("form.error");
    note.style.color = "var(--danger)";
  }
});

document.querySelector("#trackingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = document.querySelector("#trackingNote");
  const code = new FormData(e.currentTarget).get("code");
  try {
    const r = await fetch(`${API_URL}/bookings/status/${encodeURIComponent(String(code || "").trim())}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Status tapılmadı");
    note.textContent = `${data.place_name || "Rezervasiya"}: ${data.status}${data.admin_note ? ` · ${data.admin_note}` : ""}`;
    note.style.color = "var(--success)";
  } catch (err) {
    note.textContent = err.message;
    note.style.color = "var(--danger)";
  }
});

// ---------- Geolocation / Near Me ----------
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let _userLat = null, _userLng = null;

document.getElementById("nearMeBtn")?.addEventListener("click", () => {
  const btn = document.getElementById("nearMeBtn");
  if (!navigator.geolocation) { alert("Brauzeriniz geolokasiyanı dəstəkləmir."); return; }
  btn.textContent = "...";
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    _userLat = pos.coords.latitude;
    _userLng = pos.coords.longitude;
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5"/></svg> Mənə yaxın`;
    btn.classList.add("near-me-active");
    applyNearMeSort();
  }, (err) => {
    btn.disabled = false;
    const isHttpBlocked = location.protocol !== "https:" && location.hostname !== "localhost";
    btn.textContent = isHttpBlocked ? "HTTPS tələb olunur" : "Məkan icazəsi verilmədi";
    btn.title = isHttpBlocked
      ? "Brauzerlər geolokasiya üçün HTTPS bağlantısı tələb edir"
      : "Brauzer parametrlərindən məkan icazəsi verin";
    setTimeout(() => {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> Mənə yaxın`;
      btn.title = "";
    }, 3000);
  }, { timeout: 8000 });
});

function applyNearMeSort() {
  if (_userLat == null || !_allPlaces.length) return;
  _allPlaces.sort((a, b) => {
    const dA = a.lat && a.lng ? haversineKm(_userLat, _userLng, a.lat, a.lng) : 9999;
    const dB = b.lat && b.lng ? haversineKm(_userLat, _userLng, b.lat, b.lng) : 9999;
    return dA - dB;
  });
  renderPage(1);
}

// ---------- Custom SVG Map ----------
// Azerbaijan cities: left% = (lon-44.8)/5.9*100, top% = (41.9-lat)/3.6*100
const AZ_CITIES = [
  { slug: "baku",        name: "Bakı",        left: 86, top: 41 },
  { slug: "ganja",       name: "Gəncə",       left: 26, top: 34 },
  { slug: "sumgayit",    name: "Sumqayıt",    left: 83, top: 36 },
  { slug: "mingachevir", name: "Mingəçevir",  left: 38, top: 31 },
  { slug: "nakhchivan",  name: "Naxçıvan",    left: 10, top: 75 },
  { slug: "lankaran",    name: "Lənkəran",    left: 69, top: 88 },
  { slug: "shirvan",     name: "Şirvan",      left: 70, top: 55 },
  { slug: "quba",        name: "Quba",        left: 63, top: 15 },
  { slug: "sheki",       name: "Şəki",        left: 40, top: 19 },
  { slug: "gabala",      name: "Qəbələ",      left: 51, top: 25 },
  { slug: "yevlakh",     name: "Yevlax",      left: 40, top: 36 },
  { slug: "shamkir",     name: "Şəmkir",      left: 21, top: 30 },
  { slug: "tovuz",       name: "Tovuz",       left: 14, top: 25 },
  { slug: "gazakh",      name: "Qazax",       left: 9,  top: 23 },
  { slug: "agstafa",     name: "Ağstafa",     left: 11, top: 22 },
  { slug: "khachmaz",    name: "Xaçmaz",      left: 68, top: 12 },
  { slug: "zagatala",    name: "Zaqatala",    left: 31, top: 8  },
  { slug: "balakan",     name: "Balakən",     left: 27, top: 5  },
  { slug: "gakh",        name: "Qax",         left: 36, top: 13 },
  { slug: "oguz",        name: "Oğuz",        left: 45, top: 23 },
  { slug: "shamakhi",    name: "Şamaxı",      left: 65, top: 35 },
  { slug: "ismailli",    name: "İsmayıllı",   left: 57, top: 31 },
  { slug: "goychay",     name: "Göyçay",      left: 50, top: 36 },
  { slug: "agdash",      name: "Ağdaş",       left: 45, top: 35 },
  { slug: "ujar",        name: "Ucar",        left: 48, top: 38 },
  { slug: "goranboy",    name: "Goranboy",    left: 34, top: 36 },
  { slug: "dashkasan",   name: "Daşkəsən",    left: 22, top: 38 },
  { slug: "gedabay",     name: "Gədəbəy",     left: 17, top: 37 },
  { slug: "agdam",       name: "Ağdam",       left: 36, top: 53 },
  { slug: "tartar",      name: "Tərtər",      left: 36, top: 43 },
  { slug: "barda",       name: "Bərdə",       left: 40, top: 43 },
  { slug: "agcabadi",    name: "Ağcabədi",    left: 45, top: 51 },
  { slug: "fuzuli",      name: "Füzuli",      left: 40, top: 64 },
  { slug: "beylagan",    name: "Beyləqan",    left: 48, top: 59 },
  { slug: "imishli",     name: "İmişli",      left: 55, top: 56 },
  { slug: "saatli",      name: "Saatlı",      left: 59, top: 55 },
  { slug: "sabirabad",   name: "Sabirabad",   left: 62, top: 53 },
  { slug: "kurdamir",    name: "Kürdəmir",    left: 57, top: 43 },
  { slug: "hajigabul",   name: "Hacıqabul",   left: 70, top: 52 },
  { slug: "salyan",      name: "Salyan",      left: 71, top: 64 },
  { slug: "bilasuvar",   name: "Biləsuvar",   left: 64, top: 68 },
  { slug: "jalilabad",   name: "Cəlilabad",   left: 62, top: 77 },
  { slug: "masalli",     name: "Masallı",     left: 65, top: 81 },
  { slug: "lerik",       name: "Lerik",       left: 61, top: 87 },
  { slug: "astara",      name: "Astara",      left: 69, top: 95 },
  { slug: "shabran",     name: "Şabran",      left: 71, top: 19 },
  { slug: "siyazan",     name: "Siyəzən",     left: 73, top: 23 },
];

// Register all city slugs in cityLocal
AZ_CITIES.forEach(c => {
  cityLocal.az[c.slug] = c.name;
  cityLocal.ru[c.slug] = c.name;
  cityLocal.en[c.slug] = c.name;
});

let _mapView = { scale: 1, x: 0, y: 0 };
let _mapDrag = null;
let _mapCityPlaces = {};
let _mapInited = false;

function _mapClamp(v) {
  const stage = document.getElementById("mapStage");
  const scale = Math.max(1, Math.min(3.4, v.scale));
  if (!stage) return { ...v, scale };
  const w = stage.offsetWidth, h = stage.offsetHeight;
  const maxX = (w * (scale - 1)) / 2, maxY = (h * (scale - 1)) / 2;
  return { scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
}

function _mapApplyView(smooth) {
  const world = document.getElementById("mapWorld");
  const stage = document.getElementById("mapStage");
  if (!world) return;
  if (smooth) stage?.classList.remove("dragging");
  else stage?.classList.add("dragging");
  world.style.transform = `translate(${_mapView.x}px,${_mapView.y}px) scale(${_mapView.scale})`;
  const readout = document.getElementById("mapZoomReadout");
  if (readout) readout.textContent = Math.round(_mapView.scale * 100) + "%";
}

function _mapZoomBy(factor, ox, oy) {
  const stage = document.getElementById("mapStage");
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const cx = ox != null ? ox - rect.left - rect.width / 2 : 0;
  const cy = oy != null ? oy - rect.top - rect.height / 2 : 0;
  const ns = _mapView.scale * factor;
  _mapView = _mapClamp({ scale: ns, x: cx - ((cx - _mapView.x) / _mapView.scale) * ns, y: cy - ((cy - _mapView.y) / _mapView.scale) * ns });
  _mapApplyView(true);
}

function _mapReset() { _mapView = { scale: 1, x: 0, y: 0 }; _mapApplyView(true); _closeMapInfocard(); }

function _closeMapInfocard() {
  const card = document.getElementById("mapInfocard");
  if (card) card.style.display = "none";
  document.querySelectorAll(".ss-map-pin.active").forEach(p => p.classList.remove("active"));
}

function _showMapInfocard(city) {
  const card = document.getElementById("mapInfocard");
  if (!card) return;
  const count = (_mapCityPlaces[city.slug] || []).length;
  card.style.display = "block";
  card.innerHTML = `
    <button class="ss-map-infocard-close" onclick="_closeMapInfocard()" aria-label="Bağla">×</button>
    <div class="ss-map-infocard-title">${escHtml(city.name)}</div>
    <div class="ss-map-infocard-meta">${count} yerləşmə mövcuddur</div>
    <button class="ss-map-infocard-link" onclick="_mapFilterCity('${city.slug}')">
      ${count > 0 ? "Göstər →" : "Yaxında"}
    </button>`;
}

function _mapFilterCity(slug) {
  const cityEl = document.querySelector("#cityFilter");
  if (cityEl) {
    const opt = [...cityEl.options].find(o => o.value === slug);
    if (opt) { cityEl.value = slug; cityEl.dispatchEvent(new Event("change")); }
  }
  _closeMapInfocard();
  document.getElementById("places")?.scrollIntoView({ behavior: "smooth" });
}

function renderMapPins() {
  const container = document.getElementById("mapPins");
  if (!container) return;
  container.innerHTML = AZ_CITIES.map(city => {
    const count = (_mapCityPlaces[city.slug] || []).length;
    const has = count > 0;
    return `<div class="ss-map-pin${has ? "" : " dim"}"
      style="left:${city.left}%;top:${city.top}%;${has ? "--pin-color:#34d399" : ""}"
      title="${escHtml(city.name)}" data-city="${city.slug}">
      ${has ? `<span class="ss-map-pin-pulse"></span>` : ""}
      <span class="ss-map-pin-core">${has ? count : ""}</span>
      ${has ? `<span class="ss-map-pin-label">${escHtml(city.name)}</span>` : ""}
    </div>`;
  }).join("");

  container.querySelectorAll(".ss-map-pin:not(.dim)").forEach(pin => {
    pin.addEventListener("click", e => {
      e.stopPropagation();
      document.querySelectorAll(".ss-map-pin.active").forEach(p => p.classList.remove("active"));
      pin.classList.add("active");
      const city = AZ_CITIES.find(c => c.slug === pin.dataset.city);
      if (city) _showMapInfocard(city);
    });
  });
}

function initMap() {
  if (_mapInited) return;
  _mapInited = true;
  const stage = document.getElementById("mapStage");
  if (!stage) return;

  stage.addEventListener("wheel", e => {
    e.preventDefault();
    _mapZoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
  }, { passive: false });

  stage.addEventListener("pointerdown", e => {
    if (e.target.closest(".ss-map-pin") || e.target.closest(".ss-map-zoom") ||
        e.target.closest(".ss-map-compass") || e.target.closest(".ss-map-infocard")) return;
    _mapDrag = { sx: e.clientX, sy: e.clientY, bx: _mapView.x, by: _mapView.y };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    if (!_mapDrag) return;
    _mapView = _mapClamp({ ..._mapView, x: _mapDrag.bx + e.clientX - _mapDrag.sx, y: _mapDrag.by + e.clientY - _mapDrag.sy });
    _mapApplyView(false);
  });
  const endDrag = () => { _mapDrag = null; stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("click", e => {
    if (!e.target.closest(".ss-map-pin") && !e.target.closest(".ss-map-zoom") &&
        !e.target.closest(".ss-map-compass") && !e.target.closest(".ss-map-infocard")) _closeMapInfocard();
  });

  document.getElementById("mapZoomIn")?.addEventListener("click",    e => { e.stopPropagation(); _mapZoomBy(1.4); });
  document.getElementById("mapZoomOut")?.addEventListener("click",   e => { e.stopPropagation(); _mapZoomBy(0.71); });
  document.getElementById("mapZoomReset")?.addEventListener("click", e => { e.stopPropagation(); _mapReset(); });
}

function updateMapMarkers(places) {
  _mapCityPlaces = {};
  (places || []).forEach(p => {
    const slug = (p.city || "").toLowerCase();
    if (!_mapCityPlaces[slug]) _mapCityPlaces[slug] = [];
    _mapCityPlaces[slug].push(p);
  });
  const activeCities = Object.values(_mapCityPlaces).filter(a => a.length > 0).length;
  const status = document.getElementById("mapStatus");
  if (status) status.textContent = `Azərbaycan · ${activeCities} şəhər · ${places?.length || 0} yerləşmə`;
  renderMapPins();
  if (!_mapInited) initMap();
}

window._closeMapInfocard = _closeMapInfocard;
window._mapFilterCity = _mapFilterCity;

// Expose for popup
window.openPlaceModal = openPlaceModal;

// ---------- Controls ----------
document.querySelector("#langSwitcher")?.addEventListener("change", (e) => applyLang(e.target.value));
document.querySelector("#themeToggle")?.addEventListener("click", (e) => {
  const el = e.currentTarget;
  el.classList.remove("spinning");
  void el.offsetWidth; // reflow to restart animation
  el.classList.add("spinning");
  el.addEventListener("animationend", () => el.classList.remove("spinning"), { once: true });
  applyTheme(getTheme() === "light" ? "dark" : "light");
});

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
    const r = await fetch(`${API_URL}/stats`);
    if (!r.ok) return;
    const stats = await r.json();
    const containers = document.querySelectorAll(".stat strong");
    if (containers.length >= 2) {
      containers[0].textContent = `${Number(stats.totalPlaces || 0)}+`;
      containers[1].textContent = Number(stats.totalSpots || 0);
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

// ============================================================
// AUTH MODAL MODULE
// ============================================================
(function authModule() {
  let _role = null;   // 'student' | 'provider'
  let _mode = 'login'; // 'login' | 'register'

  /* ---- Session check ---- */
  async function checkSession() {
    try {
      const r = await fetch(`${API_URL}/students/session`, { credentials: "same-origin" });
      if (r.ok) { const d = await r.json(); setNavLoggedIn("student", d.student.full_name || d.student.name); return; }
    } catch {}
    try {
      const r = await fetch(`${API_URL}/providers/session`, { credentials: "same-origin" });
      if (r.ok) { const d = await r.json(); setNavLoggedIn("provider", d.provider.full_name || d.provider.name); return; }
    } catch {}
    setNavLoggedOut();
  }

  /* ---- Nav state ---- */
  function setNavLoggedIn(role, name) {
    const wrap = document.getElementById("authNavWrap");
    if (!wrap) return;
    const first = (name || "").split(" ")[0] || name;
    const initial = (name || "?").charAt(0).toUpperCase();
    const cabinet = role === "student" ? "student.html" : "owner-login.html";
    const roleLabel = role === "student" ? "Tələbə" : "Ev sahibi";
    const avatarBg = role === "student" ? "var(--brand)" : "var(--accent)";

    wrap.innerHTML = `
      <div class="user-nav" id="userNavRoot">
        <button class="user-nav-btn" id="userNavToggle" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="user-avatar-nav" style="background:${avatarBg}">${escHtml(initial)}</span>
          <span class="user-nav-label"><span class="user-nav-role">${escHtml(roleLabel)}:</span> ${escHtml(first)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="user-nav-dropdown" id="userNavDropdown" style="display:none">
          <a class="user-nav-item" href="${escHtml(cabinet)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Şəxsi kabinet
          </a>
          <button class="user-nav-item user-nav-logout" id="navLogoutBtn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Çıxış
          </button>
        </div>
      </div>`;

    document.getElementById("userNavToggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = document.getElementById("userNavDropdown");
      const btn = e.currentTarget;
      const open = dd.style.display === "none";
      dd.style.display = open ? "" : "none";
      btn.setAttribute("aria-expanded", open);
    });

    document.getElementById("navLogoutBtn")?.addEventListener("click", async () => {
      const url = `${API_URL}/${role === "student" ? "students" : "providers"}/logout`;
      try { await fetch(url, { method: "POST", credentials: "same-origin" }); } catch {}
      setNavLoggedOut();
    });
  }

  function setNavLoggedOut() {
    const wrap = document.getElementById("authNavWrap");
    if (!wrap) return;
    wrap.innerHTML = `<button class="btn btn-sm btn-primary" id="authNavBtn" type="button">Daxil ol / Qeydiyyat</button>`;
    document.getElementById("authNavBtn")?.addEventListener("click", openModal);
  }

  /* ---- Close dropdown on outside click ---- */
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#userNavRoot")) {
      const dd = document.getElementById("userNavDropdown");
      if (dd) dd.style.display = "none";
    }
  });

  /* ---- Modal open/close ---- */
  function openModal() {
    const m = document.getElementById("authModal");
    if (!m) return;
    m.classList.add("open");
    document.body.style.overflow = "hidden";
    goToRoleStep();
  }

  function closeModal() {
    const m = document.getElementById("authModal");
    if (!m) return;
    m.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---- Step navigation ---- */
  function goToRoleStep() {
    _role = null;
    _mode = "login";
    document.getElementById("authStepRole").style.display = "";
    document.getElementById("authStepForm").style.display = "none";
    clearNotes();
  }

  function goToFormStep(role) {
    _role = role;
    document.getElementById("authStepRole").style.display = "none";
    document.getElementById("authStepForm").style.display = "";

    const hdr = document.getElementById("authRoleHeader");
    if (hdr) {
      const isStudent = role === "student";
      const icon = isStudent
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
      hdr.innerHTML = `<span class="auth-role-pill ${isStudent ? "student" : "owner"}">${icon} ${isStudent ? "Tələbə" : "Ev sahibi"}</span>`;
    }
    switchMode("login");
    initAuthProviderForm();
  }

  function switchMode(mode) {
    _mode = mode;
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t.dataset.authMode === mode));
    const lf = document.getElementById("authLoginForm");
    const sf = document.getElementById("authRegisterStudent");
    const pf = document.getElementById("authRegisterProvider");
    if (lf) lf.style.display = mode === "login" ? "" : "none";
    if (sf) sf.style.display = mode === "register" && _role === "student" ? "" : "none";
    if (pf) pf.style.display = mode === "register" && _role === "provider" ? "" : "none";
    clearNotes();
  }

  function clearNotes() {
    ["authLoginNote", "authRegStudentNote", "authRegProviderNote"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ""; }
    });
  }

  function setNote(id, text, ok = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "var(--success)" : "var(--danger)";
  }

  /* ---- API: Login ---- */
  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("authLoginEmail")?.value.trim();
    const password = document.getElementById("authLoginPassword")?.value;
    const endpoint = `${API_URL}/${_role === "student" ? "students" : "providers"}/login`;
    setNote("authLoginNote", "Gözləyin...", true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Xəta baş verdi");
      setNote("authLoginNote", "Uğurlu giriş! ✓", true);
      setTimeout(() => {
        closeModal();
        setNavLoggedIn(_role, d.name || d.full_name || email);
      }, 600);
    } catch (err) { setNote("authLoginNote", err.message); }
  }

  /* ---- API: Student register ---- */
  async function handleRegStudent(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const fullName = f.querySelector("[name=fullName]").value.trim();
    const phone = f.querySelector("[name=phone]").value.trim();
    const email = f.querySelector("[name=email]").value.trim();
    const university = f.querySelector("[name=university]").value;
    const password = f.querySelector("[name=password]").value;
    const confirmPassword = f.querySelector("[name=confirmPassword]")?.value;
    const studentCardInput = f.querySelector("[name=studentCard]");
    const idDocumentInput = f.querySelector("[name=idDocument]");
    const ageConfirmed = f.querySelector("[name=ageConfirmed]")?.checked;
    const terms = f.querySelector("[name=terms]")?.checked;
    const note = "authRegStudentNote";

    if (!fullName || !phone || !email || !university || !password) return setNote(note, "Bütün məcburi sahələri doldurun");
    if (password.length < 8) return setNote(note, "Şifrə minimum 8 simvol olmalıdır");
    if (password !== confirmPassword) return setNote(note, "Şifrələr uyğun deyil");
    if (!ageConfirmed) return setNote(note, "Yaş təsdiqi zəruridir");
    if (!terms) return setNote(note, "İstifadə şərtlərini qəbul edin");

    setNote(note, "Fayllar hazırlanır...", true);
    const studentCard = studentCardInput?.files?.[0] ? await fileToPayload(studentCardInput.files[0]).catch(() => null) : null;
    const idDocument = idDocumentInput?.files?.[0] ? await fileToPayload(idDocumentInput.files[0]).catch(() => null) : null;
    if (!studentCard || !idDocument) return setNote(note, "Tələbə bileti və şəxsiyyət vəsiqəsi əlavə edin");

    setNote(note, "Qeydiyyat edilir...", true);
    try {
      const r = await fetch(`${API_URL}/students/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ fullName, phone, email, university, password, studentCard, idDocument, ageConfirmed, terms }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Xəta baş verdi");
      setNote(note, "Qeydiyyat uğurludur! Rezervasiya üçün e-poçtunuza gələn linki təsdiqləyin. ✓", true);
      f.reset();
    } catch (err) { setNote(note, err.message); }
  }

  /* ---- API: Provider register ---- */
  // Dynamic labels/fields for provider type in auth modal
  function initAuthProviderForm() {
    const typeSelect = document.getElementById("authProviderType");
    if (!typeSelect) return;
    const LABELS = {
      owner:          { label: "Şirkət adı (ixtiyari)", required: false },
      agency:         { label: "Agentlik adı",           required: true  },
      hostel:         { label: "Hostel adı",             required: true  },
      university_dorm:{ label: "Yataqxana / müəssisə adı", required: true },
    };
    const DOC_LABELS = {
      owner:          "Şəxsiyyət sənədi (PDF / şəkil)",
      agency:         "Müəssisə qeydiyyat şəhadətnaməsi (PDF / şəkil)",
      hostel:         "Müəssisə qeydiyyat şəhadətnaməsi (PDF / şəkil)",
      university_dorm:"Universitetdən rəsmi məktub / lisenziya (PDF / şəkil)",
    };
    const NEEDS_VOEN = ["agency","hostel","university_dorm"];
    function onTypeChange() {
      const type = typeSelect.value || "owner";
      const cfg = LABELS[type] || LABELS.owner;
      const lbl = document.getElementById("authCompanyLabel");
      const inp = document.getElementById("authCompanyName");
      const vf  = document.getElementById("authVoenField");
      const dl  = document.getElementById("authDocLabel");
      if (lbl) lbl.textContent = cfg.label;
      if (inp) inp.required = cfg.required;
      if (vf)  vf.style.display = NEEDS_VOEN.includes(type) ? "" : "none";
      if (dl)  dl.textContent = DOC_LABELS[type] || DOC_LABELS.owner;
    }
    typeSelect.addEventListener("change", onTypeChange);
    onTypeChange();
    // password match
    const pw  = document.querySelector("#authRegisterProvider [name=password]");
    const cpw = document.getElementById("authConfirmPass");
    function checkPw() {
      if (!cpw || !pw) return;
      cpw.setCustomValidity(cpw.value && cpw.value !== pw.value ? "Parollar uyğun gəlmir" : "");
    }
    pw?.addEventListener("input", checkPw);
    cpw?.addEventListener("input", checkPw);
  }

  async function handleRegProvider(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const fullName    = f.querySelector("[name=fullName]").value.trim();
    const phone       = f.querySelector("[name=phone]").value.trim();
    const email       = f.querySelector("[name=email]").value.trim();
    const password    = f.querySelector("[name=password]").value;
    const confirmPass = f.querySelector("[name=confirmPassword]")?.value;
    const providerType= f.querySelector("[name=providerType]").value;
    const companyName = f.querySelector("[name=companyName]").value.trim();
    const voen        = f.querySelector("[name=voen]")?.value.trim() || "";
    const city        = f.querySelector("[name=city]")?.value || "";
    const terms       = f.querySelector("[name=terms]")?.checked;
    const fileInput   = f.querySelector("[name=document]");
    const note = "authRegProviderNote";

    if (!fullName || !phone || !email || !password) return setNote(note, "Bütün məcburi sahələri doldurun");
    if (password.length < 8) return setNote(note, "Şifrə minimum 8 simvol olmalıdır");
    if (confirmPass !== undefined && confirmPass !== password) return setNote(note, "Parollar uyğun gəlmir");
    if (!terms) return setNote(note, "İstifadə şərtlərini qəbul edin");

    let docPayload = null;
    if (fileInput && fileInput.files[0]) {
      setNote(note, "Fayl hazırlanır...", true);
      docPayload = await fileToPayload(fileInput.files[0]).catch(() => null);
    }
    if (!docPayload) return setNote(note, "Şəxsiyyət sənədini əlavə edin");

    setNote(note, "Qeydiyyat edilir...", true);
    try {
      const r = await fetch(`${API_URL}/providers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ fullName, phone, email, password, providerType, companyName, voen, city, document: docPayload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Xəta baş verdi");
      setNote(note, "Qeydiyyat uğurludur! Admin təsdiqlədikdən sonra daxil ola bilərsiniz. ✓", true);
      f.reset();
    } catch (err) { setNote(note, err.message); }
  }

  /* ---- Event bindings ---- */
  document.getElementById("authModalClose")?.addEventListener("click", closeModal);
  document.getElementById("authModalOverlay")?.addEventListener("click", closeModal);
  document.getElementById("authBackBtn")?.addEventListener("click", goToRoleStep);

  document.querySelectorAll("[data-role]").forEach(btn => {
    btn.addEventListener("click", () => goToFormStep(btn.dataset.role));
  });

  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => switchMode(tab.dataset.authMode));
  });

  document.getElementById("authLoginForm")?.addEventListener("submit", handleLogin);
  document.getElementById("authRegisterStudent")?.addEventListener("submit", handleRegStudent);
  document.getElementById("authRegisterProvider")?.addEventListener("submit", handleRegProvider);

  // Password eye toggle
  document.getElementById("authPassEye")?.addEventListener("click", () => {
    const inp = document.getElementById("authLoginPassword");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });

  // Close on Escape (supplement the global handler)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("authModal")?.classList.contains("open")) {
      closeModal();
    }
  });

  /* ---- Boot ---- */
  checkSession();

  /* ---- Scroll reveal ---- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("revealed"); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".section, .step, .feature, .stats, .faq-item, .place-card").forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = (i % 4) * 0.07 + "s";
    revealObserver.observe(el);
  });

  /* ---- Map init on load ---- */
  initMap();
})();
