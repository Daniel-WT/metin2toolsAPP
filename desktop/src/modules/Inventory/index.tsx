import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Package, Plus, Search, Trash2, Edit2, ChevronRight, User, CheckCircle2, XCircle, Image as ImageIcon, X, GripVertical, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { appConfirm } from '../../components/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { ref, onValue, set, push, remove, update } from 'firebase/database';


interface InventoryAccount {
  name: string;
  qty: number;
  platform?: string;
  email?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  image?: string;
  accounts: InventoryAccount[];
  order: number;
  addedAt: number;
}

export default function InventoryManager() {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [editingAccount, setEditingAccount] = useState<{ idx: number; data: InventoryAccount } | null>(null);
  const [newAcc, setNewAcc] = useState({ name: '', qty: 1, platform: '', email: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editItemData, setEditItemData] = useState<{ name: string; image: string | null }>({ name: '', image: null });

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAddItem, setNewAddItem] = useState({ name: '', accountName: '', qty: 1, platform: '', email: '', image: null as string | null });

  // Drag-and-drop — pointer events (HTML5 DnD nu funcționează în Tauri/WebView2)
  const dragIdRef = useRef<string | null>(null);
  const dragToIdRef = useRef<string | null>(null);
  const itemsRef = useRef<InventoryItem[]>([]);
  const cardEls = useRef<Map<string, HTMLElement>>(new Map());
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const ghostOffsetRef = useRef({ x: 0, y: 0 });
  const ghostInitRect = useRef<{ x: number; y: number; width: number } | null>(null);
  const reorderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ghostItem, setGhostItem] = useState<InventoryItem | null>(null);

  // ── Firebase sync ──────────────────────────────────────────────
  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/inventory/items`), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          ...val,
          accounts: Array.isArray(val.accounts) ? val.accounts : Object.values(val.accounts || {})
        })) as InventoryItem[];
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setItems(list);
        itemsRef.current = list;
      } else {
        setItems([]);
        itemsRef.current = [];
      }
      setLoading(false);
    });
  }, [teamId]);

  // Keep detail modal in sync with live data
  useEffect(() => {
    if (!selectedItem) return;
    const updated = items.find(i => i.id === selectedItem.id);
    if (updated) setSelectedItem(updated);
    else setSelectedItem(null);
  }, [items]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!newAddItem.name.trim() || !teamId) return;
    const newRef = push(ref(db, `teams/${teamId}/inventory/items`));
    const firstAccount: InventoryAccount[] = newAddItem.accountName.trim() ? [{
      name: newAddItem.accountName.trim(),
      qty: Math.max(1, newAddItem.qty),
      ...(newAddItem.platform.trim() ? { platform: newAddItem.platform.trim() } : {}),
      ...(newAddItem.email.trim() ? { email: newAddItem.email.trim() } : {})
    }] : [];
    const data: any = { id: newRef.key, name: newAddItem.name.trim(), accounts: firstAccount, order: items.length, addedAt: Date.now() };
    if (newAddItem.image) data.image = newAddItem.image;
    await set(newRef, data);
    setIsAddModalOpen(false);
    setNewAddItem({ name: '', accountName: '', qty: 1, platform: '', email: '', image: null });
  };

  const handleEditItem = async () => {
    if (!editItemData.name.trim() || !teamId || !selectedItem) return;
    const updates: any = { name: editItemData.name.trim(), image: editItemData.image || null };
    await update(ref(db, `teams/${teamId}/inventory/items/${selectedItem.id}`), updates);
    setIsEditModalOpen(false);
  };

  const handleAddAccount = async () => {
    if (!newAcc.name.trim() || !teamId || !selectedItem) return;
    const item = items.find(i => i.id === selectedItem.id);
    if (!item) return;
    const clean: InventoryAccount = { name: newAcc.name.trim(), qty: Math.max(1, newAcc.qty) };
    if (newAcc.platform.trim()) clean.platform = newAcc.platform.trim();
    if (newAcc.email.trim()) clean.email = newAcc.email.trim();
    const updated = [...(item.accounts || []), clean];
    await set(ref(db, `teams/${teamId}/inventory/items/${selectedItem.id}/accounts`), updated);
    setNewAcc({ name: '', qty: 1, platform: '', email: '' });
  };

  const handleUpdateAccount = async (idx: number, data: InventoryAccount) => {
    if (!teamId || !selectedItem) return;
    const item = items.find(i => i.id === selectedItem.id);
    if (!item) return;
    const updated = [...item.accounts];
    const clean: InventoryAccount = { name: data.name.trim(), qty: Math.max(1, data.qty) };
    if (data.platform?.trim()) clean.platform = data.platform.trim();
    if (data.email?.trim()) clean.email = data.email.trim();
    updated[idx] = clean;
    await set(ref(db, `teams/${teamId}/inventory/items/${selectedItem.id}/accounts`), updated);
    setEditingAccount(null);
  };

  const handleQtyChange = async (itemId: string, idx: number, delta: number) => {
    if (!teamId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const updated = [...item.accounts];
    updated[idx] = { ...updated[idx], qty: Math.max(1, (updated[idx].qty || 1) + delta) };
    await set(ref(db, `teams/${teamId}/inventory/items/${itemId}/accounts`), updated);
  };

  const handleQtySet = async (itemId: string, idx: number, qty: number) => {
    if (!teamId || isNaN(qty) || qty < 1) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const updated = [...item.accounts];
    updated[idx] = { ...updated[idx], qty };
    await set(ref(db, `teams/${teamId}/inventory/items/${itemId}/accounts`), updated);
  };

  const handleDeleteAccount = async (idx: number) => {
    if (!teamId || !selectedItem) return;
    const item = items.find(i => i.id === selectedItem.id);
    if (!item) return;
    const updated = item.accounts.filter((_, i) => i !== idx);
    await set(ref(db, `teams/${teamId}/inventory/items/${selectedItem.id}/accounts`), updated);
  };

  const handleReorder = (fromId: string, toId: string) => {
    if (fromId === toId || !teamId) return;
    const fromIdx = itemsRef.current.findIndex(i => i.id === fromId);
    if (fromIdx === -1) return;
    const reordered = [...itemsRef.current];
    const [moved] = reordered.splice(fromIdx, 1);
    // Find toId in modified array (indices may have shifted after splice)
    const newToIdx = reordered.findIndex(i => i.id === toId);
    if (newToIdx === -1) return;
    reordered.splice(newToIdx, 0, moved);
    // Optimistic update: apply instantly so rapid drags chain correctly
    itemsRef.current = reordered;
    setItems(reordered);
    // Debounced Firebase write: only writes after user stops dragging (avoids race conditions)
    if (reorderDebounceRef.current) clearTimeout(reorderDebounceRef.current);
    reorderDebounceRef.current = setTimeout(() => {
      const updates: Record<string, number> = {};
      itemsRef.current.forEach((item, idx) => {
        updates[`teams/${teamId}/inventory/items/${item.id}/order`] = idx;
      });
      update(ref(db, '/'), updates);
    }, 500);
  };

  const startDrag = (startX: number, startY: number, itemId: string) => {
    const cardEl = cardEls.current.get(itemId);
    if (!cardEl) return;
    const currentItem = itemsRef.current.find(i => i.id === itemId);
    if (!currentItem) return;

    const rect = cardEl.getBoundingClientRect();
    ghostOffsetRef.current = { x: startX - rect.left, y: startY - rect.top };
    ghostInitRect.current = { x: rect.left, y: rect.top, width: rect.width };

    dragIdRef.current = itemId;
    dragToIdRef.current = null;
    setDragId(itemId);
    setDragOverId(null);
    setGhostItem(currentItem);

    // Determine which card the cursor is "before" in reading order (left→right, top→bottom).
    // Returns the card the dragged item should be inserted before, or null (append to end).
    const getInsertBeforeId = (x: number, y: number): string | null => {
      const sorted = Array.from(cardEls.current.entries())
        .filter(([id]) => id !== dragIdRef.current)
        .map(([id, el]) => {
          const r = el.getBoundingClientRect();
          return { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                   midX: (r.left + r.right) / 2, midY: (r.top + r.bottom) / 2 };
        })
        .sort((a, b) => {
          const rowThreshold = Math.min(a.bottom - a.top, b.bottom - b.top) * 0.4;
          return Math.abs(a.top - b.top) > rowThreshold
            ? a.top - b.top
            : a.left - b.left;
        });

      for (const card of sorted) {
        // Cursor is above card's vertical midpoint AND (cursor is above card top OR left of card's center)
        if (y < card.midY && (y < card.top || x < card.midX)) return card.id;
        // Cursor is vertically within card AND horizontally before card's center
        if (y >= card.top && y < card.bottom && x < card.midX) return card.id;
      }
      return null;
    };

    // FLIP animation: smoothly move cards from their current visual position to new layout position
    const flipTo = (newOverId: string | null) => {
      if (newOverId === dragToIdRef.current) return;
      dragToIdRef.current = newOverId;

      // Step 1: capture current visual positions (including any in-progress FLIP transforms)
      const first = new Map<string, { left: number; top: number }>();
      for (const [id, el] of cardEls.current) {
        if (id === dragIdRef.current) continue;
        const r = el.getBoundingClientRect();
        first.set(id, { left: r.left, top: r.top });
      }

      // Step 2: update React state synchronously so the Grid reflows
      flushSync(() => setDragOverId(newOverId));

      // Step 3: clear existing transforms, read final layout positions
      for (const [, el] of cardEls.current) {
        if (el.style.transform) { el.style.transition = 'none'; el.style.transform = ''; }
      }
      void document.body.getBoundingClientRect(); // force reflow

      // Step 4: apply inverse delta, then animate to zero
      for (const [id, el] of cardEls.current) {
        if (id === dragIdRef.current) continue;
        const f = first.get(id);
        if (!f) continue;
        const last = el.getBoundingClientRect();
        const dx = f.left - last.left;
        const dy = f.top - last.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.getBoundingClientRect();
        el.style.transition = 'transform 200ms cubic-bezier(0.25, 0, 0, 1)';
        el.style.transform = '';
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (ghostElRef.current) {
        ghostElRef.current.style.left = `${ev.clientX - ghostOffsetRef.current.x}px`;
        ghostElRef.current.style.top = `${ev.clientY - ghostOffsetRef.current.y}px`;
      }
      flipTo(getInsertBeforeId(ev.clientX, ev.clientY));
    };

    const onUp = () => {
      if (dragIdRef.current && dragToIdRef.current) {
        handleReorder(dragIdRef.current, dragToIdRef.current);
      }
      // Clean up any in-progress FLIP transforms
      for (const [, el] of cardEls.current) {
        el.style.transition = '';
        el.style.transform = '';
      }
      dragIdRef.current = null;
      dragToIdRef.current = null;
      setDragId(null);
      setDragOverId(null);
      setGhostItem(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const handleImagePaste = useCallback((e: React.ClipboardEvent) => {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].type.startsWith('image/')) {
        const blob = e.clipboardData.items[i].getAsFile();
        if (blob) { const r = new FileReader(); r.onload = ev => setNewAddItem(p => ({ ...p, image: ev.target?.result as string })); r.readAsDataURL(blob); }
        break;
      }
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (img: string) => void) => {
    const file = e.target.files?.[0];
    if (file) { const r = new FileReader(); r.onload = ev => setter(ev.target?.result as string); r.readAsDataURL(file); }
  };

  const calculateTotal = (item: InventoryItem) =>
    (item.accounts || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.accounts || []).some(a => a.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Live preview: show dragged card inserted BEFORE dragOverId
  const displayItems = useMemo(() => {
    if (!dragId || !dragOverId || dragId === dragOverId) return filteredItems;
    const fromIdx = filteredItems.findIndex(i => i.id === dragId);
    if (fromIdx === -1) return filteredItems;
    const preview = [...filteredItems];
    const [moved] = preview.splice(fromIdx, 1);
    // Find dragOverId in the modified array — indices shift after splice
    const toIdx = preview.findIndex(i => i.id === dragOverId);
    if (toIdx === -1) return filteredItems;
    preview.splice(toIdx, 0, moved);
    return preview;
  }, [filteredItems, dragId, dragOverId]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-accent-gold" /> Inventory Manager
          </h2>
          <p className="text-slate-400 text-sm">Gestionare resurse și iteme pe echipă</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Caută item sau cont..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-gold/50 w-64 transition-all" />
          </div>
          <button onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-accent-gold text-slate-900 px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-lg shadow-accent-gold/20 hover:brightness-110">
            <Plus className="w-4 h-4" /> Adaugă Item
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-accent-gold/20 border-t-accent-gold rounded-full animate-spin mx-auto" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center">
          <Package className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-20" />
          <p className="text-slate-500">{items.length === 0 ? 'Inventarul este gol. Apasă „Adaugă Item" pentru a începe.' : 'Nu am găsit niciun item.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayItems.map((item) => (
            <div
              key={item.id}
              ref={(el) => { if (el) cardEls.current.set(item.id, el); else cardEls.current.delete(item.id); }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const sx = e.clientX, sy = e.clientY;
                let started = false;
                const onMoveCheck = (ev: PointerEvent) => {
                  if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
                    started = true;
                    document.removeEventListener('pointermove', onMoveCheck);
                    document.removeEventListener('pointerup', onUpCheck);
                    startDrag(sx, sy, item.id);
                  }
                };
                const onUpCheck = () => {
                  document.removeEventListener('pointermove', onMoveCheck);
                  document.removeEventListener('pointerup', onUpCheck);
                  if (!started) setSelectedItem(item);
                };
                document.addEventListener('pointermove', onMoveCheck);
                document.addEventListener('pointerup', onUpCheck);
              }}
              className={cn(
                "group relative bg-slate-900/40 border rounded-xl p-4 transition-colors cursor-grab active:cursor-grabbing overflow-hidden select-none",
                dragId === item.id
                  ? "opacity-0 pointer-events-none border-dashed border-white/10"
                  : dragOverId === item.id
                    ? "border-accent-gold/60 shadow-lg shadow-accent-gold/10 bg-accent-gold/5 scale-[1.02]"
                    : "border-slate-800/50 hover:border-accent-gold/30 hover:shadow-xl hover:shadow-accent-gold/5"
              )}
            >
              {/* Drag affordance icon */}
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-25 transition-opacity z-10 pointer-events-none">
                <GripVertical className="w-4 h-4 text-slate-400" />
              </div>

              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex items-start justify-between mb-4 relative">
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700 group-hover:border-accent-gold/50 transition-colors overflow-hidden ml-4">
                  {item.image
                    ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    : <Package className="w-6 h-6 text-slate-600 group-hover:text-accent-gold transition-colors" />}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Total</div>
                  <div className="text-xl font-black text-accent-gold">{calculateTotal(item)}</div>
                </div>
              </div>

              <h3 className="font-bold text-white mb-2 truncate group-hover:text-accent-gold transition-colors">{item.name}</h3>
              <div className="space-y-1">
                {(item.accounts || []).slice(0, 2).map((acc, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/50">
                    <span className="text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> {acc.name}</span>
                    <span className="text-slate-300 font-mono">x{acc.qty}</span>
                  </div>
                ))}
                {(item.accounts || []).length > 2 && (
                  <div className="text-[10px] text-center text-slate-500 mt-2 font-bold uppercase tracking-tighter">
                    + {(item.accounts || []).length - 2} alte conturi
                  </div>
                )}
                {(item.accounts || []).length === 0 && (
                  <div className="text-[10px] text-slate-600 italic mt-2">Niciun cont adăugat</div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] font-bold text-accent-gold flex items-center gap-1">DETALII <ChevronRight className="w-3 h-3" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Item Modal ─────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121418] border border-white/5 w-full max-w-md rounded-2xl shadow-2xl p-6" onPaste={handleImagePaste}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center border border-white/5">
                <Package className="w-5 h-5 text-accent-gold" />
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">Adaugă Item în Inventar</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nume Item</label>
                <input type="text" placeholder="ex: Piatră magică"
                  value={newAddItem.name} onChange={e => setNewAddItem({ ...newAddItem, name: e.target.value })}
                  className="w-full bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/50 transition-all placeholder:text-slate-600" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cont Inițial (Opțional)</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Nume caracter" value={newAddItem.accountName}
                    onChange={e => setNewAddItem({ ...newAddItem, accountName: e.target.value })}
                    className="flex-1 bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/50 transition-all placeholder:text-slate-600" />
                  <input type="number" value={newAddItem.qty} min={1}
                    onChange={e => setNewAddItem({ ...newAddItem, qty: Number(e.target.value) })}
                    className="w-20 bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white text-center outline-none focus:border-accent-gold/50 transition-all" />
                </div>
                <input type="text" placeholder="Platformă (ex: Steam, Gameforge...)" value={newAddItem.platform}
                  onChange={e => setNewAddItem({ ...newAddItem, platform: e.target.value })}
                  className="w-full bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/50 transition-all placeholder:text-slate-600" />
                <input type="text" placeholder="Email cont (opțional)" value={newAddItem.email}
                  onChange={e => setNewAddItem({ ...newAddItem, email: e.target.value })}
                  className="w-full bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/50 transition-all placeholder:text-slate-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                  <span>Poză Item (Opțional)</span>
                  <span className="text-[8px] bg-white/10 px-2 py-0.5 rounded text-white/50">CTRL+V</span>
                </label>
                <div className={cn("relative border-2 border-dashed rounded-2xl h-32 flex flex-col items-center justify-center gap-2 transition-all",
                  newAddItem.image ? "border-accent-gold/50 bg-accent-gold/5" : "border-white/5 bg-[#1c1f26] hover:border-white/10")}>
                  {newAddItem.image ? (
                    <>
                      <img src={newAddItem.image} className="h-20 w-20 object-contain rounded-lg" alt="Preview" />
                      <button onClick={() => setNewAddItem({ ...newAddItem, image: null })}
                        className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500/40">
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                      <p className="text-[11px] text-slate-500">Click, trage sau <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">Ctrl+V</span></p>
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={e => handleImageUpload(e, img => setNewAddItem(p => ({ ...p, image: img })))} />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsAddModalOpen(false)}
                className="flex-1 px-4 py-3.5 rounded-xl border border-white/5 text-slate-400 font-bold text-sm hover:bg-white/5 transition-all">
                Anulează
              </button>
              <button onClick={handleAddItem} disabled={!newAddItem.name.trim()}
                className="flex-[2] bg-accent-gold disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-accent-gold/20 hover:brightness-110">
                ADAUGĂ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Detail Modal ──────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1115] border border-white/5 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-accent-gold/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5 overflow-hidden">
                  {selectedItem.image
                    ? <img src={selectedItem.image} className="w-full h-full object-cover" alt="" />
                    : <Package className="w-5 h-5 text-accent-gold" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{selectedItem.name}</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Detalii Inventar</p>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left col: total + add account */}
                <div className="space-y-4">
                  <div className="bg-[#16191f] p-4 rounded-2xl border border-white/5 text-center shadow-inner">
                    <div className="text-[10px] uppercase text-slate-500 font-bold mb-1 tracking-widest">Total Item</div>
                    <div className="text-3xl font-black text-accent-gold">{calculateTotal(selectedItem)}</div>
                    <div className="text-[9px] text-slate-600 mt-1 uppercase font-bold">Bucăți în total</div>
                  </div>

                  <div className="bg-[#16191f] p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Plus className="w-3 h-3 text-accent-gold" />
                      <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Adaugă Cont</h4>
                    </div>
                    <input type="text" placeholder="Nume cont" value={newAcc.name}
                      onChange={e => setNewAcc({ ...newAcc, name: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                      className="w-full bg-[#0f1115] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-accent-gold/50 transition-all" />
                    <input type="text" placeholder="Platformă" value={newAcc.platform}
                      onChange={e => setNewAcc({ ...newAcc, platform: e.target.value })}
                      className="w-full bg-[#0f1115] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-accent-gold/50 transition-all" />
                    <input type="text" placeholder="Email (opțional)" value={newAcc.email}
                      onChange={e => setNewAcc({ ...newAcc, email: e.target.value })}
                      className="w-full bg-[#0f1115] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-accent-gold/50 transition-all" />
                    <div className="flex gap-2">
                      <input type="number" value={newAcc.qty} min={1}
                        onChange={e => setNewAcc({ ...newAcc, qty: Number(e.target.value) })}
                        className="w-20 bg-[#0f1115] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white text-center outline-none focus:border-accent-gold/50" />
                      <button onClick={handleAddAccount}
                        className="flex-1 bg-accent-gold text-slate-900 font-black text-[10px] uppercase rounded-xl hover:brightness-110 transition-all shadow-md">
                        Adaugă
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right col: account list */}
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between px-1 mb-3">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Gestiune Conturi</div>
                    <div className="text-[10px] font-bold text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full">
                      {(selectedItem.accounts || []).length} CONTURI
                    </div>
                  </div>

                  {(selectedItem.accounts || []).length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                      <Package className="w-8 h-8 text-slate-800 mx-auto mb-3" />
                      <p className="text-xs text-slate-600">Niciun cont asociat.</p>
                    </div>
                  ) : (
                    (selectedItem.accounts || []).map((acc, idx) => (
                      <div key={idx} className="bg-[#16191f] rounded-2xl border border-white/5 overflow-hidden">
                        {editingAccount?.idx === idx ? (
                          /* ── Edit Form ─────────────────────── */
                          <div className="p-3 space-y-2">
                            <div className="flex gap-2">
                              <input autoFocus value={editingAccount.data.name}
                                onChange={e => setEditingAccount({ ...editingAccount, data: { ...editingAccount.data, name: e.target.value } })}
                                placeholder="Nume cont"
                                className="flex-1 bg-[#0f1115] border border-accent-gold/40 rounded-lg px-3 py-2 text-xs text-white outline-none" />
                              <input type="number" value={editingAccount.data.qty} min={1}
                                onChange={e => setEditingAccount({ ...editingAccount, data: { ...editingAccount.data, qty: Number(e.target.value) } })}
                                className="w-16 bg-[#0f1115] border border-accent-gold/40 rounded-lg px-2 py-2 text-xs text-white text-center outline-none" />
                            </div>
                            <input value={editingAccount.data.platform || ''} placeholder="Platformă"
                              onChange={e => setEditingAccount({ ...editingAccount, data: { ...editingAccount.data, platform: e.target.value } })}
                              className="w-full bg-[#0f1115] border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent-gold/40" />
                            <input value={editingAccount.data.email || ''} placeholder="Email (opțional)"
                              onChange={e => setEditingAccount({ ...editingAccount, data: { ...editingAccount.data, email: e.target.value } })}
                              className="w-full bg-[#0f1115] border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent-gold/40" />
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => handleUpdateAccount(idx, editingAccount.data)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase hover:bg-emerald-500/20 transition-all">
                                <CheckCircle2 className="w-3 h-3" /> Salvează
                              </button>
                              <button onClick={() => setEditingAccount(null)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-500 text-[10px] font-black uppercase hover:text-white transition-all">
                                <XCircle className="w-3 h-3" /> Anulează
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Account Row ───────────────────── */
                          <div className="flex items-center gap-3 p-3 group/row hover:border-white/10 transition-all">
                            <div className="w-9 h-9 rounded-xl bg-slate-800/50 flex items-center justify-center text-xs font-black text-accent-gold border border-white/5 shrink-0">
                              {acc.name[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-white truncate">{acc.name}</div>
                              {(acc.platform || acc.email) && (
                                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tight mt-0.5 truncate">
                                  {[acc.platform, acc.email].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                            {/* Inline qty controls */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => handleQtyChange(selectedItem.id, idx, -1)}
                                className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all">
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                key={`qty-${idx}-${acc.qty}`}
                                type="number"
                                defaultValue={acc.qty}
                                min={1}
                                onFocus={e => e.target.select()}
                                onBlur={e => { const v = parseInt(e.target.value); handleQtySet(selectedItem.id, idx, isNaN(v) ? acc.qty : Math.max(1, v)); }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="w-10 h-6 text-center text-sm font-black text-accent-gold bg-transparent border border-transparent focus:border-accent-gold/30 focus:bg-white/5 rounded-lg outline-none transition-all tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button onClick={() => handleQtyChange(selectedItem.id, idx, 1)}
                                className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Edit/Delete */}
                            <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                              <button onClick={() => setEditingAccount({ idx, data: { ...acc } })}
                                className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-all">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteAccount(idx)}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/5 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-between items-center px-6">
              <div className="flex items-center gap-4">
                <button onClick={async () => { if (await appConfirm('Sigur vrei sa stergi acest item?', { title: 'Stergere item', variant: 'danger' })) { remove(ref(db, `teams/${teamId}/inventory/items/${selectedItem.id}`)); setSelectedItem(null); } }}
                  className="flex items-center gap-2 text-red-500/50 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all">
                  <Trash2 className="w-3.5 h-3.5" /> Șterge
                </button>
                <button onClick={() => { setEditItemData({ name: selectedItem.name, image: selectedItem.image || null }); setIsEditModalOpen(true); }}
                  className="flex items-center gap-2 text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                  <Edit2 className="w-3.5 h-3.5" /> Editează Item
                </button>
              </div>
              <button onClick={() => setSelectedItem(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Item Modal ────────────────────────────────────── */}
      {isEditModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121418] border border-white/5 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5">
            <h3 className="text-lg font-bold text-white uppercase tracking-tight">Editează Item</h3>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nume Item</label>
              <input type="text" value={editItemData.name}
                onChange={e => setEditItemData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#1c1f26] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-accent-gold/50 transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                <span>Imagine</span>
                <span className="text-[8px] bg-white/10 px-2 py-0.5 rounded text-white/50">CTRL+V</span>
              </label>
              <div className={cn("relative border-2 border-dashed rounded-xl h-24 flex flex-col items-center justify-center gap-2 transition-all",
                editItemData.image ? "border-accent-gold/50 bg-accent-gold/5" : "border-white/5 bg-[#1c1f26]")}
                onPaste={e => {
                  for (let i = 0; i < e.clipboardData.items.length; i++) {
                    if (e.clipboardData.items[i].type.startsWith('image/')) {
                      const blob = e.clipboardData.items[i].getAsFile();
                      if (blob) { const r = new FileReader(); r.onload = ev => setEditItemData(p => ({ ...p, image: ev.target?.result as string })); r.readAsDataURL(blob); }
                      break;
                    }
                  }
                }}>
                {editItemData.image ? (
                  <>
                    <img src={editItemData.image} className="h-16 object-contain rounded" alt="" />
                    <button onClick={() => setEditItemData(p => ({ ...p, image: null }))}
                      className="absolute top-1.5 right-1.5 p-1 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500/40">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-600">Ctrl+V sau click pentru a selecta</p>
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => handleImageUpload(e, img => setEditItemData(p => ({ ...p, image: img })))} />
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setIsEditModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-white/5 text-slate-400 font-bold text-sm hover:bg-white/5 transition-all">Anulează</button>
              <button onClick={handleEditItem} disabled={!editItemData.name.trim()}
                className="flex-[2] bg-accent-gold disabled:opacity-40 text-slate-900 font-black text-sm uppercase tracking-widest rounded-xl transition-all hover:brightness-110">Salvează</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drag Ghost ─────────────────────────────────────────── */}
      {ghostItem && (
        <div
          ref={ghostElRef}
          className="fixed pointer-events-none z-[9999] rotate-[1.5deg] drop-shadow-2xl"
          style={{
            left: ghostInitRect.current?.x ?? -9999,
            top: ghostInitRect.current?.y ?? -9999,
            width: ghostInitRect.current?.width ?? 200,
          }}
        >
          <div className="bg-[#0f1115] border border-accent-gold/50 rounded-xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-accent-gold/30 overflow-hidden shrink-0">
                {ghostItem.image
                  ? <img src={ghostItem.image} alt={ghostItem.name} className="w-full h-full object-cover" />
                  : <Package className="w-5 h-5 text-accent-gold" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm truncate">{ghostItem.name}</div>
                <div className="text-[10px] text-accent-gold font-black uppercase tracking-wider">{calculateTotal(ghostItem)} buc</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
