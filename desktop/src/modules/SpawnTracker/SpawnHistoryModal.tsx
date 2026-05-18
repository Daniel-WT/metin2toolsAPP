import React, { useState, useMemo } from 'react';
import { X, Calendar, Download, BarChart3, List, Bug, RotateCcw, Trash2, ArrowRight } from 'lucide-react';
import { useSpawn } from '../../contexts/SpawnContext';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SpawnHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SpawnHistoryModal({ isOpen, onClose }: SpawnHistoryModalProps) {
  const { history, typeHistory } = useSpawn();
  const { user, viewAsMember } = useAuth();
  const isAdmin = (user?.role === 'admin' || user?.role === 'superadmin' || user?.isSuperAdmin) && !viewAsMember;
  
  const [activeTab, setActiveTab] = useState<'list' | 'prob' | 'debug'>('list');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const filteredHistory = useMemo(() => {
    if (!filterFrom && !filterTo) return history;
    const from = filterFrom ? new Date(filterFrom).getTime() : 0;
    const to = filterTo ? new Date(filterTo).getTime() + 86400000 : Infinity;
    return history.filter(h => h.ts >= from && h.ts <= to);
  }, [history, filterFrom, filterTo]);

  const stats = useMemo(() => {
    const s: Record<string, { sef: number, gen: number, total: number }> = {};
    let totalSef = 0;
    let totalGen = 0;
    let totalEntries = 0;

    filteredHistory.forEach(entry => {
      const rooms = (entry.rooms || {}) as Record<string, any>;
      Object.entries(rooms).forEach(([rid, chData]) => {
        if (rid === '_nf') return;
        
        // Handle both Web (Array) and Pro (Object) formats
        const chList = Array.isArray(chData) ? chData : Object.values(chData);
        
        chList.forEach((e: any) => {
          if (e.type === 'notfound') return;
          if (!s[rid]) s[rid] = { sef: 0, gen: 0, total: 0 };
          s[rid].total++;
          totalEntries++;
          if (e.type === 'sef') { s[rid].sef++; totalSef++; }
          else if (e.type === 'gen') { s[rid].gen++; totalGen++; }
        });
      });
    });

    return { 
      rooms: s, 
      totalSef, 
      totalGen, 
      totalEntries,
      avgSef: filteredHistory.length > 0 ? (totalSef / filteredHistory.length).toFixed(1) : '0',
      avgGen: filteredHistory.length > 0 ? (totalGen / filteredHistory.length).toFixed(1) : '0'
    };
  }, [filteredHistory]);

  const sortedStats = useMemo(() => {
    return Object.entries(stats.rooms)
      .sort(([, a], [, b]) => b.total - a.total);
  }, [stats]);

  const exportCSV = () => {
    let csv = '';
    const dl = (filename: string) => {
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    if (activeTab === 'prob') {
      const spawns = filteredHistory.length || 1;
      csv  = 'Camera,Capetenii,Generali,Total,% Capetenii,% Generali,Avg/spawn Capetenii,Avg/spawn Generali\n';
      sortedStats.forEach(([rid, s]) => {
        const pSef = s.total > 0 ? ((s.sef / s.total) * 100).toFixed(1) : '0.0';
        const pGen = s.total > 0 ? ((s.gen / s.total) * 100).toFixed(1) : '0.0';
        csv += `${rid},${s.sef},${s.gen},${s.total},${pSef}%,${pGen}%,${(s.sef / spawns).toFixed(2)},${(s.gen / spawns).toFixed(2)}\n`;
      });
      csv += `\nTOTAL,${stats.totalSef},${stats.totalGen},${stats.totalEntries},,,,\n`;
      csv += `Spawnuri analizate,${spawns}\n`;
      dl('probabilitati-spawn.csv');
    } else if (activeTab === 'list') {
      csv  = 'Data,Ora,Tip,Capetenii,Generali,CH1,CH2,CH3,CH4,CH5,CH6\n';
      filteredHistory.forEach(h => {
        const d = new Date(h.ts);
        const date = d.toLocaleDateString('ro-RO');
        const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        let sCount = 0, gCount = 0;
        const chRooms: string[] = Array(6).fill('');
        Object.entries(h.rooms || {}).forEach(([rid, chData]: any) => {
          const chList = Array.isArray(chData) ? chData : Object.values(chData);
          (chList as any[]).forEach((e: any) => {
            if (e.type === 'sef') sCount++;
            else if (e.type === 'gen') gCount++;
            const chIdx = (e.ch ?? 0) - 1;
            if (chIdx >= 0 && chIdx < 6) chRooms[chIdx] = rid;
          });
        });
        csv += `${date},${time},${h.spawnType || 'simplu'},${sCount},${gCount},${chRooms.join(',')}\n`;
      });
      dl('istoric-spawn.csv');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl h-[85vh] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white tracking-tight">Istoric Spawnuri</h2>
            <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setActiveTab('list')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'list' ? "bg-accent-gold text-bg-primary" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <List className="w-3 h-3" /> Istoric
              </button>
              <button 
                onClick={() => setActiveTab('prob')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'prob' ? "bg-accent-gold text-bg-primary" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <BarChart3 className="w-3 h-3" /> Probabilități
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-all"
              >
                <Download className="w-3 h-3" /> Export
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveTab('debug')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'debug' ? "bg-red-500/20 text-red-500 border border-red-500/30" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <Bug className="w-3 h-3" /> Debug
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-white/5 bg-white/[0.01] flex items-center gap-4">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Perioada:</span>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-slate-300 outline-none focus:border-accent-gold/50"
            />
            <span className="text-slate-700">—</span>
            <input 
              type="date" 
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-slate-300 outline-none focus:border-accent-gold/50"
            />
            <button 
              onClick={() => { setFilterFrom(''); setFilterTo(''); }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-400 hover:text-white transition-all"
            >
              Toate
            </button>
          </div>
          <div className="ml-auto flex items-center gap-4">
             <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/50" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Căpetenii</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-blue-500/50" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Generali</span>
             </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'list' && (
            <div className="space-y-3">
              {filteredHistory.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-600">
                  <List className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Niciun spawn înregistrat în această perioadă.</p>
                </div>
              ) : (
                filteredHistory.map((h, idx) => {
                  const date = new Date(h.ts);
                  const isToday = new Date().toDateString() === date.toDateString();
                  const timeStr = isToday 
                    ? `Azi, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : date.toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                  
                  // Calculate counts for this entry
                  let sCount = 0, gCount = 0;
                  Object.values(h.rooms || {}).forEach((chData: any) => {
                    const chList = Array.isArray(chData) ? chData : Object.values(chData);
                    chList.forEach((e: any) => {
                      if (e.type === 'sef') sCount++;
                      else if (e.type === 'gen') gCount++;
                    });
                  });

                  return (
                    <div key={h.ts || idx} className="group p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all flex items-center gap-4">
                      <div className="w-24 text-[11px] font-bold text-slate-400">{timeStr}</div>
                      
                      <div className="flex items-center gap-1.5">
                        <div className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-black text-emerald-500">{sCount}</div>
                        <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] font-black text-blue-500">{gCount}</div>
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border",
                          h.spawnType === 'dublu' ? "bg-accent-gold/10 border-accent-gold/30 text-accent-gold" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                        )}>
                          {h.spawnType || 'Simplu'}
                        </div>
                      </div>

                      <div className="flex-1 flex gap-2 ml-4">
                        {[1,2,3,4,5,6].map(ch => {
                          let roomFound = '';
                          let isSef = true;
                          let isNF = false;
                          Object.entries(h.rooms || {}).forEach(([rid, chData]: any) => {
                             if (Array.isArray(chData)) {
                               const found = chData.find(e => e.ch === ch);
                               if (found) {
                                 roomFound = rid;
                                 isSef = found.type === 'sef';
                                 isNF = found.type === 'notfound' || rid === '_nf';
                               }
                             } else {
                               if (chData[`ch${ch}`]) {
                                 roomFound = rid;
                                 isSef = chData[`ch${ch}`].type === 'sef';
                                 isNF = chData[`ch${ch}`].type === 'notfound' || rid === '_nf';
                               }
                             }
                          });

                          return (
                            <div key={ch} className="flex-1 bg-white/[0.03] border border-white/5 rounded-lg p-2 flex flex-col items-center justify-center min-h-[40px]">
                              {roomFound ? (
                                isNF ? (
                                  <>
                                    <span className="text-[11px] font-black text-slate-600">NF</span>
                                    <span className="text-[8px] font-black text-slate-700 uppercase tracking-tighter">CH{ch}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className={cn(
                                      "text-[11px] font-black",
                                      isSef ? "text-emerald-400" : "text-blue-400"
                                    )}>{roomFound}</span>
                                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">CH{ch}</span>
                                  </>
                                )
                              ) : (
                                <span className="text-slate-800 text-xs">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-accent-gold transition-all" title="Restaurează acest spawn">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button className="p-2 bg-white/5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-500 transition-all" title="Șterge din istoric">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'prob' && (
            <div className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-4xl font-black text-emerald-400 mb-1">{stats.totalSef}</span>
                  <span className="text-xs font-bold text-emerald-500/80 uppercase tracking-widest mb-2">Căpetenii ({stats.totalEntries > 0 ? ((stats.totalSef / stats.totalEntries) * 100).toFixed(1) : 0}%)</span>
                  <span className="text-[10px] text-slate-500">~{stats.avgSef} / spawn</span>
                </div>
                <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-4xl font-black text-blue-400 mb-1">{stats.totalGen}</span>
                  <span className="text-xs font-bold text-blue-500/80 uppercase tracking-widest mb-2">Generali ({stats.totalEntries > 0 ? ((stats.totalGen / stats.totalEntries) * 100).toFixed(1) : 0}%)</span>
                  <span className="text-[10px] text-slate-500">~{stats.avgGen} / spawn</span>
                </div>
              </div>

              {/* Probability List */}
              <div className="space-y-4 px-2">
                <div className="flex items-center justify-between px-1 mb-2 text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 pb-2">
                  <span>Analiză Detaliată Camere</span>
                  <span className="text-slate-500">Date colectate din {filteredHistory.length} spawnuri ({stats.totalEntries} intrări)</span>
                </div>
                {sortedStats.map(([rid, s], i) => {
                  const pct = ((s.total / stats.totalEntries) * 100).toFixed(1);
                  const sefPct = (s.sef / s.total) * 100;
                  const genPct = (s.gen / s.total) * 100;

                  return (
                    <div key={rid} className="flex items-center gap-4">
                      <div className="w-8 text-sm font-black text-slate-300 text-center">{rid}</div>
                      <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden flex border border-white/5">
                        <div className="h-full bg-emerald-500/50 transition-all duration-1000" style={{ width: `${sefPct}%` }} />
                        <div className="h-full bg-blue-500/50 transition-all duration-1000" style={{ width: `${genPct}%` }} />
                      </div>
                      <div className="w-12 text-[11px] font-black text-accent-gold text-right">{pct}%</div>
                      <div className="w-16 flex items-center justify-end gap-1">
                        <span className="text-[10px] font-bold text-emerald-500/80">{s.sef}</span>
                        <span className="text-[10px] text-slate-700">/</span>
                        <span className="text-[10px] font-bold text-blue-500/80">{s.gen}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ultimele 200 schimbări de tip spawn:</h3>
                <div className="px-2 py-0.5 rounded bg-red-500/10 text-[9px] font-black text-red-500 uppercase tracking-widest border border-red-500/20">
                  Sistem Monitorizare
                </div>
              </div>

              <div className="space-y-1.5 px-2">
                {typeHistory.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-700">
                    <RotateCcw className="w-10 h-10 mb-3 opacity-20 animate-spin-slow" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Nicio schimbare înregistrată</p>
                  </div>
                ) : (
                  typeHistory.map((log, idx) => {
                    const date = new Date(log.ts);
                    const dateStr = date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                    const timeStr = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const localH = log.hourUtc ?? log.hourLocal ?? new Date(log.ts).getUTCHours();
                    const parityStr = (localH % 2 === 0) ? 'pară' : 'impară';
                    const reason = log.reason || 'auto-switch';
                    const reasonLabel = reason === 'calibrare_manuala' ? 'calibrare manuală'
                      : reason === 'auto-switch' ? 'switch automat'
                      : reason === 'delayed_switch' ? 'switch după CH6'
                      : reason === 'reset_scheduled' ? 'reset ciclu'
                      : reason;

                    return (
                      <div key={idx} className="flex items-center gap-6 py-2 px-3 bg-white/[0.01] border border-white/5 rounded-lg hover:bg-white/[0.03] transition-all group">
                        <div className="w-28 text-[11px] font-medium text-slate-500 font-mono flex-shrink-0">
                          {dateStr} <span className="text-slate-400">{timeStr}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
                            log.from === 'dublu' ? "bg-accent-gold/10 border-accent-gold/30 text-accent-gold shadow-[0_0_10px_rgba(212,175,55,0.1)]" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                          )}>
                            {log.from}
                          </div>

                          <ArrowRight className="w-3 h-3 text-slate-700 group-hover:text-slate-500 transition-colors" />

                          <div className={cn(
                            "px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
                            log.to === 'dublu' ? "bg-accent-gold/10 border-accent-gold/30 text-accent-gold shadow-[0_0_10px_rgba(212,175,55,0.1)]" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                          )}>
                            {log.to}
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] italic text-slate-500 font-medium">{reasonLabel}</span>
                          <span className="text-[9px] text-slate-700">ora {localH} ({parityStr}){log.userName ? ` · ${log.userName}` : ''}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
