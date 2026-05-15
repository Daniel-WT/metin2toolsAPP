// ============ DATA ============
const STORAGE_KEY = 'metin2_items_v2';
window.items = [];
var items = window.items; // alias for internal use
var activeFilter = 'all';
var activeGenderFilter = null;
var activeSidebarFilter = false;
var renewTargetId = null;
var feedTargetId = null;
var selectedCat = null;
var tickInterval = null;
var isFilter = 'all';

const CAT_META = {
  'skin-arma':  { label: 'Skin Arma',  icon: '<img src="img/icons/arma.png" width="22" height="22" style="object-fit:contain">', cls: 'skin-arma' },
  'costum':     { label: 'Costum',     icon: '<img src="img/icons/costum_m.png" width="22" height="22" style="object-fit:contain">', iconM: 'img/icons/costum_m.png', iconF: 'img/icons/costum_f.png', cls: 'costum' },
  'frizura':    { label: 'Frizura',    icon: '<img src="img/icons/frizura_m.png" width="22" height="22" style="object-fit:contain">', iconM: 'img/icons/frizura_m.png', iconF: 'img/icons/frizura_f.png', cls: 'frizura' },
  'atac-auto':  { label: 'Atac Auto',  icon: '<img src="img/icons/atac.png" width="22" height="22" style="object-fit:contain">', cls: 'atac-auto' },
  'manusa':     { label: 'Manusa Talh.',icon: '<img src="img/icons/manusa.png" width="22" height="22" style="object-fit:contain">', cls: 'manusa' },
  'insotitor':  { label: 'Insotitor',  icon: '<img src="img/icons/insotitor.png" width="22" height="22" style="object-fit:contain">', cls: 'insotitor' },
  'sase-sapte': { label: '6/7',        icon: '<img src="img/icons/67.png" width="22" height="22" style="object-fit:contain">', cls: 'sase-sapte' },
};

function getCatIcon(category, gender) {
  var m = CAT_META[category];
  if (!m) return '';
  if ((category === 'costum' || category === 'frizura') && gender === 'F' && m.iconF) {
    return '<img src="' + m.iconF + '" width="22" height="22" style="object-fit:contain">';
  }
  if ((category === 'costum' || category === 'frizura') && m.iconM) {
    return '<img src="' + m.iconM + '" width="22" height="22" style="object-fit:contain">';
  }
  return m.icon;
}

const INSOTITOR_ICONS = [
  ['maimuta',         'img/icons/Maimuta.png'],
  ['paianjen',        'img/icons/Paianjen.png'],
  ['paianjan',        'img/icons/Paianjen.png'],
  ['razador',         'img/icons/Razador.png'],
  ['nemere',          'img/icons/Nemere.png'],
  ['dragonette',      'img/icons/Dragonette.png'],
  ['dragon albastru', 'img/icons/Dragonette.png'],
  ['baashido',        'img/icons/Baashido.png'],
  ['executor',        'img/icons/MiniExecutorGras.png'],
  ['nessie',          'img/icons/Nessie.png'],
  ['azrael',          'img/icons/MiniAzrael.png'],
  ['exedyar',         'img/icons/Exedyar.png'],
  ['nervos',          'img/icons/Alastor.png'],
  ['dragon alb',      'img/icons/Alastor.png'],
  ['alastor',         'img/icons/Alastor.png'],
  ['gardian',         'img/icons/Gardian.png'],
  ['aamon',           'img/icons/Aamon.png'],
  ['meley',           'img/icons/Meley.png'],
];

function getInsotitorIcon(name) {
  const n = (name || '').toLowerCase();
  for (const [kw, path] of INSOTITOR_ICONS) {
    if (n.includes(kw)) return '<img src="' + path + '" width="22" height="22" style="object-fit:contain">';
  }
  return '<img src="img/icons/insotitor.png" width="22" height="22" style="object-fit:contain">';
}

const SR_CATS = ['skin-arma','costum','frizura'];
const IS_CATS = ['atac-auto','manusa','insotitor','sase-sapte','site'];

window.items = [];

function load() {
  // If we are connected to Firebase and in a team, skip loading from localStorage
  // as it will be handled by the team listeners.
  if (window.fbConnected && (window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId)) {
    console.log("[Data] Skipping local load, using Firebase sync.");
    return;
  }
  
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const arr = JSON.parse(saved);
      window.items.length = 0;
      arr.forEach(i => window.items.push(i));
    } catch(e) { window.items.length = 0; }
  }
}

function save(itemId) {
  // Always save to LocalStorage as a local backup
  localStorage.setItem(STORAGE_KEY, JSON.stringify(window.items));

  if (db) {
    if (itemId) {
      // Granular update: only update the specific item that changed
      const item = window.items.find(i => i.id === itemId);
      if (item) {
        // Firebase refuses undefined/null values — strip them
        const clean = JSON.parse(JSON.stringify(item, (k, v) => v === undefined ? undefined : v));
        Object.keys(clean).forEach(k => { if (clean[k] === null) delete clean[k]; });
        
        fbDebounce('skinItem_' + itemId, () => {
          db.ref(p('skinReminder/items/' + itemId)).set(clean).catch(e => console.error('SR save error:', e));
        }, 500);
      }
    } else {
      // Bulk update (fallback)
      const obj = {};
      window.items.forEach(i => {
        obj[i.id] = JSON.parse(JSON.stringify(i, (k, v) => v === undefined ? undefined : v));
        Object.keys(obj[i.id]).forEach(k => { if (obj[i.id][k] === null) delete obj[i.id][k]; });
      });
      fbDebounce('skinReminder', () => db.ref(p('skinReminder/items')).set(obj), 2000);
    }
  }
}

