// ============ NOTIFICATION CENTER ============
const NOTIF_STORAGE_KEY = 'metin2_notifications_v1';
const NOTIF_MAX = 50;

let _notifications = [];

function loadNotifications() {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    _notifications = raw ? JSON.parse(raw) : [];
  } catch(e) { _notifications = []; }
}

function saveNotifications() {
  localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(_notifications.slice(0, NOTIF_MAX)));
}

/**
 * Push a notification to the center.
 * @param {string} msg   - Message text
 * @param {string} type  - 'success' | 'error' | 'info' | 'warning' | 'deperss'
 * @param {object} opts  - { icon, silent }
 */
function pushNotification(msg, type, opts) {
  opts = opts || {};
  const notif = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    msg: msg,
    type: type || 'info',
    icon: opts.icon || null,
    time: Date.now()
  };
  _notifications.unshift(notif);
  if (_notifications.length > NOTIF_MAX) _notifications.length = NOTIF_MAX;
  saveNotifications();
  renderNotifPanel();
}

function dismissNotification(id) {
  _notifications = _notifications.filter(function(n) { return n.id !== id; });
  saveNotifications();
  renderNotifPanel();
}

function clearAllNotifications() {
  _notifications = [];
  saveNotifications();
  renderNotifPanel();
}

function getNotifIcon(type) {
  switch(type) {
    case 'success': return '✓';
    case 'error':   return '✕';
    case 'warning': return '⚠';
    case 'deperss': return '🔴';
    case 'missed':  return '!';
    case 'info':
    default:        return 'ℹ';
  }
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'acum';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
  return Math.floor(diff / 86400000) + 'z';
}

function renderNotifPanel() {
  const pinnedEl = document.getElementById('notifPinned');
  const listEl = document.getElementById('notifList');
  const emptyEl = document.getElementById('notifEmpty');
  const bell = document.getElementById('notifBell');
  if (!pinnedEl || !listEl || !bell) return;

  const allItems = typeof items !== 'undefined' ? items : [];
  const srCats = typeof SR_CATS !== 'undefined' ? SR_CATS : [];
  const isCats = typeof IS_CATS !== 'undefined' ? IS_CATS : [];

  // ── Pinned: SR + IS items expiring in < 24h ──
  const soonItems = allItems.filter(function(i) {
    const ms = getRemaining(i);
    return (srCats.includes(i.category) || (isCats.includes(i.category) && i.category !== 'sase-sapte')) && ms > 0 && ms < 86400000;
  }).sort(function(a, b) { return getRemaining(a) - getRemaining(b); });

  // ── Pinned: 6/7 items finalizate ──
  const szDoneItems = allItems.filter(function(i) {
    return i.category === 'sase-sapte' && getRemaining(i) <= 0;
  });

  // ── Depersonalization in progress ──
  const depersItems = allItems.filter(function(i) {
    return i.personalized && i.depersExpiresAt && i.depersExpiresAt > Date.now();
  }).sort(function(a, b) { return a.depersExpiresAt - b.depersExpiresAt; });

  if (soonItems.length > 0 || szDoneItems.length > 0 || depersItems.length > 0) {
    let html = '';

    if (soonItems.length > 0) {
      html += '<div class="notif-pinned-header">Expira curand</div>';
      html += soonItems.map(function(item) {
        const ms = getRemaining(item);
        const t = msToHMS(ms);
        const pad = function(n) { return String(n).padStart(2, '0'); };
        let timeStr = t.d > 0 ? t.d + 'z ' + pad(t.h) + 'h' : (t.h > 0 ? pad(t.h) + 'h ' + pad(t.m) + 'm' : pad(t.m) + 'm');
        return '<div class="notif-pinned-item">' +
          '<div class="notif-pinned-icon">⚠</div>' +
          '<div class="notif-pinned-body">' +
            '<div class="notif-pinned-name">' + escHtml(item.name) + ' <span class="notif-account">@' + escHtml(item.account) + '</span></div>' +
          '</div>' +
          '<div class="notif-pinned-time">' + timeStr + '</div>' +
        '</div>';
      }).join('');
    }

    if (szDoneItems.length > 0) {
      html += '<div class="notif-pinned-header notif-pinned-header--sz">6/7 Finalizat</div>';
      html += szDoneItems.map(function(item) {
        return '<div class="notif-pinned-item notif-pinned-item--sz">' +
          '<div class="notif-pinned-icon notif-pinned-icon--sz">✓</div>' +
          '<div class="notif-pinned-body">' +
            '<div class="notif-pinned-name">' + escHtml(item.name) + ' <span class="notif-account">@' + escHtml(item.account) + '</span></div>' +
          '</div>' +
          '<div class="notif-pinned-time notif-pinned-time--sz">Verifica</div>' +
        '</div>';
      }).join('');
    }

    if (depersItems.length > 0) {
      html += '<div class="notif-pinned-header notif-pinned-header--deperss">Depersonalizare</div>';
      html += depersItems.map(function(item) {
        const dms = item.depersExpiresAt - Date.now();
        const timeStr = formatTimer(dms);
        return '<div class="notif-pinned-item notif-pinned-item--deperss">' +
          '<div class="notif-pinned-icon notif-pinned-icon--deperss"></div>' +
          '<div class="notif-pinned-body">' +
            '<div class="notif-pinned-name">' + escHtml(item.name) + ' <span class="notif-account">@' + escHtml(item.account) + '</span></div>' +
          '</div>' +
          '<div class="notif-pinned-time notif-pinned-time--deperss">' + timeStr + '</div>' +
        '</div>';
      }).join('');
    }

    pinnedEl.innerHTML = html;
  } else {
    pinnedEl.innerHTML = '';
  }

  // ── General notifications list ──
  if (_notifications.length === 0) {
    emptyEl.style.display = '';
    listEl.querySelectorAll('.notif-item').forEach(function(el) { el.remove(); });
  } else {
    emptyEl.style.display = 'none';
    // Remove old items before re-rendering
    listEl.querySelectorAll('.notif-item').forEach(function(el) { el.remove(); });

    const frag = document.createDocumentFragment();
    _notifications.forEach(function(n) {
      const div = document.createElement('div');
      div.className = 'notif-item' + (n.type === 'missed' ? ' notif-item--missed' : '');
      const icon = n.icon || getNotifIcon(n.type);
      div.innerHTML =
        '<div class="notif-item-icon type-' + (n.type || 'info') + '">' + icon + '</div>' +
        '<div class="notif-item-body">' +
          '<div class="notif-item-msg">' + escHtml(n.msg) + '</div>' +
          '<div class="notif-item-time">' + timeAgo(n.time) + '</div>' +
        '</div>' +
        '<button class="notif-item-dismiss" data-notif-id="' + n.id + '" title="Sterge">✕</button>';
      frag.appendChild(div);
    });
    listEl.insertBefore(frag, emptyEl);
  }

  // ── Badge count ──
  const totalPinned = soonItems.length + szDoneItems.length + depersItems.length;
  const totalCount = totalPinned + _notifications.length;

  if (totalCount > 0) {
    bell.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
      '<span class="badge">' + totalCount + '</span>';
  } else {
    bell.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  }
}

// Lightweight badge-only update — called every second from ticker
function _updateNotifBadge() {
  const bell = document.getElementById('notifBell');
  if (!bell) return;
  const allItems = typeof items !== 'undefined' ? items : [];
  const srCats = typeof SR_CATS !== 'undefined' ? SR_CATS : [];
  const isCats = typeof IS_CATS !== 'undefined' ? IS_CATS : [];
  let count = _notifications.length;
  allItems.forEach(function(i) {
    const ms = getRemaining(i);
    if ((srCats.includes(i.category) || isCats.includes(i.category)) && i.category !== 'sase-sapte' && ms > 0 && ms < 86400000) count++;
    if (i.category === 'sase-sapte' && ms <= 0) count++;
    if (i.personalized && i.depersExpiresAt && i.depersExpiresAt > Date.now()) count++;
  });
  const svg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  const newHtml = count > 0 ? svg + '<span class="badge">' + count + '</span>' : svg;
  if (bell.innerHTML !== newHtml) bell.innerHTML = newHtml;
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (typeof _closeHeaderPanels === 'function') _closeHeaderPanels();
  if (!isOpen) {
    renderNotifPanel();
    panel.classList.add('open');
  }
}

// Close panel when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.getElementById('notifPanel');
  const wrap = e.target.closest('.notif-bell-wrap');
  if (panel && panel.classList.contains('open') && !wrap) {
    panel.classList.remove('open');
  }
});

// Delegated click for dismiss buttons
document.addEventListener('click', function(e) {
  var btn = e.target.closest('.notif-item-dismiss');
  if (btn && btn.dataset.notifId) {
    e.stopPropagation();
    dismissNotification(btn.dataset.notifId);
  }
});

// Init
loadNotifications();
