// ============ FIREBASE LAYER ============
const APP_VERSION = 'v5.0.0';
const FB_CONFIG_KEY = 'metin2_fb_config';
window.db = null;
let db = null; // keep local ref for compatibility if needed, but better use window.db
let fbConnected = false;
let fbSaveDebounce = {};
let _secretSyncInitialized = false;

// Helper for namespacing data
window.p = function(path) {
  if (typeof path !== 'string') return path;
  if (path.startsWith('.') || path.startsWith('teams/') || path.startsWith('users/') || path.startsWith('meta/') || path.startsWith('serverStatus/')) return path;
  var teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (teamId) return `teams/${teamId}/${path}`;
  return path;
};

function initFirebase(config) {
  try {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK nu s-a incarcat.');
    }
    const existingApps = firebase.apps || [];
    existingApps.forEach(app => { try { app.delete(); } catch(e) {} });
    
    const app = firebase.initializeApp(config);
    db = firebase.database(app);
    window.db = db;
    
    // Server time offset for NTP sync
    db.ref('.info/serverTimeOffset').on('value', function(snap) {
      window._clockOffsetMs = snap.val() || 0;
    });

    db.ref(p('.info/connected')).on('value', snap => {
      fbConnected = !!snap.val();
      if (typeof setConnBadge === 'function') {
        setConnBadge(fbConnected ? 'connected' : 'offline');
      }
    });

    // --- Global Team Sync ---
    window._initTeamListeners = function(teamId) {
      if (!teamId) return;
      console.log("[Firebase] Initializing 100% sync for Team:", teamId);
      window._fbSpawnLoaded = false; // reset: block spawn writes until Firebase data arrives
      
      // 1. Items (Skins/Pets)
      db.ref(`teams/${teamId}/skinReminder/items`).on('value', function(snap) {
        var val = snap.val();
        console.log("[Sync] Items received:", val ? Object.keys(val).length : 0);
        
        if (typeof window.items !== 'undefined') {
          window.items.length = 0;
          if (val) {
            Object.values(val).filter(Boolean).forEach(item => {
              // Normalize data from Pro application
              if (item.category) {
                item.category = item.category.toLowerCase().replace(/\s+/g, '-');
                if (item.category === 'skin-armă') item.category = 'skin-arma';
                if (item.category === 'frizură') item.category = 'frizura';
              }
              if (item.gender) {
                item.gender = item.gender.toLowerCase();
                if (item.gender === 'femela') item.gender = 'feminin';
              }
              if (item.expiresAt) item.expiresAt = Number(item.expiresAt);
              window.items.push(item);
            });
          }
          console.log("[Sync] window.items updated and normalized, length:", window.items.length);
          if (typeof renderCards === 'function') renderCards();
          if (typeof renderStats === 'function') renderStats();
          if (typeof renderCardsIS === 'function') renderCardsIS();
          if (typeof renderStatsIS === 'function') renderStatsIS();
        }
      }, function(error) {
        console.error("[Sync] Firebase Permission Error (Items):", error);
      });

      // 2. Inventory
      db.ref(`teams/${teamId}/inventory/items`).on('value', function(snap) {
         var val = snap.val();
         console.log("[Sync] Inventory data received:", val ? Object.keys(val).length : 0);
         if (typeof window.invItems !== 'undefined') {
            window.invItems.length = 0;
            if (val) {
              Object.entries(val).forEach(([id, item]) => {
                if (!item) return;
                item.id = id;
                if (!item.accounts) item.accounts = [];
                window.invItems.push(item);
              });
              window.invItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            }
            if (typeof renderInvGrid === 'function') renderInvGrid();
         } else {
            console.warn("[Sync] window.invItems is undefined, cannot sync inventory.");
         }
      });

      // 3. Spawn
      db.ref(`teams/${teamId}/spawn/data`).on('value', snap => {
        const val = snap.val();
        console.log('[Sync] Spawn data received from Firebase:', val ? Object.keys(val) : 'null');
        window._fbSpawnLoaded = true; // unblock saves even when Firebase has no data yet
        if (!val) return;
        if (!spawnData) spawnData = {};
        
        // Normalize spawnType for Web UI
        if (val.spawnType) {
          let sType = val.spawnType.toLowerCase();
          if (sType === 'dubla' || sType === 'dublă') sType = 'dublu';
          if (sType === 'simpla' || sType === 'simplă') sType = 'simplu';
          val.spawnType = sType;
        }

        // Convert Desktop's entries format to Web's rooms array format
        if (val.entries) {
          var convertedRooms = {};
          Object.keys(val.entries).forEach(function(ch) {
            var e = val.entries[ch];
            if (!e || !e.room) return;
            if (!convertedRooms[e.room]) convertedRooms[e.room] = [];
            var obj = { ch: parseInt(ch), type: e.type, dead: !!e.dead };
            if (e.going) { obj.going = e.going; obj.goingColor = e.goingColor || ''; }
            convertedRooms[e.room].push(obj);
          });
          // Use entries-derived rooms as the canonical source
          val.rooms = convertedRooms;
        }

        // Normalize gheata: if Desktop wrote genFals, merge into gheata
        if (val.genFals && !val.gheata) {
          val.gheata = {};
          Object.keys(val.genFals).forEach(function(chKey) {
            val.gheata[chKey] = { genFals: '', gf18: !!val.genFals[chKey].gf18, gfF: !!val.genFals[chKey].gfF };
          });
        }
        
        // Reset collections before merge so deletions from Firebase are reflected
        // Object.assign can't remove keys that no longer exist in the source
        spawnData.pins = {};
        spawnData.rooms = {};
        spawnData.entries = {};
        spawnData.chBeaten = {};
        spawnData.gheata = {};
        spawnData.genFals = {};
        Object.assign(spawnData, val);
        if (typeof buildMapDots === 'function') buildMapDots();
        if (typeof renderSpawnTables === 'function') renderSpawnTables();
        if (typeof updateSpawnTypeUI === 'function') updateSpawnTypeUI();
      }, function(error) {
        console.error("[Sync] Firebase Permission Error (Spawn):", error);
        window._fbSpawnLoaded = true; // on error, unblock saves so user can still work
      });

      // 3b. Spawn History — sync from Firebase so all clients see the same history
      db.ref(`teams/${teamId}/spawn/history`).on('value', snap => {
        const val = snap.val();
        if (!val) return;
        // Normalize: Firebase stores as object (array or push-keyed), convert to sorted array
        var arr = Array.isArray(val) ? val : Object.values(val).filter(Boolean);
        arr.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
        if (arr.length > 100) arr = arr.slice(0, 100);
        // Only update if data actually changed (avoid write loop)
        var current = typeof _spawnHistoryCache !== 'undefined' ? _spawnHistoryCache : null;
        if (!current || JSON.stringify(arr) !== JSON.stringify(current)) {
          _spawnHistoryCache = arr;
          try { localStorage.setItem(typeof SPAWN_HISTORY_KEY !== 'undefined' ? SPAWN_HISTORY_KEY : 'metin2_spawn_history_v1', JSON.stringify(arr)); } catch(e) {}
          if (typeof renderSpawnHistory === 'function') renderSpawnHistory();
        }
      });

      // 4. Alarms
      db.ref(`teams/${teamId}/alerte/items`).on('value', snap => {
        const val = snap.val();
        if (typeof alerteData !== 'undefined') {
          var globals = val ? Object.values(val).filter(Boolean) : [];
          var locals = alerteData.filter(a => !a.global);
          alerteData = locals.concat(globals);
          if (typeof renderAlertaList === 'function') renderAlertaList();
        }
      });

      // 5. Checklists
      db.ref(`teams/${teamId}/checklists/data`).on('value', function(snap) {
        try {
          var raw = snap.val();
          var parsed = raw ? JSON.parse(raw) : [];
          checklistsData = Array.isArray(parsed) ? parsed : [];
        } catch(e) {
          checklistsData = [];
        }
        if (typeof renderChecklists === 'function') renderChecklists();
      });

      // 5b. Secret (Depersonalizare) items
      db.ref(`teams/${teamId}/secret/items`).on('value', function(snap) {
        var val = snap.val();
        if (typeof secretItems !== 'undefined') {
          secretItems = val ? Object.values(val).filter(Boolean) : [];
          if (typeof renderSecretTab === 'function') renderSecretTab();
        }
      });

      // 6. Team webhook settings
      db.ref(`teams/${teamId}/settings`).on('value', function(snap) {
        var s = snap.val() || {};
        window.teamWebhookSkin   = s.discordWebhookSkin   || null;
        window.teamWebhookServer = s.discordWebhookServer || null;
        // Update inputs if the settings card is currently visible
        var skinInput = document.getElementById('inputWebhookSkin');
        var srvInput  = document.getElementById('inputWebhookServer');
        if (skinInput && document.activeElement !== skinInput) skinInput.value = window.teamWebhookSkin || '';
        if (srvInput  && document.activeElement !== srvInput)  srvInput.value  = window.teamWebhookServer || '';
      });

      // 7. Discord dedup sync — populates _discordNotifiedFb so cross-browser dedup works
      db.ref(`teams/${teamId}/discordNotified`).on('value', function(snap) {
        if (typeof _discordNotifiedFb !== 'undefined') {
          _discordNotifiedFb = snap.val() || { day1: {}, day4: {}, hourly: {} };
        }
      });
    };

    if (typeof window._initAuth === 'function') window._initAuth();
    
    return true;
  } catch(e) {
    console.error('Firebase init error:', e);
    return false;
  }
}

function fbDebounce(key, fn, delay = 2000) {
  clearTimeout(fbSaveDebounce[key]);
  fbSaveDebounce[key] = setTimeout(fn, delay);
}

// Presence, Online Users, Activity etc
window.logActivity = function(action) {
  if (!db || !window.currentUserProfile) return;
  const teamId = window.currentUserProfile.currentTeamId || window.currentUserProfile.teamId;
  if (!teamId) return;
  const name = window.currentUserProfile.name || window.currentUserProfile.email.split('@')[0];
  db.ref(`teams/${teamId}/activity`).push({
    userId: window.currentUserProfile.uid,
    userName: name,
    userColor: window.currentUserProfile.color || '#c8962e',
    action: action,
    timestamp: Date.now()
  });
};

function initPresence() {
  if (!db) return;
  const profile = window.currentUserProfile;
  if (!profile) return;
  const teamId = profile.currentTeamId || profile.teamId;
  if (!teamId) return;
  
  const ref = db.ref(`teams/${teamId}/presence/${profile.uid}`);
  ref.set({
    name: profile.name || profile.email.split('@')[0],
    color: profile.color || '#c8962e',
    ts: firebase.database.ServerValue.TIMESTAMP,
    lastAction: 'Website'
  });
  ref.onDisconnect().remove();
}

// Auto-connect helper — loads config from Worker secrets, never hardcoded
window.autoInitFirebase = async function() {
  try {
    const res = await fetch('/firebase-config');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const config = await res.json();
    if (!config.apiKey) throw new Error('Config invalid');
    initFirebase(config);
  } catch (e) {
    console.error('[Firebase] Failed to load config:', e);
  }
};