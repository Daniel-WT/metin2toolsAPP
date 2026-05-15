// ============ TICK ============
const notifiedItems = new Set();

function updateUrgencyBanner() {
  // Update badge count every tick (cheap)
  if (typeof _updateNotifBadge === 'function') _updateNotifBadge();
  // Only re-render full panel content when it's actually open
  const panel = document.getElementById('notifPanel');
  if (panel && panel.classList.contains('open') && typeof renderNotifPanel === 'function') {
    renderNotifPanel();
  }
}

function checkBrowserNotifications() {
  items.forEach(item => {
    const ms = getRemaining(item);
    if (ms > 0 && ms < 86400000 && item.category !== 'sase-sapte' && !notifiedItems.has(item.id)) {
      notifiedItems.add(item.id);
      if (Notification.permission === 'granted') {
        const t = msToHMS(ms);
        const pad = n => String(n).padStart(2,'0');
        const timeStr = t.d > 0 ? `${t.d}z ${pad(t.h)}h` : `${pad(t.h)}h ${pad(t.m)}m`;
        new Notification(`⚠️ ${item.name} expira curand!`, {
          body: `Contul ${item.account} · Mai raman ${timeStr}`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚔️</text></svg>'
        });
      }
    }
    // 6/7 — browser notification only at completion (ms <= 0)
    if (item.category === 'sase-sapte' && ms <= 0 && !notifiedItems.has(item.id)) {
      notifiedItems.add(item.id);
      if (Notification.permission === 'granted') {
        new Notification(`6/7 Finalizat: ${item.name}`, {
          body: `Contul ${item.account} · Verifica itemul in joc`,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>'
        });
      }
    }
  });
}

function tick() {
  const _depersFinalized = [];
  document.querySelectorAll('[data-timer]').forEach(el => {
    const id = el.dataset.timer;
    const item = items.find(i => i.id === id);
    if (!item) return;
    const ms = getRemaining(item);
    el.textContent = formatTimer(ms);
    el.className = 'timer-display ' + (ms <= 0 ? 'expired' : ms < 3600000 ? 'warning' : 'ok');

    const card = el.closest('.card');
    if (card && !card.classList.contains('card-compact')) {
      const isWarn = ms > 0 && ms < 86400000;
      const isFullyPers = ['skin-arma','costum','frizura'].includes(item.category) && item.personalized && !(item.depersExpiresAt && item.depersExpiresAt > Date.now() + _clockOffsetMs);
      const isWarn4 = ms > 0 && ms < 345600000 && isFullyPers;
      const isPersOrDeperssing = ['skin-arma','costum','frizura'].includes(item.category) && item.personalized;
      card.classList.toggle('pers-active-card', isPersOrDeperssing);
      card.classList.toggle('warning-card', isWarn && !isPersOrDeperssing);
      card.classList.toggle('warn4-card', !isWarn && isWarn4 && !isPersOrDeperssing);
    }

    // Auto-finalize depersonalization when timer expires — defer render until after loop
    if (item.personalized && item.depersExpiresAt && item.depersExpiresAt <= Date.now() + _clockOffsetMs) {
      item.personalized = false;
      item.depersExpiresAt = null;
      save();
      _depersFinalized.push(item.name);
      return;
    }

    const prog = document.querySelector(`[data-prog="${id}"]`);
    if (prog) {
      const pct = ms <= 0 ? 0 : Math.max(0, Math.min(100, (ms / (item.totalDuration||1)) * 100));
      prog.style.width = pct + '%';
    }
  });

  // Finalize depersonalizations collected above — single render even if multiple items expired
  if (_depersFinalized.length > 0) {
    renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
    _depersFinalized.forEach(function(name) {
      showToast('"' + name + '" — depersonalizare finalizata! ✓', 'success');
    });
  }

  // Update compact timers
  document.querySelectorAll('.compact-timer[data-id]').forEach(el => {
    const item = items.find(i => i.id === el.dataset.id);
    if (!item) return;
    const ms = getRemaining(item);
    el.textContent = formatTimer(ms);
    el.style.color = ms <= 0 ? 'var(--red)' : ms < 3600000 ? 'var(--orange)' : ms < 86400000 ? 'var(--orange)' : 'var(--text-dim)';
  });

  // Deperso sub-timers
  document.querySelectorAll('[data-depers]').forEach(el => {
    const item = items.find(i => i.id === el.dataset.depers);
    if (!item || !item.depersExpiresAt) return;
    const dms = item.depersExpiresAt - (Date.now() + _clockOffsetMs);
    el.textContent = dms > 0 ? formatTimer(dms) : 'Finalizat ✓';
  });

  // Secret item timers (admin only)
  if (window._isAdmin && typeof secretItems !== 'undefined') {
    document.querySelectorAll('[data-timer-secret]').forEach(el => {
      const id = el.dataset.timerSecret;
      const item = secretItems.find(i => i.id === id);
      if (!item) return;
      const ms = item.depersAt - (Date.now() + _clockOffsetMs);
      el.textContent = formatTimer(ms);
      el.className = 'timer-display ' + (ms <= 0 ? 'expired' : ms < 3600000 ? 'warning' : 'ok');
      const prog = document.querySelector(`[data-prog-secret="${id}"]`);
      if (prog) {
        prog.style.width = (ms <= 0 ? 0 : Math.max(0, Math.min(100, (ms / (item.totalDuration || 1)) * 100))) + '%';
      }
    });
  }

  // Re-render cards every 60s to keep sort order fresh
  if (!tick._lastResort || Date.now() - tick._lastResort > 60000) {
    tick._lastResort = Date.now();
    renderCards();
  }

  updateUrgencyBanner();
  updateExpirySidebar();
  checkBrowserNotifications();
  checkAlerts();

  const now = (typeof getSyncedNow === 'function') ? getSyncedNow() : new Date();
  document.getElementById('liveTime').textContent =
    now.toLocaleDateString('ro-RO') + ' · ' +
    now.toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, 1000);
  tick();
}
