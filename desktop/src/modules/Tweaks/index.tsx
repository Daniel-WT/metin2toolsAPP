import { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { open } from '@tauri-apps/api/dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import { FolderOpen, Monitor, CheckCircle2, Plus, Trash2, GripVertical, RefreshCw, Type, AlertCircle, Crosshair, WifiOff, Key, X, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { register, unregister } from '@tauri-apps/api/globalShortcut';

interface Metin2Win {
  hwnd: string;
  title: string;
  exe: string;
  pid: number;
}

interface Preset {
  id: string;
  w: number;
  h: number;
  label: string;
  custom?: boolean;
}

const DEFAULT_PRESETS: Preset[] = [
  { id: 'd1', w: 640,  h: 480,  label: 'Low' },
  { id: 'd2', w: 640,  h: 540,  label: 'Classic' },
  { id: 'd3', w: 800,  h: 600,  label: 'SVGA' },
  { id: 'd4', w: 1024, h: 768,  label: 'XGA' },
  { id: 'd5', w: 1280, h: 720,  label: 'HD' },
  { id: 'd6', w: 1280, h: 960,  label: 'XVGA' },
  { id: 'd7', w: 1366, h: 768,  label: 'Laptop' },
  { id: 'd8', w: 1600, h: 900,  label: 'HD+' },
  { id: 'd9', w: 1920, h: 1080, label: 'Full HD' },
];

const LS_CFG_PATH       = 'm2tweaks_cfg_path';
const LS_PRESETS        = 'm2tweaks_presets';
const LS_HIDDEN_DEFAULT = 'm2tweaks_hidden';
const LS_ORDER          = 'm2tweaks_order';
const LS_TCP_BINDINGS   = 'm2_tcp_bindings';

function loadCustomPresets(): Preset[]   { try { return JSON.parse(localStorage.getItem(LS_PRESETS) || '[]'); } catch { return []; } }
function saveCustomPresets(v: Preset[])  { localStorage.setItem(LS_PRESETS, JSON.stringify(v)); }
function loadHiddenDefaults(): string[]  { try { return JSON.parse(localStorage.getItem(LS_HIDDEN_DEFAULT) || '[]'); } catch { return []; } }
function saveHiddenDefaults(v: string[]) { localStorage.setItem(LS_HIDDEN_DEFAULT, JSON.stringify(v)); }
function loadOrder(): string[]           { try { return JSON.parse(localStorage.getItem(LS_ORDER) || '[]'); } catch { return []; } }
function saveOrder(v: string[])          { localStorage.setItem(LS_ORDER, JSON.stringify(v)); }

export default function Tweaks() {
  const [cfgPath, setCfgPath]               = useState<string | null>(null);
  const [currentW, setCurrentW]             = useState<number | null>(null);
  const [currentH, setCurrentH]             = useState<number | null>(null);
  const [graphicsMode, setGraphicsMode]     = useState<'optimized' | 'normal' | 'custom' | null>(null);
  const [applyingGfx, setApplyingGfx]       = useState(false);
  const [customW, setCustomW]               = useState('');
  const [customH, setCustomH]               = useState('');
  const [toast, setToast]                   = useState<{ msg: string; ok: boolean } | null>(null);
  const [applying, setApplying]             = useState<string | null>(null);
  const [customPresets, setCustomPresets]   = useState<Preset[]>(loadCustomPresets);
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>(loadHiddenDefaults);
  const [order, setOrder]                   = useState<string[]>(loadOrder);
  const [newW, setNewW]                     = useState('');
  const [newH, setNewH]                     = useState('');
  const [newLabel, setNewLabel]             = useState('');

  // ── Window renamer state ──────────────────────────────────────────────
  const [m2wins, setM2wins]       = useState<Metin2Win[]>([]);
  const [scanning, setScanning]   = useState(false);
  const [winTitles, setWinTitles] = useState<Record<string, string>>({});
  const [applyingWin, setApplyingWin] = useState<string | null>(null);
  const [isAdmin, setIsAdmin]     = useState<boolean | null>(null);
  const [relaunching, setRelaunching] = useState(false);

  // ── TCP Close state ───────────────────────────────────────────────────
  const [tcpBindings, setTcpBindings] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_TCP_BINDINGS) || '{}'); } catch { return {}; }
  });
  const [closingTcp, setClosingTcp] = useState<string | null>(null);
  const [listeningBind, setListeningBind] = useState<string | null>(null);
  const tcpBindingsRef = useRef<Record<string, string>>({});

  // ── Drag state (pointer-based, same system as Inventory) ──────────────
  const dragIdRef    = useRef<string | null>(null);
  const dragToIdRef  = useRef<string | null>(null);
  const presetsRef   = useRef<Preset[]>([]);
  const cardEls      = useRef<Map<string, HTMLElement>>(new Map());
  const ghostElRef   = useRef<HTMLDivElement | null>(null);
  const ghostOffsetRef  = useRef({ x: 0, y: 0 });
  const ghostInitRect   = useRef<{ x: number; y: number; width: number } | null>(null);
  const [dragId, setDragId]       = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ghostPreset, setGhostPreset] = useState<Preset | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(LS_CFG_PATH);
    if (saved) loadCfg(saved);
    invoke<boolean>('is_admin').then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);

  // Keep presetsRef in sync for use inside pointer handlers
  const visiblePresets = [
    ...DEFAULT_PRESETS.filter(p => !hiddenDefaults.includes(p.id)),
    ...customPresets,
  ];
  const sortedPresets = order.length > 0
    ? [
        ...order.map(id => visiblePresets.find(p => p.id === id)).filter((p): p is Preset => !!p),
        ...visiblePresets.filter(p => !order.includes(p.id)),
      ]
    : visiblePresets;

  useEffect(() => { presetsRef.current = sortedPresets; });

  useEffect(() => { tcpBindingsRef.current = tcpBindings; }, [tcpBindings]);

  // Build derived map: hotkey → pidStr[]
  function hotkeyToPids(bindings: Record<string, string>): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [pidStr, hotkey] of Object.entries(bindings)) {
      if (!map[hotkey]) map[hotkey] = [];
      map[hotkey].push(pidStr);
    }
    return map;
  }

  // Register a keyboard shortcut for all pids bound to it
  async function registerHotkey(hotkey: string, pids: string[]) {
    await register(hotkey, async () => {
      for (const pidStr of pids) {
        try { await invoke('close_tcp_for_pid', { pid: parseInt(pidStr) }); } catch {}
      }
    });
  }

  // Restore global shortcuts on mount
  useEffect(() => {
    const saved = { ...tcpBindingsRef.current };
    if (Object.keys(saved).length === 0) return;
    const map = hotkeyToPids(saved);
    for (const [hotkey, pids] of Object.entries(map)) {
      if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
        const button = hotkey === 'Mouse4' ? 3 : 4;
        pids.forEach(pidStr => {
          const pid = parseInt(pidStr);
          if (!isNaN(pid)) invoke('register_mouse_bind', { button, pid }).catch(() => {});
        });
      } else {
        registerHotkey(hotkey, pids).catch(() => {});
      }
    }
    return () => {
      const uniqueHotkeys = new Set(Object.values(saved));
      uniqueHotkeys.forEach(hotkey => {
        if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
          const button = hotkey === 'Mouse4' ? 3 : 4;
          Object.entries(saved)
            .filter(([, h]) => h === hotkey)
            .forEach(([pidStr]) => {
              const pid = parseInt(pidStr);
              if (!isNaN(pid)) invoke('unregister_mouse_bind', { button, pid }).catch(() => {});
            });
        } else {
          unregister(hotkey).catch(() => {});
        }
      });
    };
  }, []);

  // Listen for key or mouse side button when binding
  useEffect(() => {
    if (!listeningBind) return;
    const pidStr = listeningBind;
    const onKey = async (e: KeyboardEvent) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setListeningBind(null); return; }
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      let key = e.key;
      if (/^F\d+$/.test(key)) { /* ok */ }
      else if (key.length === 1) key = key.toUpperCase();
      else return;
      parts.push(key);
      const hotkey = parts.join('+');
      setListeningBind(null);
      await doBind(pidStr, hotkey);
    };
    const onMouse = async (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); setListeningBind(null); await doBind(pidStr, 'Mouse4'); }
      else if (e.button === 4) { e.preventDefault(); setListeningBind(null); await doBind(pidStr, 'Mouse5'); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }, [listeningBind]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function pickFile() {
    try {
      const selected = await open({
        title: 'Selecteaza metin2.cfg',
        filters: [{ name: 'Metin2 Config', extensions: ['cfg'] }],
        multiple: false,
      });
      if (!selected || Array.isArray(selected)) return;
      localStorage.setItem(LS_CFG_PATH, selected);
      await loadCfg(selected);
    } catch (e) {
      console.error('[Tweaks] Dialog error:', e);
      showToast('Nu s-a putut deschide fisierul.', false);
    }
  }

  async function loadCfg(path: string) {
    try {
      const content = await readTextFile(path);
      const wMatch = content.match(/WIDTH\s+(\d+)/);
      const hMatch = content.match(/HEIGHT\s+(\d+)/);
      if (!wMatch || !hMatch) { showToast('Fisierul ales nu pare a fi metin2.cfg valid.', false); return; }
      setCfgPath(path);
      setCurrentW(parseInt(wMatch[1]));
      setCurrentH(parseInt(hMatch[1]));
      const eMatch  = content.match(/EFFECT_LEVEL\s+(\d+)/);
      const psMatch = content.match(/PRIVATE_SHOP_LEVEL\s+(\d+)/);
      const diMatch = content.match(/DROP_ITEM_LEVEL\s+(\d+)/);
      const eVal  = eMatch  ? parseInt(eMatch[1])  : null;
      const psVal = psMatch ? parseInt(psMatch[1]) : null;
      const diVal = diMatch ? parseInt(diMatch[1]) : null;
      if (eVal === 4 && psVal === 4 && diVal === 4) setGraphicsMode('optimized');
      else if (eVal === 0 && psVal === 0 && diVal === 0) setGraphicsMode('normal');
      else if (eVal !== null) setGraphicsMode('custom');
      else setGraphicsMode(null);
    } catch (e) {
      console.error('[Tweaks] Read error:', e);
      showToast('Nu s-a putut citi fisierul.', false);
      localStorage.removeItem(LS_CFG_PATH);
    }
  }

  async function applyRes(w: number, h: number, key?: string) {
    if (!cfgPath) { showToast('Selecteaza mai intai metin2.cfg.', false); return; }
    setApplying(key ?? `${w}x${h}`);
    try {
      const content = await readTextFile(cfgPath);
      const updated = content
        .replace(/(WIDTH\s+)\d+/, `$1${w}`)
        .replace(/(HEIGHT\s+)\d+/, `$1${h}`);
      await writeTextFile(cfgPath, updated);
      setCurrentW(w);
      setCurrentH(h);
      showToast(`Rezolutie aplicata: ${w} × ${h}`);
      console.log(`[Tweaks] Set ${w}×${h}`);
    } catch (e) {
      console.error('[Tweaks] Write error:', e);
      showToast('Eroare la scrierea fisierului.', false);
    } finally {
      setApplying(null);
    }
  }

  async function applyGraphicsMode(optimized: boolean) {
    if (!cfgPath) { showToast('Selecteaza mai intai metin2.cfg.', false); return; }
    setApplyingGfx(true);
    try {
      const content = await readTextFile(cfgPath);
      const val = optimized ? 4 : 0;
      const updated = content
        .replace(/(EFFECT_LEVEL\s+)\d+/, `$1${val}`)
        .replace(/(PRIVATE_SHOP_LEVEL\s+)\d+/, `$1${val}`)
        .replace(/(DROP_ITEM_LEVEL\s+)\d+/, `$1${val}`);
      await writeTextFile(cfgPath, updated);
      setGraphicsMode(optimized ? 'optimized' : 'normal');
      showToast(optimized ? 'Mod Optimizat aplicat.' : 'Mod Normal aplicat.');
    } catch {
      showToast('Eroare la scrierea fisierului.', false);
    } finally {
      setApplyingGfx(false);
    }
  }

  function applyCustomOneTime() {
    const w = parseInt(customW), h = parseInt(customH);
    if (!w || !h || w < 320 || h < 240 || w > 3840 || h > 2160) { showToast('Rezolutie invalida.', false); return; }
    applyRes(w, h, 'custom');
  }

  function addPreset() {
    const w = parseInt(newW), h = parseInt(newH);
    const label = newLabel.trim() || `${w}×${h}`;
    if (!w || !h || w < 320 || h < 240 || w > 3840 || h > 2160) { showToast('Rezolutie invalida pentru preset.', false); return; }
    const preset: Preset = { id: Date.now().toString(), w, h, label, custom: true };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setNewW(''); setNewH(''); setNewLabel('');
    showToast(`Preset "${label}" salvat.`);
  }

  function deletePreset(id: string, isDefault: boolean) {
    if (isDefault) {
      const updated = [...hiddenDefaults, id];
      setHiddenDefaults(updated);
      saveHiddenDefaults(updated);
    } else {
      const updated = customPresets.filter(p => p.id !== id);
      setCustomPresets(updated);
      saveCustomPresets(updated);
    }
    const updatedOrder = order.filter(oid => oid !== id);
    setOrder(updatedOrder);
    saveOrder(updatedOrder);
  }

  async function scanWindows() {
    setScanning(true);
    try {
      const wins = await invoke<Metin2Win[]>('list_metin2_windows');
      setM2wins(wins);
      // Pre-fill input with current titles
      const map: Record<string, string> = {};
      wins.forEach(w => { map[w.hwnd] = w.title; });
      setWinTitles(map);
    } catch (e) {
      console.error('[Tweaks] Scan error:', e);
      showToast('Nu s-au putut detecta ferestrele Metin2.', false);
    } finally {
      setScanning(false);
    }
  }

  async function focusWindow(hwnd: string) {
    try {
      await invoke('focus_window', { hwnd });
    } catch (e) {
      console.error('[Tweaks] Focus error:', e);
    }
  }

  async function applyWinTitle(hwnd: string) {
    const title = winTitles[hwnd]?.trim();
    if (!title) return;
    setApplyingWin(hwnd);
    try {
      await invoke<void>('set_window_title', { hwnd, title });
      setM2wins(prev => prev.map(w => w.hwnd === hwnd ? { ...w, title } : w));
      showToast(`Titlu schimbat: "${title}"`);
    } catch (e: unknown) {
      const code = typeof e === 'string' ? parseInt(e) : NaN;
      const msg = code === 5
        ? 'Acces refuzat. Aplicatia trebuie rulata ca Administrator.'
        : code === 1400
        ? 'Fereastra nu mai exista. Da Refresh.'
        : `Eroare ${isNaN(code) ? e : code}`;
      showToast(msg, false);
    } finally {
      setApplyingWin(null);
    }
  }

  async function handleRelaunch() {
    // In dev mode the Vite server URL isn't inherited by the elevated process → black screen.
    // Tell the user to relaunch manually instead.
    if (import.meta.env.DEV) {
      showToast('Mod dev: deschide un terminal ca Administrator si ruleaza din nou "npm run tauri dev".', false);
      return;
    }
    setRelaunching(true);
    try {
      await invoke('relaunch_as_admin');
    } catch (e) {
      console.error('[Tweaks] Relaunch error:', e);
      setRelaunching(false);
    }
  }

  async function doBind(pidStr: string, hotkey: string) {
    const pid = parseInt(pidStr);
    const current = { ...tcpBindingsRef.current };
    const oldHotkey = current[pidStr];

    // Remove old binding for this pid only
    if (oldHotkey && oldHotkey !== hotkey) {
      if (oldHotkey === 'Mouse4' || oldHotkey === 'Mouse5') {
        const button = oldHotkey === 'Mouse4' ? 3 : 4;
        try { await invoke('unregister_mouse_bind', { button, pid }); } catch {}
      } else {
        const remaining = Object.entries(current)
          .filter(([p, h]) => p !== pidStr && h === oldHotkey)
          .map(([p]) => p);
        try { await unregister(oldHotkey); } catch {}
        if (remaining.length > 0) await registerHotkey(oldHotkey, remaining).catch(() => {});
      }
    }

    current[pidStr] = hotkey;

    try {
      if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
        const button = hotkey === 'Mouse4' ? 3 : 4;
        await invoke('register_mouse_bind', { button, pid });
      } else {
        // All pids bound to this hotkey (including the new one)
        const allPids = Object.entries(current).filter(([, h]) => h === hotkey).map(([p]) => p);
        try { await unregister(hotkey); } catch {}
        await registerHotkey(hotkey, allPids);
      }
      setTcpBindings(current);
      tcpBindingsRef.current = current;
      localStorage.setItem(LS_TCP_BINDINGS, JSON.stringify(current));
      showToast(`Bind setat: ${hotkey} → PID ${pid}`);
    } catch {
      showToast(`Shortcut-ul "${hotkey}" nu poate fi inregistrat.`, false);
    }
  }

  async function doUnbind(pidStr: string) {
    const pid = parseInt(pidStr);
    const hotkey = tcpBindingsRef.current[pidStr];
    if (hotkey) {
      if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
        const button = hotkey === 'Mouse4' ? 3 : 4;
        try { await invoke('unregister_mouse_bind', { button, pid }); } catch {}
      } else {
        const remaining = Object.entries(tcpBindingsRef.current)
          .filter(([p, h]) => p !== pidStr && h === hotkey)
          .map(([p]) => p);
        try { await unregister(hotkey); } catch {}
        if (remaining.length > 0) await registerHotkey(hotkey, remaining).catch(() => {});
      }
    }
    const updated = { ...tcpBindingsRef.current };
    delete updated[pidStr];
    setTcpBindings(updated);
    tcpBindingsRef.current = updated;
    localStorage.setItem(LS_TCP_BINDINGS, JSON.stringify(updated));
    showToast('Bind sters.');
  }

  async function closeTcp(pidStr: string) {
    const pid = parseInt(pidStr);
    setClosingTcp(pidStr);
    try {
      const count = await invoke<number>('close_tcp_for_pid', { pid });
      showToast(count > 0 ? `TCP inchis (${count} conexiuni)` : 'Nicio conexiune TCP activa gasita.');
    } catch {
      showToast('Eroare la inchiderea TCP. Necesita Administrator.', false);
    } finally {
      setClosingTcp(null);
    }
  }

  function handleReorder(fromId: string, targetId: string) {
    if (fromId === targetId) return;
    const list = presetsRef.current;
    const fromIdx   = list.findIndex(p => p.id === fromId);
    const targetIdx = list.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || targetIdx === -1) return;
    const result = [...list];
    const [moved] = result.splice(fromIdx, 1);
    const newTargetIdx = result.findIndex(p => p.id === targetId);
    // Insert after target when moving forward, before when moving backward
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    result.splice(insertAt, 0, moved);
    presetsRef.current = result;
    const newOrder = result.map(p => p.id);
    setOrder(newOrder);
    saveOrder(newOrder);
  }

  // ── Pointer drag (identical pattern to Inventory) ─────────────────────

  const startDrag = (startX: number, startY: number, itemId: string) => {
    const cardEl = cardEls.current.get(itemId);
    if (!cardEl) return;
    const currentPreset = presetsRef.current.find(p => p.id === itemId);
    if (!currentPreset) return;

    const rect = cardEl.getBoundingClientRect();
    ghostOffsetRef.current = { x: startX - rect.left, y: startY - rect.top };
    ghostInitRect.current  = { x: rect.left, y: rect.top, width: rect.width };

    dragIdRef.current  = itemId;
    dragToIdRef.current = null;
    setDragId(itemId);
    setDragOverId(null);
    setGhostPreset(currentPreset);

    // Find the card whose center is closest to the cursor
    const getTargetId = (x: number, y: number): string | null => {
      let closest: { id: string; dist: number } | null = null;
      for (const [id, el] of cardEls.current) {
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

      const first = new Map<string, { left: number; top: number }>();
      for (const [id, el] of cardEls.current) {
        if (id === dragIdRef.current) continue;
        const r = el.getBoundingClientRect();
        first.set(id, { left: r.left, top: r.top });
      }

      flushSync(() => setDragOverId(newOverId));

      for (const [, el] of cardEls.current) {
        if (el.style.transform) { el.style.transition = 'none'; el.style.transform = ''; }
      }
      void document.body.getBoundingClientRect();

      for (const [id, el] of cardEls.current) {
        if (id === dragIdRef.current) continue;
        const f = first.get(id);
        if (!f) continue;
        const last = el.getBoundingClientRect();
        const dx = f.left - last.left;
        const dy = f.top  - last.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.style.transition = 'none';
        el.style.transform  = `translate(${dx}px, ${dy}px)`;
        void el.getBoundingClientRect();
        el.style.transition = 'transform 200ms cubic-bezier(0.25, 0, 0, 1)';
        el.style.transform  = '';
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (ghostElRef.current) {
        ghostElRef.current.style.left = `${ev.clientX - ghostOffsetRef.current.x}px`;
        ghostElRef.current.style.top  = `${ev.clientY - ghostOffsetRef.current.y}px`;
      }
      flipTo(getTargetId(ev.clientX, ev.clientY));
    };

    const onUp = () => {
      if (dragIdRef.current && dragToIdRef.current) {
        handleReorder(dragIdRef.current, dragToIdRef.current);
      }
      for (const [, el] of cardEls.current) { el.style.transition = ''; el.style.transform = ''; }
      dragIdRef.current  = null;
      dragToIdRef.current = null;
      setDragId(null);
      setDragOverId(null);
      setGhostPreset(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // Live preview during drag — mirrors handleReorder logic
  const displayPresets = useMemo(() => {
    if (!dragId || !dragOverId || dragId === dragOverId) return sortedPresets;
    const fromIdx   = sortedPresets.findIndex(p => p.id === dragId);
    const targetIdx = sortedPresets.findIndex(p => p.id === dragOverId);
    if (fromIdx === -1 || targetIdx === -1) return sortedPresets;
    const preview = [...sortedPresets];
    const [moved] = preview.splice(fromIdx, 1);
    const newTargetIdx = preview.findIndex(p => p.id === dragOverId);
    const insertAt = fromIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
    preview.splice(insertAt, 0, moved);
    return preview;
  }, [sortedPresets, dragId, dragOverId]);

  // ── Render ─────────────────────────────────────────────────────────────

  const cfgFileName = cfgPath ? cfgPath.split(/[\\/]/).pop() : null;
  const cfgDir      = cfgPath ? cfgPath.replace(/[\\/][^\\/]+$/, '') : null;

  return (
    <div className="space-y-8 animate-in max-w-3xl">
      <header>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Tweaks Joc</h2>
        <p className="text-slate-400 text-sm mt-1">Setari rapide aplicate direct in fisierele Metin2.</p>
      </header>

      {toast && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border',
          toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                   : 'bg-red-500/10 border-red-500/20 text-red-400'
        )}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Monitor className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <div className="card space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <Monitor className="w-5 h-5 text-accent-gold" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Rezolutie Fereastra</h3>
            <p className="text-slate-500 text-xs">Modifica WIDTH si HEIGHT direct in metin2.cfg</p>
          </div>
        </div>

        {/* File picker */}
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 rounded-xl bg-bg-secondary border border-white/5 min-w-0">
            {cfgPath ? (
              <div>
                <p className="text-slate-100 text-sm font-medium truncate">{cfgFileName}</p>
                <p className="text-slate-500 text-xs truncate mt-0.5">{cfgDir}</p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Niciun fisier selectat</p>
            )}
          </div>
          <button onClick={pickFile}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-sm font-medium hover:bg-white/[0.06] hover:text-slate-100 transition-all shrink-0">
            <FolderOpen className="w-4 h-4" />
            {cfgPath ? 'Schimba' : 'Selecteaza metin2.cfg'}
          </button>
        </div>

        {/* Current resolution */}
        {currentW && currentH && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-gold/5 border border-accent-gold/15 w-fit">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-widest">Curent</span>
            <span className="text-accent-gold font-bold font-display text-base">{currentW} × {currentH}</span>
          </div>
        )}

        {/* Presets grid */}
        <div className={cn(
          'grid grid-cols-3 gap-3 transition-opacity',
          !cfgPath && 'opacity-30 pointer-events-none'
        )}>
          {displayPresets.map(p => {
            const isActive    = p.w === currentW && p.h === currentH;
            const isLoading   = applying === p.id;
            const isDragging  = dragId === p.id;
            const isDragOver  = dragOverId === p.id;

            return (
              <div
                key={p.id}
                ref={el => { if (el) cardEls.current.set(p.id, el); else cardEls.current.delete(p.id); }}
                className={cn(
                  'relative group rounded-xl transition-colors select-none',
                  isDragging  && 'opacity-0 pointer-events-none',
                  isDragOver  && 'ring-1 ring-accent-gold/40'
                )}
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  const sx = e.clientX, sy = e.clientY;
                  let started = false;
                  const onMoveCheck = (ev: PointerEvent) => {
                    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
                      started = true;
                      document.removeEventListener('pointermove', onMoveCheck);
                      document.removeEventListener('pointerup', onUpCheck);
                      startDrag(sx, sy, p.id);
                    }
                  };
                  const onUpCheck = () => {
                    document.removeEventListener('pointermove', onMoveCheck);
                    document.removeEventListener('pointerup', onUpCheck);
                    if (!started) applyRes(p.w, p.h, p.id);
                  };
                  document.addEventListener('pointermove', onMoveCheck);
                  document.addEventListener('pointerup', onUpCheck);
                }}
              >
                {/* Drag handle */}
                <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none opacity-0 group-hover:opacity-40 transition-opacity">
                  <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                </div>

                <div className={cn(
                  'w-full flex flex-col items-center justify-center gap-1 py-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing',
                  isActive
                    ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold'
                    : 'bg-bg-secondary border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-100 hover:bg-white/[0.02]',
                  isLoading && 'animate-pulse',
                  applying && !isLoading && 'opacity-50'
                )}>
                  <span className="font-bold font-display text-base leading-none">
                    {p.w}<span className="text-[11px] font-normal mx-0.5 opacity-60">×</span>{p.h}
                  </span>
                  <span className={cn(
                    'text-[10px] font-black uppercase tracking-widest',
                    isActive ? 'text-accent-gold/70' : 'text-slate-600'
                  )}>
                    {p.label}
                  </span>
                </div>

                {/* Delete button */}
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => deletePreset(p.id, !p.custom)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md text-slate-600 hover:bg-red-500/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center z-10"
                  title="Sterge preset"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add custom preset */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Adauga Preset</p>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="number" placeholder="1280" value={newW} onChange={e => setNewW(e.target.value)}
              className="w-20 px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm text-center font-display font-bold focus:outline-none focus:border-accent-gold/30" />
            <span className="text-slate-600 font-bold">×</span>
            <input type="number" placeholder="720" value={newH} onChange={e => setNewH(e.target.value)}
              className="w-20 px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm text-center font-display font-bold focus:outline-none focus:border-accent-gold/30" />
            <input type="text" placeholder="Nume (ex: HD)" value={newLabel} onChange={e => setNewLabel(e.target.value)} maxLength={12}
              className="flex-1 min-w-[100px] px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-accent-gold/30" />
            <button onClick={addPreset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-gold text-bg-primary text-sm font-black uppercase tracking-wider hover:bg-accent-gold/90 transition-all shrink-0">
              <Plus className="w-3.5 h-3.5" /> Salveaza
            </button>
          </div>
        </div>

        {/* One-time apply */}
        <div className={cn(
          'flex items-center gap-3 pt-4 border-t border-white/5 transition-opacity',
          !cfgPath && 'opacity-30 pointer-events-none'
        )}>
          <span className="text-slate-500 text-xs font-black uppercase tracking-widest shrink-0">Aplica o data</span>
          <input type="number" placeholder="1280" value={customW} onChange={e => setCustomW(e.target.value)}
            className="w-20 px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm text-center font-display font-bold focus:outline-none focus:border-accent-gold/30" />
          <span className="text-slate-600 font-bold">×</span>
          <input type="number" placeholder="720" value={customH} onChange={e => setCustomH(e.target.value)}
            className="w-20 px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm text-center font-display font-bold focus:outline-none focus:border-accent-gold/30" />
          <button onClick={applyCustomOneTime} disabled={!cfgPath || !!applying}
            className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-slate-300 text-sm font-black uppercase tracking-wider hover:bg-white/[0.07] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            Aplica
          </button>
        </div>
      </div>

      {/* ── Optimizare Grafica ──────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <Layers className="w-5 h-5 text-accent-gold" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Optimizare Grafica</h3>
            <p className="text-slate-500 text-xs">Ascunde efecte, magazine private si drop items pentru performanta maxima</p>
          </div>
        </div>

        <div className={cn('grid grid-cols-2 gap-3 transition-opacity', !cfgPath && 'opacity-30 pointer-events-none')}>
          <button
            onClick={() => applyGraphicsMode(false)}
            disabled={applyingGfx || graphicsMode === 'normal'}
            className={cn(
              'flex flex-col items-center gap-2 py-5 rounded-xl border transition-all font-display',
              graphicsMode === 'normal'
                ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold cursor-default'
                : 'bg-bg-secondary border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-100 hover:bg-white/[0.02]',
              applyingGfx && 'opacity-50'
            )}
          >
            <span className="text-base font-black uppercase tracking-wider">Normal</span>
            <span className="text-[10px] font-bold text-current opacity-60">Efecte + Shop + Drop vizibile</span>
          </button>

          <button
            onClick={() => applyGraphicsMode(true)}
            disabled={applyingGfx || graphicsMode === 'optimized'}
            className={cn(
              'flex flex-col items-center gap-2 py-5 rounded-xl border transition-all font-display',
              graphicsMode === 'optimized'
                ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold cursor-default'
                : 'bg-bg-secondary border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-100 hover:bg-white/[0.02]',
              applyingGfx && 'opacity-50'
            )}
          >
            <span className="text-base font-black uppercase tracking-wider">Optimizat</span>
            <span className="text-[10px] font-bold text-current opacity-60">Efecte + Shop + Drop ascunse</span>
          </button>
        </div>

        {graphicsMode === 'custom' && (
          <p className="text-[11px] text-slate-600 font-medium">Valori personalizate detectate in cfg. Alege un mod pentru a aplica.</p>
        )}
        {!cfgPath && (
          <p className="text-[11px] text-slate-600 font-medium">Selecteaza metin2.cfg din sectiunea de mai sus.</p>
        )}
      </div>

      {/* ── Window Title Changer ─────────────────────────────────── */}
      <div className="card space-y-5">

        {/* Admin elevation banner */}
        {isAdmin === false && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-3 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-amber-300 text-sm font-medium">
                  Necesita drepturi de Administrator
                </p>
                {import.meta.env.DEV && (
                  <p className="text-amber-400/60 text-xs mt-0.5">
                    Mod dev: deschide un terminal ca admin si ruleaza <span className="font-mono">npm run tauri dev</span>
                  </p>
                )}
              </div>
            </div>
            {!import.meta.env.DEV && (
              <button
                onClick={handleRelaunch}
                disabled={relaunching}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-bg-primary text-xs font-black uppercase tracking-wider hover:bg-amber-400 disabled:opacity-50 transition-all"
              >
                {relaunching ? '...' : 'Restart Admin'}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
              <Type className="w-5 h-5 text-accent-gold" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 font-display">Titlu Fereastra</h3>
              <p className="text-slate-500 text-xs">Redenumeste clientele Metin2 deschise</p>
            </div>
          </div>
          <button
            onClick={scanWindows}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-sm font-medium hover:bg-white/[0.06] hover:text-slate-100 disabled:opacity-40 transition-all"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', scanning && 'animate-spin')} />
            {scanning ? 'Se scaneaza...' : 'Refresh'}
          </button>
        </div>

        {m2wins.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 border border-dashed border-white/5 rounded-xl">
            <AlertCircle className="w-8 h-8 text-slate-700" />
            <p className="text-slate-500 text-sm text-center">
              {scanning ? 'Se cauta procese...' : 'Apasa Refresh cu Metin2 deschis pentru a detecta clientele.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {m2wins.map(w => (
              <div key={w.hwnd} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-white/5 hover:border-white/10 transition-colors">
                {/* Identify button — brings that window to front */}
                <button
                  onClick={() => focusWindow(w.hwnd)}
                  title="Aduce fereastra in fata"
                  className="shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 hover:border-accent-gold/30 hover:bg-accent-gold/5 transition-all group"
                >
                  <Crosshair className="w-4 h-4 text-slate-600 group-hover:text-accent-gold transition-colors" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{w.exe}</p>
                    <span className="text-[9px] font-bold text-slate-700 font-display">PID {w.pid}</span>
                  </div>
                  <input
                    type="text"
                    value={winTitles[w.hwnd] ?? w.title}
                    onChange={e => setWinTitles(prev => ({ ...prev, [w.hwnd]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyWinTitle(w.hwnd)}
                    className="w-full bg-transparent text-slate-100 text-sm font-medium focus:outline-none border-b border-transparent focus:border-accent-gold/30 transition-colors pb-0.5 truncate"
                  />
                </div>
                <button
                  onClick={() => applyWinTitle(w.hwnd)}
                  disabled={applyingWin === w.hwnd || (winTitles[w.hwnd] ?? w.title) === w.title}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-primary text-xs font-black uppercase tracking-wider hover:bg-accent-gold/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {applyingWin === w.hwnd ? '...' : 'Aplica'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TCP Close ──────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <WifiOff className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">TCP Close</h3>
            <p className="text-slate-500 text-xs">Inchide conexiunile TCP ale clientelor Metin2. Bind-ul functioneaza global (fara focus pe aplicatie).</p>
          </div>
        </div>

        {m2wins.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 border border-dashed border-white/5 rounded-xl">
            <WifiOff className="w-8 h-8 text-slate-700" />
            <p className="text-slate-500 text-sm text-center">Apasa Refresh din sectiunea de mai sus pentru a detecta clientele.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {m2wins.map(w => {
              const pidStr = String(w.pid);
              const bound = tcpBindings[pidStr];
              const isListening = listeningBind === pidStr;
              return (
                <div key={w.pid} className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary border border-white/5 hover:border-white/10 transition-colors">
                  {/* PID badge */}
                  <div className="shrink-0 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-center min-w-[60px]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">PID</p>
                    <p className="text-xs font-bold text-slate-300 font-display">{w.pid}</p>
                  </div>

                  {/* Process info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{w.exe}</p>
                    <p className="text-xs text-slate-400 truncate">{w.title}</p>
                  </div>

                  {/* Hotkey bind */}
                  {bound ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-1 rounded-lg bg-accent-gold/10 border border-accent-gold/20 text-accent-gold text-xs font-bold font-display">
                        {bound}
                      </span>
                      <button
                        onClick={() => doUnbind(pidStr)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Sterge bind"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : isListening ? (
                    <span className="shrink-0 px-3 py-1.5 rounded-lg bg-accent-gold/5 border border-accent-gold/30 text-accent-gold text-xs font-medium animate-pulse">
                      Tasta sau Mouse4/5...
                    </span>
                  ) : (
                    <button
                      onClick={() => setListeningBind(pidStr)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-slate-400 text-xs font-medium hover:bg-white/[0.06] hover:text-slate-200 transition-all"
                    >
                      <Key className="w-3 h-3" />
                      Bind
                    </button>
                  )}

                  {/* TCP close button */}
                  <button
                    onClick={() => closeTcp(pidStr)}
                    disabled={closingTcp === pidStr}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black uppercase tracking-wider hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <WifiOff className="w-3 h-3" />
                    {closingTcp === pidStr ? '...' : 'TCP'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {ghostPreset && (
        <div
          ref={ghostElRef}
          className="fixed pointer-events-none z-[9999] rotate-[2deg] drop-shadow-2xl"
          style={{
            left:  ghostInitRect.current?.x ?? -9999,
            top:   ghostInitRect.current?.y ?? -9999,
            width: ghostInitRect.current?.width ?? 120,
          }}
        >
          <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl border bg-bg-secondary border-accent-gold/50 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <span className="font-bold font-display text-base leading-none text-slate-100">
              {ghostPreset.w}<span className="text-[11px] font-normal mx-0.5 opacity-60">×</span>{ghostPreset.h}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {ghostPreset.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
