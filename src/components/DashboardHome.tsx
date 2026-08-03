import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { getTasks, getAnnouncements, subscribeToTasks } from '@/lib/firebase';
import { getBotStatus } from '@/services/discordApi';
import {
  collection, getDocs, query, orderBy, doc, getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSettings } from '@/contexts/SettingsContext';
import {
  CheckCircle2, Clock, Bot, Maximize2, X, Megaphone, Play, Pause,
  Activity, Sparkles, CheckCheck, Zap, TrendingUp,
  TrendingDown, Layers, Terminal,
  Shield, Wifi, WifiOff, Database, Cpu, AlertCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Task, Announcement } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDateShort = (dateValue: any): string => {
  if (!dateValue) return '—';
  try {
    if (dateValue.toDate && typeof dateValue.toDate === 'function')
      return format(dateValue.toDate(), 'd MMM', { locale: es });
    if (dateValue instanceof Date) return format(dateValue, 'd MMM', { locale: es });
    return format(new Date(dateValue), 'd MMM', { locale: es });
  } catch { return '—'; }
};

const formatRelative = (dateValue: any): string => {
  if (!dateValue) return '—';
  try {
    const d = dateValue?.toDate ? dateValue.toDate() : new Date(dateValue);
    return formatDistanceToNow(d, { locale: es, addSuffix: true });
  } catch { return '—'; }
};

// ─── Types ─────────────────────────────────────────────────────────────────────
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

interface ActivityItem {
  id: string;
  type: 'task' | 'system' | 'user' | 'alert' | 'project';
  message: string;
  timestamp: any;
  meta?: string;
  icon?: React.ReactNode;
}

interface Project {
  id: string;
  nombre: string;
  descripcion?: string;
  progreso: number;
  estado: string;
  color?: string;
  actualizadoEn?: any;
  creadoEn?: any;
}

interface HealthMetric {
  label: string;
  value: string;
  ok: boolean;
  detail?: string;
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color?: string; height?: number }> = ({
  data, color = 'currentColor', height = 32,
}) => {
  if (data.length < 2) return <div style={{ height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline
        fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        points={points} style={{ opacity: 0.7 }}
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="3" fill={color}
      />
    </svg>
  );
};

// ─── Global Styles ────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.94) translateY(6px); }
      to   { opacity: 1; transform: scale(1)    translateY(0); }
    }
    @keyframes slideInLeft {
      from { opacity: 0; transform: translateX(-16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes ticker {
      0%   { transform: translateX(0%); }
      100% { transform: translateX(-50%); }
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1;   transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.7); }
    }
    @keyframes pulse-ring {
      0%   { transform: scale(1);   opacity: 0.6; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes countUp {
      from { opacity: 0; transform: translateY(10px) scale(0.94); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }
    @keyframes progressShine {
      0%   { background-position: -100% 0; }
      100% { background-position: 200%  0; }
    }
    @keyframes skeleton-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50%       { transform: translateY(-3px); }
    }
    @keyframes borderGlow {
      0%, 100% { border-color: var(--dh-border); }
      50%       { border-color: var(--dh-border-hover); }
    }
    @keyframes activitySlide {
      from { opacity: 0; transform: translateX(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateX(0)     scale(1); }
    }
    @keyframes healthPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
      50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0.12); }
    }
    @keyframes progressExpand {
      from { width: 0%; }
    }

    /* ── Root Variables ─────────────────────────────────────────────── */
    .dh-root {
      --dh-bg:           #09090b;
      --dh-surface:      rgba(16,16,18,0.88);
      --dh-surface-2:    rgba(22,22,24,0.95);
      --dh-card:         rgba(18,18,20,0.92);
      --dh-border:       rgba(255,255,255,0.06);
      --dh-border-hover: rgba(255,255,255,0.13);
      --dh-text:         #f4f4f5;
      --dh-text-2:       #a1a1aa;
      --dh-text-3:       #52525b;
      --dh-accent:       #ffffff;
      --dh-accent-soft:  rgba(255,255,255,0.14);
      --dh-accent-dim:   rgba(255,255,255,0.05);
      --dh-accent-dim2:  rgba(255,255,255,0.025);
      --dh-overlay:      rgba(0,0,0,0.94);
      --dh-shadow:       0 2px 16px rgba(0,0,0,0.45);
      --dh-shadow-lg:    0 12px 48px rgba(0,0,0,0.6);
      --dh-glass:        blur(20px) saturate(1.4);
      --dh-radius:       10px;
      --dh-radius-sm:    6px;
      --dh-online:       #22c55e;
      --dh-offline:      #ef4444;
      --dh-warn:         #f59e0b;
      --dh-info:         #3b82f6;
    }

    /* ── Light Theme ─────────────────────────────────────────────────── */
    html.light .dh-root,
    .light .dh-root,
    [data-theme="light"] .dh-root {
      --dh-bg:           #f1f1f4;
      --dh-surface:      rgba(255,255,255,0.94);
      --dh-surface-2:    rgba(248,248,251,0.96);
      --dh-card:         #ffffff;
      --dh-border:       rgba(0,0,0,0.07);
      --dh-border-hover: rgba(0,0,0,0.14);
      --dh-text:         #18181b;
      --dh-text-2:       #71717a;
      --dh-text-3:       #a1a1aa;
      --dh-accent:       #18181b;
      --dh-accent-soft:  rgba(0,0,0,0.12);
      --dh-accent-dim:   rgba(0,0,0,0.04);
      --dh-accent-dim2:  rgba(0,0,0,0.02);
      --dh-overlay:      rgba(0,0,0,0.75);
      --dh-shadow:       0 2px 16px rgba(0,0,0,0.06);
      --dh-shadow-lg:    0 12px 48px rgba(0,0,0,0.10);
    }

    /* ── Layout Grid ─────────────────────────────────────────────────── */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 14px;
      padding: 24px 24px 48px;
      max-width: 1480px;
      margin: 0 auto;
    }
    .col-span-12 { grid-column: span 12; }
    .col-span-8  { grid-column: span 8;  }
    .col-span-7  { grid-column: span 7;  }
    .col-span-6  { grid-column: span 6;  }
    .col-span-5  { grid-column: span 5;  }
    .col-span-4  { grid-column: span 4;  }
    .col-span-3  { grid-column: span 3;  }
    .col-span-2  { grid-column: span 2;  }

    /* Tablet */
    @media (max-width: 1100px) {
      .col-span-8,
      .col-span-7,
      .col-span-5,
      .col-span-4,
      .col-span-6 { grid-column: span 12; }
      .col-span-3,
      .col-span-2 { grid-column: span 6;  }
    }

    /* Mobile */
    @media (max-width: 640px) {
      .col-span-3,
      .col-span-2 { grid-column: span 12; }
      .dashboard-grid { padding: 12px 12px 40px; gap: 10px; }
      .dh-stat-grid   { grid-template-columns: repeat(2, 1fr) !important; }
      .dh-filters     { display: none !important; }
      .dh-ann-content { -webkit-line-clamp: 2 !important; }
    }

    /* ── Card ────────────────────────────────────────────────────────── */
    .dh-card {
      background:      var(--dh-card);
      border:          1px solid var(--dh-border);
      border-radius:   var(--dh-radius);
      backdrop-filter: var(--dh-glass);
      box-shadow:      var(--dh-shadow);
      transition:
        border-color  0.28s ease,
        box-shadow    0.28s ease,
        transform     0.28s cubic-bezier(0.34,1.56,0.64,1);
      position: relative;
      overflow: hidden;
    }
    .dh-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%);
      pointer-events: none;
      border-radius: inherit;
    }
    .dh-card:hover {
      border-color: var(--dh-border-hover);
      box-shadow:   var(--dh-shadow-lg);
      transform:    translateY(-2px);
    }
    .dh-stat-card:hover { transform: translateY(-3px) scale(1.01); }

    /* ── Animations ──────────────────────────────────────────────────── */
    .animate-fade-up    { animation: fadeUp    0.6s  cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
    .animate-fade-in    { animation: fadeIn    0.4s  ease                        forwards; opacity: 0; }
    .animate-scale-in   { animation: scaleIn   0.38s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
    .animate-slide-left { animation: slideInLeft 0.4s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
    .animate-count      { animation: countUp   0.6s  cubic-bezier(0.22,1,0.36,1) forwards; }
    .dh-float           { animation: float     3.5s  ease-in-out infinite; }
    .animate-activity   { animation: activitySlide 0.45s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }

    /* ── Ticker ──────────────────────────────────────────────────────── */
    .ticker-track {
      display: flex;
      gap: 40px;
      width: max-content;
      animation: ticker 40s linear infinite;
    }
    .ticker-track:hover { animation-play-state: paused; }

    /* ── Misc ─────────────────────────────────────────────────────────── */
    .glass-pill {
      background:      var(--dh-surface);
      border:          1px solid var(--dh-border);
      backdrop-filter: blur(10px);
      color:           var(--dh-text);
    }
    .dh-filter-btn {
      padding:       4px 10px;
      border-radius: var(--dh-radius-sm);
      font-size:     11px;
      font-weight:   600;
      border:        none;
      cursor:        pointer;
      transition:    all 0.18s ease;
      letter-spacing: 0.01em;
    }
    .dh-filter-btn.active   { background: var(--dh-text); color: var(--dh-bg); }
    .dh-filter-btn:not(.active) { background: transparent; color: var(--dh-text-3); }
    .dh-filter-btn:not(.active):hover { background: var(--dh-accent-dim); color: var(--dh-text-2); }

    .dh-scroll::-webkit-scrollbar         { width: 3px; }
    .dh-scroll::-webkit-scrollbar-track   { background: transparent; }
    .dh-scroll::-webkit-scrollbar-thumb   { background: var(--dh-border); border-radius: 4px; }
    .dh-scroll::-webkit-scrollbar-thumb:hover { background: var(--dh-border-hover); }

    .dh-task-row {
      display:        flex;
      align-items:    center;
      gap:            12px;
      padding:        10px 16px;
      border-bottom:  1px solid var(--dh-border);
      transition:     background 0.15s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
      cursor:         pointer;
    }
    .dh-task-row:hover  { background: var(--dh-accent-dim2); transform: translateX(2px); }
    .dh-task-row:last-child { border-bottom: none; }

    .dh-ann-row {
      padding:       12px 16px;
      border-bottom: 1px solid var(--dh-border);
      transition:    background 0.15s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
      cursor:        pointer;
    }
    .dh-ann-row:hover  { background: var(--dh-accent-dim2); transform: translateX(2px); }
    .dh-ann-row:last-child { border-bottom: none; }

    .dh-pulse {
      width: 6px; height: 6px;
      border-radius: 50%;
      animation: pulse-dot 2.2s ease-in-out infinite;
      position: relative;
    }
    .dh-pulse-ring {
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1px solid currentColor;
      animation: pulse-ring 2s ease-out infinite;
    }
    .dh-section-hd {
      padding:         12px 16px;
      border-bottom:   1px solid var(--dh-border);
      display:         flex;
      justify-content: space-between;
      align-items:     center;
    }
    .progress-track {
      height: 4px; border-radius: 2px;
      background: var(--dh-accent-dim);
      overflow: hidden; position: relative;
    }
    .progress-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, var(--dh-text-2), var(--dh-text));
      background-size: 200% 100%;
      animation: progressShine 2.8s linear infinite, progressExpand 1s cubic-bezier(0.34,1,0.64,1) forwards;
      transition: width 0.9s cubic-bezier(0.34,1,0.64,1);
    }
    .dh-skeleton {
      border-radius: var(--dh-radius-sm);
      background: linear-gradient(
        90deg,
        var(--dh-accent-dim)   25%,
        var(--dh-accent-soft)  50%,
        var(--dh-accent-dim)   75%
      );
      background-size: 400px 100%;
      animation: skeleton-shimmer 1.4s ease infinite;
    }

    /* ── Activity item hover ─────────────────────────────────────────── */
    .dh-activity-item {
      display: flex; gap: 10; padding: 8px 16px;
      border-radius: var(--dh-radius-sm);
      transition: background 0.15s;
      margin: 0 4px;
    }
    .dh-activity-item:hover { background: var(--dh-accent-dim2); }

    /* ── Project row hover ───────────────────────────────────────────── */
    .dh-project-row {
      padding: 10px 12px;
      border-radius: var(--dh-radius-sm);
      border: 1px solid transparent;
      transition: background 0.18s, border-color 0.18s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
      cursor: pointer;
    }
    .dh-project-row:hover {
      background: var(--dh-accent-dim2);
      border-color: var(--dh-border);
      transform: translateX(2px);
    }

    /* ── Health metric card ──────────────────────────────────────────── */
    .dh-health-metric {
      padding: 10px; border-radius: var(--dh-radius-sm);
      border: 1px solid var(--dh-border);
      background: var(--dh-accent-dim2);
      transition: border-color 0.2s, background 0.2s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
      cursor: default;
      /* IMPORTANTE: opacity siempre 1 aquí para no interferir con animate-fade-up */
      opacity: 1;
    }
    .dh-health-metric:hover {
      border-color: var(--dh-border-hover);
      background: var(--dh-accent-dim);
      transform: translateY(-1px);
    }
    .dh-health-metric.ok:hover {
      box-shadow: 0 0 0 3px rgba(34,197,94,0.08);
    }

    /* ── Reduce motion ───────────────────────────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .animate-fade-up, .animate-fade-in, .animate-scale-in,
      .animate-slide-left, .animate-count, .ticker-track,
      .dh-pulse, .progress-fill, .dh-float, .animate-activity {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
  `}</style>
);

// ─── Animated Counter Hook ────────────────────────────────────────────────────
const useCountUp = (end: number, duration = 900) => {
  const [val, setVal] = useState(0);
  const startTime = useRef<number | null>(null);
  useEffect(() => {
    startTime.current = null;
    let raf: number;
    const step = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(eased * end));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);
  return val;
};

// ─── Header ───────────────────────────────────────────────────────────────────
interface HeaderProps {
  greeting: { text: string; emoji: string };
  stats: { total: number; completed: number; pending: number; inProgress: number };
  notifCount?: number;
}

const DashboardHeader: React.FC<HeaderProps> = ({ greeting, stats, notifCount }) => (
  <div className="col-span-12 animate-fade-up" style={{ animationDelay: '0.04s', marginBottom: 2 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <h1 style={{
        fontSize: 26, fontWeight: 700, color: 'var(--dh-text)',
        letterSpacing: '-0.03em', lineHeight: 1.15,
      }}>
        {greeting.text}
      </h1>
      <span style={{ fontSize: 22, filter: 'grayscale(0.15)' }} className="dh-float">
        {greeting.emoji}
      </span>
    </div>
    <p style={{
      fontSize: 12.5, color: 'var(--dh-text-2)', marginTop: 6,
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
        <span style={{
          display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
          background: 'var(--dh-online)', boxShadow: '0 0 8px var(--dh-online)',
        }} />
        Sistema operativo
      </span>
      <span style={{ color: 'var(--dh-text-3)' }}>·</span>
      <span>{stats.total} {stats.total === 1 ? 'tarea' : 'tareas'} · {stats.completed} completadas</span>
      {notifCount ? (
        <>
          <span style={{ color: 'var(--dh-text-3)' }}>·</span>
          <span style={{ color: 'var(--dh-warn)', fontWeight: 600 }}>{notifCount} anuncios nuevos</span>
        </>
      ) : null}
    </p>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  sparkline?: number[];
}

const StatCard: React.FC<StatCardProps> = ({
  label, value, icon, delay = 0, trend = 'neutral', trendValue, sparkline,
}) => {
  const animated = useCountUp(value);
  return (
    <div
      className="dh-card dh-stat-card animate-fade-up"
      style={{
        padding: '16px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', minHeight: 108,
        animationDelay: `${delay}s`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--dh-radius-sm)',
          background: 'var(--dh-accent-dim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--dh-text-2)',
          transition: 'background 0.2s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {icon}
        </div>
        {trend !== 'neutral' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontWeight: 700,
            color: trend === 'up' ? 'var(--dh-online)' : 'var(--dh-offline)',
            background: trend === 'up' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            padding: '2px 6px', borderRadius: 4,
          }}>
            {trend === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trendValue}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div
            className="animate-count"
            style={{
              fontSize: 28, fontWeight: 700, color: 'var(--dh-text)',
              lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 4,
              animationDelay: `${delay + 0.1}s`,
            }}
          >
            {animated}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--dh-text-3)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          }}>
            {label}
          </div>
        </div>
        {sparkline && <Sparkline data={sparkline} color="var(--dh-text-3)" />}
      </div>
    </div>
  );
};

// ─── Status Card (Bot) ────────────────────────────────────────────────────────
const StatusCard: React.FC<{ online: boolean; delay?: number }> = ({ online, delay = 0 }) => (
  <div
    className="dh-card dh-stat-card animate-fade-up"
    style={{
      padding: '16px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', minHeight: 108, animationDelay: `${delay}s`,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 'var(--dh-radius-sm)',
        background: 'var(--dh-accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dh-text-2)',
      }}>
        <Bot size={16} />
      </div>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700,
        color: online ? 'var(--dh-online)' : 'var(--dh-offline)',
        background: online ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        padding: '3px 8px', borderRadius: 4, position: 'relative',
      }}>
        <span
          className="dh-pulse"
          style={{ background: online ? 'var(--dh-online)' : 'var(--dh-offline)', color: online ? 'var(--dh-online)' : 'var(--dh-offline)' }}
        >
          {online && <span className="dh-pulse-ring" />}
        </span>
        {online ? 'Online' : 'Offline'}
      </span>
    </div>
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
        {online ? 'Operativo' : 'Inactivo'}
      </div>
      <div style={{
        fontSize: 10, color: 'var(--dh-text-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
      }}>
        Estado Bot
      </div>
    </div>
  </div>
);

// ─── Carousel ─────────────────────────────────────────────────────────────────
const Carousel: React.FC<any> = ({
  banners, bannerActivo, setBannerActivo,
  isPlaying, setIsPlaying, bannerConfig, onOpenLightbox,
}) => {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!isPlaying || hover || banners.length <= 1) return;
    const interval = setInterval(() => {
      setBannerActivo((prev: number) => (prev + 1) % banners.length);
    }, bannerConfig.interval);
    return () => clearInterval(interval);
  }, [isPlaying, banners.length, bannerConfig.interval, hover, setBannerActivo]);

  if (banners.length === 0) return null;

  return (
    <div
      className="dh-card animate-fade-up col-span-12"
      style={{ padding: 0, overflow: 'hidden', height: 280, animationDelay: '0.3s', cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {banners.map((b: Banner, idx: number) => (
          <div key={b.id} style={{
            position: 'absolute', inset: 0,
            opacity: idx === bannerActivo ? 1 : 0,
            transform: idx === bannerActivo ? 'scale(1)' : 'scale(1.03)',
            transition: 'opacity 0.9s cubic-bezier(0.4,0,0.2,1), transform 0.9s cubic-bezier(0.4,0,0.2,1)',
            zIndex: idx === bannerActivo ? 1 : 0,
          }}>
            <img src={b.url} alt={b.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.02) 50%, transparent 100%)',
            }} />
            <div style={{ position: 'absolute', bottom: 20, left: 20, right: 90, color: 'white' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '3px 10px', borderRadius: 4, marginBottom: 8,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
              }}>
                <Sparkles size={9} /> DESTACADO
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
                {b.titulo}
              </h3>
              {b.descripcion && (
                <p style={{ fontSize: 12, opacity: 0.6, maxWidth: 520, lineHeight: 1.5 }}>
                  {b.descripcion}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Controls */}
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, zIndex: 10 }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              width: 28, height: 28, borderRadius: 'var(--dh-radius-sm)',
              background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', transition: 'background 0.2s',
            }}
          >
            {isPlaying ? <Pause size={11} /> : <Play size={11} />}
          </button>
          <button
            onClick={() => onOpenLightbox(bannerActivo)}
            style={{
              width: 28, height: 28, borderRadius: 'var(--dh-radius-sm)',
              background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'white', transition: 'background 0.2s',
            }}
          >
            <Maximize2 size={11} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.08)', zIndex: 10 }}>
          <div style={{
            height: '100%',
            background: 'rgba(255,255,255,0.5)',
            width: `${((bannerActivo + 1) / banners.length) * 100}%`,
            transition: 'width 0.5s ease',
            borderRadius: '0 2px 2px 0',
          }} />
        </div>

        {/* Dots */}
        <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: 4, zIndex: 10 }}>
          {banners.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => setBannerActivo(i)}
              style={{
                width: i === bannerActivo ? 18 : 5, height: 5, borderRadius: 3,
                background: 'white', opacity: i === bannerActivo ? 1 : 0.3,
                border: 'none', cursor: 'pointer', transition: 'all 0.3s', padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Task List ────────────────────────────────────────────────────────────────
type FilterType = 'all' | 'pending' | 'in-progress' | 'completed';
const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',         label: 'Todas' },
  { key: 'pending',     label: 'Pendientes' },
  { key: 'in-progress', label: 'Progreso' },
  { key: 'completed',   label: 'Completadas' },
];

const TaskList: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const filtered = tasks.filter(t => filter === 'all' || t.status === filter);

  return (
    <div
      className="dh-card animate-fade-up col-span-7"
      style={{ display: 'flex', flexDirection: 'column', animationDelay: '0.42s', background: 'var(--dh-surface)' }}
    >
      <div className="dh-section-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.01em' }}>
            Tareas Activas
          </h3>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            background: 'var(--dh-accent-dim)', color: 'var(--dh-text-2)', fontWeight: 700,
          }}>
            {tasks.length}
          </span>
        </div>
        <div className="dh-filters" style={{ display: 'flex', gap: 3 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`dh-filter-btn${filter === f.key ? ' active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dh-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <CheckCheck size={26} style={{ color: 'var(--dh-text-3)', marginBottom: 10 }} />
            <p style={{ color: 'var(--dh-text-3)', fontSize: 12, fontWeight: 500 }}>
              Sin tareas en esta categoría
            </p>
          </div>
        ) : (
          filtered.map((task, i) => (
            <div
              key={task.id}
              className="dh-task-row animate-fade-up"
              style={{ animationDelay: `${0.46 + i * 0.03}s` }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 'var(--dh-radius-sm)', flexShrink: 0,
                background: task.status === 'completed' ? 'var(--dh-text)' : 'transparent',
                border: `1.5px solid ${task.status === 'completed' ? 'var(--dh-text)' : 'var(--dh-border-hover)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: task.status === 'completed' ? 'var(--dh-bg)' : 'var(--dh-text-2)',
                transition: 'all 0.2s',
              }}>
                {task.status === 'completed'
                  ? <CheckCircle2 size={13} />
                  : task.status === 'in-progress'
                    ? <Activity size={13} />
                    : <Clock size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12.5, color: 'var(--dh-text)', fontWeight: 500,
                  textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                  textDecorationColor: 'var(--dh-text-3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {task.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--dh-text-3)', marginTop: 2, fontWeight: 500 }}>
                  {formatDateShort(task.date)}
                </p>
              </div>
              {task.priority === 'high' && (
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--dh-offline)', boxShadow: '0 0 6px rgba(239,68,68,0.5)',
                }} />
              )}
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, flexShrink: 0,
                background: task.status === 'completed'
                  ? 'rgba(34,197,94,0.08)'
                  : task.status === 'in-progress'
                    ? 'rgba(59,130,246,0.08)'
                    : 'var(--dh-accent-dim)',
                color: task.status === 'completed'
                  ? 'var(--dh-online)'
                  : task.status === 'in-progress'
                    ? 'var(--dh-info)'
                    : 'var(--dh-text-3)',
              }}>
                {task.status === 'completed' ? 'Listo' : task.status === 'in-progress' ? 'En curso' : 'Pendiente'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── Announcements Feed ───────────────────────────────────────────────────────
const AnnouncementsFeed: React.FC<{ announcements: Announcement[] }> = ({ announcements }) => (
  <div
    className="dh-card animate-fade-up col-span-5"
    style={{ display: 'flex', flexDirection: 'column', animationDelay: '0.46s', background: 'var(--dh-surface)' }}
  >
    <div className="dh-section-hd">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.01em' }}>
          Anuncios
        </h3>
        <Zap size={11} style={{ color: 'var(--dh-text-3)' }} />
      </div>
      {announcements.length > 0 && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 4,
          background: 'var(--dh-accent-dim)', color: 'var(--dh-text-2)', fontWeight: 700,
        }}>
          {announcements.length}
        </span>
      )}
    </div>
    <div className="dh-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 340 }}>
      {announcements.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Megaphone size={24} style={{ color: 'var(--dh-text-3)', marginBottom: 10 }} />
          <p style={{ color: 'var(--dh-text-3)', fontSize: 12, fontWeight: 500 }}>Sin novedades por ahora</p>
        </div>
      ) : (
        announcements.map((ann: any, i: number) => (
          <div key={ann.id} className="dh-ann-row animate-slide-left" style={{ animationDelay: `${0.5 + i * 0.05}s` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 'var(--dh-radius-sm)', flexShrink: 0,
                background: 'var(--dh-accent-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Megaphone size={11} style={{ color: 'var(--dh-text-2)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--dh-text)',
                  marginBottom: 3, lineHeight: 1.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {ann.title}
                </p>
                <p className="dh-ann-content" style={{
                  fontSize: 11.5, color: 'var(--dh-text-2)', lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {ann.content}
                </p>
                <p style={{ fontSize: 10, color: 'var(--dh-text-3)', marginTop: 4, fontWeight: 500 }}>
                  {formatDateShort(ann.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

// ─── Recent Activity Timeline — conectado a Firestore ─────────────────────────
/**
 * Lee la colección `actividad` en tiempo real (onSnapshot).
 * Cada documento debe tener: tipo ('task'|'system'|'user'|'alert'|'project'),
 * mensaje (string), timestamp (Timestamp), meta? (string).
 *
 * Si no existe la colección, reconstruye los items desde tasks + announcements
 * igual que antes, pero con tipado enriquecido y animaciones de entrada.
 */
const RecentActivity: React.FC<{ items: ActivityItem[] }> = ({ items: fallbackItems }) => {
  const [firestoreItems, setFirestoreItems] = useState<ActivityItem[]>([]);
  const [useFirestore, setUseFirestore]     = useState(false);
  // No loading state: fallback se muestra SIEMPRE mientras llega Firestore

  useEffect(() => {
    // Colección correcta según las reglas de Firestore: activityLogs
    // Campos esperados: description (string), userName (string), createdAt (Timestamp), metadata?
    let unsub: (() => void) | undefined;
    try {
      const q = query(
        collection(db, 'activityLogs'),
        orderBy('createdAt', 'desc'),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            setFirestoreItems(
              snap.docs.slice(0, 10).map(d => {
                const data = d.data();
                // Determinar tipo por metadata o descripción
                const desc: string = data.description ?? data.mensaje ?? data.message ?? '';
                let type: ActivityItem['type'] = 'system';
                if (desc.toLowerCase().includes('tarea') || desc.toLowerCase().includes('task')) type = 'task';
                else if (desc.toLowerCase().includes('anuncio') || desc.toLowerCase().includes('announcement')) type = 'alert';
                else if (data.tipo) type = data.tipo as ActivityItem['type'];

                return {
                  id:        d.id,
                  type,
                  message:   desc || 'Actividad registrada',
                  timestamp: data.createdAt ?? data.timestamp,
                  meta:      data.userName ?? data.module ?? undefined,
                };
              }),
            );
            setUseFirestore(true);
          }
          // si está vacío: seguimos con fallback
        },
        () => {
          // Cualquier error (permisos, etc): seguimos con fallback sin ruido
          setUseFirestore(false);
        },
      );
    } catch {
      // Si ni siquiera puede crear el query: silencioso
    }
    return () => { unsub?.(); };
  }, []);

  // Usar datos de Firestore si llegaron, si no el fallback siempre disponible
  const displayed = useFirestore ? firestoreItems : fallbackItems;

  const dotColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'alert':   return { bg: 'var(--dh-offline)', glow: 'rgba(239,68,68,0.5)' };
      case 'system':  return { bg: 'var(--dh-info)',    glow: 'rgba(59,130,246,0.5)' };
      case 'project': return { bg: 'var(--dh-warn)',    glow: 'rgba(245,158,11,0.5)' };
      case 'user':    return { bg: '#a855f7',           glow: 'rgba(168,85,247,0.5)' };
      default:        return { bg: 'var(--dh-online)',  glow: 'rgba(34,197,94,0.5)'  };
    }
  };

  return (
    <div
      className="dh-card animate-fade-up col-span-4"
      style={{ display: 'flex', flexDirection: 'column', animationDelay: '0.52s', background: 'var(--dh-surface)' }}
    >
      <div className="dh-section-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.01em' }}>
            Actividad Reciente
          </h3>
          <Terminal size={11} style={{ color: 'var(--dh-text-3)' }} />
        </div>
        {useFirestore && (
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: 'rgba(34,197,94,0.08)', color: 'var(--dh-online)',
            fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Live
          </span>
        )}
      </div>

      <div className="dh-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 300, padding: '12px 0' }}>
        {displayed.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--dh-text-3)', fontSize: 12 }}>
            Sin actividad reciente
          </div>
        ) : (
          displayed.map((item, i) => {
            const { bg, glow } = dotColor(item.type);
            return (
              <div
                key={item.id}
                className="dh-activity-item animate-activity"
                style={{ animationDelay: `${0.55 + i * 0.05}s`, display: 'flex', gap: 10, padding: '8px 12px' }}
              >
                {/* Timeline connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, flexShrink: 0 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: bg,
                    boxShadow: `0 0 6px ${glow}`,
                    flexShrink: 0,
                  }} />
                  {i !== displayed.length - 1 && (
                    <div style={{ width: 1, flex: 1, minHeight: 14, background: 'var(--dh-border)', marginTop: 4 }} />
                  )}
                </div>

                <div style={{ flex: 1, paddingBottom: 8 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--dh-text)', lineHeight: 1.35 }}>
                    {item.message}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    {item.timestamp && (
                      <span style={{ fontSize: 10, color: 'var(--dh-text-3)', fontWeight: 500 }}>
                        {formatRelative(item.timestamp)}
                      </span>
                    )}
                    {item.meta && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: 'var(--dh-accent-dim)', color: 'var(--dh-text-3)', fontWeight: 600,
                      }}>
                        {item.meta}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── Project Progress — conectado a colección `proyectos` ─────────────────────
/**
 * Espera documentos en Firestore con campos:
 *   nombre (string), progreso (number 0-100), estado (string),
 *   descripcion? (string), color? (string hex), actualizadoEn? (Timestamp)
 */
const getEstadoStyle = (estado: string) => {
  const e = estado?.toLowerCase() ?? '';
  if (e.includes('complet') || e.includes('listo') || e.includes('done'))
    return { bg: 'rgba(34,197,94,0.08)',  color: 'var(--dh-online)' };
  if (e.includes('revis') || e.includes('review'))
    return { bg: 'rgba(245,158,11,0.08)', color: 'var(--dh-warn)' };
  if (e.includes('pausa') || e.includes('paused'))
    return { bg: 'rgba(239,68,68,0.08)',  color: 'var(--dh-offline)' };
  return { bg: 'var(--dh-accent-dim)', color: 'var(--dh-text-3)' };
};

const ProjectProgress: React.FC = () => {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    // Colección correcta según las reglas de Firestore: dev_projects
    const colRef = collection(db, 'dev_projects');

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        if (snap.empty) {
          setProjects([]);
        } else {
          const mapped: Project[] = snap.docs.map(d => {
            const data = d.data();
            // Mapear campos del tipo Project real (name, description, status, progress, updatedAt, createdAt)
            const progreso = Number(data.progress ?? data.progreso ?? 0);

            // Traducir status inglés a español para mostrar
            const statusMap: Record<string, string> = {
              planning:  'Planificación',
              active:    'En curso',
              paused:    'Pausado',
              completed: 'Completado',
              cancelled: 'Cancelado',
            };
            const estado = statusMap[data.status] ?? data.estado ?? data.status ?? 'En curso';

            return {
              id:            d.id,
              nombre:        data.name        ?? data.nombre      ?? 'Sin nombre',
              descripcion:   data.description ?? data.descripcion,
              progreso,
              estado,
              color:         data.color,
              actualizadoEn: data.updatedAt   ?? data.actualizadoEn,
              creadoEn:      data.createdAt   ?? data.creadoEn,
            };
          });
          // Orden local: por createdAt desc si existe, si no por nombre
          mapped.sort((a, b) => {
            const ta = a.creadoEn?.toDate?.() ?? (a.creadoEn ? new Date(a.creadoEn) : null);
            const tb = b.creadoEn?.toDate?.() ?? (b.creadoEn ? new Date(b.creadoEn) : null);
            if (ta && tb) return new Date(tb).getTime() - new Date(ta).getTime();
            return (a.nombre ?? '').localeCompare(b.nombre ?? '');
          });
          setProjects(mapped);
        }
        setLoading(false);
        setError(false);
      },
      (err) => {
        console.error('Error cargando proyectos:', err);
        setError(true);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  return (
    <div
      className="dh-card animate-fade-up col-span-4"
      style={{ display: 'flex', flexDirection: 'column', animationDelay: '0.56s', background: 'var(--dh-surface)' }}
    >
      <div className="dh-section-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.01em' }}>
            Proyectos
          </h3>
          <Layers size={11} style={{ color: 'var(--dh-text-3)' }} />
        </div>
        {!loading && !error && (
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            background: 'var(--dh-accent-dim)', color: 'var(--dh-text-2)', fontWeight: 700,
          }}>
            {projects.length}
          </span>
        )}
      </div>

      <div className="dh-scroll" style={{ flex: 1, overflowY: 'auto', maxHeight: 340, padding: '10px 10px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 6px' }}>
            {[0, 1, 2].map(i => (
              <div key={i}>
                <div className="dh-skeleton" style={{ height: 10, width: '60%', marginBottom: 8, borderRadius: 4 }} />
                <div className="dh-skeleton" style={{ height: 4,  borderRadius: 2 }} />
              </div>
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--dh-text-3)', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={20} style={{ color: 'var(--dh-offline)', flexShrink: 0 }} />
            <p style={{ margin: 0 }}>Error al cargar proyectos</p>
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--dh-text-3)', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Layers size={22} style={{ flexShrink: 0 }} />
            <p style={{ margin: 0 }}>Sin proyectos aún</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {projects.map((p, i) => {
              const estadoStyle = getEstadoStyle(p.estado);
              const isOpen = expanded === p.id;
              // Color de acento por proyecto: si tiene color en Firestore lo usa, sino escala de gris
              const accentColor = p.color ?? 'var(--dh-text-2)';

              return (
                <div
                  key={p.id}
                  className="dh-project-row animate-fade-up"
                  style={{ animationDelay: `${0.6 + i * 0.05}s` }}
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Color accent dot */}
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: accentColor,
                        boxShadow: `0 0 5px ${accentColor}60`,
                      }} />
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--dh-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
                      }}>
                        {p.nombre}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, padding: '1px 6px', borderRadius: 3,
                        background: estadoStyle.bg, color: estadoStyle.color, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}>
                        {p.estado}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dh-text-3)', minWidth: 30, textAlign: 'right' }}>
                        {p.progreso}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${p.progreso}%`,
                        background: p.color
                          ? `linear-gradient(90deg, ${p.color}80, ${p.color})`
                          : 'linear-gradient(90deg, var(--dh-text-2), var(--dh-text))',
                      }}
                    />
                  </div>

                  {/* Expandable detail */}
                  {isOpen && (
                    <div
                      className="animate-fade-up"
                      style={{ marginTop: 8, padding: '8px 0 2px', borderTop: '1px solid var(--dh-border)' }}
                    >
                      {p.descripcion && (
                        <p style={{ fontSize: 11, color: 'var(--dh-text-2)', lineHeight: 1.5, marginBottom: 4 }}>
                          {p.descripcion}
                        </p>
                      )}
                      {p.actualizadoEn && (
                        <p style={{ fontSize: 10, color: 'var(--dh-text-3)', fontWeight: 500 }}>
                          Actualizado {formatRelative(p.actualizadoEn)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── System Health — métricas dinámicas ───────────────────────────────────────
/**
 * Lee de Firestore la colección `system_health` (o el doc `system_health/metrics`).
 * Cada métrica: label, value, ok (bool), detail?
 *
 * Si la colección no existe, muestra métricas de fallback con el botStatus real.
 * Refresca cada 30 s automáticamente.
 */
const SystemHealth: React.FC<{ botOnline: boolean }> = ({ botOnline }) => {
  const [metrics, setMetrics]       = useState<HealthMetric[]>([]);
  const [loading, setLoading]       = useState(true);
  const [useFirestore, setUseFirestore] = useState(false);
  const [lastChecked, setLastChecked]   = useState<Date>(new Date());

  const fallbackMetrics: HealthMetric[] = [
    { label: 'API Latencia',   value: '—',                             ok: true },
    { label: 'Base de datos',  value: 'Conectada',                     ok: true },
    { label: 'Discord WS',     value: botOnline ? 'Activo' : 'Caído', ok: botOnline },
    { label: 'Workers',        value: '3/3',                           ok: true },
  ];

  const metricIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('discord') || l.includes('ws') || l.includes('bot'))   return <Wifi size={11} />;
    if (l.includes('base') || l.includes('db') || l.includes('datos'))    return <Database size={11} />;
    if (l.includes('worker') || l.includes('cpu') || l.includes('proc'))  return <Cpu size={11} />;
    return <Activity size={11} />;
  };

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        // Intentamos leer un único documento con todas las métricas
        const metaDoc = await getDoc(doc(db, 'system_health', 'metrics'));

        if (metaDoc.exists()) {
          const data = metaDoc.data();
          const items: HealthMetric[] = Array.isArray(data.metrics)
            ? data.metrics
            : Object.entries(data).map(([k, v]: any) => ({
                label:  k,
                value:  String(v?.value ?? v),
                ok:     Boolean(v?.ok ?? true),
                detail: v?.detail,
              }));
          setMetrics(items);
          setUseFirestore(true);
        } else {
          // Intentar con colección
          const snap = await getDocs(collection(db, 'system_health'));
          if (!snap.empty) {
            setMetrics(snap.docs.map(d => ({
              label:  d.data().label  ?? d.id,
              value:  String(d.data().value ?? '—'),
              ok:     Boolean(d.data().ok ?? true),
              detail: d.data().detail,
            })));
            setUseFirestore(true);
          } else {
            setUseFirestore(false);
          }
        }
      } catch {
        setUseFirestore(false);
      } finally {
        setLoading(false);
        setLastChecked(new Date());
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [botOnline]);

  const displayed = useFirestore ? metrics : fallbackMetrics;
  const allOk     = displayed.every(m => m.ok);

  return (
    <div
      className="dh-card animate-fade-up col-span-4"
      style={{ display: 'flex', flexDirection: 'column', animationDelay: '0.6s', background: 'var(--dh-surface)' }}
    >
      <div className="dh-section-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--dh-text)', letterSpacing: '-0.01em' }}>
            Salud del Sistema
          </h3>
          <Shield size={11} style={{ color: 'var(--dh-text-3)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Estado global */}
          {!loading && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3,
              background: allOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: allOk ? 'var(--dh-online)' : 'var(--dh-offline)',
              fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span
                className="dh-pulse"
                style={{
                  width: 5, height: 5,
                  background: allOk ? 'var(--dh-online)' : 'var(--dh-offline)',
                  color: allOk ? 'var(--dh-online)' : 'var(--dh-offline)',
                }}
              >
                {allOk && <span className="dh-pulse-ring" />}
              </span>
              {allOk ? 'OK' : 'Alerta'}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="dh-skeleton" style={{ height: 72, borderRadius: 'var(--dh-radius-sm)' }} />
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {displayed.map((s, i) => (
                <div
                  key={i}
                  className={`dh-health-metric${s.ok ? ' ok' : ''}`}
                  style={{
                    animationDelay: `${0.64 + i * 0.04}s`,
                    animation: `fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) ${0.64 + i * 0.04}s both`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: s.ok ? 'var(--dh-online)' : 'var(--dh-offline)',
                      boxShadow: s.ok ? '0 0 4px rgba(34,197,94,0.5)' : '0 0 4px rgba(239,68,68,0.5)',
                    }} />
                    <span style={{
                      fontSize: 9.5, color: 'var(--dh-text-3)', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: s.ok ? 'var(--dh-text-2)' : 'var(--dh-offline)', flexShrink: 0 }}>
                      {s.ok ? <span style={{ color: 'var(--dh-text-2)' }}>{metricIcon(s.label)}</span>
                             : <WifiOff size={11} style={{ color: 'var(--dh-offline)' }} />}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.ok ? 'var(--dh-text)' : 'var(--dh-offline)' }}>
                      {s.value}
                    </div>
                  </div>
                  {s.detail && (
                    <p style={{ fontSize: 9.5, color: 'var(--dh-text-3)', marginTop: 3, lineHeight: 1.4 }}>
                      {s.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Last checked */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: 6, borderTop: '1px solid var(--dh-border)',
            }}>
              <span style={{ fontSize: 10, color: 'var(--dh-text-3)', fontWeight: 500 }}>
                Actualizado {formatDistanceToNow(lastChecked, { locale: es, addSuffix: true })}
              </span>
              <span style={{ fontSize: 9.5, color: 'var(--dh-text-3)', fontWeight: 500 }}>
                {useFirestore ? '· Firestore' : '· Estimado'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
const LoadingSkeleton = () => (
  <div className="dh-root" style={{ minHeight: '100vh', padding: 0 }}>
    <GlobalStyles />
    <div className="dashboard-grid">
      <div className="col-span-12">
        <div className="dh-skeleton" style={{ height: 26, width: 170, marginBottom: 10, borderRadius: 'var(--dh-radius)' }} />
        <div className="dh-skeleton" style={{ height: 13, width: 220 }} />
      </div>
      <div className="col-span-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="dh-skeleton" style={{ height: 108, borderRadius: 'var(--dh-radius)' }} />
        ))}
      </div>
      <div className="col-span-12">
        <div className="dh-skeleton" style={{ height: 280, borderRadius: 'var(--dh-radius)' }} />
      </div>
      <div className="col-span-7">
        <div className="dh-skeleton" style={{ height: 360, borderRadius: 'var(--dh-radius)' }} />
      </div>
      <div className="col-span-5">
        <div className="dh-skeleton" style={{ height: 360, borderRadius: 'var(--dh-radius)' }} />
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const DashboardHome: React.FC = () => {
  useSettings();

  const [tasks,         setTasks]         = useState<Task[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [botStatus,     setBotStatus]     = useState<any>(null);
  const [loading,       setLoading]       = useState(true);

  const [banners,      setBanners]      = useState<Banner[]>([]);
  const [bannerConfig, setBannerConfig] = useState<BannerConfig>({ autoplay: true, interval: 5000, quality: 'auto' });
  const [bannerActivo, setBannerActivo] = useState(0);
  const [isPlaying,    setIsPlaying]    = useState(true);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx,  setLightboxIdx]  = useState(0);

  const stats = {
    completed:  tasks.filter(t => t.status === 'completed').length,
    pending:    tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    total:      tasks.length,
  };

  const botOnline = botStatus?.status === 'online';

  // Actividad de fallback (si la colección `actividad` está vacía o sin permisos)
  // NOTA: Task no tiene createdAt, solo date (fecha de vencimiento).
  // Usamos la fecha de vencimiento como meta secundaria, no como timestamp de "cuándo ocurrió".
  const activityFallback: ActivityItem[] = [
    ...tasks.slice(0, 3).map(t => {
      const dueDate = t.date
        ? (() => { try { const d = (t.date as any)?.toDate ? (t.date as any).toDate() : new Date(t.date); return `Vence ${format(d, 'd MMM', { locale: es })}`; } catch { return undefined; } })()
        : undefined;
      return {
        id:        `act-task-${t.id}`,
        type:      (t.status === 'completed' ? 'system' : 'task') as ActivityItem['type'],
        message:   t.status === 'completed' ? `Tarea completada: ${t.title}` : `Tarea asignada: ${t.title}`,
        // Sin timestamp real de creación: ponemos null para que no muestre fecha errónea
        timestamp: null as any,
        meta:      t.priority === 'high' ? `Alta · ${dueDate ?? ''}`.trim().replace(/·\s*$/, '') : dueDate,
      };
    }),
    ...announcements.slice(0, 2).map((a: any) => ({
      id:        `act-ann-${a.id}`,
      type:      'alert' as const,
      message:   `Anuncio publicado: ${a.title}`,
      timestamp: a.createdAt,
    })),
    {
      id:        'act-sys-1',
      type:      'system' as const,
      message:   botOnline ? 'Bot conectado correctamente' : 'Bot desconectado',
      timestamp: new Date(),
    },
  ].sort((a, b) => {
    // Tareas sin timestamp van al principio (son las más "activas")
    const da = a.timestamp ? (a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(9999, 0);
    const db2 = b.timestamp ? (b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(9999, 0);
    return db2.getTime() - da.getTime();
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksData, annData, botData, bannerSnap, configSnap] = await Promise.all([
          getTasks(),
          getAnnouncements(),
          getBotStatus().catch(() => ({ status: 'offline' })),
          getDocs(query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc'))),
          getDoc(doc(db, 'dashboard_config', 'banner_settings')),
        ]);
        setTasks(tasksData as Task[]);
        setAnnouncements(annData as Announcement[]);
        setBotStatus(botData);
        setBanners(bannerSnap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
        if (configSnap.exists()) setBannerConfig(c => ({ ...c, ...configSnap.data() }));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };

    fetchData();
    const unsub = subscribeToTasks(setTasks);
    return () => unsub();
  }, []);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return { text: 'Buenos días',   emoji: '☀️' };
    if (h < 18) return { text: 'Buenas tardes', emoji: '🌤️' };
    return        { text: 'Buenas noches', emoji: '🌙' };
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="dh-root">
      <GlobalStyles />
      <div className="dashboard-grid">

        {/* ── Header ── */}
        <DashboardHeader
          greeting={getGreeting()}
          stats={stats}
          notifCount={announcements.length}
        />

        {/* ── Stat Cards ── */}
        <div className="col-span-12">
          <div
            className="dh-stat-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
          >
            <StatCard
              label="Completadas"
              value={stats.completed}
              icon={<CheckCircle2 size={15} />}
              delay={0.15}
              trend="up"
              trendValue="+12%"
              sparkline={[2, 4, 3, 8, 6, stats.completed]}
            />
            <StatCard
              label="En Progreso"
              value={stats.inProgress}
              icon={<Activity size={15} />}
              delay={0.2}
              trend="neutral"
              sparkline={[1, 2, 1, 3, 2, stats.inProgress]}
            />
            <StatCard
              label="Pendientes"
              value={stats.pending}
              icon={<Clock size={15} />}
              delay={0.25}
              trend="down"
              trendValue="-5%"
              sparkline={[5, 4, 6, 5, 7, stats.pending]}
            />
            <StatusCard online={botOnline} delay={0.3} />
          </div>
        </div>

        {/* ── Carousel ── */}
        {banners.length > 0 && (
          <Carousel
            banners={banners}
            bannerActivo={bannerActivo}
            setBannerActivo={setBannerActivo}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            bannerConfig={bannerConfig}
            onOpenLightbox={(i: number) => { setLightboxIdx(i); setLightboxOpen(true); }}
          />
        )}

        {/* ── Main content ── */}
        <TaskList          tasks={tasks} />
        <AnnouncementsFeed announcements={announcements} />

        {/* ── Bottom row ── */}
        <RecentActivity items={activityFallback} />
        <ProjectProgress />
        <SystemHealth    botOnline={botOnline} />

      </div>

      {/* ── Lightbox ── */}
      {lightboxOpen && banners.length > 0 && ReactDOM.createPortal(
        <div
          onClick={() => setLightboxOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(28px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', animation: 'fadeIn 0.22s ease',
          }}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 34, height: 34, borderRadius: 'var(--dh-radius-sm)',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <X size={15} color="white" />
          </button>
          <img
            src={banners[lightboxIdx]?.url}
            alt="Preview"
            style={{
              maxWidth: '88%', maxHeight: '88%',
              objectFit: 'contain', borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
              animation: 'scaleIn 0.32s ease',
            }}
            onClick={e => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DashboardHome;