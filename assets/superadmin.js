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

async function adminFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "same-origin" });
  if (response.status === 401) {
    showLogin();
    throw new Error("Unauthorized");
  }
  if (response.status === 403) {
    qs("#superGuard").textContent = "Bu səhifə yalnız superadmin üçündür.";
    throw new Error("Forbidden");
  }
  return response;
}

function showLogin(message = "") {
  qs("#superLoginPanel").hidden = false;
  qs("#superApp").hidden = true;
  qs("#superLogout").hidden = true;
  qs("#superGuard").textContent = message;
}

function showApp() {
  qs("#superLoginPanel").hidden = true;
  qs("#superApp").hidden = false;
  qs("#superLogout").hidden = false;
  qs("#superGuard").textContent = "";
}

function setNote(id, text, ok = false) {
  const el = qs(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--success)" : "var(--danger)";
}

async function loadSettings() {
  const response = await adminFetch(`${API_URL}/superadmin/settings`);
  const settings = await response.json();
  if (!response.ok) throw new Error(settings.error || "Ayarlar yüklənmədi");
  const form = qs("#settingsForm");
  Object.entries(settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value || "";
  });
}

function renderProviders(rows) {
  qs("#providersBody").innerHTML = rows.map((p) => `
    <tr>
      <td><strong>${escHtml(p.full_name)}</strong><br><small>${escHtml(p.company_name || "")}</small></td>
      <td>${escHtml(p.phone || "")}<br><small>${escHtml(p.email || "")}</small></td>
      <td>${escHtml(p.status)}</td>
      <td>${escHtml(p.admin_note || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Ev sahibi yoxdur.</td></tr>`;
}

function renderStudents(rows) {
  qs("#studentsBody").innerHTML = rows.map((s) => `
    <tr>
      <td><strong>${escHtml(s.full_name)}</strong><br><small>${escHtml(s.email || "")}</small></td>
      <td>${escHtml(s.university || "")}</td>
      <td>${escHtml(s.status)}</td>
      <td>${escHtml(s.admin_note || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">Tələbə yoxdur.</td></tr>`;
}

async function loadUsers() {
  const [adminsResponse, providersResponse, studentsResponse] = await Promise.all([
    adminFetch(`${API_URL}/superadmin/users`),
    adminFetch(`${API_URL}/superadmin/providers`),
    adminFetch(`${API_URL}/superadmin/students`),
  ]);
  const [admins, providers, students] = await Promise.all([
    adminsResponse.json(),
    providersResponse.json(),
    studentsResponse.json(),
  ]);
  qs("#adminCount").textContent = admins.length;
  qs("#providerCount").textContent = providers.length;
  qs("#studentCount").textContent = students.length;
  renderProviders(providers);
  renderStudents(students);
}

qs("#settingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  try {
    const response = await adminFetch(`${API_URL}/superadmin/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Ayarlar saxlanmadı");
    e.currentTarget.elements.smtp_pass.value = "";
    setNote("#settingsNote", "Ayarlar saxlandı.", true);
    await loadSettings();
  } catch (err) {
    setNote("#settingsNote", err.message);
  }
});

qs("#superLoginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = qs("#superLoginNote");
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  note.textContent = "";
  try {
    const response = await fetch(`${API_URL}/superadmin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Giriş alınmadı");
    e.currentTarget.elements.password.value = "";
    showApp();
    await loadSettings();
    await loadUsers();
  } catch (err) {
    note.textContent = err.message;
    note.style.color = "var(--danger)";
  }
});

qs("#superLogout")?.addEventListener("click", () => {
  adminFetch(`${API_URL}/superadmin/logout`, { method: "POST" }).catch(() => {});
  showLogin();
});

(async function initSuperadmin() {
  try {
    const sessionResponse = await adminFetch(`${API_URL}/superadmin/session`);
    const session = await sessionResponse.json();
    if (session.role !== "superadmin") {
      showLogin("Bu səhifə yalnız superadmin üçündür.");
      return;
    }
    showApp();
    await loadSettings();
    await loadUsers();
  } catch {}
})();
