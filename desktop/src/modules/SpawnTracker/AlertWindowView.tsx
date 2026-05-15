import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Clock, X } from 'lucide-react';
import { appWindow } from '@tauri-apps/api/window';
import { listen, emit } from '@tauri-apps/api/event';

export default function AlertWindowView() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [times, setTimes] = useState<Record<string, number>>({});
  
  // Listen for updates from the main process/window
  useEffect(() => {
    // Disable right click context menu globally for this window
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    appWindow.setAlwaysOnTop(true);
    
    // Announce ready to receive state
    emit('alert-window-ready', { ts: Date.now() });
    
    const unlisten = listen<{alerts: any[], times: Record<string, number>}>('spawn-alert-update', (event) => {
      setAlerts(event.payload.alerts);
      setTimes(event.payload.times);
    });

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      unlisten.then(f => f());
    };
  }, []);

  const confirmAlert = useCallback(async (chKey: string) => {
    // Notify main window to stop audio/clear state
    await emit('confirm-spawn-alert', chKey);
    // Locally clear to prevent flicker
    setAlerts(prev => prev.filter(a => (typeof a === 'string' ? a : a.name) !== chKey));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div 
      className="h-full w-full bg-transparent flex items-center justify-center p-4 select-none overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-6 w-full max-w-md animate-in fade-in zoom-in duration-300">
        {alerts.map((alert, idx) => {
          const chKey = typeof alert === 'string' ? alert : alert.name;
          const time = times[chKey] || 0;
          const isUrgent = time <= 10;

          return (
            <div 
              key={chKey}
              data-tauri-drag-region
              className="relative group bg-[#0c0c0e]/90 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col items-center gap-6 overflow-hidden"
              style={{
                animationDelay: `${idx * 100}ms`,
                transform: `scale(${1 - idx * 0.05}) translateY(${idx * 20}px)`,
                zIndex: 100 - idx,
                boxShadow: isUrgent ? '0 0 40px rgba(239, 68, 68, 0.1)' : '0 40px 100px rgba(0,0,0,0.8)'
              }}
            >
              {/* Animated urgent background */}
              {isUrgent && (
                <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
              )}

              {/* Top Drag Indicator */}
              <div className="w-10 h-1 bg-white/10 rounded-full mb-2 pointer-events-none" />

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${isUrgent ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-accent-gold/10 border-accent-gold/20 text-accent-gold'}`}>
                  <Bell className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                  Alerta {chKey}
                </h3>
              </div>

              {/* Timer Display */}
              <div className="flex flex-col items-center gap-1 pointer-events-none">
                <div className="flex items-baseline gap-2">
                  <span className={`text-8xl font-black tabular-nums tracking-tighter ${isUrgent ? 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'text-white'}`}>
                    {time}
                  </span>
                  <span className={`text-sm font-black uppercase tracking-widest ${isUrgent ? 'text-red-500/50' : 'text-slate-500'}`}>
                    sec
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                  <Clock className="w-3 h-3" />
                  Până la spawn
                </div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={() => confirmAlert(chKey)}
                className={`w-full py-5 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 active:scale-95 shadow-xl ${
                  isUrgent 
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
                    : 'bg-white text-black hover:bg-slate-200'
                }`}
              >
                <Check className="w-5 h-5" strokeWidth={3} />
                <span className="text-xs font-black uppercase tracking-widest">Am văzut</span>
              </button>
              
              {/* Subtle close hint */}
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest pointer-events-none">
                Apasă butonul pentru a opri alarma
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
