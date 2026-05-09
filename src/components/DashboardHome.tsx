import React, { useState, useEffect, useCallback } from 'react';
import { getTasks, getAnnouncements, subscribeToTasks } from '@/lib/firebase';
import { getBotStatus } from '@/services/discordApi';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CheckCircle2, Clock, Bot, AlertCircle, TrendingUp,
  Calendar as CalendarIcon, CheckCheck, ChevronLeft, ChevronRight,
  MonitorPlay, Maximize2, X, Megaphone,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Task, Announcement } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (dateValue: any): string => {
  if (!dateValue) return 'Sin fecha';
  try {
    if (dateValue.toDate && typeof dateValue.toDate === 'function')
      return format(dateValue.toDate(), 'd MMM', { locale: es });
    if (dateValue instanceof Date) return format(dateValue, 'd MMM', { locale: es });
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'Fecha inválida';
    return format(date, 'd MMM', { locale: es });
  } catch { return 'Fecha inválida'; }
};

interface Banner {
  id: string; url: string; titulo: string; descripcion?: string; creadoEn: any;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  accent?: string;
  progress?: number;
}
const StatCard: React.FC<StatCardProps> = ({ label, value, sub, icon, accent, progress }) => (
  <div
    className="relative overflow-hidden p-5 rounded-2xl border flex flex-col gap-3"
    style={{
      background: 'hsl(var(--card))',
      borderColor: 'hsl(var(--border))',
      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
    }}
  >
    {/* Icon */}
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] font-light uppercase tracking-widest mb-2"
          style={{ color: accent ?? 'hsl(var(--muted-foreground))' }}>
          {label}
        </p>
        <div className="text-3xl font-extralight text-white leading-none">{value}</div>
        {sub && <div className="text-xs mt-1.5 font-light" style={{ color: 'hsl(var(--muted-foreground))' }}>{sub}</div>}
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: accent ? `${accent}18` : 'rgba(255,255,255,0.05)', border: `1px solid ${accent ? `${accent}25` : 'rgba(255,255,255,0.07)'}` }}>
        {icon}
      </div>
    </div>
    {/* Progress bar */}
    {progress !== undefined && (
      <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, background: accent ?? '#fff' }}
        />
      </div>
    )}
    {/* Subtle bg accent */}
    {accent && (
      <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}0d 0%, transparent 70%)` }} />
    )}
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────
const DashboardHome: React.FC = () => {
  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [botStatus,     setBotStatus]     = useState<any>(null);
  const [loading,       setLoading]       = useState(true);
  const [stats, setStats] = useState({
    total: 0, pending: 0, inProgress: 0,
    completed: 0, highPriority: 0, completionRate: 0,
  });

  const [banners,           setBanners]           = useState<Banner[]>([]);
  const [bannerActivo,      setBannerActivo]      = useState(0);
  const [lightboxOpen,      setLightboxOpen]      = useState(false);
  const [currentBannerIdx,  setCurrentBannerIdx]  = useState(0);

  const calculateStats = (taskList: Task[]) => {
    const total       = taskList.length;
    const pending     = taskList.filter(t => t.status === 'pending').length;
    const inProgress  = taskList.filter(t => t.status === 'in-progress').length;
    const completed   = taskList.filter(t => t.status === 'completed').length;
    const highPriority = taskList.filter(t => t.priority === 'high' && t.status !== 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    setStats({ total, pending, inProgress, completed, highPriority, completionRate });
  };

  const fetchBanners = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc')));
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
    } catch (e) { console.error('Error fetching banners:', e); }
  }, []);

  useEffect(() => {
    let unsubscribeTasks: (() => void) | null = null;
    const fetchData = async () => {
      try {
        const [tasksData, announcementsData, botData] = await Promise.all([
          getTasks(),
          getAnnouncements(),
          getBotStatus().catch(() => ({ status: 'offline', servers: 0, users: 0 })),
        ]);
        setTasks(tasksData as Task[]);
        calculateStats(tasksData as Task[]);
        setAnnouncements(announcementsData as Announcement[]);
        setBotStatus(botData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    const setupRealtime = () => {
      unsubscribeTasks = subscribeToTasks((updated) => {
        setTasks(updated);
        calculateStats(updated);
      });
    };
    fetchData();
    fetchBanners();
    setupRealtime();

    const botInterval = setInterval(async () => {
      try { setBotStatus(await getBotStatus()); }
      catch  { setBotStatus({ status: 'offline', servers: 0, users: 0 }); }
    }, 30000);

    return () => {
      if (unsubscribeTasks) unsubscribeTasks();
      clearInterval(botInterval);
    };
  }, [fetchBanners]);

  // Auto-advance carousel
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setBannerActivo(p => (p + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxOpen]);

  const openLightbox = (index: number) => { setCurrentBannerIdx(index); setLightboxOpen(true); };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
        <span className="text-zinc-600 font-light text-xs tracking-widest">Cargando</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Saludo ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extralight text-white mb-1 tracking-tight">
            {getGreeting()} 👋
          </h2>
          <p className="text-zinc-500 font-light text-sm">
            Bienvenido a tu panel de control de Moon Studios
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs font-light px-2.5 py-1 rounded-full border"
            style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}>
            {stats.total} tareas
          </span>
          <span className="text-xs font-light text-green-400">
            {stats.completionRate}% completado
          </span>
        </div>
      </div>

      {/* ── Carousel de banners ── */}
      {banners.length > 0 && (
        <div className="relative w-full rounded-2xl overflow-hidden border group"
          style={{ height: '240px', borderColor: 'hsl(var(--border))' }}>
          {banners.map((b, idx) => (
            <div key={b.id}
              className={`absolute inset-0 transition-opacity duration-700 ${idx === bannerActivo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <img
                src={b.url}
                alt={b.titulo}
                className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 hover:scale-105"
                onClick={() => openLightbox(idx)}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 p-5 pointer-events-none">
                <p className="text-white font-light text-lg leading-snug drop-shadow-lg">{b.titulo}</p>
                {b.descripcion && <p className="text-zinc-300 font-light text-sm mt-1 opacity-80">{b.descripcion}</p>}
              </div>
              <button
                onClick={() => openLightbox(idx)}
                className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-xs font-light flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 border border-white/10"
              >
                <Maximize2 className="w-3 h-3" /> Ver HD
              </button>
            </div>
          ))}

          {banners.length > 1 && (
            <>
              <button
                onClick={() => setBannerActivo(p => (p - 1 + banners.length) % banners.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setBannerActivo(p => (p + 1) % banners.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                {banners.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setBannerActivo(idx)}
                    className={`rounded-full transition-all duration-300 ${idx === bannerActivo ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'}`}
                  />
                ))}
              </div>
              <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-0.5 text-[10px] text-zinc-300 font-light z-10">
                {bannerActivo + 1} / {banners.length}
              </div>
            </>
          )}
        </div>
      )}

      {banners.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 rounded-2xl border-2 border-dashed"
          style={{ borderColor: 'hsl(var(--border))' }}>
          <MonitorPlay className="w-9 h-9 text-zinc-700 mb-2" strokeWidth={1} />
          <p className="text-zinc-600 font-light text-sm">No hay banners disponibles</p>
        </div>
      )}

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Completadas"
          value={stats.completed}
          sub={`de ${stats.total} totales`}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#4ade80' }} strokeWidth={1.5} />}
          accent="#4ade80"
          progress={stats.completionRate}
        />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          icon={<Clock className="w-5 h-5 text-zinc-500" strokeWidth={1.5} />}
        />
        <StatCard
          label="En Progreso"
          value={
            <div className="flex items-center gap-2">
              <span>{stats.inProgress}</span>
              {stats.inProgress > 0 && (
                <div className="w-3 h-3 rounded-full border border-blue-400 border-t-transparent animate-spin" />
              )}
            </div>
          }
          icon={<div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />}
          accent="#60a5fa"
        />
        <StatCard
          label="Alta Prioridad"
          value={stats.highPriority}
          icon={<AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} strokeWidth={1.5} />}
          accent="#f87171"
        />
        <div className="col-span-2 md:col-span-1">
          <StatCard
            label="Estado del Bot"
            value={
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${botStatus?.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-xl font-extralight ${botStatus?.status === 'online' ? 'text-green-400' : 'text-red-400'}`}>
                  {botStatus?.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            }
            sub={botStatus?.status === 'online' ? `${botStatus.servers} servidores · ${botStatus.users?.toLocaleString()} usuarios` : undefined}
            icon={<Bot className="w-5 h-5 text-zinc-500" strokeWidth={1.5} />}
            accent={botStatus?.status === 'online' ? '#4ade80' : '#f87171'}
          />
        </div>
      </div>

      {/* ── Tareas + Anuncios ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Tareas */}
        <div className="lg:col-span-2 rounded-2xl border overflow-hidden"
          style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          <div className="px-5 py-4 border-b flex items-center gap-2"
            style={{ borderColor: 'hsl(var(--border))' }}>
            <CalendarIcon className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
            <span className="text-white font-light text-sm">Tareas Recientes</span>
            <span className="ml-auto text-[10px] font-light px-2 py-0.5 rounded-full"
              style={{ color: 'hsl(var(--muted-foreground))', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Tiempo real
            </span>
          </div>
          <div className="p-3">
            {tasks.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCheck className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                <p className="text-zinc-600 font-light text-sm">No hay tareas pendientes</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tasks.slice(0, 6).map((task) => (
                  <div key={task.id}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        task.priority === 'high'   ? 'bg-red-400' :
                        task.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                      }`} />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-light truncate">{task.title}</p>
                        <p className="text-zinc-600 text-[11px] font-light">{formatDate(task.date)}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-light px-2.5 py-1 rounded-lg flex-shrink-0 ml-2 flex items-center gap-1 ${
                      task.status === 'completed'   ? 'text-green-400'  :
                      task.status === 'in-progress' ? 'text-yellow-400' : 'text-zinc-500'
                    }`}
                      style={{
                        background: task.status === 'completed'   ? 'rgba(74,222,128,0.08)'  :
                                    task.status === 'in-progress' ? 'rgba(250,204,21,0.08)'  : 'rgba(255,255,255,0.04)',
                      }}
                    >
                      {task.status === 'completed'   && <CheckCircle2 className="w-3 h-3" />}
                      {task.status === 'completed'   ? 'Completada'  :
                       task.status === 'in-progress' ? 'En Progreso' : 'Pendiente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Anuncios */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
          <div className="px-5 py-4 border-b flex items-center gap-2"
            style={{ borderColor: 'hsl(var(--border))' }}>
            <Megaphone className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
            <span className="text-white font-light text-sm">Anuncios</span>
          </div>
          <div className="p-3">
            {announcements.length === 0 ? (
              <div className="py-10 text-center">
                <TrendingUp className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                <p className="text-zinc-600 font-light text-sm">No hay anuncios</p>
              </div>
            ) : (
              <div className="space-y-2">
                {announcements.slice(0, 4).map((a) => (
                  <div key={a.id} className="p-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <div className="flex items-start justify-between mb-1.5 gap-2">
                      <p className="text-white text-sm font-light leading-snug">{a.title}</p>
                      {a.important && (
                        <span className="text-[9px] font-light px-1.5 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/15 flex-shrink-0">
                          Importante
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-xs font-light line-clamp-2 leading-relaxed">{a.content}</p>
                    <p className="text-zinc-700 text-[10px] font-light mt-2">{formatDate(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── LIGHTBOX ── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center animate-fade-in"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-50 transition-all"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>

          <img
            src={banners[currentBannerIdx]?.url}
            alt={banners[currentBannerIdx]?.titulo}
            className="max-w-[95vw] max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center px-4">
            <p className="text-white font-light text-base">{banners[currentBannerIdx]?.titulo}</p>
            {banners[currentBannerIdx]?.descripcion && (
              <p className="text-zinc-400 font-light text-sm mt-1">{banners[currentBannerIdx]?.descripcion}</p>
            )}
          </div>

          {banners.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setCurrentBannerIdx(i => (i - 1 + banners.length) % banners.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-xl w-11 h-11 flex items-center justify-center transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); setCurrentBannerIdx(i => (i + 1) % banners.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-xl w-11 h-11 flex items-center justify-center transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-zinc-300 text-xs font-light">
            {currentBannerIdx + 1} / {banners.length}
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardHome;