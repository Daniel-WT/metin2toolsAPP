// ============ SPAWN TAB v3 ============
const SPAWN_KEY = 'metin2_spawn_v3';
let spawnData = null;
var _pinColors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e84393','#00cec9','#fdcb6e'];

// ── Synced clock: fetch server time once, compute offset for MM:SS accuracy ──
var _clockOffsetMs = 0; // offset = serverTime - localTime (in ms)
var _clockSynced = false;
function getSyncedNow() {
  var d = new Date(Date.now() + _clockOffsetMs);
  return d;
}
function syncClock() {
  // Take 3 samples from /api/time, use the one with minimum RTT (NTP-style best-sample).
  // Minimum RTT = least network jitter = most accurate offset estimate.
  var SAMPLES = 3;
  var results = [];
  var completed = 0;

  function onSample(err, serverMs, before) {
    if (!err && serverMs) {
      var after = Date.now();
      var rtt = after - before;
      results.push({ rtt: rtt, offset: (serverMs + rtt / 2) - after });
    }
    completed++;
    if (completed === SAMPLES) {
      if (results.length === 0) {
        // All samples failed — try HEAD fallback once
        var fb = Date.now();
        fetch('/', { method: 'HEAD', cache: 'no-store' })
          .then(function(r) {
            var dateStr = r.headers.get('Date');
            if (!dateStr) return;
            var fa = Date.now();
            _clockOffsetMs = (new Date(dateStr).getTime() + (fa - fb) / 2) - fa;
            _clockSynced = true;
          })
          .catch(function() {});
        return;
      }
      // Pick sample with smallest RTT for best accuracy
      results.sort(function(a, b) { return a.rtt - b.rtt; });
      _clockOffsetMs = results[0].offset;
      _clockSynced = true;
    }
  }

  for (var i = 0; i < SAMPLES; i++) {
    (function() {
      var before = Date.now();
      fetch('/api/time', { cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(d) { onSample(null, d.utc, before); })
        .catch(function(e) { onSample(e); });
    })();
  }
}
syncClock();
setInterval(syncClock, 1800000); // re-sync every 30 minutes to prevent drift
let popoverRoomId = null;
let popoverSelectedType = null;
let popoverSelectedCH = null;
let spawnTimerInterval = null;

// ── Pin mode: place a pin on the map for a specific CH ──
var _pinModeCH = null; // which CH is in pin-placement mode (1-6 or null)

// Cross-window DOM helper: find element by ID in main doc or any pop-out window
function _findEl(id) {
  var el = document.getElementById(id);
  if (el) return el;
  // Search in pop-out windows
  if (typeof _popoutActive !== 'undefined') {
    for (var k in _popoutActive) {
      if (_popoutActive[k] && _popoutActive[k].popWin && !_popoutActive[k].popWin.closed) {
        try { el = _popoutActive[k].popWin.document.getElementById(id); } catch(e) {}
        if (el) return el;
      }
    }
  }
  return null;
}

const SPAWN_ROOMS = [
  // [id, label, x%, y%, isBoss] — exact positions from calibrated map divs
  ['1', '1',   15.5, 13.5, false],
  ['2', '2',   26,   13.5, true ],
  ['3', '3',   54.5,  6.5, false],
  ['4', '4',   79.5,  6.5, true ],
  ['5', '5',   65,   15.5, false],
  ['6', '6',   96.5,  6.5, false],
  ['7', '7',   86,   15.5, true ],
  ['8', '8',   96.7, 34,   true ],
  ['9', '9',   96.5, 63,   true ],
  ['10','10',  96.7, 88,   true ],
  ['11','11',  79.5, 63,   true ],
  ['12','12',  79.5, 43.5, true ],
  ['13','13',  88,   56,   true ],
  ['14','14',  68.7, 23,   false],
  ['15','15',  73,   54.5, true ],
  ['16','16',  58.5, 87.5, true ],
  ['17','17',  50.5, 87.5, true ],
  ['18','18',  23.5, 87.5, true ],
  ['19','19',   4,   87.5, false],
  ['20','20',  12.7, 57.3, true ],
  ['21','21',  12.7, 67,   true ],
  ['22','22',  12.7, 77.6, true ],
  ['23','23',  30,   67,   false],
  ['24','24',  30,   77.7, true ],
  ['25','25',  27,   27,   false],
  ['26','26',  36,   20,   true ],
  ['27','27',  46.5, 56.3, false],
  ['28','28',  58,   44.5, false],
  ['29','29',  66.8, 78.5, false],
  ['F', 'F',   41.6, 48.5, true ],
];

const BOSS_ROOM_IDS = SPAWN_ROOMS.filter(function(r){return r[4];}).map(function(r){return r[0];});

function defaultSpawnData() {
  var d = { rooms: {}, gheata: {}, fulger: {}, chTimes: {}, pins: {}, spawnType: 'simplu', evenHourType: 'simplu', chBeaten: {} };
  for (var i = 1; i <= 6; i++) {
    d.gheata['ch'+i] = { genFals: '', gf18: false, gfF: false };
    d.fulger['ch'+i] = { spate: '', camera: '' };
    d.chTimes['ch'+i] = '';
  }
  return d;
}

function migrateSpawnData(data) {
  if (data && data.rooms) {
    Object.keys(data.rooms).forEach(function(id) {
      var r = data.rooms[id];
      if (r && !Array.isArray(r)) {
        data.rooms[id] = (r.type && r.ch) ? [{type: r.type, ch: r.ch, dead: false}] : [];
      }
    });
  }
  return data;
}

function loadSpawn() {
  // If Firebase has already synced data, skip localStorage load — preserves real-time state
  if (!window._fbSpawnLoaded) {
    try {
      var raw = localStorage.getItem(SPAWN_KEY);
      if (!raw) raw = localStorage.getItem('metin2_spawn_v2');
      spawnData = raw ? migrateSpawnData(JSON.parse(raw)) : defaultSpawnData();
    } catch(e) { spawnData = defaultSpawnData(); }
  }
  if (!spawnData) spawnData = defaultSpawnData();
  if (!spawnData.rooms)  spawnData.rooms  = {};
  if (!spawnData.gheata) spawnData.gheata = {};
  if (!spawnData.fulger) spawnData.fulger = {};
  if (!spawnData.chTimes) spawnData.chTimes = {};
  if (!spawnData.pins) spawnData.pins = {};
  for (var i = 1; i <= 6; i++) {
    if (!spawnData.gheata['ch'+i]) spawnData.gheata['ch'+i] = { genFals: '', gf18: false, gfF: false };
    if (spawnData.gheata['ch'+i].gf18 === undefined) spawnData.gheata['ch'+i].gf18 = false;
    if (spawnData.gheata['ch'+i].gfF === undefined) spawnData.gheata['ch'+i].gfF = false;
    if (!spawnData.fulger['ch'+i]) spawnData.fulger['ch'+i] = { spate: '', camera: '' };
    if (spawnData.chTimes['ch'+i] === undefined) spawnData.chTimes['ch'+i] = '';
  }
  Object.keys(spawnData.rooms).forEach(function(id) {
    if (!Array.isArray(spawnData.rooms[id])) {
      var r = spawnData.rooms[id];
      spawnData.rooms[id] = (r && r.type && r.ch) ? [{type:r.type, ch:r.ch, dead:false}] : [];
    }
  });
  if (!spawnData.spawnType) spawnData.spawnType = 'simplu';
  if (!spawnData.evenHourType) spawnData.evenHourType = 'simplu';
  // syncSpawnType(true); // Removed auto-sync on load to prevent conflicts
  var pop = document.getElementById('spawnPopover');
  if (pop && pop.parentElement !== document.body) document.body.appendChild(pop);
  buildMapDots();
  renderSpawnTables();
  initSpawnTimer();
  window._lastHourChecked = getSyncedNow().getUTCHours();
  updateSpawnTypeUI();
  updateUserBtn();
}

function updateUserBtn() {
  var dot = document.getElementById('profileDot');
  var btn = document.getElementById('m2UserBtn');
  var nameEl = document.getElementById('profileName');
  if (!dot || !btn) return;
  var name = getM2UserName();
  var color = getM2UserColor();
  if (name) {
    dot.style.background = color;
    dot.textContent = name.charAt(0).toUpperCase();
    btn.title = name;
    if (nameEl) nameEl.textContent = name;
  } else {
    dot.style.background = 'var(--text-muted)';
    dot.textContent = '?';
    btn.title = 'Seteaza nume';
    if (nameEl) nameEl.textContent = '';
  }
}

var _lastSpawnHash = '';
var _prevFbSnapshot = null; // previous Firebase-written snapshot for diffing

function _sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(_sanitize);
  if (typeof obj === 'object') {
    var out = {};
    Object.keys(obj).forEach(function(k) { out[k] = _sanitize(obj[k]); });
    return out;
  }
  return obj;
}

// Convert rooms-based structure → flat per-CH entries
// { '3': [{ch:1,type:'sef',dead:false}], '5': [{ch:2,type:'gen',dead:true}] }
// → { '1': {room:'3',type:'sef',dead:false}, '2': {room:'5',type:'gen',dead:true} }
function _roomsToEntries(rooms) {
  var entries = {};
  Object.keys(rooms || {}).forEach(function(rid) {
    (rooms[rid] || []).forEach(function(e) {
      var entry = { room: rid, type: e.type, dead: !!e.dead };
      if (e.going) { entry.going = e.going; entry.goingColor = e.goingColor || ''; }
      entries[String(e.ch)] = entry;
    });
  });
  return entries;
}

// Convert flat per-CH entries → rooms-based structure
function _entriesToRooms(entries) {
  var rooms = {};
  Object.keys(entries || {}).forEach(function(ch) {
    var e = entries[ch];
    if (!e || !e.room) return;
    if (!rooms[e.room]) rooms[e.room] = [];
    var obj = { ch: parseInt(ch), type: e.type, dead: !!e.dead };
    if (e.going) { obj.going = e.going; obj.goingColor = e.goingColor || ''; }
    rooms[e.room].push(obj);
  });
  return rooms;
}

function saveSpawn() {
  var json = JSON.stringify(spawnData);
  localStorage.setItem(SPAWN_KEY, json);

  // Sync to Firebase — skip if echo, data unchanged, or Firebase data not yet loaded
  if (typeof db !== 'undefined' && db && window._fbSpawnLoaded) {
    var hash = json;
    if (hash === _lastSpawnHash) return; // no change — skip write
    _lastSpawnHash = hash;

    // Granular per-CH writes: each CH written to its own Firebase path
    // so concurrent edits to different CHs never conflict
    fbDebounce('spawn', function() {
      var current = _sanitize(JSON.parse(JSON.stringify(spawnData)));
      var prev = _prevFbSnapshot || {};
      var updates = {};

      // Diff entries per CH — each CH at its own path
      var curEntries = _roomsToEntries(current.rooms);
      var prevEntries = _roomsToEntries(prev.rooms);
      var allCHs = {};
      Object.keys(curEntries).forEach(function(ch) { allCHs[ch] = 1; });
      Object.keys(prevEntries).forEach(function(ch) { allCHs[ch] = 1; });
      Object.keys(allCHs).forEach(function(ch) {
        var cur = curEntries[ch] || null;
        var prv = prevEntries[ch] || null;
        if (JSON.stringify(cur) !== JSON.stringify(prv)) {
          updates['entries/' + ch] = cur;
        }
      });

      // Diff gheata, fulger, chTimes per individual CH key
      for (var i = 1; i <= 6; i++) {
        var chKey = 'ch' + i;
        if (JSON.stringify((current.gheata || {})[chKey]) !== JSON.stringify((prev.gheata || {})[chKey])) {
          updates['gheata/' + chKey] = _sanitize((current.gheata || {})[chKey]) || null;
        }
        if (JSON.stringify((current.fulger || {})[chKey]) !== JSON.stringify((prev.fulger || {})[chKey])) {
          updates['fulger/' + chKey] = _sanitize((current.fulger || {})[chKey]) || null;
        }
        if ((current.chTimes || {})[chKey] !== (prev.chTimes || {})[chKey]) {
          updates['chTimes/' + chKey] = (current.chTimes || {})[chKey] || null;
        }
      }

      // Diff pins per CH
      var curPins = current.pins || {};
      var prevPins = prev.pins || {};
      for (var pi = 1; pi <= 6; pi++) {
        var pk = 'ch' + pi;
        if (JSON.stringify(curPins[pk] || null) !== JSON.stringify(prevPins[pk] || null)) {
          updates['pins/' + pk] = curPins[pk] || null;
        }
      }

      // chBeaten per CH key
      for (var bi = 1; bi <= 6; bi++) {
        var bKey = 'ch' + bi;
        var curB = !!(current.chBeaten && current.chBeaten[bKey]);
        var prevB = !!(prev.chBeaten && prev.chBeaten[bKey]);
        if (curB !== prevB) updates['chBeaten/' + bKey] = curB || null;
      }

      // spawnType, spawnTime, evenHourType
      if (current.spawnType !== prev.spawnType) updates['spawnType'] = current.spawnType || null;
      if (current.evenHourType !== prev.evenHourType) updates['evenHourType'] = current.evenHourType || null;
      if (JSON.stringify(current.spawnTime) !== JSON.stringify(prev.spawnTime)) updates['spawnTime'] = current.spawnTime || null;

      // spawn type grace period fields
      var curPrev = current._prevSpawnType || null;
      var snpPrev = prev._prevSpawnType || null;
      if (curPrev !== snpPrev) updates['_prevSpawnType'] = curPrev;
      var curRst = current._resetAt || null;
      var snpRst = prev._resetAt || null;
      if (curRst !== snpRst) updates['_resetAt'] = curRst;

      _prevFbSnapshot = current;

      if (Object.keys(updates).length > 0) {
        db.ref(p('spawn/data')).update(updates).catch(function(e) {
          console.warn('Spawn Firebase write error:', e);
        });
      }
    }, 300);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function getUsedCHsForType(type) {
  var used = {};
  Object.keys(spawnData.rooms).forEach(function(rid) {
    var entries = spawnData.rooms[rid] || [];
    entries.forEach(function(e) { if (e.type === type && !e.dead) used[e.ch] = true; });
  });
  return used;
}

function getAllEntriesForCH(chNum) {
  var result = [];
  Object.keys(spawnData.rooms).forEach(function(rid) {
    var entries = spawnData.rooms[rid] || [];
    entries.forEach(function(e) { if (e.ch === chNum) result.push({roomId:rid, type:e.type, dead:e.dead, going:e.going||null, goingColor:e.goingColor||null, _ref:e}); });
  });
  return result;
}

// Check if a CH's entry sits in a room that has BOTH sef and gen alive, or is royal
function getMixedInfoForCH(chNum) {
  var result = { mixed: false, scenario: null, royal: false };
  Object.keys(spawnData.rooms).forEach(function(rid) {
    var entries = spawnData.rooms[rid] || [];
    var chInRoom = entries.some(function(e){ return e.ch === chNum && !e.dead; });
    if (!chInRoom) return;
    var alive = entries.filter(function(e){ return !e.dead; });
    var sefCount = alive.filter(function(e){ return e.type === 'sef'; }).length;
    var genCount = alive.filter(function(e){ return e.type === 'gen'; }).length;
    if (sefCount >= 2) {
      result.royal = true;
    } else if (sefCount > 0 && genCount > 0) {
      result.mixed = true;
      if (sefCount === genCount) result.scenario = 'equal';
      else if (sefCount > genCount) result.scenario = 'sef';
      else result.scenario = 'gen';
    }
  });
  return result;
}

function escSp(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Map dots ────────────────────────────────────────────────────────
function buildMapDots() {
  var wrap = _findEl('spawnMapWrap');
  if (!wrap) return;
  var ownerDoc = wrap.ownerDocument;

  // Scale dots proportionally to the rendered map width (reference: 460px)
  var mapImg = wrap.querySelector('.spawn-map-img');
  var scale = mapImg ? Math.max(0.5, Math.min(3, mapImg.offsetWidth / 460)) : 1;
  wrap.style.setProperty('--dot-scale', scale.toFixed(3));

  wrap.querySelectorAll('.spawn-room-dot').forEach(function(d){d.remove();});
  SPAWN_ROOMS.forEach(function(r) {
    var id = r[0], label = r[1], xPct = r[2], yPct = r[3], isBoss = r[4];
    var dot = ownerDoc.createElement('div');
    var cls = 'spawn-room-dot';
    if (isBoss) cls += ' boss';
    if (id === 'F') cls += ' boss-f';
    var entries = spawnData.rooms[id] || [];
    var aliveEntries = entries.filter(function(e){return !e.dead;});
    var hasGen = aliveEntries.some(function(e){return e.type==='gen';});
    var hasSef = aliveEntries.some(function(e){return e.type==='sef';});
    var allDead = entries.length > 0 && entries.every(function(e){return e.dead;});
    var sefCount = aliveEntries.filter(function(e){return e.type==='sef';}).length;
    var genCount = aliveEntries.filter(function(e){return e.type==='gen';}).length;
    var isMixed = hasSef && hasGen;
    var totalAlive = sefCount + genCount;
    var isRoyal = sefCount >= 2 && !allDead;

    var hasGoing = entries.some(function(e){return e.going && !e.dead;});
    if (allDead) cls += ' has-data-dead';
    else if (isRoyal) cls += ' has-data-royal';
    else if (hasGoing) cls += ' has-data-going';
    else if (isMixed) {
      if (sefCount === genCount) cls += ' has-data-mixed-equal';
      else if (sefCount > genCount) cls += ' has-data-mixed-sef';
      else cls += ' has-data-mixed-gen';
    }
    else if (hasGen) cls += ' has-data-gen';
    else if (hasSef) cls += ' has-data';
    // Reward intensity: more sefs = brighter, more gens = dimmer (skip for royal)
    if (!allDead && !isRoyal && aliveEntries.length > 0) {
      var reward = sefCount - genCount;
      if (reward >= 3) cls += ' reward-high';
      else if (reward >= 2) cls += ' reward-med';
      else if (reward >= 1) cls += ' reward-low';
      else if (reward <= -2) cls += ' reward-bad-high';
      else if (reward <= -1) cls += ' reward-bad';
    }
    dot.className = cls;
    dot.dataset.roomId = id;
    dot.style.left = xPct + '%';
    dot.style.top  = yPct + '%';
    dot.textContent = label;
    if (entries.length > 0) {
      var badge = ownerDoc.createElement('span');
      badge.className = 'spawn-room-badge';
      var chPrefix = ownerDoc.createElement('span');
      chPrefix.className = 'spawn-badge-prefix';
      chPrefix.textContent = 'CH';
      badge.appendChild(chPrefix);
      var seen = {};
      entries.forEach(function(e) {
        var chNum = '' + e.ch;
        if (seen[chNum]) return;
        seen[chNum] = true;
        var span = ownerDoc.createElement('span');
        span.className = 'spawn-badge-ch';
        if (e.dead) span.classList.add('badge-dead');
        else if (e.going) { span.classList.add('badge-going'); span.style.color = e.goingColor || '#c8962e'; }
        else if (e.type === 'sef') span.classList.add('badge-sef');
        else if (e.type === 'gen') span.classList.add('badge-gen');
        span.textContent = chNum;
        badge.appendChild(span);
      });
      dot.appendChild(badge);
      // Show going name under the room
      var goingEntry = entries.find(function(e){return e.going && !e.dead;});
      if (goingEntry) {
        var goingTag = ownerDoc.createElement('span');
        goingTag.className = 'spawn-going-tag';
        goingTag.style.color = goingEntry.goingColor || '#c8962e';
        goingTag.textContent = goingEntry.going;
        dot.appendChild(goingTag);
      }
    }
    // Gen Fals indicator on rooms 18 and F
    if ((id === '18' || id === 'F') && spawnData && spawnData.gheata) {
      var gfKey = id === '18' ? 'gf18' : 'gfF';
      var gfChannels = [];
      for (var gi = 1; gi <= 6; gi++) {
        var gch = spawnData.gheata['ch' + gi];
        if (gch && gch[gfKey]) gfChannels.push(gi);
      }
      if (gfChannels.length > 0) {
        dot.classList.add('has-genfals');
        var gfBadge = ownerDoc.createElement('span');
        gfBadge.className = 'spawn-gf-indicator';
        gfBadge.textContent = 'GF ' + gfChannels.map(function(c){return 'CH'+c;}).join(' ');
        dot.appendChild(gfBadge);
      }
    }
    // Royal decorations: crown + wings + sparkles
    if (isRoyal) {
      var crown = ownerDoc.createElement('span');
      crown.className = 'spawn-royal-crown';
      crown.textContent = '\uD83D\uDC51';
      dot.appendChild(crown);
      var sparkle = ownerDoc.createElement('div');
      sparkle.className = 'spawn-royal-sparkle';
      dot.appendChild(sparkle);
    }
    if (isBoss) {
      // Left click = Sef, Right click = Gen — always open CH picker
      dot.addEventListener('click', function(e) {
        e.stopPropagation();
        openSpawnPopover(id, label, e, 'sef');
      });
      dot.addEventListener('contextmenu', function(e) {
        // Shift+Right-click on 18/F = Gen Fals picker
        if (e.shiftKey && (id === '18' || id === 'F')) {
          e.preventDefault(); e.stopPropagation();
          openGenFalsPicker(id, e);
          return;
        }
        e.preventDefault(); e.stopPropagation();
        openSpawnPopover(id, label, e, 'gen');
      });
      // Middle-click on 18/F = Gen Fals picker
      if (id === '18' || id === 'F') {
        dot.addEventListener('mousedown', function(e) {
          if (e.button === 1) {
            e.preventDefault(); e.stopPropagation();
            openGenFalsPicker(id, e);
          }
        });
      }
    }
    wrap.appendChild(dot);
  });

  // ── Render pins on map ──
  wrap.querySelectorAll('.spawn-pin').forEach(function(p){p.remove();});
  if (spawnData && spawnData.pins) {
    Object.keys(spawnData.pins).forEach(function(chKey) {
      var pin = spawnData.pins[chKey];
      if (!pin || !pin.x || !pin.y) return;
      var chNum = parseInt(chKey.replace('ch',''));
      var pinEl = ownerDoc.createElement('div');
      pinEl.className = 'spawn-pin' + (pin.dead ? ' spawn-pin-dead' : '');
      pinEl.style.left = pin.x + '%';
      pinEl.style.top = pin.y + '%';
      pinEl.dataset.ch = chNum;
      var pinColor = pin.dead ? 'var(--text-muted)' : _pinColors[(chNum - 1) % _pinColors.length];
      pinEl.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="' + pinColor + '" stroke="#000" stroke-width="0.5"/></svg>' +
        '<span class="spawn-pin-label" style="color:' + pinColor + '">' + (pin.dead ? '<img src="img/icons/dead.png" class="spawn-dead-icon"> ' : '') + 'CH' + chNum + '</span>';
      pinEl.title = 'CH' + chNum + (pin.dead ? ' — Dead' : ' — Ascuns') + ' (click dreapta: sterge)';
      pinEl.addEventListener('contextmenu', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        delete spawnData.pins[chKey];
        saveSpawn(); buildMapDots(); renderSpawnTables();
        showToast('Pin CH' + chNum + ' sters', 'info');
      });
      wrap.appendChild(pinEl);
    });
  }

  // ── Pin mode click handler on map ──
  if (!wrap._pinClickBound) {
    wrap._pinClickBound = true;
    wrap.addEventListener('click', function(ev) {
      if (!_pinModeCH) return;
      // Don't place pin if clicking a room dot
      if (ev.target.closest('.spawn-room-dot') || ev.target.closest('.spawn-pin') || ev.target.closest('#mapChStatus')) return;
      var rect = wrap.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / rect.width) * 100;
      var y = ((ev.clientY - rect.top) / rect.height) * 100;
      if (!spawnData.pins) spawnData.pins = {};
      spawnData.pins['ch' + _pinModeCH] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      var placedCH = _pinModeCH;
      _pinModeCH = null;
      wrap.style.cursor = '';
      saveSpawn(); buildMapDots(); renderSpawnTables();
      showToast('Pin CH' + placedCH + ' plasat', 'success');
    });
  }
  // Update cursor if in pin mode
  wrap.style.cursor = _pinModeCH ? 'crosshair' : '';

  // ── CH status overlay inside map (pop-out only) ──
  var isPopout = _popoutActive.harta && _popoutActive.harta.popWin && !_popoutActive.harta.popWin.closed;
  var existingStatus = wrap.querySelector('#mapChStatus');
  if (isPopout) {
    if (!existingStatus) {
      var cs = ownerDoc.createElement('div');
      cs.id = 'mapChStatus';
      cs.className = 'map-ch-status';
      wrap.appendChild(cs);
      // Delegated click handler — survives innerHTML rebuilds
      cs.addEventListener('click', function(ev) {
        var el = ev.target.closest('.mcs-remaining');
        if (!el) return;
        ev.stopPropagation();
        var chNum = parseInt(el.dataset.ch);
        if (!chNum || !spawnData) return;
        pushSpawnUndo('not found CH' + chNum);
        if (!spawnData.rooms['_nf']) spawnData.rooms['_nf'] = [];
        spawnData.rooms['_nf'].push({ ch: chNum, type: 'notfound', dead: false });
        saveSpawn(); buildMapDots(); renderSpawnTables();
        showToast('CH' + chNum + ' — Not Found', 'info');
      });
    }
    _updateMapChStatus(wrap);
  } else if (existingStatus) {
    existingStatus.remove();
  }
}

function _updateMapChStatus(wrap) {
  var statusEl = wrap.querySelector('#mapChStatus');
  if (!statusEl) return;
  var usedCHs = {};
  var deadCHs = {};
  var notFoundCHs = {};
  if (spawnData && spawnData.rooms) {
    Object.keys(spawnData.rooms).forEach(function(rid) {
      (spawnData.rooms[rid] || []).forEach(function(e) {
        if (e.type === 'notfound') { notFoundCHs[e.ch] = true; }
        else { usedCHs[e.ch] = true; }
        if (e.dead) deadCHs[e.ch] = true;
      });
    });
  }
  // Show all 6 CHs: orange if remaining (clickable), gray-out if dead, dim if assigned
  statusEl.style.display = '';
  statusEl.innerHTML = '';
  var row = statusEl.ownerDocument.createElement('div');
  row.className = 'mcs-row';
  for (var ci2 = 1; ci2 <= 6; ci2++) {
    var span = statusEl.ownerDocument.createElement('span');
    span.className = 'mcs-ch';
    span.textContent = 'CH' + ci2;
    span.dataset.ch = ci2;
    if (!usedCHs[ci2] && !notFoundCHs[ci2]) {
      span.classList.add('mcs-remaining');
      span.style.cursor = 'pointer';
      span.title = 'Click: Not Found';
    }
    else if (notFoundCHs[ci2] && !usedCHs[ci2]) span.classList.add('mcs-notfound');
    else if (deadCHs[ci2]) span.classList.add('mcs-dead');
    else span.classList.add('mcs-assigned');
    row.appendChild(span);
    row.appendChild(statusEl.ownerDocument.createTextNode(' '));
  }
  statusEl.appendChild(row);
}

// ── Quick-add feedback flash ────────────────────────────────────────
function showDotFeedback(dotEl, text, color) {
  var fb = dotEl.ownerDocument.createElement('div');
  fb.textContent = '+' + text;
  fb.style.cssText = 'position:absolute;top:-22px;left:50%;transform:translateX(-50%);' +
    'font-family:Rajdhani,sans-serif;font-size:12px;font-weight:700;color:' + color + ';' +
    'pointer-events:none;white-space:nowrap;animation:dotFb 0.7s ease-out forwards;z-index:9999;';
  dotEl.style.position = 'absolute';
  dotEl.appendChild(fb);
  setTimeout(function(){ if (fb.parentNode) fb.parentNode.removeChild(fb); }, 700);
}

// ── Popover ─────────────────────────────────────────────────────────
function _getPopoverHost() {
  // If harta is popped out, popover must appear in that window
  if (_popoutActive.harta && _popoutActive.harta.popWin && !_popoutActive.harta.popWin.closed) {
    return _popoutActive.harta.popWin;
  }
  return window;
}

// Find the popover element regardless of which document it's in
function _getPopoverEl() {
  var el = document.getElementById('spawnPopover');
  if (el) return el;
  // Check pop-out window
  if (_popoutActive.harta && _popoutActive.harta.popWin && !_popoutActive.harta.popWin.closed) {
    el = _popoutActive.harta.popWin.document.getElementById('spawnPopover');
  }
  return el;
}

function openSpawnPopover(roomId, label, e, forceType) {
  popoverRoomId = roomId;
  popoverSelectedType = forceType || null;
  popoverSelectedCH = null;
  var pop = _getPopoverEl();
  var hostWin = _getPopoverHost();

  // If popover is in main doc but map is in pop-out, move popover there
  if (hostWin !== window) {
    if (pop.ownerDocument !== hostWin.document) {
      hostWin.document.body.appendChild(pop);
    }
  } else {
    // Make sure popover is back in main document
    if (pop.ownerDocument !== document) {
      document.body.appendChild(pop);
    }
  }

  pop.querySelector('#spawnPopTitle').textContent = 'Camera ' + label;
  // Set type visual
  var badge = pop.querySelector('#spawnPopTypeBadge');
  var grid  = pop.querySelector('#spawnChGrid');
  var hint  = pop.querySelector('#spawnPopTypeHint');
  if (forceType === 'sef') {
    badge.innerHTML = 'Sef'; badge.className = 'sgrid-lbl-sef';
    grid.classList.remove('gen-mode'); hint.style.display = 'none';
  } else if (forceType === 'gen') {
    badge.innerHTML = '&#9733; Gen'; badge.className = 'sgrid-lbl-gen';
    grid.classList.add('gen-mode'); hint.style.display = 'none';
  } else {
    badge.innerHTML = '&#8212;'; badge.className = '';
    grid.classList.remove('gen-mode'); hint.style.display = '';
  }
  renderPopoverEntries();
  updateComboGrid();
  var vw = hostWin.innerWidth, vh = hostWin.innerHeight;
  var x = e.clientX + 14, y = e.clientY - 10;
  if (x + 238 > vw) x = e.clientX - 238 - 14;
  if (y + 300 > vh) y = vh - 308;
  if (y < 8) y = 8;
  pop.style.left = x + 'px';
  pop.style.top  = y + 'px';
  pop.classList.add('open');
}

function renderPopoverEntries() {
  var pop = _getPopoverEl();
  if (!pop) return;
  var container = pop.querySelector('#spawnPopEntries');
  var clearBtn = pop.querySelector('#spawnPopClear');
  var entries = spawnData.rooms[popoverRoomId] || [];
  if (clearBtn) clearBtn.style.display = entries.length > 0 ? '' : 'none';
  if (entries.length === 0) {
    container.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:4px 0">Nicio intrare</div>';
    return;
  }
  container.innerHTML = entries.map(function(e, idx) {
    var cls = 'spawn-entry-item entry-' + e.type;
    if (e.dead) cls += ' entry-dead';
    var typeTxt = e.type === 'gen' ? '\u2605 Gen' : '<img src="img/icons/boss.png" class="spawn-sef-icon"> Sef';
    var deadTxt = e.dead ? ' <img src="img/icons/dead.png" class="spawn-dead-icon">' : '';
    return '<div class="' + cls + '">' +
      '<span>' + typeTxt + ' \u2014 CH' + e.ch + deadTxt + '</span>' +
      '<button class="spawn-entry-del" data-idx="' + idx + '">\u2715</button>' +
    '</div>';
  }).join('');
  container.querySelectorAll('.spawn-entry-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.idx);
      pushSpawnUndo('stergere intrare din camera ' + popoverRoomId);
      spawnData.rooms[popoverRoomId].splice(idx, 1);
      if (spawnData.rooms[popoverRoomId].length === 0) delete spawnData.rooms[popoverRoomId];
      saveSpawn(); buildMapDots(); renderSpawnTables();
      renderPopoverEntries();
      updatePopoverCHButtons();
    });
  });
}

function updatePopoverTypeButtons() {
  var pop = _getPopoverEl();
  if (!pop) return;
  pop.querySelectorAll('#spawnPopType .spawn-pop-btn').forEach(function(btn) {
    btn.className = 'spawn-pop-btn';
    if (btn.dataset.type === popoverSelectedType) btn.classList.add('active-' + popoverSelectedType);
  });
}

function getUsedCHsAny() {
  // Returns a set of CHs already used by ANY entry (dead or alive).
  // Dead CH = cannot add more entries (boss already handled/dead).
  // Alive CH = already has sef/gen (one per CH rule).
  // "Not Found" entries are ignored — CH can be overridden from map.
  // Gen entries in rooms 18/F are ignored — CH can be overridden (auto gen fals).
  var used = {};
  Object.keys(spawnData.rooms).forEach(function(rid) {
    (spawnData.rooms[rid] || []).forEach(function(e) {
      if (e.type === 'notfound') return;
      // Gen in 18/F is overridable — skip so the CH stays clickable
      if ((rid === '18' || rid === 'F') && e.type === 'gen' && !e.dead) return;
      if (!e.dead) used[e.ch] = 'alive';
      else if (!used[e.ch]) used[e.ch] = 'dead';
    });
  });
  return used;
}

function updatePopoverCHButtons() {
  var pop = _getPopoverEl();
  if (!pop) return;
  var usedAny = getUsedCHsAny();
  pop.querySelectorAll('#spawnPopCH .spawn-pop-btn').forEach(function(btn) {
    btn.className = 'spawn-pop-btn';
    var chNum = parseInt(btn.dataset.ch);
    if (chNum === popoverSelectedCH) btn.classList.add('active-ch');
    if (usedAny[chNum]) btn.classList.add('disabled');
  });
}

function closeSpawnPopover() {
  var pop = _getPopoverEl();
  if (pop) {
    pop.classList.remove('open');
    // If popover is in a pop-out window, move it back to main doc
    if (pop.ownerDocument !== document) {
      document.body.appendChild(pop);
    }
  }
  popoverRoomId = null;
  popoverSelectedType = null;
  popoverSelectedCH = null;
}

document.getElementById('spawnPopClose').addEventListener('click', closeSpawnPopover);

// ── Gen Fals Picker (middle-click / shift+right-click on 18/F) ──
function openGenFalsPicker(roomId, e) {
  closeSpawnPopover(); // close any open popover
  closeGenFalsPicker(); // close existing picker
  var gfKey = roomId === '18' ? 'gf18' : 'gfF';
  var hostWin = _getPopoverHost();
  var ownerDoc = hostWin.document || document;

  var picker = ownerDoc.createElement('div');
  picker.id = 'gfPicker';
  picker.className = 'gf-picker open';
  var title = ownerDoc.createElement('div');
  title.className = 'gf-picker-title';
  title.textContent = 'Gen Fals — Camera ' + roomId;
  picker.appendChild(title);

  var grid = ownerDoc.createElement('div');
  grid.className = 'gf-picker-grid';
  for (var i = 1; i <= 6; i++) {
    (function(ch) {
      var chKey = 'ch' + ch;
      var isActive = spawnData.gheata[chKey] && spawnData.gheata[chKey][gfKey];
      var btn = ownerDoc.createElement('button');
      btn.className = 'gf-picker-btn' + (isActive ? ' gf-active' : '');
      btn.textContent = 'CH' + ch;
      btn.addEventListener('click', function() {
        if (!spawnData.gheata[chKey]) spawnData.gheata[chKey] = { genFals: '', gf18: false, gfF: false };
        spawnData.gheata[chKey][gfKey] = !spawnData.gheata[chKey][gfKey];
        btn.classList.toggle('gf-active');
        saveSpawn();
        buildMapDots();
        renderGheataTable();
      });
      grid.appendChild(btn);
    })(i);
  }
  picker.appendChild(grid);

  var vw = hostWin.innerWidth, vh = hostWin.innerHeight;
  var x = e.clientX + 10, y = e.clientY - 10;
  if (x + 180 > vw) x = e.clientX - 190;
  if (y + 120 > vh) y = vh - 128;
  if (y < 8) y = 8;
  picker.style.left = x + 'px';
  picker.style.top  = y + 'px';

  ownerDoc.body.appendChild(picker);

  // Close on click outside
  setTimeout(function() {
    function closeOnOutside(ev) {
      if (!picker.contains(ev.target)) {
        closeGenFalsPicker();
        ownerDoc.removeEventListener('mousedown', closeOnOutside);
      }
    }
    ownerDoc.addEventListener('mousedown', closeOnOutside);
  }, 10);
}

function closeGenFalsPicker() {
  var picker = document.getElementById('gfPicker');
  if (picker) picker.remove();
  if (_popoutActive.harta && _popoutActive.harta.popWin && !_popoutActive.harta.popWin.closed) {
    var p2 = _popoutActive.harta.popWin.document.getElementById('gfPicker');
    if (p2) p2.remove();
  }
}

// Click-outside handler — works for both main window and pop-out
function _popoverClickOutside(e) {
  var pop = _getPopoverEl();
  if (pop && pop.classList.contains('open') && !pop.contains(e.target)) {
    if (!e.target.closest('.spawn-room-dot')) closeSpawnPopover();
  }
}
document.addEventListener('click', _popoverClickOutside);

function updateComboGrid() {
  var pop = _getPopoverEl();
  if (!pop) return;
  var usedAny = getUsedCHsAny();
  pop.querySelectorAll('#spawnChGrid .scb').forEach(function(btn) {
    var ch = parseInt(btn.dataset.ch);
    btn.classList.toggle('scb-disabled', !!usedAny[ch]);
  });
}

// Auto gen fals: if a CH had gen in 18/F and is now placed in a different room, auto-mark 18/F as gen fals
function _autoGenFals(chNum, newRoomId) {
  if (!spawnData || !spawnData.rooms || !spawnData.gheata) return;
  ['18', 'F'].forEach(function(specialRoom) {
    if (newRoomId === specialRoom) return; // placing IN 18/F, skip
    var entries = spawnData.rooms[specialRoom] || [];
    var genEntry = entries.find(function(e) { return e.ch === chNum && e.type === 'gen' && !e.dead; });
    if (genEntry) {
      var chKey = 'ch' + chNum;
      var gfKey = specialRoom === '18' ? 'gf18' : 'gfF';
      if (!spawnData.gheata[chKey]) spawnData.gheata[chKey] = { genFals: '', gf18: false, gfF: false };
      spawnData.gheata[chKey][gfKey] = true;
    }
  });
}

document.querySelectorAll('#spawnChGrid .scb').forEach(function(btn) {
  btn.addEventListener('click', function() {
    if (!popoverRoomId || !popoverSelectedType) return;
    if (btn.classList.contains('scb-disabled')) return;
    var chNum = parseInt(btn.dataset.ch);
    pushSpawnUndo('adaugare CH' + chNum + ' in camera ' + popoverRoomId);
    _autoGenFals(chNum, popoverRoomId);
    if (!spawnData.rooms[popoverRoomId]) spawnData.rooms[popoverRoomId] = [];
    Object.keys(spawnData.rooms).forEach(function(rid) {
      spawnData.rooms[rid] = (spawnData.rooms[rid] || []).filter(function(e){ return e.ch !== chNum; });
      if (spawnData.rooms[rid].length === 0) delete spawnData.rooms[rid];
    });
    if (!spawnData.rooms[popoverRoomId]) spawnData.rooms[popoverRoomId] = [];
    spawnData.rooms[popoverRoomId].push({ type: popoverSelectedType, ch: chNum, dead: false });
    saveSpawn(); buildMapDots(); renderSpawnTables();
    closeSpawnPopover();
  });
});

document.getElementById('spawnPopClear').addEventListener('click', function() {
  if (!popoverRoomId) return;
  pushSpawnUndo('stergere camera ' + popoverRoomId);
  delete spawnData.rooms[popoverRoomId];
  closeSpawnPopover();
  saveSpawn(); buildMapDots(); renderSpawnTables();
});

// ── Tables ───────────────────────────────────────────────────────────
function renderSpawnTables() {
  renderGheataTable(); updateSpawnTimeStrip();
  renderChSplitTable();
}

// ── Inline table-entry popover for Gheata ────────────────────────────
var _gheataPopCH = null;
function _getGheataHost() {
  if (_popoutActive.gheata && _popoutActive.gheata.popWin && !_popoutActive.gheata.popWin.closed) {
    return _popoutActive.gheata.popWin;
  }
  return window;
}

function showGheataEntryPop(chNum, anchorEl) {
  closeGheataEntryPop();
  _gheataPopCH = chNum;

  // Determine which window the gheata table is in
  var ownerWin = _getGheataHost();
  var ownerDoc = ownerWin.document;

  // Check if this CH already has an entry — prefill for edit/replace
  var existing = getAllEntriesForCH(chNum);
  var existingEntry = existing.length > 0 ? existing[0] : null;

  var pop = ownerDoc.createElement('div');
  pop.id = 'gheataEntryPop';
  pop.style.cssText = 'position:fixed;z-index:8000;background:var(--surface2);border:1.5px solid var(--border-accent);border-radius:10px;padding:12px 14px;min-width:210px;box-shadow:0 8px 28px rgba(0,0,0,0.55)';

  var isEdit = !!existingEntry;
  var titleTxt = isEdit ? ('Editeaza CH ' + chNum) : ('Adauga CH ' + chNum);

  pop.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
      '<span style="font-family:Rajdhani,sans-serif;font-size:14px;font-weight:700;color:var(--gold-light)">' + titleTxt + '</span>' +
      '<button id="gheataPopClose" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;line-height:1">✕</button>' +
    '</div>' +
    (isEdit ? '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Exista deja o intrare. Suprascrie cu noua valoare.</div>' : '') +
    '<div style="margin-bottom:8px">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px">Tip</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="ghpop-type-btn" data-type="sef" style="flex:1;padding:6px;border-radius:6px;border:1.5px solid var(--border-accent);background:var(--surface3);color:var(--text-dim);font-family:Rajdhani,sans-serif;font-size:13px;font-weight:700;cursor:pointer"><img src="img/icons/boss.png" class="spawn-sef-icon"> Sef</button>' +
        '<button class="ghpop-type-btn" data-type="gen" style="flex:1;padding:6px;border-radius:6px;border:1.5px solid var(--border-accent);background:var(--surface3);color:var(--text-dim);font-family:Rajdhani,sans-serif;font-size:13px;font-weight:700;cursor:pointer">★ Gen</button>' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:10px">' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px">Nr. Camera</div>' +
      '<input id="gheataPopRoom" type="text" inputmode="text" placeholder="ex: 7, F, 13" maxlength="4" autocomplete="off" ' +
        'style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;border:1px solid var(--border-accent);background:var(--surface3);color:var(--text);font-size:15px;font-family:Rajdhani,sans-serif;font-weight:700;letter-spacing:1px;outline:none" ' +
        'value="' + (existingEntry ? existingEntry.roomId : '') + '">' +
    '</div>' +
    '<button id="gheataPopAdd" disabled style="width:100%;padding:8px;border-radius:7px;border:none;background:var(--green);color:#fff;font-family:Rajdhani,sans-serif;font-size:14px;font-weight:700;cursor:not-allowed;opacity:.5">' +
      (isEdit ? 'Suprascrie' : 'Adauga') +
    '</button>';

  ownerDoc.body.appendChild(pop);

  // Position near anchor — clamp to stay inside pop-out window
  var rect = anchorEl.getBoundingClientRect();
  var popW = 230, popH = 230;
  var vw = ownerWin.innerWidth, vh = ownerWin.innerHeight;
  var x = rect.right + 8, y = rect.top;
  if (x + popW > vw) x = rect.left - popW - 8;
  if (x < 4) x = Math.min(4, vw - popW - 4);
  if (y + popH > vh) y = vh - popH - 4;
  if (y < 4) y = 4;
  pop.style.left = x + 'px';
  pop.style.top  = y + 'px';

  var selType = existingEntry ? existingEntry.type : null;
  var typeBtns = pop.querySelectorAll('.ghpop-type-btn');
  var roomInput = pop.querySelector('#gheataPopRoom');
  var addBtn    = pop.querySelector('#gheataPopAdd');

  // Pre-highlight existing type
  if (selType) {
    typeBtns.forEach(function(b) {
      if (b.dataset.type === selType) {
        b.style.borderColor = selType === 'gen' ? '#4a9eff' : 'var(--green)';
        b.style.color = selType === 'gen' ? '#4a9eff' : 'var(--green)';
        b.style.background = selType === 'gen' ? 'rgba(74,158,255,.18)' : 'rgba(76,175,130,.18)';
        if (selType === 'sef') b.classList.add('sef-active');
      }
    });
  }

  function updateAddBtn() {
    var roomVal = roomInput.value.trim().toUpperCase();
    // Valid: any room ID that exists in SPAWN_ROOMS (case-insensitive match)
    var allRoomIds = SPAWN_ROOMS.map(function(r){ return String(r[0]).toUpperCase(); });
    var roomOk = allRoomIds.indexOf(roomVal) !== -1;
    var ok = selType && roomOk;
    addBtn.disabled = !ok;
    addBtn.style.opacity = ok ? '1' : '.5';
    addBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    roomInput.style.borderColor = (roomInput.value.trim() && !roomOk) ? 'var(--red)' : 'var(--border-accent)';
  }

  typeBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      selType = btn.dataset.type;
      typeBtns.forEach(function(b) {
        b.style.background = 'var(--surface3)';
        b.style.borderColor = 'var(--border-accent)';
        b.style.color = 'var(--text-dim)';
        b.classList.remove('sef-active');
      });
      btn.style.borderColor = selType === 'gen' ? '#4a9eff' : 'var(--green)';
      btn.style.color = selType === 'gen' ? '#4a9eff' : 'var(--green)';
      btn.style.background = selType === 'gen' ? 'rgba(74,158,255,.18)' : 'rgba(76,175,130,.18)';
      if (selType === 'sef') btn.classList.add('sef-active');
      updateAddBtn();
    });
  });

  roomInput.addEventListener('input', updateAddBtn);
  roomInput.addEventListener('keypress', function(ev) {
    if (ev.key === 'Enter') { addBtn.click(); }
  });

  // Focus the room input immediately for fast entry
  setTimeout(function() { roomInput.focus(); roomInput.select(); }, 50);

  updateAddBtn();

  addBtn.addEventListener('click', function() {
    if (addBtn.disabled) return;
    var roomId = roomInput.value.trim().toUpperCase();
    // Normalize: find the real ID (case-insensitive)
    var realRoom = SPAWN_ROOMS.find(function(r){ return String(r[0]).toUpperCase() === roomId; });
    if (!realRoom) return;
    roomId = String(realRoom[0]);

    pushSpawnUndo('adaugare CH' + chNum + ' ' + selType + ' in camera ' + roomId);
    _autoGenFals(chNum, roomId);
    // Remove ALL existing entries for this CH across all rooms (one per CH rule)
    Object.keys(spawnData.rooms).forEach(function(rid) {
      spawnData.rooms[rid] = (spawnData.rooms[rid] || []).filter(function(e){ return e.ch !== chNum; });
      if (spawnData.rooms[rid].length === 0) delete spawnData.rooms[rid];
    });

    // Add single entry
    if (!spawnData.rooms[roomId]) spawnData.rooms[roomId] = [];
    spawnData.rooms[roomId].push({ type: selType, ch: chNum, dead: false });
    saveSpawn(); buildMapDots(); renderSpawnTables();
    closeGheataEntryPop();
  });

  pop.querySelector('#gheataPopClose').addEventListener('click', closeGheataEntryPop);

  setTimeout(function() {
    ownerDoc.addEventListener('click', _gheataPopOutside, true);
  }, 100);
}

function _gheataPopOutside(ev) {
  var pop = _findEl('gheataEntryPop');
  if (pop && !pop.contains(ev.target)) closeGheataEntryPop();
}

function closeGheataEntryPop() {
  var pop = _findEl('gheataEntryPop');
  if (pop) pop.remove();
  document.removeEventListener('click', _gheataPopOutside, true);
  // Also remove from pop-out windows
  if (typeof _popoutActive !== 'undefined') {
    for (var k in _popoutActive) {
      if (_popoutActive[k] && _popoutActive[k].popWin && !_popoutActive[k].popWin.closed) {
        try { _popoutActive[k].popWin.document.removeEventListener('click', _gheataPopOutside, true); } catch(e) {}
      }
    }
  }
  _gheataPopCH = null;
}

function renderGheataTable() {
  var tbody = _findEl('gheataTableBody');
  if (!tbody || !spawnData) return;
  var ownerDoc = tbody.ownerDocument;
  tbody.innerHTML = '';
  for (var i = 1; i <= 6; i++) {
    var key = 'ch' + i;
    var d = spawnData.gheata[key];
    var chEntries = getAllEntriesForCH(i);
    var realEntries = chEntries.filter(function(e){return e.type !== 'notfound';});
    var isNotFound = chEntries.some(function(e){return e.type === 'notfound';}) && realEntries.length === 0;
    var hasSef = realEntries.some(function(e){return e.type==='sef' && !e.dead;});
    var hasGen = realEntries.some(function(e){return e.type==='gen' && !e.dead;});
    var hasDeadAny = realEntries.some(function(e){return e.dead;});
    var allDead = realEntries.length > 0 && realEntries.every(function(e){return e.dead;});

    // Check if this CH's room has mixed sef+gen (look at all alive entries in the same room)
    var chMixedInfo = getMixedInfoForCH(i);

    var anyGoing = chEntries.some(function(e){return e.going && !e.dead;});
    var goingName = '', goingColor = '';
    if (anyGoing) {
      var ge = chEntries.find(function(e){return e.going && !e.dead;});
      goingName = ge ? ge.going : '';
      goingColor = ge ? (ge.goingColor || '#c8962e') : '#c8962e';
    }

    var pinData = (spawnData.pins && spawnData.pins[key] && spawnData.pins[key].x) ? spawnData.pins[key] : null;
    var hasPin = !!pinData;
    var pinDead = hasPin && pinData.dead;
    var stCls, stTxt;
    if (isNotFound) { stCls = 'st-notfound'; stTxt = '\u2716 Not Found'; }
    else if (allDead && pinDead) { stCls = 'st-dead'; stTxt = '<img src="img/icons/dead.png" class="spawn-dead-icon"> Dead'; }
    else if (allDead && hasPin) { stCls = 'st-hidden'; stTxt = '<span style="color:' + _pinColors[(i - 1) % _pinColors.length] + '">\uD83D\uDCCD Ascuns</span>'; }
    else if (allDead) { stCls = 'st-dead'; stTxt = '<img src="img/icons/dead.png" class="spawn-dead-icon"> Dead'; }
    else if (anyGoing) {
      stCls = 'st-going';
      stTxt = '<span style="color:' + escSp(goingColor) + ';font-weight:600">\u2192 ' + escSp(goingName) + '</span>';
    } else if (hasPin && pinDead && realEntries.length === 0) {
      stCls = 'st-dead'; stTxt = '<img src="img/icons/dead.png" class="spawn-dead-icon"> Dead';
    } else if (hasPin && !pinDead) {
      stCls = 'st-hidden'; stTxt = '<span style="color:' + _pinColors[(i - 1) % _pinColors.length] + '">\uD83D\uDCCD Ascuns</span>';
    } else if (hasGen && hasSef) {
      stCls = 'st-gen'; stTxt = '<img src="img/icons/boss.png" class="spawn-sef-icon">+\u2605 Mix';
    } else if (hasGen) { stCls = 'st-gen';  stTxt = '\u2605 Gen'; }
    else if (hasSef)  { stCls = 'st-sef';  stTxt = '<img src="img/icons/boss.png" class="spawn-sef-icon"> Sef'; }
    else              { stCls = 'st-empty'; stTxt = '<span style="opacity:0.3">\u2014</span>'; }
    var chLabelCls = 'spawn-ch-label';
    if (chMixedInfo.royal) {
      chLabelCls += ' ch-highlight-royal';
    } else if (chMixedInfo.mixed) {
      // CH is in a room with mixed sef+gen — color the CH label accordingly
      if (chMixedInfo.scenario === 'equal') chLabelCls += ' ch-highlight-mixed-equal';
      else if (chMixedInfo.scenario === 'sef') chLabelCls += ' ch-highlight-mixed-sef';
      else chLabelCls += ' ch-highlight-mixed-gen';
    } else if (hasGen) chLabelCls += ' ch-highlight-gen';
    else if (hasSef) chLabelCls += ' ch-highlight-sef';
    else if (isNotFound) chLabelCls += ' ch-highlight-notfound';
    else if (allDead) chLabelCls += ' ch-highlight-dead';
    var displayEntries = chEntries.filter(function(e){ return e.type !== 'notfound'; });
    var aliveEntries = displayEntries.filter(function(e){ return !e.dead; });
    var deadEntries = displayEntries.filter(function(e){ return e.dead; });
    var cameraHtml = '';
    if (aliveEntries.length) {
      cameraHtml = aliveEntries.map(function(e) {
        var cls = e.type === 'gen' ? 'tag-gen' : '';
        return '<span class="spawn-cam-tag ' + cls + '">' + e.roomId + '</span>';
      }).join('');
    }
    if (deadEntries.length) {
      cameraHtml += deadEntries.map(function(e) {
        var cls = 'tag-dead' + (e.type === 'gen' ? ' tag-gen' : '');
        return '<span class="spawn-cam-tag ' + cls + '">' + e.roomId + '</span>';
      }).join('');
    }
    if (!cameraHtml) cameraHtml = '<span style="opacity:0.3;font-size:11px">\u2014</span>';
    var canClick = chEntries.length > 0 || !!pinData;
    var hasPin = !!pinData;
    var pinBtnCls = 'spawn-pin-btn' + (hasPin ? ' pin-active' : '') + (_pinModeCH === i ? ' pin-placing' : '');
    var pinBtnColor = hasPin ? _pinColors[(i - 1) % _pinColors.length] : '';
    var tr = ownerDoc.createElement('tr');
    // CH label: click = open inline add popover
    // State cell: if has entries → toggle dead; always allow add from "+" icon
    tr.innerHTML =
      '<td class="' + chLabelCls + '" data-addch="' + i + '" title="Click: adauga Sef/Gen" style="cursor:pointer;user-select:none">CH ' + i + ' <span style="font-size:11px;opacity:.5">＋</span></td>' +
      '<td class="spawn-state-cell ' + stCls + (canClick ? '' : ' st-empty') + '"' +
        ' data-spa="gheata-status" data-ch="' + i + '" title="' + (hasPin && realEntries.length === 0 ? 'Click: Ascuns ↔ Dead' : canClick ? 'Click: Merg → Dead → Revive' : 'Click: adauga Sef/Gen') + '" style="cursor:pointer"' +
        '>' + stTxt + '</td>' +
      '<td class="spawn-cameras-cell" data-clearch="' + i + '">' + cameraHtml + '</td>' +
      '<td style="padding:2px 4px!important;text-align:center">' +
        '<button class="' + pinBtnCls + '" data-spa="pin" data-ch="' + i + '"' + (pinBtnColor ? ' style="color:' + pinBtnColor + '"' : '') + ' title="' + (hasPin ? 'Pin plasat (click: sterge, click dreapta: replaseaza)' : 'Plaseaza pin pe harta') + '">' +
          '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="currentColor"/></svg>' +
        '</button>' +
      '</td>' +
      '<td class="spawn-gf-cell">' +
        '<div class="gh-gf-row">' +
          '<button class="spawn-gf-btn' + (d.gf18 ? ' gf-active' : '') + '" data-spa="gheata-gf18" data-ch="' + key + '">18</button>' +
          '<button class="spawn-gf-btn' + (d.gfF ? ' gf-active' : '') + '" data-spa="gheata-gfF" data-ch="' + key + '">F</button>' +
        '</div>' +
      '</td>';
    tbody.appendChild(tr);
  }
  // CH label click → open add popover
  tbody.querySelectorAll('td[data-addch]').forEach(function(td) {
    td.addEventListener('click', function(ev) {
      ev.stopPropagation();
      showGheataEntryPop(parseInt(td.dataset.addch), td);
    });
    // Right-click → instant clear all entries + pin for this CH
    td.addEventListener('contextmenu', function(ev) {
      _instantClearCH(ev, parseInt(td.dataset.addch));
    });
  });
  // State cell click → toggle dead if has entries, else open add
  // Right-click on state or cameras cell → instant clear
  function _instantClearCH(ev, chNum) {
    ev.preventDefault();
    ev.stopPropagation();
    var chKey = 'ch' + chNum;
    var entries = getAllEntriesForCH(chNum);
    var hasPin = spawnData.pins && spawnData.pins[chKey] && spawnData.pins[chKey].x;
    if (entries.length === 0 && !hasPin) return;
    pushSpawnUndo('curatare CH ' + chNum);
    Object.keys(spawnData.rooms).forEach(function(rid) {
      spawnData.rooms[rid] = (spawnData.rooms[rid] || []).filter(function(e) { return e.ch !== chNum; });
      if (spawnData.rooms[rid].length === 0) delete spawnData.rooms[rid];
    });
    // Also clear pin (ascuns) data
    if (spawnData.pins && spawnData.pins[chKey]) {
      delete spawnData.pins[chKey];
    }
    saveSpawn(); buildMapDots(); renderSpawnTables();
    showToast('CH ' + chNum + ' curatat', 'success');
  }
  tbody.querySelectorAll('.spawn-state-cell[data-spa="gheata-status"]').forEach(function(cell) {
    cell.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var ch = parseInt(cell.dataset.ch);
      var chKey = 'ch' + ch;
      var entries = getAllEntriesForCH(ch);
      var realE = entries.filter(function(e){ return e.type !== 'notfound'; });
      var isNF = entries.some(function(e){ return e.type === 'notfound'; }) && realE.length === 0;
      var pinData = (spawnData.pins && spawnData.pins[chKey] && spawnData.pins[chKey].x) ? spawnData.pins[chKey] : null;
      if (isNF) {
        // Not Found → open add popover to overwrite
        showGheataEntryPop(ch, cell);
      } else if (pinData && realE.length === 0) {
        // Pin-only: toggle Ascuns → Dead
        pinData.dead = !pinData.dead;
        saveSpawn(); buildMapDots(); renderSpawnTables();
        showToast('CH' + ch + (pinData.dead ? ' — Dead' : ' — Ascuns'), 'info');
      } else if (entries.length > 0) {
        toggleDeadForCH(ch);
      } else {
        showGheataEntryPop(ch, cell);
      }
    });
    cell.addEventListener('contextmenu', function(ev) {
      _instantClearCH(ev, parseInt(cell.dataset.ch));
    });
  });
  tbody.querySelectorAll('.spawn-cameras-cell[data-clearch]').forEach(function(cell) {
    cell.addEventListener('contextmenu', function(ev) {
      _instantClearCH(ev, parseInt(cell.dataset.clearch));
    });
  });
  tbody.querySelectorAll('.spawn-gf-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var act = btn.dataset.spa;
      var ch  = btn.dataset.ch;
      if (!spawnData || !spawnData.gheata[ch]) return;
      if (act === 'gheata-gf18') spawnData.gheata[ch].gf18 = !spawnData.gheata[ch].gf18;
      else if (act === 'gheata-gfF') spawnData.gheata[ch].gfF  = !spawnData.gheata[ch].gfF;
      saveSpawn();
      renderGheataTable();
      buildMapDots();
    });
  });
  // Pin buttons
  tbody.querySelectorAll('.spawn-pin-btn').forEach(function(btn) {
    var chNum = parseInt(btn.dataset.ch);
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var chKey = 'ch' + chNum;
      if (!spawnData.pins) spawnData.pins = {};
      if (spawnData.pins[chKey] && spawnData.pins[chKey].x) {
        // Has pin → remove it
        delete spawnData.pins[chKey];
        _pinModeCH = null;
        saveSpawn(); buildMapDots(); renderSpawnTables();
        showToast('Pin CH' + chNum + ' sters', 'info');
      } else {
        // Enter pin placement mode
        _pinModeCH = (_pinModeCH === chNum) ? null : chNum;
        buildMapDots(); renderGheataTable();
        if (_pinModeCH) showToast('Click pe harta pentru a plasa pinul CH' + chNum, 'info');
      }
    });
    btn.addEventListener('contextmenu', function(ev) {
      ev.preventDefault(); ev.stopPropagation();
      // Right-click: enter placement mode (replace existing pin)
      _pinModeCH = chNum;
      buildMapDots(); renderGheataTable();
      showToast('Click pe harta pentru a replasa pinul CH' + chNum, 'info');
    });
  });
}

function toggleDeadForCH(chNum) {
  var allEntries = [];
  Object.keys(spawnData.rooms).forEach(function(rid) {
    (spawnData.rooms[rid] || []).forEach(function(e) {
      if (e.ch === chNum) allEntries.push(e);
    });
  });
  if (allEntries.length === 0) return;

  var allDead = allEntries.every(function(e){return e.dead;});
  var anyGoing = allEntries.some(function(e){return e.going && !e.dead;});

  if (allDead) {
    // State 3→1: revive (clear dead + going)
    pushSpawnUndo('revive CH' + chNum);
    allEntries.forEach(function(e){ e.dead = false; delete e.going; delete e.goingColor; });
    saveSpawn(); buildMapDots(); renderSpawnTables();
  } else if (anyGoing) {
    // State 2→3: going → dead
    pushSpawnUndo('dead CH' + chNum);
    allEntries.forEach(function(e){ e.dead = true; delete e.going; delete e.goingColor; });
    saveSpawn(); buildMapDots(); renderSpawnTables();
  } else {
    // State 1→2: mark as "going" with user name
    ensureUserName(function(name, color) {
      pushSpawnUndo('going CH' + chNum + ' (' + name + ')');
      allEntries.forEach(function(e){ e.going = name; e.goingColor = color; });
      saveSpawn(); buildMapDots(); renderSpawnTables();
    });
  }
}

var FULGER_STATES = ['', 'sef', 'gen'];
// Validate/format MM:SS input
function validateMmSs(val) {
  val = val.trim();
  // Accept formats: MM:SS, M:SS, MMSS (4 digits), or just MM
  var m = val.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) {
    var mm = parseInt(m[1], 10), ss = parseInt(m[2], 10);
    if (ss > 59) return null;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  m = val.match(/^(\d{3,4})$/); // MMSS
  if (m) {
    var str = m[0].padStart(4,'0');
    var mm2 = parseInt(str.slice(0,-2),10), ss2 = parseInt(str.slice(-2),10);
    if (ss2 > 59) return null;
    return (mm2<10?'0':'') + mm2 + ':' + (ss2<10?'0':'') + ss2;
  }
  m = val.match(/^(\d{1,3})$/); // just minutes
  if (m) {
    return (parseInt(m[0],10)<10?'0':'') + parseInt(m[0],10) + ':00';
  }
  return null;
}

// Toggle the middle clock column in Timp Spawn table (pop-out only)
function _toggleTsMidCol(show) {
  var th = _findEl('timpspawnClockTh');
  if (th) th.style.display = show ? '' : 'none';
  // Adjust left Ora header border
  var oraLeft = _findEl('timpspawnOraLeft');
  if (oraLeft) oraLeft.style.borderRight = show ? 'none' : '2px solid var(--border-accent)';
  // Also toggle middle cells in tbody rows
  var tbody = _findEl('chSplitTableBody');
  if (tbody) {
    var rows = tbody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var midCell = rows[i].querySelector('.ts-mid-col');
      if (midCell) midCell.style.display = show ? '' : 'none';
      // Adjust border on left ORA cell
      var cells = rows[i].querySelectorAll('td');
      if (cells.length >= 2) cells[1].style.borderRight = show ? 'none' : '2px solid var(--border-accent)';
    }
  }
}

// Ctrl+Z undo stack for Timp Spawn CH times — [{chKey, value}], max 20 entries
var _chTimesUndoStack = [];
var _chUndoDocListeners = new WeakSet(); // prevent duplicate listeners per document

// Event delegation for chSplitTable — attached once per tbody, survives re-renders
var _chSplitDelegated = new WeakSet();
function _ensureChSplitDelegation(tbody) {
  if (_chSplitDelegated.has(tbody)) return;
  _chSplitDelegated.add(tbody);

  // CH label click → capture current MM:SS
  tbody.addEventListener('click', function(ev) {
    var td = ev.target.closest('.spawn-ch-clickable[data-nowch]');
    if (!td) return;
    ev.preventDefault();
    var chKey = td.dataset.nowch;
    var now = getSyncedNow();
    var mm = now.getMinutes();
    var ss = now.getSeconds();
    var formatted = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    var input = tbody.querySelector('.spawn-mmss[data-ch="' + chKey + '"]');
    if (input) { input.value = formatted; input.style.borderColor = ''; input.style.color = ''; }
    if (!spawnData.chTimes) spawnData.chTimes = {};
    var _prevChVal = spawnData.chTimes[chKey] || '';
    if (_chTimesUndoStack.length >= 20) _chTimesUndoStack.shift();
    _chTimesUndoStack.push({ chKey: chKey, value: _prevChVal });
    spawnData.chTimes[chKey] = formatted;
    _chTimeSetCooldown = Date.now();
    saveSpawn();
    td.classList.add('ch-flash-ok');
    setTimeout(function(){ td.classList.remove('ch-flash-ok'); }, 500);
  });

  // CH label right-click → toggle "beaten" visual state (direct DOM update, no full re-render)
  tbody.addEventListener('contextmenu', function(ev) {
    var td = ev.target.closest('.spawn-ch-clickable[data-nowch]');
    if (!td) return;
    ev.preventDefault();
    var chKey = td.dataset.nowch;
    if (!spawnData.chBeaten) spawnData.chBeaten = {};
    spawnData.chBeaten[chKey] = !spawnData.chBeaten[chKey];
    var beaten = !!spawnData.chBeaten[chKey];
    td.classList.toggle('ch-beaten', beaten);
    var inputCell = td.nextElementSibling;
    if (inputCell) inputCell.classList.toggle('ch-beaten-cell', beaten);
    saveSpawn();
  });

  // Input events via delegation
  tbody.addEventListener('input', function(ev) {
    var el = ev.target;
    if (!el.matches('.spawn-mmss[data-spa="chtime"]')) return;
    var v = el.value.replace(/[^0-9:]/g,'');
    if (v.length === 2 && !v.includes(':') && el.value.length > (el._prev || 0)) v = v + ':';
    el.value = v;
    el._prev = v.length;
  });
  tbody.addEventListener('keydown', function(ev) {
    var el = ev.target;
    if (el.matches('.spawn-mmss[data-spa="chtime"]')) el._prev = el.value.length;
  });
  tbody.addEventListener('keypress', function(ev) {
    if (ev.key === 'Enter' && ev.target.matches('.spawn-mmss')) ev.target.blur();
  });
  tbody.addEventListener('focusout', function(ev) {
    var el = ev.target;
    if (!el.matches('.spawn-mmss[data-spa="chtime"]')) return;
    var formatted = validateMmSs(el.value);
    if (formatted) {
      el.value = formatted; el.style.borderColor = ''; el.style.color = '';
    } else if (el.value.trim() !== '') {
      el.style.borderColor = 'var(--red)'; el.style.color = 'var(--red)';
      return;
    } else {
      el.value = ''; el.style.borderColor = ''; el.style.color = '';
    }
    if (!spawnData.chTimes) spawnData.chTimes = {};
    var _prevFocusVal = spawnData.chTimes[el.dataset.ch] || '';
    if (_prevFocusVal !== el.value) {
      if (_chTimesUndoStack.length >= 20) _chTimesUndoStack.shift();
      _chTimesUndoStack.push({ chKey: el.dataset.ch, value: _prevFocusVal });
    }
    spawnData.chTimes[el.dataset.ch] = el.value;
    _chTimeSetCooldown = Date.now();
    saveSpawn();
  });

  // Ctrl+Z undo — listen on main document (skipped when timpspawn pop-out is open)
  if (!_chUndoDocListeners.has(document)) {
    _chUndoDocListeners.add(document);
    document.addEventListener('keydown', function(ev) {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'z') return;
      // Skip: pop-out is open and handles its own Ctrl+Z
      if (_popoutActive.timpspawn && _popoutActive.timpspawn.popWin && !_popoutActive.timpspawn.popWin.closed) return;
      // Skip: user is typing in a text input
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'button' && ae.type !== 'checkbox' && ae.type !== 'range'))) return;
      if (!_chTimesUndoStack.length) return;
      ev.preventDefault();
      var entry = _chTimesUndoStack.pop();
      if (!spawnData.chTimes) spawnData.chTimes = {};
      spawnData.chTimes[entry.chKey] = entry.value;
      var inputEl = document.querySelector('.spawn-mmss[data-ch="' + entry.chKey + '"]');
      if (inputEl) { inputEl.value = entry.value; inputEl.style.borderColor = ''; inputEl.style.color = ''; }
      _chTimeSetCooldown = Date.now();
      saveSpawn();
      showToast('Undo', 'Timp CH restaurat');
    });
  }
}

function renderChSplitTable() {
  var tbody = _findEl('chSplitTableBody');
  if (!tbody || !spawnData) return;
  var ownerDoc = tbody.ownerDocument;
  if (!spawnData.chTimes) spawnData.chTimes = {};

  // Attach delegated listeners once
  _ensureChSplitDelegation(tbody);

  var odd  = [1, 3, 5];
  var even = [2, 4, 6];
  
  // Soft-update to avoid destroying active input focus (especially in pop-outs/re-renders)
  var existingRows = tbody.querySelectorAll('tr');
  if (existingRows.length === 3) {
    for (var r = 0; r < 3; r++) {
      var tr = existingRows[r];
      var chO = odd[r], chE = even[r];
      var keyO = 'ch' + chO, keyE = 'ch' + chE;
      var valO = spawnData.chTimes[keyO] || '';
      var valE = spawnData.chTimes[keyE] || '';
      var beatenO = !!(spawnData.chBeaten && spawnData.chBeaten[keyO]);
      var beatenE = !!(spawnData.chBeaten && spawnData.chBeaten[keyE]);

      var inputO = tr.querySelector('.spawn-mmss[data-ch="' + keyO + '"]');
      if (inputO && inputO !== ownerDoc.activeElement) {
        inputO.value = valO;
      }
      var tdLblO = tr.children[0];
      if (tdLblO) tdLblO.className = 'spawn-ch-label spawn-ch-clickable' + (beatenO ? ' ch-beaten' : '');
      var tdCellO = tr.children[1];
      if (tdCellO) tdCellO.className = beatenO ? 'ch-beaten-cell' : '';

      var inputE = tr.querySelector('.spawn-mmss[data-ch="' + keyE + '"]');
      if (inputE && inputE !== ownerDoc.activeElement) {
        inputE.value = valE;
      }
      var tdLblE = tr.children[3];
      if (tdLblE) tdLblE.className = 'spawn-ch-label spawn-ch-clickable' + (beatenE ? ' ch-beaten' : '');
      var tdCellE = tr.children[4];
      if (tdCellE) tdCellE.className = beatenE ? 'ch-beaten-cell' : '';
    }
  } else {
    tbody.innerHTML = '';
    for (var r = 0; r < 3; r++) {
      var chO = odd[r], chE = even[r];
      var keyO = 'ch' + chO, keyE = 'ch' + chE;
      var valO = spawnData.chTimes[keyO] || '';
    var valE = spawnData.chTimes[keyE] || '';
    var beatenO = !!(spawnData.chBeaten && spawnData.chBeaten[keyO]);
    var beatenE = !!(spawnData.chBeaten && spawnData.chBeaten[keyE]);
    var tr = ownerDoc.createElement('tr');
    tr.innerHTML =
      '<td class="spawn-ch-label spawn-ch-clickable' + (beatenO ? ' ch-beaten' : '') + '" data-nowch="' + keyO + '" style="font-size:11px;padding:4px 8px!important;cursor:pointer;user-select:none" title="Click: salveaza MM:SS curent · Click dreapta: batut/nebatut">CH ' + chO + '</td>' +
      '<td class="' + (beatenO ? 'ch-beaten-cell' : '') + '" style="padding:3px 5px!important;border-right:2px solid var(--border-accent)">' +
        '<input class="spawn-input spawn-mmss" type="text" value="' + escSp(valO) + '" ' +
        'placeholder="MM:SS" maxlength="6" ' +
        'data-spa="chtime" data-ch="' + keyO + '" style="width:72px;text-align:center;letter-spacing:1px;pointer-events:auto!important">' +
        '<div class="ts-cd" id="tsCd' + chO + '"></div>' +
      '</td>' +
      '<td class="ts-mid-col" style="border-left:2px solid var(--border-accent);border-right:2px solid var(--border-accent);padding:0;width:50px;min-width:50px;display:none"></td>' +
      '<td class="spawn-ch-label spawn-ch-clickable' + (beatenE ? ' ch-beaten' : '') + '" data-nowch="' + keyE + '" style="font-size:11px;padding:4px 8px!important;cursor:pointer;user-select:none" title="Click: salveaza MM:SS curent · Click dreapta: batut/nebatut">CH ' + chE + '</td>' +
      '<td class="' + (beatenE ? 'ch-beaten-cell' : '') + '" style="padding:3px 5px!important">' +
        '<input class="spawn-input spawn-mmss" type="text" value="' + escSp(valE) + '" ' +
        'placeholder="MM:SS" maxlength="6" ' +
        'data-spa="chtime" data-ch="' + keyE + '" style="width:72px;text-align:center;letter-spacing:1px;pointer-events:auto!important">' +
        '<div class="ts-cd" id="tsCd' + chE + '"></div>' +
      '</td>';
    tbody.appendChild(tr);
  }
  }
  // In pop-out, hide thead (clock is above table) and keep mid col hidden
  var _tsPopWin = _popoutActive.timpspawn && _popoutActive.timpspawn.popWin;
  if (_tsPopWin && !_tsPopWin.closed) {
    var _tsTable = tbody.closest('table');
    if (_tsTable) {
      var _thead = _tsTable.querySelector('thead');
      if (_thead) _thead.style.display = 'none';
    }
    // Immediately populate ts-cd spans to prevent 1-second flicker after DOM rebuild
    for (var _ci = 1; _ci <= 6; _ci++) {
      var _cdEl = ownerDoc.getElementById('tsCd' + _ci);
      if (!_cdEl) continue;
      var _chVal = spawnData.chTimes['ch' + _ci];
      if (!_chVal) continue;
      var _cdDiff = _chTimeDiff(_chVal);
      if (_cdDiff === null) continue;
      var _cdM = Math.floor(_cdDiff / 60), _cdS = _cdDiff % 60;
      _cdEl.textContent = _cdM + ':' + (_cdS < 10 ? '0' : '') + _cdS;
      _cdEl.className = 'ts-cd visible' + (_cdDiff <= 30 ? ' imminent' : _cdDiff <= 120 ? ' soon' : '');
    }
  }
}


function renderFulgerTable() { /* tabel eliminat */ }

function spawnFulgerSpateClick(e, type) {
  var cell = e.currentTarget;
  var ch   = cell.dataset.ch;
  if (!spawnData) return;
  var cur = spawnData.fulger[ch].spate;
  // Toggle: if already this type, clear it; otherwise set it
  spawnData.fulger[ch].spate = (cur === type) ? '' : type;
  saveSpawn(); renderFulgerTable();
}

function spawnStateClick(e) {
  var cell = e.currentTarget;
  var act  = cell.dataset.spa;
  var ch   = cell.dataset.ch;
  if (!spawnData) return;
  if (act === 'fulger-camera') {
    var CAMERA_STATES = ['', 'sef'];
    var c = spawnData.fulger[ch].camera;
    var ci = CAMERA_STATES.indexOf(c);
    spawnData.fulger[ch].camera = CAMERA_STATES[(ci + 1) % CAMERA_STATES.length];
    saveSpawn(); renderFulgerTable();
  }
}

function spawnInputChange(e) {
  var el  = e.currentTarget;
  var act = el.dataset.spa;
  var ch  = el.dataset.ch;
  if (!spawnData) return;
  // gheata-genfals: handled via button toggles now
  saveSpawn();
}

// ── Spawn Timer ─────────────────────────────────────────────────────
var SPAWN_CLEAR_MINUTES_BEFORE = 3;

function initSpawnTimer() {
  // Timer tick uses chTimes from Timp Spawn table — no manual input needed
  startSpawnTimerTick();
}

// Web Worker-based timer that isn't throttled when the tab is in background.
// Falls back to setInterval if Web Workers aren't available.
var _spawnTimerWorker = null;
function _createTimerWorker() {
  if (_spawnTimerWorker) return _spawnTimerWorker;
  try {
    var blob = new Blob([
      'var tid=null;onmessage=function(e){if(e.data==="start"){if(tid)clearInterval(tid);tid=setInterval(function(){postMessage("tick")},1000)}if(e.data==="stop"){if(tid){clearInterval(tid);tid=null}}}'
    ], { type: 'application/javascript' });
    var w = new Worker(URL.createObjectURL(blob));
    w.onmessage = function() { spawnTimerTick(); };
    _spawnTimerWorker = w;
    return w;
  } catch(e) { return null; }
}

function startSpawnTimerTick() {
  // Stop old timer
  if (spawnTimerInterval) { clearInterval(spawnTimerInterval); spawnTimerInterval = null; }
  if (_spawnTimerWorker) { _spawnTimerWorker.postMessage('stop'); }

  var worker = _createTimerWorker();
  if (worker) {
    worker.postMessage('start');
  } else {
    // Fallback to setInterval (will be throttled in background tabs)
    spawnTimerInterval = setInterval(spawnTimerTick, 1000);
  }
  spawnTimerTick();
}

// When page becomes visible or regains focus, immediately check alarms
// (catches any missed alarm windows during background throttling or system sleep)
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) spawnTimerTick();
});
window.addEventListener('focus', function() { spawnTimerTick(); });

var lastSpawnClearTime = 0;
var _chTimeSetCooldown = 0; // timestamp when CH time was last set manually
var lastWarn2min = {};   // per-CH 2min warning tracker
var lastWarn30s  = {};   // per-CH 30s warning tracker
var _lastTickMs = Date.now(); // tracks last tick for sleep-gap detection

var _spawnAlarmVolume = 0.8; // 0.0 - 1.0, controlled by slider

// Unique ID for this browser tab — assigned early in firebase-layer.js, kept here for clarity
if (!window._myClientId) window._myClientId = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

// ── User name/color system ──────────────────────────────────────────
var M2_NAME_KEY = 'm2_username';
var M2_COLOR_KEY = 'm2_usercolor';
var M2_USER_COLORS = [
  '#c8962e','#e6a817','#ff9800','#f57c00',
  '#e05252','#e91e63','#f06292','#e84393',
  '#bb86fc','#9b59b6','#7c4dff','#5c6bc0',
  '#4a9eff','#3498db','#0288d1','#00bcd4',
  '#1abc9c','#4caf82','#66bb6a','#8bc34a',
  '#78909c','#90a4ae','#b0bec5','#e0e0e0'
];

// Init profile button immediately (loadSpawn only runs when spawn tab is opened)
updateUserBtn();

function getM2UserName() { 
  if (window.currentUserProfile && window.currentUserProfile.name) return window.currentUserProfile.name;
  return localStorage.getItem(M2_NAME_KEY) || ''; 
}
function getM2UserColor() { 
  if (window.currentUserProfile && window.currentUserProfile.color) return window.currentUserProfile.color;
  return localStorage.getItem(M2_COLOR_KEY) || '#c8962e'; 
}
function setM2User(name, color) {
  localStorage.setItem(M2_NAME_KEY, name);
  localStorage.setItem(M2_COLOR_KEY, color);
}

var _profileModalCallback = null;

function showNameSetupModal(callback) {
  _profileModalCallback = callback;
  var currentName = getM2UserName();
  var currentColor = getM2UserColor();

  // Build swatches
  var container = document.getElementById('profileColorSwatches');
  container.innerHTML = M2_USER_COLORS.map(function(c) {
    return '<button class="color-swatch' + (c === currentColor ? ' selected' : '') +
      '" data-color="' + c + '" style="background:' + c + '"></button>';
  }).join('');

  // Set current color dot
  var currentDot = document.getElementById('profileCurrentColor');
  currentDot.style.background = currentColor;

  // Set avatar
  var avatar = document.getElementById('profileModalAvatar');
  avatar.style.background = currentColor;
  avatar.textContent = currentName ? currentName.charAt(0).toUpperCase() : '?';

  // Reset dropdown state
  document.querySelector('.color-picker-dropdown').classList.remove('pinned');

  // Set name
  var nameInput = document.getElementById('profileNameInput');
  nameInput.value = currentName;

  openModal('profileModal');
  setTimeout(function() { nameInput.focus(); nameInput.select(); }, 100);
}

// Profile modal event handlers (delegated, set up once)
(function() {
  var swatchGrid = document.getElementById('profileColorSwatches');
  var avatar = document.getElementById('profileModalAvatar');
  var nameInput = document.getElementById('profileNameInput');

  if (!swatchGrid) return;

  var currentDot = document.getElementById('profileCurrentColor');
  var dropdown = document.querySelector('.color-picker-dropdown');

  // Click on the dot pins/unpins the dropdown open
  currentDot.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdown.classList.toggle('pinned');
  });

  // Click outside the color picker closes the dropdown
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.color-picker-compact')) {
      dropdown.classList.remove('pinned');
    }
  });

  swatchGrid.addEventListener('click', function(e) {
    var swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    swatchGrid.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('selected'); });
    swatch.classList.add('selected');
    var color = swatch.dataset.color;
    avatar.style.background = color;
    currentDot.style.background = color;
  });

  nameInput.addEventListener('input', function() {
    var n = nameInput.value.trim();
    avatar.textContent = n ? n.charAt(0).toUpperCase() : '?';
  });

  document.getElementById('profileSave').addEventListener('click', function() {
    var name = nameInput.value.trim();
    if (!name) { nameInput.style.borderColor = 'var(--red, #e05252)'; return; }
    var sel = swatchGrid.querySelector('.color-swatch.selected');
    var color = sel ? sel.dataset.color : M2_USER_COLORS[0];
    setM2User(name, color);
    closeModal('profileModal');
    updateUserBtn();
    if (_profileModalCallback) _profileModalCallback(name, color);
  });

  document.getElementById('profileCancel').addEventListener('click', function() {
    closeModal('profileModal');
  });

  nameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('profileSave').click();
  });
})()

function ensureUserName(callback) {
  var name = getM2UserName();
  if (name) { callback(name, getM2UserColor()); return; }
  showNameSetupModal(function(n, c) {
    updateUserBtn();
    callback(n, c);
  });
}

// Unlock AudioContext on first user gesture (browser autoplay policy)
var _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var buf = ctx.createBuffer(1, 1, 22050);
    var src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0);
    setTimeout(function(){ try{ctx.close();}catch(e){} }, 500);
  } catch(e) {}
}
document.addEventListener('click', _unlockAudio);
document.addEventListener('keydown', _unlockAudio);

// type: '2min' = low/slow warning (500Hz, 0.6s beeps, every 1.2s)
// type: '2min' = warning siren (lower, slower)
// type: '30s'  = urgent alarm (higher, faster, more intense)
// Both play for ~10 seconds
var _alarmAudioCtx = null;

function playSpawnAlarm(type) {
  try {
    if (_alarmAudioCtx) { try { _alarmAudioCtx.close(); } catch(e){} _alarmAudioCtx = null; }
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    _alarmAudioCtx = ctx;
    var sliderVol = (typeof _spawnAlarmVolume !== 'undefined') ? _spawnAlarmVolume : 0.8;
    var t0 = ctx.currentTime;

    if (type === '2min') {
      // ── Gentle notification: 3 soft ascending chime tones, played twice ──
      var vol = sliderVol * 0.3;
      var chimes = [
        { freq: 523, start: 0,    dur: 0.35 },  // C5
        { freq: 659, start: 0.30, dur: 0.35 },  // E5
        { freq: 784, start: 0.60, dur: 0.50 },  // G5 (held longer)
        // Second round, softer
        { freq: 523, start: 1.8,  dur: 0.35 },
        { freq: 659, start: 2.1,  dur: 0.35 },
        { freq: 784, start: 2.4,  dur: 0.50 },
      ];
      chimes.forEach(function(c, idx) {
        var tStart = t0 + c.start;
        var osc1 = ctx.createOscillator();
        var osc2 = ctx.createOscillator(); // soft octave harmonic
        var g = ctx.createGain();
        var g2 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = c.freq;
        osc2.type = 'sine';
        osc2.frequency.value = c.freq * 2;
        g2.gain.value = 0.08; // very quiet harmonic
        osc1.connect(g);
        osc2.connect(g2);
        g2.connect(g);
        g.connect(ctx.destination);
        // Soft second-round volume
        var thisVol = idx >= 3 ? vol * 0.7 : vol;
        // Smooth bell-like envelope: quick attack, slow fade
        g.gain.setValueAtTime(0, tStart);
        g.gain.linearRampToValueAtTime(thisVol, tStart + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, tStart + c.dur);
        osc1.start(tStart);
        osc1.stop(tStart + c.dur + 0.02);
        osc2.start(tStart);
        osc2.stop(tStart + c.dur + 0.02);
      });
    } else {
      // ── 30s alert: firm but pleasant ding-dong pattern ──
      // 3 pairs of hi-lo tones with smooth bell-like decay
      var vol = sliderVol * 0.35;
      var pairs = [
        { hi: 698, lo: 523, start: 0    },  // F5 → C5
        { hi: 698, lo: 523, start: 0.9  },  // repeat
        { hi: 784, lo: 587, start: 1.8  },  // G5 → D5 (rising for urgency)
      ];
      pairs.forEach(function(pair) {
        // High tone (ding)
        var osc1 = ctx.createOscillator();
        var osc1h = ctx.createOscillator(); // soft overtone
        var g1 = ctx.createGain();
        var g1h = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = pair.hi;
        osc1h.type = 'sine';
        osc1h.frequency.value = pair.hi * 3; // bell-like 3rd harmonic
        g1h.gain.value = 0.04;
        osc1.connect(g1);
        osc1h.connect(g1h);
        g1h.connect(g1);
        g1.connect(ctx.destination);
        var t1 = t0 + pair.start;
        g1.gain.setValueAtTime(0, t1);
        g1.gain.linearRampToValueAtTime(vol, t1 + 0.01);
        g1.gain.exponentialRampToValueAtTime(0.001, t1 + 0.4);
        osc1.start(t1); osc1.stop(t1 + 0.42);
        osc1h.start(t1); osc1h.stop(t1 + 0.42);
        // Low tone (dong)
        var osc2 = ctx.createOscillator();
        var osc2h = ctx.createOscillator();
        var g2 = ctx.createGain();
        var g2h = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = pair.lo;
        osc2h.type = 'sine';
        osc2h.frequency.value = pair.lo * 3;
        g2h.gain.value = 0.04;
        osc2.connect(g2);
        osc2h.connect(g2h);
        g2h.connect(g2);
        g2.connect(ctx.destination);
        var t2 = t1 + 0.35;
        g2.gain.setValueAtTime(0, t2);
        g2.gain.linearRampToValueAtTime(vol * 0.85, t2 + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.45);
        osc2.start(t2); osc2.stop(t2 + 0.47);
        osc2h.start(t2); osc2h.stop(t2 + 0.47);
      });
    }
  } catch(err) {}
}

function stopSpawnAlarm() {
  if (_alarmAudioCtx) {
    try { _alarmAudioCtx.close(); } catch(e){}
    _alarmAudioCtx = null;
  }
}

// Calm notification sound for alerte/reminders — gentle two-tone chime, not alarming
function playAlertaSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var vol = (typeof window._alerteVolume !== 'undefined') ? window._alerteVolume * 0.6 : 0.4;
    var t = ctx.currentTime;
    // Two soft sine tones: E5 then G5
    [[659, 0], [784, 0.18]].forEach(function(pair) {
      var freq = pair[0], delay = pair[1];
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(vol, t + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.55);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + delay); osc.stop(t + delay + 0.6);
    });
    setTimeout(function() { try { ctx.close(); } catch(e){} }, 1200);
  } catch(e) {}
}

// Helper: compute seconds until next occurrence of MM:SS within the hour
function _chTimeDiff(chVal) {
  var parts = chVal.split(':');
  if (parts.length !== 2) return null;
  var tMin = parseInt(parts[0], 10), tSec = parseInt(parts[1], 10);
  if (isNaN(tMin) || isNaN(tSec)) return null;
  var now = getSyncedNow();
  var nowInHour = now.getMinutes() * 60 + now.getSeconds();
  var targetInHour = tMin * 60 + tSec;
  var diff = targetInHour - nowInHour;
  if (diff <= 0) diff += 3600;
  return diff;
}


function spawnTimerTick() {
  // Detect sleep/throttle gap — if >3s since last tick, page was asleep
  var nowMs = Date.now();
  var gap = nowMs - _lastTickMs;
  _lastTickMs = nowMs;
  var wasSleeping = gap > 3000;

  updateHeaderSpawnTimer();
  updateSpawnTimeStrip();

  // Delayed spawn type switch (5 mins after CH1 spawn)
  if (spawnData && spawnData._spawnTypeChangesAt && Date.now() >= spawnData._spawnTypeChangesAt) {
    delete spawnData._spawnTypeChangesAt;
    syncSpawnType(false, true, 0, 'delayed_switch');
  }
  var display = document.getElementById('spawnTimerDisplay');

  // Use CH1 from Timp Spawn table as the main countdown source
  var ch1Val = (spawnData && spawnData.chTimes && spawnData.chTimes['ch1']) ? spawnData.chTimes['ch1'] : '';
  var ch1Diff = ch1Val ? _chTimeDiff(ch1Val) : null;

  if (display) {
    if (ch1Diff === null) {
      display.textContent = '';
      display.className = 'spawn-timer-display';
      // Fallback for 00:00 / no time: sync immediately
      syncSpawnType(true, false, 0, 'initial_sync');
    } else {
      var m = Math.floor(ch1Diff / 60);
      var s = ch1Diff % 60;
      if (ch1Diff <= 0) {
        display.className = 'spawn-timer-display warning';
        display.textContent = 'SPAWN!';
        // At 00:00 exactly, ensure we are synced if not already
        if (ch1Diff === 0) syncSpawnType(true, false, 0, 'fix_at_00');
      } else {
        display.textContent = 'Spawn in ' + m + ':' + (s < 10 ? '0' : '') + s;
        display.className = ch1Diff <= SPAWN_CLEAR_MINUTES_BEFORE * 60 ? 'spawn-timer-display warning' : 'spawn-timer-display active';
        
        // Proactive sync: check 60s before spawn
        if (ch1Diff > 45 && ch1Diff <= 60) {
          syncSpawnType(false, true, 0, 'proactive_60s');
        }
      }
    }
  }

  // Only count as organic near-zero if NOT in calibration cooldown (last 60s).
  // Prevents user setting CH1 to a near-zero time from being treated as a real spawn.
  var isCooldownActive = (Date.now() - _chTimeSetCooldown) < 60000;
  if (ch1Diff !== null && ch1Diff <= 10 && !isCooldownActive) {
    window._ch1OrganicNearZeroAt = Date.now();
  }

  // Detect if we crossed the spawn boundary during a background tab throttle or short sleep.
  var ch1Wrapped = false;
  if (window._prevCh1Diff !== undefined && window._prevCh1Diff !== null && ch1Diff !== null) {
    if (window._prevCh1Diff <= 300 && ch1Diff >= 3300 && gap <= 300000) {
      ch1Wrapped = true;
    }
  }
  window._prevCh1Diff = ch1Diff;

  // Auto-clear when CH1 spawn time is reached (diff wraps from ~0 to ~3590+)
  if (ch1Diff !== null && (ch1Diff >= 3590 || ch1Wrapped)) {
    var now = getSyncedNow();
    var clearKey = ch1Val + '_h' + now.getHours();
    var cooldownOk = !isCooldownActive;
    var organicSpawn = !!(window._ch1OrganicNearZeroAt && (Date.now() - window._ch1OrganicNearZeroAt) < 120000);
    if (lastSpawnClearTime !== clearKey) {
      if (cooldownOk || organicSpawn) {
        lastSpawnClearTime = clearKey;
        window._spawnResetPending = null;
        clearSpawnForRespawn();
      } else if (ch1Wrapped) {
        lastSpawnClearTime = clearKey;
        window._spawnResetPending = null;
        _clearTablesSpawnSkip(clearKey);
      } else {
        // Blocked by calibration cooldown — defer until cooldown clears (max 5 min)
        if (!window._spawnResetPending) {
          window._spawnResetPending = { clearKey: clearKey, blockedAt: Date.now() };
        }
      }
    }
  }

  // Process deferred reset once cooldown expires
  if (window._spawnResetPending) {
    var _pendingReset = window._spawnResetPending;
    if ((Date.now() - _chTimeSetCooldown) > 60000) {
      window._spawnResetPending = null;
      if (lastSpawnClearTime !== _pendingReset.clearKey && (Date.now() - _pendingReset.blockedAt) < 300000) {
        lastSpawnClearTime = _pendingReset.clearKey;
        clearSpawnForRespawn();
      }
    }
  }

  // Alarms for CH1 and CH2 — only for users in an active team
  if (!window.currentUserProfile || !(window.currentUserProfile.currentTeamId || window.currentUserProfile.teamId)) return;
  // Uses sleep-aware detection: if page was asleep and alarm window was crossed,
  // fire the alarm immediately on wake (even if the exact second was missed)
  var alarmChs = ['ch1', 'ch2'];
  var gapSec = Math.floor(gap / 1000); // how many seconds were skipped
  for (var ai = 0; ai < alarmChs.length; ai++) {
    var chKey = alarmChs[ai];
    var chVal = (spawnData && spawnData.chTimes && spawnData.chTimes[chKey]) ? spawnData.chTimes[chKey] : '';
    if (!chVal) continue;
    var chDiff = _chTimeDiff(chVal);
    if (chDiff === null) continue;
    var nowObj = getSyncedNow();
    var cycleKey = chVal + '_' + chKey + '_h' + nowObj.getHours();
    var chLabel = chKey.toUpperCase().replace('CH', 'CH ');

    // What chDiff was ~before the sleep gap (approximate)
    var prevDiff = wasSleeping ? chDiff + gapSec : chDiff + 1;

    // 2-minute warning (CH1 only, fires once per cycle)
    // Fire if currently in window OR if window was crossed during sleep
    if (chKey === 'ch1') {
      var in2min = chDiff <= 120 && chDiff > 0;
      var crossed2min = wasSleeping && prevDiff > 120 && chDiff <= 120 && chDiff > 0;
      if ((in2min || crossed2min) && !lastWarn2min[cycleKey] && lastWarn2min[cycleKey] !== 'DONE') {
        lastWarn2min[cycleKey] = true;
        playSpawnAlarm('2min');
      }
    }

    // 30-second urgent alarm with overlay
    // Fire if currently in window OR if window was crossed during sleep
    var in30s = chDiff <= 30 && chDiff > 0;
    var crossed30s = wasSleeping && prevDiff > 30 && chDiff <= 30 && chDiff > 0;
    if ((in30s || crossed30s) && !lastWarn30s[cycleKey] && lastWarn30s[cycleKey] !== 'DONE') {
      lastWarn30s[cycleKey] = true;
      playSpawnAlarm('30s');
      showSpawnAlarmOverlay(chDiff, chVal + '_' + chKey + '_' + nowObj.getHours(), chLabel, chVal);
    }

    // Also catch case where page slept through the ENTIRE alarm window
    // (e.g., slept from chDiff=200 and woke at chDiff=3500 after spawn passed)
    if (wasSleeping && prevDiff > 30 && (chDiff > 3500 || chDiff <= 0)) {
      // Spawn already happened while sleeping — fire 30s alarm so user knows
      if (!lastWarn30s[cycleKey] && lastWarn30s[cycleKey] !== 'DONE') {
        lastWarn30s[cycleKey] = true;
        playSpawnAlarm('30s');
        showSpawnAlarmOverlay(0, chVal + '_' + chKey + '_' + nowObj.getHours(), chLabel + ' (RATAT)', chVal);
      }
    }

    // Reset markers when well outside alarm windows (ready for next cycle)
    // Use > 180 to avoid boundary flickering where chDiff oscillates around 30/120
    if (chDiff > 180 && chDiff < 3500) {
      if (lastWarn2min[cycleKey]) delete lastWarn2min[cycleKey];
      if (lastWarn30s[cycleKey]) delete lastWarn30s[cycleKey];
    }
  }
}

// Custom on-screen alarm overlay for 30s warning
var _spawnAlarmTimeout = null;
var _spawnAlarmCdInterval = null;
var _spawnAlarmRepeatInterval = null; // repeats alarm sound until confirmed

// Dismiss alarm from all windows (main + pop-outs)
function _dismissAlarmEverywhere() {
  // Main page
  var o = document.getElementById('spawnAlarmOverlay');
  if (o) o.remove();
  // All pop-outs
  var types = ['gheata', 'timpspawn', 'harta'];
  for (var t = 0; t < types.length; t++) {
    var p = _popoutActive[types[t]];
    if (p && p.popWin && !p.popWin.closed) {
      try {
        var po = p.popWin.document.getElementById('spawnAlarmOverlay');
        if (po) po.remove();
      } catch(e) {}
    }
  }
}

// Inject alarm overlay into all open pop-out windows
function _injectAlarmIntoPopouts(label, secondsLeft, targetMmSs, clearKey) {
  var types = ['gheata', 'timpspawn', 'harta'];
  for (var t = 0; t < types.length; t++) {
    var p = _popoutActive[types[t]];
    if (!p || !p.popWin || p.popWin.closed) continue;
    try {
      var doc = p.popWin.document;
      // Remove existing overlay in this pop-out
      var ex = doc.getElementById('spawnAlarmOverlay');
      if (ex) ex.remove();
      // Inject CSS if not already there
      if (!doc.getElementById('spawnAlarmCss')) {
        var style = doc.createElement('style');
        style.id = 'spawnAlarmCss';
        style.textContent =
          '.spawn-alarm-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;animation:alarmFade .2s ease;padding:8px}' +
          '.spawn-alarm-box{background:var(--surface-dark,#1a1a2e);border:2px solid var(--red,#ff5252);border-radius:clamp(8px,3vw,16px);padding:clamp(12px,4vw,28px) clamp(14px,5vw,36px);text-align:center;max-width:380px;width:90%;box-sizing:border-box}' +
          '.spawn-alarm-icon{font-size:clamp(24px,8vw,42px);margin-bottom:clamp(4px,1.5vw,8px)}' +
          '.spawn-alarm-title{font-size:clamp(.85em,3.5vw,1.3em);font-weight:700;color:var(--red,#ff5252);margin-bottom:clamp(4px,1.5vw,8px)}' +
          '.spawn-alarm-sub{color:#ccc;margin-bottom:clamp(10px,3vw,18px);font-size:clamp(.75em,2.8vw,.95em)}' +
          '.spawn-alarm-confirm{background:var(--red,#ff5252);color:#fff;border:none;border-radius:8px;padding:clamp(8px,2.5vw,12px) clamp(14px,4vw,28px);font-size:clamp(.8em,2.8vw,1em);font-weight:600;cursor:pointer;width:100%;transition:background .2s}' +
          '.spawn-alarm-confirm:hover{background:#ff7070}' +
          '@keyframes alarmFade{from{opacity:0}to{opacity:1}}';
        doc.head.appendChild(style);
      }
      var overlay = doc.createElement('div');
      overlay.className = 'spawn-alarm-overlay';
      overlay.id = 'spawnAlarmOverlay';
      overlay.innerHTML =
        '<div class="spawn-alarm-box">' +
          '<div class="spawn-alarm-icon">&#x26A0;&#xFE0F;</div>' +
          '<div class="spawn-alarm-title">' + (label ? label + ' — SPAWN IMINENT!' : 'SPAWN IMINENT!') + '</div>' +
          '<div class="spawn-alarm-sub">Au mai ramas <strong class="popout-alarm-sec" style="color:var(--red,#ff5252);font-size:1.3em">' + secondsLeft + '</strong> secunde pana la respawn!</div>' +
          '<button class="spawn-alarm-confirm">&#x2713; Am inteles, opreste alarma</button>' +
        '</div>';
      doc.body.appendChild(overlay);
      // Confirm button dismisses alarm everywhere
      var btn = overlay.querySelector('.spawn-alarm-confirm');
      if (btn) {
        btn.addEventListener('click', function() {
          var ck = String(clearKey || '');
          var parts = ck.match(/^(.+)_ch(\d+)_(\d+)$/);
          if (parts) {
            var fck = parts[1] + '_ch' + parts[2] + '_h' + parts[3];
            lastWarn30s[fck] = 'DONE';
            lastWarn2min[fck] = 'DONE';
          }
          stopSpawnAlarm();
          if (_spawnAlarmRepeatInterval) { clearInterval(_spawnAlarmRepeatInterval); _spawnAlarmRepeatInterval = null; }
          if (_spawnAlarmCdInterval) { clearInterval(_spawnAlarmCdInterval); _spawnAlarmCdInterval = null; }
          if (_spawnAlarmTimeout) { clearTimeout(_spawnAlarmTimeout); _spawnAlarmTimeout = null; }
          _dismissAlarmEverywhere();
        });
      }
    } catch(e) {}
  }
}

// Update countdown in pop-out alarm overlays (called from main countdown interval)
function _updatePopoutAlarmCountdown(remaining) {
  var types = ['gheata', 'timpspawn', 'harta'];
  for (var t = 0; t < types.length; t++) {
    var p = _popoutActive[types[t]];
    if (!p || !p.popWin || p.popWin.closed) continue;
    try {
      var secEl = p.popWin.document.querySelector('.popout-alarm-sec');
      if (secEl) secEl.textContent = remaining;
      // Remove overlay if countdown done
      if (remaining <= 0) {
        var ov = p.popWin.document.getElementById('spawnAlarmOverlay');
        if (ov) ov.remove();
      }
    } catch(e) {}
  }
}

// targetMmSs: optional 'MM:SS' string for CH2-style clock countdown
function showSpawnAlarmOverlay(secondsLeft, clearKey, customLabel, targetMmSs) {
  // Remove any existing overlay
  var existing = document.getElementById('spawnAlarmOverlay');
  if (existing) existing.remove();
  if (_spawnAlarmTimeout) { clearTimeout(_spawnAlarmTimeout); _spawnAlarmTimeout = null; }
  if (_spawnAlarmCdInterval) { clearInterval(_spawnAlarmCdInterval); _spawnAlarmCdInterval = null; }
  if (_spawnAlarmRepeatInterval) { clearInterval(_spawnAlarmRepeatInterval); _spawnAlarmRepeatInterval = null; }

  var overlay = document.createElement('div');
  overlay.className = 'spawn-alarm-overlay';
  overlay.id = 'spawnAlarmOverlay';
  overlay.innerHTML =
    '<div class="spawn-alarm-box">' +
      '<div class="spawn-alarm-icon">&#x26A0;&#xFE0F;</div>' +
      '<div class="spawn-alarm-title">' + (customLabel ? customLabel + ' — SPAWN IMINENT!' : 'SPAWN IMINENT!') + '</div>' +
      '<div class="spawn-alarm-sub">Au mai ramas <strong id="spawnAlarmSec" style="color:var(--red);font-size:1.3em">' + secondsLeft + '</strong> secunde pana la respawn!</div>' +
      '<button class="spawn-alarm-confirm" id="spawnAlarmConfirm">&#x2713; Am inteles, opreste alarma</button>' +
    '</div>';

  document.body.appendChild(overlay);

  // Also inject overlay into all open pop-out windows so users see it there too
  _injectAlarmIntoPopouts(customLabel, secondsLeft, targetMmSs, clearKey);

  // Repeat alarm sound every 4 seconds until user confirms
  _spawnAlarmRepeatInterval = setInterval(function() {
    if (!document.getElementById('spawnAlarmOverlay')) {
      clearInterval(_spawnAlarmRepeatInterval); _spawnAlarmRepeatInterval = null; return;
    }
    playSpawnAlarm('30s');
  }, 4000);

  // Real-time countdown using MM:SS from chTimes
  _spawnAlarmCdInterval = setInterval(function() {
    var secEl = document.getElementById('spawnAlarmSec');
    if (!secEl || !document.getElementById('spawnAlarmOverlay')) {
      clearInterval(_spawnAlarmCdInterval); _spawnAlarmCdInterval = null; return;
    }
    var remaining;
    if (targetMmSs) {
      var parts = targetMmSs.split(':');
      var tMin = parseInt(parts[0], 10), tSec = parseInt(parts[1], 10);
      var nowObj = getSyncedNow();
      var nowInHour = nowObj.getMinutes() * 60 + nowObj.getSeconds();
      var targetInHour = tMin * 60 + tSec;
      remaining = targetInHour - nowInHour;
      if (remaining <= 0) remaining = 0;
    } else {
      remaining = 0;
    }
    remaining = Math.max(0, Math.floor(remaining));
    secEl.textContent = remaining;
    // Sync countdown in pop-out overlays too
    _updatePopoutAlarmCountdown(remaining);
    if (remaining <= 0) {
      // Mark alarm as DONE so it won't re-fire after auto-close
      var ck = String(clearKey || '');
      var ckParts = ck.match(/^(.+)_ch(\d+)_(\d+)$/);
      if (ckParts) {
        var fck = ckParts[1] + '_ch' + ckParts[2] + '_h' + ckParts[3];
        lastWarn30s[fck] = 'DONE';
        lastWarn2min[fck] = 'DONE';
      }
      clearInterval(_spawnAlarmCdInterval); _spawnAlarmCdInterval = null;
      if (_spawnAlarmRepeatInterval) { clearInterval(_spawnAlarmRepeatInterval); _spawnAlarmRepeatInterval = null; }
      stopSpawnAlarm();
      _dismissAlarmEverywhere();
    }
  }, 500);

  var confirmBtn = overlay.querySelector('.spawn-alarm-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function() {
      var ck = String(clearKey || '');
      var parts = ck.match(/^(.+)_ch(\d+)_(\d+)$/);
      if (parts) {
        var fullCycleKey = parts[1] + '_ch' + parts[2] + '_h' + parts[3];
        lastWarn30s[fullCycleKey] = 'DONE';
        lastWarn2min[fullCycleKey] = 'DONE';
      }
      stopSpawnAlarm();
      if (_spawnAlarmRepeatInterval) { clearInterval(_spawnAlarmRepeatInterval); _spawnAlarmRepeatInterval = null; }
      if (_spawnAlarmCdInterval) { clearInterval(_spawnAlarmCdInterval); _spawnAlarmCdInterval = null; }
      if (_spawnAlarmTimeout) { clearTimeout(_spawnAlarmTimeout); _spawnAlarmTimeout = null; }
      _dismissAlarmEverywhere();
    });
  }
}

// Shared reset logic — clears rooms, fulger, chBeaten; preserves chTimes and gheata
function doResetSpawnTables() {
  if (!spawnData) return;
  spawnData.rooms = {};
  spawnData.chBeaten = {};
  // Only clear dead pins — alive (ascuns) pins persist through resets
  if (spawnData.pins) {
    Object.keys(spawnData.pins).forEach(function(pk) {
      if (spawnData.pins[pk] && spawnData.pins[pk].dead) {
        delete spawnData.pins[pk];
      }
    });
  }
  if (!spawnData.fulger) spawnData.fulger = {};
  for (var i = 1; i <= 6; i++) {
    spawnData.fulger['ch' + i] = { spate: '', camera: '' };
  }
  // NOTE: Do NOT reset lastSpawnClearTime or alarm markers here.
  // Alarm markers (lastWarn2min, lastWarn30s) expire naturally via chDiff > 120 reset.
  // Wiping them here caused alarms to re-fire immediately after auto-clear.
  localStorage.setItem(SPAWN_KEY, JSON.stringify(spawnData));
  buildMapDots();
  renderSpawnTables();
  if (typeof dropTrackerOnSpawnReset === 'function') dropTrackerOnSpawnReset();
}


// Compute the current spawn cycle's clearKey and mark it as handled
// so spawnTimerTick won't call clearSpawnForRespawn again for the same cycle.
function _markSpawnCycleHandled() {
  var ch1Val = (spawnData && spawnData.chTimes && spawnData.chTimes['ch1']) ? spawnData.chTimes['ch1'] : '';
  if (!ch1Val) return;
  var now = getSyncedNow();
  lastSpawnClearTime = ch1Val + '_h' + now.getHours();
}

function _isSpawnEmpty() {
  if (!spawnData) return true;
  // Check if any real entries exist on the map (rooms)
  var hasRoomData = false;
  if (spawnData.rooms) {
    Object.keys(spawnData.rooms).forEach(function(rid) {
      if (rid === '_nf') return;
      (spawnData.rooms[rid] || []).forEach(function(e) {
        if (e.type === 'sef' || e.type === 'gen') hasRoomData = true;
      });
    });
  }
  // Check if any gheata data was filled
  var hasGheataData = false;
  if (spawnData.gheata) {
    Object.keys(spawnData.gheata).forEach(function(chKey) {
      var g = spawnData.gheata[chKey];
      if (!g) return;
      if (g.genFals && g.genFals.trim()) hasGheataData = true;
      if (g.gf18 || g.gfF) hasGheataData = true;
    });
  }
  var hasPins = false;
  if (spawnData.pins) {
    Object.keys(spawnData.pins).forEach(function(k) {
      if (spawnData.pins[k] && spawnData.pins[k].x) hasPins = true;
    });
  }
  return !hasRoomData && !hasGheataData && !hasPins;
}


// Spawn skip: CH1 was moved earlier and the spawn passed without being tracked.
// Clears tables and gheata markers but does NOT flip the spawn type.
function _clearTablesSpawnSkip(cycleKey) {
  if (!spawnData) return;
  if (typeof fbSaveDebounce !== 'undefined' && fbSaveDebounce['spawn']) {
    clearTimeout(fbSaveDebounce['spawn']);
    delete fbSaveDebounce['spawn'];
  }
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/data/_spawnCycle')).transaction(function(current) {
      if (current && current.key === cycleKey) return; // already handled
      return { key: cycleKey, ts: Date.now() };
    }, function(error, committed) {
      if (error) { console.warn('[spawn] skip cycle transaction error:', error); return; }
      if (!committed) return;
      if (!_isSpawnEmpty()) pushSpawnHistory();
      doResetSpawnTables();
      spawnData._spawnCycle = { key: cycleKey, ts: Date.now() };
      _markSpawnCycleHandled();
      _chTimeSetCooldown = Date.now();
      var toWrite = JSON.parse(JSON.stringify(spawnData));
      toWrite._resetAt = Date.now();
      toWrite.rooms = null;
      toWrite.entries = null;
      var alivePins = {};
      if (spawnData.pins) {
        Object.keys(spawnData.pins).forEach(function(pk) {
          if (spawnData.pins[pk] && spawnData.pins[pk].x) alivePins[pk] = spawnData.pins[pk];
        });
      }
      toWrite.pins = Object.keys(alivePins).length > 0 ? alivePins : null;
      db.ref(p('spawn/data')).set(toWrite).catch(function(e) {
        console.warn('[spawn] Firebase write error:', e);
      });
      _prevFbSnapshot = _sanitize(JSON.parse(JSON.stringify({
        rooms: spawnData.rooms, gheata: spawnData.gheata, fulger: spawnData.fulger,
        chTimes: spawnData.chTimes, pins: spawnData.pins, spawnType: spawnData.spawnType,
        spawnTime: spawnData.spawnTime, chBeaten: spawnData.chBeaten, anchor: spawnData.anchor
      })));
      _lastSpawnHash = JSON.stringify(spawnData);
      if (fbSaveDebounce['spawn']) { clearTimeout(fbSaveDebounce['spawn']); delete fbSaveDebounce['spawn']; }
      showToast('Spawn skip detectat', 'Tabelele au fost sterse (tipul spawn pastrat)');
    });
  } else {
    var _sc = spawnData._spawnCycle || {};
    if (_sc.key === cycleKey) return;
    if (!_isSpawnEmpty()) pushSpawnHistory();
    _clearGheataMarkers();
    doResetSpawnTables();
    spawnData._spawnCycle = { key: cycleKey, ts: Date.now() };
    _markSpawnCycleHandled();
    saveSpawn();
  }
}

function clearSpawnForRespawn() {
  if (!spawnData) return;

  // Cancel any pending granular diff write BEFORE the transaction.
  // All clients call this simultaneously on spawn — the loser's debounce (300ms)
  // could fire with stale room entries AFTER the winner's reset lands on Firebase,
  // resurrecting old gheata/room data. Cancelling here prevents that race.
  if (typeof fbSaveDebounce !== 'undefined' && fbSaveDebounce['spawn']) {
    clearTimeout(fbSaveDebounce['spawn']);
    delete fbSaveDebounce['spawn'];
  }

  // 60-minute epoch bucket — same key used by both auto-switch and manual reset
  var cycleKey = String(Math.floor(getSyncedNow().getTime() / (60 * 60 * 1000)));

  // Client-side guard: minimum 5 minutes between any two switches.
  // Prevents recalibration from triggering a second switch right after spawn.
  var MIN_SWITCH_GAP = 5 * 60 * 1000;
  var _lastTs = spawnData._spawnCycle && spawnData._spawnCycle.ts;
  if (_lastTs && (Date.now() - _lastTs < MIN_SWITCH_GAP)) return;

  if (typeof db !== 'undefined' && db) {
    // Transaction on _spawnCycle — single dedup node for both auto and manual triggers.
    // Stores only { key, ts } — type is never stored here, always read from spawnData.spawnType.
    db.ref(p('spawn/data/_spawnCycle')).transaction(function(current) {
      if (current && current.key === cycleKey) return; // abort — already handled this cycle
      return { key: cycleKey, ts: Date.now() };
    }, function(error, committed, snapshot) {
      if (error) { console.warn('[spawn] cycle transaction error:', error); return; }
      if (!committed) return; // another client already handled this cycle

      var cycleData = snapshot.val();
      var prevType = spawnData.spawnType || 'simplu';
      var nextUtcHour = (getSyncedNow().getUTCHours() + 1) % 24;
      var nextType = getSpawnTypeByParity(nextUtcHour) || (prevType === 'dublu' ? 'simplu' : 'dublu');

      // Update anchor: this reset = start of new cycle, next spawn = nextType
      var anchorInterval = (spawnData.anchor && spawnData.anchor.intervalMs) || 3600000;
      spawnData.anchor = { ts: Date.now(), type: nextType, intervalMs: anchorInterval };

      logSpawnTypeChange(prevType, 'reset_scheduled', prevType);

      // Switch to next type immediately; keep prev for 15-min grace period in pop-out
      spawnData.spawnType = nextType;
      spawnData._prevSpawnType = prevType;
      spawnData._spawnCycle = { key: cycleKey, ts: cycleData.ts };
      updateSpawnTypeUI();

      if (!_isSpawnEmpty()) pushSpawnHistory();
      doResetSpawnTables();
      _markSpawnCycleHandled();
      _chTimeSetCooldown = Date.now();

      var toWrite = JSON.parse(JSON.stringify(spawnData));
      toWrite._resetAt = Date.now();
      toWrite.rooms = null;
      toWrite.entries = null;
      var alivePins = {};
      if (spawnData.pins) {
        Object.keys(spawnData.pins).forEach(function(pk) {
          if (spawnData.pins[pk] && spawnData.pins[pk].x) alivePins[pk] = spawnData.pins[pk];
        });
      }
      toWrite.pins = Object.keys(alivePins).length > 0 ? alivePins : null;
      toWrite._rooms_cleared = true;
      db.ref(p('spawn/data')).set(toWrite).catch(function(e) {
        console.warn('[spawn] Firebase write error:', e);
      });
      _prevFbSnapshot = _sanitize(JSON.parse(JSON.stringify({
        rooms: spawnData.rooms,
        gheata: spawnData.gheata,
        fulger: spawnData.fulger,
        chTimes: spawnData.chTimes,
        pins: spawnData.pins,
        spawnType: spawnData.spawnType,
        spawnTime: spawnData.spawnTime,
        chBeaten: spawnData.chBeaten,
        anchor: spawnData.anchor
      })));
      _lastSpawnHash = JSON.stringify(spawnData);
      if (fbSaveDebounce['spawn']) { clearTimeout(fbSaveDebounce['spawn']); delete fbSaveDebounce['spawn']; }
      showToast('Reset spawn', 'Notatiile au fost sterse (Gheata si Timpi pastrati)');
    });
  } else {
    // Offline fallback — single client, no race possible
    var _sc = spawnData._spawnCycle || {};
    if (_sc.key === cycleKey) return; // already handled
    var prevType = spawnData.spawnType || 'simplu';
    var nextType = prevType === 'dublu' ? 'simplu' : 'dublu';
    spawnData.spawnType = nextType;
    spawnData._prevSpawnType = prevType;
    logSpawnTypeChange(prevType, 'reset_scheduled', prevType);
    updateSpawnTypeUI();
    if (!_isSpawnEmpty()) pushSpawnHistory();
    _clearGheataMarkers();
    doResetSpawnTables();
    _markSpawnCycleHandled();
    _chTimeSetCooldown = Date.now();
    saveSpawn();
    showToast('Reset spawn', 'Notatiile au fost sterse (Gen.Fals si Timp Spawn pastrate)');
  }
}

// Manual spawn timer input removed — alarms now driven by CH1/CH2 in Timp Spawn table

// ── Volume system: master + per-canal ───────────────────────────────
(function() {
  var _masterVol = 0.8; // 0.0 - 1.0

  // Channel base levels (0.0 - 1.0), independent of master
  var _channelBase = {
    spawn:    0.8,
    alerte:   0.8,
    servere:  0.8,
    costume:  0.8
  };

  var STORE = {
    master:  'vol_master',
    spawn:   'vol_spawn',
    alerte:  'vol_alerte',
    servere: 'vol_servere',
    costume: 'vol_costume'
  };

  function effectiveVol(channel) {
    return _masterVol * (_channelBase[channel] || 0.8);
  }

  function applyAll() {
    _spawnAlarmVolume = effectiveVol('spawn');
    if (typeof _costumeAlarmVolume !== 'undefined') window._costumeAlarmVolume = effectiveVol('costume');
    if (typeof _ssVolume !== 'undefined') window._ssVolume = effectiveVol('servere');
    window._alerteVolume = effectiveVol('alerte');
  }

  function updateMasterIcon(v) {
    var btn = document.getElementById('volBtn');
    if (!btn) return;
    var SVG_MUTE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
    var SVG_LOW  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
    var SVG_HIGH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    btn.innerHTML = v === 0 ? SVG_MUTE : (v <= 50 ? SVG_LOW : SVG_HIGH);
    btn.classList.toggle('muted', v === 0);
  }

  function setSlider(id, val, lblId) {
    var el = document.getElementById(id);
    var lb = document.getElementById(lblId);
    if (el) el.value = val;
    if (lb) lb.textContent = val + '%';
  }

  // Load saved values
  function loadSaved() {
    var m = localStorage.getItem(STORE.master);
    if (m !== null) _masterVol = parseFloat(m) / 100;
    ['spawn','alerte','servere','costume'].forEach(function(ch) {
      var s = localStorage.getItem(STORE[ch]);
      if (s !== null) _channelBase[ch] = parseFloat(s) / 100;
    });
  }

  function initSliders() {
    var masterPct = Math.round(_masterVol * 100);
    setSlider('masterVolume', masterPct, 'masterVolumeVal');
    updateMasterIcon(masterPct);

    setSlider('spawnAlarmVolume',  Math.round(_channelBase.spawn   * 100), 'spawnAlarmVolumeVal');
    setSlider('alerteVolumeSlider', Math.round(_channelBase.alerte  * 100), 'alerteVolumeVal');
    setSlider('ssVolumeSlider',     Math.round(_channelBase.servere * 100), 'ssVolumeVal');
    setSlider('costumeVolumeSlider',Math.round(_channelBase.costume * 100), 'costumeVolumeVal');
  }

  function bindSliders() {
    var masterEl = document.getElementById('masterVolume');
    if (masterEl) masterEl.addEventListener('input', function() {
      _masterVol = parseInt(this.value, 10) / 100;
      localStorage.setItem(STORE.master, this.value);
      document.getElementById('masterVolumeVal').textContent = this.value + '%';
      updateMasterIcon(parseInt(this.value, 10));
      applyAll();
    });

    function bindChannel(sliderId, channel, lblId, storeKey) {
      var el = document.getElementById(sliderId);
      if (!el) return;
      el.addEventListener('input', function() {
        _channelBase[channel] = parseInt(this.value, 10) / 100;
        localStorage.setItem(storeKey, this.value);
        document.getElementById(lblId).textContent = this.value + '%';
        applyAll();
      });
    }
    bindChannel('spawnAlarmVolume',   'spawn',   'spawnAlarmVolumeVal',  STORE.spawn);
    bindChannel('alerteVolumeSlider', 'alerte',  'alerteVolumeVal',      STORE.alerte);
    bindChannel('ssVolumeSlider',     'servere', 'ssVolumeVal',          STORE.servere);
    bindChannel('costumeVolumeSlider','costume', 'costumeVolumeVal',     STORE.costume);
  }

  // Channels toggle (collapsed by default)
  var _channelsOpen = false;
  function bindToggle() {
    var btn = document.getElementById('volChannelsToggle');
    var ch  = document.getElementById('volChannels');
    if (!btn || !ch) return;
    ch.style.display = 'none';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      _channelsOpen = !_channelsOpen;
      ch.style.display = _channelsOpen ? '' : 'none';
      btn.classList.toggle('open', _channelsOpen);
    });
  }

  loadSaved();
  applyAll();
  initSliders();
  bindSliders();
  bindToggle();

  // Expose master vol for alerta sound
  window._getMasterVol = function() { return _masterVol; };
})();

// ── Spawn Type (simplu/dublu) ─────────────────────────────────────────
function updateSpawnTypeUI() {
  if (!spawnData) return;
  var type = spawnData.spawnType || 'simplu';
  // Spawn tab toggle buttons
  var btnS = document.getElementById('btnSpawnSimplu');
  var btnD = document.getElementById('btnSpawnDublu');
  if (btnS && btnD) {
    btnS.classList.toggle('active', type === 'simplu');
    btnD.classList.toggle('active', type === 'dublu');
  }
  var widget = document.getElementById('headerSpawnWidget');
  var label = document.getElementById('headerSpawnLabel');
  if (widget && label) {
    label.textContent = type === 'dublu' ? 'Dubla' : 'Simpla';
    label.classList.remove('type-simpla', 'type-dublu');
    label.classList.add(type === 'dublu' ? 'type-dublu' : 'type-simpla');
  }
}

function updateHeaderSpawnTimer() {
  var timerEl = document.getElementById('headerSpawnTimer');
  var sepEl = document.getElementById('headerSpawnSep');
  if (!timerEl) return;
  var ch1Val = (spawnData && spawnData.chTimes && spawnData.chTimes['ch1']) ? spawnData.chTimes['ch1'] : '';
  if (!ch1Val) {
    timerEl.textContent = '';
    timerEl.className = 'spawn-type-timer';
    if (sepEl) sepEl.style.display = 'none';
    return;
  }
  var diff = _chTimeDiff(ch1Val);
  if (diff === null) {
    timerEl.textContent = '';
    timerEl.className = 'spawn-type-timer';
    if (sepEl) sepEl.style.display = 'none';
    return;
  }
  var m = Math.floor(diff / 60);
  var s = diff % 60;
  timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  
  var widget = document.getElementById('headerSpawnWidget');
  if (widget) {
    widget.classList.toggle('warning', diff <= 180);
  }
}

function updateSpawnTimeStrip() {
  var strip = _findEl('spawnTimeStrip');
  if (!strip) return;
  var ch1Val = (spawnData && spawnData.chTimes && spawnData.chTimes['ch1']) ? spawnData.chTimes['ch1'] : '';
  if (!ch1Val) { strip.textContent = ''; return; }
  var parts = ch1Val.split(':');
  if (parts.length !== 2) { strip.textContent = ''; return; }
  var baseMin = parseInt(parts[0], 10);
  if (isNaN(baseMin)) { strip.textContent = ''; return; }
  var times = [];
  for (var i = 0; i < 4; i++) {
    times.push((baseMin + i * 15) % 60);
  }
  times.sort(function(a, b) { return a - b; });
  strip.textContent = times.map(function(mm) { return (mm < 10 ? '0' : '') + mm; }).join(' \u00b7 ');
}

var _spawnTypeLogCache = [];
var SPAWN_TYPE_LOG_KEY = 'metin2_spawn_type_log_v1';

function logSpawnTypeChange(newType, reason, fromType) {
  var ch1Val = (spawnData && spawnData.chTimes && spawnData.chTimes['ch1']) ? spawnData.chTimes['ch1'] : 'N/A';
  var ch1Diff = ch1Val !== 'N/A' ? _chTimeDiff(ch1Val) : null;
  var localNow = new Date();
  var entry = {
    ts: Date.now(),
    type: newType,
    reason: reason || 'manual',
    fromType: fromType || null,
    ch1Time: ch1Val,
    ch1Diff: ch1Diff,
    hourUTC: getSyncedNow().getUTCHours(),
    hourLocal: localNow.getHours(),
    userName: getM2UserName() || 'Anonim'
  };
  // Local cache
  try {
    var log = JSON.parse(localStorage.getItem(SPAWN_TYPE_LOG_KEY) || '[]');
    log.unshift(entry);
    if (log.length > 200) log = log.slice(0, 200);
    localStorage.setItem(SPAWN_TYPE_LOG_KEY, JSON.stringify(log));
    _spawnTypeLogCache = log;
  } catch(e) {}
  // Firebase — always log all switches
  if (typeof db !== 'undefined' && db) {
    var key = db.ref(p('spawn/typeLog')).push().key;
    var obj = {};
    obj[key] = entry;
    db.ref(p('spawn/typeLog')).update(obj).catch(function(e) {
      console.warn('Type log write error:', e);
    });
  }
}

// Returns spawn type for a given UTC hour based on the user-set parity rule.
// null if no rule stored yet.
function getSpawnTypeByParity(utcHour) {
  var rule = spawnData && spawnData.parityRule;
  if (!rule || rule.settledHour === undefined || !rule.settledType) return null;
  var sameParity = (utcHour % 2) === (rule.settledHour % 2);
  return sameParity ? rule.settledType : (rule.settledType === 'dublu' ? 'simplu' : 'dublu');
}

// Calculates spawn type from anchor (seeded correctly from parity at each CH1 fire).
// Anchor handles offline gaps — parity rule handles correctness at each spawn.
function getCurrentSpawnType(offsetMin) {
  var now = getSyncedNow();
  if (offsetMin) now = new Date(now.getTime() + offsetMin * 60000);
  var intervalMs = (spawnData && spawnData.anchor && spawnData.anchor.intervalMs) || 3600000;

  // Primary: anchor-based (anchor is always set from parity at CH1 fire or manual calibration)
  var anchor = spawnData && spawnData.anchor;
  if (anchor && anchor.ts && anchor.type) {
    var elapsed = now.getTime() - anchor.ts;
    if (elapsed < 0) return anchor.type;
    var cycles = Math.floor(elapsed / intervalMs);
    return cycles % 2 === 0 ? anchor.type : (anchor.type === 'dublu' ? 'simplu' : 'dublu');
  }

  // Fallback: parity rule direct (no anchor yet — first session before any spawn)
  var parityType = getSpawnTypeByParity(now.getUTCHours());
  if (parityType) return parityType;

  // Legacy fallback
  var rule = (spawnData && spawnData.evenHourType) ? spawnData.evenHourType : 'dublu';
  var hour = now.getUTCHours();
  return (hour % 2 === 0) ? rule : (rule === 'dublu' ? 'simplu' : 'dublu');
}

// Returns ms until the next spawn cycle flip, based on anchor
function _msToNextSpawn() {
  var anchor = spawnData && spawnData.anchor;
  if (!anchor || !anchor.ts) return null;
  var intervalMs = anchor.intervalMs || 3600000;
  var elapsed = getSyncedNow().getTime() - anchor.ts;
  if (elapsed < 0) return -elapsed; // ms until anchor
  var nextCycleAt = anchor.ts + (Math.floor(elapsed / intervalMs) + 1) * intervalMs;
  return nextCycleAt - getSyncedNow().getTime();
}

function syncSpawnType(silent, force, offsetMin, reason) {
  if (!spawnData) return;
  var target = getCurrentSpawnType(offsetMin);
  if (!force && spawnData.spawnType) return;

  if (spawnData.spawnType !== target) {
    var prev = spawnData.spawnType || 'simplu';
    spawnData.spawnType = target;
    updateSpawnTypeUI();
    buildMapDots();
    renderSpawnTables();
    if (!silent) {
      logSpawnTypeChange(target, reason || 'auto', prev);
      saveSpawn();
    }
  }
}

function setSpawnType(type) {
  if (!spawnData) return;
  var prev = getCurrentSpawnType();
  if (prev === type) return;

  var intervalMs = (spawnData.anchor && spawnData.anchor.intervalMs) || 3600000;
  var now = getSyncedNow().getTime();

  // Anchor ts = start of the CURRENT cycle, not the button-press moment.
  // This preserves the natural cycle boundaries so T=0 still fires at the right time.
  var cycleStartTs = now;
  if (spawnData.anchor && spawnData.anchor.ts) {
    var elapsed = now - spawnData.anchor.ts;
    if (elapsed >= 0) {
      var cyclesSoFar = Math.floor(elapsed / intervalMs);
      cycleStartTs = spawnData.anchor.ts + cyclesSoFar * intervalMs;
    }
  }

  spawnData.anchor = { ts: cycleStartTs, type: type, intervalMs: intervalMs };
  spawnData.spawnType = type;

  // Parity rule uses the spawn hour (when CH1 fires), not the current hour.
  // e.g. user confirms at 7:53 with spawn at 8:15 → settledHour = 8, not 7.
  var syncedNowSet = getSyncedNow();
  var ch1ValForParity = spawnData.chTimes && spawnData.chTimes['ch1'];
  var ch1DiffForParity = ch1ValForParity ? _chTimeDiff(ch1ValForParity) : null;
  var settledUtcHour;
  if (ch1DiffForParity !== null && ch1DiffForParity > 0) {
    settledUtcHour = new Date(syncedNowSet.getTime() + ch1DiffForParity * 1000).getUTCHours();
  } else {
    settledUtcHour = syncedNowSet.getUTCHours();
  }
  spawnData.parityRule = { settledHour: settledUtcHour, settledType: type };
  spawnData._prevSpawnType = null;
  spawnData._resetAt = null;

  saveSpawn();
  updateSpawnTypeUI();

  // Log uses local spawn hour for readability
  var localSpawnHour;
  if (ch1DiffForParity !== null && ch1DiffForParity > 0) {
    localSpawnHour = new Date(Date.now() + ch1DiffForParity * 1000).getHours();
  } else {
    localSpawnHour = new Date().getHours();
  }
  var parityLabelSet = (localSpawnHour % 2 === 0) ? 'pară' : 'impară';
  var typeLabel = type === 'dublu' ? 'DUBLU' : 'SIMPLU';
  var userName = getM2UserName() || (window.currentUserProfile && window.currentUserProfile.email) || 'Anonim';
  var timeStr = _pad2(new Date().getHours()) + ':' + _pad2(new Date().getMinutes());
  if (typeof window.addAdminLog === 'function') {
    window.addAdminLog(userName + ' a setat spawnul ' + typeLabel + ' — spawn ora ' + localSpawnHour + ' (' + parityLabelSet + ') la ' + timeStr, 'data');
  }

  logSpawnTypeChange(type, 'calibrare_manuala', prev);
  showToast('Calibrare salvata', 'Spawnu curent setat ca ' + typeLabel + ' — tipul urmator se calculeaza automat');
}

function autoAlternateSpawnType(prevType) {
  syncSpawnType();
}

document.getElementById('btnSpawnSimplu').addEventListener('click', function() { setSpawnType('simplu'); });
document.getElementById('btnSpawnDublu').addEventListener('click', function() { setSpawnType('dublu'); });

// ── Spawn History ────────────────────────────────────────────────────
var SPAWN_HISTORY_KEY = 'metin2_spawn_history_v1';
var SPAWN_HISTORY_MAX = 100;
var _spawnHistoryCache = null; // in-memory cache, synced from Firebase
var _lastHistorySave = 0; // timestamp of last local save — blocks Firebase listener from reverting

function _loadSpawnHistory() {
  if (_spawnHistoryCache) return _spawnHistoryCache;
  try { return JSON.parse(localStorage.getItem(SPAWN_HISTORY_KEY)) || []; }
  catch(e) { return []; }
}

function _saveSpawnHistory(history) {
  _spawnHistoryCache = history;
  _lastHistorySave = Date.now();
  try { localStorage.setItem(SPAWN_HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
  // Sync to Firebase so all users see the same history
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/history')).set(history).catch(function(e) {
      console.warn('Spawn history Firebase write error:', e);
    });
  }
}

// Save a snapshot before a reset (auto or manual)
function pushSpawnHistory() {
  if (!spawnData || !spawnData.rooms || Object.keys(spawnData.rooms).length === 0) return;
  var hasReal = false;
  Object.keys(spawnData.rooms).forEach(function(rid) {
    (spawnData.rooms[rid] || []).forEach(function(e) {
      if (e.type !== 'notfound') hasReal = true;
    });
  });
  if (!hasReal) return;

  var now = getSyncedNow();
  var nowMs = now.getTime();

  // Snapshot data captured now (before any async delay)
  var sefCount = 0, genCount = 0;
  Object.keys(spawnData.rooms).forEach(function(rid) {
    if (rid === '_nf') return;
    (spawnData.rooms[rid] || []).forEach(function(e) {
      if (e.type === 'sef') sefCount++;
      else if (e.type === 'gen') genCount++;
    });
  });
  var pinsSnap = (spawnData.pins && Object.keys(spawnData.pins).length > 0)
    ? JSON.parse(JSON.stringify(spawnData.pins)) : null;
  var hiddenCount = 0;
  if (pinsSnap) {
    Object.keys(pinsSnap).forEach(function(pk) {
      if (pinsSnap[pk] && pinsSnap[pk].x) hiddenCount++;
    });
  }
  var entry = {
    ts: nowMs,
    spawnType: spawnData.spawnType || 'simplu',
    rooms: JSON.parse(JSON.stringify(spawnData.rooms)),
    pins: pinsSnap,
    _sefCount: sefCount,
    _genCount: genCount,
    _hiddenCount: hiddenCount
  };

  if (typeof db !== 'undefined' && db) {
    // Firebase transaction dedup: only the first client to commit within a 60s window pushes history.
    // This prevents duplicate entries when multiple clients fire clearSpawnForRespawn simultaneously.
    db.ref(p('spawn/historyLastTs')).transaction(function(currentTs) {
      if (currentTs && nowMs - currentTs < 60000) return; // abort — recent push already done
      return nowMs; // commit — this client wins the write slot
    }, function(error, committed) {
      if (!committed) return; // another client already pushed this cycle
      var history = _loadSpawnHistory();
      if (history.length > 0 && nowMs - history[0].ts < 60000) return; // extra dedup: skip if same cycle
      history.unshift(entry);
      if (history.length > SPAWN_HISTORY_MAX) history = history.slice(0, SPAWN_HISTORY_MAX);
      _saveSpawnHistory(history);
    });
  } else {
    // Offline fallback
    var history = _loadSpawnHistory();
    history.unshift(entry);
    if (history.length > SPAWN_HISTORY_MAX) history = history.slice(0, SPAWN_HISTORY_MAX);
    _saveSpawnHistory(history);
  }
}

function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

function _histFormatDate(ts) {
  var d = new Date(ts);
  var now = new Date();
  var timeStr = _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
  // Today
  if (d.toDateString() === now.toDateString()) return 'Azi, ' + timeStr;
  // Yesterday
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ieri, ' + timeStr;
  return _pad2(d.getDate()) + '.' + _pad2(d.getMonth()+1) + ' ' + timeStr;
}

// ── Date range filter for history ──
var _shFilterFrom = null; // Date object or null
var _shFilterTo   = null;

function _getFilteredHistory() {
  var history = _loadSpawnHistory();
  if (!_shFilterFrom && !_shFilterTo) return history;
  return history.filter(function(entry) {
    var ts = entry.ts;
    var tsStart = entry.ts;
    // Entry overlaps range if its start <= filterTo AND its end >= filterFrom
    if (_shFilterFrom) {
      var fromMs = _shFilterFrom.getTime();
      if (ts < fromMs) return false;
    }
    if (_shFilterTo) {
      // End of the "to" day = 23:59:59.999
      var toMs = _shFilterTo.getTime() + 86400000 - 1;
      if (tsStart > toMs) return false;
    }
    return true;
  });
}

// Wire up date filter inputs
(function() {
  var fromEl = document.getElementById('shDateFrom');
  var toEl   = document.getElementById('shDateTo');
  var clearBtn = document.getElementById('shDateClear');
  if (!fromEl || !toEl) return;

  function onFilterChange() {
    _shFilterFrom = fromEl.value ? new Date(fromEl.value + 'T00:00:00') : null;
    _shFilterTo   = toEl.value   ? new Date(toEl.value   + 'T00:00:00') : null;
    renderSpawnHistory();
    renderSpawnProb();
  }
  fromEl.addEventListener('change', onFilterChange);
  toEl.addEventListener('change', onFilterChange);
  clearBtn.addEventListener('click', function() {
    fromEl.value = '';
    toEl.value = '';
    _shFilterFrom = null;
    _shFilterTo = null;
    renderSpawnHistory();
    renderSpawnProb();
  });
})();

function renderSpawnHistory() {
  var container = document.getElementById('spawnHistoryList');
  if (!container) return;
  var history = _getFilteredHistory();
  if (history.length === 0) {
    var allHistory = _loadSpawnHistory();
    if (allHistory.length === 0) {
      container.innerHTML = '<div class="sh-empty">Niciun spawn salvat</div>';
    } else {
      container.innerHTML = '<div class="sh-empty">Niciun spawn in perioada selectata</div>';
    }
    return;
  }
  container.innerHTML = history.map(function(entry, idx) {
    var dateLabel = _histFormatDate(entry.ts);

    // ── Normal spawn entry ──
    var rooms = entry.rooms || {};
    var entryPins = entry.pins || {};
    // Build set of hidden CHs
    var hiddenCHs = {};
    Object.keys(entryPins).forEach(function(pk) {
      if (entryPins[pk] && entryPins[pk].x) {
        var chN = parseInt(pk.replace('ch', ''));
        if (chN) hiddenCHs[chN] = true;
      }
    });
    // Group entries by CH for fixed 6-column grid
    var chSlots = {}; // ch number → array of chip HTML
    var roomIds = Object.keys(rooms).filter(function(r) { return r !== '_nf'; });
    roomIds.forEach(function(rid) {
      (rooms[rid] || []).forEach(function(e) {
        if (e.type === 'notfound') return;
        var ch = e.ch || 0;
        var cls = e.type === 'sef' ? 'sh-chip-sef' : 'sh-chip-gen';
        if (e.dead) cls += ' sh-chip-dead';
        if (hiddenCHs[ch]) cls += ' sh-chip-hidden';
        var chip = '<span class="sh-chip ' + cls + '">' + rid + '<small>CH' + ch + '</small>' + (hiddenCHs[ch] ? '<span class="sh-hidden-icon" title="Ascuns">📍</span>' : '') + '</span>';
        if (!chSlots[ch]) chSlots[ch] = [];
        chSlots[ch].push(chip);
      });
    });
    // Build fixed 6-column output
    var roomChips = [];
    for (var _ci = 1; _ci <= 6; _ci++) {
      if (chSlots[_ci] && chSlots[_ci].length > 0) {
        roomChips.push(chSlots[_ci].join(''));
      } else {
        roomChips.push('<span class="sh-chip sh-chip-empty">—</span>');
      }
    }
    // Quick counts
    var sefC = entry._sefCount || 0, genC = entry._genCount || 0;
    var hidC = entry._hiddenCount || Object.keys(hiddenCHs).length;
    if (!sefC && !genC) {
      roomIds.forEach(function(rid) {
        (rooms[rid] || []).forEach(function(e) {
          if (e.type === 'sef') sefC++;
          else if (e.type === 'gen') genC++;
        });
      });
    }
    var typeClass = (entry.spawnType === 'dublu') ? ' sh-badge-type-dublu' : '';
    var typeLabel2 = (entry.spawnType === 'dublu') ? 'Dublu' : 'Simplu';
    return '<div class="sh-row" data-idx="' + idx + '">' +
      '<div class="sh-left">' +
        '<span class="sh-date">' + dateLabel + '</span>' +
        '<span class="sh-badge sh-badge-sef">' + sefC + '</span>' +
        '<span class="sh-badge sh-badge-gen">' + genC + '</span>' +
        (hidC > 0 ? '<span class="sh-badge sh-badge-hidden" title="' + hidC + ' ascuns(e)">' + hidC + '📍</span>' : '') +
        (window._isAdmin ? '<span class="sh-badge sh-badge-type' + typeClass + '">' + typeLabel2 + '</span>' : '') +
      '</div>' +
      '<div class="sh-chips">' + (roomChips.length > 0 ? roomChips.join('') : '<span class="sh-muted">—</span>') + '</div>' +
      '<div class="sh-right">' +
        '<button class="sh-btn sh-btn-restore" data-idx="' + idx + '" title="Restaureaza"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 7v5h5"/></svg></button>' +
        '<button class="sh-btn sh-btn-del" data-idx="' + idx + '" title="Sterge"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Bind events — use entry.ts to find the correct index in full (unfiltered) history
  container.querySelectorAll('.sh-btn-restore').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var i = parseInt(btn.dataset.idx);
      var entry = history[i];
      if (!entry) return;
      if (!confirm('Restaurezi notatiile din ' + new Date(entry.ts).toLocaleString('ro-RO') + '?')) return;
      pushSpawnUndo('restaurare istoric');
      spawnData.rooms = JSON.parse(JSON.stringify(entry.rooms || {}));
      saveSpawn(); buildMapDots(); renderSpawnTables();
      closeModal('spawnHistoryModal');
      showToast('Istoric restaurat', 'success');
    });
  });
  container.querySelectorAll('.sh-btn-del').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var i = parseInt(btn.dataset.idx);
      var entry = history[i];
      if (!entry) return;
      // Find and remove from full history by timestamp
      var fullHistory = _loadSpawnHistory();
      var realIdx = fullHistory.findIndex(function(e) { return e.ts === entry.ts; });
      if (realIdx !== -1) fullHistory.splice(realIdx, 1);
      _saveSpawnHistory(fullHistory);
      renderSpawnHistory();
    });
  });
}

// ── Probabilitati (statistics across all history) ────────────────────
function renderSpawnProb() {
  var container = document.getElementById('spawnHistoryProb');
  if (!container) return;
  var history = _getFilteredHistory();
  if (history.length < 2) {
    container.innerHTML = '<div class="sh-empty">Sunt necesare cel putin 2 spawnuri in perioada selectata.</div>';
    return;
  }

  var stats = {};
  var totalSpawns = history.length;
  if (totalSpawns < 2) {
    container.innerHTML = '<div class="sh-empty">Sunt necesare cel putin 2 spawnuri notate.</div>';
    return;
  }
  var hiddenTotal = 0;
  history.forEach(function(entry) {
    var rooms = entry.rooms || {};
    var pins = entry.pins || {};
    // Build set of hidden CHs (those with pins)
    var hiddenCHs = {};
    Object.keys(pins).forEach(function(pk) {
      if (pins[pk] && pins[pk].x) {
        var chNum = parseInt(pk.replace('ch', ''));
        if (chNum) hiddenCHs[chNum] = true;
      }
    });
    Object.keys(rooms).forEach(function(rid) {
      if (rid === '_nf') return;
      (rooms[rid] || []).forEach(function(e) {
        if (e.type === 'notfound') return;
        // Skip hidden/ascuns entries — they were dragged, not a real room spawn
        if (hiddenCHs[e.ch]) { hiddenTotal++; return; }
        if (!stats[rid]) stats[rid] = { total: 0, sef: 0, gen: 0 };
        stats[rid].total++;
        if (e.type === 'sef') stats[rid].sef++;
        if (e.type === 'gen') stats[rid].gen++;
      });
    });
  });

  var sorted = Object.keys(stats).sort(function(a, b) { return stats[b].total - stats[a].total; });
  var grandTotal = 0, totalSef = 0, totalGen = 0;
  sorted.forEach(function(rid) { grandTotal += stats[rid].total; totalSef += stats[rid].sef; totalGen += stats[rid].gen; });
  var maxTotal = sorted.length > 0 ? stats[sorted[0]].total : 1;
  var sefPct = grandTotal > 0 ? ((totalSef / grandTotal) * 100).toFixed(1) : '0';
  var genPct = grandTotal > 0 ? ((totalGen / grandTotal) * 100).toFixed(1) : '0';
  var avgSef = totalSpawns > 0 ? (totalSef / totalSpawns).toFixed(1) : '0';
  var avgGen = totalSpawns > 0 ? (totalGen / totalSpawns).toFixed(1) : '0';

  var html = '<div class="sp-prob-summary">' +
    '<span>' + totalSpawns + ' spawnuri</span><span class="sp-dot">&middot;</span><span>' + grandTotal + ' intrari</span>' +
    (hiddenTotal > 0 ? '<span class="sp-dot">&middot;</span><span style="color:var(--red)">' + hiddenTotal + ' ascunse</span>' : '') +
  '</div>' +
  '<div class="sp-prob-stats">' +
    '<div class="sp-stat-card">' +
      '<div class="sp-stat-val sp-c-sef">' + totalSef + '</div>' +
      '<div class="sp-stat-label">Capetenii (' + sefPct + '%)</div>' +
      '<div class="sp-stat-sub">~' + avgSef + ' / spawn</div>' +
    '</div>' +
    '<div class="sp-stat-card">' +
      '<div class="sp-stat-val sp-c-gen">' + totalGen + '</div>' +
      '<div class="sp-stat-label">Generali (' + genPct + '%)</div>' +
      '<div class="sp-stat-sub">~' + avgGen + ' / spawn</div>' +
    '</div>' +
  '</div>';

  html += '<div class="sp-prob-list">';
  sorted.forEach(function(rid, i) {
    var s = stats[rid];
    var pct = ((s.total / grandTotal) * 100).toFixed(1);
    var barW = Math.max(3, (s.total / maxTotal) * 100);
    var sefW = s.total > 0 ? (s.sef / s.total) * barW : 0;
    var genW = s.total > 0 ? (s.gen / s.total) * barW : 0;
    var rank = i < 3 ? ' sp-top' + (i + 1) : '';

    html += '<div class="sp-prob-item' + rank + '">' +
      '<span class="sp-prob-room">' + rid + '</span>' +
      '<div class="sp-prob-bar-track">' +
        '<div class="sp-prob-bar sp-bar-sef" style="width:' + sefW + '%"></div>' +
        '<div class="sp-prob-bar sp-bar-gen" style="width:' + genW + '%"></div>' +
      '</div>' +
      '<span class="sp-prob-pct">' + pct + '%</span>' +
      '<span class="sp-prob-detail">' +
        '<span class="sp-c-sef">' + s.sef + '</span>' +
        '<span class="sp-c-sep">/</span>' +
        '<span class="sp-c-gen">' + s.gen + '</span>' +
      '</span>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// Tab switching
function _histShowTab(tab) {
  var listEl = document.getElementById('spawnHistoryList');
  var probEl = document.getElementById('spawnHistoryProb');
  var debugEl = document.getElementById('spawnTypeLogContent');
  var btnList = document.getElementById('btnHistList');
  var btnProb = document.getElementById('btnHistProb');
  var btnDebug = document.getElementById('btnHistDebug');
  [listEl, probEl, debugEl].forEach(function(el) { if (el) el.style.display = 'none'; });
  [btnList, btnProb, btnDebug].forEach(function(b) { if (b) b.classList.remove('active'); });
  if (tab === 'prob') {
    if (probEl) probEl.style.display = '';
    if (btnProb) btnProb.classList.add('active');
    renderSpawnProb();
  } else if (tab === 'debug') {
    if (debugEl) debugEl.style.display = '';
    if (btnDebug) btnDebug.classList.add('active');
    renderTypeLog();
  } else {
    if (listEl) listEl.style.display = '';
    if (btnList) btnList.classList.add('active');
    renderSpawnHistory();
  }
}

document.getElementById('btnHistList').addEventListener('click', function() { _histShowTab('list'); });
document.getElementById('btnHistProb').addEventListener('click', function() { _histShowTab('prob'); });
document.getElementById('btnHistDebug').addEventListener('click', function() { _histShowTab('debug'); });

// ── Type Log (admin debug) ────────────────────────────────────────────
function renderTypeLog() {
  if (!window._isAdmin) return;
  var container = document.getElementById('spawnTypeLogContent');
  if (!container) return;
  // Load from cache or localStorage fallback, always sort descending
  var log = _spawnTypeLogCache.length > 0 ? _spawnTypeLogCache : (function() {
    try { return JSON.parse(localStorage.getItem(SPAWN_TYPE_LOG_KEY) || '[]'); } catch(e) { return []; }
  })();
  log = log.slice().sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
  if (log.length === 0) {
    container.innerHTML = '<div class="sh-empty">Niciun switch de tip inregistrat</div>';
    return;
  }
  var html = '<div class="type-log-header">Ultimele ' + log.length + ' schimbari de tip spawn:</div>';
  html += log.map(function(entry) {
    var d = new Date(entry.ts);
    var dateStr = _pad2(d.getDate()) + '.' + _pad2(d.getMonth()+1) + ' ' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes()) + ':' + _pad2(d.getSeconds());
    var toType = entry.type || 'simplu';
    var fromType = entry.fromType || (toType === 'simplu' ? 'dublu' : 'simplu');
    var fromClass = fromType === 'dublu' ? 'sh-badge-type-dublu' : '';
    var toClass   = toType   === 'dublu' ? 'sh-badge-type-dublu' : '';
    var reason = entry.reason || 'manual';
    var userLabel = entry.userName ? ('<strong>' + entry.userName + '</strong>: ') : '';

    // Local hour for display
    var localH = (entry.hourLocal !== undefined) ? entry.hourLocal : d.getHours();
    var parityStr = (localH % 2 === 0) ? 'pară' : 'impară';
    var hourStr = ' <span class="type-log-hour">ora ' + localH + ' (' + parityStr + ')</span>';

    var reasonLabel;
    if (reason === 'calibrare_manuala' || reason.startsWith('calib_')) {
      reasonLabel = 'a calibrat manual';
    } else if (reason === 'auto') {
      reasonLabel = 'switch automat la trecerea orei';
    } else if (reason === 'delayed_switch') {
      reasonLabel = 'switch automat (după CH6)';
    } else if (reason === 'reset_scheduled') {
      reasonLabel = 'reset ciclu spawn';
    } else {
      reasonLabel = reason;
    }

    return '<div class="type-log-entry">' +
      '<span class="type-log-ts">' + dateStr + '</span>' +
      '<div class="type-log-details">' +
        userLabel + reasonLabel + hourStr + ' (' +
        '<span class="sh-badge sh-badge-type ' + fromClass + '">' + fromType + '</span>' +
        ' <span class="type-log-arrow">&rarr;</span> ' +
        '<span class="sh-badge sh-badge-type ' + toClass + '">' + toType + '</span>)' +
      '</div>' +
    '</div>';
  }).join('');
  container.innerHTML = html;
}

// ── Excel Export ─────────────────────────────────────────────────────
document.getElementById('btnHistExport').addEventListener('click', function() {
  var history = _getFilteredHistory();
  if (history.length === 0) { showToast('Niciun spawn de exportat in perioada selectata', ''); return; }

  // Build CSV content (Excel-compatible with BOM + semicolon separator)
  var sep = ';';
  var rows = [];
  // Header
  rows.push(['Data', 'Ora', 'Tip', 'Camera', 'CH', 'Tip Boss', 'Status'].join(sep));

  history.forEach(function(entry) {
    var d = new Date(entry.ts);
    var dateStr = _pad2(d.getDate()) + '.' + _pad2(d.getMonth()+1) + '.' + d.getFullYear();
    var timeStr = _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
    var typeLabel = (entry.spawnType === 'dublu') ? 'Dubla' : 'Simpla';
    var rooms = entry.rooms || {};
    var hasEntries = false;
    Object.keys(rooms).sort(function(a,b) {
      var na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a < b ? -1 : 1;
    }).forEach(function(rid) {
      if (rid === '_nf') return;
      (rooms[rid] || []).forEach(function(e) {
        if (e.type === 'notfound') return;
        hasEntries = true;
        var bossType = e.type === 'sef' ? 'Capetenie' : 'General';
        var status = e.dead ? 'Dead' : (e.going ? 'Going (' + e.going + ')' : 'Alive');
        rows.push([dateStr, timeStr, typeLabel, rid, 'CH' + e.ch, bossType, status].join(sep));
      });
    });
    if (!hasEntries) {
      rows.push([dateStr, timeStr, typeLabel, '-', '-', '-', '-'].join(sep));
    }
  });

  // Add probability summary sheet
  rows.push('');
  rows.push('');
  rows.push(['=== PROBABILITATI ==='].join(sep));
  rows.push(['Camera', 'Total', 'Capetenii', 'Generali', '%'].join(sep));

  var stats = {};
  var grandTotal = 0;
  history.forEach(function(entry) {
    var rooms = entry.rooms || {};
    Object.keys(rooms).forEach(function(rid) {
      if (rid === '_nf') return;
      (rooms[rid] || []).forEach(function(e) {
        if (e.type === 'notfound') return;
        if (!stats[rid]) stats[rid] = { total: 0, sef: 0, gen: 0 };
        stats[rid].total++;
        grandTotal++;
        if (e.type === 'sef') stats[rid].sef++;
        if (e.type === 'gen') stats[rid].gen++;
      });
    });
  });
  Object.keys(stats).sort(function(a,b) { return stats[b].total - stats[a].total; }).forEach(function(rid) {
    var s = stats[rid];
    var pct = grandTotal > 0 ? ((s.total / grandTotal) * 100).toFixed(1) + '%' : '0%';
    rows.push([rid, s.total, s.sef, s.gen, pct].join(sep));
  });

  // Download as CSV with BOM for Excel
  var bom = '\uFEFF';
  var blob = new Blob([bom + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var now = new Date();
  a.download = 'spawn_istoric_' + now.getFullYear() + _pad2(now.getMonth()+1) + _pad2(now.getDate()) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Export descarcat', 'success');
});

document.getElementById('btnSpawnHistory').addEventListener('click', function() {
  _histShowTab('list');
  openModal('spawnHistoryModal');
});
document.getElementById('spawnHistoryClose').addEventListener('click', function() {
  closeModal('spawnHistoryModal');
});

// ── Undo system ──────────────────────────────────────────────────────
var _spawnUndoStack = []; // max 30 entries
var SPAWN_UNDO_MAX = 30;

function pushSpawnUndo(label) {
  _spawnUndoStack.push({
    label: label,
    snapshot: JSON.parse(JSON.stringify(spawnData))
  });
  if (_spawnUndoStack.length > SPAWN_UNDO_MAX) _spawnUndoStack.shift();
}

function spawnUndo() {
  if (_spawnUndoStack.length === 0) { showToast('Nimic de anulat', ''); return; }
  var entry = _spawnUndoStack.pop();
  spawnData = entry.snapshot;
  saveSpawn(); buildMapDots(); renderSpawnTables();
  showToast('Undo: ' + entry.label, 'success');
}

// Ctrl+Z handler (only when spawn tab is active)
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    var spawnTab = document.getElementById('tab-spawn');
    if (spawnTab && spawnTab.style.display !== 'none') {
      e.preventDefault();
      spawnUndo();
    }
  }
});

// ── Right-click CH to clear ──────────────────────────────────────────
var _spawnCtxMenu = null;

function showSpawnCtxMenu(chNum, x, y, anchorEl) {
  closeSpawnCtxMenu();
  // Use the gheata pop-out window if active, since ctx menu is on gheata table
  var ownerWin = _getGheataHost();
  var ownerDoc = ownerWin.document;
  var entries = getAllEntriesForCH(chNum);
  var menu = ownerDoc.createElement('div');
  menu.className = 'spawn-ctx-menu';
  menu.innerHTML =
    '<div class="spawn-ctx-title">CH ' + chNum + '</div>' +
    (entries.length > 0
      ? '<button class="spawn-ctx-item spawn-ctx-danger" data-action="clear">Curata CH ' + chNum + '</button>'
      : '<div class="spawn-ctx-item spawn-ctx-disabled">Nicio intrare</div>');
  ownerDoc.body.appendChild(menu);
  // Adjust position to stay inside window
  var rect = menu.getBoundingClientRect();
  var vw2 = ownerWin.innerWidth, vh2 = ownerWin.innerHeight;
  if (x + rect.width > vw2) x = Math.max(4, x - rect.width);
  if (x < 4) x = 4;
  if (y + rect.height > vh2) y = Math.max(4, y - rect.height);
  if (y < 4) y = 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  var clearBtn = menu.querySelector('[data-action="clear"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      pushSpawnUndo('curatare CH ' + chNum);
      // Remove all entries for this CH from all rooms
      Object.keys(spawnData.rooms).forEach(function(rid) {
        spawnData.rooms[rid] = (spawnData.rooms[rid] || []).filter(function(e) { return e.ch !== chNum; });
        if (spawnData.rooms[rid].length === 0) delete spawnData.rooms[rid];
      });
      saveSpawn(); buildMapDots(); renderSpawnTables();
      closeSpawnCtxMenu();
      showToast('CH ' + chNum + ' curatat', 'success');
    });
  }

  _spawnCtxMenu = menu;
  _spawnCtxMenuDoc = ownerDoc;
  setTimeout(function() {
    ownerDoc.addEventListener('click', closeSpawnCtxMenu, true);
    ownerDoc.addEventListener('contextmenu', closeSpawnCtxMenu, true);
  }, 50);
}

var _spawnCtxMenuDoc = null;
function closeSpawnCtxMenu() {
  if (_spawnCtxMenu) { _spawnCtxMenu.remove(); _spawnCtxMenu = null; }
  var doc = _spawnCtxMenuDoc || document;
  doc.removeEventListener('click', closeSpawnCtxMenu, true);
  doc.removeEventListener('contextmenu', closeSpawnCtxMenu, true);
  _spawnCtxMenuDoc = null;
}

// ── Pop-out: real window.open() with inline CSS ─────────────────────
var _popoutActive = {};
var _cachedCSS = null; // cache inline CSS text once

function _getInlineCSS() {
  if (_cachedCSS) return _cachedCSS;
  var css = '';
  try {
    var sheets = document.styleSheets;
    for (var s = 0; s < sheets.length; s++) {
      try {
        var rules = sheets[s].cssRules || sheets[s].rules;
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          css += rules[r].cssText + '\n';
        }
      } catch(e) { /* cross-origin sheet, skip */ }
    }
  } catch(e) {}
  _cachedCSS = css;
  return css;
}

function openSpawnPopout(type) {
  // If already open, focus existing window
  if (_popoutActive[type]) {
    if (_popoutActive[type].popWin && !_popoutActive[type].popWin.closed) {
      _popoutActive[type].popWin.focus();
      return;
    }
    // Window was closed externally, clean up
    closeSpawnPopout(type);
  }

  var titles = { harta: 'Harta', gheata: 'Gheata', timpspawn: 'Timp Spawn' };
  var defaultSizes  = { harta: [580,660], gheata: [560,520], timpspawn: [500,360] };
  var title = titles[type] || type;

  // Restore saved position/size or use defaults
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('popout_geo_' + type)); } catch(e) {}
  // saved stores innerWidth/innerHeight so they map directly to window.open width/height
  var w = (saved && saved.iw) || (defaultSizes[type] || [500,400])[0];
  var h = (saved && saved.ih) || (defaultSizes[type] || [500,400])[1];
  var posLeft = (saved && saved.x != null) ? saved.x : undefined;
  var posTop  = (saved && saved.y != null) ? saved.y : undefined;

  var popWin = null;
  var features = 'width=' + w + ',height=' + h + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
  if (posLeft !== undefined) features += ',left=' + posLeft + ',top=' + posTop;
  try {
    popWin = window.open('/popup?type=' + type, 'spawn_' + type, features);
  } catch(e) {}

  if (!popWin || popWin.closed) {
    showToast('Pop-up blocat de browser! Permite pop-up-urile.', 'error');
    return;
  }

  // Get the actual element to move
  var sourceEl;
  if (type === 'harta') {
    sourceEl = document.getElementById('spawnMapWrap');
  } else if (type === 'timpspawn') {
    var chBody = document.getElementById('chSplitTableBody');
    sourceEl = chBody ? chBody.closest('table') : null;
  } else {
    var gheataBody = document.getElementById('gheataTableBody');
    sourceEl = gheataBody ? gheataBody.closest('table') : null;
  }
  if (!sourceEl) { popWin.close(); return; }

  // Inject styles + content after the /popup page finishes loading
  var inlineCSS = _getInlineCSS();
  var _popoutAdditionalCSS =
    ':root{color-scheme:dark;--bg:#080910;--surface:#111318;--surface2:#181c24;--border:rgba(255,255,255,0.06);--border-accent:rgba(255,255,255,0.12);--gold:#c8962e;--gold-light:#f0b845;--text:#e8eaf0;--text-muted:#6b7280;--text-dim:#9ca3af;--red:#e05252;--green:#4caf82;--orange:#e07d40;--teal:#3eb8c0}' +
    'html,body{background:var(--bg);color:var(--text);font-family:"Inter","Rajdhani",sans-serif;margin:0;padding:0;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}' +
    '#popBody{width:100%;height:100vh;display:flex;align-items:center;justify-content:center;overflow:auto}' +
    '.spawn-map-wrap{border:none!important}' +
    '.spawn-map-img{width:100%!important;max-width:98vw!important;max-height:98vh!important;height:auto!important;object-fit:contain}' +
    '.spawn-table{width:auto;table-layout:auto;border-collapse:collapse}' +
    '.spawn-pin-btn{display:none}' +
    '#gheataTableBody td:nth-child(4),.spawn-table thead th:nth-child(4){display:none}' +
    '.gh-popout-wrap{display:flex;flex-direction:column;align-items:center;width:100%;height:100%;justify-content:center;overflow:auto}' +
    '.gh-popout-wrap .spawn-table{width:94%;margin:0 auto;table-layout:fixed;border-collapse:collapse}' +
    '.gh-popout-wrap .spawn-table th{font-size:clamp(8px,2vw,28px)!important;padding:clamp(4px,1.5vh,14px) clamp(4px,1.2vw,18px)!important;white-space:nowrap;text-transform:uppercase;letter-spacing:0.06em;opacity:.5;font-family:"Inter",sans-serif;font-weight:600}' +
    '.gh-popout-wrap .spawn-table td{font-size:clamp(12px,4vw,48px)!important;padding:clamp(4px,1.2vh,12px) clamp(3px,1vw,10px)!important;vertical-align:middle}' +
    '.gh-popout-wrap .spawn-ch-label{font-size:clamp(10px,2.5vw,32px)!important;font-weight:700;width:14%;white-space:nowrap;overflow:visible;color:rgba(255,255,255,0.3)}' +
    '.gh-popout-wrap .spawn-state-cell{font-size:clamp(12px,3.5vw,42px)!important;width:48%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0;border-color:rgba(255,255,255,0.14)!important}' +
    '.gh-popout-wrap .spawn-cameras-cell{width:14%;padding:clamp(3px,1vh,6px) clamp(2px,0.5vw,4px)!important;text-align:center}' +
    '.gh-popout-wrap .spawn-cam-tag{font-size:clamp(13px,3.5vw,44px)!important;padding:clamp(4px,1.5vh,14px) clamp(3px,0.6vw,8px)!important;border-radius:4px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;width:auto;box-sizing:border-box}' +
    '.gh-popout-wrap .spawn-gf-cell{width:20%;padding:clamp(3px,1vh,6px) clamp(3px,1vw,6px)!important}' +
    '.gh-popout-wrap .gh-gf-row{display:flex;gap:4px;width:100%;height:100%}' +
    '.gh-popout-wrap .spawn-gf-btn{font-size:clamp(13px,3.5vw,44px)!important;padding:clamp(6px,2vh,18px) 0!important;flex:1;border-radius:4px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:0}' +
    '.spawn-table tr{transition:background .15s}' +
    '.spawn-table tr:hover{background:rgba(255,255,255,.03)}' +
    // Clock — popup-timer style: MM dim, SS bright
    '.ts-popout-clock{text-align:center;font-family:"Inter",sans-serif;font-weight:300;letter-spacing:-0.04em;padding:clamp(6px,3vh,20px) 0 0;font-size:clamp(22px,10vw,118px);line-height:1;transition:font-size .15s}' +
    '.tsc-mm{color:rgba(255,255,255,0.28)}' +
    '.tsc-ss{color:rgba(255,255,255,0.92)}' +
    '.tsc-unit{color:rgba(255,255,255,0.2);font-size:0.42em;font-weight:400;margin-left:0.04em}' +
    '.ts-next-ch{text-align:center;font-family:"Inter",sans-serif;font-size:clamp(10px,2.5vw,28px);font-weight:400;color:rgba(255,255,255,0.35);padding:clamp(4px,1.5vh,12px) 0 clamp(4px,2vh,16px);opacity:0;transition:opacity .3s,color .3s;letter-spacing:0.02em}' +
    '.ts-next-ch.visible{opacity:1}' +
    '.ts-next-ch.soon{color:var(--gold-light)}' +
    '.ts-next-ch.imminent{color:#e05252}' +
    '.ts-popout-table{table-layout:auto!important;width:94%!important;margin:0 auto}' +
    '.ts-popout-table .spawn-ch-label{font-size:clamp(8px,2.5vw,32px)!important;padding:clamp(2px,1vh,16px) clamp(1px,.5vw,12px)!important;font-weight:600;white-space:nowrap;width:1%;color:rgba(255,255,255,0.3)}' +
    '.ts-popout-table .spawn-mmss{width:100%!important;font-size:clamp(13px,5.5vw,72px)!important;padding:clamp(4px,1.2vh,16px) clamp(2px,1vw,16px)!important;text-align:center;letter-spacing:0.02em;box-sizing:border-box}' +
    '.ts-popout-table td{padding:clamp(3px,1.5vh,18px) clamp(3px,1.5vw,20px)!important;text-align:center}' +
    '.ts-popout-table td[style*="border-right"]{border-right-width:clamp(1px,.3vw,3px)!important}' +
    '.ts-cd{display:block;font-family:"Inter",sans-serif;font-size:clamp(10px,3vw,36px);color:rgba(255,255,255,0.3);text-align:center;margin-top:2px;opacity:0;transition:opacity .3s;line-height:1;font-weight:400}' +
    '.ts-cd.visible{opacity:1}' +
    '.ts-cd.soon{color:var(--gold-light)}' +
    '.ts-cd.imminent{color:#e05252}' +
    '@keyframes popoutFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}' +
    '#popBody{animation:popoutFadeIn .3s ease both}';

  popWin.addEventListener('load', function() {
    try {
      var popDoc = popWin.document;
      // Inject Google Fonts
      var fontLink = popDoc.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Rajdhani:wght@500;600;700&display=swap';
      popDoc.head.appendChild(fontLink);
      // Inject CSS
      var styleEl = popDoc.createElement('style');
      styleEl.textContent = inlineCSS + '\n' + _popoutAdditionalCSS;
      popDoc.head.appendChild(styleEl);
      // Move element into pop-out
      var popBody = popDoc.getElementById('popBody');
      if (popBody) popBody.appendChild(sourceEl);
      // Ctrl+Z undo inside timpspawn pop-out (scoped to pop-out window only)
      if (type === 'timpspawn') {
        popDoc.addEventListener('keydown', function(ev) {
          if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'z') return;
          var ae = popDoc.activeElement;
          if (ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type !== 'button' && ae.type !== 'checkbox' && ae.type !== 'range'))) return;
          if (!_chTimesUndoStack.length) return;
          ev.preventDefault();
          var entry = _chTimesUndoStack.pop();
          if (!spawnData.chTimes) spawnData.chTimes = {};
          spawnData.chTimes[entry.chKey] = entry.value;
          var inputEl = popDoc.querySelector('.spawn-mmss[data-ch="' + entry.chKey + '"]');
          if (inputEl) { inputEl.value = entry.value; inputEl.style.borderColor = ''; inputEl.style.color = ''; }
          _chTimeSetCooldown = Date.now();
          saveSpawn();
        });
      }
      // Hide pop-out header for all pop-outs
      var phHeader = popDoc.querySelector('.popout-header');
      if (phHeader) phHeader.style.display = 'none';
      // For gheata: wrap table in centered flex container
      if (type === 'gheata') {
        var ghTable = popDoc.querySelector('.spawn-table');
        if (ghTable) {
          var ghWrap = popDoc.createElement('div');
          ghWrap.className = 'gh-popout-wrap';
          ghTable.parentNode.insertBefore(ghWrap, ghTable);
          ghWrap.appendChild(ghTable);
          var ghThead = ghTable.querySelector('thead');
          if (ghThead) ghThead.style.display = 'none';
        }
      }
      // For timpspawn: hide thead, add responsive clock above table
      if (type === 'timpspawn') {
        var tsTable = popDoc.querySelector('.spawn-table');
        if (tsTable) {
          var thead = tsTable.querySelector('thead');
          if (thead) thead.style.display = 'none';
          tsTable.classList.add('ts-popout-table');
          var wrapper = popDoc.createElement('div');
          wrapper.id = 'tsPopWrapper';
          wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;margin:0 auto';
          var clockDiv = popDoc.createElement('div');
          clockDiv.id = 'tsClock';
          clockDiv.className = 'ts-popout-clock';
          var _now = getSyncedNow();
          var _mm = _now.getMinutes(), _ss = _now.getSeconds();
          clockDiv.innerHTML = '<span class="tsc-mm">' + (_mm<10?'0':'')+_mm + '</span><span class="tsc-unit">m</span> <span class="tsc-ss">' + (_ss<10?'0':'')+_ss + '</span><span class="tsc-unit">s</span>';
          wrapper.appendChild(clockDiv);
          var nextChDiv = popDoc.createElement('div');
          nextChDiv.id = 'tsNextCh';
          nextChDiv.className = 'ts-next-ch';
          wrapper.appendChild(nextChDiv);
          tsTable.parentNode.insertBefore(wrapper, tsTable);
          wrapper.appendChild(tsTable);
        }
      }
      // For harta: click-outside listener + rebuild map dots
      if (type === 'harta') {
        popDoc.addEventListener('click', _popoverClickOutside);
        setTimeout(function() { buildMapDots(); }, 100);
        // Re-run after map image loads so offsetWidth is correct for dot scaling
        var _mapImg = popDoc.querySelector('.spawn-map-img');
        if (_mapImg) {
          if (_mapImg.complete) { buildMapDots(); }
          else { _mapImg.addEventListener('load', function() { buildMapDots(); }, { once: true }); }
        }
      }
      // Disable re-render animations after initial paint
      setTimeout(function() {
        try { if (!popWin.closed) popWin.document.body.classList.add('app-ready'); } catch(e) {}
      }, 500);
      // Update clock immediately on tab focus
      popDoc.addEventListener('visibilitychange', function() {
        if (!popDoc.hidden) _popoutHeaderUpdate();
      });
    } catch(e) { console.warn('[popout] load inject error:', e); }
  }, { once: true });

  // Force saved position/size after document is ready — browsers ignore left/top in features string
  // Retry multiple times because some browsers delay window placement
  if (saved && saved.x != null && saved.y != null) {
    var _outerW = saved.ow || (saved.iw + 16);
    var _outerH = saved.oh || (saved.ih + 39);
    function _forceGeo() {
      try {
        if (popWin.closed) return;
        popWin.moveTo(saved.x, saved.y);
        popWin.resizeTo(_outerW, _outerH);
      } catch(e) {}
    }
    _forceGeo();
    setTimeout(_forceGeo, 50);
    setTimeout(_forceGeo, 200);
    setTimeout(_forceGeo, 500);
  }

  // Placeholder in main window
  var placeholder = document.createElement('div');
  placeholder.className = 'spawn-popout-placeholder';
  placeholder.innerHTML = '<span style="opacity:0.5">⇗</span> ' + title + ' — deschis in pop-out';
  sourceEl.parentNode.insertBefore(placeholder, sourceEl);

  // Update button state
  var btnIds = { harta: 'btnPopoutHarta', gheata: 'btnPopoutGheata', timpspawn: 'btnPopoutTimpSpawn' };
  var btn = document.getElementById(btnIds[type] || '');
  if (btn) { btn.style.color = 'var(--gold-light)'; btn.style.borderColor = 'var(--gold)'; }

  // Sync table in pop-out periodically
  var syncInt = null;
  if (type === 'gheata') {
    syncInt = setInterval(function() {
      if (popWin.closed) { clearInterval(syncInt); return; }
      renderGheataTable();
    }, 2000);
  } else if (type === 'timpspawn') {
    syncInt = setInterval(function() {
      if (popWin.closed) { clearInterval(syncInt); return; }
      // Lightweight sync: only update input values instead of full DOM rebuild
      try {
        var inputs = popWin.document.querySelectorAll('.spawn-mmss[data-ch]');
        if (!inputs.length) { renderChSplitTable(); return; }
        inputs.forEach(function(el) {
          var chKey = el.dataset.ch;
          var newVal = (spawnData && spawnData.chTimes && spawnData.chTimes[chKey]) || '';
          if (el !== popWin.document.activeElement && el.value !== newVal) el.value = newVal;
        });
        // Also sync beaten state for CH labels
        var labels = popWin.document.querySelectorAll('.spawn-ch-label[data-nowch]');
        labels.forEach(function(lbl) {
          var ck = lbl.dataset.nowch;
          var isB = !!(spawnData && spawnData.chBeaten && spawnData.chBeaten[ck]);
          if (lbl.classList.contains('ch-beaten') !== isB) {
            lbl.classList.toggle('ch-beaten', isB);
            var ic = lbl.nextElementSibling;
            if (ic) ic.classList.toggle('ch-beaten-cell', isB);
          }
        });
      } catch(e) { renderChSplitTable(); }
    }, 2000);
  } else if (type === 'harta') {
    syncInt = setInterval(function() {
      if (popWin.closed) { clearInterval(syncInt); return; }
      buildMapDots();
      updateSpawnTimeStrip();
    }, 2000);
  }

  // Update time + countdown in pop-out header every second
  // Uses a Web Worker so it keeps ticking even when browser throttles background tabs
  var _popoutHeaderUpdate = function() {
    if (popWin.closed) return;
    try {
      var phTime = popWin.document.getElementById('phTime');
      var phCd   = popWin.document.getElementById('phCountdown');
      var now = getSyncedNow();
      var timeStr = (now.getHours()<10?'0':'') + now.getHours() + ':' +
        (now.getMinutes()<10?'0':'') + now.getMinutes() + ':' +
        (now.getSeconds()<10?'0':'') + now.getSeconds();
      // For timpspawn, show MM:SS in the centered clock above the table
      if (type === 'timpspawn') {
        if (phTime) phTime.textContent = '';
        var tsClock = popWin.document.getElementById('tsClock');
        var _m = now.getMinutes(), _s = now.getSeconds();
        if (tsClock) tsClock.innerHTML = '<span class="tsc-mm">' + (_m<10?'0':'')+_m + '</span><span class="tsc-unit">m</span> <span class="tsc-ss">' + (_s<10?'0':'')+_s + '</span><span class="tsc-unit">s</span>';
      } else if (phTime && type !== 'harta') {
        phTime.textContent = timeStr;
      }
      // Live clock overlay inside map (harta pop-out only)
      if (type === 'harta') {
        var mapClock = popWin.document.getElementById('mapLiveClock');
        if (!mapClock) {
          mapClock = popWin.document.createElement('div');
          mapClock.id = 'mapLiveClock';
          mapClock.className = 'map-live-clock';
          var mapWrap = popWin.document.getElementById('spawnMapWrap');
          if (mapWrap) mapWrap.appendChild(mapClock);
        }
        if (mapClock) {
          mapClock.textContent = (now.getMinutes()<10?'0':'') + now.getMinutes() + ':' +
            (now.getSeconds()<10?'0':'') + now.getSeconds();
        }
      }
      if (phCd && spawnData && spawnData.chTimes) {
        var parts = [];
        for (var c = 1; c <= 6; c++) {
          var val = spawnData.chTimes['ch' + c];
          if (!val) continue;
          var diff = _chTimeDiff(val);
          if (diff !== null && diff <= 120) {
            var dm = Math.floor(diff / 60), ds = diff % 60;
            parts.push('CH' + c + ' ' + dm + ':' + (ds<10?'0':'') + ds);
          }
        }
        phCd.textContent = parts.length ? parts.join('  ') : '';
      }
      // Update per-CH countdowns in timpspawn pop-out + next CH indicator
      if (type === 'timpspawn' && spawnData && spawnData.chTimes) {
        var nearestCh = null, nearestDiff = Infinity;
        for (var ci = 1; ci <= 6; ci++) {
          var cdEl = popWin.document.getElementById('tsCd' + ci);
          if (!cdEl) continue;
          var chVal = spawnData.chTimes['ch' + ci];
          if (!chVal) { cdEl.className = 'ts-cd'; cdEl.textContent = ''; continue; }
          var cdDiff = _chTimeDiff(chVal);
          if (cdDiff === null) { cdEl.className = 'ts-cd'; cdEl.textContent = ''; continue; }
          var cdM = Math.floor(cdDiff / 60), cdS = cdDiff % 60;
          var cdText = cdM + ':' + (cdS < 10 ? '0' : '') + cdS;
          cdEl.textContent = cdText;
          cdEl.className = 'ts-cd visible' + (cdDiff <= 30 ? ' imminent' : cdDiff <= 120 ? ' soon' : '');
          if (cdDiff < nearestDiff) { nearestDiff = cdDiff; nearestCh = ci; }
        }
        // Update "next CH" indicator below clock
        var nextChEl = popWin.document.getElementById('tsNextCh');
        if (nextChEl) {
          // Show previous spawn type for 15 min after auto-reset, then switch to next type.
          var _displayType = spawnData.spawnType || 'simplu';
          var _prevST = spawnData._prevSpawnType;
          var _rstAt = spawnData._resetAt || 0;
          if (_prevST && _rstAt && (Date.now() - _rstAt) < 15 * 60 * 1000) {
            _displayType = _prevST;
          }
          var spawnTypeLbl = _displayType === 'dublu' ? 'Dubla' : 'Simpla';
          if (nearestCh !== null && nearestDiff < 3600) {
            var nM = Math.floor(nearestDiff / 60), nS = nearestDiff % 60;
            nextChEl.textContent = 'CH' + nearestCh + ' in ' + nM + ':' + (nS < 10 ? '0' : '') + nS + '  ·  ' + spawnTypeLbl;
            nextChEl.className = 'ts-next-ch visible' + (nearestDiff <= 30 ? ' imminent' : nearestDiff <= 120 ? ' soon' : '');
          } else {
            nextChEl.textContent = spawnTypeLbl;
            nextChEl.className = 'ts-next-ch visible';
          }
        }
      }
    } catch(e) {}
  };
  // Try Web Worker for unthrottled ticking, fall back to setInterval
  var _popoutWorker = null;
  var _popoutFallbackInt = null;
  try {
    var wBlob = new Blob([
      'var tid=null;onmessage=function(e){if(e.data==="start"){if(tid)clearInterval(tid);tid=setInterval(function(){postMessage("t")},1000)}if(e.data==="stop"){if(tid){clearInterval(tid);tid=null}}}'
    ], { type: 'application/javascript' });
    _popoutWorker = new Worker(URL.createObjectURL(wBlob));
    _popoutWorker.onmessage = function() {
      if (popWin.closed) { _popoutWorker.postMessage('stop'); _popoutWorker.terminate(); return; }
      _popoutHeaderUpdate();
    };
    _popoutWorker.postMessage('start');
  } catch(e) {
    _popoutFallbackInt = setInterval(function() {
      if (popWin.closed) { clearInterval(_popoutFallbackInt); return; }
      _popoutHeaderUpdate();
    }, 1000);
  }
  // Also update immediately when pop-out regains focus (catches sleep recovery)
  popWin.addEventListener('focus', _popoutHeaderUpdate);

  // Ctrl+Z in pop-out — delegate to main window's undo (not for timpspawn, which has its own CH-time undo)
  if (type !== 'timpspawn') {
    popWin.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        spawnUndo();
      }
    });
  }

  // Save position/size — store both inner (for window.open) and outer (for resizeTo)
  var _lastGeo = null;
  var _lastGeoJson = '';
  function _savePopGeo() {
    try {
      if (popWin.closed) return;
      var sx = typeof popWin.screenX === 'number' ? popWin.screenX : popWin.screenLeft;
      var sy = typeof popWin.screenY === 'number' ? popWin.screenY : popWin.screenTop;
      var iw = popWin.innerWidth;
      var ih = popWin.innerHeight;
      var ow = popWin.outerWidth || (iw + 16);
      var oh = popWin.outerHeight || (ih + 39);
      if (iw > 50 && ih > 50) {
        _lastGeo = { x: sx, y: sy, iw: iw, ih: ih, ow: ow, oh: oh };
      }
    } catch(e) {}
  }
  function _persistGeo() {
    if (!_lastGeo) return;
    var json = JSON.stringify(_lastGeo);
    if (json === _lastGeoJson) return; // skip write if unchanged
    _lastGeoJson = json;
    localStorage.setItem('popout_geo_' + type, json);
  }
  var geoInt = setInterval(function() {
    if (popWin.closed) {
      clearInterval(geoInt);
      _savePopGeo(); _persistGeo();
      return;
    }
    _savePopGeo(); _persistGeo();
  }, 1000);
  try {
    popWin.addEventListener('resize', function() { _savePopGeo(); _persistGeo(); });
    popWin.addEventListener('beforeunload', function() {
      _savePopGeo(); _persistGeo();
      // Move element back to main page BEFORE pop-out DOM is destroyed
      try {
        if (placeholder && placeholder.parentNode && sourceEl) {
          placeholder.parentNode.insertBefore(sourceEl, placeholder);
        }
      } catch(e) {}
    });
  } catch(e) {}

  // Monitor for window close → move element back
  var checkClosed = setInterval(function() {
    if (!popWin.closed) return;
    clearInterval(checkClosed);
    if (syncInt) clearInterval(syncInt);
    if (_popoutWorker) { try { _popoutWorker.postMessage('stop'); _popoutWorker.terminate(); } catch(e){} _popoutWorker = null; }
    if (_popoutFallbackInt) { clearInterval(_popoutFallbackInt); _popoutFallbackInt = null; }
    if (geoInt) clearInterval(geoInt);
    // Move popover back to main doc if it was in the pop-out
    if (type === 'harta') {
      var pop = document.getElementById('spawnPopover');
      if (!pop) {
        // Popover might still be in the now-closed pop-out's DOM — recreate reference won't work
        // but we stored the reference, so just ensure it's back in main doc
        try {
          var strayPop = popWin.document.getElementById('spawnPopover');
          if (strayPop) document.body.appendChild(strayPop);
        } catch(e) {}
      }
      // Close popover state
      var mainPop = document.getElementById('spawnPopover');
      if (mainPop) mainPop.classList.remove('open');
      popoverRoomId = null;
    }
    // Move element back to main page
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(sourceEl, placeholder);
      placeholder.remove();
    }
    if (btn) { btn.style.color = ''; btn.style.borderColor = ''; }
    delete _popoutActive[type];
    if (type === 'gheata') {
      // Restore thead visibility when returning to inline
      var ghT = sourceEl.tagName === 'TABLE' ? sourceEl : sourceEl.querySelector('.spawn-table');
      if (ghT) { var ghTh = ghT.querySelector('thead'); if (ghTh) ghTh.style.display = ''; }
      // Remove the gh-popout-wrap wrapper
      var ghW = sourceEl.querySelector('.gh-popout-wrap');
      if (ghW) { ghW.parentNode.insertBefore(ghW.firstElementChild, ghW); ghW.remove(); }
      renderGheataTable();
    }
    if (type === 'harta') { var _mc = document.getElementById('mapLiveClock'); if (_mc) _mc.remove(); buildMapDots(); }
    if (type === 'timpspawn') {
      // Restore thead visibility when returning to inline
      var tsTable = sourceEl.tagName === 'TABLE' ? sourceEl : sourceEl.querySelector('.spawn-table');
      if (tsTable) {
        var thead = tsTable.querySelector('thead');
        if (thead) thead.style.display = '';
      }
      renderChSplitTable();
      _toggleTsMidCol(false);
    }
  }, 400);

  _popoutActive[type] = { sourceEl: sourceEl, placeholder: placeholder, popWin: popWin, btn: btn };

  // timpspawn pop-out: no mid column needed (clock is above table now)
  // Mid column stays hidden; thead already hidden above
}

function closeSpawnPopout(type) {
  var state = _popoutActive[type];
  if (!state) return;

  // Close the pop-out window if open
  if (state.popWin && !state.popWin.closed) {
    state.popWin.close();
    // checkClosed interval handles DOM cleanup
    return;
  }

  // Manual cleanup (window already closed)
  if (state.placeholder && state.placeholder.parentNode) {
    state.placeholder.parentNode.insertBefore(state.sourceEl, state.placeholder);
    state.placeholder.remove();
  }
  if (state.btn) { state.btn.style.color = ''; state.btn.style.borderColor = ''; }
  delete _popoutActive[type];
  if (type === 'gheata') renderGheataTable();
  if (type === 'harta') buildMapDots();
  if (type === 'timpspawn') {
    renderChSplitTable();
    _toggleTsMidCol(false);
  }
}

document.getElementById('btnPopoutHarta').addEventListener('click', function() { openSpawnPopout('harta'); });
document.getElementById('btnPopoutGheata').addEventListener('click', function() { openSpawnPopout('gheata'); });
document.getElementById('btnPopoutTimpSpawn').addEventListener('click', function() { openSpawnPopout('timpspawn'); });

// Close pop-out windows when main page unloads
window.addEventListener('beforeunload', function() {
  Object.keys(_popoutActive).forEach(function(k) {
    if (_popoutActive[k].popWin && !_popoutActive[k].popWin.closed) _popoutActive[k].popWin.close();
  });
});

document.getElementById('btnSpawnReset').addEventListener('click', function() {
  if (!spawnData) loadSpawn();
  pushSpawnHistory(); // save snapshot before manual reset (has its own dedup via historyLastTs)

  var _doResetWrite = function() {
    doResetSpawnTables();
    // Write directly to Firebase (no debounce) so ALL users get the reset immediately
    if (typeof db !== 'undefined' && db) {
      var toWrite = JSON.parse(JSON.stringify(spawnData));
      toWrite._resetAt = Date.now();
      toWrite.rooms = null;
      var aliveP = {};
      if (spawnData.pins) {
        Object.keys(spawnData.pins).forEach(function(pk) {
          if (spawnData.pins[pk] && spawnData.pins[pk].x) aliveP[pk] = spawnData.pins[pk];
        });
      }
      toWrite.pins = Object.keys(aliveP).length > 0 ? aliveP : null;
      toWrite._rooms_cleared = true;
      db.ref(p('spawn/data')).set(toWrite).catch(function(e) {
        console.warn('Reset Firebase write error:', e);
      });
      if (fbSaveDebounce['spawn']) { clearTimeout(fbSaveDebounce['spawn']); delete fbSaveDebounce['spawn']; }
    }
    showToast('Tabele resetate', 'Gheata si Fulger curatate pentru toti userii');
  };

  if (typeof db !== 'undefined' && db) {
    // Same _spawnCycle node as auto-switch — prevents double-switch if timer and manual
    // Reset both fire in the same 60-min window.
    var cycleKey = String(Math.floor(getSyncedNow().getTime() / (60 * 60 * 1000)));
    db.ref(p('spawn/data/_spawnCycle')).transaction(function(current) {
      if (current && current.key === cycleKey) return; // abort — already switched this cycle
      return { key: cycleKey, ts: Date.now() };
    }, function(error, committed) {
      if (committed) {
        var prevType = spawnData.spawnType || 'simplu';
        spawnData._spawnCycle = { key: cycleKey, ts: Date.now() };
        autoAlternateSpawnType(prevType);
        _markSpawnCycleHandled();
      }
      _doResetWrite();
    });
  } else {
    // Offline fallback — no race possible
    var prevType = spawnData.spawnType || 'simplu';
    autoAlternateSpawnType(prevType);
    _doResetWrite();
  }
});

// Auto-load spawn data on page load so header timer works from any tab
(function() {
  if (!spawnData) {
    try {
      var raw = localStorage.getItem(SPAWN_KEY);
      if (!raw) raw = localStorage.getItem('metin2_spawn_v2');
      spawnData = raw ? migrateSpawnData(JSON.parse(raw)) : defaultSpawnData();
      if (!spawnData.spawnType) spawnData.spawnType = 'simplu';
    } catch(e) { spawnData = defaultSpawnData(); }
  }
  updateSpawnTypeUI();
  startSpawnTimerTick();
})();

// ═══════════════════════════════════════════════════════════════════
