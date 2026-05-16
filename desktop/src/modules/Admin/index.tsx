import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, XCircle, CheckCircle2, Clock, Mail, Users, Trash2, Search, UserPlus, Power, Ban, ScrollText, Lock, Plus } from 'lucide-react';
import { ref, onValue, update, remove, set, get } from 'firebase/database';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import ConfirmModal, { appConfirm } from '../../components/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';

interface SecretItem {
  id: string; name: string; depersAt: number; addedAt: number; totalDuration: number; notifiedDeperss?: boolean;
}

interface TeamRequest {
  id: string;
  name: string;
  userEmail: string;
  requestedBy: string;
  timestamp: number;
}

interface AdminPermissions {
  serverStatus?: boolean;
  adminPanel?: boolean;
}

interface TabPermissions {
  spawn?: boolean;
  skin?: boolean;
  inventory?: boolean;
  alerte?: boolean;
  status?: boolean;
  transfers?: boolean;
  checklist?: boolean;
  alarms?: boolean;
  tweaks?: boolean;
  notes?: boolean;
}

interface MemberData {
  name?: string;
  role?: string;
  online?: boolean;
  permissions?: TabPermissions;
}

interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  color?: string;
  teamId?: string;
  currentTeamId?: string;
  role?: string;
  isSuperAdmin?: boolean;
  permissions?: AdminPermissions;
}

const ADMIN_PERMISSIONS: { key: keyof AdminPermissions; label: string }[] = [
  { key: 'serverStatus', label: 'Server Status' },
  { key: 'adminPanel',   label: 'Admin Panel'   },
];

const TAB_PERMISSIONS: { key: keyof TabPermissions; label: string }[] = [
  { key: 'spawn',     label: 'Spawn'       },
  { key: 'skin',      label: 'Costume'     },
  { key: 'inventory', label: 'Inventar'    },
  { key: 'alerte',    label: 'Alert System'},
  { key: 'status',    label: 'Servere'     },
  { key: 'transfers', label: 'Transferuri' },
  { key: 'checklist', label: 'Checklist'   },
  { key: 'alarms',    label: 'Alarme'      },
  { key: 'tweaks',    label: 'Tweaks'      },
  { key: 'notes',     label: 'Notițe'      },
];

interface Team {
  id: string;
  name: string;
  leader: string;
  members?: Record<string, MemberData>;
  metadata?: {
    ownerId?: string;
    name?: string;
  }
}

export default function AdminPanel() {
  const [requests, setRequests] = useState<TeamRequest[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bannedEmails, setBannedEmails] = useState<string[]>([]);
  const [bannedUids, setBannedUids] = useState<string[]>([]);
  const [newBanEmail, setNewBanEmail] = useState('');
  const [showBanSuggestions, setShowBanSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'teams' | 'users' | 'bans' | 'logs' | 'depers'>('requests');
  const [logs, setLogs] = useState<{ id: number; msg: string; type: string; ts: number }[]>([]);
  const logIdRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [secretItems, setSecretItems] = useState<SecretItem[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showAddDepers, setShowAddDepers] = useState(false);
  const [newDepersName, setNewDepersName] = useState('');
  const [newDopersDays, setNewDopersDays] = useState(0);
  const [newDepersHours, setNewDepersHours] = useState(0);
  const [newDopersMins, setNewDopersMins] = useState(0);
  const { user } = useAuth();
  const teamId = user?.teamId || (user as any)?.currentTeamId || '';
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });

  useEffect(() => {
    const requestsRef = ref(db, 'team_requests');
    const teamsRef = ref(db, 'teams');
    const usersRef = ref(db, 'users');
    const bansRef = ref(db, 'banned_emails');

    const unsubRequests = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      setRequests(data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : []);
    });

    const unsubTeams = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      setTeams(data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : []);
    });

    const unsubUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setUsers([]); return; }

      const all: UserProfile[] = Object.entries(data).map(([uid, val]: [string, any]) => ({ ...val, uid }));

      const byEmail = new Map<string, UserProfile>();
      all.forEach(u => {
        if (!u.email) return;
        const existing = byEmail.get(u.email);
        const rawData = data[u.uid] as any;
        const isCanonical = rawData?.uid === u.uid;
        if (!existing || isCanonical) byEmail.set(u.email, u);
      });

      setUsers(Array.from(byEmail.values()));
    });

    const unsubBans = onValue(bansRef, (snapshot) => {
      const data = snapshot.val();
      setBannedEmails(data ? Object.values(data) : []);
    });

    const bannedUidsRef = ref(db, 'banned_uids');
    const unsubBannedUids = onValue(bannedUidsRef, (snapshot) => {
      const data = snapshot.val();
      setBannedUids(data ? Object.keys(data) : []);
      setLoading(false);
    }, () => setLoading(false)); // permission denied → still stop loading

    return () => {
      unsubRequests();
      unsubTeams();
      unsubUsers();
      unsubBans();
      unsubBannedUids();
    };
  }, []);

  useEffect(() => {
    if (!teamId) return;
    const unsub = onValue(ref(db, `teams/${teamId}/secret/items`), snap => {
      const val = snap.val();
      const items: SecretItem[] = val ? Object.values(val).filter(Boolean) as SecretItem[] : [];
      items.sort((a, b) => (a.depersAt - Date.now()) - (b.depersAt - Date.now()));
      setSecretItems(items);
    });
    return () => unsub();
  }, [teamId]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const addSecretItem = async () => {
    if (!teamId || !newDepersName.trim()) return;
    const ms = (newDopersDays * 86400 + newDepersHours * 3600 + newDopersMins * 60) * 1000;
    if (ms <= 0) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await set(ref(db, `teams/${teamId}/secret/items/${id}`), {
      id, name: newDepersName.trim(), depersAt: Date.now() + ms,
      addedAt: Date.now(), totalDuration: ms, notifiedDeperss: false
    });
    setNewDepersName(''); setNewDopersDays(0); setNewDepersHours(0); setNewDopersMins(0);
    setShowAddDepers(false);
  };

  const deleteSecretItem = async (id: string) => {
    if (!teamId) return;
    if (await appConfirm('Stergi acest item?', { title: 'Stergere', variant: 'danger' }))
      await remove(ref(db, `teams/${teamId}/secret/items/${id}`));
  };

  const formatDepersTimer = (ms: number) => {
    if (ms <= 0) return 'DEPERSONALIZAT';
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? `${d}z ${h}h ${m}m` : `${h}h ${m}m`;
  };

  const addLog = useCallback((msg: string, type: string) => {
    setLogs(prev => {
      const entry = { id: ++logIdRef.current, msg, type, ts: Date.now() };
      return [entry, ...prev].slice(0, 200);
    });
  }, []);

  // Listen for background events from Firebase and populate logs
  useEffect(() => {
    // Worker scrape events (web scraper writes here)
    const scrapeRef = ref(db, 'meta/autoScrape');
    let prevScrape: any = null;
    const unsubScrape = onValue(scrapeRef, (snap) => {
      const val = snap.val();
      if (!val || val === prevScrape) return;
      prevScrape = val;
      if (val.status === 'started') addLog('Worker: scrape ' + (val.type || '').toUpperCase() + ' pornit', 'worker');
      else if (val.status === 'done') addLog('Worker: scrape ' + (val.type || '').toUpperCase() + ' finalizat' + (val.transfers != null ? ' · ' + val.transfers + ' transferuri' : ''), 'worker');
    });

    // New detection results pushed by web
    const detectRef = ref(db, 'meta/detectResults');
    let prevDetect: any = null;
    const unsubDetect = onValue(detectRef, (snap) => {
      const raw = snap.val();
      if (!raw || raw === prevDetect) return;
      prevDetect = raw;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && parsed.detectedAt) {
          addLog('Detectie noua: ' + (parsed.transfers?.length ?? 0) + ' transferuri · ' + (parsed.date || ''), 'detect');
        }
      } catch { /* ignore */ }
    });

    // New transfer data loaded (transfers.json synced to Firebase)
    const tfRef = ref(db, 'transfers');
    let prevTfUpdated: any = null;
    const unsubTf = onValue(tfRef, (snap) => {
      const val = snap.val();
      if (!val) return;
      if (val.lastUpdated && val.lastUpdated !== prevTfUpdated) {
        if (prevTfUpdated !== null) {
          addLog('Date noi incarcate: ' + val.lastUpdated + ' · ' + (val.transfers?.length ?? 0) + ' transferuri', 'data');
        }
        prevTfUpdated = val.lastUpdated;
      }
    });

    return () => { unsubScrape(); unsubDetect(); unsubTf(); };
  }, [addLog]);

  const handleApprove = async (request: TeamRequest) => {
    try {
      await set(ref(db, `teams/${request.id}`), {
        name: request.name,
        leader: request.requestedBy,
        createdAt: Date.now(),
        status: 'active'
      });
      await update(ref(db, `users/${request.requestedBy}`), {
        teamId: request.id,
        role: 'Leader'
      });
      await remove(ref(db, `team_requests/${request.id}`));
    } catch (err) {
      console.error("Approval failed:", err);
    }
  };

  const handleReject = async (requestId: string) => {
    await remove(ref(db, `team_requests/${requestId}`));
  };

  const handleBanEmail = async () => {
    if (!newBanEmail.includes('@')) return;
    const emailKey = newBanEmail.replace(/\./g, '_');
    await set(ref(db, `banned_emails/${emailKey}`), newBanEmail);
    setNewBanEmail('');
  };

  const handleUnbanEmail = async (email: string) => {
    const emailKey = email.replace(/\./g, '_');
    await remove(ref(db, `banned_emails/${emailKey}`));
  };

  const handleTogglePermission = async (uid: string, permission: keyof AdminPermissions, currentValue: boolean) => {
    try {
      await update(ref(db, `users/${uid}/permissions`), { [permission]: !currentValue });
    } catch (err) {
      console.error('[Admin] togglePermission FAILED:', err);
      alert('Eroare: ' + (err as Error).message);
    }
  };

  const handleToggleTabPermission = async (teamId: string, uid: string, permKey: keyof TabPermissions) => {
    try {
      const team = teams.find(t => t.id === teamId);
      const currentValue = !!(team?.members?.[uid]?.permissions?.[permKey]);
      await update(ref(db, `teams/${teamId}/members/${uid}/permissions`), { [permKey]: !currentValue });
    } catch (err) {
      console.error('[Admin] toggleTabPermission FAILED:', err);
    }
  };

  const handleToggleUserBan = async (uid: string, isCurrentlyBanned: boolean) => {
    if (isCurrentlyBanned) {
      await remove(ref(db, `banned_uids/${uid}`));
    } else {
      await set(ref(db, `banned_uids/${uid}`), true);
    }
  };

  const handleDisbandTeamGlobal = async (teamId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Desființare Echipă',
      message: 'ATENȚIE! Această acțiune va șterge definitiv echipa și va deconecta TOȚI membrii. Sigur?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const teamSnap = await get(ref(db, `teams/${teamId}`));
          const teamData = teamSnap.val();
          if (!teamData) return;

          const members = teamData.members || {};
          const updates: any = {};

          Object.keys(members).forEach(uid => {
            updates[`users/${uid}/teamId`] = null;
            updates[`users/${uid}/role`] = null;
          });

          const leaderId = teamData.leader || teamData.metadata?.ownerId;
          if (leaderId) {
            updates[`users/${leaderId}/teamId`] = null;
            updates[`users/${leaderId}/role`] = null;
          }

          updates[`teams/${teamId}`] = null;
          await update(ref(db), updates);
        } catch (err) {
          console.error("Disband failed:", err);
        }
      }
    });
  };

  const handleRemoveUserFromTeam = async (uid: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Eliminare din Echipă',
      message: 'Sigur vrei să elimini acest utilizator din echipă?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const userSnap = await get(ref(db, `users/${uid}`));
          const userData = userSnap.val();
          if (!userData || !userData.teamId) return;

          const updates: any = {};
          updates[`teams/${userData.teamId}/members/${uid}`] = null;
          updates[`users/${uid}/teamId`] = null;
          updates[`users/${uid}/role`] = 'member';

          await update(ref(db), updates);
        } catch (err) {
          console.error("Remove from team failed:", err);
        }
      }
    });
  };

  const handleToggleRole = async (teamId: string, uid: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await update(ref(db), {
        [`teams/${teamId}/members/${uid}/role`]: newRole,
        [`users/${uid}/role`]: newRole
      });
    } catch (err) {
      console.error("Toggle role failed:", err);
    }
  };

  const handleDeleteUserGlobal = async (uid: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Ștergere Definitivă Cont',
      message: 'ATENȚIE! Această acțiune va șterge definitiv DATELE și PROFILUL acestui utilizator. Nu poți anula această acțiune. Ești absolut sigur?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const userSnap = await get(ref(db, `users/${uid}`));
          const userData = userSnap.val();
          const updates: any = {};
          if (userData?.teamId) updates[`teams/${userData.teamId}/members/${uid}`] = null;
          updates[`users/${uid}`] = null;
          updates[`presence/${uid}`] = null;
          // Ban email so active sessions get kicked out immediately
          if (userData?.email) {
            const emailKey = userData.email.replace(/\./g, '_');
            updates[`banned_emails/${emailKey}`] = userData.email;
          }
          await update(ref(db), updates);
        } catch (err) {
          console.error("Delete user failed:", err);
        }
      }
    });
  };

  return (
    <div className="space-y-8 animate-in">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight font-display">Super-Admin Control</h2>
          <p className="text-slate-400 text-sm mt-1">Sistem centralizat de administrare.</p>
        </div>

        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
          {[
            { id: 'requests', label: 'Cereri', icon: Clock },
            { id: 'teams', label: 'Echipe', icon: Users },
            { id: 'users', label: 'Useri', icon: UserPlus },
            { id: 'bans', label: 'Bans', icon: ShieldCheck },
            { id: 'logs', label: 'Logs', icon: ScrollText },
            { id: 'depers', label: 'Depersonalizare', icon: Lock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all",
                activeTab === tab.id ? "bg-accent-gold text-bg-primary shadow-lg shadow-accent-gold/10" : "text-slate-500 hover:text-white"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-8 h-8 border-2 border-accent-gold border-t-transparent rounded-full animate-spin" /></div>
        ) : activeTab === 'requests' ? (
          <>
            {requests.length === 0 ? (
              <div className="card py-16 text-center">
                 <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                 <p className="text-sm text-slate-500">Nicio cerere în așteptare.</p>
              </div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="card flex items-center justify-between group hover:border-accent-gold/20 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="p-3 rounded-2xl bg-accent-gold/10 border border-accent-gold/20">
                      <Users className="w-6 h-6 text-accent-gold" />
                    </div>
                    <div>
                       <div className="flex items-center gap-3">
                          <h3 className="font-bold text-slate-100">{req.name}</h3>
                          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-500 uppercase tracking-widest">{req.id}</span>
                       </div>
                       <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {req.userEmail}</span>
                          <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {new Date(req.timestamp).toLocaleDateString()}</span>
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleReject(req.id)}
                      className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                      title="Reject"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleApprove(req)}
                      className="px-6 py-3 rounded-xl bg-accent-gold text-bg-primary font-black text-[11px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-accent-gold/10"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprobă Echipa
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        ) : activeTab === 'teams' ? (
          <div className="space-y-6">
            {teams.filter(t => t && t.id).map(team => (
              <div key={team.id} className="bg-slate-900/40 border border-white/5 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">{team.metadata?.name || team.name || 'Echipă fără nume'}</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">ID: {team.id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDisbandTeamGlobal(team.id)}
                      className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 rounded-xl transition-all"
                      title="Desființează Echipa (Global)"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/20">
                      ACTIVĂ
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(() => {
                    const ownerId = team.metadata?.ownerId || team.leader || null;
                    const memberUids = new Set<string>();
                    if (team.leader) memberUids.add(team.leader);
                    if (ownerId) memberUids.add(ownerId);
                    if (team.members) {
                      Object.keys(team.members).forEach(uid => memberUids.add(uid));
                    }
                    users.forEach(u => {
                      if (u?.uid && (u.teamId === team.id || u.currentTeamId === team.id)) memberUids.add(u.uid);
                    });

                    return [...memberUids].map(uid => {
                      const user = users.find(u => u.uid === uid);
                      const displayName = user?.name || user?.email || uid.slice(0, 8);
                      const initial = displayName[0].toUpperCase();
                      const memberData: MemberData = team.members?.[uid] || {};
                      const isLeader = uid === ownerId || memberData.role === 'leader';
                      const isAdmin = !isLeader && memberData.role === 'admin';
                      const tabPerms = memberData.permissions || {};

                      return (
                        <div key={uid} className="bg-slate-800/30 border border-white/5 rounded-xl p-4 group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white relative"
                                style={user?.color ? { backgroundColor: user.color + '33', color: user.color } : undefined}
                              >
                                {initial}
                                {(team as any).presence?.[uid] && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-200">{displayName}</p>
                                {user?.name && user?.email && <p className="text-[9px] text-slate-600">{user.email}</p>}
                                <p className="text-[9px] uppercase font-black">
                                  {isLeader ? (
                                    <span className="text-accent-gold">Lider</span>
                                  ) : isAdmin ? (
                                    <span className="text-blue-400">Admin</span>
                                  ) : (
                                    <span className="text-slate-500">Membru</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isLeader && (
                                <button
                                  onClick={() => handleToggleRole(team.id, uid, memberData.role || 'member')}
                                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                  title={isAdmin ? 'Revocă Admin' : 'Fă Admin'}
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveUserFromTeam(uid)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                title="Elimină din echipă"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-white/5">
                            {isLeader ? (
                              <p className="text-[8px] uppercase font-black tracking-widest text-slate-700">Acces complet (Lider)</p>
                            ) : (
                              <>
                                <p className="text-[8px] uppercase font-black tracking-widest text-slate-600 mb-2">Taburi</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {TAB_PERMISSIONS.map(perm => {
                                    const active = !!tabPerms[perm.key];
                                    return (
                                      <button
                                        key={perm.key}
                                        onClick={() => handleToggleTabPermission(team.id, uid, perm.key)}
                                        className={cn(
                                          'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all',
                                          active
                                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                            : 'bg-white/[0.03] border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20'
                                        )}
                                      >
                                        {perm.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'users' ? (
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
              <div className="p-2 bg-white/5 rounded-lg text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Caută după email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent border-none outline-none text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.filter(u => u && u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())).map(user => {
                const isUserBanned = bannedUids.includes(user.uid);
                const isProtected = !!user.isSuperAdmin || user.email === 'postavarudaniel@gmail.com';
                const hasAnyPermission = Object.values(user.permissions || {}).some(Boolean);

                const userTeamId = user.teamId || user.currentTeamId;
                const userTeam = userTeamId ? teams.find(t => t.id === userTeamId) : null;
                const userMemberData: MemberData = userTeam?.members?.[user.uid] || {};
                const ownerId = userTeam?.metadata?.ownerId || userTeam?.leader;
                const isTeamLeader = !!(userTeam && (user.uid === ownerId || userMemberData.role === 'leader'));
                const tabPerms = userMemberData.permissions || {};

                return (
                  <div key={user.uid} className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-4 hover:border-accent-gold/20 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0",
                          isProtected ? "bg-accent-gold text-bg-primary shadow-[0_0_15px_rgba(200,150,46,0.2)]" :
                          hasAnyPermission ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                          "bg-white/5 text-slate-400"
                        )}>
                          {(user.name || user.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate" title={user.name || user.email}>
                            {user.name || user.email}
                          </p>
                          {user.name && (
                            <p className="text-[9px] text-slate-600 truncate" title={user.email}>{user.email}</p>
                          )}
                          <p className="text-[9px] uppercase font-black">
                            {isProtected ? (
                              <span className="text-accent-gold">Super-Admin</span>
                            ) : hasAnyPermission ? (
                              <span className="text-blue-400">Admin</span>
                            ) : (
                              <span className="text-slate-500">{user.role || 'Utilizator'}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {isUserBanned && (
                        <div className="p-1.5 bg-red-500/10 text-red-500 rounded-lg" title="BANNED">
                          <Ban className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {!isProtected && (
                      <div className="space-y-2">
                        <p className="text-[8px] uppercase font-black tracking-widest text-slate-600">Acces</p>
                        <div className="flex flex-wrap gap-2">
                          {ADMIN_PERMISSIONS.map(perm => {
                            const active = !!user.permissions?.[perm.key];
                            return (
                              <button
                                key={perm.key}
                                onClick={() => handleTogglePermission(user.uid, perm.key, active)}
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all',
                                  active
                                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                    : 'bg-white/[0.03] border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20'
                                )}
                              >
                                {perm.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {userTeam && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[8px] uppercase font-black tracking-widest text-slate-600">Echipă</p>
                          {isTeamLeader && (
                            <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest bg-accent-gold/10 border border-accent-gold/20 text-accent-gold">Lider</span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-500 truncate">{userTeam.metadata?.name || userTeam.name || userTeamId}</p>
                        {!isTeamLeader && (
                          <div className="space-y-1.5">
                            <p className="text-[8px] uppercase font-black tracking-widest text-slate-600">Taburi echipă</p>
                            <div className="flex flex-wrap gap-1.5">
                              {TAB_PERMISSIONS.map(perm => {
                                const active = !!tabPerms[perm.key];
                                return (
                                  <button
                                    key={perm.key}
                                    onClick={() => handleToggleTabPermission(userTeamId!, user.uid, perm.key)}
                                    className={cn(
                                      'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border transition-all',
                                      active
                                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                        : 'bg-white/[0.03] border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20'
                                    )}
                                  >
                                    {perm.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                      <div className="flex-1" />
                      {!isProtected && (
                        <button
                          onClick={() => handleToggleUserBan(user.uid, isUserBanned)}
                          className={cn(
                            "px-3 py-2 rounded-lg transition-all border",
                            isUserBanned ? "bg-red-500 border-red-600 text-white" : "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white"
                          )}
                          title={isUserBanned ? 'Unban' : 'Ban'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                      {!isProtected && (
                        <button
                          onClick={() => handleDeleteUserGlobal(user.uid)}
                          disabled={isProtected}
                          className={cn(
                            "px-3 py-2 rounded-lg transition-all border border-red-500/20",
                            "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
                          )}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {isProtected && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Protejat</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'bans' ? (
          <div className="space-y-6">
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4">Adaugă Ban Nou</h3>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={newBanEmail}
                    onChange={e => { setNewBanEmail(e.target.value); setShowBanSuggestions(true); }}
                    onFocus={() => setShowBanSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowBanSuggestions(false), 150)}
                    placeholder="Email sau nume utilizator..."
                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/40"
                  />
                  {showBanSuggestions && newBanEmail.length > 0 && (() => {
                    const suggestions = users.filter(u =>
                      u.email &&
                      !u.isSuperAdmin &&
                      !bannedEmails.includes(u.email) &&
                      u.email.toLowerCase().includes(newBanEmail.toLowerCase())
                    ).slice(0, 6);
                    return suggestions.length > 0 ? (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-[#0c0c0e] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl">
                        {suggestions.map(u => (
                          <button
                            key={u.uid}
                            onMouseDown={() => { setNewBanEmail(u.email!); setShowBanSuggestions(false); }}
                            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5 transition-colors flex items-center gap-3"
                          >
                            <span className="w-6 h-6 rounded-lg bg-white/5 text-[10px] font-black text-slate-500 flex items-center justify-center shrink-0">
                              {u.email![0].toUpperCase()}
                            </span>
                            {u.email}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <button
                  onClick={handleBanEmail}
                  className="px-6 py-3 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/10 shrink-0"
                >
                  Banează
                </button>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 bg-white/5">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Utilizatori Banați</h3>
              </div>
              <div className="divide-y divide-white/5">
                {bannedEmails.length === 0 ? (
                  <p className="p-8 text-center text-slate-500 text-sm italic">Niciun utilizator banat.</p>
                ) : (
                  bannedEmails.map(email => (
                    <div key={email} className="px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <span className="text-sm text-slate-300 font-medium">{email}</span>
                      <button
                        onClick={() => handleUnbanEmail(email)}
                        className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                      >
                        Elimină Ban
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'logs' ? (
          <div className="space-y-4">
            {/* Activity log */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Activitate Fundal</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{logs.length} intrari</span>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-red-400 transition-colors"
                  >
                    Goleste
                  </button>
                </div>
              </div>
              <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto font-mono">
                {logs.length === 0 ? (
                  <p className="p-8 text-center text-slate-600 text-sm">Niciun eveniment inca. Logurile apar in timp real.</p>
                ) : (
                  logs.map(log => {
                    const color =
                      log.type === 'scrape' ? 'text-blue-400' :
                      log.type === 'worker' ? 'text-amber-400' :
                      log.type === 'detect' ? 'text-violet-400' :
                      log.type === 'data'   ? 'text-emerald-400' :
                      log.type === 'error'  ? 'text-red-400' :
                      'text-slate-400';
                    const time = new Date(log.ts).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <div key={log.id} className="px-5 py-2.5 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                        <span className="text-[9px] text-slate-600 shrink-0 mt-0.5 tabular-nums">{time}</span>
                        <span className={`text-[11px] leading-relaxed ${color}`}>{log.msg}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'depers' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Items in depersonalizare</p>
              <button
                onClick={() => setShowAddDepers(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-gold/10 border border-accent-gold/20 rounded-lg text-[10px] font-black text-accent-gold hover:bg-accent-gold/20 transition-all"
              >
                <Plus className="w-3 h-3" /> Adauga
              </button>
            </div>

            {showAddDepers && (
              <div className="bg-slate-900/60 border border-white/10 rounded-xl p-4 space-y-3">
                <input
                  type="text" placeholder="Numele itemului..."
                  value={newDepersName} onChange={e => setNewDepersName(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent-gold/40"
                />
                <div className="flex gap-2">
                  {[
                    { label: 'Zile', val: newDopersDays, set: setNewDopersDays },
                    { label: 'Ore', val: newDepersHours, set: setNewDepersHours },
                    { label: 'Minute', val: newDopersMins, set: setNewDopersMins },
                  ].map(f => (
                    <div key={f.label} className="flex-1">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">{f.label}</p>
                      <input type="number" min={0} value={f.val} onChange={e => f.set(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-slate-200 text-center focus:outline-none focus:border-accent-gold/40" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddDepers(false)} className="px-3 py-1.5 text-[10px] font-black text-slate-500 hover:text-slate-300 transition-colors">Anuleaza</button>
                  <button onClick={addSecretItem} className="px-4 py-1.5 bg-accent-gold text-bg-primary rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-accent-gold/80 transition-all">Adauga</button>
                </div>
              </div>
            )}

            {secretItems.length === 0 ? (
              <div className="card py-16 text-center">
                <Lock className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Niciun item in depersonalizare.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {secretItems.map(item => {
                  const ms = item.depersAt - nowMs;
                  const isDone = ms <= 0;
                  const pct = isDone ? 0 : Math.max(0, Math.min(100, (ms / (item.totalDuration || 1)) * 100));
                  return (
                    <div key={item.id} className={cn('card p-4 flex items-center gap-4', isDone && 'border-emerald-500/20 bg-emerald-500/[0.03]')}>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-200 text-sm">{item.name}</p>
                        <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', isDone ? 'bg-emerald-500' : 'bg-accent-gold')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className={cn('text-sm font-black tabular-nums shrink-0', isDone ? 'text-emerald-400' : ms < 3600000 ? 'text-red-400' : 'text-slate-300')}>
                        {formatDepersTimer(ms)}
                      </div>
                      <button onClick={() => deleteSecretItem(item.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        variant={confirmState.variant}
      />
    </div>
  );
}
