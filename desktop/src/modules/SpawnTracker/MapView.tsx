import React, { useRef, useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { WebviewWindow } from '@tauri-apps/api/window';
import { cn } from '../../lib/utils';
import { useSpawn } from '../../contexts/SpawnContext';
import { INITIAL_ROOMS, MAP_COLORS } from './constants';
import { RoomIndicator } from './RoomIndicator';
import { appWindow } from '@tauri-apps/api/window';

export function MapView() {
  const { spawnData, activeCH, setActiveCH, setMapDot, updateSpawnTime, setNotFound, clearCH } = useSpawn();
  const mapRef = useRef<HTMLImageElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{x: number, y: number, roomId: string, roomLabel: string, type: 'sef' | 'gen'} | null>(null);
  
  const isPopout = window.location.search.includes('view=map');
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [showOnFeedback, setShowOnFeedback] = useState(false);

  useEffect(() => {
    if (isPopout) {
      appWindow.setDecorations(false).catch(console.error);
    }
  }, [isPopout]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.room-trigger')) return;
      if (popover && popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popover]);

  const handleMapClick = (e: React.MouseEvent) => {
    if (activeCH === null || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMapDot(activeCH, x.toFixed(2), y.toFixed(2));
    setActiveCH(null);
  };

  const handleRoomAction = (roomId: string, label: string, e: React.MouseEvent, type: 'sef' | 'gen') => {
    setPopover({ x: e.clientX, y: e.clientY, roomId, roomLabel: label, type });
  };

  return (
    <div 
      className={cn(
        "relative mx-auto aspect-square rounded-3xl overflow-hidden border border-white/5 bg-black/20 group/map max-w-full max-h-full",
        activeCH !== null ? "cursor-crosshair" : "cursor-default",
        isPopout && "rounded-none h-screen w-screen border-none"
      )}
      onClick={handleMapClick}
      onContextMenu={(e) => {
        const isDragArea = (e.target as HTMLElement).hasAttribute('data-tauri-drag-region') || e.target === e.currentTarget;
        if (isPopout && isDragArea) {
          e.preventDefault();
          const next = !isAlwaysOnTop;
          setIsAlwaysOnTop(next);
          appWindow.setAlwaysOnTop(next).catch(console.error);
          if (next) {
            setShowOnFeedback(true);
            setTimeout(() => setShowOnFeedback(false), 2000);
          }
        } else {
          e.preventDefault();
        }
      }}
    >
      {isPopout && (
        <>
          {/* Draggable Area - Inset to allow resizing at edges */}
          <div data-tauri-drag-region className="absolute inset-2 z-10 cursor-default" />
          
          {/* Status Overlays */}
          <div className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-accent-gold/20 border border-accent-gold/40 rounded-full text-[10px] font-black uppercase tracking-widest text-accent-gold transition-all duration-500 pointer-events-none",
            isAlwaysOnTop ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}>
            Always on Top: OFF
          </div>
          <div className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 transition-all duration-500 pointer-events-none",
            showOnFeedback ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}>
            Always on Top: ON
          </div>

          <button 
            onClick={() => appWindow.close()}
            className="absolute top-2 right-2 z-50 p-1.5 bg-black/40 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-lg border border-white/5 transition-all opacity-0 group-hover/map:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </>
      )}
      {/* Map Content - Enforce strict 1:1 Aspect Ratio to keep rooms aligned */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-center p-4",
          isPopout && "p-0 pointer-events-none z-20"
        )}
      >
        <div 
          className={cn(
            "relative transition-transform duration-200 ease-out origin-center",
            isPopout && "z-20"
          )}
          style={{ 
            width: '100%', 
            height: '100%', 
            maxWidth: 'min(100%, 100vh)', 
            maxHeight: 'min(100%, 100vw)',
            aspectRatio: '1 / 1'
          }}
        >
          <img 
            ref={mapRef} 
            src="/map.png" 
            alt="Metin2 Map" 
            className={cn(
              "absolute inset-0 w-full h-full object-cover rounded-2xl shadow-2xl opacity-80 group-hover/map:opacity-100 transition-opacity",
              (activeCH !== null || !isPopout) ? "pointer-events-auto" : "pointer-events-none"
            )} 
          />

          <div className="absolute inset-0">
            {INITIAL_ROOMS.map(([id, label, x, y, isSpawn, w, h]) => (
              <div key={id as string} className="pointer-events-auto absolute" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, transform: 'translate(-50%, -50%)' }}>
                <RoomIndicator 
                  id={id as string}
                  label={label as string}
                  x={50}
                  y={50}
                  isSpawn={isSpawn as boolean}
                  w={100}
                  h={100}
                  roomChannels={spawnData?.rooms?.[id as string]}
                  genFals={spawnData?.genFals}
                  onAction={handleRoomAction}
                />
              </div>
            ))}
          </div>

          {/* Pins */}
          <div className="absolute inset-0 pointer-events-none">
            {spawnData?.pins && Object.entries(spawnData.pins).map(([chKey, pin]) => {
              if (!pin || !pin.x || !pin.y) return null;
              const chNum = parseInt(chKey.replace('ch', ''));
              const color = MAP_COLORS[chNum - 1] || '#10b981';
              return (
                  <div 
                    key={chKey} 
                    className={cn(
                      "absolute z-30 transition-all cursor-pointer pointer-events-auto",
                      chNum === activeCH ? "scale-125" : ""
                    )}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -100%)' }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removePin(chNum);
                    }}
                  >
                  {/* Marker body - Matching Web SVG */}
                  <div className="relative group cursor-pointer pointer-events-auto">
                    <svg 
                      viewBox="0 0 24 24" 
                      width="32" 
                      height="32" 
                      className="drop-shadow-2xl transition-transform group-hover:scale-110"
                    >
                      <path 
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" 
                        fill={color} 
                        stroke="#000" 
                        strokeWidth="0.5"
                      />
                    </svg>
                    <div 
                      className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full mb-1 px-1.5 py-0.5 bg-black/90 border border-white/20 rounded text-[9px] font-black text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      CH{chNum}
                    </div>
                    {/* CH Label inside the pin or below it to match web feel */}
                    <span 
                      className="absolute left-1/2 top-[9px] -translate-x-1/2 text-[8px] font-black text-black leading-none"
                    >
                      {chNum}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Popover */}
      {popover && (
        <div 
          ref={popoverRef} 
          className="fixed z-[100] w-48 p-3 shadow-2xl rounded-2xl animate-in zoom-in-95 duration-200 pointer-events-auto" 
          style={{ 
            left: Math.min(popover.x + 10, window.innerWidth - 200), 
            top: Math.min(popover.y + 10, window.innerHeight - 240), 
            background: 'rgba(15,16,20,0.92)', 
            border: '1px solid rgba(255,255,255,0.08)', 
            backdropFilter: 'blur(16px)' 
          }}
        >
          <div className="text-center mb-3">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Camera {popover.roomLabel}</p>
            <span className={cn("font-black uppercase text-[10px] tracking-widest", popover.type === 'sef' ? "text-emerald-400" : "text-blue-400")}>
              {popover.type === 'sef' ? '⚔ SEF' : '★ GENERAL'}
            </span>
          </div>

          {/* Active Notations in this Room */}
          {(() => {
            const roomNotations = spawnData?.rooms?.[popover.roomId] || {};
            const activeChs = Object.entries(roomNotations)
              .filter(([_, entry]) => entry && !entry.dead)
              .map(([chKey, entry]) => ({ ch: parseInt(chKey.replace('ch', '')), type: entry.type }));

            if (activeChs.length === 0) return null;

            return (
              <div className="mb-3 pb-3 border-b border-white/5 space-y-1">
                <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-2 px-1 text-center">Notări Active</p>
                {activeChs.sort((a, b) => a.ch - b.ch).map(({ ch, type }) => (
                  <div key={ch} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-2 py-1.5 border border-white/5 group/note">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-300">CH{ch}</span>
                      <span className={cn("text-[8px] font-bold px-1 rounded-[3px]", type === 'sef' ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400")}>
                        {type === 'sef' ? 'SEF' : 'GEN'}
                      </span>
                    </div>
                    <button onClick={() => clearCH(ch)} className="p-1 hover:bg-red-500/10 text-slate-600 hover:text-red-500 rounded transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map(ch => {
              const chNotations: string[] = [];
              if (spawnData?.rooms) {
                Object.entries(spawnData.rooms).forEach(([rid, chs]) => {
                  if (chs?.[`ch${ch}`]) chNotations.push(rid);
                });
              }
              
              const hasSefAnywhere = chNotations.some(rid => spawnData?.rooms?.[rid]?.[`ch${ch}`]?.type === 'sef');
              const isNotedInRegular = chNotations.some(rid => rid !== '18' && rid !== 'F' && rid !== '_nf');
              const alreadyNotedInThisRoom = chNotations.includes(popover.roomId);
              
              // Lock if it's a Sef (confirmed anywhere) 
              // OR if it's already in a regular room 
              // OR if it's already in THIS room
              const isLocked = hasSefAnywhere || isNotedInRegular || alreadyNotedInThisRoom;

              return (
                <button 
                  key={ch} 
                  disabled={isLocked}
                  onClick={() => { if (!isLocked) { updateSpawnTime(popover.type, ch, popover.roomId, new Date().toISOString()); setPopover(null); } }} 
                  onContextMenu={(e) => { e.preventDefault(); if (!isLocked) { setNotFound(ch); setPopover(null); } }}
                  className={cn(
                    "py-1.5 rounded-lg text-[10px] font-black border transition-all",
                    isLocked 
                      ? "opacity-20 cursor-not-allowed grayscale border-white/5 bg-black/40 text-slate-600" 
                      : "text-slate-400 border-white/5 bg-white/[0.02] hover:bg-white/10 hover:text-white hover:border-white/10"
                  )}
                >
                  CH{ch}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CH Selection Header */}
      <div className={cn(
        "absolute top-3 left-3 p-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex gap-2 z-20",
        isPopout && "pointer-events-auto"
      )}>
        {[1, 2, 3, 4, 5, 6].map(ch => {
          let isFound = false, isNotFound = false;
          Object.entries(spawnData?.rooms || {}).forEach(([rid, chs]) => {
            if (rid !== '_nf' && chs?.[`ch${ch}`]) isFound = true;
          });
          if (spawnData?.rooms?.['_nf']?.[`ch${ch}`]) isNotFound = true;
          if (spawnData?.pins?.[`ch${ch}`]?.x) isFound = true;

          return (
            <button 
              key={ch} 
              onClick={(e) => { e.stopPropagation(); if (isNotFound) clearCH(ch); else setNotFound(ch); }}
              className={cn(
                "w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-black transition-all",
                isNotFound || isFound
                  ? "opacity-50 border-white/10 bg-white/5 text-slate-400"
                  : "border-accent-gold/30 bg-accent-gold/5 text-accent-gold hover:border-accent-gold hover:scale-110"
              )}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCH(activeCH === ch ? null : ch); }}
            >
              CH{ch}
            </button>
          );
        })}
      </div>
    </div>
  );
}
