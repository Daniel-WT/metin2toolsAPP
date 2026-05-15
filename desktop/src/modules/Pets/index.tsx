import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Clock, Plus, Search, RefreshCw, Trash2, User as UserIcon, 
  X as CloseIcon, Edit2, Lock, Unlock, Check, Pencil, X
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { ref, onValue, set, push, remove, update } from 'firebase/database';
import { useSpawn } from '../../contexts/SpawnContext';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

// --- Constants & Types ---
const SR_CATS = ['skin-arma', 'costum', 'frizura'] as const;
const IS_CATS = ['atac-auto', 'manusa', 'insotitor', 'sase-sapte'] as const;
type Category = (typeof SR_CATS)[number] | (typeof IS_CATS)[number];

const CAT_META: Record<Category, { label: string; color: string; icon: string; iconF?: string }> = {
  'skin-arma': { label: 'Skin Arma', color: 'text-blue-400', icon: '/icons/arma.png' },
  'costum': { label: 'Costum', color: 'text-purple-400', icon: '/icons/costum_m.png', iconF: '/icons/costum_f.png' },
  'frizura': { label: 'Frizura', color: 'text-teal-400', icon: '/icons/frizura_m.png', iconF: '/icons/frizura_f.png' },
  'atac-auto': { label: 'Atac Auto', color: 'text-amber-400', icon: '/icons/atac.png' },
  'manusa': { label: 'Manusa', color: 'text-orange-400', icon: '/icons/manusa.png' },
  'insotitor': { label: 'Insotitor', color: 'text-rose-400', icon: '/icons/insotitor.png' },
  'sase-sapte': { label: '6/7', color: 'text-emerald-400', icon: '/icons/67.png' },
};

interface SkinItem {
  id: string;
  name: string;
  account: string;
  category: Category;
  gender?: 'M' | 'F' | null;
  expiresAt: number;
  createdAt: number;
  personalized?: boolean;
  depersExpiresAt?: number | null;
  totalDuration: number;
  szImage?: string | null;
}

// --- Helpers ---
const formatDate = (date: number) => {
  if (!date || isNaN(date)) return '-';
  try { return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date); } catch { return '-'; }
};

const formatTimer = (ms: number) => {
  if (!ms || isNaN(ms) || ms <= 0) return 'EXPIRAT';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}z ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m` : `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};

const getPetIcon = (name: string) => {
  if (!name) return '/icons/insotitor.png';
  const n = name.toLowerCase();
  const pets = [['maimuta', 'Maimuta'], ['paianjen', 'Paianjen'], ['paianjan', 'Paianjen'], ['razador', 'Razador'], ['nemere', 'Nemere'], ['dragonette', 'Dragonette'], ['baashido', 'Baashido'], ['executor', 'MiniExecutorGras'], ['nessie', 'Nessie'], ['azrael', 'MiniAzrael'], ['exedyar', 'Exedyar'], ['alastor', 'Alastor'], ['gardian', 'Gardian'], ['aamon', 'Aamon'], ['meley', 'Meley']];
  for (const [kw, file] of pets) if (n.includes(kw)) return `/icons/${file}.png`;
  return '/icons/insotitor.png';
};

const getItemIcon = (cat: Category, gender?: 'M' | 'F' | null, name?: string) => {
  if (cat === 'insotitor' && name) return getPetIcon(name);
  if (!CAT_META[cat]) return '/icons/arma.png';
  return (gender === 'F' && CAT_META[cat].iconF) ? CAT_META[cat].iconF : CAT_META[cat].icon;
};

// --- Sub-Components ---

function SkinCard({ item, onEdit, teamId, openDialog, logActivity }: { item: SkinItem; onEdit: () => void; teamId: string; openDialog: (config: any) => void; logActivity: (msg: string) => void }) {
  const expiresAt = item.expiresAt || 0;
  const totalDuration = item.totalDuration || 1;
  const ms = expiresAt - Date.now(), isExpired = ms <= 0, isWarning = ms > 0 && ms < 86400000;
  const isDepers = item.personalized && item.depersExpiresAt && item.depersExpiresAt > Date.now();
  const pct = isExpired ? 0 : Math.max(2, Math.min(100, (ms / totalDuration) * 100));
  const isLargeIcon = item.category === 'skin-arma' || item.category === 'costum';

  const handleAction = async (type: 'delete' | 'renew' | 'togglePers' | 'feed' | 'sz-finish' | 'sz-retry') => {
    const refPath = `teams/${teamId}/skinReminder/items/${item.id}`;
    
    if (type === 'delete') {
      openDialog({
        title: 'Șterge Item',
        message: `Sigur vrei să ștergi "${item.name}"? Această acțiune este ireversibilă.`,
        type: 'confirm',
        onConfirm: async () => {
          await remove(ref(db, refPath));
          logActivity(`A șters ${item.name} de pe contul ${item.account}`);
        }
      });
    }

    if (type === 'renew') {
      openDialog({
        title: 'Reînnoiește Durata',
        message: 'Introdu durata exactă pentru care dorești să reînnoiești acest item:',
        type: 'renew',
        onConfirm: async (val: { d: string, h: string, m: string }) => {
          const ms = (parseInt(val.d || '0') * 24 + parseInt(val.h || '0')) * 3600000 + parseInt(val.m || '0') * 60000;
          if (ms > 0) {
            await update(ref(db, refPath), { expiresAt: Date.now() + ms, totalDuration: ms });
            logActivity(`A reînnoit ${item.category} pe ${item.account}`);
          }
        }
      });
    }

    if (type === 'feed') {
      const ms = item.totalDuration || 0;
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const durStr = d > 0 ? `${d}z ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m`;

      openDialog({
        title: 'Hrănește Însoțitor',
        message: (
          <div className="space-y-1">
            <p>Timerul va fi resetat la durata inițială.</p>
            <p className="text-emerald-400 font-bold">Durata inițială: {durStr}</p>
          </div>
        ),
        type: 'confirm',
        confirmText: 'HRĂNEȘTE',
        confirmClass: 'bg-emerald-500 text-bg-primary shadow-emerald-500/10 hover:bg-emerald-400',
        onConfirm: async () => {
          await update(ref(db, refPath), { expiresAt: Date.now() + item.totalDuration });
          logActivity(`A hrănit însoțitorul ${item.name} de pe contul ${item.account}`);
        }
      });
    }

    if (type === 'sz-finish') {
      await update(ref(db, refPath), { expiresAt: Date.now() - 1 });
      logActivity(`A finalizat 6/7 pe ${item.account}`);
    }

    if (type === 'sz-retry') {
      await update(ref(db, refPath), { expiresAt: Date.now() + 86400000, totalDuration: 86400000, addedAt: Date.now() });
      logActivity(`A reîncercat 6/7 pe ${item.account}`);
    }

    if (type === 'togglePers') {
      if (item.personalized && !isDepers) {
        openDialog({
          title: 'Depersonalizare',
          message: 'Vrei să începi procesul de depersonalizare? Acesta va dura 3 zile.',
          type: 'confirm',
          onConfirm: async () => {
            await update(ref(db, refPath), { depersExpiresAt: Date.now() + 259200000 });
            logActivity(`A început depersonalizarea pentru ${item.category} pe ${item.account}`);
          }
        });
      } else {
        await update(ref(db, refPath), { personalized: !item.personalized, depersExpiresAt: null });
        logActivity(`A ${!item.personalized ? 'personalizat' : 'anulat depersonalizarea pentru'} ${item.category} pe ${item.account}`);
      }
    }
  };

  return (
    <div className={cn(
      "group relative bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/[0.03] rounded-[1.5rem] overflow-hidden transition-all duration-700",
      "hover:bg-[#0c0c0e] hover:border-white/10 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:-translate-y-1",
      isExpired && "opacity-50 grayscale-[0.2]"
    )}>
      {/* Dynamic Accent Gradient */}
      <div className={cn(
        "absolute -top-32 -right-32 w-64 h-64 blur-[100px] rounded-full opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-1000",
        item.category === 'skin-arma' ? "bg-blue-500" : item.category === 'costum' ? "bg-purple-500" : "bg-teal-500"
      )} />

      <div className="p-5 space-y-5 relative z-10">
        {/* Header: Compact & Elegant */}
        <div className="flex gap-5 items-center">
          <div className={cn(
            "shrink-0 flex items-center justify-center transition-all duration-700 group-hover:scale-110",
            isLargeIcon ? "w-20 h-24" : "w-16 h-16"
          )}>
            {item.szImage ? (
              <img src={item.szImage} alt={item.name} className="object-contain h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)] rounded-md" />
            ) : (
              <img src={getItemIcon(item.category, item.gender, item.name)} alt="" className="object-contain h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h4 className="text-[13px] font-black text-slate-100 truncate group-hover:text-white transition-colors tracking-tight uppercase">
              {item.name}
            </h4>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent-gold/[0.03] border border-accent-gold/[0.08] rounded-md w-fit">
              <UserIcon className="w-2.5 h-2.5 text-accent-gold/60" />
              <span className="text-[9px] font-black text-accent-gold/80 tracking-wider">@{item.account}</span>
            </div>
          </div>
        </div>

        {/* Badges: Minimalist Grid */}
        <div className="flex flex-wrap gap-1.5">
          <div className="px-2 py-0.5 bg-white/[0.02] border border-white/[0.05] rounded-md text-[8px] font-black uppercase text-slate-500 tracking-[0.1em]">
            {CAT_META[item.category].label}
          </div>
          {item.gender && (
            <div className={cn(
              "px-2 py-0.5 border rounded-md text-[8px] font-black uppercase tracking-[0.1em]",
              item.gender === 'F' ? "bg-pink-500/5 border-pink-500/10 text-pink-500/60" : "bg-blue-500/5 border-blue-500/10 text-blue-500/60"
            )}>
              {item.gender === 'F' ? 'FEMININ' : 'MASCULIN'}
            </div>
          )}
          {/* Removed personalized badge for Pets */}
          {isWarning && !isExpired && (
            <div className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-md text-[8px] font-black uppercase text-orange-500 animate-pulse">
              SUB 24H
            </div>
          )}
        </div>

        {/* Info Box: Integrated Look */}
        <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03] group-hover:border-white/[0.06] transition-colors space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Rămas</span>
            <span className={cn(
              "text-[9px] font-black tabular-nums",
              isExpired ? "text-red-500/40" : "text-slate-500"
            )}>
              {isExpired ? 'EXPIRED' : `${Math.round(pct)}%`}
            </span>
          </div>
          
          <div className={cn(
            "text-2xl font-black font-display tabular-nums tracking-tighter",
            isExpired ? (item.category === 'sase-sapte' ? "text-emerald-500" : "text-red-500") : (isWarning ? "text-amber-400" : "text-white")
          )}>
            {isExpired && item.category === 'sase-sapte' ? (
              <span className="flex items-center gap-2 text-xl"><Check className="w-5 h-5" /> Finalizat</span>
            ) : formatTimer(ms)}
          </div>

          <div className="space-y-1.5">
            <div className="h-0.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-1000",
                  isExpired ? (item.category === 'sase-sapte' ? "bg-emerald-500" : "bg-red-500") : (isWarning ? "bg-amber-500" : "bg-blue-500")
                )} 
                style={{ width: `${pct}%` }} 
              />
            </div>
            {item.category !== 'sase-sapte' && (
              <p className="text-[9px] font-bold text-slate-600 italic">Expira pe {formatDate(item.expiresAt)}</p>
            )}
          </div>
        </div>

        {/* Actions: Premium Grid */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {item.category === 'sase-sapte' ? (
            isExpired ? (
              <button onClick={() => handleAction('sz-retry')} className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-emerald-500/[0.05] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.1] hover:border-emerald-500/30">
                <RefreshCw className="w-3 h-3" /> Reîncearcă
              </button>
            ) : (
              <button onClick={() => handleAction('sz-finish')} className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-emerald-500/[0.05] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.1] hover:border-emerald-500/30">
                <Check className="w-3 h-3" /> Finalizează
              </button>
            )
          ) : item.category === 'insotitor' ? (
            <button onClick={() => handleAction('feed')} className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-white/[0.01] border-white/[0.03] text-slate-500 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1]">
              <RefreshCw className="w-3 h-3" /> Hrănește
            </button>
          ) : (
            <button onClick={() => handleAction('renew')} className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-white/[0.01] border-white/[0.03] text-slate-500 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1]">
              <RefreshCw className="w-3 h-3" /> Reînnoiește
            </button>
          )}
          <button onClick={onEdit} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-white/[0.01] border-white/[0.03] text-slate-500 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1]">
            <Edit2 className="w-3 h-3" /> Editează
          </button>
          <button onClick={() => handleAction('delete')} className="flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 bg-white/[0.01] border-white/[0.03] text-slate-500 hover:bg-red-500/[0.08] hover:border-red-500/20 hover:text-red-400">
            <Trash2 className="w-3 h-3" /> Șterge
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Page Component ---

export default function Pets() {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const { globalVolume, showToast, logActivity } = useSpawn();
  const [items, setItems] = useState<SkinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SkinItem | null>(null);
  const [dialog, setDialog] = useState<any>({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: () => {} });
  const alertedRef = useRef<Record<string, boolean>>({});

  const playAlertSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(globalVolume * 0.5, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  }, [globalVolume]);

  const openDialog = (config: any) => setDialog({ ...config, isOpen: true });

  // Alert Engine
  useEffect(() => {
    if (!items.length) return;
    const inv = setInterval(() => {
      const now = Date.now();
      items.forEach(item => {
        const ms = item.expiresAt - now;
        
        // 1. Personalized Alert (4 Days)
        if (item.personalized && !item.depersExpiresAt) {
          const fourDaysMs = 4 * 24 * 3600000;
          if (ms <= fourDaysMs && ms > 0) {
            const alertKey = `${item.id}_4d`;
            if (!alertedRef.current[alertKey]) {
              alertedRef.current[alertKey] = true;
              playAlertSound();
              showToast(`⚠️ Personalizat [${item.account}] - ${item.name} expiră în sub 4 zile! Începe depersonalizarea.`);
            }
          }
        }

        // 2. Urgent Alerts (24h, 6h, 5h, 4h, 3h, 2h, 1h)
        const thresholds = [
          { ms: 24 * 3600000, label: '24 ore' },
          { ms: 6 * 3600000, label: '6 ore' },
          { ms: 5 * 3600000, label: '5 ore' },
          { ms: 4 * 3600000, label: '4 ore' },
          { ms: 3 * 3600000, label: '3 ore' },
          { ms: 2 * 3600000, label: '2 ore' },
          { ms: 1 * 3600000, label: '1 oră' }
        ];

        thresholds.forEach(t => {
          if (ms <= t.ms && ms > t.ms - 60000) { // 1 minute window
            const alertKey = `${item.id}_${t.label}`;
            if (!alertedRef.current[alertKey]) {
              alertedRef.current[alertKey] = true;
              playAlertSound();
              showToast(`🚨 [${item.account}] - ${item.name} expiră în ${t.label}!`);
            }
          }
        });
      });
    }, 10000); // Check every 10 seconds
    return () => clearInterval(inv);
  }, [items, playAlertSound, showToast]);

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/skinReminder/items`), (snap) => {
      setItems(snap.val() ? Object.values(snap.val()) : []);
      setLoading(false);
    });
  }, [teamId]);

  const filtered = useMemo(() => {
    return items
      .filter(i => (IS_CATS as readonly string[]).includes(i.category))
      .filter(i => {
        const matchCat = activeFilter === 'all' || i.category === activeFilter;
        const s = (searchTerm || '').toLowerCase();
        const matchSearch = (i.name || '').toLowerCase().includes(s) || (i.account || '').toLowerCase().includes(s);
        return matchCat && matchSearch;
      })
      .sort((a, b) => {
        const ra = (a.expiresAt || 0) - Date.now(), rb = (b.expiresAt || 0) - Date.now();
        if (ra <= 0 && rb > 0) return 1; if (rb <= 0 && ra > 0) return -1;
        return ra - rb;
      });
  }, [items, searchTerm, activeFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const isItems = items.filter(i => (IS_CATS as readonly string[]).includes(i.category));
    return { total: isItems.length, expired: isItems.filter(i => i.expiresAt <= now).length };
  }, [items]);

  return (
    <div className="space-y-8 animate-in pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div><h2 className="text-2xl font-bold text-slate-100 font-display">Însoțitori</h2><p className="text-slate-400 text-sm mt-1">Gestiune expirare pet-uri și utilitare.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Caută..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 w-64 text-xs bg-slate-900/50 border border-white/5 rounded-xl outline-none" />
          </div>
          <button onClick={() => { setEditingItem(null); setIsAddModalOpen(true); }} className="px-6 py-2.5 bg-accent-gold text-bg-primary rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"><Plus className="w-4 h-4 mr-2 inline" /> Adaugă Item</button>
        </div>
      </header>
      <div className="flex gap-4">
        <div className="px-4 py-2 bg-slate-900/40 border border-white/5 rounded-xl flex items-center gap-3"><span className="text-xl font-black text-white">{stats.total}</span><span className="text-[10px] text-slate-500 font-bold uppercase">Total</span></div>
        {stats.expired > 0 && <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3"><span className="text-xl font-black text-red-500">{stats.expired}</span><span className="text-[10px] text-red-500 font-bold uppercase">Expirate</span></div>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button onClick={() => setActiveFilter('all')} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase border", activeFilter === 'all' ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-slate-500")}>Toate</button>
        {(IS_CATS as unknown as Category[]).map(cat => (
          <button key={cat} onClick={() => setActiveFilter(cat)} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase border flex items-center gap-2", activeFilter === cat ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-slate-500")}>
            <img src={CAT_META[cat].icon} alt="" className="w-4 h-4 object-contain opacity-50" /> {CAT_META[cat].label}
          </button>
        ))}
      </div>
      {loading ? <div className="py-20 text-center"><RefreshCw className="w-8 h-8 text-accent-gold animate-spin mx-auto" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
          {filtered.map(i => <SkinCard key={i.id} item={i} onEdit={() => { setEditingItem(i); setIsAddModalOpen(true); }} teamId={teamId!} openDialog={openDialog} logActivity={logActivity} />)}
        </div>
      )}
      {isAddModalOpen && <AddEditModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} item={editingItem} teamId={teamId!} logActivity={logActivity} />}
      {dialog.isOpen && <CustomDialog {...dialog} onClose={() => setDialog({ ...dialog, isOpen: false })} />}
    </div>
  );
}

function AddEditModal({ isOpen, onClose, item, teamId, logActivity }: { isOpen: boolean; onClose: () => void; item: SkinItem | null; teamId: string; logActivity: (msg: string) => void }) {
  const [f, setF] = useState({ name: item?.name || '', account: item?.account || '', category: item?.category || 'insotitor', days: '', hours: '', mins: '', szImage: item?.szImage || null });
  
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (f.category !== 'sase-sapte') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new window.Image();
            img.onload = () => {
              const maxSize = 120;
              const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setF(prev => ({ ...prev, szImage: canvas.toDataURL('image/jpeg', 0.82) }));
              }
            };
            img.src = ev.target?.result as string;
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [f.category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let ms = ((parseInt(f.days) || 0) * 24 + (parseInt(f.hours) || 0)) * 3600000 + (parseInt(f.mins) || 0) * 60000;
      if (f.category === 'sase-sapte') ms = 86400000; // 24h
      
      let finalName = f.name || 'Fără Nume';
      if (f.category === 'atac-auto') finalName = 'Atac Auto';
      if (f.category === 'manusa') finalName = 'Mănușa Tâlharului';

      const data = { 
        name: finalName, 
        account: f.account || 'Cont Necunoscut', 
        category: f.category, 
        gender: null, 
        totalDuration: ms, 
        expiresAt: Date.now() + ms, 
        updatedAt: Date.now(), 
        szImage: f.category === 'sase-sapte' ? (f.szImage || null) : null 
      };

      if (item) {
        await update(ref(db, `teams/${teamId}/skinReminder/items/${item.id}`), data);
        logActivity(`A editat ${finalName} pe contul ${f.account}`);
      } else { 
        const r = push(ref(db, `teams/${teamId}/skinReminder/items`)); 
        await set(r, { id: r.key, ...data, createdAt: Date.now(), personalized: false }); 
        logActivity(`A adăugat ${finalName} pe contul ${f.account}`);
      }
      onClose();
    } catch (err: any) {
      alert("Eroare la salvare: " + err.message);
      console.error(err);
    }
  };

  const showNameInput = f.category === 'insotitor' || f.category === 'sase-sapte';
  const nameLabel = f.category === 'insotitor' ? 'Tip Însoțitor' : 'Nume Item';
  const namePlaceholder = f.category === 'insotitor' ? 'ex: Alastor' : 'ex: Mănuși puternice';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"><div className="absolute inset-0 bg-[#050506]/95 backdrop-blur-3xl" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] bg-[#0c0c0e] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-8 border-b border-white/5 shrink-0">
          <h2 className="text-xl font-bold text-accent-gold uppercase tracking-widest">{item ? 'Editează Item' : 'Adaugă Însoțitor / Utilitar'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto scrollbar-hide">
          <div className={cn("grid transition-all duration-500 ease-in-out", showNameInput ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <div className="space-y-3 mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{nameLabel}</label>
                <input type="text" placeholder={namePlaceholder} required={showNameInput} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:border-accent-gold/20 transition-all" />
              </div>
            </div>
          </div>
          
          <div className={cn("grid transition-all duration-500 ease-in-out", f.category === 'sase-sapte' ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <div className="space-y-3 mb-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                  <span>Imagine Item</span>
                  <span className="text-[8px] bg-white/10 px-2 py-0.5 rounded text-white/50">CTRL+V</span>
                </label>
                <div className="w-full bg-[#151518] border border-white/5 border-dashed rounded-2xl p-6 text-center text-sm text-slate-500 flex flex-col items-center justify-center min-h-[120px] transition-all hover:border-white/20">
                  {f.szImage ? (
                    <img src={f.szImage} alt="" className="h-20 object-contain rounded-lg shadow-xl" />
                  ) : (
                    <>
                      <div className="w-6 h-6 mb-2 opacity-50 mx-auto">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </div>
                      <p>Apasă <strong className="text-white">Ctrl+V</strong> pentru a lipi imaginea itemului</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nume Caracter</label>
            <input type="text" placeholder="ex: Kharleman" required value={f.account} onChange={e => setF({ ...f, account: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:border-accent-gold/20 transition-all" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Categorie</label>
            <div className="grid grid-cols-2 gap-4">
              {IS_CATS.map(cat => (
                <button key={cat} type="button" onClick={() => setF({ ...f, category: cat })} className={cn("p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 group/cat", f.category === cat ? "bg-accent-gold/10 border-accent-gold/40 shadow-xl shadow-accent-gold/5" : "bg-[#151518] border-white/5 hover:border-white/10")}>
                  <div className={cn("flex items-center justify-center transition-transform group-hover/cat:scale-110 duration-500 h-8")}>
                    <img src={getItemIcon(cat as Category, null, f.name)} alt="" className="h-full object-contain drop-shadow-lg" />
                  </div>
                  <span className={cn("text-[8px] font-black uppercase tracking-widest text-center", f.category === cat ? "text-accent-gold" : "text-slate-500")}>{CAT_META[cat as Category].label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className={cn("grid transition-all duration-500 ease-in-out", f.category !== 'sase-sapte' ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Durata Rămasă</label>
                <div className="grid grid-cols-3 gap-4">
                  {['days', 'hours', 'mins'].map(k => (
                    <div key={k} className="space-y-2">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">{k === 'days' ? 'Zile' : k === 'hours' ? 'Ore' : 'Min'}</span>
                      <input type="number" value={(f as any)[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-2xl px-5 py-4 text-center text-sm font-black text-white outline-none focus:border-accent-gold/20 transition-all" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="pt-4 flex gap-4 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-5 rounded-2xl bg-[#151518] border border-white/5 text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all">Anulează</button>
            <button
              type="submit"
              disabled={f.category !== 'sase-sapte' && f.days === '' && f.hours === '' && f.mins === ''}
              className={cn(
                "flex-[2] py-5 rounded-2xl text-[10px] font-black uppercase transition-all shadow-xl",
                (f.category !== 'sase-sapte' && f.days === '' && f.hours === '' && f.mins === '')
                  ? "bg-white/5 text-slate-600 cursor-not-allowed shadow-none"
                  : "bg-accent-gold text-bg-primary hover:scale-[1.02] shadow-accent-gold/10"
              )}
            >{item ? 'Salvează' : 'Adaugă'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomDialog({ title, message, type, onConfirm, onClose, defaultValue, confirmText, confirmClass }: any) {
  const [val, setVal] = useState(defaultValue || '');
  const [r, setR] = useState({ d: '15', h: '0', m: '0' });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[#050506]/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">{title}</h3>
            <div className="text-sm text-slate-400 leading-relaxed">{message}</div>
          </div>

          {type === 'prompt' && (
            <input 
              type="text" 
              autoFocus
              value={val} 
              onChange={e => setVal(e.target.value)}
              className="w-full bg-[#151518] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/20 transition-all"
            />
          )}

          {type === 'renew' && (
            <div className="grid grid-cols-3 gap-4">
              {['d', 'h', 'm'].map(k => (
                <div key={k} className="space-y-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">{k === 'd' ? 'Zile' : k === 'h' ? 'Ore' : 'Min'}</span>
                  <input type="number" autoFocus={k === 'd'} value={(r as any)[k]} onChange={e => setR({ ...r, [k]: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-xl px-4 py-3 text-center text-sm font-black text-white outline-none focus:border-accent-gold/20 transition-all" />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3.5 bg-white/[0.03] border border-white/5 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all">Anulează</button>
            <button 
              onClick={() => { onConfirm(type === 'renew' ? r : val); onClose(); }} 
              className={cn("flex-[1.5] py-3.5 rounded-xl text-[10px] font-black uppercase hover:scale-[1.02] transition-all shadow-xl", confirmClass || "bg-accent-gold text-bg-primary shadow-accent-gold/10")}
            >
              {confirmText || 'Confirmă'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
