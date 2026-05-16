import { useEffect } from 'react';
import { appWindow, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';

const LS_PREFIX = 'm2_wnd_';

export interface WindowGeometry { x: number; y: number; w: number; h: number; }

export function loadWindowGeometry(key: string): WindowGeometry | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const g = JSON.parse(raw) as WindowGeometry;
    if (g.w > 0 && g.h > 0) return g;
  } catch {}
  return null;
}

// Returns WebviewWindow constructor options (x, y, width, height) from saved geometry
export function savedWindowOptions(key: string): { x?: number; y?: number; width?: number; height?: number; center?: boolean } {
  const g = loadWindowGeometry(key);
  if (!g) return { center: true };
  return { x: g.x, y: g.y, width: g.w, height: g.h, center: false };
}

// Hook: saves position+size on every move/resize
export function useWindowMemory(key: string) {
  useEffect(() => {
    const save = async () => {
      try {
        const factor = await appWindow.scaleFactor();
        const pos  = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        const g: WindowGeometry = {
          x: Math.round(pos.x  / factor),
          y: Math.round(pos.y  / factor),
          w: Math.round(size.width  / factor),
          h: Math.round(size.height / factor),
        };
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(g));
      } catch {}
    };

    const unlistenMove   = appWindow.listen('tauri://move',   save);
    const unlistenResize = appWindow.listen('tauri://resize', save);
    return () => {
      unlistenMove.then(f => f());
      unlistenResize.then(f => f());
    };
  }, [key]);
}
