import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, type User, updatePassword, updateEmail, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:  import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ========== AUTH FUNCTIONS ==========
export const registerUser = (email: string, password: string) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

export const loginUser = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const logoutUser = () => {
  return signOut(auth);
};

export const resetUserPassword = (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

export const onAuthChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const updateUserEmail = (email: string) => {
  const user = auth.currentUser;
  if (user) return updateEmail(user, email);
  throw new Error('No user logged in');
};

export const updateUserPassword = (password: string) => {
  const user = auth.currentUser;
  if (user) return updatePassword(user, password);
  throw new Error('No user logged in');
};

// ========== USER MANAGEMENT ==========

const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const createUserInvitation = async (userData: {
  email: string;
  displayName: string;
  role: string;
}, createdBy: string) => {
  const tempPassword = generateTempPassword();
  
  await setDoc(doc(db, 'userInvitations', userData.email), {
    email: userData.email,
    displayName: userData.displayName,
    role: userData.role,
    tempPassword,
    createdBy,
    createdAt: Timestamp.now(),
    status: 'pending',
    used: false
  });
  
  return { 
    success: true, 
    tempPassword,
    message: 'Invitación creada. Comparte el email y contraseña temporal con el usuario.'
  };
};

export const verifyUserInvitation = async (email: string, password: string) => {
  const invitationDoc = await getDoc(doc(db, 'userInvitations', email));
  
  if (!invitationDoc.exists()) {
    return { valid: false, message: 'No existe invitación para este email' };
  }
  
  const invitation = invitationDoc.data();
  
  if (invitation.used) {
    return { valid: false, message: 'Esta invitación ya fue utilizada' };
  }
  
  if (invitation.status !== 'pending') {
    return { valid: false, message: 'Invitación no válida o expirada' };
  }
  
  if (invitation.tempPassword !== password) {
    return { valid: false, message: 'Contraseña temporal incorrecta' };
  }
  
  return { 
    valid: true, 
    invitation: {
      email: invitation.email,
      displayName: invitation.displayName,
      role: invitation.role
    }
  };
};

export const completeUserRegistration = async (email: string, uid: string) => {
  const invitationRef = doc(db, 'userInvitations', email);
  const invitationDoc = await getDoc(invitationRef);
  
  if (!invitationDoc.exists()) {
    throw new Error('Invitación no encontrada');
  }
  
  const invitation = invitationDoc.data();
  
  await updateDoc(invitationRef, {
    used: true,
    status: 'completed',
    completedAt: Timestamp.now(),
    userId: uid
  });
  
  await setDoc(doc(db, 'users', uid), {
    uid,
    email: invitation.email,
    displayName: invitation.displayName,
    role: invitation.role,
    createdAt: Timestamp.now(),
    createdBy: invitation.createdBy,
    isFirstLogin: true
  });
  
  return { success: true };
};

export const deleteUserData = async (uid: string) => {
  await deleteDoc(doc(db, 'users', uid));
  return { success: true };
};

// ========== USER PROFILE FUNCTIONS ==========
export const createUserProfile = async (uid: string, data: any) => {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: Timestamp.now(),
    settings: {
      theme: 'dark',
      sidebarCollapsed: false,
      notifications: true,
      language: 'es'
    }
  });
};

export const getUserProfile = async (uid: string) => {
  const docSnap = await getDoc(doc(db, 'users', uid));
  return docSnap.exists() ? docSnap.data() : null;
};

export const updateUserProfile = async (uid: string, data: any) => {
  await updateDoc(doc(db, 'users', uid), data);
};

export const getAllUsers = async () => {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
};

export const deleteUserProfile = async (uid: string) => {
  await deleteDoc(doc(db, 'users', uid));
};

// ========== USER SETTINGS ==========
export const updateUserSettings = async (uid: string, settings: any) => {
  await updateDoc(doc(db, 'users', uid), { settings });
};

export const getUserSettings = async (uid: string) => {
  const profile = await getUserProfile(uid);
  return profile?.settings || {
    theme: 'dark',
    sidebarCollapsed: false,
    notifications: true,
    language: 'es'
  };
};

// ========== TASKS FUNCTIONS ==========
export const createTask = async (taskData: any) => {
  return await addDoc(collection(db, 'tasks'), {
    ...taskData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
};

export const getTasks = async () => {
  const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getTasksByUser = async (userId: string) => {
  const q = query(
    collection(db, 'tasks'),
    where('assignedTo', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateTask = async (taskId: string, data: any) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    ...data,
    updatedAt: Timestamp.now()
  });
};

export const deleteTask = async (taskId: string) => {
  await deleteDoc(doc(db, 'tasks', taskId));
};

// Cambia el nombre de la función existente
export const subscribeToTasks = (callback: (tasks: any[]) => void) => {
  const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(tasks);
  });
};

// Mantén la antigua para compatibilidad si la usas en otro lado
export const getTasksRealtime = subscribeToTasks;

// ========== ANNOUNCEMENTS ==========
export const createAnnouncement = async (announcementData: any) => {
  return await addDoc(collection(db, 'announcements'), {
    ...announcementData,
    createdAt: Timestamp.now()
  });
};

export const getAnnouncements = async () => {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateAnnouncement = async (id: string, data: any) => {
  await updateDoc(doc(db, 'announcements', id), data);
};

export const deleteAnnouncement = async (announcementId: string) => {
  await deleteDoc(doc(db, 'announcements', announcementId));
};

// ========== DISCORD BOT ==========
export const getDiscordConfig = async () => {
  const docSnap = await getDoc(doc(db, 'discord', 'config'));
  return docSnap.exists() ? docSnap.data() : null;
};

export const updateDiscordConfig = async (data: any) => {
  await setDoc(doc(db, 'discord', 'config'), {
    ...data,
    updatedAt: Timestamp.now()
  }, { merge: true });
};

export const getDiscordData = async () => {
  const docSnap = await getDoc(doc(db, 'discord', 'botData'));
  return docSnap.exists() ? docSnap.data() : null;
};

export const updateDiscordData = async (data: any) => {
  await setDoc(doc(db, 'discord', 'botData'), {
    ...data,
    updatedAt: Timestamp.now()
  }, { merge: true });
};

// ========== ACTIVITY LOG ==========
export const logActivity = async (action: string, details: any, userId: string, userName: string) => {
  await addDoc(collection(db, 'activityLogs'), {
    action,
    details,
    userId,
    userName,
    timestamp: Timestamp.now()
  });
};

export const getActivityLogs = async (limit = 50) => {
  const q = query(
    collection(db, 'activityLogs'),
    orderBy('timestamp', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, limit);
};

// ========== NOTIFICATIONS ==========
export const createNotification = async (notificationData: any) => {
  return await addDoc(collection(db, 'notifications'), {
    ...notificationData,
    createdAt: Timestamp.now(),
    read: false
  });
};

export const getNotifications = async (userId: string) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const markNotificationAsRead = async (notificationId: string) => {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
};

export const deleteNotification = async (notificationId: string) => {
  await deleteDoc(doc(db, 'notifications', notificationId));
};

export const getUnreadNotificationsCount = async (userId: string) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.size;
};

export { Timestamp };

// ========== CREATE USER WITH ROLE (sin cerrar sesión del CEO) ==========
export const createUserWithRole = async (
  email: string,
  password: string,
  displayName: string,
  role: string
): Promise<{ uid: string }> => {
  const secondaryApp = getApps().find(a => a.name === 'Secondary')
    || initializeApp(firebaseConfig, 'Secondary');

  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb   = getFirestore(secondaryApp);

  const credential = await createUserWithEmailAndPassword(
    secondaryAuth,
    email,
    password
  );

  const uid = credential.user.uid;

  // ✅ Escribe ANTES de hacer signOut
  await setDoc(doc(secondaryDb, 'users', uid), {
    uid,
    email,
    displayName,
    role,
    createdAt: serverTimestamp(),
    isActive: true,
  });

  // Recién ahora cierra la sesión secundaria
  await secondaryAuth.signOut();

  return { uid };
}

// ========== TASK REPORTS FUNCTIONS ==========
export const getTaskReports = async () => {
  const q = query(collection(db, 'taskReports'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const deleteTaskReport = async (reportId: string) => {
  await deleteDoc(doc(db, 'taskReports', reportId));
};