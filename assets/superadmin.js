const API = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
const $ = (sel) => document.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Fix 3: 403 now calls showLogin, not saGuard ───────────────────────────────
async function saFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, credentials: 'same-origin' });
  if (res.status === 401) { showLogin(); throw new Error('401'); }
  if (res.status === 403) { showLogin('Bu səhifə yalnız superadmin üçündür.'); throw new Error('403'); }
  return res;
}

function showLogin(msg = '') {
  $('#saLoginPage').hidden = false;
  $('#saApp').hidden = true;
  if (msg) $('#saLoginNote').textContent = msg;
  clearTimeout(_timeoutHandle);
}

function showApp() {
  $('#saLoginPage').hidden = true;
  $('#saApp').hidden = false;
  $('#saLoginNote').textContent = '';
  resetActivityTimer();
}

// ── Fix 14: note clears color when empty; Fix 11: ok notes auto-clear 3s ─────
function note(id, text, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  if (!text) { el.style.color = ''; return; }
  el.style.color = ok ? 'var(--success)' : 'var(--danger)';
  if (ok) setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.style.color = ''; } }, 3000);
}

// ── Fix 4: mousemove throttled 1/s; Fix 10: countdown every 1s ───────────────
const TIMEOUT_MS = 30 * 60 * 1000;
let _timeoutHandle = null;
let _timeoutStart  = null;
let _moveThrottle  = null;

function resetActivityTimer() {
  clearTimeout(_timeoutHandle);
  _timeoutStart = Date.now();
  _timeoutHandle = setTimeout(() => {
    saFetch(`${API}/superadmin/logout`, { method: 'POST' }).catch(() => {});
    showLogin('30 dəqiqəlik aktivsizlik — yenidən daxil olun.');
  }, TIMEOUT_MS);
}

setInterval(() => {
  if (!_timeoutStart || $('#saApp').hidden) return;
  const remaining = Math.max(0, TIMEOUT_MS - (Date.now() - _timeoutStart));
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const bar = $('#saTimeoutBar');
  if (bar) bar.textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;
}, 1000); // Fix 10: was 5000

['click','keydown','touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { if (!$('#saApp').hidden) resetActivityTimer(); }, { passive: true })
);
document.addEventListener('mousemove', () => { // Fix 4: throttle mousemove
  if ($('#saApp').hidden || _moveThrottle) return;
  _moveThrottle = setTimeout(() => { _moveThrottle = null; resetActivityTimer(); }, 1000);
}, { passive: true });

// ── Theme toggle ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = $('#saThemeIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

$('#saThemeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

(function() {
  const icon = $('#saThemeIcon');
  if (icon) icon.textContent = (localStorage.getItem('theme') || 'light') === 'dark' ? '☀️' : '🌙';
})();

// ── Fix 6 & 15: view tracking; refresh targets current view; dashboard reloads ─
let _currentView = 'dashboard';

const VIEWS = {
  dashboard: { el: '#viewDashboard', title: 'Dashboard' },
  orgs:      { el: '#viewOrgs',      title: 'Orqanizasiyalar' },
  auditlog:  { el: '#viewAuditlog',  title: 'Audit Log' },
  settings:  { el: '#viewSettings',  title: 'Sistem ayarları' },
};

function switchView(name) {
  _currentView = name;
  Object.entries(VIEWS).forEach(([key, v]) => { $(v.el).hidden = key !== name; });
  document.querySelectorAll('.sa-nav-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  $('#saPageTitle').textContent = VIEWS[name]?.title ?? name;
  // Fix 15: dashboard also reloads stats
  if (name === 'dashboard') loadPlatformStats();
  if (name === 'settings')  loadSettings();
  if (name === 'orgs')      loadOrgs();
  if (name === 'auditlog')  loadAuditLogs();
}

document.querySelectorAll('.sa-nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Fix 8: sayta qayıt via event listener, not inline onclick
$('#btnGotoSite').addEventListener('click', () => { window.location.href = 'index.html'; });

// Fix 6: refresh targets current view
$('#btnRefresh').addEventListener('click', async () => {
  if (_currentView === 'dashboard') { await loadPlatformStats(); return; }
  if (_currentView === 'orgs')      { await Promise.all([loadPlatformStats(), loadOrgs()]); return; }
  if (_currentView === 'auditlog')  { await loadAuditLogs(); return; }
});

// ── Platform stats ────────────────────────────────────────────────────────────
async function loadPlatformStats() {
  try {
    const [sRes, dbRes] = await Promise.all([
      saFetch(`${API}/superadmin/platform-stats`),
      saFetch(`${API}/superadmin/db-stats`),
    ]);
    const d  = await sRes.json();
    const db = await dbRes.json();
    $('#platformStats').innerHTML = [
      ['📁 Aktiv orqanizasiyalar',   d.activeOrgs ?? 0],
      ['🚫 Bloklanmış / Gözləyən',   `${d.suspendedOrgs ?? 0} / ${d.pendingOrgs ?? 0}`],
      ['🏠 Ümumi elanlar',           d.totalPlaces ?? 0],
      ['📊 Doluluq faizi',           `${d.occupancyPct ?? 0}%`],
      ['⏳ Gözləyən rezervasiyalar', d.pendingBookings ?? 0],
      ['✅ Təsdiq nisbəti',          `${d.approvalRate ?? 0}%`],
      ['🎓 Aktiv tələbələr',         d.approvedStudents ?? 0],
      ['📄 Sənəd gözləyən',         (d.pendingStudents ?? 0) + (d.pendingProviders ?? 0)],
      ['👥 Admin / Moderator',       `${d.activeAdmins ?? 0} / ${d.activeModerators ?? 0}`],
      ['💾 Baza ölçüsü',            `${db.fileSizeMB ?? 0} MB`],
    ].map(([label, val]) => `
      <div class="stat-card"><h4>${label}</h4><strong>${val}</strong></div>
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
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Dəyişdirilmədi'); return; }
    await Promise.all([loadOrgs(), loadPlatformStats()]);
  } catch {}
};

// ── Organizations ─────────────────────────────────────────────────────────────
let _allOrgs = [];

async function loadOrgs() {
  try {
    const res = await saFetch(`${API}/superadmin/organizations`);
    _allOrgs = await res.json();
    renderOrgs(_allOrgs);
    populateAuditOrgFilter(_allOrgs);
  } catch {}
}

const TYPE_LABEL = { hostel: 'Yataqxana', university: 'Universitet', hotel: 'Hotel' };

function renderOrgs(orgs) {
  const tbody = $('#orgsBody');
  if (!orgs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted)">Heç bir orqanizasiya yoxdur.</td></tr>';
    $('#chkAll').checked = false;
    updateBulkBar(); // Fix 2
    return;
  }
  tbody.innerHTML = orgs.map(o => `
    <tr>
      <td><input type="checkbox" class="org-chk" data-id="${o.id}"></td>
      <td>
        <strong>${esc(o.name)}</strong>
        <span class="org-pill">${TYPE_LABEL[o.type] || esc(o.type)}</span>
        <div class="mini-stats">
          ${o.contact_email ? `<span>✉ ${esc(o.contact_email)}</span>` : ''}
          ${o.contact_phone ? `<span>📞 ${esc(o.contact_phone)}</span>` : ''}
        </div>
      </td>
      <td>
        <div class="mini-stats">
          <span>🏠 ${o.placeCount ?? 0} elan</span>
          <span>🔓 ${o.freeSpots ?? 0} boş</span>
          <span>📋 ${(o.pendingBookings ?? 0) + (o.approvedBookings ?? 0)} rezerv</span>
          <span>👤 ${o.adminCount ?? 0} admin</span>
          <span>🛡 ${o.moderatorCount ?? 0} mod</span>
        </div>
      </td>
      <td><span class="badge ${
        o.status === 'Active'    ? 'badge-ok'   :
        o.status === 'Suspended' ? 'badge-err'  :
        o.status === 'Pending'   ? 'badge-warn' : 'badge-muted'
      }">${
        o.status === 'Active'    ? 'Aktiv'      :
        o.status === 'Suspended' ? 'Bloklanmış' :
        o.status === 'Pending'   ? 'Gözləyir'   : 'Arxivdə'
      }</span></td>
      <td class="row-acts">
        <button class="btn btn-sm" onclick="openOrgDetail(${o.id})">🔍 Detay</button>
        ${o.status !== 'Active'   ? `<button class="btn btn-sm" style="color:var(--success)" onclick="setOrgStatus(${o.id},'Active')">Aktiv et</button>` : ''}
        ${o.status === 'Active'   ? `<button class="btn btn-sm" style="color:var(--danger)" onclick="setOrgStatus(${o.id},'Suspended')">Blokla</button>` : ''}
        ${o.status !== 'Archived' ? `<button class="btn btn-sm" style="color:var(--text-muted)" onclick="setOrgStatus(${o.id},'Archived')">Arxivlə</button>` : ''}
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.org-chk').forEach(chk => {
    chk.addEventListener('change', updateBulkBar);
  });
  $('#chkAll').checked = false;
  updateBulkBar(); // Fix 2: always sync bulk bar after render
}

// ── Org search ────────────────────────────────────────────────────────────────
$('#orgSearch').addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  renderOrgs(q ? _allOrgs.filter(o => o.name.toLowerCase().includes(q)) : _allOrgs);
});

// ── Bulk select ───────────────────────────────────────────────────────────────
$('#chkAll').addEventListener('change', function() {
  document.querySelectorAll('.org-chk').forEach(c => { c.checked = this.checked; });
  updateBulkBar();
});

function updateBulkBar() {
  const checked = document.querySelectorAll('.org-chk:checked');
  $('#bulkBar').hidden = checked.length === 0;
  $('#bulkCount').textContent = checked.length;
}

$('#btnBulkClear').addEventListener('click', () => {
  document.querySelectorAll('.org-chk').forEach(c => { c.checked = false; });
  $('#chkAll').checked = false;
  updateBulkBar();
});

$('#btnBulkApply').addEventListener('click', async () => {
  const status = $('#bulkStatusSel').value;
  if (!status) { alert('Status seçin'); return; }
  const ids = [...document.querySelectorAll('.org-chk:checked')].map(c => parseInt(c.dataset.id));
  if (!ids.length) return;
  if (!confirm(`${ids.length} orqanizasiyanın statusunu "${status}" olaraq dəyişmək istəyirsiniz?`)) return;
  try {
    const res = await saFetch(`${API}/superadmin/org-bulk-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Xəta baş verdi');
    $('#bulkStatusSel').value = '';
    document.querySelectorAll('.org-chk').forEach(c => { c.checked = false; });
    $('#chkAll').checked = false;
    updateBulkBar();
    await Promise.all([loadOrgs(), loadPlatformStats()]);
  } catch (err) {
    alert(err.message);
  }
});

// ── New org modal ─────────────────────────────────────────────────────────────
$('#btnNewOrg').addEventListener('click', () => {
  $('#newOrgModal').setAttribute('aria-hidden', 'false');
  $('#newOrgForm').reset();
  note('#newOrgNote', '');
});

window.closeNewOrgModal = function() {
  $('#newOrgModal').setAttribute('aria-hidden', 'true');
};

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
    closeNewOrgModal();
    await Promise.all([loadOrgs(), loadPlatformStats()]);
  } catch (err) {
    note('#newOrgNote', err.message);
  }
});

// ── Org detail modal ──────────────────────────────────────────────────────────
let _currentOrgId = null;

// Fix 1: use _allOrgs cache instead of re-fetching all orgs
window.openOrgDetail = async function(id) {
  _currentOrgId = id;
  $('#orgDetailModal').setAttribute('aria-hidden', 'false');
  note('#editOrgNote', '');
  $('#orgMiniChart').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Yüklənir…</span>';

  const org = _allOrgs.find(o => o.id === id);
  if (org) {
    $('#orgDetailTitle').textContent = org.name;
    const ef = $('#editOrgForm');
    ef.elements.id.value           = org.id;
    ef.elements.name.value         = org.name || '';
    ef.elements.type.value         = org.type || 'hostel';
    ef.elements.contact_email.value = org.contact_email || '';
    ef.elements.contact_phone.value = org.contact_phone || '';
    ef.elements.status.value       = org.status || 'Active';
  } else {
    $('#orgDetailTitle').textContent = `Orq #${id}`;
  }

  $('#newAdminPanel').hidden = true;
  $('#newAdminForm').elements.organization_id.value = id;
  await Promise.all([loadOrgAdmins(id), loadOrgRecentBookings(id)]);
};

window.closeOrgDetail = function() {
  $('#orgDetailModal').setAttribute('aria-hidden', 'true');
  _currentOrgId = null;
};

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
    note('#editOrgNote', '✓ Saxlandı.', true); // auto-clears in 3s
    $('#orgDetailTitle').textContent = data.name;
    await loadOrgs();
  } catch (err) {
    note('#editOrgNote', err.message);
  }
});

// ── Org mini chart (last 7 days) ──────────────────────────────────────────────
async function loadOrgRecentBookings(id) {
  try {
    const res = await saFetch(`${API}/superadmin/organizations/${id}/recent-bookings`);
    const rows = await res.json();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const map = {};
    rows.forEach(r => { map[r.day] = r.count; });
    const counts = days.map(d => map[d] || 0);
    const max = Math.max(...counts, 1);

    $('#orgMiniChart').innerHTML = counts.map((c, i) => `
      <div class="mc-col">
        <div class="mc-bar" style="height:${Math.max(3, Math.round((c / max) * 50))}px" title="${days[i]}: ${c} rezerv"></div>
        <span class="mc-lbl">${days[i].slice(5)}</span>
      </div>
    `).join('');
  } catch {
    $('#orgMiniChart').innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Məlumat yoxdur</span>';
  }
}

// ── Org admins ────────────────────────────────────────────────────────────────
async function loadOrgAdmins(orgId) {
  try {
    const res = await saFetch(`${API}/superadmin/organizations/${orgId}/admins`);
    const users = await res.json();
    const tbody = $('#orgAdminsBody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">İstifadəçi yoxdur.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${esc(u.username)}</strong></td>
        <td>${esc(u.full_name || '—')}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-info' : 'badge-muted'}">${u.role === 'admin' ? 'Admin' : 'Moderator'}</span></td>
        <td><span class="badge ${u.active ? 'badge-ok' : 'badge-err'}">${u.active ? 'Aktiv' : 'Deaktiv'}</span></td>
        <td class="row-acts">
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
  } catch (err) { alert(err.message); }
};

window.deleteOrgAdmin = async function(id) {
  if (!confirm('Bu istifadəçini silmək istəyirsiniz?')) return;
  try {
    const res = await saFetch(`${API}/superadmin/org-admins/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Silinmədi'); }
    if (_currentOrgId) await loadOrgAdmins(_currentOrgId);
  } catch (err) { alert(err.message); }
};

$('#btnNewAdminUser').addEventListener('click', () => {
  $('#newAdminPanel').hidden = false;
  note('#newAdminNote', '');
});

$('#btnCancelAdmin').addEventListener('click', () => {
  $('#newAdminPanel').hidden = true;
  $('#newAdminForm').reset();
  if (_currentOrgId) $('#newAdminForm').elements.organization_id.value = _currentOrgId;
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
    if (_currentOrgId) await loadOrgAdmins(_currentOrgId);
  } catch (err) {
    note('#newAdminNote', err.message);
  }
});

// ── Audit logs ────────────────────────────────────────────────────────────────
let _auditOffset = 0;
const AUDIT_LIMIT = 50;
let _lastAuditRows = 0;
let _allAuditRows  = [];

function populateAuditOrgFilter(orgs) {
  const sel = $('#alOrgFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="">Bütün orqanizasiyalar</option>' +
    orgs.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
  sel.value = current;
}

async function loadAuditLogs(reset = true) {
  if (reset) _auditOffset = 0;
  const orgId = $('#alOrgFilter').value;
  const params = new URLSearchParams({ limit: AUDIT_LIMIT, offset: _auditOffset });
  if (orgId) params.set('org_id', orgId);
  try {
    const res = await saFetch(`${API}/superadmin/audit-logs?${params}`);
    _allAuditRows  = await res.json();
    _lastAuditRows = _allAuditRows.length;
    renderAuditLogs(_allAuditRows);
    const page = Math.floor(_auditOffset / AUDIT_LIMIT) + 1;
    $('#auditPageInfo').textContent = `Səhifə ${page} · ${_allAuditRows.length} qeyd`;
    $('#btnAuditPrev').disabled = _auditOffset === 0;
    $('#btnAuditNext').disabled = _allAuditRows.length < AUDIT_LIMIT;
  } catch {}
}

// Fix 12: meta truncation shows … indicator
function renderAuditLogs(rows) {
  const q = $('#alSearch').value.trim().toLowerCase();
  const filtered = q ? rows.filter(r =>
    (r.actor||'').toLowerCase().includes(q) ||
    (r.action||'').toLowerCase().includes(q) ||
    (r.org_name||'').toLowerCase().includes(q)
  ) : rows;

  const tbody = $('#auditBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">Qeyd tapılmadı.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const metaRaw = (() => { try { return JSON.stringify(JSON.parse(r.meta), null, 0); } catch { return r.meta || ''; } })();
    const metaDisplay = metaRaw.length > 80 ? metaRaw.slice(0, 80) + '…' : metaRaw; // Fix 12
    const dt = new Date(r.created_at).toLocaleString('az-AZ', { dateStyle:'short', timeStyle:'short' });
    return `
      <tr>
        <td style="white-space:nowrap;font-size:12px">${dt}</td>
        <td><strong>${esc(r.actor || '—')}</strong></td>
        <td>${r.org_name
          ? `<span class="badge badge-info" style="font-size:11px">${esc(r.org_name)}</span>`
          : '<span style="color:var(--text-muted);font-size:12px">Platform</span>'}</td>
        <td><code style="font-size:12px;background:var(--bg-subtle);padding:2px 6px;border-radius:4px">${esc(r.action || '')}</code></td>
        <td style="font-size:12px">${esc(r.entity_type || '')}${r.entity_id ? ` #${r.entity_id}` : ''}</td>
        <td><span class="al-meta" title="${esc(metaRaw)}">${esc(metaDisplay)}</span></td>
      </tr>
    `;
  }).join('');
}

$('#alOrgFilter').addEventListener('change', () => loadAuditLogs(true));
$('#alSearch').addEventListener('input', () => renderAuditLogs(_allAuditRows));

$('#btnAuditPrev').addEventListener('click', () => {
  if (_auditOffset >= AUDIT_LIMIT) { _auditOffset -= AUDIT_LIMIT; loadAuditLogs(false); }
});
$('#btnAuditNext').addEventListener('click', () => {
  if (_lastAuditRows >= AUDIT_LIMIT) { _auditOffset += AUDIT_LIMIT; loadAuditLogs(false); }
});

// ── Settings — Fix 5: res.ok checked before res.json() ───────────────────────
async function loadSettings() {
  try {
    const res = await saFetch(`${API}/superadmin/settings`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Ayarlar yüklənmədi');
    }
    const d = await res.json();
    const form = $('#settingsForm');
    Object.entries(d).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v || ''; });
  } catch (err) {
    note('#settingsNote', err.message);
  }
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
    note('#settingsNote', '✓ Ayarlar saxlandı.', true); // auto-clears 3s
  } catch (err) {
    note('#settingsNote', err.message);
  }
});

// ── Login / Logout ────────────────────────────────────────────────────────────
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
