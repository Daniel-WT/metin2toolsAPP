// ── Sticky Notes ──────────────────────────────────────────────────────────

var _snTeamNotes = [];
var _snPrivateNotes = [];
var _snFilter = 'all';
var _snSaveTimers = {};
var _snPrivateListenerUid = null;

var SN_COLORS = [
  { id: 'yellow',  hex: '#f59e0b' },
  { id: 'rose',    hex: '#fb7185' },
  { id: 'blue',    hex: '#60a5fa' },
  { id: 'violet',  hex: '#a78bfa' },
  { id: 'emerald', hex: '#34d399' },
  { id: 'orange',  hex: '#fb923c' },
  { id: 'slate',   hex: '#94a3b8' },
];

function _snGetColor(id) {
  return (SN_COLORS.find(function(c) { return c.id === id; }) || SN_COLORS[0]).hex;
}

function _snEsc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _snFindNote(id) {
  return _snPrivateNotes.find(function(n) { return n.id === id; })
      || _snTeamNotes.find(function(n) { return n.id === id; });
}

function _snGetVisible() {
  var all = _snPrivateNotes.concat(_snTeamNotes).sort(function(a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  var uid = window.currentUserProfile && window.currentUserProfile.uid;
  if (_snFilter === 'mine') return all.filter(function(n) { return n.authorId === uid; });
  if (_snFilter === 'team') return all.filter(function(n) { return !n.isPrivate; });
  return all;
}

function renderStickyNotes() {
  var el = document.getElementById('snGrid');
  if (!el) return;

  var notes = _snGetVisible();
  var uid = window.currentUserProfile && window.currentUserProfile.uid;

  if (notes.length === 0) {
    el.innerHTML = '<div class="sn-empty">'
      + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">'
      + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
      + '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>'
      + '<line x1="16" y1="17" x2="8" y2="17"/>'
      + '</svg>'
      + '<p>Nicio notiță. Apasă «+ Notă nouă» pentru a începe.</p>'
      + '</div>';
    return;
  }

  el.innerHTML = notes.map(function(note) {
    var isOwn = note.authorId === uid;
    var hex = _snGetColor(note.color);
    var pinSvg = note.pinned
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.5 7 12V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6l-2-1.5Z"/></svg>';
    var privSvg = note.isPrivate
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

    return '<div class="sn-card" data-id="' + note.id + '" data-private="' + (note.isPrivate ? '1' : '0') + '" '
      + 'style="border-color:' + hex + '22;background:' + hex + '0a;box-shadow:0 0 20px ' + hex + '0d;">'
      + '<div class="sn-accent-bar" style="background:' + hex + ';"></div>'
      + (note.pinned ? '<div class="sn-pin-dot" style="background:' + hex + ';"></div>' : '')
      + '<div class="sn-body">'
      + '<input class="sn-title" type="text" placeholder="Titlu..." value="' + _snEsc(note.title || '') + '"'
      + (isOwn ? '' : ' disabled') + ' data-field="title">'
      + '<textarea class="sn-content" placeholder="Scrie ceva..." rows="5"'
      + (isOwn ? '' : ' disabled') + ' data-field="content">' + _snEsc(note.content || '') + '</textarea>'
      + '</div>'
      + '<div class="sn-footer" style="border-color:' + hex + '18;">'
      + '<div class="sn-footer-left">'
      + (isOwn ? '<button class="sn-color-btn" title="Culoare" style="background:' + hex + ';" data-id="' + note.id + '"></button>' : '')
      + '<span class="sn-author">' + _snEsc(note.authorName || '') + '</span>'
      + '</div>'
      + '<div class="sn-actions">'
      + (isOwn
        ? '<button class="sn-btn sn-btn-pin" title="' + (note.pinned ? 'Desprinde' : 'Fixează') + '" data-id="' + note.id + '">' + pinSvg + '</button>'
          + '<button class="sn-btn sn-btn-priv' + (note.isPrivate ? '' : ' is-shared') + '" '
          + 'title="' + (note.isPrivate ? 'Distribuie echipei' : 'Fă privat') + '" data-id="' + note.id + '">' + privSvg + '</button>'
          + '<button class="sn-btn sn-btn-del" title="Șterge" data-id="' + note.id + '">'
          + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
          + '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'
          + '</svg></button>'
        : '<span class="sn-readonly">Doar citire</span>')
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.sn-title, .sn-content').forEach(function(input) {
    var card = input.closest('.sn-card');
    var id = card.dataset.id;
    var isPrivate = card.dataset.private === '1';
    input.addEventListener('input', function() {
      _snScheduleSave(id, isPrivate, input.dataset.field, input.value);
    });
  });

  el.querySelectorAll('.sn-btn-pin').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var note = _snFindNote(btn.dataset.id);
      if (note) _snTogglePin(note);
    });
  });

  el.querySelectorAll('.sn-btn-priv').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var note = _snFindNote(btn.dataset.id);
      if (note) _snTogglePrivate(note);
    });
  });

  el.querySelectorAll('.sn-btn-del').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var note = _snFindNote(btn.dataset.id);
      if (note) _snDeleteNote(note);
    });
  });

  el.querySelectorAll('.sn-color-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      _snOpenColorPicker(btn.dataset.id, btn);
    });
  });
}

function _snScheduleSave(id, isPrivate, field, value) {
  clearTimeout(_snSaveTimers[id]);
  _snSaveTimers[id] = setTimeout(function() {
    var profile = window.currentUserProfile;
    if (!profile || !db) return;
    var teamId = profile.currentTeamId || profile.teamId;
    var path = isPrivate
      ? 'users/' + profile.uid + '/stickyNotes/' + id
      : 'teams/' + teamId + '/stickyNotes/' + id;
    var patch = { updatedAt: Date.now() };
    patch[field] = value;
    db.ref(path).update(patch).catch(function() {});
  }, 800);
}

function _snCreateNote() {
  var profile = window.currentUserProfile;
  if (!profile || !db) return;
  var uid = profile.uid;
  db.ref('users/' + uid + '/stickyNotes').push({
    title: '', content: '', color: 'yellow', isPrivate: true,
    authorId: uid,
    authorName: profile.name || (profile.email || '').split('@')[0] || 'User',
    createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
  }).catch(function() {});
}

function _snDeleteNote(note) {
  var profile = window.currentUserProfile;
  if (!profile || !db) return;
  var path = note.isPrivate
    ? 'users/' + profile.uid + '/stickyNotes/' + note.id
    : 'teams/' + (profile.currentTeamId || profile.teamId) + '/stickyNotes/' + note.id;
  db.ref(path).remove().catch(function() {});
}

function _snTogglePrivate(note) {
  var profile = window.currentUserProfile;
  if (!profile || !db) return;
  var teamId = profile.currentTeamId || profile.teamId;
  var uid = profile.uid;
  var data = Object.assign({}, note);
  var id = data.id;
  delete data.id;

  if (note.isPrivate) {
    db.ref('users/' + uid + '/stickyNotes/' + id).remove().catch(function() {});
    data.isPrivate = false;
    data.updatedAt = Date.now();
    db.ref('teams/' + teamId + '/stickyNotes/' + id).set(data).catch(function() {});
  } else {
    db.ref('teams/' + teamId + '/stickyNotes/' + id).remove().catch(function() {});
    data.isPrivate = true;
    data.updatedAt = Date.now();
    db.ref('users/' + uid + '/stickyNotes/' + id).set(data).catch(function() {});
  }
}

function _snTogglePin(note) {
  var profile = window.currentUserProfile;
  if (!profile || !db) return;
  var path = note.isPrivate
    ? 'users/' + profile.uid + '/stickyNotes/' + note.id
    : 'teams/' + (profile.currentTeamId || profile.teamId) + '/stickyNotes/' + note.id;
  db.ref(path).update({ pinned: !note.pinned, updatedAt: Date.now() }).catch(function() {});
}

function _snOpenColorPicker(noteId, anchorEl) {
  var existing = document.getElementById('snColorPicker');
  if (existing) { existing.remove(); return; }

  var note = _snFindNote(noteId);
  var rect = anchorEl.getBoundingClientRect();

  var picker = document.createElement('div');
  picker.id = 'snColorPicker';
  picker.className = 'sn-color-picker';
  picker.style.position = 'fixed';
  picker.style.top = (rect.bottom + 6) + 'px';
  picker.style.left = rect.left + 'px';
  picker.style.zIndex = '9999';

  picker.innerHTML = SN_COLORS.map(function(c) {
    return '<button class="sn-cp-swatch' + (note && note.color === c.id ? ' active' : '') + '" '
      + 'style="background:' + c.hex + ';" data-color="' + c.id + '" data-id="' + noteId + '"></button>';
  }).join('');

  document.body.appendChild(picker);

  picker.querySelectorAll('.sn-cp-swatch').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var n = _snFindNote(btn.dataset.id);
      if (!n) { picker.remove(); return; }
      var profile = window.currentUserProfile;
      var path = n.isPrivate
        ? 'users/' + profile.uid + '/stickyNotes/' + n.id
        : 'teams/' + (profile.currentTeamId || profile.teamId) + '/stickyNotes/' + n.id;
      db.ref(path).update({ color: btn.dataset.color, updatedAt: Date.now() }).catch(function() {});
      picker.remove();
    });
  });

  setTimeout(function() {
    document.addEventListener('click', function closeSnPicker(e) {
      if (!e.target.closest('#snColorPicker')) {
        var p = document.getElementById('snColorPicker');
        if (p) p.remove();
        document.removeEventListener('click', closeSnPicker);
      }
    });
  }, 50);
}

// Init private notes listener when user profile is ready
window.addEventListener('m2-profile-updated', function() {
  var profile = window.currentUserProfile;
  if (!profile || !db) return;
  var uid = profile.uid;
  if (_snPrivateListenerUid === uid) return;
  _snPrivateListenerUid = uid;

  db.ref('users/' + uid + '/stickyNotes').on('value', function(snap) {
    var val = snap.val();
    _snPrivateNotes = val
      ? Object.keys(val).map(function(id) { return Object.assign({}, val[id], { id: id, isPrivate: true }); })
      : [];
    renderStickyNotes();
  });
});

// Bind filter + new note button
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.sn-filter');
    if (!btn) return;
    _snFilter = btn.dataset.filter;
    document.querySelectorAll('.sn-filter').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderStickyNotes();
  });

  var newBtn = document.getElementById('btnNewNote');
  if (newBtn) newBtn.addEventListener('click', _snCreateNote);
});
