import React from 'react';
import { Flame } from 'lucide-react';
import { cn } from '../../lib/utils';

interface RoomIndicatorProps {
  id: string;
  label: string;
  x: number;
  y: number;
  isSpawn: boolean;
  w: number;
  h: number;
  roomChannels: any;
  genFals: any;
  onAction: (roomId: string, label: string, e: React.MouseEvent, type: 'sef' | 'gen') => void;
  onGenFalsToggle?: (roomId: string, e: React.MouseEvent) => void;
}

export function RoomIndicator({ id, label, x, y, isSpawn, w, h, roomChannels, genFals, onAction, onGenFalsToggle }: RoomIndicatorProps) {
  const chList = Object.keys(roomChannels || {}).map(k => k.replace('ch', ''));
  const activeEntries = Object.values(roomChannels || {}).filter((e: any) => e && !e.dead);
  const goingEntries = activeEntries.filter((e: any) => e.going);
  const sefCount = activeEntries.filter((e: any) => e.type === 'sef').length;
  const genCount = activeEntries.filter((e: any) => e.type === 'gen').length;
  
  const isRoyal = sefCount >= 2;
  const isMixed = sefCount > 0 && genCount > 0;
  const hasGoing = goingEntries.length > 0;
  const allDead = activeEntries.length === 0 && Object.values(roomChannels || {}).some((e: any) => e && e.dead);

  let dotStyle: React.CSSProperties = { 
    left: `${x}%`, 
    top: `${y}%`, 
    width: `${Number(w) * 0.6}%`, 
    height: `${Number(h) * 0.6}%`,
    background: 'rgba(10,11,14,0.82)', 
    borderColor: 'rgba(224,125,64,0.55)',
    borderWidth: '2px',
    color: '#64748b'
  };

  if (!isSpawn) {
    dotStyle = { ...dotStyle, background: 'rgba(10,11,14,0.4)', borderColor: 'rgba(100,100,120,0.1)', opacity: 0.3 };
  } else if (isRoyal) {
    dotStyle = { 
      ...dotStyle, 
      background: 'radial-gradient(circle at 50% 50%, #c8962e, #8a651e)', 
      borderColor: '#f1c40f', 
      color: '#1a1a1a',
      boxShadow: '0 0 30px rgba(200, 150, 46, 0.6)'
    };
  } else if (isMixed) {
    dotStyle = { 
      ...dotStyle, 
      background: 'linear-gradient(135deg, #1a1b23, #2d1b4d)', 
      borderColor: '#a29bfe', 
      color: '#a29bfe', 
      boxShadow: '0 0 15px rgba(162, 155, 254, 0.3)' 
    };
  } else if (allDead) {
    dotStyle = { ...dotStyle, background: 'rgba(224, 82, 82, 0.05)', borderColor: 'rgba(224, 82, 82, 0.2)', color: '#e05252', opacity: 0.5 };
  } else if (hasGoing) {
    dotStyle = { 
      ...dotStyle, 
      background: 'rgba(0, 230, 180, 0.1)', 
      borderColor: '#00e6b4', 
      color: '#00e6b4',
      boxShadow: '0 0 20px rgba(0, 230, 180, 0.4)'
    };
  } else if (genCount > 0) {
    dotStyle = { 
      ...dotStyle, 
      background: 'rgba(74, 158, 255, 0.05)', 
      borderColor: '#4a9eff', 
      color: '#4a9eff' 
    };
  } else if (sefCount > 0) {
    dotStyle = { 
      ...dotStyle, 
      background: 'rgba(76, 175, 130, 0.05)', 
      borderColor: '#4caf82', 
      color: '#4caf82',
      boxShadow: '0 0 15px rgba(76, 175, 130, 0.2)'
    };
  }

  return (
    <div 
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-none border transition-all z-10 room-trigger shadow-2xl",
        isSpawn ? "cursor-pointer hover:shadow-accent-gold/20 active:scale-95" : "cursor-default",
        isRoyal && "room-on-fire z-20"
      )}
      style={dotStyle}
      onClick={(e) => { if (!isSpawn) return; onAction(id, label, e, 'sef'); }}
      onContextMenu={(e) => { e.preventDefault(); if (!isSpawn) return; onAction(id, label, e, 'gen'); }}
      onAuxClick={(e) => { e.preventDefault(); if ((id === '18' || id === 'F') && onGenFalsToggle) onGenFalsToggle(id, e); }}
    >
      {isRoyal && (
        <div className="absolute -top-8 left-0 right-0 flex justify-center pointer-events-none z-30">
          <span className="text-2xl animate-bounce drop-shadow-[0_0_12px_rgba(241,196,15,0.8)]">👑</span>
        </div>
      )}

      {/* Going Players Labels Above (deduplicated by name) */}
      {hasGoing && (() => {
         const uniqueGoing = goingEntries.reduce((acc: any[], e: any) => {
           if (!acc.find((a: any) => a.going === e.going)) acc.push(e);
           return acc;
         }, []);
         return (
           <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none z-[40]">
             {uniqueGoing.map((re: any, idx: number) => (
               <span 
                 key={idx} 
                 className="text-[7px] font-black px-1.5 py-0.5 rounded-sm border border-black/20 shadow-xl animate-in fade-in zoom-in duration-300 whitespace-nowrap" 
                 style={{ background: re.goingColor || '#00e6b4', color: '#000' }}
               >
                 {re.going}
               </span>
             ))}
           </div>
         );
      })()}

      {/* Room Label - Absolutely centered */}
      <div className="absolute inset-0 flex items-center justify-center font-black text-[12px] pointer-events-none">
        {label}
      </div>
      
      {isSpawn && chList.length > 0 && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 flex justify-center gap-0.5 pointer-events-none">
          {chList.map((chKey) => {
            const re = roomChannels[`ch${chKey}`];
            const bgColor = re?.dead ? '#e05252' : re?.going ? re.goingColor || '#00e6b4' : re?.type === 'gen' ? '#4a9eff' : '#4caf82';
            const isGoing = !!re?.going;
            return (
              <span 
                key={chKey} 
                className={cn(
                  "rounded-[1px] font-black text-black border border-black/10 whitespace-nowrap transition-all",
                  "px-1 py-0.5 text-[8px]",
                  isGoing && "ring-1 ring-white/50 animate-pulse"
                )} 
                style={{ background: bgColor, opacity: re?.dead ? 0.5 : 1 }}
              >
                {chKey}
              </span>
            );
          })}
        </div>
      )}

      {/* Gen Fals Indicators */}
      {(id === '18' || id === 'F') && (() => {
        const fakeChs: string[] = [];
        Object.entries(genFals || {}).forEach(([chKey, val]: [string, any]) => {
          if (id === '18' && val?.gf18) fakeChs.push(chKey.replace('ch', ''));
          if (id === 'F' && val?.gfF) fakeChs.push(chKey.replace('ch', ''));
        });
        if (fakeChs.length === 0) return null;
        return (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 pointer-events-none">
            <div className="flex gap-1">
              {fakeChs.sort().map(c => (
                <div key={c} className="relative group/fake">
                  <span className="w-4 h-4 flex items-center justify-center rounded-[3px] bg-red-950/40 text-[8px] font-black text-red-500 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                    {c}
                  </span>
                  <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-500 rounded-full border border-bg-primary shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
