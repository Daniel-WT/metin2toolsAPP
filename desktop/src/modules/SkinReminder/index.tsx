import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Plus, Search, RefreshCw, Trash2, User as UserIcon,
  X as CloseIcon, Edit2, Lock, Unlock, CalendarDays
} from 'lucide-react';
import ExpiryCalendar from './ExpiryCalendar';
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
  id: string; name: string; account: string; category: Category;
  gender?: 'M' | 'F' | null; expiresAt: number; createdAt: number;
  personalized?: boolean; depersExpiresAt?: number | null; totalDuration: number;
}

// --- Helpers ---
const formatDate = (date: number) => new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date);

const formatTimer = (ms: number) => {
  if (ms <= 0) return 'EXPIRAT';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}z ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m` : `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};

const getPetIcon = (name: string) => {
  const n = name.toLowerCase();
  const pets = [['maimuta', 'Maimuta'], ['paianjen', 'Paianjen'], ['paianjan', 'Paianjen'], ['razador', 'Razador'], ['nemere', 'Nemere'], ['dragonette', 'Dragonette'], ['baashido', 'Baashido'], ['executor', 'MiniExecutorGras'], ['nessie', 'Nessie'], ['azrael', 'MiniAzrael'], ['exedyar', 'Exedyar'], ['alastor', 'Alastor'], ['gardian', 'Gardian'], ['aamon', 'Aamon'], ['meley', 'Meley']];
  for (const [kw, file] of pets) if (n.includes(kw)) return `/icons/${file}.png`;
  return '/icons/insotitor.png';
};

const getItemIcon = (cat: Category, gender?: 'M' | 'F' | null, name?: string) => {
  if (cat === 'insotitor' && name) return getPetIcon(name);
  return (gender === 'F' && CAT_META[cat].iconF) ? CAT_META[cat].iconF : CAT_META[cat].icon;
};

// --- Sub-Components ---

function SkinCard({ item, onEdit, teamId, openDialog, logActivity }: { item: SkinItem; onEdit: () => void; teamId: string; openDialog: (config: any) => void; logActivity: (msg: string) => void }) {
  const ms = item.expiresAt - Date.now(), isExpired = ms <= 0, isWarning = ms > 0 && ms < 86400000;
  const isDepers = item.personalized && item.depersExpiresAt && item.depersExpiresAt > Date.now();
  const pct = isExpired ? 0 : Math.max(2, Math.min(100, (ms / item.totalDuration) * 100));
  const isLargeIcon = item.category === 'skin-arma' || item.category === 'costum';
  const is67 = item.category === 'sase-sapte';

  const handleAction = async (type: 'delete' | 'renew' | 'togglePers' | 'reset67') => {
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

    if (type === 'reset67') {
      const dur = 86400000;
      await update(ref(db, refPath), { expiresAt: Date.now() + dur, totalDuration: dur });
      logActivity(`A resetat 6/7 pentru ${item.name} pe contul ${item.account}`);
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
            logActivity(`A reînnoit ${item.name} pe contul ${item.account}`);
          }
        }
      });
    }

    if (type === 'togglePers') {
      if (item.personalized && !isDepers) {
        openDialog({
          title: 'Depersonalizare',
          message: 'Vrei să începi procesul de depersonalizare? Acesta va dura 3 zile.',
          type: 'confirm',
          onConfirm: async () => {
            await update(ref(db, refPath), { depersExpiresAt: Date.now() + 259200000 });
            logActivity(`A început depersonalizarea pentru ${item.name} de pe contul ${item.account}`);
          }
        });
      } else {
        await update(ref(db, refPath), { personalized: !item.personalized, depersExpiresAt: null });
        logActivity(`A ${!item.personalized ? 'personalizat' : 'anulat depersonalizarea pentru'} ${item.name} de pe contul ${item.account}`);
      }
    }
  };

  return (
    <div className={cn(
      "group relative bg-[#0a0a0c]/80 backdrop-blur-xl border rounded-[1.5rem] overflow-hidden transition-all duration-700 flex flex-col h-full",
      "hover:bg-[#0c0c0e] hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:-translate-y-1",
      isExpired && !is67 && "opacity-50 grayscale-[0.2]",
      item.personalized && !isDepers && !is67
        ? "border-red-500/25 hover:border-red-500/40"
        : "border-white/[0.03] hover:border-white/10"
    )}>
      {/* Dynamic Accent Gradient */}
      <div className={cn(
        "absolute -top-32 -right-32 w-64 h-64 blur-[100px] rounded-full transition-opacity duration-1000",
        item.personalized && !isDepers && !is67
          ? "bg-red-500 opacity-[0.07] group-hover:opacity-[0.14]"
          : "opacity-[0.03] group-hover:opacity-[0.08]",
        !item.personalized || isDepers || is67
          ? (item.category === 'skin-arma' ? "bg-blue-500" : item.category === 'costum' ? "bg-purple-500" : "bg-teal-500")
          : ""
      )} />

      <div className="p-5 relative z-10 flex flex-col flex-1 gap-5">
        {/* Top: Header + Badges — flex-1 so RĂMAS always starts at consistent position */}
        <div className="space-y-4 flex-1">
          {/* Header: Compact & Elegant */}
          <div className="flex gap-5 items-center">
            <div className={cn(
              "shrink-0 flex items-center justify-center transition-all duration-700 group-hover:scale-110",
              isLargeIcon ? "w-20 h-24" : "w-16 h-16"
            )}>
              <img src={getItemIcon(item.category, item.gender, item.name)} alt="" className="object-contain h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <h4 className="text-[13px] font-black text-slate-100 break-words leading-tight group-hover:text-white transition-colors tracking-tight uppercase">
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
            {!is67 && (
              <div className={cn(
                "px-2 py-0.5 border rounded-md text-[8px] font-black uppercase tracking-[0.1em] transition-all",
                item.personalized
                  ? (isDepers ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-red-500/10 border-red-500/20 text-red-500/60")
                  : "bg-emerald-500/5 border-emerald-500/10 text-emerald-500/60"
              )}>
                {item.personalized
                  ? (isDepers ? `Depersonalizare: ${formatTimer(item.depersExpiresAt! - Date.now())}` : 'PERSONALIZAT')
                  : 'DEPERSONALIZAT'}
              </div>
            )}
            {isWarning && !isExpired && !is67 && (
              <div className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-md text-[8px] font-black uppercase text-orange-500 animate-pulse">
                SUB 24H
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Info Box + Actions */}
        <div className="space-y-4">
          {/* Info Box: Integrated Look */}
          <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03] group-hover:border-white/[0.06] transition-colors space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Rămas</span>
              <span className={cn(
                "text-[9px] font-black tabular-nums",
                isExpired ? (is67 ? "text-emerald-500/50" : "text-red-500/40") : "text-slate-500"
              )}>
                {isExpired ? (is67 ? 'FINALIZAT' : 'EXPIRED') : `${Math.round(pct)}%`}
              </span>
            </div>

            <div className={cn(
              "text-2xl font-black font-display tabular-nums tracking-tighter",
              isExpired ? (is67 ? "text-emerald-500" : "text-red-500") : (isWarning ? "text-amber-400" : "text-white")
            )}>
              {isExpired && is67 ? 'FINALIZAT' : formatTimer(ms)}
            </div>

            <div className="space-y-1.5">
              <div className="h-0.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-1000",
                    isExpired ? (is67 ? "bg-emerald-500" : "bg-red-500") : (isWarning ? "bg-amber-500" : "bg-blue-500")
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[9px] font-bold text-slate-600 italic">Expira pe {formatDate(item.expiresAt)}</p>
            </div>
          </div>

          {/* Actions: Premium Grid */}
          <div className="grid grid-cols-2 gap-1.5">
          {(is67 ? [
            { icon: RefreshCw, label: 'Resetează', action: () => handleAction('reset67'), danger: false, span: false },
            { icon: Edit2,     label: 'Editează',  action: onEdit,                        danger: false, span: false },
            { icon: Trash2,    label: 'Șterge',    action: () => handleAction('delete'),  danger: true,  span: true  },
          ] : [
            { icon: item.personalized ? Unlock : Lock, label: item.personalized ? 'Depers.' : 'Pers.', action: () => handleAction('togglePers'), danger: false, span: false },
            { icon: RefreshCw, label: 'Reînnoiește', action: () => handleAction('renew'), danger: false, disabled: item.personalized, span: false },
            { icon: Edit2,     label: 'Editează',    action: onEdit,                      danger: false, span: false },
            { icon: Trash2,    label: 'Șterge',      action: () => handleAction('delete'),danger: true,  span: false },
          ]).map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.action}
              disabled={(btn as any).disabled}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300",
                "bg-white/[0.01] border-white/[0.03] text-slate-500 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1] disabled:opacity-5 disabled:grayscale",
                btn.danger && "hover:bg-red-500/[0.08] hover:border-red-500/20 hover:text-red-400",
                (btn as any).span && "col-span-2"
              )}
            >
              <btn.icon className="w-3 h-3" />
              {btn.label}
            </button>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page Component ---

export default function SkinReminder() {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const { logActivity, showToast } = useSpawn();
  const [items, setItems] = useState<SkinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'skinuri' | 'insotitori'>('skinuri');
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [only7Days, setOnly7Days] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SkinItem | null>(null);
  const [dialog, setDialog] = useState<any>({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: () => {} });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const openDialog = (config: any) => setDialog({ ...config, isOpen: true });

  const tabCats = activeTab === 'skinuri' ? SR_CATS : IS_CATS;

  const switchTab = (tab: 'skinuri' | 'insotitori') => {
    setActiveTab(tab);
    setActiveFilter('all');
    setSearchTerm('');
  };

  useEffect(() => {
    if (localStorage.getItem('m2_skin_7days_pending') === '1') {
      localStorage.removeItem('m2_skin_7days_pending');
      setOnly7Days(true);
    }
  }, []);

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/skinReminder/items`), (snap) => {
      setItems(snap.val() ? Object.values(snap.val()) : []);
      setLoading(false);
    });
  }, [teamId]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return items
      .filter(i => (tabCats as readonly string[]).includes(i.category))
      .filter(i => (activeFilter === 'all' || i.category === activeFilter) && (i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.account.toLowerCase().includes(searchTerm.toLowerCase())))
      .filter(i => !only7Days || (i.expiresAt > now && i.expiresAt <= now + 7 * 86400000))
      .sort((a, b) => {
        const ra = a.expiresAt - Date.now(), rb = b.expiresAt - Date.now();
        if (ra <= 0 && rb > 0) return 1; if (rb <= 0 && ra > 0) return -1;
        return ra - rb;
      });
  }, [items, searchTerm, activeFilter, activeTab, only7Days]);

  const stats = useMemo(() => {
    const now = Date.now();
    const tabItems = items.filter(i => (tabCats as readonly string[]).includes(i.category));
    const done = tabItems.filter(i => i.expiresAt <= now);
    return {
      total: tabItems.length,
      expired: done.filter(i => i.category !== 'sase-sapte').length,
      finalizat: done.filter(i => i.category === 'sase-sapte').length,
    };
  }, [items, activeTab]);

  return (
    <div className="space-y-8 animate-in pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 font-display">Skin Reminder</h2>
          <p className="text-slate-400 text-sm mt-1">Gestiune expirare iteme și costume.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Caută..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 w-64 text-xs bg-slate-900/50 border border-white/5 rounded-xl outline-none" />
          </div>
          <button
            onClick={() => setIsCalendarOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-accent-gold hover:border-accent-gold/30 hover:bg-accent-gold/[0.05] transition-all"
          >
            <CalendarDays className="w-3.5 h-3.5" /> Calendar
          </button>
          <button onClick={() => { setEditingItem(null); setIsAddModalOpen(true); }} className="px-6 py-2.5 bg-accent-gold text-bg-primary rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all">
            <Plus className="w-4 h-4 mr-2 inline" /> Adaugă Item
          </button>
        </div>
      </header>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-white/[0.02] border border-white/[0.04] rounded-2xl w-fit">
        {(['skinuri', 'insotitori'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={cn(
              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200",
              activeTab === tab
                ? "bg-white/10 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            {tab === 'skinuri' ? 'Skinuri' : 'Însoțitori'}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="px-4 py-2 bg-slate-900/40 border border-white/5 rounded-xl flex items-center gap-3">
          <span className="text-xl font-black text-white">{stats.total}</span>
          <span className="text-[10px] text-slate-500 font-bold uppercase">Total</span>
        </div>
        {stats.expired > 0 && (
          <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
            <span className="text-xl font-black text-red-500">{stats.expired}</span>
            <span className="text-[10px] text-red-500 font-bold uppercase">Expirate</span>
          </div>
        )}
        {stats.finalizat > 0 && (
          <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
            <span className="text-xl font-black text-emerald-500">{stats.finalizat}</span>
            <span className="text-[10px] text-emerald-500 font-bold uppercase">Finalizate</span>
          </div>
        )}
      </div>

      {/* Category filters for current tab */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button onClick={() => setActiveFilter('all')} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase border", activeFilter === 'all' ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-slate-500")}>Toate</button>
        {(tabCats as unknown as Category[]).map(cat => (
          <button key={cat} onClick={() => setActiveFilter(cat)} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase border flex items-center gap-2", activeFilter === cat ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-slate-500")}>
            <img src={CAT_META[cat].icon} alt="" className="w-4 h-4 object-contain opacity-50" /> {CAT_META[cat].label}
          </button>
        ))}
        <button
          onClick={() => setOnly7Days(v => !v)}
          className={cn(
            "px-4 py-2 rounded-xl text-[10px] font-black uppercase border flex items-center gap-2 shrink-0",
            only7Days
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-white/5 border-white/5 text-slate-500"
          )}
        >
          <Clock className="w-3.5 h-3.5" /> Expiră 7 zile
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center"><RefreshCw className="w-8 h-8 text-accent-gold animate-spin mx-auto" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch">
          {filtered.map(i => (
            <SkinCard key={i.id} item={i} onEdit={() => { setEditingItem(i); setIsAddModalOpen(true); }} teamId={teamId!} openDialog={openDialog} logActivity={logActivity} />
          ))}
        </div>
      )}

      {isAddModalOpen && <AddEditModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} item={editingItem} teamId={teamId!} logActivity={logActivity} catGroup={activeTab} />}
      {dialog.isOpen && <CustomDialog {...dialog} onClose={() => setDialog({ ...dialog, isOpen: false })} />}
      {isCalendarOpen && <ExpiryCalendar items={items} filterCats={[...tabCats]} onClose={() => setIsCalendarOpen(false)} />}
    </div>
  );
}

function AddEditModal({ isOpen, onClose, item, teamId, logActivity, catGroup }: { isOpen: boolean; onClose: () => void; item: SkinItem | null; teamId: string; logActivity: (msg: string) => void; catGroup: 'skinuri' | 'insotitori' }) {
  const modalCats = item
    ? ((SR_CATS as readonly string[]).includes(item.category) ? SR_CATS : IS_CATS)
    : (catGroup === 'skinuri' ? SR_CATS : IS_CATS);
  const defaultCat = item?.category || modalCats[0];
  const [f, setF] = useState({ name: item?.name || '', account: item?.account || '', category: defaultCat, gender: item?.gender || 'M', days: '', hours: '', mins: '' });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.days === '' && f.hours === '' && f.mins === '') return;
    try {
      const ms = ((parseInt(f.days) || 0) * 24 + (parseInt(f.hours) || 0)) * 3600000 + (parseInt(f.mins) || 0) * 60000;
      const autoName = showNameInput ? (f.name || 'Fără Nume') : CAT_META[f.category as Category].label;
      const data = { name: autoName, account: f.account || 'Cont Necunoscut', category: f.category, gender: SR_CATS.includes(f.category as any) ? f.gender : null, totalDuration: ms, expiresAt: Date.now() + ms, updatedAt: Date.now() };
      if (item) {
        await update(ref(db, `teams/${teamId}/skinReminder/items/${item.id}`), data);
        logActivity(`A editat ${data.name} pe contul ${data.account}`);
      } else {
        const r = push(ref(db, `teams/${teamId}/skinReminder/items`)); 
        await set(r, { id: r.key, ...data, createdAt: Date.now(), personalized: false });
        logActivity(`A adăugat ${data.name} pe contul ${data.account}`);
      }
      onClose();
    } catch (err: any) {
      alert("Eroare la salvare: " + err.message);
      console.error(err);
    }
  };
  const showGender = SR_CATS.includes(f.category as any) && f.category !== 'skin-arma';
  // Nume câmp vizibil doar pentru skinuri (toate) și pentru însoțitor (tipul contează)
  const showNameInput = (SR_CATS as readonly string[]).includes(f.category) || f.category === 'insotitor';
  const nameLabel = f.category === 'insotitor' ? 'Tip Însoțitor' : 'Nume Item';
  const namePlaceholder = f.category === 'insotitor' ? 'ex: Alastor' : 'ex: Costum PvM';

  const catCols = (modalCats as readonly string[]).length <= 3 ? 'grid-cols-3' : 'grid-cols-4';
  const canSubmit = f.days !== '' || f.hours !== '' || f.mins !== '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0d0d0f] border border-white/[0.06] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.25em]">{item ? 'Editează' : 'Adaugă'}</p>
            <h2 className="text-base font-black text-white tracking-tight mt-0.5">
              {item ? item.name : (catGroup === 'skinuri' ? 'Skin nou' : 'Însoțitor nou')}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 shrink-0 ml-4 flex items-center justify-center rounded-xl border border-white/[0.06] text-slate-500 hover:text-white hover:border-white/20 transition-all">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="h-px bg-white/[0.04] mx-6 shrink-0" />

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto scrollbar-hide">

          {/* Nume + Caracter */}
          <div className={cn("grid gap-3", showNameInput ? "grid-cols-2" : "grid-cols-1")}>
            {showNameInput && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">{nameLabel}</label>
                <input
                  type="text" required value={f.name}
                  onChange={e => setF({ ...f, name: e.target.value })}
                  placeholder={namePlaceholder}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3 text-sm text-white outline-none focus:border-accent-gold/30 transition-colors placeholder:text-slate-700"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Caracter</label>
              <input
                type="text" required value={f.account}
                onChange={e => setF({ ...f, account: e.target.value })}
                placeholder="ex: Kharleman"
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-3 text-sm text-white outline-none focus:border-accent-gold/30 transition-colors placeholder:text-slate-700"
              />
            </div>
          </div>

          {/* Categorie */}
          <div className="space-y-2.5">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Categorie</label>
            <div className={cn("grid gap-2", catCols)}>
              {(modalCats as readonly string[]).map(cat => (
                <button
                  key={cat} type="button"
                  onClick={() => setF({ ...f, category: cat })}
                  className={cn(
                    "relative flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all duration-200 group/cat",
                    f.category === cat
                      ? "bg-accent-gold/[0.08] border-accent-gold/35"
                      : "bg-white/[0.02] border-white/[0.04] hover:border-white/10 hover:bg-white/[0.03]"
                  )}
                >
                  {f.category === cat && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent-gold" />
                  )}
                  <div className={cn("flex items-center justify-center transition-transform duration-300 group-hover/cat:scale-110", (cat === 'skin-arma' || cat === 'costum') ? "h-10" : "h-7")}>
                    <img src={getItemIcon(cat as Category, f.gender as any, f.name)} alt="" className="h-full object-contain drop-shadow-md" />
                  </div>
                  <span className={cn("text-[7px] font-black uppercase tracking-wider text-center leading-tight", f.category === cat ? "text-accent-gold" : "text-slate-600")}>
                    {CAT_META[cat as Category].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Gen — smooth animated */}
          <div className={cn("overflow-hidden transition-all duration-300 ease-in-out", showGender ? "max-h-24 opacity-100" : "max-h-0 opacity-0 pointer-events-none")}>
            <div className="space-y-2.5">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Gen</label>
              <div className="flex gap-2 p-1 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                {(['F', 'M'] as const).map(g => (
                  <button key={g} type="button" onClick={() => setF({ ...f, gender: g })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200",
                      f.gender === g
                        ? g === 'F'
                          ? "bg-pink-500/15 border border-pink-500/25 text-pink-400"
                          : "bg-blue-500/15 border border-blue-500/25 text-blue-400"
                        : "text-slate-600 hover:text-slate-400 border border-transparent"
                    )}>
                    <img src={`/icons/${g === 'F' ? 'female' : 'male'}.png`} alt="" className="w-4 h-4 object-contain" />
                    {g === 'F' ? 'Feminin' : 'Masculin'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Durată */}
          <div className="space-y-2.5">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Durată Rămasă</label>
            <div className="flex gap-2">
              {([['days', 'Zile'], ['hours', 'Ore'], ['mins', 'Min']] as const).map(([k, lbl]) => (
                <div key={k} className="flex-1 relative">
                  <input
                    type="number" min="0"
                    value={(f as any)[k]}
                    onChange={e => setF({ ...f, [k]: e.target.value })}
                    placeholder="0"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-2 pt-3 pb-5 text-center text-base font-black text-white outline-none focus:border-accent-gold/30 transition-colors placeholder:text-slate-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute bottom-1.5 left-0 right-0 text-center text-[7px] font-black text-slate-600 uppercase tracking-wider pointer-events-none">{lbl}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="px-5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-white hover:border-white/15 transition-all">
              Anulează
            </button>
            <button type="submit" disabled={!canSubmit}
              className={cn(
                "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                canSubmit
                  ? "bg-accent-gold text-[#0a0a0c] hover:bg-amber-400 shadow-lg shadow-accent-gold/10"
                  : "bg-white/[0.03] border border-white/[0.04] text-slate-700 cursor-not-allowed"
              )}>
              {item ? 'Salvează Modificările' : 'Adaugă'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomDialog({ title, message, type, onConfirm, onClose, defaultValue }: any) {
  const [val, setVal] = useState(defaultValue || '');
  const [r, setR] = useState({ d: '', h: '', m: '' });
  const isDanger = title?.toLowerCase().includes('șter') || title?.toLowerCase().includes('ster');
  const canConfirmRenew = r.d !== '' || r.h !== '' || r.m !== '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#0d0d0f] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden">

        {isDanger && <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />}
        {!isDanger && type === 'confirm' && <div className="h-px bg-gradient-to-r from-transparent via-accent-gold/25 to-transparent" />}

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <h3 className={cn("text-sm font-black uppercase tracking-tight", isDanger ? "text-red-400" : "text-white")}>{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{message}</p>
          </div>

          {type === 'prompt' && (
            <input
              type="text" autoFocus value={val}
              onChange={e => setVal(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/30 transition-colors"
            />
          )}

          {type === 'renew' && (
            <div className="flex gap-2">
              {([['d', 'Zile'], ['h', 'Ore'], ['m', 'Min']] as const).map(([k, lbl], i) => (
                <div key={k} className="flex-1 relative">
                  <input
                    type="number" min="0" autoFocus={i === 0}
                    value={(r as any)[k]}
                    onChange={e => setR({ ...r, [k]: e.target.value })}
                    placeholder="0"
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-2 pt-3 pb-5 text-center text-base font-black text-white outline-none focus:border-accent-gold/30 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute bottom-1.5 left-0 right-0 text-center text-[7px] font-black text-slate-600 uppercase tracking-wider pointer-events-none">{lbl}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2.5">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-white hover:border-white/15 transition-all">
              Anulează
            </button>
            <button
              disabled={type === 'renew' && !canConfirmRenew}
              onClick={() => { onConfirm(type === 'renew' ? r : val); onClose(); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg",
                type === 'renew' && !canConfirmRenew
                  ? "bg-white/[0.03] border border-white/[0.04] text-slate-700 cursor-not-allowed shadow-none"
                  : isDanger
                    ? "bg-red-500/90 text-white hover:bg-red-500 shadow-red-500/10"
                    : "bg-accent-gold text-[#0a0a0c] hover:bg-amber-400 shadow-accent-gold/10"
              )}>
              {isDanger ? 'Șterge' : 'Confirmă'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
