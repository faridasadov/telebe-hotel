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
  document.querySelectorAll("[data-account-step]").forEach((step) => {
    step.classList.toggle("active", step.dataset.accountStep === student.status);
  });
}

function bookingSteps(status) {
  return ["Pending", "Approved", "Rejected"].map((step) => (
    `<div class="status-step ${step === status ? "active" : ""}">${step}</div>`
  )).join("");
}

async function loadBookings() {
  const response = await studentFetch(`${API_URL}/students/bookings`);
  const bookings = await response.json();
  qs("#studentBookings").innerHTML = bookings.length ? bookings.map((b) => `
    <article class="booking-item">
      <strong>${escHtml(b.place_name || "Seçilməyib")}</strong>
      <p class="meta">Tracking ID: <b>${escHtml(b.tracking_code || "-")}</b> · ${escHtml(b.move_in || "")} · ${escHtml(b.duration || "")} ay</p>
      <div class="status-steps">${bookingSteps(b.status)}</div>
      ${b.admin_note ? `<p class="meta">Admin cavabı: ${escHtml(b.admin_note)}</p>` : ""}
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

(async function initStudent() {
  try {
    await loadStudentPanel();
  } catch {}
})();
