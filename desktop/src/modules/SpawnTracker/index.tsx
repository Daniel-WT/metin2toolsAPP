import React from 'react';
import { MapView } from './MapView';
import { GheataTable } from './GheataTable';
import { CHTable } from './CHTable';
import { Info, RefreshCcw, Zap, ZapOff, Undo2, LayoutGrid, Clock, Volume2, Settings, X as CloseIcon, ExternalLink, Map as MapIcon, Bell } from 'lucide-react';
import { WebviewWindow } from '@tauri-apps/api/window';
import { cn } from '../../lib/utils';
import { savedWindowOptions } from '../../lib/windowMemory';
import { SpawnProvider, useSpawn } from '../../contexts/SpawnContext';
import { SpawnHistoryModal } from './SpawnHistoryModal';
import { ConfirmModal } from './ConfirmModal';

function SpawnTrackerContent() {
  const spawnContext = useSpawn();
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  return (
    <div className="space-y-8 animate-in h-full flex flex-col relative">
      {/* Toast Notification */}
      {spawnContext.toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-accent-gold text-bg-primary px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl animate-in slide-in-from-top-4">
          {spawnContext.toast}
        </div>
      )}

      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Spawn Monitor</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Global Actions */}
          <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => spawnContext.undo()}
              className="p-2 text-slate-500 hover:text-white transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={() => spawnContext.setSpawnType(spawnContext.spawnData?.spawnType === 'dublu' ? 'simplu' : 'dublu')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                spawnContext.spawnData?.spawnType === 'dublu' 
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              )}
            >
              {spawnContext.spawnData?.spawnType === 'dublu' ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
              {spawnContext.spawnData?.spawnType === 'dublu' ? 'Dublu' : 'Simplu'}
            </button>
            <button 
              onClick={() => spawnContext.triggerDebugAlert('2min')}
              className="p-2 text-slate-500 hover:text-white transition-colors"
              title="Debug Alerta 2 min (Sunet)"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button 
              onClick={() => spawnContext.triggerDebugAlert('30s')}
              className="p-2 text-slate-500 hover:text-white transition-colors"
              title="Debug Alerta 30 sec (Pop-up)"
            >
              <Bell className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-all"
            >
              <RefreshCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </header>

      <ConfirmModal 
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={() => spawnContext.clearAllRooms()}
        title="Resetare Totală"
        message="Ești sigur că vrei să resetezi tot spawn-ul? Această acțiune va șterge toate datele din sesiunea curentă."
        confirmText="Resetează tot"
        variant="danger"
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 h-full max-h-[calc(100vh-140px)]">
          <div className="xl:col-span-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 px-1 group shrink-0">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-accent-gold" />
                <h3 className="text-sm font-bold text-slate-100 font-display">Hartă Spawn</h3>
              </div>
              <button
                onClick={() => {
                  const geo = savedWindowOptions('map-popout');
                  new WebviewWindow('map-popout', {
                    url: 'index.html?view=map',
                    title: 'Hartă Spawn - Metin2 Tools',
                    resizable: true,
                    alwaysOnTop: true,
                    decorations: false,
                    transparent: false,
                    width: geo.width ?? 600,
                    height: geo.height ?? 600,
                    ...(geo.x !== undefined ? { x: geo.x, y: geo.y, center: false } : { center: true }),
                  });
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-accent-gold transition-all"
                title="Pop-out"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-full max-w-full max-h-full aspect-square">
                  <MapView />
                </div>
              </div>
            </div>
          </div>
          <div className="xl:col-span-2 space-y-6 overflow-y-auto pr-2 scrollbar-hide pb-10">
            {/* Tabel Timp Spawn */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1 group">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-accent-gold" />
                  <h3 className="text-sm font-bold text-slate-100 font-display">Tabel Timp Spawn</h3>
                </div>
                <button 
                  onClick={() => {
                    { const geo = savedWindowOptions('timpspawn-popout');
                      new WebviewWindow('timpspawn-popout', {
                        url: 'index.html?view=timpspawn',
                        title: 'Timp Spawn - Metin2 Tools',
                        resizable: true, alwaysOnTop: true, decorations: false, transparent: false,
                        width: geo.width ?? 340, height: geo.height ?? 600,
                        ...(geo.x !== undefined ? { x: geo.x, y: geo.y, center: false } : { center: true }),
                      });
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-accent-gold transition-all"
                  title="Pop-out"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <CHTable />
            </div>

            {/* Tabel Gheață */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1 group">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-accent-gold" />
                  <h3 className="text-sm font-bold text-slate-100 font-display">Tabel Gheață</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => spawnContext.setIsHistoryOpen(true)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-accent-gold transition-all"
                    title="Istoric"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      const geo = savedWindowOptions('gheatatable-popout');
                      new WebviewWindow('gheatatable-popout', {
                        url: 'index.html?view=gheatatable',
                        title: 'Tabel Gheață - Metin2 Tools',
                        resizable: true,
                        alwaysOnTop: true,
                        decorations: false,
                        transparent: false,
                        width: geo.width ?? 500,
                        height: geo.height ?? 600,
                        ...(geo.x !== undefined ? { x: geo.x, y: geo.y, center: false } : { center: true }),
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-accent-gold transition-all"
                    title="Pop-out"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <GheataTable />
            </div>
          </div>
        </div>
      </div>
      
      <div className="h-4" />

      <SpawnHistoryModal 
        isOpen={spawnContext.isHistoryOpen}
        onClose={() => spawnContext.setIsHistoryOpen(false)}
      />
    </div>
  );
}

export default function SpawnTracker() {
  return <SpawnTrackerContent />;
}
