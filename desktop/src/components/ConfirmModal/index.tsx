import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

// ── Reusable modal UI ────────────────────────────────────────────────
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen, onClose, onConfirm,
  title, message,
  confirmText = 'Confirmă',
  cancelText = 'Anulează',
  variant = 'danger'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center',
              variant === 'danger' ? 'bg-red-500/10 text-red-500' :
              variant === 'warning' ? 'bg-accent-gold/10 text-accent-gold' :
              'bg-blue-500/10 text-blue-500'
            )}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <h3 className="text-xl font-bold text-white mb-2 font-display">{title}</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">{message}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className={cn(
                'w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg',
                variant === 'danger' ? 'bg-red-500 text-white shadow-red-500/20 hover:bg-red-600' :
                variant === 'warning' ? 'bg-accent-gold text-bg-primary shadow-accent-gold/20 hover:scale-[1.02]' :
                'bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-600'
              )}
            >
              {confirmText}
            </button>
            <button onClick={onClose} className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white hover:bg-white/5 transition-all">
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Global imperative API ────────────────────────────────────────────
export interface AppConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface DialogState extends Required<AppConfirmOptions> {
  message: string;
  resolve: (v: boolean) => void;
}

let _setDialog: ((s: DialogState | null) => void) | null = null;

export function appConfirm(message: string, options?: AppConfirmOptions): Promise<boolean> {
  if (!_setDialog) return Promise.resolve(false);
  return new Promise(resolve => {
    _setDialog!({
      message,
      title: options?.title ?? 'Confirmare',
      confirmText: options?.confirmText ?? 'Confirma',
      cancelText: options?.cancelText ?? 'Anuleaza',
      variant: options?.variant ?? 'warning',
      resolve,
    });
  });
}

export function ConfirmRoot() {
  const [state, setState] = useState<DialogState | null>(null);

  useEffect(() => {
    _setDialog = setState;
    return () => { _setDialog = null; };
  }, []);

  if (!state) return null;

  const handle = (result: boolean) => {
    state.resolve(result);
    setState(null);
  };

  return (
    <ConfirmModal
      isOpen
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      onConfirm={() => handle(true)}
      onClose={() => handle(false)}
    />
  );
}
