// ============ INIT ============
console.log("[App] Starting application...");
(async () => {
  if (typeof window.autoInitFirebase === 'function') {
    await window.autoInitFirebase();
  }
  if (typeof window._initAuth === 'function') {
    window._initAuth();
  }
  load();
  loadAlerts();
})();
// Disable entrance animations after initial load to prevent re-render flicker
setTimeout(function() { document.body.classList.add('app-ready'); }, 650);

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// Use the wrap element so innerHTML rewrites on bell don't destroy the listener
document.querySelector('.notif-bell-wrap').addEventListener('click', (e) => {
  // Only toggle if clicking bell area, not the panel itself
  if (e.target.closest('.notif-panel')) return;
  e.stopPropagation();
  toggleNotifPanel();
});

document.getElementById('notifClearAll').addEventListener('click', (e) => {
  e.stopPropagation();
  clearAllNotifications();
});

// Close all header panels (volume + notif)
function _closeHeaderPanels() {
  const volCtrl = document.getElementById('volControl');
  const notifPanel = document.getElementById('notifPanel');
  if (volCtrl) volCtrl.classList.remove('open');
  if (notifPanel) notifPanel.classList.remove('open');
}

// Volume control toggle
(function() {
  const volCtrl = document.getElementById('volControl');
  const volBtn = document.getElementById('volBtn');
  if (!volCtrl || !volBtn) return;
  volBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = volCtrl.classList.contains('open');
    _closeHeaderPanels();
    if (!wasOpen) volCtrl.classList.add('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.vol-control')) volCtrl.classList.remove('open');
  });
})();

// Sidebar collapse toggle
(function() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('srSidebar');
  if (!toggle || !sidebar) return;
  // Restore saved state
  try { if (localStorage.getItem('m2_sidebar_collapsed') === '1') sidebar.classList.add('collapsed'); } catch(e) {}
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    try { localStorage.setItem('m2_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0'); } catch(e) {}
  });
})();

document.getElementById('btnAdd').addEventListener('click', () => {
  selectedCat = null;
  selectedGender = null;
  document.querySelectorAll('.cat-option').forEach(o => o.className = 'cat-option');
  // Show only SR categories, hide IS categories
  SR_CATS.forEach(c => {
    const el = document.querySelector(`.cat-option[data-cat="${c}"]`);
    if (el) el.style.display = '';
  });
  IS_CATS.forEach(c => {
    const el = document.querySelector(`.cat-option[data-cat="${c}"]`);
    if (el) el.style.display = 'none';
  });
  editTargetId = null;
  document.querySelector('#addModal .modal-title').innerHTML = 'Adauga Skin/Costum';
  document.getElementById('addConfirm').textContent = 'Adauga';
  document.getElementById('addName').value = '';
  document.getElementById('addName').placeholder = 'ex: Roba neagra profet';
  document.getElementById('nameLabel').textContent = 'Nume Item';
  document.getElementById('nameGroup').classList.add('slide-visible');
  document.getElementById('genderGroup').classList.remove('slide-visible');
  document.getElementById('genderF').className = 'gender-btn';
  document.getElementById('genderM').className = 'gender-btn';
  document.getElementById('addAccount').value = '';
  document.getElementById('addDays').value = 0;
  document.getElementById('addHours').value = 0;
  document.getElementById('addMins').value = 0;
  openModal('addModal');
});

renderStats();
renderCards();
startTick();

// Also render IS tab
renderStatsIS();
renderCardsIS();

// ============ TAB SWITCHING ============
document.querySelector('.main-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.main-tab');
  if (!tab) return;
  const tabId = tab.dataset.tab;
  console.log('[Tabs] Clicked:', tabId);
  if (!tabId) return;

  // Guard: Admin tab requires isSuperAdmin or adminPanel permission
  const p = window.currentUserProfile;
  const canAdmin = p && (p.isSuperAdmin || (p.permissions && p.permissions.adminPanel));
  if ((tabId === 'secret' || tabId === 'admin') && !canAdmin) {
    console.warn('[Tabs] Access denied to:', tabId);
    return;
  }

  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
  tab.classList.add('active');
  const page = document.getElementById('tab-' + tabId);
  if (page) { page.classList.add('active'); page.style.display = 'block'; }
  
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (tabId === 'insotitori-site') { renderStatsIS(); renderCardsIS(); }
  if (tabId === 'inventory-manager') { renderInvGrid(); }
  if (tabId === 'spawn') { loadSpawn(); }
  if (tabId === 'server-status' && typeof renderServerStatus === 'function') { renderServerStatus(); }
  if (tabId === 'transfers' && typeof loadTransferData === 'function') { loadTransferData(); }
  if (tabId === 'checklist' && typeof renderChecklists === 'function') { renderChecklists(); }
  if (tabId === 'sticky-notes' && typeof renderStickyNotes === 'function') { renderStickyNotes(); }
  if (tabId === 'team-management' && typeof renderMemberList === 'function') { renderMemberList(); }
  
  if (tabId === 'admin' && window.AdminModule) {
    if (!window.AdminModule._initialized) {
      window.AdminModule.init();
      window.AdminModule._initialized = true;
    }
  }
  
  // Remember active tab (don't persist Admin/Secret tabs)
  if (tabId !== 'secret' && tabId !== 'admin') try { localStorage.setItem('m2_activeTab', tabId); } catch(e) {}
});

// ── Online users panel toggle ──
(function() {
  document.addEventListener('click', function(e) {
    var panel = document.getElementById('onlineUsersPanel');
    var btn   = document.getElementById('btnOnlineUsers');
    var wrap  = document.getElementById('footerOnlineWrap');
    if (!panel || !btn || !wrap) return;
    if (btn.contains(e.target)) {
      panel.classList.toggle('open');
      return;
    }
    if (!wrap.contains(e.target)) panel.classList.remove('open');
  });
})();

// Init server status on page load (works without Firebase too)
if (typeof initServerStatus === 'function') initServerStatus();

// Restore last active tab on page load
window.initApp = function() {
  console.log('[App] Initializing tabs...');
  if (window._isBlockingGateActive) {
    console.log('[App] Gate is active, skipping UI init.');
    return;
  }
  
  try {
    var saved = localStorage.getItem('m2_activeTab');
    console.log('[App] Saved tab:', saved);
    if (saved) {
      var tab = document.querySelector('.main-tab[data-tab="' + saved + '"]');
      if (tab) {
        console.log('[App] Clicking saved tab:', saved);
        tab.click();
        return;
      }
    }
    // Fallback: click first tab
    console.log('[App] No saved tab, clicking default...');
    var firstTab = document.querySelector('.main-tab');
    if (firstTab) firstTab.click();
  } catch(e) {
    console.error('[App] Tab init error:', e);
  }
};

