import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, Shield, UserPlus, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

export default function LoginOverlay() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('m2_remember_me') === 'true');
  const [email, setEmail] = useState(() => localStorage.getItem('m2_saved_email') || '');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (isRegister) {
        await register(email, pass);
      } else {
        if (rememberMe) {
          localStorage.setItem('m2_saved_email', email);
          localStorage.setItem('m2_remember_me', 'true');
        } else {
          localStorage.removeItem('m2_saved_email');
          localStorage.setItem('m2_remember_me', 'false');
        }
        await login(email, pass);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-1 w-full flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="absolute inset-0 bg-[#00000095] backdrop-blur-3xl" />
      
      <div className="relative w-full max-w-md card bg-[#0c0c0e] border border-white/10 p-10 shadow-[0_0_150px_rgba(0,0,0,1)] hover:border-accent-gold/30 hover:shadow-[0_64px_128px_rgba(0,0,0,0.9),0_0_60px_rgba(200,150,46,0.15)] transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] animate-in zoom-in-95">
        <div className="flex flex-col items-center text-center">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 bg-accent-gold/20 rounded-2xl blur-3xl" />
            <div className="relative w-full h-full bg-bg-secondary border border-accent-gold/30 rounded-2xl p-2 shadow-2xl">
              <img src="/logo.png" alt="MT" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
          
        <div className="w-full">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-100 font-display transition-all duration-300">
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2 transition-all duration-300">
              Metin2 Tools Suite
            </p>
          </div>

            <form onSubmit={handleSubmit} className="space-y-6 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-accent-gold transition-colors" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com" 
                    className="w-full pl-12 pr-4 py-3.5 bg-white/[0.02] border-white/5 rounded-xl text-sm focus:bg-white/[0.04] outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Security Code</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-accent-gold transition-colors" />
                  <input 
                    type="password" 
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="••••••••" 
                    className="w-full pl-12 pr-4 py-3.5 bg-white/[0.02] border-white/5 rounded-xl text-sm focus:bg-white/[0.04] outline-none transition-all"
                    required
                  />
                </div>
              </div>
              
              <div 
                className={cn(
                  "overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] px-1",
                  isRegister ? "max-h-0 opacity-0 !mt-0" : "max-h-[40px] opacity-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center transition-all",
                      rememberMe ? "bg-accent-gold border-accent-gold" : "bg-white/5 border-white/10 group-hover:border-white/20"
                    )}>
                      {rememberMe && <Check className="w-3 h-3 text-bg-primary stroke-[4]" />}
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Remember Me</span>
                  </label>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase flex items-center gap-2">
                  <Shield className="w-3 h-3 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="btn-primary w-full py-4 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    {isRegister ? 'Initialize Identity' : 'Secure Login'} 
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <button 
            onClick={() => setIsRegister(!isRegister)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-accent-gold transition-colors"
          >
            {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
