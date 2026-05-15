// ============ INVENTORY MANAGER ============
const INV_KEY = 'metin2_inventory_v1';
window.invItems = [];
var invItems = window.invItems;

let invDetailId = null;
let invPendingImage = null;
let invDeleteTargetId = null;

function loadInv() {
  if (db) return;
  try { invItems = JSON.parse(localStorage.getItem(INV_KEY)) || []; }
  catch { invItems = []; }
  invItems.forEach(item => {
    if (!item.accounts) item.accounts = [];
    item.accounts = item.accounts.map(a =>
      typeof a === 'string' ? { name: a, qty: 1 } : a
    );
  });
  // Restore order
  invItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function saveInv() {
  if (db) {
    const obj = {};
    invItems.forEach(i => {
      const clean = JSON.parse(JSON.stringify(i, (k, v) => v === undefined ? undefined : v));
      Object.keys(clean).forEach(k => { if (clean[k] === null) delete clean[k]; });
      obj[i.id] = clean;
    });
    fbDebounce('inventory', () => db.ref(p('inventory/items')).set(obj));
  } else {
    localStorage.setItem(INV_KEY, JSON.stringify(invItems));
  }
}

function totalQty(item) {
  return (item.accounts || []).reduce((s, d) => s + (+d.qty || 0), 0);
}

// ============ INV DRAG & DROP ============
let dragSrcId = null;
// Full implementation is in initInvDragDrop() defined later (mouse-based live sort)

function renderInvGrid() {
  const grid = document.getElementById('invGrid');
  const search = document.getElementById('invSearch').value.toLowerCase();
  const filtered = invItems.filter(item =>
    !search ||
    item.name.toLowerCase().includes(search) ||
    (item.accounts || []).some(d => d.name.toLowerCase().includes(search))
  );

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
      <div style="margin-bottom:12px;opacity:0.25"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <div style="font-family:Rajdhani,sans-serif;font-size:18px;color:var(--text-dim);margin-bottom:6px">Inventar gol</div>
      <div style="font-size:12px">Apasa „Adauga Item" pentru a adauga primul item</div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const total = totalQty(item);
    const imgHtml = item.image
      ? `<div class="inv-card-img"><img src="${item.image}" alt="${escHtml(item.name)}"></div>`
      : `<div class="inv-card-img inv-card-img--placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>`;

    // Show up to 3 depots with individual qty
    const depots = (item.accounts || []);
    const visibleDepots = depots.slice(0, 3);
    const extra = depots.length - 3;

    const depotPills = visibleDepots.map(d =>
      `<span class="inv-account-pill">${escHtml(d.name)}<span style="margin-left:4px;opacity:0.6">×${d.qty}</span></span>`
    ).join('');
    const extraPill = extra > 0
      ? `<span class="inv-account-pill" style="color:var(--text-muted)">+${extra}</span>` : '';

    return `<div class="inv-card" data-inv-id="${item.id}" draggable="true">
      <div class="inv-drag-handle" title="Trage pentru a reordona">⠿</div>
      ${imgHtml}
      <div class="inv-card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px">
          <div class="inv-card-name" style="margin:0">${escHtml(item.name)}</div>
          <span style="background:var(--gold-dim);border:1px solid rgba(200,150,46,0.35);color:var(--gold-light);border-radius:10px;padding:2px 9px;font-size:13px;font-weight:700;font-family:Rajdhani,sans-serif;flex-shrink:0" title="Cantitate totala">×${total}</span>
        </div>
        ${depots.length
          ? `<div class="inv-accounts-label">Conturi (${depots.length})</div>
             <div class="inv-account-pills">${depotPills}${extraPill}</div>`
          : `<div style="font-size:11px;color:var(--text-muted)">Niciun cont adaugat</div>`}
        <div class="inv-card-actions">
          <button class="inv-btn" data-inv-open="${item.id}">Detalii</button>
          <button class="inv-btn danger" data-inv-del="${item.id}">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('[data-inv-open]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openInvDetail(btn.dataset.invOpen); });
  });
  document.querySelectorAll('[data-inv-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.invDel;
      const it = invItems.find(i => i.id === id);
      if (!it) return;
      invDeleteTargetId = id;
      document.getElementById('invDeleteBody').innerHTML =
        `Esti sigur ca vrei sa stergi <strong>${escHtml(it.name)}</strong> din inventar?<br><br><span style="color:var(--text-muted);font-size:12px">Aceasta actiune nu poate fi anulata.</span>`;
      openModal('invDeleteModal');
    });
  });
  document.querySelectorAll('.inv-card').forEach(card => {
    card.addEventListener('click', e => {
      // Don't open detail if clicking buttons or drag handle
      if (e.target.closest('[data-inv-open],[data-inv-del],.inv-drag-handle')) return;
      openInvDetail(card.dataset.invId);
    });
  });

  initInvDragDrop();
}

function openInvDetail(id) {
  invDetailId = id;
  const item = invItems.find(i => i.id === id);
  if (!item) return;
  document.getElementById('invDetailTitle').innerHTML = `<img src="img/icons/productmanagement.png" width="20" height="20" style="object-fit:contain;opacity:.8;vertical-align:middle;margin-right:6px"> ${escHtml(item.name)}`;
  const imgEl = document.getElementById('invDetailImg');
  imgEl.innerHTML = item.image
    ? `<img src="${item.image}" alt="${escHtml(item.name)}">`
    : `<img src="img/icons/productmanagement.png" style="width:48px;height:48px;object-fit:contain;opacity:.5">`;
  document.getElementById('invNewAccount').value = '';
  document.getElementById('invNewAccountQty').value = 1;
  renderInvDetailAccounts(item);
  openModal('invDetailModal');
}

function renderInvDetailAccounts(item) {
  const list = document.getElementById('invDetailAccounts');
  const total = totalQty(item);
  document.getElementById('invTotalQtyVal').textContent = total;

  if (!(item.accounts || []).length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Niciun cont adaugat inca.</div>`;
    return;
  }

  list.innerHTML = item.accounts.map((depot, idx) => {
    const sub = [depot.platform, depot.email].filter(Boolean).join(' · ');
    return `
    <div class="inv-account-row" id="inv-depot-row-${idx}">
      <div style="flex:1;min-width:0">
        <span class="inv-account-row-name">${escHtml(depot.name)}</span>
        ${sub ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${escHtml(sub)}</div>` : ''}
      </div>
      <div class="inv-depot-qty">
        <button class="inv-depot-qty-btn" data-dep-minus="${idx}">−</button>
        <input class="inv-depot-qty-input" data-dep-input="${idx}" type="number" min="1" value="${depot.qty}">
        <span class="inv-depot-qty-label">buc.</span>
        <button class="inv-depot-qty-btn" data-dep-plus="${idx}">+</button>
      </div>
      <button class="inv-account-row-edit" data-acc-edit="${idx}" title="Editeaza cont"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="inv-account-row-del" data-acc-idx="${idx}" title="Sterge cont">✕</button>
    </div>`;
  }).join('');

  // Direct input edit
  list.querySelectorAll('[data-dep-input]').forEach(inp => {
    inp.addEventListener('change', () => {
      const item = invItems.find(i => i.id === invDetailId);
      if (!item) return;
      const idx = +inp.dataset.depInput;
      const val = Math.max(1, +inp.value || 1);
      inp.value = val;
      item.accounts[idx].qty = val;
      saveInv(); renderInvGrid();
      document.getElementById('invTotalQtyVal').textContent = totalQty(item);
    });
    inp.addEventListener('focus', () => inp.select());
  });

  // +/- per depot
  list.querySelectorAll('[data-dep-minus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = invItems.find(i => i.id === invDetailId);
      if (!item) return;
      const idx = +btn.dataset.depMinus;
      const val = Math.max(1, (+item.accounts[idx].qty || 1) - 1);
      item.accounts[idx].qty = val;
      const inp = list.querySelector(`[data-dep-input="${idx}"]`);
      if (inp) inp.value = val;
      saveInv(); renderInvGrid();
      document.getElementById('invTotalQtyVal').textContent = totalQty(item);
    });
  });
  list.querySelectorAll('[data-dep-plus]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = invItems.find(i => i.id === invDetailId);
      if (!item) return;
      const idx = +btn.dataset.depPlus;
      const val = (+item.accounts[idx].qty || 1) + 1;
      item.accounts[idx].qty = val;
      const inp = list.querySelector(`[data-dep-input="${idx}"]`);
      if (inp) inp.value = val;
      saveInv(); renderInvGrid();
      document.getElementById('invTotalQtyVal').textContent = totalQty(item);
    });
  });
  // Delete depot
  list.querySelectorAll('[data-acc-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = invItems.find(i => i.id === invDetailId);
      if (!item) return;
      item.accounts.splice(+btn.dataset.accIdx, 1);
      saveInv(); renderInvGrid(); renderInvDetailAccounts(item);
      showToast('Depozit sters.');
    });
  });

  // Edit depot (inline)
  list.querySelectorAll('[data-acc-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = invItems.find(i => i.id === invDetailId);
      if (!item) return;
      const idx = +btn.dataset.accEdit;
      const depot = item.accounts[idx];
      if (!depot) return;
      openDepotEditInline(item, idx, depot);
    });
  });
}

function openDepotEditInline(item, idx, depot) {
  const row = document.getElementById('inv-depot-row-' + idx);
  if (!row) return;
  row.innerHTML = `
    <div style="width:100%;display:flex;flex-direction:column;gap:6px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <input class="form-input" id="depEditName_${idx}" value="${escHtml(depot.name)}" placeholder="Nume cont" style="font-size:13px;padding:6px 8px">
        <input class="form-input" id="depEditPlatform_${idx}" value="${escHtml(depot.platform || '')}" placeholder="Platforma" style="font-size:13px;padding:6px 8px">
      </div>
      <input class="form-input" id="depEditEmail_${idx}" value="${escHtml(depot.email || '')}" placeholder="Email (optional)" style="font-size:13px;padding:6px 8px">
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn-secondary" id="depEditCancel_${idx}" style="font-size:11px;padding:4px 12px">Anuleaza</button>
        <button class="btn-primary" id="depEditSave_${idx}" style="font-size:11px;padding:4px 12px">Salveaza</button>
      </div>
    </div>`;

  document.getElementById('depEditCancel_' + idx).addEventListener('click', () => {
    renderInvDetailAccounts(item);
  });
  document.getElementById('depEditSave_' + idx).addEventListener('click', () => {
    const newName = document.getElementById('depEditName_' + idx).value.trim();
    if (!newName) { showToast('Numele contului este obligatoriu!', 'error'); return; }
    // Check duplicate name (exclude current)
    if (item.accounts.some((d, i) => i !== idx && d.name === newName)) {
      showToast('Exista deja un cont cu acest nume!', 'error'); return;
    }
    depot.name = newName;
    const plat = document.getElementById('depEditPlatform_' + idx).value.trim();
    const em = document.getElementById('depEditEmail_' + idx).value.trim();
    if (plat) depot.platform = plat; else delete depot.platform;
    if (em) depot.email = em; else delete depot.email;
    saveInv(); renderInvGrid(); renderInvDetailAccounts(item);
    showToast('Cont actualizat!', 'success');
  });
  // Focus name field
  document.getElementById('depEditName_' + idx).focus();
}

document.getElementById('invAddAccountBtn').addEventListener('click', () => {
  const name     = document.getElementById('invNewAccount').value.trim();
  const qty      = Math.max(1, +document.getElementById('invNewAccountQty').value || 1);
  const platform = document.getElementById('invNewPlatform').value.trim();
  const email    = document.getElementById('invNewEmail').value.trim();
  if (!name) return;
  const item = invItems.find(i => i.id === invDetailId);
  if (!item) return;
  if (!item.accounts) item.accounts = [];
  if (item.accounts.some(d => d.name === name)) { showToast('Contul exista deja!', 'error'); return; }
  const depot = { name, qty };
  if (platform) depot.platform = platform;
  if (email)    depot.email    = email;
  item.accounts.push(depot);
  saveInv(); renderInvGrid(); renderInvDetailAccounts(item);
  document.getElementById('invNewAccount').value  = '';
  document.getElementById('invNewAccountQty').value = 1;
  document.getElementById('invNewPlatform').value = '';
  document.getElementById('invNewEmail').value    = '';
  showToast(`Cont „${name}" adaugat!`, 'success');
});

document.getElementById('invNewAccount').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('invAddAccountBtn').click();
});

document.getElementById('invDetailClose').addEventListener('click', () => closeModal('invDetailModal'));

// Edit item
let invEditPendingImage = null; // separate from add modal
document.getElementById('invDetailEdit').addEventListener('click', () => {
  const item = invItems.find(i => i.id === invDetailId);
  if (!item) return;
  document.getElementById('invEditName').value = item.name;
  invEditPendingImage = item.image || null;
  const preview = document.getElementById('invEditImgPreview');
  const uploadArea = document.getElementById('invEditUploadArea');
  const removeBtn = document.getElementById('invEditRemoveImg');
  if (item.image) {
    preview.src = item.image;
    preview.style.display = 'block';
    uploadArea.style.display = 'none';
    removeBtn.style.display = '';
  } else {
    preview.style.display = 'none';
    uploadArea.style.display = '';
    removeBtn.style.display = 'none';
  }
  openModal('invEditModal');
});

document.getElementById('invEditImageInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    invEditPendingImage = ev.target.result;
    document.getElementById('invEditImgPreview').src = invEditPendingImage;
    document.getElementById('invEditImgPreview').style.display = 'block';
    document.getElementById('invEditUploadArea').style.display = 'none';
    document.getElementById('invEditRemoveImg').style.display = '';
  };
  reader.readAsDataURL(file);
});

document.getElementById('invEditRemoveImg').addEventListener('click', () => {
  invEditPendingImage = null;
  document.getElementById('invEditImgPreview').style.display = 'none';
  document.getElementById('invEditUploadArea').style.display = '';
  document.getElementById('invEditRemoveImg').style.display = 'none';
  document.getElementById('invEditImageInput').value = '';
});

// Ctrl+V in edit modal
document.addEventListener('paste', e => {
  if (!document.getElementById('invEditModal').classList.contains('open')) return;
  const clipItems = e.clipboardData?.items;
  if (!clipItems) return;
  for (const it of clipItems) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = ev => {
        invEditPendingImage = ev.target.result;
        document.getElementById('invEditImgPreview').src = invEditPendingImage;
        document.getElementById('invEditImgPreview').style.display = 'block';
        document.getElementById('invEditUploadArea').style.display = 'none';
        document.getElementById('invEditRemoveImg').style.display = '';
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

document.getElementById('invEditCancel').addEventListener('click', () => closeModal('invEditModal'));
document.getElementById('invEditConfirm').addEventListener('click', () => {
  const name = document.getElementById('invEditName').value.trim();
  if (!name) { showToast('Introdu un nume!', 'error'); return; }
  const item = invItems.find(i => i.id === invDetailId);
  if (!item) return;
  item.name = name;
  item.image = invEditPendingImage;
  saveInv();
  closeModal('invEditModal');
  // Refresh detail modal title + image
  document.getElementById('invDetailTitle').innerHTML = `<img src="img/icons/productmanagement.png" width="20" height="20" style="object-fit:contain;opacity:.8;vertical-align:middle;margin-right:6px"> ${escHtml(name)}`;
  const imgEl = document.getElementById('invDetailImg');
  imgEl.innerHTML = item.image ? `<img src="${item.image}" alt="${escHtml(name)}">` : `<img src="img/icons/productmanagement.png" style="width:48px;height:48px;object-fit:contain;opacity:.5">`;
  renderInvGrid();
  showToast(`„${name}" actualizat!`, 'success');
});

// Delete with confirm modal
document.getElementById('invDetailDelete').addEventListener('click', () => {
  const item = invItems.find(i => i.id === invDetailId);
  if (!item) return;
  invDeleteTargetId = invDetailId;
  document.getElementById('invDeleteBody').innerHTML =
    `Esti sigur ca vrei sa stergi <strong>${escHtml(item.name)}</strong> din inventar?<br><br><span style="color:var(--text-muted);font-size:12px">Aceasta actiune nu poate fi anulata.</span>`;
  openModal('invDeleteModal');
});

document.getElementById('invDeleteCancel').addEventListener('click', () => closeModal('invDeleteModal'));
document.getElementById('invDeleteConfirm').addEventListener('click', () => {
  const id = invDeleteTargetId;
  const item = invItems.find(i => i.id === id);
  const name = item?.name || '';
  invItems = invItems.filter(i => i.id !== id);
  saveInv();
  closeModal('invDeleteModal');
  closeModal('invDetailModal');
  renderInvGrid();
  showToast(`„${name}" sters din inventar.`);
});

['invEditModal','invDeleteModal'].forEach(id => {
  // No click-outside close — ESC key handler covers these
});

// ADD INV ITEM
document.getElementById('btnAddInv').addEventListener('click', () => {
  document.getElementById('invAddName').value     = '';
  document.getElementById('invAddAccount').value  = '';
  document.getElementById('invAddQty').value      = 1;
  document.getElementById('invAddPlatform').value = '';
  document.getElementById('invAddEmail').value    = '';
  document.getElementById('invImageInput').value  = '';
  document.getElementById('invImgPreview').style.display = 'none';
  document.getElementById('invUploadArea').style.display = '';
  invPendingImage = null;
  openModal('invAddModal');
});

// Ctrl+V paste image
document.addEventListener('paste', e => {
  const modal = document.getElementById('invAddModal');
  if (!modal.classList.contains('open')) return;
  const clipItems = e.clipboardData?.items;
  if (!clipItems) return;
  for (const it of clipItems) {
    if (it.type.startsWith('image/')) {
      const file = it.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = ev => {
        invPendingImage = ev.target.result;
        const preview = document.getElementById('invImgPreview');
        preview.src = invPendingImage;
        preview.style.display = 'block';
        document.getElementById('invUploadArea').style.display = 'none';
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

document.getElementById('invAddCancel').addEventListener('click', () => closeModal('invAddModal'));

document.getElementById('invImageInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    invPendingImage = ev.target.result;
    const preview = document.getElementById('invImgPreview');
    preview.src = invPendingImage;
    preview.style.display = 'block';
    document.getElementById('invUploadArea').style.display = 'none';
  };
  reader.readAsDataURL(file);
});

document.getElementById('invAddConfirm').addEventListener('click', () => {
  const name     = document.getElementById('invAddName').value.trim();
  const account  = document.getElementById('invAddAccount').value.trim();
  const qty      = Math.max(1, +document.getElementById('invAddQty').value || 1);
  const platform = document.getElementById('invAddPlatform').value.trim();
  const email    = document.getElementById('invAddEmail').value.trim();
  if (!name) { showToast('Introdu numele itemului!', 'error'); return; }
  let firstDepot = null;
  if (account) {
    firstDepot = { name: account, qty };
    if (platform) firstDepot.platform = platform;
    if (email)    firstDepot.email    = email;
  }
  const item = {
    id: uid(),
    name,
    accounts: firstDepot ? [firstDepot] : [],
    image: invPendingImage || null,
    addedAt: Date.now()
  };
  invItems.push(item);
  saveInv();
  closeModal('invAddModal');
  renderInvGrid();
  showToast(`„${name}" adaugat in inventar!`, 'success');
});

document.getElementById('invSearch').addEventListener('input', renderInvGrid);

loadInv();
renderInvGrid();

// ============ INV ZOOM ============
const ZOOM_KEY = 'metin2_inv_zoom';
function initInvZoom() {
  const range = document.getElementById('invZoomRange');
  const val = document.getElementById('invZoomVal');
  const grid = document.getElementById('invGrid');
  if (!range || !grid) return;
  
  const btnOut = document.getElementById('btnZoomOut');
  const btnIn = document.getElementById('btnZoomIn');
  
  const saved = localStorage.getItem(ZOOM_KEY) || '220';
  range.value = saved;
  updateZoom(saved);

  range.addEventListener('input', (e) => {
    updateZoom(e.target.value);
  });

  if (btnOut) {
    btnOut.addEventListener('click', () => {
      const newVal = Math.max(80, parseInt(range.value) - 30);
      range.value = newVal;
      updateZoom(newVal);
    });
  }
  if (btnIn) {
    btnIn.addEventListener('click', () => {
      const newVal = Math.min(400, parseInt(range.value) + 30);
      range.value = newVal;
      updateZoom(newVal);
    });
  }

  function updateZoom(v) {
    grid.style.setProperty('--inv-size', v + 'px');
    localStorage.setItem(ZOOM_KEY, v);
  }
}

initInvZoom();

// ============ LIVE DRAG SORT (smooth FLIP + no-select) ============
function initInvDragDrop() {
  const grid = document.getElementById('invGrid');
  if (!grid) return;

  // CRITICAL FIX: Prevent accumulating mousedown listeners on every renderInvGrid() call.
  // Without this guard, each render adds a new listener causing N ghosts on drag.
  if (grid._dndInitialized) return;
  grid._dndInitialized = true;

  let ghost = null, ghostOffX = 0, ghostOffY = 0;

  function createGhost(card, rect) {
    ghost = card.cloneNode(true);
    ghost.classList.remove('dragging');
    ghost.style.cssText = `
      position:fixed; z-index:9999; pointer-events:none;
      width:${rect.width}px; height:${rect.height}px;
      top:${rect.top}px; left:${rect.left}px;
      opacity:0.92; transform:scale(1.04) rotate(0.8deg);
      transition:transform 0.18s cubic-bezier(0.16,1,0.3,1), opacity 0.15s ease;
      box-shadow:0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,150,46,0.2), 0 0 20px rgba(200,150,46,0.08);
      border-radius:var(--radius-lg); overflow:hidden;
      will-change:left,top,transform;
    `;
    document.body.appendChild(ghost);
  }

  function moveGhost(e) {
    if (!ghost) return;
    ghost.style.left = (e.clientX - ghostOffX) + 'px';
    ghost.style.top  = (e.clientY - ghostOffY) + 'px';
  }

  function removeGhost() {
    if (ghost) { ghost.remove(); ghost = null; }
  }

  // Store running Web Animations so we can cancel them cleanly
  const _runningAnims = new Map();

  function snapshotPositions() {
    const map = new Map();
    grid.querySelectorAll('.inv-card:not(.dragging)').forEach(c => {
      // Cancel any running animation so getBoundingClientRect returns the true layout position
      const anim = _runningAnims.get(c);
      if (anim) { anim.cancel(); _runningAnims.delete(c); }
      const r = c.getBoundingClientRect();
      map.set(c, { x: r.left, y: r.top });
    });
    return map;
  }

  function flipAnimate(before) {
    grid.querySelectorAll('.inv-card:not(.dragging)').forEach(c => {
      const old = before.get(c);
      if (!old) return;
      const now = c.getBoundingClientRect();
      const dx = old.x - now.x;
      const dy = old.y - now.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      // Use Web Animations API — doesn't touch el.style, so future
      // getBoundingClientRect() always returns the true layout position.
      // If a previous animation is still running it was already cancelled in snapshot.
      const anim = c.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' }
      ], {
        duration: 500,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'none'
      });
      _runningAnims.set(c, anim);
      anim.onfinish = () => _runningAnims.delete(c);
      anim.oncancel = () => _runningAnims.delete(c);
    });
  }

  // Cooldown prevents rapid ping-pong flicker when dragging near grid boundaries
  let lastReorderTime = 0;
  let lastTargetIdx = -1; // track last move target to prevent oscillation

  function liveReorder(e) {
    if (!dragSrcId) return;
    const srcEl = grid.querySelector(`.inv-card[data-inv-id="${dragSrcId}"]`);
    if (!srcEl) return;

    const allCards = [...grid.querySelectorAll('.inv-card')];
    const cards = allCards.filter(c => !c.classList.contains('dragging'));
    if (!cards.length) return;

    // Get grid geometry from first visible card
    const gridRect = grid.getBoundingClientRect();
    // Find first card that isn't mid-transform for accurate measurements
    const firstRect = cards[0].getBoundingClientRect();
    const cardW = firstRect.width;
    const cardH = firstRect.height;
    const gapX = parseFloat(getComputedStyle(grid).columnGap) || 10;
    const gapY = parseFloat(getComputedStyle(grid).rowGap) || 10;
    const cellW = cardW + gapX;
    const cellH = cardH + gapY;
    const cols = Math.max(1, Math.round(gridRect.width / cellW));

    // Cursor position relative to grid
    const cx = e.clientX - gridRect.left;
    const cy = e.clientY - gridRect.top;

    // Determine grid slot
    let col = Math.max(0, Math.min(Math.floor(cx / cellW), cols - 1));
    let row = Math.max(0, Math.floor(cy / cellH));

    let targetIdx = Math.min(row * cols + col, cards.length);

    // Require cursor to be past 60% of the card to trigger a swap
    // This creates a larger "dead zone" in the center, preventing jittery swaps
    const cellLocalX = cx - col * cellW;
    if (cellLocalX > cardW * 0.6 && targetIdx < cards.length) {
      targetIdx++;
    }

    targetIdx = Math.max(0, Math.min(targetIdx, cards.length));

    // Don't reorder if target hasn't changed
    if (targetIdx === lastTargetIdx) return;

    // Cooldown — 300ms between reorders so animations can breathe
    const now = Date.now();
    if (now - lastReorderTime < 300) return;

    // Determine the reference node
    let refNode = targetIdx >= cards.length ? null : cards[targetIdx];

    // Skip if already in position
    if (refNode === srcEl) return;
    if (refNode === null && srcEl === grid.lastElementChild) return;
    if (refNode && srcEl.nextSibling === refNode) return;

    lastReorderTime = now;
    lastTargetIdx = targetIdx;

    const before = snapshotPositions();
    if (refNode) {
      grid.insertBefore(srcEl, refNode);
    } else {
      grid.appendChild(srcEl);
    }
    flipAnimate(before);
  }

  // Shared cleanup to guarantee drag state is always properly released
  let _activeDragCard = null;
  let _activeDragging = false;
  let _cleanupFns = [];

  function _endDrag() {
    // Remove all listeners registered for this drag session
    _cleanupFns.forEach(fn => fn());
    _cleanupFns = [];

    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';

    if (!_activeDragging) { _activeDragCard = null; return; }
    _activeDragging = false;

    // Animate ghost out
    if (ghost) {
      ghost.style.transition = 'all 0.2s cubic-bezier(0.16,1,0.3,1)';
      ghost.style.transform = 'scale(1) rotate(0deg)';
      ghost.style.opacity = '0';
      setTimeout(() => { removeGhost(); }, 200);
    } else {
      removeGhost();
    }

    // Cancel all running FLIP animations
    _runningAnims.forEach((anim, el) => anim.cancel());
    _runningAnims.clear();

    if (_activeDragCard) {
      _activeDragCard.classList.remove('dragging');
    }
    void grid.offsetHeight;

    const domOrder = [...grid.querySelectorAll('.inv-card')].map(c => c.dataset.invId);
    invItems.sort((a, b) => domOrder.indexOf(a.id) - domOrder.indexOf(b.id));
    invItems.forEach((item, idx) => { item.order = idx; });

    if (db) {
      const obj = {};
      invItems.forEach(i => {
        const clean = JSON.parse(JSON.stringify(i, (k,v) => v === undefined ? undefined : v));
        Object.keys(clean).forEach(k => { if (clean[k] === null) delete clean[k]; });
        obj[i.id] = clean;
      });
      db.ref(p('inventory/items')).set(obj);
    } else {
      localStorage.setItem(INV_KEY, JSON.stringify(invItems));
    }

    dragSrcId = null;
    isDragging = false;
    _activeDragCard = null;
  }

  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; // only left click
    const card = e.target.closest('.inv-card');
    if (!card) return;
    if (e.target.closest('[data-inv-open],[data-inv-del]') && !e.target.closest('.inv-drag-handle')) return;

    // If a previous drag is somehow stuck, clean it up first
    if (_activeDragging) _endDrag();

    let startX = e.clientX, startY = e.clientY;
    _activeDragCard = card;

    // Capture pointer so we receive events even when cursor leaves the window
    try { card.setPointerCapture(e.pointerId); } catch(ex) {}

    function onPointerMove(ev) {
      if (!_activeDragging) {
        const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (dist < 4) return;
        _activeDragging = true;
        dragSrcId = card.dataset.invId;
        isDragging = true;

        lastTargetIdx = -1;
        lastReorderTime = 0;

        // Cancel any running FLIP animations so positions are accurate
        _runningAnims.forEach((anim, el) => anim.cancel());
        _runningAnims.clear();
        void grid.offsetHeight;

        const rect = card.getBoundingClientRect();
        ghostOffX = startX - rect.left;
        ghostOffY = startY - rect.top;

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        createGhost(card, rect);
        card.classList.add('dragging');
      }
      moveGhost(ev);
      liveReorder(ev);
    }

    function onPointerUp() { _endDrag(); }

    // Register listeners and track them for cleanup
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    // Safety nets: context menu, tab blur, visibility change
    document.addEventListener('contextmenu', onPointerUp);
    window.addEventListener('blur', onPointerUp);

    _cleanupFns = [
      () => document.removeEventListener('pointermove', onPointerMove),
      () => document.removeEventListener('pointerup', onPointerUp),
      () => document.removeEventListener('pointercancel', onPointerUp),
      () => document.removeEventListener('contextmenu', onPointerUp),
      () => window.removeEventListener('blur', onPointerUp),
    ];
  });

  // Disable native HTML5 drag to avoid conflicts
  grid.addEventListener('dragstart', e => e.preventDefault());
}

// ============ INVENTORY ZOOM ============
function initInvZoom() {
  const btnIn = document.getElementById('btnZoomIn');
  const btnOut = document.getElementById('btnZoomOut');
  const grid = document.getElementById('invGrid');
  if (!btnIn || !btnOut || !grid) return;

  let currentSize = parseInt(getComputedStyle(grid).getPropertyValue('--inv-size')) || 220;

  function updateZoom(newSize) {
    currentSize = Math.max(60, Math.min(600, newSize));
    grid.style.setProperty('--inv-size', currentSize + 'px');
    localStorage.setItem('metin2_inv_zoom', currentSize);
  }

  // Restore saved zoom
  const saved = localStorage.getItem('metin2_inv_zoom');
  if (saved) updateZoom(parseInt(saved));

  btnIn.addEventListener('click', () => updateZoom(currentSize + 20));
  btnOut.addEventListener('click', () => updateZoom(currentSize - 20));
}

// Initialize zoom on load
document.addEventListener('DOMContentLoaded', initInvZoom);
// Also call it immediately in case DOMContentLoaded already fired
initInvZoom();

// Legacy auto-connect removed - handled by auth.js
// const savedFbConfig = JSON.parse(localStorage.getItem(FB_CONFIG_KEY) || 'null');
// if (savedFbConfig && savedFbConfig.databaseURL) {
//   initFirebase(savedFbConfig);
// }


