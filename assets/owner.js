const API_URL = window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api";
const qs = (selector) => document.querySelector(selector);

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function filesToPayload(files) {
  return Promise.all(Array.from(files || []).map(fileToPayload));
}

function setNote(el, text, ok = false) {
  el.textContent = text;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
}

async function providerFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "same-origin" });
  if (response.status === 401) {
    showAuth();
    throw new Error("Sessiya bitib");
  }
  return response;
}

function showAuth() {
  qs("#ownerPanel")?.classList.add("admin-hidden");
  qs("#ownerLogout")?.classList.add("admin-hidden");
  qs("#loginCard")?.classList.remove("admin-hidden");
}

function showPanel(provider) {
  qs("#ownerPanel")?.classList.remove("admin-hidden");
  qs("#ownerLogout")?.classList.remove("admin-hidden");
  qs("#loginCard")?.classList.add("admin-hidden");
  if (qs("#ownerName")) qs("#ownerName").textContent = provider.company_name || provider.full_name || "";
}

document.querySelectorAll("[data-owner-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-owner-tab]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    const tab = button.dataset.ownerTab;
    qs("#providerRegisterForm").classList.toggle("admin-hidden", tab !== "register");
    qs("#providerLoginForm").classList.toggle("admin-hidden", tab !== "login");
  });
});

qs("#providerRegisterForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#registerNote");
  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());
  data.document = await fileToPayload(fd.get("document"));
  try {
    const response = await fetch(`${API_URL}/providers/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Qeydiyyat alınmadı");
    e.currentTarget.reset();
    setNote(note, "Qeydiyyat göndərildi. Admin təsdiqindən sonra giriş edə biləcəksiniz.", true);
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#providerLoginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#loginNote");
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const response = await fetch(`${API_URL}/providers/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Giriş alınmadı");
    setNote(note, "", true);
    await loadProviderPanel();
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#ownerLogout")?.addEventListener("click", () => {
  providerFetch(`${API_URL}/providers/logout`, { method: "POST" }).catch(() => {});
  showAuth();
});

qs("#ownerListingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#listingNote");
  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());
  data.wifi = Boolean(data.wifi);
  data.utilities = Boolean(data.utilities);
  try {
    data.image_uploads = await filesToPayload(fd.getAll("imageFiles").filter((file) => file && file.size));
    const images = String(data.images || "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (images.length + data.image_uploads.length < 3) throw new Error("Minimum 3 şəkil əlavə edin");
    delete data.imageFiles;
    const response = await providerFetch(`${API_URL}/providers/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Elan göndərilmədi");
    e.currentTarget.reset();
    setNote(note, "Elan admin yoxlamasına göndərildi.", true);
    await loadListings();
  } catch (err) {
    setNote(note, err.message);
  }
});

async function loadListings() {
  if (!qs("#ownerListings")) return;
  const response = await providerFetch(`${API_URL}/providers/listings`);
  const listings = await response.json();
  qs("#ownerListings").innerHTML = listings.length ? listings.map((item) => `
    <article class="owner-listing">
      <strong>${escHtml(item.name)}</strong>
      <span class="owner-status ${escHtml(item.status)}">${escHtml(item.status)}</span>
      <p class="meta">${escHtml(item.city)} · ${escHtml(item.price)} AZN · ${escHtml(item.address || "")}</p>
      ${item.admin_note ? `<p class="meta">${escHtml(item.admin_note)}</p>` : ""}
    </article>
  `).join("") : `<p class="meta">Hələ elan göndərilməyib.</p>`;
}

function placeEditForm(item) {
  return `
    <form class="owner-form" data-place-update="${escHtml(item.id)}">
      <label class="field"><span>Qiymət</span><input name="price" type="number" min="1" value="${escHtml(item.price)}" required></label>
      <label class="field"><span>Otaq sayı</span><input name="room_count" type="number" min="1" value="${escHtml(item.room_count || 1)}" required></label>
      <label class="field"><span>Cəmi yataq</span><input name="total_spots" type="number" min="1" value="${escHtml(item.total_spots)}" required></label>
      <label class="field"><span>Boş qız yeri</span><input name="female_free" type="number" min="0" value="${escHtml(item.female_free || 0)}"></label>
      <label class="field"><span>Boş oğlan yeri</span><input name="male_free" type="number" min="0" value="${escHtml(item.male_free || 0)}"></label>
      <label class="field"><span>Qalan qızlar</span><input name="female_occupied" type="number" min="0" value="${escHtml(item.female_occupied || 0)}"></label>
      <label class="field"><span>Qalan oğlanlar</span><input name="male_occupied" type="number" min="0" value="${escHtml(item.male_occupied || 0)}"></label>
      <label class="field"><span>Minimum müqavilə</span><input name="min_contract_months" type="number" min="1" value="${escHtml(item.min_contract_months || 1)}"></label>
      <button class="btn btn-primary wide" type="submit">Dəyişikliyi təsdiqə göndər</button>
      <p class="owner-note wide" data-place-note></p>
    </form>
  `;
}

async function loadOwnerPlaces() {
  if (!qs("#ownerPlaces")) return;
  const response = await providerFetch(`${API_URL}/providers/places`);
  const places = await response.json();
  qs("#ownerPlaces").innerHTML = places.length ? places.map((item) => `
    <article class="owner-listing">
      <strong>${escHtml(item.name)}</strong>
      <p class="meta">${escHtml(item.city)} · ${escHtml(item.price)} AZN · Boş: ${escHtml(item.free_spots)} / ${escHtml(item.total_spots)}</p>
      ${placeEditForm(item)}
    </article>
  `).join("") : `<p class="meta">Hələ yayımlanmış elanınız yoxdur.</p>`;
}

async function loadOwnerBookings() {
  if (!qs("#ownerBookings")) return;
  const response = await providerFetch(`${API_URL}/providers/bookings`);
  const bookings = await response.json();
  qs("#ownerBookings").innerHTML = bookings.length ? bookings.map((b) => `
    <article class="owner-listing">
      <strong>${escHtml(b.place_name || "Obyekt")}</strong>
      <span class="owner-status ${escHtml(b.status)}">${escHtml(b.status)}</span>
      <p class="meta">${escHtml(b.full_name)} · ${escHtml(b.phone || "")} · ${escHtml(b.email || "")}</p>
      <p class="meta">${escHtml(b.university || "")} · ${escHtml(b.move_in || "")} · ${escHtml(b.duration || "")} ay · Tracking: ${escHtml(b.tracking_code || "-")}</p>
      ${b.note ? `<p class="meta">${escHtml(b.note)}</p>` : ""}
      <button class="btn btn-sm" type="button" data-owner-messages="${escHtml(b.id)}">Mesajlar / cavab yaz</button>
      <div class="admin-hidden" data-owner-message-box="${escHtml(b.id)}"></div>
    </article>
  `).join("") : `<p class="meta">Hələ rezervasiya yoxdur.</p>`;
}

async function renderOwnerMessages(bookingId) {
  const box = document.querySelector(`[data-owner-message-box="${bookingId}"]`);
  if (!box) return;
  const response = await providerFetch(`${API_URL}/providers/bookings/${bookingId}/messages`);
  const messages = await response.json();
  box.classList.remove("admin-hidden");
  box.innerHTML = `
    <div class="message-list">
      ${messages.map((m) => `<p class="meta"><b>${escHtml(m.sender_name || m.sender_type)}:</b> ${escHtml(m.message)}</p>`).join("") || `<p class="meta">Mesaj yoxdur.</p>`}
    </div>
    <form class="owner-form" data-owner-message="${escHtml(bookingId)}">
      <label class="field wide"><span>Cavab</span><textarea name="message" rows="2" required></textarea></label>
      <button class="btn btn-primary wide" type="submit">Cavab göndər</button>
    </form>
  `;
}

document.addEventListener("submit", async (e) => {
  const messageForm = e.target.closest("[data-owner-message]");
  if (messageForm) {
    e.preventDefault();
    const bookingId = messageForm.dataset.ownerMessage;
    const data = Object.fromEntries(new FormData(messageForm).entries());
    const response = await providerFetch(`${API_URL}/providers/bookings/${bookingId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Cavab göndərilmədi");
    await renderOwnerMessages(bookingId);
    return;
  }
  const form = e.target.closest("[data-place-update]");
  if (!form) return;
  e.preventDefault();
  const note = form.querySelector("[data-place-note]");
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await providerFetch(`${API_URL}/providers/places/${form.dataset.placeUpdate}/update-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Dəyişiklik göndərilmədi");
    setNote(note, "Dəyişiklik admin təsdiqinə göndərildi.", true);
    await loadListings();
  } catch (err) {
    setNote(note, err.message);
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-owner-messages]");
  if (!btn) return;
  await renderOwnerMessages(btn.dataset.ownerMessages);
});

async function loadProviderPanel() {
  if (!qs("#ownerPanel")) return;
  const response = await providerFetch(`${API_URL}/providers/session`);
  const data = await response.json();
  showPanel(data.provider);
  await loadListings();
  await loadOwnerPlaces();
  await loadOwnerBookings();
}

(async function initOwner() {
  try {
    await loadProviderPanel();
  } catch {}
})();
