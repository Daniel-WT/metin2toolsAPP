window.AdminModule = {
    state: {
        users: {},
        teams: {},
        requests: {},
        userRequests: {},
        banned: {},
        activeTab: 'users',
        logs: []
    },
    _MAX_LOGS: 200,
    _initialized: false,

    init: function() {
        try {
            console.log("[AdminModule] Initializing...");
            if (typeof firebase === 'undefined') {
                console.error("[AdminModule] Firebase is not loaded!");
                return;
            }
            this.setupListeners();
            this.renderUsers();
            console.log("[AdminModule] Initialized successfully.");
        } catch (e) {
            console.error("[AdminModule] Initialization failed:", e);
        }
    },

    setupListeners: function() {
        const database = firebase.database();
        
        // Users listener
        database.ref('users').on('value', snap => {
            this.state.users = snap.val() || {};
            if (this.state.activeTab === 'users') this.renderUsers();
            this.renderTeams(); // Also re-render teams to update member lists
        });

        // Teams listener
        database.ref('teams').on('value', snap => {
            this.state.teams = snap.val() || {};
            if (this.state.activeTab === 'teams') this.renderTeams();
            if (this.state.activeTab === 'users') this.renderUsers();
        });

        // Team Requests listener
        database.ref('team_requests').on('value', snap => {
            this.state.requests = snap.val() || {};
            if (this.state.activeTab === 'requests') this.renderRequests();
        });

        // User Account Requests listener
        database.ref('user_requests').on('value', snap => {
            this.state.userRequests = snap.val() || {};
            if (this.state.activeTab === 'requests') this.renderRequests();
        });

        // Banned Emails listener
        database.ref('banned_emails').on('value', snap => {
            this.state.banned = snap.val() || {};
            if (this.state.activeTab === 'users') this.renderUsers();
        });

        // Logs: listen for auto-scrape events from GitHub Actions
        database.ref('meta/autoScrape').on('value', snap => {
            const v = snap.val();
            if (!v || !v.status) return;
            const type = (v.type || '').toUpperCase();
            if (v.status === 'done') {
                let msg = `GitHub Actions: scrape ${type} finalizat`;
                if (v.transfers != null) msg += ` · ${v.transfers} transferuri detectate`;
                if (v.savedAt) msg += ` · ${new Date(v.savedAt).toLocaleTimeString('ro-RO')}`;
                this.addLog(msg, 'worker');
            } else if (v.status === 'started') {
                this.addLog(`GitHub Actions: scrape ${type} pornit`, 'worker');
            }
        });
    },

    switchTab: function(tabId, btn) {
        this.state.activeTab = tabId;
        
        // UI toggle
        document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');
        const view = document.getElementById(`admin-view-${tabId}`);
        if (view) view.style.display = 'block';

        // Button toggle
        if (btn) {
            btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        // Render content
        if (tabId === 'users') this.renderUsers();
        if (tabId === 'teams') this.renderTeams();
        if (tabId === 'requests') this.renderRequests();
        if (tabId === 'logs') this.renderLogs();
    },

    // --- Rendering ---

    renderUsers: function() {
        const grid = document.getElementById('adminUserGrid');
        if (!grid) return;

        const searchTerm = document.getElementById('adminUserSearch')?.value.toLowerCase() || '';
        const users = Object.entries(this.state.users).filter(([uid, u]) => {
            const name = (u.name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(searchTerm) || email.includes(searchTerm) || uid.toLowerCase().includes(searchTerm);
        });

        if (users.length === 0) {
            grid.innerHTML = `<div class="admin-empty-state"><p>Niciun utilizator găsit.</p></div>`;
            return;
        }

        grid.innerHTML = users.map(([uid, u]) => {
            if (!u) return '';
            const isBanned = this.isEmailBanned(u.email);
            const isSuperAdmin = u.isSuperAdmin || u.email === 'postavarudaniel@gmail.com';
            const isSelf = u.uid === window.currentUserProfile?.uid || u.email === window.currentUserProfile?.email;
            const hasServerStatus = !!(u.permissions && u.permissions.serverStatus);
            const hasAdminPanel  = !!(u.permissions && u.permissions.adminPanel);
            const hasAnyPerm = hasServerStatus || hasAdminPanel;

            // Team role lookup — validate against teams node, fallback to searching all teams
            const rawTeamId = u.currentTeamId || u.teamId;
            let teamId = (rawTeamId && this.state.teams[rawTeamId]) ? rawTeamId : null;
            if (!teamId) {
                for (const [tid, team] of Object.entries(this.state.teams)) {
                    if (team.members && team.members[uid]) { teamId = tid; break; }
                }
            }
            const teamMember = teamId ? this.state.teams[teamId]?.members?.[uid] : null;
            const teamRole = teamMember?.role || null;
            const teamRoleBadge = teamRole === 'leader'
                ? `<span style="font-size:8px;background:rgba(200,150,46,0.12);color:#c8962e;padding:1px 7px;border-radius:5px;font-weight:900;letter-spacing:.05em;">LIDER</span>`
                : '';
            const teamMemberPerms = teamMember?.permissions || {};

            const avatarBg = isSuperAdmin ? '#c8962e' : hasAnyPerm ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)';
            const avatarColor = isSuperAdmin ? '#000' : hasAnyPerm ? '#93c5fd' : '#fff';
            const borderColor = isBanned ? 'rgba(224,82,82,0.25)' : isSuperAdmin ? 'rgba(200,150,46,0.2)' : 'rgba(255,255,255,0.06)';
            const roleLabel = isSuperAdmin ? '<span style="font-size:9px;background:rgba(200,150,46,0.15);color:#c8962e;padding:2px 8px;border-radius:6px;font-weight:900;letter-spacing:.05em;">SUPER-ADMIN</span>'
                            : hasAnyPerm    ? '<span style="font-size:9px;background:rgba(59,130,246,0.15);color:#93c5fd;padding:2px 8px;border-radius:6px;font-weight:900;letter-spacing:.05em;">ADMIN</span>'
                            : '';

            const canManage = !!window.currentUserProfile?.isSuperAdmin;

            const permRow = !isSuperAdmin ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
                    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,0.2);align-self:center;">Acces:</span>
                    <span onclick="AdminModule.togglePermission('${uid}','serverStatus')" style="${canManage ? 'cursor:pointer;' : ''}font-size:9px;padding:3px 10px;border-radius:6px;font-weight:900;letter-spacing:.04em;border:1px solid ${hasServerStatus ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'};background:${hasServerStatus ? 'rgba(52,211,153,0.08)' : 'transparent'};color:${hasServerStatus ? '#34d399' : 'rgba(255,255,255,0.2)'};" title="${canManage ? 'Click pentru a togglui' : ''}">Server Status</span>
                    <span onclick="AdminModule.togglePermission('${uid}','adminPanel')" style="${canManage ? 'cursor:pointer;' : ''}font-size:9px;padding:3px 10px;border-radius:6px;font-weight:900;letter-spacing:.04em;border:1px solid ${hasAdminPanel ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'};background:${hasAdminPanel ? 'rgba(52,211,153,0.08)' : 'transparent'};color:${hasAdminPanel ? '#34d399' : 'rgba(255,255,255,0.2)'};" title="${canManage ? 'Click pentru a togglui' : ''}">Admin Panel</span>
                </div>` : '';

            const tabPermRow = !isSuperAdmin && teamId && canManage ? `
                <div style="margin-top:12px;">
                    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,0.2);">Taburi echipă:</span>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
                        ${[{k:'spawn',l:'Spawn'},{k:'skin',l:'Costume'},{k:'inventory',l:'Inventar'},{k:'alerte',l:'Alarme'},{k:'status',l:'Servere'},{k:'transfers',l:'Transferuri'},{k:'checklist',l:'Checklist'}].map(p => {
                            const on = !!(teamMemberPerms[p.k]);
                            return `<span onclick="AdminModule.toggleTabPermission('${uid}','${p.k}')" style="cursor:pointer;font-size:9px;padding:2px 8px;border-radius:5px;font-weight:900;letter-spacing:.03em;border:1px solid ${on ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'};background:${on ? 'rgba(52,211,153,0.08)' : 'transparent'};color:${on ? '#34d399' : 'rgba(255,255,255,0.2)'};" title="Toggle ${p.l}">${p.l}</span>`;
                        }).join('')}
                    </div>
                </div>` : '';

            const banBtn = isSelf ? `<span></span>`
                : !isBanned
                ? `<button onclick="AdminModule.banUser('${u.email}')" style="background:rgba(224,82,82,0.08);color:#e05252;border:1px solid rgba(224,82,82,0.2);padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.03em;">Ban</button>`
                : `<button onclick="AdminModule.unbanUser('${u.email}')" style="background:rgba(16,185,129,0.08);color:#10b981;border:1px solid rgba(16,185,129,0.2);padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">Unban</button>`;

            const deleteBtn = window.currentUserProfile?.isSuperAdmin && !isSelf
                ? `<button onclick="AdminModule.deleteAccount('${uid}')" style="grid-column:span 2;background:rgba(224,82,82,0.12);color:#e05252;border:1px solid rgba(224,82,82,0.25);padding:10px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;margin-top:4px;">Delete Account</button>`
                : '';

            const actionButtons = isSuperAdmin
                ? `<p style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.15);margin:0;text-align:center;padding:10px 0 2px;">Protejat</p>`
                : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px;">
                    ${banBtn}
                    <span></span>
                    ${deleteBtn}
                   </div>`;

            return `
                <div style="padding:22px;background:rgba(255,255,255,0.02);border:1px solid ${borderColor};border-radius:18px;transition:border-color .2s;">
                    <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
                        <div style="width:46px;height:46px;border-radius:12px;background:${avatarBg};display:flex;align-items:center;justify-content:center;color:${avatarColor};font-weight:900;font-size:16px;flex-shrink:0;">
                            ${u.email ? u.email[0].toUpperCase() : '?'}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <h4 style="margin:0;color:#fff;font-size:14px;font-weight:700;">${u.name || u.email?.split('@')[0] || 'Unknown'}</h4>
                                ${roleLabel}${teamRoleBadge}
                            </div>
                            <p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,0.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${u.email || ''}">${u.email || 'No email'}</p>
                            ${teamId ? `<p style="margin:3px 0 0;font-size:10px;color:rgba(200,150,46,0.7);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${teamId}</p>` : ''}
                        </div>
                    </div>
                    ${permRow}
                    ${tabPermRow}
                    ${actionButtons}
                </div>
            `;
        }).join('');
    },

    renderTeams: function() {
        const grid = document.getElementById('adminTeamGrid');
        if (!grid) return;

        const searchTerm = document.getElementById('adminTeamSearch')?.value.toLowerCase() || '';
        const teams = Object.entries(this.state.teams).filter(([id, t]) => {
            const name = (t.metadata?.name || t.name || '').toLowerCase();
            return name.includes(searchTerm) || id.toLowerCase().includes(searchTerm);
        });

        if (teams.length === 0) {
            grid.innerHTML = `<div class="admin-empty-state"><p>Nicio echipă găsită.</p></div>`;
            return;
        }

        const TAB_PERMS = [{k:'spawn',l:'Spawn'},{k:'skin',l:'Costume'},{k:'inventory',l:'Inventar'},{k:'alerte',l:'Alarme'},{k:'status',l:'Servere'},{k:'transfers',l:'Transferuri'},{k:'checklist',l:'Checklist'}];
        const canManage = !!window.currentUserProfile?.isSuperAdmin;

        grid.innerHTML = teams.map(([id, t]) => {
            const name = t.metadata?.name || t.name || 'Unnamed Team';
            const ownerId = t.metadata?.ownerId || t.ownerId || t.leader || null;
            const teamMembersData = t.members || {};
            const memberUids = Object.keys(teamMembersData);

            const membersHtml = memberUids.map(mUid => {
                const tm = teamMembersData[mUid];
                // isLeader: match by role field, by key==ownerId, or by uid field==ownerId
                const isLeader = tm?.role === 'leader' || mUid === ownerId || (tm?.uid && tm.uid === ownerId);
                const mRole = isLeader ? 'leader' : (tm?.role || 'member');
                const displayName = tm?.name || tm?.email?.split('@')[0] || this.state.users[mUid]?.name || this.state.users[mUid]?.email?.split('@')[0] || mUid.slice(0,8);

                const avatarBg = isLeader ? 'rgba(200,150,46,0.15)' : mRole === 'admin' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)';
                const rolePill = isLeader
                    ? `<span style="font-size:8px;background:rgba(200,150,46,0.15);color:#c8962e;padding:1px 6px;border-radius:4px;font-weight:900;letter-spacing:.04em;">LIDER</span>`
                    : mRole === 'admin'
                    ? `<span style="font-size:8px;background:rgba(59,130,246,0.15);color:#93c5fd;padding:1px 6px;border-radius:4px;font-weight:900;letter-spacing:.04em;">ADMIN</span>`
                    : `<span style="font-size:8px;color:rgba(255,255,255,0.2);font-weight:700;">Membru</span>`;

                const permPills = isLeader
                    ? `<div style="padding:6px 0 2px 30px;font-size:9px;color:rgba(255,255,255,0.2);font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Acces complet</div>`
                    : `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px;padding-left:30px;">
                        ${TAB_PERMS.map(p => {
                            const on = !!(tm?.permissions?.[p.k]);
                            return `<span onclick="AdminModule.toggleTeamTabPerm('${id}','${mUid}','${p.k}')" style="cursor:pointer;font-size:9px;padding:2px 8px;border-radius:5px;font-weight:800;letter-spacing:.03em;border:1px solid ${on ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.12)'};background:${on ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)'};color:${on ? '#34d399' : 'rgba(255,255,255,0.35)'};" title="${on ? 'Activ' : 'Inactiv'}">${p.l}</span>`;
                        }).join('')}
                    </div>`;

                return `
                <div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div style="width:22px;height:22px;border-radius:6px;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;flex-shrink:0;">${displayName[0]?.toUpperCase() || '?'}</div>
                            <span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:600;">${displayName}</span>
                            ${rolePill}
                        </div>
                        <button onclick="AdminModule.removeMember('${mUid}')" style="background:none;border:none;color:rgba(224,82,82,0.35);cursor:pointer;padding:4px;" title="Elimină din echipă">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                    ${permPills}
                </div>`;
            }).join('');

            return `
                <div style="padding:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:18px;">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">
                        <div>
                            <h4 style="margin:0;color:#fff;font-size:15px;">${name}</h4>
                            <p style="margin:3px 0 0;font-size:10px;color:rgba(255,255,255,0.2);text-transform:uppercase;font-weight:900;letter-spacing:.06em;">ID: ${id}</p>
                        </div>
                        <button onclick="AdminModule.disbandTeam('${id}')" style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);color:#e05252;padding:6px 12px;border-radius:8px;font-size:10px;font-weight:900;cursor:pointer;letter-spacing:.04em;">DISBAND</button>
                    </div>
                    <p style="font-size:9px;color:rgba(255,255,255,0.2);text-transform:uppercase;font-weight:900;letter-spacing:.06em;margin-bottom:8px;">Membri (${memberUids.length})</p>
                    ${membersHtml}
                </div>
            `;
        }).join('');
    },

    renderRequests: function() {
        const grid = document.getElementById('adminRequestGrid');
        if (!grid) return;

        const userReqs = Object.entries(this.state.userRequests);
        const teamReqs = Object.entries(this.state.requests);

        const cardStyle = `padding:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;`;
        const btnReject = (fn, id) => `<button onclick="${fn}('${id}')" style="background:rgba(224,82,82,0.1);color:#e05252;border:1px solid rgba(224,82,82,0.2);padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:12px;white-space:nowrap;">Reject</button>`;
        const btnApprove = (fn, id) => `<button onclick="${fn}('${id}')" style="background:#c8962e;color:#0a0b0e;border:none;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;">Approve</button>`;

        const userCards = userReqs.map(([uid, req]) => `
            <div class="card" style="${cardStyle}">
                <div style="display:flex;align-items:center;gap:16px;min-width:0;">
                    <div style="width:48px;height:48px;flex-shrink:0;border-radius:12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;color:#3b82f6;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <h4 style="margin:0;color:#fff;">${req.email || uid}</h4>
                            <span style="font-size:9px;color:rgba(59,130,246,0.6);font-weight:900;text-transform:uppercase;background:rgba(59,130,246,0.1);padding:2px 6px;border-radius:4px;">CONT NOU</span>
                        </div>
                        <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">UID: ${uid.slice(0,12)}...</p>
                    </div>
                </div>
                <div style="display:flex;gap:10px;flex-shrink:0;">${btnReject('AdminModule.rejectUser', uid)}${btnApprove('AdminModule.approveUser', uid)}</div>
            </div>
        `).join('');

        const teamCards = teamReqs.map(([id, req]) => `
            <div class="card" style="${cardStyle}">
                <div style="display:flex;align-items:center;gap:16px;min-width:0;">
                    <div style="width:48px;height:48px;flex-shrink:0;border-radius:12px;background:rgba(200,150,46,0.1);border:1px solid rgba(200,150,46,0.2);display:flex;align-items:center;justify-content:center;color:#c8962e;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    </div>
                    <div style="min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <h4 style="margin:0;color:#fff;">${req.name}</h4>
                            <span style="font-size:9px;color:rgba(255,255,255,0.3);font-weight:900;text-transform:uppercase;">REQ: ${id}</span>
                        </div>
                        <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.4);">Solicitat de: ${req.userEmail}</p>
                    </div>
                </div>
                <div style="display:flex;gap:10px;flex-shrink:0;">${btnReject('AdminModule.rejectTeam', id)}${btnApprove('AdminModule.approveTeam', id)}</div>
            </div>
        `).join('');

        grid.innerHTML = (userCards + teamCards) || `<div class="admin-empty-state"><p>Nicio cerere în așteptare.</p></div>`;
    },

    // --- Actions ---

    _canManage: function() {
        const p = window.currentUserProfile;
        return !!(p && (p.isSuperAdmin || p.permissions?.adminPanel));
    },

    togglePermission: async function(uid, permission) {
        if (!this._canManage()) return;
        const user = this.state.users[uid];
        if (!user) return;
        const currentValue = !!(user.permissions && user.permissions[permission]);
        await firebase.database().ref(`users/${uid}/permissions`).update({ [permission]: !currentValue });
    },

    toggleTabPermission: async function(uid, permKey) {
        if (!this._canManage()) return;
        const user = this.state.users[uid];
        if (!user) return;
        const teamId = user.currentTeamId || user.teamId;
        if (!teamId) return;
        const currentValue = !!(this.state.teams[teamId]?.members?.[uid]?.permissions?.[permKey]);
        await firebase.database().ref(`teams/${teamId}/members/${uid}/permissions/${permKey}`).set(!currentValue);
    },

    toggleTeamTabPerm: async function(teamId, uid, permKey) {
        const p = window.currentUserProfile;
        if (!p || (!p.isSuperAdmin && !p.permissions?.adminPanel)) return;
        const currentValue = !!(this.state.teams[teamId]?.members?.[uid]?.permissions?.[permKey]);
        await firebase.database().ref(`teams/${teamId}/members/${uid}/permissions/${permKey}`).set(!currentValue);
    },

    banUser: async function(email) {
        if (!email) return;
        if (email === window.currentUserProfile?.email) return;
        if (!confirm(`Sigur vrei să banezi utilizatorul ${email}?`)) return;
        
        const key = email.replace(/\./g, '_');
        await firebase.database().ref(`banned_emails/${key}`).set(email);
        if (typeof showToast === 'function') showToast(`Utilizatorul ${email} a fost banat.`, "error");
    },

    unbanUser: async function(email) {
        if (!email) return;
        const key = email.replace(/\./g, '_');
        await firebase.database().ref(`banned_emails/${key}`).remove();
        if (typeof showToast === 'function') showToast(`Ban-ul pentru ${email} a fost eliminat.`, "success");
    },

    promoteToAdmin: async function(uid) {
        if (!confirm("Promovezi acest utilizator la gradul de Administrator?")) return;
        await firebase.database().ref(`users/${uid}`).update({ isAdmin: true });
    },

    demoteFromAdmin: async function(uid) {
        if (!confirm("Revoci drepturile de Administrator pentru acest utilizator?")) return;
        await firebase.database().ref(`users/${uid}`).update({ isAdmin: false });
    },

    deleteAccount: async function(uid) {
        if (!window.currentUserProfile?.isSuperAdmin) return;
        if (!confirm("ATENȚIE! Ești pe cale să ștergi DEFINITIV acest cont (baza de date + autentificare). Această acțiune nu poate fi anulată. Continui?")) return;
        try {
            const res = await fetch('/api/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            const data = await res.json();
            if (data.ok) {
                if (typeof showToast === 'function') showToast("Cont șters complet (baza de date + autentificare).", "success");
            } else {
                await firebase.database().ref(`users/${uid}`).remove();
                if (typeof showToast === 'function') showToast("Date șterse, dar Auth a eșuat: " + (data.error || 'eroare necunoscută'), "warning");
            }
        } catch (e) {
            await firebase.database().ref(`users/${uid}`).remove();
            if (typeof showToast === 'function') showToast("Date șterse din baza de date (Auth indisponibil).", "warning");
        }
    },

    removeMember: async function(uid) {
        if (!confirm("Elimini acest membru din echipă?")) return;
        await firebase.database().ref(`users/${uid}`).update({
            teamId: null,
            currentTeamId: null,
            role: null
        });
    },

    disbandTeam: async function(teamId) {
        if (!confirm(`Ești sigur că vrei să DESFIINȚEZI echipa ${teamId}? Toți membrii vor fi scoși.`)) return;

        // 1. Remove teamId from all members
        const members = Object.entries(this.state.users).filter(([uid, u]) => u.teamId === teamId);
        const updates = {};
        members.forEach(([uid, u]) => {
            updates[`users/${uid}/teamId`] = null;
            updates[`users/${uid}/currentTeamId`] = null;
            updates[`users/${uid}/role`] = null;
        });

        // 2. Delete team node
        updates[`teams/${teamId}`] = null;

        await firebase.database().ref().update(updates);
        if (typeof showToast === 'function') showToast("Echipa a fost desființată.", "error");
    },

    approveTeam: async function(requestId) {
        const req = this.state.requests[requestId];
        if (!req) return;

        try {
            // 1. Create team
            await firebase.database().ref(`teams/${requestId}`).set({
                id: requestId,
                metadata: {
                    name: req.name,
                    inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                    ownerId: req.requestedBy,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                },
                status: 'active'
            });

            // 2. Update leader
            await firebase.database().ref(`users/${req.requestedBy}`).update({
                teamId: requestId,
                currentTeamId: requestId,
                role: 'leader'
            });

            // 3. Remove request
            await firebase.database().ref(`team_requests/${requestId}`).remove();
            if (typeof showToast === 'function') showToast("Echipă aprobată cu succes!", "success");
        } catch (e) {
            console.error(e);
            alert("Eroare la aprobare.");
        }
    },

    approveUser: async function(uid) {
        if (!confirm("Aprobi accesul acestui utilizator?")) return;
        try {
            await firebase.database().ref(`users/${uid}`).update({ status: 'approved' });
            await firebase.database().ref(`user_requests/${uid}`).remove();
            if (typeof showToast === 'function') showToast("Cont aprobat!", "success");
        } catch (e) {
            alert("Eroare la aprobare: " + e.message);
        }
    },

    rejectUser: async function(uid) {
        if (!confirm("Respingi și ștergi acest cont?")) return;
        try {
            const res = await fetch('/api/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            const data = await res.json();
            await firebase.database().ref(`user_requests/${uid}`).remove();
            if (data.ok) {
                if (typeof showToast === 'function') showToast("Cont respins și șters.", "error");
            } else {
                await firebase.database().ref(`users/${uid}`).remove();
                if (typeof showToast === 'function') showToast("Cerere respinsă (Auth: " + (data.error || 'eroare') + ")", "warning");
            }
        } catch (e) {
            await firebase.database().ref(`user_requests/${uid}`).remove();
            await firebase.database().ref(`users/${uid}`).remove();
            if (typeof showToast === 'function') showToast("Cerere respinsă.", "warning");
        }
    },

    rejectTeam: async function(requestId) {
        if (!confirm("Respingi această cerere?")) return;
        await firebase.database().ref(`team_requests/${requestId}`).remove();
    },

    // --- Logs ---

    addLog: function(msg, type) {
        type = type || 'info';
        var now = new Date();
        var time = now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.state.logs.push({ ts: now.getTime(), time: time, type: type, msg: String(msg) });
        if (this.state.logs.length > this._MAX_LOGS) this.state.logs.shift();
        if (this.state.activeTab === 'logs') this.renderLogs();
    },

    clearLogs: function() {
        this.state.logs = [];
        this.renderLogs();
    },

    renderLogs: function() {
        var container = document.getElementById('adminLogsContainer');
        if (!container) return;

        if (this.state.logs.length === 0) {
            container.innerHTML = '<div class="admin-empty-state"><p>Niciun log înregistrat încă. Activitatea din fundal va apărea aici.</p></div>';
            return;
        }

        var typeColor = { scrape: '#c8962e', detect: '#60a5fa', data: '#34d399', worker: '#a78bfa', error: '#f87171', info: 'rgba(255,255,255,0.3)' };
        var typeBg    = { scrape: 'rgba(200,150,46,0.06)', detect: 'rgba(96,165,250,0.06)', data: 'rgba(52,211,153,0.06)', worker: 'rgba(167,139,250,0.06)', error: 'rgba(248,113,113,0.06)', info: 'transparent' };

        var rows = [];
        for (var i = this.state.logs.length - 1; i >= 0; i--) {
            var l = this.state.logs[i];
            var c = typeColor[l.type] || typeColor.info;
            var bg = typeBg[l.type] || typeBg.info;
            rows.push(
                '<div style="display:flex;align-items:flex-start;gap:12px;padding:9px 16px;border-bottom:1px solid rgba(255,255,255,0.025);background:' + bg + '">' +
                '<span style="font-size:10px;color:rgba(255,255,255,0.2);white-space:nowrap;font-family:monospace;min-width:64px;">' + l.time + '</span>' +
                '<span style="font-size:9px;padding:1px 7px;border-radius:5px;font-weight:900;letter-spacing:.04em;border:1px solid ' + c + '33;color:' + c + ';white-space:nowrap;text-transform:uppercase;flex-shrink:0;">' + l.type + '</span>' +
                '<span style="font-size:12px;color:rgba(255,255,255,0.65);word-break:break-word;font-family:monospace;">' + l.msg + '</span>' +
                '</div>'
            );
        }

        container.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
                '<span style="font-size:11px;color:rgba(255,255,255,0.25);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">' + this.state.logs.length + ' intrări (ultimele ' + this._MAX_LOGS + ')</span>' +
                '<button onclick="AdminModule.clearLogs()" style="background:rgba(224,82,82,0.08);color:#e05252;border:1px solid rgba(224,82,82,0.2);padding:5px 14px;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:.04em;">Sterge tot</button>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.05);border-radius:14px;overflow:hidden;max-height:640px;overflow-y:auto;">' +
                rows.join('') +
            '</div>';
    },

    // --- Helpers ---

    isEmailBanned: function(email) {
        if (!email) return false;
        const key = email.replace(/\./g, '_');
        return !!this.state.banned[key];
    }
};

// Global helper — orice modul poate loga fara sa importe AdminModule direct
window.addAdminLog = function(msg, type) {
    AdminModule.addLog(msg, type);
};
