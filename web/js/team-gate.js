
/**
 * TEAM SELECTION GATE LOGIC
 * Manages the overlay for users without a team.
 */


// Global access for HTML onclicks - Defined immediately when script loads
window.showJoinTeam = () => window.TeamGate.showJoinForm();
window.showCreateRequest = () => window.TeamGate.showCreateForm();
window.backToTeamChoice = () => window.TeamGate.backToChoice();

window.TeamGate = {
    init: function() {
        console.log("[TeamGate] Initializing handlers...");
        this.setupHandlers();
        this.updateUserInfo();
    },

    updateUserInfo: function() {
        const user = firebase.auth().currentUser;
        if (!user) return;
        const emailEl = document.getElementById('user-gate-email');
        const initEl = document.getElementById('user-gate-init');
        if (emailEl) emailEl.textContent = user.email;
        if (initEl) initEl.textContent = user.email[0].toUpperCase();
    },

    showJoinForm: function() {
        this.hideAll();
        const el = document.getElementById('team-join-form');
        if (el) el.style.display = 'block';
    },

    showCreateForm: function() {
        this.hideAll();
        const el = document.getElementById('team-create-form');
        if (el) el.style.display = 'block';
    },

    showPending: function() {
        this.hideAll();
        const el = document.getElementById('team-pending-screen');
        if (el) el.style.display = 'block';
    },

    backToChoice: function() {
        this.hideAll();
        const el = document.getElementById('team-choice-main');
        if (el) el.style.display = 'grid';
    },

    hideAll: function() {
        const ids = ['team-choice-main', 'team-join-form', 'team-create-form', 'team-pending-screen', 'team-setup-profile', 'team-gate-err'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    },

    setError: function(msg) {
        const errEl = document.getElementById('team-gate-err');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }
    },

    pendingTeamId: null,
    pendingTeamName: null,
    selectedColor: '#c8962e',
    presetColors: ['#c8962e', '#ef4444', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#f97316', '#14b8a6'],

    initSetupColors: function() {
        const grid = document.getElementById('setup-color-grid');
        if (!grid) return;
        grid.innerHTML = '';
        this.presetColors.forEach(c => {
            const btn = document.createElement('div');
            btn.style.height = '36px';
            btn.style.borderRadius = '8px';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = c;
            btn.style.border = this.selectedColor === c ? '2px solid #fff' : '2px solid transparent';
            btn.style.transform = this.selectedColor === c ? 'scale(1.1)' : 'scale(1)';
            btn.style.boxShadow = this.selectedColor === c ? '0 4px 12px rgba(0,0,0,0.5)' : 'none';
            btn.style.opacity = this.selectedColor === c ? '1' : '0.5';
            btn.style.transition = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';
            btn.onmouseover = () => { if (this.selectedColor !== c) { btn.style.opacity = '1'; btn.style.transform = 'scale(1.05)'; } };
            btn.onmouseout = () => { if (this.selectedColor !== c) { btn.style.opacity = '0.5'; btn.style.transform = 'scale(1)'; } };
            btn.onclick = () => {
                this.selectedColor = c;
                this.initSetupColors();
            };
            if (this.selectedColor === c) {
               btn.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);border-radius:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`;
            }
            grid.appendChild(btn);
        });
    },

    showSetupProfile: function(teamId, teamName) {
        this.hideAll();
        this.pendingTeamId = teamId;
        this.pendingTeamName = teamName;
        const el = document.getElementById('team-setup-profile');
        if (el) {
            el.style.display = 'block';
            el.style.animation = 'fadeIn 0.4s ease-out forwards';
        }

        const title = document.querySelector('#team-gate h2');
        const subtitle = document.querySelector('#team-gate p');
        if (title) title.textContent = 'Profile Setup';
        if (subtitle) subtitle.textContent = `Joining ${teamName}`;

        const user = firebase.auth().currentUser;
        const nameInput = document.getElementById('setup-profile-name');
        if (nameInput && user && user.email) {
            nameInput.value = user.email.split('@')[0];
        }

        this.initSetupColors();
    },

    completeSetup: async function() {
        const btn = document.getElementById('btn-complete-setup');
        if (btn) { btn.disabled = true; btn.innerHTML = 'Saving...'; }

        try {
            const user = firebase.auth().currentUser;
            const nameInput = document.getElementById('setup-profile-name');
            const profileName = (nameInput ? nameInput.value.trim() : '') || user.email.split('@')[0];

            await db.ref(`teams/${this.pendingTeamId}/members/${user.uid}`).set({
                uid: user.uid,
                name: profileName,
                email: user.email,
                role: 'member',
                joinedAt: firebase.database.ServerValue.TIMESTAMP,
                permissions: {
                    spawn: true, skin: true, inventory: false, alerte: true, status: true, transfers: false, checklist: true
                }
            });

            await db.ref(`users/${user.uid}`).update({
                teamId: this.pendingTeamId,
                currentTeamId: this.pendingTeamId,
                name: profileName,
                color: this.selectedColor
            });

            // Single-use logic: Invalidate code after successful join
            await db.ref(`teams/${this.pendingTeamId}/metadata/inviteCode`).set(null);

            if (typeof showToast === 'function') showToast(`Welcome to ${this.pendingTeamName}, ${profileName}!`, 'success');
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            console.error(e);
            this.setError("Could not save profile.");
            if (btn) { btn.disabled = false; btn.innerHTML = 'Finalize Profile <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'; }
        }
    },

    joinTeam: async function() {
        const input = document.getElementById('join-code');
        const code = input ? input.value.trim().toUpperCase() : '';
        if (!code) return;

        const btn = document.getElementById('btn-join-team');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Verifying...';
        }
        this.setError('');

        try {
            const teamsSnap = await db.ref('teams').once('value');
            let foundTeamId = null;
            let foundTeamName = '';

            teamsSnap.forEach(t => {
                const data = t.val();
                if (data && (data.inviteCode === code || (data.metadata && data.metadata.inviteCode === code))) {
                    foundTeamId = t.key;
                    foundTeamName = data.name || (data.metadata && data.metadata.name) || t.key;
                    return true; // Stop iteration
                }
            });

            if (foundTeamId) {
                this.showSetupProfile(foundTeamId, foundTeamName);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = 'Join Team <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left:8px;vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
                }
            } else {
                this.setError("Invalid or expired invite code.");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = 'Join Team <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left:8px;vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
                }
            }
        } catch (e) {
            console.error(e);
            this.setError("Connection error. Try again.");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Join Team <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left:8px;vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
            }
        }
    },

    requestTeam: async function() {
        const nameInput = document.getElementById('create-team-name');
        const idInput = document.getElementById('create-team-id');
        const teamName = nameInput ? nameInput.value.trim() : '';
        const teamId = idInput ? idInput.value.trim().toLowerCase().replace(/\s+/g, '-') : '';
        
        if (!teamName || !teamId) {
            this.setError("Please fill all fields.");
            return;
        }

        const btn = document.getElementById('btn-request-team');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Submitting...';
        }
        this.setError('');

        try {
            const user = firebase.auth().currentUser;
            const isSuperAdmin = window.currentUserProfile && window.currentUserProfile.isSuperAdmin;

            if (isSuperAdmin) {
                // Super-admin bypasses the request queue and creates the team directly
                await db.ref(`teams/${teamId}`).set({
                    id: teamId,
                    metadata: {
                        name: teamName,
                        inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                        ownerId: user.uid,
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    },
                    status: 'active'
                });
                await db.ref(`users/${user.uid}`).update({
                    teamId: teamId,
                    currentTeamId: teamId,
                    role: 'leader'
                });
                location.reload();
                return;
            }

            await db.ref(`team_requests/${teamId}`).set({
                id: teamId,
                name: teamName,
                requestedBy: user.uid,
                userEmail: user.email,
                status: 'pending',
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            this.showPending();
        } catch (e) {
            console.error(e);
            this.setError("Error submitting request.");
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Submit Request';
            }
        }
    },

    setupHandlers: function() {
        const btnJoin = document.getElementById('btn-join-team');
        if (btnJoin) btnJoin.addEventListener('click', () => this.joinTeam());

        const btnReq = document.getElementById('btn-request-team');
        if (btnReq) btnReq.addEventListener('click', () => this.requestTeam());

        const btnComplete = document.getElementById('btn-complete-setup');
        if (btnComplete) btnComplete.addEventListener('click', () => this.completeSetup());
    }
};

// Immediate or deferred init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.TeamGate.init());
} else {
    window.TeamGate.init();
}
