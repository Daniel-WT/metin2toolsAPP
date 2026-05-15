// ============ RENDER ============
function getRemaining(item) {
  return item.expiresAt - (Date.now() + _clockOffsetMs);
}

function renderStats() {
  const bar = document.getElementById('statsBar');
  const srItems = items.filter(i => SR_CATS.includes(i.category));
  const total = srItems.length;
  let html = `<div class="stat-item"><span class="stat-count">${total}</span> <span style="color:var(--text-muted)">total</span></div>`;
  const expired = srItems.filter(i => getRemaining(i) <= 0).length;
  if (expired > 0) {
    html += `<div class="stat-item"><span class="stat-dot" style="background:var(--red)"></span><span class="stat-count" style="color:var(--red)">${expired}</span><span style="color:var(--text-muted)">expirate</span></div>`;
  }
  SR_CATS.forEach(cat => {
    const count = items.filter(i => i.category === cat).length;
    if (!count) return;
    const m = CAT_META[cat];
    const colorVar = `var(--${m.cls === 'skin-arma' ? 'blue' : m.cls === 'costum' ? 'purple' : 'teal'})`;
    html += `<div class="stat-item"><span class="stat-dot" style="background:${colorVar}"></span><span class="stat-count" style="color:${colorVar}">${count}</span><span style="color:var(--text-muted)">${m.label}</span></div>`;
  });
  bar.innerHTML = html;
}

function renderCards() {
  console.log('Rendering Cards. Global items:', window.items.length, 'Local items alias:', items.length);
  const grid = document.getElementById('grid');
  const search = document.getElementById('searchInput').value.toLowerCase();
  let filtered = items.filter(item => {
    // Skin Reminder only shows skin-arma, costum, frizura
    if (!SR_CATS.includes(item.category)) return false;
    if (activeFilter !== 'all' && item.category !== activeFilter) return false;
    if (activeGenderFilter && item.gender !== activeGenderFilter) return false;
    if (activeSidebarFilter) {
      const ms = getRemaining(item);
      if (ms <= 0 || ms >= 7 * 86400000) return false;
    }
    if (search && !item.name.toLowerCase().includes(search) && !item.account.toLowerCase().includes(search)) return false;
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><img src="img/icons/arma.png" width="48" height="48" style="object-fit:contain"></div>
      <div class="empty-state-title">Niciun item gasit</div>
      <div class="empty-state-sub">Apasa „Adauga Item" pentru a incepe tracking-ul</div>
    </div>`;
    return;
  }

  // Sort: expired last, then ascending by time remaining
  filtered.sort((a, b) => {
    const ra = getRemaining(a), rb = getRemaining(b);
    if (ra <= 0 && rb > 0) return 1;
    if (rb <= 0 && ra > 0) return -1;
    return ra - rb;
  });

  grid.innerHTML = filtered.map(item => renderCard(item)).join('');
  attachCardEvents();
  updateExpirySidebar();
}

function renderCard(item) {
  const m = CAT_META[item.category];
  const ms = getRemaining(item);
  const timerStr = formatTimer(ms);
  const timerCls = ms <= 0 ? 'expired' : ms < 3600000 ? 'warning' : 'ok';
  const isInsotitor = item.category === 'insotitor';
  const hasPers = ['skin-arma','costum','frizura'].includes(item.category);
  const totalMs = item.totalDuration || 1;
  const pct = ms <= 0 ? 0 : Math.max(0, Math.min(100, (ms / totalMs) * 100));

  const isDepersonalizing = hasPers && item.personalized && item.depersExpiresAt && item.depersExpiresAt > Date.now();
  const isPersonalized    = hasPers && item.personalized && !isDepersonalizing;
  const isRedBg           = isPersonalized || isDepersonalizing; // red background

  const isWarning = ms > 0 && ms < 86400000;
  const isWarn4   = ms > 0 && ms < 345600000 && isPersonalized;
  const isExpired = ms <= 0;

  // Card class: red bg overrides warn/warn4 visually but can stack
  let cardCls = '';
  if (isRedBg) cardCls = 'pers-active-card';
  else if (isWarning) cardCls = 'warning-card';
  else if (isWarn4) cardCls = 'warn4-card';

  let urgencyBadge = '';
  if (isExpired)      urgencyBadge = `<span class="urgency-badge expired-badge">✕ Expirat</span>`;
  else if (isWarning) urgencyBadge = `<span class="urgency-badge">⚠ Sub 24h</span>`;
  else if (isWarn4)   urgencyBadge = `<span class="urgency-badge" style="background:rgba(155,127,232,0.15);border-color:rgba(155,127,232,0.4);color:var(--purple)">⚠ Sub 4 zile</span>`;

  let persBadge = '';
  let depersTimerHtml = '';

  if (hasPers) {
    if (isPersonalized) {
      persBadge = `<span class="pers-badge is-pers">Personalizat</span>`;
    } else if (isDepersonalizing) {
      const dms = item.depersExpiresAt - Date.now();
      persBadge = `<span class="pers-badge is-pers-red">Personalizat</span>`;
      depersTimerHtml = `<div class="deperss-timer">Depersonalizare finalizata in: <span data-depers="${item.id}">${formatTimer(dms)}</span></div>`;
    } else {
      persBadge = `<span class="pers-badge is-deperss">Depersonalizat</span>`;
    }
  }

  let snoozeBadge = '';
  if (item.snoozedUntil && item.snoozedUntil > Date.now()) {
    snoozeBadge = `<span class="snooze-badge">Amanat</span>`;
  }

  let genderBadge = '';
  if (item.gender) {
    const gImg = item.gender === 'F'
      ? '<img src="img/icons/female.png" width="13" height="13" style="object-fit:contain;vertical-align:middle">'
      : '<img src="img/icons/male.png"   width="13" height="13" style="object-fit:contain;vertical-align:middle">';
    const gLabel = item.gender === 'F' ? 'Feminin' : 'Masculin';
    genderBadge = `<span class="gender-badge ${item.gender}">${gImg} ${gLabel}</span>`;
  }

  // Renew is disabled when personalized or depersonalizing
  const renewDisabled = (isPersonalized || isDepersonalizing) ? 'disabled' : '';
  const renewBtn = `<button class="btn-action" data-id="${item.id}" data-action="renew" ${renewDisabled}
    title="${renewDisabled ? 'Indisponibil — depersonalizeaza mai intai' : ''}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Reinnoieste</button>`;
  const editBtnSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const editBtn = `<button class="btn-action" data-id="${item.id}" data-action="edit">${editBtnSvg}Editeaza</button>`;
  const deleteBtn = `<button class="btn-action danger" data-id="${item.id}" data-action="delete">✕ Sterge</button>`;
  const deleteBtnFull = `<button class="btn-action danger btn-full" data-id="${item.id}" data-action="delete">✕ Sterge</button>`;

  // Pers/deperss toggle button
  const _lockSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
  const _unlockSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
  const _boltSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:3px"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
  let persToggleBtn = '';
  if (hasPers) {
    if (isPersonalized || isDepersonalizing) {
      persToggleBtn = isDepersonalizing
        ? `<button class="btn-action pers-btn" data-id="${item.id}" data-action="pers">${_boltSvg}Finalizeaza</button>`
        : `<button class="btn-action pers-btn" data-id="${item.id}" data-action="pers">${_unlockSvg}Depersonalizeaza</button>`;
    } else {
      persToggleBtn = `<button class="btn-action deperss-btn" data-id="${item.id}" data-action="pers">${_lockSvg}Personalizeaza</button>`;
    }
  }

  // Layout: all hasPers cards get same 2-row structure for consistent height
  let actionsHtml = '';
  if (isInsotitor) {
    actionsHtml = `
      <button class="btn-action feed" data-id="${item.id}" data-action="feed">🍖 Hraneste</button>
      ${editBtn}
      ${deleteBtnFull}`;
  } else if (hasPers) {
    actionsHtml = `
      ${persToggleBtn}
      ${renewBtn}
      ${editBtn}
      ${deleteBtn}`;
  } else {
    actionsHtml = `${renewBtn}${editBtn}${deleteBtnFull}`;
  }

  return `<div class="card ${cardCls}" data-id="${item.id}">
    <div class="card-accent accent-${m.cls}"></div>
    <div class="card-body">
      <div class="card-header">
        <div class="cat-icon icon-${m.cls}">${isInsotitor ? getInsotitorIcon(item.name) : getCatIcon(item.category, item.gender)}</div>
        <div class="card-info">
          <div class="card-name">${escHtml(item.name)}</div>
          <div class="card-account-row">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="card-account-name">${escHtml(item.account)}</span>
          </div>
          <div class="card-meta">
            <span class="card-category cat-${m.cls}">${m.label}</span>
            ${genderBadge}
            ${persBadge}
            ${urgencyBadge}
            ${snoozeBadge}
          </div>
        </div>
      </div>
      <div class="timer-section">
        <div class="timer-label">Timp ramas</div>
        <div class="timer-display ${timerCls}" data-timer="${item.id}">${timerStr}</div>
        <div class="progress-bar">
          <div class="progress-fill fill-${m.cls}" data-prog="${item.id}" style="width:${pct}%"></div>
        </div>
        ${ms > 0 ? `<div class="card-expiry-date">${_srExpiryDateLabel(item.expiresAt)}</div>` : ''}
        ${depersTimerHtml}
      </div>
      <div class="card-actions">${actionsHtml}</div>
    </div>
  </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _srExpiryDateLabel(ts) {
  if (!ts || ts <= Date.now()) return '';
  var d = new Date(ts);
  var months = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  return 'Expira pe ' + d.getDate() + ' ' + months[d.getMonth()];
}

function renderCardCompact(item) {
  const m = CAT_META[item.category];
  const ms = getRemaining(item);
  const timerStr = formatTimer(ms);
  const hasPers = ['skin-arma','costum','frizura'].includes(item.category);
  const isInsotitor = item.category === 'insotitor';
  const isDepersonalizing = hasPers && item.personalized && item.depersExpiresAt && item.depersExpiresAt > Date.now();
  const isPersonalized    = hasPers && item.personalized && !isDepersonalizing;
  const isRedBg = isPersonalized || isDepersonalizing;

  // Pers badge mini
  let persBadgeMini = '';
  if (hasPers) {
    if (isPersonalized) {
      persBadgeMini = `<span class="pers-badge is-pers" style="font-size:9px;padding:1px 5px">P</span>`;
    } else if (isDepersonalizing) {
      persBadgeMini = `<span class="pers-badge is-pers-red" style="font-size:9px;padding:1px 5px">D</span>`;
    } else {
      persBadgeMini = `<span class="pers-badge is-deperss" style="font-size:9px;padding:1px 5px">✓</span>`;
    }
  }

  // Timer color
  const timerColor = ms <= 0 ? 'var(--red)' : ms < 3600000 ? 'var(--orange)' : ms < 86400000 ? 'var(--orange)' : 'var(--text-dim)';

  // Compact actions
  let compactActions = '';
  const _cEditIcon = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  if (isInsotitor) {
    compactActions = `
      <button class="btn-action feed" data-id="${item.id}" data-action="feed" title="Hraneste">🍖</button>
      <button class="btn-action edit" data-id="${item.id}" data-action="edit" title="Editeaza">${_cEditIcon}</button>
      <button class="btn-action danger" data-id="${item.id}" data-action="delete" title="Sterge">✕</button>`;
  } else if (hasPers) {
    const _cLock = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
    const _cUnlock = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
    const _cBolt = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';
    const persIconSvg = isPersonalized ? _cUnlock : isDepersonalizing ? _cBolt : _cLock;
    const persTip  = isPersonalized ? 'Depersonalizeaza' : isDepersonalizing ? 'Finalizeaza' : 'Personalizeaza';
    const renewDis = (isPersonalized || isDepersonalizing) ? 'disabled title="Indisponibil"' : '';
    const _cRenew = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
    compactActions = `
      <button class="btn-action pers-btn" data-id="${item.id}" data-action="pers" title="${persTip}">${persIconSvg}</button>
      <button class="btn-action" data-id="${item.id}" data-action="renew" ${renewDis} title="Reinnoieste">${_cRenew}</button>
      <button class="btn-action edit" data-id="${item.id}" data-action="edit" title="Editeaza">${_cEditIcon}</button>
      <button class="btn-action danger" data-id="${item.id}" data-action="delete" title="Sterge">✕</button>`;
  } else {
    const _cRenew2 = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
    compactActions = `
      <button class="btn-action" data-id="${item.id}" data-action="renew" title="Reinnoieste">${_cRenew2}</button>
      <button class="btn-action edit" data-id="${item.id}" data-action="edit" title="Editeaza">${_cEditIcon}</button>
      <button class="btn-action danger" data-id="${item.id}" data-action="delete" title="Sterge">✕</button>`;
  }

  const cardCls = isRedBg ? 'pers-active-card' : '';
  return `<div class="card card-compact ${cardCls} accent-stripe-${m.cls}" data-id="${item.id}">
    <div class="card-body">
      <div class="cat-icon icon-${m.cls}">${isInsotitor ? getInsotitorIcon(item.name) : getCatIcon(item.category, item.gender)}</div>
      <div class="compact-left">
        <div class="compact-title">
          ${escHtml(item.name)}
          ${persBadgeMini}
        </div>
        <div class="compact-sub">
          <span class="card-category cat-${m.cls}" style="font-size:9px;padding:1px 5px">${m.label}</span>
          <span class="card-account-name">@${escHtml(item.account)}</span>
        </div>
      </div>
      <div class="compact-timer" data-id="${item.id}" style="color:${timerColor}">${timerStr}</div>
      <div class="compact-actions">${compactActions}</div>
    </div>
  </div>`;
}

let deleteTargetId = null;

function attachCardEvents() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'delete') openDeleteConfirm(id);
      else if (action === 'renew') openRenew(id);
      else if (action === 'feed') openFeed(id);
      else if (action === 'edit') openEdit(id);
      else if (action === 'pers') {
        const item = items.find(i => i.id === id);
        if (item && item.personalized && item.depersExpiresAt && item.depersExpiresAt > Date.now()) {
          // Already depersonalizing — finalize instantly
          item.personalized = false;
          item.depersExpiresAt = null;
          item.pendingDeperss = false;
          item.snoozedUntil = null;
          delete confirmedAlerts.day4[item.id]; saveAlerts();
          save();
          renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
          showToast(`"${item.name}" depersonalizat. ✓`, 'success');
        } else {
          openPersModal(id);
        }
      }
    });
  });
}

function openDeleteConfirm(id) {
  deleteTargetId = id;
  const item = items.find(i => i.id === id);
  if (!item) return;
  const m = CAT_META[item.category];
  document.getElementById('deleteBody').innerHTML =
    `Esti sigur ca vrei sa stergi <span class="alert-item-name">${escHtml(item.name)}</span> ${m?.icon || ''} de pe contul <span class="alert-item-name">${escHtml(item.account)}</span>?<br><br><span style="color:var(--text-muted);font-size:12px">Aceasta actiune nu poate fi anulata.</span>`;
  openModal('deleteModal');
}


// ============ 7-DAY SIDEBAR ============
const SEVEN_DAYS = 7 * 86400000;

const SIDEBAR_CATS = [
  { key: 'skin-arma', label: 'Skin Arma',  splitGender: false },
  { key: 'costum',    label: 'Costum',     splitGender: true  },
  { key: 'frizura',   label: 'Frizura',    splitGender: true  },
];

function updateExpirySidebar() {
  const container  = document.getElementById('sidebarCats');
  const totalBadge = document.getElementById('sidebarTotal');
  if (!container || !totalBadge) return;

  const pad = n => String(n).padStart(2,'0');

  // Build rows — for gender categories, expand into sub-rows
  const rows = [];
  SIDEBAR_CATS.forEach(cat => {
    const catItems = items.filter(i => {
      const ms = getRemaining(i);
      return i.category === cat.key && ms > 0 && ms < SEVEN_DAYS;
    }).sort((a, b) => getRemaining(a) - getRemaining(b));

    if (!catItems.length) return;

    if (cat.splitGender) {
      const F = catItems.filter(i => i.gender === 'F');
      const M = catItems.filter(i => i.gender === 'M');
      const noGender = catItems.filter(i => !i.gender);

      if (F.length)       rows.push({ ...cat, catItems: F, genderSub: 'F', label: cat.label });
      if (M.length)       rows.push({ ...cat, catItems: M, genderSub: 'M', label: cat.label });
      if (noGender.length) rows.push({ ...cat, catItems: noGender, genderSub: null, label: cat.label });
    } else {
      rows.push({ ...cat, catItems, genderSub: null });
    }
  });

  const grandTotal = rows.reduce((s, r) => s + r.catItems.length, 0);
  totalBadge.textContent = grandTotal;

  const widget = document.querySelector('.expiry-widget');
  if (rows.length === 0) {
    if (widget) widget.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  if (widget) widget.style.display = '';

  // "Toate" chip — shows all 7-day items across categories
  const allItems7d = items.filter(i => { const ms = getRemaining(i); return ms > 0 && ms < SEVEN_DAYS; });
  const allMinMs   = allItems7d.length ? Math.min(...allItems7d.map(i => getRemaining(i))) : 0;
  const allT       = msToHMS(allMinMs);
  const allTimeStr = allMinMs > 0
    ? (allT.d > 0 ? `${allT.d}z ${pad(allT.h)}h` : allT.h > 0 ? `${pad(allT.h)}h ${pad(allT.m)}m` : `${pad(allT.m)}m`)
    : '';
  const allUrgency = allMinMs < 86400000 ? 'has-urgent' : allMinMs < 345600000 ? 'has-warn' : 'has-ok';
  const allDotColor = allMinMs < 86400000 ? 'var(--red)' : allMinMs < 345600000 ? 'var(--orange)' : 'var(--gold-light)';
  const allChipHtml = `<div class="expiry-chip ${allUrgency}" data-sidebar-cat="all" title="Arata toate itemele care expira in 7 zile">
    <span class="expiry-chip-count" style="color:${allDotColor}">${grandTotal}</span>
    <span class="expiry-chip-label">Toate</span>
    <span class="expiry-chip-time">${allTimeStr}</span>
  </div>`;

  container.innerHTML = allChipHtml + rows.map(row => {
    const m = CAT_META[row.key];
    const iconCls = `icon-${m.cls}`;
    const minMs = getRemaining(row.catItems[0]);

    let urgencyCls = 'has-ok';
    if (minMs < 86400000)   urgencyCls = 'has-urgent';
    else if (minMs < 345600000) urgencyCls = 'has-warn';

    const dotColor = minMs < 86400000 ? 'var(--red)'
      : minMs < 345600000 ? 'var(--orange)'
      : 'var(--gold-light)';

    const t = msToHMS(minMs);
    const timeStr = t.d > 0 ? `${t.d}z ${pad(t.h)}h`
      : t.h > 0 ? `${pad(t.h)}h ${pad(t.m)}m`
      : `${pad(t.m)}m`;

    // Gender indicator
    let genderIndicator = '';
    if (row.genderSub === 'F') {
      genderIndicator = `<span style="display:inline-flex;align-items:center;background:rgba(236,100,166,0.12);border:1px solid rgba(236,100,166,0.3);border-radius:8px;padding:1px 4px;margin-left:3px"><img src="img/icons/female.png" width="11" height="11" style="object-fit:contain"></span>`;
    } else if (row.genderSub === 'M') {
      genderIndicator = `<span style="display:inline-flex;align-items:center;background:var(--blue-dim);border:1px solid rgba(91,155,213,0.3);border-radius:8px;padding:1px 4px;margin-left:3px"><img src="img/icons/male.png" width="11" height="11" style="object-fit:contain"></span>`;
    }

    return `<div class="expiry-chip ${urgencyCls}" data-sidebar-cat="${row.key}" data-sidebar-gender="${row.genderSub || ''}" title="Click pentru a filtra">
      <span class="expiry-chip-count" style="color:${dotColor}">${row.catItems.length}</span>
      <span class="expiry-chip-label">${row.label}${genderIndicator}</span>
      <span class="expiry-chip-time">${timeStr}</span>
    </div>`;
  }).join('');

  // Reapply active state if a sidebar filter is active
  if (activeSidebarFilter) {
    container.querySelectorAll('.expiry-chip').forEach(chip => {
      if (activeFilter === 'all' && chip.dataset.sidebarCat === 'all') {
        chip.classList.add('active');
      } else if (activeFilter !== 'all' &&
          chip.dataset.sidebarCat === activeFilter &&
          (chip.dataset.sidebarGender || '') === (activeGenderFilter || '')) {
        chip.classList.add('active');
      }
    });
  }

  // Click to filter — toggle: click again to deselect
  container.querySelectorAll('[data-sidebar-cat]').forEach(rowEl => {
    rowEl.addEventListener('click', () => {
      const cat    = rowEl.dataset.sidebarCat;
      const gender = rowEl.dataset.sidebarGender;
      const isActive = rowEl.classList.contains('active');

      // Deselect all chips
      container.querySelectorAll('.expiry-chip').forEach(c => c.classList.remove('active'));

      if (isActive) {
        // Deselect — show all items unrestricted
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const allBtn = document.querySelector('.filter-btn[data-cat="all"]');
        if (allBtn) allBtn.classList.add('active');
        activeFilter = 'all';
        activeGenderFilter = null;
        activeSidebarFilter = false;
      } else if (cat === 'all') {
        // "Toate" chip — show all categories filtered to 7 days
        rowEl.classList.add('active');
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const allBtn = document.querySelector('.filter-btn[data-cat="all"]');
        if (allBtn) allBtn.classList.add('active');
        activeFilter = 'all';
        activeGenderFilter = null;
        activeSidebarFilter = true;
      } else {
        // Select specific category chip
        rowEl.classList.add('active');
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.filter-btn[data-cat="${cat}"]`);
        if (btn) btn.classList.add('active');
        activeFilter = cat;
        activeGenderFilter = (gender === 'F' || gender === 'M') ? gender : null;
        activeSidebarFilter = true;
      }

      renderCards();
      document.getElementById('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

