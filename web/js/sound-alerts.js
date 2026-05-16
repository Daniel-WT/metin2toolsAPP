// ============ SOUND ENGINE ============
let soundLoop1 = null; // < 1 day loop
let soundLoop4 = null; // < 4 days loop
let persTargetId = null;
var _costumeAlarmVolume = 0.5;
try { var _sv = localStorage.getItem('costume_alarm_volume'); if (_sv !== null) _costumeAlarmVolume = parseFloat(_sv); } catch(e) {}

// No singleton AudioContext — each sound creates its own fresh context to avoid
// the 30-second auto-suspend pop/click caused by Chrome suspending idle contexts.
function _makeAudioCtx() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume().catch(() => {});
  return ctx;
}

// One-time warm-up on first user interaction (browser policy requires a gesture)
(function() {
  function warmUpAudio() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume().then(() => ctx.close()).catch(() => { try { ctx.close(); } catch(_) {} });
    } catch(e) {}
    document.removeEventListener('click', warmUpAudio, true);
    document.removeEventListener('keydown', warmUpAudio, true);
    document.removeEventListener('touchstart', warmUpAudio, true);
  }
  document.addEventListener('click', warmUpAudio, true);
  document.addEventListener('keydown', warmUpAudio, true);
  document.addEventListener('touchstart', warmUpAudio, true);
})();

// ── Realistic alarm tone builder ──
// Creates a rich alarm tone with harmonics and tremolo (like a real alarm/siren)
function playAlarmTone(freq, duration, vol, opts = {}) {
  if (!vol || vol <= 0) return;
  try {
    const ctx = _makeAudioCtx();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // Tremolo (amplitude modulation) — gives pulsating alarm feel
    const tremoloRate = opts.tremoloRate || 8;
    const tremoloDepth = opts.tremoloDepth || 0.4;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = tremoloRate;
    lfoGain.gain.value = tremoloDepth * vol;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start(t);
    lfo.stop(t + duration + 0.05);

    // Base volume envelope — smooth attack/release
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(vol * (1 - tremoloDepth), t + 0.015);
    master.gain.setValueAtTime(vol * (1 - tremoloDepth), t + duration - 0.04);
    master.gain.linearRampToValueAtTime(0, t + duration);

    // Fundamental + harmonics for richer tone
    const harmonics = opts.harmonics || [1, 0.5, 0.25];
    harmonics.forEach((amp, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.wave || 'sine';
      osc.frequency.value = freq * (i + 1);
      // Slight detune for thickness
      if (i > 0) osc.detune.value = (i % 2 === 0 ? 3 : -3);
      g.gain.value = amp;
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    });

    // Optional frequency sweep (siren effect)
    if (opts.sweep) {
      // handled externally
    }
  } catch(e) {}
}

// ── ALERT 1: URGENT — sub 1 zi ──
// Sunet de alarma urgenta tip sirena — ton ascutit pulsant, ca o alarma de incendiu
function playAlert1() {
  if (_costumeAlarmVolume <= 0) return;
  try {
    const ctx = _makeAudioCtx();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // 3 rafale rapide de alarma: hi-lo-hi (sirena scurta)
    const bursts = [
      { freq: 880, start: 0,    dur: 0.22 },
      { freq: 660, start: 0.24, dur: 0.22 },
      { freq: 880, start: 0.48, dur: 0.30 },
    ];

    bursts.forEach(b => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator(); // harmonic
      const g = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.value = b.freq;
      osc2.type = 'sine';
      osc2.frequency.value = b.freq * 1.5; // quinta

      const g2 = ctx.createGain();
      g2.gain.value = 0.2; // harmonic quieter

      osc1.connect(g);
      osc2.connect(g2);
      g2.connect(g);
      g.connect(master);

      // Tremolo intern rapid — pulsare
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 12;
      lfoG.gain.value = 0.15;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      lfo.start(t + b.start);
      lfo.stop(t + b.start + b.dur + 0.02);

      // Envelope
      g.gain.setValueAtTime(0, t + b.start);
      g.gain.linearRampToValueAtTime(0.35, t + b.start + 0.01);
      g.gain.setValueAtTime(0.35, t + b.start + b.dur - 0.03);
      g.gain.linearRampToValueAtTime(0, t + b.start + b.dur);

      osc1.start(t + b.start);
      osc1.stop(t + b.start + b.dur + 0.02);
      osc2.start(t + b.start);
      osc2.stop(t + b.start + b.dur + 0.02);
    });

    master.gain.value = _costumeAlarmVolume;
  } catch(e) {}
}

// ── ALERT 4: AVERTIZARE — sub 4 zile ──
// Sunet de avertizare calm dar ferm — 3 tonuri melodice descendente (ca o notificare serioasa)
function playAlert4() {
  if (_costumeAlarmVolume <= 0) return;
  try {
    const ctx = _makeAudioCtx();
    const t = ctx.currentTime;

    const tones = [
      { freq: 620, start: 0,    dur: 0.25 },
      { freq: 520, start: 0.30, dur: 0.25 },
      { freq: 440, start: 0.60, dur: 0.40 },
    ];

    tones.forEach(b => {
      const master = ctx.createGain();
      master.connect(ctx.destination);

      // Main tone + subtle second harmonic
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.value = b.freq;
      osc2.type = 'sine';
      osc2.frequency.value = b.freq * 2;

      const g2 = ctx.createGain();
      g2.gain.value = 0.12;

      osc1.connect(master);
      osc2.connect(g2);
      g2.connect(master);

      // Soft pulsation
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 5;
      lfoG.gain.value = 0.06;
      lfo.connect(lfoG);
      lfoG.connect(master.gain);
      lfo.start(t + b.start);
      lfo.stop(t + b.start + b.dur + 0.05);

      // Smooth envelope (scaled by costume alarm volume)
      var peak = 0.25 * _costumeAlarmVolume;
      master.gain.setValueAtTime(0, t + b.start);
      master.gain.linearRampToValueAtTime(peak, t + b.start + 0.03);
      master.gain.setValueAtTime(peak, t + b.start + b.dur - 0.08);
      master.gain.linearRampToValueAtTime(0, t + b.start + b.dur);

      osc1.start(t + b.start);
      osc1.stop(t + b.start + b.dur + 0.05);
      osc2.start(t + b.start);
      osc2.stop(t + b.start + b.dur + 0.05);
    });
  } catch(e) {}
}

function startSoundLoop(id, playFn, intervalMs) {
  if (id === '1' && soundLoop1) return;
  if (id === '4' && soundLoop4) return;
  playFn();
  const loop = setInterval(playFn, intervalMs);
  if (id === '1') soundLoop1 = loop;
  if (id === '4') soundLoop4 = loop;
}

function stopSoundLoop(id) {
  if (id === '1' && soundLoop1) { clearInterval(soundLoop1); soundLoop1 = null; }
  if (id === '4' && soundLoop4) { clearInterval(soundLoop4); soundLoop4 = null; }
}

// ── Calm checklist reminder chime — two soft ascending notes ──
function playReminderChime() {
  if (_costumeAlarmVolume <= 0) return;
  try {
    var ctx = _makeAudioCtx();
    var t = ctx.currentTime;
    var vol = _costumeAlarmVolume;
    var notes = [
      { freq: 523.25, start: 0,    dur: 0.55 },
      { freq: 659.25, start: 0.20, dur: 0.65 },
    ];
    notes.forEach(function(note) {
      var master = ctx.createGain();
      var osc    = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      master.gain.setValueAtTime(0, t + note.start);
      master.gain.linearRampToValueAtTime(0.18 * vol, t + note.start + 0.012);
      master.gain.exponentialRampToValueAtTime(0.0001, t + note.start + note.dur);
      osc.connect(master);
      master.connect(ctx.destination);
      osc.start(t + note.start);
      osc.stop(t + note.start + note.dur + 0.05);
    });
  } catch(e) {}
}

// ============ DISCORD NOTIFICATIONS ============
// Dedup stored in Firebase so ALL users share the same "already sent" state.
// Falls back to localStorage if Firebase is not connected.
const DISCORD_NOTIFIED_KEY = 'metin2_discord_notified';
let discordNotified = { day1: {}, day4: {}, hourly: {} };
let _discordNotifiedFb = null; // Firebase-synced copy

function loadDiscordNotified() {
  try { discordNotified = JSON.parse(localStorage.getItem(DISCORD_NOTIFIED_KEY)) || { day1: {}, day4: {}, hourly: {} }; }
  catch { discordNotified = { day1: {}, day4: {}, hourly: {} }; }
  if (!discordNotified.day1) discordNotified.day1 = {};
  if (!discordNotified.day4) discordNotified.day4 = {};
  if (!discordNotified.hourly) discordNotified.hourly = {};
  // Firebase sync listener is managed by initFirebase() and re-attached on reconnect
}
function saveDiscordNotified() {
  localStorage.setItem(DISCORD_NOTIFIED_KEY, JSON.stringify(discordNotified));
  // Write to Firebase so other users see it immediately
  if (typeof db !== 'undefined' && db) {
    db.ref(p('discordNotified')).set(discordNotified).catch(function(e) {
      console.warn('discordNotified Firebase write error:', e);
    });
  }
}

function sendDiscordAlert(item, alertType) {
  const tier = alertType === '1day' ? 'day1' : 'day4';
  // Check both local and Firebase-synced dedup
  if (discordNotified[tier][item.id]) return;
  if (_discordNotifiedFb && _discordNotifiedFb[tier] && _discordNotifiedFb[tier][item.id]) return;
  discordNotified[tier][item.id] = true;
  saveDiscordNotified();

  const ms = getRemaining(item);
  const t = msToHMS(ms);
  const expiresIn = (t.d > 0 ? t.d + 'z ' : '') + t.h + 'h ' + t.m + 'm';

  fetch('/api/discord-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: item.id,
      itemName: item.name,
      account: item.account,
      category: item.category,
      alertType: alertType,
      expiresIn: expiresIn,
      webhookUrl: window.teamWebhookSkin || undefined
    })
  }).catch(() => {
    delete discordNotified[tier][item.id];
    saveDiscordNotified();
  });
}

// Urgent hourly Discord alert — deduped per item+hourSlot
function sendDiscordUrgentAlert(item, hourSlot) {
  if (!discordNotified.hourly) discordNotified.hourly = {};
  const key = item.id + '_h' + hourSlot;
  if (discordNotified.hourly[key]) return;
  if (_discordNotifiedFb && _discordNotifiedFb.hourly && _discordNotifiedFb.hourly[key]) return;
  discordNotified.hourly[key] = true;
  saveDiscordNotified();

  const ms = getRemaining(item);
  const t = msToHMS(ms);
  const expiresIn = t.h + 'h ' + t.m + 'm';

  fetch('/api/discord-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemId: item.id,
      itemName: item.name,
      account: item.account,
      category: item.category,
      alertType: 'urgent',
      expiresIn: expiresIn,
      hoursLeft: hourSlot,
      webhookUrl: window.teamWebhookSkin || undefined
    })
  }).catch(() => {
    delete discordNotified.hourly[key];
    saveDiscordNotified();
  });
}

function clearDiscordNotified(itemId) {
  if (!discordNotified) return;
  
  // Clear day1/day4
  if (discordNotified.day1) delete discordNotified.day1[itemId];
  if (discordNotified.day4) delete discordNotified.day4[itemId];
  
  // Clear all hourly slots (1-6)
  if (discordNotified.hourly) {
    for (let h = 1; h <= 6; h++) {
      delete discordNotified.hourly[itemId + '_h' + h];
    }
  }
  
  saveDiscordNotified();

  // ALSO clear the Worker's dedup keys in /discordAlertsSent in Firebase
  if (typeof db !== 'undefined' && db) {
    db.ref(p('discordAlertsSent/' + itemId + '_1day')).remove();
    db.ref(p('discordAlertsSent/' + itemId + '_4day')).remove();
    for (let h = 1; h <= 6; h++) {
      db.ref(p('discordAlertsSent/' + itemId + '_urgent_h' + h)).remove();
    }
  }
}

// ============ ALERT SYSTEM ============
const ALERTS_KEY = 'metin2_alerts_v1';
let confirmedAlerts = { day1: {}, day4: {}, hourly: {} }; // id → true / hourSlot

function loadAlerts() {
  try { confirmedAlerts = JSON.parse(localStorage.getItem(ALERTS_KEY)) || { day1: {}, day4: {}, hourly: {} }; }
  catch { confirmedAlerts = { day1: {}, day4: {}, hourly: {} }; }
  if (!confirmedAlerts.day1) confirmedAlerts.day1 = {};
  if (!confirmedAlerts.day4) confirmedAlerts.day4 = {};
  if (!confirmedAlerts.hourly) confirmedAlerts.hourly = {};
  loadDiscordNotified();
}
function saveAlerts() { localStorage.setItem(ALERTS_KEY, JSON.stringify(confirmedAlerts)); }

let alert1Queue = []; // item ids pending 1-day alert
let alert4Queue = []; // item ids pending 4-day alert
let hourlyAlertQueue = []; // { id, hourSlot } pending urgent hourly alerts
let szCompletedQueue = []; // item ids pending 6/7 completion alert
let secretAlertQueue = []; // item ids pending secret depersonalization alert (admin only)
let alertShowing = false;

// Categories that get urgent hourly alerts (NOT manusa/atac-auto)
const URGENT_ALERT_CATS = ['skin-arma', 'costum', 'frizura', 'insotitor'];

// ============ EXPIRY CORNER REMINDER ============
// Shows a persistent bottom-left chip for every item < 24h, visible on any tab.
// Uses fine-grained DOM updates — never rebuilds chips unnecessarily, no flash.
function updateExpiryCornerReminder() {
  var container = document.getElementById('expiryCornerReminder');
  if (!container) return;

  var missed = (typeof _clGetMissed === 'function') ? _clGetMissed() : [];

  if (typeof items === 'undefined' || !items.length) {
    if (!missed.length) { container.style.display = 'none'; return; }
    container.querySelectorAll('.ecr-chip[data-ecr-id], .ecr-chip.ecr-more').forEach(function(el) { el.remove(); });
    _ecrUpdateMissed(container, missed);
    container.style.display = 'flex';
    return;
  }

  var urgent = items.filter(function(i) {
    var ms = getRemaining(i);
    return ms > 0 && ms < 86400000 && i.category !== 'sase-sapte';
  }).sort(function(a, b) { return getRemaining(a) - getRemaining(b); });

  if (!urgent.length) {
    container.querySelectorAll('.ecr-chip[data-ecr-id], .ecr-chip.ecr-more').forEach(function(el) { el.remove(); });
    if (!missed.length) { container.style.display = 'none'; return; }
    _ecrUpdateMissed(container, missed);
    container.style.display = 'flex';
    return;
  }

  var MAX_SHOW = 3;
  var shown = urgent.slice(0, MAX_SHOW);
  var extraCount = urgent.length - MAX_SHOW;

  // Check if the set of shown IDs matches current chips — if not, rebuild from scratch
  var existingChips = container.querySelectorAll('.ecr-chip[data-ecr-id]');
  var existingIds = Array.prototype.map.call(existingChips, function(el) { return el.dataset.ecrId; });
  var newIds = shown.map(function(i) { return i.id; });
  var structureChanged = existingIds.length !== newIds.length ||
    newIds.some(function(id, idx) { return id !== existingIds[idx]; });

  if (structureChanged) {
    // Full rebuild only when items are added/removed
    var html = shown.map(function(item) {
      var ms = getRemaining(item);
      var t = msToHMS(ms);
      var timeStr = t.h > 0 ? t.h + 'h ' + (t.m < 10 ? '0' : '') + t.m + 'm' : t.m + 'm';
      var isUrgent = ms < 21600000;
      return '<div class="ecr-chip' + (isUrgent ? ' ecr-urgent' : '') + '" data-ecr-id="' + escHtml(item.id) + '">' +
        '<div class="ecr-chip-dot ' + (isUrgent ? 'urgent' : 'warn') + '"></div>' +
        '<div class="ecr-chip-text">' +
          '<span class="ecr-chip-name">' + escHtml(item.name) + '</span>' +
          ' <span class="ecr-chip-time' + (isUrgent ? '' : ' warn') + '">' + timeStr + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    if (extraCount > 0) html += '<div class="ecr-chip ecr-more">+ ' + extraCount + ' mai multe</div>';
    container.innerHTML = html;
  } else {
    // Same items — just update time text and urgency class in-place (no DOM flash)
    shown.forEach(function(item, idx) {
      var chip = existingChips[idx];
      var ms = getRemaining(item);
      var t = msToHMS(ms);
      var timeStr = t.h > 0 ? t.h + 'h ' + (t.m < 10 ? '0' : '') + t.m + 'm' : t.m + 'm';
      var isUrgent = ms < 21600000;

      // Update urgency class on chip
      if (isUrgent) chip.classList.add('ecr-urgent'); else chip.classList.remove('ecr-urgent');
      // Update dot class
      var dot = chip.querySelector('.ecr-chip-dot');
      if (dot) { dot.className = 'ecr-chip-dot ' + (isUrgent ? 'urgent' : 'warn'); }
      // Update time text only (no DOM rebuild)
      var timeEl = chip.querySelector('.ecr-chip-time');
      if (timeEl) {
        if (timeEl.textContent !== timeStr) timeEl.textContent = timeStr;
        timeEl.className = 'ecr-chip-time' + (isUrgent ? '' : ' warn');
      }
    });
    // Update "+X mai multe" chip if present
    var moreChip = container.querySelector('.ecr-more');
    var moreText = extraCount > 0 ? '+ ' + extraCount + ' mai multe' : '';
    if (extraCount > 0 && !moreChip) {
      var el = document.createElement('div');
      el.className = 'ecr-chip ecr-more';
      el.textContent = moreText;
      container.appendChild(el);
    } else if (extraCount === 0 && moreChip) {
      moreChip.remove();
    } else if (moreChip && moreChip.textContent !== moreText) {
      moreChip.textContent = moreText;
    }
  }

  _ecrUpdateMissed(container, missed);
  container.style.display = 'flex';
}

function _ecrUpdateMissed(container, missed) {
  var existing = container.querySelectorAll('.ecr-chip[data-ecr-missed]');
  var existingIds = Array.prototype.map.call(existing, function(el) { return el.dataset.ecrMissed; });
  var newIds = missed.map(function(m) { return m.id; });
  var changed = existingIds.length !== newIds.length ||
    newIds.some(function(id, i) { return id !== existingIds[i]; });
  if (!changed) return;
  existing.forEach(function(el) { el.remove(); });
  missed.forEach(function(m) {
    var chip = document.createElement('div');
    chip.className = 'ecr-chip ecr-missed';
    chip.setAttribute('data-ecr-missed', m.id);
    chip.innerHTML =
      '<div class="ecr-chip-dot urgent"></div>' +
      '<div class="ecr-chip-text">' +
        '<span class="ecr-chip-name">' + escHtml(m.name) + '</span>' +
        ' <span class="ecr-chip-time ecr-missed-label">Reminder ratat</span>' +
      '</div>' +
      '<button class="ecr-chip-dismiss" data-ecr-dismiss="' + m.id + '" title="Inchide">&#x2715;</button>';
    container.appendChild(chip);
  });
}

function checkAlerts() {
  // Secret depersonalization alerts (admin only)
  if (window._isAdmin && typeof secretItems !== 'undefined') {
    secretItems.forEach(item => {
      if (item.depersAt - Date.now() <= 0 && !item.notifiedDeperss) {
        if (!secretAlertQueue.includes(item.id)) secretAlertQueue.push(item.id);
      }
    });
  }

  const hasPersCategories = ['skin-arma','costum','frizura'];
  items.forEach(item => {
    const ms = getRemaining(item);
    const isPers = hasPersCategories.includes(item.category);

    // 6/7 completion alert — queued, shows modal
    if (item.category === 'sase-sapte') {
      if (ms <= 0 && !confirmedAlerts.day1[item.id]) {
        if (!szCompletedQueue.includes(item.id)) szCompletedQueue.push(item.id);
      }
      return; // skip all other alerts for sase-sapte
    }

    // < 6h urgent alerts — fires once per hour slot (6h, 5h, 4h, 3h, 2h, 1h)
    // Only for important categories, NOT manusa/atac-auto
    if (ms > 0 && ms < 21600000 && URGENT_ALERT_CATS.includes(item.category)) {
      const hourSlot = Math.ceil(ms / 3600000); // 1–6
      if (confirmedAlerts.hourly[item.id] !== hourSlot) {
        if (!hourlyAlertQueue.find(function(q) { return q.id === item.id && q.hourSlot === hourSlot; })) {
          hourlyAlertQueue.push({ id: item.id, hourSlot: hourSlot });
        }
      }
    }

    // < 1 day alert (all items except sase-sapte)
    if (ms > 0 && ms < 86400000 && !confirmedAlerts.day1[item.id]) {
      if (!alert1Queue.includes(item.id)) alert1Queue.push(item.id);
    }

    // < 4 days alert (only fully personalized — not in depersonalizing timer, not snoozed, not pending)
    const isActuallyPersonalized = isPers && item.personalized && !(item.depersExpiresAt && item.depersExpiresAt > Date.now());
    const isSnoozed = item.snoozedUntil && item.snoozedUntil > Date.now();
    if (isActuallyPersonalized && !item.pendingDeperss && !isSnoozed && ms > 0 && ms < 345600000 && !confirmedAlerts.day4[item.id]) {
      if (!alert4Queue.includes(item.id)) alert4Queue.push(item.id);
    }
  });

  processAlertQueue();
  updateExpiryCornerReminder();
}

function processAlertQueue() {
  if (alertShowing) return;

  // Secret depersonalization has highest priority (admin only)
  if (secretAlertQueue.length > 0) {
    const id = secretAlertQueue[0];
    const item = typeof secretItems !== 'undefined' ? secretItems.find(i => i.id === id) : null;
    if (!item || item.notifiedDeperss) { secretAlertQueue.shift(); processAlertQueue(); return; }
    showSecretAlert(item);
    return;
  }

  // 6/7 completion has next priority
  if (szCompletedQueue.length > 0) {
    const id = szCompletedQueue[0];
    const item = items.find(i => i.id === id);
    if (!item || confirmedAlerts.day1[id]) { szCompletedQueue.shift(); processAlertQueue(); return; }
    showSzAlert(item);
    return;
  }

  // Hourly urgent queue — highest priority for expiring items
  if (hourlyAlertQueue.length > 0) {
    const entry = hourlyAlertQueue[0];
    const item = items.find(i => i.id === entry.id);
    if (!item || confirmedAlerts.hourly[entry.id] === entry.hourSlot) {
      hourlyAlertQueue.shift(); processAlertQueue(); return;
    }
    showHourlyAlert(item, entry.hourSlot);
    return;
  }

  // 4-day queue
  if (alert4Queue.length > 0) {
    const id = alert4Queue[0];
    const item = items.find(i => i.id === id);
    if (!item || confirmedAlerts.day4[id]) { alert4Queue.shift(); processAlertQueue(); return; }
    show4DayAlert(item);
    return;
  }

  if (alert1Queue.length > 0) {
    const id = alert1Queue[0];
    const item = items.find(i => i.id === id);
    if (!item || confirmedAlerts.day1[id]) { alert1Queue.shift(); processAlertQueue(); return; }
    show1DayAlert(item);
    return;
  }

  // No alerts — stop all sounds
  stopSoundLoop('1');
  stopSoundLoop('4');
}

function showSzAlert(item) {
  alertShowing = true;
  document.getElementById('szAlertBody').innerHTML =
    'Procesul de adaugare a bonusului 6/7 pe itemul <span class="alert-item-name">' + escHtml(item.name) + '</span> de pe contul <span class="alert-item-name">' + escHtml(item.account) + '</span> s-a finalizat.<br><br>Intra in joc si verifica rezultatul.';
  openModal('szAlertModal');
  startSoundLoop('1', playAlert1, 4000);
}

document.getElementById('szAlertOk').addEventListener('click', function() {
  const id = szCompletedQueue.shift();
  if (id) { confirmedAlerts.day1[id] = true; saveAlerts(); }
  stopSoundLoop('1');
  closeModal('szAlertModal');
  alertShowing = false;
  renderCardsIS(); renderStatsIS();
  renderNotifPanel();
  processAlertQueue();
});

function show1DayAlert(item) {
  alertShowing = true;
  sendDiscordAlert(item, '1day');
  document.getElementById('alert1Body').innerHTML =
    `Itemul <span class="alert-item-name">${escHtml(item.name)}</span> de pe contul <span class="alert-item-name">${escHtml(item.account)}</span> expira in mai putin de <strong>24 de ore</strong>!<br><br>Reinnoieste-l cat mai curand.`;
  openModal('alert1Modal');
  startSoundLoop('1', playAlert1, 4000);
}

function show4DayAlert(item) {
  alertShowing = true;
  sendDiscordAlert(item, '4day');
  document.getElementById('alert4Body').innerHTML =
    `Itemul <span class="alert-item-name">${escHtml(item.name)}</span> de pe contul <span class="alert-item-name">${escHtml(item.account)}</span> expira in mai putin de <strong>4 zile</strong>!<br><br>Daca skinul este <strong>personalizat</strong>, depersonalizeaza-l acum pentru a evita pierderea personalizarii.`;
  openModal('alert4Modal');
  startSoundLoop('4', playAlert4, 5000);
}

function showHourlyAlert(item, hourSlot) {
  alertShowing = true;
  sendDiscordUrgentAlert(item, hourSlot);
  const ms = getRemaining(item);
  const t = msToHMS(ms);
  const timeStr = t.h + 'h ' + t.m + 'm ' + t.s + 's';
  document.getElementById('hourlyAlertHours').textContent = hourSlot + 'h';
  document.getElementById('hourlyAlertBody').innerHTML =
    `Itemul <span class="alert-item-name">${escHtml(item.name)}</span> de pe contul <span class="alert-item-name">${escHtml(item.account)}</span> expira in <strong>${timeStr}</strong>!<br><br>Reinnoieste-l imediat.`;
  openModal('hourlyAlertModal');
  startSoundLoop('1', playAlert1, 3000);
}

document.getElementById('hourlyAlertOk').addEventListener('click', () => {
  const entry = hourlyAlertQueue.shift();
  if (entry) { confirmedAlerts.hourly[entry.id] = entry.hourSlot; saveAlerts(); }
  stopSoundLoop('1');
  closeModal('hourlyAlertModal');
  alertShowing = false;
  processAlertQueue();
});

document.getElementById('alert1Ok').addEventListener('click', () => {
  const id = alert1Queue.shift();
  if (id) { confirmedAlerts.day1[id] = true; saveAlerts(); }
  stopSoundLoop('1');
  closeModal('alert1Modal');
  alertShowing = false;
  processAlertQueue();
});

document.getElementById('alert4Ok').addEventListener('click', () => {
  const id = alert4Queue.shift();
  if (id) { confirmedAlerts.day4[id] = true; saveAlerts(); }
  stopSoundLoop('4');
  closeModal('alert4Modal');
  alertShowing = false;
  processAlertQueue();
});

function showSecretAlert(item) {
  alertShowing = true;
  document.getElementById('secretAlertBody').innerHTML =
    'Itemul <span class="alert-item-name">' + escHtml(item.name) + '</span> a finalizat procesul de depersonalizare.<br><br>Intra in joc si verifica rezultatul.';
  openModal('secretAlertModal');
  startSoundLoop('1', playAlert1, 4000);
}

document.getElementById('secretAlertOk').addEventListener('click', function() {
  const id = secretAlertQueue.shift();
  if (id && typeof secretItems !== 'undefined') {
    const item = secretItems.find(i => i.id === id);
    if (item) { item.notifiedDeperss = true; saveSecretItems(); }
  }
  stopSoundLoop('1');
  closeModal('secretAlertModal');
  alertShowing = false;
  if (typeof renderSecretTab === 'function') renderSecretTab();
  processAlertQueue();
});
