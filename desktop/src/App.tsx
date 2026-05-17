import React, { useState, Suspense, useRef, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Bell, Search, User, Clock } from 'lucide-react';
import { cn } from './lib/utils';

// Lazy load modules for faster initial load
const Dashboard = React.lazy(() => import('./modules/Dashboard/index'));
const SpawnTracker = React.lazy(() => import('./modules/SpawnTracker/index'));
const SkinReminder = React.lazy(() => import('./modules/SkinReminder/index'));
const Inventory = React.lazy(() => import('./modules/Inventory/index'));
const ServerStatus = React.lazy(() => import('./modules/ServerStatus/index'));
const Pets = React.lazy(() => import('./modules/Pets/index'));
const Checklist = React.lazy(() => import('./modules/Checklist/index'));
const Transfers = React.lazy(() => import('./modules/Transfers/index'));
const Settings = React.lazy(() => import('./modules/Settings/index'));
const TeamManagement = React.lazy(() => import('./modules/TeamManagement/index'));

import { db } from './lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import { useAuth } from './contexts/AuthContext';
const LoginOverlay = React.lazy(() => import('./modules/Auth/LoginOverlay'));
const TeamSelectionOverlay = React.lazy(() => import('./modules/Auth/TeamSelectionOverlay'));
import { SpawnProvider, useSpawn } from './contexts/SpawnContext';
import { SpawnAlertModal } from './modules/SpawnTracker/SpawnAlertModal';
import { SkinAlertModal } from './modules/SkinReminder/SkinAlertModal';
import { ConfirmRoot } from './components/ConfirmModal';
import { DepersAlertModal, type DepersAlert } from './modules/Admin/DepersAlertModal';
import { SkinExpiryWidget } from './modules/SkinReminder/SkinExpiryWidget';
import { Volume2, Settings as SettingsIcon, Zap, X as CloseIcon, Eye, EyeOff, LogOut } from 'lucide-react';

import { appWindow } from '@tauri-apps/api/window';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { Minus, Square, X, Hexagon, Download, Sparkles } from 'lucide-react';

const AdminPanel = React.lazy(() => import('./modules/Admin/index'));
const Tweaks = React.lazy(() => import('./modules/Tweaks/index'));
const Alarms = React.lazy(() => import('./modules/Alarms/index'));
const StickyNotes = React.lazy(() => import('./modules/StickyNotes/index'));

const CAT_LABELS: Record<string, string> = {
  'skin-arma': 'Skin Armă', 'costum': 'Costum', 'frizura': 'Frizură',
  'atac-auto': 'Atac Auto', 'manusa': 'Mănușă', 'insotitor': 'Însoțitor', 'sase-sapte': '6/7',
};

function fmtLeft(ms: number) {
  if (ms <= 0) return 'EXPIRAT';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}z ${h % 24}h`;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

function NotificationsPanel({ items }: { items: any[] }) {
  const now = Date.now();
  const expired = items.filter(i => i.expiresAt <= now).sort((a, b) => b.expiresAt - a.expiresAt);
  const soon = items.filter(i => i.expiresAt > now && i.expiresAt - now < 86400000).sort((a, b) => a.expiresAt - b.expiresAt);
  const depers = items.filter(i => i.personalized && !i.depersExpiresAt && i.expiresAt > now && i.expiresAt - now < 4 * 86400000);
  const total = expired.length + soon.length + depers.length;

  return (
    <div className="absolute top-full right-0 mt-4 w-80 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/10 rounded-[24px] shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[100] animate-in zoom-in-95 slide-in-from-top-4 origin-top-right overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Notificări</span>
        {total > 0 && <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full text-[9px] font-black text-red-400">{total}</span>}
      </div>
      <div className="max-h-[360px] overflow-y-auto scrollbar-hide">
        {total === 0 ? (
          <div className="py-10 text-center">
            <Bell className="w-6 h-6 text-slate-700 mx-auto mb-2" />
            <p className="text-[11px] text-slate-600 font-bold">Nicio notificare activă</p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {expired.map(i => {
              const is67 = i.category === 'sase-sapte';
              return (
                <div key={i.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors",
                  is67 ? "bg-emerald-500/[0.04] border-emerald-500/10 hover:bg-emerald-500/[0.08]" : "bg-red-500/[0.04] border-red-500/10 hover:bg-red-500/[0.08]")}>
                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", is67 ? "bg-emerald-500" : "bg-red-500")} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[11px] font-black truncate", is67 ? "text-emerald-400" : "text-red-400")}>{i.name}</p>
                    <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{CAT_LABELS[i.category] || i.category} · @{i.account}</p>
                  </div>
                  <span className={cn("text-[9px] font-black shrink-0", is67 ? "text-emerald-500/60" : "text-red-500/60")}>
                    {is67 ? 'FINALIZAT' : 'EXPIRAT'}
                  </span>
                </div>
              );
            })}
            {soon.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/[0.04] border border-amber-500/10 hover:bg-amber-500/[0.08] transition-colors">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-amber-400 truncate">{i.name}</p>
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{CAT_LABELS[i.category] || i.category} · @{i.account}</p>
                </div>
                <span className="text-[9px] font-black text-amber-500/80 shrink-0 tabular-nums">{fmtLeft(i.expiresAt - now)}</span>
              </div>
            ))}
            {depers.map(i => (
              <div key={`dp_${i.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-purple-500/[0.04] border border-purple-500/10 hover:bg-purple-500/[0.08] transition-colors">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-purple-400 truncate">{i.name}</p>
                  <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Personalizat · Necesită depersonalizare</p>
                </div>
                <span className="text-[9px] font-black text-purple-500/60 shrink-0">{fmtLeft(i.expiresAt - now)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UpdateModal({ version, body, onUpdate, onDismiss, isUpdating }: {
  version: string;
  body?: string;
  onUpdate: () => void;
  onDismiss: () => void;
  isUpdating: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[28px] shadow-[0_40px_80px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Top accent bar */}
        <div className="h-px bg-gradient-to-r from-transparent via-accent-gold/60 to-transparent" />

        <div className="p-7 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-accent-gold/10 border border-accent-gold/20 shrink-0">
              <Sparkles className="w-5 h-5 text-accent-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-accent-gold uppercase tracking-[0.2em] mb-1">Actualizare disponibilă</p>
              <h3 className="text-lg font-black text-white tracking-tight">Versiunea {version}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">O versiune nouă a aplicației este disponibilă.</p>
            </div>
          </div>

          {/* Release notes */}
          {body && (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 max-h-40 overflow-y-auto scrollbar-hide">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Noutăți</p>
              <p className="text-[12px] text-slate-400 leading-relaxed whitespace-pre-line">{body}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {!isUpdating && (
              <button
                onClick={onDismiss}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-[11px] font-black text-slate-500 uppercase tracking-widest hover:text-white hover:bg-white/5 transition-all"
              >
                Mai târziu
              </button>
            )}
            <button
              onClick={onUpdate}
              disabled={isUpdating}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                isUpdating
                  ? "bg-accent-gold/20 text-accent-gold border border-accent-gold/30 cursor-not-allowed"
                  : "bg-accent-gold text-bg-primary hover:scale-[1.02] shadow-lg shadow-accent-gold/20"
              )}
            >
              {isUpdating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-accent-gold border-t-transparent rounded-full animate-spin" />
                  Se descarcă...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Instalează acum
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TitleBar() {
  return (
    <div 
      data-tauri-drag-region 
      className="h-8 bg-[#050506] flex items-center justify-between px-4 select-none border-b border-white/[0.02] sticky top-0 z-[100]"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <Hexagon className="w-3.5 h-3.5 text-accent-gold fill-accent-gold/20" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Metin2 Tools</span>
      </div>

      <div className="flex items-center h-full">
        <button 
          onClick={() => appWindow.minimize()}
          className="h-full px-3 text-slate-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => appWindow.toggleMaximize()}
          className="h-full px-3 text-slate-500 hover:text-white hover:bg-white/5 transition-all"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={() => appWindow.hide()}
          className="h-full px-4 text-slate-500 hover:text-white hover:bg-red-500/80 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function HeaderCountdown({ spawnData }: { spawnData: any }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const inv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(inv);
  }, []);

  const val = spawnData?.chTimes?.ch1;
  if (!val) return <span className="text-sm font-black text-slate-700 tracking-tighter">--:--</span>;

  const isDouble = spawnData?.spawnType === 'dublu';
  const p = val.split(':').map((n: string) => parseInt(n, 10));
  const nowInHour = now.getMinutes() * 60 + now.getSeconds();
  
  // Calculate raw difference
  let targetInHour = p[0] * 60 + p[1];
  let d = targetInHour - nowInHour;
  if (d <= 0) d += 3600;

  const m = Math.floor(d / 60);
  const s = d % 60;
  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  return (
    <span className="text-sm font-black text-accent-gold tabular-nums tracking-tighter">
      {timeStr}
    </span>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isCompact, setIsCompact] = useState(false);
  const { user, isLoading, viewAsMember, setViewAsMember, logout } = useAuth();

  const [updateInfo, setUpdateInfo] = useState<{ version: string; body?: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Check for updates on startup (production only)
  useEffect(() => {
    if (import.meta.env.DEV) return;
    checkUpdate().then(({ shouldUpdate, manifest }) => {
      if (shouldUpdate && manifest) {
        setUpdateInfo({ version: manifest.version, body: manifest.body });
      }
    }).catch(() => {});
  }, []);

  const handleInstallUpdate = async () => {
    setIsUpdating(true);
    try {
      await installUpdate();
      await relaunch();
    } catch {
      setIsUpdating(false);
    }
  };
  const spawnContext = useSpawn();
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const audioSettingsRef = useRef<HTMLDivElement>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [notifItems, setNotifItems] = useState<any[]>([]);
  const [depersAlerts, setDepersAlerts] = useState<DepersAlert[]>([]);
  const secretItemsRef = useRef<Record<string, any>>({});
  const isActuallyAdmin = user?.isSuperAdmin && !viewAsMember;

  // Hide native decorations for premium look
  useEffect(() => {
    appWindow.setDecorations(false).catch(() => {
      // If fails, we still have our custom bar but native one remains. 
      // User might need to set it in tauri.conf.json for best results.
    });
  }, []);

  // Click outside to close audio settings
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (audioSettingsRef.current && !audioSettingsRef.current.contains(event.target as Node)) {
        setShowAudioSettings(false);
      }
    }
    if (showAudioSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAudioSettings]);

  // Click outside to close profile menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  // Click outside to close notifications
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  // Firebase listener for notification items
  useEffect(() => {
    if (!user?.teamId) return;
    return onValue(ref(db, `teams/${user.teamId}/skinReminder/items`), (snap) => {
      setNotifItems(snap.val() ? Object.values(snap.val()) as any[] : []);
    });
  }, [user?.teamId]);

  const isAdminUser = isActuallyAdmin;

  // Depers alerts — only for admins, independent of active tab
  useEffect(() => {
    if (!isAdminUser || !user?.teamId) return;
    return onValue(ref(db, `teams/${user.teamId}/secret/items`), (snap) => {
      secretItemsRef.current = snap.val() || {};
    });
  }, [isAdminUser, user?.teamId]);

  useEffect(() => {
    if (!isAdminUser || !user?.teamId) return;
    const checkDepers = () => {
      const now = Date.now();
      const newAlerts: DepersAlert[] = [];
      for (const [id, item] of Object.entries(secretItemsRef.current) as [string, any][]) {
        if (item.depersAt <= now && !item.notifiedDeperss) {
          newAlerts.push({ id, name: item.name });
          update(ref(db, `teams/${user.teamId}/secret/items/${id}`), { notifiedDeperss: true }).catch(() => {});
        }
      }
      if (newAlerts.length > 0) {
        setDepersAlerts(prev => {
          const ids = new Set(prev.map(a => a.id));
          const fresh = newAlerts.filter(a => !ids.has(a.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    };
    checkDepers();
    const inv = setInterval(checkDepers, 60000);
    return () => clearInterval(inv);
  }, [isAdminUser, user?.teamId]);

  if (isLoading) return <LoadingFallback />;
  
  if (!user) return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <Suspense fallback={<LoadingFallback />}>
        <LoginOverlay />
      </Suspense>
    </div>
  );

  if (!user.isSuperAdmin && user.status === 'pending') return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="p-4 rounded-2xl bg-accent-gold/10 border border-accent-gold/20">
          <Clock className="w-10 h-10 text-accent-gold" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white mb-2">Cerere în așteptare</h2>
          <p className="text-sm text-slate-500 max-w-sm">Contul tău este în așteptarea aprobării unui administrator.</p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-400 hover:text-white transition-all">
          <LogOut className="w-4 h-4" /> Deconectare
        </button>
      </div>
    </div>
  );

  if (!user.teamId) return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <Suspense fallback={<LoadingFallback />}>
        <TeamSelectionOverlay />
      </Suspense>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <Dashboard setActiveTab={setActiveTab} />;
      case 'spawn': return <SpawnTracker />;
      case 'skins': return <SkinReminder />;
      case 'inventory': return <Inventory />;
      case 'status': return <ServerStatus />;
      case 'pets': return <Pets />;
      case 'checklist': return <Checklist />;
      case 'transfers': return <Transfers />;
      case 'settings': return <Settings />;
      case 'team': return <TeamManagement />;
      case 'alarms': return <Alarms />;
      case 'notes': return <StickyNotes />;
      case 'admin': return isActuallyAdmin ? <AdminPanel /> : <Dashboard />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCompact={isCompact}
          setIsCompact={setIsCompact}
        />
        
        <main className={cn(
          "flex-1 flex flex-col transition-all duration-300 relative",
          isCompact ? "ml-20" : "ml-64"
        )}>
        {/* Premium Top Header Bar */}
        <header className="h-20 flex items-center justify-between px-10 sticky top-0 bg-bg-primary/40 backdrop-blur-2xl z-40 border-b border-white/[0.03]">
          {/* Subtle bottom glow line */}
          <div className="absolute bottom-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent opacity-50" />
          
          <div className="flex items-center gap-10">
            {/* Live CH1 Monitor */}
            <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-white/[0.02] border border-white/5 shadow-inner group transition-all hover:bg-white/[0.04]">
              <div className="relative">
                <Zap className="w-4 h-4 text-accent-gold animate-pulse" />
                <div className="absolute inset-0 bg-accent-gold/20 blur-md rounded-full animate-ping opacity-20" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Următorul Spawn</span>
                <div className="flex items-baseline gap-2">
                   <span className="text-[10px] font-black text-white uppercase tracking-widest">
                     {spawnContext.spawnData?.spawnType === 'dublu' ? 'Dublă' : 'Simplă'}
                   </span>
                   <HeaderCountdown spawnData={spawnContext.spawnData} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {/* Global Audio Settings */}
            <div className="relative" ref={audioSettingsRef}>
              <button 
                onClick={() => setShowAudioSettings(!showAudioSettings)}
                className={cn(
                  "p-2.5 rounded-2xl border transition-all duration-300 flex items-center gap-2 group",
                  showAudioSettings 
                    ? "bg-accent-gold/10 text-accent-gold border-accent-gold/30 shadow-[0_0_20px_rgba(200,150,46,0.1)]" 
                    : "text-slate-500 border-white/5 hover:text-white hover:bg-white/5"
                )}
              >
                {showAudioSettings ? <CloseIcon className="w-4 h-4" /> : <Volume2 className="w-4 h-4 group-hover:scale-110 transition-transform" />}
              </button>

              {/* Settings Popover */}
              {showAudioSettings && (
                <div className="absolute top-full right-0 mt-4 w-72 card p-6 border-white/10 bg-[#0c0c0e]/95 backdrop-blur-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[100] animate-in zoom-in-95 slide-in-from-top-4 origin-top-right rounded-[28px]">
                  <div className="space-y-6">
                    <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Master Control</span>
                    </div>

                    {/* Master Volume */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-accent-gold/10 text-accent-gold">
                            <Volume2 className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[10px] font-black text-slate-100 uppercase tracking-widest">Master</span>
                        </div>
                        <span className="text-[10px] font-black text-accent-gold tabular-nums">{Math.round(spawnContext.globalVolume * 100)}%</span>
                      </div>
                      <div className="relative h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                        <input 
                          type="range" min="0" max="1" step="0.01" 
                          value={spawnContext.globalVolume} 
                          onChange={(e) => spawnContext.setGlobalVolume(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div 
                          className="absolute inset-y-0 left-0 bg-accent-gold rounded-full shadow-[0_0_10px_#c8962e]"
                          style={{ width: `${spawnContext.globalVolume * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Spawn Volume */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                           <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                             <Zap className="w-3.5 h-3.5" />
                           </div>
                           <span className="text-[10px] font-black text-slate-100 uppercase tracking-widest">Alerte Spawn</span>
                        </div>
                        <span className="text-[10px] font-black text-purple-400 tabular-nums">{Math.round(spawnContext.spawnVolume * 100)}%</span>
                      </div>
                      <div className="relative h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={spawnContext.spawnVolume}
                          onChange={(e) => spawnContext.setSpawnVolume(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className="absolute inset-y-0 left-0 bg-purple-500 rounded-full shadow-[0_0_10px_#a855f7]"
                          style={{ width: `${spawnContext.spawnVolume * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Skin Volume */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                           <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                             <Bell className="w-3.5 h-3.5" />
                           </div>
                           <span className="text-[10px] font-black text-slate-100 uppercase tracking-widest">Alerte Costume</span>
                        </div>
                        <span className="text-[10px] font-black text-amber-400 tabular-nums">{Math.round(spawnContext.skinVolume * 100)}%</span>
                      </div>
                      <div className="relative h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={spawnContext.skinVolume}
                          onChange={(e) => spawnContext.setSkinVolume(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          className="absolute inset-y-0 left-0 bg-amber-500 rounded-full shadow-[0_0_10px_#f59e0b]"
                          style={{ width: `${spawnContext.skinVolume * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications(v => !v)}
                className={cn(
                  "relative p-2.5 rounded-2xl border transition-all duration-300",
                  showNotifications
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "text-slate-500 border-white/5 hover:text-white hover:bg-white/5"
                )}
              >
                <Bell className="w-4 h-4" />
                {notifItems.some(i => i.expiresAt - Date.now() < 86400000) && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border-2 border-bg-primary shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                )}
              </button>
              {showNotifications && <NotificationsPanel items={notifItems} />}
            </div>
            
            <div className="flex items-center gap-4 pl-8 border-l border-white/5 h-10">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-black text-white uppercase tracking-wider">{user?.name || user?.email?.split('@')[0] || 'User'}</p>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                   <div className={cn("w-1 h-1 rounded-full", isActuallyAdmin ? "bg-accent-gold" : "bg-blue-500")} />
                   <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                     {isActuallyAdmin ? 'Super Admin' : 'Team Member'}
                   </p>
                </div>
              </div>
              <div ref={profileMenuRef} className="relative">
                <button
                  onClick={() => setShowProfileMenu(v => !v)}
                  className="relative group/avatar"
                >
                  <div className="absolute inset-0 bg-accent-gold/20 rounded-2xl blur-lg opacity-0 group-hover/avatar:opacity-100 transition-all duration-500" />
                  <div className={cn(
                    "w-11 h-11 rounded-2xl bg-bg-secondary border flex items-center justify-center relative z-10 transition-colors duration-300 shadow-xl overflow-hidden",
                    showProfileMenu ? "border-accent-gold/40" : "border-white/5 group-hover/avatar:border-accent-gold/30"
                  )}>
                    <User className={cn("w-5 h-5 transition-colors duration-300", showProfileMenu ? "text-accent-gold" : "text-slate-400 group-hover/avatar:text-accent-gold")} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                  </div>
                </button>

                {showProfileMenu && (
                  <div className="absolute top-full right-0 mt-3 w-56 bg-[#0c0c0e]/95 backdrop-blur-3xl border border-white/10 rounded-[20px] shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[100] animate-in zoom-in-95 slide-in-from-top-2 origin-top-right overflow-hidden">
                    {/* Header profil */}
                    <div className="px-4 py-3.5 border-b border-white/5">
                      <p className="text-[11px] font-black text-white uppercase tracking-widest truncate">
                        {user?.name || user?.email?.split('@')[0] || 'User'}
                      </p>
                      <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-0.5 truncate">
                        {user?.email}
                      </p>
                    </div>

                    {/* Optiuni */}
                    <div className="p-2 space-y-0.5">
                      <button
                        onClick={() => { setActiveTab('settings'); setShowProfileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all text-left group"
                      >
                        <SettingsIcon className="w-4 h-4 shrink-0 group-hover:rotate-45 transition-transform duration-500" />
                        <span className="text-[12px] font-bold">Setări</span>
                      </button>

                      <button
                        onClick={() => { logout(); setShowProfileMenu(false); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500/60 hover:text-red-400 hover:bg-red-500/5 transition-all text-left"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span className="text-[12px] font-bold">Deconectare</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="p-8 flex-1 overflow-auto">
          <Suspense fallback={<LoadingFallback />}>
            {/* Tweaks stays always mounted so TCP/global shortcuts remain active on all tabs */}
            <div style={{ display: activeTab === 'tweaks' ? undefined : 'none' }}>
              <Tweaks />
            </div>
            {activeTab !== 'tweaks' && renderContent()}
          </Suspense>
        </div>
      </main>
    </div>

    {/* Global modals */}
    <SpawnAlertModal />
    <SkinAlertModal />
    <SkinExpiryWidget />
    <ConfirmRoot />
    <DepersAlertModal alerts={depersAlerts} onDismiss={() => setDepersAlerts([])} />
    {updateInfo && (
      <UpdateModal
        version={updateInfo.version}
        body={updateInfo.body}
        onUpdate={handleInstallUpdate}
        onDismiss={() => setUpdateInfo(null)}
        isUpdating={isUpdating}
      />
    )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#050506]">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 border-2 border-accent-gold/10 border-t-accent-gold rounded-full animate-spin" />
          <div className="absolute inset-0 bg-accent-gold/20 blur-xl rounded-full animate-pulse" />
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">Initializing Interface...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SpawnProvider>
      <AppContent />
    </SpawnProvider>
  );
}
