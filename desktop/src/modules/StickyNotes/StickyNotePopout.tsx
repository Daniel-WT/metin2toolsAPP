import { useState, useEffect, useRef } from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { useWindowMemory } from '../../lib/windowMemory';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getNoteColor, type StickyNote } from './index';
import { X } from 'lucide-react';

const params   = new URLSearchParams(window.location.search);
const NOTE_ID  = params.get('noteId')   ?? '';
const IS_PRIV  = params.get('isPrivate') === '1';

export default function StickyNotePopout() {
  const { user } = useAuth();
  const [note, setNote]       = useState<StickyNote | null>(null);
  const [title, setTitle]     = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned]   = useState(false);
  useWindowMemory(`note-${NOTE_ID}`);
  const editing = useRef(false);
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const next = !pinned;
    setPinned(next);
    await appWindow.setAlwaysOnTop(next).catch(() => {});
  };

  const path = IS_PRIV
    ? `users/${user?.uid}/stickyNotes/${NOTE_ID}`
    : `teams/${user?.teamId}/stickyNotes/${NOTE_ID}`;

  useEffect(() => {
    if (!user || !NOTE_ID) return;
    return onValue(ref(db, path), snap => {
      const data = snap.val();
      if (!data) return;
      setNote({ id: NOTE_ID, ...data, isPrivate: IS_PRIV });
      if (!editing.current) {
        setTitle(data.title ?? '');
        setContent(data.content ?? '');
      }
    });
  }, [user?.uid, user?.teamId]);

  const save = (patch: Partial<StickyNote>) => {
    editing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      editing.current = false;
      update(ref(db, path), { ...patch, updatedAt: Date.now() }).catch(() => {});
    }, 800);
  };

  if (!note) {
    return (
      <div className="h-screen bg-[#0c0c0e] flex items-center justify-center">
        <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-slate-500 rounded-full animate-spin" />
      </div>
    );
  }

  const hex     = getNoteColor(note.color);
  const canEdit = note.authorId === user?.uid || (!IS_PRIV && !!user?.teamId);

  return (
    <div className="h-screen flex flex-col bg-[#0c0c0e] overflow-hidden" onContextMenu={togglePin}>
      {/* Accent bar — thicker when pinned */}
      <div className="w-full shrink-0 transition-all duration-200" style={{ background: hex, height: pinned ? '4px' : '3px', opacity: pinned ? 1 : 0.7 }} />

      {/* Drag header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-2 shrink-0 cursor-move"
      >
        <span
          data-tauri-drag-region
          className="text-[11px] font-bold truncate flex-1 pointer-events-none"
          style={{ color: hex }}
        >
          {title || 'Notiță'}
        </span>
        {pinned && (
          <div className="w-1.5 h-1.5 rounded-full shrink-0 mr-1" style={{ background: hex }} />
        )}
        <button
          onClick={() => appWindow.close()}
          onPointerDown={e => e.stopPropagation()}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-700 hover:text-slate-400 hover:bg-white/5 transition-all shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={e => { setTitle(e.target.value); save({ title: e.target.value }); }}
        onContextMenu={e => e.stopPropagation()}
        disabled={!canEdit}
        placeholder="Titlu..."
        className="w-full px-3 py-1 bg-transparent text-white font-bold text-[13px] outline-none placeholder-slate-800 border-b border-white/[0.04] select-text"
      />

      {/* Content */}
      <textarea
        value={content}
        onChange={e => { setContent(e.target.value); save({ content: e.target.value }); }}
        onContextMenu={e => e.stopPropagation()}
        disabled={!canEdit}
        placeholder="Scrie ceva..."
        className="flex-1 px-3 py-2.5 bg-transparent text-slate-400 text-[12px] outline-none resize-none leading-relaxed placeholder-slate-800 select-text"
      />
    </div>
  );
}
