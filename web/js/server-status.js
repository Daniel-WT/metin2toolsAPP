// ============ SERVER STATUS MONITOR ============
// TCP port check via Cloudflare Worker

var SERVER_MAP = {
  romania: {
    label: 'Romania',
    loginIp: '79.110.92.72', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.72', port: 12105 },
      { ch: 2, ip: '79.110.92.77', port: 12205 },
      { ch: 3, ip: '79.110.92.72', port: 12305 },
      { ch: 4, ip: '79.110.92.77', port: 12405 },
      { ch: 5, ip: '79.110.92.72', port: 12505 },
      { ch: 6, ip: '79.110.92.77', port: 12605 }
    ]
  },
  tara_romaneasca: {
    label: 'Tara Romaneasca',
    loginIp: '79.110.92.80', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.80', port: 12105 },
      { ch: 2, ip: '79.110.92.81', port: 12205 },
      { ch: 3, ip: '79.110.92.80', port: 12305 },
      { ch: 4, ip: '79.110.92.81', port: 12405 },
      { ch: 5, ip: '79.110.92.80', port: 12505 },
      { ch: 6, ip: '79.110.92.81', port: 12605 }
    ]
  },
  magyarorszag: {
    label: 'Magyarorszag',
    loginIp: '79.110.92.86', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.86', port: 12105 },
      { ch: 2, ip: '79.110.92.87', port: 12205 },
      { ch: 3, ip: '79.110.92.86', port: 12305 },
      { ch: 4, ip: '79.110.92.87', port: 12405 },
      { ch: 5, ip: '79.110.92.86', port: 12505 },
      { ch: 6, ip: '79.110.92.87', port: 12605 }
    ]
  },
  cesko: {
    label: 'Cesko',
    loginIp: '79.110.92.89', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.88', port: 12105 },
      { ch: 2, ip: '79.110.92.89', port: 12205 },
      { ch: 3, ip: '79.110.92.88', port: 12305 },
      { ch: 4, ip: '79.110.92.89', port: 12405 },
      { ch: 5, ip: '79.110.92.88', port: 12505 },
      { ch: 6, ip: '79.110.92.89', port: 12605 }
    ]
  },
  polska: {
    label: 'Polska',
    loginIp: '79.110.92.90', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.90',  port: 12105 },
      { ch: 2, ip: '79.110.92.101', port: 12205 },
      { ch: 3, ip: '79.110.92.90',  port: 12305 },
      { ch: 4, ip: '79.110.92.101', port: 12405 },
      { ch: 5, ip: '79.110.92.90',  port: 12505 },
      { ch: 6, ip: '79.110.92.101', port: 12605 }
    ]
  }
};

// ── State ──
var _ssMonitorActive = false;
var _ssListenerActive = false;
var _ssWorker = null;
var _ssFallbackInt = null;
var _ssPrevStatus = {};
var _ssLastPollAt = 0;
var _ssAutoStopTimer = null;
var _ssAllUpSince = 0;
var _ssMaxDuration = 4 * 3600000;
var _ssPollInterval = 10000;
var _ssSelectedServers = {};
var _ssNotifiedOnline = {};
var _ssIsAdmin = false;
var _ssVolume = 0.5;
var _ssAutoMonitorMode = false;
var _ssAutoMonitorPrevSelected = {};

// ── Admin: based on Firebase Auth profile ──
function _ssRefreshAdminState() {
  var p = window.currentUserProfile;
  _ssIsAdmin = !!(p && (p.isSuperAdmin || (p.permissions && p.permissions.serverStatus)));
  _ssUpdateAdminUI();
}

function _ssUpdateAdminUI() {
  var p = window.currentUserProfile;
  _ssIsAdmin = !!(p && (p.isSuperAdmin || (p.permissions && p.permissions.serverStatus)));
  var adminBar = document.getElementById('ssAdminBar');
  var startBtn = document.getElementById('ssStartBtn');
  var stopBtn  = document.getElementById('ssStopBtn');
  if (adminBar) adminBar.style.display = _ssIsAdmin ? '' : 'none';
  if (startBtn && _ssIsAdmin) startBtn.style.display = '';
  if (stopBtn  && !_ssMonitorActive) stopBtn.style.display = 'none';
}

// Re-check admin state whenever the profile is updated from Firebase
window.addEventListener('m2-profile-updated', function() {
  if (document.getElementById('ssAdminBar')) _ssRefreshAdminState();
});

// ── Init ──
function initServerStatus() {
  // Load selected servers from localStorage (default: all selected)
  try {
    var saved = JSON.parse(localStorage.getItem('ss_servers') || 'null');
    if (saved && typeof saved === 'object') {
      _ssSelectedServers = saved;
    } else {
      Object.keys(SERVER_MAP).forEach(function (k) { _ssSelectedServers[k] = true; });
    }
  } catch (e) {
    Object.keys(SERVER_MAP).forEach(function (k) { _ssSelectedServers[k] = true; });
  }

  // Load max duration
  try {
    var dur = parseInt(localStorage.getItem('ss_maxDuration'));
    if (dur > 0) _ssMaxDuration = dur;
  } catch (e) { }

  // Load volume
  try {
    var vol = parseFloat(localStorage.getItem('ss_volume'));
    if (!isNaN(vol) && vol >= 0 && vol <= 1) _ssVolume = vol;
  } catch (e) { }

  renderServerStatus();
  _ssRefreshAdminState();
  _ssSetupFirebaseListener();
}

// ── Firebase listener for status + monitor state ──
var _ssFirstLoad = true; // skip notifications on initial data load
var _ssStaleThreshold = 60000; // 1 minute — ignore status changes older than this
function _ssSetupFirebaseListener() {
  if (!db || _ssListenerActive) return;
  _ssListenerActive = true;

  // Listen to all server statuses
  db.ref(p('serverStatus/servers')).on('value', function (snap) {
    var data = snap.val() || {};
    var oldStatus = JSON.parse(JSON.stringify(_ssPrevStatus));
    var isFirstLoad = _ssFirstLoad;
    _ssFirstLoad = false;
    _ssPrevStatus = {};
    Object.keys(data).forEach(function (srv) {
      var srvData = data[srv] || {};
      Object.keys(srvData).forEach(function (endpoint) {
        var key = srv + '/' + endpoint;
        _ssPrevStatus[key] = srvData[endpoint];
      });
    });

    // On first load, populate state without notifying
    if (isFirstLoad) {
      var now = Date.now();
      var staleThresholdMs = 2 * 60000; // 2 minutes — if no poll in 2 min, data is stale
      Object.keys(_ssPrevStatus).forEach(function (key) {
        var entry = _ssPrevStatus[key];
        // If data is stale (no active monitor), clear it to "unknown"
        if (entry && entry.checkedAt && (now - entry.checkedAt > staleThresholdMs)) {
          _ssPrevStatus[key] = { online: null, checkedAt: entry.checkedAt, stale: true };
        } else if (entry && entry.online) {
          _ssNotifiedOnline[key] = true;
        }
      });
      _ssRenderGrid();
      return;
    }

    // Check for newly online endpoints and notify
    var now = Date.now();
    Object.keys(_ssPrevStatus).forEach(function (key) {
      var cur = _ssPrevStatus[key];
      // Only notify if the status change is recent (< 1 min old)
      var isRecent = cur && cur.checkedAt && (now - cur.checkedAt < _ssStaleThreshold);
      if (cur && cur.online && isRecent && !_ssNotifiedOnline[key]) {
        var oldVal = oldStatus[key];
        if (!oldVal || !oldVal.online) {
          _ssNotifyOnline(key);
        }
        _ssNotifiedOnline[key] = true;
      } else if (!cur || !cur.online) {
        delete _ssNotifiedOnline[key];
      }
    });
    _ssRenderGrid();
  });

  // Listen to monitor state
  db.ref(p('serverStatus/_monitor')).on('value', function (snap) {
    var mon = snap.val() || {};
    var isLeader = mon.leaderId === window._myClientId;
    var isActive = !!mon.leaderId && mon.lastPollAt && (Date.now() - mon.lastPollAt < 15000);

    _ssRefreshAdminState();
    var startBtn = document.getElementById('ssStartBtn');
    var stopBtn = document.getElementById('ssStopBtn');
    var statusEl = document.getElementById('ssStatusText');
    if (startBtn) {
      startBtn.disabled = isActive && !isLeader;
      startBtn.style.display = (_ssIsAdmin && !(isActive && isLeader)) ? '' : 'none';
    }
    if (stopBtn) stopBtn.style.display = (_ssIsAdmin && isActive && isLeader) ? '' : 'none';
    if (statusEl) {
      if (!isActive) {
        statusEl.textContent = 'Oprit';
        statusEl.className = 'ss-status-text ss-stopped';
      } else if (isLeader) {
        statusEl.textContent = 'Activ (tu monitorizezi)';
        statusEl.className = 'ss-status-text ss-active-leader';
      } else {
        statusEl.textContent = 'Activ (alt utilizator)';
        statusEl.className = 'ss-status-text ss-active-other';
      }
    }

    // If leader disconnected (stale), allow takeover
    if (!isActive && _ssMonitorActive && !isLeader) {
      _ssStopPolling(true); // silent stop
    }
  });

  // Listen for auto-monitor trigger (from cron daily check)
  db.ref(p('serverStatus/_autoMonitor')).on('value', function (snap) {
    var data = snap.val();
    if (!data || !data.active) return;
    // Only first connected client becomes the auto-monitor leader
    if (_ssMonitorActive) return; // already monitoring

    // Check if there's already an active leader
    db.ref(p('serverStatus/_monitor')).once('value').then(function (monSnap) {
      var mon = monSnap.val() || {};
      var hasLeader = mon.leaderId && mon.lastPollAt && (Date.now() - mon.lastPollAt < 15000);
      if (hasLeader) return; // someone else is already monitoring

      // Auto-start monitoring for the specified server only
      var targetServer = data.server || 'magyarorszag';
      // Temporarily override selected servers to only monitor target
      var prevSelected = JSON.parse(JSON.stringify(_ssSelectedServers));
      Object.keys(_ssSelectedServers).forEach(function (k) { _ssSelectedServers[k] = false; });
      _ssSelectedServers[targetServer] = true;

      // Start as auto-monitor (bypass admin check)
      _ssAutoMonitorMode = true;
      _ssAutoMonitorPrevSelected = prevSelected;
      _ssStartMonitorInternal();
    });
  });
}

// ── Start monitoring ──
function ssStartMonitor() {
  if (_ssMonitorActive) return;
  if (!_ssIsAdmin) {
    if (typeof showToast === 'function') showToast('Doar adminii pot porni monitorizarea!', 'error');
    return;
  }
  // Send Discord notification — started manually
  fetch('/api/discord-server-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'monitor_started_manual', server: 'Magyarorszag', webhookUrl: window.teamWebhookServer || undefined })
  }).catch(function() {});
  _ssStartMonitorInternal();
}

function _ssStartMonitorInternal() {
  if (_ssMonitorActive) return;

  // Check which servers are selected
  var anySelected = Object.keys(_ssSelectedServers).some(function (k) { return _ssSelectedServers[k]; });
  if (!anySelected) {
    if (typeof showToast === 'function') showToast('Selecteaza cel putin un server!', 'error');
    return;
  }

  _ssMonitorActive = true;
  _ssAllUpSince = 0;
  _ssNotifiedOnline = {};

  // Write leader info to Firebase
  if (db) {
    db.ref(p('serverStatus/_monitor')).set({
      leaderId: window._myClientId,
      startedAt: Date.now(),
      maxDurationMs: _ssMaxDuration,
      lastPollAt: Date.now()
    });
  }

  // Auto-stop timer
  _ssAutoStopTimer = setTimeout(function () {
    ssStopMonitor();
    if (typeof showToast === 'function') showToast('Monitorizare oprita automat (timp expirat)', 'info');
  }, _ssMaxDuration);

  // Start polling via Web Worker for unthrottled timing
  try {
    var blob = new Blob([
      'var tid=null;onmessage=function(e){if(e.data==="start"){if(tid)clearInterval(tid);tid=setInterval(function(){postMessage("t")},' + _ssPollInterval + ')}if(e.data==="stop"){if(tid){clearInterval(tid);tid=null}}}'
    ], { type: 'application/javascript' });
    _ssWorker = new Worker(URL.createObjectURL(blob));
    _ssWorker.onmessage = function () { _ssDoPoll(); };
    _ssWorker.postMessage('start');
  } catch (e) {
    _ssFallbackInt = setInterval(_ssDoPoll, _ssPollInterval);
  }

  // First poll immediately
  _ssDoPoll();
}

// ── Stop monitoring ──
function ssStopMonitor() {
  _ssStopPolling(false);
}

function _ssStopPolling(silent) {
  _ssMonitorActive = false;
  _ssPollInFlight = false;
  if (_ssWorker) { _ssWorker.postMessage('stop'); _ssWorker.terminate(); _ssWorker = null; }
  if (_ssFallbackInt) { clearInterval(_ssFallbackInt); _ssFallbackInt = null; }
  if (_ssAutoStopTimer) { clearTimeout(_ssAutoStopTimer); _ssAutoStopTimer = null; }

  // Clear leader from Firebase
  if (db && !silent) {
    db.ref(p('serverStatus/_monitor')).remove();
  }
}

// ── Do a single poll cycle ──
var _ssPollInFlight = false;
var _ssPollStartedAt = 0;
var _SS_FETCH_TIMEOUT = 8000;  // 8s per fetch (Worker TCP check is 2s + overhead)
var _SS_POLL_TIMEOUT = 30000;  // 30s max for entire poll cycle

// Fetch with timeout — prevents hung requests from blocking all future polls
function _ssFetchWithTimeout(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
    fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (r) { clearTimeout(timer); return r.json(); })
      .then(resolve)
      .catch(function (e) { clearTimeout(timer); reject(e); });
  });
}

function _ssDoPoll() {
  if (!_ssMonitorActive) return;

  // Safety: if previous poll is stuck for > 30s, force-reset the flag
  if (_ssPollInFlight && _ssPollStartedAt && (Date.now() - _ssPollStartedAt > _SS_POLL_TIMEOUT)) {
    console.warn('[SS] Poll stuck for >' + (_SS_POLL_TIMEOUT / 1000) + 's, force-resetting');
    _ssPollInFlight = false;
  }
  if (_ssPollInFlight) return;
  _ssPollInFlight = true;
  _ssPollStartedAt = Date.now();

  // Update lastPollAt heartbeat
  if (db) {
    db.ref(p('serverStatus/_monitor/lastPollAt')).set(Date.now());
  }

  // Build list of endpoints to check
  var checks = [];
  Object.keys(SERVER_MAP).forEach(function (srvKey) {
    if (!_ssSelectedServers[srvKey]) return;
    var srv = SERVER_MAP[srvKey];
    checks.push({ srv: srvKey, endpoint: 'login', ip: srv.loginIp, port: srv.loginPort });
    srv.channels.forEach(function (ch) {
      checks.push({ srv: srvKey, endpoint: 'ch' + ch.ch, ip: ch.ip, port: ch.port });
    });
  });

  // Batch checks — max 6 concurrent to avoid overwhelming Worker
  var results = [];
  var idx = 0;
  var batchSize = 6;

  function nextBatch() {
    if (idx >= checks.length) {
      _ssProcessResults(results);
      _ssPollInFlight = false;
      // Update heartbeat after successful poll too
      if (db && _ssMonitorActive) {
        db.ref(p('serverStatus/_monitor/lastPollAt')).set(Date.now());
      }
      return;
    }
    var batch = checks.slice(idx, idx + batchSize);
    idx += batchSize;
    var promises = batch.map(function (c) {
      return _ssFetchWithTimeout('/api/check-server?ip=' + encodeURIComponent(c.ip) + '&port=' + c.port, _SS_FETCH_TIMEOUT)
        .then(function (d) { return { srv: c.srv, endpoint: c.endpoint, online: !!d.online }; })
        .catch(function () { return { srv: c.srv, endpoint: c.endpoint, online: false }; });
    });
    Promise.all(promises).then(function (batchResults) {
      results = results.concat(batchResults);
      nextBatch();
    }).catch(function () {
      // Entire batch failed — mark all as offline and continue
      batch.forEach(function (c) {
        results.push({ srv: c.srv, endpoint: c.endpoint, online: false });
      });
      nextBatch();
    });
  }
  nextBatch();
}

// ── Process poll results: diff-only Firebase writes ──
function _ssProcessResults(results) {
  if (!db) return;
  var updates = {};
  var anyChanged = false;

  results.forEach(function (r) {
    var key = r.srv + '/' + r.endpoint;
    var prev = _ssPrevStatus[key];
    var prevOnline = prev ? prev.online : null;
    var now = Date.now();

    if (prevOnline !== r.online) {
      anyChanged = true;
      updates['servers/' + r.srv + '/' + r.endpoint] = { online: r.online, checkedAt: now };
    }
  });

  if (anyChanged) {
    db.ref(p('serverStatus')).update(updates);
  }

  // Check if ALL selected endpoints are online → auto-stop after 5 min buffer
  var allUp = results.length > 0 && results.every(function (r) { return r.online; });
  if (allUp) {
    if (!_ssAllUpSince) _ssAllUpSince = Date.now();
    if (Date.now() - _ssAllUpSince > 5 * 60000) {
      // If auto-monitor mode, clear flag in Firebase and restore selection
      var isManualMode = !_ssAutoMonitorMode;
      if (_ssAutoMonitorMode) {
        _ssAutoMonitorMode = false;
        if (db) db.ref(p('serverStatus/_autoMonitor')).set({ active: false });
        _ssSelectedServers = _ssAutoMonitorPrevSelected;
        try { localStorage.setItem('ss_servers', JSON.stringify(_ssSelectedServers)); } catch (e) { }
        renderServerStatus();
      }
      // Discord notification — all online, monitoring stopped (manual or auto)
      fetch('/api/discord-server-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'monitor_done', server: 'Magyarorszag', manual: isManualMode, webhookUrl: window.teamWebhookServer || undefined })
      }).catch(function () {});
      // Save server online timestamp — used by transfer scraper (same as cron does)
      if (db) db.ref(p('serverStatus/_serverOnlineAt')).set(Date.now());
      ssStopMonitor();
      if (typeof showToast === 'function') showToast('Toate serverele sunt online. Monitorizare oprita.', 'success');
    }
  } else {
    _ssAllUpSince = 0;
  }
}

// ── Soft chime notification sound ──
function _ssPlayChime() {
  try {
    var ctx = typeof getAudioCtx === 'function' ? getAudioCtx() : new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    var vol = _ssVolume;
    if (vol <= 0) return;
    var t = ctx.currentTime;

    // Gentle two-note chime (C5 → E5)
    var notes = [523, 659];
    notes.forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.18);
      gain.gain.linearRampToValueAtTime(vol * 0.3, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.5);
    });
  } catch (e) { }
}

// ── Notify when endpoint comes online ──
var _ssDiscordSent = {}; // dedup for Discord alerts
function _ssNotifyOnline(key) {
  // Parse key: "romania/ch1" or "romania/login"
  var parts = key.split('/');
  var srvKey = parts[0];
  var endpoint = parts[1];
  var srv = SERVER_MAP[srvKey];
  if (!srv) return;

  var label = srv.label + ' — ' + (endpoint === 'login' ? 'Login' : endpoint.toUpperCase());

  // Soft chime sound
  _ssPlayChime();

  // Corner notification on site
  _ssShowCornerNotif(label + ' este ONLINE');

  // Discord webhook — sent by leader only, dedup per endpoint
  if (_ssMonitorActive && !_ssDiscordSent[key]) {
    _ssDiscordSent[key] = true;
    var chLabel = endpoint === 'login' ? 'Login' : endpoint.toUpperCase();
    _ssSendDiscordServerUp(srv.label, chLabel);
  }
}

// ── Send Discord alert for server/ch online ──
function _ssSendDiscordServerUp(serverLabel, chLabel) {
  fetch('/api/discord-server-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server: serverLabel, channel: chLabel, status: 'online', webhookUrl: window.teamWebhookServer || undefined })
  }).catch(function () { });
}

// ── Corner notification (bottom-right, stacks) ──
var _ssNotifQueue = [];
function _ssShowCornerNotif(msg) {
  var el = document.createElement('div');
  el.className = 'ss-corner-notif';
  el.innerHTML = '<span class="ss-cn-dot ss-dot-online"></span><span class="ss-cn-text">' + msg + '</span>';
  var container = document.getElementById('ssCornerNotifs');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ssCornerNotifs';
    container.className = 'ss-corner-notifs';
    document.body.appendChild(container);
  }
  container.appendChild(el);
  // Auto-remove after 5 seconds
  setTimeout(function () {
    el.classList.add('ss-cn-fade');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  }, 5000);
}

// ── Render main UI ──
function renderServerStatus() {
  var container = document.getElementById('ssContent');
  if (!container) return;

  // Server selection checkboxes
  var selHtml = '<div class="ss-server-select">';
  Object.keys(SERVER_MAP).forEach(function (k) {
    var srv = SERVER_MAP[k];
    var checked = _ssSelectedServers[k] ? 'checked' : '';
    selHtml += '<label class="ss-srv-label"><input type="checkbox" class="ss-srv-cb" data-srv="' + k + '" ' + checked + '> ' + srv.label + '</label>';
  });
  selHtml += '</div>';

  // Duration selector
  var durOpts = [
    { val: 3600000, label: '1h' },
    { val: 2 * 3600000, label: '2h' },
    { val: 4 * 3600000, label: '4h' },
    { val: 8 * 3600000, label: '8h' }
  ];
  var durHtml = '<select class="ss-dur-select" id="ssDuration">';
  durOpts.forEach(function (o) {
    durHtml += '<option value="' + o.val + '"' + (o.val === _ssMaxDuration ? ' selected' : '') + '>' + o.label + '</option>';
  });
  durHtml += '</select>';

  container.innerHTML =
    '<div class="ss-topbar">' +
    selHtml +
    '<div class="ss-topbar-right">' +
    '<div class="ss-status-wrap"><span class="ss-status-dot" id="ssStatusDot"></span><span class="ss-status-text ss-stopped" id="ssStatusText">Oprit</span></div>' +
    '<div class="ss-admin-controls" id="ssAdminBar" style="display:none">' +
    '<button class="ss-btn ss-btn-start" id="ssStartBtn">Start</button>' +
    '<button class="ss-btn ss-btn-stop" id="ssStopBtn" style="display:none">Stop</button>' +
    '<div class="ss-dur-wrap" id="ssDurWrap"><span class="ss-dur-label">Durata:</span>' + durHtml + '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="ss-grid" id="ssGrid"></div>';

  // Event listeners
  container.querySelectorAll('.ss-srv-cb').forEach(function (cb) {
    cb.addEventListener('change', function () {
      _ssSelectedServers[this.dataset.srv] = this.checked;
      try { localStorage.setItem('ss_servers', JSON.stringify(_ssSelectedServers)); } catch (e) { }
      _ssRenderGrid();
    });
  });

  var durSel = document.getElementById('ssDuration');
  if (durSel) {
    durSel.addEventListener('change', function () {
      _ssMaxDuration = parseInt(this.value);
      try { localStorage.setItem('ss_maxDuration', String(_ssMaxDuration)); } catch (e) { }
    });
  }

  document.getElementById('ssStartBtn').addEventListener('click', ssStartMonitor);
  document.getElementById('ssStopBtn').addEventListener('click', ssStopMonitor);

  // Populate admin UI
  _ssUpdateAdminUI();

  _ssRenderGrid();
}

// ── Render server status grid ──
function _ssRenderGrid() {
  var grid = document.getElementById('ssGrid');
  if (!grid) return;

  var html = '';
  Object.keys(SERVER_MAP).forEach(function (srvKey) {
    if (!_ssSelectedServers[srvKey]) return;
    var srv = SERVER_MAP[srvKey];

    var loginStatus = _ssPrevStatus[srvKey + '/login'];
    var loginClass = !loginStatus || loginStatus.online === null ? 'unknown' : (loginStatus.online ? 'online' : 'offline');
    var loginTime = loginStatus && loginStatus.checkedAt ? _ssFormatTime(loginStatus.checkedAt) : '--:--';

    html += '<div class="ss-card">' +
      '<div class="ss-card-header">' +
      '<span class="ss-card-title">' + srv.label + '</span>' +
      '<span class="ss-dot ss-dot-' + loginClass + '"></span>' +
      '<span class="ss-login-label">Login ' + loginTime + '</span>' +
      '</div>' +
      '<div class="ss-channels">';

    for (var i = 1; i <= 6; i++) {
      var chStatus = _ssPrevStatus[srvKey + '/ch' + i];
      var chClass = !chStatus || chStatus.online === null ? 'unknown' : (chStatus.online ? 'online' : 'offline');
      var chTime = chStatus && chStatus.checkedAt ? _ssFormatTime(chStatus.checkedAt) : '';
      html += '<div class="ss-ch ss-ch-' + chClass + '">' +
        '<span class="ss-ch-num">CH' + i + '</span>' +
        '<span class="ss-ch-dot ss-dot-' + chClass + '"></span>' +
        (chTime ? '<span class="ss-ch-time">' + chTime + '</span>' : '') +
        '</div>';
    }

    html += '</div></div>';
  });

  if (!html) {
    html = '<div class="ss-empty">Selecteaza cel putin un server pentru monitorizare.</div>';
  }
  grid.innerHTML = html;
}

function _ssFormatTime(ts) {
  var d = new Date(ts);
  return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
    (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ':' +
    (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
}

// ── Cleanup on page unload ──
window.addEventListener('beforeunload', function () {
  if (_ssMonitorActive) {
    _ssStopPolling(false);
  }
});
