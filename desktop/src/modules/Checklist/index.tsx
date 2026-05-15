import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, Circle, Plus, Trash2, RefreshCw, Layers, Bell, X } from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface Reminder {
  type: 'none' | 'daily' | 'weekly' | 'monthly';
  time?: string;
  weekday?: number;
  monthDay?: number;
  lastFiredKey?: string | null;
}

interface Task {
  id: string;
  name: string;
  done: boolean;
}

interface ChecklistItem {
  id: string;
  name: string;
  tasks: Task[];
  reminder?: Reminder;
}

const WEEKDAYS = ['Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata'];
const BANNER_MS = 15000;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function getReminderKey(r: Reminder, d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  if (r.type === 'daily') return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
  if (r.type === 'weekly') {
    const wk = Math.ceil(((d.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + new Date(y, 0, 1).getDay() + 1) / 7);
    return `${y}-W${wk}`;
  }
  if (r.type === 'monthly') return `${y}-${m < 10 ? '0' : ''}${m}`;
  return '';
}

function shouldFire(r: Reminder | undefined, now: Date): boolean {
  if (!r || r.type === 'none' || !r.time) return false;
  const [h, m] = r.time.split(':').map(Number);
  if (now.getHours() !== h || now.getMinutes() !== m) return false;
  if (r.type === 'weekly' && now.getDay() !== (r.weekday ?? 1)) return false;
  if (r.type === 'monthly' && now.getDate() !== (r.monthDay ?? 1)) return false;
  return getReminderKey(r, now) !== (r.lastFiredKey ?? null);
}

export default function Checklist() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ChecklistItem[]>([]);
  const [openReminderFor, setOpenReminderFor] = useState<string | null>(null);
  const [reminderForm, setReminderForm] = useState<Reminder>({ type: 'none', time: '09:00', weekday: 1, monthDay: 1 });
  const [firedBanner, setFiredBanner] = useState<ChecklistItem | null>(null);
  const [bannerProgress, setBannerProgress] = useState(100);

  const listsRef = useRef<ChecklistItem[]>([]);
  const userRef = useRef(user);
  const bannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { listsRef.current = lists; }, [lists]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Firebase sync
  useEffect(() => {
    const teamId = user?.teamId;
    if (!teamId) return;
    const dataRef = ref(db, `teams/${teamId}/checklists/data`);
    const unsub = onValue(dataRef, (snap) => {
      try {
        const raw = snap.val();
        const parsed: ChecklistItem[] = raw ? JSON.parse(raw) : [];
        setLists(Array.isArray(parsed) ? parsed : []);
      } catch {
        setLists([]);
      }
    });
    return () => unsub();
  }, [user?.teamId]);

  // Stable save — reads from ref to avoid stale closure in interval
  const save = useCallback((data: ChecklistItem[]) => {
    const teamId = userRef.current?.teamId;
    if (!teamId) return;
    setLists(data);
    set(ref(db, `teams/${teamId}/checklists/data`), JSON.stringify(data)).catch(console.error);
  }, []);

  // Reminder banner logic
  const fireBanner = useCallback((cl: ChecklistItem) => {
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    setFiredBanner(cl);
    setBannerProgress(100);
    const start = Date.now();
    bannerTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setBannerProgress(Math.max(0, 100 - (elapsed / BANNER_MS) * 100));
      if (elapsed >= BANNER_MS) {
        clearInterval(bannerTimerRef.current!);
        bannerTimerRef.current = null;
        setFiredBanner(null);
      }
    }, 80);
  }, []);

  const dismissBanner = () => {
    if (bannerTimerRef.current) { clearInterval(bannerTimerRef.current); bannerTimerRef.current = null; }
    setFiredBanner(null);
  };

  // Reminder checker — every 30s, uses refs to avoid stale closure
  useEffect(() => {
    const check = () => {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
      let changed = false;
      const updated = listsRef.current.map(list => {
        if (!shouldFire(list.reminder, now)) return list;
        changed = true;
        fireBanner(list);
        return {
          ...list,
          tasks: list.tasks.map(t => ({ ...t, done: false })),
          reminder: { ...list.reminder!, lastFiredKey: getReminderKey(list.reminder!, now) }
        };
      });
      if (changed) save(updated);
    };

    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [save, fireBanner]);

  // ── CRUD ──────────────────────────────────────────────────────────────

  const addChecklist = () => {
    save([...listsRef.current, { id: genId(), name: 'Checklist nou', tasks: [] }]);
  };

  const deleteChecklist = (listId: string) => {
    if (openReminderFor === listId) setOpenReminderFor(null);
    save(listsRef.current.filter(l => l.id !== listId));
  };

  const renameChecklist = (listId: string, name: string) => {
    const trimmed = name.trim() || 'Checklist';
    const current = listsRef.current.find(l => l.id === listId);
    if (!current || current.name === trimmed) return;
    save(listsRef.current.map(l => l.id === listId ? { ...l, name: trimmed } : l));
  };

  const resetChecklist = (listId: string) => {
    save(listsRef.current.map(l =>
      l.id === listId ? { ...l, tasks: l.tasks.map(t => ({ ...t, done: false })) } : l
    ));
  };

  const addTask = (listId: string) => {
    save(listsRef.current.map(l =>
      l.id === listId ? { ...l, tasks: [...l.tasks, { id: genId(), name: 'Task nou', done: false }] } : l
    ));
  };

  const deleteTask = (listId: string, taskId: string) => {
    save(listsRef.current.map(l =>
      l.id === listId ? { ...l, tasks: l.tasks.filter(t => t.id !== taskId) } : l
    ));
  };

  const toggleTask = (listId: string, taskId: string) => {
    save(listsRef.current.map(l =>
      l.id === listId
        ? { ...l, tasks: l.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
        : l
    ));
  };

  const renameTask = (listId: string, taskId: string, name: string) => {
    const trimmed = name.trim() || 'Task';
    const list = listsRef.current.find(l => l.id === listId);
    const task = list?.tasks.find(t => t.id === taskId);
    if (!task || task.name === trimmed) return;
    save(listsRef.current.map(l =>
      l.id === listId
        ? { ...l, tasks: l.tasks.map(t => t.id === taskId ? { ...t, name: trimmed } : t) }
        : l
    ));
  };

  const openReminder = (listId: string) => {
    if (openReminderFor === listId) { setOpenReminderFor(null); return; }
    const r = listsRef.current.find(l => l.id === listId)?.reminder;
    setReminderForm({
      type: r?.type || 'none',
      time: r?.time || '09:00',
      weekday: r?.weekday ?? 1,
      monthDay: r?.monthDay ?? 1,
      lastFiredKey: r?.lastFiredKey ?? null,
    });
    setOpenReminderFor(listId);
  };

  const saveReminder = (listId: string) => {
    const prev = listsRef.current.find(l => l.id === listId)?.reminder;
    save(listsRef.current.map(l =>
      l.id === listId
        ? { ...l, reminder: { ...reminderForm, lastFiredKey: prev?.lastFiredKey ?? null } }
        : l
    ));
    setOpenReminderFor(null);
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (!user?.teamId) {
    return <div className="py-20 text-center text-slate-500 text-sm">Nu ești în nicio echipă.</div>;
  }

  return (
    <div className="space-y-10 animate-in">
      {/* Reminder fired banner */}
      {firedBanner && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#111] border border-accent-gold/30 rounded-2xl shadow-2xl shadow-accent-gold/10 overflow-hidden">
          <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent-gold/10 border border-accent-gold/20 shrink-0">
                <Bell className="w-4 h-4 text-accent-gold" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-black tracking-widest text-slate-500 mb-0.5">Reminder</p>
                <p className="text-sm font-bold text-white">{firedBanner.name}</p>
              </div>
            </div>
            <button
              onClick={dismissBanner}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-0.5 bg-white/5">
            <div
              className="h-full bg-accent-gold/60 transition-none"
              style={{ width: `${bannerProgress}%` }}
            />
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Checklist Echipă</h2>
          <p className="text-slate-400 text-sm mt-1">Taskuri sincronizate în timp real cu toată echipa.</p>
        </div>
        <button onClick={addChecklist} className="btn-primary flex items-center gap-2 self-start">
          <Plus className="w-4 h-4" /> Checklist Nou
        </button>
      </header>

      {lists.length === 0 ? (
        <div className="py-20 text-center">
          <Layers className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Niciun checklist. Apasă "Checklist Nou" pentru a începe.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {lists.map((list) => {
            const total = list.tasks.length;
            const done = list.tasks.filter(t => t.done).length;
            const allDone = total > 0 && done === total;
            const progress = total > 0 ? (done / total) * 100 : 0;
            const hasReminder = !!(list.reminder && list.reminder.type !== 'none');
            const isReminderOpen = openReminderFor === list.id;
            const rf = reminderForm;

            return (
              <div key={list.id} className="card p-0 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-5 flex items-center gap-3 bg-white/[0.01] border-b border-white/[0.03]">
                  <div className={cn(
                    "p-2 rounded-lg border shrink-0",
                    allDone ? "bg-emerald-500/10 border-emerald-500/20" : "bg-accent-gold/10 border-accent-gold/20"
                  )}>
                    <Layers className={cn("w-4 h-4", allDone ? "text-emerald-400" : "text-accent-gold")} />
                  </div>
                  <input
                    type="text"
                    defaultValue={list.name}
                    key={list.id + list.name}
                    onBlur={(e) => renameChecklist(list.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className="font-bold text-slate-100 bg-transparent border-none outline-none flex-1 min-w-0 focus:ring-0"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {total > 0 && <span className={cn("text-[10px] font-black mr-1", allDone ? "text-emerald-400" : "text-slate-600")}>{done}/{total}</span>}
                    <button
                      onClick={() => openReminder(list.id)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        hasReminder
                          ? "text-accent-gold bg-accent-gold/10 hover:bg-accent-gold/20"
                          : "text-slate-600 hover:bg-white/5 hover:text-slate-400"
                      )}
                      title="Reminder"
                    >
                      <Bell className="w-4 h-4" />
                    </button>
                    {total > 0 && done > 0 && (
                      <button
                        onClick={() => resetChecklist(list.id)}
                        className="p-2 rounded-lg hover:bg-white/5 text-slate-600 hover:text-accent-gold transition-colors"
                        title="Reset"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteChecklist(list.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-colors"
                      title="Șterge"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Reminder panel */}
                {isReminderOpen && (
                  <div className="border-b border-white/[0.03] bg-white/[0.01] px-5 py-4 space-y-3">
                    {/* Type selector */}
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 w-20 shrink-0">Repetare</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {(['none', 'daily', 'weekly', 'monthly'] as const).map(t => {
                          const labels = { none: 'Niciodata', daily: 'Zilnic', weekly: 'Saptamanal', monthly: 'Lunar' };
                          return (
                            <button
                              key={t}
                              onClick={() => setReminderForm(f => ({ ...f, type: t }))}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
                                rf.type === t
                                  ? 'bg-accent-gold text-bg-primary border-accent-gold'
                                  : 'bg-white/[0.03] border-white/10 text-slate-500 hover:text-white hover:border-white/20'
                              )}
                            >
                              {labels[t]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time */}
                    {rf.type !== 'none' && (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 w-20 shrink-0">Ora</span>
                        <input
                          type="time"
                          value={rf.time || '09:00'}
                          onChange={e => setReminderForm(f => ({ ...f, time: e.target.value }))}
                          className="bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-gold/40"
                        />
                      </div>
                    )}

                    {/* Weekday */}
                    {rf.type === 'weekly' && (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 w-20 shrink-0">Ziua</span>
                        <select
                          value={rf.weekday ?? 1}
                          onChange={e => setReminderForm(f => ({ ...f, weekday: Number(e.target.value) }))}
                          className="bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-gold/40"
                        >
                          {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Month day */}
                    {rf.type === 'monthly' && (
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 w-20 shrink-0">Ziua lunii</span>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={rf.monthDay ?? 1}
                          onChange={e => setReminderForm(f => ({ ...f, monthDay: Number(e.target.value) }))}
                          className="bg-slate-800/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-20 focus:outline-none focus:border-accent-gold/40"
                        />
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => saveReminder(list.id)}
                        className="px-5 py-2 bg-accent-gold text-bg-primary text-[10px] font-black uppercase tracking-widest rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Salveaza
                      </button>
                    </div>
                  </div>
                )}

                {/* Tasks */}
                <div className="p-6 space-y-2 flex-1">
                  {list.tasks.length === 0 && (
                    <p className="text-[11px] text-slate-600 italic py-2">Niciun task — adaugă cu butonul de mai jos.</p>
                  )}
                  {list.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 group">
                      <button onClick={() => toggleTask(list.id, task.id)} className="shrink-0">
                        {task.done
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          : <Circle className="w-5 h-5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                        }
                      </button>
                      <input
                        type="text"
                        defaultValue={task.name}
                        key={task.id + task.name}
                        onBlur={(e) => renameTask(list.id, task.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className={cn(
                          "flex-1 bg-transparent border-none outline-none text-sm focus:ring-0 transition-all",
                          task.done ? "line-through text-slate-600" : "text-slate-300"
                        )}
                      />
                      <button
                        onClick={() => deleteTask(list.id, task.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-red-500 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addTask(list.id)}
                    className="w-full mt-3 py-2.5 border border-dashed border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-accent-gold hover:border-accent-gold/40 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> Adaugă Task
                  </button>
                </div>

                {/* Progress bar */}
                <div className="px-6 py-3 bg-white/[0.01] border-t border-white/[0.03]">
                  <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", allDone ? "bg-emerald-500" : "bg-accent-gold/60")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
