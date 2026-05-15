// ============ ACTIONS ============
let editTargetId = null;

function openEdit(id) {
  editTargetId = id;
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.querySelector('#addModal .modal-title').textContent = 'Editeaza Item';
  document.getElementById('addConfirm').textContent = 'Salveaza';

  // Select category
  selectedCat = item.category;
  document.querySelectorAll('.cat-option').forEach(o => o.className = 'cat-option');
  const opt = document.querySelector(`.cat-option[data-cat="${selectedCat}"]`);
  if (opt) opt.classList.add('selected', `sel-${selectedCat}`);
  updateFormForCat(selectedCat);

  // Populate fields
  const cfg = CAT_FORM[selectedCat];
  if (cfg && cfg.showName) {
    document.getElementById('addName').value = item.name;
    document.getElementById('addName').placeholder = cfg.namePlaceholder;
    document.getElementById('nameLabel').textContent = cfg.nameLabel;
  }
  document.getElementById('addAccount').value = item.account;

  if (cfg && cfg.showGender && item.gender) {
    setGenderBtn(item.gender);
  } else {
    setGenderBtn(null);
  }

  // Populate time if not 6/7
  if (selectedCat !== 'sase-sapte') {
    const ms = getRemaining(item);
    if (ms > 0) {
      const t = msToHMS(ms);
      document.getElementById('addDays').value = t.d;
      document.getElementById('addHours').value = t.h;
      document.getElementById('addMins').value = t.m;
    } else {
      document.getElementById('addDays').value = 0;
      document.getElementById('addHours').value = 0;
      document.getElementById('addMins').value = 0;
    }
  } else {
    if (item.szImage) {
      _szPastedImage = item.szImage;
      const preview = document.getElementById('szPastePreview');
      const hint    = document.getElementById('szPasteHint');
      preview.src = item.szImage;
      preview.style.display = '';
      hint.style.display = 'none';
      document.getElementById('durationGroup').style.display = 'none';
    }
  }

  openModal('addModal');
}

function deleteItem(id) {
  const item = items.find(i => i.id === id);
  delete confirmedAlerts.day1[id];
  delete confirmedAlerts.day4[id];
  delete confirmedAlerts.hourly[id];
  saveAlerts();
  items = items.filter(i => i.id !== id);
  save();
  renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
  showToast('Item sters.');
  if (item && window.logActivity) window.logActivity(`A sters ${item.name || item.category} de pe contul ${item.account}`);
}

function openRenew(id) {
  renewTargetId = id;
  const item = items.find(i => i.id === id);
  document.getElementById('renewTitle').textContent = `Reinnoieste — ${item?.name || ''}`;
  document.getElementById('rDays').value = 0;
  document.getElementById('rHours').value = 0;
  document.getElementById('rMins').value = 0;
  openModal('renewModal');
}

function openFeed(id) {
  feedTargetId = id;
  const item = items.find(i => i.id === id);
  if (!item) return;
  const t = msToHMS(item.totalDuration || 0);
  const pad = n => String(n).padStart(2,'0');
  let durStr = t.d > 0 ? `${t.d}z ${pad(t.h)}h ${pad(t.m)}m` : `${pad(t.h)}h ${pad(t.m)}m`;
  document.getElementById('feedInitialInfo').textContent = `Durata initiala: ${durStr}`;
  openModal('feedModal');
}

function openPersModal(id) {
  persTargetId = id;
  const item = items.find(i => i.id === id);
  if (!item) return;
  const catIcon = getCatIcon(item.category, item.gender) || CAT_META[item.category]?.icon || '<img src="img/icons/arma.png" width="22" height="22" style="object-fit:contain">';
  document.getElementById('persIcon').innerHTML = catIcon;

  const instantBtn = document.getElementById('persInstant');
  if (item.personalized) {
    // Depersonalizare — instant button visible
    document.getElementById('persTitle').textContent = 'Depersonalizeaza Item';
    document.getElementById('persBody').innerHTML =
      `Esti sigur ca vrei sa <strong>depersonalizezi</strong> itemul <span class="alert-item-name">${escHtml(item.name)}</span> de pe contul <span class="alert-item-name">${escHtml(item.account)}</span>?<br><br>Va incepe un timer de <strong>3 zile</strong> care reprezinta procesul de depersonalizare din joc. Flagul va ramane rosu pana la finalizare.`;
    document.getElementById('persConfirm').textContent = 'Depersonalizeaza (3 zile)';
    document.getElementById('persConfirm').style.background = 'linear-gradient(135deg,var(--red),#f07070)';
    document.getElementById('persConfirm').style.color = '#fff';
    instantBtn.style.display = '';
  } else {
    // Personalizare — fara instant button
    document.getElementById('persTitle').textContent = 'Personalizeaza Item';
    document.getElementById('persBody').innerHTML =
      `Esti sigur ca vrei sa marchezi itemul <span class="alert-item-name">${escHtml(item.name)}</span> ca <strong>personalizat</strong>?<br><br>Alertele de depersonalizare (4 zile inainte de expirare) se vor reactiva pentru acest item.`;
    document.getElementById('persConfirm').textContent = 'Personalizeaza';
    document.getElementById('persConfirm').style.background = '';
    document.getElementById('persConfirm').style.color = '';
    instantBtn.style.display = 'none';
  }
  openModal('persModal');
}

document.getElementById('persConfirm').addEventListener('click', () => {
  const item = items.find(i => i.id === persTargetId);
  if (!item) return;
  if (item.personalized) {
    // Start depersonalization — keep personalized = true (flag stays RED), set timer
    item.depersExpiresAt = Date.now() + 3 * 86400000;
    item.pendingDeperss = false;
    item.snoozedUntil = null;
    // personalized stays true — badge turns red in renderCard via isDepersonalizing check
    delete confirmedAlerts.day4[item.id]; saveAlerts();
    showToast(`"${item.name}" — depersonalizare in curs! Timer 3 zile pornit. 🔴`, 'success');
    if (window.logActivity) window.logActivity(`A inceput depersonalizarea pentru ${item.name} de pe contul ${item.account}`);
  } else {
    // Personalizare
    item.personalized = true;
    item.depersExpiresAt = null;
    item.pendingDeperss = false;
    item.snoozedUntil = null;
    delete confirmedAlerts.day4[item.id]; saveAlerts();
    showToast(`"${item.name}" marcat ca personalizat.`, 'success');
    if (window.logActivity) window.logActivity(`A personalizat ${item.name} de pe contul ${item.account}`);
  }
  save();
  closeModal('persModal');
  renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
});

document.getElementById('persInstant').addEventListener('click', () => {
  const item = items.find(i => i.id === persTargetId);
  if (!item) return;
  // Instant depersonalizare — skip timer, mark as done
  item.personalized = false;
  item.depersExpiresAt = null;
  item.pendingDeperss = false;
  item.snoozedUntil = null;
  delete confirmedAlerts.day4[item.id]; saveAlerts();
  save();
  closeModal('persModal');
  renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
  showToast(`"${item.name}" depersonalizat instant. ✓`, 'success');
  if (window.logActivity) window.logActivity(`A depersonalizat instant ${item.name} de pe contul ${item.account}`);
});

document.getElementById('persCancel').addEventListener('click', () => closeModal('persModal'));

// CHANGELOG
document.getElementById('btnChangelog').addEventListener('click', () => openModal('changelogModal'));
document.getElementById('changelogClose').addEventListener('click', () => closeModal('changelogModal'));
document.getElementById('changelogModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('changelogModal');
});

// ============ MODALS ============
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ADD
document.getElementById('addCancel').addEventListener('click', () => {
  editTargetId = null;
  closeModal('addModal');
  _szResetPasteArea();
  document.getElementById('durationGroup').style.display = '';
});

// ============ CATEGORY FORM CONFIG ============
const CAT_FORM = {
  'skin-arma':  { showName: true,  showGender: false, showImage: false, nameLabel: 'Nume Skin Arma',   namePlaceholder: 'ex: Sabie spinoasa' },
  'costum':     { showName: true,  showGender: true,  showImage: false, nameLabel: 'Nume Costum',      namePlaceholder: 'ex: Roba neagra profet' },
  'frizura':    { showName: true,  showGender: true,  showImage: false, nameLabel: 'Nume Frizura',     namePlaceholder: 'ex: Gluga neagra profet' },
  'atac-auto':  { showName: false, showGender: false, showImage: false, nameLabel: '',                 namePlaceholder: '' },
  'manusa':     { showName: false, showGender: false, showImage: false, nameLabel: '',                 namePlaceholder: '' },
  'insotitor':  { showName: true,  showGender: false, showImage: false, nameLabel: 'Tip Insotitor',    namePlaceholder: 'ex: Alastor' },
  'sase-sapte': { showName: true,  showGender: false, showImage: true,  nameLabel: 'Nume Item',        namePlaceholder: 'ex: Manusi puternice' },
};

let selectedGender = null;

function setGenderBtn(g) {
  selectedGender = g;
  document.getElementById('genderF').className = 'gender-btn' + (g === 'F' ? ' sel-F' : '');
  document.getElementById('genderM').className = 'gender-btn' + (g === 'M' ? ' sel-M' : '');
  // Update costum/frizura icons based on gender
  updateCatSelectorIcons(g);
}

function updateCatSelectorIcons(g) {
  const costumOpt = document.querySelector('.cat-option[data-cat="costum"] .cat-opt-icon');
  const frizuraOpt = document.querySelector('.cat-option[data-cat="frizura"] .cat-opt-icon');
  if (costumOpt) {
    const src = g === 'F' ? 'img/icons/costum_f.png' : 'img/icons/costum_m.png';
    costumOpt.innerHTML = '<img src="' + src + '" width="22" height="22" style="object-fit:contain">';
  }
  if (frizuraOpt) {
    const src = g === 'F' ? 'img/icons/frizura_f.png' : 'img/icons/frizura_m.png';
    frizuraOpt.innerHTML = '<img src="' + src + '" width="22" height="22" style="object-fit:contain">';
  }
}

document.getElementById('genderF').addEventListener('click', () => setGenderBtn('F'));
document.getElementById('genderM').addEventListener('click', () => setGenderBtn('M'));

// ============ 6/7 IMAGE PASTE ============
var _szPastedImage = null;

function _szResetPasteArea() {
  var preview = document.getElementById('szPastePreview');
  var hint    = document.getElementById('szPasteHint');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (hint)    { hint.style.display = ''; }
  _szPastedImage = null;
}

function _szResizeToDataUrl(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxSize = 120;
      var scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      var canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.addEventListener('paste', function(e) {
  if (!document.getElementById('addModal').classList.contains('open')) return;
  if (selectedCat !== 'sase-sapte') return;
  var clipItems = e.clipboardData && e.clipboardData.items;
  if (!clipItems) return;
  for (var i = 0; i < clipItems.length; i++) {
    if (clipItems[i].type.startsWith('image/')) {
      var file = clipItems[i].getAsFile();
      _szResizeToDataUrl(file, function(dataUrl) {
        _szPastedImage = dataUrl;
        var preview = document.getElementById('szPastePreview');
        var hint    = document.getElementById('szPasteHint');
        preview.src = dataUrl;
        preview.style.display = '';
        hint.style.display = 'none';
      });
      break;
    }
  }
});

function updateFormForCat(cat) {
  const cfg = CAT_FORM[cat];
  if (!cfg) return;
  const nameGroup     = document.getElementById('nameGroup');
  const nameLabel     = document.getElementById('nameLabel');
  const addName       = document.getElementById('addName');
  const genderGroup   = document.getElementById('genderGroup');
  const szImageGroup  = document.getElementById('szImageGroup');
  const durationGroup = document.getElementById('durationGroup');

  if (cfg.showName) {
    nameGroup.classList.add('slide-visible');
    nameLabel.textContent = cfg.nameLabel;
    addName.placeholder   = cfg.namePlaceholder;
  } else {
    nameGroup.classList.remove('slide-visible');
    addName.value = '';
  }

  if (cfg.showGender) {
    genderGroup.classList.add('slide-visible');
    if (!selectedGender) setGenderBtn(null);
  } else {
    genderGroup.classList.remove('slide-visible');
    selectedGender = null;
  }

  if (cfg.showImage) {
    szImageGroup.classList.add('slide-visible');
    durationGroup.style.display = 'none';
  } else {
    szImageGroup.classList.remove('slide-visible');
    _szPastedImage = null;
    _szResetPasteArea();
    durationGroup.style.display = '';
  }
}

document.querySelectorAll('.cat-option').forEach(opt => {
  opt.addEventListener('click', () => {
    selectedCat = opt.dataset.cat;
    document.querySelectorAll('.cat-option').forEach(o => o.className = 'cat-option');
    opt.classList.add('selected', `sel-${selectedCat}`);
    updateFormForCat(selectedCat);
  });
});

document.getElementById('addConfirm').addEventListener('click', () => {
  const account = document.getElementById('addAccount').value.trim();
  if (!account) { showToast('Introdu numele caracterului!', 'error'); return; }
  if (!selectedCat) { showToast('Selecteaza o categorie!', 'error'); return; }

  // ── 6/7 path — fixed 24h timer ──
  if (selectedCat === 'sase-sapte') {
    const name = document.getElementById('addName').value.trim();
    if (!name) { showToast('Introdu numele itemului!', 'error'); return; }
    
    if (editTargetId) {
      const item = items.find(i => i.id === editTargetId);
      if (item) {
        item.name = name;
        item.account = account;
        item.category = 'sase-sapte';
        item.totalDuration = 86400000;
        item.expiresAt = Date.now() + 86400000;
        if (_szPastedImage) item.szImage = _szPastedImage;
        
        delete confirmedAlerts.day1[item.id];
        delete confirmedAlerts.day4[item.id];
        delete confirmedAlerts.hourly[item.id];
        saveAlerts();
        
        if (typeof clearDiscordNotified === 'function') clearDiscordNotified(item.id);
        
        save();
        closeModal('addModal');
        editTargetId = null;
        _szResetPasteArea();
        document.getElementById('durationGroup').style.display = '';
        renderCardsIS(); renderStatsIS();
        showToast(`Item actualizat cu succes!`, 'success');
        if (window.logActivity) window.logActivity(`A editat ${name} pe contul ${account}`);
      }
      return;
    }
    
    const item = {
      id: uid(),
      name,
      account,
      category: 'sase-sapte',
      totalDuration: 86400000,
      expiresAt: Date.now() + 86400000,
      addedAt: Date.now(),
      szImage: _szPastedImage || null,
    };
    items.push(item);
    save();
    closeModal('addModal');
    _szResetPasteArea();
    document.getElementById('durationGroup').style.display = '';
    renderCardsIS(); renderStatsIS();
    showToast(`"${name}" adaugat! Timer 24h pornit.`, 'success');
    if (window.logActivity) window.logActivity(`A adaugat 6/7 pe ${account}`);
    return;
  }

  const d = document.getElementById('addDays').value;
  const h = document.getElementById('addHours').value;
  const m = document.getElementById('addMins').value;
  const ms = durationToMs(d, h, m);
  if (ms <= 0) { showToast('Durata trebuie sa fie > 0!', 'error'); return; }

  const cfg = CAT_FORM[selectedCat];
  let name;
  if (cfg && cfg.showName) {
    name = document.getElementById('addName').value.trim();
    if (!name) { showToast(`Introdu ${cfg.nameLabel.toLowerCase()}!`, 'error'); return; }
  } else {
    // Auto-name from category
    name = CAT_META[selectedCat].label;
  }

  const hasPersFlag = ['skin-arma','costum','frizura'].includes(selectedCat);
  const hasGender   = ['costum','frizura'].includes(selectedCat);

  if (hasGender && !selectedGender) {
    showToast('Selecteaza genul (F / M)!', 'error'); return;
  }

  if (editTargetId) {
    const item = items.find(i => i.id === editTargetId);
    if (item) {
        item.name = name;
        item.account = account;
        item.category = selectedCat;
        if (hasGender) item.gender = selectedGender;
        else delete item.gender;
        
        item.expiresAt = Date.now() + ms;
        item.totalDuration = ms;
        
        delete confirmedAlerts.day1[item.id];
        delete confirmedAlerts.day4[item.id];
        delete confirmedAlerts.hourly[item.id];
        saveAlerts();
        
        if (typeof clearDiscordNotified === 'function') clearDiscordNotified(item.id);
        
        save();
        closeModal('addModal');
        editTargetId = null;
        _szResetPasteArea();
        renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
        showToast(`Item actualizat cu cu succes!`, 'success');
        if (window.logActivity) window.logActivity(`A editat ${name} pe contul ${account}`);
    }
    return;
  }

  const item = {
    id: uid(),
    name,
    account,
    category: selectedCat,
    totalDuration: ms,
    expiresAt: Date.now() + ms,
    addedAt: Date.now(),
  };
  if (hasPersFlag) item.personalized = false;
  if (hasGender)   item.gender = selectedGender;
  items.push(item);
  save();
  closeModal('addModal');
  renderCards();
  renderStats(); renderCardsIS(); renderStatsIS();
  showToast(`"${name}" adaugat cu succes!`, 'success');
  if (window.logActivity) window.logActivity(`A adaugat ${name} pe contul ${account}`);
});

// RENEW
document.getElementById('renewCancel').addEventListener('click', () => closeModal('renewModal'));
document.getElementById('renewConfirm').addEventListener('click', () => {
  const item = items.find(i => i.id === renewTargetId);
  if (!item) return;
  const d = document.getElementById('rDays').value;
  const h = document.getElementById('rHours').value;
  const m = document.getElementById('rMins').value;
  const ms = durationToMs(d, h, m);
  if (ms <= 0) { showToast('Durata trebuie sa fie > 0!', 'error'); return; }
  item.expiresAt = Date.now() + ms;
  item.totalDuration = ms;
  // Clear confirmed alerts so sounds fire again if needed
  delete confirmedAlerts.day1[item.id];
  delete confirmedAlerts.day4[item.id];
  delete confirmedAlerts.hourly[item.id];
  saveAlerts();
  
  // Clear Discord dedup so it can notify again in the future
  if (typeof clearDiscordNotified === 'function') clearDiscordNotified(item.id);
  
  save(item.id); // Granular save
  closeModal('renewModal');
  renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
  showToast(`Timpul utilitarului "${item.name}" a fost prelungit!`, 'success');
  if (window.logActivity) window.logActivity(`A reinnoit ${item.name} pe contul ${item.account}`);
});

// FEED
document.getElementById('feedCancel').addEventListener('click', () => closeModal('feedModal'));
document.getElementById('feedConfirm').addEventListener('click', () => {
  const item = items.find(i => i.id === feedTargetId);
  if (!item) return;
  item.expiresAt = Date.now() + item.totalDuration;
  delete confirmedAlerts.day1[item.id];
  delete confirmedAlerts.hourly[item.id];
  saveAlerts();
  
  if (typeof clearDiscordNotified === 'function') clearDiscordNotified(item.id);
  
  save(item.id);
  closeModal('feedModal');
  renderCards(); renderStats(); renderCardsIS(); renderStatsIS();
  showToast(`Insotitorul "${item.name}" a fost hranit! 🦊`, 'success');
  if (window.logActivity) window.logActivity(`A hranit insotitorul ${item.name} de pe contul ${item.account}`);
});

// DELETE CONFIRM
document.getElementById('deleteCancel').addEventListener('click', () => closeModal('deleteModal'));
document.getElementById('deleteConfirm').addEventListener('click', () => {
  const id = deleteTargetId;
  closeModal('deleteModal');
  deleteItem(id);
});

// Close modals ONLY with ESC key — no click-outside close
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // Don't close alert modals with ESC either
  const openable = ['addModal','renewModal','feedModal','persModal','deleteModal',
                    'invAddModal','invDetailModal','invEditModal','invDeleteModal',
                    'firebaseModal'];
  openable.forEach(id => { const el = document.getElementById(id); if (el?.classList.contains('open')) closeModal(id); });
});

// ============ FILTERS & SEARCH ============
document.getElementById('filterBtns').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.cat;
  activeGenderFilter = null;
  activeSidebarFilter = false; // clear sidebar filter on manual click
  renderCards();
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderCards();
});

