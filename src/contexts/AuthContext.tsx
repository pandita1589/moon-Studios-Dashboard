import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, getUserProfile } from '@/lib/firebase';
import type { UserRole, UserProfile } from '@/types';

interface AuthContextType {
  currentUser:    User | null;
  userProfile:    UserProfile | null;
  userRole:       UserRole | null;
  isCEO:          boolean;
  isAdmin:        boolean;
  isEmployee:     boolean;
  canEdit:        boolean;
  loading:        boolean;
  refreshProfile: () => Promise<void>; // ← nuevo
  isContador:     boolean;
  isProgramacion: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser:    null,
  userProfile:    null,
  userRole:       null,
  isCEO:          false,
  isAdmin:        false,
  isEmployee:     false,
  canEdit:        false,
  loading:        true,
  refreshProfile: async () => {},
  isContador:     false,
  isProgramacion: false,
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps { children: ReactNode; }

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

  // ── Construye el perfil tipado desde Firestore ────────────────────────────
  const buildProfile = (uid: string, data: any): UserProfile => ({
    uid,
    email:       data.email,
    displayName: data.displayName,
    role:        data.role,
    avatar:      data.avatar,
    phone:       data.phone,
    createdAt:   data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
  });

  // ── Refresca el perfil desde Firestore sin recargar la página ─────────────
  const refreshProfile = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const data = await getUserProfile(user.uid);
      if (data) setUserProfile(buildProfile(user.uid, data));
    } catch (e) {
      console.error('Error refreshing profile:', e);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const data = await getUserProfile(user.uid);
          if (data) setUserProfile(buildProfile(user.uid, data));
        } catch (e) {
          console.error('Error fetching user profile:', e);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const userRole       = userProfile?.role || null;
  const isCEO          = userRole === 'CEO';
  const isAdmin        = userRole === 'Administración' || isCEO;
  const isEmployee     = userRole === 'Empleado' || isAdmin;
  const canEdit        = isCEO || userRole === 'Administración';
  const isContador     = userRole === 'Contador';
  const isProgramacion = userRole === 'Programación';

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, userRole,
      isCEO, isAdmin, isEmployee, canEdit,
      loading, refreshProfile,
      isContador,
      isProgramacion,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};