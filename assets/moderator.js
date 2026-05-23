const API = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
const $ = s => document.querySelector(s);

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function badge(status) {
  if (status === 'Approved') return `<span class="badge badge-ok">Təsdiqlənib</span>`;
  if (status === 'Rejected') return `<span class="badge badge-no">Rədd edilib</span>`;
  if (status === 'Expired')  return `<span class="badge badge-no">Vaxtı keçib</span>`;
  return `<span class="badge badge-wait">Gözləyir</span>`;
}

function typeLabel(t) {
  return t === 'hostel' ? 'Yataqxana' : t === 'hotel' ? 'Hotel' : t === 'apartment' ? 'Kirayə ev' : esc(t||'—');
}

async function mFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, credentials: 'same-origin' });
  if (res.status === 401) { showLogin(); throw new Error('401'); }
  return res;
}

function showLogin(msg = '') {
  $('#modLogin').hidden = false;
  $('#modApp').hidden = true;
  $('#modLogout').hidden = true;
  if (msg) $('#modLoginNote').textContent = msg;
}

function showApp(session) {
  $('#modLogin').hidden = true;
  $('#modApp').hidden = false;
  $('#modLogout').hidden = false;
  if (session?.organization_name) {
    $('#modOrgName').textContent = '— ' + session.organization_name;
  }
}

function attachSearch(inputId, tbodyId) {
  const inp = $(`#${inputId}`), tb = $(`#${tbodyId}`);
  if (!inp || !tb) return;
  inp.oninput = () => {
    const q = inp.value.toLowerCase();
    Array.from(tb.rows).forEach(r => { r.style.display = q && !r.textContent.toLowerCase().includes(q) ? 'none' : ''; });
  };
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#tabBookings').hidden = tab !== 'bookings';
    $('#tabPlaces').hidden = tab !== 'places';
    if (tab === 'bookings') loadBookings();
    if (tab === 'places') loadPlaces();
  });
});

async function loadStats() {
  try {
    const res = await mFetch(`${API}/admin/stats-extended`);
    const d = await res.json();
    $('#modStats').innerHTML = [
      ['Elanlar', d.totalPlaces ?? 0],
      ['Boş yerlər', d.freeSpots ?? 0],
      ['Gözləyən', d.pendingBookings ?? 0],
      ['Cəmi rezervasiya', d.totalBookings ?? 0],
    ].map(([label, val]) => `<div class="stat-card"><h4>${label}</h4><strong>${val}</strong></div>`).join('');
  } catch {}
}

async function loadBookings() {
  try {
    const res = await mFetch(`${API}/admin/bookings`);
    const rows = await res.json();
    $('#bookingsBody').innerHTML = rows.map(b => `
      <tr>
        <td>${new Date(b.created_at).toLocaleDateString()}</td>
        <td>
          <strong>${esc(b.full_name)}</strong><br>
          <small>${esc(b.phone)} · ${esc(b.email)}</small>
          ${b.note ? `<br><small style="color:var(--text-muted)">${esc(b.note)}</small>` : ''}
        </td>
        <td>${esc(b.place_name || '—')}</td>
        <td>${b.gender === 'female' ? 'Qız' : b.gender === 'male' ? 'Oğlan' : '—'}</td>
        <td>${esc(b.duration)} ay</td>
        <td>${badge(b.status)}</td>
        <td class="acts">
          <button class="btn btn-sm" onclick="setStatus(${b.id},'Approved')" ${b.status==='Approved'?'disabled':''}>Təsdiq</button>
          <button class="btn btn-sm" onclick="setStatus(${b.id},'Pending')" ${b.status==='Pending'?'disabled':''}>Gözlət</button>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="setStatus(${b.id},'Rejected')" ${b.status==='Rejected'?'disabled':''}>Rədd</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7">Rezervasiya yoxdur.</td></tr>';
    attachSearch('srchBookings', 'bookingsBody');
  } catch {}
}

window.setStatus = async function(id, status) {
  const note = status === 'Rejected' ? (prompt('İmtina səbəbi (ixtiyari)') ?? '') : '';
  try {
    const res = await mFetch(`${API}/admin/bookings/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert(d.error || 'Status dəyişmədi'); return; }
    loadBookings();
    loadStats();
  } catch {}
};

async function loadPlaces() {
  try {
    const res = await mFetch(`${API}/admin/places`);
    const rows = await res.json();
    $('#placesBody').innerHTML = rows.map(p => `
      <tr>
        <td><strong>${esc(p.name)}</strong><br><small>${esc(p.address||'')}</small></td>
        <td>${typeLabel(p.type)}</td>
        <td>${esc(p.price)} AZN</td>
        <td>Q: ${p.female_occupied}/${p.female_free} | O: ${p.male_occupied}/${p.male_free}</td>
        <td><button class="btn btn-sm" onclick="openOcc(${p.id},${JSON.stringify(esc(p.name))},${p.female_occupied},${p.female_free},${p.male_occupied},${p.male_free})">Doluluq yenilə</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Elan yoxdur.</td></tr>';
    attachSearch('srchPlaces', 'placesBody');
  } catch {}
}

window.openOcc = function(id, name, fo, ff, mo, mf) {
  $('#occModalTitle').textContent = name;
  const f = $('#occForm');
  f.elements.place_id.value = id;
  f.elements.female_occupied.value = fo;
  f.elements.female_free.value = ff;
  f.elements.male_occupied.value = mo;
  f.elements.male_free.value = mf;
  $('#occNote').textContent = '';
  $('#occModal').setAttribute('aria-hidden', 'false');
};

window.closeOccModal = function() {
  $('#occModal').setAttribute('aria-hidden', 'true');
};

$('#occForm').addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const id = data.place_id;
  try {
    const res = await mFetch(`${API}/admin/places/${id}/occupancy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(()=>({}));
    if (!res.ok) { $('#occNote').textContent = payload.error || 'Saxlanmadı'; return; }
    closeOccModal();
    loadPlaces();
    loadStats();
  } catch {}
});

$('#modLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  $('#modLoginNote').textContent = '';
  try {
    const res = await fetch(`${API}/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(payload),
    });
    const d = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(d.error || 'Giriş alınmadı');
    if (d.role !== 'moderator') { $('#modLoginNote').textContent = 'Bu giriş yalnız moderatorlar üçündür.'; return; }
    e.target.elements.password.value = '';
    const sessRes = await mFetch(`${API}/admin/session`);
    const session = await sessRes.json();
    showApp(session);
    loadStats();
    loadBookings();
  } catch(err) {
    $('#modLoginNote').textContent = err.message;
  }
});

$('#modLogout').addEventListener('click', () => {
  mFetch(`${API}/admin/logout`, { method: 'POST' }).catch(()=>{});
  showLogin();
});

(async function init() {
  try {
    const res = await mFetch(`${API}/admin/session`);
    const session = await res.json();
    if (session.role !== 'moderator') { showLogin(); return; }
    showApp(session);
    loadStats();
    loadBookings();
  } catch { showLogin(); }
})();
