import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Clock,
  Package,
  Activity,
  CheckCircle2,
  ArrowLeftRight,
  ChevronRight,
  ShieldCheck,
  Users,
  Sliders,
  Bell,
  Folder,
  StickyNote,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

export interface NavItem {
  id: string;
  name: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
}

export const FOLDER_COLORS = [
  { id: 'default', hex: '#64748b' },
  { id: 'gold',    hex: '#f59e0b' },
  { id: 'blue',    hex: '#60a5fa' },
  { id: 'purple',  hex: '#a78bfa' },
  { id: 'emerald', hex: '#34d399' },
  { id: 'rose',    hex: '#fb7185' },
  { id: 'orange',  hex: '#fb923c' },
  { id: 'cyan',    hex: '#22d3ee' },
] as const;

export type FolderColorId = typeof FOLDER_COLORS[number]['id'];

export function getFolderColor(colorId?: string): string {
  return FOLDER_COLORS.find(c => c.id === colorId)?.hex ?? FOLDER_COLORS[0].hex;
}

export interface SidebarFolder {
  id: string;
  label: string;
  items: string[];
  color?: FolderColorId;
}

export type SidebarEntry = string | SidebarFolder;
export type SidebarLayout = SidebarEntry[];
export const isSidebarFolder = (e: SidebarEntry): e is SidebarFolder =>
  typeof e === 'object' && e !== null;

export const navItems: NavItem[] = [
  { id: 'overview',  name: 'Overview',      icon: LayoutDashboard, label: 'Control Center'     },
  { id: 'spawn',     name: 'Spawn Tracker', icon: MapIcon,         label: 'Boss Monitor'        },
  { id: 'skins',     name: 'Skin Reminder', icon: Clock,           label: 'Expiry Alerts'       },
  { id: 'inventory', name: 'Inventory',     icon: Package,         label: 'Resource Management' },
  { id: 'status',    name: 'Server Status', icon: Activity,        label: 'Network Monitor'     },
  { id: 'checklist', name: 'Checklist',     icon: CheckCircle2,    label: 'Task Management'     },
  { id: 'transfers', name: 'Transfers',     icon: ArrowLeftRight,  label: 'Player Migration'    },
  { id: 'team',      name: 'Echipa',        icon: Users,           label: 'Team Management'     },
  { id: 'alarms',    name: 'Alarme',        icon: Bell,            label: 'Alarms & Timers'     },
  { id: 'tweaks',    name: 'Tweaks',        icon: Sliders,         label: 'Game Settings'       },
  { id: 'notes',     name: 'Notițe',        icon: StickyNote,      label: 'Personal & Echipă'   },
  { id: 'admin',     name: 'Admin Panel',   icon: ShieldCheck,     label: 'System Control', adminOnly: true },
];

export const LS_SIDEBAR_ORDER    = 'm2pro_sidebar_order';
export const LS_COLLAPSED_FOLDERS = 'm2pro_folders_collapsed';

export function loadSidebarLayout(): SidebarLayout {
  try {
    const raw = localStorage.getItem(LS_SIDEBAR_ORDER);
    if (!raw) return [];
    return JSON.parse(raw) as SidebarLayout;
  } catch { return []; }
}

export function saveSidebarLayout(v: SidebarLayout) {
  localStorage.setItem(LS_SIDEBAR_ORDER, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent('sidebar-order-changed'));
}

// Kept for backward compat (SidebarOrderCard migration)
export function loadSidebarOrder(): string[] {
  const layout = loadSidebarLayout();
  return layout.flatMap(e => (isSidebarFolder(e) ? [] : [e]));
}
export function saveSidebarOrder(v: string[]) { saveSidebarLayout(v); }

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  isCompact: boolean;
  setIsCompact: (val: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, isCompact, setIsCompact }: SidebarProps) {
  const { user, viewAsMember } = useAuth();
  const isActuallyAdmin = user?.isSuperAdmin && !viewAsMember;

  const [layout, setLayout] = useState<SidebarLayout>(() => loadSidebarLayout());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(LS_COLLAPSED_FOLDERS) || '[]')); }
    catch { return new Set<string>(); }
  });

  useEffect(() => {
    const handler = () => setLayout(loadSidebarLayout());
    window.addEventListener('sidebar-order-changed', handler);
    return () => window.removeEventListener('sidebar-order-changed', handler);
  }, []);

  const toggleFolder = (id: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(LS_COLLAPSED_FOLDERS, JSON.stringify([...next]));
      return next;
    });
  };

  // IDs already placed in the layout (root or inside folders)
  const placedIds = useMemo(() => {
    const s = new Set<string>();
    layout.forEach(e => isSidebarFolder(e) ? e.items.forEach(id => s.add(id)) : s.add(e));
    return s;
  }, [layout]);

  // Items not yet in layout (newly added nav items)
  const orphans = useMemo(() => navItems.filter(n => !placedIds.has(n.id)), [placedIds]);

  const canShow = (item: NavItem): boolean => {
    if (item.adminOnly && !isActuallyAdmin) return false;
    if (user && !isActuallyAdmin && !['overview', 'settings', 'team'].includes(item.id)) {
      const permKey = item.id === 'skins' || item.id === 'pets' ? 'skin' : item.id;
      if (!(((user as any).permissions || {})[permKey])) return false;
    }
    return true;
  };

  const renderNavButton = (item: NavItem, indented = false) => {
    if (!canShow(item)) return null;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        title={isCompact ? item.name : undefined}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group text-left',
          isActive
            ? 'bg-white/[0.03] text-accent-gold border border-white/[0.05]'
            : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-100',
          isCompact && 'justify-center px-0',
          indented && !isCompact && 'pl-7'
        )}
      >
        <item.icon className={cn(
          'w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110',
          isActive ? 'text-accent-gold' : 'text-slate-600 group-hover:text-slate-400'
        )} />
        {!isCompact && (
          <div className="flex flex-col animate-in fade-in slide-in-from-left-2 min-w-0">
            <span className="font-bold text-[13px]">{item.name}</span>
            <span className="text-[9px] text-slate-600 font-medium group-hover:text-slate-500">{item.label}</span>
          </div>
        )}
        {isActive && !isCompact && <ChevronRight className="ml-auto w-3 h-3 text-accent-gold shrink-0" />}
      </button>
    );
  };

  const renderEntry = (entry: SidebarEntry) => {
    if (!isSidebarFolder(entry)) {
      const item = navItems.find(n => n.id === entry);
      return item ? renderNavButton(item) : null;
    }

    const folderItems = entry.items
      .map(id => navItems.find(n => n.id === id))
      .filter((i): i is NavItem => !!i);
    const visibleItems = folderItems.filter(canShow);
    if (!visibleItems.length) return null;

    // In compact mode — show a folder icon button that toggles collapse
    if (isCompact) {
      const isCollapsed = collapsedFolders.has(entry.id);
      const hasActive = visibleItems.some(i => i.id === activeTab);
      const folderColorHex = getFolderColor(entry.color);
      return (
        <React.Fragment key={entry.id}>
          <button
            onClick={() => toggleFolder(entry.id)}
            title={entry.label}
            className={cn(
              'w-full flex items-center justify-center py-2.5 rounded-lg transition-all duration-200',
              hasActive && isCollapsed ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'
            )}
          >
            <Folder
              className="w-4 h-4 transition-colors"
              style={{ color: hasActive && isCollapsed ? 'var(--color-accent-gold, #f59e0b)' : folderColorHex }}
            />
          </button>
          <div style={{
            display: 'grid',
            gridTemplateRows: isCollapsed ? '0fr' : '1fr',
            transition: 'grid-template-rows 200ms ease',
          }}>
            <div style={{ overflow: 'hidden' }}>
              {visibleItems.map(i => renderNavButton(i))}
            </div>
          </div>
        </React.Fragment>
      );
    }

    const isCollapsed = collapsedFolders.has(entry.id);
    const hasActive = visibleItems.some(i => i.id === activeTab);
    const folderColorHex = getFolderColor(entry.color);

    return (
      <div key={entry.id} className="space-y-0.5">
        <button
          onClick={() => toggleFolder(entry.id)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group',
            hasActive && isCollapsed
              ? 'bg-white/[0.02] border border-white/[0.04]'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
          )}
        >
          <Folder
            className="w-3.5 h-3.5 shrink-0 transition-colors"
            style={{ color: hasActive && isCollapsed ? 'var(--color-accent-gold, #f59e0b)' : folderColorHex }}
          />
          <span
            className="font-black text-[10px] uppercase tracking-widest flex-1 text-left truncate transition-colors"
            style={{ color: hasActive && isCollapsed ? 'var(--color-accent-gold, #f59e0b)' : folderColorHex }}
          >
            {entry.label}
          </span>
          <ChevronRight className={cn(
            'w-3 h-3 shrink-0 transition-transform duration-200',
            !isCollapsed && 'rotate-90'
          )} />
        </button>
        <div style={{
          display: 'grid',
          gridTemplateRows: isCollapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 200ms ease',
        }}>
          <div style={{ overflow: 'hidden' }} className="space-y-0.5">
            {visibleItems.map(i => renderNavButton(i, true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className={cn(
      'h-screen fixed left-0 top-0 bg-[#0c0c0e] border-r border-white/5 flex flex-col z-50 transition-all duration-300',
      isCompact ? 'w-20' : 'w-64'
    )}>
      <div className={cn(
        'p-8 pt-14 flex flex-col items-center gap-4 relative',
        isCompact && 'p-4 pt-16'
      )}>
        <button
          onClick={() => setIsCompact(!isCompact)}
          className="absolute -right-3 top-10 w-6 h-6 bg-accent-gold rounded-full flex items-center justify-center text-bg-primary shadow-lg hover:scale-110 transition-all z-[60]"
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', !isCompact && 'rotate-180')} />
        </button>

        <div className={cn('relative transition-all', isCompact ? 'w-10 h-10' : 'w-24 h-24')}>
          <div className="absolute inset-0 bg-accent-gold/10 rounded-2xl blur-xl" />
          <div className="relative w-full h-full bg-bg-secondary border border-accent-gold/30 rounded-2xl overflow-hidden p-2 shadow-2xl transition-transform hover:scale-105 duration-500">
            <img src="/logo.png" alt="MT" className="w-full h-full object-contain" />
          </div>
        </div>
        {!isCompact && (
          <div className="text-center animate-in fade-in slide-in-from-top-2">
            <h1 className="font-bold text-base tracking-tight text-slate-100 font-display">METIN2 TOOLS</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">PREMIUM SUITE</p>
          </div>
        )}
      </div>

      <nav className={cn(
        'flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-hide',
        isCompact && 'overflow-y-hidden px-2'
      )}>
        {layout.map(entry => renderEntry(entry))}
        {orphans.map(item => renderNavButton(item))}
      </nav>
    </aside>
  );
}
