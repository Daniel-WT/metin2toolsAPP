import { useState, useEffect, useRef } from 'react';
import { appWindow, LogicalSize } from '@tauri-apps/api/window';
import { X, RefreshCcw, Pause, Play } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  loadRepeatTimers, saveRepeatTimers,
  getRepeatRemaining, fmtRepeat,
  playTick, playAlarm,
  type RepeatTimer,
} from './index';

export default function RepeatTimerPopout({ timerId }: { timerId: string }) {
  const [timer, setTimer] = useState<RepeatTimer | null>(null);
  const [tick, setTick] = useState(0);
  const lastTickSec = useRef(-1);
  const [flash, setFlash] = useState(false);
  const [pinned, setPinned] = useState(true);
  const resizeData = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  useEffect(() => {
    const refresh = () => {
      const found = loadRepeatTimers().find(t => t.id === timerId) ?? null;
      setTimer(found);
    };
    refresh();
    const id = setInterval(() => { refresh(); setTick(t => t + 1); }, 250);
    return () => clearInterval(id);
  }, [timerId]);

  useEffect(() => {
    if (!timer || timer.paused) return;
    const remaining = getRepeatRemaining(timer);
    const secs = Math.ceil(remaining);
    if (remaining > 0 && remaining <= 3 && secs !== lastTickSec.current) {
      lastTickSec.current = secs;
      playTick(secs === 1);
    }
    if (remaining <= 0) {
      playAlarm();
      lastTickSec.current = -1;
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
      const timers = loadRepeatTimers().map(t =>
        t.id === timerId ? { ...t, startedAt: Date.now(), paused: false, pausedRemaining: undefined } : t
      );
      saveRepeatTimers(timers);
    }
  }, [tick, timer, timerId]);

  function reset() {
    lastTickSec.current = -1;
    const timers = loadRepeatTimers().map(t =>
      t.id === timerId ? { ...t, startedAt: Date.now(), paused: false, pausedRemaining: undefined } : t
    );
    saveRepeatTimers(timers);
  }

  function pauseResume() {
    const timers = loadRepeatTimers().map(t => {
      if (t.id !== timerId) return t;
      if (t.paused) {
        const rem = t.pausedRemaining ?? t.totalSeconds;
        return { ...t, paused: false, startedAt: Date.now() - (t.totalSeconds - rem) * 1000, pausedRemaining: undefined };
      }
      return { ...t, paused: true, pausedRemaining: getRepeatRemaining(t) };
    });
    saveRepeatTimers(timers);
  }

  async function togglePin(e: React.MouseEvent) {
    e.preventDefault();
    const next = !pinned;
    setPinned(next);
    await appWindow.setAlwaysOnTop(next);
  }

  async function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const factor = await appWindow.scaleFactor();
      const size = await appWindow.outerSize();
      resizeData.current = {
        startX: e.screenX, startY: e.screenY,
        startW: Math.round(size.width / factor),
        startH: Math.round(size.height / factor),
      };
      function onMove(ev: MouseEvent) {
        if (!resizeData.current) return;
        const w = Math.max(150, resizeData.current.startW + (ev.screenX - resizeData.current.startX));
        const h = Math.max(90,  resizeData.current.startH + (ev.screenY - resizeData.current.startY));
        appWindow.setSize(new LogicalSize(w, h));
      }
      function onUp() {
        resizeData.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } catch {}
  }

  if (!timer) {
    return (
      <div data-tauri-drag-region className="h-screen w-screen bg-[#050506] flex items-center justify-center">
        <p className="text-slate-600 text-xs">Timer not found</p>
        <button onClick={() => appWindow.close()} onPointerDown={e => e.stopPropagation()}
          className="absolute top-1 right-1 text-slate-800 hover:text-slate-500 p-1 transition-colors pointer-events-auto">
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    );
  }

  const remaining = getRepeatRemaining(timer);
  const pct = (remaining / timer.totalSeconds) * 100;
  const isUrgent = remaining <= 3 && remaining > 0 && !timer.paused;

  return (
    <div
      data-tauri-drag-region
      onContextMenu={togglePin}
      className={cn(
        'h-screen w-screen flex flex-col p-2 gap-1.5 select-none relative transition-colors duration-300',
        flash ? 'bg-accent-gold/10' : 'bg-[#050506]'
      )}
    >
      {/* Controls — absolute top-right, zero layout impact */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
        <div className={cn('w-1 h-1 rounded-full transition-colors', pinned ? 'bg-accent-gold/60' : 'bg-slate-800')} />
        <button
          onClick={() => appWindow.close()}
          onPointerDown={e => e.stopPropagation()}
          className="text-slate-700 hover:text-slate-400 transition-colors pointer-events-auto"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Countdown — preia tot spatiul disponibil */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <span className={cn(
          'text-5xl font-black tabular-nums font-display leading-none transition-colors',
          timer.paused ? 'text-slate-500' : isUrgent ? 'text-red-400' : 'text-slate-100'
        )}>
          {fmtRepeat(Math.ceil(remaining))}
        </span>
      </div>

      {/* Progress + butoane — niciodata ascunse */}
      <div className="flex-shrink-0 space-y-1.5">
        <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
          <div className={cn(
            'h-full rounded-full transition-all duration-250',
            timer.paused ? 'bg-slate-600' : isUrgent
              ? 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
              : 'bg-accent-gold shadow-[0_0_6px_rgba(200,150,46,0.5)]'
          )} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-1">
          <button
            onClick={pauseResume}
            onPointerDown={e => e.stopPropagation()}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-1 rounded-md border text-[9px] font-black uppercase tracking-widest transition-all pointer-events-auto',
              timer.paused
                ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold hover:bg-accent-gold/20'
                : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300'
            )}
          >
            {timer.paused ? <Play className="w-2 h-2" /> : <Pause className="w-2 h-2" />}
            {timer.paused ? 'Continua' : 'Pauza'}
          </button>
          <button
            onClick={reset}
            onPointerDown={e => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-white/[0.06] hover:text-slate-300 transition-all pointer-events-auto"
          >
            <RefreshCcw className="w-2 h-2" /> Reset
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        onPointerDown={e => e.stopPropagation()}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-1 group"
      >
        <svg width="6" height="6" viewBox="0 0 8 8" className="text-slate-800 group-hover:text-slate-600 transition-colors">
          <line x1="8" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="4" x2="4" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
