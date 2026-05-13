const API_URL = "http://localhost:3000/api";

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tabPlaces').style.display = tab === 'places' ? 'block' : 'none';
    document.getElementById('tabBookings').style.display = tab === 'bookings' ? 'block' : 'none';
    if (tab === 'places') fetchPlaces();
    if (tab === 'bookings') fetchBookings();
  });
});

// ---------- Stats ----------
async function fetchStats() {
  try {
    const r = await fetch(`${API_URL}/admin/stats`);
    const s = await r.json();
    document.getElementById('statPlaces').textContent = s.totalPlaces;
    document.getElementById('statSpots').textContent = s.totalSpots;
    document.getElementById('statFree').textContent = s.freeSpots;
    document.getElementById('statPending').textContent = s.pendingBookings;
  } catch (e) { console.error("Stats error", e); }
}

// ---------- Places CRUD ----------
async function fetchPlaces() {
  try {
    const r = await fetch(`${API_URL}/admin/places`);
    const data = await r.json();
    const tbody = document.getElementById('placesTableBody');
    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${p.id}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.city.toUpperCase()}</td>
        <td>${p.price} AZN</td>
        <td>Q: ${p.female_occupied}/${p.female_free} | O: ${p.male_occupied}/${p.male_free}</td>
        <td class="admin-actions">
          <button class="btn btn-sm" onclick="editPlace(${p.id})">Redaktə</button>
          <button class="btn btn-danger btn-sm" onclick="deletePlace(${p.id})">Sil</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { console.error("Fetch places error", e); }
}

async function deletePlace(id) {
  if (!confirm("Bu obyekti silmək istədiyinizə əminsiniz?")) return;
  try {
    const r = await fetch(`${API_URL}/admin/places/${id}`, { method: 'DELETE' });
    if (r.ok) { fetchPlaces(); fetchStats(); }
  } catch (e) { alert("Xəta baş verdi"); }
}

// ---------- Bookings ----------
async function fetchBookings() {
  try {
    const r = await fetch(`${API_URL}/admin/bookings`);
    const data = await r.json();
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = data.map(b => `
      <tr>
        <td>${new Date(b.created_at).toLocaleDateString()}</td>
        <td>
          <strong>${b.full_name}</strong><br>
          <small>${b.phone} | ${b.email}</small>
        </td>
        <td>${b.place_name || 'Silinmiş obyekt'}</td>
        <td>${b.gender === 'female' ? 'Qız' : 'Oğlan'}</td>
        <td>${b.duration}</td>
        <td><span class="status status-wait">${b.status}</span></td>
      </tr>
    `).join('');
  } catch (e) { console.error("Fetch bookings error", e); }
}

// ---------- Form & Modal ----------
const modal = document.getElementById('adminModal');
const placeForm = document.getElementById('placeForm');

document.getElementById('addPlaceBtn').addEventListener('click', () => {
  placeForm.reset();
  placeForm.id.value = "";
  document.getElementById('modalTitle').textContent = "Yeni Obyekt Əlavə Et";
  modal.classList.add('active');
});

document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => modal.classList.remove('active'));
});

async function editPlace(id) {
  try {
    const r = await fetch(`${API_URL}/places/${id}`);
    const p = await r.json();
    
    placeForm.id.value = p.id;
    placeForm.name.value = p.name;
    placeForm.city.value = p.city;
    placeForm.type.value = p.type;
    placeForm.gender.value = p.gender;
    placeForm.price.value = p.price;
    placeForm.total_spots.value = p.total_spots;
    placeForm.female_occupied.value = p.female_occupied;
    placeForm.female_free.value = p.female_free;
    placeForm.male_occupied.value = p.male_occupied;
    placeForm.male_free.value = p.male_free;
    placeForm.address.value = p.address;
    placeForm.description.value = p.description;
    placeForm.wifi.checked = !!p.wifi;
    placeForm.utilities.checked = !!p.utilities;

    document.getElementById('modalTitle').textContent = "Obyekti Redaktə Et";
    modal.classList.add('active');
  } catch (e) { alert("Məlumat gətirilərkən xəta"); }
}

placeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(placeForm);
  const data = Object.fromEntries(formData.entries());
  
  // Clean values
  data.price = parseInt(data.price);
  data.total_spots = parseInt(data.total_spots);
  data.female_occupied = parseInt(data.female_occupied);
  data.female_free = parseInt(data.female_free);
  data.male_occupied = parseInt(data.male_occupied);
  data.male_free = parseInt(data.male_free);
  data.free_spots = data.female_free + data.male_free;
  data.wifi = placeForm.wifi.checked;
  data.utilities = placeForm.utilities.checked;

  const id = placeForm.id.value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API_URL}/admin/places/${id}` : `${API_URL}/admin/places`;

  try {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (r.ok) {
      modal.classList.remove('active');
      fetchPlaces();
      fetchStats();
    } else {
      alert("Xəta baş verdi");
    }
  } catch (e) { alert("Server xətası"); }
});

// Init
fetchStats();
fetchPlaces();

// Expose global functions for onclick
window.editPlace = editPlace;
window.deletePlace = deletePlace;
