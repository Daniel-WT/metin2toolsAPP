import { useState, useRef, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { GripVertical, LayoutDashboard, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { navItems, loadSidebarOrder, saveSidebarOrder } from '../../components/layout/Sidebar';

export function SidebarOrderCard() {
  const { user, viewAsMember } = useAuth();
  const isActuallyAdmin = user?.isSuperAdmin && !viewAsMember;

  // Filtered items this user actually sees (mirrors Sidebar logic)
  const visibleItems = useMemo(() => navItems.filter(item => {
    if (item.adminOnly) return isActuallyAdmin;
    return true;
  }), [isActuallyAdmin]);

  const [order, setOrder] = useState<string[]>(() => {
    const saved = loadSidebarOrder();
    const ids = visibleItems.map(i => i.id);
    if (!saved.length) return ids;
    return [
      ...saved.filter(id => ids.includes(id)),
      ...ids.filter(id => !saved.includes(id)),
    ];
  });

  // Re-sync if user permissions change
  useEffect(() => {
    const ids = visibleItems.map(i => i.id);
    const saved = loadSidebarOrder();
    setOrder(saved.length
      ? [...saved.filter(id => ids.includes(id)), ...ids.filter(id => !saved.includes(id))]
      : ids
    );
  }, [visibleItems]);

  const sortedItems = useMemo(() =>
    order.map(id => visibleItems.find(i => i.id === id)).filter(Boolean) as typeof visibleItems,
    [order, visibleItems]
  );

  // ── DnD state (same pattern as Tweaks presets) ─────────────────────────
  const [open, setOpen]           = useState(false);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const itemEls = useRef<Map<string, HTMLElement>>(new Map());
  const dragIdRef    = useRef<string | null>(null);
  const dragToIdRef  = useRef<string | null>(null);
  const sortedRef    = useRef(sortedItems);
  useEffect(() => { sortedRef.current = sortedItems; });

  function applyReorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = sortedRef.current;
    const fromIdx   = list.findIndex(i => i.id === fromId);
    const targetIdx = list.findIndex(i => i.id === toId);
    if (fromIdx === -1 || targetIdx === -1) return;
    const result = [...list];
    const [moved] = result.splice(fromIdx, 1);
    const newTargetIdx = result.findIndex(i => i.id === toId);
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    result.splice(insertAt, 0, moved);
    sortedRef.current = result;
    const newOrder = result.map(i => i.id);
    setOrder(newOrder);
    saveSidebarOrder(newOrder);
  }

  // Live preview during drag
  const displayItems = useMemo(() => {
    if (!dragId || !dragOverId || dragId === dragOverId) return sortedItems;
    const fromIdx   = sortedItems.findIndex(i => i.id === dragId);
    const targetIdx = sortedItems.findIndex(i => i.id === dragOverId);
    if (fromIdx === -1 || targetIdx === -1) return sortedItems;
    const preview = [...sortedItems];
    const [moved] = preview.splice(fromIdx, 1);
    const newTargetIdx = preview.findIndex(i => i.id === dragOverId);
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    preview.splice(insertAt, 0, moved);
    return preview;
  }, [sortedItems, dragId, dragOverId]);

  function startDrag(itemId: string) {
    dragIdRef.current   = itemId;
    dragToIdRef.current = null;
    setDragId(itemId);
    setDragOverId(null);

    const getTargetId = (x: number, y: number): string | null => {
      let closest: { id: string; dist: number } | null = null;
      for (const [id, el] of itemEls.current) {
        if (id === dragIdRef.current) continue;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
        if (!closest || dist < closest.dist) closest = { id, dist };
      }
      return closest?.id ?? null;
    };

    const flipTo = (newOverId: string | null) => {
      if (newOverId === dragToIdRef.current) return;
      dragToIdRef.current = newOverId;

      const first = new Map<string, { top: number }>();
      for (const [id, el] of itemEls.current) {
        if (id === dragIdRef.current) continue;
        first.set(id, { top: el.getBoundingClientRect().top });
      }

      flushSync(() => setDragOverId(newOverId));

      for (const [, el] of itemEls.current) {
        if (el.style.transform) { el.style.transition = 'none'; el.style.transform = ''; }
      }
      void document.body.getBoundingClientRect();

      for (const [id, el] of itemEls.current) {
        if (id === dragIdRef.current) continue;
        const f = first.get(id);
        if (!f) continue;
        const dy = f.top - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) continue;
        el.style.transition = 'none';
        el.style.transform  = `translateY(${dy}px)`;
        void el.getBoundingClientRect();
        el.style.transition = 'transform 180ms cubic-bezier(0.25, 0, 0, 1)';
        el.style.transform  = '';
      }
    };

    const onMove = (ev: PointerEvent) => flipTo(getTargetId(ev.clientX, ev.clientY));

    const onUp = () => {
      if (dragIdRef.current && dragToIdRef.current) {
        applyReorder(dragIdRef.current, dragToIdRef.current);
      }
      for (const [, el] of itemEls.current) { el.style.transition = ''; el.style.transform = ''; }
      dragIdRef.current   = null;
      dragToIdRef.current = null;
      setDragId(null);
      setDragOverId(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function resetOrder() {
    const ids = visibleItems.map(i => i.id);
    setOrder(ids);
    saveSidebarOrder(ids);
  }

  return (
    <div className="card">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <LayoutDashboard className="w-5 h-5 text-accent-gold" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-100 font-display">Ordine Sidebar</h3>
            <p className="text-slate-500 text-xs">Trage elementele pentru a le reordona</p>
          </div>
        </div>
        <ChevronDown className={cn(
          'w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-slate-300',
          open && 'rotate-180'
        )} />
      </button>

      {open && (
        <div className="space-y-1 mt-5 pt-5 border-t border-white/5">
          <div className="flex justify-end mb-3">
            <button
              onClick={resetOrder}
              className="text-slate-600 hover:text-slate-300 text-xs font-black uppercase tracking-widest transition-colors"
            >
              Reset
            </button>
          </div>
        <div className="space-y-1">
        {displayItems.map(item => {
          const isDragging = dragId === item.id;
          const isDragOver = dragOverId === item.id;
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              ref={el => { if (el) itemEls.current.set(item.id, el); else itemEls.current.delete(item.id); }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors select-none',
                isDragging  ? 'opacity-30 border-white/5 bg-bg-secondary' : 'border-white/5 bg-bg-secondary hover:border-white/10',
                isDragOver  && !isDragging && 'border-accent-gold/30 bg-accent-gold/5'
              )}
            >
              <div
                className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors shrink-0"
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  startDrag(item.id);
                }}
              >
                <GripVertical className="w-4 h-4" />
              </div>
              <Icon className="w-4 h-4 text-slate-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-300">{item.name}</p>
                <p className="text-[10px] text-slate-600 font-medium">{item.label}</p>
              </div>
              {item.adminOnly && (
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/70 bg-amber-500/5 px-1.5 py-0.5 rounded shrink-0">
                  Admin
                </span>
              )}
            </div>
          );
        })}
        </div>
        </div>
      )}
    </div>
  );
}
