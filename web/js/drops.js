// ============ DROP TRACKER (Chei) ============
// Balance is tracked per exact group combination.
// Debt from [Ion, Dan] spawns can only be recovered in [Ion, Dan] spawns.
//
// Firebase:
//   spawn/drops/groups/{safeGroupKey} — { key, players[], balance:{name:{keys,fairShare,color}} }
//   spawn/drops/log/{pushId}          — { ts, groupKey, entries:[{name,keys,color}], total, balanceAfter[] }
//   spawn/drops/session               — { active, ts, contributions:{safeName:{name,keys,color}} }
//                                    OR { active:false, result:[{name,color,keys,surplus}], transfers:[{from,to,amount}] }

var _dropGroups  = {};  // safeGroupKey → { safeKey, key, players[], balance:{} }
var _dropLog     = [];  // sorted newest-first
var _dropSession = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function _groupKey(names) {
  return names.map(function(n) { return n.trim().toLowerCase(); }).sort().join('|');
}

function _safeGroupKey(key) {
  return key.replace(/[.#$[\]/|]/g, '_');
}

function _dropSafeName(name) {
  return name.trim().replace(/[.#$[\]/]/g, '_');
}

function _dropColor(name) {
  for (var gk in _dropGroups) {
    var b = _dropGroups[gk].balance;
    if (b && b[name] && b[name].color) return b[name].color;
  }
  if (name === getM2UserName()) return getM2UserColor();
  var hash = 0;
  for (var i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return M2_USER_COLORS[Math.abs(hash) % M2_USER_COLORS.length];
}

function _dropDot(name, color, size) {
  var sz = size || 22;
  return '<span class="drop-player-dot" style="background:' + (color || _dropColor(name)) +
    ';width:' + sz + 'px;height:' + sz + 'px">' + (name || '?').charAt(0).toUpperCase() + '</span>';
}

function _dropSurplusOf(d) {
  if (!d) return 0;
  // New format: carry field (accumulated fractional surplus)
  if (d.carry !== undefined) return d.carry;
  // Legacy format: keys - fairShare
  return (d.keys || 0) - (d.fairShare || 0);
}

function _dropSurplusDisplay(surplus) {
  var whole = -Math.trunc(surplus);
  if (whole === 0) return '0';
  return (whole > 0 ? '+' : '') + whole;
}

function _dropSurplusLabel(surplus) {
  var str = _dropSurplusDisplay(surplus);
  if (surplus >= 1)  return '<span class="drop-surplus-neg">'  + str + '</span> <span style="font-size:10px;color:var(--text-muted)">de dat</span>';
  if (surplus <= -1) return '<span class="drop-surplus-pos">'  + str + '</span> <span style="font-size:10px;color:var(--text-muted)">de primit</span>';
  return '<span class="drop-surplus-zero">0</span>';
}

// Largest remainder method:
// 1. Sort by carry ascending — most in debt gets extra key first
// 2. base = floor(total/n), extras = total % n
// 3. First `extras` players (sorted by carry) get base+1, rest get base
// 4. Transfers: players who received MORE than allocation give to those who received LESS
function _dropDistribute(entries, group) {
  var n         = entries.length;
  var total     = entries.reduce(function(s, e) { return s + e.keys; }, 0);
  var fairShare = total / n;
  var base      = Math.floor(total / n);
  var extras    = total % n;

  // Sort by carry ASC; tiebreak by keys DESC — who took more keeps the advantage
  var sorted = entries.slice().sort(function(a, b) {
    var ca = _dropSurplusOf(group.balance[a.name] || {});
    var cb = _dropSurplusOf(group.balance[b.name] || {});
    if (Math.abs(ca - cb) < 0.001) return b.keys - a.keys;
    return ca - cb;
  });
  sorted.forEach(function(e, i) { e.allocation = base + (i < extras ? 1 : 0); });

  // Update carry: += (allocation - fairShare), only fraction accumulates
  entries.forEach(function(e) {
    var oldCarry = _dropSurplusOf(group.balance[e.name] || {});
    group.balance[e.name] = { name: e.name, color: e.color, carry: oldCarry + (e.allocation - fairShare) };
    if (group.players.indexOf(e.name) === -1) group.players.push(e.name);
  });

  // Transfers: who physically gives to whom (keys received vs allocation)
  var givers = entries
    .filter(function(e) { return e.keys > e.allocation; })
    .map(function(e) { return { name: e.name, color: e.color, amount: e.keys - e.allocation }; })
    .sort(function(a, b) { return b.amount - a.amount; });
  var receivers = entries
    .filter(function(e) { return e.keys < e.allocation; })
    .map(function(e) { return { name: e.name, color: e.color, amount: e.allocation - e.keys }; })
    .sort(function(a, b) { return b.amount - a.amount; });

  var transfers = [];
  var gi = 0, ri = 0;
  while (gi < givers.length && ri < receivers.length) {
    var amt = Math.min(givers[gi].amount, receivers[ri].amount);
    if (amt > 0) transfers.push({ from: givers[gi].name, fromColor: givers[gi].color, to: receivers[ri].name, toColor: receivers[ri].color, amount: amt });
    givers[gi].amount    -= amt;
    receivers[ri].amount -= amt;
    if (givers[gi].amount    === 0) gi++;
    if (receivers[ri].amount === 0) ri++;
  }

  return { transfers: transfers, total: total };
}

function _dropAutoCreateSession() {
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/session')).transaction(function(current) {
      if (current !== null) return; // already exists — abort
      return { active: true, ts: Date.now() };
    });
  } else {
    if (!_dropSession) {
      _dropSession = { active: true, ts: Date.now(), contributions: {} };
      renderDropSession();
    }
  }
}

// ── Session ────────────────────────────────────────────────────────────────

function _dropSessionUpdate(val) {
  _dropSession = val || null;
  if (!_dropSession) {
    // No session in Firebase — auto-create one
    _dropAutoCreateSession();
    return;
  }
  renderDropSession();
}

function renderDropSession() {
  var el = document.getElementById('dropInSpawn');
  if (!el) return;

  if (!_dropSession) {
    el.innerHTML = '';
    return;
  }

  // Result state (after finalization)
  if (!_dropSession.active && _dropSession.result) {
    _renderDropResult();
    return;
  }

  // Active session
  var myName  = getM2UserName();
  var myColor = getM2UserColor();
  var contributions = _dropSession.contributions || {};
  var contribList   = Object.values(contributions).filter(Boolean);
  var total         = contribList.reduce(function(s, c) { return s + (c.keys || 0); }, 0);
  var myContrib     = myName ? (contributions[_dropSafeName(myName)] || null) : null;

  // My entry row
  var myRowHtml = '';
  if (myName) {
    if (myContrib) {
      myRowHtml =
        '<div class="dis-my-row dis-my-confirmed">' +
          _dropDot(myName, myColor, 20) +
          '<span class="dis-my-name">' + escSp(myName) + '</span>' +
          '<span class="dis-my-keys">' + myContrib.keys + ' chei</span>' +
          '<button class="spawn-subtle-btn dis-edit-btn" id="btnDropEditMine">Editeaza</button>' +
        '</div>';
    } else {
      myRowHtml =
        '<div class="dis-my-row">' +
          _dropDot(myName, myColor, 20) +
          '<span class="dis-my-name">' + escSp(myName) + '</span>' +
          '<input type="number" id="dropSessionMyKeys" class="spawn-input dis-keys-input" placeholder="0" min="0" max="99" step="1">' +
          '<span class="dis-keys-label">chei</span>' +
          '<button class="spawn-pop-btn dis-confirm-btn" id="btnDropConfirmMine">OK</button>' +
        '</div>';
    }
  } else {
    myRowHtml = '<div class="dis-no-name">Seteaza-ti numele (sus dreapta)</div>';
  }

  // Others chips (with admin remove button)
  var othersHtml = '';
  var others = contribList.filter(function(c) { return c.name !== myName; });
  if (others.length > 0) {
    othersHtml = '<div class="dis-others">' +
      others.map(function(c) {
        var removeBtn = window._isAdmin
          ? '<button class="dis-chip-remove" data-safe="' + escSp(_dropSafeName(c.name)) + '" title="Sterge">&#10005;</button>'
          : '';
        return '<span class="dis-chip">' +
          _dropDot(c.name, c.color, 16) +
          '<span class="dis-chip-name">' + escSp(c.name) + '</span>' +
          '<span class="dis-chip-keys">' + (c.keys || 0) + '</span>' +
          removeBtn +
        '</span>';
      }).join('') +
    '</div>';
  }

  // Admin: add player row
  var adminAddHtml = window._isAdmin
    ? '<div class="dis-add-row" id="disAddRow">' +
        '<button class="spawn-subtle-btn dis-add-open-btn" id="btnDisAddOpen">+ Jucator</button>' +
      '</div>'
    : '';

  // Actions
  var actionsHtml = '';
  if (contribList.length > 0) {
    actionsHtml = '<div class="dis-actions">' +
      '<span class="dis-total">' + total + ' chei &middot; ' + contribList.length + ' juc.</span>' +
      '<button class="spawn-pop-btn dis-distribute-btn" id="btnDropDistribute">Distribuie</button>' +
    '</div>';
  }

  var adminCloseHtml = window._isAdmin
    ? '<button class="drop-close-btn dis-close" id="btnDropSessionClose" title="Inchide">&times;</button>'
    : '';

  el.innerHTML =
    '<div class="dis-panel">' +
      '<div class="dis-header">' +
        '<span class="dis-title">Drop</span>' +
        adminCloseHtml +
      '</div>' +
      myRowHtml +
      othersHtml +
      adminAddHtml +
      actionsHtml +
    '</div>';

  var confirmBtn = document.getElementById('btnDropConfirmMine');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function() {
      var keysEl = document.getElementById('dropSessionMyKeys');
      var keys = parseInt((keysEl ? keysEl.value : '') || '0', 10);
      if (isNaN(keys) || keys < 0) { showToast('Numar invalid', 'error'); return; }
      _dropConfirmMyKeys(keys);
    });
    var keysEl = document.getElementById('dropSessionMyKeys');
    if (keysEl) {
      keysEl.focus();
      keysEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') confirmBtn.click(); });
    }
  }

  var editBtn = document.getElementById('btnDropEditMine');
  if (editBtn) editBtn.addEventListener('click', _dropClearMyContrib);

  var distributeBtn = document.getElementById('btnDropDistribute');
  if (distributeBtn) distributeBtn.addEventListener('click', _dropFinalizeSession);

  var closeBtn = document.getElementById('btnDropSessionClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (!confirm('Inchizi sesiunea activa? Datele nesalvate se pierd.')) return;
      if (typeof db !== 'undefined' && db) {
        db.ref(p('spawn/drops/session')).remove();
      } else {
        _dropSession = null;
        renderDropSession();
      }
    });
  }

  // Admin: remove other player chip
  el.querySelectorAll('.dis-chip-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var safeN = btn.dataset.safe;
      if (!safeN) return;
      if (typeof db !== 'undefined' && db) {
        db.ref(p('spawn/drops/session/contributions/' + safeN)).remove();
      } else {
        if (_dropSession && _dropSession.contributions) {
          delete _dropSession.contributions[safeN];
          renderDropSession();
        }
      }
    });
  });

  // Admin: open add-player inline form
  var addOpenBtn = document.getElementById('btnDisAddOpen');
  if (addOpenBtn) {
    addOpenBtn.addEventListener('click', function() {
      var addRow = document.getElementById('disAddRow');
      if (!addRow) return;
      addRow.innerHTML =
        '<input type="text" id="disAddName" class="spawn-input" placeholder="Nume" maxlength="30" style="width:80px">' +
        '<input type="number" id="disAddKeys" class="spawn-input dis-keys-input" placeholder="0" min="0" max="99" step="1">' +
        '<span class="dis-keys-label">chei</span>' +
        '<button class="spawn-pop-btn dis-confirm-btn" id="btnDisAddConfirm">OK</button>' +
        '<button class="spawn-subtle-btn dis-edit-btn" id="btnDisAddCancel">&#10005;</button>';

      document.getElementById('disAddName').focus();

      document.getElementById('btnDisAddCancel').addEventListener('click', function() {
        addRow.innerHTML = '<button class="spawn-subtle-btn dis-add-open-btn" id="btnDisAddOpen">+ Jucator</button>';
        document.getElementById('btnDisAddOpen').addEventListener('click', arguments.callee.caller);
        renderDropSession(); // re-attach
      });

      function _submitAddPlayer() {
        var name = (document.getElementById('disAddName').value || '').trim();
        var keys = parseInt(document.getElementById('disAddKeys').value || '0', 10);
        if (!name) { showToast('Introdu un nume', 'error'); return; }
        if (isNaN(keys) || keys < 0) { showToast('Numar invalid', 'error'); return; }
        var color = _dropColor(name);
        var safeN = _dropSafeName(name);
        var contrib = { name: name, keys: keys, color: color };
        if (typeof db !== 'undefined' && db) {
          db.ref(p('spawn/drops/session/contributions/' + safeN)).set(contrib);
        } else {
          if (!_dropSession.contributions) _dropSession.contributions = {};
          _dropSession.contributions[safeN] = contrib;
          renderDropSession();
        }
      }

      document.getElementById('btnDisAddConfirm').addEventListener('click', _submitAddPlayer);
      document.getElementById('disAddKeys').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') _submitAddPlayer();
      });
    });
  }
}

function _renderDropResult() {
  var el = document.getElementById('dropInSpawn');
  if (!el || !_dropSession || !_dropSession.result) return;

  var myName    = getM2UserName();
  var result    = _dropSession.result;
  var transfers = _dropSession.transfers || [];

  // Build my transfer lines (what I need to do)
  var myLines = [];
  transfers.forEach(function(t) {
    var amt = t.amount;
    var k   = amt === 1 ? 'cheie' : 'chei';
    if (t.from === myName) {
      myLines.push(
        'Da <b>' + amt + '</b> ' + k + ' lui ' +
        _dropDot(t.to, t.toColor, 16) + ' <b>' + escSp(t.to) + '</b>'
      );
    } else if (t.to === myName) {
      myLines.push(
        _dropDot(t.from, t.fromColor, 16) + ' <b>' + escSp(t.from) + '</b>' +
        ' iti da <b>' + amt + '</b> ' + k
      );
    }
  });

  var myActionHtml = '';
  if (myLines.length > 0) {
    myActionHtml = '<div class="dis-my-transfers">' +
      myLines.map(function(l) {
        return '<div class="dis-transfer-line">' + l + '</div>';
      }).join('') +
    '</div>';
  } else if (myName) {
    myActionHtml = '<div class="dis-transfer-ok">Totul e ok</div>';
  }

  // All players: show allocation (what they should end up with after transfers)
  var chipsHtml = '<div class="dis-result-chips">' +
    result.map(function(r) {
      var alloc = r.allocation !== undefined ? r.allocation : r.keys;
      return '<span class="dis-result-chip">' +
        _dropDot(r.name, r.color, 16) +
        '<span class="dis-chip-name">' + escSp(r.name) + '</span>' +
        '<span class="dis-chip-keys">' + alloc + '</span>' +
      '</span>';
    }).join('') +
  '</div>';

  var adminNewHtml = window._isAdmin
    ? '<button class="drop-close-btn dis-close" id="btnDropNewSession" title="Sesiune noua" style="font-size:13px">&#8635;</button>'
    : '';

  el.innerHTML =
    '<div class="dis-panel dis-panel-result">' +
      '<div class="dis-header">' +
        '<span class="dis-title">Distribuit</span>' +
        adminNewHtml +
      '</div>' +
      myActionHtml +
      chipsHtml +
    '</div>';

  var newBtn = document.getElementById('btnDropNewSession');
  if (newBtn) {
    newBtn.addEventListener('click', function() {
      if (typeof db !== 'undefined' && db) {
        db.ref(p('spawn/drops/session')).set({ active: true, ts: Date.now() });
      } else {
        _dropSession = { active: true, ts: Date.now(), contributions: {} };
        renderDropSession();
      }
    });
  }
}

function _dropConfirmMyKeys(keys) {
  var myName  = getM2UserName();
  var myColor = getM2UserColor();
  if (!myName) { showToast('Seteaza-ti numele din dreapta sus', 'error'); return; }
  var safeN   = _dropSafeName(myName);
  var contrib = { name: myName, keys: keys, color: myColor };
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/session/contributions/' + safeN)).set(contrib)
      .catch(function(e) { console.warn('Session contrib error:', e); });
  } else {
    if (!_dropSession) _dropSession = { active: true, contributions: {} };
    if (!_dropSession.contributions) _dropSession.contributions = {};
    _dropSession.contributions[safeN] = contrib;
    renderDropSession();
  }
}

function _dropClearMyContrib() {
  var myName = getM2UserName();
  if (!myName) return;
  var safeN  = _dropSafeName(myName);
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/session/contributions/' + safeN)).remove();
  } else {
    if (_dropSession && _dropSession.contributions) {
      delete _dropSession.contributions[safeN];
      renderDropSession();
    }
  }
}

function _dropFinalizeSession() {
  if (!_dropSession || !_dropSession.active) return;
  var contributions = _dropSession.contributions || {};
  var entries = Object.values(contributions).filter(Boolean).map(function(c) {
    return { name: c.name, keys: c.keys || 0, color: c.color || _dropColor(c.name) };
  });

  if (entries.length === 0) { showToast('Niciun jucator confirmat', 'error'); return; }

  var gk     = _groupKey(entries.map(function(e) { return e.name; }));
  var safeGk = _safeGroupKey(gk);
  if (!_dropGroups[safeGk]) _dropGroups[safeGk] = { safeKey: safeGk, key: gk, players: [], balance: {} };
  var group  = _dropGroups[safeGk];

  var dist      = _dropDistribute(entries, group);
  var transfers = dist.transfers;
  var total     = dist.total;

  var resultEntries = entries.map(function(e) {
    return { name: e.name, color: e.color, keys: e.keys, allocation: e.allocation };
  });
  var logEntry = { ts: Date.now(), groupKey: gk, entries: entries, total: total, transfers: transfers };

  // Update local log immediately so renderDropHistory works before Firebase roundtrip
  _dropLog.unshift(logEntry);
  if (_dropLog.length > 100) _dropLog = _dropLog.slice(0, 100);

  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/groups/' + safeGk)).set({
      safeKey: safeGk, key: gk, players: group.players, balance: group.balance
    }).catch(function(e) { console.warn('Drop group write error:', e); });
    db.ref(p('spawn/drops/log')).push(logEntry).catch(function(e) { console.warn('Drop log write error:', e); });
    db.ref(p('spawn/drops/session')).set({ active: false, result: resultEntries, transfers: transfers });
  } else {
    _dropSession = { active: false, result: resultEntries, transfers: transfers };
    renderDropSession();
  }

  renderDropBalance();
  var hp  = document.getElementById('dropHistoryPanel');
  var btn = document.getElementById('btnDropHistory');
  if (hp) { hp.style.display = ''; if (btn) btn.style.color = 'var(--gold-light)'; }
  renderDropHistory();
  showToast('Chei distribuite', 'success');
}

// ── Render: Balance ────────────────────────────────────────────────────────

function renderDropBalance() {
  var el = document.getElementById('dropBalance');
  if (!el) return;

  var resetBtn = document.getElementById('btnDropReset');
  if (resetBtn) resetBtn.style.display = window._isAdmin ? '' : 'none';

  var groups = Object.values(_dropGroups).filter(function(g) {
    return g.balance && Object.keys(g.balance).length > 0;
  });

  if (groups.length === 0) {
    el.innerHTML = '';
    return;
  }

  // Only show groups where at least one player has a whole-key carry
  var debtGroups = groups.filter(function(g) {
    return Object.keys(g.balance).some(function(name) {
      return Math.abs(Math.trunc(_dropSurplusOf(g.balance[name]))) >= 1;
    });
  });

  if (debtGroups.length === 0) {
    el.innerHTML = '';
    return;
  }

  var cardsHtml =
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);font-family:Rajdhani,sans-serif;font-weight:600;margin-bottom:6px">Carry nerezolvat</div>' +
    debtGroups.map(function(g) {
      var groupDots = g.players.map(function(n) { return _dropDot(n, _dropColor(n), 14); }).join('');
      var rows = Object.keys(g.balance)
        .filter(function(name) { return Math.abs(Math.trunc(_dropSurplusOf(g.balance[name]))) >= 1; })
        .sort(function(a, b) { return _dropSurplusOf(g.balance[a]) - _dropSurplusOf(g.balance[b]); })
        .map(function(name) {
          var d     = g.balance[name];
          var s     = _dropSurplusOf(d);
          var whole = Math.trunc(s);
          var disp  = -whole;
          var cls   = disp > 0 ? 'drop-surplus-pos' : 'drop-surplus-neg';
          var label = whole > 0 ? 'de dat' : 'de primit';
          var num   = (disp > 0 ? '+' : '') + disp;
          return '<div class="drop-carry-row">' +
            _dropDot(name, d.color, 18) +
            '<span class="drop-carry-name">' + escSp(name) + '</span>' +
            '<span class="drop-balance-card-num ' + cls + '" style="font-size:13px">' + num +
              '<span class="drop-balance-card-label"> ' + label + '</span>' +
            '</span>' +
          '</div>';
        }).join('');
      return '<div class="drop-carry-group">' +
        '<div class="drop-carry-group-dots">' + groupDots +
          '<span class="drop-carry-group-names">' + escSp(g.players.join(', ')) + '</span>' +
        '</div>' +
        rows +
      '</div>';
    }).join('');

  var detailsHtml = '';
  if (window._isAdmin) {
    var groupRows = groups.map(function(g) {
      var names = Object.keys(g.balance).sort(function(a, b) {
        return _dropSurplusOf(g.balance[a]) - _dropSurplusOf(g.balance[b]);
      });
      var groupDots = g.players.map(function(n) { return _dropDot(n, _dropColor(n), 14); }).join('');
      var rows = names.map(function(name) {
        var d = g.balance[name];
        return '<tr data-gk="' + escSp(g.safeKey) + '" data-dname="' + escSp(name) + '">' +
          '<td>' + _dropDot(name, d.color, 18) + '</td>' +
          '<td class="drop-cell-name">' + escSp(name) + '</td>' +
          '<td class="drop-cell-keys" style="text-align:right">' + (d.lastKeys !== undefined ? d.lastKeys : '—') + '</td>' +
          '<td style="text-align:right">' + _dropSurplusLabel(_dropSurplusOf(d)) + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button class="drop-edit-btn" data-gk="' + escSp(g.safeKey) + '" data-dname="' + escSp(name) + '" title="Editeaza">&#9998;</button>' +
            '<button class="drop-del-btn"  data-gk="' + escSp(g.safeKey) + '" data-dname="' + escSp(name) + '" title="Sterge">&#10005;</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      return '<div style="margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:4px;margin-bottom:5px">' +
          groupDots +
          '<span style="font-size:11px;color:var(--text-muted);margin-left:4px">' + escSp(g.players.join(', ')) + '</span>' +
        '</div>' +
        '<table class="drop-balance-table"><thead><tr>' +
          '<th></th><th>Jucator</th><th style="text-align:right">Chei</th><th style="text-align:right">Balanta</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>';
    }).join('');
    detailsHtml = '<details class="drop-group-details"><summary>Detalii pe grupuri</summary>' + groupRows + '</details>';
  }

  el.innerHTML = cardsHtml + (detailsHtml || '');

  if (window._isAdmin) {
    el.querySelectorAll('.drop-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); _dropStartEdit(btn.dataset.gk, btn.dataset.dname); });
    });
    el.querySelectorAll('.drop-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); _dropDeletePlayer(btn.dataset.gk, btn.dataset.dname); });
    });
  }
}

// ── Admin Edit ─────────────────────────────────────────────────────────────

function _dropStartEdit(safeGk, name) {
  var el = document.getElementById('dropBalance');
  if (!el) return;
  var row = el.querySelector('tr[data-gk="' + safeGk + '"][data-dname="' + name + '"]');
  if (!row) return;
  var g = _dropGroups[safeGk];
  if (!g || !g.balance[name]) return;
  var d = g.balance[name];

  var cells = row.querySelectorAll('td');
  if (cells[2]) cells[2].innerHTML = '<input class="drop-edit-row-input" id="deCarry" value="' + (_dropSurplusOf(d).toFixed(4)) + '" style="width:90px">';
  if (cells[3]) cells[3].innerHTML = '<span style="font-size:10px;color:var(--text-muted)">carry</span>';

  var editBtn = row.querySelector('.drop-edit-btn');
  if (editBtn) editBtn.outerHTML = '<button class="drop-edit-btn" id="deSave" title="Salveaza">&#10003;</button>';
  var saveBtn = row.querySelector('#deSave');
  if (saveBtn) saveBtn.addEventListener('click', function() { _dropSaveEdit(safeGk, name, row); });
}

function _dropSaveEdit(safeGk, name, row) {
  var g = _dropGroups[safeGk];
  if (!g || !g.balance[name]) return;
  var newCarry = parseFloat((row.querySelector('#deCarry') || {}).value);
  if (isNaN(newCarry)) newCarry = 0;
  g.balance[name] = { name: name, color: g.balance[name].color, carry: newCarry };
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/groups/' + safeGk + '/balance/' + _dropSafeName(name))).set(g.balance[name])
      .catch(function(e) { console.warn('Drop edit error:', e); });
  }
  renderDropBalance();
}

function _dropDeletePlayer(safeGk, name) {
  if (!confirm('Stergi "' + name + '" din aceasta combinatie?')) return;
  var g = _dropGroups[safeGk];
  if (!g) return;
  delete g.balance[name];
  g.players = g.players.filter(function(p) { return p !== name; });
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/groups/' + safeGk + '/balance/' + _dropSafeName(name))).remove();
    db.ref(p('spawn/drops/groups/' + safeGk + '/players')).set(g.players);
  }
  renderDropBalance();
}

// ── Render: History ────────────────────────────────────────────────────────

function renderDropHistory() {
  var el = document.getElementById('dropHistoryList');
  if (!el) return;
  if (_dropLog.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">Niciun spawn inregistrat.</div>';
    return;
  }
  el.innerHTML = _dropLog.slice(0, 30).map(function(entry) {
    var d = new Date(entry.ts);
    var dateStr = d.toLocaleDateString('ro-RO') + ' ' +
      d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

    // Players row: dot + name + keys
    var playersHtml = '<div class="dh-players">' +
      (entry.entries || []).map(function(e) {
        return '<span class="dh-player">' +
          _dropDot(e.name, e.color, 16) +
          '<span class="dh-player-name">' + escSp(e.name) + '</span>' +
          '<span class="dh-player-keys">' + e.keys + '</span>' +
        '</span>';
      }).join('') +
    '</div>';

    // Transfers row (if any)
    var transfersHtml = '';
    if (entry.transfers && entry.transfers.length > 0) {
      transfersHtml = '<div class="dh-transfers">' +
        entry.transfers.map(function(t) {
          var k = t.amount === 1 ? 'cheie' : 'chei';
          return '<span class="dh-transfer">' +
            _dropDot(t.from, t.fromColor, 14) +
            '<span class="dh-transfer-from">' + escSp(t.from) + '</span>' +
            '<span class="dh-transfer-arrow">&#8594;</span>' +
            '<span class="dh-transfer-amt">' + t.amount + ' ' + k + '</span>' +
            '<span class="dh-transfer-arrow">&#8594;</span>' +
            _dropDot(t.to, t.toColor, 14) +
            '<span class="dh-transfer-to">' + escSp(t.to) + '</span>' +
          '</span>';
        }).join('') +
      '</div>';
    } else {
      transfersHtml = '<div class="dh-no-transfer">Impartire egala</div>';
    }

    return '<div class="drop-history-entry">' +
      '<div class="dh-header">' +
        '<span class="drop-hist-date">' + dateStr + '</span>' +
        '<span class="dh-total">' + (entry.total || 0) + ' chei</span>' +
      '</div>' +
      playersHtml +
      transfersHtml +
    '</div>';
  }).join('');
}

// ── Spawn Reset Hook ───────────────────────────────────────────────────────

function dropTrackerOnSpawnReset() {
  // If current session is still empty (no contributions), keep it — don't reset
  if (_dropSession && _dropSession.active) {
    var contribs = _dropSession.contributions || {};
    if (Object.keys(contribs).length === 0) return;
  }
  // Create new session (overwrite old result or used session)
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops/session')).set({ active: true, ts: Date.now() })
      .catch(function(e) { console.warn('Session create error:', e); });
  } else {
    _dropSession = { active: true, ts: Date.now(), contributions: {} };
    renderDropSession();
  }
}

// ── Manual Reset (admin) ───────────────────────────────────────────────────

function resetDropBalance() {
  if (!confirm('Resetezi toate balantele? Aceasta actiune nu poate fi anulata.')) return;
  _dropGroups  = {};
  _dropLog     = [];
  _dropSession = null;
  if (typeof db !== 'undefined' && db) {
    db.ref(p('spawn/drops')).remove().catch(function(e) { console.warn('Drop reset error:', e); });
  }
  renderDropSession();
  renderDropBalance();
  renderDropHistory();
  showToast('Balante resetate', 'success');
}

// ── Init ───────────────────────────────────────────────────────────────────

(function initDropTracker() {
  var btnAdd    = document.getElementById('btnDropAdd');
  var btnHist   = document.getElementById('btnDropHistory');
  var btnReset  = document.getElementById('btnDropReset');
  var histPanel = document.getElementById('dropHistoryPanel');

  if (btnAdd) btnAdd.addEventListener('click', function() {
    if (_dropSession && _dropSession.active) {
      showToast('Sesiune activa deja', 'error');
      return;
    }
    _dropAutoCreateSession();
  });

  if (btnHist) btnHist.addEventListener('click', function() {
    if (!histPanel) return;
    var isOpen = histPanel.style.display !== 'none';
    histPanel.style.display = isOpen ? 'none' : '';
    btnHist.style.color = isOpen ? '' : 'var(--gold-light)';
    if (!isOpen) renderDropHistory();
  });

  if (btnReset) btnReset.addEventListener('click', resetDropBalance);

  renderDropSession();
  renderDropBalance();
})();
