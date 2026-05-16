import { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { open } from '@tauri-apps/api/dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';
import { invoke } from '@tauri-apps/api/tauri';
import { FolderOpen, Monitor, CheckCircle2, Plus, Trash2, GripVertical, RefreshCw, Type, AlertCircle, Crosshair, WifiOff, Key, X, Sliders, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import { register, unregister } from '@tauri-apps/api/globalShortcut';

interface Metin2Win {
  hwnd: string;
  title: string;
  exe: string;
  pid: number;
  width: number;
  height: number;
  created_at: number;
}

interface Preset {
  id: string;
  w: number;
  h: number;
  label: string;
  custom?: boolean;
}

interface GraphicPreset {
  id: string;
  label: string;
  settings: Record<string, string>;
  custom?: boolean;
}

const GFX_SETTINGS = [
  { key: 'SHADOW_RENDER_QUALITY',  label: 'Calitate Umbre',   values: ['0','1','2'],           valueLabels: ['Off','Low','High'] },
  { key: 'CHARACTER_SHADOW_ENABLE',label: 'Umbre Personaj',   values: ['0','1'],               valueLabels: ['Off','On'] },
  { key: 'BPP',                    label: 'Adâncime Culori',  values: ['16','32'],             valueLabels: ['16 bpp','32 bpp'] },
  { key: 'EFFECT_LEVEL',           label: 'Efecte',           values: ['0','1','2','3','4'],   valueLabels: ['Normal','1','2','3','Ascuns'] },
  { key: 'PRIVATE_SHOP_LEVEL',     label: 'Shopuri Private',  values: ['0','1','2','3','4'],   valueLabels: ['Normal','1','2','3','Ascuns'] },
  { key: 'DROP_ITEM_LEVEL',        label: 'Drop Items',       values: ['0','1','2','3','4'],   valueLabels: ['Normal','1','2','3','Ascuns'] },
];

const DEFAULT_GFX_PRESETS: GraphicPreset[] = [
  { id: 'gfx_normal', label: 'Normal',    settings: { EFFECT_LEVEL: '0', PRIVATE_SHOP_LEVEL: '0', DROP_ITEM_LEVEL: '0' } },
  { id: 'gfx_opt',    label: 'Optimizat', settings: { EFFECT_LEVEL: '4', PRIVATE_SHOP_LEVEL: '4', DROP_ITEM_LEVEL: '4' } },
];

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
const LS_TCP_WHITELIST  = 'm2_tcp_whitelist';
const LS_CLOSEALL_BIND  = 'm2_tcp_closeall_bind';
const LS_GFX_PRESETS    = 'm2tweaks_gfx_presets';

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

  // ── Graphic presets state ─────────────────────────────────────────────
  const [gfxSettings, setGfxSettings]           = useState<Record<string, string>>({});
  const [customGfxPresets, setCustomGfxPresets] = useState<GraphicPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_GFX_PRESETS) || '[]'); } catch { return []; }
  });
  const [newGfxLabel, setNewGfxLabel]           = useState('');
  const [applyingGfx, setApplyingGfx]           = useState<string | null>(null);

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
  const [tcpWhitelist, setTcpWhitelist] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_TCP_WHITELIST) || '[]')); } catch { return new Set(); }
  });
  const [closeAllBind, setCloseAllBind]           = useState<string | null>(() => localStorage.getItem(LS_CLOSEALL_BIND) || null);
  const [listeningCloseAll, setListeningCloseAll] = useState(false);
  const [closingAll, setClosingAll]               = useState(false);
  const closeAllBindRef    = useRef<string | null>(null);
  const tcpWhitelistRef    = useRef<Set<string>>(new Set());
  const m2winsRef          = useRef<Metin2Win[]>([]);
  const autoScanInProgress = useRef(false);

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
  useEffect(() => { closeAllBindRef.current = closeAllBind; }, [closeAllBind]);
  useEffect(() => { tcpWhitelistRef.current = tcpWhitelist; }, [tcpWhitelist]);
  useEffect(() => { m2winsRef.current = m2wins; }, [m2wins]);

  // Sync whitelist PIDs to Rust whenever windows list or whitelist changes
  useEffect(() => {
    const pids = m2wins.filter(w => tcpWhitelist.has(String(w.pid))).map(w => w.pid);
    invoke('update_closeall_whitelist', { pids }).catch(() => {});
  }, [m2wins, tcpWhitelist]);

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
    // Restore close-all bind
    const caHotkey = closeAllBindRef.current;
    if (caHotkey) {
      if (caHotkey === 'Mouse4' || caHotkey === 'Mouse5') {
        const button = caHotkey === 'Mouse4' ? 3 : 4;
        invoke('register_mouse_closeall', { button }).catch(() => {});
      } else {
        register(caHotkey, async () => {
          const excludePids = m2winsRef.current
            .filter(w => tcpWhitelistRef.current.has(String(w.pid)))
            .map(w => w.pid);
          try { await invoke('close_tcp_all_except', { excludePids }); } catch {}
        }).catch(() => {});
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
      if (caHotkey) {
        if (caHotkey === 'Mouse4' || caHotkey === 'Mouse5') {
          const button = caHotkey === 'Mouse4' ? 3 : 4;
          invoke('unregister_mouse_closeall', { button }).catch(() => {});
        } else {
          unregister(caHotkey).catch(() => {});
        }
      }
    };
  }, []);

  // Auto-scan Metin2 windows on mount and every 4s
  useEffect(() => {
    const doScan = async () => {
      if (autoScanInProgress.current) return;
      autoScanInProgress.current = true;
      try {
        const wins = await invoke<Metin2Win[]>('list_metin2_windows');
        setM2wins(wins);
        setWinTitles(prev => {
          const next: Record<string, string> = {};
          wins.forEach(w => { next[w.hwnd] = prev[w.hwnd] ?? w.title; });
          return next;
        });
      } catch {}
      autoScanInProgress.current = false;
    };
    doScan();
    const inv = setInterval(doScan, 4000);
    return () => clearInterval(inv);
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

  // Listen for key or mouse when binding Close All
  useEffect(() => {
    if (!listeningCloseAll) return;
    const onKey = async (e: KeyboardEvent) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setListeningCloseAll(false); return; }
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
      setListeningCloseAll(false);
      await doBindCloseAll(parts.join('+'));
    };
    const onMouse = async (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); setListeningCloseAll(false); await doBindCloseAll('Mouse4'); }
      else if (e.button === 4) { e.preventDefault(); setListeningCloseAll(false); await doBindCloseAll('Mouse5'); }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }, [listeningCloseAll]);

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
      // Read graphic settings
      const gfxVals: Record<string, string> = {};
      GFX_SETTINGS.forEach(({ key }) => {
        const m = content.match(new RegExp(`${key}\\s+(\\S+)`));
        if (m) gfxVals[key] = m[1];
      });
      setGfxSettings(gfxVals);
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

  async function applyGfxPreset(preset: GraphicPreset) {
    if (!cfgPath) { showToast('Selecteaza mai intai metin2.cfg.', false); return; }
    setApplyingGfx(preset.id);
    try {
      let content = await readTextFile(cfgPath);
      for (const [key, value] of Object.entries(preset.settings)) {
        const regex = new RegExp(`(${key}\\s+)\\S+`);
        if (regex.test(content)) {
          content = content.replace(regex, `$1${value}`);
        }
      }
      await writeTextFile(cfgPath, content);
      setGfxSettings(prev => ({ ...prev, ...preset.settings }));
      showToast(`Profil "${preset.label}" aplicat.`);
    } catch {
      showToast('Eroare la aplicarea profilului grafic.', false);
    } finally {
      setApplyingGfx(null);
    }
  }

  function saveGfxPreset() {
    const label = newGfxLabel.trim();
    if (!label) { showToast('Introdu un nume pentru preset.', false); return; }
    if (Object.keys(gfxSettings).length === 0) { showToast('Incarca mai intai metin2.cfg.', false); return; }
    const preset: GraphicPreset = { id: Date.now().toString(), label, settings: { ...gfxSettings }, custom: true };
    const updated = [...customGfxPresets, preset];
    setCustomGfxPresets(updated);
    localStorage.setItem(LS_GFX_PRESETS, JSON.stringify(updated));
    setNewGfxLabel('');
    showToast(`Preset "${label}" salvat.`);
  }

  function deleteGfxPreset(id: string) {
    const updated = customGfxPresets.filter(p => p.id !== id);
    setCustomGfxPresets(updated);
    localStorage.setItem(LS_GFX_PRESETS, JSON.stringify(updated));
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

  async function closeAllTcp() {
    setClosingAll(true);
    try {
      const excludePids = m2winsRef.current
        .filter(w => tcpWhitelistRef.current.has(String(w.pid)))
        .map(w => w.pid);
      const count = await invoke<number>('close_tcp_all_except', { excludePids });
      showToast(count > 0 ? `TCP inchis (${count} conexiuni)` : 'Nicio conexiune TCP activa gasita.');
    } catch {
      showToast('Eroare la inchiderea TCP. Necesita Administrator.', false);
    } finally {
      setClosingAll(false);
    }
  }

  function toggleWhitelist(pidStr: string) {
    setTcpWhitelist(prev => {
      const next = new Set(prev);
      if (next.has(pidStr)) next.delete(pidStr);
      else next.add(pidStr);
      localStorage.setItem(LS_TCP_WHITELIST, JSON.stringify([...next]));
      return next;
    });
  }

  async function doBindCloseAll(hotkey: string) {
    const old = closeAllBindRef.current;
    if (old && old !== hotkey) {
      if (old === 'Mouse4' || old === 'Mouse5') {
        const button = old === 'Mouse4' ? 3 : 4;
        try { await invoke('unregister_mouse_closeall', { button }); } catch {}
      } else {
        try { await unregister(old); } catch {}
      }
    }
    try {
      if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
        const button = hotkey === 'Mouse4' ? 3 : 4;
        await invoke('register_mouse_closeall', { button });
      } else {
        await register(hotkey, async () => {
          const excludePids = m2winsRef.current
            .filter(w => tcpWhitelistRef.current.has(String(w.pid)))
            .map(w => w.pid);
          try { await invoke('close_tcp_all_except', { excludePids }); } catch {}
        });
      }
      setCloseAllBind(hotkey);
      closeAllBindRef.current = hotkey;
      localStorage.setItem(LS_CLOSEALL_BIND, hotkey);
      showToast(`Bind Close All setat: ${hotkey}`);
    } catch {
      showToast(`Shortcut-ul "${hotkey}" nu poate fi inregistrat.`, false);
    }
  }

  async function doUnbindCloseAll() {
    const hotkey = closeAllBindRef.current;
    if (hotkey) {
      if (hotkey === 'Mouse4' || hotkey === 'Mouse5') {
        const button = hotkey === 'Mouse4' ? 3 : 4;
        try { await invoke('unregister_mouse_closeall', { button }); } catch {}
      } else {
        try { await unregister(hotkey); } catch {}
      }
    }
    setCloseAllBind(null);
    closeAllBindRef.current = null;
    localStorage.removeItem(LS_CLOSEALL_BIND);
    showToast('Bind Close All sters.');
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

      {/* ── Graphic Optimization Presets ────────────────────────── */}
      <div className="card space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
            <Sliders className="w-5 h-5 text-accent-gold" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 font-display">Optimizări Grafice</h3>
            <p className="text-slate-500 text-xs">Preseturi de performanță aplicate direct în metin2.cfg</p>
          </div>
        </div>

        {/* Current gfx values */}
        {Object.keys(gfxSettings).length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {GFX_SETTINGS.map(({ key, label, valueLabels, values }) => {
              const val = gfxSettings[key];
              const idx = val ? values.indexOf(val) : -1;
              const displayLabel = idx >= 0 ? valueLabels[idx] : (val ?? '—');
              return (
                <div key={key} className="px-3 py-2.5 rounded-xl bg-bg-secondary border border-white/5 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">{label}</p>
                  <p className="text-sm font-bold text-accent-gold font-display">{displayLabel}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Presets grid */}
        <div className={cn('grid grid-cols-2 gap-3 transition-opacity', !cfgPath && 'opacity-30 pointer-events-none')}>
          {[...DEFAULT_GFX_PRESETS, ...customGfxPresets].map(preset => {
            const isLoading = applyingGfx === preset.id;
            const isActive = Object.entries(preset.settings).every(([k, v]) => gfxSettings[k] === v);
            return (
              <div key={preset.id} className="relative group">
                <button
                  onClick={() => applyGfxPreset(preset)}
                  disabled={!!applyingGfx}
                  className={cn(
                    'w-full flex flex-col items-center justify-center gap-1 py-4 rounded-xl border transition-all',
                    isActive
                      ? 'bg-accent-gold/10 border-accent-gold/40 text-accent-gold'
                      : 'bg-bg-secondary border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-100 hover:bg-white/[0.02]',
                    isLoading && 'animate-pulse',
                    applyingGfx && !isLoading && 'opacity-50'
                  )}
                >
                  <Sliders className={cn('w-4 h-4', isActive ? 'text-accent-gold' : 'text-slate-600')} />
                  <span className={cn(
                    'text-[10px] font-black uppercase tracking-widest mt-1',
                    isActive ? 'text-accent-gold/70' : 'text-slate-600'
                  )}>
                    {preset.label}
                  </span>
                </button>
                {preset.custom && (
                  <button
                    onClick={() => deleteGfxPreset(preset.id)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md text-slate-600 hover:bg-red-500/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                    title="Sterge preset"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Save current as preset */}
        <div className="space-y-3 pt-4 border-t border-white/5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Salvează Setările Curente</p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Nume preset (ex: FPS Max)"
              value={newGfxLabel}
              onChange={e => setNewGfxLabel(e.target.value)}
              maxLength={16}
              className="flex-1 px-3 py-2 rounded-lg bg-bg-secondary border border-white/5 text-slate-100 text-sm focus:outline-none focus:border-accent-gold/30"
            />
            <button
              onClick={saveGfxPreset}
              disabled={!cfgPath || Object.keys(gfxSettings).length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-gold text-bg-primary text-sm font-black uppercase tracking-wider hover:bg-accent-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Salvează
            </button>
          </div>
          {!cfgPath && (
            <p className="text-xs text-slate-600">Selectează metin2.cfg mai sus pentru a activa preseturile grafice.</p>
          )}
        </div>
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
                    {w.width > 0 && w.height > 0 && (
                      <span className="text-[9px] font-bold text-slate-600 font-display">{w.width}×{w.height}</span>
                    )}
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

        {/* ── Close All row ── */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
          <div className="shrink-0 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <WifiOff className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-100">Close All</p>
            <p className="text-[10px] text-slate-500">Inchide toate conexiunile Metin2, mai putin cele cu scut activat.</p>
          </div>
          {/* Bind button */}
          {closeAllBind ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-1 rounded-lg bg-accent-gold/10 border border-accent-gold/20 text-accent-gold text-xs font-bold font-display">
                {closeAllBind}
              </span>
              <button
                onClick={doUnbindCloseAll}
                className="w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Sterge bind"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : listeningCloseAll ? (
            <span className="shrink-0 px-3 py-1.5 rounded-lg bg-accent-gold/5 border border-accent-gold/30 text-accent-gold text-xs font-medium animate-pulse">
              Tasta sau Mouse4/5...
            </span>
          ) : (
            <button
              onClick={() => setListeningCloseAll(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-slate-400 text-xs font-medium hover:bg-white/[0.06] hover:text-slate-200 transition-all"
            >
              <Key className="w-3 h-3" />
              Bind
            </button>
          )}
          {/* Execute button */}
          <button
            onClick={closeAllTcp}
            disabled={closingAll}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-wider hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <WifiOff className="w-3 h-3" />
            {closingAll ? '...' : 'All'}
          </button>
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
              const whitelisted = tcpWhitelist.has(pidStr);
              return (
                <div key={w.pid} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                  whitelisted
                    ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/30'
                    : 'bg-bg-secondary border-white/5 hover:border-white/10'
                )}>
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

                  {/* Whitelist shield */}
                  <button
                    onClick={() => toggleWhitelist(pidStr)}
                    title={whitelisted ? 'Scoate din whitelist' : 'Adauga in whitelist (protejat de Close All)'}
                    className={cn(
                      'shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border transition-all',
                      whitelisted
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                        : 'bg-white/[0.03] border-white/[0.07] text-slate-600 hover:text-slate-300 hover:bg-white/[0.06]'
                    )}
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </button>

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
