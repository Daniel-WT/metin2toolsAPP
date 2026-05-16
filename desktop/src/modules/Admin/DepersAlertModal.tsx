import { useEffect, useRef } from 'react';
import { ShieldCheck, CheckCircle } from 'lucide-react';

export interface DepersAlert {
  id: string;
  name: string;
}

function playDepersSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    const notes = [880, 1046, 1318];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.25, start + 0.01);
      g.gain.linearRampToValueAtTime(0, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.35);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {}
}

interface Props {
  alerts: DepersAlert[];
  onDismiss: () => void;
}

export function DepersAlertModal({ alerts, onDismiss }: Props) {
  const playedRef = useRef(false);

  useEffect(() => {
    if (alerts.length > 0 && !playedRef.current) {
      playedRef.current = true;
      playDepersSound();
    }
    if (alerts.length === 0) playedRef.current = false;
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 bg-[#0c0c0e] border border-emerald-500/30 rounded-3xl shadow-[0_0_80px_rgba(52,211,153,0.12)] p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="absolute inset-0 bg-emerald-500/[0.04] rounded-3xl pointer-events-none" />

        <div className="relative text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(52,211,153,0.15)]">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>

          <div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Admin Alert</p>
            <h2 className="text-xl font-black text-emerald-400 tracking-tighter uppercase">
              {alerts.length === 1 ? 'Item Depersonalizat!' : `${alerts.length} Items Depersonalizate!`}
            </h2>
            <p className="text-slate-500 text-xs mt-1">Procesul de depersonalizare s-a finalizat</p>
          </div>

          <div className="space-y-2">
            {alerts.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/[0.06] border border-emerald-500/15 rounded-xl text-left"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-white font-bold text-sm">{a.name}</span>
              </div>
            ))}
          </div>

          <button
            onClick={onDismiss}
            className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-black text-sm rounded-xl transition-all uppercase tracking-wider"
          >
            Am înțeles
          </button>
        </div>
      </div>
    </div>
  );
}
