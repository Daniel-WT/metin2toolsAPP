import { ref, update, remove } from 'firebase/database';
import { db } from '../../lib/firebase';
import { appConfirm } from '../../components/ConfirmModal';

export const SR_CATS = ['skin-arma', 'costum', 'frizura'] as const;
export const IS_CATS = ['atac-auto', 'manusa', 'insotitor', 'sase-sapte', 'site'] as const;

export type Category = (typeof SR_CATS)[number] | (typeof IS_CATS)[number];

export const CAT_META: Record<Category, { label: string; color: string; icon: string; iconF?: string }> = {
  'skin-arma': { label: 'Skin Arma', color: 'text-blue-400', icon: '/icons/arma.png' },
  'costum': { label: 'Costum', color: 'text-purple-400', icon: '/icons/costum_m.png', iconF: '/icons/costum_f.png' },
  'frizura': { label: 'Frizura', color: 'text-teal-400', icon: '/icons/frizura_m.png', iconF: '/icons/frizura_f.png' },
  'atac-auto': { label: 'Atac Auto', color: 'text-amber-400', icon: '/icons/atac.png' },
  'manusa': { label: 'Manusa', color: 'text-orange-400', icon: '/icons/manusa.png' },
  'insotitor': { label: 'Insotitor', color: 'text-rose-400', icon: '/icons/insotitor.png' },
  'sase-sapte': { label: '6/7', color: 'text-emerald-400', icon: '/icons/67.png' },
  'site': { label: 'Site', color: 'text-yellow-400', icon: '/icons/insotitor.png' },
};

export interface SkinItem {
  id: string; name: string; account: string; category: Category;
  gender?: 'M' | 'F' | null; expiresAt: number; createdAt: number;
  personalized?: boolean; depersExpiresAt?: number | null; totalDuration: number;
}

export const formatDate = (date: number) => new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short' }).format(date);

export const formatTimer = (ms: number) => {
  if (ms <= 0) return 'EXPIRAT';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}z ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m` : `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
};

export const getPetIcon = (name: string) => {
  const n = name.toLowerCase();
  const pets = [['maimuta', 'Maimuta'], ['paianjen', 'Paianjen'], ['paianjan', 'Paianjen'], ['razador', 'Razador'], ['nemere', 'Nemere'], ['dragonette', 'Dragonette'], ['baashido', 'Baashido'], ['executor', 'MiniExecutorGras'], ['nessie', 'Nessie'], ['azrael', 'MiniAzrael'], ['exedyar', 'Exedyar'], ['alastor', 'Alastor'], ['gardian', 'Gardian'], ['aamon', 'Aamon'], ['meley', 'Meley']];
  for (const [kw, file] of pets) if (n.includes(kw)) return `/icons/${file}.png`;
  return '/icons/insotitor.png';
};

export const getItemIcon = (cat: Category, gender?: 'M' | 'F' | null, name?: string) => {
  if (cat === 'insotitor' && name) return getPetIcon(name);
  return (gender === 'F' && CAT_META[cat].iconF) ? CAT_META[cat].iconF : CAT_META[cat].icon;
};

export const handleSkinAction = async (item: SkinItem, teamId: string, type: 'delete' | 'renew' | 'togglePers') => {
  const refPath = `teams/${teamId}/skinReminder/items/${item.id}`;
  if (type === 'delete') {
    if (await appConfirm(`Stergi "${item.name}"?`, { title: 'Stergere item', variant: 'danger' }))
      await remove(ref(db, refPath));
  }
  if (type === 'renew') {
    const days = prompt(`Zile reinnoire:`, '15');
    if (days) {
      const dms = parseInt(days) * 86400000;
      await update(ref(db, refPath), { expiresAt: Date.now() + dms, totalDuration: dms });
    }
  }
  if (type === 'togglePers') {
    if (item.personalized && !item.depersExpiresAt) {
      if (await appConfirm('Incepi depersonalizarea? Dureaza 3 zile.', { title: 'Depersonalizare', variant: 'warning', confirmText: 'Incepe' }))
        await update(ref(db, refPath), { depersExpiresAt: Date.now() + 259200000 });
    } else {
      await update(ref(db, refPath), { personalized: !item.personalized, depersExpiresAt: null });
    }
  }
};
