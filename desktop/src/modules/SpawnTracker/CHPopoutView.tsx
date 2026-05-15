import React, { useState, useEffect, useMemo } from 'react';
import { useSpawn } from '../../contexts/SpawnContext';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';
import { appWindow } from '@tauri-apps/api/window';

function TimeInput({ ch, value, onUpdate }: { ch: number, value: string, onUpdate: (ch: number, val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="w-fit mx-auto px-4 flex items-center justify-center text-[clamp(1.5rem,7vw,2.6rem)] font-black tabular-nums tracking-tight text-slate-100 leading-none cursor-text hover:text-accent-gold transition-colors select-none"
      >
        {value || '--:--'}
      </div>
    );
  }

  return (
    <input 
      ref={inputRef}
      type="text"
      placeholder="--:--"
      value={value}
      onBlur={() => setIsEditing(false)}
      onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(false); }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 4) val = val.slice(0, 4);
        
        let formatted = val;
        if (val.length >= 3) {
          formatted = val.slice(0, 2) + ':' + val.slice(2);
        } else if (val.length > 0) {
          formatted = val;
        }
        
        onUpdate(ch, formatted);
      }}
      style={{ width: '80px' }}
      className="bg-transparent rounded text-center text-[clamp(1.5rem,7vw,2.6rem)] font-black tabular-nums tracking-tight text-white leading-none outline-none border-none mx-auto"
    />
  );
}

export function CHPopoutView() {
  const { spawnData, setCHTime, toggleBeaten, serverTimeOffset } = useSpawn();

  useEffect(() => {
    appWindow.setDecorations(false).catch(console.error);
  }, []);

  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [showOnFeedback, setShowOnFeedback] = useState(false);
  const [now, setNow] = useState(new Date(Date.now() + serverTimeOffset));

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date(Date.now() + serverTimeOffset)), 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  const handleCHClick = (ch: number) => {
    const now = new Date();
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    setCHTime(ch, `${mm}:${ss}`);
  };

  const handleCHRightClick = (e: React.MouseEvent, ch: number) => {
    e.preventDefault();
    toggleBeaten(ch);
  };

  const calculateRemaining = (mmss: string) => {
    const parts = mmss.split(':');
    if (parts.length !== 2) return null;
    const tMin = parseInt(parts[0], 10);
    const tSec = parseInt(parts[1], 10);
    const nowInHour = now.getMinutes() * 60 + now.getSeconds();
    const targetInHour = tMin * 60 + tSec;
    let diff = targetInHour - nowInHour;
    if (diff <= 0) diff += 3600;
    return diff;
  };

  const formatDiff = (diff: number) => {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return { m, s, text: `${m}:${s.toString().padStart(2, '0')}` };
  };

  const displayedType = useMemo(() => {
    const baseType = spawnData?.spawnType || 'Simplu';
    const ch1Time = spawnData?.chTimes?.ch1;
    const ch6Time = spawnData?.chTimes?.ch6;
    if (!ch1Time || !ch6Time) return baseType;

    const parse = (s: string) => {
      const p = s.split(':').map(n => parseInt(n));
      return p[0] * 60 + p[1];
    };

    const t1 = parse(ch1Time);
    const t6 = parse(ch6Time);
    const nowInHour = now.getMinutes() * 60 + now.getSeconds();

    // Trigger point: T1 - 5s
    let trigger = t1 - 5;
    if (trigger < 0) trigger += 3600;

    // Grace End point: T6 + 300s
    let graceEnd = (t6 + 300) % 3600;

    // Determine if we are in the grace period (from switch until T6 + 5m)
    // This is the period where the "next" spawn has been set in DB, but we want to show the "current" one
    let isInGrace = false;
    if (trigger < graceEnd) {
      isInGrace = nowInHour >= trigger && nowInHour < graceEnd;
    } else {
      // Wraps around the hour (e.g. trigger at 59:55, graceEnd at 04:40)
      isInGrace = nowInHour >= trigger || nowInHour < graceEnd;
    }

    if (isInGrace) {
      return baseType === 'dublu' ? 'simplu' : 'dublu';
    }

    return baseType;
  }, [spawnData?.spawnType, spawnData?.chTimes?.ch1, spawnData?.chTimes?.ch6, now]);

  const chList = useMemo(() => {
    return [1, 2, 3, 4, 5, 6].map(ch => {
      const time = spawnData?.chTimes?.[`ch${ch}`] || '';
      const isBeaten = spawnData?.chBeaten?.[`ch${ch}`];
      const diff = time ? calculateRemaining(time) : null;
      return { ch, time, diff, isBeaten };
    });
  }, [spawnData, now]);

  const nextCH = useMemo(() => {
    const sorted = [...chList]
      .filter(c => c.diff !== null)
      .sort((a, b) => (a.diff || 0) - (b.diff || 0));
    return sorted[0] || null;
  }, [chList]);

  return (
    <div 
      className="h-screen bg-[#050506] text-white p-1 font-sans select-none overflow-hidden flex flex-col relative group/popout"
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute('data-tauri-drag-region')) {
          e.preventDefault();
          const next = !isAlwaysOnTop;
          setIsAlwaysOnTop(next);
          appWindow.setAlwaysOnTop(next).catch(console.error);
          if (next) {
            setShowOnFeedback(true);
            setTimeout(() => setShowOnFeedback(false), 2000);
          }
        }
      }}
    >
      {/* Drag Region - Inset to allow resizing at edges */}
      <div data-tauri-drag-region className="absolute inset-1 z-0 cursor-default" />
      
      {/* Status Overlay for feedback */}
      <div className={cn(
        "absolute top-2 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-accent-gold/20 border border-accent-gold/40 rounded-full text-[9px] font-black uppercase tracking-widest text-accent-gold transition-all duration-500 pointer-events-none",
        isAlwaysOnTop ? "opacity-0 scale-95" : "opacity-100 scale-100"
      )}>
        Always on Top: OFF
      </div>
      <div className={cn(
        "absolute top-2 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-[9px] font-black uppercase tracking-widest text-emerald-400 transition-all duration-500 pointer-events-none",
        showOnFeedback ? "opacity-100 scale-100" : "opacity-0 scale-95"
      )}>
        Always on Top: ON
      </div>
      <button 
        onClick={() => appWindow.close()}
        className="absolute top-1 right-1 z-50 p-1 text-slate-500 hover:text-red-500 transition-all opacity-0 group-hover/popout:opacity-100"
      >
        <X className="w-3 h-3" />
      </button>

      {/* Content wrapper */}
      <div className="relative z-10 flex-1 flex flex-col pointer-events-none min-h-0">
        <div className="flex flex-col h-full">
      {/* Header / Big Timer — arata ora curenta MM:SS */}
      <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-top-4 duration-700 min-h-0">
        <div className="flex items-baseline justify-center gap-0.5 -mb-1">
          <span className="text-[clamp(1.5rem,8vw,3.5rem)] font-black text-slate-100 tabular-nums">
            {now.getMinutes().toString().padStart(2, '0')}
          </span>
          <span className="text-[clamp(0.8rem,3vw,1.2rem)] font-black text-slate-500 mr-1">m</span>
          <span className="text-[clamp(1.5rem,8vw,3.5rem)] font-black text-white tabular-nums">
            {now.getSeconds().toString().padStart(2, '0')}
          </span>
          <span className="text-[clamp(0.8rem,3vw,1.2rem)] font-black text-slate-500">s</span>
        </div>
        {nextCH ? (
          <p className={cn(
            "text-[clamp(8px,2.5vw,12px)] font-bold tracking-wider transition-colors",
            nextCH.diff! < 60 ? "text-red-500 animate-pulse" :
            nextCH.diff! < 300 ? "text-accent-gold" :
            "text-slate-500"
          )}>
            CH{nextCH.ch} în {formatDiff(nextCH.diff!).text} • <span className="uppercase text-accent-gold/80">{displayedType}</span>
          </p>
        ) : (
          <p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Waiting for data...</p>
        )}
      </div>

      {/* Grid of CHs */}
      <div className="flex-[2] grid grid-cols-2 gap-1 w-full min-h-0 select-none">
        {chList.map(({ ch, time, diff, isBeaten }) => (
          <div 
            key={ch}
            onClick={() => handleCHClick(ch)}
            onContextMenu={(e) => handleCHRightClick(e, ch)}
            className={cn(
              "relative bg-slate-900/40 border border-white/5 rounded p-1 flex flex-col items-center justify-center transition-all cursor-pointer hover:bg-white/5 h-full pointer-events-auto select-none",
              isBeaten && "opacity-20 grayscale",
              !time && "opacity-40"
            )}
          >
             <div className="absolute left-1 top-1 flex flex-col items-center pointer-events-none">
                <span className={cn(
                   "text-[8px] font-black leading-none",
                   diff !== null && diff < 60 ? "text-red-500" :
                   diff !== null && diff < 300 ? "text-accent-gold" :
                   "text-slate-500"
                 )}>{ch}</span>
             </div>
             
             <div className="flex flex-col items-center w-full">
                <TimeInput ch={ch} value={time} onUpdate={setCHTime} />
                <span className={cn(
                   "text-[clamp(1.1rem,5vw,2rem)] font-black tabular-nums leading-none pointer-events-none",
                   diff !== null && diff < 60 ? "text-red-500/80" :
                   diff !== null && diff < 300 ? "text-accent-gold/80" :
                   "text-slate-500"
                 )}>
                  {diff !== null ? formatDiff(diff).text : '--:--'}
                </span>
             </div>
          </div>
        ))}
      </div>
      
        </div>
      </div>
    </div>
  );
}
