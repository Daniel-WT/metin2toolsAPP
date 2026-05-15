// ============ INSOTITORI/SITE TAB ============

function renderSzCard(item) {
  const ms     = getRemaining(item);
  const isDone = ms <= 0;
  const pct    = isDone ? 0 : Math.max(0, Math.min(100, (ms / 86400000) * 100));
  const timerCls = ms < 3600000 && !isDone ? 'warning' : isDone ? 'expired' : 'ok';

  const imageHtml = item.szImage
    ? `<img class="sz-card-img" src="${item.szImage}" alt="${escHtml(item.name)}">`
    : `<img class="sz-card-img" src="img/icons/67.png" alt="6/7">`;

  const timerBlock = isDone
    ? `<div class="sz-done-state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Finalizat</div>`
    : `<div class="timer-section">
        <div class="timer-label">Timp ramas</div>
        <div class="timer-display ${timerCls}" data-timer="${item.id}">${formatTimer(ms)}</div>
        <div class="progress-bar"><div class="progress-fill fill-sase-sapte" data-prog="${item.id}" style="width:${pct}%"></div></div>
       </div>`;

  const retryBtn = `<button class="btn-action" data-id="${item.id}" data-action="sz-retry">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Reincearca
  </button>`;
  const editBtnSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const editBtn = `<button class="btn-action" data-id="${item.id}" data-action="edit">
    ${editBtnSvg}Editeaza
  </button>`;
  const deleteBtnFull = `<button class="btn-action danger btn-full" data-id="${item.id}" data-action="delete">Sterge</button>`;
  const deleteBtn = `<button class="btn-action danger" data-id="${item.id}" data-action="delete">Sterge</button>`;
  const doneBtn   = `<button class="btn-action sz-done-btn" data-id="${item.id}" data-action="sz-finish">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>Finalizeaza
  </button>`;

  const actionsHtml = isDone
    ? retryBtn + editBtn + deleteBtnFull
    : doneBtn + editBtn + deleteBtnFull;

  return `<div class="card${isDone ? ' sz-done-card' : ''}" data-id="${item.id}">
    <div class="card-accent accent-sase-sapte"></div>
    <div class="card-body">
      <div class="card-header">
        <div class="cat-icon icon-sase-sapte">${imageHtml}</div>
        <div class="card-info">
          <div class="card-name">${escHtml(item.name)}</div>
          <div class="card-account-row">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="card-account-name">${escHtml(item.account)}</span>
          </div>
          <div class="card-meta">
            <span class="card-category cat-sase-sapte">6/7</span>
            ${isDone ? '<span class="urgency-badge sz-done-badge">Finalizat</span>' : ''}
          </div>
        </div>
      </div>
      ${timerBlock}
      <div class="card-actions">${actionsHtml}</div>
    </div>
  </div>`;
}

function renderCardsIS() {
  const grid   = document.getElementById('gridIS');
  const search = document.getElementById('searchInputIS').value.toLowerCase();
  let filtered = items.filter(item => {
    if (!IS_CATS.includes(item.category)) return false;
    if (isFilter !== 'all' && item.category !== isFilter) return false;
    if (search && !item.name.toLowerCase().includes(search) && !item.account.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><img src="img/icons/insotitor.png" width="48" height="48" style="object-fit:contain"></div><div class="empty-state-title">Niciun item</div><div class="empty-state-sub">Apasa „Adauga" pentru a adauga primul item</div></div>`;
    return;
  }

  filtered.sort((a, b) => {
    const ra = getRemaining(a), rb = getRemaining(b);
    if (ra <= 0 && rb > 0) return 1;
    if (rb <= 0 && ra > 0) return -1;
    return ra - rb;
  });

  grid.innerHTML = filtered.map(item =>
    item.category === 'sase-sapte' ? renderSzCard(item) : renderCard(item)
  ).join('');

  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id     = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'delete')   openDeleteConfirm(id);
      else if (action === 'renew')    openRenew(id);
      else if (action === 'feed')     openFeed(id);
      else if (action === 'pers')     openPersModal(id);
      else if (action === 'edit')     openEdit(id);
      else if (action === 'sz-finish') {
        const it = items.find(i => i.id === id);
        if (!it) return;
        it.expiresAt = Date.now() - 1; // force expired
        confirmedAlerts.day1[id] = true; // suppress auto notification
        saveAlerts();
        save();
        renderCardsIS(); renderStatsIS();
        showToast(`"${it.name}" marcat ca finalizat.`, 'success');
        if (window.logActivity) window.logActivity(`A finalizat 6/7 pe ${it.account}`);
      }
      else if (action === 'sz-retry') {
        const it = items.find(i => i.id === id);
        if (!it) return;
        it.expiresAt     = Date.now() + 86400000;
        it.totalDuration = 86400000;
        it.addedAt       = Date.now();
        // Reset completion flag so notification fires again at next expiry
        delete confirmedAlerts.day1[id];
        delete confirmedAlerts.hourly[id];
        saveAlerts();
        save();
        renderCardsIS(); renderStatsIS();
        showToast(`"${it.name}" — timer 24h repornit!`, 'success');
        if (window.logActivity) window.logActivity(`A reincercat 6/7 pe ${it.account}`);
      }
    });
  });
}

function renderStatsIS() {
  const bar = document.getElementById('statsBarIS');
  if (!bar) return;
  const total = items.filter(i => IS_CATS.includes(i.category)).length;
  let html = `<div class="stat-item"><span class="stat-count">${total}</span> <span style="color:var(--text-muted)">total</span></div>`;
  const CAT_COLORS = { 'atac-auto': 'var(--red)', 'manusa': 'var(--orange)', 'insotitor': 'var(--green)', 'sase-sapte': 'var(--gold)' };
  IS_CATS.forEach(cat => {
    const count = items.filter(i => i.category === cat).length;
    if (!count) return;
    const m = CAT_META[cat];
    const colorVar = CAT_COLORS[cat] || 'var(--text-muted)';
    html += `<div class="stat-item"><span class="stat-dot" style="background:${colorVar}"></span><span class="stat-count" style="color:${colorVar}">${count}</span><span style="color:var(--text-muted)">${m.label}</span></div>`;
  });
  bar.innerHTML = html;
}

document.getElementById('filterBtnsIS').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn-is');
  if (!btn) return;
  document.querySelectorAll('.filter-btn-is').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  isFilter = btn.dataset.catIs;
  renderCardsIS();
});

document.getElementById('searchInputIS').addEventListener('input', renderCardsIS);

document.getElementById('btnAddIS').addEventListener('click', () => {
  selectedCat = null;
  selectedGender = null;
  document.querySelectorAll('.cat-option').forEach(o => o.className = 'cat-option');
  // Show only IS categories, hide SR categories
  IS_CATS.forEach(c => {
    const el = document.querySelector(`.cat-option[data-cat="${c}"]`);
    if (el) el.style.display = '';
  });
  SR_CATS.forEach(c => {
    const el = document.querySelector(`.cat-option[data-cat="${c}"]`);
    if (el) el.style.display = 'none';
  });
  editTargetId = null;
  document.querySelector('#addModal .modal-title').innerHTML = 'Adauga Insotitor/Site';
  document.getElementById('addConfirm').textContent = 'Adauga';
  document.getElementById('addName').value = '';
  document.getElementById('addName').placeholder = 'ex: Alastor';
  document.getElementById('nameLabel').textContent = 'Nume Item';
  document.getElementById('nameGroup').classList.add('slide-visible');
  document.getElementById('genderGroup').classList.remove('slide-visible');
  document.getElementById('szImageGroup').classList.remove('slide-visible');
  document.getElementById('durationGroup').style.display = '';
  if (typeof _szResetPasteArea === 'function') _szResetPasteArea();
  document.getElementById('addAccount').value = '';
  document.getElementById('addDays').value = 0;
  document.getElementById('addHours').value = 0;
  document.getElementById('addMins').value = 0;
  openModal('addModal');
});

// Make filter-btn-is use same styles as filter-btn
document.querySelectorAll('.filter-btn-is').forEach(btn => {
  btn.className = btn.className.replace('filter-btn-is', 'filter-btn filter-btn-is');
});

