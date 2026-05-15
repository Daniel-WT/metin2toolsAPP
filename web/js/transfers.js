// ============ TRANSFER TRACKING UI ============
var _transferData = null;
var _transferHistoryExpanded = false;
var _tfServerFilter = 'all'; // 'all' or server name
var _tfExpandedRow = null; // index of expanded transfer row
var _triggerScrapeStatus = null; // null | 'loading' | 'ok' | 'error'
var _triggerScrapeMsg = '';
var _lastScrapeInfo = null; // { before: ISOstring|null, after: ISOstring|null }
var _localDetectLoading = false;
var _localDetectResults = (function() {
  try {
    var s = localStorage.getItem('m2_localDetect');
    if (!s) return null;
    var parsed = JSON.parse(s);
    if (!parsed || parsed.appVersion !== (window.APP_VERSION || '')) { localStorage.removeItem('m2_localDetect'); return null; }
    return parsed;
  } catch(e) { return null; }
})();
var _snapshotData = null;
var _snapshotLoading = false;
var _snapshotServerFilter = 'all';
var _snapshotDate = '';
var _snapshotType = 'before';
var _snapshotCompareData = null;
var _snapshotPage = 0;
var _snapshotSearch = '';
var _snapshotStatusFilter = 'all'; // 'all' | 'disparut' | 'nou'
var SNAPSHOT_PAGE_SIZE = 60;
var _ssExpandedKey = null;  // 'srv||name'
var _ssCompareA = null;     // pinned disparut player
var _ssCompareB = null;     // pinned nou player
var _ncExpandedKey = '';    // expanded name-change row key

var _TF_SERVERS = ['Romania', 'Tara Romaneasca', 'Magyarorszag', 'Cesko', 'Polska'];
var _nameChangeLoading = false;
var _nameChangeResults = null;
var _availableDates = null; // null=not loaded, []= no dates found, [{date,hasBefore,hasAfter}]=loaded
var _scrapeSettings = { scanDay: 3 }; // default: Wednesday (0=Sun,1=Mon,...,6=Sat)
var _DAYS_RO = ['Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata'];

function _calcNextScanDates(scanDay) {
  var now = new Date();
  var daysUntil = (scanDay - now.getDay() + 7) % 7;
  if (daysUntil === 0 && now.getUTCHours() >= 21) daysUntil = 7; // today is done, next week
  var nextDay = new Date(now);
  nextDay.setDate(now.getDate() + daysUntil);
  var beforeDate = new Date(nextDay);
  beforeDate.setUTCHours(7, 0, 0, 0); // 07:00 UTC = 09:00 Romania (EET/EEST)
  return {
    beforeDate: beforeDate,
    beforeStr: beforeDate.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' la 09:00',
    afterStr: nextDay.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' (dupa mentenanta)'
  };
}

function saveScrapeSettings(day) {
  _scrapeSettings.scanDay = day;
  if (typeof db !== 'undefined' && db) {
    db.ref('meta/scrapeSettings').set({ scanDay: day }).catch(function(){});
  }
  renderTransfers();
}

function _loadScrapeSettings() {
  if (typeof db === 'undefined' || !db) return;
  db.ref('meta/scrapeSettings').once('value', function(snap) {
    var val = snap.val();
    if (val && typeof val.scanDay === 'number') {
      _scrapeSettings.scanDay = val.scanDay;
      renderTransfers();
    }
  });
}


function _loadAvailableDates() {
  // Check today, yesterday, and last 6 Wednesdays
  var dates = [];
  var now = new Date();
  dates.push(new Date(now).toISOString().slice(0, 10));
  dates.push(new Date(now.getTime() - 86400000).toISOString().slice(0, 10));
  var check = new Date(now);
  while (dates.length < 8) {
    check.setDate(check.getDate() - 1);
    if (check.getDay() === 3) {
      var ds = check.toISOString().slice(0, 10);
      if (dates.indexOf(ds) === -1) dates.push(ds);
    }
  }
  var results = {};
  dates.forEach(function(dt) { results[dt] = { hasBefore: false, hasAfter: false }; });
  var pending = dates.length * 2;
  function onDone() {
    _availableDates = dates
      .filter(function(dt) { return results[dt].hasBefore || results[dt].hasAfter; })
      .map(function(dt) { return { date: dt, hasBefore: results[dt].hasBefore, hasAfter: results[dt].hasAfter }; });
    renderTransfers();
  }
  dates.forEach(function(dt) {
    ['before', 'after'].forEach(function(type) {
      fetch('data/snapshots/' + type + '-' + dt + '.json', { method: 'HEAD' })
        .then(function(r) {
          if (r.ok) results[dt][type === 'before' ? 'hasBefore' : 'hasAfter'] = true;
          if (--pending === 0) onDone();
        })
        .catch(function() { if (--pending === 0) onDone(); });
    });
  });
}

function _loadLastScrapeInfo() {
  // Fetch only the meta from snapshot.json (lightweight — reads _meta only)
  // Also try to find latest dated snapshots by fetching today's and yesterday's
  var today = new Date().toISOString().slice(0, 10);
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var dates = [today, yesterday];
  var info = { before: null, after: null };
  var pending = 0;

  function tryDate(date) {
    ['before', 'after'].forEach(function(type) {
      pending++;
      fetch('data/snapshots/' + type + '-' + date + '.json?_=' + Date.now())
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
          if (d && d._meta && d._meta.savedAt) {
            if (!info[type] || d._meta.savedAt > info[type]) {
              info[type] = d._meta.savedAt;
            }
          }
          pending--;
          if (pending === 0) { _lastScrapeInfo = info; renderTransfers(); }
        })
        .catch(function() { pending--; if (pending === 0) { _lastScrapeInfo = info; renderTransfers(); } });
    });
  }

  dates.forEach(tryDate);
}

function loadTransferData() {
  fetch('data/transfers.json?_=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var changed = _transferData && data.lastUpdated !== _transferData.lastUpdated;
      _transferData = data;
      renderTransfers();
      _loadLastScrapeInfo();
      if (_availableDates === null) _loadAvailableDates();
      _loadScrapeSettings();
      if (changed) {
        _localDetectResults = null;
        try { localStorage.removeItem('m2_localDetect'); } catch(e) {}
        var changeMsg = 'Date noi incarcate: ' + (data.lastUpdated || '') + ' · ' + (data.transfers ? data.transfers.length : 0) + ' transferuri';
        if (window._isAdmin) _showScrapeNotif('Scrape nou incarcat: ' + (data.lastUpdated || '') + ' · ' + (data.transfers ? data.transfers.length : 0) + ' transferuri');
        window.addAdminLog && window.addAdminLog(changeMsg, 'data');
      }
    })
    .catch(function(e) {
      console.warn('Transfer data not available:', e);
      if (!_transferData) {
        _transferData = { lastUpdated: null, transfers: [], history: [] };
        renderTransfers();
        _loadLastScrapeInfo();
      }
    });
}

// Poll transfers.json every 60s — auto-refresh when a new scrape finishes
setInterval(loadTransferData, 60000);

function onDetectResultsUpdate(parsed) {
  if (!parsed || parsed.error) return;
  // Skip if we already have this exact detection (same timestamp = echoed back our own save)
  if (_localDetectResults && _localDetectResults.detectedAt && parsed.detectedAt &&
      _localDetectResults.detectedAt === parsed.detectedAt) return;
  // Skip if Firebase data is older than what we have locally
  if (_localDetectResults && _localDetectResults.detectedAt && parsed.detectedAt &&
      parsed.detectedAt < _localDetectResults.detectedAt) return;
  _localDetectResults = Object.assign({}, parsed, { source: 'firebase' });
  _nameChangeResults = parsed.nameChanges ? { nameChanges: parsed.nameChanges, date: parsed.date } : null;
  renderTransfers();
}

function onAutoScrapeEvent(evt) {
  var type = (evt.type || '').toUpperCase();
  if (evt.status === 'started') {
    _showScrapeNotif('Automatizare: scrape ' + type + ' pornit...');
    window.addAdminLog && window.addAdminLog('Worker: scrape ' + type + ' pornit', 'worker');
  } else if (evt.status === 'done') {
    var msg = 'Automatizare: scrape ' + type + ' finalizat';
    if (evt.transfers != null) msg += ' · ' + evt.transfers + ' transferuri';
    _showScrapeNotif(msg);
    window.addAdminLog && window.addAdminLog('Worker: scrape ' + type + ' finalizat' + (evt.transfers != null ? ' · ' + evt.transfers + ' transferuri' : ''), 'worker');
    _loadLastScrapeInfo();
  }
}

function _showScrapeNotif(msg) {
  var existing = document.getElementById('scrapeNotif');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'scrapeNotif';
  el.className = 'scrape-notif';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.classList.add('scrape-notif--visible'); }, 10);
  setTimeout(function() {
    el.classList.remove('scrape-notif--visible');
    setTimeout(function() { el.remove(); }, 400);
  }, 5000);
}

function _tfPlayerName(t) {
  var name = _escTf(t.name);
  if (t.nameAfter && t.nameAfter !== t.name) {
    name += ' <span class="tf-name-after">(acum: ' + _escTf(t.nameAfter) + ')</span>';
  }
  if (t.matchedByStats) {
    var conf = t.matchConfidence != null ? t.matchConfidence : '?';
    var confCls = conf >= 85 ? 'tf-conf--high' : (conf >= 55 ? 'tf-conf--mid' : 'tf-conf--low');
    var deltaStr = '';
    if (t.champExpDelta != null && t.champExpDelta !== 0) {
      deltaStr = ' +' + _fmtExp(t.champExpDelta) + ' champExp';
    }
    var title = 'Detectat prin statistici · ' + conf + '% sigur' + deltaStr;
    name += ' <span class="tf-matched-badge ' + confCls + '" title="' + title + '">' + conf + '%</span>';
  }
  return name;
}

function _fmtExp(n) {
  return Number(n).toLocaleString('ro-RO');
}

function _fmtDelta(n, fmtFn) {
  if (n === 0) return '=';
  var abs = fmtFn ? fmtFn(Math.abs(n)) : String(Math.abs(n));
  return (n > 0 ? '+' : '-') + abs;
}

function toggleSnapshotPlayer(srv, name) {
  var key = srv + '||' + name;
  _ssExpandedKey = (_ssExpandedKey === key) ? null : key;
  _renderSnapshotBody();
}

function toggleNC(key) {
  _ncExpandedKey = (_ncExpandedKey === key) ? '' : key;
  renderTransfers();
}

function snapshotPinCompare(srv, name, status) {
  var cmpData = _buildCompareData();
  var merged = _buildMergedPlayers(srv, cmpData);
  var p = null;
  for (var i = 0; i < merged.length; i++) { if (merged[i].name === name) { p = merged[i]; break; } }
  if (!p) return;
  var obj = Object.assign({}, p, { srv: srv });
  if (status === 'disparut') {
    _ssCompareA = (_ssCompareA && _ssCompareA.name === name && _ssCompareA.srv === srv) ? null : obj;
  } else {
    _ssCompareB = (_ssCompareB && _ssCompareB.name === name && _ssCompareB.srv === srv) ? null : obj;
  }
  _renderSnapshotBody();
}

function clearSnapshotCompare() {
  _ssCompareA = null; _ssCompareB = null;
  _renderSnapshotBody();
}

function _renderComparePanel() {
  if (!_ssCompareA && !_ssCompareB) return '';
  var a = _ssCompareA, b = _ssCompareB;
  var html = '<div class="ss-compare-panel">';
  html += '<div class="ss-compare-header"><span class="ss-compare-title">Comparatie</span><button class="ss-compare-close" onclick="clearSnapshotCompare()">&#x2715;</button></div>';
  if (a && b) {
    html += '<div class="ss-cmp-names">';
    html += '<div class="ss-cmp-name-a"><span class="ss-cmp-pname">' + _escTf(a.name) + '</span><span class="ss-cmp-badge ss-cmp-badge--d">disparut</span><span class="ss-cmp-srv">' + _escTf(a.srv) + '</span></div>';
    html += '<div class="ss-cmp-name-b"><span class="ss-cmp-pname">' + _escTf(b.name) + '</span><span class="ss-cmp-badge ss-cmp-badge--n">aparut</span><span class="ss-cmp-srv">' + _escTf(b.srv) + '</span></div>';
    html += '</div>';
    var rows = [
      { label: 'ChampExp', av: _fmtExp(a.champExp), bv: _fmtExp(b.champExp), d: b.champExp - a.champExp, fn: _fmtExp },
      { label: 'Exp', av: _fmtExp(a.exp || 0), bv: _fmtExp(b.exp || 0), d: (b.exp || 0) - (a.exp || 0), fn: _fmtExp },
      { label: 'Nivel', av: String(a.level), bv: String(b.level), d: b.level - a.level, fn: null },
      { label: 'CL', av: String(a.champLevel), bv: String(b.champLevel), d: b.champLevel - a.champLevel, fn: null },
      { label: 'Rank', av: '#' + a.rank, bv: '#' + b.rank, d: a.rank - b.rank, fn: null }
    ];
    rows.forEach(function(row) {
      var cls = row.d > 0 ? ' pos' : (row.d < 0 ? ' neg' : '');
      html += '<div class="ss-cmp-row"><span class="ss-cmp-label">' + row.label + '</span>';
      html += '<span class="ss-cmp-av">' + row.av + '</span>';
      html += '<span class="ss-cmp-delta' + cls + '">' + _fmtDelta(row.d, row.fn) + '</span>';
      html += '<span class="ss-cmp-bv">' + row.bv + '</span></div>';
    });
  } else {
    var p = a || b;
    var want = a ? 'nou aparut' : 'disparut';
    html += '<div class="ss-cmp-waiting"><span class="ss-cmp-pname">' + _escTf(p.name) + '</span> selectat · apasa pe un jucator <strong>' + want + '</strong> si adauga-l la comparatie</div>';
  }
  html += '</div>';
  return html;
}

function _statKeyBase(p) { return (p.class || '') + '|' + p.level + '|' + p.champLevel; }

function _champExpConf(before, after) {
  var delta = after.champExp - before.champExp;
  if (delta < 0) return 0;
  // If regular exp more than doubled in the snapshot window, very likely different person
  if (before.exp > 0 && after.exp != null && (after.exp - before.exp) / before.exp > 1.0) return 0;
  if (delta === 0)    return 95;
  if (delta < 5000)   return 97;
  if (delta < 30000)  return 90;
  if (delta < 150000) return 72;
  if (delta < 500000) return 50;
  return 15;
}

function _isAdminName(name) {
  return /^\[(GA|GM)\]/i.test(name || '');
}

function _isAmbiguous(scored) {
  return scored.length >= 2 && (scored[0].conf - scored[1].conf) < 5;
}

function _detectTransfersJS(beforeSnap, afterSnap) {
  var transfers = [];
  var beforeByName = {}, afterByName = {};
  Object.keys(beforeSnap).forEach(function(srv) {
    if (srv === '_meta') return;
    var d = beforeSnap[srv]; var players = Array.isArray(d) ? d : (d && d.players) || [];
    players.forEach(function(p) { beforeByName[p.name] = Object.assign({}, p, { server: srv }); });
  });
  Object.keys(afterSnap).forEach(function(srv) {
    if (srv === '_meta') return;
    var d = afterSnap[srv]; var players = Array.isArray(d) ? d : (d && d.players) || [];
    players.forEach(function(p) { afterByName[p.name] = Object.assign({}, p, { server: srv }); });
  });

  // Pass 1: exact same name on different server → definitive transfer (no stats needed)
  var matchedByName = {};
  Object.keys(afterByName).forEach(function(name) {
    var after = afterByName[name]; var before = beforeByName[name];
    if (before && before.server !== after.server) {
      transfers.push({ name: name, from: before.server, to: after.server,
        level: after.level, champLevel: after.champLevel, exp: after.exp,
        class: after.class, champExp: after.champExp, kingdom: after.kingdom,
        rankBefore: before.rank, rankAfter: after.rank,
        champExpDelta: after.champExp - before.champExp });
      matchedByName[name] = true;
    }
  });

  // Unmatched pools (players whose name has no direct counterpart)
  var disappeared = [], appeared = [];
  Object.keys(beforeByName).forEach(function(n) { if (!afterByName[n] && !matchedByName[n]) disappeared.push(beforeByName[n]); });
  Object.keys(afterByName).forEach(function(n)  { if (!beforeByName[n] && !matchedByName[n]) appeared.push(afterByName[n]); });

  // Pass 2: same-server name changes FIRST.
  // Race cannot change, so _statKeyBase (class|level|CL) guarantees a Lycan
  // only matches a Lycan, preventing cross-race false positives.
  // Running this before cross-server matching ensures a renamed player is
  // never also flagged as a transfer.
  var nameChanges = [];
  var usedDisappearedIdx = new Set();
  var usedAppearedIdx = new Set();

  var bySrvStats = {};
  disappeared.forEach(function(p, i) {
    var k = p.server + '|' + _statKeyBase(p);
    if (!bySrvStats[k]) bySrvStats[k] = [];
    bySrvStats[k].push({ p: p, i: i });
  });

  appeared.forEach(function(ap, j) {
    if (_isAdminName(ap.name)) return;
    var k = ap.server + '|' + _statKeyBase(ap);
    var byDelta = (bySrvStats[k] || [])
      .filter(function(item) {
        var p = item.p;
        if (_isAdminName(p.name)) return false;
        if (p.champExp > ap.champExp) return false;
        // Kingdom check: same server → kingdom cannot change.
        // If both have kingdom data and they differ, it's a different player.
        if (p.kingdom && ap.kingdom && p.kingdom !== ap.kingdom) return false;
        return true;
      })
      .map(function(item) { return { item: item, delta: ap.champExp - item.p.champExp }; })
      .sort(function(a, b) { return a.delta - b.delta });
    if (!byDelta.length) return;
    var best = byDelta[0];
    if (best.delta > 150000) return;
    if (byDelta.length >= 2 && byDelta[1].delta - best.delta < Math.max(15000, best.delta)) return;
    var dp = best.item.p;
    bySrvStats[k].splice(bySrvStats[k].indexOf(best.item), 1);
    usedDisappearedIdx.add(best.item.i);
    usedAppearedIdx.add(j);
    nameChanges.push({ name: dp.name, nameAfter: ap.name, server: ap.server,
      level: ap.level, champLevel: ap.champLevel, rank: ap.rank,
      matchConfidence: _champExpConf(dp, ap), champExpDelta: ap.champExp - dp.champExp, nameChange: true });
  });

  // Pass 3: cross-server stat matching — only players NOT already matched as name changes.
  // Kingdom is intentionally NOT checked here: players may change kingdom when moving servers.
  // _statKeyBase includes class, so cross-race matches are impossible when class data exists.
  var disappearedForXfer = disappeared.filter(function(_, i) { return !usedDisappearedIdx.has(i); });
  var appearedForXfer = appeared.filter(function(_, j) { return !usedAppearedIdx.has(j); });

  var byStats = {};
  disappearedForXfer.forEach(function(p) {
    var k = _statKeyBase(p); if (!byStats[k]) byStats[k] = []; byStats[k].push(p);
  });

  appearedForXfer.forEach(function(ap) {
    if (_isAdminName(ap.name)) return;
    var k = _statKeyBase(ap);
    var byDelta = (byStats[k] || [])
      .filter(function(c) { return c.server !== ap.server && !_isAdminName(c.name) && c.champExp <= ap.champExp; })
      .map(function(c) { return { c: c, delta: ap.champExp - c.champExp }; })
      .sort(function(a, b) { return a.delta - b.delta });
    if (!byDelta.length) return;
    var best = byDelta[0];
    if (best.delta > 150000) return;
    if (best.c.exp > 0 && ap.exp != null && (ap.exp - best.c.exp) / best.c.exp > 1.0) return;
    if (byDelta.length >= 2 && byDelta[1].delta - best.delta < Math.max(15000, best.delta)) return;
    var dp = best.c;
    byStats[k].splice(byStats[k].indexOf(dp), 1);
    transfers.push({ name: dp.name, nameAfter: ap.name, from: dp.server, to: ap.server,
      level: ap.level, champLevel: ap.champLevel, exp: ap.exp, champExp: ap.champExp,
      class: ap.class, champExpBefore: dp.champExp,
      kingdom: ap.kingdom, rankBefore: dp.rank, rankAfter: ap.rank,
      matchedByStats: true, matchConfidence: _champExpConf(dp, ap), champExpDelta: ap.champExp - dp.champExp });
  });

  transfers.sort(function(a, b) { return b.champLevel - a.champLevel || a.name.localeCompare(b.name); });
  nameChanges.sort(function(a, b) { return b.champLevel - a.champLevel || a.name.localeCompare(b.name); });
  return { transfers: transfers, nameChanges: nameChanges };
}

function _getSnapPlayers(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data).filter(function(p) { return p && p.name; });
}

function runDetect() {
  if (_localDetectLoading || _nameChangeLoading) return;
  _localDetectLoading = true;
  _nameChangeLoading = true;
  _localDetectResults = null;
  _nameChangeResults = null;
  renderTransfers();
  window.addAdminLog && window.addAdminLog('Detectie pornita (auto-cauta ultimele snapshots...)', 'detect');

  // If a specific date was selected via chips, use it directly
  // Also check the hidden input in case _snapshotDate wasn't set yet (chip appeared active but never clicked)
  var _inputEl = document.getElementById('snapshotDateInput');
  var _inputDate = _inputEl && _inputEl.value && _inputEl.value.length === 10 ? _inputEl.value : null;
  var _chipDate = (typeof _snapshotDate === 'string' && _snapshotDate.length === 10) ? _snapshotDate : _inputDate;
  var datesToTry = [];
  if (_chipDate) {
    datesToTry = [_chipDate];
  } else {
    for (var i = 0; i < 5; i++) {
      var _d = new Date(); _d.setDate(_d.getDate() - i);
      datesToTry.push(_d.toISOString().slice(0, 10));
    }
  }

  // Find the latest available file of a given type (before/after)
  function findLatest(type) {
    function tryDate(idx) {
      if (idx >= datesToTry.length) return Promise.reject(new Error('Niciun snapshot ' + type + ' gasit. Ruleaza mai intai un scrape.'));
      var dt = datesToTry[idx];
      return fetch('data/snapshots/' + type + '-' + dt + '.json?_=' + Date.now())
        .then(function(r) {
          if (!r.ok) return tryDate(idx + 1);
          return r.json().then(function(data) { return { data: data, date: dt }; });
        })
        .catch(function() { return tryDate(idx + 1); });
    }
    return tryDate(0);
  }

  Promise.all([findLatest('before'), findLatest('after')])
    .then(function(results) {
      var beforeRes = results[0], afterRes = results[1];
      var detected = _detectTransfersJS(beforeRes.data, afterRes.data);
      var nameChanges = _detectNameChangesOnlyJS(beforeRes.data, afterRes.data);
      _localDetectLoading = false;
      _nameChangeLoading = false;
      var label = 'before:' + beforeRes.date + ' / after:' + afterRes.date;
      _localDetectResults = { transfers: detected.transfers, nameChanges: detected.nameChanges, date: afterRes.date, detectedAt: Date.now(), source: 'local', appVersion: window.APP_VERSION || '' };
      _nameChangeResults = { nameChanges: nameChanges, date: afterRes.date };
      try { localStorage.setItem('m2_localDetect', JSON.stringify(_localDetectResults)); } catch(e) {}
      if (typeof db !== 'undefined' && db) {
        db.ref(p('meta/detectResults')).set(JSON.stringify(_localDetectResults)).catch(function(){});
        // Push snapshotDiff to root Firebase so Pro app can see it
        var _diff = { date: afterRes.date };
        _TF_SERVERS.forEach(function(srv) {
          var bArr = _getSnapPlayers(beforeRes.data[srv]);
          var aArr = _getSnapPlayers(afterRes.data[srv]);
          var afterNames = {};
          aArr.forEach(function(p) { afterNames[p.name] = true; });
          var beforeNames = {};
          bArr.forEach(function(p) { beforeNames[p.name] = true; });
          var merged = aArr.map(function(player) {
            return Object.assign({}, player, { _status: beforeNames[player.name] ? 'stayed' : 'nou' });
          }).concat(bArr.filter(function(player) {
            return !afterNames[player.name];
          }).map(function(player) {
            return Object.assign({}, player, { _status: 'disparut' });
          }));
          merged.sort(function(a, b) { return (a.rank || 0) - (b.rank || 0); });
          _diff[srv] = merged;
        });
        db.ref('snapshotDiff').set(_diff).catch(function(){});
        // Sync detected transfers to root Firebase so Pro app sees them
        // JSON round-trip strips undefined values which Firebase rejects
        var cleanTransfers = JSON.parse(JSON.stringify(detected.transfers));
        var cleanNameChanges = JSON.parse(JSON.stringify(nameChanges));
        db.ref('transfers').update({
          lastUpdated: afterRes.date,
          transfers: cleanTransfers,
          nameChanges: cleanNameChanges
        }).catch(function(){});
      }
      window.addAdminLog && window.addAdminLog('Detectie gata: ' + detected.transfers.length + ' transferuri · ' + label, 'detect');
      renderTransfers();
    })
    .catch(function(e) {
      _localDetectLoading = false;
      _nameChangeLoading = false;
      _localDetectResults = { error: e.message };
      _nameChangeResults = { error: e.message };
      window.addAdminLog && window.addAdminLog('Detectie eroare: ' + e.message, 'error');
      renderTransfers();
    });
}

// Detecteaza DOAR schimbari de nume pe acelasi server, fara transferuri
// Matching: champLevel + champExp (exp normal poate diferi — reinvieri)
function _detectNameChangesOnlyJS(beforeSnap, afterSnap) {
  var beforeBySrv = {}, afterBySrv = {};
  _TF_SERVERS.forEach(function(srv) {
    var bd = beforeSnap[srv], ad = afterSnap[srv];
    beforeBySrv[srv] = {};
    afterBySrv[srv] = {};
    if (bd) { var bp = Array.isArray(bd) ? bd : (bd.players || []); bp.forEach(function(p) { beforeBySrv[srv][p.name] = p; }); }
    if (ad) { var ap2 = Array.isArray(ad) ? ad : (ad.players || []); ap2.forEach(function(p) { afterBySrv[srv][p.name] = p; }); }
  });

  var results = [];
  _TF_SERVERS.forEach(function(srv) {
    var before = beforeBySrv[srv], after = afterBySrv[srv];
    var disappeared = Object.keys(before)
      .filter(function(n) { return !after[n] && !_isAdminName(n); })
      .map(function(n) { return before[n]; });
    var appeared = Object.keys(after)
      .filter(function(n) { return !before[n] && !_isAdminName(n); })
      .map(function(n) { return after[n]; });
    if (!disappeared.length || !appeared.length) return;

    var byStats = {};
    disappeared.forEach(function(p) {
      var k = _statKeyBase(p); if (!byStats[k]) byStats[k] = []; byStats[k].push(p);
    });
    appeared.forEach(function(ap) {
      var k = _statKeyBase(ap);
      var byDelta = (byStats[k] || [])
        .filter(function(c) {
          if (c.champExp > ap.champExp) return false;
          // Kingdom cannot change via name change on same server
          if (c.kingdom && ap.kingdom && c.kingdom !== ap.kingdom) return false;
          return true;
        })
        .map(function(c) { return { c: c, delta: ap.champExp - c.champExp }; })
        .sort(function(a, b) { return a.delta - b.delta });
      if (!byDelta.length) return;
      var best = byDelta[0];
      if (best.delta > 150000) return;
      if (byDelta.length >= 2 && byDelta[1].delta - best.delta < Math.max(15000, best.delta)) return;
      var dp = best.c;
      byStats[k].splice(byStats[k].indexOf(dp), 1);
      results.push({ nameBefore: dp.name, nameAfter: ap.name, server: srv,
        level: ap.level, champLevel: ap.champLevel,
        champExpDelta: ap.champExp - dp.champExp,
        rankBefore: dp.rank, rankAfter: ap.rank,
        matchConfidence: _champExpConf(dp, ap) });
    });
  });
  return results;
}


function _tfFilterTransfers(transfers) {
  if (!transfers || _tfServerFilter === 'all') return transfers || [];
  return transfers.filter(function(t) {
    return t.to === _tfServerFilter;
  });
}

function setTfFilter(server) {
  _tfServerFilter = server;
  renderTransfers();
}

function renderTransfers() {
  var el = document.getElementById('transfersContent');
  if (!el) return;
  if (!_transferData) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Se incarca...</div>'; return; }

  var sourceTransfers = (_localDetectResults && _localDetectResults.transfers)
    ? _localDetectResults.transfers : _transferData.transfers;
  var filtered = _tfFilterTransfers(sourceTransfers);
  var isLocalResult = _localDetectResults && _localDetectResults.transfers;

  // Build name-change index: nameBefore → nameAfter (from dedicated name change detection)
  var _ncIndex = {};
  if (_nameChangeResults && _nameChangeResults.nameChanges) {
    _nameChangeResults.nameChanges.forEach(function(nc) { _ncIndex[nc.nameBefore] = nc.nameAfter; });
  }

  var html = '';

  // ── Info bar ──
  html += '<div class="tf-info-bar">';
  if (isLocalResult) {
    var _srcLabel = _localDetectResults.source === 'firebase' ? 'Sincronizat Firebase' : 'Forced Detection';
    var _srcTime = _localDetectResults.detectedAt ? new Date(_localDetectResults.detectedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '';
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Sursa</span>';
    html += '<span class="tf-info-value tf-info-local">' + _srcLabel + '</span>';
    html += '<span class="tf-info-sub">' + _escTf(_localDetectResults.date || '') + (_srcTime ? ' · ' + _srcTime : '') + '</span>';
    html += '</div>';
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Transferuri</span>';
    html += '<span class="tf-info-value tf-info-number">' + filtered.length + '</span>';
    html += '</div>';
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Optiuni</span>';
    html += '<button class="tf-reset-btn" onclick="_localDetectResults=null;try{localStorage.removeItem(\'m2_localDetect\')}catch(e){}renderTransfers()">Reseteaza detectia</button>';
    html += '</div>';
  } else {
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Ultima actualizare</span>';
    html += '<span class="tf-info-value">' + (_transferData.lastUpdated || 'Niciuna') + '</span>';
    html += '</div>';
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Transferuri</span>';
    html += '<span class="tf-info-value tf-info-number">' + filtered.length + '</span>';
    html += '</div>';
    html += '<div class="tf-info-item">';
    html += '<span class="tf-info-label">Scanare</span>';
    html += '<span class="tf-info-value">' + _DAYS_RO[_scrapeSettings.scanDay] + ' (auto)</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── Server filter ──
  html += '<div class="tf-filter-bar">';
  html += '<span class="tf-filter-label">Server:</span>';
  html += '<button class="tf-filter-btn' + (_tfServerFilter === 'all' ? ' active' : '') + '" onclick="setTfFilter(\'all\')">Toate</button>';
  _TF_SERVERS.forEach(function(srv) {
    html += '<button class="tf-filter-btn' + (_tfServerFilter === srv ? ' active' : '') + '" onclick="setTfFilter(\'' + srv + '\')">' + _escTf(srv) + '</button>';
  });
  html += '</div>';

  // ── Current transfers table ──
  html += '<div class="tf-section">';
  html += '<div class="tf-section-title-row">';
  html += '<span>Transferuri Recente</span>';
  html += '</div>';

  if (filtered.length > 0) {
    html += '<div class="tf-table-wrap"><table class="tf-table">';
    html += '<thead><tr><th>Jucator</th><th>De pe</th><th></th><th>Pe</th><th>CL</th><th>Clasa</th><th>Rank</th><th></th></tr></thead>';
    html += '<tbody>';
    filtered.forEach(function(t, i) {
      var expanded = _tfExpandedRow === i;
      var champExpBefore = (t.champExpBefore != null) ? t.champExpBefore : (t.champExp != null && t.champExpDelta != null ? t.champExp - t.champExpDelta : null);
      // Enrich with name change: if player later changed name, show "(acum: NumeNou)"
      var tDisplay = t;
      var ncName = _ncIndex[t.name] || (t.nameAfter && _ncIndex[t.nameAfter]);
      if (ncName && ncName !== t.name && ncName !== t.nameAfter) {
        tDisplay = Object.assign({}, t, { nameAfter: ncName });
      }
      html += '<tr class="tf-row' + (expanded ? ' tf-row--expanded' : '') + '" onclick="_tfExpandedRow=' + (expanded ? 'null' : i) + ';renderTransfers()" style="cursor:pointer">';
      html += '<td class="tf-name-cell">' + _tfPlayerName(tDisplay) + '</td>';
      html += '<td class="tf-server tf-from">' + _escTf(t.from) + '</td>';
      html += '<td class="tf-arrow">→</td>';
      html += '<td class="tf-server tf-to">' + _escTf(t.to) + '</td>';
      html += '<td class="tf-champ">CL ' + t.champLevel + '</td>';
      html += '<td class="tf-class">' + _escTf(t.class || '-') + '</td>';
      html += '<td class="tf-rank">#' + t.rankBefore + ' → #' + t.rankAfter + '</td>';
      html += '<td class="tf-expand-icon">' + (expanded ? '▲' : '▼') + '</td>';
      html += '</tr>';
      if (expanded) {
        html += '<tr class="tf-detail-row"><td colspan="8"><div class="tf-detail">';
        if (champExpBefore != null) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">ChampExp inainte</span><span class="tf-detail-val">' + _fmtExp(champExpBefore) + '</span></div>';
          html += '<div class="tf-detail-item"><span class="tf-detail-label">ChampExp dupa</span><span class="tf-detail-val">' + _fmtExp(t.champExp) + '</span></div>';
          var delta = t.champExpDelta || 0;
          var deltaStr = (delta >= 0 ? '+' : '') + _fmtExp(delta);
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Delta</span><span class="tf-detail-val tf-detail-delta' + (delta > 0 ? '--pos' : '') + '">' + deltaStr + '</span></div>';
        }
        html += '<div class="tf-detail-item"><span class="tf-detail-label">Nivel char</span><span class="tf-detail-val">' + (t.level || '?') + '</span></div>';
        html += '<div class="tf-detail-item"><span class="tf-detail-label">Rank</span><span class="tf-detail-val">#' + t.rankBefore + ' → #' + t.rankAfter + '</span></div>';
        if (t.matchedByStats) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Metoda</span><span class="tf-detail-val">stat match · ' + (t.matchConfidence || '?') + '% conf</span></div>';
        } else {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Metoda</span><span class="tf-detail-val">name match</span></div>';
        }
        html += '</div></td></tr>';
      }
    });
    html += '</tbody></table></div>';
  } else {
    html += '<div class="tf-empty">';
    html += '<div class="tf-empty-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></div>';
    html += '<div class="tf-empty-text">Niciun transfer detectat</div>';
    if (_tfServerFilter !== 'all') {
      html += '<div class="tf-empty-sub">Niciun transfer pentru ' + _escTf(_tfServerFilter) + '.</div>';
    } else {
      html += '<div class="tf-empty-sub">Transferurile sunt verificate automat in fiecare miercuri.</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // ── Name changes ──
  // Priority: dedicated name change detection > local detect > server data
  function _normNC(nc) {
    return {
      name: nc.nameBefore || nc.name,
      nameAfter: nc.nameAfter,
      server: nc.server,
      champLevel: nc.champLevel,
      matchConfidence: nc.matchConfidence,
      champExpDelta: nc.champExpDelta,
      rankBefore: nc.rankBefore,
      rankAfter: nc.rankAfter,
      level: nc.level
    };
  }
  var sourceNameChanges = (_nameChangeResults && _nameChangeResults.nameChanges)
    ? _nameChangeResults.nameChanges.map(_normNC)
    : (_localDetectResults && _localDetectResults.nameChanges)
      ? _localDetectResults.nameChanges.map(_normNC)
      : (_transferData.nameChanges || []).map(_normNC);
  var filteredNC = _tfServerFilter === 'all' ? sourceNameChanges
    : sourceNameChanges.filter(function(nc) { return nc.server === _tfServerFilter; });
  if (filteredNC.length > 0) {
    html += '<div class="tf-section">';
    html += '<div class="tf-section-title">Schimbari de Nume</div>';
    html += '<div class="tf-nc-list">';
    filteredNC.forEach(function(nc, idx) {
      var conf = nc.matchConfidence || '?';
      var confCls = conf >= 85 ? 'tf-conf--high' : (conf >= 55 ? 'tf-conf--mid' : 'tf-conf--low');
      var ncKey = (nc.server || '') + '||' + (nc.name || '') + '||' + idx;
      var isExpanded = _ncExpandedKey === ncKey;
      html += '<div class="tf-nc-row' + (isExpanded ? ' tf-nc-row--open' : '') + '" onclick="toggleNC(' + JSON.stringify(ncKey) + ')">';
      html += '<div class="tf-nc-main">';
      html += '<div class="tf-nc-names">';
      html += '<span class="tf-nc-old">' + _escTf(nc.name) + '</span>';
      html += '<span class="tf-nc-arrow">→</span>';
      html += '<span class="tf-nc-new">' + _escTf(nc.nameAfter) + '</span>';
      html += '</div>';
      html += '<div class="tf-nc-meta">';
      html += '<span class="tf-nc-srv">' + _escTf(nc.server) + '</span>';
      html += '<span class="tf-champ">CL ' + (nc.champLevel || '?') + '</span>';
      html += '<span class="tf-matched-badge ' + confCls + '">' + conf + '%</span>';
      html += '<span class="tf-nc-chevron">' + (isExpanded ? '▾' : '▸') + '</span>';
      html += '</div>';
      html += '</div>';
      if (isExpanded) {
        html += '<div class="tf-nc-details">';
        if (nc.champExpDelta != null) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Delta ChampExp</span><span class="tf-detail-val tf-detail-delta--pos">+' + Number(nc.champExpDelta).toLocaleString('ro-RO') + '</span></div>';
        }
        if (nc.rankBefore != null) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Rank inainte</span><span class="tf-detail-val">#' + nc.rankBefore + '</span></div>';
        }
        if (nc.rankAfter != null) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Rank dupa</span><span class="tf-detail-val">#' + nc.rankAfter + '</span></div>';
        }
        if (nc.level != null) {
          html += '<div class="tf-detail-item"><span class="tf-detail-label">Nivel</span><span class="tf-detail-val">' + nc.level + '</span></div>';
        }
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // ── History ──
  if (_transferData.history && _transferData.history.length > 0) {
    html += '<div class="tf-section">';
    html += '<div class="tf-section-title" style="cursor:pointer;display:flex;align-items:center;gap:8px" onclick="toggleTransferHistory()">';
    html += '<span>Istoric Transferuri</span>';
    html += '<span style="font-size:11px;opacity:0.5">' + (_transferHistoryExpanded ? '▼' : '▶') + '</span>';
    html += '</div>';

    if (_transferHistoryExpanded) {
      _transferData.history.forEach(function(entry) {
        var histFiltered = _tfFilterTransfers(entry.transfers);
        html += '<div class="tf-history-entry">';
        html += '<div class="tf-history-date">' + _escTf(entry.prevDate) + ' → ' + _escTf(entry.date) + '</div>';
        if (histFiltered.length === 0) {
          html += '<div class="tf-history-none">Niciun transfer</div>';
        } else {
          html += '<div class="tf-history-list">';
          histFiltered.forEach(function(t) {
            html += '<div class="tf-history-item">';
            html += '<span class="tf-name">' + _escTf(t.name) + '</span> ';
            if (t.nameAfter && t.nameAfter !== t.name) {
              html += '<span class="tf-name-after">(' + _escTf(t.nameAfter) + ')</span> ';
            }
            html += '<span class="tf-from">' + _escTf(t.from) + '</span>';
            html += ' → ';
            html += '<span class="tf-to">' + _escTf(t.to) + '</span>';
            html += ' <span class="tf-champ-badge">CL' + t.champLevel + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
  }

  // ── Detectie (toti utilizatorii) ──
  var detectLoading = _localDetectLoading || _nameChangeLoading;
  var _selectedDate = '';
  var existingDateEl = document.getElementById('snapshotDateInput');
  if (existingDateEl && existingDateEl.value) {
    _selectedDate = existingDateEl.value;
  } else if (_availableDates && _availableDates.length > 0) {
    _selectedDate = _availableDates[0].date;
  }

  html += '<div class="tf-action-grid">';
  html += '<div class="tf-action-card">';
  html += '<div class="tf-action-card-title">Detectie</div>';

  if (_availableDates === null) {
    html += '<div class="tf-date-chips-loading">Se cauta date disponibile...</div>';
  } else if (_availableDates.length === 0) {
    html += '<div class="tf-date-chips-loading">Niciun snapshot gasit.</div>';
  } else {
    html += '<input type="hidden" id="snapshotDateInput" value="' + _escTf(_selectedDate) + '">';
    html += '<div class="tf-date-chips">';
    _availableDates.forEach(function(entry) {
      var isActive = entry.date === _selectedDate;
      var safeDateVal = entry.date.replace(/'/g, '');
      var typeForDate = entry.hasBefore ? 'before' : 'after';
      html += '<div class="tf-date-chip' + (isActive ? ' active' : '') + '" onclick="_snapshotDate=\'' + safeDateVal + '\';_snapshotType=\'' + typeForDate + '\';document.getElementById(\'snapshotDateInput\').value=\'' + safeDateVal + '\';loadPlayerSnapshot()">';
      html += '<span>' + _escTf(entry.date) + '</span>';
      html += '<span class="tf-date-chip-dots">';
      html += '<span class="tf-date-chip-dot' + (entry.hasBefore ? ' on' : '') + '" title="Before"></span>';
      html += '<span class="tf-date-chip-dot' + (entry.hasAfter ? ' on' : '') + '" title="After"></span>';
      html += '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<button class="tf-admin-btn full" ' + (detectLoading ? 'disabled' : '') + ' onclick="runDetect()">Detecteaza</button>';
  if (detectLoading) {
    html += '<div class="tf-trigger-status tf-trigger-loading">Se detecteaza...</div>';
  } else if (_localDetectResults && _localDetectResults.error) {
    html += '<div class="tf-trigger-status tf-trigger-err">Eroare: ' + _escTf(_localDetectResults.error) + '</div>';
  } else if (_localDetectResults && !_localDetectResults.error) {
    var ncCount = (_nameChangeResults && !_nameChangeResults.error) ? _nameChangeResults.nameChanges.length : 0;
    html += '<div class="tf-trigger-status tf-trigger-ok">' + _localDetectResults.transfers.length + ' transferuri · ' + ncCount + ' schimbari · ' + _escTf(_localDetectResults.date || '') + '</div>';
  }
  html += '</div>';
  html += '</div>'; // /tf-action-grid

  // ── Admin: Colectare Date + Scanare Automata ──
  if (window._isAdmin) {
    var btnDisabled = _triggerScrapeStatus === 'loading' ? 'disabled' : '';

    html += '<div class="tf-action-grid">';

    // ── Card 1: Colectare Date ──
    html += '<div class="tf-action-card">';
    html += '<div class="tf-action-card-title">Colectare Date</div>';
    html += '<div class="tf-action-card-btns">';
    html += '<button class="tf-admin-btn" ' + btnDisabled + ' onclick="triggerScrape(\'before\', false)">Before</button>';
    html += '<button class="tf-admin-btn" ' + btnDisabled + ' onclick="triggerScrape(\'after\', true)">After</button>';
    html += '</div>';
    if (_lastScrapeInfo) {
      html += '<div class="tf-scrape-history">';
      ['before', 'after'].forEach(function(type) {
        var ts = _lastScrapeInfo[type];
        var lbl = type.charAt(0).toUpperCase() + type.slice(1);
        var dtStr = ts ? new Date(ts).toLocaleString('ro-RO') : 'niciodata';
        html += '<div class="tf-scrape-hist-row">';
        html += '<span class="tf-scrape-hist-label">' + lbl + '</span>';
        html += '<span class="tf-scrape-hist-val' + (ts ? '' : ' tf-scrape-hist-none') + '">' + _escTf(dtStr) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    if (_triggerScrapeStatus === 'loading') {
      html += '<div class="tf-trigger-status tf-trigger-loading">Se trimite...</div>';
    } else if (_triggerScrapeStatus === 'ok') {
      html += '<div class="tf-trigger-status tf-trigger-ok">Trimis. Verifica GitHub Actions.</div>';
    } else if (_triggerScrapeStatus === 'error') {
      html += '<div class="tf-trigger-status tf-trigger-err">Eroare: ' + _escTf(_triggerScrapeMsg) + '</div>';
    }
    html += '</div>';

    // ── Card 2: Scanare Automata ──
    var _next = _calcNextScanDates(_scrapeSettings.scanDay);
    html += '<div class="tf-action-card tf-action-card--wide">';
    html += '<div class="tf-action-card-title">Scanare Automata</div>';
    html += '<div class="tf-scan-settings">';
    html += '<label class="tf-scan-label">Ziua de scrape</label>';
    html += '<div class="tf-scan-day-btns">';
    [1,2,3,4,5,6,0].forEach(function(d) {
      var isActive = _scrapeSettings.scanDay === d;
      html += '<button class="tf-scan-day-btn' + (isActive ? ' active' : '') + '" onclick="saveScrapeSettings(' + d + ')">' + _DAYS_RO[d].slice(0,3) + '</button>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="tf-scan-next">';
    html += '<div class="tf-scan-next-row"><span class="tf-scan-next-lbl">Urmatorul BEFORE</span><span class="tf-scan-next-val">' + _escTf(_next.beforeStr) + '</span></div>';
    html += '<div class="tf-scan-next-row"><span class="tf-scan-next-lbl">Urmatorul AFTER</span><span class="tf-scan-next-val">' + _escTf(_next.afterStr) + '</span></div>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // /tf-action-grid
  }

  // ── Snapshot viewer (toti utilizatorii) ──
  html += '<div class="tf-section">';
  html += '<div class="tf-section-title">Jucatori Scrape-uiti</div>';
  if (!_snapshotData && !_snapshotLoading) {
    setTimeout(function() { if (!_snapshotData && !_snapshotLoading) { _snapshotType = 'before'; _snapshotDate = ''; loadPlayerSnapshot(); } }, 0);
    html += '<div class="tf-trigger-status tf-trigger-loading">Se incarca snapshot...</div>';
  } else if (_snapshotLoading) {
    html += '<div class="tf-trigger-status tf-trigger-loading">Se incarca...</div>';
  } else {
    html += _renderSnapshotTable();
  }
  html += '</div>';

  el.innerHTML = html;
}

function toggleTransferHistory() {
  _transferHistoryExpanded = !_transferHistoryExpanded;
  renderTransfers();
}

function triggerScrape(mode, forceAfter) {
  if (_triggerScrapeStatus === 'loading') return;
  // Warn if overwriting existing data
  var warningMsg = 'Esti sigur ca vrei sa declansezi scrape ' + mode.toUpperCase() + '?';
  if (mode === 'before') {
    warningMsg += '\n\nAtentie: Daca exista deja un snapshot BEFORE din aceasta zi, acesta va fi ignorat (scraperul nu suprascrie before-ul daca exista deja).';
  } else {
    warningMsg += '\n\nAcest lucru va declansa un scrape AFTER si va actualiza datele de transferuri.';
  }
  if (!confirm(warningMsg)) return;
  _triggerScrapeStatus = 'loading';
  _triggerScrapeMsg = '';
  renderTransfers();
  window.addAdminLog && window.addAdminLog('Scrape ' + mode.toUpperCase() + ' declansat manual', 'scrape');

  fetch('/api/trigger-scrape', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: mode, force_after: forceAfter })
  })
    .then(function(r) {
      return r.json().then(function(data) {
        if (!r.ok) {
          _triggerScrapeStatus = 'error';
          _triggerScrapeMsg = 'HTTP ' + r.status + ': ' + (data.error || JSON.stringify(data));
          window.addAdminLog && window.addAdminLog('Scrape ' + mode.toUpperCase() + ' eroare: ' + _triggerScrapeMsg, 'error');
          renderTransfers();
        } else {
          _triggerScrapeStatus = data.ok ? 'ok' : 'error';
          _triggerScrapeMsg = data.error || '';
          window.addAdminLog && window.addAdminLog('Scrape ' + mode.toUpperCase() + ' trimis: ' + (data.ok ? 'succes' : ('eroare: ' + _triggerScrapeMsg)), data.ok ? 'scrape' : 'error');
          renderTransfers();
        }
      });
    })
    .catch(function(e) {
      _triggerScrapeStatus = 'error';
      _triggerScrapeMsg = e.message;
      renderTransfers();
    });
}

function loadPlayerSnapshot(ignoreInput) {
  if (_snapshotLoading) return;
  // Read current date from input if available (skip when called from 404 fallback)
  var dateInput = document.getElementById('snapshotDateInput');
  if (dateInput && !ignoreInput) _snapshotDate = dateInput.value;
  _snapshotLoading = true;
  _snapshotData = null;
  _snapshotCompareData = null;
  renderTransfers();
  // When no date is given and type is 'before', load snapshot.json first to get the date,
  // then fetch the actual before file for that date.
  if (!_snapshotDate && _snapshotType === 'before') {
    fetch('data/snapshot.json?_=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(latest) {
        var date = latest && latest._meta && latest._meta.savedAt
          ? new Date(latest._meta.savedAt).toISOString().slice(0, 10) : null;
        // Fallback: if snapshot.json missing, try the last 7 days directly
        var baseDate = date || new Date().toISOString().slice(0, 10);
        var datesToTry = [0, 1, 2, 3, 4, 5, 6].map(function(offset) {
          var d = new Date(baseDate); d.setDate(d.getDate() - offset);
          return d.toISOString().slice(0, 10);
        });
        function tryNext(i) {
          if (i >= datesToTry.length) throw new Error('Nu s-a gasit niciun snapshot before in ultimele 7 zile');
          var d = datesToTry[i];
          return fetch('data/snapshots/before-' + d + '.json?_=' + Date.now())
            .then(function(r) { return r.ok ? { json: r.json(), date: d } : tryNext(i + 1); });
        }
        return tryNext(0)
          .then(function(res) { return Promise.all([res.json, Promise.resolve(res.date)]); })
          .then(function(results) {
            var data = results[0]; var foundDate = results[1];
            _snapshotLoading = false;
            _snapshotData = data;
            _snapshotType = 'before';
            renderTransfers();
            fetch('data/snapshots/after-' + foundDate + '.json?_=' + Date.now())
              .then(function(r) { return r.ok ? r.json() : null; })
              .then(function(cdata) { _snapshotCompareData = cdata; renderTransfers(); })
              .catch(function() { _snapshotCompareData = null; });
          });
      })
      .catch(function(e) {
        _snapshotLoading = false;
        _snapshotData = { _error: e.message };
        renderTransfers();
      });
    return;
  }

  var url = _snapshotDate
    ? 'data/snapshots/' + _snapshotType + '-' + _snapshotDate + '.json?_=' + Date.now()
    : 'data/snapshot.json?_=' + Date.now();
  fetch(url)
    .then(function(r) {
      if (!r.ok) throw new Error('Snapshot nu a fost gasit (HTTP ' + r.status + ')');
      return r.json();
    })
    .then(function(data) {
      _snapshotLoading = false;
      _snapshotData = data;
      if (data._meta && data._meta.type) _snapshotType = data._meta.type;
      renderTransfers();
      var dateForCompare = _snapshotDate;
      if (!dateForCompare && data._meta && data._meta.savedAt) {
        dateForCompare = new Date(data._meta.savedAt).toISOString().slice(0, 10);
      }
      if (dateForCompare) {
        var compareType = _snapshotType === 'before' ? 'after' : 'before';
        fetch('data/snapshots/' + compareType + '-' + dateForCompare + '.json?_=' + Date.now())
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(cdata) { _snapshotCompareData = cdata; renderTransfers(); })
          .catch(function() { _snapshotCompareData = null; });
      }
    })
    .catch(function(e) {
      // If specific date returned 404, retry with auto-detect (last 7 days)
      if (_snapshotDate && e.message.indexOf('404') >= 0) {
        _snapshotDate = '';
        _snapshotLoading = false;
        loadPlayerSnapshot(true);
        return;
      }
      _snapshotLoading = false;
      _snapshotData = { _error: e.message };
      renderTransfers();
    });
}

function loadPlayerSnapshotLatest() {
  _snapshotDate = '';
  loadPlayerSnapshot(true);
}

function forceSnapshotRefresh() {
  if (typeof db === 'undefined' || !db) { showToast('Firebase nu e conectat', 'error'); return; }
  db.ref(p('meta/snapshotRefresh')).set(Date.now())
    .then(function() {
      showToast('Refresh trimis — toti utilizatorii reincarca snapshot-ul', 'success');
    })
    .catch(function(e) { showToast('Eroare: ' + e.message, 'error'); });
}

function setSnapshotFilter(server) {
  _snapshotServerFilter = server;
  _snapshotPage = 0;
  _snapshotSearch = '';
  _snapshotStatusFilter = 'all';
  _renderSnapshotBody();
}

function setSnapshotStatusFilter(status) {
  _snapshotStatusFilter = _snapshotStatusFilter === status ? 'all' : status;
  _snapshotPage = 0;
  _renderSnapshotBody();
}

function setSnapshotPage(p) {
  _snapshotPage = p;
  _renderSnapshotBody();
}

function setSnapshotType(type) {
  _snapshotType = type;
  renderTransfers();
}

function swapSnapshotView() {
  var tmp = _snapshotData;
  _snapshotData = _snapshotCompareData;
  _snapshotCompareData = tmp;
  _snapshotType = (_snapshotData && _snapshotData._meta && _snapshotData._meta.type) || (_snapshotType === 'before' ? 'after' : 'before');
  _snapshotPage = 0;
  _snapshotStatusFilter = 'all';
  renderTransfers();
}

function setSnapshotSearch(val) {
  _snapshotSearch = val;
  _snapshotPage = 0;
  _renderSnapshotBody(true);
}

// Only re-render the body (list area), not the whole transfers page
function _renderSnapshotBody(fromSearch) {
  var bodyEl = document.getElementById('snapshotBody');
  if (!bodyEl) { renderTransfers(); return; }
  bodyEl.innerHTML = _buildSnapshotBody();
  // Retrigger animation
  bodyEl.classList.remove('ss-body--anim');
  void bodyEl.offsetWidth;
  bodyEl.classList.add('ss-body--anim');
  // Only focus search input when triggered by search, not by row expand/collapse
  if (fromSearch) {
    var inp = document.getElementById('snapshotSearch');
    if (inp) { inp.value = _snapshotSearch; inp.focus(); }
  }
}

function _buildCompareData() {
  var comparePlayerMap = {};
  var compareSets = {};
  if (_snapshotCompareData && !_snapshotCompareData._error) {
    _TF_SERVERS.forEach(function(srvName) {
      var srvData = _snapshotCompareData[srvName];
      var cplayers = srvData ? (Array.isArray(srvData) ? srvData : (srvData.players || [])) : [];
      comparePlayerMap[srvName] = cplayers;
      compareSets[srvName] = new Set(cplayers.map(function(p) { return p.name; }));
    });
  }
  return { comparePlayerMap: comparePlayerMap, compareSets: compareSets };
}

function _buildMergedPlayers(srvName, cmpData) {
  var currentOnlyStatus = _snapshotType === 'before' ? 'disparut' : 'nou';
  var compareOnlyStatus = _snapshotType === 'before' ? 'nou' : 'disparut';
  var srvData = _snapshotData[srvName];
  var players = srvData ? (Array.isArray(srvData) ? srvData : (srvData.players || [])) : [];
  var compareSet = cmpData.compareSets[srvName] || null;
  var cmpPlayers = cmpData.comparePlayerMap[srvName] || [];
  var currentSet = new Set(players.map(function(p) { return p.name; }));
  var merged = [];
  players.forEach(function(p) {
    var status = (!compareSet || compareSet.has(p.name)) ? 'stayed' : currentOnlyStatus;
    merged.push(Object.assign({}, p, { _status: status }));
  });
  if (compareSet) {
    cmpPlayers.forEach(function(p) {
      if (!currentSet.has(p.name)) merged.push(Object.assign({}, p, { _status: compareOnlyStatus }));
    });
  }
  merged.sort(function(a, b) { return (a.rank || 0) - (b.rank || 0); });
  return merged;
}

function _buildSnapshotBody() {
  var cmpData = _buildCompareData();
  var serversToShow = _snapshotServerFilter === 'all' ? _TF_SERVERS : [_snapshotServerFilter];
  var q = _snapshotSearch.trim().toLowerCase();
  var html = _renderComparePanel();

  serversToShow.forEach(function(srvName) {
    var merged = _buildMergedPlayers(srvName, cmpData);
    var filtered = merged;
    if (_snapshotStatusFilter !== 'all') filtered = filtered.filter(function(p) { return p._status === _snapshotStatusFilter; });
    if (q) filtered = filtered.filter(function(p) { return p.name.toLowerCase().indexOf(q) !== -1; });
    var disparutCount = merged.filter(function(p) { return p._status === 'disparut'; }).length;
    var nouCount = merged.filter(function(p) { return p._status === 'nou'; }).length;

    html += '<div class="ss-srv-block">';
    // Server header
    html += '<div class="ss-srv-header">';
    html += '<span class="ss-srv-name">' + _escTf(srvName) + '</span>';
    var totalInFile = merged.filter(function(p) { return p._status !== 'nou'; }).length;
    var activeCls = _snapshotStatusFilter === 'all' ? ' ss-srv-badge--active' : '';
    html += '<span class="ss-srv-badge ss-srv-badge--total' + activeCls + '" onclick="setSnapshotStatusFilter(\'all\')" style="cursor:pointer">' + totalInFile + ' total</span>';
    if (disparutCount > 0) {
      var dCls = _snapshotStatusFilter === 'disparut' ? ' ss-srv-badge--active' : '';
      html += '<span class="ss-srv-badge ss-srv-badge--disparut' + dCls + '" onclick="setSnapshotStatusFilter(\'disparut\')" style="cursor:pointer">' + disparutCount + ' disparuti</span>';
    }
    if (nouCount > 0) {
      var nCls = _snapshotStatusFilter === 'nou' ? ' ss-srv-badge--active' : '';
      html += '<span class="ss-srv-badge ss-srv-badge--nou' + nCls + '" onclick="setSnapshotStatusFilter(\'nou\')" style="cursor:pointer">' + nouCount + ' noi aparuti</span>';
    }
    html += '</div>';

    if (filtered.length === 0) {
      html += '<div class="ss-empty">Niciun rezultat</div>';
    } else {
      var totalPages = Math.ceil(filtered.length / SNAPSHOT_PAGE_SIZE);
      var page = Math.min(_snapshotPage, totalPages - 1);
      var start = page * SNAPSHOT_PAGE_SIZE;
      var pageSlice = filtered.slice(start, start + SNAPSHOT_PAGE_SIZE);

      html += '<div class="ss-player-list">';
      pageSlice.forEach(function(p) {
        var mod = p._status === 'disparut' ? ' ss-player--disparut' : (p._status === 'nou' ? ' ss-player--nou' : '');
        var key = srvName + '||' + p.name;
        var expanded = _ssExpandedKey === key;
        var isPinnedA = _ssCompareA && _ssCompareA.name === p.name && _ssCompareA.srv === srvName;
        var isPinnedB = _ssCompareB && _ssCompareB.name === p.name && _ssCompareB.srv === srvName;
        var pinnedCls = isPinnedA ? ' ss-player--pinned-a' : (isPinnedB ? ' ss-player--pinned-b' : '');
        var nameHtml = q ? _escTf(p.name).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi'), '<mark>$1</mark>') : _escTf(p.name);
        // Use single-quoted JS strings inside the onclick attribute (double-quotes
        // would break HTML attribute parsing and cause "Unexpected end of input")
        var srvSafe = srvName.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var nameSafe = p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        html += '<div class="ss-player-row' + mod + pinnedCls + (expanded ? ' ss-player--expanded' : '') + '" onclick="toggleSnapshotPlayer(\'' + srvSafe + '\',\'' + nameSafe + '\')" style="cursor:pointer">';
        html += '<span class="ss-player-rank">#' + p.rank + '</span>';
        html += '<span class="ss-player-name">' + nameHtml + '</span>';
        html += '<span class="ss-player-cl">CL ' + p.champLevel + '</span>';
        html += '<span class="ss-player-lvl">Nv ' + p.level + '</span>';
        html += '<span class="ss-player-chevron">' + (expanded ? '▲' : '▼') + '</span>';
        html += '</div>';
        if (expanded) {
          var canCompare = p._status === 'disparut' || p._status === 'nou';
          var isPinned = isPinnedA || isPinnedB;
          html += '<div class="ss-player-detail">';
          html += '<div class="ss-detail-grid">';
          html += '<div class="ss-detail-item"><span class="ss-detail-label">ChampExp</span><span class="ss-detail-val">' + _fmtExp(p.champExp) + '</span></div>';
          if (p.exp != null) html += '<div class="ss-detail-item"><span class="ss-detail-label">Exp</span><span class="ss-detail-val">' + _fmtExp(p.exp) + '</span></div>';
          html += '<div class="ss-detail-item"><span class="ss-detail-label">Nivel</span><span class="ss-detail-val">' + (p.level || '?') + '</span></div>';
          html += '<div class="ss-detail-item"><span class="ss-detail-label">CL</span><span class="ss-detail-val">' + p.champLevel + '</span></div>';
          html += '<div class="ss-detail-item"><span class="ss-detail-label">Rank</span><span class="ss-detail-val">#' + p.rank + '</span></div>';
          if (p.kingdom) html += '<div class="ss-detail-item"><span class="ss-detail-label">Regat</span><span class="ss-detail-val">' + _escTf(p.kingdom) + '</span></div>';
          if (p.class) html += '<div class="ss-detail-item"><span class="ss-detail-label">Clasa</span><span class="ss-detail-val">' + _escTf(p.class) + '</span></div>';
          html += '</div>';
          if (canCompare) {
            html += '<button class="ss-pin-btn' + (isPinned ? ' active' : '') + '" onclick="event.stopPropagation();snapshotPinCompare(\'' + srvSafe + '\',\'' + nameSafe + '\',\'' + p._status + '\')">';
            html += isPinned ? 'Elimina din comparatie' : 'Adauga la comparatie';
            html += '</button>';
          }
          html += '</div>';
        }
      });
      html += '</div>';

      if (totalPages > 1) {
        html += '<div class="tf-pagination">';
        html += '<button class="tf-page-btn" onclick="setSnapshotPage(' + (page - 1) + ')"' + (page === 0 ? ' disabled' : '') + '>&#8249;</button>';
        html += '<span class="tf-page-info">' + (page + 1) + ' / ' + totalPages + '</span>';
        html += '<button class="tf-page-btn" onclick="setSnapshotPage(' + (page + 1) + ')"' + (page >= totalPages - 1 ? ' disabled' : '') + '>&#8250;</button>';
        html += '</div>';
      }
    }
    html += '</div>';
  });
  return html;
}

function _renderSnapshotTable() {
  if (!_snapshotData) return '';
  if (_snapshotData._error) {
    if (_snapshotData._error.indexOf('404') >= 0) {
      return '<div class="tf-trigger-status tf-trigger-loading">Niciun snapshot disponibil. Ruleaza <b>Colectare Date</b> pentru a genera datele.</div>';
    }
    return '<div class="tf-trigger-status tf-trigger-err">Eroare: ' + _escTf(_snapshotData._error) + '</div>';
  }

  var cmpData = _buildCompareData();
  var hasCompare = Object.keys(cmpData.compareSets).length > 0;
  var meta = _snapshotData._meta || {};
  var savedAt = meta.savedAt ? new Date(meta.savedAt).toLocaleString('ro-RO') : 'necunoscut';
  var type = meta.type ? meta.type.toUpperCase() : '?';

  var html = '';

  // ── Top bar ──
  html += '<div class="ss-topbar">';
  html += '<div class="ss-topbar-info">';
  html += '<span class="ss-topbar-date">' + _escTf(savedAt) + '</span>';
  html += '</div>';
  html += '</div>';

  // Legend (clickable global status filter)
  if (hasCompare) {
    var legAllCls = _snapshotStatusFilter === 'all' ? ' ss-legend--active' : '';
    var legDCls   = _snapshotStatusFilter === 'disparut' ? ' ss-legend--active' : '';
    var legNCls   = _snapshotStatusFilter === 'nou' ? ' ss-legend--active' : '';
    html += '<div class="ss-legend">';
    html += '<span class="ss-legend-item ss-legend--all' + legAllCls + '" onclick="setSnapshotStatusFilter(\'all\')">toti</span>';
    html += '<span class="ss-legend-item ss-legend--disparut' + legDCls + '" onclick="setSnapshotStatusFilter(\'disparut\')">disparut</span>';
    html += '<span class="ss-legend-item ss-legend--nou' + legNCls + '" onclick="setSnapshotStatusFilter(\'nou\')">noi</span>';
    html += '</div>';
  }

  // ── Server tabs ──
  html += '<div class="ss-srv-tabs">';
  html += '<button class="ss-srv-tab' + (_snapshotServerFilter === 'all' ? ' active' : '') + '" onclick="setSnapshotFilter(\'all\')">Toate</button>';
  _TF_SERVERS.forEach(function(srv) {
    html += '<button class="ss-srv-tab' + (_snapshotServerFilter === srv ? ' active' : '') + '" onclick="setSnapshotFilter(\'' + srv + '\')">' + _escTf(srv) + '</button>';
  });
  html += '</div>';

  // ── Search ──
  html += '<div class="ss-search-wrap">';
  html += '<svg class="ss-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  html += '<input id="snapshotSearch" class="ss-search-input" type="text" placeholder="Cauta jucator..." value="' + _escTf(_snapshotSearch) + '" oninput="setSnapshotSearch(this.value)">';
  html += '</div>';

  // ── Body (animated) ──
  html += '<div id="snapshotBody" class="ss-body ss-body--anim">' + _buildSnapshotBody() + '</div>';

  return html;
}

function _escTf(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
