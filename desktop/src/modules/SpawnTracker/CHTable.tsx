import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, AlertCircle, Timer, Zap, ZapOff, Volume2, VolumeX, Bell } from 'lucide-react';
import { useSpawn } from '../../contexts/SpawnContext';
import { cn } from '../../lib/utils';

function TimeInput({ ch, value, onUpdate }: { ch: number, value: string, onUpdate: (ch: number, val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) setLocalValue(value);
  }, [value, isEditing]);

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        className="w-[74px] h-[38px] flex items-center justify-center bg-slate-900/40 rounded-lg text-lg font-black text-slate-100 cursor-text hover:bg-slate-900/60 transition-all font-mono tracking-tighter pointer-events-auto"
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
      value={localValue}
      onBlur={() => {
        setIsEditing(false);
        onUpdate(ch, localValue);
      }}
      onKeyDown={(e) => { 
        if (e.key === 'Enter') {
          inputRef.current?.blur();
        }
        if (e.key === 'Escape') {
          setLocalValue(value);
          setIsEditing(false);
        }
      }}
      onChange={(e) => {
        const input = e.target;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        
        const val = input.value.replace(/[^0-9:]/g, '');
        let clean = val.replace(':', '');
        if (clean.length > 4) clean = clean.slice(0, 4);
        
        let formatted = clean;
        if (clean.length >= 3) {
          formatted = clean.slice(0, 2) + ':' + clean.slice(2);
        }
        
        setLocalValue(formatted);
        
        // Restore selection in next tick
        requestAnimationFrame(() => {
          if (input) {
            input.setSelectionRange(start, end);
          }
        });
      }}
      className="w-[74px] h-[38px] bg-slate-900/60 rounded-lg text-center text-lg font-black text-slate-100 outline-none ring-1 ring-accent-gold/50 font-mono tracking-tighter pointer-events-auto"
    />
  );
}

export function CHTable() {
  const { spawnData, setCHTime, toggleBeaten, setSpawnType, audioEnabled, setAudioEnabled, serverTimeOffset, playSpawnAlarm } = useSpawn();
  const [now, setNow] = useState(new Date(Date.now() + serverTimeOffset));

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date(Date.now() + serverTimeOffset)), 1000);
    return () => clearInterval(interval);
  }, [serverTimeOffset]);

  const calculateNext = (mmss: string) => {
    const parts = mmss.split(':');
    if (parts.length !== 2) return '--:--';
    return mmss; // The spawn is always at the same MM:SS every hour
  };

  const calculateRemaining = (mmss: string) => {
    const parts = mmss.split(':');
    if (parts.length !== 2) return null;
    const tMin = parseInt(parts[0], 10);
    const tSec = parseInt(parts[1], 10);
    if (isNaN(tMin) || isNaN(tSec)) return null;

    const nowInHour = now.getMinutes() * 60 + now.getSeconds();
    const targetInHour = tMin * 60 + tSec;
    
    let diff = targetInHour - nowInHour;
    if (diff <= 0) diff += 3600;

    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return {
      text: `${m}:${s.toString().padStart(2, '0')}`,
      totalSec: diff,
      isNear: diff < 300 // 5 minutes
    };
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      <div className="overflow-x-auto scrollbar-hide">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-[320px]">
      {[1, 2, 3, 4, 5, 6].map((ch) => {
        const time = spawnData?.chTimes?.[`ch${ch}`] || '';
        const isBeaten = spawnData?.chBeaten?.[`ch${ch}`];
        const remaining = time ? calculateRemaining(time) : null;

        return (
          <div 
            key={ch} 
            className={cn(
              "flex items-center bg-white/[0.02] border border-white/5 rounded-xl p-2 transition-all group relative overflow-hidden select-none cursor-default",
              isBeaten ? "opacity-30 grayscale" : "hover:bg-white/[0.04] hover:border-white/10"
            )}
          >
            {/* Click-jacking shield for the card background */}
            <div className="absolute inset-0 z-0 pointer-events-auto cursor-default" />

            {/* CH Label */}
            <div 
              className="relative z-10 px-2 py-4 border-r border-white/5 flex flex-col items-center justify-center cursor-pointer select-none hover:bg-white/5 transition-colors pointer-events-auto"
              onClick={() => {
                const mm = now.getMinutes().toString().padStart(2, '0');
                const ss = now.getSeconds().toString().padStart(2, '0');
                setCHTime(ch, `${mm}:${ss}`);
              }}
              onContextMenu={(e) => { e.preventDefault(); toggleBeaten(ch); }}
              title="Click: Set current time | Right-Click: Toggle Beaten"
            >
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">CH</span>
              <span className="text-sm font-black text-slate-400 group-hover:text-accent-gold transition-colors">{ch}</span>
            </div>

            {/* Times column */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 select-none pointer-events-auto">
              <TimeInput ch={ch} value={time} onUpdate={setCHTime} />
              
              <div className={cn(
                "text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-1",
                remaining?.isNear ? "text-orange-500 animate-pulse" : "text-slate-500"
              )}>
                {remaining ? (
                  <>
                    <Timer className="w-3 h-3" />
                    <span>{remaining.text} Rămas</span>
                  </>
                ) : (
                  <span className="opacity-30 italic">lipsă</span>
                )}
              </div>
            </div>
            
            

            {/* Beaten Indicator - Subtle line */}
            {isBeaten && (
              <div className="absolute top-0 right-0 p-1">
                <CheckCircle2 className="w-3 h-3 text-red-500/50" />
              </div>
            )}
          </div>
        );
      })}
        </div>
      </div>
    </div>
  );
}
