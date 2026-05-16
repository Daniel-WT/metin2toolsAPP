import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, X, User, Clock, Bell } from 'lucide-react';
import { appWindow } from '@tauri-apps/api/window';
import { useSpawn } from '../../contexts/SpawnContext';
import { cn } from '../../lib/utils';
import { MAP_COLORS } from './constants';
import { useWindowMemory } from '../../lib/windowMemory';

export function GheataTable() {
  const { 
    spawnData, 
    updateSpawnTime, 
    activeCH, 
    setActiveCH, 
    cycleStatus, 
    clearCH, 
    toggleBeaten, 
    toggleGenFals, 
    removePin,
    history,
    isHistoryOpen,
    setIsHistoryOpen,
    serverTimeOffset,
    playSpawnAlarm
  } = useSpawn();

  const channels = [1, 2, 3, 4, 5, 6];
  const [notationCH, setNotationCH] = useState<number | null>(null);
  const [editType, setEditType] = useState<'sef' | 'gen'>('sef');
  const [editRoom, setEditRoom] = useState('');
  const roomInputRef = useRef<HTMLInputElement>(null);
  const isPopout = window.location.search.includes('view=gheatatable');
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [showOnFeedback, setShowOnFeedback] = useState(false);
  useWindowMemory('gheatatable-popout');

  useEffect(() => {
    if (isPopout) {
      appWindow.setDecorations(false).catch(console.error);
    }
  }, [isPopout]);

  const stats = useMemo(() => {
    const s: Record<string, { sef: number, gen: number, total: number }> = {};
    history.forEach(entry => {
      const rooms = entry.rooms || {};
      Object.entries(rooms).forEach(([rid, chs]) => {
        if (rid === '_nf') return;
        Object.values(chs as any).forEach((e: any) => {
          if (e.type === 'notfound') return;
          if (!s[rid]) s[rid] = { sef: 0, gen: 0, total: 0 };
          s[rid].total++;
          if (e.type === 'sef') s[rid].sef++;
          else if (e.type === 'gen') s[rid].gen++;
        });
      });
    });
    return s;
  }, [history]);

  const sortedStats = useMemo(() => {
    return Object.entries(stats)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 8);
  }, [stats]);

  const VALID_ROOMS = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','F'];

  const confirmAdd = () => {
    if (!editType || !editRoom || notationCH === null) return;
    const roomUpper = editRoom.toUpperCase();
    if (!VALID_ROOMS.includes(roomUpper)) return;
    
    const syncedNow = new Date(Date.now() + serverTimeOffset);
    updateSpawnTime(editType, notationCH, roomUpper, syncedNow.toISOString());
    setNotationCH(null);
    setEditRoom('');
  };

  useEffect(() => {
    if (notationCH !== null) {
      setTimeout(() => roomInputRef.current?.focus(), 100);
    }
  }, [notationCH]);

  return (
    <div 
      className={cn("flex flex-col h-full animate-in fade-in duration-500 overflow-hidden relative", isPopout && "group/popout")}
      onContextMenu={(e) => {
        if (isPopout && (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute('data-tauri-drag-region'))) {
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
      {isPopout && (
        <>
          {/* Drag Region - Inset to allow resizing at edges */}
          <div data-tauri-drag-region className="absolute inset-1 z-0 cursor-default" />
          
          {/* Status Overlay */}
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
        </>
      )}
      <div className={cn("p-0 overflow-hidden mx-auto max-w-[500px] w-full flex-1 flex flex-col relative z-10", !isPopout && "card border-white/5 bg-[#0c0c0e]/50 backdrop-blur-sm")}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <table className="w-full h-full text-left border-collapse table-fixed">
            <thead className={cn(isPopout && "select-none")}>
              <tr className="bg-white/[0.02]">
              <th {...(isPopout ? { 'data-tauri-drag-region': '' } : {})} className={cn(isPopout ? "py-1 w-[10%]" : "py-2 w-[40px]", "text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-white/5 text-center")}>CH</th>
              <th {...(isPopout ? { 'data-tauri-drag-region': '' } : {})} className={cn(isPopout ? "py-1 w-[25%]" : "py-2 w-[80px]", "text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-white/5 text-center")}>Status</th>
              <th {...(isPopout ? { 'data-tauri-drag-region': '' } : {})} className={cn(isPopout ? "py-1 w-[40%]" : "py-2 w-[110px]", "text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-white/5 text-center")}>Camere</th>
              {!isPopout && (
                <th className="px-1 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-r border-white/5 text-center w-[35px]">
                  <MapPin className="w-2.5 h-2.5 mx-auto text-slate-600" />
                </th>
              )}
              <th {...(isPopout ? { 'data-tauri-drag-region': '' } : {})} className={cn(isPopout ? "py-1 w-[25%]" : "py-2 w-[65px]", "text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 text-center")}>Gen. F</th>
              </tr>
            </thead>
          <tbody>
            {channels.map((ch) => {
              const chSpawns: string[] = [];
              const rooms = spawnData?.rooms || {};
              Object.entries(rooms).forEach(([roomId, channelsData]) => {
                if (roomId === '_nf') return;
                if (channelsData && channelsData[`ch${ch}`]) chSpawns.push(roomId);
              });

              const isNotFound = rooms._nf?.[`ch${ch}`]?.type === 'notfound';
              const mainRoom = chSpawns.find(id => id === '18' || id === 'F') || chSpawns[0];
              const entry = mainRoom ? rooms[mainRoom]?.[`ch${ch}`] : null;
              const isDead = entry?.dead;
              const isGoing = !!entry?.going;
              const type = entry?.type;
              const hasPin = !!(spawnData?.pins?.[`ch${ch}`]?.x);

              const goingColor = entry?.goingColor || '#10b981';
              let chStyle = "border-l-4 border-transparent";
              let chInlineStyle: React.CSSProperties | undefined;
              let rowBg = "hover:bg-white/[0.02]";
              let statusCellBg = "";

              if (hasPin) {
                chStyle = "border-l-4 border-accent-gold bg-accent-gold/5";
              } else if (isNotFound) {
                chStyle = "border-l-4 border-slate-400 bg-white/[0.04]";
                statusCellBg = "bg-white/[0.08]";
              } else if (isDead) {
                chStyle = "border-l-4 border-red-500/50 bg-red-500/5";
              } else if (isGoing) {
                chStyle = "border-l-4";
                chInlineStyle = { borderLeftColor: goingColor, backgroundColor: `${goingColor}12` };
              } else if (type === 'gen') {
                chStyle = "border-l-4 border-blue-500 bg-blue-500/5";
              } else if (type === 'sef') {
                chStyle = "border-l-4 border-emerald-400 bg-emerald-400/5";
              }

              return (
                <tr key={ch} className={cn("border-b border-white/5 transition-all group", rowBg)}>
                  <td
                    className={cn(
                      isPopout ? "h-[14%]" : "py-2",
                      "font-black text-[10px] text-center select-none transition-all cursor-pointer pointer-events-auto",
                      chStyle,
                      isPopout && "text-[9px]"
                    )}
                    style={chInlineStyle}
                    onClick={(e) => {
                      if (e.shiftKey) { toggleBeaten(ch); } 
                      else {
                        setEditRoom(mainRoom || '');
                        setEditType(type as any || 'sef');
                        setNotationCH(ch);
                      }
                    }}
                    onContextMenu={(e) => { e.preventDefault(); clearCH(ch); }}
                  >
                    CH{ch}
                  </td>
                  <td 
                    className={cn(isPopout ? "h-[14%]" : "py-2", "text-center cursor-pointer transition-colors px-0.5 pointer-events-auto", statusCellBg)}
                    onClick={() => {
                      if (mainRoom) cycleStatus(mainRoom, ch);
                      else setNotationCH(ch);
                    }}
                    onContextMenu={(e) => { e.preventDefault(); clearCH(ch); }}
                  >
                    {(() => {
                      if (hasPin) return <span className="text-[9px] font-black text-accent-gold flex items-center justify-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> ASCUNS</span>;
                      if (mainRoom) {
                        if (isDead) return <span className="text-[9px] font-black text-red-500">DEAD</span>;
                        if (isGoing) return (
                          <div
                            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md border mx-auto w-fit"
                            style={{
                              color: goingColor,
                              backgroundColor: `${goingColor}22`,
                              borderColor: `${goingColor}55`,
                              boxShadow: `0 0 10px ${goingColor}30`,
                            }}
                          >
                            <User className="w-3 h-3 flex-shrink-0" />
                            <span className="text-[11px] font-black leading-none tracking-tight">{entry?.going}</span>
                          </div>
                        );
                        if (type === 'gen') return <span className="text-[9px] font-black text-blue-400">GENERAL</span>;
                        return <span className="text-[9px] font-black text-emerald-500">SEF</span>;
                      }
                      if (isNotFound) return <span className="text-[9px] font-black text-slate-100 bg-slate-100/10 px-1.5 py-0.5 rounded shadow-sm border border-white/5">NOT FOUND</span>;
                      return <span className="text-[9px] font-black text-slate-800 opacity-20 group-hover:opacity-100 transition-opacity">+ NOTARE</span>;
                    })()}
                  </td>
                  <td className={cn(isPopout ? "h-[14%] px-1" : "py-2 px-1", "pointer-events-auto")}>
                    <div className="flex flex-wrap gap-1">
                      {chSpawns.map(id => {
                        const roomEntry = rooms[id]?.[`ch${ch}`];
                        const rDead = roomEntry?.dead;
                        const rType = roomEntry?.type;
                        return (
                          <button 
                            key={id} 
                            onClick={(e) => { e.stopPropagation(); cycleStatus(id, ch); }}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold border transition-all hover:scale-105",
                              rDead 
                                ? "bg-red-500/10 text-red-500/30 border-red-500/10 line-through" 
                                : rType === 'gen'
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            )}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  {!isPopout && (
                    <td className="px-1 py-3 text-center pointer-events-auto">
                      <button 
                        onClick={() => setActiveCH(activeCH === ch ? null : ch)}
                        onContextMenu={(e) => { e.preventDefault(); if (hasPin) removePin(ch); }}
                        className={cn(
                          "p-1.5 rounded-lg border transition-all relative group",
                          activeCH === ch 
                            ? "shadow-[0_0_15px_rgba(255,255,255,0.1)] animate-pulse" 
                            : "bg-white/5 border-white/5 text-slate-600 hover:text-white"
                        )}
                        style={{ 
                          borderColor: (activeCH === ch || hasPin) ? MAP_COLORS[ch - 1] : undefined,
                          color: (activeCH === ch || hasPin) ? MAP_COLORS[ch - 1] : undefined,
                          backgroundColor: activeCH === ch ? `${MAP_COLORS[ch - 1]}15` : undefined
                        }}
                      >
                        <MapPin className={cn("w-3.5 h-3.5", activeCH === ch ? "fill-current" : "")} />
                        {hasPin && !activeCH && (
                          <div 
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                            style={{ backgroundColor: MAP_COLORS[ch - 1] }}
                          />
                        )}
                      </button>
                    </td>
                  )}
                  <td className={cn(isPopout ? "h-[14%]" : "py-2", "text-center pointer-events-auto")}>
                    <div className="flex gap-0.5 justify-center">
                      <button 
                        onClick={() => toggleGenFals(ch, '18')} 
                        className={cn(
                          "w-7 h-5 rounded font-black text-[8px] border transition-all",
                          spawnData?.genFals?.[`ch${ch}`]?.gf18 ? "bg-accent-gold/20 border-accent-gold text-accent-gold" : "bg-white/5 border-white/5 text-slate-800"
                        )}
                      >
                        18
                      </button>
                      <button 
                        onClick={() => toggleGenFals(ch, 'F')} 
                        className={cn(
                          "w-7 h-5 rounded font-black text-[8px] border transition-all",
                          spawnData?.genFals?.[`ch${ch}`]?.gfF ? "bg-accent-gold/20 border-accent-gold text-accent-gold" : "bg-white/5 border-white/5 text-slate-800"
                        )}
                      >
                        F
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Notation Modal */}
      {notationCH !== null && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center pointer-events-auto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setNotationCH(null)} />
          <div className={cn(
            "relative w-full card border-white/10 shadow-2xl animate-in zoom-in-95 duration-150",
            isPopout ? "p-3 rounded-xl mx-2" : "p-5 rounded-2xl mx-3"
          )}>
            <div className={cn("flex items-center justify-between", isPopout ? "mb-3" : "mb-4")}>
              <div className="flex items-center gap-2">
                <span className={cn("font-black text-slate-100", isPopout ? "text-[11px]" : "text-sm")}>
                  Canal {notationCH}
                </span>
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Notare</span>
              </div>
              <button onClick={() => setNotationCH(null)} className="text-slate-500 hover:text-white p-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>

            <div className={cn("space-y-2", isPopout ? "" : "space-y-3")}>
              <div className="flex p-0.5 bg-slate-900 rounded-lg border border-white/5">
                <button
                  onClick={() => setEditType('sef')}
                  className={cn(
                    "flex-1 rounded-md font-black uppercase tracking-widest transition-all",
                    isPopout ? "py-1.5 text-[9px]" : "py-2 text-[10px]",
                    editType === 'sef' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-slate-600"
                  )}
                >Sef</button>
                <button
                  onClick={() => setEditType('gen')}
                  className={cn(
                    "flex-1 rounded-md font-black uppercase tracking-widest transition-all",
                    isPopout ? "py-1.5 text-[9px]" : "py-2 text-[10px]",
                    editType === 'gen' ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-slate-600"
                  )}
                >Gen</button>
              </div>

              <input
                ref={roomInputRef}
                type="text"
                value={editRoom}
                onChange={(e) => setEditRoom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setNotationCH(null); }}
                placeholder="1-29 SAU F"
                className={cn(
                  "w-full bg-slate-900 border border-white/5 rounded-lg text-center font-bold text-white outline-none focus:border-accent-gold/50 transition-all uppercase",
                  isPopout ? "px-2 py-2 text-sm" : "px-4 py-3 text-lg"
                )}
              />

              {(() => {
                const chNotations: string[] = [];
                Object.entries(spawnData?.rooms || {}).forEach(([rid, chs]) => {
                  if (rid !== '_nf' && chs?.[`ch${notationCH}`]) chNotations.push(rid);
                });
                const roomUpper = editRoom.toUpperCase();
                const hasRegularRoom = chNotations.some(rid => rid !== '18' && rid !== 'F');
                const isLocked = hasRegularRoom && !chNotations.includes(roomUpper);
                const isValid = editRoom && VALID_ROOMS.includes(roomUpper);

                return (
                  <>
                    {isLocked && (
                      <p className="text-[9px] font-black text-red-500 uppercase tracking-widest text-center animate-pulse">
                        Canal Blocat! Șterge notarea veche.
                      </p>
                    )}
                    <button
                      onClick={confirmAdd}
                      disabled={!isValid || isLocked}
                      className={cn(
                        "w-full font-black text-[10px] uppercase tracking-widest rounded-lg transition-all",
                        isPopout ? "py-2" : "py-2.5",
                        isLocked
                          ? "bg-slate-800 text-slate-600 cursor-not-allowed border border-white/5"
                          : "bg-accent-gold hover:bg-gold-light text-bg-primary"
                      )}
                    >
                      {isLocked ? 'Blocat' : 'Salvează'}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
