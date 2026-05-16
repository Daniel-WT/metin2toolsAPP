import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Lock, Unlock, Pin, PinOff, Maximize2, Trash2, StickyNote as NoteIcon, X } from 'lucide-react';
import { ref, onValue, set, remove, push, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { WebviewWindow } from '@tauri-apps/api/window';
import { savedWindowOptions } from '../../lib/windowMemory';

// ── Types ──────────────────────────────────────────────────────────────────

export type NoteColor = 'yellow' | 'rose' | 'blue' | 'violet' | 'emerald' | 'orange' | 'slate';

export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  isPrivate: boolean;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

// ── Colors ─────────────────────────────────────────────────────────────────

export const NOTE_COLORS: { id: NoteColor; hex: string }[] = [
  { id: 'yellow',  hex: '#f59e0b' },
  { id: 'rose',    hex: '#fb7185' },
  { id: 'blue',    hex: '#60a5fa' },
  { id: 'violet',  hex: '#a78bfa' },
  { id: 'emerald', hex: '#34d399' },
  { id: 'orange',  hex: '#fb923c' },
  { id: 'slate',   hex: '#94a3b8' },
];

export function getNoteColor(c?: NoteColor): string {
  return NOTE_COLORS.find(x => x.id === c)?.hex ?? '#f59e0b';
}

// ── Event helper ───────────────────────────────────────────────────────────

export function popoutNote(note: StickyNote) {
  const label = `note-${note.id}`;
  const existing = WebviewWindow.getByLabel(label);
  if (existing) { existing.setFocus(); return; }
  { const geo = savedWindowOptions(label);
    new WebviewWindow(label, {
      url: `/?view=sticky-note&noteId=${note.id}&isPrivate=${note.isPrivate ? '1' : '0'}`,
      title: note.title || 'Notiță',
      resizable: true, decorations: false, alwaysOnTop: false, transparent: false, focus: true,
      width: geo.width ?? 260, height: geo.height ?? 320,
      minWidth: 180, minHeight: 160,
      ...(geo.x !== undefined ? { x: geo.x, y: geo.y, center: false } : { center: true }),
    });
  }
}

// ── NoteCard ───────────────────────────────────────────────────────────────

function NoteCard({
  note, isOwn, canEdit,
  onSave, onDelete, onTogglePrivate, onTogglePin, onPopout,
}: {
  note: StickyNote; isOwn: boolean; canEdit: boolean;
  onSave: (note: StickyNote, patch: Partial<StickyNote>) => void;
  onDelete: (note: StickyNote) => void;
  onTogglePrivate: (note: StickyNote) => void;
  onTogglePin: (note: StickyNote) => void;
  onPopout: () => void;
}) {
  const [title, setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; right: number } | null>(null);
  const editingRef = useRef(false);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (!editingRef.current) setTitle(note.title); },   [note.title]);
  useEffect(() => { if (!editingRef.current) setContent(note.content); }, [note.content]);

  const schedSave = (patch: Partial<StickyNote>) => {
    editingRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      editingRef.current = false;
      onSave(note, patch);
    }, 800);
  };

  const hex = getNoteColor(note.color);

  return (
    <div
      className="relative rounded-2xl border flex flex-col gap-0 overflow-hidden transition-all group"
      style={{ borderColor: `${hex}30`, background: `${hex}08`, boxShadow: `0 0 24px ${hex}0d` }}
    >
      {/* Color accent bar */}
      <div className="h-[3px] w-full" style={{ background: hex }} />

      {/* Pin indicator */}
      {note.pinned && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ background: hex }} />
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Title */}
        <input
          type="text"
          placeholder="Titlu..."
          value={title}
          onChange={e => { setTitle(e.target.value); schedSave({ title: e.target.value }); }}
          disabled={!canEdit}
          className="bg-transparent text-white font-bold text-sm outline-none placeholder-slate-700 w-full"
        />

        {/* Content */}
        <textarea
          placeholder="Scrie ceva..."
          value={content}
          onChange={e => { setContent(e.target.value); schedSave({ content: e.target.value }); }}
          disabled={!canEdit}
          rows={5}
          className="bg-transparent text-slate-300 text-[13px] outline-none resize-none placeholder-slate-700 w-full leading-relaxed flex-1"
        />
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t"
        style={{ borderColor: `${hex}20` }}
      >
        <div className="flex items-center gap-2">
          {/* Color dot */}
          {isOwn && (
            <button
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect();
                setColorPickerPos(cp => cp ? null : { top: r.bottom + 6, right: window.innerWidth - r.right });
              }}
              className="w-4 h-4 rounded-full border-2 border-white/20 hover:scale-110 transition-transform shrink-0"
              style={{ background: hex }}
              title="Culoare"
            />
          )}
          <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider truncate max-w-[80px]">
            {note.authorName}
          </span>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isOwn && (
            <>
              <button onClick={() => onTogglePin(note)} title={note.pinned ? 'Desprinde' : 'Fixează'}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-white hover:bg-white/[0.06] transition-all">
                {note.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              </button>
              <button onClick={() => onTogglePrivate(note)} title={note.isPrivate ? 'Distribuie echipei' : 'Fă privat'}
                className={cn('w-6 h-6 flex items-center justify-center rounded-lg transition-all',
                  note.isPrivate ? 'text-slate-600 hover:text-amber-400 hover:bg-amber-500/10' : 'text-emerald-500 hover:text-slate-400 hover:bg-white/[0.06]')}>
                {note.isPrivate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>
            </>
          )}
          {canEdit && (
            <button onClick={onPopout} title="Pop-out"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-white hover:bg-white/[0.06] transition-all">
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
          {isOwn && (
            <button onClick={() => onDelete(note)} title="Șterge"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {!canEdit && (
            <span className="text-[9px] text-slate-700 font-bold uppercase tracking-wider">Doar citire</span>
          )}
        </div>
      </div>

      {/* Color picker portal */}
      {colorPickerPos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setColorPickerPos(null)} />
          <div className="fixed z-[9999] bg-[#0d0d0f] border border-white/[0.08] rounded-xl shadow-2xl p-2.5"
            style={{ top: colorPickerPos.top, right: colorPickerPos.right }}>
            <div className="flex gap-1.5">
              {NOTE_COLORS.map(c => (
                <button key={c.id}
                  onClick={() => { onSave(note, { color: c.id }); setColorPickerPos(null); }}
                  className={cn('w-5 h-5 rounded-full border-2 transition-all hover:scale-110',
                    note.color === c.id ? 'border-white/70 scale-110' : 'border-transparent hover:border-white/30')}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function StickyNotes() {
  const { user } = useAuth();
  const [teamNotes,    setTeamNotes]    = useState<StickyNote[]>([]);
  const [privateNotes, setPrivateNotes] = useState<StickyNote[]>([]);
  const [filter, setFilter] = useState<'all' | 'mine' | 'team'>('all');

  // Team notes listener
  useEffect(() => {
    if (!user?.teamId) return;
    return onValue(ref(db, `teams/${user.teamId}/stickyNotes`), snap => {
      const val = snap.val();
      setTeamNotes(val ? Object.entries(val).map(([id, v]: any) => ({ id, ...v, isPrivate: false })) : []);
    });
  }, [user?.teamId]);

  // Private notes listener
  useEffect(() => {
    if (!user?.uid) return;
    return onValue(ref(db, `users/${user.uid}/stickyNotes`), snap => {
      const val = snap.val();
      setPrivateNotes(val ? Object.entries(val).map(([id, v]: any) => ({ id, ...v, isPrivate: true })) : []);
    });
  }, [user?.uid]);

  const allNotes = [...privateNotes, ...teamNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const visible = allNotes.filter(n => {
    if (filter === 'mine') return n.authorId === user?.uid;
    if (filter === 'team') return !n.isPrivate;
    return true;
  });

  const createNote = async () => {
    if (!user?.uid) return;
    const r = push(ref(db, `users/${user.uid}/stickyNotes`));
    await set(r, {
      title: '', content: '', color: 'yellow', isPrivate: true,
      authorId: user.uid, authorName: user.name || user.email?.split('@')[0] || 'User',
      createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
    });
  };

  const saveNote = useCallback((note: StickyNote, patch: Partial<StickyNote>) => {
    const path = note.isPrivate
      ? `users/${user?.uid}/stickyNotes/${note.id}`
      : `teams/${user?.teamId}/stickyNotes/${note.id}`;
    const { id: _, ...rest } = { ...note, ...patch, updatedAt: Date.now() };
    set(ref(db, path), rest).catch(() => {});
  }, [user?.uid, user?.teamId]);

  const deleteNote = async (note: StickyNote) => {
    const path = note.isPrivate
      ? `users/${user?.uid}/stickyNotes/${note.id}`
      : `teams/${user?.teamId}/stickyNotes/${note.id}`;
    await remove(ref(db, path));
  };

  const togglePrivate = async (note: StickyNote) => {
    const { id, ...data } = note;
    if (note.isPrivate) {
      await remove(ref(db, `users/${user?.uid}/stickyNotes/${id}`));
      await set(ref(db, `teams/${user?.teamId}/stickyNotes/${id}`), { ...data, isPrivate: false, updatedAt: Date.now() });
    } else {
      await remove(ref(db, `teams/${user?.teamId}/stickyNotes/${id}`));
      await set(ref(db, `users/${user?.uid}/stickyNotes/${id}`), { ...data, isPrivate: true, updatedAt: Date.now() });
    }
  };

  const togglePin = (note: StickyNote) => saveNote(note, { pinned: !note.pinned });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Notițe</h2>
          <p className="text-slate-500 text-xs mt-0.5">Personale și pentru echipă</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/[0.03] border border-white/5 rounded-xl p-1 gap-1">
            {(['all', 'mine', 'team'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all',
                  filter === f ? 'bg-accent-gold/10 text-accent-gold border border-accent-gold/20' : 'text-slate-500 hover:text-slate-300')}>
                {f === 'all' ? 'Toate' : f === 'mine' ? 'Ale mele' : 'Echipă'}
              </button>
            ))}
          </div>
          <button onClick={createNote}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold/10 border border-accent-gold/20 rounded-xl text-accent-gold text-[12px] font-black hover:bg-accent-gold/20 transition-all">
            <Plus className="w-4 h-4" />
            Notă nouă
          </button>
        </div>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <NoteIcon className="w-10 h-10 text-slate-800 mb-3" />
          <p className="text-slate-500 font-bold text-sm">Nicio notiță</p>
          <p className="text-slate-600 text-xs mt-1">Apasă «Notă nouă» pentru a începe</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map(note => (
            <NoteCard
              key={note.id} note={note}
              isOwn={note.authorId === user?.uid}
              canEdit={note.authorId === user?.uid || (!note.isPrivate && !!user?.teamId)}
              onSave={saveNote} onDelete={deleteNote}
              onTogglePrivate={togglePrivate} onTogglePin={togglePin}
              onPopout={() => popoutNote(note)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
