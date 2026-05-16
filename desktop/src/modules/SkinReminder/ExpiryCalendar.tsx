import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X as CloseIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CalItem {
  id: string;
  name: string;
  account: string;
  category: string;
  expiresAt: number;
}

const CAT_COLOR: Record<string, string> = {
  'skin-arma':  '#60a5fa',
  'costum':     '#c084fc',
  'frizura':    '#2dd4bf',
  'atac-auto':  '#fbbf24',
  'manusa':     '#fb923c',
  'insotitor':  '#fb7185',
  'sase-sapte': '#34d399',
};

const CAT_LABEL: Record<string, string> = {
  'skin-arma':  'Skin Armă',
  'costum':     'Costum',
  'frizura':    'Frizură',
  'atac-auto':  'Atac Auto',
  'manusa':     'Mănușă',
  'insotitor':  'Însoțitor',
  'sase-sapte': '6/7',
};

const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
const WEEKDAYS = ['Lu','Ma','Mi','Jo','Vi','Sâ','Du'];

const formatTimer = (ms: number) => {
  if (ms <= 0) return 'EXPIRAT';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}z ${h}h ${m}m` : `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};

interface Props {
  items: CalItem[];
  filterCats?: string[];
  onClose: () => void;
}

export default function ExpiryCalendar({ items, filterCats, onClose }: Props) {
  const visibleItems = filterCats ? items.filter(it => filterCats.includes(it.category)) : items;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selDay, setSelDay] = useState<number | null>(null);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelDay(null);
  };

  const dayMap = useMemo(() => {
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    const map: Record<number, CalItem[]> = {};
    visibleItems.forEach(it => {
      if (!it.expiresAt || it.expiresAt < start || it.expiresAt > end) return;
      const d = new Date(it.expiresAt).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(it);
    });
    return map;
  }, [visibleItems, year, month]);

  const todayMs = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);
  const firstDow = new Date(year, month, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - offset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const cellMs = new Date(year, month, dayNum).setHours(0,0,0,0);
    return { dayNum, isToday: cellMs === todayMs, dayItems: dayMap[dayNum] || [] };
  });

  const selItems = selDay
    ? (dayMap[selDay] || []).slice().sort((a, b) => a.expiresAt - b.expiresAt)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0d0d0f] border border-white/[0.07] rounded-2xl p-6 w-full max-w-[440px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[11px] font-black text-slate-100 uppercase tracking-widest">Calendar Expirări</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.06] text-slate-500 hover:text-white hover:border-white/20 transition-all"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.06] text-slate-500 hover:text-accent-gold hover:border-accent-gold/30 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-sm font-bold text-white">{MONTHS[month]} {year}</span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.06] text-slate-500 hover:text-accent-gold hover:border-accent-gold/30 transition-all"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[9px] font-black text-slate-600 uppercase tracking-widest py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="h-12" />;
            const { dayNum, isToday, dayItems } = cell;
            const isSel = selDay === dayNum;
            const hasItems = dayItems.length > 0;
            const uniqueCats = [...new Set(dayItems.map(it => it.category))];

            return (
              <button
                key={i}
                onClick={() => setSelDay(isSel ? null : dayNum)}
                className={cn(
                  "h-12 rounded-lg border flex flex-col items-center justify-start pt-1.5 gap-0.5 transition-all duration-150",
                  isSel
                    ? "border-accent-gold bg-accent-gold/[0.12]"
                    : isToday
                    ? "border-accent-gold/30 bg-accent-gold/[0.06]"
                    : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]"
                )}
              >
                <span className={cn(
                  "text-[11px] font-bold leading-none",
                  isSel || isToday ? "text-accent-gold" : hasItems ? "text-slate-200" : "text-slate-600"
                )}>
                  {dayNum}
                </span>
                {hasItems && (
                  <div className="flex gap-0.5 flex-wrap justify-center px-1">
                    {uniqueCats.slice(0, 3).map(cat => (
                      <span key={cat} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLOR[cat] || '#666' }} />
                    ))}
                    {uniqueCats.length > 3 && <span className="text-[7px] text-slate-500 leading-none">+</span>}
                  </div>
                )}
                {hasItems && (
                  <span className={cn("text-[8px] font-black leading-none", isSel ? "text-accent-gold" : "text-slate-600")}>
                    {dayItems.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Separator */}
        <div className="mt-4 pt-4 border-t border-white/[0.04]">
          {!selDay ? (
            <p className="text-[11px] text-slate-600 text-center py-2">Selectează o zi pentru a vedea detaliile</p>
          ) : (
            <>
              <p className="text-[10px] text-slate-500 mb-3">
                {selDay} {MONTHS[month]} {year}
                {selItems.length > 0 && (
                  <span className="text-slate-300 ml-1">
                    — <strong>{selItems.length} item{selItems.length !== 1 ? 'e' : ''}</strong>
                  </span>
                )}
              </p>
              {selItems.length === 0 ? (
                <p className="text-[11px] text-slate-600 text-center py-2">Niciun item nu expiră în această zi</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selItems.map(it => {
                    const ms = it.expiresAt - Date.now();
                    const timeColor = ms <= 0 ? 'text-red-500' : ms < 86400000 ? 'text-amber-400' : 'text-slate-400';
                    return (
                      <div key={it.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_COLOR[it.category] || '#666' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-200 truncate uppercase">{it.name}</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">@{it.account} · {CAT_LABEL[it.category] || it.category}</p>
                        </div>
                        <span className={cn('text-[10px] font-black whitespace-nowrap', timeColor)}>
                          {formatTimer(ms)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
