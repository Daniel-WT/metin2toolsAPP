import { useState, useEffect, useRef, useCallback } from 'react';
import { Server, Play, Square, Wifi, WifiOff, HelpCircle } from 'lucide-react';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const WORKER_BASE = 'https://metin2tools.pages.dev';
const POLL_INTERVAL = 3000;
const STALE_MS = 120_000;
const MY_CLIENT_ID = Math.random().toString(36).slice(2);

const SERVER_MAP: Record<string, {
  label: string; loginIp: string; loginPort: number;
  channels: { ch: number; ip: string; port: number }[];
}> = {
  romania: {
    label: 'Romania', loginIp: '79.110.92.72', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.72', port: 12105 }, { ch: 2, ip: '79.110.92.77', port: 12205 },
      { ch: 3, ip: '79.110.92.72', port: 12305 }, { ch: 4, ip: '79.110.92.77', port: 12405 },
      { ch: 5, ip: '79.110.92.72', port: 12505 }, { ch: 6, ip: '79.110.92.77', port: 12605 },
    ],
  },
  tara_romaneasca: {
    label: 'Tara Romaneasca', loginIp: '79.110.92.80', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.80', port: 12105 }, { ch: 2, ip: '79.110.92.81', port: 12205 },
      { ch: 3, ip: '79.110.92.80', port: 12305 }, { ch: 4, ip: '79.110.92.81', port: 12405 },
      { ch: 5, ip: '79.110.92.80', port: 12505 }, { ch: 6, ip: '79.110.92.81', port: 12605 },
    ],
  },
  magyarorszag: {
    label: 'Magyarorszag', loginIp: '79.110.92.86', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.86', port: 12105 }, { ch: 2, ip: '79.110.92.87', port: 12205 },
      { ch: 3, ip: '79.110.92.86', port: 12305 }, { ch: 4, ip: '79.110.92.87', port: 12405 },
      { ch: 5, ip: '79.110.92.86', port: 12505 }, { ch: 6, ip: '79.110.92.87', port: 12605 },
    ],
  },
  cesko: {
    label: 'Cesko', loginIp: '79.110.92.89', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.88', port: 12105 }, { ch: 2, ip: '79.110.92.89', port: 12205 },
      { ch: 3, ip: '79.110.92.88', port: 12305 }, { ch: 4, ip: '79.110.92.89', port: 12405 },
      { ch: 5, ip: '79.110.92.88', port: 12505 }, { ch: 6, ip: '79.110.92.89', port: 12605 },
    ],
  },
  polska: {
    label: 'Polska', loginIp: '79.110.92.90', loginPort: 11151,
    channels: [
      { ch: 1, ip: '79.110.92.90', port: 12105 }, { ch: 2, ip: '79.110.92.101', port: 12205 },
      { ch: 3, ip: '79.110.92.90', port: 12305 }, { ch: 4, ip: '79.110.92.101', port: 12405 },
      { ch: 5, ip: '79.110.92.90', port: 12505 }, { ch: 6, ip: '79.110.92.101', port: 12605 },
    ],
  },
};

interface EndpointStatus { online: boolean | null; checkedAt?: number; stale?: boolean }
type ServerStatusMap = Record<string, Record<string, EndpointStatus>>;
interface MonitorState { leaderId?: string; startedAt?: number; maxDurationMs?: number; lastPollAt?: number }

function p(teamId: string, path: string) {
  return `teams/${teamId}/serverStatus/${path}`;
}

async function checkEndpoint(ip: string, port: number): Promise<boolean> {
  try {
    const r = await fetch(
      `${WORKER_BASE}/api/check-server?ip=${encodeURIComponent(ip)}&port=${port}`,
      { signal: AbortSignal.timeout(9000) }
    );
    return !!(await r.json()).online;
  } catch { return false; }
}

function fmt(ts?: number) {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function ServerStatus() {
  const { user, viewAsMember } = useAuth();
  const isAdmin = (user?.isSuperAdmin || user?.permissions?.serverStatus) && !viewAsMember;
  const teamId = user?.teamId;

  const [statuses, setStatuses] = useState<ServerStatusMap>({});
  const [monitor, setMonitor] = useState<MonitorState>({});
  const [monitoring, setMonitoring] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    try { const s = JSON.parse(localStorage.getItem('ss_pro_servers') || 'null'); if (s) return s; } catch {}
    return Object.fromEntries(Object.keys(SERVER_MAP).map(k => [k, true]));
  });
  const [maxDuration, setMaxDuration] = useState(() => {
    try { const d = parseInt(localStorage.getItem('ss_pro_duration') || ''); if (d > 0) return d; } catch {}
    return 4 * 3600_000;
  });

  const monitoringRef = useRef(false);
  const pollInFlight   = useRef(false);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef        = useRef<Record<string, boolean | null>>({});

  // Firebase listeners
  useEffect(() => {
    if (!teamId) return;
    const now = Date.now();

    const unsubSrv = onValue(ref(db, p(teamId, 'servers')), snap => {
      const data = snap.val() || {};
      const parsed: ServerStatusMap = {};
      Object.keys(data).forEach(srv => {
        parsed[srv] = {};
        Object.keys(data[srv]).forEach(ep => {
          const e = data[srv][ep];
          parsed[srv][ep] = (e?.checkedAt && now - e.checkedAt > STALE_MS)
            ? { online: null, checkedAt: e.checkedAt, stale: true } : e;
        });
      });
      setStatuses(parsed);
    });

    const unsubMon = onValue(ref(db, p(teamId, '_monitor')), snap => {
      setMonitor(snap.val() || {});
    });

    return () => { unsubSrv(); unsubMon(); };
  }, [teamId]);

  const stopMonitor = useCallback(() => {
    monitoringRef.current = false;
    pollInFlight.current = false;
    setMonitoring(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (autoStopRef.current)  { clearTimeout(autoStopRef.current);  autoStopRef.current = null; }
    if (teamId) remove(ref(db, p(teamId, '_monitor')));
  }, [teamId]);

  const doPoll = useCallback(async () => {
    if (!monitoringRef.current || !teamId || pollInFlight.current) return;
    pollInFlight.current = true;

    try {
      await update(ref(db, p(teamId, '_monitor')), { lastPollAt: Date.now() });

      const checks: { srvKey: string; ep: string; ip: string; port: number }[] = [];
      Object.keys(SERVER_MAP).forEach(srvKey => {
        if (!selected[srvKey]) return;
        const srv = SERVER_MAP[srvKey];
        checks.push({ srvKey, ep: 'login', ip: srv.loginIp, port: srv.loginPort });
        srv.channels.forEach(ch => checks.push({ srvKey, ep: `ch${ch.ch}`, ip: ch.ip, port: ch.port }));
      });

      const results: { srvKey: string; ep: string; online: boolean }[] = [];
      for (let i = 0; i < checks.length; i += 6) {
        const batch = checks.slice(i, i + 6);
        const res = await Promise.all(batch.map(async c => ({
          srvKey: c.srvKey, ep: c.ep, online: await checkEndpoint(c.ip, c.port),
        })));
        results.push(...res);
      }

      const fbUp: Record<string, any> = {};
      const now = Date.now();
      results.forEach(r => {
        const key = `${r.srvKey}/${r.ep}`;
        if (prevRef.current[key] !== r.online) {
          fbUp[`servers/${r.srvKey}/${r.ep}`] = { online: r.online, checkedAt: now };
          prevRef.current[key] = r.online;
        }
      });
      if (Object.keys(fbUp).length) await update(ref(db, p(teamId, '')), fbUp);
    } finally {
      pollInFlight.current = false;
    }
  }, [teamId, selected]);

  const startMonitor = useCallback(() => {
    if (!isAdmin || !teamId || monitoringRef.current) return;
    if (!Object.values(selected).some(Boolean)) return;

    monitoringRef.current = true;
    pollInFlight.current = false;
    prevRef.current = {};
    setMonitoring(true);

    set(ref(db, p(teamId, '_monitor')), {
      leaderId: MY_CLIENT_ID, startedAt: Date.now(),
      maxDurationMs: maxDuration, lastPollAt: Date.now(),
    });

    doPoll();
    intervalRef.current = setInterval(doPoll, POLL_INTERVAL);
    autoStopRef.current = setTimeout(() => stopMonitor(), maxDuration);
  }, [isAdmin, teamId, selected, maxDuration, doPoll, stopMonitor]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoStopRef.current)  clearTimeout(autoStopRef.current);
  }, []);

  const isActive = !!monitor.leaderId && !!monitor.lastPollAt && (Date.now() - (monitor.lastPollAt || 0) < 15_000);
  const isLeader = monitor.leaderId === MY_CLIENT_ID;

  function toggleServer(key: string) {
    const next = { ...selected, [key]: !selected[key] };
    setSelected(next);
    try { localStorage.setItem('ss_pro_servers', JSON.stringify(next)); } catch {}
  }

  const selectedKeys = Object.keys(SERVER_MAP).filter(k => selected[k]);

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Server Status</h2>
          <p className="text-slate-500 text-sm mt-1">
            Monitorizare TCP live · check la fiecare <span className="text-slate-300 font-semibold">3s</span> · detectie in max <span className="text-slate-300 font-semibold">~12s</span>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap shrink-0">
          {/* Status pill */}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all',
            isActive
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-white/5 border-white/10 text-slate-600'
          )}>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'
            )} />
            {isActive ? (isLeader ? 'Monitorizezi tu' : 'Activ') : 'Oprit'}
          </div>

          {isAdmin && (
            <>
              <select
                value={maxDuration}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  setMaxDuration(v);
                  try { localStorage.setItem('ss_pro_duration', String(v)); } catch {}
                }}
                className="bg-bg-tertiary border border-white/10 rounded-xl px-3 py-1.5 text-[11px] text-slate-300 font-black uppercase tracking-widest outline-none focus:border-accent-gold/30 transition-colors"
              >
                {[['1h', 3600000], ['2h', 7200000], ['4h', 14400000], ['8h', 28800000]].map(([l, v]) => (
                  <option key={v} value={v as number}>{l}</option>
                ))}
              </select>

              {monitoring ? (
                <button onClick={stopMonitor}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors">
                  <Square className="w-3 h-3 fill-current" /> Stop
                </button>
              ) : (
                <button onClick={startMonitor}
                  disabled={isActive && !isLeader}
                  className={cn(
                    'flex items-center gap-2 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors',
                    isActive && !isLeader
                      ? 'bg-white/5 border border-white/10 text-slate-700 cursor-not-allowed'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 active:scale-95'
                  )}>
                  <Play className="w-3 h-3 fill-current" /> Start
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Server toggles */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(SERVER_MAP).map(([key, srv]) => (
          <button
            key={key}
            onClick={() => toggleServer(key)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all',
              selected[key]
                ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold'
                : 'bg-white/[0.02] border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20'
            )}
          >
            {srv.label}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {selectedKeys.length === 0 ? (
        <p className="text-slate-700 text-sm text-center py-16">Selectează cel puțin un server.</p>
      ) : (
        <div className={cn(
          'grid gap-4',
          selectedKeys.length === 1 ? 'grid-cols-1 max-w-sm' :
          selectedKeys.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' :
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}>
          {selectedKeys.map(srvKey => (
            <ServerCard
              key={srvKey}
              srv={SERVER_MAP[srvKey]}
              loginStatus={statuses[srvKey]?.login}
              channels={statuses[srvKey] || {}}
              isMonitoring={isActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Status = 'online' | 'offline' | 'unknown';

function getStatus(e: EndpointStatus | undefined): Status {
  if (!e || e.online === null || e.stale) return 'unknown';
  return e.online ? 'online' : 'offline';
}

function ServerCard({ srv, loginStatus, channels, isMonitoring }: {
  srv: typeof SERVER_MAP[string];
  loginStatus: EndpointStatus | undefined;
  channels: Record<string, EndpointStatus>;
  isMonitoring: boolean;
}) {
  const loginSt = getStatus(loginStatus);
  const chStatuses = [1,2,3,4,5,6].map(i => ({ ch: i, st: getStatus(channels[`ch${i}`]) }));
  const onlineCount = chStatuses.filter(c => c.st === 'online').length;
  const allOnline = loginSt === 'online' && onlineCount === 6;
  const anyOffline = loginSt === 'offline' || chStatuses.some(c => c.st === 'offline');

  const overallSt: Status = allOnline ? 'online' : anyOffline ? 'offline' : 'unknown';

  return (
    <div className={cn(
      'relative rounded-2xl border p-5 overflow-hidden transition-all duration-500',
      overallSt === 'online'  ? 'bg-emerald-500/[0.03] border-emerald-500/20' :
      overallSt === 'offline' ? 'bg-red-500/[0.03] border-red-500/20' :
      'bg-bg-secondary border-white/[0.06]'
    )}>
      {/* Ambient glow */}
      <div className={cn(
        'absolute -right-8 -top-8 w-32 h-32 rounded-full blur-[60px] transition-all duration-700',
        overallSt === 'online'  ? 'opacity-[0.12] bg-emerald-400' :
        overallSt === 'offline' ? 'opacity-[0.10] bg-red-400' :
        'opacity-0'
      )} />

      {/* Header row */}
      <div className="flex items-start justify-between mb-5 relative">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center border transition-all',
            overallSt === 'online'  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
            overallSt === 'offline' ? 'bg-red-500/15 border-red-500/30 text-red-400' :
            'bg-white/5 border-white/10 text-slate-600'
          )}>
            {overallSt === 'online'  ? <Wifi className="w-5 h-5" /> :
             overallSt === 'offline' ? <WifiOff className="w-5 h-5" /> :
             <Server className="w-5 h-5" />}
          </div>
          <div>
            <h4 className="font-bold text-slate-100 font-display">{srv.label}</h4>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-0.5">
              {isMonitoring ? `Verificat la ${fmt(loginStatus?.checkedAt)}` : 'Monitorizare inactivă'}
            </p>
          </div>
        </div>

        {/* Overall badge */}
        <span className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border mt-0.5',
          overallSt === 'online'  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
          overallSt === 'offline' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
          'bg-white/5 border-white/10 text-slate-600'
        )}>
          {overallSt === 'online' ? 'Online' : overallSt === 'offline' ? 'Offline' : 'Necunoscut'}
        </span>
      </div>

      {/* Login row */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 rounded-xl mb-4 border text-xs font-bold transition-all',
        loginSt === 'online'  ? 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400' :
        loginSt === 'offline' ? 'bg-red-500/10 border-red-500/15 text-red-400' :
        'bg-white/[0.03] border-white/[0.06] text-slate-600'
      )}>
        <span>LOGIN</span>
        <div className={cn(
          'w-2 h-2 rounded-full',
          loginSt === 'online'  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' :
          loginSt === 'offline' ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)] animate-pulse' :
          'bg-slate-700'
        )} />
      </div>

      {/* Channels grid */}
      <div className="grid grid-cols-6 gap-2">
        {chStatuses.map(({ ch, st }) => (
          <div key={ch} className="flex flex-col items-center gap-1.5">
            <div className={cn(
              'w-full aspect-square rounded-lg flex items-center justify-center border text-[8px] font-black transition-all duration-300',
              st === 'online'  ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.15)]' :
              st === 'offline' ? 'bg-red-500/15 border-red-500/25 text-red-400' :
              'bg-white/[0.03] border-white/[0.06] text-slate-700'
            )}>
              {ch}
            </div>
            <div className={cn(
              'w-1.5 h-1.5 rounded-full transition-all duration-300',
              st === 'online'  ? 'bg-emerald-500 shadow-[0_0_4px_rgba(52,211,153,0.5)]' :
              st === 'offline' ? 'bg-red-500 animate-pulse' :
              'bg-white/10'
            )} />
          </div>
        ))}
      </div>

      {/* Footer: channel count */}
      {(loginSt !== 'unknown' || onlineCount > 0) && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
          <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest">Canale online</span>
          <span className={cn(
            'text-[11px] font-black',
            onlineCount === 6 ? 'text-emerald-400' : onlineCount > 0 ? 'text-amber-400' : 'text-red-400'
          )}>
            {onlineCount} / 6
          </span>
        </div>
      )}
    </div>
  );
}
