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

async function authFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "same-origin" });
  if (response.status === 401) {
    showLogin();
    throw new Error("Unauthorized");
  }
  return response;
}

function showLogin() {
  qs("#loginPanel").classList.remove("admin-hidden");
  qs("#adminApp").classList.add("admin-hidden");
  qs("#logoutBtn").classList.add("admin-hidden");
}

function showAdmin() {
  qs("#loginPanel").classList.add("admin-hidden");
  qs("#adminApp").classList.remove("admin-hidden");
  qs("#logoutBtn").classList.remove("admin-hidden");
}

qs("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  const error = qs("#loginError");
  const submit = e.currentTarget.querySelector("button[type='submit']");
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "Yoxlanılır...";
  try {
    const response = await fetch(`${API_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Giriş alınmadı");
    await authFetch(`${API_URL}/admin/session`);
    e.currentTarget.reset();
    showAdmin();
    await loadDashboard();
  } catch (err) {
    showLogin();
    error.textContent = err.message === "Unauthorized" ? "Sessiya açılmadı. Yenidən cəhd edin." : err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Daxil ol";
  }
});

qs("#logoutBtn").addEventListener("click", () => {
  authFetch(`${API_URL}/admin/logout`, { method: "POST" }).catch(() => {});
  showLogin();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    qs("#tabPlaces").style.display = tab === "places" ? "block" : "none";
    qs("#tabBookings").style.display = tab === "bookings" ? "block" : "none";
    if (tab === "places") fetchPlaces();
    if (tab === "bookings") fetchBookings();
  });
});

async function fetchStats() {
  const response = await fetch(`${API_URL}/admin/stats`);
  const stats = await response.json();
  qs("#statPlaces").textContent = stats.totalPlaces;
  qs("#statSpots").textContent = stats.totalSpots;
  qs("#statFree").textContent = stats.freeSpots;
  qs("#statPending").textContent = stats.pendingBookings;
}

async function fetchPlaces() {
  const response = await authFetch(`${API_URL}/admin/places`);
  const data = await response.json();
  qs("#placesTableBody").innerHTML = data.map((p) => `
    <tr>
      <td>${p.id}</td>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(String(p.city).toUpperCase())}</td>
      <td>${escHtml(p.price)} AZN</td>
      <td>Q: ${escHtml(p.female_occupied)}/${escHtml(p.female_free)} | O: ${escHtml(p.male_occupied)}/${escHtml(p.male_free)}</td>
      <td class="admin-actions">
        <button class="btn btn-sm" onclick="editPlace(${p.id})">Redaktə</button>
        <button class="btn btn-danger btn-sm" onclick="deletePlace(${p.id})">Sil</button>
      </td>
    </tr>
  `).join("");
}

async function deletePlace(id) {
  if (!confirm("Bu obyekti silmək istədiyinizə əminsiniz?")) return;
  const response = await authFetch(`${API_URL}/admin/places/${id}`, { method: "DELETE" });
  if (response.ok) {
    fetchPlaces();
    fetchStats();
  }
}

function statusClass(status) {
  if (status === "Approved") return "status-approved";
  if (status === "Rejected") return "status-rejected";
  return "status-pending";
}

async function fetchBookings() {
  const response = await authFetch(`${API_URL}/admin/bookings`);
  const data = await response.json();
  qs("#bookingsTableBody").innerHTML = data.map((b) => `
    <tr>
      <td>${new Date(b.created_at).toLocaleDateString()}</td>
      <td>
        <strong>${escHtml(b.full_name)}</strong><br>
        <small>${escHtml(b.phone)} | ${escHtml(b.email)}</small>
        ${b.note ? `<span class="muted-small">${escHtml(b.note)}</span>` : ""}
      </td>
      <td>${escHtml(b.place_name || "Seçilməyib")}</td>
      <td>${b.gender === "female" ? "Qız" : "Oğlan"}</td>
      <td>${escHtml(b.duration)} ay</td>
      <td><span class="status ${statusClass(b.status)}">${escHtml(b.status)}</span></td>
      <td>
        <div class="booking-actions">
          <button class="btn btn-sm" onclick="setBookingStatus(${b.id}, 'Approved')" ${b.status === "Approved" ? "disabled" : ""}>Təsdiq</button>
          <button class="btn btn-sm" onclick="setBookingStatus(${b.id}, 'Pending')" ${b.status === "Pending" ? "disabled" : ""}>Gözlət</button>
          <button class="btn btn-danger btn-sm" onclick="setBookingStatus(${b.id}, 'Rejected')" ${b.status === "Rejected" ? "disabled" : ""}>İmtina</button>
          ${b.document_name ? `<button class="btn btn-sm" onclick="openDocument(${b.id})">Sənəd</button>` : ""}
          <button class="btn btn-danger btn-sm" onclick="deleteBooking(${b.id})">Sil</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function setBookingStatus(id, status) {
  const response = await authFetch(`${API_URL}/admin/bookings/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Status dəyişmədi");
    return;
  }
  fetchBookings();
  fetchPlaces();
  fetchStats();
}

async function openDocument(id) {
  const response = await authFetch(`${API_URL}/admin/bookings/${id}/document`);
  const doc = await response.json();
  if (!response.ok) {
    alert(doc.error || "Sənəd tapılmadı");
    return;
  }
  const binary = atob(doc.document_data);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: doc.document_type || "application/octet-stream" }));
  window.open(url, "_blank", "noopener");
}

async function deleteBooking(id) {
  if (!confirm("Bu müraciəti silmək istədiyinizə əminsiniz?")) return;
  const response = await authFetch(`${API_URL}/admin/bookings/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Müraciət silinmədi");
    return;
  }
  fetchBookings();
  fetchPlaces();
  fetchStats();
}

const modal = qs("#adminModal");
const placeForm = qs("#placeForm");

qs("#addPlaceBtn").addEventListener("click", () => {
  placeForm.reset();
  placeForm.id.value = "";
  qs("#modalTitle").textContent = "Yeni Obyekt Əlavə Et";
  modal.classList.add("active");
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => modal.classList.remove("active"));
});

function listToLines(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function universitiesToLines(values) {
  return Array.isArray(values)
    ? values.map((u) => `${u.code || ""} | ${u.name || ""} | ${u.distance_min || 0}`).join("\n")
    : "";
}

async function editPlace(id) {
  const response = await fetch(`${API_URL}/places/${id}`);
  const p = await response.json();
  placeForm.id.value = p.id;
  placeForm.name.value = p.name || "";
  placeForm.city.value = p.city || "baku";
  placeForm.type.value = p.type || "hostel";
  placeForm.gender.value = p.gender || "mixed";
  placeForm.price.value = p.price || 0;
  placeForm.total_spots.value = p.total_spots || 0;
  placeForm.lat.value = p.lat || "";
  placeForm.lng.value = p.lng || "";
  placeForm.female_occupied.value = p.female_occupied || 0;
  placeForm.female_free.value = p.female_free || 0;
  placeForm.male_occupied.value = p.male_occupied || 0;
  placeForm.male_free.value = p.male_free || 0;
  placeForm.address.value = p.address || "";
  placeForm.images.value = listToLines(p.images);
  placeForm.virtual_tour.value = p.virtual_tour || "";
  placeForm.description.value = p.description || "";
  placeForm.amenities.value = listToLines(p.amenities);
  placeForm.universities.value = universitiesToLines(p.universities);
  placeForm.wifi.checked = !!p.wifi;
  placeForm.utilities.checked = !!p.utilities;
  qs("#modalTitle").textContent = "Obyekti Redaktə Et";
  modal.classList.add("active");
}

placeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(placeForm).entries());
  ["price", "total_spots", "female_occupied", "female_free", "male_occupied", "male_free"].forEach((key) => {
    data[key] = parseInt(data[key], 10) || 0;
  });
  data.lat = data.lat ? Number(data.lat) : "";
  data.lng = data.lng ? Number(data.lng) : "";
  data.wifi = placeForm.wifi.checked;
  data.utilities = placeForm.utilities.checked;

  const id = placeForm.id.value;
  const response = await authFetch(id ? `${API_URL}/admin/places/${id}` : `${API_URL}/admin/places`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.error || "Xəta baş verdi");
    return;
  }
  modal.classList.remove("active");
  fetchPlaces();
  fetchStats();
});

async function loadDashboard() {
  await Promise.all([fetchStats(), fetchPlaces()]);
}

(async function initAdmin() {
  try {
    await authFetch(`${API_URL}/admin/session`);
    showAdmin();
    await loadDashboard();
  } catch {
    showLogin();
  }
})();

window.editPlace = editPlace;
window.deletePlace = deletePlace;
window.setBookingStatus = setBookingStatus;
window.openDocument = openDocument;
window.deleteBooking = deleteBooking;
