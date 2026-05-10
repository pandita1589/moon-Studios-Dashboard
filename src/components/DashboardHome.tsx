import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { getTasks, getAnnouncements, subscribeToTasks } from '@/lib/firebase';
import { getBotStatus } from '@/services/discordApi';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CheckCircle2, Clock, Bot, AlertCircle, TrendingUp,
  Calendar as CalendarIcon, CheckCheck, ChevronLeft, ChevronRight,
  MonitorPlay, Maximize2, X, Megaphone, Play, Pause,
  ZoomIn, ZoomOut, Minimize2,
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
  id: string;
  url: string;
  titulo: string;
  descripcion?: string;
  creadoEn: any;
  orden?: number;
}

interface BannerConfig {
  autoplay: boolean;
  interval: number;
  quality: string;
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
        style={{
          background: accent ? `${accent}18` : 'rgba(255,255,255,0.05)',
          border: `1px solid ${accent ? `${accent}25` : 'rgba(255,255,255,0.07)'}`,
        }}>
        {icon}
      </div>
    </div>
    {progress !== undefined && (
      <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, background: accent ?? '#fff' }}
        />
      </div>
    )}
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

  // ── Banner state ──
  const [banners,          setBanners]          = useState<Banner[]>([]);
  const [bannerConfig,     setBannerConfig]     = useState<BannerConfig>({
    autoplay: true,
    interval: 5000,
    quality: 'auto',
  });
  const [bannerActivo,     setBannerActivo]     = useState(0);
  const [isPlaying,        setIsPlaying]        = useState(true);
  const [hoveringBanner,   setHoveringBanner]   = useState(false);

  // ── Lightbox state ──
  const [lightboxOpen,     setLightboxOpen]     = useState(false);
  const [lightboxIdx,      setLightboxIdx]      = useState(0);
  const [zoomLevel,        setZoomLevel]        = useState(1);
  const [isFullscreen,     setIsFullscreen]     = useState(false);
  const [imageOffset,      setImageOffset]      = useState({ x: 0, y: 0 });
  const [isDragging,       setIsDragging]       = useState(false);
  const [dragStart,        setDragStart]        = useState({ x: 0, y: 0 });
  const [naturalSize,      setNaturalSize]      = useState({ w: 0, h: 0 });

  const carouselRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Stats ───────────────────────────────────────────────────────────────
  const calculateStats = (taskList: Task[]) => {
    const total        = taskList.length;
    const pending      = taskList.filter(t => t.status === 'pending').length;
    const inProgress   = taskList.filter(t => t.status === 'in-progress').length;
    const completed    = taskList.filter(t => t.status === 'completed').length;
    const highPriority = taskList.filter(t => t.priority === 'high' && t.status !== 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    setStats({ total, pending, inProgress, completed, highPriority, completionRate });
  };

  // ─── Fetch banners + config (sincronizado con CEO Panel) ─────────────────
  const fetchBannersAndConfig = useCallback(async () => {
    try {
      // 1. Leer configuración guardada por el CEO Panel
      const configSnap = await getDoc(doc(db, 'dashboard_config', 'banner_settings'));
      let cfg: BannerConfig = { autoplay: true, interval: 5000, quality: 'auto' };
      if (configSnap.exists()) {
        const data = configSnap.data();
        cfg = {
          autoplay: data.autoplay  ?? true,
          interval: data.interval  ?? 5000,
          quality:  data.quality   ?? 'auto',
        };
      }
      setBannerConfig(cfg);
      setIsPlaying(cfg.autoplay);

      // 2. Leer banners ordenados (respeta orden manual del CEO Panel)
      const snap = await getDocs(
        query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc'))
      );
      const rawBanners = snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner));

      // Si tienen campo `orden` (guardado por CEO Panel), ordenar por él
      const sorted = rawBanners.sort((a, b) => {
        if (a.orden !== undefined && b.orden !== undefined) return a.orden - b.orden;
        return 0; // mantener orden por creadoEn si no hay campo orden
      });

      setBanners(sorted);
    } catch (e) {
      console.error('Error fetching banners/config:', e);
    }
  }, []);

  // ─── Data principal ───────────────────────────────────────────────────────
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
    fetchBannersAndConfig();
    setupRealtime();

    const botInterval = setInterval(async () => {
      try { setBotStatus(await getBotStatus()); }
      catch { setBotStatus({ status: 'offline', servers: 0, users: 0 }); }
    }, 30000);

    return () => {
      if (unsubscribeTasks) unsubscribeTasks();
      clearInterval(botInterval);
    };
  }, [fetchBannersAndConfig]);

  // ─── Autoplay (usa config sincronizada) ──────────────────────────────────
  useEffect(() => {
    if (carouselRef.current) clearInterval(carouselRef.current);
    if (!isPlaying || banners.length <= 1 || hoveringBanner) return;

    carouselRef.current = setInterval(() => {
      setBannerActivo(p => (p + 1) % banners.length);
    }, bannerConfig.interval);

    return () => {
      if (carouselRef.current) clearInterval(carouselRef.current);
    };
  }, [isPlaying, banners.length, hoveringBanner, bannerConfig.interval]);

  // ─── Cerrar lightbox con Escape ───────────────────────────────────────────
  useEffect(() => {
    if (!lightboxOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setLightboxIdx(i => (i + 1) % banners.length);
      if (e.key === 'ArrowLeft')  setLightboxIdx(i => (i - 1 + banners.length) % banners.length);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxOpen, banners.length]);

  const openLightbox = (index: number) => {
    setLightboxIdx(index);
    setZoomLevel(1);
    setImageOffset({ x: 0, y: 0 });
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  // Estilos inline para botones del lightbox (evita conflictos con CSS del layout)
  const ctrlBtn: React.CSSProperties = {
    width: '28px', height: '28px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '6px', border: 'none',
    background: 'transparent', color: '#a1a1aa',
    cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
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
      {banners.length > 0 ? (
        <div
          className="relative w-full rounded-2xl overflow-hidden border group"
          style={{ borderColor: 'hsl(var(--border))' }}
          onMouseEnter={() => setHoveringBanner(true)}
          onMouseLeave={() => setHoveringBanner(false)}
        >
          {/* Slides — altura fija que funciona para banners wide (4:1 ~ 25%) */}
          <div className="relative w-full overflow-hidden" style={{ height: '260px' }}>
            {banners.map((b, idx) => (
              <div
                key={b.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  idx === bannerActivo ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <img
                  src={b.url}
                  alt={b.titulo}
                  className="w-full h-full object-cover object-center cursor-zoom-in"
                  style={{ display: 'block' }}
                  onClick={() => openLightbox(idx)}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 pointer-events-none z-20">
                  <p className="text-white font-light text-sm md:text-base leading-snug drop-shadow-lg">
                    {b.titulo}
                  </p>
                  {b.descripcion && (
                    <p className="text-zinc-300 font-light text-xs mt-0.5 opacity-80">
                      {b.descripcion}
                    </p>
                  )}
                </div>

                {/* Ver completo button */}
                <button
                  onClick={() => openLightbox(idx)}
                  className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-xs font-light flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 border border-white/10 z-20"
                >
                  <Maximize2 className="w-3 h-3" /> Ver completo
                </button>
              </div>
            ))}
          </div>

          {/* Prev / Next */}
          {banners.length > 1 && (
            <>
              <button
                onClick={() => {
                  setBannerActivo(p => (p - 1 + banners.length) % banners.length);
                  setIsPlaying(false);
                  setTimeout(() => setIsPlaying(bannerConfig.autoplay), 8000);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setBannerActivo(p => (p + 1) % banners.length);
                  setIsPlaying(false);
                  setTimeout(() => setIsPlaying(bannerConfig.autoplay), 8000);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Dots */}
          {banners.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setBannerActivo(idx)}
                  className={`rounded-full transition-all duration-300 ${
                    idx === bannerActivo
                      ? 'w-5 h-1.5 bg-white'
                      : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Counter + play/pause */}
          <div className="absolute top-3 left-3 flex items-center gap-2 z-30">
            {banners.length > 1 && (
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-2 py-0.5 text-[10px] text-zinc-300 font-light">
                {bannerActivo + 1} / {banners.length}
              </div>
            )}
            {/* Play/pause visible solo en hover */}
            {banners.length > 1 && (
              <button
                onClick={() => setIsPlaying(p => !p)}
                className="bg-black/40 hover:bg-black/70 backdrop-blur-sm text-white rounded-lg w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying
                  ? <Pause className="w-3 h-3" />
                  : <Play  className="w-3 h-3" />
                }
              </button>
            )}
          </div>

          {/* Progress bar (usa interval de config) */}
          {isPlaying && banners.length > 1 && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-30 overflow-hidden">
              <div
                key={`${bannerActivo}-${bannerConfig.interval}`}
                className="h-full bg-emerald-400/80 origin-left"
                style={{
                  animation: `bannerProgress ${bannerConfig.interval}ms linear infinite`,
                }}
              />
            </div>
          )}
        </div>
      ) : (
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
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  botStatus?.status === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`} />
                <span className={`text-xl font-extralight ${
                  botStatus?.status === 'online' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {botStatus?.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            }
            sub={botStatus?.status === 'online'
              ? `${botStatus.servers} servidores · ${botStatus.users?.toLocaleString()} usuarios`
              : undefined
            }
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
              style={{
                color: 'hsl(var(--muted-foreground))',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
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
                        background:
                          task.status === 'completed'   ? 'rgba(74,222,128,0.08)'  :
                          task.status === 'in-progress' ? 'rgba(250,204,21,0.08)'  : 'rgba(255,255,255,0.04)',
                      }}>
                      {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
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

      {/* ── LIGHTBOX — montado via Portal para escapar del layout ── */}
      {lightboxOpen && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.96)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={closeLightbox}
        >
          {/* ── Top bar ── */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Left: title + counter + dimensions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <p style={{
                color: 'white', fontWeight: 300, fontSize: '14px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px',
              }}>
                {banners[lightboxIdx]?.titulo}
              </p>
              <span style={{
                fontSize: '10px', fontWeight: 300, padding: '2px 8px',
                borderRadius: '999px', background: 'rgba(39,39,42,0.9)',
                color: '#a1a1aa', border: '1px solid rgba(63,63,70,0.8)',
              }}>
                {lightboxIdx + 1} / {banners.length}
              </span>
              {naturalSize.w > 0 && (
                <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 300 }}>
                  {naturalSize.w} × {naturalSize.h}px
                </span>
              )}
            </div>

            {/* Right: controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* Zoom group */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: 'rgba(24,24,27,0.9)', borderRadius: '8px',
                padding: '3px', border: '1px solid rgba(63,63,70,0.6)',
              }}>
                <button
                  style={ctrlBtn}
                  onClick={() => setZoomLevel(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  title="Alejar"
                >
                  <ZoomOut style={{ width: 14, height: 14 }} />
                </button>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 300, width: '38px', textAlign: 'center' }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  style={ctrlBtn}
                  onClick={() => setZoomLevel(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                  title="Acercar"
                >
                  <ZoomIn style={{ width: 14, height: 14 }} />
                </button>
              </div>

              <button
                style={{ ...ctrlBtn, fontSize: '11px', fontWeight: 300, color: '#71717a', width: 'auto', padding: '0 8px' }}
                onClick={() => { setZoomLevel(1); setImageOffset({ x: 0, y: 0 }); }}
              >
                Reset
              </button>

              <button
                style={ctrlBtn}
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                    setIsFullscreen(true);
                  } else {
                    document.exitFullscreen();
                    setIsFullscreen(false);
                  }
                }}
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              >
                {isFullscreen ? <Minimize2 style={{ width: 14, height: 14 }} /> : <Maximize2 style={{ width: 14, height: 14 }} />}
              </button>

              <button style={{ ...ctrlBtn, marginLeft: '2px' }} onClick={closeLightbox} title="Cerrar (Esc)">
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* ── Image area ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              userSelect: 'none',
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => {
              if (zoomLevel > 1) {
                setIsDragging(true);
                setDragStart({ x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y });
              }
            }}
            onMouseMove={e => {
              if (isDragging && zoomLevel > 1) {
                setImageOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={e => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setZoomLevel(z => Math.max(0.5, Math.min(4, +(z + delta).toFixed(2))));
            }}
          >
            {banners[lightboxIdx] && (
              <img
                src={banners[lightboxIdx].url}
                alt={banners[lightboxIdx].titulo}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${zoomLevel}) translate(${imageOffset.x / zoomLevel}px, ${imageOffset.y / zoomLevel}px)`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease',
                  userSelect: 'none',
                  WebkitUserDrag: 'none',
                } as React.CSSProperties}
                draggable={false}
                onClick={() => {
                  if (zoomLevel === 1) setZoomLevel(2);
                  else { setZoomLevel(1); setImageOffset({ x: 0, y: 0 }); }
                }}
                onLoad={e => {
                  const img = e.target as HTMLImageElement;
                  setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
              />
            )}
          </div>

          {/* ── Prev / Next arrows ── */}
          {banners.length > 1 && (
            <>
              <button
                style={{
                  position: 'absolute', left: '16px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.10)',
                  border: 'none', borderRadius: '50%',
                  width: '44px', height: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer', zIndex: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.20)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
                onClick={e => {
                  e.stopPropagation();
                  setLightboxIdx(i => (i - 1 + banners.length) % banners.length);
                  setZoomLevel(1); setImageOffset({ x: 0, y: 0 });
                }}
              >
                <ChevronLeft style={{ width: 20, height: 20 }} />
              </button>
              <button
                style={{
                  position: 'absolute', right: '16px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.10)',
                  border: 'none', borderRadius: '50%',
                  width: '44px', height: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer', zIndex: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.20)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
                onClick={e => {
                  e.stopPropagation();
                  setLightboxIdx(i => (i + 1) % banners.length);
                  setZoomLevel(1); setImageOffset({ x: 0, y: 0 });
                }}
              >
                <ChevronRight style={{ width: 20, height: 20 }} />
              </button>
            </>
          )}

          {/* ── Bottom thumbnails ── */}
          {banners.length > 1 && (
            <div
              style={{
                flexShrink: 0,
                padding: '8px 16px 16px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', overflowX: 'auto' }}>
                {banners.map((b, idx) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setLightboxIdx(idx);
                      setZoomLevel(1);
                      setImageOffset({ x: 0, y: 0 });
                    }}
                    style={{
                      flexShrink: 0,
                      width: '64px', height: '40px',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: idx === lightboxIdx ? '2px solid #34d399' : '2px solid transparent',
                      opacity: idx === lightboxIdx ? 1 : 0.5,
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'opacity 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (idx !== lightboxIdx) e.currentTarget.style.opacity = '0.75'; }}
                    onMouseLeave={e => { if (idx !== lightboxIdx) e.currentTarget.style.opacity = '0.5'; }}
                  >
                    <img src={b.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
              {banners[lightboxIdx]?.descripcion && (
                <p style={{ color: '#a1a1aa', fontWeight: 300, fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>
                  {banners[lightboxIdx].descripcion}
                </p>
              )}
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Keyframe para progress bar */}
      <style>{`
        @keyframes bannerProgress {
          from { transform: scaleX(0); transform-origin: left; }
          to   { transform: scaleX(1); transform-origin: left; }
        }
      `}</style>

    </div>
  );
};

export default DashboardHome;