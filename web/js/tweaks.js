// tweaks.js — Setari rapide pentru Metin2 (rezolutie joc)
console.log('[Tweaks] Module loaded.');

const TWEAKS_PRESETS = [
  { w: 640,  h: 480,  label: 'Low' },
  { w: 640,  h: 540,  label: 'Classic' },
  { w: 800,  h: 600,  label: 'SVGA' },
  { w: 1024, h: 768,  label: 'XGA' },
  { w: 1280, h: 720,  label: 'HD' },
  { w: 1280, h: 960,  label: 'XVGA' },
  { w: 1366, h: 768,  label: 'Laptop' },
  { w: 1600, h: 900,  label: 'HD+' },
  { w: 1920, h: 1080, label: 'Full HD' },
];

let _dirHandle = null;
let _fileHandle = null;
let _currentW = null;
let _currentH = null;

async function tweaksPickFolder() {
  if (!window.showDirectoryPicker) {
    showToast('Browserul tau nu suporta aceasta functie. Foloseste Chrome sau Edge.', 'error');
    return;
  }
  try {
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await _tweaksSaveHandle(_dirHandle);
    await _tweaksLoadCfg();
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[Tweaks] Folder picker error:', e);
      showToast('Nu s-a putut accesa folderul.', 'error');
    }
  }
}

async function _tweaksLoadCfg() {
  if (!_dirHandle) return;
  try {
    _fileHandle = await _dirHandle.getFileHandle('metin2.cfg');
    const file = await _fileHandle.getFile();
    const content = await file.text();
    const wMatch = content.match(/WIDTH\s+(\d+)/);
    const hMatch = content.match(/HEIGHT\s+(\d+)/);
    if (wMatch && hMatch) {
      _currentW = parseInt(wMatch[1]);
      _currentH = parseInt(hMatch[1]);
      const resEl = document.getElementById('tweaksCurrentResVal');
      const resRow = document.getElementById('tweaksCurrentRes');
      if (resEl) resEl.textContent = `${_currentW} × ${_currentH}`;
      if (resRow) resRow.style.display = 'flex';
    }
    const pathEl = document.getElementById('tweaksFolderPath');
    if (pathEl) {
      pathEl.textContent = _dirHandle.name;
      pathEl.classList.add('has-value');
    }
    _tweaksUpdateActivePreset();
    document.getElementById('tweaksPresets').classList.remove('tweaks-presets--locked');
    document.getElementById('tweaksCustomApply').disabled = false;
  } catch (e) {
    console.error('[Tweaks] Cfg read error:', e);
    showToast('metin2.cfg nu a fost gasit. Verifica folderul ales.', 'error');
    _dirHandle = null;
    _fileHandle = null;
  }
}

async function tweaksApplyRes(w, h) {
  if (!_fileHandle) {
    showToast('Selecteaza mai intai folderul jocului.', 'error');
    return;
  }
  try {
    const file = await _fileHandle.getFile();
    let content = await file.text();
    content = content.replace(/(WIDTH\s+)\d+/, `$1${w}`);
    content = content.replace(/(HEIGHT\s+)\d+/, `$1${h}`);
    const writable = await _fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    _currentW = w;
    _currentH = h;
    const resEl = document.getElementById('tweaksCurrentResVal');
    if (resEl) resEl.textContent = `${w} × ${h}`;
    _tweaksUpdateActivePreset();
    showToast(`Rezolutie aplicata: ${w} × ${h}`, 'success');
    console.log(`[Tweaks] Resolution set to ${w}×${h}`);
  } catch (e) {
    console.error('[Tweaks] Write error:', e);
    showToast('Eroare la modificarea fisierului. Reporneste browserul si incearca din nou.', 'error');
  }
}

function _tweaksUpdateActivePreset() {
  document.querySelectorAll('.tweaks-preset-btn').forEach(btn => {
    const isActive = parseInt(btn.dataset.w) === _currentW && parseInt(btn.dataset.h) === _currentH;
    btn.classList.toggle('tweaks-preset-btn--active', isActive);
  });
}

function _tweaksRenderPresets() {
  const grid = document.getElementById('tweaksPresets');
  if (!grid) return;
  grid.innerHTML = TWEAKS_PRESETS.map(p => `
    <button class="tweaks-preset-btn" data-w="${p.w}" data-h="${p.h}" onclick="tweaksApplyRes(${p.w},${p.h})" title="Aplica ${p.w}×${p.h}">
      <span class="tweaks-preset-res">${p.w}<span class="tweaks-preset-x">×</span>${p.h}</span>
      <span class="tweaks-preset-label">${p.label}</span>
    </button>
  `).join('');
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function _tweaksOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('m2tweaks', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function _tweaksSaveHandle(handle) {
  try {
    const db = await _tweaksOpenDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'metin2dir');
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) {
    console.warn('[Tweaks] Could not save handle:', e);
  }
}

async function _tweaksLoadSavedHandle() {
  try {
    const db = await _tweaksOpenDB();
    const tx = db.transaction('handles', 'readonly');
    const handle = await new Promise((res, rej) => {
      const r = tx.objectStore('handles').get('metin2dir');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return handle;
  } catch (e) {
    return null;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function initTweaks() {
  console.log('[Tweaks] Init...');
  _tweaksRenderPresets();

  document.getElementById('tweaksBrowseBtn').onclick = tweaksPickFolder;
  document.getElementById('tweaksCustomApply').onclick = () => {
    const w = parseInt(document.getElementById('tweaksCustomW').value);
    const h = parseInt(document.getElementById('tweaksCustomH').value);
    if (!w || !h || w < 320 || h < 240 || w > 3840 || h > 2160) {
      showToast('Rezolutie invalida.', 'error');
      return;
    }
    tweaksApplyRes(w, h);
  };

  // Try restoring saved folder handle from IndexedDB
  const saved = await _tweaksLoadSavedHandle();
  if (saved) {
    try {
      const perm = await saved.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _dirHandle = saved;
        await _tweaksLoadCfg();
        console.log('[Tweaks] Restored saved folder.');
        return;
      }
    } catch (e) { /* permission expired, user re-picks */ }
  }

  console.log('[Tweaks] Ready (no saved folder).');
}

window.initTweaks = initTweaks;
window.tweaksApplyRes = tweaksApplyRes;
window.tweaksPickFolder = tweaksPickFolder;
