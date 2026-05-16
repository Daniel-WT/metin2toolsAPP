import { useState, useRef, useEffect, useMemo } from 'react';
import { flushSync, createPortal } from 'react-dom';
import { GripVertical, LayoutDashboard, ChevronDown, Folder, FolderPlus, X, Check, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import {
  navItems, isSidebarFolder,
  loadSidebarLayout, saveSidebarLayout,
  FOLDER_COLORS, getFolderColor,
  type SidebarLayout, type SidebarFolder, type SidebarEntry, type FolderColorId,
} from '../../components/layout/Sidebar';

// ── helpers ────────────────────────────────────────────────────────────────

const entryKey = (e: SidebarEntry): string =>
  isSidebarFolder(e) ? (e as SidebarFolder).id : (e as string);

function allItemIds(layout: SidebarLayout): string[] {
  return layout.flatMap(e => isSidebarFolder(e) ? (e as SidebarFolder).items : [e as string]);
}

function removeItemFromLayout(layout: SidebarLayout, itemId: string): SidebarLayout {
  return layout
    .map(e => isSidebarFolder(e) ? { ...(e as SidebarFolder), items: (e as SidebarFolder).items.filter(i => i !== itemId) } : e)
    .filter(e => isSidebarFolder(e) ? true : (e as string) !== itemId);
}

// ── component ──────────────────────────────────────────────────────────────

export function SidebarOrderCard() {
  const { user, viewAsMember } = useAuth();
  const isActuallyAdmin = user?.isSuperAdmin && !viewAsMember;

  const visibleItems = useMemo(() => navItems.filter(item => {
    if (item.adminOnly) return isActuallyAdmin;
    return true;
  }), [isActuallyAdmin]);

  // ── layout state ──────────────────────────────────────────────────────────

  const [layout, setLayout] = useState<SidebarLayout>(() => {
    const saved = loadSidebarLayout();
    const ids = visibleItems.map(i => i.id);
    if (!saved.length) return ids;
    const savedIds = allItemIds(saved);
    const missing = ids.filter(id => !savedIds.includes(id));
    return [...saved, ...missing];
  });

  const visibleIds = visibleItems.map(i => i.id).join(',');
  useEffect(() => {
    const ids = visibleIds.split(',').filter(Boolean);
    const saved = loadSidebarLayout();
    const savedIds = allItemIds(saved);
    const missing = ids.filter(id => !savedIds.includes(id));
    setLayout(saved.length ? [...saved, ...missing] : ids);
  }, [visibleIds]);

  const persist = (next: SidebarLayout) => {
    setLayout(next);
    saveSidebarLayout(next);
  };

  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; });

  // ── folder actions ────────────────────────────────────────────────────────

  const createFolder = () => {
    const id = `folder_${Date.now()}`;
    const next: SidebarLayout = [...layout, { id, label: 'Folder Nou', items: [] }];
    persist(next);
    setEditingFolderId(id);
    setEditLabel('Folder Nou');
  };

  const deleteFolder = (folderId: string) => {
    const folder = layout.find(e => isSidebarFolder(e) && (e as SidebarFolder).id === folderId) as SidebarFolder | undefined;
    const released = folder?.items ?? [];
    const next: SidebarLayout = [
      ...layout.filter(e => !(isSidebarFolder(e) && (e as SidebarFolder).id === folderId)),
      ...released,
    ];
    persist(next);
  };

  const renameFolder = (folderId: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    persist(layout.map(e =>
      isSidebarFolder(e) && (e as SidebarFolder).id === folderId ? { ...(e as SidebarFolder), label: trimmed } : e
    ));
    setEditingFolderId(null);
  };

  const recolorFolder = (folderId: string, colorId: FolderColorId) => {
    persist(layout.map(e =>
      isSidebarFolder(e) && (e as SidebarFolder).id === folderId ? { ...(e as SidebarFolder), color: colorId } : e
    ));
    setColorPickerFolderId(null);
  };

  const moveToFolder = (itemId: string, targetFolderId: string) => {
    let next = removeItemFromLayout(layout, itemId);
    next = next.map(e =>
      isSidebarFolder(e) && (e as SidebarFolder).id === targetFolderId
        ? { ...(e as SidebarFolder), items: [...(e as SidebarFolder).items, itemId] }
        : e
    );
    persist(next);
    setPickerItemId(null);
  };

  const removeFromFolder = (itemId: string) => {
    persist([...removeItemFromLayout(layout, itemId), itemId]);
  };

  // ── rename state ──────────────────────────────────────────────────────────

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingFolderId && editRef.current) editRef.current.select(); }, [editingFolderId]);

  // ── color picker state ────────────────────────────────────────────────────

  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  // ── folder picker state ───────────────────────────────────────────────────

  const [pickerItemId, setPickerItemId] = useState<string | null>(null);

  // ── open/close card ───────────────────────────────────────────────────────

  const [open, setOpen] = useState(false);

  // ── derived ───────────────────────────────────────────────────────────────

  const folders = useMemo(() =>
    layout.filter((e): e is SidebarFolder => isSidebarFolder(e)),
    [layout]
  );

  // ── DnD — operates on the entire layout (folders + root items) ────────────

  const [dragId, setDragId]         = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const itemEls  = useRef<Map<string, HTMLElement>>(new Map());
  const dragIdRef    = useRef<string | null>(null);
  const dragToIdRef  = useRef<string | null>(null);

  // Live preview of full layout during drag
  const displayLayout = useMemo(() => {
    if (!dragId || !dragOverId || dragId === dragOverId) return layout;
    const keys = layout.map(entryKey);
    const fromIdx   = keys.indexOf(dragId);
    const targetIdx = keys.indexOf(dragOverId);
    if (fromIdx === -1 || targetIdx === -1) return layout;
    const preview = [...layout];
    const [moved] = preview.splice(fromIdx, 1);
    const newTargetIdx = preview.findIndex(e => entryKey(e) === dragOverId);
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    preview.splice(insertAt, 0, moved);
    return preview;
  }, [layout, dragId, dragOverId]);

  function applyReorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const list = layoutRef.current;
    const keys = list.map(entryKey);
    const fromIdx   = keys.indexOf(fromKey);
    const targetIdx = keys.indexOf(toKey);
    if (fromIdx === -1 || targetIdx === -1) return;
    const result = [...list];
    const [moved] = result.splice(fromIdx, 1);
    const newTargetIdx = result.findIndex(e => entryKey(e) === toKey);
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    result.splice(insertAt, 0, moved);
    layoutRef.current = result;
    persist(result);
  }

  function startDrag(key: string) {
    dragIdRef.current   = key;
    dragToIdRef.current = null;
    setDragId(key);
    setDragOverId(null);

    const getTargetKey = (x: number, y: number): string | null => {
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

    const onMove = (ev: PointerEvent) => flipTo(getTargetKey(ev.clientX, ev.clientY));
    const onUp = () => {
      if (dragIdRef.current && dragToIdRef.current) applyReorder(dragIdRef.current, dragToIdRef.current);
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

  // ── DnD — within-folder item reordering ───────────────────────────────────

  const [folderDragItem, setFolderDragItem] = useState<{ folderId: string; itemId: string } | null>(null);
  const [folderDragOver, setFolderDragOver] = useState<{ folderId: string; itemId: string } | null>(null);
  const folderItemEls = useRef<Map<string, HTMLElement>>(new Map());
  const folderDragRef    = useRef<{ folderId: string; itemId: string } | null>(null);
  const folderDragToRef  = useRef<{ folderId: string; itemId: string } | null>(null);

  const folderDisplayItems = useMemo((): { folderId: string; items: string[] } | null => {
    if (!folderDragItem || !folderDragOver) return null;
    if (folderDragItem.folderId !== folderDragOver.folderId) return null;
    if (folderDragItem.itemId === folderDragOver.itemId) return null;
    const folder = layout.find(e => isSidebarFolder(e) && (e as SidebarFolder).id === folderDragItem.folderId) as SidebarFolder | undefined;
    if (!folder) return null;
    const fromIdx = folder.items.indexOf(folderDragItem.itemId);
    const toIdx   = folder.items.indexOf(folderDragOver.itemId);
    if (fromIdx === -1 || toIdx === -1) return null;
    const preview = [...folder.items];
    const [moved] = preview.splice(fromIdx, 1);
    const newTo = preview.findIndex(id => id === folderDragOver.itemId);
    preview.splice(fromIdx < toIdx ? newTo + 1 : newTo, 0, moved);
    return { folderId: folderDragItem.folderId, items: preview };
  }, [layout, folderDragItem, folderDragOver]);

  function applyFolderReorder(folderId: string, fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = layoutRef.current;
    const next = list.map(e => {
      if (!isSidebarFolder(e) || (e as SidebarFolder).id !== folderId) return e;
      const folder = e as SidebarFolder;
      const items = [...folder.items];
      const fromIdx = items.indexOf(fromId);
      const toIdx   = items.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return e;
      const result = [...items];
      const [moved] = result.splice(fromIdx, 1);
      const newTo = result.findIndex(id => id === toId);
      result.splice(fromIdx < toIdx ? newTo + 1 : newTo, 0, moved);
      return { ...folder, items: result };
    });
    layoutRef.current = next;
    persist(next);
  }

  function startFolderItemDrag(folderId: string, itemId: string) {
    const state = { folderId, itemId };
    folderDragRef.current   = state;
    folderDragToRef.current = null;
    setFolderDragItem(state);
    setFolderDragOver(null);

    const getTarget = (x: number, y: number) => {
      let closest: { folderId: string; itemId: string; dist: number } | null = null;
      for (const [key, el] of folderItemEls.current) {
        const sep = key.indexOf('::');
        const fid = key.slice(0, sep);
        const iid = key.slice(sep + 2);
        if (fid !== folderId || iid === folderDragRef.current?.itemId) continue;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
        if (!closest || dist < closest.dist) closest = { folderId: fid, itemId: iid, dist };
      }
      return closest ? { folderId: closest.folderId, itemId: closest.itemId } : null;
    };

    const flipTo = (next: { folderId: string; itemId: string } | null) => {
      const curr = folderDragToRef.current;
      if (next?.itemId === curr?.itemId && next?.folderId === curr?.folderId) return;
      folderDragToRef.current = next;
      const first = new Map<string, number>();
      for (const [key, el] of folderItemEls.current) {
        const sep = key.indexOf('::');
        const fid = key.slice(0, sep);
        if (fid === folderId) first.set(key, el.getBoundingClientRect().top);
      }
      flushSync(() => setFolderDragOver(next));
      for (const [key, el] of folderItemEls.current) {
        if (el.style.transform) { el.style.transition = 'none'; el.style.transform = ''; }
        const sep = key.indexOf('::');
        const iid = key.slice(sep + 2);
        if (iid === folderDragRef.current?.itemId) continue;
        const f = first.get(key);
        if (f == null) continue;
        const dy = f - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) continue;
        el.style.transition = 'none';
        el.style.transform  = `translateY(${dy}px)`;
        void el.getBoundingClientRect();
        el.style.transition = 'transform 180ms cubic-bezier(0.25, 0, 0, 1)';
        el.style.transform  = '';
      }
    };

    const onMove = (ev: PointerEvent) => flipTo(getTarget(ev.clientX, ev.clientY));
    const onUp = () => {
      const from = folderDragRef.current;
      const to   = folderDragToRef.current;
      if (from && to && from.folderId === to.folderId) applyFolderReorder(from.folderId, from.itemId, to.itemId);
      for (const [, el] of folderItemEls.current) { el.style.transition = ''; el.style.transform = ''; }
      folderDragRef.current   = null;
      folderDragToRef.current = null;
      setFolderDragItem(null);
      setFolderDragOver(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function resetOrder() {
    persist(visibleItems.map(i => i.id));
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between group">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <LayoutDashboard className="w-5 h-5 text-accent-gold" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-100 font-display">Ordine Sidebar</h3>
            <p className="text-slate-500 text-xs">Reordoneaza și grupează elementele în foldere</p>
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-slate-300', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-white/5 space-y-3">

          {/* Action bar */}
          <div className="flex items-center justify-between mb-1">
            <button
              onClick={createFolder}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400 text-[11px] font-black uppercase tracking-widest hover:text-accent-gold hover:border-accent-gold/30 hover:bg-accent-gold/5 transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Folder Nou
            </button>
            <button
              onClick={resetOrder}
              className="text-slate-600 hover:text-slate-300 text-xs font-black uppercase tracking-widest transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Unified draggable list — folders and root items interleaved */}
          <div className="space-y-1">
            {displayLayout.map(entry => {
              const key = entryKey(entry);
              const isDragging  = dragId === key;
              const isDragOver  = dragOverId === key;

              const refCallback = (el: HTMLElement | null) => {
                if (el) itemEls.current.set(key, el);
                else itemEls.current.delete(key);
              };

              const gripProps = {
                className: 'text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors shrink-0',
                onPointerDown: (e: React.PointerEvent) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  startDrag(key);
                },
              };

              // ── Folder row ──────────────────────────────────────────────
              if (isSidebarFolder(entry)) {
                const folder = entry as SidebarFolder;
                const isEditing = editingFolderId === folder.id;
                const folderItems = folder.items
                  .map(id => visibleItems.find(i => i.id === id))
                  .filter(Boolean) as typeof visibleItems;

                return (
                  <div
                    key={key}
                    ref={refCallback}
                    className={cn(
                      'border rounded-xl transition-all select-none',
                      isDragging  ? 'opacity-30 border-white/5' : 'border-white/[0.06]',
                      isDragOver && !isDragging && 'border-accent-gold/30'
                    )}
                  >
                    {/* Folder header */}
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-2.5 bg-white/[0.02] rounded-t-xl',
                      isDragOver && !isDragging && 'bg-accent-gold/5'
                    )}>
                      <div {...gripProps}><GripVertical className="w-4 h-4" /></div>
                      <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: getFolderColor(folder.color) }} />

                      {isEditing ? (
                        <input
                          ref={editRef}
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameFolder(folder.id, editLabel);
                            if (e.key === 'Escape') setEditingFolderId(null);
                          }}
                          className="flex-1 bg-transparent text-sm font-bold text-white outline-none border-b border-accent-gold/40 pb-0.5"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-[11px] font-black text-slate-300 uppercase tracking-wider">{folder.label}</span>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Color picker */}
                        <button
                          onClick={(e) => {
                            if (colorPickerFolderId === folder.id) {
                              setColorPickerFolderId(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setColorPickerPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                              setColorPickerFolderId(folder.id);
                            }
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 transition-all"
                          title="Schimbă culoarea"
                        >
                          <div
                            className="w-3 h-3 rounded-full border border-white/20"
                            style={{ backgroundColor: getFolderColor(folder.color) }}
                          />
                        </button>

                        {isEditing ? (
                          <button
                            onClick={() => renameFolder(folder.id, editLabel)}
                            className="w-5 h-5 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10 transition-all"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditingFolderId(folder.id); setEditLabel(folder.label); }}
                            className="w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteFolder(folder.id)}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Șterge folder"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Folder items */}
                    <div className="divide-y divide-white/[0.03] overflow-hidden rounded-b-xl">
                      {folderItems.length === 0 ? (
                        <p className="px-4 py-2.5 text-[10px] text-slate-600 italic">
                          Mută un element din lista de mai jos
                        </p>
                      ) : (
                        (() => {
                          const displayIds = folderDisplayItems?.folderId === folder.id
                            ? folderDisplayItems.items
                            : folder.items;
                          return displayIds.map(itemId => {
                            const item = visibleItems.find(i => i.id === itemId);
                            if (!item) return null;
                            const Icon = item.icon;
                            const folderKey = `${folder.id}::${item.id}`;
                            const isFolderDragging = folderDragItem?.itemId === item.id && folderDragItem.folderId === folder.id;
                            const isFolderDragOver = folderDragOver?.itemId === item.id && folderDragOver.folderId === folder.id;
                            return (
                              <div
                                key={item.id}
                                ref={el => { if (el) folderItemEls.current.set(folderKey, el); else folderItemEls.current.delete(folderKey); }}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2 select-none transition-colors',
                                  isFolderDragging && 'opacity-30',
                                  isFolderDragOver && !isFolderDragging && 'bg-accent-gold/5'
                                )}
                              >
                                <div
                                  className="text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors shrink-0"
                                  onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); startFolderItemDrag(folder.id, item.id); }}
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                                <Icon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                <span className="flex-1 text-[12px] font-bold text-slate-400">{item.name}</span>
                                <button
                                  onClick={() => removeFromFolder(item.id)}
                                  className="w-5 h-5 flex items-center justify-center rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title="Scoate din folder"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>
                );
              }

              // ── Root item row ───────────────────────────────────────────
              const itemId = entry as string;
              const item = visibleItems.find(i => i.id === itemId);
              if (!item) return null;
              const Icon = item.icon;
              const isPickerOpen = pickerItemId === itemId;

              return (
                <div
                  key={key}
                  ref={refCallback}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors select-none',
                    isDragging  ? 'opacity-30 border-white/5 bg-bg-secondary' : 'border-white/5 bg-bg-secondary hover:border-white/10',
                    isDragOver && !isDragging && 'border-accent-gold/30 bg-accent-gold/5'
                  )}
                >
                  <div {...gripProps}><GripVertical className="w-4 h-4" /></div>

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

                  {/* Move to folder */}
                  {folders.length > 0 && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setPickerItemId(isPickerOpen ? null : itemId)}
                        className={cn(
                          'w-6 h-6 flex items-center justify-center rounded-lg border transition-all',
                          isPickerOpen
                            ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold'
                            : 'border-white/[0.06] text-slate-600 hover:text-slate-300 hover:border-white/20'
                        )}
                        title="Mută în folder"
                      >
                        <Folder className="w-3 h-3" />
                      </button>

                      {isPickerOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-[#0d0d0f] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[140px]">
                          {folders.map(f => (
                            <button
                              key={f.id}
                              onClick={() => moveToFolder(itemId, f.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors text-left"
                            >
                              <Folder className="w-3 h-3 shrink-0" style={{ color: getFolderColor(f.color) }} />
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Color picker portal — renders in document.body to escape all overflow:hidden */}
      {colorPickerFolderId && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setColorPickerFolderId(null)} />
          <div
            className="fixed z-[9999] bg-[#0d0d0f] border border-white/[0.08] rounded-xl shadow-2xl p-2.5"
            style={{ top: colorPickerPos.top, right: colorPickerPos.right }}
          >
            <div className="grid grid-cols-4 gap-2">
              {FOLDER_COLORS.map(c => {
                const activeFolder = folders.find(f => f.id === colorPickerFolderId);
                const isActive = activeFolder?.color === c.id || (!activeFolder?.color && c.id === 'default');
                return (
                  <button
                    key={c.id}
                    onClick={() => recolorFolder(colorPickerFolderId, c.id as FolderColorId)}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 transition-all hover:scale-110',
                      isActive ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30'
                    )}
                    style={{ backgroundColor: c.hex }}
                    title={c.id}
                  />
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
