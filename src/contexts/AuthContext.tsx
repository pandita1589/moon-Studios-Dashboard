import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, getUserProfile, registerSession, logUserActivity } from '@/lib/firebase';
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
  refreshProfile: () => Promise<void>;
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

const buildProfile = (uid: string, data: any): UserProfile => ({
  uid,
  email:         data.email,
  displayName:   data.displayName,
  role:          data.role,
  avatar:        data.avatar,
  phone:         data.phone,
  bio:           data.bio,
  website:       data.website,
  avatarHistory: data.avatarHistory ?? [],
  createdAt:     data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);

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
    let previousUid: string | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const data = await getUserProfile(user.uid);
          if (data) setUserProfile(buildProfile(user.uid, data));

          // Solo registra sesión y log cuando es un login nuevo (no en recargas del observer)
          if (previousUid !== user.uid) {
            // Registrar sesión en Firestore
            await registerSession(user.uid).catch(console.error);

            // Log de actividad solo si no es la primera carga de la página
            if (previousUid !== null || document.visibilityState === 'visible') {
              await logUserActivity(user.uid, 'login', 'Inicio de sesión').catch(console.error);
            }
          }

          previousUid = user.uid;
        } catch (e) {
          console.error('Error fetching user profile:', e);
        }
      } else {
        setUserProfile(null);
        previousUid = null;
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
      isContador, isProgramacion,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};