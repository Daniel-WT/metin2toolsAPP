import React, { useState } from 'react';
import { User, Bell, Shield, Key, Save, Lock, Mail, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { SidebarOrderCard } from '../Tweaks/SidebarOrderCard';

export default function Settings() {
  const { user, updateProfile, viewAsMember, setViewAsMember } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [color, setColor] = useState(user?.color || '#c8962e');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const PRESET_COLORS = [
    '#c8962e', // Gold
    '#e74c3c', // Red
    '#3498db', // Blue
    '#2ecc71', // Green
    '#9b59b6', // Purple
    '#1abc9c', // Teal
    '#f1c40f', // Yellow
    '#e67e22', // Orange
    '#ecf0f1', // Silver
    '#d35400', // Pumpkin
  ];

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setSaving(true);
    setStatus('idle');
    try {
      await updateProfile({ name: name.trim(), color });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in max-w-4xl">
      <header>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Setări Aplicație</h2>
        <p className="text-slate-400 text-sm mt-1">Gestionează profilul tău și configurările de sistem.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Section */}
        <div className="md:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 rounded-xl bg-accent-gold/10 border border-accent-gold/20">
                <User className="w-5 h-5 text-accent-gold" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 font-display">Profil Utilizator</h3>
                <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Identitate Vizibilă</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Nume Afișat</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 group-focus-within:text-accent-gold transition-colors" />
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cum vrei să apari pe site?" 
                    className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border-white/5 rounded-xl text-sm focus:border-accent-gold/50 transition-all outline-none"
                  />
                </div>
                <p className="text-[9px] text-slate-600 px-1 italic">Acest nume va fi vizibil pentru toți membrii echipei tale.</p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Culoare Personalizată</label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all hover:scale-110",
                        color === c ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  {status === 'success' && (
                    <span className="text-emerald-500 text-[10px] font-bold flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                      <CheckCircle2 className="w-3 h-3" /> Profil actualizat cu succes!
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="text-red-500 text-[10px] font-bold animate-in shake">
                      Eroare la salvare. Încearcă din nou.
                    </span>
                  )}
                </div>
                <button 
                  type="submit" 
                  disabled={saving || (name === user?.name && color === user?.color)}
                  className={cn(
                    "btn-primary flex items-center gap-2 py-2 px-6",
                    (saving || (name === user?.name && color === user?.color)) && "opacity-50 cursor-not-allowed grayscale"
                  )}
                >
                  {saving ? "Se salvează..." : <><Save className="w-4 h-4" /> Salvează Modificările</>}
                </button>
              </div>
            </form>
          </div>

          {/* Password Change Section */}
          <div className="card">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <Key className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 font-display">Securitate Cont</h3>
                <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest">Modificare Parolă</p>
              </div>
            </div>
            
            <PasswordChangeForm />
          </div>
        </div>

        {/* Info Column */}
        <div className="space-y-6">
          <div className="card bg-accent-gold/[0.02] border-accent-gold/10">
            <Shield className="w-8 h-8 text-accent-gold mb-4" />
            <h4 className="font-bold text-slate-100 mb-2">Securitate</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Datele tale sunt protejate prin criptare end-to-end pe serverele Firebase. Schimbarea numelui și culorii este instantanee pentru restul echipei.
            </p>
          </div>

          <div className="card bg-purple-500/[0.02] border-purple-500/10">
            <Lock className="w-8 h-8 text-purple-400 mb-4" />
            <h4 className="font-bold text-slate-100 mb-2">Protecție</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Pentru a schimba parola, sistemul va solicita autentificarea curentă pentru a asigura că tu ești cel care face solicitarea.
            </p>
          </div>

          <div className="card bg-blue-500/[0.02] border-blue-500/10">
            <Mail className="w-8 h-8 text-blue-400 mb-4" />
            <h4 className="font-bold text-slate-100 mb-2">Contul tău</h4>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Email înregistrat</p>
              <p className="text-xs text-slate-300 font-mono truncate">{user?.email}</p>
            </div>
          </div>

          {/* Super Admin Simulation Mode */}
          {user?.isSuperAdmin && (
            <div className="card border-orange-500/20 bg-orange-500/[0.02] animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  {viewAsMember ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </div>
                <h4 className="font-bold text-slate-100">Mod Simulare</h4>
              </div>
              
                  <div className="space-y-4">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Activează acest mod pentru a vedea aplicația exact așa cum o vede un membru obișnuit. Opțiunile de admin vor fi ascunse.
                </p>
                
                <button 
                  onClick={() => setViewAsMember(!viewAsMember)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    viewAsMember 
                      ? "bg-orange-500/20 text-orange-400 border-orange-500/30" 
                      : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-slate-100"
                  )}
                >
                  <span>{viewAsMember ? "Membru Activ" : "Vede ca Membru"}</span>
                  <div className={cn(
                    "w-8 h-4 rounded-full relative transition-colors bg-slate-700",
                    viewAsMember && "bg-orange-500"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm",
                      viewAsMember ? "translate-x-4" : "translate-x-0"
                    )} />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <SidebarOrderCard />
    </div>
  );
}

function PasswordChangeForm() {
  const { changePassword } = useAuth();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'invalid_old'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPass || !newPass) return;
    if (newPass.length < 6) { alert('Parola nouă trebuie să aibă minim 6 caractere.'); return; }

    setSaving(true);
    setStatus('idle');
    try {
      await changePassword(oldPass, newPass);
      setStatus('success');
      setOldPass('');
      setNewPass('');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setStatus('invalid_old');
      } else {
        setStatus('error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Parola Veche</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700" />
            <input 
              type="password" 
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              placeholder="••••••••" 
              className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border-white/5 rounded-xl text-sm outline-none focus:border-purple-500/50 transition-all"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Parola Nouă</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700" />
            <input 
              type="password" 
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Minim 6 caractere" 
              className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border-white/5 rounded-xl text-sm outline-none focus:border-purple-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          {status === 'success' && (
            <span className="text-emerald-500 text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Parolă actualizată!
            </span>
          )}
          {status === 'invalid_old' && (
            <span className="text-red-500 text-[10px] font-bold">Parola veche este incorectă.</span>
          )}
          {status === 'error' && (
            <span className="text-red-500 text-[10px] font-bold">A apărut o eroare neașteptată.</span>
          )}
        </div>
        <button 
          type="submit" 
          disabled={saving || !oldPass || !newPass}
          className={cn(
            "py-2.5 px-6 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
            (saving || !oldPass || !newPass) 
              ? "bg-white/5 text-slate-600 cursor-not-allowed" 
              : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 active:scale-95"
          )}
        >
          {saving ? "Se actualizează..." : "Actualizează Parola"}
        </button>
      </div>
    </form>
  );
}
