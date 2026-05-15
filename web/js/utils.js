// ============ UTILS ============
function msToHMS(ms) {
  if (ms <= 0) return { d:0, h:0, m:0, s:0, total: 0 };
  const s = Math.floor(ms/1000);
  return {
    d: Math.floor(s/86400),
    h: Math.floor((s%86400)/3600),
    m: Math.floor((s%3600)/60),
    s: s%60,
    total: ms
  };
}

function formatTimer(ms) {
  if (ms <= 0) return 'EXPIRAT';
  const t = msToHMS(ms);
  const pad = n => String(n).padStart(2,'0');
  if (t.d > 0) return `${t.d}z ${pad(t.h)}h ${pad(t.m)}m`;
  if (t.h > 0) return `${pad(t.h)}h ${pad(t.m)}m`;
  if (t.m > 0) return `${pad(t.m)}m ${pad(t.s)}s`;
  return `${pad(t.s)}s`;
}

function durationToMs(d,h,m) {
  return ((+d)*86400 + (+h)*3600 + (+m)*60) * 1000;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// XSS Sanitizer function
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Toast messages that should NOT be pushed to notification center
const _toastSkipPatterns = ['Click pe harta', 'Nimic de anulat', 'Nicio', 'Pin CH', 'CH ', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'Not Found', 'Dead', 'Ascuns', 'Reset spawn', 'Tabele resetate', 'Undo:', 'Istoric restaurat', 'Export descarcat', 'Pop-up blocat', 'spawn de exportat', 'Pin admin', 'curatat'];

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.className = 'toast', 2800);

  // Push to notification center (skip ephemeral/instructional toasts)
  if (typeof pushNotification === 'function' && msg &&
      !_toastSkipPatterns.some(p => msg.includes(p))) {
    const notifType = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
    pushNotification(msg, notifType);
  }
}

function setConnBadge(status, text) {
  const badge = document.getElementById('connBadge');
  const textEl = document.getElementById('connLabel');
  if (badge) {
    badge.className = 'conn-pill ' + status;
  }
  if (textEl) {
    textEl.textContent = status === 'connected' ? 'Live' : status === 'offline' ? 'Offline' : '';
  }
}

