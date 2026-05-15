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

export const navItems: NavItem[] = [
  { id: 'overview', name: 'Overview', icon: LayoutDashboard, label: 'Control Center' },
  { id: 'spawn', name: 'Spawn Tracker', icon: MapIcon, label: 'Boss Monitor' },
  { id: 'skins', name: 'Skin Reminder', icon: Clock, label: 'Expiry Alerts' },
  { id: 'pets', name: 'Insotitori', icon: Package, label: 'Pets & Site' },
  { id: 'inventory', name: 'Inventory', icon: Package, label: 'Resource Management' },
  { id: 'status', name: 'Server Status', icon: Activity, label: 'Network Monitor' },
  { id: 'checklist', name: 'Checklist', icon: CheckCircle2, label: 'Task Management' },
  { id: 'transfers', name: 'Transfers', icon: ArrowLeftRight, label: 'Player Migration' },
  { id: 'team', name: 'Echipa', icon: Users, label: 'Team Management' },
  { id: 'alarms', name: 'Alarme', icon: Bell, label: 'Alarms & Timers' },
  { id: 'tweaks', name: 'Tweaks', icon: Sliders, label: 'Game Settings' },
  { id: 'admin', name: 'Admin Panel', icon: ShieldCheck, label: 'System Control', adminOnly: true },
];

export const LS_SIDEBAR_ORDER = 'm2pro_sidebar_order';
export function loadSidebarOrder(): string[] { try { return JSON.parse(localStorage.getItem(LS_SIDEBAR_ORDER) || '[]'); } catch { return []; } }
export function saveSidebarOrder(v: string[]) { localStorage.setItem(LS_SIDEBAR_ORDER, JSON.stringify(v)); window.dispatchEvent(new CustomEvent('sidebar-order-changed')); }

interface SidebarProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
  isCompact: boolean;
  setIsCompact: (val: boolean) => void;
}

export function Sidebar({ activeTab, setActiveTab, isCompact, setIsCompact }: SidebarProps) {
  const { user, viewAsMember } = useAuth();
  const isActuallyAdmin = user?.isSuperAdmin && !viewAsMember;
  const [sidebarOrder, setSidebarOrder] = useState<string[]>(loadSidebarOrder);

  useEffect(() => {
    const handler = () => setSidebarOrder(loadSidebarOrder());
    window.addEventListener('sidebar-order-changed', handler);
    return () => window.removeEventListener('sidebar-order-changed', handler);
  }, []);

  const orderedNavItems = useMemo(() => {
    if (!sidebarOrder.length) return navItems;
    return [
      ...sidebarOrder.map(id => navItems.find(n => n.id === id)).filter((n): n is NavItem => !!n),
      ...navItems.filter(n => !sidebarOrder.includes(n.id)),
    ];
  }, [sidebarOrder]);
  
  return (
    <aside className={cn(
      "h-screen fixed left-0 top-0 bg-[#0c0c0e] border-r border-white/5 flex flex-col z-50 transition-all duration-300",
      isCompact ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "p-8 pt-14 flex flex-col items-center gap-4 relative",
        isCompact && "p-4 pt-16"
      )}>
        <button 
          onClick={() => setIsCompact(!isCompact)}
          className="absolute -right-3 top-10 w-6 h-6 bg-accent-gold rounded-full flex items-center justify-center text-bg-primary shadow-lg hover:scale-110 transition-all z-[60]"
        >
          <ChevronRight className={cn("w-4 h-4 transition-transform", !isCompact && "rotate-180")} />
        </button>

        <div className={cn("relative transition-all", isCompact ? "w-10 h-10" : "w-24 h-24")}>
          <div className="absolute inset-0 bg-accent-gold/10 rounded-2xl blur-xl" />
          <div className="relative w-full h-full bg-bg-secondary border border-accent-gold/30 rounded-2xl overflow-hidden p-2 shadow-2xl transition-transform hover:scale-105 duration-500">
            <img 
              src="/logo.png" 
              alt="MT" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        {!isCompact && (
          <div className="text-center animate-in fade-in slide-in-from-top-2">
            <h1 className="font-bold text-base tracking-tight text-slate-100 font-display">
              METIN2 TOOLS
            </h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
              PREMIUM SUITE
            </p>
          </div>
        )}
      </div>

      <nav className={cn(
        "flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-hide",
        isCompact && "overflow-y-hidden px-2"
      )}>
        {orderedNavItems.map((item) => {
          if (item.adminOnly && !isActuallyAdmin) return null;
          
          // Granular Permission Check for Members
          if (user && !isActuallyAdmin && !['overview', 'settings', 'team', 'tweaks', 'alarms'].includes(item.id)) {
            const permKey = item.id === 'skins' || item.id === 'pets' ? 'skin' : item.id;
            const perms = (user as any).permissions || {};
            if (!perms[permKey]) return null;
          }
          
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
                isCompact && "justify-center px-0"
              )}
            >
              <item.icon className={cn(
                'w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110',
                isActive ? 'text-accent-gold' : 'text-slate-600 group-hover:text-slate-400'
              )} />
              {!isCompact && (
                <div className="flex flex-col animate-in fade-in slide-in-from-left-2">
                  <span className="font-bold text-[13px]">{item.name}</span>
                  <span className="text-[9px] text-slate-600 font-medium group-hover:text-slate-500">{item.label}</span>
                </div>
              )}
              {isActive && !isCompact && <ChevronRight className="ml-auto w-3 h-3 text-accent-gold" />}
            </button>
          );
        })}
      </nav>

    </aside>
  );
}
