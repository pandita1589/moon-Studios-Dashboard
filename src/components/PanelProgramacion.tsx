import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import type { Project, VersionChange, ProjectStatus, ChangeType } from '@/types';
import {
  Code2, Plus, Trash2, Search, GitBranch, Tag, X, Edit3,
  ExternalLink, ChevronDown, Play, Pause,
  CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw,
  BarChart3, Target, Zap, Flag, TrendingUp,
  GitCommit, Package, Shield, Activity, CheckSquare,
  Cpu, Layers,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Config visual ──────────────────────────────────────────────────────────
const STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  planning:  { label: 'Planificación', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', icon: Clock },
  active:    { label: 'Activo',        color: '#34d399', bg: 'rgba(52,211,153,0.1)',  icon: Play },
  paused:    { label: 'Pausado',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Pause },
  completed: { label: 'Completado',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: CheckCircle2 },
  cancelled: { label: 'Cancelado',     color: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: XCircle },
};

const CHANGE_META: Record<ChangeType, { label: string; color: string; icon: React.FC<any> }> = {
  feature:  { label: 'Feature',  color: '#a78bfa', icon: Zap },
  bugfix:   { label: 'Bugfix',   color: '#f87171', icon: Shield },
  refactor: { label: 'Refactor', color: '#60a5fa', icon: RefreshCw },
  docs:     { label: 'Docs',     color: '#34d399', icon: Tag },
  hotfix:   { label: 'Hotfix',   color: '#fb923c', icon: AlertCircle },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Crítico',  color: '#f87171' },
  high:     { label: 'Alto',     color: '#fb923c' },
  medium:   { label: 'Medio',    color: '#facc15' },
  low:      { label: 'Bajo',     color: '#4ade80' },
};

const STACKS = [
  'React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Python',
  'TypeScript', 'Firebase', 'Supabase', 'PostgreSQL', 'Docker',
  'AWS', 'GCP', 'Redis', 'MongoDB', 'GraphQL', 'REST API',
  'Tailwind', 'Vite', 'Webpack', 'Jest', 'Cypress',
];

type Tab = 'overview' | 'proyectos' | 'sprints' | 'changelog' | 'metricas';
type Toast = { type: 'success' | 'error'; msg: string } | null;

interface ProjectForm {
  name: string; description: string; status: ProjectStatus;
  version: string; repository: string; stack: string[];
  priority: string; deadline: string; progress: number;
}
interface ChangeForm {
  projectId: string; version: string; type: ChangeType;
  title: string; description: string; breaking: boolean;
}
interface TaskForm {
  projectId: string; title: string; description: string;
  priority: string; assignee: string; dueDate: string; labels: string[];
}
interface SprintTask {
  id: string; projectId: string; title: string; description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: string; assignee?: string; dueDate?: string;
  labels: string[]; createdAt: any; authorName?: string;
}

const EMPTY_PROJECT: ProjectForm = {
  name: '', description: '', status: 'planning', version: '0.1.0',
  repository: '', stack: [], priority: 'medium', deadline: '', progress: 0,
};
const EMPTY_CHANGE: ChangeForm = {
  projectId: '', version: '', type: 'feature', title: '', description: '', breaking: false,
};
const EMPTY_TASK: TaskForm = {
  projectId: '', title: '', description: '', priority: 'medium',
  assignee: '', dueDate: '', labels: [],
};

const TASK_STATUS = {
  todo:        { label: 'Por hacer',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  in_progress: { label: 'En curso',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  review:      { label: 'En revisión',  color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  done:        { label: 'Completado',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const bd = 'rgba(255,255,255,0.07)';
const sf = 'rgba(255,255,255,0.02)';

const SelectField: React.FC<{
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}> = ({ label, value, onChange, options }) => {
  const cur = options.find(o => o.value === value);
  return (
    <div className="space-y-1.5">
      <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl text-sm font-light outline-none cursor-pointer"
          style={{ background: '#111', border: `1px solid ${bd}`, color: cur?.color ?? 'white' }}>
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#111', color: o.color ?? 'white' }}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-600" strokeWidth={1.5} />
      </div>
    </div>
  );
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, ...props }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">{label}</label>}
    <input {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light text-white placeholder-zinc-700 outline-none"
      style={{ background: '#111', border: `1px solid ${bd}` }} />
  </div>
);

export default function PanelProgramacion() {
  const { currentUser, userProfile, isAdmin, isCEO } = useAuth();
  const canEdit = isAdmin || isCEO || userProfile?.role === 'Programación';

  const [projects,     setProjects]     = useState<Project[]>([]);
  const [changes,      setChanges]      = useState<VersionChange[]>([]);
  const [tasks,        setTasks]        = useState<SprintTask[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<Tab>('overview');
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showChangeForm,  setShowChangeForm]  = useState(false);
  const [showTaskForm,    setShowTaskForm]    = useState(false);
  const [editProject,     setEditProject]     = useState<Project | null>(null);
  const [projectForm,     setProjectForm]     = useState<ProjectForm>(EMPTY_PROJECT);
  const [changeForm,      setChangeForm]      = useState<ChangeForm>(EMPTY_CHANGE);
  const [taskForm,        setTaskForm]        = useState<TaskForm>(EMPTY_TASK);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState<string | null>(null);
  const [toast,           setToast]           = useState<Toast>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [dragTask,  setDragTask]  = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'dev_projects'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setProjects(snap.docs.map(d => {
        const r = d.data();
        return { ...r, id: d.id, createdAt: r.createdAt?.toDate?.() ?? new Date() } as Project;
      }));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'dev_changelog'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setChanges(snap.docs.map(d => {
        const r = d.data();
        return { ...r, id: d.id, createdAt: r.createdAt?.toDate?.() ?? new Date() } as VersionChange;
      }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'dev_tasks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id } as SprintTask)));
    });
    return () => unsub();
  }, []);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Guardar proyecto ────────────────────────────────────────────────────
  const handleSaveProject = async () => {
    if (!projectForm.name.trim()) { showToast('error', 'Nombre obligatorio'); return; }
    setSaving(true);
    try {
      if (editProject) {
        await updateDoc(doc(db, 'dev_projects', editProject.id), { ...projectForm, updatedAt: serverTimestamp() });
        showToast('success', 'Proyecto actualizado');
      } else {
        await addDoc(collection(db, 'dev_projects'), {
          ...projectForm, lead: currentUser?.uid, leadName: userProfile?.displayName,
          members: [currentUser?.uid], createdAt: serverTimestamp(),
        });
        showToast('success', 'Proyecto creado');
      }
      setProjectForm(EMPTY_PROJECT); setShowProjectForm(false); setEditProject(null);
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  // ── Guardar changelog ───────────────────────────────────────────────────
  const handleSaveChange = async () => {
    if (!changeForm.projectId || !changeForm.title.trim() || !changeForm.version.trim()) {
      showToast('error', 'Proyecto, versión y título requeridos'); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'dev_changelog'), {
        ...changeForm, author: currentUser?.uid, authorName: userProfile?.displayName,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'dev_projects', changeForm.projectId), { version: changeForm.version, updatedAt: serverTimestamp() });
      showToast('success', `v${changeForm.version} registrada`);
      setChangeForm(EMPTY_CHANGE); setShowChangeForm(false);
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  // ── Guardar tarea ───────────────────────────────────────────────────────
  const handleSaveTask = async () => {
    if (!taskForm.projectId || !taskForm.title.trim()) {
      showToast('error', 'Proyecto y título requeridos'); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'dev_tasks'), {
        ...taskForm, status: 'todo', author: currentUser?.uid,
        authorName: userProfile?.displayName, createdAt: serverTimestamp(),
      });
      showToast('success', 'Tarea creada');
      setTaskForm(EMPTY_TASK); setShowTaskForm(false);
    } catch (err: any) { showToast('error', err.message); }
    finally { setSaving(false); }
  };

  // ── Cambiar status de tarea (drag & drop) ───────────────────────────────
  const handleMoveTask = async (taskId: string, newStatus: SprintTask['status']) => {
    try {
      await updateDoc(doc(db, 'dev_tasks', taskId), { status: newStatus, updatedAt: serverTimestamp() });
    } catch (err: any) { showToast('error', 'Error moviendo tarea'); }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'dev_projects', id));
      showToast('success', 'Proyecto eliminado');
    } catch (err: any) { showToast('error', err.message); }
    finally { setDeleting(null); }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try { await deleteDoc(doc(db, 'dev_tasks', id)); showToast('success', 'Tarea eliminada'); }
    catch (err: any) { showToast('error', err.message); }
  };

  const handleUpdateProgress = async (id: string, progress: number) => {
    try { await updateDoc(doc(db, 'dev_projects', id), { progress, updatedAt: serverTimestamp() }); }
    catch {}
  };

  // ── Derivados ────────────────────────────────────────────────────────────
  const filteredProjects = projects.filter(p => {
    const ms = filterStatus === 'all' || p.status === filterStatus;
    const mq = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.stack?.some((s: string) => s.toLowerCase().includes(search.toLowerCase()));
    return ms && mq;
  });

  const filteredChanges = changes.filter(c =>
    (selectedProject === 'all' || c.projectId === selectedProject) &&
    (!search || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  const projectTasks = (projId: string) => tasks.filter(t => t.projectId === projId);
  const tasksByStatus = (status: string) =>
    tasks.filter(t =>
      (selectedProject === 'all' || t.projectId === selectedProject) &&
      (status === 'all' || t.status === status)
    );

  const totalActive    = projects.filter(p => p.status === 'active').length;
  const totalCompleted = projects.filter(p => p.status === 'completed').length;
  const totalTasks     = tasks.length;
  const doneTasks      = tasks.filter(t => t.status === 'done').length;
  const avgProgress    = projects.length
    ? Math.round(projects.reduce((a, p) => a + ((p as any).progress ?? 0), 0) / projects.length)
    : 0;

  const recentChanges = changes.slice(0, 5);

  const TABS: { id: Tab; label: string; icon: React.FC<any>; badge?: number }[] = [
    { id: 'overview',  label: 'Overview',   icon: BarChart3 },
    { id: 'proyectos', label: 'Proyectos',  icon: Package,   badge: projects.filter(p => p.status === 'active').length },
    { id: 'sprints',   label: 'Sprints',    icon: Target,    badge: tasks.filter(t => t.status !== 'done').length },
    { id: 'changelog', label: 'Changelog',  icon: GitCommit, badge: changes.length },
    { id: 'metricas',  label: 'Métricas',   icon: TrendingUp },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <div className="w-5 h-5 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      <span className="text-zinc-600 text-sm font-light">Cargando...</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-light shadow-2xl"
          style={{
            background: toast.type === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
            color: toast.type === 'success' ? '#34d399' : '#f87171',
          }}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} /> : <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)' }}>
            <Code2 className="w-5 h-5" style={{ color: '#f472b6' }} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-white text-xl font-light">Panel de Programación</h1>
            <p className="text-zinc-500 text-sm font-light">{projects.length} proyectos · {totalTasks} tareas</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowTaskForm(true); setShowProjectForm(false); setShowChangeForm(false); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-light transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}`, color: 'white' }}>
              <CheckSquare className="w-3.5 h-3.5" strokeWidth={1.5} /> Tarea
            </button>
            <button onClick={() => { setShowChangeForm(true); setShowProjectForm(false); setShowTaskForm(false); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-light transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}`, color: 'white' }}>
              <GitCommit className="w-3.5 h-3.5" strokeWidth={1.5} /> Release
            </button>
            <button onClick={() => { setShowProjectForm(true); setShowChangeForm(false); setShowTaskForm(false); setEditProject(null); setProjectForm(EMPTY_PROJECT); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90"
              style={{ background: '#fff', color: '#000' }}>
              <Plus className="w-4 h-4" strokeWidth={2} /> Proyecto
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-2xl flex-wrap" style={{ background: sf, border: `1px solid ${bd}` }}>
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light transition-all"
              style={{ background: active ? 'rgba(255,255,255,0.08)' : 'transparent', color: active ? 'white' : '#555' }}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{ background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', color: active ? '#fff' : '#555' }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ════ OVERVIEW ════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Proyectos activos',  value: totalActive,    color: '#34d399', icon: Play },
              { label: 'Completados',         value: totalCompleted,  color: '#60a5fa', icon: CheckCircle2 },
              { label: 'Tareas abiertas',     value: totalTasks - doneTasks, color: '#f59e0b', icon: Target },
              { label: 'Progreso promedio',   value: `${avgProgress}%`, color: '#a78bfa', icon: TrendingUp },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-4 space-y-3" style={{ background: sf, border: `1px solid ${bd}` }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                </div>
                <p className="text-2xl font-light tabular-nums" style={{ color }}>{value}</p>
                <p className="text-[10px] uppercase tracking-widest font-light text-zinc-600">{label}</p>
              </div>
            ))}
          </div>

          {/* Proyectos activos + actividad reciente */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Proyectos en curso */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
              <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.025)', borderBottom: `1px solid ${bd}` }}>
                <Activity className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                <p className="text-white text-sm font-light">Proyectos en curso</p>
              </div>
              <div className="divide-y" style={{ borderColor: bd }}>
                {projects.filter(p => p.status === 'active').slice(0, 5).map(p => {
                  const progress = (p as any).progress ?? 0;
                  const ptasks   = projectTasks(p.id);
                  const done     = ptasks.filter(t => t.status === 'done').length;
                  return (
                    <div key={p.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-white text-sm font-light truncate">{p.name}</p>
                          <span className="text-[10px] font-mono text-zinc-600">v{p.version}</span>
                        </div>
                        <span className="text-[10px] font-light" style={{ color: '#34d399' }}>{progress}%</span>
                      </div>
                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: '#34d399bb' }} />
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-light text-zinc-600">
                        <span>{p.stack?.slice(0, 3).join(' · ')}</span>
                        {ptasks.length > 0 && <span>{done}/{ptasks.length} tareas</span>}
                      </div>
                    </div>
                  );
                })}
                {projects.filter(p => p.status === 'active').length === 0 && (
                  <div className="px-5 py-8 text-center text-zinc-600 text-sm font-light">Sin proyectos activos</div>
                )}
              </div>
            </div>

            {/* Actividad reciente */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
              <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.025)', borderBottom: `1px solid ${bd}` }}>
                <GitCommit className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                <p className="text-white text-sm font-light">Actividad reciente</p>
              </div>
              <div className="divide-y" style={{ borderColor: bd }}>
                {recentChanges.map(c => {
                  const meta    = CHANGE_META[c.type as ChangeType] ?? CHANGE_META.feature;
                  const project = projects.find(p => p.id === c.projectId);
                  return (
                    <div key={c.id} className="px-5 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: meta.color + '18' }}>
                        <meta.icon className="w-3 h-3" style={{ color: meta.color }} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-xs font-light truncate">{c.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] font-light text-zinc-600">
                          <span>{project?.name ?? '—'}</span>
                          <span>·</span>
                          <span>v{(c as any).version}</span>
                          <span>·</span>
                          <span>{(c as any).authorName ?? '—'}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-light text-zinc-700 flex-shrink-0">
                        {formatDistanceToNow(c.createdAt instanceof Date ? c.createdAt : new Date(), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
                {recentChanges.length === 0 && (
                  <div className="px-5 py-8 text-center text-zinc-600 text-sm font-light">Sin actividad reciente</div>
                )}
              </div>
            </div>
          </div>

          {/* Distribución de estado */}
          <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
              <p className="text-white text-sm font-light">Distribución de proyectos</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {(Object.entries(STATUS_META) as [ProjectStatus, any][]).map(([status, meta]) => {
                const count = projects.filter(p => p.status === status).length;
                return (
                  <div key={status} className="rounded-xl p-3 text-center cursor-pointer transition-all hover:opacity-80"
                    onClick={() => { setActiveTab('proyectos'); setFilterStatus(status); }}
                    style={{ background: count > 0 ? meta.color + '12' : 'rgba(255,255,255,0.02)', border: `1px solid ${count > 0 ? meta.color + '30' : bd}` }}>
                    <p className="text-2xl font-light" style={{ color: meta.color }}>{count}</p>
                    <p className="text-[10px] uppercase tracking-widest font-light mt-1" style={{ color: count > 0 ? meta.color : '#555' }}>{meta.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ════ PROYECTOS ════ */}
      {activeTab === 'proyectos' && (
        <div className="space-y-4">
          {/* Modal proyecto */}
          {showProjectForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
              <div className="w-full max-w-lg rounded-3xl overflow-hidden" style={{ background: '#0a0a0a', border: `1px solid ${bd}` }}>
                <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: bd }}>
                  <h2 className="text-white text-base font-light">{editProject ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
                  <button onClick={() => { setShowProjectForm(false); setEditProject(null); }}
                    className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white">
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                  <Input label="Nombre *" value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del proyecto" />
                  <div className="space-y-1.5">
                    <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">Descripción</label>
                    <textarea value={projectForm.description} onChange={e => setProjectForm(p => ({ ...p, description: e.target.value }))}
                      rows={3} placeholder="Descripción breve"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light text-white placeholder-zinc-700 outline-none resize-none"
                      style={{ background: '#111', border: `1px solid ${bd}` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <SelectField label="Estado" value={projectForm.status}
                      onChange={v => setProjectForm(p => ({ ...p, status: v as ProjectStatus }))}
                      options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
                    <SelectField label="Prioridad" value={projectForm.priority}
                      onChange={v => setProjectForm(p => ({ ...p, priority: v }))}
                      options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Versión inicial" value={projectForm.version} onChange={e => setProjectForm(p => ({ ...p, version: e.target.value }))} placeholder="0.1.0" />
                    <Input label="Deadline" type="date" value={projectForm.deadline} onChange={e => setProjectForm(p => ({ ...p, deadline: e.target.value }))} />
                  </div>
                  <Input label="Repositorio" value={projectForm.repository} onChange={e => setProjectForm(p => ({ ...p, repository: e.target.value }))} placeholder="https://github.com/..." />
                  <div className="space-y-1.5">
                    <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">Progreso ({projectForm.progress}%)</label>
                    <input type="range" min={0} max={100} step={5} value={projectForm.progress}
                      onChange={e => setProjectForm(p => ({ ...p, progress: parseInt(e.target.value) }))}
                      className="w-full" style={{ accentColor: '#f472b6' }} />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">Stack</label>
                    <div className="flex flex-wrap gap-2">
                      {STACKS.map(tech => {
                        const sel = projectForm.stack.includes(tech);
                        return (
                          <button key={tech} type="button"
                            onClick={() => setProjectForm(p => ({ ...p, stack: sel ? p.stack.filter(s => s !== tech) : [...p.stack, tech] }))}
                            className="px-2.5 py-1 rounded-lg text-xs font-light transition-all"
                            style={{ background: sel ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sel ? 'rgba(167,139,250,0.4)' : bd}`, color: sel ? '#a78bfa' : '#6b7280' }}>
                            {tech}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-5 border-t" style={{ borderColor: bd }}>
                  <button onClick={() => { setShowProjectForm(false); setEditProject(null); }} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-light text-zinc-500"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>Cancelar</button>
                  <button onClick={handleSaveProject} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-light transition-all"
                    style={{ background: saving ? '#222' : '#fff', color: saving ? '#555' : '#000' }}>
                    {saving ? 'Guardando...' : editProject ? 'Actualizar' : 'Crear proyecto'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proyecto..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light text-white placeholder-zinc-700 outline-none"
                style={{ background: '#111', border: `1px solid ${bd}` }} />
            </div>
            <div className="flex gap-1">
              {['all', ...Object.keys(STATUS_META)].map(s => {
                const active = filterStatus === s;
                const color  = s !== 'all' ? STATUS_META[s as ProjectStatus]?.color : '#fff';
                return (
                  <button key={s} onClick={() => setFilterStatus(s as any)}
                    className="px-3 py-1.5 rounded-xl text-xs font-light transition-all"
                    style={{ background: active ? color + '15' : 'rgba(255,255,255,0.03)', color: active ? color : '#555', border: `1px solid ${active ? color + '35' : bd}` }}>
                    {s === 'all' ? 'Todos' : STATUS_META[s as ProjectStatus]?.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de proyectos */}
          {filteredProjects.length === 0 ? (
            <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${bd}` }}>
              <Package className="w-10 h-10 text-zinc-800 mx-auto mb-3" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">Sin proyectos</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map(p => {
                const sm      = STATUS_META[p.status as ProjectStatus] ?? STATUS_META.planning;
                const pm      = PRIORITY_META[(p as any).priority ?? 'medium'];
                const ptasks  = projectTasks(p.id);
                const done    = ptasks.filter(t => t.status === 'done').length;
                const pchange = changes.filter(c => c.projectId === p.id).length;
                const progress = (p as any).progress ?? 0;
                const isExp   = expandedProject === p.id;

                return (
                  <div key={p.id} className="rounded-2xl overflow-hidden transition-all"
                    style={{ border: `1px solid ${isExp ? sm.color + '40' : bd}`, background: isExp ? sm.color + '06' : sf }}>
                    {/* Fila principal */}
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedProject(isExp ? null : p.id)}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: sm.bg }}>
                        <sm.icon className="w-4 h-4" style={{ color: sm.color }} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-light text-sm truncate">{p.name}</p>
                          <span className="text-[10px] font-mono text-zinc-600">v{p.version}</span>
                          {(p as any).breaking && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400">breaking</span>}
                        </div>
                        <div className="h-1 bg-zinc-900 rounded-full overflow-hidden w-full max-w-xs">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${progress}%`, background: sm.color + 'bb' }} />
                        </div>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-xs font-light text-zinc-500 flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <Flag className="w-3 h-3" style={{ color: pm?.color }} strokeWidth={1.5} />
                          {pm?.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckSquare className="w-3 h-3" strokeWidth={1.5} />
                          {done}/{ptasks.length}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitCommit className="w-3 h-3" strokeWidth={1.5} />
                          {pchange} releases
                        </span>
                        <span style={{ color: sm.color }}>{progress}%</span>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => { setEditProject(p); setProjectForm({ name: p.name, description: p.description ?? '', status: p.status as ProjectStatus, version: p.version, repository: (p as any).repository ?? '', stack: p.stack ?? [], priority: (p as any).priority ?? 'medium', deadline: (p as any).deadline ?? '', progress: (p as any).progress ?? 0 }); setShowProjectForm(true); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: '#555' }}>
                            <Edit3 className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                          {(p as any).repository && (
                            <a href={(p as any).repository} target="_blank" rel="noreferrer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-white/[0.06]" style={{ color: '#555' }}>
                              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                            </a>
                          )}
                          <button onClick={() => handleDeleteProject(p.id, p.name)} disabled={deleting === p.id}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/10"
                            style={{ color: '#555' }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#555'}>
                            {deleting === p.id ? <RefreshCw className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Trash2 className="w-3 h-3" strokeWidth={1.5} />}
                          </button>
                        </div>
                      )}
                      <ChevronDown className={`w-4 h-4 text-zinc-600 transition-transform ${isExp ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                    </div>

                    {/* Detalle expandido */}
                    {isExp && (
                      <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: bd }}>
                        {p.description && (
                          <p className="text-zinc-400 text-sm font-light leading-relaxed">{p.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-light">
                          {[
                            { label: 'Stack', value: p.stack?.join(', ') || '—' },
                            { label: 'Lead', value: (p as any).leadName ?? '—' },
                            { label: 'Deadline', value: (p as any).deadline ? format(new Date((p as any).deadline), 'dd/MM/yyyy') : '—' },
                            { label: 'Creado', value: format(p.createdAt instanceof Date ? p.createdAt : new Date(), 'dd/MM/yyyy') },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">{label}</p>
                              <p className="text-zinc-300">{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Progreso manual */}
                        {canEdit && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-light text-zinc-500">
                              <span>PROGRESO</span><span>{progress}%</span>
                            </div>
                            <input type="range" min={0} max={100} step={5} defaultValue={progress}
                              onMouseUp={e => handleUpdateProgress(p.id, parseInt((e.target as HTMLInputElement).value))}
                              className="w-full" style={{ accentColor: sm.color }} />
                          </div>
                        )}

                        {/* Tareas del proyecto */}
                        {ptasks.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-widest font-light text-zinc-600 mb-2">Tareas</p>
                            <div className="space-y-1.5">
                              {ptasks.slice(0, 4).map(t => {
                                const ts = TASK_STATUS[t.status];
                                return (
                                  <div key={t.id} className="flex items-center gap-2 text-xs font-light">
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ts.color }} />
                                    <span className="text-zinc-300 truncate flex-1">{t.title}</span>
                                    <span style={{ color: ts.color }}>{ts.label}</span>
                                  </div>
                                );
                              })}
                              {ptasks.length > 4 && <p className="text-zinc-700 text-[10px] font-light">+{ptasks.length - 4} más</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ SPRINTS / TAREAS ════ */}
      {activeTab === 'sprints' && (
        <div className="space-y-4">
          {/* Modal tarea */}
          {showTaskForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
              <div className="w-full max-w-md rounded-3xl overflow-hidden" style={{ background: '#0a0a0a', border: `1px solid ${bd}` }}>
                <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: bd }}>
                  <h2 className="text-white text-base font-light">Nueva tarea</h2>
                  <button onClick={() => setShowTaskForm(false)}
                    className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white">
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <SelectField label="Proyecto *" value={taskForm.projectId}
                    onChange={v => setTaskForm(p => ({ ...p, projectId: v }))}
                    options={[{ value: '', label: 'Seleccionar proyecto...' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
                  <Input label="Título *" value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="Título de la tarea" />
                  <div className="space-y-1.5">
                    <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">Descripción</label>
                    <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))}
                      rows={2} placeholder="Descripción opcional"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light text-white placeholder-zinc-700 outline-none resize-none"
                      style={{ background: '#111', border: `1px solid ${bd}` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <SelectField label="Prioridad" value={taskForm.priority}
                      onChange={v => setTaskForm(p => ({ ...p, priority: v }))}
                      options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
                    <Input label="Fecha límite" type="date" value={taskForm.dueDate} onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3 px-6 py-5 border-t" style={{ borderColor: bd }}>
                  <button onClick={() => setShowTaskForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-light text-zinc-500"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>Cancelar</button>
                  <button onClick={handleSaveTask} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-light"
                    style={{ background: saving ? '#222' : '#fff', color: saving ? '#555' : '#000' }}>
                    {saving ? 'Guardando...' : 'Crear tarea'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtros kanban */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-2 rounded-xl text-xs font-light text-white outline-none cursor-pointer"
                style={{ background: '#111', border: `1px solid ${bd}` }}>
                <option value="all">Todos los proyectos</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" strokeWidth={1.5} />
            </div>
            {canEdit && (
              <button onClick={() => setShowTaskForm(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light ml-auto"
                style={{ background: '#fff', color: '#000' }}>
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Nueva tarea
              </button>
            )}
          </div>

          {/* Tablero Kanban */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {(Object.entries(TASK_STATUS) as [SprintTask['status'], any][]).map(([status, meta]) => {
              const colTasks = tasksByStatus(status);
              return (
                <div key={status} className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${bd}`, background: sf }}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragTask) handleMoveTask(dragTask, status); setDragTask(null); }}>
                  {/* Header columna */}
                  <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: bd }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                      <span className="text-xs font-light" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    <span className="text-[10px] font-light text-zinc-600">{colTasks.length}</span>
                  </div>
                  {/* Tareas */}
                  <div className="p-2 space-y-2 min-h-[120px]">
                    {colTasks.map(t => {
                      const pm = PRIORITY_META[t.priority] ?? PRIORITY_META.medium;
                      const proj = projects.find(p => p.id === t.projectId);
                      return (
                        <div key={t.id} draggable
                          onDragStart={() => setDragTask(t.id)}
                          onDragEnd={() => setDragTask(null)}
                          className="rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all hover:border-zinc-600 group"
                          style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${bd}` }}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-white text-xs font-light leading-relaxed flex-1">{t.title}</p>
                            {canEdit && (
                              <button onClick={() => handleDeleteTask(t.id)}
                                className="w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all hover:bg-red-500/10"
                                style={{ color: '#555' }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#f87171'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#555'}>
                                <X className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md"
                              style={{ color: pm.color, background: pm.color + '15' }}>
                              {pm.label}
                            </span>
                            {proj && (
                              <span className="text-[10px] font-light text-zinc-600">{proj.name}</span>
                            )}
                            {t.dueDate && (
                              <span className="text-[10px] font-light text-zinc-700">{format(new Date(t.dueDate), 'dd/MM')}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className="py-6 text-center text-zinc-800 text-xs font-light">
                        Arrastra tareas aquí
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════ CHANGELOG ════ */}
      {activeTab === 'changelog' && (
        <div className="space-y-4">
          {/* Modal changelog */}
          {showChangeForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
              <div className="w-full max-w-lg rounded-3xl overflow-hidden" style={{ background: '#0a0a0a', border: `1px solid ${bd}` }}>
                <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: bd }}>
                  <h2 className="text-white text-base font-light">Registrar release</h2>
                  <button onClick={() => setShowChangeForm(false)}
                    className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 hover:text-white">
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <SelectField label="Proyecto *" value={changeForm.projectId}
                    onChange={v => setChangeForm(p => ({ ...p, projectId: v }))}
                    options={[{ value: '', label: 'Seleccionar proyecto...' }, ...projects.map(p => ({ value: p.id, label: `${p.name} (v${p.version})` }))]} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Nueva versión *" value={changeForm.version} onChange={e => setChangeForm(p => ({ ...p, version: e.target.value }))} placeholder="1.2.0" />
                    <SelectField label="Tipo" value={changeForm.type}
                      onChange={v => setChangeForm(p => ({ ...p, type: v as ChangeType }))}
                      options={Object.entries(CHANGE_META).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
                  </div>
                  <Input label="Título *" value={changeForm.title} onChange={e => setChangeForm(p => ({ ...p, title: e.target.value }))} placeholder="Descripción corta del cambio" />
                  <div className="space-y-1.5">
                    <label className="block text-zinc-500 text-[10px] font-light uppercase tracking-widest">Notas de release</label>
                    <textarea value={changeForm.description} onChange={e => setChangeForm(p => ({ ...p, description: e.target.value }))}
                      rows={4} placeholder="Detalla los cambios, correcciones y mejoras..."
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light text-white placeholder-zinc-700 outline-none resize-none"
                      style={{ background: '#111', border: `1px solid ${bd}` }} />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="w-10 h-5 rounded-full relative transition-all" style={{ background: changeForm.breaking ? '#f87171' : 'rgba(255,255,255,0.1)' }}
                      onClick={() => setChangeForm(p => ({ ...p, breaking: !p.breaking }))}>
                      <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: changeForm.breaking ? 'calc(100% - 18px)' : '2px' }} />
                    </div>
                    <span className="text-xs font-light text-zinc-400">Breaking change</span>
                  </label>
                </div>
                <div className="flex gap-3 px-6 py-5 border-t" style={{ borderColor: bd }}>
                  <button onClick={() => setShowChangeForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-light text-zinc-500"
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${bd}` }}>Cancelar</button>
                  <button onClick={handleSaveChange} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-light"
                    style={{ background: saving ? '#222' : '#fff', color: saving ? '#555' : '#000' }}>
                    {saving ? 'Guardando...' : 'Publicar release'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-2 rounded-xl text-xs font-light text-white outline-none cursor-pointer"
                style={{ background: '#111', border: `1px solid ${bd}` }}>
                <option value="all">Todos los proyectos</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" strokeWidth={1.5} />
            </div>
            {canEdit && (
              <button onClick={() => setShowChangeForm(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-light ml-auto"
                style={{ background: '#fff', color: '#000' }}>
                <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Release
              </button>
            )}
          </div>

          {/* Timeline */}
          {filteredChanges.length === 0 ? (
            <div className="py-16 text-center rounded-2xl" style={{ border: `1px dashed ${bd}` }}>
              <GitBranch className="w-10 h-10 text-zinc-800 mx-auto mb-3" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">Sin releases registrados</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2.5 top-0 bottom-0 w-px" style={{ background: bd }} />
              <div className="space-y-3">
                {filteredChanges.map(c => {
                  const meta  = CHANGE_META[c.type as ChangeType] ?? CHANGE_META.feature;
                  const proj  = projects.find(p => p.id === c.projectId);
                  return (
                    <div key={c.id} className="relative">
                      <div className="absolute -left-[22px] top-4 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: '#0a0a0a', border: `2px solid ${meta.color}` }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                      </div>
                      <div className="rounded-2xl p-4 transition-all hover:border-zinc-700"
                        style={{ background: sf, border: `1px solid ${bd}` }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-light text-sm">{c.title}</span>
                            <span className="text-[10px] font-light px-2 py-0.5 rounded-full"
                              style={{ color: meta.color, background: meta.color + '15', border: `1px solid ${meta.color}30` }}>
                              {meta.label}
                            </span>
                            {(c as any).breaking && (
                              <span className="text-[10px] font-light px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400">breaking</span>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-zinc-400 text-xs font-mono">v{(c as any).version}</p>
                            <p className="text-zinc-700 text-[10px] font-light">{proj?.name}</p>
                          </div>
                        </div>
                        {(c as any).description && (
                          <p className="text-zinc-500 text-xs font-light leading-relaxed mb-2">{(c as any).description}</p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] font-light text-zinc-700">
                          <span>{(c as any).authorName ?? '—'}</span>
                          <span>·</span>
                          <span>{format(c.createdAt instanceof Date ? c.createdAt : new Date(), 'dd MMM yyyy, HH:mm', { locale: es })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════ MÉTRICAS ════ */}
      {activeTab === 'metricas' && (
        <div className="space-y-5">
          {/* Velocidad del equipo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Total releases', value: changes.length, color: '#a78bfa', icon: GitCommit },
              { label: 'Tasa completado', value: tasks.length > 0 ? `${Math.round((doneTasks / tasks.length) * 100)}%` : '—', color: '#4ade80', icon: CheckCircle2 },
              { label: 'Proyectos activos', value: totalActive, color: '#34d399', icon: Activity },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                  <p className="text-zinc-500 text-xs font-light uppercase tracking-widest">{label}</p>
                </div>
                <p className="text-3xl font-light" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Releases por tipo */}
          <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 mb-5">
              <GitBranch className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
              <p className="text-white text-sm font-light">Releases por tipo</p>
            </div>
            <div className="space-y-3">
              {Object.entries(CHANGE_META).map(([type, meta]) => {
                const count = changes.filter(c => c.type === type).length;
                const pct   = changes.length > 0 ? (count / changes.length) * 100 : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} strokeWidth={1.5} />
                        <span className="text-zinc-400 text-sm font-light">{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-600 text-xs font-light">{pct.toFixed(0)}%</span>
                        <span className="text-white text-sm font-light tabular-nums w-4 text-right">{count}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: meta.color + 'bb' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress por proyecto */}
          <div className="rounded-2xl p-5" style={{ background: sf, border: `1px solid ${bd}` }}>
            <div className="flex items-center gap-2 mb-5">
              <Layers className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
              <p className="text-white text-sm font-light">Progreso por proyecto</p>
            </div>
            {projects.length === 0 ? (
              <p className="text-zinc-600 text-sm font-light text-center py-6">Sin proyectos</p>
            ) : (
              <div className="space-y-4">
                {projects.map(p => {
                  const sm  = STATUS_META[p.status as ProjectStatus] ?? STATUS_META.planning;
                  const prog = (p as any).progress ?? 0;
                  const ptasks = projectTasks(p.id);
                  const done = ptasks.filter(t => t.status === 'done').length;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: sm.color }} />
                          <span className="text-zinc-300 text-sm font-light">{p.name}</span>
                          <span className="text-zinc-600 text-[10px] font-mono">v{p.version}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {ptasks.length > 0 && <span className="text-zinc-600 text-xs font-light">{done}/{ptasks.length} tareas</span>}
                          <span className="text-xs font-light" style={{ color: sm.color }}>{prog}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${prog}%`, background: sm.color + 'cc' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}