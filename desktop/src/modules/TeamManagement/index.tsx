
import { useState, useEffect } from 'react';
import {
  UserPlus,
  Shield,
  XCircle,
  Check,
  Map as MapIcon,
  Clock,
  Package,
  Activity,
  CheckCircle2,
  ArrowLeftRight,
  RefreshCw,
  Copy,
  Edit2,
  Trash2,
  Webhook,
  Send,
  CheckCheck,
  Bell,
  Sliders,
  StickyNote,
} from 'lucide-react';
import { ref, onValue, set, update, remove, get } from 'firebase/database';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { appConfirm } from '../../components/ConfirmModal';

interface TeamMember {
  uid: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'leader';
  online?: boolean;
  permissions?: {
    spawn?: boolean;
    skin?: boolean;
    inventory?: boolean;
    status?: boolean;
    alerte?: boolean;
    transfers?: boolean;
    checklist?: boolean;
    alarms?: boolean;
    tweaks?: boolean;
    notes?: boolean;
  };
}

const PERMISSIONS = [
  { key: 'spawn',     label: 'Spawn Tracker', icon: MapIcon      },
  { key: 'skin',      label: 'Skin Reminder', icon: Clock        },
  { key: 'inventory', label: 'Inventory',     icon: Package      },
  { key: 'status',    label: 'Server Status', icon: Activity     },
  { key: 'alerte',    label: 'Alert System',  icon: CheckCircle2 },
  { key: 'transfers', label: 'Transfers',     icon: ArrowLeftRight },
  { key: 'checklist', label: 'Checklist',     icon: CheckCircle2 },
  { key: 'alarms',    label: 'Alarme',        icon: Bell         },
  { key: 'tweaks',    label: 'Tweaks',        icon: Sliders      },
  { key: 'notes',     label: 'Notițe',        icon: StickyNote   },
];

async function sendTestWebhook(webhookUrl: string, type: 'skin' | 'server'): Promise<boolean> {
  const embed = type === 'skin' ? {
    title: '🔔 Test Alerta Expirare',
    color: 0xe05252,
    fields: [
      { name: 'Item', value: 'Costum Test', inline: true },
      { name: 'Cont', value: 'TestCont', inline: true },
      { name: 'Categorie', value: 'costum', inline: true },
      { name: 'Timp ramas', value: '4z 2h 30m', inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'Metin2 Tools — Test' }
  } : {
    title: '🟢 Test Server Online',
    description: '**Romania CH1** este acum **ONLINE**',
    color: 0x4caf82,
    timestamp: new Date().toISOString(),
    footer: { text: 'Metin2 Tools — Test' }
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

export default function TeamManagement() {
  const { user, viewAsMember } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamMeta, setTeamMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [webhookSkin, setWebhookSkin] = useState('');
  const [webhookServer, setWebhookServer] = useState('');
  const [webhookTestState, setWebhookTestState] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'error'>>({});

  const teamId = user?.teamId;

  useEffect(() => {
    if (!teamId) return;

    // Single listener for the whole team node to avoid race conditions
    const teamRef = ref(db, `teams/${teamId}`);
    const unsubTeam = onValue(teamRef, (snap) => {
      const teamData = snap.val() || {};
      const metadata = teamData.metadata || teamData || {};
      const ownerId = metadata.ownerId || teamData.ownerId || teamData.leader || teamData.owner;
      
      setTeamMeta({ ...metadata, ownerId });

      const membersData = teamData.members || {};
      const presenceData = teamData.presence || {};

      let list = Object.entries(membersData).map(([uid, m]: [string, any]) => ({
        uid,
        ...m,
        online: !!presenceData[uid]
      }));

      // Synthesize owner if missing
      if (ownerId && !membersData[ownerId]) {
        const isSelf = ownerId === user?.uid;
        const ownerEntry: TeamMember = {
          uid: ownerId,
          name: isSelf ? (user?.name || 'Lider Echipă') : 'Lider Echipă',
          email: isSelf ? (user?.email || '') : '',
          role: 'owner',
          online: !!presenceData[ownerId],
          permissions: {
            spawn: true, skin: true, inventory: true, status: true, alerte: true, transfers: true, checklist: true, alarms: true, tweaks: true
          }
        };
        if (!list.find(m => m.uid === ownerId)) {
          list = [ownerEntry, ...list];
        }
      }

      // Sort: Owner -> Admins -> Members
      list.sort((a, b) => {
        if (a.role === 'owner' || a.role === 'leader') return -1;
        if (b.role === 'owner' || b.role === 'leader') return 1;
        if (a.role === 'admin') return -1;
        if (b.role === 'admin') return 1;
        return 0;
      });

      setMembers(list);
      setLoading(false);
    });

    return () => {
      unsubTeam();
    };
  }, [teamId]);

  // Load webhook settings
  useEffect(() => {
    if (!teamId) return;
    const settingsRef = ref(db, `teams/${teamId}/settings`);
    const unsub = onValue(settingsRef, (snap) => {
      const s = snap.val() || {};
      setWebhookSkin(s.discordWebhookSkin || '');
      setWebhookServer(s.discordWebhookServer || '');
    });
    return () => unsub();
  }, [teamId]);

  const isActuallySuperAdmin = user?.isSuperAdmin && !viewAsMember;
  const isOwner = teamMeta?.ownerId === user?.uid || isActuallySuperAdmin;
  const isAdmin = members.find(m => m.uid === user?.uid)?.role === 'admin' || isActuallySuperAdmin;
  const canManage = isOwner || isAdmin;

  const handleTogglePerm = async (memberUid: string, permKey: string, value: boolean) => {
    if (!canManage || memberUid === teamMeta?.ownerId) return;
    const permRef = ref(db, `teams/${teamId}/members/${memberUid}/permissions/${permKey}`);
    await set(permRef, value);
  };

  const handleToggleRole = async (memberUid: string, currentRole: string) => {
    if (!isOwner || memberUid === user?.uid) return;
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const roleRef = ref(db, `teams/${teamId}/members/${memberUid}/role`);
    await set(roleRef, newRole);
  };

  const handleKick = async (memberUid: string) => {
    if (!canManage || memberUid === user?.uid || memberUid === teamMeta?.ownerId) return;
    if (!await appConfirm('Sigur vrei sa elimini acest membru?', { title: 'Eliminare membru', variant: 'danger' })) return;

    await remove(ref(db, `teams/${teamId}/members/${memberUid}`));
    await update(ref(db, `users/${memberUid}`), {
      teamId: null,
      currentTeamId: null
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold" />
    </div>
  );

  const handleRenameTeam = async () => {
    if (!isOwner || !newName.trim()) return;
    try {
      await update(ref(db, `teams/${teamId}/metadata`), { name: newName.trim() });
      setIsEditingName(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisbandTeam = async () => {
    if (!isOwner || !teamId) return;
    if (!await appConfirm('Aceasta actiune va sterge definitiv echipa si va deconecta toti membrii.', { title: 'Sterge Echipa', confirmText: 'Sterge definitiv', variant: 'danger' })) return;
    
    try {
      const snapshot = await get(ref(db, `teams/${teamId}/members`));
      const membersData = snapshot.val() || {};
      const updates: any = {};
      
      Object.keys(membersData).forEach(uid => {
        updates[`users/${uid}/teamId`] = null;
        updates[`users/${uid}/currentTeamId`] = null;
      });
      
      if (user?.uid) {
        updates[`users/${user.uid}/teamId`] = null;
        updates[`users/${user.uid}/currentTeamId`] = null;
      }
      
      updates[`teams/${teamId}`] = null;
      await update(ref(db), updates);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateCode = async () => {
    if (!teamId || !canManage) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    try {
      await set(ref(db, `teams/${teamId}/metadata/inviteCode`), code);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const handleSaveWebhook = async (field: 'discordWebhookSkin' | 'discordWebhookServer', value: string) => {
    if (!teamId || !canManage) return;
    await set(ref(db, `teams/${teamId}/settings/${field}`), value.trim() || null);
  };

  const handleTestWebhook = async (type: 'skin' | 'server') => {
    const url = type === 'skin' ? webhookSkin : webhookServer;
    if (!url) return;
    setWebhookTestState(s => ({ ...s, [type]: 'loading' }));
    const ok = await sendTestWebhook(url, type);
    setWebhookTestState(s => ({ ...s, [type]: ok ? 'ok' : 'error' }));
    setTimeout(() => setWebhookTestState(s => ({ ...s, [type]: 'idle' })), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2">
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xl font-black text-white outline-none focus:border-accent-gold/50 w-64"
                  autoFocus
                />
                <button onClick={handleRenameTeam} className="p-2 bg-emerald-500 text-[#0c0c0e] rounded-xl hover:scale-105 transition-transform shadow-lg shadow-emerald-500/20">
                  <Check className="w-5 h-5" />
                </button>
                <button onClick={() => setIsEditingName(false)} className="p-2 bg-white/5 text-slate-400 rounded-xl hover:text-white transition-colors">
                  <Shield className="w-5 h-5 rotate-45" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-2xl font-black text-white tracking-tight uppercase">
                  {teamMeta?.name || 'Management Echipa'}
                </h1>
                {isOwner && (
                  <button 
                    onClick={() => {
                      setNewName(teamMeta?.name || '');
                      setIsEditingName(true);
                    }}
                    className="p-2 bg-white/5 rounded-xl text-slate-500 opacity-0 group-hover:opacity-100 hover:text-accent-gold hover:bg-accent-gold/10 transition-all duration-300"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Administreaza membrii si permisiunile echipei în timp real
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-accent-gold/10 border border-accent-gold/20 rounded-xl">
            <span className="text-[10px] font-black text-accent-gold uppercase tracking-widest">
              Team ID: {teamId}
            </span>
          </div>
          {isOwner && (
            <button 
              onClick={handleDisbandTeam}
              className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 group/disband"
              title="Sterge echipa definitiv"
            >
              <Trash2 className="w-4 h-4 group-hover/disband:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Desființează Echipa</span>
            </button>
          )}
        </div>
      </div>

      {canManage && (
        <div className="space-y-4">
        {/* Invite code */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card bg-accent-gold/[0.02] border-accent-gold/10 p-6 flex items-center justify-between group hover:border-accent-gold/30 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-accent-gold/10 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-accent-gold" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cod Invitație (Single-Use)</p>
                <p className="text-2xl font-black text-accent-gold tracking-[0.2em] font-mono">
                  {teamMeta?.inviteCode || '------'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleGenerateCode}
                className="p-3 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-accent-gold hover:bg-accent-gold/10 hover:border-accent-gold/20 transition-all"
                title="Genereaza cod nou"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button 
                onClick={() => teamMeta?.inviteCode && handleCopyCode(teamMeta.inviteCode)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent-gold text-[#0c0c0e] font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent-gold/20"
              >
                <Copy className="w-4 h-4" /> Copiază
              </button>
            </div>
          </div>
        </div>

        {/* Discord Webhooks */}
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/20">
              <Webhook className="w-4 h-4 text-[#5865F2]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Discord Webhooks</p>
              <p className="text-[10px] text-slate-500">Notificări automate în canalele Discord ale echipei</p>
            </div>
          </div>

          {[
            { field: 'discordWebhookSkin' as const, type: 'skin' as const, label: 'Expirare Costume / Însoțitori', desc: 'Trimite alerte când itemele expiră în 1 zi, 4 zile sau urgent', value: webhookSkin, setter: setWebhookSkin },
            { field: 'discordWebhookServer' as const, type: 'server' as const, label: 'Status Servere', desc: 'Trimite notificare când serverele Metin2 vin online', value: webhookServer, setter: setWebhookServer },
          ].map(({ field, type, label, desc, value, setter }) => {
            const testState = webhookTestState[type] || 'idle';
            return (
              <div key={field} className="space-y-2">
                <div>
                  <p className="text-xs font-bold text-slate-300">{label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={value}
                    onChange={e => setter(e.target.value)}
                    onBlur={() => handleSaveWebhook(field, value)}
                    onKeyDown={e => { if (e.key === 'Enter') { handleSaveWebhook(field, value); e.currentTarget.blur(); } }}
                    className="flex-1 bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#5865F2]/40 transition-colors"
                  />
                  <button
                    onClick={() => handleTestWebhook(type)}
                    disabled={!value || testState === 'loading'}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 shrink-0",
                      testState === 'ok'
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : testState === 'error'
                        ? "bg-red-500/10 border-red-500/20 text-red-400"
                        : value
                        ? "bg-[#5865F2]/10 border-[#5865F2]/20 text-[#7289da] hover:bg-[#5865F2]/20"
                        : "bg-white/[0.03] border-white/5 text-slate-700 cursor-not-allowed"
                    )}
                    title="Trimite mesaj de test"
                  >
                    {testState === 'loading' ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : testState === 'ok' ? (
                      <CheckCheck className="w-3 h-3" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    {testState === 'ok' ? 'Trimis' : testState === 'error' ? 'Eroare' : 'Test'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {members.map((member) => {
          const isMemberOwner = member.uid === teamMeta?.ownerId;
          const isSelf = member.uid === user?.uid;
          const memberCanBeManaged = canManage && !isMemberOwner && !isSelf;

          return (
            <div key={member.uid} className="card group hover:border-accent-gold/30 transition-all duration-300">
              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-bg-secondary border border-white/5 flex items-center justify-center relative">
                      <span className="text-lg font-black text-accent-gold">
                        {member.name?.[0].toUpperCase() || '?'}
                      </span>
                      {member.online && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-4 border-[#0c0c0e] shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-white flex items-center gap-2">
                        {member.name}
                        {isSelf && <span className="text-[10px] text-slate-500 font-normal">(Tu)</span>}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                          isMemberOwner ? "bg-accent-gold/10 text-accent-gold border border-accent-gold/20" :
                          member.role === 'admin' ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                          "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                        )}>
                          {isMemberOwner ? 'Lider' : member.role === 'admin' ? 'Admin' : 'Membru'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {memberCanBeManaged && (
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <button 
                          onClick={() => handleToggleRole(member.uid, member.role)}
                          className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                          title={member.role === 'admin' ? 'Revoca Admin' : 'Fa Admin'}
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleKick(member.uid)}
                        className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                        title="Elimina din echipa"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Permissions Grid */}
                {member.role === 'owner' || member.role === 'leader' ? (
                  <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center">
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">
                      Permisiuni Complete (Lider)
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-white/5">
                    {PERMISSIONS.map((perm) => {
                      const hasPerm = member.permissions?.[perm.key as keyof typeof member.permissions];
                      const canEdit = canManage && member.uid !== user?.uid;

                      if (canEdit) {
                        return (
                          <div key={perm.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-white/60">{perm.label}</span>
                            </div>
                            <button
                              onClick={() => handleTogglePerm(member.uid, perm.key, !hasPerm)}
                              className={`w-10 h-5 rounded-full relative transition-all duration-300 ${
                                hasPerm ? 'bg-accent-gold' : 'bg-white/10'
                              } cursor-pointer hover:scale-110 active:scale-95`}
                            >
                              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${
                                hasPerm ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                          </div>
                        );
                      } else {
                        return (
                          <div key={perm.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/5 opacity-60">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-white/40">{perm.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${hasPerm ? 'bg-accent-gold' : 'bg-white/10'}`} />
                              <span className="text-[10px] font-bold text-white/20 uppercase">
                                {hasPerm ? 'Activ' : 'Inactiv'}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
