import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useSpawn } from '../../contexts/SpawnContext';
import { Bell, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SkinItem {
  id: string;
  name: string;
  account: string;
  category?: string;
  expiresAt: number;
  personalized?: boolean;
  depersExpiresAt?: number | null;
}

type AlertType = '4d' | '24h' | '6h' | '5h' | '4h' | '3h' | '2h' | '1h' | 'finalizat';

interface PendingAlert {
  item: SkinItem;
  type: AlertType;
  key: string;
}

const THRESHOLDS: { type: AlertType; ms: number }[] = [
  { type: '24h', ms: 24 * 3600000 },
  { type: '6h',  ms:  6 * 3600000 },
  { type: '5h',  ms:  5 * 3600000 },
  { type: '4h',  ms:  4 * 3600000 },
  { type: '3h',  ms:  3 * 3600000 },
  { type: '2h',  ms:  2 * 3600000 },
  { type: '1h',  ms:  1 * 3600000 },
];

// Urgent siren — 3 hi-lo bursts with LFO tremolo (identical to web playAlert1)
function playAlert1(volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.value = Math.min(1, volume) * 0.35;
    const t0 = ctx.currentTime;

    [
      { freq: 880, start: 0,    dur: 0.22 },
      { freq: 660, start: 0.24, dur: 0.22 },
      { freq: 880, start: 0.48, dur: 0.30 },
    ].forEach(b => {
      const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
      const g = ctx.createGain(), g2 = ctx.createGain();
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();

      osc1.type = 'sine'; osc1.frequency.value = b.freq;
      osc2.type = 'sine'; osc2.frequency.value = b.freq * 1.5;
      g2.gain.value = 0.2;
      osc1.connect(g); osc2.connect(g2); g2.connect(g); g.connect(master);

      lfo.frequency.value = 12; lfoG.gain.value = 0.15;
      lfo.connect(lfoG); lfoG.connect(g.gain);

      const t = t0 + b.start;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.01);
      g.gain.setValueAtTime(1, t + b.dur - 0.03);
      g.gain.linearRampToValueAtTime(0, t + b.dur);

      [lfo, osc1, osc2].forEach(n => { n.start(t); n.stop(t + b.dur + 0.02); });
    });
  } catch (_) {}
}

// Gentle warning — 3 descending tones with soft LFO (identical to web playAlert4)
function playAlert4(volume: number) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t0 = ctx.currentTime;
    const peak = Math.min(1, volume) * 0.25;

    [
      { freq: 620, start: 0,    dur: 0.25 },
      { freq: 520, start: 0.30, dur: 0.25 },
      { freq: 440, start: 0.60, dur: 0.40 },
    ].forEach(b => {
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();

      osc1.type = 'triangle'; osc1.frequency.value = b.freq;
      osc2.type = 'sine';     osc2.frequency.value = b.freq * 2;
      g2.gain.value = 0.12;
      osc1.connect(master); osc2.connect(g2); g2.connect(master);

      lfo.frequency.value = 5; lfoG.gain.value = 0.06 * peak;
      lfo.connect(lfoG); lfoG.connect(master.gain);

      const t = t0 + b.start;
      master.gain.setValueAtTime(0, t);
      master.gain.linearRampToValueAtTime(peak, t + 0.03);
      master.gain.setValueAtTime(peak, t + b.dur - 0.08);
      master.gain.linearRampToValueAtTime(0, t + b.dur);

      [lfo, osc1, osc2].forEach(n => { n.start(t); n.stop(t + b.dur + 0.05); });
    });
  } catch (_) {}
}

export function SkinAlertModal() {
  const { user } = useAuth();
  const { globalVolume, skinVolume } = useSpawn();
  const teamId = user?.teamId;

  const [items, setItems] = useState<SkinItem[]>([]);
  const [pending, setPending] = useState<PendingAlert[]>([]);
  const confirmedRef = useRef<Set<string>>((() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem('m2_skin_confirmed') || '[]')); }
    catch { return new Set<string>(); }
  })());
  const soundLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/skinReminder/items`), snap => {
      setItems(snap.val() ? Object.values(snap.val()) : []);
    });
  }, [teamId]);

  useEffect(() => {
    if (!items.length) return;

    const check = () => {
      const now = Date.now();
      const toAdd: PendingAlert[] = [];

      console.log(`[SkinAlert] check() — ${items.length} items, ${confirmedRef.current.size} confirmed in localStorage`);

      items.forEach(item => {
        if (!item.expiresAt || isNaN(item.expiresAt)) {
          return;
        }
        const ms = item.expiresAt - now;
        const expBucket = Math.floor(item.expiresAt / 60000);
        const is67 = item.category === 'sase-sapte';

        if (is67) {
          // 6/7: alertă doar la finalizare (ms <= 0)
          if (ms <= 0) {
            const key = `${item.id}_finalizat_${expBucket}`;
            if (!confirmedRef.current.has(key)) {
              toAdd.push({ item, type: 'finalizat', key });
            }
          }
          return;
        }

        if (ms <= 0) return;

        const unconfirmed = THRESHOLDS.filter(t =>
          ms <= t.ms && !confirmedRef.current.has(`${item.id}_${t.type}_${expBucket}`)
        );

        if (ms > 24 * 3600000) {
          // prea devreme
        } else if (unconfirmed.length > 0) {
          const t = unconfirmed[unconfirmed.length - 1];
          toAdd.push({ item, type: t.type, key: `${item.id}_${t.type}_${expBucket}` });
          return;
        }

        if (item.personalized && !item.depersExpiresAt) {
          const key = `${item.id}_4d_${expBucket}`;
          if (ms <= 4 * 24 * 3600000 && !confirmedRef.current.has(key)) {
            toAdd.push({ item, type: '4d', key });
          }
        }
      });

      console.log(`[SkinAlert] → ${toAdd.length} alerte noi de adăugat`);
      if (!toAdd.length) return;
      setPending(prev => {
        const existing = new Set(prev.map(a => a.key));
        const fresh = toAdd.filter(a => !existing.has(a.key));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    };

    check();
    const inv = setInterval(check, 30000);
    return () => clearInterval(inv);
  }, [items]);

  // Loop sunet cat timp exista alerte
  useEffect(() => {
    if (soundLoopRef.current) { clearInterval(soundLoopRef.current); soundLoopRef.current = null; }
    if (pending.length === 0) return;

    const isUrgent = pending.some(a => a.type !== '4d');
    const vol = Math.min(1, globalVolume * skinVolume);
    const play = () => isUrgent ? playAlert1(vol) : playAlert4(vol);
    play();
    soundLoopRef.current = setInterval(play, isUrgent ? 4000 : 5000);
    return () => { if (soundLoopRef.current) { clearInterval(soundLoopRef.current); soundLoopRef.current = null; } };
  }, [pending.length, globalVolume, skinVolume]);

  const confirm = useCallback((key: string) => {
    confirmedRef.current.add(key);
    localStorage.setItem('m2_skin_confirmed', JSON.stringify([...confirmedRef.current]));
    setPending(prev => prev.filter(a => a.key !== key));
  }, []);

  if (pending.length === 0) return null;

  const alertLabel = (type: AlertType) =>
    type === 'finalizat' ? '6/7 Finalizat!' :
    type === '4d' ? 'Sub 4 zile (Personalizat)' : `Sub ${type}`;

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-[340px] bg-[#0c0c0e] border border-amber-500/20 rounded-[28px] shadow-[0_0_60px_rgba(245,158,11,0.1)] overflow-hidden">
        <div className="w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-pulse" />
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/20 blur-2xl animate-pulse rounded-full" />
            <div className="relative w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Bell className="w-7 h-7 text-amber-400 animate-bounce" />
            </div>
          </div>
          <div className="text-center">
            <h2 className={cn("text-xl font-black tracking-tighter uppercase", pending.every(a => a.type === 'finalizat') ? "text-emerald-400" : "text-white")}>
              {pending.every(a => a.type === 'finalizat') ? 'Item Finalizat!' : 'Item Expiră!'}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Apasă OK pentru a opri alarma
            </p>
          </div>
          <div className="w-full space-y-2">
            {pending.map(({ item, type, key }) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="text-left min-w-0 flex-1 mr-3">
                  <span className="block font-black text-white text-xs uppercase tracking-widest truncate">
                    {item.name}
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold">@{item.account}</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 shrink-0 text-slate-500" />
                    <span className={cn(
                      "text-[10px] font-black",
                      type === 'finalizat' ? "text-emerald-400" :
                      type !== '4d' ? "text-red-400 animate-pulse" : "text-amber-400"
                    )}>
                      {alertLabel(type)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => confirm(key)}
                  className="shrink-0 px-4 py-2 rounded-xl bg-accent-gold text-black text-[11px] font-black uppercase tracking-widest hover:bg-amber-400 active:scale-95 transition-all"
                >
                  OK
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
