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

function setNote(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
}

function statusLabel(status) {
  return { Pending: "Gözlənilir", Approved: "Təsdiqlənib", Rejected: "Rədd edilib", Expired: "Müddəti bitib", Cancelled: "Ləğv edilib" }[status] || status || "Gözlənilir";
}

async function studentFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "same-origin" });
  if (response.status === 401) {
    showAuth();
    throw new Error("Sessiya bitib");
  }
  return response;
}

function showAuth() {
  qs("#studentPanel")?.classList.add("student-hidden");
  qs("#studentLogout")?.classList.add("student-hidden");
  qs("#studentAuth")?.classList.remove("student-hidden");
}

function showPanel(student) {
  qs("#studentPanel")?.classList.remove("student-hidden");
  qs("#studentLogout")?.classList.remove("student-hidden");
  qs("#studentAuth")?.classList.add("student-hidden");

  // Avatar letter
  const avatarEl = qs("#cabAvatarLetter");
  if (avatarEl) avatarEl.textContent = (student.full_name || student.email || "T").charAt(0).toUpperCase();

  // Name
  const nameEl = qs("#studentName");
  if (nameEl) nameEl.textContent = student.full_name || student.email || "—";

  // Status badge
  const statusEl = qs("#studentStatus");
  if (statusEl) {
    statusEl.textContent = statusLabel(student.status);
    statusEl.className = `cab-status-badge ${student.status || "Pending"}`;
  }

  // Admin note
  const noteEl = qs("#studentAdminNote");
  const noteWrap = qs("#studentAdminNoteWrap");
  if (noteEl && noteWrap) {
    if (student.admin_note) {
      noteEl.textContent = `Admin qeydi: ${student.admin_note}`;
      noteWrap.classList.remove("student-hidden");
    } else {
      noteEl.textContent = "";
      noteWrap.classList.add("student-hidden");
    }
  }

  // Account steps
  document.querySelectorAll("[data-account-step]").forEach((step) => {
    step.classList.toggle("active", step.dataset.accountStep === student.status);
  });

  // Profile form pre-fill
  if (qs("#studentProfileForm")) {
    qs("#studentProfileForm").elements.fullName.value = student.full_name || "";
    qs("#studentProfileForm").elements.phone.value = student.phone || "";
    qs("#studentProfileForm").elements.university.value = student.university || "";
  }
}

function bookingSteps(status) {
  const isNeg = ["Rejected", "Expired", "Cancelled"].includes(status);
  const steps = isNeg
    ? [{ key: "Pending", label: "Göndərildi" }, { key: status, label: statusLabel(status) }]
    : [{ key: "Pending", label: "Göndərildi" }, { key: "Approved", label: "Təsdiqləndi" }];
  return steps.map(({ key, label }) => {
    let cls = "bk-step";
    if (key === status) cls += isNeg ? " fail" : " done";
    else if (status === "Approved" && key === "Pending") cls += " done";
    return `<div class="${cls}">${label}</div>`;
  }).join("");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function loadBookings() {
  let bookings = [];
  try {
    const response = await studentFetch(`${API_URL}/students/bookings`);
    bookings = await response.json();
  } catch (err) {
    const el = qs("#studentBookings");
    if (el) el.innerHTML = `<p class="meta">${escHtml(err.message)}</p>`;
    return bookings;
  }
  const seenMap = getSeenMap();
  qs("#studentBookings").innerHTML = bookings.length ? bookings.map((b) => {
    const hasUnread = b.last_provider_msg_at && (!seenMap[b.id] || b.last_provider_msg_at > seenMap[b.id]);
    return `
    <div class="booking-card">
      <div class="booking-card-head">
        <div>
          <p class="booking-card-place">${escHtml(b.place_name || "Yer seçilməyib")}</p>
          <p class="booking-card-meta">
            Tracking: <b>${escHtml(b.tracking_code || "-")}</b> &nbsp;·&nbsp;
            ${escHtml(b.move_in || "")} &nbsp;·&nbsp; ${escHtml(String(b.duration || ""))} ay
          </p>
          ${b.expires_at ? `<p class="booking-card-meta" style="margin-top:2px">Son tarix: ${escHtml(formatDate(b.expires_at))}</p>` : ""}
        </div>
        <span class="bk-badge ${escHtml(b.status)}">${statusLabel(b.status)}</span>
      </div>
      <div class="bk-progress">${bookingSteps(b.status)}</div>
      ${b.admin_note ? `<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:var(--r-sm);padding:8px 12px;font-size:13px;color:var(--warning);margin-bottom:12px"><b>Admin:</b> ${escHtml(b.admin_note)}</div>` : ""}
      <div class="booking-actions">
        <button class="btn btn-sm" type="button" data-load-messages="${b.id}" style="gap:5px;position:relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Mesajlar
          ${hasUnread ? `<span style="position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:var(--danger);border:2px solid var(--bg-card)"></span>` : ""}
        </button>
        ${b.status === "Pending" || b.status === "Rejected" ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:var(--danger);border:1px solid rgba(239,68,68,.18)" type="button" data-cancel-booking="${b.id}">Ləğv et</button>` : ""}
      </div>
      <div class="student-hidden" data-message-box="${b.id}"></div>
    </div>`;
  }).join("") : `<div class="empty-state">
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    <p style="font-weight:700;font-size:var(--fs-md);margin:0">Hələ rezervasiya yoxdur</p>
    <p><a href="student.html?tab=apply" style="color:var(--brand)">İlk müraciəti edin →</a></p>
  </div>`;
  return bookings;
}

async function loadStudentPanel() {
  const [sessionData, bookings] = await Promise.all([
    studentFetch(`${API_URL}/students/session`).then(r => r.json()),
    loadBookings(),
  ]);
  showPanel(sessionData.student);
  updateUnreadBadge(bookings);
}

// Unread messages badge — only real unread provider messages
const SEEN_KEY = "ss_msg_seen"; // {bookingId: ISO timestamp}

function getSeenMap() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}
function markAllSeen(bookings) {
  const map = getSeenMap();
  const now = new Date().toISOString();
  (bookings || []).forEach(b => { map[b.id] = now; });
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
}
function countUnread(bookings) {
  const map = getSeenMap();
  return (bookings || []).filter(b => {
    if (!b.last_provider_msg_at) return false;
    const seen = map[b.id];
    if (!seen) return true; // never seen
    return b.last_provider_msg_at > seen;
  }).length;
}

async function updateUnreadBadge(bookings) {
  const badge = qs("#unreadBadge");
  if (!badge) return;
  try {
    const rows = bookings || await studentFetch(`${API_URL}/students/bookings`)
      .then(r => r.json()).catch(() => []);
    const n = countUnread(Array.isArray(rows) ? rows : []);
    badge.textContent = n;
    badge.classList.toggle("student-hidden", n === 0);
  } catch {}
}

// Favorites tab
function loadFavorites() {
  const grid = qs("#favoritesGrid");
  if (!grid) return;
  const favIds = [...getFavs()];
  if (!favIds.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <p style="font-weight:700;font-size:var(--fs-md);margin:0">Hələ sevimli əlavə etməmisiniz</p>
      <p style="color:var(--text-muted);margin:8px 0 0">Elan kartındakı ürək işarəsinə basın</p>
    </div>`;
    return;
  }
  grid.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1">Yüklənir...</p>`;
  Promise.all(favIds.map(id => fetch(`${API_URL}/places/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)))
    .then(places => {
      const valid = places.filter(Boolean);
      if (!valid.length) { grid.innerHTML = `<p style="color:var(--text-muted)">Sevimlilər tapılmadı</p>`; return; }
      grid.innerHTML = valid.map(p => `
        <div class="place-card" style="cursor:default">
          <div class="place-image">
            <img src="${escHtml((p.images && p.images[0]) || '')}" alt="${escHtml(p.name)}" loading="lazy">
            <span class="price-tag">${p.price} AZN</span>
          </div>
          <div class="place-body">
            <div class="place-title"><div><h3>${escHtml(p.name)}</h3><small>${escHtml(p.city)}</small></div></div>
            <div class="card-actions">
              <button class="btn btn-primary" type="button" onclick="switchToApply(${p.id},'${escHtml(p.name)}')">Müraciət et →</button>
              <button class="btn btn-sm" type="button" data-fav-remove="${p.id}" style="color:var(--danger)">♥ Çıxar</button>
            </div>
          </div>
        </div>
      `).join("");
    });
}

function switchToApply(placeId, placeName) {
  document.querySelectorAll("[data-panel-tab]").forEach(b => b.classList.remove("active"));
  document.querySelector('[data-panel-tab="apply"]')?.classList.add("active");
  document.querySelectorAll(".cab-section").forEach(s => s.classList.remove("active"));
  qs("#panelTabApply")?.classList.add("active");
  prefillApplyForm(placeId, placeName);
}

function prefillApplyForm(placeId, placeName) {
  const idInput = qs("#applyPlaceId");
  const info = qs("#applyPlaceInfo");
  if (idInput) idInput.value = placeId;
  if (info && placeName) {
    info.textContent = `Seçilmiş elan: ${placeName} (ID: ${placeId})`;
    info.classList.remove("student-hidden");
  }
}

document.querySelectorAll("[data-student-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-student-tab]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    const tab = button.dataset.studentTab;
    qs("#studentLoginForm").classList.toggle("student-hidden", tab !== "login");
    qs("#studentRegisterForm").classList.toggle("student-hidden", tab !== "register");
  });
});

qs("#studentRegisterForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentRegisterNote");
  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());
  data.document = await fileToPayload(fd.get("document"));
  try {
    const response = await fetch(`${API_URL}/students/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Qeydiyyat alınmadı");
    e.currentTarget.reset();
    setNote(note, "Qeydiyyat göndərildi. Admin tələbə sənədinizi təsdiqləyəndən sonra statusunuz yenilənəcək.", true);
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#studentLoginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentLoginNote");
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const response = await fetch(`${API_URL}/students/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Giriş alınmadı");
    setNote(note, "", true);
    await loadStudentPanel();
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#studentLogout")?.addEventListener("click", () => {
  studentFetch(`${API_URL}/students/logout`, { method: "POST" }).catch(() => {});
  showAuth();
});

// Forgot password flow
qs("#forgotPassBtn")?.addEventListener("click", () => {
  qs("#studentLoginForm")?.classList.add("student-hidden");
  qs("#studentForgotForm")?.classList.remove("student-hidden");
});
qs("#backToLoginBtn")?.addEventListener("click", () => {
  qs("#studentForgotForm")?.classList.add("student-hidden");
  qs("#studentLoginForm")?.classList.remove("student-hidden");
});
qs("#studentForgotForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentForgotNote");
  const email = new FormData(e.currentTarget).get("email");
  setNote(note, "Göndərilir...", true);
  try {
    const r = await fetch(`${API_URL}/students/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setNote(note, "Əgər bu e-poçt mövcuddursa, sıfırlama linki göndərildi.", true);
  } catch {
    setNote(note, "Xəta baş verdi, yenidən cəhd edin.");
  }
});

// Reset password from email link (?reset=TOKEN)
(function checkResetToken() {
  const token = new URLSearchParams(location.search).get("reset");
  if (!token) return;
  const auth = qs("#studentAuth");
  if (!auth) return;
  qs("#studentLoginForm")?.classList.add("student-hidden");
  qs("#studentForgotForm")?.classList.add("student-hidden");
  const resetCard = document.createElement("form");
  resetCard.id = "studentResetForm";
  resetCard.className = "cab-form";
  resetCard.innerHTML = `
    <div style="margin-bottom:6px">
      <h2 style="margin:0 0 4px;font-size:var(--fs-xl);font-weight:800">Yeni şifrə</h2>
      <p style="margin:0;color:var(--text-muted);font-size:13px">Yeni şifrənizi daxil edin (min 6 simvol)</p>
    </div>
    <label class="field"><span>Yeni şifrə</span><input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
    <button class="btn btn-primary" type="submit">Şifrəni yenilə</button>
    <p class="cab-note" id="resetNote"></p>
  `;
  auth.querySelector(".cab-auth-card")?.appendChild(resetCard);
  resetCard.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password");
    const note = qs("#resetNote");
    setNote(note, "Yenilənir...", true);
    const r = await fetch(`${API_URL}/students/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setNote(note, d.error || "Xəta baş verdi");
    setNote(note, "Şifrə uğurla yeniləndi! Daxil olun.", true);
    setTimeout(() => { history.replaceState({}, "", location.pathname); resetCard.remove(); qs("#studentLoginForm")?.classList.remove("student-hidden"); }, 1500);
  });
})();

// Account deletion
qs("#deleteAccountBtn")?.addEventListener("click", async () => {
  if (!confirm("Hesabınız tamamilə silinəcək. Bu əməliyyat GERİ QAYTARILA BİLMƏZ.\n\nDavam etmək istəyirsiniz?")) return;
  if (!confirm("Son xəbərdarlıq: silindikdən sonra bu e-poçtla giriş mümkün olmayacaq. Əminsiniz?")) return;
  const note = qs("#deleteAccountNote");
  setNote(note, "Silinir...", true);
  try {
    const r = await studentFetch(`${API_URL}/students/account`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Xəta baş verdi");
    setNote(note, "Hesab silindi. Yönləndirilirsiniz...", true);
    setTimeout(() => { location.href = "index.html"; }, 1500);
  } catch (err) {
    setNote(note, err.message);
  }
});

// Browser push notifications
function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showPushNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/assets/icon.png", badge: "/assets/icon.png" });
}

// New booking form (in student cabinet)
qs("#studentBookingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentBookingNote");
  const fd = new FormData(e.currentTarget);
  const data = Object.fromEntries(fd.entries());
  data.document = await fileToPayload(fd.get("document"));
  if (!data.placeId) delete data.placeId;
  setNote(note, "Göndərilir...", true);
  try {
    const r = await fetch(`${API_URL}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload.error || "Müraciət göndərilmədi");
    setNote(note, `Müraciət göndərildi! Tracking ID: ${payload.trackingCode || payload.id || ""}`, true);
    e.currentTarget.reset();
    qs("#applyPlaceId").value = "";
    qs("#applyPlaceInfo")?.classList.add("student-hidden");
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#studentProfileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentProfileNote");
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const response = await studentFetch(`${API_URL}/students/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Profil yenilənmədi");
    setNote(note, "Profil yeniləndi.", true);
    await loadStudentPanel();
  } catch (err) {
    setNote(note, err.message);
  }
});

qs("#studentDocumentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#studentDocumentNote");
  const fd = new FormData(e.currentTarget);
  try {
    const response = await studentFetch(`${API_URL}/students/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: await fileToPayload(fd.get("document")) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Sənəd yenilənmədi");
    e.currentTarget.reset();
    setNote(note, "Sənəd yeniləndi və yoxlamaya göndərildi.", true);
    await loadStudentPanel();
  } catch (err) {
    setNote(note, err.message);
  }
});

async function renderMessages(bookingId) {
  const box = document.querySelector(`[data-message-box="${bookingId}"]`);
  if (!box) return;
  const response = await studentFetch(`${API_URL}/students/bookings/${bookingId}/messages`);
  const messages = await response.json();
  box.classList.remove("student-hidden");
  box.innerHTML = `
    <div class="chat-box">
      <div class="chat-header">Mesajlar</div>
      <div class="chat-messages">
        ${messages.length ? messages.map((m) => {
          const isMe = m.sender_type === "student";
          return `<div class="chat-msg-wrap ${isMe ? "me" : "them"}">
            <span class="chat-sender">${escHtml(m.sender_name || m.sender_type)}</span>
            <div class="chat-bubble ${isMe ? "me" : "them"}">${escHtml(m.message)}</div>
          </div>`;
        }).join("") : `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px 0;margin:0">Hələ mesaj yoxdur</p>`}
      </div>
      <form class="chat-input" data-student-message="${escHtml(bookingId)}">
        <textarea name="message" rows="2" placeholder="Mesajınızı yazın..." required></textarea>
        <button class="btn btn-primary btn-sm" type="submit" style="align-self:flex-end;white-space:nowrap">Göndər</button>
      </form>
    </div>
  `;
  // Scroll to bottom
  const msgList = box.querySelector(".chat-messages");
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

// Chat auto-polling: refresh open chat every 8s
let _chatPollingInterval = null;
let _openChatBookingId = null;

function startChatPolling(bookingId) {
  stopChatPolling();
  _openChatBookingId = bookingId;
  _chatPollingInterval = setInterval(async () => {
    const box = document.querySelector(`[data-message-box="${_openChatBookingId}"]`);
    if (!box || !document.contains(box)) { stopChatPolling(); return; }
    const msgList = box.querySelector(".chat-messages");
    const wasAtBottom = msgList ? msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 40 : true;
    const response = await studentFetch(`${API_URL}/students/bookings/${_openChatBookingId}/messages`).catch(() => null);
    if (!response || !response.ok) return;
    const messages = await response.json().catch(() => []);
    if (!msgList) return;
    msgList.innerHTML = messages.length ? messages.map((m) => {
      const isMe = m.sender_type === "student";
      return `<div class="chat-msg-wrap ${isMe ? "me" : "them"}">
        <span class="chat-sender">${escHtml(m.sender_name || m.sender_type)}</span>
        <div class="chat-bubble ${isMe ? "me" : "them"}">${escHtml(m.message)}</div>
      </div>`;
    }).join("") : `<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px 0;margin:0">Hələ mesaj yoxdur</p>`;
    if (wasAtBottom) msgList.scrollTop = msgList.scrollHeight;
  }, 8000);
}

function stopChatPolling() {
  if (_chatPollingInterval) { clearInterval(_chatPollingInterval); _chatPollingInterval = null; }
  _openChatBookingId = null;
}

document.addEventListener("click", async (e) => {
  const loadBtn = e.target.closest("[data-load-messages]");
  if (loadBtn) {
    const bId = loadBtn.dataset.loadMessages;
    await renderMessages(bId);
    startChatPolling(bId);
    // Mark this booking's messages as seen → clear its unread dot
    const map = getSeenMap();
    map[bId] = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    // Remove red dot from this button
    loadBtn.querySelector("span[style*='border-radius:50%']")?.remove();
    // Refresh sidebar badge
    updateUnreadBadge();
    return;
  }
  const cancelBtn = e.target.closest("[data-cancel-booking]");
  if (cancelBtn) {
    if (!confirm("Rezervasiyanı ləğv etmək istəyirsiniz?")) return;
    const response = await studentFetch(`${API_URL}/students/bookings/${cancelBtn.dataset.cancelBooking}/cancel`, { method: "PUT" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Ləğv edilmədi");
    await loadBookings();
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-student-message]");
  if (!form) return;
  e.preventDefault();
  const bookingId = form.dataset.studentMessage;
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await studentFetch(`${API_URL}/students/bookings/${bookingId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return alert(payload.error || "Mesaj göndərilmədi");
  await renderMessages(bookingId);
});

qs("#trackingForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#trackingNote");
  const result = qs("#trackingResult");
  const code = String(new FormData(e.currentTarget).get("code") || "").trim().toUpperCase();
  note.textContent = "";
  result?.classList.add("student-hidden");
  try {
    const response = await fetch(`${API_URL}/bookings/status/${encodeURIComponent(code)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Nəticə tapılmadı");
    const b = payload;
    const statusMap = { Pending: "Gözlənilir", Approved: "Təsdiqlənib", Rejected: "Rədd edilib", Expired: "Müddəti bitib", Cancelled: "Ləğv edilib" };
    const badgeClass = { Pending: "warning", Approved: "success", Rejected: "danger", Expired: "muted", Cancelled: "muted" }[b.status] || "muted";
    if (result) {
      result.classList.remove("student-hidden");
      result.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;background:var(--bg-subtle)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px">
            <div>
              <p style="font-weight:700;font-size:var(--fs-md);margin:0 0 4px">${escHtml(b.place_name || "Obyekt")}</p>
              <p style="color:var(--text-muted);font-size:13px;margin:0">Tracking: <b>${escHtml(b.tracking_code || code)}</b></p>
            </div>
            <span style="padding:5px 13px;border-radius:var(--r-pill);font-size:12px;font-weight:700;background:rgba(var(--${badgeClass}-rgb,100,116,139),.14);color:var(--${badgeClass},var(--text-muted))">
              ${statusMap[b.status] || b.status}
            </span>
          </div>
          ${b.admin_note ? `<p style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:var(--r-sm);padding:8px 12px;font-size:13px;color:var(--warning);margin:0"><b>Admin:</b> ${escHtml(b.admin_note)}</p>` : ""}
        </div>
      `;
    }
  } catch (err) {
    setNote(note, err.message);
  }
});

(async function initStudent() {
  const params = new URLSearchParams(location.search);

  // Auto-open register tab
  if (params.get("tab") === "register") {
    document.querySelectorAll("[data-student-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-student-tab="register"]')?.classList.add("active");
    qs("#studentLoginForm")?.classList.add("student-hidden");
    qs("#studentRegisterForm")?.classList.remove("student-hidden");
  }

  // Pre-fill + open apply tab from card/modal click
  const preBookPlaceId = sessionStorage.getItem("ss_book_place_id");
  const preBookPlaceName = sessionStorage.getItem("ss_book_place_name");
  if (preBookPlaceId) {
    sessionStorage.removeItem("ss_book_place_id");
    sessionStorage.removeItem("ss_book_place_name");
    // Will open apply tab after panel loads (see below)
    window._pendingApplyPlaceId = preBookPlaceId;
    window._pendingApplyPlaceName = preBookPlaceName || "";
  }

  // ?tab=apply from index CTA
  if (params.get("tab") === "apply") {
    window._pendingOpenApply = true;
  }

  try {
    await loadStudentPanel();
    // Open apply tab if redirected from card/CTA
    if (window._pendingOpenApply || window._pendingApplyPlaceId) {
      document.querySelectorAll("[data-panel-tab]").forEach(b => b.classList.remove("active"));
      document.querySelector('[data-panel-tab="apply"]')?.classList.add("active");
      document.querySelectorAll(".cab-section").forEach(s => s.classList.remove("active"));
      qs("#panelTabApply")?.classList.add("active");
      if (window._pendingApplyPlaceId) {
        prefillApplyForm(window._pendingApplyPlaceId, window._pendingApplyPlaceName);
      }
    }
  } catch {}
})();
