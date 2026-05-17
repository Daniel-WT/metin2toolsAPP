import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/firebase';
import { ref, onValue, set, push, get, update, runTransaction } from 'firebase/database';
import { useAuth } from './AuthContext';
import { WebviewWindow, getCurrent } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';

interface SpawnEntry {
  type: 'sef' | 'gen' | 'notfound';
  time: string;
  dead: boolean;
  going?: string;
  goingColor?: string;
}

interface SpawnData {
  rooms?: Record<string, Record<string, SpawnEntry>>;
  entries?: Record<string, { room: string; type: string; dead: boolean; going?: string; goingColor?: string }>;
  pins?: Record<string, { x: string, y: string }>;
  chTimes?: Record<string, string>;
  genFals?: Record<string, Record<string, boolean>>;
  gheata?: Record<string, Record<string, any>>;
  spawnType?: 'simplu' | 'dublu';
  evenHourType?: 'simplu' | 'dublu';
  parityRule?: { settledHour: number; settledType: 'simplu' | 'dublu' };
  anchor?: { ts: number; type: 'simplu' | 'dublu'; intervalMs: number };
  chBeaten?: Record<string, boolean>;
  _prevSpawnType?: string;
  _resetAt?: number;
}

interface SpawnContextType {
  spawnData: SpawnData | null;
  history: any[];
  typeHistory: any[];
  loading: boolean;
  activeCH: number | null;
  setActiveCH: (ch: number | null) => void;
  toast: string | null;
  updateSpawnTime: (type: 'sef' | 'gen', ch: number, roomId: string, time: string) => void;
  setNotFound: (ch: number) => void;
  toggleDead: (roomId: string, ch: number) => void;
  cycleStatus: (roomId: string, ch: number) => void;
  clearCH: (ch: number) => void;
  clearRoom: (roomId: string) => void;
  toggleBeaten: (ch: number) => void;
  toggleGenFals: (ch: number, roomId: string) => void;
  setMapDot: (ch: number, x: string, y: string) => void;
  removePin: (ch: number) => void;
  setCHTime: (ch: number, mmss: string | null) => void;
  clearAllRooms: () => void;
  setSpawnType: (type: 'simplu' | 'dublu') => void;
  audioEnabled: boolean;
  setAudioEnabled: (val: boolean) => void;
  globalVolume: number;
  setGlobalVolume: (val: number) => void;
  spawnVolume: number;
  setSpawnVolume: (val: number) => void;
  skinVolume: number;
  setSkinVolume: (val: number) => void;
  pushUndo: (label: string) => void;
  undo: () => void;
  showToast: (msg: string) => void;
  activeAlerts: string[];
  confirmAlert: (chKey: string) => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (val: boolean) => void;
  serverTimeOffset: number;
  logActivity: (action: string) => void;
  playSpawnAlarm: (type: '30s' | '2min') => void;
  triggerDebugAlert: (type: '30s' | '2min') => void;
}

const SpawnContext = createContext<SpawnContextType | undefined>(undefined);

export const useSpawn = () => {
  const context = useContext(SpawnContext);
  if (!context) throw new Error('useSpawn must be used within SpawnProvider');
  return context;
};

const UNDO_MAX = 30;

export const SpawnProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [spawnData, setSpawnData] = useState<SpawnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCH, setActiveCH] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [typeHistory, setTypeHistory] = useState<any[]>([]);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState<string[]>([]);
  
  const undoStack = useRef<any[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeOscillators = useRef<OscillatorNode[]>([]);
  const soundLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Volumes stored as 0-1 range
  const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('m2_spawn_audio') !== 'false');
  const [globalVolume, setGlobalVolume] = useState(() => parseFloat(localStorage.getItem('m2_global_volume') || '0.8'));
  const [spawnVolume, setSpawnVolume] = useState(() => parseFloat(localStorage.getItem('m2_spawn_volume') || '0.6'));
  const [skinVolume, setSkinVolume] = useState(() => parseFloat(localStorage.getItem('m2_skin_volume') || '0.7'));

  // Refs pentru valorile curente — folosite in listener-e pentru a evita closure stale
  const globalVolumeRef = useRef(globalVolume);
  const spawnVolumeRef = useRef(spawnVolume);
  const skinVolumeRef = useRef(skinVolume);

  useEffect(() => { localStorage.setItem('m2_spawn_audio', audioEnabled.toString()); }, [audioEnabled]);

  useEffect(() => {
    globalVolumeRef.current = globalVolume;
    localStorage.setItem('m2_global_volume', globalVolume.toString());
    emit('global-volume-change', globalVolume);
  }, [globalVolume]);

  useEffect(() => {
    spawnVolumeRef.current = spawnVolume;
    localStorage.setItem('m2_spawn_volume', spawnVolume.toString());
    emit('spawn-volume-change', spawnVolume);
  }, [spawnVolume]);

  useEffect(() => {
    skinVolumeRef.current = skinVolume;
    localStorage.setItem('m2_skin_volume', skinVolume.toString());
    emit('skin-volume-change', skinVolume);
  }, [skinVolume]);

  // Listener-e înregistrate o singură dată — fără deps, folosesc refs pentru valorile curente
  useEffect(() => {
    const unsubGlobal = listen<number>('global-volume-change', (e) => {
      if (Math.abs(e.payload - globalVolumeRef.current) > 0.001) setGlobalVolume(e.payload);
    });
    const unsubSpawn = listen<number>('spawn-volume-change', (e) => {
      if (Math.abs(e.payload - spawnVolumeRef.current) > 0.001) setSpawnVolume(e.payload);
    });
    const unsubSkin = listen<number>('skin-volume-change', (e) => {
      if (Math.abs(e.payload - skinVolumeRef.current) > 0.001) setSkinVolume(e.payload);
    });
    return () => {
      unsubGlobal.then(f => f());
      unsubSpawn.then(f => f());
      unsubSkin.then(f => f());
    };
  }, []);

  const teamId = user?.teamId || 'default-team';
  const basePath = `teams/${teamId}/spawn/data`;

  // Convert Web's flat entries format to Desktop's nested rooms format
  const entriesToRooms = (entries: Record<string, any>): Record<string, Record<string, SpawnEntry>> => {
    const rooms: Record<string, Record<string, SpawnEntry>> = {};
    Object.entries(entries || {}).forEach(([chNum, e]) => {
      if (!e || !e.room) return;
      if (!rooms[e.room]) rooms[e.room] = {};
      rooms[e.room][`ch${chNum}`] = {
        type: e.type || 'sef',
        time: e.time || '',
        dead: !!e.dead,
        ...(e.going ? { going: e.going, goingColor: e.goingColor || '' } : {})
      };
    });
    return rooms;
  };

  // Convert Web's gheata format to Desktop's genFals format
  const gheataToGenFals = (gheata: Record<string, any>): Record<string, Record<string, boolean>> => {
    const genFals: Record<string, Record<string, boolean>> = {};
    Object.entries(gheata || {}).forEach(([chKey, data]) => {
      genFals[chKey] = {
        gf18: !!data?.gf18,
        gfF: !!data?.gfF
      };
    });
    return genFals;
  };

  // Firebase Listeners
  useEffect(() => {
    if (!teamId) return;
    const unsubData = onValue(ref(db, basePath), (snapshot) => {
      const raw = snapshot.val() || {};
      
      // If Web wrote entries but no rooms, convert entries → rooms
      if (raw.entries && (!raw.rooms || Object.keys(raw.rooms).length === 0)) {
        raw.rooms = entriesToRooms(raw.entries);
      } else if (raw.entries && raw.rooms) {
        // Merge: entries from Web take priority for CHs that only exist there
        const webRooms = entriesToRooms(raw.entries);
        Object.entries(webRooms).forEach(([rid, chs]) => {
          if (!raw.rooms[rid]) raw.rooms[rid] = {};
          Object.entries(chs).forEach(([chKey, entry]) => {
            if (!raw.rooms[rid][chKey]) raw.rooms[rid][chKey] = entry;
          });
        });
      }

      // If Web wrote gheata but no genFals, convert
      if (raw.gheata && (!raw.genFals || Object.keys(raw.genFals).length === 0)) {
        raw.genFals = gheataToGenFals(raw.gheata);
      } else if (raw.gheata) {
        // Merge: gheata from Web updates genFals
        const converted = gheataToGenFals(raw.gheata);
        Object.entries(converted).forEach(([chKey, data]) => {
          if (!raw.genFals) raw.genFals = {};
          raw.genFals[chKey] = { ...(raw.genFals[chKey] || {}), ...data };
        });
      }

      setSpawnData(raw);
      setLoading(false);
    });
    const unsubHistory = onValue(ref(db, `teams/${teamId}/spawn/history`), (snapshot) => {
      const data = snapshot.val();
      if (data) setHistory(Object.values(data).sort((a: any, b: any) => b.ts - a.ts).slice(0, 100));
    });
    const typeHistoryRef = ref(db, `teams/${teamId}/spawn/typeHistory`);
    const unsubscribeTypeHistory = onValue(typeHistoryRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sorted = Object.values(data).sort((a: any, b: any) => b.ts - a.ts).slice(0, 200);
        setTypeHistory(sorted);
      }
    });
    const offsetRef = ref(db, ".info/serverTimeOffset");
    onValue(offsetRef, (snap) => {
      setServerTimeOffset(snap.val() || 0);
    });

    return () => { unsubData(); unsubHistory(); unsubscribeTypeHistory(); };
  }, [basePath, teamId]);

  const firedAlertsRef = useRef<Set<string>>(new Set());
  const clearAllRoomsRef = useRef<(() => void) | null>(null);
  const chTimeSetCooldownRef = useRef<number>(0);
  const ch1OrganicNearZeroAtRef = useRef<number | null>(null);
  const prevCh1DiffRef = useRef<number | null>(null);
  const prevCh1ValRef = useRef<string | null | undefined>(undefined);
  const spawnResetPendingRef = useRef<{ clearKey: string; blockedAt: number } | null>(null);
  const clearSpawnForRespawnRef = useRef<((cycleKey: string) => void) | null>(null);

  const stopSpawnAlarm = useCallback(() => {
    if (soundLoopRef.current) {
      clearInterval(soundLoopRef.current);
      soundLoopRef.current = null;
    }
    // Inchidem contextul audio complet — opreste instant tot sunetul
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) {}
      audioCtxRef.current = null;
    }
    activeOscillators.current = [];
  }, []);

  const playSpawnAlarm = useCallback((type: '30s' | '2min') => {
    if (!audioEnabled) return;

    // Context nou la fiecare redare — identic cu site-ul, evita starea acumulata din WebView2
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) {}
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;
    activeOscillators.current = [];
    ctx.resume().catch(() => {});

    const sliderVol = Math.min(1, globalVolume * spawnVolume);
    if (sliderVol < 0.001) { ctx.close().catch(() => {}); return; }
    const t0 = ctx.currentTime;

    if (type === '2min') {
      const vol = sliderVol * 0.3;
      const chimes = [
        { freq: 523, start: 0,    dur: 0.35 },
        { freq: 659, start: 0.30, dur: 0.35 },
        { freq: 784, start: 0.60, dur: 0.50 },
        { freq: 523, start: 1.8,  dur: 0.35 },
        { freq: 659, start: 2.1,  dur: 0.35 },
        { freq: 784, start: 2.4,  dur: 0.50 },
      ];
      chimes.forEach((c, idx) => {
        const tStart = t0 + c.start;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const g = ctx.createGain();
        const g2 = ctx.createGain();
        osc1.type = 'sine'; osc1.frequency.value = c.freq;
        osc2.type = 'sine'; osc2.frequency.value = c.freq * 2;
        g2.gain.value = 0.08;
        osc1.connect(g); osc2.connect(g2); g2.connect(g); g.connect(ctx.destination);
        const thisVol = idx >= 3 ? vol * 0.7 : vol;
        g.gain.setValueAtTime(0, tStart);
        g.gain.linearRampToValueAtTime(thisVol, tStart + 0.015);
        g.gain.setTargetAtTime(0, tStart + 0.015, c.dur * 0.35);
        osc1.start(tStart); osc1.stop(tStart + c.dur + 0.1);
        osc2.start(tStart); osc2.stop(tStart + c.dur + 0.1);
        activeOscillators.current.push(osc1, osc2);
      });
    } else {
      const vol = sliderVol * 0.35;
      const pairs = [
        { hi: 698, lo: 523, start: 0   },
        { hi: 698, lo: 523, start: 0.9 },
        { hi: 784, lo: 587, start: 1.8 },
      ];
      pairs.forEach((pair) => {
        const osc1 = ctx.createOscillator();
        const osc1h = ctx.createOscillator();
        const g1 = ctx.createGain();
        const g1h = ctx.createGain();
        osc1.type = 'sine'; osc1.frequency.value = pair.hi;
        osc1h.type = 'sine'; osc1h.frequency.value = pair.hi * 3;
        g1h.gain.value = 0.04;
        osc1.connect(g1); osc1h.connect(g1h); g1h.connect(g1); g1.connect(ctx.destination);
        const t1 = t0 + pair.start;
        g1.gain.setValueAtTime(0, t1);
        g1.gain.linearRampToValueAtTime(vol, t1 + 0.01);
        g1.gain.linearRampToValueAtTime(0, t1 + 0.4);
        osc1.start(t1); osc1.stop(t1 + 0.42);
        osc1h.start(t1); osc1h.stop(t1 + 0.42);
        const osc2 = ctx.createOscillator();
        const osc2h = ctx.createOscillator();
        const g2 = ctx.createGain();
        const g2h = ctx.createGain();
        osc2.type = 'sine'; osc2.frequency.value = pair.lo;
        osc2h.type = 'sine'; osc2h.frequency.value = pair.lo * 3;
        g2h.gain.value = 0.04;
        osc2.connect(g2); osc2h.connect(g2h); g2h.connect(g2); g2.connect(ctx.destination);
        const t2 = t1 + 0.35;
        g2.gain.setValueAtTime(0, t2);
        g2.gain.linearRampToValueAtTime(vol * 0.85, t2 + 0.01);
        g2.gain.linearRampToValueAtTime(0, t2 + 0.45);
        osc2.start(t2); osc2.stop(t2 + 0.47);
        osc2h.start(t2); osc2h.stop(t2 + 0.47);
        activeOscillators.current.push(osc1, osc1h, osc2, osc2h);
      });
    }
  }, [audioEnabled, globalVolume, spawnVolume]);

  const checkAlarms = useCallback(() => {
    if (!spawnData?.chTimes) return;
    const isPopout = window.location.search.includes('view=');
    if (isPopout) return; // Only main window fires alerts

    const now = new Date(Date.now() + serverTimeOffset);
    const currentHour = now.getHours();
    const nowInHour = now.getMinutes() * 60 + now.getSeconds();

    Object.entries(spawnData.chTimes).forEach(([ch, val]) => {
      if (!val) return;
      const parts = val.split(':').map(n => parseInt(n, 10));
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return;

      let diff = (parts[0] * 60 + parts[1]) - nowInHour;
      if (diff <= 0) diff += 3600;

      const cycleKey = `${ch}_${val}_${currentHour}`;

      // 2 minute warning CH1 — DOAR sonor, fara vizual
      if (ch === 'ch1' && diff <= 120 && diff >= 118) {
        if (!firedAlertsRef.current.has(cycleKey + '_2min')) {
          firedAlertsRef.current.add(cycleKey + '_2min');
          playSpawnAlarm('2min');
        }
      }

      // 30 secunde — sunet + modal in toate ferestrele
      // Sunetul se reda DOAR din fereastra principala (pop-out-urile primesc starea prin event)
      if ((ch === 'ch1' || ch === 'ch2') && diff <= 30 && diff > 0) {
        if (!firedAlertsRef.current.has(cycleKey + '_30s')) {
          firedAlertsRef.current.add(cycleKey + '_30s');
          // Actualizeaza starea locala
          setActiveAlerts(prev => prev.includes(ch) ? prev : [...prev, ch]);
          // Broadcast catre toate ferestrele (pop-out-urile vor afisa modalul)
          emit('spawn-alert-fired', ch).catch(() => {});
          // Sunetul se reda doar din fereastra principala
          if (!isPopout) playSpawnAlarm('30s');
        }
      }
    });

    // T=0 detection for CH1 — fire reset via Firebase transaction (same dedup as web)
    const ch1Val = spawnData.chTimes?.['ch1'];
    if (ch1Val) {
      const ch1Parts = ch1Val.split(':').map((n: string) => parseInt(n, 10));
      if (ch1Parts.length === 2 && !isNaN(ch1Parts[0]) && !isNaN(ch1Parts[1])) {
        let ch1Diff = (ch1Parts[0] * 60 + ch1Parts[1]) - nowInHour;
        if (ch1Diff <= 0) ch1Diff += 3600;

        const isCooldownActive = (Date.now() - chTimeSetCooldownRef.current) < 60000;

        // Organic near-zero tracking (only when cooldown inactive)
        if (ch1Diff <= 10 && !isCooldownActive) {
          ch1OrganicNearZeroAtRef.current = Date.now();
        }

        // Wrap detection: prev diff was small, now large → spawn just fired
        const prevDiff = prevCh1DiffRef.current;
        const ch1Wrapped = prevDiff !== null && prevDiff <= 300 && ch1Diff >= 3300;
        prevCh1DiffRef.current = ch1Diff;

        if (ch1Diff >= 3590 || ch1Wrapped) {
          const clearKey = `${ch1Val}_h${currentHour}`;
          const cooldownOk = !isCooldownActive;
          const organicSpawn = ch1OrganicNearZeroAtRef.current !== null &&
            (Date.now() - ch1OrganicNearZeroAtRef.current) < 120000;

          if (!firedAlertsRef.current.has(clearKey + '_reset')) {
            if (cooldownOk || organicSpawn) {
              firedAlertsRef.current.add(clearKey + '_reset');
              spawnResetPendingRef.current = null;
              clearSpawnForRespawnRef.current?.(clearKey);
            } else if (!ch1Wrapped) {
              // Defer until cooldown expires
              if (!spawnResetPendingRef.current) {
                spawnResetPendingRef.current = { clearKey, blockedAt: Date.now() };
              }
            }
          }
        }

        // Process deferred reset
        const pending = spawnResetPendingRef.current;
        if (pending && (Date.now() - chTimeSetCooldownRef.current) > 60000) {
          spawnResetPendingRef.current = null;
          if (!firedAlertsRef.current.has(pending.clearKey + '_reset') &&
              (Date.now() - pending.blockedAt) < 300000) {
            firedAlertsRef.current.add(pending.clearKey + '_reset');
            clearSpawnForRespawnRef.current?.(pending.clearKey);
          }
        }

      }
    }

    // Reset dedup set at each new hour
    if (now.getMinutes() === 0 && now.getSeconds() === 0) {
      firedAlertsRef.current.clear();
    }
  }, [spawnData?.chTimes, playSpawnAlarm, serverTimeOffset]);

  useEffect(() => {
    const inv = setInterval(checkAlarms, 1000);
    return () => clearInterval(inv);
  }, [checkAlarms]);

  // Guard against false resets when CH1 is changed externally (web app / other client)
  useEffect(() => {
    const ch1 = spawnData?.chTimes?.ch1 ?? null;
    if (prevCh1ValRef.current === undefined) {
      prevCh1ValRef.current = ch1; // initial load — don't trigger cooldown
      return;
    }
    if (ch1 !== prevCh1ValRef.current) {
      chTimeSetCooldownRef.current = Date.now();
      prevCh1ValRef.current = ch1;
    }
  }, [spawnData?.chTimes?.ch1]);

  // Repeat urgent alarm every 4 seconds while 30s alerts are active
  useEffect(() => {
    const isPopout = window.location.search.includes('view=');
    if (isPopout) return;

    if (activeAlerts.length === 0) {
      stopSpawnAlarm();
      return;
    }

    // Play immediately when alert fires, then repeat
    if (!soundLoopRef.current) {
      soundLoopRef.current = setInterval(() => playSpawnAlarm('30s'), 4000);
    }

    return () => {
      if (soundLoopRef.current) {
        clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
    };
  }, [activeAlerts.length, playSpawnAlarm, stopSpawnAlarm]);


  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const pushUndo = useCallback((label: string) => {
    if (!spawnData) return;
    undoStack.current.push({ label, snapshot: JSON.parse(JSON.stringify(spawnData)) });
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift();
  }, [spawnData]);

  const logActivity = useCallback((action: string) => {
    if (!teamId || !user) return;
    const activityRef = ref(db, `teams/${teamId}/activity`);
    push(activityRef, {
      userId: user.uid || 'unknown',
      userName: user.name || (user.email ? user.email.split('@')[0] : 'Admin'),
      userColor: user.color || '#c8962e',
      action: action || 'Acțiune necunoscută',
      timestamp: Date.now()
    }).catch(e => console.error("Activity Log Error:", e));
  }, [teamId, user]);

  const logTypeChange = useCallback((from: string, to: string, reason?: string) => {
    if (!teamId) return;
    const localNow = new Date();
    const historyPath = `teams/${teamId}/spawn/typeHistory`;
    const newLogRef = push(ref(db, historyPath));
    set(newLogRef, {
      ts: Date.now(),
      from,
      to,
      reason: reason || 'auto-switch',
      hourLocal: localNow.getHours(),
      userName: user?.name || (user?.email ? user.email.split('@')[0] : 'Anonim')
    });
  }, [teamId, user]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current.pop();
    set(ref(db, basePath), entry.snapshot);
    logActivity('A folosit UNDO');
  }, [basePath, logActivity]);

  const updateSpawnTime = useCallback((type: 'sef' | 'gen', ch: number, roomId: string, time: string) => {
    pushUndo(`CH${ch} ${type}`);
    const updates: Record<string, any> = {};
    const oldEntry = spawnData?.entries?.[String(ch)];
    // Clear old room if changing rooms
    if (oldEntry?.room && oldEntry.room !== roomId) {
      updates[`rooms/${oldEntry.room}/ch${ch}`] = null;
    }
    // Auto gen fals: daca se suprascrie un GEN din camera 18 sau F cu ceva dintr-o camera normala
    const isMovingToRegular = roomId !== '18' && roomId !== 'F' && roomId !== '_nf';
    if (oldEntry?.type === 'gen' && (oldEntry.room === '18' || oldEntry.room === 'F') && isMovingToRegular) {
      const key = oldEntry.room === '18' ? 'gf18' : 'gfF';
      updates[`genFals/ch${ch}/${key}`] = true;
      updates[`gheata/ch${ch}/${key}`] = true;
    }
    // Write to both entries (web compat) and rooms (desktop UI source of truth)
    updates[`entries/${ch}`] = { room: roomId, type, dead: false };
    updates[`rooms/${roomId}/ch${ch}`] = { type, dead: false };
    update(ref(db, basePath), updates);
    const displayTime = time.includes('T')
      ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : time;
    logActivity(`A notat ${type.toUpperCase()} la camera ${roomId} pe CH${ch} (${displayTime})`);
  }, [spawnData, basePath, pushUndo, logActivity]);

  const setNotFound = useCallback((ch: number) => {
    pushUndo(`CH${ch} Nu este`);
    const updates: Record<string, any> = {};
    updates[`entries/${ch}`] = { room: '_nf', type: 'notfound', dead: false };
    update(ref(db, basePath), updates);
    logActivity(`A marcat CH${ch} ca NU ESTE`);
  }, [basePath, pushUndo, logActivity]);

  const toggleDead = useCallback((roomId: string, ch: number) => {
    const isDead = !(spawnData?.rooms?.[roomId]?.[`ch${ch}`]?.dead);
    const updates: Record<string, any> = {
      [`entries/${ch}/dead`]: isDead,
      [`rooms/${roomId}/ch${ch}/dead`]: isDead,
    };
    update(ref(db, basePath), updates);
    logActivity(isDead ? `A marcat CH${ch} ca BĂTUT` : `A reînviat CH${ch}`);
  }, [spawnData, basePath, logActivity]);

  const cycleStatus = useCallback((roomId: string, ch: number) => {
    const entry = spawnData?.rooms?.[roomId]?.[`ch${ch}`];
    if (!entry) return;
    const updates: Record<string, any> = {};
    if (entry.dead) {
      updates[`entries/${ch}`] = { room: roomId, type: entry.type, dead: false };
      updates[`rooms/${roomId}/ch${ch}`] = { type: entry.type, dead: false };
      logActivity(`A reînviat CH${ch}`);
    } else if (entry.going) {
      updates[`entries/${ch}`] = { room: roomId, type: entry.type, dead: true };
      updates[`rooms/${roomId}/ch${ch}`] = { type: entry.type, dead: true };
      logActivity(`A bătut CH${ch} (Camera ${roomId})`);
    } else {
      const goingName = user?.name || 'User';
      const goingColor = user?.color || '#10b981';
      updates[`entries/${ch}`] = { room: roomId, type: entry.type, dead: false, going: goingName, goingColor };
      updates[`rooms/${roomId}/ch${ch}`] = { type: entry.type, dead: false, going: goingName, goingColor };
    }
    update(ref(db, basePath), updates);
  }, [spawnData, basePath, user, logActivity]);

  const clearCH = useCallback((ch: number) => {
    pushUndo(`Reset CH${ch}`);
    const updates: Record<string, any> = {};
    updates[`entries/${ch}`] = null;
    updates[`pins/ch${ch}`] = null;
    updates[`chBeaten/ch${ch}`] = null;
    // Also clear from all rooms (Desktop UI source of truth)
    Object.keys(spawnData?.rooms || {}).forEach(rid => {
      if (spawnData?.rooms?.[rid]?.[`ch${ch}`]) {
        updates[`rooms/${rid}/ch${ch}`] = null;
      }
    });
    update(ref(db, basePath), updates);
    logActivity(`A RESETAT complet CH${ch} (nebătut)`);
  }, [basePath, logActivity, pushUndo, spawnData]);

  const clearRoom = useCallback((roomId: string) => { 
    pushUndo(`Clear Room ${roomId}`);
    const updates: Record<string, any> = {};
    if (spawnData?.entries) {
      Object.entries(spawnData.entries).forEach(([ch, e]) => {
        if (e?.room === roomId) updates[`entries/${ch}`] = null;
      });
    }
    update(ref(db, basePath), updates);
    logActivity(`A curățat camera ${roomId}`);
  }, [spawnData, basePath, logActivity, pushUndo]);

  const toggleBeaten = useCallback((ch: number) => { 
    pushUndo(`Status CH${ch}`);
    const isBeaten = !(spawnData?.chBeaten?.[`ch${ch}`]);
    set(ref(db, `${basePath}/chBeaten/ch${ch}`), isBeaten); 
    logActivity(isBeaten ? `A schimbat CH${ch} ca bătut` : `A schimbat CH${ch} ca nebătut`);
  }, [spawnData, basePath, logActivity, pushUndo]);

  const setCHTime = useCallback((ch: number, mmss: string | null) => {
    pushUndo(`Time CH${ch}`);
    set(ref(db, `${basePath}/chTimes/ch${ch}`), mmss);
    if (ch === 1) chTimeSetCooldownRef.current = Date.now(); // guard against false spawn reset
    if (mmss) logActivity(`A setat timpul CH${ch} la ${mmss}`);
  }, [basePath, logActivity, pushUndo]);

  const pushSpawnHistory = useCallback(() => {
    if (!spawnData || !spawnData.rooms || Object.keys(spawnData.rooms).length === 0) return;
    let hasReal = false;
    Object.values(spawnData.rooms).forEach(chs => {
      Object.values(chs).forEach(e => {
        if (e.type !== 'notfound') hasReal = true;
      });
    });
    if (!hasReal) return;

    const nowMs = Date.now();
    const historyPath = `teams/${teamId}/spawn/history`;
    const lastTsPath = `teams/${teamId}/spawn/historyLastTs`;

    runTransaction(ref(db, lastTsPath), (current) => {
      if (current && nowMs - current < 60000) return; // abort — already pushed recently
      return nowMs;
    }).then(({ committed }) => {
      if (!committed) return;

      const convertedRooms: Record<string, any[]> = {};
      let sefCount = 0;
      let genCount = 0;

      Object.entries(spawnData.rooms || {}).forEach(([rid, chs]) => {
        if (!convertedRooms[rid]) convertedRooms[rid] = [];
        Object.entries(chs).forEach(([chKey, entry]: [string, any]) => {
          if (entry.type === 'sef') sefCount++;
          if (entry.type === 'gen') genCount++;
          convertedRooms[rid].push({
            ch: parseInt(chKey.replace('ch', '')),
            type: entry.type,
            dead: !!entry.dead
          });
        });
      });

      const newHistoryRef = push(ref(db, historyPath));
      set(newHistoryRef, {
        ts: nowMs,
        spawnType: spawnData.spawnType || 'simplu',
        rooms: convertedRooms,
        pins: spawnData.pins || null,
        _sefCount: sefCount,
        _genCount: genCount,
        _hiddenCount: Object.keys(spawnData.pins || {}).length
      });
    });
  }, [spawnData, teamId]);

  const clearAllRooms = useCallback(() => {
    pushUndo('Reset All');
    pushSpawnHistory();
    const updates: Record<string, any> = { rooms: null, entries: null, pins: null, chBeaten: null };
    update(ref(db, basePath), updates);
    logActivity('A RESETAT TOATE CAMERELE ȘI CH-URILE (nebătut)');
  }, [basePath, logActivity, pushUndo, pushSpawnHistory]);
  clearAllRoomsRef.current = clearAllRooms;

  const clearSpawnForRespawn = useCallback((cycleKey: string) => {
    if (!spawnData || !basePath) return;
    const cycleRef = ref(db, `${basePath}/_spawnCycle`);
    runTransaction(cycleRef, (current) => {
      if (current && current.key === cycleKey) return; // abort — already handled
      return { key: cycleKey, ts: Date.now() };
    }).then(({ committed, snapshot }) => {
      if (!committed || !snapshot) return;
      const syncedNow = new Date(Date.now() + serverTimeOffset);
      const nextHour = (syncedNow.getUTCHours() + 1) % 24;
      const rule = spawnData.parityRule;
      let nextType: 'simplu' | 'dublu';
      if (rule) {
        const sameParity = (nextHour % 2) === (rule.settledHour % 2);
        nextType = sameParity ? rule.settledType : (rule.settledType === 'dublu' ? 'simplu' : 'dublu');
      } else {
        nextType = spawnData.spawnType === 'dublu' ? 'simplu' : 'dublu';
      }
      pushSpawnHistory();
      const intervalMs = spawnData.anchor?.intervalMs ?? 3600000;
      const newAnchor = { ts: Date.now() + serverTimeOffset, type: nextType, intervalMs };
      const alivePins: Record<string, any> = {};
      if (spawnData.pins) {
        Object.entries(spawnData.pins).forEach(([k, v]: [string, any]) => {
          if (v && v.x) alivePins[k] = v;
        });
      }
      const resetData: Record<string, any> = {
        ...spawnData,
        spawnType: nextType,
        _prevSpawnType: spawnData.spawnType ?? 'simplu',
        rooms: null,
        entries: null,
        chBeaten: null,
        anchor: newAnchor,
        _spawnCycle: { key: cycleKey, ts: snapshot.val()?.ts ?? Date.now() },
        _resetAt: Date.now(),
        _rooms_cleared: true,
        pins: Object.keys(alivePins).length > 0 ? alivePins : null
      };
      delete resetData._spawnTypeChangesAt;
      set(ref(db, basePath), resetData).catch(e => console.warn('[spawn] reset write error:', e));
      logTypeChange(spawnData.spawnType ?? 'simplu', nextType, 'reset_scheduled');
      push(ref(db, 'syslog'), {
        teamId,
        event: 'spawn_auto_reset',
        cycleKey,
        nextType,
        ts: Date.now()
      }).catch(() => {});
    }).catch(e => console.warn('[spawn] clearSpawnForRespawn transaction error:', e));
  }, [spawnData, basePath, teamId, serverTimeOffset, pushSpawnHistory, logTypeChange]);
  clearSpawnForRespawnRef.current = clearSpawnForRespawn;

  const setSpawnType = useCallback((type: 'simplu' | 'dublu') => {
    const prevType = spawnData?.spawnType || 'simplu';
    if (prevType === type) return;
    pushUndo(`Spawn Mode: ${type}`);
    pushSpawnHistory();
    const syncedNow = new Date(Date.now() + serverTimeOffset);
    const nowMs = Date.now() + serverTimeOffset;

    // Parity rule uses the spawn hour (when CH1 fires), not current hour.
    // e.g. user confirms at 7:53 with spawn at 8:15 → settledHour = 8, not 7.
    const ch1Val = spawnData?.chTimes?.['ch1'];
    let ch1DiffSec: number | null = null;
    if (ch1Val) {
      const parts = ch1Val.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const nowInHour = syncedNow.getMinutes() * 60 + syncedNow.getSeconds();
        let d = (parts[0] * 60 + parts[1]) - nowInHour;
        if (d <= 0) d += 3600;
        ch1DiffSec = d;
      }
    }
    const spawnMomentMs = ch1DiffSec !== null && ch1DiffSec > 0
      ? nowMs + ch1DiffSec * 1000
      : nowMs;
    const spawnUtcHour = new Date(spawnMomentMs).getUTCHours();
    const isEven = (spawnUtcHour % 2 === 0);
    const evenHourType = isEven ? type : (type === 'dublu' ? 'simplu' : 'dublu');
    const parityRule = { settledHour: spawnUtcHour, settledType: type };

    // Anchor: start of current cycle
    const intervalMs = spawnData?.anchor?.intervalMs ?? 3600000;
    let cycleStartTs = nowMs;
    if (spawnData?.anchor?.ts) {
      const elapsed = nowMs - spawnData.anchor.ts;
      if (elapsed >= 0) {
        const cyclesSoFar = Math.floor(elapsed / intervalMs);
        cycleStartTs = spawnData.anchor.ts + cyclesSoFar * intervalMs;
      }
    }
    const anchor = { ts: cycleStartTs, type, intervalMs };

    const updates: Record<string, any> = { spawnType: type, evenHourType, parityRule, anchor, _prevSpawnType: null, _resetAt: null, rooms: null, entries: null, pins: null, chBeaten: null };
    update(ref(db, basePath), updates);

    const localSpawnHour = new Date(ch1DiffSec !== null && ch1DiffSec > 0 ? Date.now() + ch1DiffSec * 1000 : Date.now()).getHours();
    const parityLocal = (localSpawnHour % 2 === 0) ? 'pară' : 'impară';
    logTypeChange(prevType, type, 'calibrare_manuala');
    logActivity(`A setat spawnul ${type.toUpperCase()} — spawn ora ${localSpawnHour} (${parityLocal})`);
  }, [basePath, logActivity, pushUndo, spawnData?.spawnType, spawnData?.chTimes, spawnData?.anchor, logTypeChange, pushSpawnHistory, serverTimeOffset]);

  const toggleGenFals = useCallback((ch: number, roomId: string) => {
    pushUndo(`GF ${roomId}`);
    const key = roomId === '18' ? 'gf18' : 'gfF';
    const isNowFalse = !(spawnData?.genFals?.[`ch${ch}`]?.[key]);
    const updates: Record<string, any> = {};
    updates[`genFals/ch${ch}/${key}`] = isNowFalse;
    updates[`gheata/ch${ch}/${key}`] = isNowFalse;
    update(ref(db, basePath), updates);
    logActivity(`A ${isNowFalse ? 'activat' : 'dezactivat'} GEN FALS (${roomId === '18' ? '18' : 'F'}) pe CH${ch}`);
  }, [spawnData, basePath, logActivity, pushUndo]);

  const setMapDot = useCallback((ch: number, x: string, y: string) => { 
    pushUndo(`Pin CH${ch}`);
    set(ref(db, `${basePath}/pins/ch${ch}`), { x, y }); 
    logActivity(`A pus PIN pe hartă pentru CH${ch}`);
  }, [basePath, logActivity, pushUndo]);

  const removePin = useCallback((ch: number) => { 
    pushUndo(`Remove Pin CH${ch}`);
    set(ref(db, `${basePath}/pins/ch${ch}`), null); 
    logActivity(`A ȘTERS PIN-ul de pe hartă pentru CH${ch}`);
  }, [basePath, logActivity, pushUndo]);



  const debugAlertStartRef = useRef<number | null>(null);

  const triggerDebugAlert = useCallback((type: '30s' | '2min') => {
    if (type === '30s') {
      debugAlertStartRef.current = Date.now();
      setActiveAlerts(prev => Array.from(new Set([...prev, 'ch1'])));
      emit('spawn-alert-fired', 'ch1').catch(() => {});
      // Sunetul doar din fereastra principala
      if (!window.location.search.includes('view=')) playSpawnAlarm('30s');
    } else {
      // 2min = doar sonor
      if (!window.location.search.includes('view=')) playSpawnAlarm('2min');
    }
  }, [playSpawnAlarm]);

  const confirmAlert = useCallback(async (ch: string, fromEvent = false) => {
    setActiveAlerts(prev => {
      const next = prev.filter(a => a !== ch);
      // Stop sound only when last alert is cleared
      if (next.length === 0) stopSpawnAlarm();
      return next;
    });
    if (ch === 'ch1') debugAlertStartRef.current = null;
    if (!fromEvent) {
      try { await emit('confirm-spawn-alert', ch); } catch (e) {}
    }
  }, [stopSpawnAlarm]);

  // Sincronizare bidirectionala alerte intre ferestre
  useEffect(() => {
    // Listener: o alerta a fost declansata (de la fereastra principala catre pop-out-uri)
    const unsubFired = listen<string>('spawn-alert-fired', (e) => {
      setActiveAlerts(prev => prev.includes(e.payload) ? prev : [...prev, e.payload]);
    });

    // Listener: o alerta a fost confirmata (de la oricare fereastra)
    const unsubConfirm = listen<string>('confirm-spawn-alert', (e) => {
      confirmAlert(e.payload, true);
    });

    return () => {
      unsubFired.then(f => f());
      unsubConfirm.then(f => f());
    };
  }, [confirmAlert]);

  // Auto-clear alerts when spawn time has passed
  useEffect(() => {
    if (activeAlerts.length === 0) return;
    const inv = setInterval(() => {
      const nowMs = Date.now();
      const nowSynced = new Date(nowMs + serverTimeOffset);
      const nowInHour = nowSynced.getMinutes() * 60 + nowSynced.getSeconds();

      setActiveAlerts(prev => {
        const next = prev.filter(ch => {
          if (ch === 'ch1' && debugAlertStartRef.current !== null) {
            const elapsed = Math.floor((nowMs - debugAlertStartRef.current) / 1000);
            return elapsed < 30;
          }
          const val = spawnData?.chTimes?.[ch];
          if (!val) return true;
          const p = val.split(':').map(n => parseInt(n, 10));
          let d = (p[0] * 60 + p[1]) - nowInHour;
          if (d < 0) d += 3600;
          // Keep alert only while still within alarm window; clears automatically after spawn
          return d > 0 && d <= 35;
        });
        if (next.length === 0 && prev.length > 0) stopSpawnAlarm();
        return next;
      });
    }, 500);

    return () => clearInterval(inv);
  }, [activeAlerts.length, spawnData?.chTimes, serverTimeOffset, stopSpawnAlarm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

  const value = {
    spawnData, history, loading, activeCH, setActiveCH, toast, updateSpawnTime, setNotFound, toggleDead, cycleStatus,
    clearCH, clearRoom, toggleBeaten, toggleGenFals, setMapDot, removePin, setCHTime, clearAllRooms, setSpawnType,
    audioEnabled, setAudioEnabled, globalVolume, setGlobalVolume, spawnVolume, setSpawnVolume, skinVolume, setSkinVolume, pushUndo, undo, showToast,
    activeAlerts, confirmAlert, isHistoryOpen, setIsHistoryOpen, typeHistory,
    serverTimeOffset, logActivity, playSpawnAlarm, triggerDebugAlert
  };

  return <SpawnContext.Provider value={value}>{children}</SpawnContext.Provider>;
};
