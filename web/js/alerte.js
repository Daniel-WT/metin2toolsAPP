// ── ALERTE TAB ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
var ALERTE_KEY = 'metin2_alerte_v1';
var alerteData = [];       // local alarms (this user)
var alerteTicker = null;

function loadAlerte() {
  try { var raw = localStorage.getItem(ALERTE_KEY); alerteData = raw ? JSON.parse(raw) : []; }
  catch(e) { alerteData = []; }
}
function saveAlerte() {
  localStorage.setItem(ALERTE_KEY, JSON.stringify(alerteData));
  if (typeof db !== 'undefined' && db) {
    // Only sync GLOBAL alarms to Firebase; local-only stay in localStorage
    var fbObj = {};
    alerteData.forEach(function(a) {
      if (!a.global) return; // local-only: skip Firebase
      var clean = JSON.parse(JSON.stringify(a));
      delete clean._lastSlot;
      fbObj[a.id] = clean;
    });
    db.ref(p('alerte/items')).set(Object.keys(fbObj).length ? fbObj : null)
      .catch(function(e){ console.warn('alerte save error:', e); });
  }
}

// ── Form state ──────────────────────────────────────────────────────
var alertaRepeat   = 'zilnic';
var alertaWeekDays = [];
var alertaEditId   = null;

function escAl(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

// ── Timezone helpers for global alarms ──────────────────────────────
// Convert local HH:MM → UTC HH:MM
function _localToUTC(hhmm) {
  if (!hhmm) return '';
  var parts = hhmm.split(':');
  var h = parseInt(parts[0] || 0), m = parseInt(parts[1] || 0);
  var d = new Date(); d.setHours(h, m, 0, 0);
  var uh = d.getUTCHours(), um = d.getUTCMinutes();
  return (uh < 10 ? '0' : '') + uh + ':' + (um < 10 ? '0' : '') + um;
}
// Convert UTC HH:MM → local HH:MM
function _utcToLocal(hhmm) {
  if (!hhmm) return '';
  var parts = hhmm.split(':');
  var h = parseInt(parts[0] || 0), m = parseInt(parts[1] || 0);
  var d = new Date(); d.setUTCHours(h, m, 0, 0);
  var lh = d.getHours(), lm = d.getMinutes();
  return (lh < 10 ? '0' : '') + lh + ':' + (lm < 10 ? '0' : '') + lm;
}
// Get the effective local ora for an alarm (handles global UTC conversion)
function _effectiveOra(a) {
  if (a.global && a.oraUTC) return _utcToLocal(a.oraUTC);
  return a.ora || '00:00';
}

function getAlOra() {
  if (alertaRepeat === 'zilnic')     return document.getElementById('alertaOra').value;
  if (alertaRepeat === 'saptamanal') return document.getElementById('alertaOraW').value;
  if (alertaRepeat === 'lunar')      return document.getElementById('alertaOraL').value;
  return '';
}
function setAlOra(val) {
  ['alertaOra','alertaOraW','alertaOraL'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = val||'';
  });
}

function alertaFormOpen(editId) {
  alertaEditId = editId || null;
  var isEdit = !!editId;
  document.getElementById('alertaFormTitle').textContent = isEdit ? 'Editeaza Alerta' : 'Alerta Noua';

  if (isEdit) {
    var a = alerteData.find(function(x){ return x.id === editId; });
    if (!a) return;
    document.getElementById('alertaNume').value  = a.nume  || '';
    document.getElementById('alertaMesaj').value = a.mesaj || '';
    alertaRepeat   = a.repeat || 'zilnic';
    alertaWeekDays = a.weekDays ? a.weekDays.slice() : [];
    // For global alarms with UTC time: show converted local time in the input
    var displayOra = (a.global && a.oraUTC) ? _utcToLocal(a.oraUTC) : (a.ora || '');
    setAlOra(displayOra);
    document.getElementById('alertaZilnicEvery').value  = a.everyN  || 1;
    document.getElementById('alertaWeekEvery').value    = a.everyN  || 1;
    document.getElementById('alertaMonthEvery').value   = a.everyN  || 1;
    document.getElementById('alertaMonthDay').value     = a.monthDay || 1;
    document.getElementById('alertaInfinit').checked    = a.infinit !== false;
    document.getElementById('alertaGlobal').checked     = !!a.global;
  } else {
    document.getElementById('alertaNume').value  = '';
    document.getElementById('alertaMesaj').value = '';
    alertaRepeat   = 'zilnic';
    alertaWeekDays = [];
    setAlOra('');
    document.getElementById('alertaZilnicEvery').value = 1;
    document.getElementById('alertaWeekEvery').value   = 1;
    document.getElementById('alertaMonthEvery').value  = 1;
    document.getElementById('alertaMonthDay').value    = 1;
    document.getElementById('alertaInfinit').checked   = true;
    document.getElementById('alertaGlobal').checked    = false;
  }
  alertaRepeatUIUpdate();
  var form = document.getElementById('alertaForm');
  form.style.display = '';
  form.classList.remove('al-form--open');
  void form.offsetWidth;
  form.classList.add('al-form--open');
  document.getElementById('alertaNume').focus();
}

function alertaFormClose() {
  document.getElementById('alertaForm').style.display = 'none';
  document.getElementById('alertaForm').classList.remove('al-form--open');
  alertaEditId = null;
}

function alertaRepeatUIUpdate() {
  document.querySelectorAll('.alerta-rep-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.rep === alertaRepeat);
  });
  document.getElementById('alertaZilnicRow').style.display  = alertaRepeat === 'zilnic'      ? '' : 'none';
  document.getElementById('alertaWeekRow').style.display    = alertaRepeat === 'saptamanal'  ? '' : 'none';
  document.getElementById('alertaMonthRow').style.display   = alertaRepeat === 'lunar'        ? '' : 'none';
  document.querySelectorAll('.alerta-day-btn').forEach(function(b) {
    b.classList.toggle('active', alertaWeekDays.indexOf(parseInt(b.dataset.day)) !== -1);
  });
}

// ── Render list ──────────────────────────────────────────────────
function renderAlertaList() {
  var container = document.getElementById('alertaList');
  if (!container) return;
  if (alerteData.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:40px 0">Nicio alerta adaugata. Apasa + pentru a crea una.</div>';
    return;
  }
  var repLabels = { zilnic:'Zilnic', saptamanal:'Saptamanal', lunar:'Lunar' };
  var dNames = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
  container.innerHTML = alerteData.map(function(a) {
    var rl = repLabels[a.repeat] || a.repeat;
    var detail = '';
    if (a.repeat === 'zilnic' && a.everyN > 1) detail = ' la fiecare ' + a.everyN + ' zile';
    if (a.repeat === 'saptamanal') {
      detail = (a.everyN > 1 ? ' la fiecare ' + a.everyN + ' saptamani' : '');
      if (a.weekDays && a.weekDays.length) detail += ' — ' + a.weekDays.map(function(d){ return dNames[d]; }).join(', ');
    }
    if (a.repeat === 'lunar') detail = ' ziua ' + (a.monthDay||1) + (a.everyN > 1 ? ', la fiecare ' + a.everyN + ' luni' : '');
    var nextStr = alertaNextStr(a);
    // Show local time for this user (converted from UTC for global alarms)
    var ora = (a.global && a.oraUTC) ? _utcToLocal(a.oraUTC) : (a.ora || '');
    return '<div class="alerta-card" data-id="' + a.id + '">' +
      '<div class="alerta-card-top">' +
        '<div class="alerta-card-info">' +
          '<div class="alerta-card-name">' + escAl(a.nome || a.nume || 'Alerta') + (a.global ? ' <span class="alerta-global-badge">Global</span>' : '') + '</div>' +
          '<div class="alerta-card-meta">' + (ora ? ora + ' &nbsp;&middot;&nbsp; ' : '') + '<span style="color:var(--gold-light)">' + rl + '</span>' + escAl(detail) + '</div>' +
          (a.mesaj ? '<div class="alerta-card-msg">' + escAl(a.mesaj) + '</div>' : '') +
        '</div>' +
        '<div class="alerta-card-actions">' +
          '<span class="alerta-countdown" data-id="' + a.id + '">' + nextStr + '</span>' +
          '<label class="alerta-toggle" title="Activ/Inactiv">' +
            '<input type="checkbox" ' + (a.enabled !== false ? 'checked' : '') + ' data-tid="' + a.id + '">' +
            '<span></span>' +
          '</label>' +
          '<button class="alerta-btn-edit" data-id="' + a.id + '" title="Editeaza"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="alerta-btn-del" data-id="' + a.id + '" title="Sterge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  container.querySelectorAll('.alerta-btn-del[data-id]').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var id = btn.dataset.id;
      alerteData = alerteData.filter(function(a){ return a.id !== id; });
      saveAlerte();
      renderAlertaList(); // re-render immediately for local-only changes
    });
  });
  container.querySelectorAll('.alerta-btn-edit[data-id]').forEach(function(btn) {
    btn.addEventListener('click', function() { alertaFormOpen(btn.dataset.id); });
  });
  container.querySelectorAll('input[data-tid]').forEach(function(chk) {
    chk.addEventListener('change', function() {
      var a = alerteData.find(function(x){ return x.id === chk.dataset.tid; });
      if (a) { a.enabled = chk.checked; a.lastFired = null; saveAlerte(); renderAlertaList(); }
    });
  });
}

// ── Next fire time ──────────────────────────────────────────────────
function alertaNextMs(a) {
  if (a.enabled === false) return null;
  var now = new Date();

  if (a.repeat === 'custom') {
    var totalSec = ((parseInt(a.customH)||0) * 3600 + (parseInt(a.customM)||0) * 60 + (parseInt(a.customS)||0));
    if (totalSec <= 0) return null;
    var intervalMs = totalSec * 1000;
    var base = a.customStart ? new Date(a.customStart) : (a.lastFired ? new Date(a.lastFired) : new Date(now.getTime() - intervalMs));
    if (isNaN(base)) base = new Date(now.getTime() - intervalMs);
    var next = new Date(base.getTime() + intervalMs);
    while (next <= now) next = new Date(next.getTime() + intervalMs);
    return next;
  }

  if (a.global && a.oraUTC) {
    var parts = a.oraUTC.split(':');
    var h = parseInt(parts[0]||0), m = parseInt(parts[1]||0);
    var everyN = Math.max(1, parseInt(a.everyN)||1);
    if (a.repeat === 'zilnic') {
      var c = new Date(now); c.setUTCHours(h, m, 0, 0);
      if (c <= now) {
        if (a.infinit === false) return null;
        c.setUTCDate(c.getUTCDate() + everyN);
      }
      return c;
    }
    if (a.repeat === 'saptamanal') {
      var days = (a.weekDays||[]).map(Number);
      if (!days.length) return null;
      for (var d = 1; d <= 7 * everyN * 2; d++) {
        var c2 = new Date(now); c2.setUTCHours(h, m, 0, 0); c2.setUTCDate(c2.getUTCDate() + d);
        if (days.indexOf(c2.getUTCDay()) !== -1) return c2;
      }
      return null;
    }
    if (a.repeat === 'lunar') {
      var day = parseInt(a.monthDay)||1;
      var c3 = new Date(now); c3.setUTCDate(day); c3.setUTCHours(h, m, 0, 0);
      if (c3 <= now) { c3.setUTCMonth(c3.getUTCMonth() + everyN); c3.setUTCDate(day); }
      return c3;
    }
    return null;
  }

  // Original fallback for local alarms
  var localOra = _effectiveOra(a);
  var parts = localOra.split(':');
  var h = parseInt(parts[0]||0), m = parseInt(parts[1]||0);
  var everyN = Math.max(1, parseInt(a.everyN)||1);

  if (a.repeat === 'zilnic') {
    var c = new Date(now); c.setHours(h, m, 0, 0);
    if (c <= now) {
      if (a.infinit === false) return null; // one-shot already fired
      c.setDate(c.getDate() + everyN);
    }
    return c;
  }

  if (a.repeat === 'saptamanal') {
    var days = (a.weekDays||[]).map(Number);
    if (!days.length) return null;
    for (var d = 1; d <= 7 * everyN * 2; d++) {
      var c2 = new Date(now); c2.setHours(h, m, 0, 0); c2.setDate(c2.getDate() + d);
      if (days.indexOf(c2.getDay()) !== -1) return c2;
    }
    return null;
  }

  if (a.repeat === 'lunar') {
    var day = parseInt(a.monthDay)||1;
    var c3 = new Date(now); c3.setDate(day); c3.setHours(h, m, 0, 0);
    if (c3 <= now) { c3.setMonth(c3.getMonth() + everyN); c3.setDate(day); }
    return c3;
  }
  return null;
}

function alertaNextStr(a) {
  if (a.enabled === false) return '<span style="color:var(--text-muted);font-size:11px">Inactiva</span>';
  var next = alertaNextMs(a);
  if (!next) return '';
  var diff = Math.max(0, Math.floor((next - Date.now()) / 1000));
  if (diff < 60)   return '<span style="color:var(--red);font-size:11px">~' + diff + 's</span>';
  if (diff < 3600) return '<span style="color:var(--orange);font-size:11px">~' + Math.floor(diff/60) + 'min ' + (diff%60) + 's</span>';
  if (diff < 86400)return '<span style="color:var(--text-dim);font-size:11px">~' + Math.floor(diff/3600) + 'h ' + Math.floor((diff%3600)/60) + 'min</span>';
  return '<span style="color:var(--text-muted);font-size:11px">~' + Math.floor(diff/86400) + 'z ' + Math.floor((diff%86400)/3600) + 'h</span>';
}

// ── Ticker ──────────────────────────────────────────────────────────
function startAlerteTicker() {
  if (alerteTicker) return;
  alerteTicker = setInterval(checkAlerte, 5000);
  checkAlerte();
}

// Returns seconds since the last expected fire (positive = past), or null if not applicable
function alertaSecsSinceLastFire(a) {
  var now = new Date();
  var ms  = now.getTime();
  // NATIVE UTC PATH for perfect global synchronization
  if (a.global && a.oraUTC) {
    var parts = a.oraUTC.split(':');
    var h = parseInt(parts[0]||0), m = parseInt(parts[1]||0);
    var everyN = Math.max(1, parseInt(a.everyN)||1);

    if (a.repeat === 'zilnic') {
      var t = new Date(now); t.setUTCHours(h, m, 0, 0);
      return (ms - t.getTime()) / 1000;
    }
    if (a.repeat === 'saptamanal') {
      var days = (a.weekDays||[]).map(Number);
      if (!days.length) return null;
      for (var d = 0; d < 7; d++) {
        var t2 = new Date(now); t2.setUTCHours(h, m, 0, 0); t2.setUTCDate(t2.getUTCDate() - d);
        if (days.indexOf(t2.getUTCDay()) !== -1) return (ms - t2.getTime()) / 1000;
      }
      return null;
    }
    if (a.repeat === 'lunar') {
      var day = parseInt(a.monthDay)||1;
      var t3 = new Date(now); t3.setUTCDate(day); t3.setUTCHours(h, m, 0, 0);
      if (t3.getTime() > ms) { t3.setUTCMonth(t3.getUTCMonth() - 1); t3.setUTCDate(day); }
      return (ms - t3.getTime()) / 1000;
    }
    return null;
  }

  // Original evaluation for local items
  var localOra = _effectiveOra(a);
  var parts = localOra.split(':');
  var h = parseInt(parts[0]||0), m = parseInt(parts[1]||0);
  var everyN = Math.max(1, parseInt(a.everyN)||1);

  if (a.repeat === 'zilnic') {
    var t = new Date(now); t.setHours(h, m, 0, 0);
    return (ms - t.getTime()) / 1000; // positive = alarm time was in the past today
  }

  if (a.repeat === 'saptamanal') {
    var days = (a.weekDays||[]).map(Number);
    if (!days.length) return null;
    for (var d = 0; d < 7; d++) {
      var t2 = new Date(now); t2.setHours(h, m, 0, 0); t2.setDate(t2.getDate() - d);
      if (days.indexOf(t2.getDay()) !== -1) {
        return (ms - t2.getTime()) / 1000;
      }
    }
    return null;
  }

  if (a.repeat === 'lunar') {
    var day = parseInt(a.monthDay)||1;
    var t3 = new Date(now); t3.setDate(day); t3.setHours(h, m, 0, 0);
    if (t3.getTime() > ms) { t3.setMonth(t3.getMonth() - 1); t3.setDate(day); }
    return (ms - t3.getTime()) / 1000;
  }

  return null;
}

// Track fired slots in a separate object that survives Firebase overwrites
var _alerteFiredSlots = {};

function checkAlerte() {
  var now = Date.now();
  var changed = false;
  alerteData.forEach(function(a) {
    if (a.enabled === false) return;
    // Global alarms fire via ping system only, not local ticker
    if (a.global) return;
    var secs = alertaSecsSinceLastFire(a);
    if (secs === null) return;
    // Fire window: alarm time was between 0 and 59 seconds ago
    if (secs >= 0 && secs < 59) {
      // Deduplicate: only fire once per minute-slot
      var slot = Math.floor(now / 60000);
      var slotKey = a.id + '_' + slot;
      if (_alerteFiredSlots[slotKey]) return;
      _alerteFiredSlots[slotKey] = true;
      a.lastFired = new Date().toISOString();
      changed = true;
      fireAlerta(a);
    }
  });
  // Also check global alarms — but only on the CREATOR's browser
  alerteData.forEach(function(a) {
    if (a.enabled === false || !a.global) return;
    // Only the creator fires global alarms (they have it in localStorage as global)
    var secs = alertaSecsSinceLastFire(a);
    if (secs === null) return;
    if (secs >= 0 && secs < 59) {
      var slot = Math.floor(now / 60000);
      var slotKey = a.id + '_global_' + slot;
      if (_alerteFiredSlots[slotKey]) return;
      _alerteFiredSlots[slotKey] = true;
      a.lastFired = new Date().toISOString();
      changed = true;
      fireAlerta(a);
    }
  });
  if (changed) saveAlerte();
  // Clean old slots (keep only last 5 minutes)
  var cutoff = Math.floor(now / 60000) - 5;
  Object.keys(_alerteFiredSlots).forEach(function(k) {
    var parts = k.split('_');
    var slotNum = parseInt(parts[parts.length - 1]);
    if (!isNaN(slotNum) && slotNum < cutoff) delete _alerteFiredSlots[k];
  });
  document.querySelectorAll('.alerta-countdown[data-id]').forEach(function(el) {
    var a = alerteData.find(function(x){ return x.id === el.dataset.id; });
    if (a) el.innerHTML = alertaNextStr(a);
  });
}

function fireAlerta(a) {
  // Dedup: prevent double-fire from both local check and Firebase ping in same minute
  var _fireKey = (a.id || (a.nome + '_' + a.mesaj)) + '_fire_' + Math.floor(Date.now() / 60000);
  if (_alerteFiredSlots[_fireKey]) return;
  _alerteFiredSlots[_fireKey] = true;
  // Resume AudioContext if suspended (browser autoplay policy)
  if (_alarmAudioCtx && _alarmAudioCtx.state === 'suspended') {
    _alarmAudioCtx.resume();
  }
  if (typeof playAlertaSound === 'function') playAlertaSound();
  else playSpawnAlarm('30s');
  showAlertaOverlay(a);
  // If this is a global alarm and we're the creator (it's in our local list),
  // send a ping so all other connected users hear it too
  if (a.global && typeof db !== 'undefined' && db) {
    var ping = {
      id:       a.id,
      nome:     a.nome || a.nume || '',
      mesaj:    a.mesaj || '',
      firedAt:  Date.now(),
      _sender:  window._myClientId
    };
    db.ref(p('alerte/pings')).push(ping).catch(function(e){
      console.warn('ping write error:', e);
    });
  }
}

// Track dismissed alerts to prevent re-showing
var _alertaDismissed = {};

var AUTO_DISMISS_SEC = 30;

function showAlertaOverlay(a) {
  var dismissKey = a.id + '_' + Math.floor(Date.now() / 60000);
  if (_alertaDismissed[dismissKey]) return;
  var existing = document.getElementById('alertaOverlay');
  if (existing) existing.remove();
  if (window._alertaRepeatInterval) { clearInterval(window._alertaRepeatInterval); window._alertaRepeatInterval = null; }
  if (window._alertaAutoDismiss) { clearTimeout(window._alertaAutoDismiss); window._alertaAutoDismiss = null; }
  if (window._alertaProgressInterval) { clearInterval(window._alertaProgressInterval); window._alertaProgressInterval = null; }

  var overlay = document.createElement('div');
  overlay.id = 'alertaOverlay';
  overlay.className = 'spawn-alarm-overlay';
  overlay.innerHTML =
    '<div class="spawn-alarm-box">' +
      '<div class="spawn-alarm-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>' +
      '<div class="spawn-alarm-title">' + escAl(a.nume || a.nome || 'Alerta') + '</div>' +
      (a.mesaj ? '<div class="spawn-alarm-sub">' + escAl(a.mesaj) + '</div>' : '') +
      '<div class="alerta-auto-dismiss-bar"><div class="alerta-auto-dismiss-fill" id="alertaDismissBar"></div></div>' +
      '<div class="alerta-auto-dismiss-label" id="alertaDismissLabel">Se inchide automat in ' + AUTO_DISMISS_SEC + 's</div>' +
      '<button class="spawn-alarm-confirm" id="alertaOverlayOk">OK, am vazut</button>' +
    '</div>';
  document.body.appendChild(overlay);

  var startTs = Date.now();
  var totalMs = AUTO_DISMISS_SEC * 1000;
  window._alertaProgressInterval = setInterval(function() {
    var bar = document.getElementById('alertaDismissBar');
    var lbl = document.getElementById('alertaDismissLabel');
    if (!bar) { clearInterval(window._alertaProgressInterval); return; }
    var elapsed = Date.now() - startTs;
    var remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    bar.style.width = Math.max(0, ((totalMs - elapsed) / totalMs * 100)) + '%';
    if (lbl) lbl.textContent = 'Se inchide automat in ' + remaining + 's';
  }, 200);

  window._alertaRepeatInterval = setInterval(function() {
    if (!document.getElementById('alertaOverlay')) { clearInterval(window._alertaRepeatInterval); window._alertaRepeatInterval = null; return; }
    if (typeof playAlertaSound === 'function') playAlertaSound();
    else if (typeof playSpawnAlarm === 'function') playSpawnAlarm('30s');
  }, 5000);

  window._alertaAutoDismiss = setTimeout(function() {
    clearInterval(window._alertaRepeatInterval); window._alertaRepeatInterval = null;
    clearInterval(window._alertaProgressInterval); window._alertaProgressInterval = null;
    stopSpawnAlarm();
    var o = document.getElementById('alertaOverlay'); if (o) o.remove();
    // Push missed notification
    if (typeof pushNotification === 'function') {
      pushNotification((a.nume || a.nome || 'Alerta') + (a.mesaj ? ': ' + a.mesaj : ''), 'missed');
    }
  }, totalMs);

  var okBtn = overlay.querySelector('#alertaOverlayOk');
  if (okBtn) {
    okBtn.addEventListener('click', function() {
      _alertaDismissed[dismissKey] = true;
      clearInterval(window._alertaRepeatInterval); window._alertaRepeatInterval = null;
      clearInterval(window._alertaProgressInterval); window._alertaProgressInterval = null;
      clearTimeout(window._alertaAutoDismiss); window._alertaAutoDismiss = null;
      stopSpawnAlarm();
      var o = document.getElementById('alertaOverlay'); if (o) o.remove();
    });
  }
}

// ── Save ────────────────────────────────────────────────────────────
document.getElementById('alertaFormSave').addEventListener('click', function() {
  var nume = document.getElementById('alertaNume').value.trim();
  if (!nume) { showToast('Introdu un nume pentru alerta', 'error'); return; }
  var ora = getAlOra();
  if (alertaRepeat !== 'custom' && !ora) { showToast('Seteaza ora de declansare', 'error'); return; }
  var isGlobal = document.getElementById('alertaGlobal').checked;
  var obj = {
    id:          alertaEditId || ('al_' + Date.now()),
    nume:        escAl(nume),
    mesaj:       escAl(document.getElementById('alertaMesaj').value.trim()),
    repeat:      alertaRepeat,
    ora:         ora,
    everyN:      parseInt((document.getElementById(
                   alertaRepeat === 'zilnic'     ? 'alertaZilnicEvery' :
                   alertaRepeat === 'saptamanal' ? 'alertaWeekEvery'   : 'alertaMonthEvery'
                 ) || {value:'1'}).value) || 1,
    weekDays:    alertaWeekDays.slice(),
    monthDay:    parseInt(document.getElementById('alertaMonthDay').value) || 1,

    infinit:     document.getElementById('alertaInfinit').checked,
    global:      isGlobal,
    enabled:     true,
    lastFired:   null
  };
  // Global alarms: store UTC time so all users fire at the same real moment
  if (isGlobal && ora) {
    obj.oraUTC = _localToUTC(ora);
  }
  if (alertaEditId) {
    var idx = alerteData.findIndex(function(x){ return x.id === alertaEditId; });
    if (idx !== -1) { obj.lastFired = alerteData[idx].lastFired; alerteData[idx] = obj; }
  } else {
    alerteData.push(obj);
  }
  saveAlerte();
  alertaFormClose();
  renderAlertaList(); // immediate re-render for local-only
  showToast('Alerta "' + obj.nume + '" salvata', 'success');
});

document.getElementById('btnAddAlerta').addEventListener('click', function() {
  var form = document.getElementById('alertaForm');
  if (form.style.display !== 'none' && form.classList.contains('al-form--open') && !alertaEditId) {
    alertaFormClose();
  } else {
    alertaFormOpen();
  }
});
document.getElementById('alertaFormCancel').addEventListener('click', alertaFormClose);

document.querySelectorAll('.alerta-rep-btn').forEach(function(btn) {
  btn.addEventListener('click', function() { alertaRepeat = btn.dataset.rep; alertaRepeatUIUpdate(); });
});
document.querySelectorAll('.alerta-day-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var d = parseInt(btn.dataset.day);
    var i = alertaWeekDays.indexOf(d);
    if (i === -1) alertaWeekDays.push(d); else alertaWeekDays.splice(i, 1);
    alertaRepeatUIUpdate();
  });
});


// Init
loadAlerte();
renderAlertaList();
startAlerteTicker();


// ══════════════════════════════════════════════════════
// REMINDERE — countdown timers that stay on screen after
// finishing, with a Reset button to restart the interval
// ══════════════════════════════════════════════════════
var REMINDERS_KEY = 'metin2_reminders_v1';
var remindersData = [];
var reminderEditId = null;

function loadReminders() {
  try { var raw = localStorage.getItem(REMINDERS_KEY); remindersData = raw ? JSON.parse(raw) : []; }
  catch(e) { remindersData = []; }
}

function saveReminders() {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(remindersData));
  if (typeof db !== 'undefined' && db) {
    var fbObj = {};
    remindersData.forEach(function(r) {
      if (!r.global) return;
      fbObj[r.id] = r;
    });
    db.ref(p('alerte/reminders')).set(Object.keys(fbObj).length ? fbObj : null)
      .catch(function(e) { console.warn('reminders save error:', e); });
  }
}

function getReminderRemainingMs(r) {
  if (r.paused) return r.pausedRemainingMs || 0;
  var totalMs = ((parseInt(r.durationH) || 0) * 3600 + (parseInt(r.durationM) || 0) * 60) * 1000;
  return totalMs - (Date.now() - (r.startedAt || Date.now()));
}

function pauseReminder(id) {
  var r = remindersData.find(function(x) { return x.id === id; });
  if (!r || r.paused) return;
  r.pausedRemainingMs = Math.max(0, getReminderRemainingMs(r));
  r.paused = true;
  saveReminders();
  renderReminderList();
}

function resumeReminder(id) {
  var r = remindersData.find(function(x) { return x.id === id; });
  if (!r || !r.paused) return;
  var remainingMs = r.pausedRemainingMs || 0;
  var totalMs = ((parseInt(r.durationH) || 0) * 3600 + (parseInt(r.durationM) || 0) * 60) * 1000;
  r.startedAt = Date.now() - (totalMs - remainingMs);
  r.paused = false;
  r.pausedRemainingMs = null;
  saveReminders();
  renderReminderList();
}

function formatReminderCountdown(ms) {
  if (ms <= 0) return null;
  var s = Math.ceil(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
  if (m > 0) return m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
  return sec + 's';
}

function renderReminderList() {
  var container = document.getElementById('reminderList');
  if (!container) return;
  if (!remindersData.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:32px 0">Niciun reminder adaugat. Apasa + pentru a crea unul.</div>';
    return;
  }
  container.innerHTML = remindersData.map(function(r) {
    var ms = getReminderRemainingMs(r);
    var isFinished = ms <= 0;
    var durParts = [];
    if ((r.durationH || 0) > 0) durParts.push(r.durationH + 'h');
    if ((r.durationM || 0) > 0) durParts.push(r.durationM + 'min');
    var durStr = durParts.length ? durParts.join(' ') : '0min';
    var progressPct = 0;
    if (!isFinished && !r.paused) {
      var totalMs2 = ((parseInt(r.durationH) || 0) * 3600 + (parseInt(r.durationM) || 0) * 60) * 1000;
      progressPct = totalMs2 > 0 ? Math.max(0, Math.min(100, (ms / totalMs2) * 100)) : 0;
    }
    return '<div class="reminder-card' + (isFinished ? ' reminder-finished' : '') + (r.paused ? ' reminder-paused' : '') + '" data-rid="' + r.id + '">' +
      '<div class="alerta-card-top">' +
        '<div class="alerta-card-info">' +
          '<div class="reminder-name">' + escAl(r.name) +
            (r.global ? ' <span class="reminder-global-badge">Global</span>' : '') +
            (r.paused ? ' <span class="reminder-paused-badge">Pauza</span>' : '') +
          '</div>' +
          '<div class="alerta-card-meta">Durata: ' + escAl(durStr) + '</div>' +
        '</div>' +
        '<div class="alerta-card-actions">' +
          (isFinished
            ? '<span class="reminder-done-badge">Finalizat</span>'
            : '<span class="reminder-countdown' + (r.paused ? ' reminder-countdown--paused' : '') + '" data-rid="' + r.id + '">' + (formatReminderCountdown(r.paused ? r.pausedRemainingMs : ms) || '') + '</span>'
          ) +
          (!isFinished
            ? (r.paused
              ? '<button class="reminder-btn-pause" data-rid="' + r.id + '" title="Reia countdown-ul"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>'
              : '<button class="reminder-btn-pause" data-rid="' + r.id + '" title="Pune pe pauza"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>'
            ) : ''
          ) +
          '<button class="reminder-btn-reset" data-rid="' + r.id + '" title="Reseteaza countdown-ul">Reset</button>' +
          '<button class="reminder-btn-edit alerta-btn-edit" data-rid="' + r.id + '" title="Editeaza"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="reminder-btn-del alerta-btn-del" data-rid="' + r.id + '" title="Sterge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>' +
        '</div>' +
      '</div>' +
      (!isFinished ? '<div class="reminder-progress-wrap"><div class="reminder-progress-fill" style="width:' + progressPct.toFixed(1) + '%"></div></div>' : '') +
    '</div>';
  }).join('');

  container.querySelectorAll('.reminder-btn-pause[data-rid]').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var r = remindersData.find(function(x) { return x.id === btn.dataset.rid; });
      if (r && r.paused) resumeReminder(btn.dataset.rid);
      else pauseReminder(btn.dataset.rid);
    });
  });
  container.querySelectorAll('.reminder-btn-reset[data-rid]').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      resetReminder(btn.dataset.rid);
    });
  });
  container.querySelectorAll('.reminder-btn-edit[data-rid]').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      reminderFormOpen(btn.dataset.rid);
    });
  });
  container.querySelectorAll('.reminder-btn-del[data-rid]').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      deleteReminder(btn.dataset.rid);
    });
  });
}

// Update only the text of running countdown spans — no DOM rebuild needed
function updateReminderCountdowns() {
  var toFire = [];
  document.querySelectorAll('.reminder-countdown[data-rid]').forEach(function(el) {
    var r = remindersData.find(function(x) { return x.id === el.dataset.rid; });
    if (!r) return;
    var ms = getReminderRemainingMs(r);
    if (ms <= 0) {
      toFire.push(r); // timer just hit 0 while this span was visible — fire alert once
    } else {
      el.textContent = formatReminderCountdown(ms) || '';
    }
  });
  if (toFire.length) {
    toFire.forEach(function(r) { fireReminderAlert(r); });
    renderReminderList();
  }
}

function fireReminderAlert(r) {
  if (typeof _alarmAudioCtx !== 'undefined' && _alarmAudioCtx && _alarmAudioCtx.state === 'suspended') {
    _alarmAudioCtx.resume();
  }
  if (typeof playAlertaSound === 'function') playAlertaSound();
  else if (typeof playSpawnAlarm === 'function') playSpawnAlarm('30s');
  showAlertaOverlay({ id: r.id, nume: r.name, mesaj: 'Reminder finalizat!' });
}

function resetReminder(id) {
  var r = remindersData.find(function(x) { return x.id === id; });
  if (!r) return;
  r.startedAt = Date.now();
  r.paused = false;
  r.pausedRemainingMs = null;
  saveReminders();
  renderReminderList();
}

function deleteReminder(id) {
  var r = remindersData.find(function(x) { return x.id === id; });
  remindersData = remindersData.filter(function(x) { return x.id !== id; });
  saveReminders();
  if (r && r.global && typeof db !== 'undefined' && db) {
    db.ref(p('alerte/reminders/' + id)).remove().catch(function() {});
  }
  renderReminderList();
}

function reminderFormOpen(editId) {
  reminderEditId = editId || null;
  document.getElementById('reminderFormTitle').textContent = editId ? 'Editeaza Reminder' : 'Reminder Nou';
  var remCheck = document.getElementById('reminderRemCheck');
  var remFields = document.getElementById('reminderRemFields');
  if (editId) {
    var r = remindersData.find(function(x) { return x.id === editId; });
    if (!r) return;
    document.getElementById('reminderNume').value     = r.name      || '';
    document.getElementById('reminderH').value        = r.durationH || 0;
    document.getElementById('reminderM').value        = r.durationM || 0;
    document.getElementById('reminderGlobal').checked = !!r.global;
    // Pre-fill remaining time with current remaining
    var remMs = getReminderRemainingMs(r);
    if (remMs > 0) {
      var remSec = Math.ceil(remMs / 1000);
      document.getElementById('reminderRemH').value = Math.floor(remSec / 3600);
      document.getElementById('reminderRemM').value = Math.floor((remSec % 3600) / 60);
      document.getElementById('reminderRemS').value = remSec % 60;
      remCheck.checked = true;
      remFields.style.display = 'flex';
    } else {
      remCheck.checked = false;
      remFields.style.display = 'none';
    }
  } else {
    document.getElementById('reminderNume').value     = '';
    document.getElementById('reminderH').value        = 0;
    document.getElementById('reminderM').value        = 0;
    document.getElementById('reminderGlobal').checked = false;
    remCheck.checked = false;
    remFields.style.display = 'none';
    document.getElementById('reminderRemH').value = 0;
    document.getElementById('reminderRemM').value = 0;
    document.getElementById('reminderRemS').value = 0;
  }
  var rform = document.getElementById('reminderForm');
  rform.style.display = '';
  rform.classList.remove('al-form--open');
  void rform.offsetWidth;
  rform.classList.add('al-form--open');
  document.getElementById('reminderNume').focus();
}

function reminderFormClose() {
  document.getElementById('reminderForm').style.display = 'none';
  document.getElementById('reminderForm').classList.remove('al-form--open');
  reminderEditId = null;
}

document.getElementById('btnAddReminder').addEventListener('click', function() {
  var form = document.getElementById('reminderForm');
  if (form.style.display !== 'none' && form.classList.contains('al-form--open') && !reminderEditId) {
    reminderFormClose();
  } else {
    reminderFormOpen();
  }
});
document.getElementById('reminderFormCancel').addEventListener('click', reminderFormClose);

// Toggle remaining time fields
document.getElementById('reminderRemCheck').addEventListener('change', function() {
  document.getElementById('reminderRemFields').style.display = this.checked ? 'flex' : 'none';
});

document.getElementById('reminderFormSave').addEventListener('click', function() {
  var name = document.getElementById('reminderNume').value.trim();
  if (!name) { showToast('Introdu un nume pentru reminder', 'error'); return; }
  var h = parseInt(document.getElementById('reminderH').value) || 0;
  var m = parseInt(document.getElementById('reminderM').value) || 0;
  if (h <= 0 && m <= 0) { showToast('Seteaza o durata mai mare de 0', 'error'); return; }
  var isGlobal = document.getElementById('reminderGlobal').checked;
  var now = Date.now();
  var totalMs = (h * 3600 + m * 60) * 1000;
  var startedAt = now;
  var useCustomRem = document.getElementById('reminderRemCheck').checked;
  if (useCustomRem) {
    var remH = parseInt(document.getElementById('reminderRemH').value) || 0;
    var remM = parseInt(document.getElementById('reminderRemM').value) || 0;
    var remS = parseInt(document.getElementById('reminderRemS').value) || 0;
    var remainingMs = Math.min((remH * 3600 + remM * 60 + remS) * 1000, totalMs);
    startedAt = now - (totalMs - remainingMs);
  }
  var obj = { id: reminderEditId || ('rm_' + now), name: name, durationH: h, durationM: m, global: isGlobal, startedAt: startedAt };
  if (reminderEditId) {
    var idx = remindersData.findIndex(function(x) { return x.id === reminderEditId; });
    if (idx !== -1) {
      var prev = remindersData[idx];
      if (!useCustomRem && prev.durationH === h && prev.durationM === m) obj.startedAt = prev.startedAt;
      if (prev.paused && !useCustomRem) { obj.paused = prev.paused; obj.pausedRemainingMs = prev.pausedRemainingMs; }
      remindersData[idx] = obj;
    }
  } else {
    remindersData.push(obj);
  }
  saveReminders();
  reminderFormClose();
  renderReminderList();
  showToast('Reminder "' + name + '" salvat', 'success');
});

// 1s ticker for countdown display
setInterval(updateReminderCountdowns, 1000);

loadReminders();
renderReminderList();
