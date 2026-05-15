import React from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

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

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirmă', 
  cancelText = 'Anulează',
  variant = 'danger'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-bg-primary/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 text-center">
          <div className={cn(
            "w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center border",
            variant === 'danger' ? "bg-red-500/10 border-red-500/20 text-red-500" :
            variant === 'warning' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
            "bg-blue-500/10 border-blue-500/20 text-blue-500"
          )}>
            {variant === 'danger' ? <RotateCcw className="w-8 h-8 animate-in spin-in-180 duration-700" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tight font-display">{title}</h3>
          <p className="text-sm text-slate-400 italic mb-8">{message}</p>
          
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase tracking-widest transition-all border border-white/5"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => { onConfirm(); onClose(); }}
              className={cn(
                "flex-1 px-6 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95",
                variant === 'danger' ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20" :
                variant === 'warning' ? "bg-amber-500 hover:bg-amber-600 text-bg-primary shadow-amber-500/20" :
                "bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20"
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
        
        {/* Subtle background glow */}
        <div className={cn(
          "absolute -bottom-10 -left-10 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none",
          variant === 'danger' ? "bg-red-500" : variant === 'warning' ? "bg-amber-500" : "bg-blue-500"
        )} />
      </div>
    </div>
  );
}
