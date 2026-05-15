import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SkinItem {
  id: string;
  name: string;
  account: string;
  expiresAt: number;
}

function formatTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function SkinExpiryWidget() {
  const { user } = useAuth();
  const teamId = user?.teamId;
  const [items, setItems] = useState<SkinItem[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!teamId) return;
    return onValue(ref(db, `teams/${teamId}/skinReminder/items`), snap => {
      const val = snap.val();
      setItems(val ? Object.values(val) : []);
    });
  }, [teamId]);

  useEffect(() => {
    const inv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(inv);
  }, []);

  const expiring = items
    .filter(i => i.expiresAt && !isNaN(i.expiresAt) && i.expiresAt > now && i.expiresAt - now <= 24 * 3600000)
    .sort((a, b) => a.expiresAt - b.expiresAt);

  if (expiring.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[900] flex flex-col-reverse gap-1.5 pointer-events-none items-end">
      {expiring.map(item => {
        const ms = item.expiresAt - now;
        const isUrgent = ms < 6 * 3600000;
        return (
          <div
            key={item.id}
            className="flex items-center gap-2 bg-[#0c0c0e]/95 border border-white/8 rounded-full pl-2.5 pr-3.5 py-1.5 backdrop-blur-md shadow-lg animate-in fade-in slide-in-from-right-2 duration-300"
          >
            <div className={cn(
              "w-2 h-2 rounded-full shrink-0",
              isUrgent
                ? "bg-red-500 shadow-[0_0_6px_#ef4444] animate-pulse"
                : "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
            )} />
            <span className="text-[11px] font-black text-white whitespace-nowrap tracking-tight">
              {item.name}
            </span>
            <span className={cn(
              "text-[10px] font-bold tabular-nums",
              isUrgent ? "text-red-400" : "text-amber-400"
            )}>
              {formatTime(ms)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
