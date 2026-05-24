const API_URL = window.STUDENTSTAY_API_URL || (window.location.protocol === "file:" ? "http://localhost:4000/api" : "/api");
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
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(status) {
  return { Pending: "Gözlənilir", Approved: "Təsdiqlənib", Rejected: "Rədd edilib", Expired: "Müddəti bitib", Cancelled: "Ləğv edilib" }[status] || status || "Gözlənilir";
}

async function providerFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "same-origin" });
  if (response.status === 401 || response.status === 403) {
    showAuth();
    throw new Error("Sessiya bitib");
  }
  return response;
}

function ownerNote(msg, ok = false) {
  const el = qs("#ownerNote");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
  if (ok && msg) setTimeout(() => { if (el.textContent === msg) { el.textContent = ""; el.style.color = ""; } }, 2500);
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
  const letter = (provider.company_name || provider.full_name || "E").charAt(0).toUpperCase();
  const avatarEl = qs("#ownerAvatarLetter");
  if (avatarEl) avatarEl.textContent = letter;
  const nameEl = qs("#ownerName");
  if (nameEl) nameEl.textContent = provider.company_name || provider.full_name || "—";
}

// Auth screen tab switching (login / register)
document.querySelectorAll("[data-owner-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-owner-tab]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    const tab = button.dataset.ownerTab;
    qs("#providerRegisterForm")?.classList.toggle("admin-hidden", tab !== "register");
    qs("#providerLoginForm")?.classList.toggle("admin-hidden", tab !== "login");
  });
});

// ── Dynamic registration form behaviour ─────────────────────────────────────
(function initRegisterForm() {
  const typeSelect   = qs("#regProviderType");
  const companyLabel = qs("#companyNameLabel");
  const companyInput = qs("#regCompanyName");
  const voenField    = qs("#voenField");
  const voenInput    = qs("#regVoen");
  const docLabel     = qs("#docLabel");

  const COMPANY_LABELS = {
    owner:          { label: "Şirkət adı (ixtiyari)",    required: false },
    agency:         { label: "Agentlik adı",              required: true  },
    hostel:         { label: "Hostel adı",                required: true  },
    university_dorm:{ label: "Yataqxana / müəssisə adı", required: true  },
  };
  const DOC_LABELS = {
    owner:          "Şəxsiyyət vəsiqəsi / mülkiyyət sənədi (PDF / şəkil)",
    agency:         "Müəssisə qeydiyyat şəhadətnaməsi (PDF / şəkil)",
    hostel:         "Müəssisə qeydiyyat şəhadətnaməsi (PDF / şəkil)",
    university_dorm:"Universitetdən rəsmi məktub / lisenziya (PDF / şəkil)",
  };
  const NEEDS_VOEN = ["agency", "hostel", "university_dorm"];

  function onTypeChange() {
    const type = typeSelect?.value || "owner";
    const cfg  = COMPANY_LABELS[type] || COMPANY_LABELS.owner;
    if (companyLabel) companyLabel.textContent = cfg.label;
    if (companyInput) companyInput.required    = cfg.required;
    if (docLabel)     docLabel.textContent     = DOC_LABELS[type] || DOC_LABELS.owner;
    const needsVoen = NEEDS_VOEN.includes(type);
    voenField?.classList.toggle("admin-hidden", !needsVoen);
    if (voenInput) voenInput.required = needsVoen;
  }

  typeSelect?.addEventListener("change", onTypeChange);
  onTypeChange();

  // Real-time password match validation via native setCustomValidity
  const confirmInput = qs("[name='confirmPassword']");
  const passwordInput = qs("[name='password']");
  function checkPasswords() {
    if (!confirmInput || !passwordInput) return;
    confirmInput.setCustomValidity(
      confirmInput.value && confirmInput.value !== passwordInput.value
        ? "Parollar uyğun gəlmir"
        : ""
    );
  }
  confirmInput?.addEventListener("input", checkPasswords);
  passwordInput?.addEventListener("input", checkPasswords);
})();

qs("#providerRegisterForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#registerNote");
  const fd   = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());

  // Terms checkbox — native required doesn't work on checkboxes in all browsers
  if (!qs("#regTerms")?.checked) {
    return setNote(note, "İstifadə şərtlərini qəbul etməlisiniz");
  }

  delete data.confirmPassword;
  delete data.terms;
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
    qs("#regProviderType")?.dispatchEvent(new Event("change"));
    setNote(note, "✓ Qeydiyyat göndərildi. Admin yoxlamasından sonra (1–2 iş günü) bildiriş gələcək.", true);
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
  const container = qs("#ownerListings");
  if (!container) return;
  const response = await providerFetch(`${API_URL}/providers/listings`);
  const listings = await response.json();
  container.innerHTML = listings.length ? listings.map((item) => `
    <div class="owner-card-item">
      <div class="owner-card-head">
        <div>
          <p class="owner-card-title">${escHtml(item.name)}</p>
          <p class="owner-card-meta">${escHtml(item.city)} · ${escHtml(String(item.price))} AZN · ${escHtml(item.address || "")}</p>
          ${item.admin_note ? `<p class="owner-card-meta" style="color:var(--warning);margin-top:4px"><b>Admin:</b> ${escHtml(item.admin_note)}</p>` : ""}
        </div>
        <span class="owner-badge ${escHtml(item.status)}">${statusLabel(item.status)}</span>
      </div>
    </div>
  `).join("") : `<div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    <p style="font-weight:700;font-size:var(--fs-md);margin:0">Hələ elan yoxdur</p>
  </div>`;
}

function placeEditForm(item) {
  return `
    <form class="edit-form" data-place-update="${escHtml(item.id)}">
      <div class="edit-form-grid">
        <label class="field"><span>Qiymət (AZN)</span><input name="price" type="number" min="1" value="${escHtml(item.price)}" required></label>
        <label class="field"><span>Otaq sayı</span><input name="room_count" type="number" min="1" value="${escHtml(item.room_count || 1)}" required></label>
        <label class="field"><span>Cəmi yataq</span><input name="total_spots" type="number" min="1" value="${escHtml(item.total_spots)}" required></label>
        <label class="field"><span>Boş qız yeri</span><input name="female_free" type="number" min="0" value="${escHtml(item.female_free || 0)}"></label>
        <label class="field"><span>Boş oğlan yeri</span><input name="male_free" type="number" min="0" value="${escHtml(item.male_free || 0)}"></label>
        <label class="field"><span>Min. müqavilə (ay)</span><input name="min_contract_months" type="number" min="1" value="${escHtml(item.min_contract_months || 1)}"></label>
      </div>
      <div style="margin-top:12px">
        <button class="btn btn-primary btn-sm" type="submit">Dəyişikliyi təsdiqə göndər</button>
        <p class="owner-note" data-place-note style="margin-top:8px"></p>
      </div>
    </form>
  `;
}

async function loadOwnerPlaces() {
  const container = qs("#ownerPlaces");
  if (!container) return;
  const response = await providerFetch(`${API_URL}/providers/places`);
  const places = await response.json();
  container.innerHTML = places.length ? places.map((item) => `
    <div class="owner-card-item">
      <div class="owner-card-head">
        <div>
          <p class="owner-card-title">${escHtml(item.name)}</p>
          <p class="owner-card-meta">${escHtml(item.city)} · ${escHtml(String(item.price))} AZN · Boş: ${escHtml(String(item.free_spots))} / ${escHtml(String(item.total_spots))}</p>
        </div>
        <span class="owner-badge Approved">Aktiv</span>
      </div>
      ${placeEditForm(item)}
    </div>
  `).join("") : `<div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <p style="font-weight:700;font-size:var(--fs-md);margin:0">Hələ yayımlanmış elanınız yoxdur</p>
  </div>`;
}

async function loadOwnerBookings() {
  const container = qs("#ownerBookings");
  if (!container) return;
  container.innerHTML = `<p style="color:var(--text-muted)">Yüklənir...</p>`;
  let bookings = [];
  try {
    const response = await providerFetch(`${API_URL}/providers/bookings`);
    const raw = await response.json().catch(() => []);
    bookings = Array.isArray(raw) ? raw : [];
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger)">${escHtml(err.message)}</p>`;
    return;
  }
  container.innerHTML = bookings.length ? bookings.map((b) => `
    <div class="booking-card">
      <div class="booking-card-head">
        <div>
          <p class="booking-card-place">${escHtml(b.place_name || "Obyekt")}</p>
          <p class="booking-card-meta"><b>${escHtml(b.full_name)}</b> · ${escHtml(b.phone || "")} · ${escHtml(b.email || "")}</p>
          <p class="booking-card-meta">${escHtml(b.university || "")} · Köçüş: ${escHtml(b.move_in || "")} · ${escHtml(String(b.duration || ""))} ay</p>
          <p class="booking-card-meta">Tracking: <b>${escHtml(b.tracking_code || "-")}</b> · Son tarix: ${escHtml(formatDate(b.expires_at))}</p>
          ${b.note ? `<p class="booking-card-meta" style="margin-top:4px">${escHtml(b.note)}</p>` : ""}
        </div>
        <span class="bk-badge ${escHtml(b.status)}">${statusLabel(b.status)}</span>
      </div>
      ${b.status === "Pending" ? `
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-sm" type="button" data-owner-approve="${escHtml(b.id)}" style="background:rgba(16,185,129,0.12);color:var(--success);border:1.5px solid var(--success);font-weight:700">
          ✓ Təsdiqlə
        </button>
        <button class="btn btn-sm" type="button" data-owner-reject="${escHtml(b.id)}" style="background:rgba(239,68,68,0.1);color:var(--danger);border:1.5px solid var(--danger);font-weight:700">
          ✕ Rədd et
        </button>
      </div>` : ""}
      <button class="btn btn-sm" type="button" data-owner-messages="${escHtml(b.id)}" style="gap:5px;margin-top:6px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Mesajlar / cavab yaz
      </button>
      <div style="display:none" data-owner-message-box="${escHtml(b.id)}"></div>
    </div>
  `).join("") : `<div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    <p style="font-weight:700;font-size:var(--fs-md);margin:0">Hələ rezervasiya yoxdur</p>
  </div>`;
}

async function renderOwnerMessages(bookingId) {
  const box = document.querySelector(`[data-owner-message-box="${bookingId}"]`);
  if (!box) return;
  const response = await providerFetch(`${API_URL}/providers/bookings/${bookingId}/messages`);
  const messages = await response.json();
  box.style.display = "";
  box.innerHTML = `
    <div class="chat-box">
      <div class="chat-header">Mesajlar</div>
      <div class="chat-messages">
        ${messages.length ? messages.map((m) => {
          const isMe = m.sender_type === "provider";
          return `<div class="chat-msg-wrap ${isMe ? "me" : "them"}">
            <span class="chat-sender">${escHtml(m.sender_name || m.sender_type)}</span>
            <div class="chat-bubble ${isMe ? "me" : "them"}">${escHtml(m.message)}</div>
          </div>`;
        }).join("") : `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px 0;margin:0">Hələ mesaj yoxdur</p>`}
      </div>
      <form class="chat-input" data-owner-message="${escHtml(bookingId)}">
        <textarea name="message" rows="2" placeholder="Cavabınızı yazın..." required></textarea>
        <button class="btn btn-primary btn-sm" type="submit" style="align-self:flex-end;white-space:nowrap">Göndər</button>
      </form>
    </div>
  `;
  const msgList = box.querySelector(".chat-messages");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
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
    if (!response.ok) { ownerNote(payload.error || "Cavab göndərilmədi"); return; }
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
  } catch (err) {
    setNote(note, err.message);
  }
});

// Chat auto-polling for owner
let _ownerChatInterval = null;
let _ownerOpenBookingId = null;

function startOwnerChatPolling(bookingId) {
  stopOwnerChatPolling();
  _ownerOpenBookingId = bookingId;
  _ownerChatInterval = setInterval(async () => {
    const box = document.querySelector(`[data-owner-message-box="${_ownerOpenBookingId}"]`);
    if (!box || !document.contains(box)) { stopOwnerChatPolling(); return; }
    const msgList = box.querySelector(".chat-messages");
    const wasAtBottom = msgList ? msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 40 : true;
    const response = await providerFetch(`${API_URL}/providers/bookings/${_ownerOpenBookingId}/messages`).catch(() => null);
    if (!response || !response.ok) return;
    const messages = await response.json().catch(() => []);
    if (!msgList) return;
    msgList.innerHTML = messages.length ? messages.map((m) => {
      const isMe = m.sender_type === "provider";
      return `<div class="chat-msg-wrap ${isMe ? "me" : "them"}">
        <span class="chat-sender">${escHtml(m.sender_name || m.sender_type)}</span>
        <div class="chat-bubble ${isMe ? "me" : "them"}">${escHtml(m.message)}</div>
      </div>`;
    }).join("") : `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px 0;margin:0">Hələ mesaj yoxdur</p>`;
    if (wasAtBottom) msgList.scrollTop = msgList.scrollHeight;
  }, 8000);
}

function stopOwnerChatPolling() {
  if (_ownerChatInterval) { clearInterval(_ownerChatInterval); _ownerChatInterval = null; }
  _ownerOpenBookingId = null;
}

document.addEventListener("click", async (e) => {
  const msgBtn = e.target.closest("[data-owner-messages]");
  if (msgBtn) {
    await renderOwnerMessages(msgBtn.dataset.ownerMessages);
    startOwnerChatPolling(msgBtn.dataset.ownerMessages);
    return;
  }

  // Approve booking
  const approveBtn = e.target.closest("[data-owner-approve]");
  if (approveBtn) {
    if (!confirm("Bu rezervasiyanı TƏSDİQLƏMƏK istədiyinizə əminsiniz?")) return;
    const id = approveBtn.dataset.ownerApprove;
    const r = await providerFetch(`${API_URL}/providers/bookings/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Approved" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { ownerNote(data.error || "Xəta baş verdi"); return; }
    ownerNote("Rezervasiya təsdiqləndi.", true);
    await loadOwnerBookings();
    return;
  }

  // Reject booking
  const rejectBtn = e.target.closest("[data-owner-reject]");
  if (rejectBtn) {
    if (!confirm("Bu rezervasiyanı RƏDD ETMƏK istədiyinizə əminsiniz?")) return;
    const id = rejectBtn.dataset.ownerReject;
    const r = await providerFetch(`${API_URL}/providers/bookings/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Rejected" }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { ownerNote(data.error || "Xəta baş verdi"); return; }
    ownerNote("Rezervasiya rədd edildi.", true);
    await loadOwnerBookings();
    return;
  }
});

async function loadProviderPanel() {
  if (!qs("#ownerPanel")) return;
  const response = await providerFetch(`${API_URL}/providers/session`);
  const data = await response.json();
  showPanel(data.provider);
  // Expose lazy-load hooks for sidebar nav clicks
  window._ownerLoadListings = loadListings;
  window._ownerLoadPlaces = loadOwnerPlaces;
  window._ownerLoadBookings = loadOwnerBookings;
}

(async function initOwner() {
  // Auto-open register tab if coming from auth.html?tab=register
  if (new URLSearchParams(location.search).get("tab") === "register") {
    document.querySelectorAll("[data-owner-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-owner-tab="register"]')?.classList.add("active");
    qs("#providerLoginForm")?.classList.add("admin-hidden");
    qs("#providerRegisterForm")?.classList.remove("admin-hidden");
  }
  try {
    await loadProviderPanel();
  } catch {}
})();
