import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { ref, get, onValue } from 'firebase/database';
import { auth, db } from '../lib/firebase';

interface UserProfile {
  uid: string;
  email: string | null;
  name?: string;
  color?: string;
  teamId?: string | null;
  role?: string;
  isSuperAdmin?: boolean;
  permissions?: { serverStatus?: boolean; adminPanel?: boolean; spawn?: boolean; skin?: boolean; inventory?: boolean; status?: boolean; alerte?: boolean; transfers?: boolean; checklist?: boolean; [key: string]: boolean | undefined };
}

interface AuthContextType {
  user: UserProfile | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  refreshTeamStatus: () => Promise<void>;
  updateProfile: (data: { name?: string, color?: string }) => Promise<void>;
  changePassword: (oldPass: string, newPass: string) => Promise<void>;
  viewAsMember: boolean;
  setViewAsMember: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewAsMember, setViewAsMemberState] = useState(() => {
    return localStorage.getItem('m2_view_as_member') === 'true';
  });

  const setViewAsMember = (val: boolean) => {
    setViewAsMemberState(val);
    localStorage.setItem('m2_view_as_member', val.toString());
  };

  const fetchUserProfile = (firebaseUser: FirebaseUser) => {
    const userRef = ref(db, `users/${firebaseUser.uid}`);
    
    // 1. Listen for Profile Changes
    return onValue(userRef, async (snapshot) => {
      try {
        // Security Check: Ban List
        if (firebaseUser.email) {
          const emailKey = firebaseUser.email.replace(/\./g, '_');
          const banSnapshot = await get(ref(db, `banned_emails/${emailKey}`));
          if (banSnapshot.exists()) {
            alert('Acest cont a fost banat de către un administrator.');
            await signOut(auth);
            setUser(null);
            return;
          }
        }

        if (snapshot.exists()) {
          const data = snapshot.val();
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...data,
            teamId: data.currentTeamId || data.teamId || null,
            isSuperAdmin: firebaseUser.email === 'postavarudaniel@gmail.com' || !!data.isSuperAdmin,
            permissions: data.permissions || {}
          });
        } else {
          // New user or no profile in DB yet
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            teamId: null,
            color: '#c8962e',
            isSuperAdmin: firebaseUser.email === 'postavarudaniel@gmail.com'
          });
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email, teamId: null });
      }
    });
  };

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        unsubProfile = fetchUserProfile(firebaseUser);
      } else {
        if (unsubProfile) unsubProfile();
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Listen for team member data (role/permissions)
  useEffect(() => {
    if (!user?.uid || !user?.teamId) return;
    
    // dynamic import resolved inside setupMemberSync below
    let unsub: any = null;

    const setupMemberSync = async () => {
      const { ref: dbRef, onValue } = await import('firebase/database');
      const memberRef = dbRef(db, `teams/${user.teamId}/members/${user.uid}`);
      unsub = onValue(memberRef, (snap) => {
        const data = snap.val();
        if (data) {
          setUser(prev => {
            if (!prev) return null;
            // Only update if something actually changed to avoid re-render loops
            if (JSON.stringify(prev.permissions) === JSON.stringify(data.permissions) && prev.role === data.role) {
              return prev;
            }
            return { ...prev, role: data.role, permissions: data.permissions };
          });
        }
      });
    };

    setupMemberSync();
    return () => { if (unsub) unsub(); };
  }, [user?.uid, user?.teamId]);

  // Real-time Presence with Custom Name
  useEffect(() => {
    if (!user || !user.teamId) return;
    // dynamic import resolved inside setupPresence below
    
    let presenceCleanup: any = null;

    const setupPresence = async () => {
      const { ref: dbRef, set: dbSet, onDisconnect } = await import('firebase/database');
      const presenceRef = dbRef(db, `teams/${user.teamId}/presence/${user.uid}`);
      
      const presenceData = {
        uid: user.uid,
        email: user.email,
        name: user.name || user.email?.split('@')[0] || 'User',
        color: user.color || '#c8962e',
        lastSeen: Date.now(),
        lastAction: 'Activ'
      };

      await dbSet(presenceRef, presenceData);
      onDisconnect(presenceRef).remove();
    };

    setupPresence();

    return () => {
      if (presenceCleanup) presenceCleanup();
    };
  }, [user?.uid, user?.teamId, user?.name, user?.color]);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const register = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const logout = () => signOut(auth);

  const refreshTeamStatus = async () => {
    if (auth.currentUser) {
      await fetchUserProfile(auth.currentUser);
    }
  };

  const updateProfile = async (data: { name?: string, color?: string }) => {
    if (!user) return;
    const { update, ref: dbRef } = await import('firebase/database');
    const userRef = dbRef(db, `users/${user.uid}`);
    await update(userRef, data);
    setUser(prev => prev ? { ...prev, ...data } : null);
  };

  const changePassword = async (oldPass: string, newPass: string) => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
    const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPass);
    await reauthenticateWithCredential(auth.currentUser, credential);
    await updatePassword(auth.currentUser, newPass);
  };

  return (
    <AuthContext.Provider value={{ 
      user, login, register, logout, isLoading, 
      refreshTeamStatus, updateProfile, changePassword,
      viewAsMember, setViewAsMember
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
