import React, { useState, useEffect } from 'react';
import { Activity, Users, Clock, Zap, Shield, ChevronRight, MessageSquare, AlertCircle, X as CloseIcon, Edit2, Check, Share2, Copy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { cn } from '../../lib/utils';
// @ts-ignore
import { APP_VERSION } from '../../../js/firebase-layer';

interface ChangelogItem {
  version: string;
  date: string;
  changes: string[];
  type: 'feat' | 'fix' | 'perf';
}

const CHANGELOG: ChangelogItem[] = [
  {
    version: 'v1.3.1',
    date: '18 May 2026',
    changes: [
      'Tweaks: lista de ferestre este acum scrollabila (suporta 10-15+ clienti)',
      'Tweaks: rezolutia clientului nu mai dispare daca jocul este minimizat in bara (cache Rust)',
      'Tweaks: ordinea ferestrelor este stabila la Refresh si la scanare automata',
      'Spawn: paritate simplu/dublu ora foloseste acum UTC corect (fix timezone)',
      'Spawn: indicatorii gen fals pe harta nu se mai suprapun cu notatiile normale',
      'Discord: embed-uri webhook curate si profesionale (author, title, description)',
    ],
    type: 'fix'
  },
  {
    version: 'v1.3.0',
    date: '17 May 2026',
    changes: [
      'Tweaks: preseturi grafice (Normal / Optimizat) si control individual per setare din user.cfg',
      'Tweaks: profile TCP cu hotkey-uri configurabile si cautare rapida procese',
      'Update dialog: notificarea de actualizare are acum design custom, fara fereastra Windows nativa',
      'Spawn: imbunatatiri alarm si UI pop-out',
    ],
    type: 'feat'
  },
  {
    version: 'v1.2.1',
    date: '17 May 2026',
    changes: [
      'Fix: stergerea unui cont il elimina acum si din Firebase Auth (URL Worker corectat)',
      'Fix: aprobarea unui cont nu mai afiseaza alerta de ban daca emailul era banat anterior',
      'Fix: cererile de cont in Admin Panel afiseaza corect (filtrare dupa status, nu account_requests)',
      'Fix: URL Worker actualizat pentru Server Status si Transferuri',
    ],
    type: 'fix'
  },
  {
    version: 'v1.2.0',
    date: '17 May 2026',
    changes: [
      'Aprobare conturi: conturile noi necesita aprobare de la Super-Admin inainte de a accesa aplicatia',
      'Ecran asteptare: utilizatorii cu cerere in asteptare vad un ecran dedicat pana la aprobare',
      'Admin Panel: tab-ul Cereri afiseaza acum atat cereri de cont cat si cereri de echipa',
      'Aprobare/respingere cont direct din Admin Panel cu buton dedicat',
    ],
    type: 'feat'
  },
  {
    version: 'v1.1.7',
    date: '17 May 2026',
    changes: [
      'Pop-out Gheata: pozitia si dimensiunea ferestrei sunt retinute la redeschidere',
      'Pop-out Harta: pozitia si dimensiunea ferestrei sunt retinute la redeschidere',
      'Modal notare Gheata: centrat si compact in pop-out mic, nu mai iese din fereastra',
      'Rata Gasire Boss: acum arata media bossi gasiti per slot de canal (6/6 = 100%)',
      'Indicator Going: badge mai vizibil cu glow si culoarea exacta a jucatorului',
      'Sound Engine Web: eliminat AudioContext singleton — nu mai exista pop/click la 30s',
      'Volum 0 Web: playback-ul nu mai porneste AudioContext cand volumul e pe 0',
    ],
    type: 'feat'
  },
  {
    version: 'v1.0.0',
    date: '15 May 2026',
    changes: [
      // TCP Close
      'TCP Close Connection: inchide conexiunile TCP ale oricarui client Metin2 cu un click',
      'Bind global pe tasta sau Mouse4/Mouse5 — functioneaza fara focus pe aplicatie',
      'Multi-client: aceeasi tasta poate inchide TCP la mai multi clienti simultan',
      'Anti-cheat safe: SetTcpEntry (iphlpapi.dll) — nu atinge memoria sau fisierele jocului',
      // Alarme Tab
      'Alarme Tab: alarme programate zilnic/saptamanal/lunar, remindere countdown, timere repetitive',
      'Alarmele globale se sincronizeaza cu toti membrii echipei via Firebase in timp real',
      'UTC Timezone: toti membrii aud alarma in acelasi moment real, indiferent de fus orar',
      'Pop-out Repeat Timer: fereastra always-on-top cu progres bar, countdown si buton Reset',
      'Volume Master: slider 0-100% in header, persistent, comanda toate sunetele din aplicatie',
      // Tweaks Tab
      'Tweaks Tab: rezolutie fereastra aplicata direct in metin2.cfg cu un click',
      'Preseturi predefinite + preseturi custom cu drag & drop si reordonare FLIP',
      'Window Title Changer: detecteaza si redenumeste toate ferestrele Metin2Client.exe deschise',
      'Admin Elevation: detectie automata + buton Restart Admin pentru drepturi ridicate',
      // Inventory
      'Inventory Sync: sincronizare bidirecționala cu site-ul (teams/{teamId}/inventory/items)',
      'selectedItem Live Sync: modalul ramane sincronizat cand alt membru editeaza simultan',
      'Notification Bell: panel de notificari pentru iteme expirate, sub 24h si depersonalizare',
      // Skin Reminder
      'Skin Reminder Overhaul: redesign complet al cardurilor — look premium, glassmorphic',
      'Custom Dialog System: modaluri tematice pentru stergere, reinnoire si depersonalizare',
      'Depersonalization Monitoring: countdown in timp real pana cand itemul devine tranzactionabil',
      'Smart Alert System: notificari la praguri critice (24h, 6h-1h) si avertizare 4 zile',
      // Audio
      'Audio Engine Rewrite: grafic audio refacut complet, tremolo LFO pe toate alarmele',
      'TwoMinuteBanner: banner vizual la 2 minute inainte de spawn, identic cu site-ul',
      'SpawnAlertModal: icon pulsant rosu, countdown per-canal, stergere automata la expirare',
      'High-Fidelity Notifications: alarma 2 minute inlocuita cu arpegiu D-Major melodic',
      // Spawn
      'Global Undo (Ctrl+Z): anuleaza orice actiune de spawn din orice fereastra',
      'Boss Cycle Automation: toggle automat Simplu/Dublu la ora exacta definita pe CH1',
      'Edit-in-Place: input timp apare doar la click, auto-formatare "1422" → "14:22"',
      // Widgets
      'Widget Era: pop-out-uri borderless pentru Timp Spawn, Gheata si Harta',
      'Map Pop-out: harta ca widget independent, mereu patrata si centrata',
      'Always on Top Toggle: click-dreapta pe background pentru pin fereastra',
      'Player Indicators: badge-uri flotante pe harta pentru jucatorii marcati ca Going',
      // Dashboard & Team
      'Dashboard Interactiv cu analiza globala Boss si istoric activitate echipa',
      'Sistem Alerte Skin Reminder (24h / 6h / 4 zile)',
      'Management Echipa & sincronizare Firebase in timp real',
    ],
    type: 'feat'
  }
];

const CHANGES_PREVIEW = 4;

function ChangelogCard({ item, onShowMore }: { item: ChangelogItem, onShowMore?: () => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hidden = item.changes.length - CHANGES_PREVIEW;

  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01] mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
            item.type === 'feat' ? 'text-accent-gold bg-accent-gold' :
            item.type === 'fix' ? 'text-blue-400 bg-blue-400' : 'text-purple-400 bg-purple-400'
          )} />
          <span className="text-xs font-black text-white uppercase tracking-widest">{item.version}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 font-bold">{item.date}</span>
          <ChevronRight className={cn("w-3 h-3 text-slate-600 transition-transform duration-300", isExpanded && "rotate-90")} />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
          <ul className="space-y-2 pt-2 border-t border-white/5">
            {item.changes.slice(0, CHANGES_PREVIEW).map((change, j) => (
              <li key={j} className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed italic">
                <ChevronRight className="w-3 h-3 text-accent-gold/40 shrink-0 mt-0.5" />
                {change}
              </li>
            ))}
          </ul>
          {hidden > 0 && onShowMore && (
            <button
              onClick={e => { e.stopPropagation(); onShowMore(); }}
              className="mt-3 w-full text-center text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-accent-gold transition-colors"
            >
              + încă {hidden} noutăți
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChangelogModalCard({ item }: { item: ChangelogItem }) {
  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
      <div className="p-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
            item.type === 'feat' ? 'text-accent-gold bg-accent-gold' :
            item.type === 'fix' ? 'text-blue-400 bg-blue-400' : 'text-purple-400 bg-purple-400'
          )} />
          <span className="text-xs font-black text-white uppercase tracking-widest">{item.version}</span>
        </div>
        <span className="text-[10px] text-slate-600 font-bold">{item.date}</span>
      </div>
      <div className="px-4 py-3">
        <ul className="space-y-2">
          {item.changes.map((change, j) => (
            <li key={j} className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed italic">
              <ChevronRight className="w-3 h-3 text-accent-gold/40 shrink-0 mt-0.5" />
              {change}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChangelogModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-bg-primary/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-accent-gold/10 flex items-center justify-center border border-accent-gold/20">
              <Shield className="w-5 h-5 text-accent-gold" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-display">Istoric Complet</h2>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Metin2 Tools Evolution</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
          {CHANGELOG.map(item => (
            <ChangelogModalCard key={item.version} item={item} />
          ))}
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.01] text-center">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Version Tracking System</p>
        </div>
      </div>
    </div>
  );
}

function ActivityModal({ isOpen, onClose, activity }: { isOpen: boolean, onClose: () => void, activity: any[] }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-bg-primary/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-400/10 flex items-center justify-center border border-emerald-400/20">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-display">Istoric Activitate</h2>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Metin2 Tools Team Log</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide">
          {activity.map((log, i) => (
            <div key={i} className="flex items-start gap-4 group cursor-default">
              <div className="relative shrink-0">
                <div 
                  className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white font-bold group-hover:border-white/30 transition-colors"
                  style={{ backgroundColor: `${log.userColor || '#c8962e'}15`, borderColor: `${log.userColor || '#c8962e'}30` }}
                >
                  <span style={{ color: log.userColor || '#c8962e' }}>
                    {(log.userName || 'U')[0].toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-200 truncate">{log.userName}</p>
                  <span className="text-[9px] text-slate-600 font-bold whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed italic">
                  {log.action}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.01] text-center">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Real-time Sincronization Enabled</p>
        </div>
      </div>
    </div>
  );
}

const SKIN_CAT_META: Record<string, { label: string; color: string; imgSrc: (item: any) => string }> = {
  'skin-arma': {
    label: 'Skin Armă', color: '#60a5fa',
    imgSrc: () => '/icons/arma.png',
  },
  'costum': {
    label: 'Costum', color: '#a78bfa',
    imgSrc: (item) => item.gender === 'F' ? '/icons/costum_f.png' : '/icons/costum_m.png',
  },
  'frizura': {
    label: 'Frizură', color: '#34d399',
    imgSrc: (item) => item.gender === 'F' ? '/icons/frizura_f.png' : '/icons/frizura_m.png',
  },
};

function SkinsExpiryModal({ isOpen, onClose, skins }: { isOpen: boolean, onClose: () => void, skins: any[] }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[85vh] bg-[#0c0c0e] border border-white/[0.07] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-white tracking-tight">Toate Expirările</h2>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-0.5">{skins.length} iteme monitorizate</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.05] mx-6" />

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-hide">
          {skins.map((item, i) => {
            const now = Date.now();
            const ms = item.expiresAt - now;
            const isUrgent = ms < 86400000 && ms > 0;
            const isExpired = ms <= 0;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const timeStr = isExpired ? 'EXPIRAT' : d > 0 ? `${d}z ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
            const pct = item.totalDuration > 0 ? Math.max(0, Math.min(100, (ms / item.totalDuration) * 100)) : 0;
            const meta = SKIN_CAT_META[item.category] ?? SKIN_CAT_META['costum'];
            const accentColor = isExpired ? '#ef4444' : isUrgent ? '#f97316' : meta.color;

            return (
              <div
                key={item.id}
                className="group flex items-center gap-4 p-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-200"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Icon */}
                <div className="shrink-0 relative">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/[0.06] overflow-hidden"
                    style={{ background: `${accentColor}10` }}
                  >
                    <img src={meta.imgSrc(item)} alt="" className="w-10 h-10 object-contain drop-shadow-lg" />
                  </div>
                  <div
                    className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0e]', isExpired ? 'bg-red-500' : isUrgent ? 'bg-orange-400 animate-pulse' : 'bg-emerald-500')}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-black text-white truncate uppercase tracking-tight">{item.name}</span>
                      <span
                        className="shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border"
                        style={{ color: accentColor, borderColor: `${accentColor}30`, background: `${accentColor}10` }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <span
                      className={cn('text-[12px] font-black tabular-nums shrink-0', isExpired ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-amber-400')}
                    >
                      {timeStr}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">@{item.account}</span>
                    <span className="text-[9px] text-slate-700 font-bold">
                      {new Date(item.expiresAt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-0.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${pct}%`, background: accentColor, boxShadow: `0 0 6px ${accentColor}60` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpawnStatsModal({ isOpen, onClose, stats }: { isOpen: boolean, onClose: () => void, stats: any }) {
  if (!isOpen) return null;

  const { globalSefPerc, globalGenPerc, globalSefCount, globalGenCount, sef24h, gen24h, globalRooms, spawnCount, globalTotalAttempts, globalTotalSlots, totalSessions, activeSpawns } = stats;
  const sortedRooms = Object.entries(globalRooms || {} as Record<string, number>)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5);
  const coverageRate = totalSessions > 0 ? (((activeSpawns ?? 0) / totalSessions) * 100).toFixed(0) : '0';
  const maxRoomCount = sortedRooms.length > 0 ? (sortedRooms[0][1] as number) : 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-white/[0.07] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-white tracking-tight">Analiză Globală Boss</h2>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-0.5">{activeSpawns ?? 0} acoperite · {totalSessions} totale</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white transition-all">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="h-px bg-white/[0.05] mx-6" />

        <div className="p-6 space-y-5 overflow-y-auto scrollbar-hide">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[28px] font-black text-emerald-400 tabular-nums">{activeSpawns ?? 0}</span>
                <span className="text-[15px] font-black text-slate-600 tabular-nums">/ {totalSessions}</span>
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Spawnuri Acoperite</div>
              <div className="text-[9px] font-bold text-slate-700">{coverageRate}% prezență</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
              <div className="text-[28px] font-black text-emerald-400 leading-none tabular-nums">{sef24h ?? 0}</div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Căpetenii · 24h</div>
              <div className="text-[9px] font-bold text-slate-700">
                <span className="text-emerald-400">{sef24h ?? 0}</span> căp · <span className="text-blue-400">{gen24h ?? 0}</span> gen
              </div>
            </div>
          </div>

          {/* Distribution */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Distribuție Tip Boss</p>

            {[
              { label: 'Căpetenii', pct: globalSefPerc, count: globalSefCount, color: '#10b981', glow: 'rgba(16,185,129,0.35)' },
              { label: 'Generali',  pct: globalGenPerc,  count: globalGenCount,  color: '#60a5fa', glow: 'rgba(96,165,250,0.35)' },
            ].map(row => (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: row.color }}>{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-white tabular-nums">{row.pct}%</span>
                    <span className="text-[9px] text-slate-600 font-bold tabular-nums">({row.count})</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${row.pct}%`, background: row.color, boxShadow: `0 0 8px ${row.glow}` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Top rooms */}
          <div className="space-y-2">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Top 5 Camere Probabile</p>

            {sortedRooms.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-[11px] text-slate-600 italic">
                Nu există suficiente date în istoric
              </div>
            ) : (
              <div className="space-y-1.5">
                {sortedRooms.map(([room, count], idx) => {
                  const pct = Math.round((count as number) / (spawnCount || 1) * 100);
                  const barPct = Math.round((count as number) / maxRoomCount * 100);
                  const isFirst = idx === 0;
                  return (
                    <div
                      key={room}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                        isFirst
                          ? 'border-amber-400/20 bg-amber-400/[0.04]'
                          : 'border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]'
                      )}
                    >
                      <span className={cn(
                        'w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black shrink-0',
                        isFirst ? 'bg-amber-400 text-black' : 'bg-white/5 text-slate-500'
                      )}>{idx + 1}</span>

                      <span className={cn('text-[11px] font-black uppercase tracking-wider flex-1', isFirst ? 'text-amber-400' : 'text-slate-300')}>
                        Camera {room}
                      </span>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barPct}%`, background: isFirst ? '#f59e0b' : '#475569' }}
                          />
                        </div>
                        <span className={cn('text-[11px] font-black tabular-nums w-10 text-right', isFirst ? 'text-amber-400' : 'text-slate-400')}>
                          {pct}%
                        </span>
                        <span className="text-[9px] text-slate-600 tabular-nums w-6">({count as number})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ setActiveTab }: { setActiveTab?: (tab: string) => void }) {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const [activeMembers, setActiveMembers] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showSkinsModal, setShowSkinsModal] = useState(false);
  const [showSpawnStatsModal, setShowSpawnStatsModal] = useState(false);
  const [stats, setStats] = useState({
    totalItems: 0,
    spawnCount: 0,
    sefPercentage: '0',
    avgPerSpawn: '0',
    activeTasks: 0,
    skinsIn7Days: [] as any[],
    chStats: {} as any
  });

  const [activity, setActivity] = useState<any[]>([]);
  const [teamName, setTeamName] = useState('');
  const [totalMembers, setTotalMembers] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const isLeader = user?.role === 'Leader' || user?.isSuperAdmin;

  useEffect(() => {
    if (!teamId) return;

    // Fetch team members for stats
    const presenceRef = ref(db, `teams/${teamId}/presence`);
    const unsubPresence = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setActiveMembers(Object.values(data));
      else setActiveMembers([]);
    });

    // Fetch team info and members
    const teamRef = ref(db, `teams/${teamId}`);
    const unsubTeam = onValue(teamRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const metadata = data.metadata || data || {};
        setTeamName(metadata.name || teamId);
        setInviteCode(metadata.inviteCode || '');
        
        const membersData = data.members || {};
        let count = Object.keys(membersData).length;
        
        // Count owner if not in members list
        const ownerId = metadata.ownerId || data.ownerId || data.leader || data.owner;
        if (ownerId && !membersData[ownerId]) {
          count++;
        }
        setTotalMembers(count);
      }
    });

    // Fetch recent activity
    const activityRef = query(ref(db, `teams/${teamId}/activity`), limitToLast(20));
    const unsubActivity = onValue(activityRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Sort strictly by timestamp descending (newest first)
        const list = Object.values(data) as any[];
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setActivity(list);
      }
    });

    // Listen to both history and active rooms for LIVE updates
    const historyRef = ref(db, `teams/${teamId}/spawn/history`);
    const activeRoomsRef = ref(db, `teams/${teamId}/spawn/rooms`);

    let historyData: any = {};
    let activeRoomsData: any = {};

    const updateStats = (hist: any, active: any) => {
      const chCounts: Record<string, { found: number, total: number, sef: number, gen: number, rooms: Record<string, number> }> = {
        'CH1': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} },
        'CH2': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} },
        'CH3': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} },
        'CH4': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} },
        'CH5': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} },
        'CH6': { found: 0, total: 0, sef: 0, gen: 0, rooms: {} }
      };

      let totalSef = 0, totalGen = 0, totalFoundEntries = 0, totalAllSlots = 0;
      const globalRooms: Record<string, number> = {};

      const processRooms = (rooms: any) => {
        Object.entries(rooms || {}).forEach(([rid, chs]: [string, any]) => {
          if (rid === '_nf') return;
          // Support array format [{ch, type}] (web) and object format {ch1: {type}} (pro)
          const channelEntries: Array<[string, any]> = Array.isArray(chs)
            ? chs.map((e: any, i: number) => [`CH${i + 1}`, e])
            : Object.entries(chs || {}).map(([k, v]) => [k.toUpperCase(), v]);
          channelEntries.forEach(([chName, e]) => {
            if (chCounts[chName]) {
              chCounts[chName].total++;
              totalAllSlots++;
              if (e.type === 'sef') {
                chCounts[chName].found++;
                chCounts[chName].sef++;
                chCounts[chName].rooms[rid] = (chCounts[chName].rooms[rid] || 0) + 1;
                globalRooms[rid] = (globalRooms[rid] || 0) + 1;
                totalSef++;
              } else if (e.type === 'gen') {
                chCounts[chName].gen++;
                totalGen++;
              }
              if (e.type !== 'notfound') totalFoundEntries++;
            }
          });
        });
      };

      let activeSpawns = 0;
      const now24 = Date.now();
      const cutoff24h = now24 - 86400000;
      let sef24h = 0;
      let gen24h = 0;

      const historyList = Object.values(hist || {});
      historyList.forEach((entry: any) => {
        processRooms(entry.rooms);
        if (((entry._sefCount || 0) + (entry._genCount || 0)) > 0) activeSpawns++;
        if ((entry.ts || 0) >= cutoff24h) {
          sef24h += entry._sefCount || 0;
          gen24h += entry._genCount || 0;
        }
      });

      if (active) {
        processRooms(active);
        let currentHasSef = false;
        let activeSef = 0;
        let activeGen = 0;
        Object.entries(active || {}).forEach(([rid, chs]: [string, any]) => {
          if (rid === '_nf') return;
          const vals: any[] = Array.isArray(chs) ? chs : Object.values(chs || {});
          vals.forEach((e: any) => {
            if (e.type === 'sef') { activeSef++; currentHasSef = true; }
            if (e.type === 'gen') { activeGen++; currentHasSef = true; }
          });
        });
        if (currentHasSef) activeSpawns++;
        sef24h += activeSef;
        gen24h += activeGen;
      }

      const totalSessions = historyList.length + (active ? 1 : 0);
      const totalGlobalHits = totalSef + totalGen;
      const sefProb = totalFoundEntries > 0 ? ((totalSef / totalFoundEntries) * 100).toFixed(1) : '0';
      const avgSef = totalSessions > 0 ? (totalSef / totalSessions).toFixed(1) : '0';

      setStats(prev => ({
        ...prev,
        spawnCount: totalSef,
        sefPercentage: sefProb,
        avgPerSpawn: avgSef,
        chStats: {
          globalSefPerc: totalGlobalHits > 0 ? ((totalSef / totalGlobalHits) * 100).toFixed(0) : '0',
          globalGenPerc: totalGlobalHits > 0 ? ((totalGen / totalGlobalHits) * 100).toFixed(0) : '0',
          globalSefCount: totalSef,
          globalGenCount: totalGen,
          sef24h,
          gen24h,
          globalRooms,
          spawnCount: totalSef,
          globalTotalAttempts: totalFoundEntries,
          globalTotalSlots: totalAllSlots,
          totalSessions,
          activeSpawns
        }
      }));
    };

    const unsubHistory = onValue(historyRef, (snapshot) => {
      historyData = snapshot.val() || {};
      updateStats(historyData, activeRoomsData);
    });

    const unsubRooms = onValue(activeRoomsRef, (snapshot) => {
      activeRoomsData = snapshot.val() || {};
      updateStats(historyData, activeRoomsData);
    });

    const skinsRef = ref(db, `teams/${teamId}/skinReminder/items`);
    const unsubSkins = onValue(skinsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data) as any[];
        const now = Date.now();
        const activeSkins = list.filter(i => i.expiresAt > now && ['skin-arma', 'costum', 'frizura', 'personalizat'].includes(i.category))
          .sort((a, b) => a.expiresAt - b.expiresAt);
        setStats(prev => ({ ...prev, skinsIn7Days: activeSkins }));
      } else {
        setStats(prev => ({ ...prev, skinsIn7Days: [] }));
      }
    });

    const invCountRef = ref(db, `teams/${teamId}/inventory/items`);
    const unsubInv = onValue(invCountRef, (snapshot) => {
      const data = snapshot.val();
      setStats(prev => ({ ...prev, totalItems: data ? Object.keys(data).length : 0 }));
    });

    return () => {
      unsubPresence();
      unsubActivity();
      unsubHistory();
      unsubRooms();
      unsubTeam();
      unsubSkins();
      unsubInv();
    };
  }, [teamId]);

  const handleRename = async () => {
    if (!newName.trim() || !teamId) return;
    try {
      const { update } = await import('firebase/database');
      await update(ref(db, `teams/${teamId}`), { name: newName });
      setIsEditingName(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateInvite = async () => {
    if (!teamId) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const { update } = await import('firebase/database');
      await update(ref(db, `teams/${teamId}`), { inviteCode: code });
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <ChangelogModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
      <ActivityModal isOpen={showActivityModal} onClose={() => setShowActivityModal(false)} activity={activity} />
      <SkinsExpiryModal isOpen={showSkinsModal} onClose={() => setShowSkinsModal(false)} skins={stats.skinsIn7Days} />
      <SpawnStatsModal isOpen={showSpawnStatsModal} onClose={() => setShowSpawnStatsModal(false)} stats={stats.chStats} />
      
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent-gold/20 via-slate-900 to-slate-900 border border-white/5 p-8">
        <div className="relative z-10">
          <h1 className="text-4xl font-black text-white mb-2">
            Salut, <span className="text-accent-gold">{user?.name || user?.email?.split('@')[0]}</span>!
          </h1>
          <p className="text-slate-400 max-w-md">
            Ești conectat la hub-ul central Metin2 Tools. <br />
            Toate datele sunt sincronizate cu echipa ta în timp real.
          </p>
        </div>
        {/* Abstract shapes for flair */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-gold/10 blur-[80px] rounded-full -mr-20 -mt-20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Activity */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div onClick={() => setActiveTab?.('inventory')} className="bg-slate-900/40 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer group">
              <Zap className="w-5 h-5 mb-4 opacity-50 group-hover:opacity-100 transition-opacity text-blue-400" />
              <div className="flex flex-col"><div className="text-4xl font-black mb-1 text-blue-400">{stats.totalItems}</div><div className="text-[10px] uppercase tracking-widest font-black text-blue-400">Iteme Inventar</div></div>
            </div>
            <div onClick={() => setShowSkinsModal(true)} className="bg-slate-900/40 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer group relative overflow-hidden">
              <Clock className="w-5 h-5 mb-4 opacity-50 group-hover:opacity-100 transition-opacity text-amber-400" />
              {stats.skinsIn7Days.length > 0 ? (
                <>
                  <div className="flex flex-col relative z-10">
                    <div className="text-2xl font-black mb-1 text-amber-400 truncate">{(() => { const next = stats.skinsIn7Days[0]; const ms = next.expiresAt - Date.now(); const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000); return d > 0 ? `${d}z ${h}h` : `${h}h`; })()}</div>
                    <div className="text-[10px] uppercase tracking-widest font-black text-amber-400 mb-1">Următorul Skin</div>
                    <div className="flex flex-col gap-0.5 border-t border-white/5 pt-2 mt-1">
                      <div className="text-[10px] font-black text-white truncate uppercase">{stats.skinsIn7Days[0].name}</div>
                      <div className="flex justify-between items-center"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">@{stats.skinsIn7Days[0].account}</span><span className="text-[8px] font-bold text-slate-600 italic">{new Date(stats.skinsIn7Days[0].expiresAt).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })}</span></div>
                    </div>
                  </div>
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-amber-400/5 blur-2xl rounded-full" />
                </>
              ) : (
                <div className="flex flex-col"><div className="text-2xl font-black mb-1 text-slate-700">FĂRĂ DATE</div><div className="text-[10px] uppercase tracking-widest font-black text-slate-600">Niciun skin activ</div></div>
              )}
            </div>
            <div onClick={() => setShowSpawnStatsModal(true)} className="bg-slate-900/40 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer group">
              <Activity className="w-5 h-5 mb-4 opacity-50 group-hover:opacity-100 transition-opacity text-emerald-400" />
              <div className="flex flex-col">
                <div className="text-4xl font-black mb-1 text-emerald-400 tabular-nums">{stats.spawnCount}</div>
                <div className="text-[10px] uppercase tracking-widest font-black text-emerald-400">ICE BOSSES ({stats.sefPercentage}%)</div>
                <div className="text-[10px] font-bold text-slate-600 mt-1">~{stats.avgPerSpawn} / spawn</div>
              </div>
            </div>
          </div>

          {/* Team Activity Feed */}
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Activitate Echipă
              </h3>
              <button 
                onClick={() => setShowActivityModal(true)}
                className="text-[10px] text-emerald-400 font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Vezi Tot
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto scrollbar-hide">
              {activity.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm italic">Căutăm activitate...</div>
              ) : (
                activity.slice(0, 5).map((log, i) => (
                  <div key={i} className="flex items-start gap-4 group cursor-default animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="relative shrink-0">
                      <div 
                        className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white font-bold group-hover:border-white/30 transition-colors"
                        style={{ backgroundColor: `${log.userColor || '#c8962e'}15`, borderColor: `${log.userColor || '#c8962e'}30` }}
                      >
                        <span style={{ color: log.userColor || '#c8962e' }}>
                          {(log.userName || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-[0_0_8px_#10b981]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-sm font-bold text-slate-200 truncate">{log.userName}</p>
                        <span className="text-[9px] text-slate-600 font-bold whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed italic">
                        {log.action}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Changelog & Support */}
        <div className="space-y-8">
          {/* Changelog Widget */}
          <div className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-gold" />
                Versiuni & Update
              </h3>
              <button 
                onClick={() => setShowHistoryModal(true)}
                className="text-[10px] text-accent-gold font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Vezi Tot
              </button>
            </div>
            <div className="p-4 space-y-2">
              {CHANGELOG.slice(0, 3).map(item => (
                <ChangelogCard key={item.version} item={item} onShowMore={() => setShowHistoryModal(true)} />
              ))}
            </div>
          </div>

          <div 
            onClick={() => setActiveTab?.('team')}
            className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden p-6 space-y-6 hover:border-blue-500/30 transition-all cursor-pointer group hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Management Echipă
              </h3>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
            </div>

            <div className="space-y-3">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Nume Echipă</p>
                  <p className="text-sm font-bold text-slate-200">{teamName}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Shield className="w-5 h-5 text-blue-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Membri Total</p>
                  <p className="text-xl font-black text-white tracking-tight">{totalMembers}</p>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Online Acum</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-black text-emerald-400 tracking-tight">{activeMembers.length}</p>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Skin Expiry Widget (v3.9.4 style) */}
          {stats.skinsIn7Days.filter(i => i.expiresAt < Date.now() + (7 * 86400000)).length > 0 && (
            <div className="bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Expiră în 7 zile
                </h3>
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                  {stats.skinsIn7Days.filter(i => i.expiresAt < Date.now() + (7 * 86400000)).length}
                </span>
              </div>
              
              <div className="space-y-3">
                {stats.skinsIn7Days.filter(i => i.expiresAt < Date.now() + (7 * 86400000)).slice(0, 4).map((item, i) => {
                  const ms = item.expiresAt - Date.now();
                  const d = Math.floor(ms / 86400000);
                  const h = Math.floor((ms % 86400000) / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  const timeStr = d > 0 ? `${d}z ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;

                  return (
                    <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200 group-hover:text-accent-gold transition-colors">{item.name}</span>
                        <span className={cn(
                          "text-[10px] font-black tabular-nums",
                          ms < 86400000 ? "text-red-500 animate-pulse" : "text-amber-500"
                        )}>
                          {timeStr}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest italic truncate max-w-[100px]">@{item.account}</span>
                        <div className="flex items-center gap-1">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            item.category === 'skin-arma' ? "bg-blue-400" : item.category === 'costum' ? "bg-purple-400" : "bg-teal-400"
                          )} />
                          <span className="text-[9px] font-black text-slate-500 uppercase">{item.category.replace('-', ' ')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {stats.skinsIn7Days.length > 4 && (
                  <button
                    onClick={() => {
                      localStorage.setItem('m2_skin_7days_pending', '1');
                      setActiveTab?.('skins');
                    }}
                    className="w-full py-2 text-[9px] font-black text-slate-600 uppercase tracking-widest hover:text-amber-400 transition-colors"
                  >
                    + încă {stats.skinsIn7Days.length - 4} iteme
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
