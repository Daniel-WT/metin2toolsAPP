import React, { useState } from 'react';
import { Users, Plus, Hash, LogOut, ArrowRight, ShieldCheck, Clock, ShieldAlert, Palette, User, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ref, set, push, get, update } from 'firebase/database';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';

const PRESET_COLORS = [
  '#c8962e', '#ef4444', '#3b82f6', '#10b981', 
  '#a855f7', '#ec4899', '#f97316', '#14b8a6'
];

export default function TeamSelectionOverlay() {
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<'selection' | 'create' | 'join' | 'pending' | 'setup'>('selection');
  
  // Forms state
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [profileName, setProfileName] = useState(user?.email?.split('@')[0] || '');
  const [profileColor, setProfileColor] = useState('#c8962e');
  
  // Processing state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foundTeamId, setFoundTeamId] = useState('');
  const [foundTeamName, setFoundTeamName] = useState('');

  const handleRequestTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    
    try {
      const requestRef = ref(db, `team_requests/${teamId}`);
      await set(requestRef, {
        name: teamName,
        requestedBy: user.uid,
        userEmail: user.email,
        status: 'pending',
        timestamp: Date.now()
      });
      setMode('pending');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteCode) return;
    setLoading(true);
    setError('');
    
    try {
      const snapshot = await get(ref(db, 'teams'));
      let tId = null;
      let tName = '';
      
      snapshot.forEach(child => {
        const data = child.val();
        if (data && (data.inviteCode === inviteCode || (data.metadata && data.metadata.inviteCode === inviteCode))) {
          tId = child.key;
          tName = data.name || (data.metadata && data.metadata.name) || child.key;
        }
      });

      if (tId) {
        setFoundTeamId(tId);
        setFoundTeamName(tName);
        setMode('setup');
      } else {
        setError('Invalid or expired invite code.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !foundTeamId) return;
    setLoading(true);
    
    try {
      await set(ref(db, `teams/${foundTeamId}/members/${user.uid}`), {
        uid: user.uid,
        name: profileName.trim() || user.email?.split('@')[0],
        email: user.email,
        role: 'member',
        joinedAt: Date.now(),
        permissions: {
          spawn: true, skin: true, inventory: false, alerte: true, status: true, transfers: false, checklist: true
        }
      });

      await update(ref(db, `users/${user.uid}`), {
        teamId: foundTeamId,
        currentTeamId: foundTeamId,
        name: profileName.trim() || user.email?.split('@')[0],
        color: profileColor
      });

      // Single-use logic: Invalidate code after successful join
      await set(ref(db, `teams/${foundTeamId}/metadata/inviteCode`), null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-1 w-full flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-[#00000095] backdrop-blur-3xl" />
      
      <div className="relative w-full max-w-lg min-h-[500px] flex flex-col justify-center card bg-[#0c0c0e] border border-white/10 p-10 shadow-[0_0_150px_rgba(0,0,0,1)] hover:border-accent-gold/30 hover:shadow-[0_0_60px_rgba(200,150,46,0.15),0_64px_128px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out animate-in zoom-in-95">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center mb-6 shadow-2xl">
            <Users className="w-8 h-8 text-accent-gold" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 font-display">
            {mode === 'setup' ? 'Profile Setup' : 'Team Access'}
          </h2>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">
            {mode === 'setup' ? `Joining ${foundTeamName}` : 'Professional Verification Required'}
          </p>
        </div>

        {mode === 'selection' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => setMode('create')}
              className="card border-white/5 bg-white/[0.01] hover:bg-accent-gold/[0.03] hover:border-accent-gold/20 flex flex-col items-center p-8 transition-all group"
            >
              <Plus className="w-8 h-8 text-slate-600 group-hover:text-accent-gold mb-4 transition-colors" />
              <span className="font-bold text-slate-100">Request Team</span>
              <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-2">Requires Admin Approval</span>
            </button>
            <button 
              onClick={() => setMode('join')}
              className="card border-white/5 bg-white/[0.01] hover:bg-blue-500/[0.03] hover:border-blue-500/20 flex flex-col items-center p-8 transition-all group"
            >
              <Hash className="w-8 h-8 text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
              <span className="font-bold text-slate-100">Join Team</span>
              <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest mt-2">Enter Invite Code</span>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleRequestTeam} className="space-y-6 animate-in slide-in-from-right-4">
            <div className="p-4 rounded-xl bg-accent-gold/5 border border-accent-gold/10 flex gap-4 items-start mb-2">
              <ShieldAlert className="w-5 h-5 text-accent-gold flex-shrink-0" />
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                Creating a team requires manual verification by the <span className="text-accent-gold font-bold">Super-Admin</span>. 
                Approval usually takes under 2 hours.
              </p>
            </div>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Organization Name" 
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-4 py-3.5 bg-white/[0.02] border-white/5 rounded-xl text-sm outline-none focus:bg-white/[0.04]"
                required
              />
              <input 
                type="text" 
                placeholder="Requested Team ID" 
                value={teamId}
                onChange={(e) => setTeamId(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                className="w-full px-4 py-3.5 bg-white/[0.02] border-white/5 rounded-xl text-sm outline-none focus:bg-white/[0.04]"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 flex items-center justify-center gap-2">
              {loading ? <Clock className="w-4 h-4 animate-spin" /> : <>Submit Request <ArrowRight className="w-4 h-4" /></>}
            </button>
            <button type="button" onClick={() => setMode('selection')} className="w-full text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400">
              Go Back
            </button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoinTeam} className="space-y-6 animate-in slide-in-from-right-4">
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Enter Invite Code (e.g. 92YWOX)" 
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-4 bg-white/[0.02] border-white/5 rounded-xl text-lg text-center font-bold tracking-[0.2em] outline-none focus:bg-white/[0.04] focus:border-blue-500/30 transition-all uppercase"
                required
              />
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase text-center">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading || !inviteCode} className="btn-primary w-full py-4 flex items-center justify-center gap-2 !bg-blue-500 hover:!bg-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              {loading ? <Clock className="w-4 h-4 animate-spin" /> : 'Verify Code'}
            </button>
            <button type="button" onClick={() => setMode('selection')} className="w-full text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400">
              Go Back
            </button>
          </form>
        )}

        {mode === 'setup' && (
          <form onSubmit={handleCompleteSetup} className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Display Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 group-focus-within:text-accent-gold transition-colors" />
                  <input 
                    type="text" 
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Enter your name..."
                    className="w-full pl-12 pr-4 py-3.5 bg-white/[0.02] border border-white/5 rounded-xl text-sm text-white placeholder-slate-600 focus:bg-white/[0.04] focus:border-accent-gold/30 outline-none transition-all"
                    required
                  />
                </div>
                <p className="text-[9px] text-slate-600 font-medium px-2">This name will appear in activity logs (e.g. Ice Bosses).</p>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5" /> Identity Color
                </label>
                <div className="grid grid-cols-4 gap-3 p-3 bg-white/[0.01] rounded-xl border border-white/5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProfileColor(c)}
                      className={cn(
                        "h-8 rounded-lg transition-all duration-300 relative group overflow-hidden border-2",
                        profileColor === c ? "border-white scale-110 shadow-lg z-10" : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                    >
                      {profileColor === c && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading || !profileName} className="btn-primary w-full py-4 flex items-center justify-center gap-2">
              {loading ? <Clock className="w-4 h-4 animate-spin" /> : <>Finalize Profile <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>
        )}

        {mode === 'pending' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 text-center">
            <div className="p-10 rounded-3xl bg-blue-500/[0.03] border border-blue-500/10">
               <div className="relative w-16 h-16 mx-auto mb-6">
                  <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-full h-full bg-bg-secondary border border-blue-500/30 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-8 h-8 text-blue-500" />
                  </div>
               </div>
               <h4 className="text-xl font-bold text-slate-100 mb-2">Pending Verification</h4>
               <p className="text-xs text-slate-500 leading-relaxed max-w-[240px] mx-auto">
                 Your request is now in the <span className="text-blue-400 font-bold">Admin Queue</span>. Access will be granted once your identity is confirmed.
               </p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => setMode('selection')} className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400">
                Cancel & Go Back
              </button>
            </div>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-slate-400 border border-white/5">
                {user?.email?.[0].toUpperCase()}
             </div>
             <div>
                <p className="text-[10px] font-bold text-slate-400 leading-none">{user?.email}</p>
                <p className="text-[8px] text-slate-600 font-black uppercase tracking-tighter mt-1">Status: Restricted</p>
             </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>
    </div>
  );
}

