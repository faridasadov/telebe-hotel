const API_URL = window.location.protocol === "file:" ? "http://localhost:3000/api" : "/api";

const qs = (selector) => document.querySelector(selector);
const field = (form, name) => form && form.elements ? form.elements[name] : null;

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

function showAdminError(message) {
  const target = qs("#adminError");
  if (target) target.textContent = message;
  else if (message) console.error(message);
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
  const form = e.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const error = qs("#loginError");
  const submit = form.querySelector("button[type='submit']");
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
    showAdmin();
    if (field(form, "password")) field(form, "password").value = "";
  } catch (err) {
    showLogin();
    error.textContent = err.message === "Unauthorized" ? "Sessiya açılmadı. Yenidən cəhd edin." : err.message;
    return;
  } finally {
    submit.disabled = false;
    submit.textContent = "Daxil ol";
  }

  try {
    await loadDashboard();
  } catch (err) {
    showAdminError(`Panel məlumatları yüklənmədi: ${err.message}`);
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
    qs("#tabProviders").style.display = tab === "providers" ? "block" : "none";
    qs("#tabStudents").style.display = tab === "students" ? "block" : "none";
    qs("#tabProviderListings").style.display = tab === "providerListings" ? "block" : "none";
    qs("#tabVerification").style.display = tab === "verification" ? "block" : "none";
    qs("#tabReports").style.display = tab === "reports" ? "block" : "none";
    qs("#tabAudit").style.display = tab === "audit" ? "block" : "none";
    if (tab === "places") fetchPlaces();
    if (tab === "bookings") fetchBookings();
    if (tab === "providers") fetchProviders();
    if (tab === "students") fetchStudents();
    if (tab === "providerListings") fetchProviderListings();
    if (tab === "verification") fetchVerificationQueue();
    if (tab === "reports") fetchReports();
    if (tab === "audit") fetchAuditLogs();
  });
});

async function fetchStats() {
  const response = await authFetch(`${API_URL}/admin/stats`);
  if (!response.ok) throw new Error("Statistika yüklənmədi");
  const stats = await response.json();
  qs("#statPlaces").textContent = stats.totalPlaces;
  qs("#statSpots").textContent = stats.totalSpots;
  qs("#statFree").textContent = stats.freeSpots;
  qs("#statPending").textContent = stats.pendingBookings;
}

async function fetchPlaces() {
  const response = await authFetch(`${API_URL}/admin/places`);
  if (!response.ok) throw new Error("Obyektlər yüklənmədi");
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
  if (!response.ok) throw new Error("Müraciətlər yüklənmədi");
  const data = await response.json();
  qs("#bookingsTableBody").innerHTML = data.map((b) => `
    <tr>
      <td>${new Date(b.created_at).toLocaleDateString()}</td>
      <td>
        <strong>${escHtml(b.full_name)}</strong><br>
        <small>${escHtml(b.phone)} | ${escHtml(b.email)}</small>
        <span class="muted-small">Tracking: ${escHtml(b.tracking_code || "-")}</span>
        ${b.note ? `<span class="muted-small">${escHtml(b.note)}</span>` : ""}
        ${b.admin_note ? `<span class="muted-small">Admin: ${escHtml(b.admin_note)}</span>` : ""}
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

async function fetchProviders() {
  const response = await authFetch(`${API_URL}/admin/providers`);
  if (!response.ok) throw new Error("Ev sahibləri yüklənmədi");
  const data = await response.json();
  qs("#providersTableBody").innerHTML = data.map((p) => `
    <tr>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td>
        <div class="provider-meta">
          <strong>${escHtml(p.full_name)}</strong>
          <small>${escHtml(p.provider_type === "agency" ? "Agentlik" : "Ev sahibi")} · ${escHtml(p.company_name || "")}</small>
          ${p.admin_note ? `<span class="muted-small">${escHtml(p.admin_note)}</span>` : ""}
        </div>
      </td>
      <td>${escHtml(p.phone)}<br><small>${escHtml(p.email)}</small></td>
      <td><span class="status ${statusClass(p.status)}">${escHtml(p.status)}</span></td>
      <td>
        <div class="booking-actions">
          <button class="btn btn-sm" onclick="setProviderStatus(${p.id}, 'Approved')" ${p.status === "Approved" ? "disabled" : ""}>Təsdiq</button>
          <button class="btn btn-danger btn-sm" onclick="setProviderStatus(${p.id}, 'Rejected')" ${p.status === "Rejected" ? "disabled" : ""}>İmtina</button>
          <button class="btn btn-sm" onclick="openProviderDocument(${p.id})">Sənəd</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function fetchStudents() {
  const response = await authFetch(`${API_URL}/admin/students`);
  if (!response.ok) throw new Error("Tələbələr yüklənmədi");
  const data = await response.json();
  qs("#studentsTableBody").innerHTML = data.map((s) => `
    <tr>
      <td>${new Date(s.created_at).toLocaleDateString()}</td>
      <td>
        <strong>${escHtml(s.full_name)}</strong><br>
        <small>${escHtml(s.phone || "")} · ${escHtml(s.email)}</small>
        ${s.admin_note ? `<span class="muted-small">${escHtml(s.admin_note)}</span>` : ""}
      </td>
      <td>${escHtml(s.university || "")}</td>
      <td><span class="status ${statusClass(s.status)}">${escHtml(s.status)}</span></td>
      <td>
        <div class="booking-actions">
          <button class="btn btn-sm" onclick="setStudentStatus(${s.id}, 'Approved')" ${s.status === "Approved" ? "disabled" : ""}>Təsdiq</button>
          <button class="btn btn-sm" onclick="setStudentStatus(${s.id}, 'Pending')" ${s.status === "Pending" ? "disabled" : ""}>Gözlət</button>
          <button class="btn btn-danger btn-sm" onclick="setStudentStatus(${s.id}, 'Rejected')" ${s.status === "Rejected" ? "disabled" : ""}>İmtina</button>
          ${s.document_name ? `<button class="btn btn-sm" onclick="openStudentDocument(${s.id})">Sənəd</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5">Tələbə qeydiyyatı yoxdur.</td></tr>`;
}

async function setStudentStatus(id, status) {
  const note = status !== "Approved" ? prompt("Qeyd") || "" : "";
  const response = await authFetch(`${API_URL}/admin/students/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Tələbə statusu dəyişmədi");
    return;
  }
  fetchStudents();
}

async function openStudentDocument(id) {
  const response = await authFetch(`${API_URL}/admin/students/${id}/document`);
  const doc = await response.json();
  if (!response.ok) {
    alert(doc.error || "Sənəd tapılmadı");
    return;
  }
  openBase64Document(doc);
}

async function setProviderStatus(id, status) {
  const note = status === "Rejected" ? prompt("İmtina səbəbi") || "" : "";
  const response = await authFetch(`${API_URL}/admin/providers/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Status dəyişmədi");
    return;
  }
  fetchProviders();
}

async function openProviderDocument(id) {
  const response = await authFetch(`${API_URL}/admin/providers/${id}/document`);
  const doc = await response.json();
  if (!response.ok) {
    alert(doc.error || "Sənəd tapılmadı");
    return;
  }
  openBase64Document(doc);
}

async function fetchProviderListings() {
  const response = await authFetch(`${API_URL}/admin/provider-listings`);
  if (!response.ok) throw new Error("Sahib elanları yüklənmədi");
  const data = await response.json();
  qs("#providerListingsTableBody").innerHTML = data.map((l) => `
    <tr>
      <td>${new Date(l.created_at).toLocaleDateString()}</td>
      <td>
        <strong>${escHtml(l.name)}</strong><br>
        <small>${escHtml(l.city)} · ${escHtml(l.type)} · ${escHtml(l.price)} AZN</small>
        <span class="muted-small">${escHtml(l.address || "")}</span>
        ${l.admin_note ? `<span class="muted-small">${escHtml(l.admin_note)}</span>` : ""}
      </td>
      <td>${escHtml(l.provider_name)}<br><small>${escHtml(l.provider_email)} · ${escHtml(l.provider_phone)}</small></td>
      <td><span class="status ${statusClass(l.status)}">${escHtml(l.status)}</span></td>
      <td>
        <div class="booking-actions">
          <button class="btn btn-sm" onclick="setProviderListingStatus(${l.id}, 'Approved')" ${l.status === "Approved" ? "disabled" : ""}>Yayımla</button>
          <button class="btn btn-danger btn-sm" onclick="setProviderListingStatus(${l.id}, 'Rejected')" ${l.status === "Rejected" ? "disabled" : ""}>İmtina</button>
          <button class="btn btn-sm" onclick="setProviderListingStatus(${l.id}, 'Pending')" ${l.status === "Pending" ? "disabled" : ""}>Gözlət</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function fetchVerificationQueue() {
  const response = await authFetch(`${API_URL}/admin/verification-queue`);
  if (!response.ok) throw new Error("Verification queue yüklənmədi");
  const data = await response.json();
  qs("#verifyProviderCount").textContent = data.providers.length;
  qs("#verifyStudentCount").textContent = data.students.length;
  qs("#verifyListingCount").textContent = data.listings.length;
  const providerRows = data.providers.map((p) => `
    <tr>
      <td>Sahib</td>
      <td><strong>${escHtml(p.full_name)}</strong><br><small>${escHtml(p.email)} · ${escHtml(p.phone)}</small></td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td class="booking-actions">
        <button class="btn btn-sm" onclick="setProviderStatus(${p.id}, 'Approved')">Təsdiq</button>
        <button class="btn btn-danger btn-sm" onclick="setProviderStatus(${p.id}, 'Rejected')">İmtina</button>
        <button class="btn btn-sm" onclick="openProviderDocument(${p.id})">Sənəd</button>
      </td>
    </tr>
  `);
  const studentRows = data.students.map((s) => `
    <tr>
      <td>Tələbə</td>
      <td><strong>${escHtml(s.full_name)}</strong><br><small>${escHtml(s.email)} · ${escHtml(s.university || "")}</small></td>
      <td>${new Date(s.created_at).toLocaleDateString()}</td>
      <td class="booking-actions">
        <button class="btn btn-sm" onclick="setStudentStatus(${s.id}, 'Approved')">Təsdiq</button>
        <button class="btn btn-danger btn-sm" onclick="setStudentStatus(${s.id}, 'Rejected')">İmtina</button>
        <button class="btn btn-sm" onclick="openStudentDocument(${s.id})">Sənəd</button>
      </td>
    </tr>
  `);
  const listingRows = data.listings.map((l) => `
    <tr>
      <td>Elan</td>
      <td><strong>${escHtml(l.name)}</strong><br><small>${escHtml(l.provider_name)} · ${escHtml(l.price)} AZN</small></td>
      <td>${new Date(l.created_at).toLocaleDateString()}</td>
      <td class="booking-actions">
        <button class="btn btn-sm" onclick="setProviderListingStatus(${l.id}, 'Approved')">Yayımla</button>
        <button class="btn btn-danger btn-sm" onclick="setProviderListingStatus(${l.id}, 'Rejected')">İmtina</button>
      </td>
    </tr>
  `);
  qs("#verificationTableBody").innerHTML = providerRows.concat(studentRows, listingRows).join("") || `<tr><td colspan="4">Gözləyən yoxlama yoxdur.</td></tr>`;
}

async function fetchReports() {
  const response = await authFetch(`${API_URL}/admin/reports`);
  if (!response.ok) throw new Error("Reportlar yüklənmədi");
  const reports = await response.json();
  qs("#reportsTableBody").innerHTML = reports.map((r) => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${escHtml(r.place_name || "Silinmiş elan")}<br><small>ID: ${escHtml(r.place_id)}</small></td>
      <td><strong>${escHtml(r.reason)}</strong><br><small>${escHtml(r.reporter_name || "")} ${escHtml(r.reporter_contact || "")}</small></td>
      <td><span class="status ${statusClass(r.status)}">${escHtml(r.status)}</span></td>
      <td class="booking-actions">
        <button class="btn btn-sm" onclick="setReportStatus(${r.id}, 'Reviewed')">Baxıldı</button>
        <button class="btn btn-sm" onclick="setReportStatus(${r.id}, 'Resolved')">Həll edildi</button>
        <button class="btn btn-danger btn-sm" onclick="setReportStatus(${r.id}, 'Rejected')">Rədd et</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5">Report yoxdur.</td></tr>`;
}

async function setReportStatus(id, status) {
  const note = prompt("Qeyd") || "";
  const response = await authFetch(`${API_URL}/admin/reports/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Report statusu dəyişmədi");
    return;
  }
  fetchReports();
}

async function fetchAuditLogs() {
  const response = await authFetch(`${API_URL}/admin/audit-logs`);
  if (!response.ok) throw new Error("Audit log yüklənmədi");
  const logs = await response.json();
  qs("#auditTableBody").innerHTML = logs.map((log) => `
    <tr>
      <td>${new Date(log.created_at).toLocaleString()}</td>
      <td>${escHtml(log.actor)}</td>
      <td>${escHtml(log.action)}</td>
      <td>${escHtml(log.entity_type)} #${escHtml(log.entity_id || "")}</td>
      <td><small>${escHtml(log.details || "")}</small></td>
    </tr>
  `).join("") || `<tr><td colspan="5">Audit qeydi yoxdur.</td></tr>`;
}

async function setProviderListingStatus(id, status) {
  const note = status === "Rejected" ? prompt("İmtina səbəbi") || "" : "";
  const response = await authFetch(`${API_URL}/admin/provider-listings/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    alert(data.error || "Elan statusu dəyişmədi");
    return;
  }
  fetchProviderListings();
  fetchPlaces();
  fetchStats();
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
  openBase64Document(doc);
}

function openBase64Document(doc) {
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

qs("#addPlaceBtn")?.addEventListener("click", () => {
  if (!placeForm || !modal) return;
  placeForm.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.type === "checkbox") el.checked = false;
    else if (el.tagName === "SELECT") el.selectedIndex = 0;
    else el.value = "";
  });
  field(placeForm, "id").value = "";
  field(placeForm, "room_count").value = 1;
  field(placeForm, "metro_distance_min").value = 0;
  field(placeForm, "min_contract_months").value = 1;
  field(placeForm, "female_occupied").value = 0;
  field(placeForm, "female_free").value = 0;
  field(placeForm, "male_occupied").value = 0;
  field(placeForm, "male_free").value = 0;
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
  if (!placeForm || !modal) return;
  const response = await fetch(`${API_URL}/places/${id}`);
  const p = await response.json();
  field(placeForm, "id").value = p.id;
  field(placeForm, "name").value = p.name || "";
  field(placeForm, "city").value = p.city || "baku";
  field(placeForm, "type").value = p.type || "hostel";
  field(placeForm, "gender").value = p.gender || "mixed";
  field(placeForm, "price").value = p.price || 0;
  field(placeForm, "room_count").value = p.room_count || 1;
  field(placeForm, "total_spots").value = p.total_spots || 0;
  field(placeForm, "metro_distance_min").value = p.metro_distance_min || 0;
  field(placeForm, "min_contract_months").value = p.min_contract_months || 1;
  field(placeForm, "lat").value = p.lat || "";
  field(placeForm, "lng").value = p.lng || "";
  field(placeForm, "female_occupied").value = p.female_occupied || 0;
  field(placeForm, "female_free").value = p.female_free || 0;
  field(placeForm, "male_occupied").value = p.male_occupied || 0;
  field(placeForm, "male_free").value = p.male_free || 0;
  field(placeForm, "address").value = p.address || "";
  field(placeForm, "images").value = listToLines(p.images);
  field(placeForm, "virtual_tour").value = p.virtual_tour || "";
  field(placeForm, "description").value = p.description || "";
  field(placeForm, "amenities").value = listToLines(p.amenities);
  field(placeForm, "universities").value = universitiesToLines(p.universities);
  field(placeForm, "wifi").checked = !!p.wifi;
  field(placeForm, "utilities").checked = !!p.utilities;
  qs("#modalTitle").textContent = "Obyekti Redaktə Et";
  modal.classList.add("active");
}

placeForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(placeForm).entries());
  ["price", "total_spots", "female_occupied", "female_free", "male_occupied", "male_free"].forEach((key) => {
    data[key] = parseInt(data[key], 10) || 0;
  });
  data.lat = data.lat ? Number(data.lat) : "";
  data.lng = data.lng ? Number(data.lng) : "";
  data.wifi = field(placeForm, "wifi").checked;
  data.utilities = field(placeForm, "utilities").checked;

  const id = field(placeForm, "id").value;
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
  showAdminError("");
  await Promise.all([fetchStats(), fetchPlaces()]);
}

(async function initAdmin() {
  try {
    await authFetch(`${API_URL}/admin/session`);
  } catch {
    showLogin();
    return;
  }

  showAdmin();
  try {
    await loadDashboard();
  } catch (err) {
    showAdminError(`Panel məlumatları yüklənmədi: ${err.message}`);
  }
})();

window.editPlace = editPlace;
window.deletePlace = deletePlace;
window.setBookingStatus = setBookingStatus;
window.openDocument = openDocument;
window.deleteBooking = deleteBooking;
window.setProviderStatus = setProviderStatus;
window.openProviderDocument = openProviderDocument;
window.setStudentStatus = setStudentStatus;
window.openStudentDocument = openStudentDocument;
window.setProviderListingStatus = setProviderListingStatus;
window.setReportStatus = setReportStatus;
