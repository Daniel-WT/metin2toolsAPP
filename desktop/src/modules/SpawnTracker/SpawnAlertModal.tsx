import React from 'react';
import { useSpawn } from '../../contexts/SpawnContext';
import { Bell, Zap, AlertTriangle, Timer } from 'lucide-react';

// ─────────────────────────────────────────────────────────
// Modal 30 SECUNDE — apare in TOATE ferestrele (main + pop-outs)
// Sunetul se aude DOAR din fereastra principala (logica in SpawnContext)
// Confirmarea din oricare fereastra opreste alarma pretutindeni
// ─────────────────────────────────────────────────────────
export function SpawnAlertModal() {
  const { activeAlerts, confirmAlert, spawnData } = useSpawn();
  const [now, setNow] = React.useState(new Date());

  // Countdown refresh la fiecare secunda cat timp exista alerte active
  React.useEffect(() => {
    if (activeAlerts.length === 0) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [activeAlerts.length]);

  if (activeAlerts.length === 0) return null;

  const getSecondsLeft = (chKey: string): number => {
    const timeStr = spawnData?.chTimes?.[chKey];
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    const targetInHour = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    const nowInHour = now.getMinutes() * 60 + now.getSeconds();
    let diff = targetInHour - nowInHour;
    if (diff <= 0) diff += 3600;
    return Math.min(diff, 30);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-[320px] bg-[#0c0c0e] border border-red-500/20 rounded-[28px] shadow-[0_0_60px_rgba(239,68,68,0.15)] overflow-hidden flex flex-col items-center text-center">

        {/* Bara rosie pulsanta sus */}
        <div className="w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse" />

        <div className="p-6 flex flex-col items-center gap-4 w-full">
          {/* Icoana */}
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 blur-2xl animate-pulse rounded-full" />
            <div className="relative w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Bell className="w-7 h-7 text-red-400 animate-bounce" />
            </div>
          </div>

          {/* Titlu */}
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">
              SPAWN <span className="text-red-400">ACUM!</span>
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Apasa OK pentru a opri alarma
            </p>
          </div>

          {/* Lista alerte per CH */}
          <div className="w-full space-y-2">
            {activeAlerts.map((chKey) => {
              const sec = getSecondsLeft(chKey);
              const isUrgent = sec <= 10;
              return (
                <div
                  key={chKey}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isUrgent ? 'bg-red-500/20 border border-red-500/20' : 'bg-purple-500/20 border border-purple-500/20'}`}>
                      <Zap className={`w-4 h-4 ${isUrgent ? 'text-red-400' : 'text-purple-400'}`} />
                    </div>
                    <div className="text-left">
                      <span className="block font-black text-white text-xs uppercase tracking-widest">
                        {chKey.toUpperCase()}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Timer className="w-3 h-3 text-slate-500" />
                        <span className={`text-sm font-black tabular-nums ${isUrgent ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
                          {sec}s
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmAlert(chKey)}
                    className="px-4 py-2 rounded-xl bg-accent-gold text-black text-[11px] font-black uppercase tracking-widest hover:bg-amber-400 active:scale-95 transition-all shadow-lg"
                  >
                    OK
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            <AlertTriangle className="w-3 h-3 text-amber-500/40" />
            <span>Sunetul se opreste dupa confirmare</span>
          </div>
        </div>
      </div>
    </div>
  );
}
