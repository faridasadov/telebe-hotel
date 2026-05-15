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
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  data.wifi = Boolean(data.wifi);
  data.utilities = Boolean(data.utilities);
  try {
    const images = String(data.images || "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (images.length < 3) throw new Error("Minimum 3 şəkil URL-i əlavə edin");
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

async function loadProviderPanel() {
  if (!qs("#ownerPanel")) return;
  const response = await providerFetch(`${API_URL}/providers/session`);
  const data = await response.json();
  showPanel(data.provider);
  await loadListings();
}

(async function initOwner() {
  try {
    await loadProviderPanel();
  } catch {}
})();
