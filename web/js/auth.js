// ============ AUTH LAYER (PRO VERSION) ============

window._initAuth = function() {
  console.log("Attempting to init Auth...");
  if (window._authInitialized) {
    console.log("Auth already initialized, skipping.");
    return;
  }
  window._authInitialized = true;
  console.log("Initializing Auth listeners...");

  const authGate = document.getElementById('auth-gate');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authTitle = document.getElementById('auth-title');
  const authErr = document.getElementById('auth-err');

  // State
  window.currentUserProfile = null;

  // UI Helpers (Unified Form)
  let isRegisterMode = false;
  const authToggle = document.getElementById('auth-toggle');
  const btnSubmit = document.getElementById('btn-submit');
  const rememberWrapper = document.getElementById('remember-me-wrapper');

  if (authToggle) {
    authToggle.addEventListener('click', () => {
      isRegisterMode = !isRegisterMode;
      if (authErr) authErr.style.display = 'none';

      if (isRegisterMode) {
        if (authTitle) authTitle.textContent = 'Create Account';
        btnSubmit.innerHTML = 'Initialize Identity <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        authToggle.textContent = 'Already have a member account? Login';
        
        rememberWrapper.style.maxHeight = '0px';
        rememberWrapper.style.opacity = '0';
        rememberWrapper.style.marginBottom = '0px';
      } else {
        if (authTitle) authTitle.textContent = 'Welcome Back';
        btnSubmit.innerHTML = 'Secure Login <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        authToggle.textContent = 'Need an account? Register';
        
        rememberWrapper.style.maxHeight = '40px';
        rememberWrapper.style.opacity = '1';
        rememberWrapper.style.marginBottom = '32px';
      }
    });
  }

  function showError(msg) {
    authErr.textContent = msg;
    authErr.style.display = 'block';
  }

  // --- Profile Logic (from Tauri App) ---
  // --- Profile Logic ---
  function fetchUserProfile(firebaseUser) {
    const userRef = firebase.database().ref(`users/${firebaseUser.uid}`);
    userRef.on('value', async (snap) => {
      console.log("[Auth] Profile update received.");
      const data = snap.val() || {};
      
      // 1. Check if Banned
      if (firebaseUser.email) {
        try {
          const emailKey = firebaseUser.email.replace(/\./g, '_');
          const banSnap = await firebase.database().ref(`banned_emails/${emailKey}`).once('value');
          if (banSnap.exists()) {
            alert('Acest cont a fost banat de către un administrator.');
            await firebase.auth().signOut();
            return;
          }
        } catch (e) {}
      }

      // 2. State Sync
      const oldTeamId = window.currentUserProfile?.currentTeamId || window.currentUserProfile?.teamId;
      window.currentUserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        ...data,
        isSuperAdmin: firebaseUser.email === 'postavarudaniel@gmail.com' || !!data.isSuperAdmin,
        permissions: data.permissions || {}
      };
      console.log('[Auth] isSuperAdmin:', window.currentUserProfile.isSuperAdmin, '| uid:', firebaseUser.uid, '| email:', firebaseUser.email);

      // Ensure uid + email + isSuperAdmin are always stored in Firebase
      const isSA = window.currentUserProfile.isSuperAdmin;
      if (data.uid !== firebaseUser.uid || data.email !== firebaseUser.email || (isSA && !data.isSuperAdmin)) {
        firebase.database().ref(`users/${firebaseUser.uid}`).update({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          ...(isSA ? { isSuperAdmin: true } : {})
        });
      }

      window.dispatchEvent(new CustomEvent('m2-profile-updated'));

      const teamId = window.currentUserProfile.currentTeamId || window.currentUserProfile.teamId;

      // 3. Redirection Logic
      if (!teamId) {
        console.log("[Auth] No team found, showing gate.");
        authGate.style.display = 'none';
        document.getElementById('team-gate').style.display = 'flex';
        document.getElementById('app-root').style.display = 'none';

        // Super Admin cu cerere pendinta → auto-aprobare
        if (window.currentUserProfile?.isSuperAdmin && window.TeamGate) {
          window.TeamGate.autoApprovePendingRequest(firebaseUser.uid);
        }
      } else {
        console.log("[Auth] Access granted for team:", teamId);
        authGate.style.display = 'none';
        document.getElementById('team-gate').style.display = 'none';
        document.getElementById('app-root').style.display = 'block';

        // 4. Modules Init
        if (teamId && teamId !== oldTeamId) {
          setupPresence(window.currentUserProfile);
          if (typeof window._initTeamListeners === 'function') {
            window._initTeamListeners(teamId);
          }
          if (typeof initTeamMgmt === 'function') {
            initTeamMgmt();
          }
        }

        // 5. Admin tab visibility — Super-Admin sau permisiunea adminPanel
        var prof = window.currentUserProfile;
        var canSeeAdmin = prof.isSuperAdmin || !!(prof.permissions && prof.permissions.adminPanel);
        window._isAdmin = canSeeAdmin;
        if (canSeeAdmin) {
          var adminBtn = document.getElementById('tab-btn-admin');
          if (adminBtn) adminBtn.style.display = 'block';
          if (window.AdminModule) window.AdminModule.init();
        }

        // 6. App Init (Hide Loader)
        if (typeof initApp === 'function') initApp();
      }
    });
  }

  function setupPresence(profile) {
    const teamId = profile.currentTeamId || profile.teamId;
    if (!teamId) return;
    const presenceRef = firebase.database().ref(`teams/${teamId}/presence/${profile.uid}`);
    const presenceData = {
      uid: profile.uid,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
      color: profile.color || '#c8962e',
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      lastAction: 'Website'
    };

    presenceRef.set(presenceData);
    presenceRef.onDisconnect().remove();
  }

  // Firebase Auth Listener
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      fetchUserProfile(user);
    } else {
      window.currentUserProfile = null;
      authGate.style.display = 'flex';
      document.getElementById('m2TeamBtn').style.display = 'none';
    }
  });

  // Unified Auth Submit
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const email = document.getElementById('auth-email').value.trim();
      const pass = document.getElementById('auth-pw').value;
      const rememberMe = document.getElementById('remember-me').checked;

      if (!email || !pass) return showError("Completeaza toate campurile.");

      if (isRegisterMode) {
        if (pass.length < 6) return showError("Parola prea scurta (min 6 char).");
        firebase.auth().createUserWithEmailAndPassword(email, pass)
          .then(user => console.log("Register success:", user))
          .catch(err => {
            console.error("Register error:", err);
            showError("Eroare: " + err.message);
          });
      } else {
        const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
        firebase.auth().setPersistence(persistence).then(() => {
          return firebase.auth().signInWithEmailAndPassword(email, pass);
        }).then(user => console.log("Login success:", user))
        .catch(err => {
          console.error("Login error:", err);
          showError("Email sau parola incorecta. (" + err.code + ")");
        });
      }
    });
  }

  // --- Team Management ---
  window.showTeamModal = () => {
    const profile = window.currentUserProfile;
    if (!profile) return;

    const teamId = profile.currentTeamId || profile.teamId;
    if (teamId) {
      document.getElementById('team-info-section').style.display = 'block';
      document.getElementById('no-team-section').style.display = 'none';
      document.getElementById('current-team-id').textContent = teamId;
    } else {
      document.getElementById('team-info-section').style.display = 'none';
      document.getElementById('no-team-section').style.display = 'block';
    }
    openModal('teamModal');
  };

  window.createTeam = async () => {
    if (!window.currentUserProfile) return;
    const teamId = 'T' + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    if (confirm(`Ești sigur că vrei să creezi echipa ${teamId}?`)) {
      const user = firebase.auth().currentUser;
      
      // 1. Initialize Team Node
      await firebase.database().ref(`teams/${teamId}`).set({
        id: teamId,
        metadata: {
          name: `Echipa lui ${user.email.split('@')[0]}`,
          inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
          ownerId: user.uid,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        },
        status: 'active'
      });

      // 2. Add creator as leader
      await firebase.database().ref(`teams/${teamId}/members/${user.uid}`).set({
        uid: user.uid,
        name: window.currentUserProfile.name || user.email.split('@')[0],
        email: user.email,
        role: 'leader',
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        permissions: {
          spawn: true, skin: true, inventory: true, alerte: true, status: true, transfers: true, checklist: true
        }
      });

      // 3. Update User Profile
      await window.updateProfile({ teamId: teamId, currentTeamId: teamId, role: 'leader' });
      location.reload();
    }
  };

  window.joinTeam = async () => {
    if (!window.currentUserProfile) return;
    const teamId = document.getElementById('join-team-id').value.trim().toUpperCase();
    if (!teamId) return alert('Introdu un ID de echipa valid.');

    // Optional: check if team exists (if we have a teams node)
    const teamSnap = await firebase.database().ref(`teams/${teamId}`).once('value');
    if (!teamSnap.exists()) {
       if (!confirm('Aceasta echipa nu exista inca. Vrei sa o creezi tu?')) return;
    }

    await window.updateProfile({ teamId: teamId, currentTeamId: teamId });
    location.reload();
  };

  window.leaveTeam = async () => {
    if (!window.currentUserProfile) return;
    if (confirm('Esti sigur ca vrei sa parasesti echipa? Vei reveni la datele locale/private.')) {
      await window.updateProfile({ teamId: null, currentTeamId: null });
      location.reload();
    }
  };

  // --- Profile Management ---
  const PRESET_COLORS = ['#c8962e', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#1abc9c', '#f1c40f', '#e67e22', '#ecf0f1', '#d35400'];
  let selectedColor = '#c8962e';

  window.showProfileModal = () => {
    const profile = window.currentUserProfile;
    if (!profile) return;

    document.getElementById('profile-name-input').value = profile.name || '';
    document.getElementById('profile-email-text').textContent = profile.email;
    selectedColor = profile.color || '#c8962e';
    renderColorPresets();
    openModal('profileModal');
  };

  function renderColorPresets() {
    const container = document.getElementById('profile-color-presets');
    container.innerHTML = '';
    PRESET_COLORS.forEach(c => {
      const btn = document.createElement('button');
      btn.style.width = '100%';
      btn.style.paddingBottom = '100%';
      btn.style.borderRadius = '8px';
      btn.style.border = selectedColor === c ? '2px solid #fff' : '2px solid transparent';
      btn.style.background = c;
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 0.2s';
      btn.onclick = () => {
        selectedColor = c;
        renderColorPresets();
      };
      container.appendChild(btn);
    });
  }

  window.saveProfileChanges = async () => {
    const name = document.getElementById('profile-name-input').value.trim();
    if (!name) return alert('Introdu un nume.');

    const btn = document.getElementById('btnSaveProfile');
    btn.disabled = true;
    btn.textContent = 'Se salvează...';

    try {
      await window.updateProfile({ name, color: selectedColor });
      closeModal('profileModal');
      if (typeof updateUserBtn === 'function') updateUserBtn();
    } catch (err) {
      console.error(err);
      alert('Ereore la salvare.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvează';
    }
  };

  window.handleLogout = () => {
    if (confirm('Sigur vrei să te deconectezi?')) {
      firebase.auth().signOut().then(() => {
        location.href = '/';
      });
    }
  };

  // Global Utils
  window.logout = window.handleLogout;

  window.updateProfile = async (data) => {
    if (!window.currentUserProfile) return;
    await firebase.database().ref(`users/${window.currentUserProfile.uid}`).update(data);
    window.currentUserProfile = { ...window.currentUserProfile, ...data };
  };

};
