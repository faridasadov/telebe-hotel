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

function setNote(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
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
  qs("#studentName").textContent = `${student.full_name || ""} · ${student.email || ""}`;
  qs("#studentStatus").textContent = student.status || "Pending";
  qs("#studentAdminNote").textContent = student.admin_note ? `Admin qeydi: ${student.admin_note}` : "";
  if (qs("#studentProfileForm")) {
    qs("#studentProfileForm").elements.fullName.value = student.full_name || "";
    qs("#studentProfileForm").elements.phone.value = student.phone || "";
    qs("#studentProfileForm").elements.university.value = student.university || "";
  }
  document.querySelectorAll("[data-account-step]").forEach((step) => {
    step.classList.toggle("active", step.dataset.accountStep === student.status);
  });
}

function bookingSteps(status) {
  return ["Pending", "Approved", "Rejected", "Expired"].map((step) => (
    `<div class="status-step ${step === status ? "active" : ""}">${step}</div>`
  )).join("");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function loadBookings() {
  const response = await studentFetch(`${API_URL}/students/bookings`);
  const bookings = await response.json();
  qs("#studentBookings").innerHTML = bookings.length ? bookings.map((b) => `
    <article class="booking-item">
      <strong>${escHtml(b.place_name || "Seçilməyib")}</strong>
      <p class="meta">Tracking ID: <b>${escHtml(b.tracking_code || "-")}</b> · ${escHtml(b.move_in || "")} · ${escHtml(b.duration || "")} ay</p>
      <p class="meta">Razılaşma müddəti: ${escHtml(formatDate(b.expires_at))}</p>
      <div class="status-steps">${bookingSteps(b.status)}</div>
      ${b.admin_note ? `<p class="meta">Admin cavabı: ${escHtml(b.admin_note)}</p>` : ""}
      <div class="booking-actions">
        <button class="btn btn-sm" type="button" data-load-messages="${escHtml(b.id)}">Mesajlar</button>
        ${b.status === "Pending" || b.status === "Rejected" ? `<button class="btn btn-danger btn-sm" type="button" data-cancel-booking="${escHtml(b.id)}">Ləğv et</button>` : ""}
      </div>
      <div class="student-hidden" data-message-box="${escHtml(b.id)}"></div>
    </article>
  `).join("") : `<p class="meta">Hələ rezervasiya müraciətiniz yoxdur.</p>`;
}

async function loadStudentPanel() {
  const response = await studentFetch(`${API_URL}/students/session`);
  const data = await response.json();
  showPanel(data.student);
  await loadBookings();
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
    <div class="message-list">
      ${messages.map((m) => `<p class="meta"><b>${escHtml(m.sender_name || m.sender_type)}:</b> ${escHtml(m.message)}</p>`).join("") || `<p class="meta">Mesaj yoxdur.</p>`}
    </div>
    <form class="student-form" data-student-message="${escHtml(bookingId)}">
      <label class="field wide"><span>Mesaj</span><textarea name="message" rows="2" required></textarea></label>
      <button class="btn btn-sm wide" type="submit">Göndər</button>
    </form>
  `;
}

document.addEventListener("click", async (e) => {
  const loadBtn = e.target.closest("[data-load-messages]");
  if (loadBtn) {
    await renderMessages(loadBtn.dataset.loadMessages);
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

(async function initStudent() {
  try {
    await loadStudentPanel();
  } catch {}
})();
