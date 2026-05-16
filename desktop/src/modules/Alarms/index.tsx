import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, Clock, RefreshCcw, Plus, Trash2, Pause, Play, ExternalLink, X, Globe, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { savedWindowOptions } from '../../lib/windowMemory';
import { WebviewWindow } from '@tauri-apps/api/window';
import { ref, onValue, set, remove, push, onChildAdded } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types (web-compatible field names) ────────────────────────────────────

export interface Alarm {
  id: string;
  nume: string;
  mesaj: string;
  repeat: 'zilnic' | 'saptamanal' | 'lunar';
  ora: string;
  oraUTC?: string;
  everyN: number;
  weekDays: number[];
  monthDay: number;
  infinit: boolean;
  enabled: boolean;
  lastFired: string | null;
  global?: boolean;
  ownerId?: string;
}

export interface Reminder {
  id: string;
  name: string;
  durationH: number;
  durationM: number;
  startedAt: number;
  paused?: boolean;
  pausedRemainingMs?: number | null;
  global?: boolean;
  ownerId?: string;
}

export interface RepeatTimer {
  id: string;
  name: string;
  totalSeconds: number;
  startedAt: number;
  paused?: boolean;
  pausedRemaining?: number;
}

interface FiredAlarm { name: string; message: string; }

// ─── localStorage ─────────────────────────────────────────────────────────

const LS_ALARMS   = 'm2pro_alarms_v1';
const LS_REMINDER = 'm2pro_reminders_v1';
export const LS_REPEAT = 'm2pro_repeat_timers_v1';
const LS_VOLUME   = 'm2pro_alarm_volume';

function loadAlarms():    Alarm[]   { try { return JSON.parse(localStorage.getItem(LS_ALARMS)   || '[]'); } catch { return []; } }
function loadReminders(): Reminder[] { try { return JSON.parse(localStorage.getItem(LS_REMINDER) || '[]'); } catch { return []; } }
export function loadRepeatTimers(): RepeatTimer[] { try { return JSON.parse(localStorage.getItem(LS_REPEAT) || '[]'); } catch { return []; } }

function _saveAlarms(v: Alarm[])     { localStorage.setItem(LS_ALARMS,   JSON.stringify(v)); }
function _saveReminders(v: Reminder[]){ localStorage.setItem(LS_REMINDER, JSON.stringify(v)); }
export function saveRepeatTimers(v: RepeatTimer[]) { localStorage.setItem(LS_REPEAT, JSON.stringify(v)); }

// ─── UTC helpers (same logic as web) ──────────────────────────────────────

function localToUTC(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function utcToLocal(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function effectiveOra(a: Alarm): string {
  return (a.global && a.oraUTC) ? utcToLocal(a.oraUTC) : (a.ora || '00:00');
}

// ─── Audio ─────────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
function getCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AudioContext();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function getVolume(): number {
  const v = parseFloat(localStorage.getItem(LS_VOLUME) || '0.7');
  return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
}

export function playTick(isLast = false) {
  try {
    const vol = getVolume();
    const audio = new Audio(isLast ? '/sounds/tick-last.mp3' : '/sounds/tick.mp3');
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(() => {});
  } catch {}
}

export function playAlarm() {
  try {
    const ctx = getCtx(); const now = ctx.currentTime; const vol = getVolume();
    [0, 0.28, 0.56].forEach(d => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.5 * vol, now + d); g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.22);
      o.start(now + d); o.stop(now + d + 0.22);
    });
  } catch {}
}

function playAlertSound() {
  try {
    const ctx = getCtx(); const now = ctx.currentTime; const vol = getVolume();
    [0, 0.18, 0.36, 0.54].forEach((d, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = i < 3 ? 1046 : 784;
      g.gain.setValueAtTime(0.4 * vol, now + d); g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.14);
      o.start(now + d); o.stop(now + d + 0.14);
    });
  } catch {}
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

export function fmtRepeat(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function getRepeatRemaining(t: RepeatTimer): number {
  if (t.paused) return Math.max(0, t.pausedRemaining ?? t.totalSeconds);
  return Math.max(0, t.totalSeconds - (Date.now() - t.startedAt) / 1000);
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return '00:00';
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sam'];
const REP_LABELS: Record<string, string> = { zilnic: 'Zilnic', saptamanal: 'Saptamanal', lunar: 'Lunar' };

function alarmNextFire(a: Alarm): Date | null {
  if (!a.enabled) return null;
  const ora = effectiveOra(a);
  const [h, m] = ora.split(':').map(Number);
  const everyN = Math.max(1, a.everyN || 1);
  const now = new Date();
  if (a.repeat === 'zilnic') {
    const c = new Date(now); c.setHours(h, m, 0, 0);
    if (c <= now) c.setDate(c.getDate() + everyN);
    return c;
  }
  if (a.repeat === 'saptamanal') {
    if (!a.weekDays?.length) return null;
    for (let d = 1; d <= 14; d++) {
      const c = new Date(now); c.setHours(h, m, 0, 0); c.setDate(c.getDate() + d);
      if (a.weekDays.includes(c.getDay())) return c;
    }
    return null;
  }
  if (a.repeat === 'lunar') {
    const c = new Date(now); c.setDate(a.monthDay || 1); c.setHours(h, m, 0, 0);
    if (c <= now) { c.setMonth(c.getMonth() + everyN); c.setDate(a.monthDay || 1); }
    return c;
  }
  return null;
}

function alarmNextStr(a: Alarm): string {
  if (!a.enabled) return 'Inactiva';
  const next = alarmNextFire(a);
  if (!next) return '';
  const diff = Math.max(0, Math.floor((next.getTime() - Date.now()) / 1000));
  if (diff < 60) return `~${diff}s`;
  if (diff < 3600) return `~${Math.floor(diff / 60)}m ${diff % 60}s`;
  if (diff < 86400) return `~${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `~${Math.floor(diff / 86400)}z`;
}

const _firedSlots: Record<string, boolean> = {};

function shouldFireAlarm(a: Alarm): boolean {
  if (!a.enabled) return false;
  const ora = effectiveOra(a);
  const [h, m] = ora.split(':').map(Number);
  const now = new Date(); const target = new Date(now); target.setHours(h, m, 0, 0);
  const diffSecs = (now.getTime() - target.getTime()) / 1000;
  if (diffSecs < 0 || diffSecs > 59) return false;
  const slot = `${a.id}_${Math.floor(Date.now() / 60000)}`;
  if (_firedSlots[slot]) return false;
  _firedSlots[slot] = true;
  return true;
}

// ─── Alarm overlay ─────────────────────────────────────────────────────────

function AlarmOverlay({ fired, onDismiss }: { fired: FiredAlarm; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="card max-w-sm w-full mx-4 p-6 border-accent-gold/30 shadow-[0_0_60px_rgba(200,150,46,0.15)] animate-in zoom-in-95">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center">
            <Bell className="w-7 h-7 text-accent-gold animate-pulse" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-100 font-display">{fired.name}</p>
            {fired.message && <p className="text-slate-400 text-sm mt-1">{fired.message}</p>}
          </div>
          <button onClick={onDismiss}
            className="w-full py-2.5 rounded-xl bg-accent-gold text-bg-primary text-sm font-black uppercase tracking-widest hover:bg-accent-gold/90 transition-all">
            OK, am vazut
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — Alarme
// ═══════════════════════════════════════════════════════════════════════════

function AlarmeSection({
  teamId, uid, onFire,
}: { teamId: string | null | undefined; uid: string | undefined; onFire: (a: FiredAlarm) => void }) {
  const [localAlarms, setLocalAlarms] = useState<Alarm[]>(loadAlarms);
  const [fbAlarms, setFbAlarms]       = useState<Record<string, Alarm>>({});
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [fname, setFname]             = useState('');
  const [fmesaj, setFmesaj]           = useState('');
  const [frepeat, setFrepeat]         = useState<Alarm['repeat']>('zilnic');
  const [fora, setFora]               = useState('');
  const [feveryN, setFeveryN]         = useState(1);
  const [fweekDays, setFweekDays]     = useState<number[]>([]);
  const [fmonthDay, setFmonthDay]     = useState(1);
  const [fglobal, setFglobal]         = useState(false);
  const [countdown, setCountdown]     = useState<Record<string, string>>({});

  // Firebase listener
  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/alerte/items`), snap => {
      setFbAlarms(snap.val() ?? {});
    });
  }, [teamId]);

  // Merge local + Firebase (deduplicated by id)
  const alarms = useMemo((): (Alarm & { _readonly?: boolean })[] => {
    const result: (Alarm & { _readonly?: boolean })[] = [...localAlarms];
    Object.values(fbAlarms).forEach(fa => {
      if (!result.find(a => a.id === fa.id)) {
        result.push({ ...fa, _readonly: true });
      } else {
        // Update our local copy with Firebase data (e.g., if edited on web)
        const idx = result.findIndex(a => a.id === fa.id);
        if (idx !== -1 && result[idx].ownerId !== uid) {
          result[idx] = { ...fa, _readonly: true, enabled: result[idx].enabled };
        }
      }
    });
    return result;
  }, [localAlarms, fbAlarms, uid]);

  const persistAlarms = useCallback(async (updated: Alarm[]) => {
    setLocalAlarms(updated);
    _saveAlarms(updated);
    if (!teamId) return;
    // Sync global alarms to Firebase
    for (const a of updated) {
      if (a.global && a.ownerId === uid) {
        const { _readonly, ...clean } = a as any;
        await set(ref(db, `teams/${teamId}/alerte/items/${a.id}`), clean).catch(() => {});
      }
    }
  }, [teamId, uid]);

  // Alarm ticker (every 5s)
  useEffect(() => {
    const id = setInterval(() => {
      // Update countdown displays
      setCountdown(() => {
        const next: Record<string, string> = {};
        alarms.forEach(a => { next[a.id] = alarmNextStr(a); });
        return next;
      });
      // Check local + own global alarms for firing
      alarms.forEach(a => {
        if (a._readonly) return; // team members fire their own alarms only
        if (!shouldFireAlarm(a)) return;
        playAlertSound();
        onFire({ name: a.nume, message: a.mesaj });
        // If global, push ping so other team members also hear it
        if (a.global && teamId) {
          push(ref(db, `teams/${teamId}/alerte/pings`), {
            id: a.id, nome: a.nume, mesaj: a.mesaj,
            firedAt: Date.now(), _sender: uid,
          }).catch(() => {});
        }
      });
    }, 5000);
    return () => clearInterval(id);
  }, [alarms, teamId, uid, onFire]);

  function openForm(alarm?: Alarm & { _readonly?: boolean }) {
    if (alarm) {
      setFname(alarm.nume); setFmesaj(alarm.mesaj); setFrepeat(alarm.repeat);
      setFora(effectiveOra(alarm)); setFeveryN(alarm.everyN);
      setFweekDays(alarm.weekDays || []); setFmonthDay(alarm.monthDay || 1);
      setFglobal(!!alarm.global); setEditId(alarm.id);
    } else {
      setFname(''); setFmesaj(''); setFrepeat('zilnic'); setFora('');
      setFeveryN(1); setFweekDays([]); setFmonthDay(1); setFglobal(false); setEditId(null);
    }
    setShowForm(true);
  }

  async function submitForm() {
    if (!fname.trim() || !fora) return;
    const isGlobal = fglobal;
    const obj: Alarm = {
      id: editId || `al_${Date.now()}`,
      nume: fname.trim(), mesaj: fmesaj.trim(), repeat: frepeat, ora: fora,
      everyN: feveryN, weekDays: fweekDays, monthDay: fmonthDay,
      infinit: true, enabled: true, lastFired: null,
      global: isGlobal, ownerId: uid,
      ...(isGlobal && fora ? { oraUTC: localToUTC(fora) } : {}),
    };
    const wasGlobal = editId ? alarms.find(a => a.id === editId)?.global : false;
    const updated = editId
      ? localAlarms.map(a => a.id === editId ? { ...obj, lastFired: a.lastFired } : a)
      : [...localAlarms, obj];

    await persistAlarms(updated);

    // If was global but now local, remove from Firebase
    if (wasGlobal && !isGlobal && teamId && editId) {
      await remove(ref(db, `teams/${teamId}/alerte/items/${editId}`)).catch(() => {});
    }
    setShowForm(false);
  }

  async function deleteAlarm(id: string) {
    const alarm = alarms.find(a => a.id === id);
    const updated = localAlarms.filter(a => a.id !== id);
    _saveAlarms(updated); setLocalAlarms(updated);
    if (alarm?.global && teamId && alarm.ownerId === uid) {
      await remove(ref(db, `teams/${teamId}/alerte/items/${id}`)).catch(() => {});
    }
  }

  function toggleEnabled(id: string) {
    const updated = localAlarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
    // For team alarms not in local list, add them with toggled state
    if (!updated.find(a => a.id === id)) {
      const fa = fbAlarms[id];
      if (fa) updated.push({ ...fa, enabled: false });
    }
    _saveAlarms(updated); setLocalAlarms(updated);
  }

  function toggleDay(d: number) {
    setFweekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <Bell className="w-5 h-5 text-accent-gold" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Alarme</h3>
            <p className="text-slate-500 text-xs">Se declanseaza la ora stabilita</p>
          </div>
        </div>
        <button onClick={() => showForm ? setShowForm(false) : openForm()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-sm font-medium hover:bg-white/[0.06] transition-all">
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Anuleaza' : 'Adauga'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 p-4 rounded-xl bg-bg-secondary border border-white/5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">{editId ? 'Editeaza' : 'Alarma Noua'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nume</p>
              <input value={fname} onChange={e => setFname(e.target.value)} placeholder="ex: Hydra"
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-accent-gold/30" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Mesaj (optional)</p>
              <input value={fmesaj} onChange={e => setFmesaj(e.target.value)} placeholder="ex: Timpul a trecut!"
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-accent-gold/30" />
            </div>
          </div>
          <div className="flex gap-2">
            {(['zilnic', 'saptamanal', 'lunar'] as const).map(r => (
              <button key={r} onClick={() => setFrepeat(r)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all',
                  frepeat === r ? 'bg-accent-gold text-bg-primary' : 'bg-bg-primary border border-white/5 text-slate-400 hover:text-slate-100')}>
                {REP_LABELS[r]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ora</p>
              <input type="time" value={fora} onChange={e => setFora(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-accent-gold/30" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                {frepeat === 'lunar' ? 'Ziua din luna' : 'La fiecare N'}
              </p>
              <input type="number" min="1" max={frepeat === 'lunar' ? 31 : 52}
                value={frepeat === 'lunar' ? fmonthDay : feveryN}
                onChange={e => frepeat === 'lunar' ? setFmonthDay(parseInt(e.target.value) || 1) : setFeveryN(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm text-center focus:outline-none focus:border-accent-gold/30" />
            </div>
          </div>
          {frepeat === 'saptamanal' && (
            <div className="flex gap-1.5 flex-wrap">
              {[1,2,3,4,5,6,0].map(d => (
                <button key={d} onClick={() => toggleDay(d)}
                  className={cn('px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
                    fweekDays.includes(d) ? 'bg-accent-gold text-bg-primary' : 'bg-bg-primary border border-white/5 text-slate-400 hover:text-slate-100')}>
                  {DAY_NAMES[d]}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <div onClick={() => setFglobal(v => !v)}
              className={cn('w-9 h-5 rounded-full border transition-all', fglobal ? 'bg-accent-gold/20 border-accent-gold/40' : 'bg-bg-primary border-white/10')}>
              <div className={cn('w-3.5 h-3.5 rounded-full m-0.5 transition-all', fglobal ? 'translate-x-4 bg-accent-gold' : 'bg-slate-600')} />
            </div>
            <Globe className={cn('w-3.5 h-3.5', fglobal ? 'text-accent-gold' : 'text-slate-600')} />
            <span className={cn('text-xs font-bold', fglobal ? 'text-accent-gold' : 'text-slate-500')}>
              Global — apare la toti membrii echipei
            </span>
          </label>
          <div className="flex justify-end">
            <button onClick={submitForm}
              className="px-5 py-2 rounded-xl bg-accent-gold text-bg-primary text-sm font-black uppercase tracking-widest hover:bg-accent-gold/90 transition-all">
              Salveaza
            </button>
          </div>
        </div>
      )}

      {alarms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 border border-dashed border-white/5 rounded-xl">
          <Bell className="w-7 h-7 text-slate-700" />
          <p className="text-slate-600 text-sm">Nicio alarma. Apasa Adauga.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alarms.map(a => {
            const isOwn = !a._readonly || a.ownerId === uid;
            return (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-white/5">
                <button onClick={() => toggleEnabled(a.id)}
                  className={cn('w-8 h-8 rounded-lg border flex items-center justify-center transition-all shrink-0',
                    a.enabled ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold' : 'bg-bg-primary border-white/5 text-slate-600')}>
                  <Bell className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-slate-100 truncate">{a.nume}</p>
                    {a.global && <Globe className="w-3 h-3 text-accent-gold/60 shrink-0" />}
                    {a._readonly && <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded shrink-0">echipa</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{effectiveOra(a)} · {REP_LABELS[a.repeat]}</p>
                </div>
                <span className={cn('text-[10px] font-bold shrink-0', a.enabled ? 'text-slate-400' : 'text-slate-700')}>
                  {countdown[a.id] ?? alarmNextStr(a)}
                </span>
                {isOwn && (
                  <>
                    <button onClick={() => openForm(a)} className="text-slate-600 hover:text-slate-300 transition-colors p-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => deleteAlarm(a.id)} className="text-slate-700 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Remindere
// ═══════════════════════════════════════════════════════════════════════════

function RemindereSection({
  teamId, uid, onFire,
}: { teamId: string | null | undefined; uid: string | undefined; onFire: (a: FiredAlarm) => void }) {
  const [localReminders, setLocalReminders] = useState<Reminder[]>(loadReminders);
  const [fbReminders, setFbReminders]       = useState<Record<string, Reminder>>({});
  const [showForm, setShowForm]             = useState(false);
  const [editId, setEditId]                 = useState<string | null>(null);
  const [fname, setFname]                   = useState('');
  const [fdH, setFdH]                       = useState(0);
  const [fdM, setFdM]                       = useState(5);
  const [fglobal, setFglobal]               = useState(false);
  const [tick, setTick]                     = useState(0);

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/alerte/reminders`), snap => {
      setFbReminders(snap.val() ?? {});
    });
  }, [teamId]);

  const reminders = useMemo((): (Reminder & { _readonly?: boolean })[] => {
    const result: (Reminder & { _readonly?: boolean })[] = [...localReminders];
    Object.values(fbReminders).forEach(fr => {
      if (!result.find(r => r.id === fr.id)) {
        result.push({ ...fr, _readonly: true });
      } else if (fr.global) {
        // Keep Firebase startedAt/paused in sync for global reminders
        const idx = result.findIndex(r => r.id === fr.id);
        if (idx !== -1 && result[idx].ownerId !== uid) {
          result[idx] = { ...fr, _readonly: true };
        } else if (idx !== -1 && result[idx].global) {
          // Own global reminder: trust local state for enabled, but sync timing from Firebase
          result[idx] = { ...fr, ownerId: result[idx].ownerId };
        }
      }
    });
    return result;
  }, [localReminders, fbReminders, uid]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    reminders.forEach(r => {
      if (r._readonly || r.paused) return;
      const ms = getReminderMs(r);
      if (ms <= 0) {
        const key = `rm_${r.id}_done_${Math.floor(Date.now() / 60000)}`;
        if (!_firedSlots[key]) {
          _firedSlots[key] = true;
          playAlertSound();
          onFire({ name: r.name, message: 'Reminder finalizat!' });
          if (r.global && teamId) {
            push(ref(db, `teams/${teamId}/alerte/pings`), {
              id: r.id, nome: r.name, mesaj: 'Reminder finalizat!',
              firedAt: Date.now(), _sender: uid,
            }).catch(() => {});
          }
        }
      }
    });
  }, [tick, reminders, teamId, uid, onFire]);

  function getReminderMs(r: Reminder): number {
    if (r.paused) return r.pausedRemainingMs ?? 0;
    const total = (r.durationH * 3600 + r.durationM * 60) * 1000;
    return total - (Date.now() - r.startedAt);
  }

  const persistReminders = useCallback(async (updated: Reminder[]) => {
    setLocalReminders(updated);
    _saveReminders(updated);
    if (!teamId) return;
    for (const r of updated) {
      if (r.global && r.ownerId === uid) {
        const { _readonly, ...clean } = r as any;
        await set(ref(db, `teams/${teamId}/alerte/reminders/${r.id}`), clean).catch(() => {});
      }
    }
  }, [teamId, uid]);

  function openForm(rem?: Reminder) {
    if (rem) {
      setFname(rem.name); setFdH(rem.durationH); setFdM(rem.durationM);
      setFglobal(!!rem.global); setEditId(rem.id);
    } else {
      setFname(''); setFdH(0); setFdM(5); setFglobal(false); setEditId(null);
    }
    setShowForm(true);
  }

  async function submitForm() {
    if (!fname.trim() || (fdH <= 0 && fdM <= 0)) return;
    const obj: Reminder = {
      id: editId || `rm_${Date.now()}`,
      name: fname.trim(), durationH: fdH, durationM: fdM,
      startedAt: Date.now(), paused: false, pausedRemainingMs: null,
      global: fglobal, ownerId: uid,
    };
    const wasGlobal = editId ? localReminders.find(r => r.id === editId)?.global : false;
    const updated = editId ? localReminders.map(r => r.id === editId ? obj : r) : [...localReminders, obj];
    await persistReminders(updated);
    if (wasGlobal && !fglobal && teamId && editId) {
      await remove(ref(db, `teams/${teamId}/alerte/reminders/${editId}`)).catch(() => {});
    }
    setShowForm(false);
  }

  async function deleteReminder(id: string) {
    const rem = reminders.find(r => r.id === id);
    const updated = localReminders.filter(r => r.id !== id);
    _saveReminders(updated); setLocalReminders(updated);
    if (rem?.global && teamId && rem.ownerId === uid) {
      await remove(ref(db, `teams/${teamId}/alerte/reminders/${id}`)).catch(() => {});
    }
  }

  async function pauseResume(id: string) {
    const updated = localReminders.map(r => {
      if (r.id !== id) return r;
      if (r.paused) {
        const totalMs = (r.durationH * 3600 + r.durationM * 60) * 1000;
        return { ...r, startedAt: Date.now() - (totalMs - (r.pausedRemainingMs ?? 0)), paused: false, pausedRemainingMs: null };
      }
      return { ...r, paused: true, pausedRemainingMs: Math.max(0, getReminderMs(r)) };
    });
    await persistReminders(updated);
  }

  async function reset(id: string) {
    const updated = localReminders.map(r => r.id === id ? { ...r, startedAt: Date.now(), paused: false, pausedRemainingMs: null } : r);
    delete _firedSlots[`rm_${id}_done`];
    await persistReminders(updated);
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Clock className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Remindere</h3>
            <p className="text-slate-500 text-xs">Countdown cu pauza si reset</p>
          </div>
        </div>
        <button onClick={() => showForm ? setShowForm(false) : openForm()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-sm font-medium hover:bg-white/[0.06] transition-all">
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Anuleaza' : 'Adauga'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 p-4 rounded-xl bg-bg-secondary border border-white/5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">{editId ? 'Editeaza' : 'Reminder Nou'}</p>
          <input value={fname} onChange={e => setFname(e.target.value)} placeholder="Nume reminder"
            className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-blue-500/30" />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ore</p>
              <input type="number" min="0" max="23" value={fdH} onChange={e => setFdH(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm text-center focus:outline-none focus:border-blue-500/30" />
            </div>
            <span className="text-slate-600 font-bold mt-5">:</span>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Minute</p>
              <input type="number" min="0" max="59" value={fdM} onChange={e => setFdM(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm text-center focus:outline-none focus:border-blue-500/30" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
            <div onClick={() => setFglobal(v => !v)}
              className={cn('w-9 h-5 rounded-full border transition-all', fglobal ? 'bg-blue-500/20 border-blue-500/40' : 'bg-bg-primary border-white/10')}>
              <div className={cn('w-3.5 h-3.5 rounded-full m-0.5 transition-all', fglobal ? 'translate-x-4 bg-blue-400' : 'bg-slate-600')} />
            </div>
            <Globe className={cn('w-3.5 h-3.5', fglobal ? 'text-blue-400' : 'text-slate-600')} />
            <span className={cn('text-xs font-bold', fglobal ? 'text-blue-400' : 'text-slate-500')}>Global — vizibil echipei</span>
          </label>
          <div className="flex justify-end">
            <button onClick={submitForm}
              className="px-5 py-2 rounded-xl bg-blue-500 text-white text-sm font-black uppercase tracking-widest hover:bg-blue-400 transition-all">
              Salveaza
            </button>
          </div>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 border border-dashed border-white/5 rounded-xl">
          <Clock className="w-7 h-7 text-slate-700" />
          <p className="text-slate-600 text-sm">Niciun reminder. Apasa Adauga.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map(r => {
            const ms = getReminderMs(r);
            const total = (r.durationH * 3600 + r.durationM * 60) * 1000;
            const pct = total > 0 ? Math.max(0, Math.min(100, ms / total * 100)) : 0;
            const done = ms <= 0;
            const isOwn = !r._readonly || r.ownerId === uid;
            return (
              <div key={r.id} className={cn('p-3 rounded-xl border transition-all', done ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-bg-secondary border-white/5')}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-slate-100 truncate">{r.name}</p>
                      {r.global && <Globe className="w-3 h-3 text-blue-400/60 shrink-0" />}
                      {r._readonly && <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded shrink-0">echipa</span>}
                    </div>
                    <p className="text-xs text-slate-500">{r.durationH > 0 ? `${r.durationH}h ` : ''}{r.durationM}min</p>
                  </div>
                  {done ? (
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Finalizat</span>
                  ) : (
                    <span className={cn('text-base font-black tabular-nums font-display', r.paused ? 'text-slate-500' : 'text-slate-100')}>
                      {fmtCountdown(ms)}
                    </span>
                  )}
                  {isOwn && !done && (
                    <button onClick={() => pauseResume(r.id)} className="text-slate-500 hover:text-slate-200 transition-colors p-1">
                      {r.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {isOwn && (
                    <button onClick={() => reset(r.id)} className="text-slate-500 hover:text-slate-200 transition-colors p-1">
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isOwn && (
                    <>
                      <button onClick={() => openForm(r)} className="text-slate-600 hover:text-slate-300 transition-colors p-1">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => deleteReminder(r.id)} className="text-slate-700 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
                {!done && (
                  <div className="mt-2 h-1 rounded-full bg-bg-primary overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-1000', r.paused ? 'bg-slate-600' : 'bg-blue-500')}
                      style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — Timere Repetitive (local only)
// ═══════════════════════════════════════════════════════════════════════════

function RepeatTimerCard({ timer, onDelete }: { timer: RepeatTimer; onDelete: () => void }) {
  const [tick, setTick] = useState(0);
  const lastTickSec = useRef(-1);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const remaining = getRepeatRemaining(timer);
    const secs = Math.ceil(remaining);
    if (!timer.paused && remaining > 0 && remaining <= 3 && secs !== lastTickSec.current) {
      lastTickSec.current = secs; playTick(secs === 1);
    }
    if (!timer.paused && remaining <= 0) {
      playAlarm(); lastTickSec.current = -1;
      const timers = loadRepeatTimers().map(t => t.id === timer.id ? { ...t, startedAt: Date.now(), paused: false, pausedRemaining: undefined } : t);
      saveRepeatTimers(timers);
    }
  }, [tick, timer]);

  function pauseResume() {
    const timers = loadRepeatTimers().map(t => {
      if (t.id !== timer.id) return t;
      if (t.paused) {
        const rem = t.pausedRemaining ?? t.totalSeconds;
        return { ...t, paused: false, startedAt: Date.now() - (t.totalSeconds - rem) * 1000, pausedRemaining: undefined };
      }
      return { ...t, paused: true, pausedRemaining: getRepeatRemaining(t) };
    });
    saveRepeatTimers(timers);
  }

  const remaining = getRepeatRemaining(timer);
  const pct = (remaining / timer.totalSeconds) * 100;
  const isUrgent = remaining <= 3 && remaining > 0;

  async function openPopout() {
    try {
      const existing = WebviewWindow.getByLabel(`rt-popout-${timer.id}`);
      if (existing) { await (existing as any).setFocus(); return; }
    } catch {}
    { const geo = savedWindowOptions(`rt-popout-${timer.id}`);
      new WebviewWindow(`rt-popout-${timer.id}`, {
        url: `/?view=repeat-timer&timerId=${timer.id}`,
        title: timer.name, alwaysOnTop: true, decorations: false, resizable: true,
        width: geo.width ?? 200, height: geo.height ?? 115,
        ...(geo.x !== undefined ? { x: geo.x, y: geo.y, center: false } : { center: true }),
      });
    }
  }

  return (
    <div className={cn('p-4 rounded-xl border transition-all', isUrgent && !timer.paused ? 'bg-red-500/5 border-red-500/20' : 'bg-bg-secondary border-white/5')}>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{timer.name}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{fmtRepeat(timer.totalSeconds)} · Repetitiv</p>
        </div>
        <button onClick={openPopout} title="Pop-out always-on-top"
          className="p-1.5 rounded-lg text-slate-600 hover:text-accent-gold hover:bg-accent-gold/5 transition-all">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/5 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-end justify-between gap-3 mb-2">
        <span className={cn('text-3xl font-black tabular-nums font-display leading-none transition-colors',
          timer.paused ? 'text-slate-500' : isUrgent ? 'text-red-400' : 'text-slate-100')}>
          {fmtRepeat(Math.ceil(remaining))}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={pauseResume}
            className={cn('flex items-center justify-center w-8 h-8 rounded-lg border transition-all',
              timer.paused
                ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold hover:bg-accent-gold/20'
                : 'bg-white/[0.04] border-white/[0.07] text-slate-400 hover:bg-white/[0.07] hover:text-slate-100')}>
            {timer.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
          <button onClick={() => { lastTickSec.current = -1; saveRepeatTimers(loadRepeatTimers().map(t => t.id === timer.id ? { ...t, startedAt: Date.now(), paused: false, pausedRemaining: undefined } : t)); }}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] text-slate-400 hover:bg-white/[0.07] hover:text-slate-100 transition-all">
            <RefreshCcw className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-250', isUrgent ? 'bg-red-400' : 'bg-accent-gold')}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RepeatTimerSection() {
  const [timers, setTimers] = useState<RepeatTimer[]>(loadRepeatTimers);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [dH, setDH] = useState(0);
  const [dM, setDM] = useState(0);
  const [dS, setDS] = useState(30);

  useEffect(() => {
    const id = setInterval(() => setTimers(loadRepeatTimers()), 500);
    return () => clearInterval(id);
  }, []);

  function addTimer() {
    const total = dH * 3600 + dM * 60 + dS;
    if (!name.trim() || total <= 0) return;
    const updated = [...timers, { id: `rt-${Date.now()}`, name: name.trim(), totalSeconds: total, startedAt: Date.now() }];
    setTimers(updated); saveRepeatTimers(updated);
    setName(''); setDH(0); setDM(0); setDS(30); setShowForm(false);
  }

  function deleteTimer(id: string) {
    const updated = timers.filter(t => t.id !== id);
    setTimers(updated); saveRepeatTimers(updated);
  }

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <RefreshCcw className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Timere Repetitive</h3>
            <p className="text-slate-500 text-xs">Auto-reset · 3-2-1 · Pop-out</p>
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-sm font-medium hover:bg-white/[0.06] transition-all">
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Anuleaza' : 'Adauga'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-4 p-4 rounded-xl bg-bg-secondary border border-white/5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nume timer (ex: Cercuri Alastor)"
            className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-red-500/30" />
          <div className="flex items-center gap-2">
            {[{ label: 'ore', val: dH, set: setDH, max: 23 }, { label: 'min', val: dM, set: setDM, max: 59 }, { label: 'sec', val: dS, set: setDS, max: 59 }].map((f, i) => (
              <div key={i} className="flex-1 text-center">
                <input type="number" min="0" max={f.max} value={f.val} onChange={e => f.set(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-white/5 text-slate-100 text-sm text-center focus:outline-none focus:border-red-500/30" />
                <p className="text-[9px] text-slate-600 mt-1">{f.label}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={addTimer}
              className="px-5 py-2 rounded-xl bg-red-500 text-white text-sm font-black uppercase tracking-widest hover:bg-red-400 transition-all">
              Creeaza
            </button>
          </div>
        </div>
      )}

      {timers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 border border-dashed border-white/5 rounded-xl">
          <RefreshCcw className="w-7 h-7 text-slate-700" />
          <p className="text-slate-600 text-sm">Niciun timer repetitiv.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timers.map(t => <RepeatTimerCard key={t.id} timer={t} onDelete={() => deleteTimer(t.id)} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT — listens to Firebase pings (global alarm fires from team members)
// ═══════════════════════════════════════════════════════════════════════════

export default function Alarms() {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const uid = user?.uid;
  const [firedAlarm, setFiredAlarm] = useState<FiredAlarm | null>(null);
  const seenPings = useRef<Set<string>>(new Set());
  const [volume, setVolume] = useState(() => getVolume());

  function handleVolumeChange(val: number) {
    setVolume(val);
    localStorage.setItem(LS_VOLUME, String(val));
  }

  function previewTicks() {
    playTick(false);
    setTimeout(() => playTick(false), 1000);
    setTimeout(() => playTick(true),  2000);
  }

  // Listen for pings from other team members
  useEffect(() => {
    if (!teamId) return;
    return onChildAdded(ref(db, `teams/${teamId}/alerte/pings`), snap => {
      const ping = snap.val();
      if (!ping || ping._sender === uid) return;
      if (seenPings.current.has(snap.key!)) return;
      seenPings.current.add(snap.key!);
      if (Date.now() - ping.firedAt > 60000) return; // ignore stale pings
      playAlertSound();
      setFiredAlarm({ name: ping.nome || ping.name || 'Alerta', message: ping.mesaj || '' });
    });
  }, [teamId, uid]);

  return (
    <div className="space-y-6 animate-in max-w-2xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Alarme & Remindere</h2>
          <p className="text-slate-400 text-sm mt-1">Alarme programate, countdown-uri si timere repetitive. Cele globale se sincronizeaza cu toti membrii echipei.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <Volume2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            type="range" min="0" max="100" value={Math.round(volume * 100)}
            onChange={e => handleVolumeChange(parseInt(e.target.value) / 100)}
            className="w-20 h-1 accent-amber-500 cursor-pointer"
          />
          <span className="text-[10px] font-black text-slate-600 w-7 tabular-nums">{Math.round(volume * 100)}%</span>
          {([['3-2-1', previewTicks], ['Alarma', playAlarm], ['Alerta', playAlertSound]] as [string, () => void][]).map(([label, fn]) => (
            <button key={label} onClick={fn}
              className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.06] hover:text-slate-300 transition-all">
              {label}
            </button>
          ))}
        </div>
      </header>

      <AlarmeSection teamId={teamId} uid={uid} onFire={setFiredAlarm} />
      <RemindereSection teamId={teamId} uid={uid} onFire={setFiredAlarm} />
      <RepeatTimerSection />

      {firedAlarm && <AlarmOverlay fired={firedAlarm} onDismiss={() => setFiredAlarm(null)} />}
    </div>
  );
}
