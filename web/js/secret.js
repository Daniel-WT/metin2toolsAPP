// ============ SECRET TAB ============
let secretItems = [];
const SECRET_ITEMS_KEY = 'metin2_secret_v1';
let _secretPastedImage = null;
let _secretEditTargetId = null;
let _secretDeleteTargetId = null;

function loadSecretLocal() {
  if (typeof db !== 'undefined' && db) return; // Firebase handles it
  try { secretItems = JSON.parse(localStorage.getItem(SECRET_ITEMS_KEY)) || []; }
  catch(e) { secretItems = []; }
}

function saveSecretItems() {
  if (typeof db !== 'undefined' && db) {
    const obj = {};
    secretItems.forEach(i => {
      obj[i.id] = JSON.parse(JSON.stringify(i, (k, v) => v === undefined ? undefined : v));
      Object.keys(obj[i.id]).forEach(k => { if (obj[i.id][k] === null) delete obj[i.id][k]; });
    });
    fbDebounce('secret', () => db.ref(p('secret/items')).set(obj));
  } else {
    localStorage.setItem(SECRET_ITEMS_KEY, JSON.stringify(secretItems));
  }
}

function renderSecretTab() {
  const grid = document.getElementById('secretGrid');
  if (!grid) return;

  if (!secretItems.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
      <div class="empty-state-title">Niciun item secret</div>
      <div class="empty-state-sub">Apasa Adauga pentru a incepe</div>
    </div>`;
    return;
  }

  const sorted = [...secretItems].sort((a, b) => {
    const ra = a.depersAt - Date.now(), rb = b.depersAt - Date.now();
    if (ra <= 0 && rb > 0) return 1;
    if (rb <= 0 && ra > 0) return -1;
    return ra - rb;
  });

  grid.innerHTML = sorted.map(renderSecretCard).join('');

  grid.querySelectorAll('[data-secret-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.secretAction;
      if (action === 'delete') openSecretDelete(id);
      else if (action === 'edit-time') openSecretEditTime(id);
    });
  });
}

function renderSecretCard(item) {
  const ms = item.depersAt - Date.now();
  const isDone = ms <= 0;
  const pct = isDone ? 0 : Math.max(0, Math.min(100, (ms / (item.totalDuration || 1)) * 100));
  const timerCls = isDone ? 'expired' : ms < 3600000 ? 'warning' : 'ok';

  const imgHtml = item.image
    ? `<img class="sz-card-img" src="${item.image}" alt="${escHtml(item.name)}">`
    : `<div class="sz-card-img secret-img-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>`;

  const timerBlock = isDone
    ? `<div class="sz-done-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Depersonalizat</div>`
    : `<div class="timer-section">
        <div class="timer-label">Timp ramas</div>
        <div class="timer-display ${timerCls}" data-timer-secret="${item.id}">${formatTimer(ms)}</div>
        <div class="progress-bar"><div class="progress-fill fill-secret" data-prog-secret="${item.id}" style="width:${pct}%"></div></div>
      </div>`;

  const editBtn = `<button class="btn-action" data-id="${item.id}" data-secret-action="edit-time">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Schimba Timp
  </button>`;
  const deleteBtn = `<button class="btn-action danger" data-id="${item.id}" data-secret-action="delete">Sterge</button>`;

  return `<div class="card${isDone ? ' sz-done-card' : ''}" data-secret-id="${item.id}">
    <div class="card-accent accent-secret"></div>
    <div class="card-body">
      <div class="card-header">
        <div class="cat-icon icon-secret">${imgHtml}</div>
        <div class="card-info">
          <div class="card-name">${escHtml(item.name)}</div>
          <div class="card-meta">
            <span class="card-category cat-secret">Secret</span>
            ${isDone ? '<span class="urgency-badge sz-done-badge">Depersonalizat</span>' : ''}
          </div>
        </div>
      </div>
      ${timerBlock}
      <div class="card-actions">${editBtn}${deleteBtn}</div>
    </div>
  </div>`;
}

// ── Add modal ──
document.getElementById('btnAddSecret').addEventListener('click', function() {
  _secretPastedImage = null;
  const hint = document.getElementById('secretPasteHint');
  const preview = document.getElementById('secretPastePreview');
  if (hint) hint.style.display = '';
  if (preview) { preview.style.display = 'none'; preview.src = ''; }
  document.getElementById('secretAddName').value = '';
  document.getElementById('secretAddDays').value = 0;
  document.getElementById('secretAddHours').value = 0;
  document.getElementById('secretAddMins').value = 0;
  openModal('secretAddModal');
});

document.addEventListener('paste', function(e) {
  const modal = document.getElementById('secretAddModal');
  if (!modal || !modal.classList.contains('open')) return;
  const file = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith('image/'));
  if (!file) return;
  const blob = file.getAsFile();
  _szResizeToDataUrl(blob, function(dataUrl) {
    _secretPastedImage = dataUrl;
    const hint = document.getElementById('secretPasteHint');
    const preview = document.getElementById('secretPastePreview');
    if (hint) hint.style.display = 'none';
    if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
  });
});

document.getElementById('secretAddConfirm').addEventListener('click', function() {
  const name = document.getElementById('secretAddName').value.trim();
  if (!name) { document.getElementById('secretAddName').focus(); return; }
  const d = parseInt(document.getElementById('secretAddDays').value) || 0;
  const h = parseInt(document.getElementById('secretAddHours').value) || 0;
  const m = parseInt(document.getElementById('secretAddMins').value) || 0;
  const ms = (d * 86400 + h * 3600 + m * 60) * 1000;
  if (ms <= 0) { document.getElementById('secretAddDays').focus(); return; }

  const item = {
    id: uid(),
    name: name,
    image: _secretPastedImage || null,
    depersAt: Date.now() + ms,
    addedAt: Date.now(),
    totalDuration: ms,
    notifiedDeperss: false
  };
  secretItems.push(item);
  saveSecretItems();
  closeModal('secretAddModal');
  renderSecretTab();
  showToast(`"${name}" adaugat.`, 'success');
});

document.getElementById('secretAddCancel').addEventListener('click', function() {
  closeModal('secretAddModal');
});

// ── Edit time ──
function openSecretEditTime(id) {
  _secretEditTargetId = id;
  document.getElementById('secretEditDays').value = 0;
  document.getElementById('secretEditHours').value = 0;
  document.getElementById('secretEditMins').value = 0;
  openModal('secretEditModal');
}

document.getElementById('secretEditConfirm').addEventListener('click', function() {
  const item = secretItems.find(i => i.id === _secretEditTargetId);
  if (!item) return;
  const d = parseInt(document.getElementById('secretEditDays').value) || 0;
  const h = parseInt(document.getElementById('secretEditHours').value) || 0;
  const m = parseInt(document.getElementById('secretEditMins').value) || 0;
  const ms = (d * 86400 + h * 3600 + m * 60) * 1000;
  if (ms <= 0) return;
  item.depersAt = Date.now() + ms;
  item.totalDuration = ms;
  item.notifiedDeperss = false;
  saveSecretItems();
  closeModal('secretEditModal');
  renderSecretTab();
  showToast(`Timp actualizat pentru "${item.name}".`, 'success');
});

document.getElementById('secretEditCancel').addEventListener('click', function() {
  closeModal('secretEditModal');
});

// ── Delete ──
function openSecretDelete(id) {
  _secretDeleteTargetId = id;
  const item = secretItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('secretDeleteBody').innerHTML =
    `Esti sigur ca vrei sa stergi <span class="alert-item-name">${escHtml(item.name)}</span>?<br><br><span style="color:var(--text-muted);font-size:12px">Aceasta actiune nu poate fi anulata.</span>`;
  openModal('secretDeleteModal');
}

document.getElementById('secretDeleteConfirm').addEventListener('click', function() {
  const id = _secretDeleteTargetId;
  secretItems = secretItems.filter(i => i.id !== id);
  saveSecretItems();
  closeModal('secretDeleteModal');
  renderSecretTab();
  showToast('Item sters.');
});

document.getElementById('secretDeleteCancel').addEventListener('click', function() {
  closeModal('secretDeleteModal');
});
