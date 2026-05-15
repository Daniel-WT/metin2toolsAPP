import { useState, useEffect } from 'react';
import { ArrowRight, History, ChevronRight, Users, Database, Cpu, Search } from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { appConfirm } from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

// ── Transfer types ──────────────────────────────────────────────────
interface Transfer {
  name: string;
  nameAfter?: string;
  from: string;
  to: string;
  level: number;
  champLevel: number;
  class?: string;
  exp?: number;
  champExp?: number;
  champExpBefore?: number;
  champExpDelta?: number;
  kingdom?: string;
  rankBefore?: number;
  rankAfter?: number;
  matchedByStats?: boolean;
  matchConfidence?: number;
}

interface NameChange {
  name?: string;
  nameBefore?: string;
  nameAfter: string;
  server: string;
  champLevel: number;
  matchConfidence?: number;
  champExpDelta?: number;
  rankBefore?: number;
  rankAfter?: number;
  level?: number;
}

interface HistoryEntry {
  date: string;
  prevDate: string;
  transfers: Transfer[];
  nameChanges?: NameChange[];
}

interface TransferData {
  lastUpdated: string | null;
  transfers: Transfer[];
  nameChanges: NameChange[];
  history: HistoryEntry[];
}

// ── Snapshot types ──────��───────────────────���───────────────────────
interface SnapshotPlayer {
  rank: number;
  name: string;
  level: number;
  champLevel: number;
  class?: string;
  exp?: number;
  champExp?: number;
  kingdom?: string;
  _status: 'stayed' | 'disparut' | 'nou';
}

interface SnapshotDiff {
  date?: string;
  [server: string]: SnapshotPlayer[] | string | undefined;
}

const SERVERS = ['Romania', 'Tara Romaneasca', 'Magyarorszag', 'Cesko', 'Polska'];
const WORKER_BASE = 'https://metin2tools.pages.dev';
const DAYS_RO = ['Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata'];


interface AvailableDate { date: string; hasBefore: boolean; hasAfter: boolean; }

function calcNextScanDates(scanDay: number) {
  const now = new Date();
  let daysUntil = (scanDay - now.getDay() + 7) % 7;
  if (daysUntil === 0 && now.getUTCHours() >= 21) daysUntil = 7;
  const nextDay = new Date(now);
  nextDay.setDate(now.getDate() + daysUntil);
  const beforeDate = new Date(nextDay);
  beforeDate.setUTCHours(7, 0, 0, 0);
  const fmt = (d: Date) => d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return {
    beforeStr: fmt(beforeDate) + ' la 09:00',
    afterStr: fmt(nextDay) + ' (dupa mentenanta)',
  };
}

function fmtExp(n: number): string {
  return Number(n).toLocaleString('ro-RO');
}

// Firebase stores JS arrays as indexed objects — normalize back to array
function toArr(v: any): any[] {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v).filter(Boolean);
}

// ── Transfers section ──────────────���────────────────────────────────
function TransfersSection({ data, serverFilter }: { data: TransferData; serverFilter: string }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedNC, setExpandedNC] = useState<number | null>(null);

  const filtered = toArr(data.transfers).filter((t: Transfer) => serverFilter === 'all' || t.to === serverFilter);
  const filteredNC = toArr(data.nameChanges).filter((nc: NameChange) => serverFilter === 'all' || nc.server === serverFilter);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Transferuri Recente</span>
        <span className="text-[11px] text-slate-600">{filtered.length} detectate</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-10 flex flex-col items-center gap-3 text-center">
          <Users className="w-7 h-7 text-slate-700" />
          <p className="text-slate-500 text-sm">Niciun transfer detectat</p>
          <p className="text-slate-600 text-xs">
            {serverFilter !== 'all' ? `Niciun transfer catre ${serverFilter}.` : 'Transferurile sunt verificate automat in fiecare miercuri.'}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {filtered.map((t, i) => {
            const isExpanded = expandedRow === i;
            const conf = t.matchConfidence ?? 100;
            const confColor = conf >= 85 ? 'text-emerald-400' : conf >= 55 ? 'text-yellow-400' : 'text-red-400';
            return (
              <div key={i}>
                <div
                  className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.015] cursor-pointer transition-colors"
                  onClick={() => setExpandedRow(isExpanded ? null : i)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-200 text-sm">{t.name}</span>
                      {t.nameAfter && t.nameAfter !== t.name && (
                        <span className="text-[10px] text-slate-500">(acum: {t.nameAfter})</span>
                      )}
                      {t.matchedByStats && t.matchConfidence != null && (
                        <span className={cn('text-[9px] font-black border rounded px-1 bg-current/5 border-current/30', confColor)}>
                          {t.matchConfidence}%
                        </span>
                      )}
                    </div>
                    {t.class && <span className="text-[10px] text-slate-600 font-bold">{t.class}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/[0.04] border border-white/[0.06] text-slate-500 uppercase">{t.from}</span>
                    <ArrowRight className="w-3 h-3 text-accent-gold/60" />
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent-gold/10 border border-accent-gold/20 text-accent-gold uppercase">{t.to}</span>
                  </div>
                  <div className="text-right shrink-0 w-20">
                    <div className="text-xs font-bold text-slate-200">CL {t.champLevel}</div>
                    <div className="text-[10px] text-slate-600">#{t.rankBefore} → #{t.rankAfter}</div>
                  </div>
                  <ChevronRight className={cn('w-3.5 h-3.5 text-slate-600 shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')} />
                </div>
                {isExpanded && (
                  <div className="px-5 py-3 bg-white/[0.01] border-b border-white/[0.03] animate-in slide-in-from-top-1 duration-150">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {t.champExpBefore != null && (
                        <>
                          <div><p className="text-[10px] text-slate-600">ChampExp inainte</p><p className="text-[11px] font-bold text-slate-300">{fmtExp(t.champExpBefore)}</p></div>
                          <div><p className="text-[10px] text-slate-600">ChampExp dupa</p><p className="text-[11px] font-bold text-slate-300">{fmtExp(t.champExp ?? 0)}</p></div>
                          <div><p className="text-[10px] text-slate-600">Delta</p><p className="text-[11px] font-bold text-emerald-400">+{fmtExp(t.champExpDelta ?? 0)}</p></div>
                        </>
                      )}
                      <div><p className="text-[10px] text-slate-600">Nivel</p><p className="text-[11px] font-bold text-slate-300">{t.level}</p></div>
                      {t.class && <div><p className="text-[10px] text-slate-600">Clasa</p><p className="text-[11px] font-bold text-slate-300">{t.class}</p></div>}
                      <div><p className="text-[10px] text-slate-600">Metoda</p><p className="text-[11px] font-bold text-slate-300">{t.matchedByStats ? `stat match · ${t.matchConfidence}%` : 'name match'}</p></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredNC.length > 0 && (
        <div className="space-y-2 pt-2">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Schimbari de Nume</span>
          <div className="card p-0 overflow-hidden">
            {filteredNC.map((nc, i) => {
              const isExpanded = expandedNC === i;
              const oldName = nc.nameBefore || nc.name || '?';
              const conf = nc.matchConfidence;
              const confColor = conf == null ? '' : conf >= 85 ? 'text-emerald-400' : conf >= 55 ? 'text-yellow-400' : 'text-red-400';
              return (
                <div key={i}>
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.03] last:border-0 cursor-pointer hover:bg-white/[0.015] transition-colors"
                    onClick={() => setExpandedNC(isExpanded ? null : i)}
                  >
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-slate-400 truncate">{oldName}</span>
                      <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-200 truncate">{nc.nameAfter}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{nc.server}</span>
                    <span className="text-[11px] font-bold text-slate-400 shrink-0">CL {nc.champLevel}</span>
                    {conf != null && <span className={cn('text-[10px] font-black shrink-0', confColor)}>{conf}%</span>}
                    <ChevronRight className={cn('w-3 h-3 text-slate-700 shrink-0 transition-transform duration-150', isExpanded && 'rotate-90')} />
                  </div>
                  {isExpanded && (
                    <div className="px-5 py-3 bg-white/[0.01] border-b border-white/[0.03] animate-in slide-in-from-top-1 duration-150">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {nc.champExpDelta != null && (
                          <div><p className="text-[10px] text-slate-600">Delta ChampExp</p><p className="text-[11px] font-bold text-emerald-400">+{fmtExp(nc.champExpDelta)}</p></div>
                        )}
                        {nc.rankBefore != null && (
                          <div><p className="text-[10px] text-slate-600">Rank inainte</p><p className="text-[11px] font-bold text-slate-300">#{nc.rankBefore}</p></div>
                        )}
                        {nc.rankAfter != null && (
                          <div><p className="text-[10px] text-slate-600">Rank dupa</p><p className="text-[11px] font-bold text-slate-300">#{nc.rankAfter}</p></div>
                        )}
                        {nc.level != null && (
                          <div><p className="text-[10px] text-slate-600">Nivel</p><p className="text-[11px] font-bold text-slate-300">{nc.level}</p></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Snapshot viewer section ─────────────────────────────────────────
function SnapshotSection({ diff, serverFilter }: { diff: SnapshotDiff; serverFilter: string }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'disparut' | 'nou'>('all');
  const [search, setSearch] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const serversToShow = serverFilter === 'all' ? SERVERS : [serverFilter];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Jucatori Scrape-uiti</span>
        {diff.date && <span className="text-[10px] text-slate-600">{diff.date}</span>}
      </div>

      {/* Status filter + search */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'disparut', 'nou'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all',
              statusFilter === s
                ? s === 'disparut' ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : s === 'nou' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-accent-gold/20 border-accent-gold/40 text-accent-gold'
                : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
            )}
          >
            {s === 'all' ? 'Toti' : s === 'disparut' ? 'Disparuti' : 'Noi'}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input
            type="text"
            placeholder="Cauta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 w-40 text-[11px] bg-white/[0.03] border border-white/[0.06] rounded-lg text-slate-300 placeholder-slate-600 focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      {serversToShow.map(srv => {
        // Firebase converts arrays to indexed objects — normalize back to array
        const raw = diff[srv] as any;
        const allPlayers: SnapshotPlayer[] = !raw ? [] : Array.isArray(raw) ? raw : Object.values(raw).filter(Boolean) as SnapshotPlayer[];
        const q = search.trim().toLowerCase();
        const players = allPlayers.filter(p => {
          if (statusFilter !== 'all' && p._status !== statusFilter) return false;
          if (q && !p.name.toLowerCase().includes(q)) return false;
          return true;
        });
        const disparutCount = allPlayers.filter(p => p._status === 'disparut').length;
        const nouCount = allPlayers.filter(p => p._status === 'nou').length;

        if (serverFilter === 'all' && allPlayers.length === 0) return null;

        return (
          <div key={srv} className="space-y-1">
            {/* Server header */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-bold text-slate-400">{srv}</span>
              <span className="text-[10px] text-slate-600">{allPlayers.filter(p => p._status !== 'nou').length} total</span>
              {disparutCount > 0 && <span className="text-[10px] text-red-500/80 font-bold">{disparutCount} disparuti</span>}
              {nouCount > 0 && <span className="text-[10px] text-emerald-500/80 font-bold">{nouCount} noi</span>}
            </div>

            {players.length === 0 ? (
              <p className="text-[11px] text-slate-600 px-1">Niciun rezultat.</p>
            ) : (
              <div className="card p-0 overflow-hidden">
                {players.slice(0, 120).map((p, i) => {
                  const key = srv + '||' + p.name;
                  const isExpanded = expandedKey === key;
                  const rowCls = p._status === 'disparut'
                    ? 'border-l-2 border-red-500/40 bg-red-500/[0.03]'
                    : p._status === 'nou'
                    ? 'border-l-2 border-emerald-500/40 bg-emerald-500/[0.03]'
                    : '';
                  return (
                    <div key={i}>
                      <div
                        className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.025] last:border-0 cursor-pointer hover:bg-white/[0.01] transition-colors', rowCls)}
                        onClick={() => setExpandedKey(isExpanded ? null : key)}
                      >
                        <span className="text-[10px] text-slate-600 w-8 shrink-0">#{p.rank}</span>
                        <span className="flex-1 text-[12px] font-bold text-slate-200 truncate">{p.name}</span>
                        {p.class && <span className="text-[10px] text-slate-500 shrink-0">{p.class}</span>}
                        <span className="text-[11px] font-bold text-slate-400 shrink-0">CL {p.champLevel}</span>
                        <span className="text-[10px] text-slate-600 shrink-0">Nv {p.level}</span>
                        {p._status !== 'stayed' && (
                          <span className={cn('text-[9px] font-black uppercase shrink-0',
                            p._status === 'disparut' ? 'text-red-400' : 'text-emerald-400'
                          )}>
                            {p._status}
                          </span>
                        )}
                        <ChevronRight className={cn('w-3 h-3 text-slate-700 shrink-0 transition-transform duration-150', isExpanded && 'rotate-90')} />
                      </div>
                      {isExpanded && (
                        <div className={cn('px-4 py-3 border-b border-white/[0.025] animate-in slide-in-from-top-1 duration-150', rowCls)}>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            <div><p className="text-[10px] text-slate-600">ChampExp</p><p className="text-[11px] font-bold text-slate-300">{fmtExp(p.champExp ?? 0)}</p></div>
                            {p.exp != null && <div><p className="text-[10px] text-slate-600">Exp</p><p className="text-[11px] font-bold text-slate-300">{fmtExp(p.exp)}</p></div>}
                            <div><p className="text-[10px] text-slate-600">Nivel</p><p className="text-[11px] font-bold text-slate-300">{p.level}</p></div>
                            <div><p className="text-[10px] text-slate-600">CL</p><p className="text-[11px] font-bold text-slate-300">{p.champLevel}</p></div>
                            <div><p className="text-[10px] text-slate-600">Rank</p><p className="text-[11px] font-bold text-slate-300">#{p.rank}</p></div>
                            {p.kingdom && <div><p className="text-[10px] text-slate-600">Regat</p><p className="text-[11px] font-bold text-slate-300">{p.kingdom}</p></div>}
                            {p.class && <div><p className="text-[10px] text-slate-600">Clasa</p><p className="text-[11px] font-bold text-slate-300">{p.class}</p></div>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdminScrapePanel({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (d: string) => void }) {
  const [scrapeStatus, setScrapeStatus] = useState<null | 'loading' | 'ok' | 'error'>(null);
  const [scrapeMsg, setScrapeMsg] = useState('');
  const [lastScrapeInfo, setLastScrapeInfo] = useState<{ before: string | null; after: string | null }>({ before: null, after: null });
  const [availableDates, setAvailableDates] = useState<AvailableDate[] | null>(null);
  const [scanDay, setScanDay] = useState(3);
  const autoSelectedRef = { current: false };

  useEffect(() => {
    // Build available dates from Firebase (transfers + scrapeLastTrigger)
    // The snapshot files are on the web app server, not accessible from here.
    // We derive which dates had scrapes from Firebase metadata instead.
    let scrapeBeforeDate: string | null = null;
    let scrapeAfterDate: string | null = null;
    let transfersLastUpdated: string | null = null;
    let transfersHistory: any[] = [];

    const rebuild = () => {
      const map: Record<string, { hasBefore: boolean; hasAfter: boolean }> = {};

      // All history entries had both before+after (detection requires both)
      transfersHistory.forEach((e: any) => {
        if (e.date) map[e.date] = { hasBefore: true, hasAfter: true };
      });
      if (transfersLastUpdated) {
        if (!map[transfersLastUpdated]) map[transfersLastUpdated] = { hasBefore: false, hasAfter: false };
        map[transfersLastUpdated].hasAfter = true;
      }
      // Override with actual scrape trigger info for current cycle
      if (scrapeAfterDate) {
        if (!map[scrapeAfterDate]) map[scrapeAfterDate] = { hasBefore: false, hasAfter: false };
        map[scrapeAfterDate].hasAfter = true;
      }
      if (scrapeBeforeDate) {
        if (!map[scrapeBeforeDate]) map[scrapeBeforeDate] = { hasBefore: false, hasAfter: false };
        map[scrapeBeforeDate].hasBefore = true;
      }

      const available = Object.entries(map)
        .map(([date, flags]) => ({ date, ...flags }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);

      setAvailableDates(available);
      if (!autoSelectedRef.current && available.length > 0) {
        autoSelectedRef.current = true;
        onSelectDate(available[0].date);
      }
    };

    const unsub1 = onValue(ref(db, 'meta/scrapeLastTrigger'), snap => {
      const val = snap.val();
      if (val) {
        scrapeBeforeDate = val.beforeAt ? new Date(val.beforeAt).toISOString().slice(0, 10) : null;
        scrapeAfterDate = val.afterDate || null;
        setLastScrapeInfo({
          before: val.beforeAt ? new Date(val.beforeAt).toLocaleString('ro-RO') : null,
          after: val.afterDate ? `${val.afterDate} ora ${val.afterLastHour ?? '?'}` : null,
        });
      }
      rebuild();
    });

    const unsub2 = onValue(ref(db, 'transfers'), snap => {
      const val = snap.val() || {};
      transfersLastUpdated = val.lastUpdated || null;
      transfersHistory = Array.isArray(val.history) ? val.history : [];
      rebuild();
    });

    const unsub3 = onValue(ref(db, 'meta/scrapeSettings'), snap => {
      const val = snap.val();
      if (val && typeof val.scanDay === 'number') setScanDay(val.scanDay);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const triggerScrape = async (mode: string, forceAfter: boolean) => {
    if (scrapeStatus === 'loading') return;
    if (!await appConfirm(`Declanseaza scrape ${mode.toUpperCase()}?`, { title: 'Colectare Date', variant: 'warning' })) return;
    setScrapeStatus('loading'); setScrapeMsg('');
    try {
      const r = await fetch(`${WORKER_BASE}/api/trigger-scrape`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, force_after: forceAfter })
      });
      const data = await r.json();
      if (data.ok) setScrapeStatus('ok');
      else { setScrapeStatus('error'); setScrapeMsg(data.error || 'Eroare'); }
    } catch (e: any) { setScrapeStatus('error'); setScrapeMsg(e.message); }
    setTimeout(() => setScrapeStatus(null), 4000);
  };

  const saveScanDay = (day: number) => {
    setScanDay(day);
    set(ref(db, 'meta/scrapeSettings'), { scanDay: day }).catch(() => {});
  };

  const next = calcNextScanDates(scanDay);
  const cardCls = 'bg-slate-900/40 border border-white/[0.05] border-t-2 border-t-accent-gold/30 rounded-xl p-4 flex flex-col gap-3';
  const btnCls = 'flex-1 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-[11px] font-black uppercase tracking-widest text-slate-400 hover:border-accent-gold/40 hover:text-accent-gold transition-all disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Colectare Date */}
        <div className={cardCls}>
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Colectare Date</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => triggerScrape('before', false)} disabled={scrapeStatus === 'loading'} className={btnCls}>Before</button>
            <button onClick={() => triggerScrape('after', true)} disabled={scrapeStatus === 'loading'} className={btnCls}>After</button>
          </div>
          <div className="space-y-1">
            {(['before', 'after'] as const).map(t => (
              <div key={t} className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{t}</span>
                <span className="text-[10px] text-slate-500">{lastScrapeInfo[t] || 'niciodata'}</span>
              </div>
            ))}
          </div>
          {scrapeStatus === 'loading' && <p className="text-[10px] text-slate-500">Se trimite...</p>}
          {scrapeStatus === 'ok' && <p className="text-[10px] text-emerald-400">Trimis. Verifica GitHub Actions.</p>}
          {scrapeStatus === 'error' && <p className="text-[10px] text-red-400">Eroare: {scrapeMsg}</p>}
        </div>

        {/* Card 2: Detectie — date chips */}
        <div className={cardCls}>
          <div className="flex items-center gap-2">
            <Cpu className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Detectie</span>
          </div>
          {availableDates === null ? (
            <p className="text-[10px] text-slate-600">Se cauta date...</p>
          ) : availableDates.length === 0 ? (
            <p className="text-[10px] text-slate-600">Niciun snapshot gasit.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availableDates.map(entry => (
                <button
                  key={entry.date}
                  onClick={() => onSelectDate(entry.date)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all',
                    selectedDate === entry.date
                      ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold'
                      : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:border-white/10 hover:text-slate-400'
                  )}
                >
                  <span>{entry.date}</span>
                  <div className="flex gap-1.5">
                    <span className={cn('px-1 py-0.5 rounded text-[8px] font-black tracking-wider', entry.hasBefore ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.03] text-slate-700')}>B</span>
                    <span className={cn('px-1 py-0.5 rounded text-[8px] font-black tracking-wider', entry.hasAfter ? 'bg-accent-gold/20 text-accent-gold' : 'bg-white/[0.03] text-slate-700')}>A</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Scanare Automata — full width */}
      <div className="bg-slate-900/40 border border-white/[0.05] border-t-2 border-t-accent-gold/30 rounded-xl p-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Scanare Automata</p>
        <div className="grid grid-cols-[auto_1fr] gap-5 items-start">
          <div className="space-y-2">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Ziua de scrape</p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <button
                  key={d}
                  onClick={() => saveScanDay(d)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md border text-[10px] font-black uppercase tracking-wider transition-all',
                    scanDay === d
                      ? 'bg-accent-gold/15 border-accent-gold/40 text-accent-gold'
                      : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:border-accent-gold/30 hover:text-accent-gold/80'
                  )}
                >
                  {DAYS_RO[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {[{ label: 'Urmatorul BEFORE', val: next.beforeStr }, { label: 'Urmatorul AFTER', val: next.afterStr }].map(({ label, val }) => (
              <div key={label} className="px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{label}</p>
                <p className="text-sm font-bold text-accent-gold mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function Transfers() {
  const { user } = useAuth();
  const isAdmin = !!(user?.isSuperAdmin || user?.permissions?.adminPanel);
  const [transferData, setTransferData] = useState<TransferData | null>(null);
  const [fbDiff, setFbDiff] = useState<SnapshotDiff | null>(null);
  const [loadingT, setLoadingT] = useState(true);
  const [serverFilter, setServerFilter] = useState('all');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    const unsub1 = onValue(ref(db, 'transfers'), snap => {
      setTransferData(snap.exists()
        ? snap.val() as TransferData
        : { lastUpdated: null, transfers: [], nameChanges: [], history: [] }
      );
      setLoadingT(false);
    });
    const unsub2 = onValue(ref(db, 'snapshotDiff'), snap => {
      setFbDiff(snap.exists() ? snap.val() as SnapshotDiff : null);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const displayDiff = fbDiff;

  return (
    <div className="space-y-6 animate-in">
      <header>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Transferuri</h2>
        <p className="text-slate-500 text-xs mt-1">
          {transferData?.lastUpdated ? `Actualizat: ${transferData.lastUpdated}` : 'Verificate automat in fiecare miercuri'}
        </p>
      </header>

      {/* Admin scrape section */}
      {isAdmin && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Admin</p>
          <AdminScrapePanel selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>
      )}

      {/* Server filter */}
      <div className="flex flex-wrap gap-2">
        {['all', ...SERVERS].map(srv => (
          <button
            key={srv}
            onClick={() => setServerFilter(srv)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all',
              serverFilter === srv
                ? 'bg-accent-gold/20 border-accent-gold/40 text-accent-gold'
                : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
            )}
          >
            {srv === 'all' ? 'Toate' : srv}
          </button>
        ))}
      </div>

      {/* Transfers */}
      {loadingT ? (
        <div className="text-center py-8 text-slate-600 text-sm">Se incarca transferuri...</div>
      ) : (
        <TransfersSection data={transferData!} serverFilter={serverFilter} />
      )}

      {/* History */}
      {(toArr(transferData?.history).length > 0) && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-300 transition-colors"
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            <History className="w-3.5 h-3.5" />
            Istoric Transferuri
            <ChevronRight className={cn('w-3 h-3 transition-transform duration-200', historyExpanded && 'rotate-90')} />
          </button>
          {historyExpanded && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              {toArr(transferData!.history).map((entry: HistoryEntry, i: number) => {
                const histFiltered = serverFilter === 'all' ? toArr(entry.transfers) : toArr(entry.transfers).filter((t: Transfer) => t.to === serverFilter);
                return (
                  <div key={i} className="card p-4">
                    <p className="text-[10px] text-slate-600 font-bold mb-2">{entry.prevDate} → {entry.date}</p>
                    {histFiltered.length === 0 ? (
                      <p className="text-[11px] text-slate-600">Niciun transfer</p>
                    ) : (
                      <div className="space-y-1.5">
                        {histFiltered.map((t, j) => (
                          <div key={j} className="flex items-center gap-2 text-[11px]">
                            <span className="font-bold text-slate-300">{t.name}</span>
                            {t.nameAfter && t.nameAfter !== t.name && <span className="text-slate-500">({t.nameAfter})</span>}
                            <span className="text-slate-600 ml-1">{t.from}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-accent-gold/50" />
                            <span className="text-accent-gold/80">{t.to}</span>
                            <span className="text-slate-600 ml-auto">CL{t.champLevel}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Snapshot viewer */}
      {displayDiff ? (
        <SnapshotSection diff={displayDiff} serverFilter={serverFilter} />
      ) : (
        <div className="card py-8 text-center">
          <p className="text-slate-600 text-sm">Niciun snapshot disponibil.</p>
          <p className="text-slate-700 text-xs mt-1">Jucatorii apar dupa ce se ruleaza o detectie de pe site.</p>
        </div>
      )}

    </div>
  );
}
