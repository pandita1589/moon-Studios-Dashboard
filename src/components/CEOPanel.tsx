import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import EmployeeProfileModal   from '@/components/EmployeeProfileModal';
import EmployeeCredentialModal from '@/components/EmployeeCredentialModal';
import BarcodeScannerModal    from '@/components/BarcodeScannerModal';
import EmployeeContractModal  from '@/components/EmployeeContractModal';
import { 
  getAllUsers, createTask, deleteTask, 
  getTasks, logActivity, updateUserProfile,
  deleteUserData, createUserWithRole
} from '@/lib/firebase';
import { supabase, REPORTS_BUCKET } from '@/lib/supabaseclient';
import { collection, getDocs, query, orderBy, doc, deleteDoc, writeBatch, addDoc, getDoc, setDoc} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { 
  Crown, Users, CheckSquare, Trash2, Plus, UserPlus,
  RefreshCw, Search, Mail, User, Shield, Eye, EyeOff,
  CheckCircle, AlertCircle, Lock, Calendar, Flag,
  UserCheck, UsersRound, ChevronRight, ClipboardList,
  FileText, Download, File, XCircle, Filter, Clock, 
  CheckCheck, QrCode, ScanLine, Database, Image as ImageIcon, 
  ChevronLeft, MonitorPlay,
  // NUEVOS ICONOS - AGREGAR ESTOS:
  Play, Pause, ZoomIn, ZoomOut, Maximize2, Minimize2, 
  ChevronUp, ChevronDown, X, Settings, Info, Link 
} from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';
import { Timestamp } from '@/lib/firebase';
import { deleteAuthUser } from '@/services/discordApi';

/* ─── TIPOS (definidos fuera del componente) ─── */
interface NewUserForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  role: UserRole;
}

interface FormError {
  field: string;
  message: string;
}

type AssignMode = 'user' | 'role';

interface TaskReport {
  id: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  userRole: string;
  status: 'completed' | 'in-progress' | 'not-completed';
  comment: string;
  files: { url: string; name: string; type: string; size?: number }[];
  createdAt: any;
  reportPath?: string;
}

interface Banner {
  id: string;
  url: string;
  titulo: string;
  descripcion?: string;
  creadoEn: any;
}

interface CollectionStat {
  name: string;
  count: number;
}

interface SupabaseFileStat {
  name: string;
  size: number;
  type: 'image' | 'video' | 'document' | 'other';
}

/* ─── CONSTANTES Y HELPERS (fuera del componente) ─── */
const passwordRules = [
  { id: 'length',  label: 'Mínimo 8 caracteres',        test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'Al menos una mayúscula',      test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number',  label: 'Al menos un número',          test: (p: string) => /\d/.test(p) },
];

const ROLE_PALETTE = [
  { color: 'text-purple-400', bg: 'bg-purple-950/60', border: 'border-purple-800/60' },
  { color: 'text-blue-400',   bg: 'bg-blue-950/60',   border: 'border-blue-800/60'   },
  { color: 'text-zinc-400',   bg: 'bg-zinc-800/60',   border: 'border-zinc-700/60'   },
  { color: 'text-emerald-400',bg: 'bg-emerald-950/60',border: 'border-emerald-800/60'},
  { color: 'text-yellow-400', bg: 'bg-yellow-950/60', border: 'border-yellow-800/60' },
  { color: 'text-pink-400',   bg: 'bg-pink-950/60',   border: 'border-pink-800/60'   },
  { color: 'text-orange-400', bg: 'bg-orange-950/60', border: 'border-orange-800/60' },
];

const FIXED_ROLES: UserRole[] = ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación'];

const PRIORITY_CONFIG = {
  high:   { label: 'Alta',   color: 'text-red-400',    bg: 'bg-red-950/60',    border: 'border-red-800/60',    dot: 'bg-red-400'    },
  medium: { label: 'Media',  color: 'text-yellow-400', bg: 'bg-yellow-950/60', border: 'border-yellow-800/60', dot: 'bg-yellow-400' },
  low:    { label: 'Baja',   color: 'text-green-400',  bg: 'bg-green-950/60',  border: 'border-green-800/60',  dot: 'bg-green-400'  },
};

const REPORT_STATUS_CONFIG = {
  completed:     { label: 'Completada',     color: 'text-green-400',  bg: 'bg-green-950/60',  border: 'border-green-800/60',  icon: CheckCheck },
  'in-progress': { label: 'En Desarrollo',  color: 'text-blue-400',   bg: 'bg-blue-950/60',   border: 'border-blue-800/60',   icon: Clock },
  'not-completed': { label: 'No Completada', color: 'text-red-400',   bg: 'bg-red-950/60',    border: 'border-red-800/60',    icon: XCircle },
};

const getRoleConfig = (role: string, allRoles: string[]) => {
  const idx = allRoles.indexOf(role);
  const palette = ROLE_PALETTE[idx % ROLE_PALETTE.length];
  return { label: role, ...palette };
};

/* ─── COMPONENTES AUXILIARES (fuera del componente principal) ─── */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const passed = passwordRules.filter(r => r.test(password)).length;
  const color = passed === 3 ? 'bg-green-500' : passed === 2 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? color : 'bg-zinc-800'}`} />
        ))}
      </div>
      <div className="space-y-1">
        {passwordRules.map(rule => (
          <div key={rule.id} className={`flex items-center gap-1.5 text-xs font-extralight transition-colors ${rule.test(password) ? 'text-green-400' : 'text-zinc-600'}`}>
            <CheckCircle className="w-3 h-3" />
            {rule.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── COMPONENTE PRINCIPAL ─── */
const CEOPanel: React.FC = () => {
  const { userProfile } = useAuth();

  // ─── TODOS LOS HOOKS DE ESTADO PRIMERO ───
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormError[]>([]);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [credentialUser, setCredentialUser] = useState<UserProfile | null>(null);
  const [showCredential, setShowCredential] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [contractUser, setContractUser] = useState<UserProfile | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'completed' | 'in-progress' | 'not-completed'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<TaskReport | null>(null);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [firestoreStats, setFirestoreStats] = useState<CollectionStat[]>([]);
  const [firestoreTotalDocs, setFirestoreTotalDocs] = useState(0);
  const [supabaseFiles, setSupabaseFiles] = useState<SupabaseFileStat[]>([]);
  const [supabaseTotalSize, setSupabaseTotalSize] = useState(0);
  const [assignMode, setAssignMode] = useState<AssignMode>('user');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '',
    assignedToRole: '' as UserRole | '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: ''
  });
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    role: 'Empleado'
  });
  // ESTOS YA DEBERÍAN EXISTIR (verifícalos):
const [banners, setBanners] = useState<Banner[]>([]);
const [bannerForm, setBannerForm] = useState({ url: '', titulo: '', descripcion: '' });
const [showBannerModal, setShowBannerModal] = useState(false);
const [savingBanner, setSavingBanner] = useState(false);
const [bannerActivo, setBannerActivo] = useState(0);
const [bannersLoading, setBannersLoading] = useState(false);

// ESTOS SON NUEVOS (agregarlos después de los anteriores):
const [bannerSettings, setBannerSettings] = useState({
  autoplay: true,
  interval: 5000,
  transition: 'fade',
  showIndicators: true,
  showControls: true,
  pauseOnHover: true,
  quality: 'auto',
});

const [isFullscreen, setIsFullscreen] = useState(false);
const [zoomLevel, setZoomLevel] = useState(1);
const [isDragging, setIsDragging] = useState(false);
const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
const [lightboxOpen, setLightboxOpen] = useState(false);
const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
const [isPlaying, setIsPlaying] = useState(true);
const [hoveringBanner, setHoveringBanner] = useState(false);
const [saveSuccessModal, setSaveSuccessModal] = useState(false);

const carouselRef = useRef<NodeJS.Timeout | null>(null);
const imageRef = useRef<HTMLImageElement>(null);

  // ─── DERIVADOS (después de los hooks) ───
  const allRoles = Array.from(
    new Set([...FIXED_ROLES, ...users.map(u => u.role)])
  ).filter(Boolean);

  // ─── CALLBACKS (useCallback) ───
  const fetchDatabaseStats = useCallback(async () => {
    setDbLoading(true);
    try {
      const knownCollections = [
        'users', 'tasks', 'taskReports', 'announcements',
        'activities', 'contracts', 'notifications'
      ];

      const collectionResults = await Promise.allSettled(
        knownCollections.map(async (col) => {
          const snap = await getDocs(collection(db, col));
          return { name: col, count: snap.size };
        })
      );

      const colStats: CollectionStat[] = collectionResults
        .filter((r): r is PromiseFulfilledResult<CollectionStat> => r.status === 'fulfilled' && r.value.count >= 0)
        .map(r => r.value);

      setFirestoreStats(colStats);
      setFirestoreTotalDocs(colStats.reduce((acc, c) => acc + c.count, 0));

      const buckets = [REPORTS_BUCKET];
      const allFiles: SupabaseFileStat[] = [];

      for (const bucket of buckets) {
        const listRecursive = async (path: string) => {
          const { data, error } = await supabase.storage.from(bucket).list(path, { limit: 1000 });
          if (error || !data) return;
          for (const item of data) {
            if (item.id !== null) {
              const mime = item.metadata?.mimetype || '';
              const type: SupabaseFileStat['type'] =
                mime.startsWith('image/')  ? 'image'    :
                mime.startsWith('video/')  ? 'video'    :
                mime === 'application/pdf' || mime.includes('word') || mime.includes('document')
                                           ? 'document' : 'other';
              allFiles.push({
                name: item.name,
                size: item.metadata?.size || 0,
                type,
              });
            } else {
              await listRecursive(path ? `${path}/${item.name}` : item.name);
            }
          }
        };
        await listRecursive('');
      }

      setSupabaseFiles(allFiles);
      setSupabaseTotalSize(allFiles.reduce((acc, f) => acc + f.size, 0));

    } catch (e) {
      console.error('Error fetching db stats:', e);
    } finally {
      setDbLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [usersData, tasksData] = await Promise.all([
        getAllUsers(),
        getTasks()
      ]);
      setUsers(usersData as UserProfile[]);
      setTasks(tasksData);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const q = query(collection(db, 'taskReports'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);

      const reportsData = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        const files = Array.isArray(data.attachments)
          ? data.attachments.map((a: any) => ({
              url:  a.url  || '',
              name: a.name || 'archivo',
              type: a.type || 'application/octet-stream',
              size: a.size || 0,
            }))
          : [];

        return {
          id:         docSnapshot.id,
          taskId:     data.taskId      || '',
          taskTitle:  data.taskTitle   || '',
          userId:     data.reportedBy  || '',
          userName:   data.reporterName || '',
          userRole:   data.reporterRole || '',
          status:     data.reportStatus || 'in-progress',
          comment:    data.comment     || '',
          files,
          createdAt:  data.createdAt,
          reportPath: `${data.taskId}/${data.reportedBy}`,
        } as TaskReport & { reportPath: string };
      });

      setReports(reportsData);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const fetchBanners = useCallback(async () => {
  setBannersLoading(true);
  try {
    const snap = await getDocs(
      query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc'))
    );
    setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));

    // ← NUEVO: cargar config guardada
    const configSnap = await getDoc(doc(db, 'dashboard_config', 'banner_settings'));
    if (configSnap.exists()) {
      const cfg = configSnap.data();
      setBannerSettings(s => ({
        ...s,
        interval: cfg.interval ?? s.interval,
        quality:  cfg.quality  ?? s.quality,
      }));
      setIsPlaying(cfg.autoplay ?? true);
    }
  } catch (e) { 
    console.error(e); 
  } finally { 
    setBannersLoading(false); 
  }
}, []);

  // ─── EFECTOS ───
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => { 
    fetchData(); 
    fetchReports(); 
    fetchBanners();
  }, [fetchData, fetchReports, fetchBanners]);

   useEffect(() => {
  if (!isPlaying || banners.length <= 1 || hoveringBanner) return;
  
  carouselRef.current = setInterval(() => {
    setBannerActivo(prev => (prev + 1) % banners.length);
  }, bannerSettings.interval);

  return () => {
    if (carouselRef.current) clearInterval(carouselRef.current);
  };
}, [isPlaying, banners.length, hoveringBanner, bannerSettings.interval]);

  // ─── FUNCIONES AUXILIARES ───
  const openFileViewer = (file: { url: string; name: string; type: string }) => {
    setViewerFile(file);
    setShowViewer(true);
  };

  const validateForm = (): boolean => {
    const errors: FormError[] = [];
    if (!newUser.displayName.trim())
      errors.push({ field: 'displayName', message: 'El nombre es obligatorio' });
    if (!newUser.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email))
      errors.push({ field: 'email', message: 'Ingresa un correo válido' });
    if (!passwordRules.every(r => r.test(newUser.password)))
      errors.push({ field: 'password', message: 'La contraseña no cumple los requisitos' });
    if (newUser.password !== newUser.confirmPassword)
      errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
    setFormErrors(errors);
    return errors.length === 0;
  };

  const getFieldError = (field: string) =>
    formErrors.find(e => e.field === field)?.message;

  const handleCreateUser = async () => {
    if (!validateForm()) return;
    setIsCreatingUser(true);
    setCreateSuccess(null);
    try {
      await createUserWithRole(newUser.email, newUser.password, newUser.displayName, newUser.role);
      await logActivity('USER_CREATED',
        { email: newUser.email, displayName: newUser.displayName, role: newUser.role },
        userProfile?.uid || '', userProfile?.displayName || '');
      setCreateSuccess(`✓ ${newUser.displayName} creado correctamente`);
      setTimeout(() => {
        setShowAddUser(false);
        setCreateSuccess(null);
        resetForm();
        fetchData();
      }, 1500);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use'
        ? 'Este correo ya está registrado en el sistema'
        : error.code === 'auth/invalid-email'
        ? 'El formato del correo no es válido'
        : error.message || 'Error al crear el usuario';
      setFormErrors([{ field: 'email', message: msg }]);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const resetForm = () => {
    setNewUser({ email: '', password: '', confirmPassword: '', displayName: '', role: 'Empleado' });
    setFormErrors([]);
    setCreateSuccess(null);
    setShowPassword(false);
    setShowConfirm(false);
  };

  const handleDeleteUser = async (uid: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name || uid}?\n\nEsto borrará su cuenta completamente.`)) return;
    setIsDeletingUser(uid);
    try {
      await deleteUserData(uid);
      await deleteAuthUser(uid);
      await logActivity('USER_DELETED', { userId: uid, userName: name || uid },
        userProfile?.uid || '', userProfile?.displayName || 'CEO');
      await fetchData();
    } catch (error: any) {
      alert(error.message || 'Error al eliminar usuario');
    } finally {
      setIsDeletingUser(null);
    }
  };

  const handleChangeRole = async (uid: string, newRole: UserRole) => {
    try {
      await updateUserProfile(uid, { role: newRole });
      await logActivity('ROLE_CHANGED', { userId: uid, newRole },
        userProfile?.uid || '', userProfile?.displayName || '');
      fetchData();
    } catch {
      alert('Error al cambiar rol');
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) { alert('El título es obligatorio'); return; }
    if (assignMode === 'user' && !newTask.assignedTo) { alert('Selecciona un usuario'); return; }
    if (assignMode === 'role' && !newTask.assignedToRole) { alert('Selecciona un rol'); return; }
    if (!newTask.dueDate) { alert('La fecha límite es obligatoria'); return; }

    try {
      await createTask({
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: 'pending',
        createdBy: userProfile?.uid,
        createdByName: userProfile?.displayName,
        date: Timestamp.fromDate(new Date(newTask.dueDate)),
        ...(assignMode === 'user'
          ? { assignedTo: newTask.assignedTo, assignedToRole: null }
          : { assignedTo: null, assignedToRole: newTask.assignedToRole }
        ),
      });
      await logActivity('TASK_CREATED', { title: newTask.title },
        userProfile?.uid || '', userProfile?.displayName || '');
      setNewTask({ title: '', description: '', assignedTo: '', assignedToRole: '', priority: 'medium', dueDate: '' });
      setShowAddTask(false);
      fetchData();
    } catch {
      alert('Error al crear tarea');
    }
  };

  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!confirm(`¿Eliminar tarea "${title}"?`)) return;
    try {
      await deleteTask(taskId);
      await logActivity('TASK_DELETED', { taskId, title },
        userProfile?.uid || '', userProfile?.displayName || '');
      fetchData();
    } catch {
      alert('Error al eliminar tarea');
    }
  };

  const handleDeleteReport = async (reportId: string, reportPath: string) => {
    if (!confirm('¿Eliminar este reporte permanentemente?\n\nSe borrarán también los archivos adjuntos.')) return;
    
    try {
      if (reportPath) {
        const { data: filesList } = await supabase.storage
          .from(REPORTS_BUCKET)
          .list(reportPath);
        
        if (filesList && filesList.length > 0) {
          const filesToDelete = filesList.map((f: any) => `${reportPath}/${f.name}`);
          await supabase.storage.from(REPORTS_BUCKET).remove(filesToDelete);
        }
      }

      await deleteDoc(doc(db, 'taskReports', reportId));
      
      await logActivity('REPORT_DELETED', { reportId },
        userProfile?.uid || '', userProfile?.displayName || 'CEO');
      
      fetchReports();
    } catch (error) {
      console.error('Error deleting report:', error);
      alert('Error al eliminar el reporte');
    }
  };

  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading:', error);
      alert('Error al descargar el archivo');
    }
  };

  const handleSaveBanner = async () => {
  if (!bannerForm.url || !bannerForm.titulo) return;
  setSavingBanner(true);
  try {
    await addDoc(collection(db, 'dashboard_banners'), {
      url: bannerForm.url,
      titulo: bannerForm.titulo,
      descripcion: bannerForm.descripcion,
      creadoEn: Timestamp.now(),
    });
    setBannerForm({ url: '', titulo: '', descripcion: '' });
    setShowBannerModal(false);
    fetchBanners();
  } catch (e) { 
    console.error(e); 
  } finally { 
    setSavingBanner(false); 
  }
};

  const handleDeleteBanner = async (id: string) => {
  if (!confirm('¿Eliminar este banner del dashboard?')) return;
  try {
    await deleteDoc(doc(db, 'dashboard_banners', id));
    setBannerActivo(0);
    fetchBanners();
  } catch (e) { 
    console.error(e); 
  }
};

  // ─── DERIVADOS DE RENDERIZADO ───
  const reportStats = {
    total: reports.length,
    completed: reports.filter(r => r.status === 'completed').length,
    inProgress: reports.filter(r => r.status === 'in-progress').length,
    notCompleted: reports.filter(r => r.status === 'not-completed').length,
  };

  const filteredReports = reports.filter(report => {
    const matchesFilter = reportFilter === 'all' || report.status === reportFilter;
    const matchesSearch = 
      report.taskTitle?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.userName?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.comment?.toLowerCase().includes(reportSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUser.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    const cfg = getRoleConfig(role, allRoles);
    return (
      <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border font-extralight hover:${cfg.bg}`}>
        {cfg.label}
      </Badge>
    );
  };

  const getAssignedLabel = (task: any) => {
    if (task.assignedToRole) {
      const cfg = getRoleConfig(task.assignedToRole, allRoles);
      return (
        <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
          <UsersRound className="w-3 h-3" />
          {cfg.label}
        </span>
      );
    }
    const user = users.find(u => u.uid === task.assignedTo);
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
        <UserCheck className="w-3 h-3" />
        {user?.displayName ?? 'Sin asignar'}
      </span>
    );
  };

  // ─── EARLY RETURN DESPUÉS DE TODOS LOS HOOKS ───
  if (loading || !mounted) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
    </div>
  );

  // ─── RENDER ───
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extralight text-white flex items-center gap-3">
          <Crown className="w-6 h-6 text-yellow-500" strokeWidth={1.5} />
          Panel de Control CEO
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            await Promise.all([fetchData(), fetchReports()]);
            setRefreshing(false);
          }}
          className="border-zinc-800 text-white hover:bg-zinc-900 transition-all"
        >
          <RefreshCw className={`w-4 h-4 transition-transform duration-700 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="bg-zinc-950 border border-zinc-800">
          <TabsTrigger value="employees" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Users className="w-4 h-4 mr-2" /> Empleados
          </TabsTrigger>
          <TabsTrigger value="tasks" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <CheckSquare className="w-4 h-4 mr-2" /> Tareas
          </TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <FileText className="w-4 h-4 mr-2" /> Reportes
            {reportStats.total > 0 && (
              <Badge className="ml-2 bg-zinc-800 text-zinc-300 text-xs px-1.5 py-0">
                {reportStats.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="database" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Database className="w-4 h-4 mr-2" /> Database
          </TabsTrigger>
          <TabsTrigger value="banners" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <MonitorPlay className="w-4 h-4 mr-2" /> Banners
            {banners.length > 0 && (
              <Badge className="ml-2 bg-zinc-800 text-zinc-300 text-xs px-1.5 py-0">{banners.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* PESTAÑA: EMPLEADOS */}
        <TabsContent value="employees" className="mt-6 space-y-4">
          <div className="flex gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input value={searchUser} onChange={(e) => setSearchUser(e.target.value)}
                placeholder="Buscar por nombre o email..."
                className="pl-10 bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowScanner(true)}
                className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 font-extralight"
              >
                <ScanLine className="w-4 h-4 mr-2" /> Escanear
              </Button>
              <Button onClick={() => { resetForm(); setShowAddUser(true); }}
                className="bg-white text-black hover:bg-zinc-200 font-extralight">
                <UserPlus className="w-4 h-4 mr-2" /> Agregar Usuario
              </Button>
            </div>
          </div>

          <Dialog open={showAddUser} onOpenChange={(open) => { if (!isCreatingUser) { setShowAddUser(open); if (!open) resetForm(); } }}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md"
              onPointerDownOutside={(e) => { if (isCreatingUser) e.preventDefault(); }}>
              <DialogHeader>
                <DialogTitle className="font-extralight text-lg flex items-center gap-2">
                  <UserPlus className="w-5 h-5" /> Crear Nuevo Usuario
                </DialogTitle>
                <DialogDescription className="text-zinc-500 font-extralight text-sm">
                  El usuario podrá iniciar sesión con las credenciales que definas.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 font-extralight flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> Nombre completo
                  </Label>
                  <Input value={newUser.displayName}
                    onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                    className={`bg-zinc-900 border-zinc-800 text-white font-extralight ${getFieldError('displayName') ? 'border-red-800' : ''}`}
                    disabled={isCreatingUser} />
                  {getFieldError('displayName') && (
                    <p className="text-red-400 text-xs font-extralight flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{getFieldError('displayName')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 font-extralight flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> Correo electrónico
                  </Label>
                  <Input type="email" value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="usuario@empresa.com"
                    className={`bg-zinc-900 border-zinc-800 text-white font-extralight ${getFieldError('email') ? 'border-red-800' : ''}`}
                    disabled={isCreatingUser} />
                  {getFieldError('email') && (
                    <p className="text-red-400 text-xs font-extralight flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{getFieldError('email')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 font-extralight flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5" /> Contraseña
                  </Label>
                  <div className="relative">
                    <Input type={showPassword ? 'text' : 'password'} value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Mínimo 8 caracteres"
                      className={`bg-zinc-900 border-zinc-800 text-white font-extralight pr-10 ${getFieldError('password') ? 'border-red-800' : ''}`}
                      disabled={isCreatingUser} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={newUser.password} />
                  {getFieldError('password') && (
                    <p className="text-red-400 text-xs font-extralight flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{getFieldError('password')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 font-extralight flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5" /> Confirmar contraseña
                  </Label>
                  <div className="relative">
                    <Input type={showConfirm ? 'text' : 'password'} value={newUser.confirmPassword}
                      onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                      placeholder="Repite la contraseña"
                      className={`bg-zinc-900 border-zinc-800 text-white font-extralight pr-10 ${getFieldError('confirmPassword') ? 'border-red-800' : ''}`}
                      disabled={isCreatingUser} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newUser.confirmPassword && newUser.password === newUser.confirmPassword && (
                    <p className="text-green-400 text-xs font-extralight flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Las contraseñas coinciden
                    </p>
                  )}
                  {getFieldError('confirmPassword') && (
                    <p className="text-red-400 text-xs font-extralight flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{getFieldError('confirmPassword')}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-400 font-extralight flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Rol del usuario
                  </Label>
                  <Select value={newUser.role}
                    onValueChange={(value: UserRole) => setNewUser({ ...newUser, role: value })}
                    disabled={isCreatingUser}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {allRoles.map(role => (
                        <SelectItem key={role} value={role} className="text-white font-extralight">
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {createSuccess && (
                  <div className="p-3 bg-green-950/40 border border-green-900/50 rounded-md flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    <p className="text-green-400 text-sm font-extralight">{createSuccess}</p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddUser(false)}
                  className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight"
                  disabled={isCreatingUser}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateUser} disabled={isCreatingUser}
                  className="bg-white text-black hover:bg-zinc-200 font-extralight">
                  {isCreatingUser
                    ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Creando...</>
                    : <><UserPlus className="w-4 h-4 mr-2" />Crear Usuario</>
                  }
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="bg-zinc-950 border-zinc-800" style={{ overflow: 'visible' }}>
            <CardHeader className="pb-4">
              <CardTitle className="text-zinc-400 font-extralight text-sm uppercase tracking-wider">
                Total: {filteredUsers.length} usuarios
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0" style={{ overflow: 'visible' }}>
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 font-extralight">No se encontraron usuarios</div>
              ) : (
                filteredUsers.map((user) => (
                  <div key={user.uid}
                    className="flex items-center justify-between p-4 border-b border-zinc-800 last:border-0 hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden">
                        {user.avatar ? (
                          <img 
                            src={user.avatar} 
                            alt={user.displayName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-white font-extralight text-lg">
                            {user.displayName?.[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-white font-extralight flex items-center gap-2">
                          {user.displayName}
                          {user.uid === userProfile?.uid && (
                            <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-500">Tú</Badge>
                          )}
                        </p>
                        <p className="text-zinc-500 text-sm font-extralight">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRoleBadge(user.role)}

                      <Button variant="ghost" size="sm"
                        onClick={() => { setProfileUser(user); setShowProfile(true); }}
                        className="text-zinc-500 hover:text-white hover:bg-zinc-800"
                        title="Ver perfil">
                        <Eye className="w-4 h-4" />
                      </Button>

                      <Button variant="ghost" size="sm"
                        onClick={() => { setCredentialUser(user); setShowCredential(true); }}
                        className="text-zinc-500 hover:text-white hover:bg-zinc-800"
                        title="Generar credencial">
                        <QrCode className="w-4 h-4" />
                      </Button>

                      <Button variant="ghost" size="sm"
                        onClick={() => { setContractUser(user); setShowContract(true); }}
                        className="text-zinc-500 hover:text-white hover:bg-zinc-800"
                        title="Gestionar contratos">
                        <FileText className="w-4 h-4" />
                      </Button>

                      <Select value={user.role}
                        onValueChange={(value: UserRole) => handleChangeRole(user.uid, value)}
                        disabled={user.uid === userProfile?.uid}>
                        <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800 text-white font-extralight text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800" style={{ zIndex: 9999 }}>
                          {(['CEO','Administración','Diseño','Secretaría','Programación','Contador','Empleado'] as UserRole[]).map(role => {
                            const cfg = getRoleConfig(role, allRoles);
                            return (
                              <SelectItem key={role} value={role} className="font-extralight">
                                <span className={`flex items-center gap-2 ${cfg.color}`}>
                                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: cfg.color.includes('purple') ? '#c084fc' : cfg.color.includes('blue') ? '#60a5fa' : cfg.color.includes('violet') ? '#a78bfa' : cfg.color.includes('green') ? '#4ade80' : cfg.color.includes('pink') ? '#f472b6' : cfg.color.includes('emerald') ? '#34d399' : '#6b7280' }} />
                                  {role}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>

                      {user.uid !== userProfile?.uid && (
                        <Button variant="ghost" size="sm"
                          onClick={() => handleDeleteUser(user.uid, user.displayName)}
                          disabled={isDeletingUser === user.uid}
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/30">
                          {isDeletingUser === user.uid
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PESTAÑA: TAREAS */}
        <TabsContent value="tasks" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-zinc-400 font-extralight text-sm">
                {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} en total
              </p>
            </div>
            <Button
              onClick={() => setShowAddTask(!showAddTask)}
              className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
              <Plus className="w-4 h-4" />
              {showAddTask ? 'Cerrar formulario' : 'Nueva Tarea'}
            </Button>
          </div>

          {showAddTask && (
            <Card className="bg-zinc-950 border-zinc-800 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-zinc-900/40">
                <ClipboardList className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                <span className="text-white font-extralight text-sm tracking-wide">Crear nueva tarea</span>
              </div>

              <CardContent className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
                      Título *
                    </Label>
                    <Input
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="Ej: Revisar contratos Q3"
                      className="bg-zinc-900 border-zinc-800 text-white font-extralight placeholder:text-zinc-600 focus:border-zinc-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Flag className="w-3 h-3" /> Prioridad
                    </Label>
                    <Select
                      value={newTask.priority}
                      onValueChange={(v: 'low' | 'medium' | 'high') => setNewTask({ ...newTask, priority: v })}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                        <SelectItem value="high" className="font-extralight">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Alta
                          </span>
                        </SelectItem>
                        <SelectItem value="medium" className="font-extralight">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Media
                          </span>
                        </SelectItem>
                        <SelectItem value="low" className="font-extralight">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Baja
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
                    Descripción
                  </Label>
                  <Textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="Detalla el objetivo o los pasos de esta tarea..."
                    rows={3}
                    className="bg-zinc-900 border-zinc-800 text-white font-extralight placeholder:text-zinc-600 resize-none focus:border-zinc-600"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">
                    Asignar a *
                  </Label>

                  <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAssignMode('user');
                        setNewTask({ ...newTask, assignedToRole: '' });
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-extralight transition-all duration-150 ${
                        assignMode === 'user'
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Usuario específico
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignMode('role');
                        setNewTask({ ...newTask, assignedTo: '' });
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-extralight transition-all duration-150 ${
                        assignMode === 'role'
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <UsersRound className="w-3.5 h-3.5" />
                      Por rol
                    </button>
                  </div>

                  {assignMode === 'user' && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                      {users.length === 0 ? (
                        <p className="p-4 text-zinc-500 font-extralight text-sm text-center">
                          No hay usuarios disponibles
                        </p>
                      ) : (
                        <div className="divide-y divide-zinc-800 max-h-52 overflow-y-auto">
                          {users.map(u => {
                            const isSelected = newTask.assignedTo === u.uid;
                            const roleCfg = getRoleConfig(u.role, allRoles);
                            return (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => setNewTask({ ...newTask, assignedTo: u.uid })}
                                className={`w-full flex items-center justify-between px-4 py-3 transition-colors text-left
                                  ${isSelected
                                    ? 'bg-zinc-800 border-l-2 border-l-white'
                                    : 'hover:bg-zinc-800/50 border-l-2 border-l-transparent'
                                  }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-sm font-extralight">
                                      {u.displayName?.[0]?.toUpperCase() ?? '?'}
                                    </span>
                                  </div>
                                  <div>
                                    <p className={`text-sm font-extralight ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                      {u.displayName}
                                    </p>
                                    <p className="text-zinc-500 text-xs font-extralight">{u.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-extralight px-2 py-0.5 rounded-full border ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}>
                                    {roleCfg.label}
                                  </span>
                                  {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {assignMode === 'role' && (
                    <div className="grid grid-cols-3 gap-3">
                      {allRoles.map(role => {
                        const cfg = getRoleConfig(role, allRoles);
                        const isSelected = newTask.assignedToRole === role;
                        const count = users.filter(u => u.role === role).length;
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setNewTask({ ...newTask, assignedToRole: role as UserRole })}
                            className={`flex flex-col gap-2 p-4 rounded-lg border transition-all duration-150 text-left
                              ${isSelected
                                ? `${cfg.bg} ${cfg.border} border-2`
                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <UsersRound className={`w-4 h-4 ${isSelected ? cfg.color : 'text-zinc-500'}`} />
                              {isSelected && <CheckCircle className={`w-3.5 h-3.5 ${cfg.color}`} />}
                            </div>
                            <div>
                              <p className={`text-sm font-extralight ${isSelected ? cfg.color : 'text-zinc-300'}`}>
                                {cfg.label}
                              </p>
                              <p className="text-zinc-600 text-xs font-extralight mt-0.5">
                                {count} {count === 1 ? 'miembro' : 'miembros'}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(newTask.assignedTo || newTask.assignedToRole) && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-extralight">
                      <ChevronRight className="w-3 h-3 text-zinc-600" />
                      {assignMode === 'user'
                        ? `Asignado a: ${users.find(u => u.uid === newTask.assignedTo)?.displayName}`
                        : `Asignado al rol: ${getRoleConfig(newTask.assignedToRole, allRoles)?.label}`
                      }
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Fecha límite *
                  </Label>
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="bg-zinc-900 border-zinc-800 text-white font-extralight max-w-xs focus:border-zinc-600 [color-scheme:dark]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowAddTask(false);
                      setNewTask({ title: '', description: '', assignedTo: '', assignedToRole: '', priority: 'medium', dueDate: '' });
                    }}
                    className="text-zinc-400 hover:text-white hover:bg-zinc-900 font-extralight"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreateTask}
                    className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Crear Tarea
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tasks.length === 0 && !showAddTask ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckSquare className="w-10 h-10 text-zinc-700 mb-3" strokeWidth={1} />
              <p className="text-zinc-500 font-extralight">No hay tareas creadas</p>
              <p className="text-zinc-700 text-sm font-extralight mt-1">Pulsa "Nueva Tarea" para empezar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => {
                const priCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
                return (
                  <Card key={task.id} className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${priCfg.dot}`} />
                          <div className="min-w-0">
                            <p className="text-white font-extralight truncate">{task.title}</p>
                            {task.description && (
                              <p className="text-zinc-500 text-sm font-extralight mt-0.5 line-clamp-1">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center flex-wrap gap-3 mt-2">
                              <span className={`inline-flex items-center gap-1 text-xs font-extralight px-2 py-0.5 rounded-full border ${priCfg.bg} ${priCfg.color} ${priCfg.border}`}>
                                <Flag className="w-2.5 h-2.5" />
                                {priCfg.label}
                              </span>
                              {getAssignedLabel(task)}
                              {task.date && (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-600 font-extralight">
                                  <Calendar className="w-3 h-3" />
                                  {task.date?.toDate?.()
                                    ? new Date(task.date.toDate()).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : task.dueDate
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id, task.title)}
                          className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 flex-shrink-0 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* PESTAÑA: REPORTES */}
        <TabsContent value="reports" className="mt-6 space-y-5">
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-zinc-950 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Total Reportes</p>
                    <p className="text-2xl font-extralight text-white mt-1">{reportStats.total}</p>
                  </div>
                  <FileText className="w-5 h-5 text-zinc-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-950 border-zinc-800 border-green-900/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-400 text-xs font-extralight uppercase tracking-wider">Completadas</p>
                    <p className="text-2xl font-extralight text-white mt-1">{reportStats.completed}</p>
                  </div>
                  <CheckCheck className="w-5 h-5 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800 border-blue-900/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-400 text-xs font-extralight uppercase tracking-wider">En Desarrollo</p>
                    <p className="text-2xl font-extralight text-white mt-1">{reportStats.inProgress}</p>
                  </div>
                  <Clock className="w-5 h-5 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800 border-red-900/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-400 text-xs font-extralight uppercase tracking-wider">No Completadas</p>
                    <p className="text-2xl font-extralight text-white mt-1">{reportStats.notCompleted}</p>
                  </div>
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input 
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                placeholder="Buscar por tarea, usuario o comentario..."
                className="pl-10 bg-zinc-900 border-zinc-800 text-white font-extralight"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-500" />
              <Select value={reportFilter} onValueChange={(v: any) => setReportFilter(v)}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all" className="font-extralight">Todos los estados</SelectItem>
                  <SelectItem value="completed" className="font-extralight">Completadas</SelectItem>
                  <SelectItem value="in-progress" className="font-extralight">En Desarrollo</SelectItem>
                  <SelectItem value="not-completed" className="font-extralight">No Completadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {reportsLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-10 h-10 text-zinc-700 mb-3" strokeWidth={1} />
              <p className="text-zinc-500 font-extralight">
                {reports.length === 0 ? 'No hay reportes enviados aún' : 'No se encontraron reportes con los filtros seleccionados'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => {
                const statusCfg = REPORT_STATUS_CONFIG[report.status];
                const StatusIcon = statusCfg.icon;
                
                return (
                  <Card 
                    key={report.id} 
                    className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedReport(report);
                      setShowReportDetail(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-extralight truncate">{report.taskTitle}</h3>
                            <Badge className={`${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border font-extralight`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusCfg.label}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-zinc-500 font-extralight">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {report.userName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {report.createdAt?.toDate 
                                ? new Date(report.createdAt.toDate()).toLocaleDateString('es-PE')
                                : new Date(report.createdAt).toLocaleDateString('es-PE')
                              }
                            </span>
                            {report.files?.length > 0 && (
                              <span className="flex items-center gap-1 text-zinc-400">
                                <Download className="w-3 h-3" />
                                {report.files.length} archivo{report.files.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {report.comment && (
                            <p className="text-zinc-400 text-sm font-extralight mt-2 line-clamp-2">
                              "{report.comment}"
                            </p>
                          )}
                          
                          {report.files && report.files.length > 0 && (
                            <div className="flex items-center gap-2 mt-3">
                              {report.files.slice(0, 4).map((file, idx) => (
                                <button
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFileViewer(file);
                                  }}
                                  className="w-10 h-10 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:border-zinc-500 transition-colors overflow-hidden"
                                  title={file.name}
                                >
                                  {file.type.startsWith('image/') ? (
                                    <img 
                                      src={file.url} 
                                      alt=""
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <File className="w-5 h-5 text-zinc-500" />
                                  )}
                                </button>
                              ))}
                              {report.files.length > 4 && (
                                <span className="text-xs text-zinc-500 font-extralight">
                                  +{report.files.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteReport(report.id, (report as any).reportPath);
                            }}
                            className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <ChevronRight className="w-5 h-5 text-zinc-600 flex-shrink-0" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Dialog open={showReportDetail} onOpenChange={setShowReportDetail}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
              {selectedReport && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <DialogTitle className="font-extralight text-lg">
                        {selectedReport.taskTitle}
                      </DialogTitle>
                      {(() => {
                        const cfg = REPORT_STATUS_CONFIG[selectedReport.status];
                        const Icon = cfg.icon;
                        return (
                          <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border font-extralight`}>
                            <Icon className="w-3 h-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        );
                      })()}
                    </div>
                    <DialogDescription className="text-zinc-500 font-extralight">
                      Reporte enviado por {selectedReport.userName} • {
                        selectedReport.createdAt?.toDate 
                          ? new Date(selectedReport.createdAt.toDate()).toLocaleString('es-PE')
                          : new Date(selectedReport.createdAt).toLocaleString('es-PE')
                      }
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 py-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-500 text-xs uppercase tracking-wider font-extralight">
                        Estado Reportado
                      </Label>
                      <div className={`p-3 rounded-lg border ${REPORT_STATUS_CONFIG[selectedReport.status].bg} ${REPORT_STATUS_CONFIG[selectedReport.status].border}`}>
                        <p className={`font-extralight ${REPORT_STATUS_CONFIG[selectedReport.status].color}`}>
                          {REPORT_STATUS_CONFIG[selectedReport.status].label}
                        </p>
                      </div>
                    </div>

                    {selectedReport.comment && (
                      <div className="space-y-2">
                        <Label className="text-zinc-500 text-xs uppercase tracking-wider font-extralight">
                          Comentario / Avance
                        </Label>
                        <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                          <p className="text-zinc-300 font-extralight whitespace-pre-wrap">
                            {selectedReport.comment}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedReport.files && selectedReport.files.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-zinc-500 text-xs uppercase tracking-wider font-extralight">
                          Archivos Adjuntos ({selectedReport.files.length})
                        </Label>
                        <div className="grid grid-cols-2 gap-3">
                          {selectedReport.files.map((file, idx) => {
                            const isImage = file.type?.startsWith('image/');
                            const isVideo = file.type?.startsWith('video/');
                            return (
                              <div 
                                key={idx}
                                className="group relative bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors overflow-hidden cursor-pointer"
                                onClick={() => openFileViewer(file)}
                              >
                                {isImage && (
                                  <div className="aspect-video w-full bg-zinc-950 flex items-center justify-center overflow-hidden">
                                    <img 
                                      src={file.url} 
                                      alt={file.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                
                                {isVideo && (
                                  <div className="aspect-video w-full bg-zinc-950 flex items-center justify-center">
                                    <video 
                                      src={file.url}
                                      className="w-full h-full object-cover"
                                      preload="metadata"
                                    />
                                  </div>
                                )}
                                
                                {!isImage && !isVideo && (
                                  <div className="aspect-video w-full bg-zinc-900 flex items-center justify-center">
                                    <File className="w-12 h-12 text-zinc-600" />
                                  </div>
                                )}

                                <div className="p-3">
                                  <p className="text-zinc-300 text-sm font-extralight truncate">
                                    {file.name}
                                  </p>
                                  {file.size && file.size > 0 && (
                                    <p className="text-zinc-600 text-xs font-extralight">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openFileViewer(file);
                                      }}
                                    >
                                      <Eye className="w-3 h-3 mr-1" />
                                      Ver
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadFile(file.url, file.name);
                                      }}
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Descargar
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button 
                      onClick={() => setShowReportDetail(false)}
                      className="bg-white text-black hover:bg-zinc-200 font-extralight"
                    >
                      Cerrar
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* PESTAÑA: DATABASE */}
        <TabsContent value="database" className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 font-extralight text-sm uppercase tracking-wider">
              Estado de bases de datos
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={dbLoading}
              onClick={fetchDatabaseStats}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${dbLoading ? 'animate-spin' : ''}`} />
              {dbLoading ? 'Cargando...' : 'Actualizar'}
            </Button>
          </div>

          {dbLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-zinc-600" />
            </div>
          ) : firestoreStats.length === 0 && supabaseFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Database className="w-12 h-12 text-zinc-700 mb-3" strokeWidth={1} />
              <p className="text-zinc-500 font-extralight">Presiona "Actualizar" para cargar las estadísticas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <h3 className="text-white font-extralight tracking-wide">Firebase</h3>
                  <Badge className="ml-auto bg-orange-950/60 text-orange-400 border border-orange-800/60 font-extralight text-xs">
                    Firestore + Storage
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardContent className="p-4">
                      <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Total Documentos</p>
                      <p className="text-2xl font-extralight text-white mt-1">{firestoreTotalDocs.toLocaleString()}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-zinc-950 border-zinc-800">
                    <CardContent className="p-4">
                      <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Colecciones activas</p>
                      <p className="text-2xl font-extralight text-white mt-1">
                        {firestoreStats.filter(c => c.count > 0).length}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-zinc-950 border-zinc-800">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-zinc-400 font-extralight text-xs uppercase tracking-wider">
                      Colecciones
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 pb-2">
                    {firestoreStats.map((col) => (
                      <div key={col.name}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-900 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${col.count > 0 ? 'bg-orange-400' : 'bg-zinc-700'}`} />
                          <span className="text-zinc-300 font-extralight text-sm">{col.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500/70 rounded-full"
                              style={{
                                width: firestoreTotalDocs > 0
                                  ? `${(col.count / firestoreTotalDocs) * 100}%`
                                  : '0%'
                              }}
                            />
                          </div>
                          <Badge className="bg-zinc-900 text-zinc-400 border border-zinc-800 font-extralight text-xs min-w-[2.5rem] justify-center">
                            {col.count.toLocaleString()}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg">
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider mb-2">
                    Cuota Firestore (plan gratuito)
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Lecturas/día', limit: '50,000' },
                      { label: 'Escrituras/día', limit: '20,000' },
                      { label: 'Almacenamiento', limit: '1 GB' },
                    ].map(item => (
                      <div key={item.label} className="bg-zinc-950 rounded p-2 border border-zinc-800">
                        <p className="text-zinc-300 font-extralight text-sm">{item.limit}</p>
                        <p className="text-zinc-600 text-xs font-extralight mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h3 className="text-white font-extralight tracking-wide">Supabase</h3>
                  <Badge className="ml-auto bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-extralight text-xs">
                    Storage
                  </Badge>
                </div>

                {(() => {
                  const images    = supabaseFiles.filter(f => f.type === 'image');
                  const videos    = supabaseFiles.filter(f => f.type === 'video');
                  const documents = supabaseFiles.filter(f => f.type === 'document');
                  const others    = supabaseFiles.filter(f => f.type === 'other');
                  const SUPABASE_FREE_GB = 1 * 1024 * 1024 * 1024;
                  const usedPct = Math.min((supabaseTotalSize / SUPABASE_FREE_GB) * 100, 100);

                  const formatSize = (bytes: number) =>
                    bytes < 1024 * 1024
                      ? `${(bytes / 1024).toFixed(1)} KB`
                      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

                  return (
                    <>
                      <Card className="bg-zinc-950 border-zinc-800">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Almacenamiento usado</p>
                              <p className="text-2xl font-extralight text-white mt-1">{formatSize(supabaseTotalSize)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-zinc-500 text-xs font-extralight">Plan gratuito</p>
                              <p className="text-zinc-300 font-extralight text-sm mt-0.5">1 GB límite</p>
                            </div>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${usedPct.toFixed(2)}%` }}
                            />
                          </div>
                          <p className="text-zinc-600 text-xs font-extralight mt-1.5 text-right">
                            {usedPct.toFixed(1)}% utilizado
                          </p>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Imágenes',   count: images.length,    size: images.reduce((a,f)=>a+f.size,0),    color: 'text-blue-400',   dot: 'bg-blue-400'   },
                          { label: 'Videos',     count: videos.length,    size: videos.reduce((a,f)=>a+f.size,0),    color: 'text-purple-400', dot: 'bg-purple-400' },
                          { label: 'Documentos', count: documents.length, size: documents.reduce((a,f)=>a+f.size,0), color: 'text-yellow-400', dot: 'bg-yellow-400' },
                          { label: 'Otros',      count: others.length,    size: others.reduce((a,f)=>a+f.size,0),    color: 'text-zinc-400',   dot: 'bg-zinc-500'   },
                        ].map(item => (
                          <Card key={item.label} className="bg-zinc-950 border-zinc-800">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                                <p className={`text-xs font-extralight uppercase tracking-wider ${item.color}`}>
                                  {item.label}
                                </p>
                              </div>
                              <p className="text-xl font-extralight text-white">{item.count.toLocaleString()}</p>
                              <p className="text-zinc-600 text-xs font-extralight mt-0.5">{formatSize(item.size)}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <Card className="bg-zinc-950 border-zinc-800">
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Total archivos</p>
                            <p className="text-2xl font-extralight text-white mt-1">{supabaseFiles.length.toLocaleString()}</p>
                          </div>
                          <div className="flex gap-1">
                            {supabaseFiles.length > 0 && [
                              { type: 'image', w: images.length },
                              { type: 'video', w: videos.length },
                              { type: 'document', w: documents.length },
                              { type: 'other', w: others.length },
                            ].filter(s => s.w > 0).map(s => (
                              <div
                                key={s.type}
                                className={`h-8 rounded transition-all ${
                                  s.type === 'image'    ? 'bg-blue-500/60' :
                                  s.type === 'video'    ? 'bg-purple-500/60' :
                                  s.type === 'document' ? 'bg-yellow-500/60' : 'bg-zinc-600'
                                }`}
                                style={{ width: `${Math.max((s.w / supabaseFiles.length) * 80, 4)}px` }}
                                title={`${s.type}: ${s.w}`}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg">
                        <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider mb-2">
                          Cuota Supabase (plan gratuito)
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'Storage', limit: '1 GB' },
                            { label: 'Ancho de banda', limit: '2 GB/mes' },
                            { label: 'Transferencia', limit: '5 GB/mes' },
                          ].map(item => (
                            <div key={item.label} className="bg-zinc-950 rounded p-2 border border-zinc-800">
                              <p className="text-zinc-300 font-extralight text-sm">{item.limit}</p>
                              <p className="text-zinc-600 text-xs font-extralight mt-0.5">{item.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </TabsContent>

        {/* PESTAÑA: BANNERS */}
        <TabsContent value="banners" className="mt-6 space-y-6">
  {/* Header con controles profesionales */}
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div>
      <p className="text-white font-extralight text-base flex items-center gap-2">
        <MonitorPlay className="w-5 h-5 text-emerald-400" />
        Banners del Dashboard
      </p>
      <p className="text-zinc-500 font-extralight text-sm mt-0.5">
        Carrusel profesional con {banners.length} banners • Autoplay: {isPlaying ? 'ON' : 'OFF'}
      </p>
    </div>
    
    <div className="flex items-center gap-2 flex-wrap">
      {/* BOTÓN GUARDAR CAMBIOS - NUEVO */}
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
  if (banners.length === 0 && !bannerSettings) return;
  setSavingBanner(true);
  try {
    // 1. Guardar orden de banners
    if (banners.length > 0) {
      const batch = writeBatch(db);
      banners.forEach((banner, index) => {
        const bannerRef = doc(db, 'dashboard_banners', banner.id);
        batch.update(bannerRef, {
          orden: index,
          actualizadoEn: Timestamp.now(),
        });
      });
      await batch.commit();
    }

    // 2. Guardar configuración del carrusel
    await setDoc(doc(db, 'dashboard_config', 'banner_settings'), {
  autoplay:       isPlaying,
  interval:       bannerSettings.interval,
  quality:        bannerSettings.quality,
  actualizadoEn:  Timestamp.now(),
  actualizadoPor: userProfile?.displayName || 'CEO',
});

    // Al final del onClick de Guardar Cambios, reemplaza el logActivity así:
try {
  await logActivity(
    'BANNERS_CONFIG_SAVED',
    { interval: bannerSettings.interval, autoplay: isPlaying },
    userProfile?.uid || '',
    userProfile?.displayName || 'CEO'
  );
} catch (logError) {
  console.warn('logActivity falló (no crítico):', logError);
}

setSaveSuccessModal(true);
  } catch (error) {
    console.error('Error saving banners:', error);
  } finally {
    setSavingBanner(false);
  }
}}
        disabled={savingBanner || banners.length === 0}
        className="border-emerald-800 text-emerald-400 hover:bg-emerald-950/30 hover:text-emerald-300 font-extralight text-xs gap-2"
      >
        {savingBanner ? (
          <><RefreshCw className="w-3 h-3 animate-spin" /> Guardando...</>
        ) : (
          <><CheckCircle className="w-3 h-3" /> Guardar Cambios</>
        )}
      </Button>

      <div className="w-px h-6 bg-zinc-800 mx-1" />

      <Select 
        value={bannerSettings.interval.toString()} 
        onValueChange={(v) => setBannerSettings(s => ({ ...s, interval: parseInt(v) }))}
      >
        <SelectTrigger className="w-28 bg-zinc-900 border-zinc-800 text-white font-extralight text-xs">
          <Clock className="w-3 h-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800">
          <SelectItem value="3000" className="font-extralight text-xs">3s</SelectItem>
          <SelectItem value="5000" className="font-extralight text-xs">5s</SelectItem>
          <SelectItem value="7000" className="font-extralight text-xs">7s</SelectItem>
          <SelectItem value="10000" className="font-extralight text-xs">10s</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsPlaying(!isPlaying)}
        className={`border-zinc-800 font-extralight text-xs gap-1.5 ${
          isPlaying ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-500'
        }`}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        {isPlaying ? 'Pausar' : 'Reproducir'}
      </Button>

      <Select 
        value={bannerSettings.quality} 
        onValueChange={(v: any) => setBannerSettings(s => ({ ...s, quality: v }))}
      >
        <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 text-white font-extralight text-xs">
          <Settings className="w-3 h-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800">
          <SelectItem value="auto" className="font-extralight text-xs">Auto</SelectItem>
          <SelectItem value="hd" className="font-extralight text-xs">HD</SelectItem>
          <SelectItem value="full" className="font-extralight text-xs">Full</SelectItem>
        </SelectContent>
      </Select>

      <Button
        onClick={() => setShowBannerModal(true)}
        className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2 text-xs">
        <Plus className="w-3.5 h-3.5" /> Nuevo Banner
      </Button>
    </div>
  </div>

  {/* Carrusel Principal */}
  {banners.length > 0 && (
    <div 
      className="relative w-full rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 group"
      style={{ height: '320px' }}
      onMouseEnter={() => setHoveringBanner(true)}
      onMouseLeave={() => setHoveringBanner(false)}
    >
      {banners.map((b, idx) => (
        <div 
          key={b.id}
          className={`absolute inset-0 transition-all duration-700 ease-out ${
            idx === bannerActivo ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
          }`}
        >
          <img 
            src={b.url} 
            alt={b.titulo} 
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => {
              setCurrentBannerIndex(idx);
              setLightboxOpen(true);
              setZoomLevel(1);
              setImageOffset({ x: 0, y: 0 });
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex items-end justify-between">
              <div>
                <Badge className="mb-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-extralight text-[10px]">
                  Banner {idx + 1} de {banners.length}
                </Badge>
                <h3 className="text-white font-extralight text-2xl mb-1">{b.titulo}</h3>
                {b.descripcion && (
                  <p className="text-zinc-300 font-extralight text-sm opacity-90">{b.descripcion}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentBannerIndex(idx);
                  setLightboxOpen(true);
                  setZoomLevel(1);
                }}
                className="border-white/20 text-white hover:bg-white/10 font-extralight gap-2 backdrop-blur-sm bg-black/20"
              >
                <Maximize2 className="w-4 h-4" />
                Ver HD
              </Button>
            </div>
          </div>
        </div>
      ))}

      {banners.length > 1 && (
        <>
          <button 
            onClick={() => {
              setBannerActivo(p => (p - 1 + banners.length) % banners.length);
              setIsPlaying(false);
              setTimeout(() => setIsPlaying(true), 10000);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => {
              setBannerActivo(p => (p + 1) % banners.length);
              setIsPlaying(false);
              setTimeout(() => setIsPlaying(true), 10000);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {banners.map((_, idx) => (
            <button 
              key={idx} 
              onClick={() => {
                setBannerActivo(idx);
                setIsPlaying(false);
                setTimeout(() => setIsPlaying(true), 10000);
              }}
              className={`h-1 rounded-full bg-white transition-all ${
                idx === bannerActivo ? 'w-8' : 'w-2 opacity-50'
              }`}
            />
          ))}
        </div>
      )}

      {isPlaying && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
          <div 
            className="h-full bg-emerald-400/80 animate-[progress_5s_linear_infinite]"
            style={{ animationDuration: `${bannerSettings.interval}ms` }}
          />
        </div>
      )}
    </div>
  )}

  {/* Grid de banners */}
  {bannersLoading ? (
    <div className="flex justify-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
    </div>
  ) : banners.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-zinc-800 rounded-xl" onClick={() => setShowBannerModal(true)}>
      <ImageIcon className="w-12 h-12 text-zinc-700 mb-3" />
      <p className="text-zinc-500 font-extralight">No hay banners</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {banners.map((banner, idx) => (
        <Card 
          key={banner.id} 
          className={`bg-zinc-950 border-zinc-800 hover:border-zinc-600 transition-all group overflow-hidden ${
            idx === bannerActivo ? 'ring-1 ring-emerald-500/50' : ''
          }`}
        >
          <div className="relative aspect-video overflow-hidden bg-zinc-900">
            <img 
              src={banner.url} 
              alt={banner.titulo}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentBannerIndex(idx);
                  setLightboxOpen(true);
                  setZoomLevel(1);
                }}
                className="border-white/20 text-white hover:bg-white/20 font-extralight text-xs"
              >
                <ZoomIn className="w-3.5 h-3.5 mr-1" /> Zoom
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBannerActivo(idx)}
                className="border-white/20 text-white hover:bg-white/20 font-extralight text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1" /> Ver
              </Button>
            </div>
            {idx === bannerActivo && (
              <div className="absolute top-2 left-2">
                <Badge className="bg-emerald-500/90 text-white border-0 font-extralight text-[10px]">
                  <Play className="w-2.5 h-2.5 mr-1 inline" /> Activo
                </Badge>
              </div>
            )}
          </div>
          <CardContent className="p-3">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-white font-extralight text-sm truncate">{banner.titulo}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-zinc-500 hover:text-white"
                  onClick={() => {
                    if (idx > 0) {
                      const newBanners = [...banners];
                      [newBanners[idx], newBanners[idx-1]] = [newBanners[idx-1], newBanners[idx]];
                      setBanners(newBanners);
                      if (bannerActivo === idx) setBannerActivo(idx - 1);
                    }
                  }}
                  disabled={idx === 0}
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-zinc-500 hover:text-white"
                  onClick={() => {
                    if (idx < banners.length - 1) {
                      const newBanners = [...banners];
                      [newBanners[idx], newBanners[idx+1]] = [newBanners[idx+1], newBanners[idx]];
                      setBanners(newBanners);
                      if (bannerActivo === idx) setBannerActivo(idx + 1);
                    }
                  }}
                  disabled={idx === banners.length - 1}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-zinc-500 hover:text-red-400"
                  onClick={() => handleDeleteBanner(banner.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )}

  {/* Lightbox Profesional */}
  <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
    <DialogContent className="bg-black/95 border-zinc-800 text-white !w-[100vw] !h-[100vh] !max-w-none !max-h-none p-0 gap-0 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <p className="text-white font-extralight text-sm">
            {banners[currentBannerIndex]?.titulo}
          </p>
          <Badge className="bg-zinc-800/80 text-zinc-400 border-zinc-700 font-extralight text-[10px]">
            {currentBannerIndex + 1} / {banners.length}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          {imageDimensions.naturalWidth > 0 && (
            <span className="text-zinc-500 text-xs font-extralight hidden sm:block">
              {imageDimensions.naturalWidth} × {imageDimensions.naturalHeight}px
            </span>
          )}
          
          <div className="flex items-center gap-1 bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-zinc-400 font-extralight w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-zinc-400 hover:text-white"
              onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            className="text-zinc-400 hover:text-white font-extralight text-xs"
            onClick={() => {
              setZoomLevel(1);
              setImageOffset({ x: 0, y: 0 });
            }}
          >
            Reset
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                setIsFullscreen(true);
              } else {
                document.exitFullscreen();
                setIsFullscreen(false);
              }
            }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div 
        className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          if (zoomLevel > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y });
          }
        }}
        onMouseMove={(e) => {
          if (isDragging && zoomLevel > 1) {
            setImageOffset({
              x: e.clientX - dragStart.x,
              y: e.clientY - dragStart.y
            });
          }
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          setZoomLevel(z => Math.max(0.5, Math.min(4, z + delta)));
        }}
      >
        {banners[currentBannerIndex] && (
          <img
            ref={imageRef}
            src={banners[currentBannerIndex].url}
            alt={banners[currentBannerIndex].titulo}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${zoomLevel}) translate(${imageOffset.x / zoomLevel}px, ${imageOffset.y / zoomLevel}px)`
            }}
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              setImageDimensions({
                width: img.width,
                height: img.height,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight
              });
            }}
            onClick={() => {
              if (zoomLevel === 1) setZoomLevel(2);
              else { setZoomLevel(1); setImageOffset({ x: 0, y: 0 }); }
            }}
            draggable={false}
          />
        )}
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={() => {
              setCurrentBannerIndex(i => (i - 1 + banners.length) % banners.length);
              setZoomLevel(1);
              setImageOffset({ x: 0, y: 0 });
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-12 h-12 flex items-center justify-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={() => {
              setCurrentBannerIndex(i => (i + 1) % banners.length);
              setZoomLevel(1);
              setImageOffset({ x: 0, y: 0 });
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-12 h-12 flex items-center justify-center"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {banners.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex items-center justify-center gap-2 overflow-x-auto">
            {banners.map((b, idx) => (
              <button
                key={b.id}
                onClick={() => {
                  setCurrentBannerIndex(idx);
                  setZoomLevel(1);
                  setImageOffset({ x: 0, y: 0 });
                }}
                className={`relative flex-shrink-0 w-16 h-10 rounded overflow-hidden border-2 transition-all ${
                  idx === currentBannerIndex ? 'border-emerald-400' : 'border-transparent opacity-50'
                }`}
              >
                <img src={b.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>

  {/* Modal de nuevo banner */}
  <Dialog open={showBannerModal} onOpenChange={setShowBannerModal}>
    <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-extralight text-lg flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-emerald-400" /> Nuevo Banner
        </DialogTitle>
        <DialogDescription className="text-zinc-500 font-extralight text-sm">
          Optimizado para 1200×400px. Formatos: JPG, PNG, WebP.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-zinc-400 font-extralight text-xs uppercase flex items-center gap-2">
            <Link className="w-3 h-3" /> URL de la imagen *
          </Label>
          <Input 
            value={bannerForm.url}
            onChange={e => setBannerForm(f => ({ ...f, url: e.target.value }))}
            placeholder="https://..."
            className="bg-zinc-900 border-zinc-800 text-white font-extralight"
          />
          {bannerForm.url && (
            <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 mt-2">
              <img 
                src={bannerForm.url} 
                alt="preview"
                className="w-full h-32 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <p className="text-zinc-600 text-xs font-extralight flex items-center gap-1">
            <Info className="w-3 h-3" /> Recomendado: 1200×400px, menos de 500KB
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-400 font-extralight text-xs uppercase">Título *</Label>
          <Input 
            value={bannerForm.titulo}
            onChange={e => setBannerForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ej: Nueva Temporada 2024"
            className="bg-zinc-900 border-zinc-800 text-white font-extralight"
            maxLength={60}
          />
          <div className="flex justify-between text-xs text-zinc-600 font-extralight">
            <span>Máx. 60 caracteres</span>
            <span>{bannerForm.titulo.length}/60</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-400 font-extralight text-xs uppercase">
            Descripción <span className="text-zinc-600 normal-case">(opcional)</span>
          </Label>
          <Textarea
            value={bannerForm.descripcion}
            onChange={e => setBannerForm(f => ({ ...f, descripcion: e.target.value }))}
            placeholder="Descripción breve..."
            className="bg-zinc-900 border-zinc-800 text-white font-extralight resize-none"
            rows={2}
            maxLength={120}
          />
          <div className="flex justify-between text-xs text-zinc-600 font-extralight">
            <span>{bannerForm.descripcion?.length || 0}/120</span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button 
          variant="outline" 
          onClick={() => setShowBannerModal(false)}
          className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight"
        >
          Cancelar
        </Button>
        <Button 
          onClick={handleSaveBanner}
          disabled={savingBanner || !bannerForm.url || !bannerForm.titulo}
          className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2"
        >
          {savingBanner ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Publicando...</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Publicar</>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <style>{`
    @keyframes progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
  `}</style>
</TabsContent>
      </Tabs>

      {/* Modal de éxito al guardar banners */}
<Dialog open={saveSuccessModal} onOpenChange={setSaveSuccessModal}>
  <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm text-center">
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Ícono animado */}
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-emerald-400" />
      </div>

      <div>
        <h3 className="text-white font-extralight text-lg">
          Cambios guardados
        </h3>
        <p className="text-zinc-500 font-extralight text-sm mt-1">
          La configuración del carrusel y el orden de banners se guardaron correctamente.
        </p>
      </div>

      {/* Detalle de lo guardado */}
      <div className="w-full bg-zinc-900 rounded-xl border border-zinc-800 divide-y divide-zinc-800">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-zinc-500 font-extralight text-xs">Autoplay</span>
          <span className={`text-xs font-extralight ${isPlaying ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {isPlaying ? 'Activado' : 'Desactivado'}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-zinc-500 font-extralight text-xs">Intervalo</span>
          <span className="text-zinc-300 font-extralight text-xs">
            {bannerSettings.interval / 1000}s
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-zinc-500 font-extralight text-xs">Banners</span>
          <span className="text-zinc-300 font-extralight text-xs">
            {banners.length} ordenados
          </span>
        </div>
      </div>

      <Button
        onClick={() => setSaveSuccessModal(false)}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-extralight"
      >
        Entendido
      </Button>
    </div>
  </DialogContent>
</Dialog>

      <Dialog open={showViewer} onOpenChange={setShowViewer}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white !w-[95vw] !max-w-[95vw] !h-[95vh] !max-h-[95vh] overflow-hidden p-0 gap-0 [&>button]:hidden">
          {viewerFile && (
            <div className="flex flex-col h-full" style={{ maxHeight: '95vh' }}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 flex-shrink-0">
                <p className="text-white font-extralight text-sm truncate pr-4 flex-1">
                  {viewerFile.name}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                    className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight text-xs h-8"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Descargar
                  </Button>
                  <button
                    onClick={() => setShowViewer(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-zinc-950 flex items-center justify-center overflow-auto p-4"
                style={{ minHeight: '200px', maxHeight: 'calc(95vh - 56px)' }}>

                {viewerFile.type.startsWith('image/') && (
                  <img
                    src={viewerFile.url}
                    alt={viewerFile.name}
                    className="max-w-full max-h-full object-contain"
                    style={{ maxHeight: 'calc(95vh - 80px)' }}
                  />
                )}

                {viewerFile.type.startsWith('video/') && (
                  <video
                    src={viewerFile.url}
                    controls
                    className="max-w-full max-h-full"
                    style={{ maxHeight: 'calc(95vh - 80px)' }}
                  >
                    Tu navegador no soporta videos.
                  </video>
                )}

                {viewerFile.type === 'application/pdf' && (
                  <iframe
                    src={viewerFile.url}
                    className="border-0 rounded"
                    style={{ width: '100%', height: 'calc(95vh - 80px)', minHeight: '500px' }}
                    title={viewerFile.name}
                  />
                )}

                {viewerFile.type.startsWith('audio/') && (
                  <div className="flex flex-col items-center gap-4">
                    <File className="w-20 h-20 text-zinc-600" />
                    <audio src={viewerFile.url} controls className="w-full max-w-md" />
                  </div>
                )}

                {viewerFile.type === 'text/plain' && (
                  <iframe
                    src={viewerFile.url}
                    className="w-full border-0 rounded bg-zinc-900"
                    style={{ height: 'calc(95vh - 80px)', minHeight: '500px' }}
                    title={viewerFile.name}
                  />
                )}

                {!viewerFile.type.startsWith('image/') &&
                 !viewerFile.type.startsWith('video/') &&
                 !viewerFile.type.startsWith('audio/') &&
                 viewerFile.type !== 'application/pdf' &&
                 viewerFile.type !== 'text/plain' && (
                  <div className="flex flex-col items-center gap-4 text-zinc-500">
                    <File className="w-20 h-20" />
                    <p className="font-extralight text-sm">Vista previa no disponible para este tipo de archivo</p>
                    <Button
                      onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                      className="bg-white text-black hover:bg-zinc-200 font-extralight"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar archivo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EmployeeProfileModal
        open={showProfile}
        onClose={() => { setShowProfile(false); setProfileUser(null); }}
        user={profileUser}
      />

      <EmployeeCredentialModal
        open={showCredential}
        onClose={() => { setShowCredential(false); setCredentialUser(null); }}
        user={credentialUser}
        companyLogoUrl="https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/task-reports/MARCA%20DE%20AGUA%20BLANCO.png "
      />

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        allUsers={users}
      />

      <EmployeeContractModal
        open={showContract}
        onClose={() => { setShowContract(false); setContractUser(null); }}
        user={contractUser}
      />
    </div>
  );
};

export default CEOPanel;