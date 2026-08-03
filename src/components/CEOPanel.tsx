import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
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
import { collection, getDocs, query, orderBy, doc, deleteDoc, writeBatch, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  CheckCheck, QrCode, ScanLine, Image as ImageIcon, 
  ChevronLeft, MonitorPlay,
  Play, Pause, ZoomIn, ZoomOut, Maximize2,
  ChevronUp, ChevronDown, X, Info, Link,
  TrendingUp, Activity, ArrowUpRight,
} from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';
import { Timestamp } from '@/lib/firebase';
import { deleteAuthUser } from '@/services/discordApi';

/* ─── ESTILOS GLOBALES ─── */
const cardBg       = 'var(--sidebar-card-bg, #111111)';
const borderColor  = 'var(--border-main, #27272a)';
const textPrimary  = 'var(--text-primary, #fafafa)';
const textMuted    = 'var(--text-muted, #a1a1aa)';
const surfaceHover = 'var(--surface-hover, #1f1f23)';
const surfaceSubtle= 'var(--surface-subtle, #0c0c0e)';

/* ─── TIPOS ─── */
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

/* ─── CONSTANTES ─── */
const passwordRules = [
  { id: 'length',  label: 'Mínimo 8 caracteres',   test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'Al menos una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number',  label: 'Al menos un número',     test: (p: string) => /\d/.test(p) },
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
  high:   { label: 'Alta',  color: 'text-red-400',    bg: 'bg-red-950/60',    border: 'border-red-800/60',    dot: 'bg-red-400',    glow: 'shadow-red-500/20'    },
  medium: { label: 'Media', color: 'text-amber-400',  bg: 'bg-amber-950/60',  border: 'border-amber-800/60',  dot: 'bg-amber-400',  glow: 'shadow-amber-500/20'  },
  low:    { label: 'Baja',  color: 'text-emerald-400',bg: 'bg-emerald-950/60',border: 'border-emerald-800/60',dot: 'bg-emerald-400',glow: 'shadow-emerald-500/20'},
};

const REPORT_STATUS_CONFIG = {
  completed:       { label: 'Completada',    color: 'text-emerald-400', bg: 'bg-emerald-950/60', border: 'border-emerald-800/60', icon: CheckCheck,  accent: '#34d399' },
  'in-progress':   { label: 'En Desarrollo', color: 'text-blue-400',    bg: 'bg-blue-950/60',    border: 'border-blue-800/60',    icon: Clock,       accent: '#60a5fa' },
  'not-completed': { label: 'No Completada', color: 'text-red-400',     bg: 'bg-red-950/60',     border: 'border-red-800/60',     icon: XCircle,     accent: '#f87171' },
};

const ALL_ROLES_LIST: UserRole[] = ['CEO','Administración','Diseño','Secretaría','Programación','Contador','Empleado'];

const getRoleConfig = (role: string, allRoles: string[]) => {
  const idx = allRoles.indexOf(role);
  return { label: role, ...ROLE_PALETTE[idx % ROLE_PALETTE.length] };
};

const toDateInputValue = (dateField: any): string => {
  if (!dateField) return '';
  try {
    const d: Date = dateField?.toDate ? dateField.toDate() : new Date(dateField);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch { return ''; }
};

/* ─── PASSWORD STRENGTH ─── */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const passed = passwordRules.filter(r => r.test(password)).length;
  const colors = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
  const labels = ['Débil', 'Regular', 'Fuerte'];
  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i < passed ? colors[passed - 1] : 'bg-[var(--border-main)]'}`} />
        ))}
      </div>
      {passed > 0 && (
        <p className={`text-xs font-extralight ${passed === 3 ? 'text-emerald-400' : passed === 2 ? 'text-amber-400' : 'text-red-400'}`}>
          {labels[passed - 1]}
        </p>
      )}
      <div className="space-y-1">
        {passwordRules.map(rule => (
          <div key={rule.id} className={`flex items-center gap-1.5 text-xs font-extralight transition-colors duration-200 ${rule.test(password) ? 'text-emerald-400' : 'text-[color:var(--text-muted)]'}`}>
            <CheckCircle className="w-3 h-3" />{rule.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── STAT CARD ─── */
const StatCard: React.FC<{
  label: string; value: string | number; icon: React.FC<any>;
  accent: string; trend?: string; delay?: number;
}> = ({ label, value, icon: Icon, accent, trend, delay = 0 }) => (
  <div
    className="ceo-stat-glow ceo-count-pop relative overflow-hidden rounded-2xl border p-4 sm:p-5"
    style={{
      background: 'var(--sidebar-card-bg, var(--surface-subtle))',
      borderColor: `${accent}25`,
      animationDelay: `${delay}ms`,
    }}
  >
    <div className="absolute inset-0 opacity-5" style={{ background: `radial-gradient(circle at 80% 20%, ${accent}, transparent 60%)` }} />
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-xs font-extralight uppercase tracking-widest mb-1.5 sm:mb-2 truncate" style={{ color: accent }}>
          {label}
        </p>
        <p className="text-2xl sm:text-3xl font-extralight" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {trend && (
          <p className="text-[10px] sm:text-xs font-extralight mt-1 sm:mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <ArrowUpRight className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
            <span className="truncate">{trend}</span>
          </p>
        )}
      </div>
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2"
        style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accent }} />
      </div>
    </div>
  </div>
);

/* ─── COMPONENTE PRINCIPAL ─── */
const CEOPanel: React.FC = () => {
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || '#6366f1';





  /* ── Estado ── */
  const [users,           setUsers]           = useState<UserProfile[]>([]);
  const [tasks,           setTasks]           = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [searchUser,      setSearchUser]      = useState('');
  const [showAddTask,     setShowAddTask]      = useState(false);
  const [showAddUser,     setShowAddUser]      = useState(false);
  const [isCreatingUser,  setIsCreatingUser]   = useState(false);
  const [isDeletingUser,  setIsDeletingUser]   = useState<string | null>(null);
  const [mounted,         setMounted]          = useState(false);
  const [showPassword,    setShowPassword]     = useState(false);
  const [showConfirm,     setShowConfirm]      = useState(false);
  const [createSuccess,   setCreateSuccess]    = useState<string | null>(null);
  const [formErrors,      setFormErrors]       = useState<FormError[]>([]);
  const [profileUser,     setProfileUser]      = useState<UserProfile | null>(null);
  const [showProfile,     setShowProfile]      = useState(false);
  const [credentialUser,  setCredentialUser]   = useState<UserProfile | null>(null);
  const [showCredential,  setShowCredential]   = useState(false);
  const [showScanner,     setShowScanner]      = useState(false);
  const [contractUser,    setContractUser]     = useState<UserProfile | null>(null);
  const [showContract,    setShowContract]     = useState(false);
  const [refreshing,      setRefreshing]       = useState(false);
  const [reports,         setReports]          = useState<TaskReport[]>([]);
  const [reportsLoading,  setReportsLoading]   = useState(false);
  const [reportFilter,    setReportFilter]     = useState<'all' | 'completed' | 'in-progress' | 'not-completed'>('all');
  const [reportSearch,    setReportSearch]     = useState('');
  const [selectedReport,  setSelectedReport]   = useState<TaskReport | null>(null);
  const [showReportDetail,setShowReportDetail] = useState(false);
  const [viewerFile,      setViewerFile]       = useState<{ url: string; name: string; type: string } | null>(null);
  const [showViewer,      setShowViewer]       = useState(false);
  const [assignMode,      setAssignMode]       = useState<AssignMode>('user');
  const [newTask, setNewTask] = useState({
    title: '', description: '', assignedTo: '',
    assignedToRole: '' as UserRole | '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: ''
  });
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: '', password: '', confirmPassword: '', displayName: '', role: 'Empleado'
  });
  const [banners,          setBanners]          = useState<Banner[]>([]);
  const [bannerForm,       setBannerForm]       = useState({ url: '', titulo: '', descripcion: '' });
  const [showBannerModal,  setShowBannerModal]  = useState(false);
  const [savingBanner,     setSavingBanner]     = useState(false);
  const [bannerActivo,     setBannerActivo]     = useState(0);
  const [bannersLoading,   setBannersLoading]   = useState(false);
  const [bannerSettings, setBannerSettings] = useState({
    autoplay: true, interval: 5000, transition: 'fade',
    showIndicators: true, showControls: true, pauseOnHover: true, quality: 'auto',
  });
  const [zoomLevel,          setZoomLevel]          = useState(1);
  const [isDragging,         setIsDragging]         = useState(false);
  const [dragStart,          setDragStart]          = useState({ x: 0, y: 0 });
  const [imageOffset,        setImageOffset]        = useState({ x: 0, y: 0 });
  const [imageDimensions,    setImageDimensions]    = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [lightboxOpen,       setLightboxOpen]       = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPlaying,          setIsPlaying]          = useState(true);
  const [hoveringBanner,     setHoveringBanner]     = useState(false);
  const [saveSuccessModal,   setSaveSuccessModal]   = useState(false);
  const [activeEmployeeTab,  setActiveEmployeeTab]  = useState<'list' | 'grid'>('list');
  const [selectedTask,       setSelectedTask]       = useState<any | null>(null);
  const [showTaskDetail,     setShowTaskDetail]     = useState(false);
  const [editingTask,        setEditingTask]        = useState(false);
  const [editTask,           setEditTask]           = useState<any>({});
  const [editAssignMode,     setEditAssignMode]     = useState<AssignMode>('user');
  /* ── NUEVO: modal de cambio de rol en mobile ── */
  const [roleChangeUser,     setRoleChangeUser]     = useState<UserProfile | null>(null);
  const [showRoleModal,      setShowRoleModal]      = useState(false);

  const carouselRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef    = useRef<HTMLImageElement>(null);

  /* ── Derivados ── */
  const allRoles = Array.from(new Set([...FIXED_ROLES, ...users.map(u => u.role)])).filter(Boolean);

  /* ── Callbacks ── */
  const fetchData = useCallback(async () => {
    try {
      const [usersData, tasksData] = await Promise.all([getAllUsers(), getTasks()]);
      setUsers(usersData as UserProfile[]);
      setTasks(tasksData);
    } catch (error) { console.error('Error:', error); }
    finally { setLoading(false); }
  }, []);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const q = query(collection(db, 'taskReports'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setReports(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, taskId: data.taskId || '', taskTitle: data.taskTitle || '',
          userId: data.reportedBy || '', userName: data.reporterName || '',
          userRole: data.reporterRole || '', status: data.reportStatus || 'in-progress',
          comment: data.comment || '',
          files: Array.isArray(data.attachments)
            ? data.attachments.map((a: any) => ({ url: a.url || '', name: a.name || 'archivo', type: a.type || 'application/octet-stream', size: a.size || 0 }))
            : [],
          createdAt: data.createdAt,
          reportPath: `${data.taskId}/${data.reportedBy}`,
        } as TaskReport;
      }));
    } catch (error) { console.error('Error fetching reports:', error); }
    finally { setReportsLoading(false); }
  }, []);

  const fetchBanners = useCallback(async () => {
    setBannersLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc')));
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
      const configSnap = await getDoc(doc(db, 'dashboard_config', 'banner_settings'));
      if (configSnap.exists()) {
        const cfg = configSnap.data();
        setBannerSettings(s => ({ ...s, interval: cfg.interval ?? s.interval, quality: cfg.quality ?? s.quality }));
        setIsPlaying(cfg.autoplay ?? true);
      }
    } catch (e) { console.error(e); }
    finally { setBannersLoading(false); }
  }, []);

  /* ── Effects ── */
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => { fetchData(); fetchReports(); fetchBanners(); }, [fetchData, fetchReports, fetchBanners]);
  useEffect(() => {
    if (!isPlaying || banners.length <= 1 || hoveringBanner) return;
    carouselRef.current = setInterval(() => setBannerActivo(p => (p + 1) % banners.length), bannerSettings.interval);
    return () => { if (carouselRef.current) clearInterval(carouselRef.current); };
  }, [isPlaying, banners.length, hoveringBanner, bannerSettings.interval]);

  /* ── Helpers ── */
  const openFileViewer = (file: { url: string; name: string; type: string }) => { setViewerFile(file); setShowViewer(true); };

  const validateForm = (): boolean => {
    const errors: FormError[] = [];
    if (!newUser.displayName.trim()) errors.push({ field: 'displayName', message: 'El nombre es obligatorio' });
    if (!newUser.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) errors.push({ field: 'email', message: 'Ingresa un correo válido' });
    if (!passwordRules.every(r => r.test(newUser.password))) errors.push({ field: 'password', message: 'La contraseña no cumple los requisitos' });
    if (newUser.password !== newUser.confirmPassword) errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
    setFormErrors(errors);
    return errors.length === 0;
  };

  const getFieldError = (field: string) => formErrors.find(e => e.field === field)?.message;

  const handleCreateUser = async () => {
    if (!validateForm()) return;
    setIsCreatingUser(true); setCreateSuccess(null);
    try {
      await createUserWithRole(newUser.email, newUser.password, newUser.displayName, newUser.role);
      await logActivity('USER_CREATED', { email: newUser.email, displayName: newUser.displayName, role: newUser.role }, userProfile?.uid || '', userProfile?.displayName || '');
      setCreateSuccess(`✓ ${newUser.displayName} creado correctamente`);
      setTimeout(() => { setShowAddUser(false); setCreateSuccess(null); resetForm(); fetchData(); }, 1500);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use' ? 'Este correo ya está registrado'
        : error.code === 'auth/invalid-email' ? 'El formato del correo no es válido'
        : error.message || 'Error al crear el usuario';
      setFormErrors([{ field: 'email', message: msg }]);
    } finally { setIsCreatingUser(false); }
  };

  const resetForm = () => {
    setNewUser({ email: '', password: '', confirmPassword: '', displayName: '', role: 'Empleado' });
    setFormErrors([]); setCreateSuccess(null); setShowPassword(false); setShowConfirm(false);
  };

  const handleDeleteUser = async (uid: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name || uid}?\n\nEsto borrará su cuenta completamente.`)) return;
    setIsDeletingUser(uid);
    try {
      await deleteUserData(uid); await deleteAuthUser(uid);
      await logActivity('USER_DELETED', { userId: uid, userName: name || uid }, userProfile?.uid || '', userProfile?.displayName || 'CEO');
      await fetchData();
    } catch (error: any) { alert(error.message || 'Error al eliminar usuario'); }
    finally { setIsDeletingUser(null); }
  };

  const handleChangeRole = async (uid: string, newRole: UserRole) => {
    try {
      await updateUserProfile(uid, { role: newRole });
      await logActivity('ROLE_CHANGED', { userId: uid, newRole }, userProfile?.uid || '', userProfile?.displayName || '');
      fetchData();
    } catch { alert('Error al cambiar rol'); }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) { alert('El título es obligatorio'); return; }
    if (assignMode === 'user' && !newTask.assignedTo) { alert('Selecciona un usuario'); return; }
    if (assignMode === 'role' && !newTask.assignedToRole) { alert('Selecciona un rol'); return; }
    if (!newTask.dueDate) { alert('La fecha límite es obligatoria'); return; }
    try {
      await createTask({
        title: newTask.title, description: newTask.description, priority: newTask.priority,
        status: 'pending', createdBy: userProfile?.uid, createdByName: userProfile?.displayName,
        date: Timestamp.fromDate(new Date(newTask.dueDate + 'T12:00:00')),
        ...(assignMode === 'user'
          ? { assignedTo: newTask.assignedTo, assignedToRole: null }
          : { assignedTo: null, assignedToRole: newTask.assignedToRole }),
      });
      await logActivity('TASK_CREATED', { title: newTask.title }, userProfile?.uid || '', userProfile?.displayName || '');
      setNewTask({ title: '', description: '', assignedTo: '', assignedToRole: '', priority: 'medium', dueDate: '' });
      setShowAddTask(false);
      fetchData();
    } catch { alert('Error al crear tarea'); }
  };

  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!confirm(`¿Eliminar tarea "${title}"?`)) return;
    try {
      await deleteTask(taskId);
      await logActivity('TASK_DELETED', { taskId, title }, userProfile?.uid || '', userProfile?.displayName || '');
      fetchData();
    } catch { alert('Error al eliminar tarea'); }
  };

  const handleUpdateTask = async () => {
    if (!selectedTask) return;
    try {
      const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore');
      const updatePayload: any = {
        title:       editTask.title,
        description: editTask.description,
        priority:    editTask.priority,
      };
      if (editTask.dueDate) {
        updatePayload.date = Timestamp.fromDate(new Date(editTask.dueDate + 'T12:00:00'));
      }
      if (editAssignMode === 'user') {
        updatePayload.assignedTo     = editTask.assignedTo || null;
        updatePayload.assignedToRole = null;
      } else {
        updatePayload.assignedTo     = null;
        updatePayload.assignedToRole = editTask.assignedToRole || null;
      }
      await updateDoc(firestoreDoc(db, 'tasks', selectedTask.id), updatePayload);
      await logActivity('TASK_UPDATED', { taskId: selectedTask.id, title: editTask.title }, userProfile?.uid || '', userProfile?.displayName || '');
      setSelectedTask((prev: any) => ({ ...prev, ...updatePayload }));
      setEditingTask(false);
      fetchData();
    } catch { alert('Error al actualizar la tarea'); }
  };

  const handleDeleteReport = async (reportId: string, reportPath: string) => {
    if (!confirm('¿Eliminar este reporte permanentemente?\n\nSe borrarán también los archivos adjuntos.')) return;
    try {
      if (reportPath) {
        const { data: filesList } = await supabase.storage.from(REPORTS_BUCKET).list(reportPath);
        if (filesList && filesList.length > 0) {
          await supabase.storage.from(REPORTS_BUCKET).remove(filesList.map((f: any) => `${reportPath}/${f.name}`));
        }
      }
      await deleteDoc(doc(db, 'taskReports', reportId));
      await logActivity('REPORT_DELETED', { reportId }, userProfile?.uid || '', userProfile?.displayName || 'CEO');
      fetchReports();
    } catch (error) { console.error('Error deleting report:', error); alert('Error al eliminar el reporte'); }
  };

  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) { console.error('Error downloading:', error); alert('Error al descargar el archivo'); }
  };

  const handleSaveBanner = async () => {
    if (!bannerForm.url || !bannerForm.titulo) return;
    setSavingBanner(true);
    try {
      await addDoc(collection(db, 'dashboard_banners'), { url: bannerForm.url, titulo: bannerForm.titulo, descripcion: bannerForm.descripcion, creadoEn: Timestamp.now() });
      setBannerForm({ url: '', titulo: '', descripcion: '' });
      setShowBannerModal(false);
      fetchBanners();
    } catch (e) { console.error(e); }
    finally { setSavingBanner(false); }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('¿Eliminar este banner del dashboard?')) return;
    try { await deleteDoc(doc(db, 'dashboard_banners', id)); setBannerActivo(0); fetchBanners(); }
    catch (e) { console.error(e); }
  };

  /* ── Derivados render ── */
  const reportStats = {
    total: reports.length,
    completed: reports.filter(r => r.status === 'completed').length,
    inProgress: reports.filter(r => r.status === 'in-progress').length,
    notCompleted: reports.filter(r => r.status === 'not-completed').length,
  };
  const completionRate = reportStats.total > 0 ? Math.round((reportStats.completed / reportStats.total) * 100) : 0;

  const filteredReports = reports.filter(report => {
    const matchesFilter = reportFilter === 'all' || report.status === reportFilter;
    const matchesSearch = report.taskTitle?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.userName?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.comment?.toLowerCase().includes(reportSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUser.toLowerCase())
  );

  const getAssignedLabel = (task: any) => {
    if (task.assignedToRole) {
      const cfg = getRoleConfig(task.assignedToRole, allRoles);
      return <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}><UsersRound className="w-3 h-3" />{cfg.label}</span>;
    }
    const user = users.find(u => u.uid === task.assignedTo);
    return <span className="inline-flex items-center gap-1 text-xs text-[color:var(--text-muted)]"><UserCheck className="w-3 h-3" />{user?.displayName ?? 'Sin asignar'}</span>;
  };

  if (loading || !mounted) return (
    <div className="flex items-center justify-center h-64 ceo-fade-scale">
      <div className="flex flex-col items-center gap-4">
        <div className="ceo-spin-elegant">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: accent }} />
        </div>
        <div className="space-y-2 w-48">
          <div className="ceo-skeleton h-2 w-full rounded" />
          <div className="ceo-skeleton h-2 w-3/4 rounded mx-auto" />
        </div>
        <p className="text-xs font-extralight" style={{ color: textMuted }}>Cargando panel...</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        /* ═══════════════════════════════════════════════
           ANIMACIONES PROFESIONALES — compatibles con
           cualquier tema (dark/light/system)
           ═══════════════════════════════════════════════ */

        @keyframes slideUp      { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeScale    { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        @keyframes progress     { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes modalEnter   { from{opacity:0;transform:scale(0.94) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes modalOverlay { from{opacity:0} to{opacity:1} }
        @keyframes listItemIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer      { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes glowPulse    { 0%,100%{box-shadow:0 0 6px ${accent}40} 50%{box-shadow:0 0 18px ${accent}70} }
        @keyframes countPop     { 0%{transform:scale(0.8);opacity:0} 80%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
        @keyframes spinIn       { from{transform:rotate(-90deg);opacity:0} to{transform:rotate(0);opacity:1} }
        @keyframes badgeBounce  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }

        .ceo-slide-up    { animation: slideUp   0.32s cubic-bezier(0.16,1,0.3,1) forwards; }
        .ceo-fade-scale  { animation: fadeScale 0.24s cubic-bezier(0.16,1,0.3,1) forwards; }
        .ceo-modal-enter { animation: modalEnter 0.28s cubic-bezier(0.16,1,0.3,1) forwards; }

        /* Stagger lists */
        .ceo-stagger > * {
          opacity: 0;
          animation: listItemIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        .ceo-stagger > *:nth-child(1)  { animation-delay: 0ms; }
        .ceo-stagger > *:nth-child(2)  { animation-delay: 40ms; }
        .ceo-stagger > *:nth-child(3)  { animation-delay: 80ms; }
        .ceo-stagger > *:nth-child(4)  { animation-delay: 120ms; }
        .ceo-stagger > *:nth-child(5)  { animation-delay: 160ms; }
        .ceo-stagger > *:nth-child(6)  { animation-delay: 200ms; }
        .ceo-stagger > *:nth-child(7)  { animation-delay: 240ms; }
        .ceo-stagger > *:nth-child(8)  { animation-delay: 280ms; }
        .ceo-stagger > *:nth-child(9)  { animation-delay: 320ms; }
        .ceo-stagger > *:nth-child(10) { animation-delay: 360ms; }
        .ceo-stagger > *:nth-child(11) { animation-delay: 400ms; }
        .ceo-stagger > *:nth-child(12) { animation-delay: 440ms; }

        /* Tab triggers */
        .ceo-tab-trigger {
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          border-bottom: 2px solid transparent;
          border-radius: 0 !important;
          white-space: nowrap;
          position: relative;
        }
        .ceo-tab-trigger[data-state="active"] {
          background: transparent !important;
          border-bottom-color: ${accent} !important;
          color: ${textPrimary} !important;
        }
        .ceo-tab-trigger::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 50%; right: 50%;
          height: 2px;
          background: ${accent};
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-tab-trigger[data-state="active"]::after {
          left: 0; right: 0;
        }

        /* Row hover sin movimiento lateral */
        .ceo-row-hover:hover {
          background: ${accent}08 !important;
          border-color: ${accent}22 !important;
        }

        /* Task card hover */
        .ceo-task-card {
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-task-card:hover {
          border-color: ${accent}55 !important;
          box-shadow: 0 8px 32px ${accent}14;
          transform: translateY(-2px);
        }

        /* Report card hover */
        .ceo-report-card {
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-report-card:hover {
          border-color: ${accent}55 !important;
          box-shadow: 0 8px 32px ${accent}12;
          transform: translateY(-1px);
        }

        /* Search focus */
        .ceo-search input:focus {
          border-color: ${accent}66 !important;
          box-shadow: 0 0 0 3px ${accent}18 !important;
          transition: all 0.2s ease;
        }

        /* Accent button */
        .ceo-btn-accent {
          background: ${accent} !important;
          color: white !important;
          border: none !important;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          position: relative;
          overflow: hidden;
        }
        .ceo-btn-accent:hover {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px ${accent}40;
        }
        .ceo-btn-accent:active {
          transform: scale(0.97) translateY(0);
          transition-duration: 0.08s;
        }
        .ceo-btn-accent:disabled {
          opacity: 0.45 !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: none !important;
        }

        /* User avatar */
        .ceo-user-avatar {
          background: linear-gradient(135deg, ${accent}30, ${accent}08);
          border: 1px solid ${accent}30;
          transition: all 0.3s ease;
        }
        .ceo-user-avatar:hover {
          border-color: ${accent}60;
          box-shadow: 0 0 12px ${accent}25;
        }

        /* Scrollbar */
        .ceo-scroll::-webkit-scrollbar { width: 5px; }
        .ceo-scroll::-webkit-scrollbar-track { background: transparent; }
        .ceo-scroll::-webkit-scrollbar-thumb { background: ${accent}35; border-radius: 10px; }
        .ceo-scroll::-webkit-scrollbar-thumb:hover { background: ${accent}55; }

        /* Tabs scroll mobile */
        .ceo-tabs-list {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .ceo-tabs-list::-webkit-scrollbar { display: none; }

        /* ═══════════════════════════════════════════════
           FIX RADIX UI: overlay + modal animado
           Usamos backdrop-filter en el overlay pero
           DEJAMOS que el contenido use las variables CSS
           del tema (sin hardcodear colores).
           ═══════════════════════════════════════════════ */
        [data-radix-dialog-overlay] {
          background: rgba(0,0,0,0.75) !important;
          backdrop-filter: blur(6px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(6px) saturate(1.2) !important;
          animation: modalOverlay 0.2s ease forwards;
        }
        [data-radix-dialog-content] {
          /* NO hardcodeamos background aquí — respetamos las variables del tema */
          box-shadow: 0 24px 48px rgba(0,0,0,0.5) !important;
          animation: modalEnter 0.28s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        [data-radix-popper-content-wrapper] {
          z-index: 9999 !important;
        }
        /* El listbox SIEMPRE usa las variables del tema con fallback sólido */
        [role="listbox"] {
          background: var(--dropdown-bg, #18181b) !important;
          border: 1px solid var(--border-main, #27272a) !important;
          box-shadow: 0 16px 40px rgba(0,0,0,0.4) !important;
        }
        [role="option"] {
          transition: background 0.15s ease;
        }
        [role="option"][data-state="checked"],
        [role="option"]:hover {
          background: ${accent}15 !important;
        }

        /* Employee row */
        .ceo-employee-row {
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .ceo-employee-row:hover {
          background: ${accent}08;
        }

        /* Mobile role badge */
        .role-badge-mobile {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 9999px;
          border-width: 1px;
          border-style: solid;
          font-weight: 200;
          white-space: nowrap;
          transition: all 0.2s ease;
        }

        /* Stat card glow */
        .ceo-stat-glow {
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-stat-glow:hover {
          transform: translateY(-3px) scale(1.01);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }

        /* Skeleton shimmer */
        .ceo-skeleton {
          background: linear-gradient(90deg, var(--surface-hover,#1f1f23) 25%, var(--border-main,#27272a) 50%, var(--surface-hover,#1f1f23) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }

        /* Badge bounce */
        .ceo-badge-bounce {
          animation: badgeBounce 2s ease-in-out infinite;
        }

        /* Glow pulse */
        .ceo-glow-pulse {
          animation: glowPulse 2s ease-in-out infinite;
        }

        /* Card lift */
        .ceo-card-lift {
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
        }
        .ceo-card-lift:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.4);
        }

        /* Button press */
        .ceo-btn-press {
          transition: transform 0.15s ease, box-shadow 0.2s ease;
        }
        .ceo-btn-press:active {
          transform: scale(0.96);
        }

        /* Count animation */
        .ceo-count-pop {
          animation: countPop 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }

        /* Spinner elegant */
        .ceo-spin-elegant {
          animation: spinIn 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
        }
      `}</style>

      <div className="space-y-4 sm:space-y-6">
        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
              <Crown className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accent }} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-extralight truncate" style={{ color: textPrimary }}>
                Panel de Control
              </h2>
              <p className="text-[10px] sm:text-xs font-extralight" style={{ color: textMuted }}>
                {users.length} usuarios · {tasks.length} tareas · {reports.length} reportes
              </p>
            </div>
          </div>
          <Button
            variant="outline" size="sm" disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              await Promise.all([fetchData(), fetchReports()]);
              setRefreshing(false);
            }}
            style={{ borderColor, background: 'transparent', color: textMuted }}
            className="ceo-btn-press flex-shrink-0 hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-subtle)] font-extralight transition-all"
          >
            <RefreshCw className={`w-4 h-4 transition-transform duration-700 ${refreshing ? 'animate-spin' : ''}`} style={{ color: refreshing ? accent : undefined }} />
          </Button>
        </div>

        {/* ── TABS ── */}
        <Tabs defaultValue="employees">
          <TabsList
            className="ceo-tabs-list w-full justify-start gap-0 rounded-none border-b p-0 h-auto flex"
            style={{ background: 'transparent', borderColor }}
          >
            {[
              { value: 'employees', label: 'Empleados', icon: Users },
              { value: 'tasks',     label: 'Tareas',    icon: CheckSquare },
              { value: 'reports',   label: 'Reportes',  icon: FileText, badge: reportStats.total },
              { value: 'banners',   label: 'Banners',   icon: MonitorPlay, badge: banners.length },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="ceo-tab-trigger flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-extralight rounded-none data-[state=active]:shadow-none flex-shrink-0"
                  style={{ color: textMuted, background: 'transparent' }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {/* FIX: labels siempre visibles en todos los tamaños */}
                  <span className="text-xs">{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extralight"
                      style={{ background: `${accent}20`, color: accent }}>
                      {tab.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* ══════════════════════════════════════════
              PESTAÑA: EMPLEADOS
          ══════════════════════════════════════════ */}
          <TabsContent value="employees" className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 ceo-slide-up">

            {/* Stats rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Total Equipo',   value: users.length, icon: Users, accent: accent },
                { label: 'Roles Activos',  value: allRoles.filter(r => users.some(u => u.role === r)).length, icon: Shield, accent: '#a78bfa' },
                { label: 'Tareas Activas', value: tasks.filter(t => t.status !== 'completed').length, icon: Activity, accent: '#34d399' },
                { label: 'Reportes Hoy',   value: reports.filter(r => {
                  const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
                  return new Date().toDateString() === d.toDateString();
                }).length, icon: TrendingUp, accent: '#fb923c' },
              ].map((stat, i) => (
                <StatCard key={stat.label} {...stat} delay={i * 60} />
              ))}
            </div>

            {/* Barra de búsqueda y acciones */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 ceo-search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
                <Input
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Buscar por nombre o correo…"
                  className="pl-10 font-extralight transition-all"
                  style={{ background: cardBg, border: `1px solid ${borderColor}`, color: textPrimary }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Toggle lista/grid */}
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor }}>
                  {(['list','grid'] as const).map(view => (
                    <button key={view} onClick={() => setActiveEmployeeTab(view)}
                      className="px-3 py-2 text-xs font-extralight transition-all"
                      style={{
                        background: activeEmployeeTab === view ? `${accent}20` : 'transparent',
                        color: activeEmployeeTab === view ? accent : textMuted,
                      }}>
                      {view === 'list' ? '≡' : '⊞'}
                    </button>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setShowScanner(true)}
                  className="ceo-btn-press font-extralight border-[color:var(--border-main)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-subtle)] text-xs sm:text-sm">
                  <ScanLine className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Escanear</span>
                </Button>
                <button onClick={() => { resetForm(); setShowAddUser(true); }}
                  className="ceo-btn-accent ceo-btn-press flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extralight">
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Agregar</span>
                </button>
              </div>
            </div>

            {/* Tabla/Grid empleados */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: cardBg }}>
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between" style={{ borderColor }}>
                <p className="text-xs font-extralight uppercase tracking-widest" style={{ color: textMuted }}>
                  {filteredUsers.length} de {users.length} empleado{users.length !== 1 ? 's' : ''}
                </p>
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: `${accent}15` }}>
                  <div className="h-full rounded-full" style={{ width: users.length > 0 ? '100%' : '0', background: accent }} />
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center" style={{ color: textMuted }}>
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-20" strokeWidth={1} />
                  <p className="font-extralight text-sm">No se encontraron usuarios</p>
                </div>
              ) : activeEmployeeTab === 'grid' ? (
                /* GRID VIEW */
                <div className="ceo-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4">
                  {filteredUsers.map((user, i) => {
                    const roleCfg = getRoleConfig(user.role, allRoles);
                    return (
                      <div key={user.uid}
                        className="ceo-card-lift rounded-xl p-3 sm:p-4 border cursor-pointer"
                        style={{ background: surfaceSubtle, borderColor, animationDelay: `${i * 40}ms` }}
                        onClick={() => { setProfileUser(user); setShowProfile(true); }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex items-center justify-center ceo-user-avatar flex-shrink-0">
                            {user.avatar
                              ? <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <span className="font-extralight text-lg sm:text-xl" style={{ color: accent }}>{user.displayName?.[0]?.toUpperCase()}</span>
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extralight truncate text-sm" style={{ color: textPrimary }}>{user.displayName}</p>
                            <p className="text-xs font-extralight truncate" style={{ color: textMuted }}>{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge className={`${roleCfg.bg} ${roleCfg.color} ${roleCfg.border} border font-extralight text-xs`}>
                            {roleCfg.label}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {/* Cambiar rol en grid - mobile friendly */}
                            <button onClick={(e) => { e.stopPropagation(); setRoleChangeUser(user); setShowRoleModal(true); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                              style={{ color: textMuted }} title="Cambiar rol">
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setCredentialUser(user); setShowCredential(true); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                              style={{ color: textMuted }}>
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            {user.uid !== userProfile?.uid && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.uid, user.displayName); }}
                                disabled={isDeletingUser === user.uid}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/40"
                                style={{ color: 'rgb(248 113 113)' }}>
                                {isDeletingUser === user.uid ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW — FIX COMPLETO: funciona en mobile y PC */
                <div className="ceo-stagger">
                  {filteredUsers.map((user) => {
                    const roleCfg = getRoleConfig(user.role, allRoles);
                    return (
                      <div key={user.uid}
                        className="ceo-employee-row flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b"
                        style={{ borderColor }}>

                        {/* Avatar */}
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 ceo-user-avatar">
                          {user.avatar
                            ? <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <span className="font-extralight text-sm" style={{ color: accent }}>{user.displayName?.[0]?.toUpperCase()}</span>
                          }
                        </div>

                        {/* Info: nombre + email */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-extralight text-sm truncate" style={{ color: textPrimary }}>
                              {user.displayName}
                            </p>
                            {user.uid === userProfile?.uid && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extralight flex-shrink-0"
                                style={{ background: `${accent}15`, color: accent }}>Tú</span>
                            )}
                          </div>
                          {/* FIX: email visible en mobile también */}
                          <p className="text-xs font-extralight truncate" style={{ color: textMuted }}>{user.email}</p>
                        </div>

                        {/* Badge de rol — visible en todos los tamaños */}
                        <div className="flex-shrink-0 hidden sm:block">
                          <span className={`role-badge-mobile ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}>
                            {roleCfg.label}
                          </span>
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Ver perfil */}
                          <button onClick={() => { setProfileUser(user); setShowProfile(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                            style={{ color: textMuted }} title="Ver perfil">
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Credencial QR */}
                          <button onClick={() => { setCredentialUser(user); setShowCredential(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                            style={{ color: textMuted }} title="Credencial">
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {/* Contrato — FIX: visible en mobile también */}
                          <button onClick={() => { setContractUser(user); setShowContract(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                            style={{ color: textMuted }} title="Contratos">
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* FIX: Cambio de rol — en PC usa Select, en mobile usa botón con modal */}
                          <div className="hidden lg:block">
                            <Select
                              value={user.role}
                              onValueChange={(v: UserRole) => handleChangeRole(user.uid, v)}
                              disabled={user.uid === userProfile?.uid}
                            >
                              <SelectTrigger
                                className="w-36 font-extralight text-sm"
                                style={{
                                  border: `1px solid ${borderColor}`,
                                  background: surfaceSubtle,
                                  color: textPrimary,
                                }}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              {/* FIX: fondo sólido en el dropdown */}
                              <SelectContent
                                style={{
                                  background: 'var(--dropdown-bg, #18181b)',
                                  border: `1px solid ${borderColor}`,
                                  zIndex: 9999,
                                }}
                              >
                                {ALL_ROLES_LIST.map(role => {
                                  const cfg = getRoleConfig(role, allRoles);
                                  return (
                                    <SelectItem key={role} value={role} className="font-extralight" style={{ color: textPrimary }}>
                                      <span className={`flex items-center gap-2 ${cfg.color}`}>
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'currentColor' }} />
                                        {role}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* FIX: botón de rol en tablet/mobile (< lg) */}
                          <button
                            onClick={() => { setRoleChangeUser(user); setShowRoleModal(true); }}
                            disabled={user.uid === userProfile?.uid}
                            className="lg:hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
                            style={{ color: textMuted }}
                            title="Cambiar rol"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar */}
                          {user.uid !== userProfile?.uid && (
                            <button
                              onClick={() => handleDeleteUser(user.uid, user.displayName)}
                              disabled={isDeletingUser === user.uid}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/40 text-red-400 hover:text-red-300">
                              {isDeletingUser === user.uid
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Modal cambio de rol (mobile/tablet) ── */}
            <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: textPrimary }}
                className="w-[calc(100vw-2rem)] max-w-sm border rounded-2xl"
              >
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base flex items-center gap-2">
                    <Shield className="w-5 h-5" style={{ color: accent }} />
                    Cambiar Rol
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: textMuted }}>
                    {roleChangeUser?.displayName}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-2 py-2">
                  {ALL_ROLES_LIST.map(role => {
                    const cfg = getRoleConfig(role, allRoles);
                    const isActive = roleChangeUser?.role === role;
                    return (
                      <button
                        key={role}
                        onClick={async () => {
                          if (roleChangeUser) {
                            await handleChangeRole(roleChangeUser.uid, role as UserRole);
                            setShowRoleModal(false);
                            setRoleChangeUser(null);
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left"
                        style={{
                          background: isActive ? `${accent}15` : surfaceSubtle,
                          borderColor: isActive ? `${accent}55` : borderColor,
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.color}`} style={{ background: 'currentColor' }} />
                        <span className={`font-extralight text-sm flex-1 ${cfg.color}`}>{role}</span>
                        {isActive && <CheckCircle className="w-4 h-4" style={{ color: accent }} />}
                      </button>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => { setShowRoleModal(false); setRoleChangeUser(null); }}
                    className="font-extralight w-full" style={{ color: textMuted }}>
                    Cancelar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog: Crear usuario */}
            <Dialog open={showAddUser} onOpenChange={(open) => { if (!isCreatingUser) { setShowAddUser(open); if (!open) resetForm(); } }}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: textPrimary }}
                className="w-[calc(100vw-2rem)] max-w-md border rounded-2xl"
                onPointerDownOutside={(e) => { if (isCreatingUser) e.preventDefault(); }}>
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base sm:text-lg flex items-center gap-2">
                    <UserPlus className="w-5 h-5" style={{ color: accent }} /> Crear Nuevo Usuario
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: textMuted }}>
                    El usuario podrá iniciar sesión con las credenciales que definas.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 sm:space-y-4 py-2 max-h-[65vh] overflow-y-auto ceo-scroll pr-1">
                  {[
                    { label: 'Nombre completo', field: 'displayName', value: newUser.displayName, set: (v: string) => setNewUser({...newUser, displayName: v}), icon: User, placeholder: 'Ej: Juan Pérez', type: 'text' },
                    { label: 'Correo electrónico', field: 'email', value: newUser.email, set: (v: string) => setNewUser({...newUser, email: v}), icon: Mail, placeholder: 'usuario@empresa.com', type: 'email' },
                  ].map(({ label, field, value, set, icon: Icon, placeholder, type }) => (
                    <div key={field} className="space-y-1.5">
                      <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: textMuted }}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </Label>
                      <Input type={type} value={value} onChange={(e) => set(e.target.value)}
                        placeholder={placeholder} disabled={isCreatingUser}
                        className={`font-extralight ${getFieldError(field) ? 'border-red-800' : ''}`}
                        style={{ background: surfaceSubtle, border: `1px solid ${getFieldError(field) ? '#991b1b' : borderColor}`, color: textPrimary }} />
                      {getFieldError(field) && (
                        <p className="text-red-400 text-xs font-extralight flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />{getFieldError(field)}
                        </p>
                      )}
                    </div>
                  ))}
                  {[
                    { label: 'Contraseña', field: 'password', value: newUser.password, set: (v: string) => setNewUser({...newUser, password: v}), show: showPassword, setShow: setShowPassword, showStrength: true },
                    { label: 'Confirmar contraseña', field: 'confirmPassword', value: newUser.confirmPassword, set: (v: string) => setNewUser({...newUser, confirmPassword: v}), show: showConfirm, setShow: setShowConfirm, showStrength: false },
                  ].map(({ label, field, value, set, show, setShow, showStrength }) => (
                    <div key={field} className="space-y-1.5">
                      <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: textMuted }}>
                        <Lock className="w-3.5 h-3.5" /> {label}
                      </Label>
                      <div className="relative">
                        <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)}
                          placeholder="Mínimo 8 caracteres" disabled={isCreatingUser}
                          className={`font-extralight pr-10 ${getFieldError(field) ? 'border-red-800' : ''}`}
                          style={{ background: surfaceSubtle, border: `1px solid ${getFieldError(field) ? '#991b1b' : borderColor}`, color: textPrimary }} />
                        <button type="button" onClick={() => setShow(!show)}
                          className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }}>
                          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {showStrength && <PasswordStrength password={value} />}
                      {!showStrength && value && newUser.password === value && (
                        <p className="text-emerald-400 text-xs font-extralight flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Las contraseñas coinciden</p>
                      )}
                      {getFieldError(field) && (
                        <p className="text-red-400 text-xs font-extralight flex items-center gap-1"><AlertCircle className="w-3 h-3" />{getFieldError(field)}</p>
                      )}
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: textMuted }}>
                      <Shield className="w-3.5 h-3.5" /> Rol del usuario
                    </Label>
                    <Select value={newUser.role} onValueChange={(v: UserRole) => setNewUser({...newUser, role: v})} disabled={isCreatingUser}>
                      <SelectTrigger className="font-extralight" style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ background: 'var(--dropdown-bg, #18181b)', border: `1px solid ${borderColor}`, zIndex: 9999 }}>
                        {allRoles.map(role => (
                          <SelectItem key={role} value={role} className="font-extralight" style={{ color: textPrimary }}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {createSuccess && (
                    <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                      <p className="text-emerald-400 text-sm font-extralight">{createSuccess}</p>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="ghost" onClick={() => setShowAddUser(false)} disabled={isCreatingUser}
                    className="font-extralight w-full sm:w-auto" style={{ color: textMuted }}>Cancelar</Button>
                  <button onClick={handleCreateUser} disabled={isCreatingUser}
                    className="ceo-btn-accent flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-extralight transition-all w-full sm:w-auto">
                    {isCreatingUser ? <><RefreshCw className="w-4 h-4 animate-spin" />Creando...</> : <><UserPlus className="w-4 h-4" />Crear Usuario</>}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: TAREAS
          ══════════════════════════════════════════ */}
          <TabsContent value="tasks" className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 ceo-slide-up">

            {/* Stats tareas */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Total', value: tasks.length, color: accent },
                { label: 'Pendientes', value: tasks.filter(t => t.status === 'pending').length, color: '#fb923c' },
                { label: 'Prioridad Alta', value: tasks.filter(t => t.priority === 'high').length, color: '#f87171' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 sm:p-4 border text-center"
                  style={{ background: cardBg, borderColor: `${s.color}25` }}>
                  <div className="text-xl sm:text-2xl font-extralight mb-0.5 sm:mb-1" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] sm:text-xs font-extralight uppercase tracking-wider" style={{ color: textMuted }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-extralight" style={{ color: textMuted }}>
                {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} en total
              </p>
              <button onClick={() => setShowAddTask(!showAddTask)}
                className="ceo-btn-accent ceo-btn-press flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extralight">
                {showAddTask ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddTask ? 'Cancelar' : 'Nueva Tarea'}
              </button>
            </div>

            {/* Formulario nueva tarea */}
            {showAddTask && (
              <div className="rounded-2xl overflow-hidden border ceo-fade-scale"
                style={{ background: cardBg, borderColor: `${accent}33` }}>
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b" style={{ borderColor, background: `${accent}08` }}>
                  <ClipboardList className="w-4 h-4 flex-shrink-0" style={{ color: accent }} strokeWidth={1.5} />
                  <span className="font-extralight text-sm tracking-wide" style={{ color: textPrimary }}>Crear nueva tarea</span>
                </div>
                <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label className="font-extralight text-xs uppercase tracking-wider" style={{ color: textMuted }}>Título *</Label>
                      <Input value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                        placeholder="Ej: Revisar contratos Q3"
                        style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-extralight text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: textMuted }}>
                        <Flag className="w-3 h-3" /> Prioridad
                      </Label>
                      <Select value={newTask.priority} onValueChange={(v: 'low'|'medium'|'high') => setNewTask({...newTask, priority: v})}>
                        <SelectTrigger style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }} className="font-extralight">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: 'var(--dropdown-bg, #18181b)', border: `1px solid ${borderColor}`, zIndex: 9999 }}>
                          {Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => (
                            <SelectItem key={k} value={k} className="font-extralight" style={{ color: textPrimary }}>
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} /> {cfg.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase tracking-wider" style={{ color: textMuted }}>Descripción</Label>
                    <Textarea value={newTask.description} onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                      placeholder="Detalla el objetivo o los pasos de esta tarea…"
                      rows={3}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}
                      className="font-extralight resize-none" />
                  </div>

                  {/* Asignar */}
                  <div className="space-y-3">
                    <Label className="font-extralight text-xs uppercase tracking-wider" style={{ color: textMuted }}>Asignar a *</Label>
                    <div className="inline-flex rounded-xl overflow-hidden border p-0.5 gap-0.5" style={{ background: surfaceSubtle, borderColor }}>
                      {[
                        { mode: 'user' as AssignMode, label: 'Usuario', icon: UserCheck },
                        { mode: 'role' as AssignMode, label: 'Rol',     icon: UsersRound },
                      ].map(({ mode, label, icon: Icon }) => (
                        <button key={mode} type="button"
                          onClick={() => { setAssignMode(mode); setNewTask({...newTask, assignedTo: '', assignedToRole: ''}); }}
                          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-extralight transition-all"
                          style={{
                            background: assignMode === mode ? `${accent}20` : 'transparent',
                            color: assignMode === mode ? textPrimary : textMuted,
                          }}>
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>

                    {assignMode === 'user' && (
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor, background: `${surfaceSubtle}` }}>
                        {users.length === 0 ? (
                          <p className="p-4 text-sm font-extralight text-center" style={{ color: textMuted }}>No hay usuarios disponibles</p>
                        ) : (
                          <div className="divide-y max-h-52 overflow-y-auto ceo-scroll" style={{ borderColor }}>
                            {users.map(u => {
                              const isSelected = newTask.assignedTo === u.uid;
                              const roleCfg = getRoleConfig(u.role, allRoles);
                              return (
                                <button key={u.uid} type="button" onClick={() => setNewTask({...newTask, assignedTo: u.uid})}
                                  className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 transition-all text-left border-l-2"
                                  style={{
                                    background: isSelected ? `${accent}10` : 'transparent',
                                    borderLeftColor: isSelected ? accent : 'transparent',
                                  }}>
                                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ceo-user-avatar flex-shrink-0">
                                      <span className="text-sm font-extralight" style={{ color: accent }}>
                                        {u.displayName?.[0]?.toUpperCase() ?? '?'}
                                      </span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs sm:text-sm font-extralight truncate" style={{ color: isSelected ? textPrimary : textMuted }}>{u.displayName}</p>
                                      <p className="text-[10px] sm:text-xs font-extralight truncate" style={{ color: textMuted }}>{u.email}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
                                    <span className={`text-xs font-extralight px-2 py-0.5 rounded-full border ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}>{roleCfg.label}</span>
                                    {isSelected && <CheckCircle className="w-4 h-4" style={{ color: accent }} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {assignMode === 'role' && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                        {allRoles.map(role => {
                          const cfg = getRoleConfig(role, allRoles);
                          const isSelected = newTask.assignedToRole === role;
                          const count = users.filter(u => u.role === role).length;
                          return (
                            <button key={role} type="button" onClick={() => setNewTask({...newTask, assignedToRole: role as UserRole})}
                              className="flex flex-col gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl border transition-all text-left"
                              style={{
                                background: isSelected ? `${accent}12` : surfaceSubtle,
                                borderColor: isSelected ? `${accent}55` : borderColor,
                                borderWidth: isSelected ? 2 : 1,
                              }}>
                              <div className="flex items-center justify-between">
                                <UsersRound className="w-4 h-4" style={{ color: isSelected ? undefined : textMuted }} />
                                {isSelected && <CheckCircle className="w-3.5 h-3.5" style={{ color: accent }} />}
                              </div>
                              <div>
                                <p className={`text-xs sm:text-sm font-extralight ${isSelected ? cfg.color : ''}`} style={{ color: isSelected ? undefined : textMuted }}>{cfg.label}</p>
                                <p className="text-[10px] font-extralight mt-0.5" style={{ color: textMuted }}>{count} miembro{count !== 1 ? 's' : ''}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {(newTask.assignedTo || newTask.assignedToRole) && (
                      <div className="flex items-center gap-2 text-xs font-extralight" style={{ color: accent }}>
                        <ChevronRight className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {assignMode === 'user'
                            ? `Asignado a: ${users.find(u => u.uid === newTask.assignedTo)?.displayName}`
                            : `Asignado al rol: ${getRoleConfig(newTask.assignedToRole, allRoles)?.label}`}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: textMuted }}>
                      <Calendar className="w-3 h-3" /> Fecha límite *
                    </Label>
                    <Input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}
                      className="font-extralight w-full sm:max-w-xs [color-scheme:dark]" />
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t" style={{ borderColor }}>
                    <button onClick={() => { setShowAddTask(false); setNewTask({ title:'', description:'', assignedTo:'', assignedToRole:'', priority:'medium', dueDate:'' }); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-extralight transition-all hover:bg-[var(--surface-hover)] text-center" style={{ color: textMuted }}>
                      Cancelar
                    </button>
                    <button onClick={handleCreateTask}
                      className="ceo-btn-accent ceo-btn-press flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extralight">
                      <CheckSquare className="w-4 h-4" /> Crear Tarea
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de tareas */}
            {tasks.length === 0 && !showAddTask ? (
              <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center rounded-2xl border-2 border-dashed" style={{ borderColor }}>
                <CheckSquare className="w-12 h-12 mb-3 opacity-15" style={{ color: accent }} strokeWidth={1} />
                <p className="font-extralight" style={{ color: textMuted }}>No hay tareas creadas</p>
                <p className="text-sm font-extralight mt-1" style={{ color: textMuted }}>Pulsa "Nueva Tarea" para empezar</p>
              </div>
            ) : (
              <div className="ceo-stagger space-y-2">
                {tasks.map((task, i) => {
                  const priCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
                  return (
                    <div key={task.id}
                      className="ceo-task-card rounded-2xl border p-3 sm:p-4 transition-all duration-200"
                      style={{ background: cardBg, borderColor, animationDelay: `${i * 40}ms` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="mt-2 flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extralight truncate text-sm sm:text-base mb-0.5" style={{ color: textPrimary }}>{task.title}</p>
                            {task.description && (
                              <p className="text-xs sm:text-sm font-extralight line-clamp-1 mb-2" style={{ color: textMuted }}>{task.description}</p>
                            )}
                            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                              <span className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-extralight px-2 py-0.5 rounded-full border ${priCfg.bg} ${priCfg.color} ${priCfg.border}`}>
                                <Flag className="w-2.5 h-2.5" /> {priCfg.label}
                              </span>
                              {getAssignedLabel(task)}
                              {task.date && (
                                <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-extralight" style={{ color: textMuted }}>
                                  <Calendar className="w-3 h-3" />
                                  {task.date?.toDate?.()
                                    ? new Date(task.date.toDate()).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : task.dueDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setSelectedTask(task); setShowTaskDetail(true); setEditingTask(false); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--surface-hover)]"
                            style={{ color: textMuted }}
                            title="Ver detalle">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteTask(task.id, task.title)}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-950/40"
                            style={{ color: textMuted }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Modal detalle / edición de tarea ── */}
            <Dialog open={showTaskDetail} onOpenChange={(open) => { setShowTaskDetail(open); if (!open) setEditingTask(false); }}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: textPrimary }}
                className="w-[calc(100vw-2rem)] max-w-lg border rounded-2xl max-h-[90vh] overflow-y-auto ceo-scroll">
                {selectedTask && (() => {
                  const priCfg = PRIORITY_CONFIG[(editingTask ? editTask.priority : selectedTask.priority) as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
                  const assignedUser = users.find(u => u.uid === (editingTask ? editTask.assignedTo : selectedTask.assignedTo));
                  const dateStr = (() => {
                    const df = editingTask ? editTask.dueDate : toDateInputValue(selectedTask.date);
                    if (!df) return '—';
                    const d = new Date(df + 'T12:00:00');
                    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
                  })();

                  return (
                    <>
                      <DialogHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${priCfg.dot}`} />
                          {editingTask ? (
                            <input
                              value={editTask.title ?? ''}
                              onChange={e => setEditTask((p: any) => ({ ...p, title: e.target.value }))}
                              className="font-extralight text-base bg-transparent border-b outline-none w-full"
                              style={{ color: textPrimary, borderColor: `${accent}66` }}
                            />
                          ) : (
                            <DialogTitle className="font-extralight text-base leading-snug" style={{ color: textPrimary }}>
                              {selectedTask.title}
                            </DialogTitle>
                          )}
                        </div>
                        <DialogDescription className="font-extralight text-xs" style={{ color: textMuted }}>
                          {editingTask ? 'Modo edición — modifica los campos y guarda' : 'Detalle completo de la tarea'}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3 sm:space-y-4 mt-1">
                        {/* Descripción */}
                        <div className="rounded-xl p-3 sm:p-4 border" style={{ background: surfaceSubtle, borderColor }}>
                          <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Descripción</p>
                          {editingTask ? (
                            <textarea
                              value={editTask.description ?? ''}
                              onChange={e => setEditTask((p: any) => ({ ...p, description: e.target.value }))}
                              rows={3}
                              className="w-full bg-transparent outline-none resize-none text-sm font-extralight leading-relaxed border-b"
                              style={{ color: textPrimary, borderColor: `${accent}44` }}
                            />
                          ) : (
                            <p className="text-sm font-extralight leading-relaxed" style={{ color: textPrimary }}>
                              {selectedTask.description || <span style={{ color: textMuted }}>Sin descripción</span>}
                            </p>
                          )}
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {/* Prioridad */}
                          <div className="rounded-xl p-3 border" style={{ background: surfaceSubtle, borderColor }}>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Prioridad</p>
                            {editingTask ? (
                              <select
                                value={editTask.priority ?? 'medium'}
                                onChange={e => setEditTask((p: any) => ({ ...p, priority: e.target.value }))}
                                className="text-xs font-extralight rounded-lg px-2 py-1 outline-none w-full"
                                style={{ background: cardBg, color: textPrimary, border: `1px solid ${borderColor}` }}>
                                <option value="high">Alta</option>
                                <option value="medium">Media</option>
                                <option value="low">Baja</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-extralight px-2.5 py-1 rounded-full border ${priCfg.bg} ${priCfg.color} ${priCfg.border}`}>
                                <Flag className="w-3 h-3" /> {priCfg.label}
                              </span>
                            )}
                          </div>

                          {/* Estado */}
                          <div className="rounded-xl p-3 border" style={{ background: surfaceSubtle, borderColor }}>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Estado</p>
                            <span className="text-xs font-extralight capitalize" style={{
                              color: selectedTask.status === 'completed' ? '#34d399'
                                : selectedTask.status === 'in-progress' ? '#60a5fa'
                                : '#fb923c'
                            }}>
                              {selectedTask.status === 'completed' ? '✓ Completada'
                                : selectedTask.status === 'in-progress' ? '⏳ En progreso'
                                : '• Pendiente'}
                            </span>
                          </div>

                          {/* Fecha límite */}
                          <div className="rounded-xl p-3 border" style={{ background: surfaceSubtle, borderColor }}>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Fecha límite</p>
                            {editingTask ? (
                              <input
                                type="date"
                                value={editTask.dueDate ?? ''}
                                onChange={e => setEditTask((p: any) => ({ ...p, dueDate: e.target.value }))}
                                className="text-xs font-extralight rounded-lg px-2 py-1 outline-none w-full [color-scheme:dark]"
                                style={{ background: cardBg, color: textPrimary, border: `1px solid ${borderColor}` }}
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-extralight" style={{ color: textPrimary }}>
                                <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} /> {dateStr}
                              </span>
                            )}
                          </div>

                          {/* Asignado */}
                          <div className="rounded-xl p-3 border" style={{ background: surfaceSubtle, borderColor }}>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Asignado a</p>
                            {editingTask ? (
                              <div className="space-y-2">
                                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor }}>
                                  {([
                                    { mode: 'user' as AssignMode, label: 'User', icon: UserCheck },
                                    { mode: 'role' as AssignMode, label: 'Rol',  icon: UsersRound },
                                  ]).map(({ mode, label, icon: Icon }) => (
                                    <button key={mode} type="button"
                                      onClick={() => setEditAssignMode(mode)}
                                      className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-extralight transition-all"
                                      style={{
                                        background: editAssignMode === mode ? `${accent}20` : 'transparent',
                                        color: editAssignMode === mode ? accent : textMuted,
                                      }}>
                                      <Icon className="w-3 h-3" /> {label}
                                    </button>
                                  ))}
                                </div>
                                {editAssignMode === 'user' ? (
                                  <select
                                    value={editTask.assignedTo ?? ''}
                                    onChange={e => setEditTask((p: any) => ({ ...p, assignedTo: e.target.value, assignedToRole: '' }))}
                                    className="text-xs font-extralight rounded-lg px-2 py-1 outline-none w-full"
                                    style={{ background: cardBg, color: textPrimary, border: `1px solid ${borderColor}` }}>
                                    <option value="">Sin asignar</option>
                                    {users.map(u => (
                                      <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <select
                                    value={editTask.assignedToRole ?? ''}
                                    onChange={e => setEditTask((p: any) => ({ ...p, assignedToRole: e.target.value, assignedTo: '' }))}
                                    className="text-xs font-extralight rounded-lg px-2 py-1 outline-none w-full"
                                    style={{ background: cardBg, color: textPrimary, border: `1px solid ${borderColor}` }}>
                                    <option value="">Sin rol</option>
                                    {allRoles.map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <>
                                {selectedTask.assignedToRole ? (
                                  <span className={`inline-flex items-center gap-1.5 text-xs font-extralight ${getRoleConfig(selectedTask.assignedToRole, allRoles).color}`}>
                                    <UsersRound className="w-3.5 h-3.5" /> {selectedTask.assignedToRole}
                                  </span>
                                ) : assignedUser ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center ceo-user-avatar flex-shrink-0">
                                      {assignedUser.avatar
                                        ? <img src={assignedUser.avatar} alt="" className="w-full h-full object-cover rounded-md" />
                                        : <span className="text-xs font-extralight" style={{ color: accent }}>{assignedUser.displayName?.[0]?.toUpperCase()}</span>
                                      }
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-extralight truncate" style={{ color: textPrimary }}>{assignedUser.displayName}</p>
                                      <p className="text-[10px] font-extralight" style={{ color: textMuted }}>{assignedUser.role}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs font-extralight" style={{ color: textMuted }}>Sin asignar</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {selectedTask.createdByName && (
                          <div className="flex items-center justify-between text-xs font-extralight pt-2 border-t flex-wrap gap-1" style={{ borderColor, color: textMuted }}>
                            <span>Creado por <span style={{ color: textPrimary }}>{selectedTask.createdByName}</span></span>
                            <span style={{ color: accent }}>ID: {selectedTask.id?.slice(0, 8)}…</span>
                          </div>
                        )}
                      </div>

                      <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
                        {editingTask ? (
                          <>
                            <button onClick={() => setEditingTask(false)}
                              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-extralight transition-all hover:bg-[var(--surface-hover)] text-center"
                              style={{ color: textMuted }}>
                              Cancelar
                            </button>
                            <button onClick={handleUpdateTask}
                              className="ceo-btn-accent w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extralight transition-all">
                              <CheckCircle className="w-3.5 h-3.5" /> Guardar cambios
                            </button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" onClick={() => setShowTaskDetail(false)}
                              className="font-extralight w-full sm:w-auto" style={{ color: textMuted }}>
                              Cerrar
                            </Button>
                            <button
                              onClick={() => {
                                const currentMode: AssignMode = selectedTask.assignedToRole ? 'role' : 'user';
                                setEditAssignMode(currentMode);
                                setEditTask({
                                  title:          selectedTask.title       ?? '',
                                  description:    selectedTask.description ?? '',
                                  priority:       selectedTask.priority    ?? 'medium',
                                  dueDate:        toDateInputValue(selectedTask.date),
                                  assignedTo:     selectedTask.assignedTo     ?? '',
                                  assignedToRole: selectedTask.assignedToRole ?? '',
                                });
                                setEditingTask(true);
                              }}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extralight transition-all border w-full sm:w-auto"
                              style={{ borderColor: `${accent}44`, color: accent }}>
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => { setShowTaskDetail(false); handleDeleteTask(selectedTask.id, selectedTask.title); }}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extralight transition-all hover:bg-red-950/40 border w-full sm:w-auto"
                              style={{ borderColor: 'rgba(248,113,113,0.2)', color: '#f87171' }}>
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </>
                        )}
                      </DialogFooter>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: REPORTES
          ══════════════════════════════════════════ */}
          <TabsContent value="reports" className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 ceo-slide-up">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Total Reportes"  value={reportStats.total}       icon={FileText}   accent={accent}   delay={0}   />
              <StatCard label="Completadas"     value={reportStats.completed}   icon={CheckCheck} accent="#34d399" delay={60}  trend={`${completionRate}% completado`} />
              <StatCard label="En Desarrollo"   value={reportStats.inProgress}  icon={Clock}      accent="#60a5fa" delay={120} />
              <StatCard label="No Completadas"  value={reportStats.notCompleted}icon={XCircle}    accent="#f87171" delay={180} />
            </div>

            {reportStats.total > 0 && (
              <div className="rounded-2xl p-3 sm:p-4 border" style={{ background: cardBg, borderColor }}>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <p className="text-xs sm:text-sm font-extralight" style={{ color: textMuted }}>Progreso general</p>
                  <p className="text-xs sm:text-sm font-extralight" style={{ color: accent }}>{completionRate}% completado</p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${accent}15` }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${completionRate}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 mt-2 sm:mt-3">
                  {[
                    { label: 'Completadas', count: reportStats.completed,   color: '#34d399' },
                    { label: 'En progreso', count: reportStats.inProgress,  color: '#60a5fa' },
                    { label: 'Pendientes',  count: reportStats.notCompleted,color: '#f87171' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-[10px] sm:text-xs font-extralight" style={{ color: textMuted }}>{s.label} ({s.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="relative ceo-search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: textMuted }} />
                <Input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Buscar por tarea, usuario o comentario…"
                  className="pl-10 font-extralight"
                  style={{ background: cardBg, border: `1px solid ${borderColor}`, color: textPrimary }} />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                {[
                  { value: 'all',           label: 'Todos' },
                  { value: 'completed',     label: 'Completadas' },
                  { value: 'in-progress',   label: 'En progreso' },
                  { value: 'not-completed', label: 'No completadas' },
                ].map(f => (
                  <button key={f.value} onClick={() => setReportFilter(f.value as any)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-extralight transition-all"
                    style={{
                      background: reportFilter === f.value ? `${accent}20` : 'transparent',
                      color:      reportFilter === f.value ? accent : textMuted,
                      border:     `1px solid ${reportFilter === f.value ? `${accent}44` : borderColor}`,
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {reportsLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: accent }} />
                <p className="text-sm font-extralight" style={{ color: textMuted }}>Cargando reportes…</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed" style={{ borderColor }}>
                <FileText className="w-12 h-12 mb-3 opacity-15" style={{ color: accent }} strokeWidth={1} />
                <p className="font-extralight" style={{ color: textMuted }}>
                  {reports.length === 0 ? 'No hay reportes enviados aún' : 'No se encontraron reportes'}
                </p>
              </div>
            ) : (
              <div className="ceo-stagger space-y-2">
                {filteredReports.map((report, i) => {
                  const statusCfg = REPORT_STATUS_CONFIG[report.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div key={report.id}
                      className="ceo-report-card rounded-2xl border p-3 sm:p-4 cursor-pointer transition-all duration-200 group"
                      style={{ background: cardBg, borderColor, animationDelay: `${i * 35}ms` }}
                      onClick={() => { setSelectedReport(report); setShowReportDetail(true); }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: `${statusCfg.accent}15`, border: `1px solid ${statusCfg.accent}30` }}>
                              <StatusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: statusCfg.accent }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-extralight truncate text-sm" style={{ color: textPrimary }}>{report.taskTitle}</h3>
                              <div className="flex items-center flex-wrap gap-2 text-[10px] sm:text-xs font-extralight mt-0.5" style={{ color: textMuted }}>
                                <span className="flex items-center gap-1"><User className="w-3 h-3" />{report.userName}</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {report.createdAt?.toDate
                                    ? new Date(report.createdAt.toDate()).toLocaleDateString('es-PE')
                                    : new Date(report.createdAt).toLocaleDateString('es-PE')}
                                </span>
                                {report.files?.length > 0 && (
                                  <span className="flex items-center gap-1"><Download className="w-3 h-3" />{report.files.length} archivo{report.files.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {report.comment && (
                            <p className="text-xs sm:text-sm font-extralight line-clamp-2 pl-9 sm:pl-11" style={{ color: textMuted }}>"{report.comment}"</p>
                          )}
                          {report.files && report.files.length > 0 && (
                            <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3 pl-9 sm:pl-11">
                              {report.files.slice(0, 4).map((file, idx) => (
                                <button key={idx}
                                  onClick={(e) => { e.stopPropagation(); openFileViewer(file); }}
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden border transition-all hover:scale-110"
                                  style={{ background: surfaceHover, borderColor }}
                                  title={file.name}>
                                  {file.type.startsWith('image/') ? (
                                    <img src={file.url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <File className="w-3.5 h-3.5" style={{ color: textMuted }} />
                                    </div>
                                  )}
                                </button>
                              ))}
                              {report.files.length > 4 && (
                                <span className="text-xs font-extralight" style={{ color: textMuted }}>+{report.files.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <span className={`text-[10px] sm:text-xs font-extralight px-2 sm:px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} whitespace-nowrap`}>
                            {statusCfg.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id, (report as any).reportPath); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-950/40 opacity-0 group-hover:opacity-100"
                              style={{ color: textMuted }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4" style={{ color: textMuted }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dialog: Detalle del reporte */}
            <Dialog open={showReportDetail} onOpenChange={setShowReportDetail}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: textPrimary }}
                className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto ceo-scroll border rounded-2xl">
                {selectedReport && (() => {
                  const cfg = REPORT_STATUS_CONFIG[selectedReport.status];
                  const Icon = cfg.icon;
                  return (
                    <>
                      <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${cfg.accent}15`, border: `1px solid ${cfg.accent}30` }}>
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: cfg.accent }} />
                          </div>
                          <div className="min-w-0">
                            <DialogTitle className="font-extralight text-base sm:text-lg truncate">{selectedReport.taskTitle}</DialogTitle>
                            <DialogDescription className="font-extralight text-xs" style={{ color: textMuted }}>
                              {selectedReport.userName} · {selectedReport.createdAt?.toDate
                                ? new Date(selectedReport.createdAt.toDate()).toLocaleString('es-PE')
                                : new Date(selectedReport.createdAt).toLocaleString('es-PE')}
                            </DialogDescription>
                          </div>
                        </div>
                      </DialogHeader>
                      <div className="space-y-4 sm:space-y-5 py-2">
                        <div>
                          <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Estado</p>
                          <div className={`p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                            <p className={`font-extralight text-sm ${cfg.color}`}>{cfg.label}</p>
                          </div>
                        </div>
                        {selectedReport.comment && (
                          <div>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>Comentario / Avance</p>
                            <div className="p-3 sm:p-4 rounded-xl border font-extralight whitespace-pre-wrap text-sm"
                              style={{ background: surfaceSubtle, borderColor, color: textPrimary }}>
                              {selectedReport.comment}
                            </div>
                          </div>
                        )}
                        {selectedReport.files && selectedReport.files.length > 0 && (
                          <div>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                              Archivos Adjuntos ({selectedReport.files.length})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                              {selectedReport.files.map((file, idx) => {
                                const isImage = file.type?.startsWith('image/');
                                const isVideo = file.type?.startsWith('video/');
                                return (
                                  <div key={idx}
                                    className="group relative rounded-xl overflow-hidden border cursor-pointer transition-all hover:scale-[1.02]"
                                    style={{ background: surfaceSubtle, borderColor }}
                                    onClick={() => openFileViewer(file)}>
                                    {isImage && (
                                      <div className="aspect-video w-full overflow-hidden">
                                        <img src={file.url} alt={file.name} className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                    )}
                                    {isVideo && (
                                      <div className="aspect-video w-full flex items-center justify-center" style={{ background: '#000' }}>
                                        <Play className="w-8 h-8 opacity-60" style={{ color: textPrimary }} />
                                      </div>
                                    )}
                                    {!isImage && !isVideo && (
                                      <div className="aspect-video w-full flex items-center justify-center" style={{ background: surfaceSubtle }}>
                                        <File className="w-12 h-12 opacity-30" style={{ color: textPrimary }} />
                                      </div>
                                    )}
                                    <div className="p-2 sm:p-3">
                                      <p className="text-xs sm:text-sm font-extralight truncate" style={{ color: textPrimary }}>{file.name}</p>
                                      {file.size && file.size > 0 && (
                                        <p className="text-xs font-extralight" style={{ color: textMuted }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                      )}
                                      <div className="flex gap-2 mt-2">
                                        <button onClick={(e) => { e.stopPropagation(); openFileViewer(file); }}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-[var(--surface-hover)]"
                                          style={{ border: `1px solid ${borderColor}`, color: textMuted }}>
                                          <Eye className="w-3 h-3" /> Ver
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(file.url, file.name); }}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-[var(--surface-hover)]"
                                          style={{ border: `1px solid ${borderColor}`, color: textMuted }}>
                                          <Download className="w-3 h-3" /> Descargar
                                        </button>
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
                        <button onClick={() => setShowReportDetail(false)}
                          className="ceo-btn-accent w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-extralight transition-all">
                          Cerrar
                        </button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: BANNERS
          ══════════════════════════════════════════ */}
          <TabsContent value="banners" className="mt-4 sm:mt-6 space-y-4 sm:space-y-6 ceo-slide-up">
            <div className="flex flex-col gap-3">
              <div>
                <p className="font-extralight text-sm sm:text-base flex items-center gap-2" style={{ color: textPrimary }}>
                  <MonitorPlay className="w-5 h-5 flex-shrink-0" style={{ color: accent }} />
                  Banners del Dashboard
                </p>
                <p className="font-extralight text-xs sm:text-sm mt-0.5" style={{ color: textMuted }}>
                  {banners.length} banners · Autoplay: {isPlaying ? 'ON' : 'OFF'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    if (banners.length === 0) return;
                    setSavingBanner(true);
                    try {
                      if (banners.length > 0) {
                        const batch = writeBatch(db);
                        banners.forEach((banner, index) => {
                          batch.update(doc(db, 'dashboard_banners', banner.id), { orden: index, actualizadoEn: Timestamp.now() });
                        });
                        await batch.commit();
                      }
                      await setDoc(doc(db, 'dashboard_config', 'banner_settings'), {
                        autoplay: isPlaying, interval: bannerSettings.interval, quality: bannerSettings.quality,
                        actualizadoEn: Timestamp.now(), actualizadoPor: userProfile?.displayName || 'CEO',
                      });
                      try {
                        await logActivity('BANNERS_CONFIG_SAVED', { interval: bannerSettings.interval, autoplay: isPlaying }, userProfile?.uid || '', userProfile?.displayName || 'CEO');
                      } catch (logError) { console.warn('logActivity falló:', logError); }
                      setSaveSuccessModal(true);
                    } catch (error) { console.error('Error saving banners:', error); }
                    finally { setSavingBanner(false); }
                  }}
                  disabled={savingBanner || banners.length === 0}
                  className="ceo-btn-press flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extralight border disabled:opacity-40"
                  style={{ borderColor: '#34d39940', color: '#34d399', background: 'rgba(52,211,153,0.08)' }}>
                  {savingBanner ? <><RefreshCw className="w-3 h-3 animate-spin" />Guardando...</> : <><CheckCircle className="w-3 h-3" />Guardar</>}
                </button>
                <Select value={bannerSettings.interval.toString()} onValueChange={(v) => setBannerSettings(s => ({...s, interval: parseInt(v)}))}>
                  <SelectTrigger className="w-20 font-extralight text-xs" style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}>
                    <Clock className="w-3 h-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: 'var(--dropdown-bg, #18181b)', border: `1px solid ${borderColor}`, zIndex: 9999 }}>
                    {[['3000','3s'],['5000','5s'],['7000','7s'],['10000','10s']].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="font-extralight text-xs" style={{ color: textPrimary }}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extralight transition-all border"
                  style={{ borderColor, color: isPlaying ? '#34d399' : textMuted, background: 'transparent' }}>
                  {isPlaying ? <><Pause className="w-3 h-3" />Pausar</> : <><Play className="w-3 h-3" />Reanudar</>}
                </button>
                <button onClick={() => setShowBannerModal(true)}
                  className="ceo-btn-accent ceo-btn-press flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-extralight ml-auto">
                  <Plus className="w-3.5 h-3.5" /> Nuevo Banner
                </button>
              </div>
            </div>

            {banners.length > 0 && (
              <div
                className="relative w-full rounded-2xl overflow-hidden border group"
                style={{ borderColor }}
                onMouseEnter={() => setHoveringBanner(true)}
                onMouseLeave={() => setHoveringBanner(false)}
              >
                <div className="relative w-full" style={{ height: '200px' }}>
                  <style>{`@media(min-width:640px){.ceo-carousel-inner{height:320px!important;}}`}</style>
                  <div className="ceo-carousel-inner w-full relative overflow-hidden rounded-2xl" style={{ height: '200px' }}>
                    {banners.map((b, idx) => (
                      <div key={b.id}
                        className={`absolute inset-0 transition-all duration-700 ease-out ${idx === bannerActivo ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}>
                        <img src={b.url} alt={b.titulo} className="w-full h-full object-cover cursor-pointer"
                          onClick={() => { setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); setImageOffset({x:0,y:0}); }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
                          <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="inline-block mb-1 sm:mb-2 px-2 py-0.5 rounded-full text-[10px] font-extralight"
                                style={{ background: `${accent}30`, color: accent, border: `1px solid ${accent}40` }}>
                                {idx + 1} / {banners.length}
                              </span>
                              <h3 className="font-extralight text-lg sm:text-2xl mb-0.5 sm:mb-1 truncate" style={{ color: '#fff' }}>{b.titulo}</h3>
                              {b.descripcion && <p className="font-extralight text-xs sm:text-sm opacity-90 truncate hidden sm:block" style={{ color: 'rgba(255,255,255,0.8)' }}>{b.descripcion}</p>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); }}
                              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-extralight backdrop-blur-sm transition-all hover:bg-white/20 flex-shrink-0"
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}>
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Ver HD</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {banners.length > 1 && (
                      <>
                        <button onClick={() => { setBannerActivo(p => (p - 1 + banners.length) % banners.length); setIsPlaying(false); setTimeout(() => setIsPlaying(true), 10000); }}
                          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button onClick={() => { setBannerActivo(p => (p + 1) % banners.length); setIsPlaying(false); setTimeout(() => setIsPlaying(true), 10000); }}
                          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2">
                          {banners.map((_, idx) => (
                            <button key={idx} onClick={() => { setBannerActivo(idx); }}
                              className="h-1 rounded-full bg-white transition-all"
                              style={{ width: idx === bannerActivo ? 24 : 6, opacity: idx === bannerActivo ? 1 : 0.5 }} />
                          ))}
                        </div>
                      </>
                    )}
                    {isPlaying && (
                      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full animate-[progress_5s_linear_infinite]"
                          style={{ background: accent, animationDuration: `${bannerSettings.interval}ms`, transformOrigin: 'left' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bannersLoading ? (
              <div className="flex justify-center py-12 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: accent }} />
              </div>
            ) : banners.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
                style={{ borderColor }} onClick={() => setShowBannerModal(true)}>
                <ImageIcon className="w-12 h-12 mb-3 opacity-15" style={{ color: accent }} />
                <p className="font-extralight text-sm" style={{ color: textMuted }}>No hay banners. Toca para agregar.</p>
              </div>
            ) : (
              <div className="ceo-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {banners.map((banner, idx) => (
                  <div key={banner.id}
                    className="ceo-card-lift rounded-2xl overflow-hidden border group"
                    style={{
                      background: cardBg, borderColor,
                      boxShadow: idx === bannerActivo ? `0 0 0 2px ${accent}50` : 'none',
                    }}>
                    <div className="relative aspect-video overflow-hidden" style={{ background: surfaceSubtle }}>
                      <img src={banner.url} alt={banner.titulo} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => { setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-white/20"
                          style={{ border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'rgba(0,0,0,0.3)' }}>
                          <ZoomIn className="w-3.5 h-3.5" /> Zoom
                        </button>
                        <button onClick={() => setBannerActivo(idx)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-white/20"
                          style={{ border: '1px solid rgba(255,255,255,0.3)', color: '#fff', background: 'rgba(0,0,0,0.3)' }}>
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </button>
                      </div>
                      {idx === bannerActivo && (
                        <div className="absolute top-2 left-2">
                          <span className="ceo-glow-pulse px-2 py-0.5 rounded-full text-[10px] font-extralight flex items-center gap-1"
                            style={{ background: `${accent}90`, color: '#fff', borderRadius: '9999px' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Activo
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-extralight text-sm truncate flex-1" style={{ color: textPrimary }}>{banner.titulo}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => { if (idx > 0) { const nb = [...banners]; [nb[idx],nb[idx-1]]=[nb[idx-1],nb[idx]]; setBanners(nb); if(bannerActivo===idx)setBannerActivo(idx-1); } }}
                            disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-30" style={{ color: textMuted }}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (idx < banners.length - 1) { const nb = [...banners]; [nb[idx],nb[idx+1]]=[nb[idx+1],nb[idx]]; setBanners(nb); if(bannerActivo===idx)setBannerActivo(idx+1); } }}
                            disabled={idx === banners.length - 1} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-30" style={{ color: textMuted }}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteBanner(banner.id)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-red-950/40 hover:text-red-400" style={{ color: textMuted }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lightbox */}
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent className="bg-black/95 border-0 !w-screen !h-[100dvh] !max-w-none !max-h-none p-0 gap-0 overflow-hidden rounded-none">
                <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-extralight text-xs sm:text-sm text-white truncate">{banners[currentBannerIndex]?.titulo}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extralight flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                      {currentBannerIndex + 1}/{banners.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {imageDimensions.naturalWidth > 0 && (
                      <span className="text-xs font-extralight hidden md:block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {imageDimensions.naturalWidth}×{imageDimensions.naturalHeight}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 sm:gap-1 rounded-xl p-1 border" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      <span className="text-xs font-extralight w-10 text-center" style={{ color: 'rgba(255,255,255,0.7)' }}>{Math.round(zoomLevel * 100)}%</span>
                      <button onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                    <button onClick={() => { setZoomLevel(1); setImageOffset({x:0,y:0}); }} className="px-2 sm:px-3 py-1.5 rounded-xl text-xs font-extralight transition-colors hover:bg-white/10 hidden sm:block" style={{ color: 'rgba(255,255,255,0.6)' }}>Reset</button>
                    <button onClick={() => setLightboxOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 ml-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div
                  className="w-full h-full flex items-center justify-center overflow-hidden"
                  style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                  onMouseDown={(e) => { if(zoomLevel>1){setIsDragging(true);setDragStart({x:e.clientX-imageOffset.x,y:e.clientY-imageOffset.y});} }}
                  onMouseMove={(e) => { if(isDragging&&zoomLevel>1)setImageOffset({x:e.clientX-dragStart.x,y:e.clientY-dragStart.y}); }}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  onWheel={(e) => { e.preventDefault(); setZoomLevel(z => Math.max(0.5, Math.min(4, z + (e.deltaY>0?-0.1:0.1)))); }}
                  onTouchStart={(e) => { if(e.touches.length===1&&zoomLevel>1){setIsDragging(true);setDragStart({x:e.touches[0].clientX-imageOffset.x,y:e.touches[0].clientY-imageOffset.y});} }}
                  onTouchMove={(e) => { if(isDragging&&zoomLevel>1&&e.touches.length===1)setImageOffset({x:e.touches[0].clientX-dragStart.x,y:e.touches[0].clientY-dragStart.y}); }}
                  onTouchEnd={() => setIsDragging(false)}
                >
                  {banners[currentBannerIndex] && (
                    <img ref={imageRef} src={banners[currentBannerIndex].url} alt={banners[currentBannerIndex].titulo}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{ transform: `scale(${zoomLevel}) translate(${imageOffset.x/zoomLevel}px,${imageOffset.y/zoomLevel}px)`, transition: isDragging ? 'none' : 'transform 0.2s' }}
                      onLoad={(e) => { const img = e.target as HTMLImageElement; setImageDimensions({width:img.width,height:img.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}); }}
                      onClick={() => { if(zoomLevel===1)setZoomLevel(2);else{setZoomLevel(1);setImageOffset({x:0,y:0});} }}
                      draggable={false} />
                  )}
                </div>

                {banners.length > 1 && (
                  <>
                    <button onClick={() => { setCurrentBannerIndex(i=>(i-1+banners.length)%banners.length); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button onClick={() => { setCurrentBannerIndex(i=>(i+1)%banners.length); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent">
                      <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto ceo-scroll">
                        {banners.map((b, idx) => (
                          <button key={b.id} onClick={() => { setCurrentBannerIndex(idx); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                            className="relative flex-shrink-0 w-12 h-8 sm:w-16 sm:h-10 rounded-lg overflow-hidden border-2 transition-all"
                            style={{ borderColor: idx===currentBannerIndex ? accent : 'transparent', opacity: idx===currentBannerIndex ? 1 : 0.5 }}>
                            <img src={b.url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>

            {/* Modal nuevo banner */}
            <Dialog open={showBannerModal} onOpenChange={setShowBannerModal}>
              <DialogContent style={{ background: cardBg, borderColor, color: textPrimary }} className="w-[calc(100vw-2rem)] max-w-lg border rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base sm:text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" style={{ color: accent }} /> Nuevo Banner
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: textMuted }}>
                    Optimizado para 1200×400px. Formatos: JPG, PNG, WebP.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 sm:space-y-4 py-2 max-h-[60vh] overflow-y-auto ceo-scroll pr-1">
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase flex items-center gap-2" style={{ color: textMuted }}>
                      <Link className="w-3 h-3" /> URL de la imagen *
                    </Label>
                    <Input value={bannerForm.url} onChange={e => setBannerForm(f => ({...f, url: e.target.value}))}
                      placeholder="https://…"
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}
                      className="font-extralight" />
                    {bannerForm.url && (
                      <div className="rounded-xl overflow-hidden border mt-2" style={{ borderColor }}>
                        <img src={bannerForm.url} alt="preview" className="w-full h-28 sm:h-32 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <p className="text-xs font-extralight flex items-center gap-1" style={{ color: textMuted }}>
                      <Info className="w-3 h-3" /> Recomendado: 1200×400px, menos de 500KB
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase" style={{ color: textMuted }}>Título *</Label>
                    <Input value={bannerForm.titulo} onChange={e => setBannerForm(f => ({...f, titulo: e.target.value}))}
                      placeholder="Ej: Nueva Temporada 2024" maxLength={60}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}
                      className="font-extralight" />
                    <div className="flex justify-between text-xs font-extralight" style={{ color: textMuted }}>
                      <span>Máx. 60 caracteres</span>
                      <span>{bannerForm.titulo.length}/60</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase" style={{ color: textMuted }}>Descripción (opcional)</Label>
                    <Textarea value={bannerForm.descripcion} onChange={e => setBannerForm(f => ({...f, descripcion: e.target.value}))}
                      placeholder="Descripción breve…" rows={2} maxLength={120}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: textPrimary }}
                      className="font-extralight resize-none" />
                    <div className="text-xs font-extralight text-right" style={{ color: textMuted }}>{bannerForm.descripcion?.length||0}/120</div>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="ghost" onClick={() => setShowBannerModal(false)} className="font-extralight w-full sm:w-auto" style={{ color: textMuted }}>Cancelar</Button>
                  <button onClick={handleSaveBanner} disabled={savingBanner || !bannerForm.url || !bannerForm.titulo}
                    className="ceo-btn-accent w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extralight transition-all">
                    {savingBanner ? <><RefreshCw className="w-4 h-4 animate-spin" />Publicando...</> : <><CheckCircle className="w-4 h-4" />Publicar</>}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        {/* ── Modal éxito banners ── */}
        <Dialog open={saveSuccessModal} onOpenChange={setSaveSuccessModal}>
          <DialogContent style={{ background: cardBg, borderColor, color: textPrimary }} className="w-[calc(100vw-2rem)] max-w-sm border text-center rounded-2xl">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-extralight text-base sm:text-lg" style={{ color: textPrimary }}>Cambios guardados</h3>
                <p className="font-extralight text-sm mt-1" style={{ color: textMuted }}>
                  La configuración del carrusel y el orden de banners se guardaron correctamente.
                </p>
              </div>
              <div className="w-full rounded-xl border divide-y" style={{ background: surfaceSubtle, borderColor }}>
                {[
                  { label: 'Autoplay', value: isPlaying ? 'Activado' : 'Desactivado', color: isPlaying ? '#34d399' : textMuted },
                  { label: 'Intervalo', value: `${bannerSettings.interval/1000}s`, color: textPrimary },
                  { label: 'Banners', value: `${banners.length} ordenados`, color: textPrimary },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between px-4 py-2.5" style={{ borderColor }}>
                    <span className="font-extralight text-xs" style={{ color: textMuted }}>{item.label}</span>
                    <span className="font-extralight text-xs" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setSaveSuccessModal(false)}
                className="ceo-btn-accent w-full py-2.5 rounded-xl text-sm font-extralight transition-all">
                Entendido
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Viewer de archivos ── */}
        <Dialog open={showViewer} onOpenChange={setShowViewer}>
          <DialogContent
            style={{ background: '#000', borderColor }}
            className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-none sm:max-w-[95vw] h-[95dvh] sm:h-[95vh] max-h-none overflow-hidden p-0 gap-0 rounded-2xl">
            {viewerFile && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b flex-shrink-0" style={{ borderColor }}>
                  <p className="font-extralight text-xs sm:text-sm truncate pr-3 flex-1" style={{ color: 'var(--text-primary)' }}>{viewerFile.name}</p>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <button onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extralight border transition-all hover:bg-[var(--surface-hover)]"
                      style={{ borderColor, color: 'var(--text-muted)' }}>
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Descargar</span>
                    </button>
                    <button onClick={() => setShowViewer(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
                      style={{ color: 'var(--text-muted)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-auto p-2 sm:p-4">
                  {viewerFile.type.startsWith('image/') && (
                    <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain" />
                  )}
                  {viewerFile.type.startsWith('video/') && (
                    <video src={viewerFile.url} controls className="max-w-full max-h-full rounded-xl">Tu navegador no soporta videos.</video>
                  )}
                  {viewerFile.type === 'application/pdf' && (
                    <iframe src={viewerFile.url} className="w-full border-0 rounded-xl" style={{ height: 'calc(95dvh - 64px)', minHeight: '300px' }} title={viewerFile.name} />
                  )}
                  {viewerFile.type.startsWith('audio/') && (
                    <div className="flex flex-col items-center gap-4">
                      <File className="w-16 h-16 sm:w-20 sm:h-20" style={{ color: 'var(--text-muted)' }} />
                      <audio src={viewerFile.url} controls className="w-full max-w-xs sm:max-w-md" />
                    </div>
                  )}
                  {!viewerFile.type.startsWith('image/') && !viewerFile.type.startsWith('video/') && !viewerFile.type.startsWith('audio/') && viewerFile.type !== 'application/pdf' && (
                    <div className="flex flex-col items-center gap-4" style={{ color: 'var(--text-muted)' }}>
                      <File className="w-16 h-16 sm:w-20 sm:h-20 opacity-30" />
                      <p className="font-extralight text-sm">Vista previa no disponible</p>
                      <button onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                        className="ceo-btn-accent flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extralight">
                        <Download className="w-4 h-4" /> Descargar archivo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Modales externos ── */}
        <EmployeeProfileModal open={showProfile} onClose={() => { setShowProfile(false); setProfileUser(null); }} user={profileUser} />
        <EmployeeCredentialModal open={showCredential} onClose={() => { setShowCredential(false); setCredentialUser(null); }} user={credentialUser}
          companyLogoUrl="https://ufvebjscabomuayqtyyo.supabase.co/storage/v1/object/public/task-reports/MARCA%20DE%20AGUA%20BLANCO.png" />
        <BarcodeScannerModal open={showScanner} onClose={() => setShowScanner(false)} allUsers={users} />
        <EmployeeContractModal open={showContract} onClose={() => { setShowContract(false); setContractUser(null); }} user={contractUser} />
      </div>
    </>
  );
};

export default CEOPanel;