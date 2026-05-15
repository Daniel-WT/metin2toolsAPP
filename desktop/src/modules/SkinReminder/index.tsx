import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Plus, Search, RefreshCw, Trash2, User as UserIcon, 
  X as CloseIcon, Edit2, Lock, Unlock
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

  const handleAction = async (type: 'delete' | 'renew' | 'togglePers') => {
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
            <img src={getItemIcon(item.category, item.gender, item.name)} alt="" className="object-contain h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]" />
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
            isExpired ? "text-red-500" : (isWarning ? "text-amber-400" : "text-white")
          )}>
            {formatTimer(ms)}
          </div>

          <div className="space-y-1.5">
            <div className="h-0.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-1000",
                  isExpired ? "bg-red-500" : (isWarning ? "bg-amber-500" : "bg-blue-500")
                )} 
                style={{ width: `${pct}%` }} 
              />
            </div>
            <p className="text-[9px] font-bold text-slate-600 italic">Expira pe {formatDate(item.expiresAt)}</p>
          </div>
        </div>

        {/* Actions: Premium Grid */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {[
            { icon: item.personalized ? Unlock : Lock, label: item.personalized ? 'Depers.' : 'Pers.', action: () => handleAction('togglePers'), danger: false },
            { icon: RefreshCw, label: 'Reînnoiește', action: () => handleAction('renew'), danger: false, disabled: item.personalized },
            { icon: Edit2, label: 'Editează', action: onEdit, danger: false },
            { icon: Trash2, label: 'Șterge', action: () => handleAction('delete'), danger: true },
          ].map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.action}
              disabled={btn.disabled}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300",
                "bg-white/[0.01] border-white/[0.03] text-slate-500 hover:text-white hover:bg-white/[0.05] hover:border-white/[0.1] disabled:opacity-5 disabled:grayscale",
                btn.danger && "hover:bg-red-500/[0.08] hover:border-red-500/20 hover:text-red-400"
              )}
            >
              <btn.icon className="w-3 h-3" />
              {btn.label}
            </button>
          ))}
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
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SkinItem | null>(null);
  const [dialog, setDialog] = useState<any>({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: () => {} });
  const openDialog = (config: any) => setDialog({ ...config, isOpen: true });

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/skinReminder/items`), (snap) => {
      setItems(snap.val() ? Object.values(snap.val()) : []);
      setLoading(false);
    });
  }, [teamId]);

  const filtered = useMemo(() => {
    return items
      .filter(i => (SR_CATS as readonly string[]).includes(i.category))
      .filter(i => (activeFilter === 'all' || i.category === activeFilter) && (i.name.toLowerCase().includes(searchTerm.toLowerCase()) || i.account.toLowerCase().includes(searchTerm.toLowerCase())))
      .sort((a, b) => {
        const ra = a.expiresAt - Date.now(), rb = b.expiresAt - Date.now();
        if (ra <= 0 && rb > 0) return 1; if (rb <= 0 && ra > 0) return -1;
        return ra - rb;
      });
  }, [items, searchTerm, activeFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const srItems = items.filter(i => (SR_CATS as readonly string[]).includes(i.category));
    return { total: srItems.length, expired: srItems.filter(i => i.expiresAt <= now).length };
  }, [items]);

  return (
    <div className="space-y-8 animate-in pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div><h2 className="text-2xl font-bold text-slate-100 font-display">Skin Reminder</h2><p className="text-slate-400 text-sm mt-1">Gestiune expirare iteme și costume.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Caută..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 w-64 text-xs bg-slate-900/50 border border-white/5 rounded-xl outline-none" />
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('m2_skin_confirmed');
              console.log('[SkinAlert] Alerte confirmate resetate. Reîncarcă pagina pentru efect imediat.');
              showToast('Alerte resetate. Vei vedea din nou alertele active.', 'success');
            }}
            className="px-4 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all"
            title="Șterge alertele confirmate din localStorage — util dacă nu apare modalul de expirare"
          >Resetează Alerte</button>
          <button onClick={() => { setEditingItem(null); setIsAddModalOpen(true); }} className="px-6 py-2.5 bg-accent-gold text-bg-primary rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"><Plus className="w-4 h-4 mr-2 inline" /> Adaugă Item</button>
        </div>
      </header>
      <div className="flex gap-4">
        <div className="px-4 py-2 bg-slate-900/40 border border-white/5 rounded-xl flex items-center gap-3"><span className="text-xl font-black text-white">{stats.total}</span><span className="text-[10px] text-slate-500 font-bold uppercase">Total</span></div>
        {stats.expired > 0 && <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3"><span className="text-xl font-black text-red-500">{stats.expired}</span><span className="text-[10px] text-red-500 font-bold uppercase">Expirate</span></div>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <button onClick={() => setActiveFilter('all')} className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase border", activeFilter === 'all' ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-slate-500")}>Toate</button>
        {(SR_CATS as Category[]).map(cat => (
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
  const [f, setF] = useState({ name: item?.name || '', account: item?.account || '', category: item?.category || 'skin-arma', gender: item?.gender || 'M', days: '', hours: '', mins: '' });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.days === '' && f.hours === '' && f.mins === '') return;
    try {
      const ms = ((parseInt(f.days) || 0) * 24 + (parseInt(f.hours) || 0)) * 3600000 + (parseInt(f.mins) || 0) * 60000;
      const data = { name: f.name || 'Fără Nume', account: f.account || 'Cont Necunoscut', category: f.category, gender: SR_CATS.includes(f.category as any) ? f.gender : null, totalDuration: ms, expiresAt: Date.now() + ms, updatedAt: Date.now() };
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"><div className="absolute inset-0 bg-[#050506]/95 backdrop-blur-3xl" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] bg-[#0c0c0e] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-8 border-b border-white/5 shrink-0">
          <h2 className="text-xl font-bold text-accent-gold uppercase tracking-widest">{item ? 'Editează Item' : 'Adaugă Skin/Costum'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto scrollbar-hide">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nume Item</label>
            <input type="text" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:border-accent-gold/20 transition-all" />
          </div>
          <div className={cn("grid transition-all duration-500 ease-in-out", showGender ? "grid-rows-[1fr] opacity-100 mb-6" : "grid-rows-[0fr] opacity-0 mb-0")}>
            <div className="overflow-hidden">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Gen</label>
                <div className="flex gap-4">
                  {['F', 'M'].map(g => (
                    <button key={g} type="button" onClick={() => setF({ ...f, gender: g as any })} className={cn("flex-1 py-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-3", f.gender === g ? (g === 'F' ? "bg-pink-500/10 border-pink-500/40 text-pink-400" : "bg-blue-500/10 border-blue-500/40 text-blue-400") : "bg-[#151518] border-white/5 text-slate-500 hover:border-white/10")}>
                      <img src={`/icons/${g === 'F' ? 'female' : 'male'}.png`} alt="" className="w-5 h-5 object-contain" /> {g === 'F' ? 'Feminin' : 'Masculin'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nume Caracter</label>
            <input type="text" required value={f.account} onChange={e => setF({ ...f, account: e.target.value })} className="w-full bg-[#151518] border border-white/5 rounded-2xl px-6 py-5 text-sm text-white outline-none focus:border-accent-gold/20 transition-all" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Categorie</label>
            <div className="grid grid-cols-3 gap-4">
              {SR_CATS.map(cat => (
                <button key={cat} type="button" onClick={() => setF({ ...f, category: cat })} className={cn("p-4 rounded-2xl border transition-all flex flex-col items-center gap-3 group/cat", f.category === cat ? "bg-accent-gold/10 border-accent-gold/40 shadow-xl shadow-accent-gold/5" : "bg-[#151518] border-white/5 hover:border-white/10")}>
                  <div className={cn("flex items-center justify-center transition-transform group-hover/cat:scale-110 duration-500", (cat === 'skin-arma' || cat === 'costum') ? "h-12" : "h-8")}>
                    <img src={getItemIcon(cat as Category, f.gender as any, f.name)} alt="" className="h-full object-contain drop-shadow-lg" />
                  </div>
                  <span className={cn("text-[8px] font-black uppercase tracking-widest text-center", f.category === cat ? "text-accent-gold" : "text-slate-500")}>{CAT_META[cat as Category].label}</span>
                </button>
              ))}
            </div>
          </div>
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
          <div className="pt-4 flex gap-4 shrink-0">
            <button type="button" onClick={onClose} className="flex-1 py-5 rounded-2xl bg-[#151518] border border-white/5 text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all">Anulează</button>
            <button type="submit" disabled={f.days === '' && f.hours === '' && f.mins === ''} className={cn("flex-[2] py-5 rounded-2xl text-[10px] font-black uppercase transition-all shadow-xl", f.days === '' && f.hours === '' && f.mins === '' ? "bg-white/5 text-slate-600 cursor-not-allowed shadow-none" : "bg-accent-gold text-bg-primary hover:scale-[1.02] shadow-accent-gold/10")}>{item ? 'Salvează' : 'Adaugă'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomDialog({ title, message, type, onConfirm, onClose, defaultValue }: any) {
  const [val, setVal] = useState(defaultValue || '');
  const [r, setR] = useState({ d: '15', h: '0', m: '0' });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[#050506]/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">{title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{message}</p>
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
              className="flex-[1.5] py-3.5 bg-accent-gold text-bg-primary rounded-xl text-[10px] font-black uppercase hover:scale-[1.02] transition-all shadow-xl shadow-accent-gold/10"
            >
              Confirmă
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
