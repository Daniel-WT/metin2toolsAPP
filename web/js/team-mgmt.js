
// ============ TEAM MANAGEMENT LOGIC ============

function initTeamMgmt() {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;

  // 1. Listen for Team Metadata (Name, Owner, InviteCode)
  db.ref(`teams/${teamId}`).on('value', snap => {
    const data = snap.val() || {};
    const meta = data.metadata || data || {}; // Fallback to root if metadata child missing
    
    document.getElementById('displayTeamName').textContent = meta.name || data.name || 'Echipa Fara Nume';
    document.getElementById('displayInviteCode').textContent = meta.inviteCode || data.inviteCode || '------';
    
    window.currentTeamMeta = { ...meta, ownerId: meta.ownerId || data.ownerId || data.leader };
    const isSuperAdmin = window.currentUserProfile?.isSuperAdmin === true;
    const isOwner = (window.currentTeamMeta?.ownerId === firebase.auth().currentUser.uid) || isSuperAdmin;
    const isAdmin = (window.teamMembers?.[firebase.auth().currentUser.uid]?.role === 'admin') || isSuperAdmin;
    const canManage = isOwner || isAdmin;

    const editBtn = document.getElementById('btnEditTeamName');
    if (editBtn) editBtn.style.display = canManage ? 'block' : 'none';

    const disbandBtn = document.getElementById('btnDisbandTeam');
    if (disbandBtn) disbandBtn.style.display = isOwner ? 'block' : 'none';

    // Hide/Show Invite Code card based on permissions
    const inviteCard = document.querySelector('.team-info-grid .card:last-child');
    if (inviteCard) inviteCard.style.display = canManage ? 'block' : 'none';

    // Fetch owner's real name whenever it's missing (in members or not)
    const ownerId = window.currentTeamMeta.ownerId;
    if (ownerId) {
        const ownerMember = window.teamMembers?.[ownerId];
        if (!ownerMember?.name || !window.ownerRealName) {
            db.ref(`users/${ownerId}`).once('value', ownerSnap => {
                const d = ownerSnap.val() || {};
                window.ownerRealName = d.name || d.email?.split('@')[0] || null;
                renderMemberList();
            });
        }
    }

    renderWebhookSettings(canManage);
    renderMemberList();
  });

  // 2. Listen for Team Members
  db.ref(`teams/${teamId}/members`).on('value', snap => {
    const members = snap.val() || {};
    window.teamMembers = members;
    renderMemberList();
    
    if (members[firebase.auth().currentUser.uid]) {
      applyMemberPermissions(members[firebase.auth().currentUser.uid]);
    }
  });
}

function renderMemberList() {
  const list = document.getElementById('memberList');
  if (!list) return;
  
  const members = window.teamMembers || {};
  const meta = window.currentTeamMeta || {};
  const currentUid = firebase.auth().currentUser.uid;
  const isOwner = meta.ownerId === currentUid;
  const isAdmin = members[currentUid]?.role === 'admin';
  const canManage = isOwner || isAdmin;

  console.log('[TeamMgmt] Rendering members. Total:', Object.keys(members).length, 'CanManage:', canManage);

  if (Object.keys(members).length === 0) {
    list.innerHTML = '<div class="loading-spinner">Niciun membru găsit.</div>';
    return;
  }

  // Sort: Owner/Leader first, then Admins, then Members
  let entries = Object.entries(members);
  
  // Synthesize owner if missing from members list
  if (meta.ownerId && !members[meta.ownerId]) {
    const isOwnerSelf = meta.ownerId === currentUid;
    entries.unshift([meta.ownerId, {
      name: isOwnerSelf ? (window.currentUserProfile?.name || 'Lider Echipă') : (window.ownerRealName || 'Lider Echipă'),
      role: 'leader',
      online: isOwnerSelf,
      permissions: {
        spawn: true, skin: true, inventory: true, alerte: true, status: true, transfers: true, checklist: true
      }
    }]);
  }

  const sortedEntries = entries.sort((a, b) => {
    const isOwnerA = (meta.ownerId === a[0] || a[1].role === 'leader') ? 0 : (a[1].role === 'admin' ? 1 : 2);
    const isOwnerB = (meta.ownerId === b[0] || b[1].role === 'leader') ? 0 : (b[1].role === 'admin' ? 1 : 2);
    return isOwnerA - isOwnerB;
  });

  list.innerHTML = sortedEntries.map(([uid, m]) => {
    const isSelf = uid === currentUid;
    const isMemberOwner = meta.ownerId === uid || m.role === 'leader';
    const isOwnerEntry = meta.ownerId === uid;
    const displayName = m.name || (isOwnerEntry ? window.ownerRealName : null) || m.email?.split('@')[0] || 'Utilizator';
    const initials = displayName.charAt(0).toUpperCase();
    const roleCls = isMemberOwner ? 'role-owner' : (m.role === 'admin' ? 'role-admin' : 'role-member');
    const roleLbl = isMemberOwner ? 'Lider' : (m.role === 'admin' ? 'Admin' : 'Membru');
    const isOnline = m.online === true; 

    // If NOT admin, show a simplified list item
    if (!canManage) {
      return `
        <div class="member-row-simple">
          <div class="member-avatar-mini">
            ${initials}
            <div class="member-status-dot ${isOnline ? 'online' : ''}"></div>
          </div>
          <div class="member-info">
            <div class="member-name">${escHtml(displayName)}${isSelf ? ' (Tu)' : ''}</div>
            <div class="member-role-badge ${roleCls}">${roleLbl}</div>
          </div>
        </div>
      `;
    }

    // Admin View: Full Card with Permissions
    const perms = isMemberOwner ? {
      spawn: true, skin: true, inventory: true, alerte: true, status: true, transfers: true, checklist: true
    } : (m.permissions || {});

    const isLeader = isMemberOwner || m.role === 'leader';
    
    // Permission rendering logic
    let permsHtml = '';
    if (isLeader) {
      permsHtml = `
        <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: rgba(255,255,255,0.3); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.05);">
          Permisiuni Complete (Lider)
        </div>
      `;
    } else {
      permsHtml = [
        { key: 'spawn', label: 'Spawn' },
        { key: 'skin', label: 'Costume' },
        { key: 'inventory', label: 'Inventar' },
        { key: 'alerte', label: 'Alarme' },
        { key: 'status', label: 'Servere' },
        { key: 'transfers', label: 'Transferuri' },
        { key: 'checklist', label: 'Checklist' },
        { key: 'notes', label: 'Notițe' }
      ].map(p => {
        const hasPerm = perms[p.key];
        // Show toggle if canManage AND target is not leader (self CAN be edited by admin)
        const canEdit = canManage && !isLeader;
        
        if (canEdit) {
          return `
            <div class="perm-item">
              <span class="perm-label">${p.label}</span>
              <label class="switch">
                <input type="checkbox" ${hasPerm ? 'checked' : ''} onchange="updateMemberPerm('${uid}', '${p.key}', this.checked)">
                <span class="slider"></span>
              </label>
            </div>
          `;
        } else {
          return `
            <div class="perm-item" style="opacity: 0.6;">
              <span class="perm-label">${p.label}</span>
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${hasPerm ? '#c8962e' : 'rgba(255,255,255,0.1)'};"></div>
                <span style="font-size: 10px; color: ${hasPerm ? '#fff' : 'rgba(255,255,255,0.3)'};">${hasPerm ? 'Activat' : 'Dezactivat'}</span>
              </div>
            </div>
          `;
        }
      }).join('');
    }

    return `
      <div class="member-card">
        <div class="member-card-header">
          <div class="member-avatar">
            ${initials}
            <div class="member-status-dot ${isOnline ? 'online' : ''}"></div>
          </div>
          <div class="member-info">
            <div class="member-name">${escHtml(displayName)}${isSelf ? ' (Tu)' : ''}</div>
            <div class="member-role-badge ${roleCls}">${roleLbl}</div>
          </div>
        </div>
        
        <div class="perm-grid">
          ${permsHtml}
        </div>

        ${(canManage && !isLeader && !isSelf) ? `
          <div class="member-footer">
            ${isOwner ? `
              <button class="btn-kick" onclick="toggleAdmin('${uid}', '${m.role === 'admin' ? 'member' : 'admin'}')">
                ${m.role === 'admin' ? 'Revocă Admin' : 'Fă Admin'}
              </button>
            ` : ''}
            <button class="btn-kick" onclick="kickMember('${uid}')">Elimină</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function updateMemberPerm(uid, permKey, value) {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;
  
  db.ref(`teams/${teamId}/members/${uid}/permissions/${permKey}`).set(value)
    .then(() => showToast('Permisiune actualizata', 'success'))
    .catch(e => showToast('Eroare permisiuni', 'error'));
}

function toggleAdmin(uid, newRole) {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;

  db.ref(`teams/${teamId}/members/${uid}/role`).set(newRole)
    .then(() => showToast('Rol actualizat', 'success'))
    .catch(e => showToast('Eroare rol', 'error'));
}

function kickMember(uid) {
  if (!confirm('Sigur vrei sa elimini acest membru din echipa?')) return;
  
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;

  db.ref(`teams/${teamId}/members/${uid}`).remove()
    .then(() => {
      db.ref(`users/${uid}/currentTeamId`).set(null);
      db.ref(`users/${uid}/teamId`).set(null);
      showToast('Membru eliminat', 'success');
    })
    .catch(e => showToast('Eroare eliminare', 'error'));
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function applyMemberPermissions(m) {
  if (!m) return;
  const perms = m.permissions || {};
  const currentUid = firebase.auth().currentUser.uid;
  const isOwner = window.currentTeamMeta?.ownerId === currentUid;
  const isAdmin = window.teamMembers?.[currentUid]?.role === 'admin';

  const hasAccess = (key) => isOwner || isAdmin || perms[key] === true;

  const tabMapping = {
    'skin-reminder': 'skin',
    'insotitori-site': 'skin',
    'inventory-manager': 'inventory',
    'spawn': 'spawn',
    'alerte': 'alerte',
    'server-status': 'status',
    'transfers': 'transfers',
    'checklist': 'checklist',
    'sticky-notes': 'notes'
  };

  Object.entries(tabMapping).forEach(([tabId, permKey]) => {
    const btn = document.querySelector(`.main-tab[data-tab="${tabId}"]`);
    if (btn) {
      if (hasAccess(permKey)) {
        btn.style.display = 'block';
      } else {
        btn.style.display = 'none';
        if (btn.classList.contains('active')) {
          const firstVisible = document.querySelector('.main-tab:not([style*="display: none"])');
          if (firstVisible) firstVisible.click();
        }
      }
    }
  });
}

// UI Helpers for Dashboard
window.copyInviteCode = () => {
  const code = document.getElementById('displayInviteCode').textContent;
  if (code && code !== '------') {
    navigator.clipboard.writeText(code);
    showToast('Cod copiat!', 'success');
  }
};

window.editTeamName = async () => {
  const meta = window.currentTeamMeta;
  if (!meta) return;
  const newName = prompt('Introdu noul nume al echipei:', meta.name);
  if (newName && newName.trim() !== meta.name) {
    const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
    await db.ref(`teams/${teamId}/metadata/name`).set(newName.trim());
    showToast('Nume actualizat!', 'success');
  }
};

window.disbandTeam = async () => {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;

  if (!confirm('ATENȚIE! Această acțiune va șterge definitiv echipa și va deconecta toți membrii. Ești sigur?')) return;

  try {
    const snap = await db.ref(`teams/${teamId}/members`).once('value');
    const members = snap.val() || {};
    const updates = {};

    Object.keys(members).forEach(uid => {
      updates[`users/${uid}/teamId`] = null;
      updates[`users/${uid}/currentTeamId`] = null;
    });

    const currentUid = firebase.auth().currentUser.uid;
    updates[`users/${currentUid}/teamId`] = null;
    updates[`users/${currentUid}/currentTeamId`] = null;
    updates[`teams/${teamId}`] = null;

    await db.ref().update(updates);
    showToast('Echipa a fost desființată', 'success');
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    showToast('Eroare la desființarea echipei', 'error');
  }
};

window.saveWebhookSettings = async function() {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;
  const skinVal  = document.getElementById('inputWebhookSkin')?.value.trim()   || null;
  const srvVal   = document.getElementById('inputWebhookServer')?.value.trim() || null;
  try {
    await db.ref(`teams/${teamId}/settings`).update({
      discordWebhookSkin:   skinVal,
      discordWebhookServer: srvVal
    });
    showToast('Webhook-uri salvate!', 'success');
  } catch(e) {
    showToast('Eroare la salvare', 'error');
  }
};

function renderWebhookSettings(canManage) {
  const container = document.getElementById('teamWebhookSettings');
  if (!container) return;
  if (!canManage) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div style="margin-bottom: 30px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 24px;">
      <div style="font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.46 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.37 1.2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.52a16 16 0 0 0 6.29 6.29l1.59-1.59a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Webhooks Discord
      </div>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.8px; display: block; margin-bottom: 8px;">Webhook Costume / Iteme</label>
          <input id="inputWebhookSkin" type="text" placeholder="https://discord.com/api/webhooks/..." value="${escHtml(window.teamWebhookSkin || '')}"
            style="width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none; box-sizing: border-box; font-family: inherit;">
        </div>
        <div>
          <label style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.8px; display: block; margin-bottom: 8px;">Webhook Status Server</label>
          <input id="inputWebhookServer" type="text" placeholder="https://discord.com/api/webhooks/..." value="${escHtml(window.teamWebhookServer || '')}"
            style="width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none; box-sizing: border-box; font-family: inherit;">
        </div>
        <button onclick="saveWebhookSettings()" style="align-self: flex-start; padding: 10px 24px; background: rgba(200,150,46,0.15); border: 1px solid rgba(200,150,46,0.3); border-radius: 10px; color: #f0b845; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.2s;">
          Salvează
        </button>
      </div>
    </div>
  `;
}

window.generateNewInviteCode = async () => {
  const teamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
  if (!teamId) return;

  const btn = document.getElementById('btnGenerateCode');
  if (btn) btn.style.transform = 'rotate(360deg)';
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  try {
    await db.ref(`teams/${teamId}/metadata/inviteCode`).set(code);
    showToast('Cod nou generat!', 'success');
    if (btn) setTimeout(() => btn.style.transform = 'none', 500);
  } catch (e) {
    showToast('Eroare generare cod', 'error');
  }
};
