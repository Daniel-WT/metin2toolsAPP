// ── Checklist Tab ────────────────────────────────────────────────────
var checklistsData = null; // populated by Firebase listener in firebase-layer.js
var CL_KEY        = 'm2_checklists';
var CL_MISSED_KEY = 'm2_cl_missed';
var _clCollapsed     = {}; // { id: bool } — session-only
var _clReminderOpen  = {}; // { id: bool } — session-only
var _clReminderTimer = null;
var _clBannerEl      = null;
var _clBannerTimer2  = null;
var _clBannerCl      = null;
var CL_BANNER_MS     = 15000;

function _clGetMissed() {
  try { return JSON.parse(localStorage.getItem(CL_MISSED_KEY)) || []; } catch(e) { return []; }
}
function _clSaveMissed(arr) {
  try { localStorage.setItem(CL_MISSED_KEY, JSON.stringify(arr)); } catch(e) {}
}
function _clAddMissed(cl) {
  var arr = _clGetMissed();
  // Freshen if already exists, otherwise add
  var found = false;
  arr = arr.map(function(m) {
    if (m.clId === cl.id) { found = true; return { id: m.id, clId: cl.id, name: cl.name, ts: Date.now() }; }
    return m;
  });
  if (!found) arr.push({ id: _clId(), clId: cl.id, name: cl.name, ts: Date.now() });
  _clSaveMissed(arr);
}
function _clDismissMissed(missedId) {
  _clSaveMissed(_clGetMissed().filter(function(m) { return m.id !== missedId; }));
  if (typeof updateExpiryCornerReminder === 'function') updateExpiryCornerReminder();
}

var _CL_WEEKDAYS = ['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata'];

function _clId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function _clLoad() {
  if (typeof checklistsData !== 'undefined' && checklistsData !== null) return checklistsData;
  try { return JSON.parse(localStorage.getItem(CL_KEY)) || []; } catch(e) { return []; }
}
function _clSave(data) {
  // Update in-memory store immediately so all reads see the new data right away
  if (typeof checklistsData !== 'undefined') checklistsData = data;
  try { localStorage.setItem(CL_KEY, JSON.stringify(data)); } catch(e) {}
  // Push to Firebase (debounced) so all connected users see the change
  if (typeof db !== 'undefined' && db && typeof fbDebounce === 'function') {
    fbDebounce('checklists', function() {
      db.ref(p('checklists/data')).set(JSON.stringify(data)).catch(function(e) {
        console.warn('[CL] Firebase save err:', e);
      });
    }, 800);
  }
}
function _escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render ────────────────────────────────────────────────────────────
function renderChecklists() {
  var list = document.getElementById('clList');
  if (!list) return;
  var data = _clLoad();

  if (data.length === 0) {
    list.innerHTML = '<div class="cl-empty">Niciun checklist. Apasa "+ Checklist nou" pentru a incepe.</div>';
    return;
  }

  list.innerHTML = data.map(function(cl) {
    var total     = cl.tasks.length;
    var done      = cl.tasks.filter(function(t) { return t.done; }).length;
    var allDone   = total > 0 && done === total;
    var collapsed = !!_clCollapsed[cl.id];
    var rpOpen    = !!_clReminderOpen[cl.id];
    var r         = cl.reminder || { type: 'none' };
    var hasRemind = r.type && r.type !== 'none';

    var chevron = '<svg class="cl-chevron' + (collapsed ? ' cl-chevron--up' : '') + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 6 12 10"/></svg>';
    var bell = '<svg class="cl-bell-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a4 4 0 0 1 4 4c0 3 1 4 1 4H3s1-1 1-4a4 4 0 0 1 4-4z"/><path d="M9.7 13a2 2 0 0 1-3.4 0"/></svg>';

    // Reminder panel HTML
    var rpHtml = _clReminderPanelHtml(cl.id, r, rpOpen);

    return (
      '<div class="cl-card' + (allDone ? ' cl-card--done' : '') + '" data-clid="' + cl.id + '">' +
        '<div class="cl-card-header">' +
          '<button class="cl-collapse-btn" data-action="collapse" data-clid="' + cl.id + '" title="' + (collapsed ? 'Extinde' : 'Restrânge') + '">' + chevron + '</button>' +
          '<span class="cl-card-name" contenteditable="true" data-clid="' + cl.id + '" spellcheck="false">' + _escHtml(cl.name) + '</span>' +
          '<div class="cl-card-actions">' +
            (total > 0 ? '<span class="cl-progress' + (allDone ? ' cl-progress--done' : '') + '">' + done + ' / ' + total + '</span>' : '') +
            '<button class="cl-bell-btn' + (hasRemind ? ' cl-bell-btn--active' : '') + '" data-action="bell" data-clid="' + cl.id + '" title="Reminder">' + bell + '</button>' +
            '<button class="cl-btn cl-btn-reset" data-action="reset" data-clid="' + cl.id + '">Reset</button>' +
            '<button class="cl-btn cl-btn-del"   data-action="delcl" data-clid="' + cl.id + '">&times;</button>' +
          '</div>' +
        '</div>' +
        rpHtml +
        '<div class="cl-card-body' + (collapsed ? ' cl-card-body--collapsed' : '') + '">' +
          '<div class="cl-tasks">' +
            (total === 0
              ? '<div class="cl-no-tasks">Niciun task — adauga cu butonul de mai jos</div>'
              : cl.tasks.map(function(t) {
                  return (
                    '<div class="cl-task' + (t.done ? ' cl-task--done' : '') + '" data-tid="' + t.id + '">' +
                      '<label class="cl-task-label">' +
                        '<span class="cl-checkbox' + (t.done ? ' checked' : '') + '" data-action="toggle" data-clid="' + cl.id + '" data-tid="' + t.id + '"></span>' +
                        '<span class="cl-task-name" contenteditable="true" data-action="renametask" data-clid="' + cl.id + '" data-tid="' + t.id + '" spellcheck="false">' + _escHtml(t.name) + '</span>' +
                      '</label>' +
                      '<button class="cl-task-del" data-action="deltask" data-clid="' + cl.id + '" data-tid="' + t.id + '">&times;</button>' +
                    '</div>'
                  );
                }).join('')
            ) +
          '</div>' +
          '<button class="cl-add-task" data-action="addtask" data-clid="' + cl.id + '">+ Task</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function _clReminderPanelHtml(clId, r, open) {
  var type      = r.type || 'none';
  var time      = r.time || '09:00';
  var weekday   = r.weekday !== undefined ? r.weekday : 1;
  var monthDay  = r.monthDay || 1;
  var showTime  = type !== 'none';
  var showWeek  = type === 'weekly';
  var showMonth = type === 'monthly';

  var typeBtns = ['none','daily','weekly','monthly'].map(function(t) {
    var labels = { none:'Niciodata', daily:'Zilnic', weekly:'Saptamanal', monthly:'Lunar' };
    return '<button class="cl-rp-type' + (type === t ? ' active' : '') + '" data-action="rtype" data-clid="' + clId + '" data-rtype="' + t + '">' + labels[t] + '</button>';
  }).join('');

  var weekdayOpts = _CL_WEEKDAYS.map(function(d, i) {
    return '<option value="' + i + '"' + (weekday == i ? ' selected' : '') + '>' + d + '</option>';
  }).join('');

  return (
    '<div class="cl-rp' + (open ? ' cl-rp--open' : '') + '" data-clid="' + clId + '">' +
      '<div class="cl-rp-inner">' +
        '<div class="cl-rp-row">' +
          '<span class="cl-rp-label">Repetare</span>' +
          '<div class="cl-rp-types">' + typeBtns + '</div>' +
        '</div>' +
        '<div class="cl-rp-row cl-rp-time-row' + (!showTime ? ' cl-rp-row--hidden' : '') + '">' +
          '<span class="cl-rp-label">Ora</span>' +
          '<input type="time" class="cl-rp-time" value="' + time + '" data-clid="' + clId + '">' +
        '</div>' +
        '<div class="cl-rp-row cl-rp-weekday-row' + (!showWeek ? ' cl-rp-row--hidden' : '') + '">' +
          '<span class="cl-rp-label">Ziua</span>' +
          '<select class="cl-rp-select cl-rp-weekday" data-clid="' + clId + '">' + weekdayOpts + '</select>' +
        '</div>' +
        '<div class="cl-rp-row cl-rp-monthday-row' + (!showMonth ? ' cl-rp-row--hidden' : '') + '">' +
          '<span class="cl-rp-label">Ziua lunii</span>' +
          '<input type="number" class="cl-rp-monthday" min="1" max="31" value="' + monthDay + '" data-clid="' + clId + '">' +
        '</div>' +
        '<div class="cl-rp-footer">' +
          '<button class="cl-rp-save" data-action="savereminder" data-clid="' + clId + '">Salveaza</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

// ── Animation helpers ─────────────────────────────────────────────────
function _clAnimateIn(el) {
  if (!el) return;
  el.classList.add('cl-anim-in');
  el.addEventListener('animationend', function() { el.classList.remove('cl-anim-in'); }, { once: true });
}
function _clAnimateOut(el, cb) {
  if (!el) { cb(); return; }
  el.classList.add('cl-anim-out');
  el.addEventListener('animationend', cb, { once: true });
}
function _clAnimateReset(clId) {
  var tasks = document.querySelectorAll('#clList .cl-card[data-clid="' + clId + '"] .cl-task');
  tasks.forEach(function(el, i) {
    setTimeout(function() {
      el.classList.add('cl-anim-reset');
      el.addEventListener('animationend', function() { el.classList.remove('cl-anim-reset'); }, { once: true });
    }, i * 35);
  });
}
function _clAnimateCheck(el) {
  if (!el) return;
  el.classList.add('cl-anim-check');
  el.addEventListener('animationend', function() { el.classList.remove('cl-anim-check'); }, { once: true });
}

// ── Reminder system ───────────────────────────────────────────────────
function _clReminderKey(r, d) {
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (r.type === 'daily')   return y + '-' + (m<10?'0':'')+m + '-' + (day<10?'0':'')+day;
  if (r.type === 'weekly')  { var wk = Math.ceil(((d - new Date(y,0,1))/86400000 + new Date(y,0,1).getDay()+1)/7); return y+'-W'+wk; }
  if (r.type === 'monthly') return y + '-' + (m<10?'0':'')+m;
  return '';
}

function _clShouldFire(r, now) {
  if (!r || !r.type || r.type === 'none' || !r.time) return false;
  var parts = r.time.split(':');
  if (now.getHours() !== Number(parts[0]) || now.getMinutes() !== Number(parts[1])) return false;
  if (r.type === 'weekly'  && now.getDay()  !== Number(r.weekday))  return false;
  if (r.type === 'monthly' && now.getDate() !== Number(r.monthDay)) return false;
  return _clReminderKey(r, now) !== r.lastFiredKey;
}

function _clFireReminder(cl) {
  // On-site banner (always)
  _clShowBanner(cl);
  // Browser notification in background (if permitted)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(cl.name, { body: 'Reminder checklist', tag: 'cl-' + cl.id }); } catch(e) {}
  }
}

function _clShowBanner(cl) {
  // If a banner is already showing, clean it up silently (no missed for the previous one)
  if (_clBannerEl) {
    if (_clBannerTimer2) { clearInterval(_clBannerTimer2); _clBannerTimer2 = null; }
    var old = _clBannerEl;
    _clBannerEl = null;
    if (old.parentNode) old.parentNode.removeChild(old);
  }

  _clBannerCl = cl;

  if (typeof playReminderChime === 'function') playReminderChime();

  var el = document.createElement('div');
  el.className = 'cl-reminder-banner';
  el.innerHTML =
    '<div class="cl-rb-body">' +
      '<div class="cl-rb-content">' +
        '<div class="cl-rb-label">Reminder</div>' +
        '<div class="cl-rb-name">' + _escHtml(cl.name) + '</div>' +
      '</div>' +
      '<button class="cl-rb-ok">OK</button>' +
    '</div>' +
    '<div class="cl-rb-progress"><div class="cl-rb-bar"></div></div>';

  document.body.appendChild(el);
  _clBannerEl = el;

  // Animate in (double rAF so transition fires)
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('cl-rb--visible'); });
  });

  // Countdown progress bar
  var start = Date.now();
  _clBannerTimer2 = setInterval(function() {
    var elapsed = Date.now() - start;
    var bar = _clBannerEl && _clBannerEl.querySelector('.cl-rb-bar');
    if (bar) bar.style.width = Math.max(0, 100 - (elapsed / CL_BANNER_MS * 100)) + '%';

    if (elapsed >= CL_BANNER_MS) {
      clearInterval(_clBannerTimer2);
      _clBannerTimer2 = null;
      var missed = _clBannerCl;
      _clHideBanner();
      if (missed) {
        if (typeof pushNotification === 'function') pushNotification('Reminder ratat: ' + missed.name, 'missed');
        _clAddMissed(missed);
        if (typeof updateExpiryCornerReminder === 'function') updateExpiryCornerReminder();
      }
    }
  }, 80);

  // OK — dismiss without missed
  el.querySelector('.cl-rb-ok').addEventListener('click', function() {
    if (_clBannerTimer2) { clearInterval(_clBannerTimer2); _clBannerTimer2 = null; }
    _clBannerCl = null;
    _clHideBanner();
  });
}

function _clHideBanner() {
  if (!_clBannerEl) return;
  var el = _clBannerEl;
  _clBannerEl = null;
  el.classList.remove('cl-rb--visible');
  el.classList.add('cl-rb--out');
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
}

function _clCheckReminders() {
  var data    = _clLoad();
  
  // To ensure global checklists fire at the exact same moment for all users
  // regardless of their PC timezone, evaluate the time against Romanian Server Time.
  var d = typeof getSyncedNow === 'function' ? getSyncedNow() : new Date();
  var roStr = d.toLocaleString("en-US", {timeZone: "Europe/Bucharest"});
  var now = new Date(roStr);

  var changed = false;
  data.forEach(function(cl) {
    if (_clShouldFire(cl.reminder, now)) {
      // Reset all tasks before firing the reminder
      if (cl.tasks) cl.tasks.forEach(function(t) { t.done = false; });
      _clFireReminder(cl);
      if (!cl.reminder) cl.reminder = {};
      cl.reminder.lastFiredKey = _clReminderKey(cl.reminder, now);
      changed = true;
    }
  });
  if (changed) {
    _clSave(data);
    // Re-render if checklist tab is visible
    if (typeof renderChecklists === 'function' && document.getElementById('clList')) {
      renderChecklists();
    }
  }
}

function _clStartReminderChecker() {
  if (_clReminderTimer) return;
  _clCheckReminders();
  _clReminderTimer = setInterval(_clCheckReminders, 30000);
}

// ── Event wiring ──────────────────────────────────────────────────────
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    _clStartReminderChecker();

    var newBtn = document.getElementById('btnNewChecklist');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        var data  = _clLoad();
        var newId = _clId();
        data.push({ id: newId, name: 'Checklist nou', tasks: [] });
        _clSave(data);
        renderChecklists();
        var card   = document.querySelector('#clList .cl-card[data-clid="' + newId + '"]');
        _clAnimateIn(card);
        var nameEl = card && card.querySelector('.cl-card-name');
        if (nameEl) { nameEl.focus(); document.execCommand('selectAll', false, null); }
      });
    }

    var list = document.getElementById('clList');
    if (!list) return;

    // ── Click delegation ──
    list.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      if (e.target.classList.contains('cl-card-name') || e.target.dataset.action === 'renametask') return;

      var act  = target.dataset.action;
      var clId = target.dataset.clid;
      var tId  = target.dataset.tid;
      var data = _clLoad();

      // ── Collapse ──
      if (act === 'collapse') {
        _clCollapsed[clId] = !_clCollapsed[clId];
        var body = list.querySelector('.cl-card[data-clid="' + clId + '"] .cl-card-body');
        var chev = list.querySelector('.cl-card[data-clid="' + clId + '"] .cl-chevron');
        if (body) body.classList.toggle('cl-card-body--collapsed', !!_clCollapsed[clId]);
        if (chev) chev.classList.toggle('cl-chevron--up', !!_clCollapsed[clId]);
        target.title = _clCollapsed[clId] ? 'Extinde' : 'Restrânge';
        return;
      }

      // ── Bell: toggle reminder panel ──
      if (act === 'bell') {
        _clReminderOpen[clId] = !_clReminderOpen[clId];
        var rp = list.querySelector('.cl-rp[data-clid="' + clId + '"]');
        if (rp) rp.classList.toggle('cl-rp--open', !!_clReminderOpen[clId]);
        return;
      }

      // ── Reminder type pill ──
      if (act === 'rtype') {
        var rtype = target.dataset.rtype;
        var rp    = list.querySelector('.cl-rp[data-clid="' + clId + '"]');
        if (!rp) return;
        // Update active pill
        rp.querySelectorAll('.cl-rp-type').forEach(function(b) {
          b.classList.toggle('active', b.dataset.rtype === rtype);
        });
        // Show/hide conditional rows
        rp.querySelector('.cl-rp-time-row').classList.toggle('cl-rp-row--hidden', rtype === 'none');
        rp.querySelector('.cl-rp-weekday-row').classList.toggle('cl-rp-row--hidden', rtype !== 'weekly');
        rp.querySelector('.cl-rp-monthday-row').classList.toggle('cl-rp-row--hidden', rtype !== 'monthly');
        return;
      }

      // ── Save reminder ──
      if (act === 'savereminder') {
        var rp   = list.querySelector('.cl-rp[data-clid="' + clId + '"]');
        if (!rp) return;
        var rtype    = (rp.querySelector('.cl-rp-type.active') || {}).dataset && rp.querySelector('.cl-rp-type.active').dataset.rtype || 'none';
        var timeVal  = (rp.querySelector('.cl-rp-time') || {}).value || '09:00';
        var weekday  = (rp.querySelector('.cl-rp-weekday') || {}).value || 1;
        var monthDay = (rp.querySelector('.cl-rp-monthday') || {}).value || 1;

        var cl = data.find(function(c) { return c.id === clId; });
        if (!cl) return;
        var prev = (cl.reminder || {}).lastFiredKey;
        cl.reminder = { type: rtype, time: timeVal, weekday: Number(weekday), monthDay: Number(monthDay), lastFiredKey: prev || null };
        _clSave(data);

        // Request notification permission if needed
        if (rtype !== 'none' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission();
        }

        // Close panel + update bell state
        _clReminderOpen[clId] = false;
        renderChecklists();
        return;
      }

      // ── Toggle task ──
      if (act === 'toggle') {
        var cl = data.find(function(c) { return c.id === clId; });
        if (!cl) return;
        var task = cl.tasks.find(function(t) { return t.id === tId; });
        if (task) task.done = !task.done;
        _clSave(data);
        var taskEl = list.querySelector('.cl-task[data-tid="' + tId + '"]');
        _clAnimateCheck(taskEl && taskEl.querySelector('.cl-checkbox'));
        setTimeout(function() { renderChecklists(); }, 180);
        return;
      }

      // ── Reset ──
      if (act === 'reset') {
        var cl = data.find(function(c) { return c.id === clId; });
        if (!cl) return;
        _clAnimateReset(clId);
        setTimeout(function() {
          cl.tasks.forEach(function(t) { t.done = false; });
          _clSave(data); renderChecklists();
        }, cl.tasks.length * 35 + 200);
        return;
      }

      // ── Delete checklist ──
      if (act === 'delcl') {
        var card = list.querySelector('.cl-card[data-clid="' + clId + '"]');
        _clAnimateOut(card, function() {
          delete _clCollapsed[clId];
          delete _clReminderOpen[clId];
          _clSave(data.filter(function(c) { return c.id !== clId; }));
          renderChecklists();
        });
        return;
      }

      // ── Add task ──
      if (act === 'addtask') {
        var cl = data.find(function(c) { return c.id === clId; });
        if (!cl) return;
        var newTid = _clId();
        cl.tasks.push({ id: newTid, name: 'Task nou', done: false });
        _clSave(data); renderChecklists();
        var taskEl     = list.querySelector('.cl-task[data-tid="' + newTid + '"]');
        var taskNameEl = taskEl && taskEl.querySelector('.cl-task-name');
        _clAnimateIn(taskEl);
        if (taskNameEl) { taskNameEl.focus(); document.execCommand('selectAll', false, null); }
        return;
      }

      // ── Delete task ──
      if (act === 'deltask') {
        var cl     = data.find(function(c) { return c.id === clId; });
        var taskEl = list.querySelector('.cl-task[data-tid="' + tId + '"]');
        _clAnimateOut(taskEl, function() {
          if (cl) {
            cl.tasks = cl.tasks.filter(function(t) { return t.id !== tId; });
            _clSave(data); renderChecklists();
          }
        });
        return;
      }
    });

    // ── Rename on blur ──
    list.addEventListener('blur', function(e) {
      var el = e.target, clId = el.dataset.clid;
      if (!clId) return;
      var data = _clLoad();
      var val  = el.textContent.trim() || (el.classList.contains('cl-card-name') ? 'Checklist' : 'Task');
      if (el.classList.contains('cl-card-name')) {
        var cl = data.find(function(c) { return c.id === clId; });
        if (cl && cl.name !== val) { cl.name = val; _clSave(data); }
      } else if (el.dataset.action === 'renametask') {
        var tId = el.dataset.tid;
        var cl  = data.find(function(c) { return c.id === clId; });
        if (cl) {
          var task = cl.tasks.find(function(t) { return t.id === tId; });
          if (task && task.name !== val) { task.name = val; _clSave(data); }
        }
      }
    }, true);

    // ── Enter confirms edit ──
    list.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      if (e.target.classList.contains('cl-card-name') || e.target.dataset.action === 'renametask') {
        e.preventDefault(); e.target.blur();
      }
    });

    // ── Dismiss missed reminder chips from corner panel ──
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-ecr-dismiss]');
      if (!btn) return;
      e.stopPropagation();
      _clDismissMissed(btn.dataset.ecrDismiss);
    });
  });
})();
