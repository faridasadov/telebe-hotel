const API = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
const $ = (sel) => document.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function saFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, credentials: 'same-origin' });
  if (res.status === 401) { showLogin(); throw new Error('401'); }
  if (res.status === 403) { $('#saGuard').textContent = 'Bu səhifə yalnız superadmin üçündür.'; throw new Error('403'); }
  return res;
}

function showLogin(msg = '') {
  $('#saLogin').hidden = false;
  $('#saApp').hidden = true;
  $('#saLogout').hidden = true;
  $('#saGuard').textContent = msg;
}

function showApp() {
  $('#saLogin').hidden = true;
  $('#saApp').hidden = false;
  $('#saLogout').hidden = false;
  $('#saGuard').textContent = '';
}

function note(id, text, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--success)' : 'var(--danger)';
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.sa-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sa-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const name = tab.dataset.tab;
    $('#tabOrgs').hidden = name !== 'orgs';
    $('#tabSettings').hidden = name !== 'settings';
    if (name === 'settings') loadSettings();
  });
});

// ── Platform stats ────────────────────────────────────────────────────────────
async function loadPlatformStats() {
  try {
    const [sRes, dbRes] = await Promise.all([
      saFetch(`${API}/superadmin/platform-stats`),
      saFetch(`${API}/superadmin/db-stats`),
    ]);
    const d = await sRes.json();
    const db = await dbRes.json();
    $('#platformStats').innerHTML = [
      ['Aktiv orqanizasiyalar', d.activeOrgs ?? 0],
      ['Bloklanmış / Gözləyən', `${d.suspendedOrgs ?? 0} / ${d.pendingOrgs ?? 0}`],
      ['Ümumi elanlar', d.totalPlaces ?? 0],
      ['Doluluq faizi', `${d.occupancyPct ?? 0}%`],
      ['Gözləyən rezervasiyalar', d.pendingBookings ?? 0],
      ['Təsdiq nisbəti', `${d.approvalRate ?? 0}%`],
      ['Aktiv tələbələr', d.approvedStudents ?? 0],
      ['Sənəd gözləyən', (d.pendingStudents ?? 0) + (d.pendingProviders ?? 0)],
      ['Admin / Moderator', `${d.activeAdmins ?? 0} / ${d.activeModerators ?? 0}`],
      ['Baza ölçüsü', `${db.fileSizeMB ?? 0} MB`],
    ].map(([label, val]) => `
      <div class="stat-card">
        <h4>${label}</h4>
        <strong>${val}</strong>
      </div>
    `).join('');
  } catch {}
}

// ── Org status quick toggle ───────────────────────────────────────────────────
window.setOrgStatus = async function(id, status) {
  try {
    const res = await saFetch(`${API}/superadmin/organizations/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert(d.error || 'Dəyişdirilmədi'); return; }
    await loadOrgs();
    await loadPlatformStats();
  } catch {}
};

// ── Organizations ─────────────────────────────────────────────────────────────
async function loadOrgs() {
  try {
    const res = await saFetch(`${API}/superadmin/organizations`);
    const orgs = await res.json();
    const tbody = $('#orgsBody');
    if (!orgs.length) {
      tbody.innerHTML = '<tr><td colspan="4">Heç bir orqanizasiya yoxdur.</td></tr>';
      return;
    }
    const typeLabel = { hostel: 'Yataqxana', university: 'Universitet', hotel: 'Hotel' };
    tbody.innerHTML = orgs.map(o => `
      <tr>
        <td>
          <strong>${esc(o.name)}</strong><br>
          <small>${typeLabel[o.type] || esc(o.type)}</small>
          <div class="mini-stats">
            ${o.contact_email ? `<span>${esc(o.contact_email)}</span>` : ''}
            ${o.contact_phone ? `<span>${esc(o.contact_phone)}</span>` : ''}
          </div>
        </td>
        <td>
          <div class="mini-stats">
            <span>${o.places_count ?? 0} elan</span>
            <span>${o.free_spots ?? 0} boş yer</span>
            <span>${o.booking_count ?? 0} rezervasiya</span>
            <span>${o.admin_count ?? 0} admin</span>
            <span>${o.moderator_count ?? 0} moderator</span>
          </div>
        </td>
        <td><span class="tag ${
          o.status === 'Active' ? 'tag-active' :
          o.status === 'Suspended' ? 'tag-inactive' :
          o.status === 'Pending' ? '' : 'tag-inactive'
        }">${o.status === 'Active' ? 'Aktiv' : o.status === 'Suspended' ? 'Bloklanmış' : o.status === 'Pending' ? 'Gözləyir' : 'Arxivdə'}</span></td>
        <td class="act">
          <button class="btn btn-sm" onclick="openOrgDetail(${o.id}, ${JSON.stringify(esc(o.name))})">Detay</button>
          ${o.status !== 'Active'     ? `<button class="btn btn-sm" style="color:var(--success)" onclick="setOrgStatus(${o.id},'Active')">Aktiv et</button>` : ''}
          ${o.status === 'Active'     ? `<button class="btn btn-sm" style="color:var(--danger)"  onclick="setOrgStatus(${o.id},'Suspended')">Blokla</button>` : ''}
          ${o.status !== 'Archived'   ? `<button class="btn btn-sm" style="color:var(--text-muted)" onclick="setOrgStatus(${o.id},'Archived')">Arxivlə</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch {}
}

// ── New org form ──────────────────────────────────────────────────────────────
$('#btnNewOrg').addEventListener('click', () => {
  $('#newOrgPanel').hidden = false;
  $('#btnNewOrg').hidden = true;
});

$('#btnCancelOrg').addEventListener('click', () => {
  $('#newOrgPanel').hidden = true;
  $('#btnNewOrg').hidden = false;
  $('#newOrgForm').reset();
  note('#newOrgNote', '');
});

$('#newOrgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await saFetch(`${API}/superadmin/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Yaratmaq olmadı');
    e.target.reset();
    $('#newOrgPanel').hidden = true;
    $('#btnNewOrg').hidden = false;
    note('#newOrgNote', '');
    await loadOrgs();
    await loadPlatformStats();
  } catch (err) {
    note('#newOrgNote', err.message);
  }
});

// ── Org detail panel ──────────────────────────────────────────────────────────
let _currentOrgId = null;

window.openOrgDetail = async function(id, name) {
  _currentOrgId = id;
  $('#orgDetailTitle').textContent = name;
  $('#orgDetail').hidden = false;
  $('#orgDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const editForm = $('#editOrgForm');
  try {
    const res = await saFetch(`${API}/superadmin/organizations`);
    const orgs = await res.json();
    const org = orgs.find(o => o.id === id);
    if (org) {
      editForm.elements.id.value = org.id;
      editForm.elements.name.value = org.name || '';
      editForm.elements.type.value = org.type || 'hostel';
      editForm.elements.contact_email.value = org.contact_email || '';
      editForm.elements.contact_phone.value = org.contact_phone || '';
      editForm.elements.status.value = org.status || 'Active';
    }
  } catch {}

  $('#newAdminPanel').hidden = true;
  $('#newAdminForm').elements.organization_id.value = id;
  note('#editOrgNote', '');
  await loadOrgAdmins(id);
};

$('#btnCloseDetail').addEventListener('click', () => {
  $('#orgDetail').hidden = true;
  _currentOrgId = null;
});

$('#editOrgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const id = data.id;
  delete data.id;
  try {
    const res = await saFetch(`${API}/superadmin/organizations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Saxlanmadı');
    note('#editOrgNote', 'Saxlandı.', true);
    $('#orgDetailTitle').textContent = data.name;
    await loadOrgs();
  } catch (err) {
    note('#editOrgNote', err.message);
  }
});

// ── Org admins ────────────────────────────────────────────────────────────────
async function loadOrgAdmins(orgId) {
  try {
    const res = await saFetch(`${API}/superadmin/organizations/${orgId}/admins`);
    const users = await res.json();
    const tbody = $('#orgAdminsBody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5">İstifadəçi yoxdur.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.full_name || '')}</td>
        <td><span class="tag ${u.role === 'admin' ? 'tag-active' : ''}">${u.role === 'admin' ? 'Admin' : 'Moderator'}</span></td>
        <td><span class="tag ${u.active ? 'tag-active' : 'tag-inactive'}">${u.active ? 'Aktiv' : 'Deaktiv'}</span></td>
        <td class="act">
          <button class="btn btn-sm" onclick="toggleOrgAdmin(${u.id}, ${u.active ? 0 : 1})">${u.active ? 'Deaktiv et' : 'Aktiv et'}</button>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="deleteOrgAdmin(${u.id})">Sil</button>
        </td>
      </tr>
    `).join('');
  } catch {}
}

window.toggleOrgAdmin = async function(id, active) {
  try {
    const res = await saFetch(`${API}/superadmin/org-admins/${id}/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error('Status dəyişdirilmədi');
    if (_currentOrgId) await loadOrgAdmins(_currentOrgId);
  } catch (err) {
    alert(err.message);
  }
};

window.deleteOrgAdmin = async function(id) {
  if (!confirm('Bu istifadəçini silmək istəyirsiniz?')) return;
  try {
    const res = await saFetch(`${API}/superadmin/org-admins/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Silinmədi'); }
    if (_currentOrgId) await loadOrgAdmins(_currentOrgId);
  } catch (err) {
    alert(err.message);
  }
};

// ── New admin user form ────────────────────────────────────────────────────────
$('#btnNewAdminUser').addEventListener('click', () => {
  $('#newAdminPanel').hidden = false;
  note('#newAdminNote', '');
});

$('#btnCancelAdmin').addEventListener('click', () => {
  $('#newAdminPanel').hidden = true;
  $('#newAdminForm').reset();
  note('#newAdminNote', '');
});

$('#newAdminForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await saFetch(`${API}/superadmin/org-admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Yaratmaq olmadı');
    e.target.reset();
    if (_currentOrgId) e.target.elements.organization_id.value = _currentOrgId;
    $('#newAdminPanel').hidden = true;
    note('#newAdminNote', '');
    if (_currentOrgId) await loadOrgAdmins(_currentOrgId);
  } catch (err) {
    note('#newAdminNote', err.message);
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await saFetch(`${API}/superadmin/settings`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Ayarlar yüklənmədi');
    const form = $('#settingsForm');
    Object.entries(d).forEach(([k, v]) => {
      if (form.elements[k]) form.elements[k].value = v || '';
    });
  } catch {}
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await saFetch(`${API}/superadmin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'Saxlanmadı');
    e.target.elements.smtp_pass.value = '';
    note('#settingsNote', 'Ayarlar saxlandı.', true);
  } catch (err) {
    note('#settingsNote', err.message);
  }
});

// ── Login / Logout ─────────────────────────────────────────────────────────────
$('#saLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(e.target).entries());
  note('#saLoginNote', '');
  try {
    const res = await fetch(`${API}/superadmin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Giriş alınmadı');
    e.target.elements.password.value = '';
    showApp();
    await Promise.all([loadPlatformStats(), loadOrgs()]);
  } catch (err) {
    note('#saLoginNote', err.message);
  }
});

$('#saLogout').addEventListener('click', () => {
  saFetch(`${API}/superadmin/logout`, { method: 'POST' }).catch(() => {});
  showLogin();
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  try {
    const res = await saFetch(`${API}/superadmin/session`);
    const session = await res.json();
    if (session.role !== 'superadmin') { showLogin('Bu səhifə yalnız superadmin üçündür.'); return; }
    showApp();
    await Promise.all([loadPlatformStats(), loadOrgs()]);
  } catch {}
})();
